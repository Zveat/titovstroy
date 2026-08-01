import { describe, it, expect } from "vitest";
import {
  resolvePayee, buildPayrollReport, expenseSubcategoryTotals, buildStaffDetail,
  normalizeStaff, payrollMonthKey, monthLabel, listExpenseOps,
} from "./payrollModel.js";

const staff = [
  { id: "s1", name: "Сергей Штанько", position: "РОП" },
  { id: "s2", name: "Таргетолог", position: "Маркетинг" },
];
const workers = [{ id: "w1", name: "Бригада Ержана" }];
const map = { "ФОТ РОП": "s1", "ФОТ таргетолог": "s2" };
const ctx = () => ({
  staffById: new Map(staff.map(s => [s.id, s])),
  workersById: new Map(workers.map(w => [w.id, w])),
  subcategoryMap: map,
});

describe("кто получил деньги", () => {
  it("явное поле в операции сильнее таблицы соответствий", () => {
    // Иначе операция, у которой получателя поправили руками, снова читалась бы
    // по старой подкатегории — и правка не имела бы смысла.
    const tx = { subcategory: "ФОТ РОП", payee: { kind: "worker", id: "w1" } };
    const who = resolvePayee(tx, ctx());
    expect(who.kind).toBe("worker");
    expect(who.name).toBe("Бригада Ержана");
    expect(who.source).toBe("operation");
  });

  it("без явного поля читаем по подкатегории", () => {
    const who = resolvePayee({ subcategory: "ФОТ таргетолог" }, ctx());
    expect(who.id).toBe("s2");
    expect(who.source).toBe("map");
  });

  it("незнакомая подкатегория — получателя нет", () => {
    expect(resolvePayee({ subcategory: "Аренда офиса" }, ctx())).toBeNull();
    expect(resolvePayee({}, ctx())).toBeNull();
    expect(resolvePayee(null, ctx())).toBeNull();
  });

  it("удалённый получатель не проглатывается молча", () => {
    // Сумма не должна исчезнуть из отчёта — иначе итог разойдётся с расходами.
    const who = resolvePayee({ payee: { kind: "staff", id: "нет-такого" } }, ctx());
    expect(who).not.toBeNull();
    expect(who.name).toContain("удалён");
  });
});

describe("отчёт «кому сколько ушло»", () => {
  const tx = [
    { id: "1", type: "expense", amount: 250000, date: "2026-06-05", subcategory: "ФОТ РОП" },
    { id: "2", type: "expense", amount: 310000, date: "2026-07-05", subcategory: "ФОТ РОП" },
    { id: "3", type: "expense", amount: 400000, date: "2026-07-06", subcategory: "Зарплаты рабочих / подрядчиков", payee: { kind: "worker", id: "w1" } },
    { id: "4", type: "expense", amount: 900000, date: "2026-07-07", subcategory: "Зарплаты рабочих / подрядчиков" },
    { id: "5", type: "income",  amount: 999999, date: "2026-07-07", subcategory: "ФОТ РОП" },
    { id: "6", type: "transfer", amount: 111, date: "2026-07-07" },
    { id: "7", type: "expense", amount: 5000, date: "2026-07-08", subcategory: "ФОТ РОП", deletedAt: 1 },
    { id: "8", type: "expense", amount: 5000, date: "2026-07-08", subcategory: "ФОТ РОП", included: false },
  ];
  const r = buildPayrollReport(tx, { staff, workers, subcategoryMap: map });

  it("приход, переводы, удалённые и исключённые не считаются", () => {
    expect(r.total).toBe(250000 + 310000 + 400000 + 900000);
  });

  it("нераспознанные не выбрасываются, а показываются отдельно", () => {
    // Если их молча убрать, итог отчёта разойдётся с итогом расходов.
    expect(r.unassigned).toBe(900000);
    expect(r.unassignedCount).toBe(1);
    const named = r.rows.reduce((s, x) => s + x.total, 0);
    expect(named + r.unassigned).toBe(r.total);
  });

  it("итог месяца включает нераспознанные, иначе колонка врёт в меньшую сторону", () => {
    expect(r.totalByMonth["2026-07"]).toBe(310000 + 400000 + 900000);
    expect(r.unassignedByMonth["2026-07"]).toBe(900000);
    expect(r.unassignedByMonth["2026-06"]).toBeUndefined();
    // Каждый месяц: именованные + нераспознанные = итог месяца.
    for (const m of r.months) {
      const named = r.rows.reduce((s, x) => s + (x.byMonth[m] || 0), 0);
      expect(named + (r.unassignedByMonth[m] || 0)).toBe(r.totalByMonth[m]);
    }
    expect(Object.values(r.totalByMonth).reduce((s, v) => s + v, 0)).toBe(r.total);
  });

  it("суммы раскладываются по людям и по месяцам", () => {
    const rop = r.rows.find(x => x.id === "s1");
    expect(rop.total).toBe(560000);
    expect(rop.byMonth["2026-06"]).toBe(250000);
    expect(rop.byMonth["2026-07"]).toBe(310000);
    expect(r.months).toEqual(["2026-06", "2026-07"]);
  });

  it("итоги по сотрудникам и подрядчикам считаются раздельно", () => {
    expect(r.staffTotal).toBe(560000);
    expect(r.workerTotal).toBe(400000);
  });

  it("строки отсортированы по сумме", () => {
    expect(r.rows[0].total).toBeGreaterThanOrEqual(r.rows[r.rows.length - 1].total);
  });

  it("период отсекает операции по датам", () => {
    const only7 = buildPayrollReport(tx, { staff, workers, subcategoryMap: map,
      from: Date.UTC(2026, 6, 1), to: Date.UTC(2026, 6, 31, 23, 59) });
    expect(only7.rows.find(x => x.id === "s1").total).toBe(310000);
    expect(only7.months).toEqual(["2026-07"]);
  });

  it("пустой вход не роняет отчёт", () => {
    const empty = buildPayrollReport([], {});
    expect(empty.total).toBe(0);
    expect(empty.rows).toEqual([]);
    expect(buildPayrollReport(null || [], {}).unassigned).toBe(0);
  });
});

describe("подкатегории расходов для разбора истории", () => {
  it("группирует и считает, приход не берёт", () => {
    const t = expenseSubcategoryTotals([
      { type: "expense", amount: 100, subcategory: "ФОТ РОП", category: "OPEX" },
      { type: "expense", amount: 200, subcategory: "ФОТ РОП", category: "OPEX" },
      { type: "expense", amount: 50, subcategory: "", category: "OPEX" },
      { type: "income",  amount: 999, subcategory: "ФОТ РОП" },
    ]);
    expect(t[0].subcategory).toBe("ФОТ РОП");
    expect(t[0].total).toBe(300);
    expect(t[0].count).toBe(2);
    expect(t.find(x => x.subcategory === "— без подкатегории —").total).toBe(50);
  });
});

describe("список операций для разбора", () => {
  const tx = [
    { id: "1", type: "expense", amount: 100000, date: "2026-07-01", subcategory: "Зарплаты рабочих / подрядчиков", note: "бригада Ержана, стяжка" },
    { id: "2", type: "expense", amount: 200000, date: "2026-07-02", subcategory: "Зарплаты рабочих / подрядчиков", note: "бригада Асхата" },
    { id: "3", type: "expense", amount: 300000, date: "2026-07-03", subcategory: "ФОТ РОП" },
    { id: "4", type: "expense", amount: 50000,  date: "2026-07-04", subcategory: "Материалы" },
    { id: "5", type: "expense", amount: 70000,  date: "2026-07-05", subcategory: "Зарплаты рабочих / подрядчиков", payee: { kind: "worker", id: "w1" } },
    { id: "6", type: "income",  amount: 999,    date: "2026-07-06", subcategory: "ФОТ РОП" },
  ];
  const opts = { staff, workers, subcategoryMap: map };

  it("возвращает операции, а не подкатегории — свежие сверху", () => {
    const r = listExpenseOps(tx, opts);
    expect(r.rows.map(x => x.id)).toEqual(["5", "4", "3", "2", "1"]);
    expect(r.count).toBe(5);
    expect(r.total).toBe(720000);
  });

  it("фильтр «только без получателя» убирает уже размеченное", () => {
    const r = listExpenseOps(tx, { ...opts, onlyUnassigned: true });
    // 3 читается по подкатегории, 5 размечен явно — оба уже с получателем.
    expect(r.rows.map(x => x.id)).toEqual(["4", "2", "1"]);
    expect(r.allCount).toBe(5);          // общий счётчик не зависит от фильтров
    expect(r.allTotal).toBe(720000);
  });

  it("фильтр по подкатегории и поиск по комментарию", () => {
    expect(listExpenseOps(tx, { ...opts, subcategory: "Материалы" }).rows.map(x => x.id)).toEqual(["4"]);
    // Комментарий в боевой базе лежит в note — поиск обязан читать именно его.
    expect(listExpenseOps(tx, { ...opts, query: "ержан" }).rows.map(x => x.id)).toEqual(["1"]);
    expect(listExpenseOps(tx, { ...opts, query: "ержан" }).rows[0].comment).toBe("бригада Ержана, стяжка");
    expect(listExpenseOps(tx, { ...opts, query: "нет такого" }).rows).toEqual([]);
  });

  it("видно, откуда взялся получатель", () => {
    const r = listExpenseOps(tx, opts);
    expect(r.rows.find(x => x.id === "5").explicit).toBe(true);
    expect(r.rows.find(x => x.id === "3").explicit).toBe(false);
    expect(r.rows.find(x => x.id === "3").payee.source).toBe("map");
    expect(r.rows.find(x => x.id === "4").payee).toBe(null);
  });

  it("приход и удалённые не попадают", () => {
    const r = listExpenseOps([...tx, { id: "7", type: "expense", amount: 1, date: "2026-07-07", deletedAt: 1 }], opts);
    expect(r.rows.some(x => x.id === "6" || x.id === "7")).toBe(false);
  });
});

describe("карточка человека", () => {
  const tx = [
    { id: "1", type: "expense", amount: 250000, date: "2026-06-05", subcategory: "ФОТ РОП", contractNo: "№0919#149" },
    { id: "2", type: "expense", amount: 60000,  date: "2026-07-05", subcategory: "ФОТ РОП" },
    { id: "3", type: "expense", amount: 700000, date: "2026-07-05", subcategory: "Прочее" },
  ];
  it("берёт только его операции, раскладывает по месяцам и договорам", () => {
    const d = buildStaffDetail(tx, { staffId: "s1", staff, workers, subcategoryMap: map });
    expect(d.count).toBe(2);
    expect(d.total).toBe(310000);
    expect(d.byMonth["2026-06"]).toBe(250000);
    expect(d.byContract["№0919#149"]).toBe(250000);
    expect(d.byContract["— без договора —"]).toBe(60000);
    expect(d.ops[0].date).toBeGreaterThan(d.ops[1].date);   // свежие сверху
  });
});

describe("служебное", () => {
  it("месяц считается в UTC, как и вся аналитика", () => {
    expect(payrollMonthKey("2026-07-31T21:00:00.000Z")).toBe("2026-07");
    expect(payrollMonthKey("")).toBe("");
    expect(payrollMonthKey("не дата")).toBe("");
  });
  it("подпись месяца", () => {
    expect(monthLabel("2026-08")).toBe("авг 26");
    expect(monthLabel("")).toBe("");
  });
  it("нормализация сотрудника: мусор не проходит", () => {
    const s = normalizeStaff({ id: "x", name: "  Пётр  ", status: "чужой", position: " РОП " });
    expect(s.name).toBe("Пётр");
    expect(s.position).toBe("РОП");
    expect(s.status).toBe("active");
    expect(normalizeStaff({ status: "fired" }).status).toBe("fired");
  });
  it("схема мотивации переживает правку остальных полей", () => {
    // Иначе смена должности стирала бы оклад и проценты.
    expect(normalizeStaff({ name: "П", scheme: { salary: 300000 } }).scheme).toEqual({ salary: 300000 });
    expect(normalizeStaff({}).scheme).toEqual({});
  });
});
