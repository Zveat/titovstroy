import { describe, it, expect } from "vitest";
import {
  buildAnalytics, periodBounds, deltaPct, contractSum, ts, makeManagerResolver,
  REFUSE_REASONS, refuseReasonLabel, ANALYTICS_BLOCKS,
} from "./analyticsModel.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const dstr = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

// База специально «как в жизни»: объекты на разных стадиях, доп.смета, договор с
// суммой, отличной от смет, производство с этапами и замечаниями, операции всех видов.
const fixture = () => ({
  objects: [
    { id:"o1", clientName:"Клиент 1", status:"signed",   createdAt: NOW - 20*DAY, area:50, objType:"Квартира", manager:"Иван" },
    { id:"o2", clientName:"Клиент 2", status:"approval", createdAt: NOW - 10*DAY, area:80, objType:"Квартира", manager:"Иван" },
    { id:"o3", clientName:"Клиент 3", status:"refuse",   createdAt: NOW - 5*DAY,  refuseReason:"price", manager:"Пётр" },
    { id:"o4", clientName:"Клиент 4", status:"new",      createdAt: NOW - 2*DAY,  manager:"Пётр" },
    { id:"od", clientName:"Удалённый", status:"signed",  createdAt: NOW - 3*DAY, deletedAt: NOW },
    { id:"om", clientName:"Из миграции", status:"signed", createdAt: NOW - 1*DAY, createdBy:"migration" },
  ],
  estimates: [
    { id:"e1",  objectId:"o1", total:1000000, cost:600000 },
    { id:"e1b", objectId:"o1", total:200000,  cost:120000 },   // доп.смета — суммируется
    { id:"e2",  objectId:"o2", total:800000,  cost:500000 },
    { id:"e3",  objectId:"o3", total:300000,  cost:200000 },
    // Доп.смета БЕЗ objectId, привязана к родителю e1 → должна попасть на объект o1
    { id:"e1c", parentId:"e1", total:100000, cost:60000 },
  ],
  // Сумма договора НАМЕРЕННО отличается от суммы смет (1 200 000), чтобы проверить,
  // что «Подписано» считается по договору, а не по сметам.
  contracts: [
    { id:"c1", objectId:"o1", number:"№ 12", date: dstr(-15), works:[{quantity:1, price:1300000}] },
  ],
  productions: [
    { objectId:"o1", prodStatus:"active", responsible:"Прораб А",
      startDate: dstr(-14), planEndDate: dstr(-1), // план-финиш вчера → просрочка
      stages:[
        { id:"s1", name:"Демонтаж", status:"done", planEnd: dstr(-10), priceClient:400000, costPlan:250000, paid:false },
        { id:"s2", name:"Стяжка",   status:"todo", planEnd: dstr(-2),  priceClient:800000, costPlan:500000 },
      ],
      defects:[
        { id:"d1", text:"Скол",  source:"client", ts: NOW - 9*DAY, done:true },
        { id:"d2", text:"Грязь", source:"client", ts: NOW - 3*DAY, done:false },
        { id:"d3", text:"Старое", source:"client", ts: NOW - 30*DAY, done:false },
      ],
      checklistHandover:[{ id:"h1", done:true }, { id:"h2", done:false }],
    },
  ],
  accounts: [
    { id:"a1", name:"Каспи", opening: 100000 },
    { id:"a2", name:"Наличные", opening: 0 },
  ],
  financeTx: [
    { id:"t1", type:"income",  amount:700000, date: dstr(-8), contractNo:"№12" },
    { id:"t2", type:"expense", amount:300000, date: dstr(-6), contractNo:"№ 12", category:"Материалы" },
    { id:"t3", type:"expense", amount:100000, date: dstr(-4), contractNo:"№12",  category:"Зарплата" },
    { id:"t4", type:"income",  amount:999,    date: dstr(-4), contractNo:"№12", deletedAt: NOW },  // удалена
    { id:"t5", type:"income",  amount:888,    date: dstr(-4), contractNo:"№12", included:false },  // исключена
    // Не P&L: заём и покупка активов — в выручку/расход попасть не должны
    { id:"t6", type:"income",  amount:5000000, date: dstr(-5), category:"Финансирование (не выручка)" },
    { id:"t7", type:"expense", amount:2000000, date: dstr(-5), category:"Выданные займы и прочие активы" },
    // Аванс — не выручка периода, но деньги пришли (важно для дебиторки)
    { id:"t8", type:"income",  amount:50000,  date: dstr(-3), contractNo:"№12", isAdvance:true },
    // Без поля date — дата берётся из createdAt
    { id:"t9", type:"expense", amount:10000,  createdAt: NOW - 2*DAY, category:"Материалы" },
    // Прямая себестоимость — вычитается из ВАЛОВОЙ прибыли
    { id:"t10", type:"expense", amount:250000, date: dstr(-3), contractNo:"№12", category:"Прямые расходы (COGS / себестоимость)" },
    // Дивиденды — распределение прибыли, в расходы P&L не входят
    { id:"t11", type:"expense", amount:70000,  date: dstr(-3), category:"Прочее", subcategory:"Дивиденды учредителям" },
    // движение между счетами — на общий остаток не влияет
    { id:"t12", type:"transfer", amount:30000, date: dstr(-2), account:"Каспи", accountTo:"Наличные" },
  ],
});

const all = () => buildAnalytics(fixture(), { period: "all", now: NOW });

describe("периоды — совпадают с остальным экраном аналитики", () => {
  it("месяц считается С 1-ГО ЧИСЛА, а не «последние 30 дней»", () => {
    const b = periodBounds("month", { now: NOW });
    expect(new Date(b.from).toISOString().slice(0, 10)).toBe("2026-06-01");
    // предыдущий период — предыдущий календарный месяц
    expect(new Date(b.prevFrom).toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(b.prevTo).toBe(b.from);
  });

  it("3 месяца — с 1-го числа минус 2 месяца", () => {
    const b = periodBounds("3month", { now: NOW });
    expect(new Date(b.from).toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(new Date(b.prevFrom).toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("неделя — последние 7 дней", () => {
    const b = periodBounds("week", { now: NOW });
    expect(Math.round((b.to - b.from) / DAY)).toBe(6);
    expect(b.prevFrom).toBe(b.from - 7 * DAY);
  });

  it("«всё время» — сравнивать не с чем", () => {
    const b = periodBounds("all", { now: NOW });
    expect(b.from).toBe(0);
    expect(b.prevFrom).toBeNull();
    expect(all().previous).toBeNull();
  });

  it("дельта не делит на ноль", () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    expect(deltaPct(50, 0)).toBeNull();
    expect(deltaPct(50, null)).toBeNull();
  });

  it("ts понимает миллисекунды и строку даты", () => {
    expect(ts(NOW)).toBe(NOW);
    expect(ts("2026-06-15")).toBe(new Date("2026-06-15").getTime());
    expect(ts("")).toBe(0);
  });
});

describe("продажи и воронка", () => {
  it("не берёт удалённые; объекты миграции только во «всё время»", () => {
    expect(all().sales.newObjects).toBe(5);          // 4 обычных + миграционный
    const month = buildAnalytics(fixture(), { period: "month", now: NOW });
    // в июне созданы o2(-10д), o3(-5д), o4(-2д); миграционный исключён
    expect(month.sales.newObjects).toBe(3);
  });

  it("«Подписано» считается по сумме ДОГОВОРА, а не смет", () => {
    const { sales } = all();
    expect(sales.signedCount).toBe(2);               // o1 + миграционный
    expect(sales.signedSum).toBe(1300000);           // договор o1; у миграционного смет и договора нет
    expect(sales.avgCheck).toBe(650000);
  });

  it("доп.смета через parentId попадает в стоимость объекта", () => {
    const { backlog } = all();
    // o1: 1 000 000 + 200 000 + 100 000 (доп через parentId)
    expect(backlog.contracted).toBe(1300000);
  });

  it("конверсия по шагам", () => {
    const { sales } = all();
    expect(sales.estimatedCount).toBe(3);            // o1, o2, o3
    expect(sales.convToEstimate).toBe(60);           // 3 из 5
    expect(sales.convTotal).toBe(40);                // 2 из 5
  });

  it("отказ и расторжение считаются раздельно", () => {
    const { sales } = all();
    expect(sales.lostCount).toBe(1);
    expect(sales.lostSum).toBe(300000);
    expect(sales.cancelledCount).toBe(0);
    expect(sales.lostByReason.price).toEqual({ count: 1, sum: 300000 });
  });

  it("срок сделки и цена за м² — по договору", () => {
    const { sales } = all();
    expect(sales.avgDealDays).toBe(5);               // создан -20д, договор -15д
    expect(sales.avgDealDaysSample).toBe(1);         // среднее по ОДНОЙ сделке
    expect(sales.avgPricePerSqm).toBe(26000);        // 1 300 000 / 50
  });

  it("по менеджерам — считает и сметы, и подписанные", () => {
    const { sales } = all();
    expect(sales.byManager["Иван"]).toMatchObject({ objects: 2, estimated: 2, signed: 1, signedSum: 1300000 });
  });

  it("варианты имени менеджера сводятся к сотруднику", () => {
    const data = fixture();
    data.objects[1].manager = "Иван Петров";        // заведён в системе
    data.objects[0].manager = "Иван П.";            // тот же человек, другой формат
    const res = buildAnalytics(data, {
      period: "all", now: NOW, users: [{ name: "Иван Петров" }],
    });
    expect(res.sales.byManager["Иван Петров"]).toMatchObject({ objects: 2 });
    expect(res.sales.byManager["Иван П."]).toBeUndefined();
  });

  it("список объектов для проверки — то же число, что в плитке", () => {
    const { sales } = all();
    expect(sales.cohortList).toHaveLength(sales.newObjects);
    expect(sales.cohortList[0]).toHaveProperty("name");
  });
});

describe("производство и сроки", () => {
  const { production } = all();

  it("видит просрочку и считает полные дни", () => {
    expect(production.inWork).toBe(1);
    expect(production.overdueObjects).toBe(1);
    expect(production.overdueAvgDays).toBe(1);       // 36 часов = 1 полный день
  });

  it("расторгнутый объект просроченным не считается", () => {
    const data = fixture();
    data.productions[0].prodStatus = "cancel";
    const res = buildAnalytics(data, { period: "all", now: NOW });
    expect(res.production.overdueObjects).toBe(0);
  });

  it("прогресс и просроченные этапы", () => {
    expect(production.stagesProgress).toBe(50);
    expect(production.overdueStages).toBe(1);
  });

  it("закрытые этапы без оплаты КЛИЕНТОМ считаются по цене клиенту", () => {
    expect(production.unpaidDoneStages).toBe(1);
    // priceClient закрытого этапа = 400 000 (не себестоимость 250 000)
    expect(production.unpaidDoneSum).toBe(400000);
  });
});

describe("финансы", () => {
  const { finance } = all();

  it("не берёт удалённые и исключённые операции", () => {
    expect(finance.income).not.toContain(999);
    expect(finance.income).toBe(700000);             // аванс и заём в выручку не попали
  });

  it("займы, возвраты, авансы и дивиденды исключены — как в ОПУ", () => {
    expect(finance.income).toBe(700000);             // без 5 000 000 займа и 50 000 аванса
    // расходы P&L: 300k + 100k + 10k + 250k(COGS); без активов и без дивидендов
    expect(finance.expense).toBe(660000);
  });

  it("валовая прибыль вычитает ТОЛЬКО прямую себестоимость, как в финучёте", () => {
    expect(finance.cogs).toBe(250000);
    expect(finance.gross).toBe(450000);              // 700 000 − 250 000
    expect(finance.net).toBe(40000);                 // 700 000 − 660 000
  });

  it("операция без даты берёт дату создания", () => {
    // t9 (10 000, только createdAt) попал в расходы «Материалы»
    expect(finance.expenseByCategory["Материалы"]).toBe(310000);
  });

  it("денежный поток показывает ВСЕ движения, включая займы", () => {
    const totalIn = Object.values(finance.cashflow).reduce((s, v) => s + v.income, 0);
    expect(totalIn).toBe(700000 + 5000000 + 50000);
  });

  it("объект без номера договора НЕ уходит в дебиторку целиком", () => {
    const data = fixture();
    data.contracts = [];                         // договора нет — сопоставлять не с чем
    const res = buildAnalytics(data, { period: "all", now: NOW });
    expect(res.finance.receivables).toBe(0);
    expect(res.finance.unlinkedObjects).toBeGreaterThan(0);
    expect(res.finance.unlinkedSum).toBeGreaterThan(0);
  });

  it("дебиторка — по договору, аванс уменьшает долг", () => {
    // договор 1 300 000, получено 700 000 + аванс 50 000
    expect(finance.receivables).toBe(550000);
    expect(finance.receivablesOverdue).toBe(550000); // план-финиш прошёл
  });

  it("перерасход считается к плановой себестоимости сметы", () => {
    // план себестоимости o1 = 600k + 120k + 60k = 780 000, факт 650 000 → перерасхода нет
    expect(finance.overspendObjects).toEqual([]);
    const data = fixture();
    data.financeTx.push({ id:"tx", type:"expense", amount:500000, date: dstr(-2), contractNo:"№12", category:"Материалы" });
    const res = buildAnalytics(data, { period: "all", now: NOW });
    // факт по договору: 300k + 100k + 250k(COGS) + 500k = 1 150 000, план 780 000
    expect(res.finance.overspendObjects[0]).toMatchObject({ objectId: "o1", overspend: 370000 });
  });
});

describe("портфель заказов", () => {
  it("считает выполненное по этапам с ценами", () => {
    const { backlog } = all();
    expect(backlog.activeObjects).toBe(2);           // o1 + миграционный signed
    expect(backlog.contracted).toBe(1300000);        // сметы o1: 1000k + 200k + 100k(доп через parentId)
    expect(backlog.doneValue).toBe(400000);
    expect(backlog.stagesValue).toBe(1200000);       // 400k + 800k
    expect(backlog.remaining).toBe(800000);          // остаток по ТЕМ ЖЕ этапам
    expect(backlog.stagesProgressPct).toBe(33);
    expect(backlog.objectsWithStagePrices).toBe(1);
    expect(backlog.byForeman["Прораб А"]).toMatchObject({ objects: 1 });
  });

  it("без цен этапов «выполнено» не выдумывается", () => {
    const data = fixture();
    data.productions[0].stages.forEach(s => { s.priceClient = 0; });
    const res = buildAnalytics(data, { period: "all", now: NOW });
    expect(res.backlog.objectsWithStagePrices).toBe(0);
    expect(res.backlog.doneValue).toBe(0);
  });
});

describe("качество", () => {
  const { quality } = all();

  it("считает открытые, старые и закрытые замечания", () => {
    expect(quality.openRemarks).toBe(2);
    expect(quality.openFromClient).toBe(2);
    expect(quality.closedRemarks).toBe(1);
    expect(quality.fromClient).toBe(3);
    expect(quality.openOverWeek).toBe(1);            // висит 30 дней
    expect(quality.oldestOpenDays).toBe(30);
  });

  it("чек-лист сдачи — только по объектам в работе и сданным", () => {
    expect(quality.handoverPct).toBe(50);
    expect(quality.objectsInHandover).toBe(1);
  });

  it("у качества нет сравнения с периодом — в базе нет даты закрытия", () => {
    const month = buildAnalytics(fixture(), { period: "month", now: NOW });
    expect(month.previous.quality).toBeUndefined();
  });
});

describe("деньги на счетах", () => {
  it("остаток = начальный + приходы − расходы, перевод общий остаток не меняет", () => {
    const data = fixture();
    // все операции без account попадут в «undefined», поэтому проставим счёт
    data.financeTx.forEach(t => { if (!t.account && t.type !== "transfer") t.account = "Каспи"; });
    const { cash } = buildAnalytics(data, { period: "all", now: NOW });
    // 100 000 начальный + приходы (700k+5000k+50k) − расходы (300+100+10+250+70+2000 тыс)
    const income = 700000 + 5000000 + 50000;
    const expense = 300000 + 100000 + 10000 + 250000 + 70000 + 2000000;
    expect(cash.total).toBe(100000 + income - expense);
    expect(cash.byAccount.length).toBe(2);
  });
});

describe("качество данных", () => {
  const { dataQuality } = all();

  it("находит пробелы и считает операции без договора", () => {
    expect(dataQuality.totalGaps).toBeGreaterThan(0);
    const areaGap = dataQuality.gaps.find(g => g.key === "area");
    expect(areaGap.count).toBeGreaterThan(0);
    expect(dataQuality.txWithoutContract).toBeGreaterThan(0);
  });

  it("у каждого пробела есть список объектов для дозаполнения", () => {
    for (const g of dataQuality.gaps) {
      expect(g.list.length).toBeGreaterThan(0);
      expect(g.list[0]).toHaveProperty("name");
    }
  });
});

describe("план vs факт маржи", () => {
  it("считает просадку маржи по объекту", () => {
    const { finance } = all();
    // o1: план (1 300 000 − 780 000)/1 300 000 = 40%; факт (750 000 − 650 000)/750 000 = 13%
    expect(finance.marginSample).toBe(1);
    expect(finance.marginPlanAvg).toBe(40);
    expect(finance.marginFactAvg).toBe(13);
    expect(finance.marginDrops[0]).toMatchObject({ id: "o1", drop: 27 });
  });
});

describe("служебное", () => {
  it("сумма договора: работы → цена за м² → итог", () => {
    expect(contractSum({ works:[{quantity:2, price:100}] })).toBe(200);
    expect(contractSum({ priceType:"sqm", pricePerSqm:1000, area:50 })).toBe(50000);
    expect(contractSum({ totalCost:777 })).toBe(777);
    expect(contractSum(null)).toBe(0);
  });

  it("у каждого блока своё право доступа", () => {
    expect(ANALYTICS_BLOCKS.map(b => b.permission)).toEqual([
      "analyticsSales", "analyticsBacklog", "analyticsProduction", "analyticsFinance",
      "analyticsQuality", "analyticsFinance", "analyticsQuality",
    ]);
  });

  it("резолвер менеджера не угадывает при неоднозначности", () => {
    const resolve = makeManagerResolver([{ name: "Сергей Штанько" }, { name: "Сергей Шевчук" }]);
    expect(resolve("Сергей Штанько")).toBe("Сергей Штанько");
    expect(resolve("Сергей Ш.")).toBe("Сергей Ш.");   // двое подходят — не приписываем
    expect(resolve("Пётр")).toBe("Пётр (нет в сотрудниках)"); // совпадений нет вовсе
    expect(resolve("")).toBe("Без менеджера");
    const one = makeManagerResolver([{ name: "Сергей Штанько" }]);
    expect(one("Сергей Ш")).toBe("Сергей Штанько");
  });

  it("причина отказа", () => {
    expect(refuseReasonLabel("price")).toBe("Дорого");
    expect(refuseReasonLabel("нет такой")).toBe("Не указана");
    expect(REFUSE_REASONS.length).toBeGreaterThan(3);
  });
});
