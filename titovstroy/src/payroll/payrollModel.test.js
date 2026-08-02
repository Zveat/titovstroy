import { describe, it, expect } from "vitest";
import {
  resolvePayee, buildPayrollReport, expenseSubcategoryTotals, buildStaffDetail,
  normalizeStaff, payrollMonthKey, monthLabel, listExpenseOps, EXCLUDE_KEY,
  buildPayrollDynamics, payrollMovers, contractObjectIndex,
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

describe("«не ФОТ» — подкатегория выкидывается из раздела целиком", () => {
  const tx = [
    { id: "1", type: "expense", amount: 300000, date: "2026-07-01", subcategory: "ФОТ РОП" },
    { id: "2", type: "expense", amount: 1856113, date: "2026-07-02", subcategory: "Дивиденды учредителям",
      payee: { kind: "staff", id: "s1" } },
    { id: "3", type: "expense", amount: 50000, date: "2026-07-03", subcategory: "Материалы" },
  ];
  const opts = { staff, workers, subcategoryMap: { ...map, [EXCLUDE_KEY]: ["Дивиденды учредителям", "Материалы"] } };

  it("исключённое не попадает ни в итог, ни в строку человека", () => {
    // Дивидендам в разделе про зарплату делать нечего вообще — даже отдельной
    // колонкой: владелец на это прямо указал.
    const r = buildPayrollReport(tx, opts);
    expect(r.total).toBe(300000);
    expect(r.excludedTotal).toBe(1906113);
    const rop = r.rows.find(x => x.id === "s1");
    expect(rop.total).toBe(300000);
    expect(r.unassigned).toBe(0);              // «Материалы» тоже вне раздела
  });

  it("сотрудники и подрядчики считаются отдельными разрезами", () => {
    const t2 = [...tx, { id: "4", type: "expense", amount: 400000, date: "2026-07-04",
      subcategory: "Зарплаты рабочих / подрядчиков", payee: { kind: "worker", id: "w1" } }];
    const r = buildPayrollReport(t2, opts);
    expect(r.staffRows.map(x => x.id)).toEqual(["s1"]);
    expect(r.workerRows.map(x => x.id)).toEqual(["w1"]);
    expect(r.staffTotal).toBe(300000);
    expect(r.workerTotal).toBe(400000);
    expect(r.staffByMonth["2026-07"]).toBe(300000);
    expect(r.workerByMonth["2026-07"]).toBe(400000);
    // Итог сходится: сотрудники + подрядчики + не разложено = всего.
    expect(r.staffTotal + r.workerTotal + r.unassigned).toBe(r.total);
  });

  it("без отметок в расчёт идёт всё, как раньше", () => {
    const r = buildPayrollReport(tx, { staff, workers, subcategoryMap: map });
    expect(r.excludedTotal).toBe(0);
    expect(r.total).toBe(2206113);
  });

  it("карточка человека тоже не показывает исключённое", () => {
    const d = buildStaffDetail(tx, { staffId: "s1", ...opts });
    expect(d.total).toBe(300000);
    expect(d.ops.some(o => o.subcategory === "Дивиденды учредителям")).toBe(false);
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

  it("считает средние, крайние даты и разрез по статьям", () => {
    const d = buildStaffDetail(tx, { staffId: "s1", staff, workers, subcategoryMap: map });
    expect(d.months).toEqual(["2026-06", "2026-07"]);
    expect(d.avgOp).toBe(155000);       // две выплаты
    expect(d.avgMonth).toBe(155000);    // два месяца
    expect(d.maxOp).toBe(250000);
    expect(d.bySubcategory["ФОТ РОП"]).toBe(310000);
    expect(new Date(d.first).toISOString().slice(0, 10)).toBe("2026-06-05");
    expect(new Date(d.last).toISOString().slice(0, 10)).toBe("2026-07-05");
  });

  it("средний месяц не делится на месяцы без выплат", () => {
    // Иначе у человека, которому платили дважды за год, «средний месяц» был бы
    // в шесть раз меньше реального и сравнивать его с окладом стало бы нельзя.
    const d = buildStaffDetail(
      [{ id: "1", type: "expense", amount: 300000, date: "2026-01-05", subcategory: "ФОТ РОП" },
       { id: "2", type: "expense", amount: 300000, date: "2026-07-05", subcategory: "ФОТ РОП" }],
      { staffId: "s1", staff, workers, subcategoryMap: map });
    expect(d.avgMonth).toBe(300000);
  });
});

describe("динамика", () => {
  const dtx = [
    { id: "a1", type: "expense",  amount: 100,  date: "2026-05-10", subcategory: "ФОТ РОП" },
    { id: "a2", type: "expense",  amount: 50,   date: "2026-05-11", payee: { kind: "worker", id: "w1" } },
    { id: "a3", type: "expense",  amount: 30,   date: "2026-05-12", subcategory: "Материалы" },
    { id: "a4", type: "expense",  amount: 500,  date: "2026-05-13", subcategory: "Дивиденды" },
    { id: "a5", type: "income",   amount: 1000, date: "2026-05-14" },
    { id: "a6", type: "transfer", amount: 9999, date: "2026-05-15" },
    { id: "b1", type: "expense",  amount: 200,  date: "2026-06-10", subcategory: "ФОТ РОП" },
    { id: "b2", type: "income",   amount: 400,  date: "2026-06-11" },
  ];
  const rep = () => buildPayrollReport(dtx, {
    staff, workers, subcategoryMap: { ...map, [EXCLUDE_KEY]: ["Дивиденды"] },
  });

  it("ставит ФОТ рядом с расходами и выручкой того же месяца", () => {
    const d = buildPayrollDynamics(dtx, rep());
    expect(d.rows.map(r => r.month)).toEqual(["2026-05", "2026-06"]);
    const may = d.rows[0];
    expect(may.payroll).toBe(180);          // 100 + 50 + 30, дивиденды мимо
    expect(may.staff).toBe(100);
    expect(may.worker).toBe(50);
    expect(may.unassigned).toBe(30);
    expect(may.expense).toBe(680);          // расходы ВСЕ, включая «не ФОТ»
    expect(may.income).toBe(1000);
    expect(may.shareExpense).toBeCloseTo(180 / 680, 6);
  });

  it("перевод между своими счетами — не доход и не расход", () => {
    const d = buildPayrollDynamics(dtx, rep());
    expect(d.rows[0].expense).toBe(680);
    expect(d.rows[0].income).toBe(1000);
  });

  it("считает изменение к предыдущему месяцу", () => {
    const d = buildPayrollDynamics(dtx, rep());
    expect(d.rows[0].delta).toBeNull();      // первый месяц истории
    expect(d.rows[1].prevMonth).toBe("2026-05");
    expect(d.rows[1].delta).toBe(20);
    expect(d.rows[1].deltaPct).toBeCloseTo(20 / 180, 6);
  });

  it("окно показа не отменяет сравнение с месяцем до окна", () => {
    // Иначе у первой строки таблицы изменения не было бы никогда, хотя данные есть.
    const d = buildPayrollDynamics(dtx, rep(), { monthsBack: 1 });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].month).toBe("2026-06");
    expect(d.rows[0].prevPayroll).toBe(180);
    expect(d.rows[0].delta).toBe(20);
  });

  it("средняя на человека делится на тех, кто в этом месяце получал", () => {
    const d = buildPayrollDynamics(dtx, rep());
    expect(d.rows[0].people).toBe(2);        // РОП и подрядчик
    expect(d.rows[0].avgPerPerson).toBe(90); // 180 / 2, «не разложено» тоже в ФОТ месяца
    expect(d.rows[1].people).toBe(1);
  });

  it("итоги и доли за весь период", () => {
    const d = buildPayrollDynamics(dtx, rep());
    expect(d.totalPayroll).toBe(380);
    expect(d.totalExpense).toBe(880);
    expect(d.totalIncome).toBe(1400);
    expect(d.avgPayroll).toBe(190);
    expect(d.shareExpense).toBeCloseTo(380 / 880, 6);
    expect(d.shareIncome).toBeCloseTo(380 / 1400, 6);
  });

  it("месяц без прихода не делит на ноль", () => {
    const d = buildPayrollDynamics(
      [{ id: "x", type: "expense", amount: 100, date: "2026-05-10", subcategory: "ФОТ РОП" }],
      buildPayrollReport([{ id: "x", type: "expense", amount: 100, date: "2026-05-10", subcategory: "ФОТ РОП" }],
        { staff, workers, subcategoryMap: map }));
    expect(d.rows[0].shareIncome).toBeNull();
    expect(d.shareIncome).toBeNull();
  });

  it("база «только по людям» считает без неразобранного", () => {
    // Обе границы должны быть честными: «всё» завышает долю материалами и эквайрингом,
    // «по людям» занижает на ещё не разобранных операциях.
    const d = buildPayrollDynamics(dtx, rep(), { basis: "named" });
    expect(d.rows[0].payroll).toBe(150);        // 100 сотруднику + 50 подрядчику, без 30
    expect(d.rows[0].unassigned).toBe(30);      // в колонке остаётся — это и есть повод разобрать
    expect(d.rows[0].shareExpense).toBeCloseTo(150 / 680, 6);
    expect(d.totalPayroll).toBe(350);
    expect(d.basis).toBe("named");
  });

  it("сравнение с прошлым месяцем считается в той же базе", () => {
    // Иначе «выросли» и «просели» получались бы из разных вселенных.
    const d = buildPayrollDynamics(dtx, rep(), { basis: "named", monthsBack: 1 });
    expect(d.rows[0].prevPayroll).toBe(150);
    expect(d.rows[0].delta).toBe(50);
  });

  it("пустые данные не роняют расчёт", () => {
    const d = buildPayrollDynamics([], null);
    expect(d.rows).toEqual([]);
    expect(d.last).toBeNull();
    expect(d.avgPayroll).toBe(0);
  });

  it("кто вырос и кто просел", () => {
    const m = payrollMovers(rep(), "2026-05", "2026-06");
    expect(m.up).toHaveLength(1);
    expect(m.up[0].id).toBe("s1");
    expect(m.up[0].delta).toBe(100);
    expect(m.up[0].pct).toBeCloseTo(1, 6);
    expect(m.down).toHaveLength(1);
    expect(m.down[0].id).toBe("w1");
    expect(m.down[0].delta).toBe(-50);
    expect(m.down[0].stopped).toBe(true);
    expect(m.down[0].pct).toBeNull();       // «минус 100%» — это не процент, а конец выплат
  });

  it("появившийся человек помечен, а не показан ростом от нуля", () => {
    const m = payrollMovers(rep(), "2026-04", "2026-05");
    expect(m.up.every(x => x.appeared)).toBe(true);
    expect(m.up.every(x => x.pct === null)).toBe(true);
  });
});

describe("объект по номеру договора", () => {
  const objects = [
    { id: "o1", address: "Сатыбалдина 7, 28", clientName: "Вера" },
    { id: "o2", address: "", clientName: "Пётр" },
  ];
  it("находит по договору и по финпроекту, номер нормализуется", () => {
    const label = contractObjectIndex({
      objects,
      contracts: [{ id: "c1", number: "№0919#149", objectId: "o1" }],
      finProjects: [{ id: "p1", contractNo: "0819 #140", objectId: "o2" }],
    });
    expect(label("0919#149")).toBe("Сатыбалдина 7, 28");
    expect(label("№ 0919 # 149")).toBe("Сатыбалдина 7, 28");
    expect(label("№0819#140")).toBe("Пётр");
  });
  it("не знает — молчит, а не выдумывает", () => {
    const label = contractObjectIndex({
      objects,
      contracts: [{ id: "c1", number: "№0919#149", objectId: "o1", deletedAt: 1 }],
    });
    expect(label("0919#149")).toBe("");
    expect(label("")).toBe("");
    expect(label(null)).toBe("");
    expect(contractObjectIndex()("что угодно")).toBe("");
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
