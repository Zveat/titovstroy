import { describe, it, expect } from "vitest";
import {
  normalizeScheme, normalizeAccrual, accrualKey, buildObjectEvents, matchStaffByManager,
  proposeAccruals, buildPayrollBalance, monthAccruals, schemeIsEmpty,
} from "./payrollAccruals.js";

const rop = {
  id: "s1", name: "Сергей Штанько", position: "РОП", status: "active",
  scheme: { salary: 300000, percentRate: 5, percentTrigger: "handover",
    managerNames: ["Сергей Штанько", "Сергей Ш."] },
};
const mop = { id: "s2", name: "Айгуль", position: "МОП", status: "active",
  scheme: { pieceRate: 3000, pieceLabel: "целевой замер" } };
const fired = { id: "s3", name: "Бывший", status: "fired", scheme: { salary: 100000 } };

describe("схема мотивации", () => {
  it("мусор не проходит, отрицательные ставки обнуляются", () => {
    const s = normalizeScheme({ salary: "300 000", percentRate: -5, percentTrigger: "чужое", pieceRate: "2 500,5" });
    expect(s.salary).toBe(300000);
    expect(s.percentRate).toBe(0);
    expect(s.percentTrigger).toBe("handover");
    expect(s.pieceRate).toBe(2500.5);
  });
  it("имена менеджеров принимаются и списком, и строкой через запятую", () => {
    expect(normalizeScheme({ managerNames: "Сергей Ш., Сергей Штанько" }).managerNames)
      .toEqual(["Сергей Ш.", "Сергей Штанько"]);
    expect(normalizeScheme({}).managerNames).toEqual([]);
  });
  it("сырой ввод разбирается при сохранении, а не на каждом нажатии", () => {
    // В форме держим набранное как есть: запятая и пробел в конце нужны, чтобы
    // начать второй вариант написания. Разбираем один раз, здесь.
    expect(normalizeScheme({ managerNames: "Сергей Штанько, Сергей Ш., " }).managerNames)
      .toEqual(["Сергей Штанько", "Сергей Ш."]);
    expect(normalizeScheme({ managerNames: "  ,  " }).managerNames).toEqual([]);
    expect(normalizeScheme({ salary: "300 000 " }).salary).toBe(300000);
    expect(normalizeScheme({ percentRate: "5," }).percentRate).toBe(5);
  });

  it("пустая схема видна как пустая", () => {
    expect(schemeIsEmpty({})).toBe(true);
    expect(schemeIsEmpty({ salary: 1 })).toBe(false);
  });
});

describe("кто стоит за именем менеджера", () => {
  const staff = [rop, mop];
  it("разные написания одного имени сводятся к одному человеку", () => {
    // В боевой базе «Сергей Штанько», «Сергей Ш.» и «Сергей Ш» — один человек.
    expect(matchStaffByManager("Сергей Штанько", staff).id).toBe("s1");
    expect(matchStaffByManager("Сергей Ш.", staff).id).toBe("s1");
    // Точка на конце и регистр значения не имеют — в базе есть и «Сергей Ш.», и «Сергей Ш».
    expect(matchStaffByManager("  сергей ш  ", staff).id).toBe("s1");
    expect(matchStaffByManager("Василий Титов", staff)).toBe(null);
  });
  it("совпадение по имени сотрудника работает без отдельной настройки", () => {
    expect(matchStaffByManager("Айгуль", staff).id).toBe("s2");
  });
  it("пустое имя не матчится ни с кем", () => {
    expect(matchStaffByManager("", staff)).toBe(null);
    expect(matchStaffByManager(null, staff)).toBe(null);
  });
});

describe("события по объектам", () => {
  const objects = [
    { id: "o1", address: "Абая 35", manager: "Сергей Штанько" },
    { id: "o2", address: "Отменённый", manager: "Сергей Штанько", status: "cancel" },
    { id: "o3", address: "Расторгнутый", manager: "Сергей Штанько" },
    { id: "o4", address: "Удалённый", deletedAt: 1 },
  ];
  const productions = [
    { objectId: "o1", prodStatus: "done", factEndDate: "2026-07-12", saleDate: "2026-05-20" },
    { objectId: "o3", prodStatus: "cancel", factEndDate: "2026-07-20" },
  ];
  const finProjects = [{ objectId: "o1", budget: 4422860, contractNo: "№1013" }];
  const ev = buildObjectEvents({ objects, productions, finProjects });

  it("отменённые, расторгнутые и удалённые не премируются", () => {
    expect(ev.map(e => e.objectId)).toEqual(["o1"]);
  });
  it("сумма берётся из проекта, даты — из производства", () => {
    expect(ev[0].budget).toBe(4422860);
    expect(ev[0].contractNo).toBe("№1013");
    expect(new Date(ev[0].handoverAt).toISOString().slice(0, 10)).toBe("2026-07-12");
    expect(new Date(ev[0].signedAt).toISOString().slice(0, 10)).toBe("2026-05-20");
  });
  it("дата сдачи не берётся у незавершённого производства", () => {
    // У расторгнутых объектов factEndDate тоже проставлена — одной даты мало.
    const e = buildObjectEvents({
      objects: [{ id: "x", address: "В работе", manager: "м" }],
      productions: [{ objectId: "x", prodStatus: "active", factEndDate: "2026-07-01" }],
      finProjects: [{ objectId: "x", budget: 100 }],
    });
    expect(e[0].handoverAt).toBe(0);
  });
  it("дата договора — запасной источник для «подписания»", () => {
    const e = buildObjectEvents({
      objects: [{ id: "x", address: "Без saleDate", manager: "м" }],
      productions: [{ objectId: "x", prodStatus: "active" }],
      finProjects: [{ objectId: "x", budget: 100 }],
      contracts: [
        { objectId: "x", type: "repair_fiz", date: "2026-06-13", number: "№01011" },
        { objectId: "x", type: "podryad", date: "2026-01-01" },   // себестоимость, не продажа
      ],
    });
    expect(new Date(e[0].signedAt).toISOString().slice(0, 10)).toBe("2026-06-13");
    expect(e[0].contractNo).toBe("№01011");
  });
});

describe("предложения к начислению", () => {
  const events = [
    { objectId: "o1", label: "Абая 35", manager: "Сергей Ш.", budget: 2000000, contractNo: "№1", hasProject: true,
      signedAt: Date.UTC(2026, 4, 20), handoverAt: Date.UTC(2026, 6, 12) },
    { objectId: "o2", label: "Ничей", manager: "", budget: 1000000, hasProject: true,
      signedAt: Date.UTC(2026, 6, 3), handoverAt: Date.UTC(2026, 6, 15) },
    { objectId: "o3", label: "Без суммы", manager: "Сергей Штанько", budget: 0, hasProject: false,
      signedAt: 0, handoverAt: Date.UTC(2026, 6, 18) },
  ];
  const staff = [rop, mop, fired];

  it("оклад предлагается активным, уволенным — нет", () => {
    const { items } = proposeAccruals({ month: "2026-07", staff, events: [] });
    expect(items.filter(i => i.kind === "salary").map(i => i.staffId)).toEqual(["s1"]);
    expect(items[0].amount).toBe(300000);
  });

  it("процент считается от суммы договора в месяц сдачи", () => {
    const { items } = proposeAccruals({ month: "2026-07", staff, events });
    const p = items.find(i => i.kind === "percent");
    expect(p.staffId).toBe("s1");
    expect(p.objectId).toBe("o1");
    expect(p.base).toBe(2000000);
    expect(p.amount).toBe(100000);          // 5%
    expect(p.note).toContain("5%");
  });

  it("в месяц подписания при триггере «сдача» бонус не начисляется", () => {
    // Объект подписан в мае, сдан в июле — в майском месяце проценту делать нечего.
    const { items } = proposeAccruals({ month: "2026-05", staff, events });
    expect(items.some(i => i.kind === "percent")).toBe(false);
  });

  it("при триггере «подписание» бонус уходит в месяц продажи", () => {
    const s = [{ ...rop, scheme: { ...rop.scheme, percentTrigger: "signed", salary: 0 } }];
    expect(proposeAccruals({ month: "2026-05", staff: s, events }).items[0].objectId).toBe("o1");
    expect(proposeAccruals({ month: "2026-07", staff: s, events }).items.some(i => i.kind === "percent")).toBe(false);
  });

  it("объекты без получателя и без суммы попадают в «разобраться», а не в тишину", () => {
    const { issues } = proposeAccruals({ month: "2026-07", staff, events });
    const ids = issues.map(i => i.objectId);
    expect(ids).toContain("o2");
    expect(ids).toContain("o3");
    expect(issues.find(i => i.objectId === "o2").reason).toContain("не указан менеджер");
    expect(issues.find(i => i.objectId === "o3").reason).toContain("нет проекта");
  });

  it("месяц подписания не шумит, если бонусы у всех считаются при сдаче", () => {
    // «Ничей» объект подписан 3 июля и сдан 15 июля: у РОПа триггер «сдача», значит
    // подписание событием не является и второй строкой в списке появиться не должно.
    const { issues } = proposeAccruals({ month: "2026-07", staff, events });
    expect(issues.filter(i => i.objectId === "o2")).toHaveLength(1);
    expect(issues.find(i => i.objectId === "o2").trigger).toBe("handover");
    // Объект, у которого в этом месяце ТОЛЬКО подписание, при триггере «сдача» молчит.
    const onlySigned = [{ objectId: "z", label: "Только подписан", manager: "", budget: 900000,
      hasProject: true, signedAt: Date.UTC(2026, 6, 5), handoverAt: 0 }];
    expect(proposeAccruals({ month: "2026-07", staff, events: onlySigned }).issues).toEqual([]);
    const signedStaff = [{ ...rop, scheme: { ...rop.scheme, percentTrigger: "signed" } }];
    expect(proposeAccruals({ month: "2026-07", staff: signedStaff, events: onlySigned }).issues).toHaveLength(1);
  });

  it("повторный пересчёт не задваивает уже начисленное", () => {
    const first = proposeAccruals({ month: "2026-07", staff, events });
    const again = proposeAccruals({ month: "2026-07", staff, events, existing: first.items });
    expect(again.items).toEqual([]);
  });

  it("без месяца ничего не предлагается", () => {
    expect(proposeAccruals({ month: "", staff, events }).items).toEqual([]);
    expect(proposeAccruals({}).items).toEqual([]);
  });

  it("ключ начисления различает объекты, но не зависит от суммы", () => {
    const a = normalizeAccrual({ staffId: "s1", month: "2026-07", kind: "percent", objectId: "o1", amount: 1 });
    const b = normalizeAccrual({ staffId: "s1", month: "2026-07", kind: "percent", objectId: "o1", amount: 999 });
    const c = normalizeAccrual({ staffId: "s1", month: "2026-07", kind: "percent", objectId: "o2", amount: 1 });
    expect(accrualKey(a)).toBe(accrualKey(b));
    expect(accrualKey(a)).not.toBe(accrualKey(c));
  });
});

describe("сверка начислено / выплачено", () => {
  const staff = [rop, mop];
  const accruals = [
    { id: "a1", staffId: "s1", month: "2026-06", kind: "salary", amount: 300000 },
    { id: "a2", staffId: "s1", month: "2026-07", kind: "salary", amount: 300000 },
    { id: "a3", staffId: "s1", month: "2026-07", kind: "percent", amount: 100000 },
    { id: "a4", staffId: "s2", month: "2026-07", kind: "piece", amount: 30000 },
  ];
  const paidByStaff = {
    s1: { byMonth: { "2026-01": 999999, "2026-06": 300000, "2026-07": 250000 } },
    s2: { byMonth: { "2026-07": 45000 } },
  };
  const b = buildPayrollBalance({ staff, accruals, paidByStaff });

  it("выплаты до первого начисления в сверку не берутся", () => {
    // Иначе у человека, которому платили год до внедрения раздела, вылезла бы
    // «переплата» на миллионы — формально верная и бесполезная.
    const r = b.rows.find(r => r.staffId === "s1");
    expect(r.startMonth).toBe("2026-06");
    expect(r.paid).toBe(550000);
    expect(r.months).not.toContain("2026-01");
  });

  it("долг и переплата считаются раздельно", () => {
    expect(b.rows.find(r => r.staffId === "s1").balance).toBe(700000 - 550000);
    expect(b.rows.find(r => r.staffId === "s2").balance).toBe(30000 - 45000);
    expect(b.debt).toBe(150000);
    expect(b.advance).toBe(15000);
  });

  it("помесячно видно, где недоплатили", () => {
    const r = b.rows.find(r => r.staffId === "s1");
    expect(r.byMonth["2026-06"]).toEqual({ accrued: 300000, paid: 300000, delta: 0 });
    expect(r.byMonth["2026-07"]).toEqual({ accrued: 400000, paid: 250000, delta: 150000 });
  });

  it("человек без начислений в сверку не попадает", () => {
    const only = buildPayrollBalance({ staff, accruals: accruals.filter(a => a.staffId === "s1"), paidByStaff });
    expect(only.rows.map(r => r.staffId)).toEqual(["s1"]);
  });

  it("пустой вход не роняет сверку", () => {
    const e = buildPayrollBalance({});
    expect(e.rows).toEqual([]);
    expect(e.debt).toBe(0);
    expect(e.advance).toBe(0);
  });
});

describe("начисления месяца", () => {
  it("собираются по людям, удалённый сотрудник не теряется", () => {
    const { list, total } = monthAccruals([
      { id: "1", staffId: "s1", month: "2026-07", kind: "salary", amount: 300000 },
      { id: "2", staffId: "нет", month: "2026-07", kind: "manual", amount: 5000 },
      { id: "3", staffId: "s1", month: "2026-06", kind: "salary", amount: 300000 },
    ], "2026-07", [rop]);
    expect(list.map(a => a.id)).toEqual(["1", "2"]);
    expect(list[1].staffName).toContain("удалён");
    expect(total).toBe(305000);
  });
});
