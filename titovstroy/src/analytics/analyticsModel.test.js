import { describe, it, expect } from "vitest";
import {
  buildAnalytics, periodBounds, deltaPct, contractSum, ts, makeManagerResolver,
  REFUSE_REASONS, refuseReasonLabel, ANALYTICS_BLOCKS, formatTenge,
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
    // Чек — по одному o1, а не по двум: у миграционного суммы просто НЕТ, и делить
    // на него нельзя (раньше выходило 650 000, вдвое меньше реальной сделки).
    expect(sales.avgCheck).toBe(1300000);
    expect(sales.avgCheckSample).toBe(1);
  });

  it("договор подряда не подменяет клиентский договор объекта", () => {
    // В старых записях подряд лежал в том же списке договоров. Если он дороже
    // клиентского, «Подписано» считалось бы по себестоимости, а срок сделки —
    // по дате подряда (её подписывают позже).
    const f = fixture();
    f.contracts.push({ id:"cp", objectId:"o1", number:"№ 1012", date: dstr(-2),
      type:"podryad", works:[{ quantity:1, price:9000000 }] });
    const { sales } = buildAnalytics(f, { period: "all", now: NOW });
    expect(sales.signedSum).toBe(1300000);
  });

  it("«Подписано за период» не теряет объекты из миграции и архива", () => {
    // Отбор идёт по дате ПОДПИСАНИЯ — она настоящая у любого объекта. Раньше
    // лишний отсев выбрасывал такие сделки, и «подписано» занижалось.
    const f = fixture();
    f.objects.push(
      { id:"sm", clientName:"Из миграции, подписан в июне", status:"signed",
        createdAt: NOW - 300*DAY, createdBy:"migration" },
      { id:"sa", clientName:"Подписан в июне и в архиве",   status:"archive",
        createdAt: NOW - 150*DAY },
    );
    f.contracts.push(
      { id:"csm", objectId:"sm", number:"№ 201", date: dstr(-6), works:[{quantity:1, price:100000}] },
      { id:"csa", objectId:"sa", number:"№ 202", date: dstr(-5), works:[{quantity:1, price:200000}] },
    );
    f.productions.push({ objectId:"sa", prodStatus:"done", factEndDate: dstr(-1) });
    const { sales } = buildAnalytics(f, { period: "month", now: NOW });
    // o1 подписан 31 мая — не в июне. Значит июньские подписания: sm и sa.
    expect(sales.signedCount).toBe(2);
    expect(sales.signedSum).toBe(300000);
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

  it("когортная воронка: стадии вложены, исходы сходятся с входом", () => {
    const { sales } = all();
    const f = sales.cohortFunnel;
    const [entered, estimated, contracted] = f.stages.map(x => x.count);
    // каждая следующая стадия — подмножество предыдущей
    expect(entered).toBe(sales.newObjects);
    expect(estimated).toBeLessThanOrEqual(entered);
    expect(contracted).toBeLessThanOrEqual(estimated);
    // зашло = дошли до договора + отказались + ещё в работе
    expect(contracted + f.lost.count + f.inProgress.count).toBe(entered);
  });

  it("когортная воронка считается за ПЕРИОД, а не по всей базе", () => {
    const month = buildAnalytics(fixture(), { period: "month", now: NOW });
    expect(month.sales.cohortFunnel.stages[0].count).toBe(month.sales.newObjects);
    expect(month.sales.cohortFunnel.stages[0].count).toBeLessThan(all().sales.newObjects);
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

describe("производство за период — поток событий", () => {
  // Случаи, из-за которых «Сдали» показывало 1 вместо реального числа:
  //   p1 — подписан весной, сдан в этом месяце (когорта его не видела вовсе);
  //   pm — объект из МИГРАЦИИ: раньше отсеивался в любом периоде, хотя факт-дата у
  //        него настоящая, и в плитке «Сдано за период» он при этом считался;
  //   pa — сдан и убран в АРХИВ: сдача была, а из воронки объект пропадал;
  //   pl — сдан 30-го числа: верхняя граница месяца стояла «сейчас», поэтому
  //        сегодняшним числом сдача ещё считалась, а завтрашним — уже нет.
  const prodFixture = () => {
    const f = fixture();
    f.objects.push(
      { id:"p1", clientName:"Подписан весной, сдан в этом месяце", status:"done",   createdAt: NOW - 200*DAY },
      { id:"p2", clientName:"Сдан в прошлом году",                 status:"done",   createdAt: NOW - 400*DAY },
      { id:"p3", clientName:"Вышли на объект в этом месяце",       status:"paused", createdAt: NOW - 30*DAY },
      { id:"p4", clientName:"Расторгнут",                          status:"cancel", createdAt: NOW - 25*DAY },
      { id:"p5", clientName:"Подписан в этом месяце, не начат",    status:"signed", createdAt: NOW - 20*DAY },
      { id:"pm", clientName:"Из миграции, сдан в этом месяце",     status:"done",   createdAt: NOW - 300*DAY, createdBy:"migration" },
      { id:"pa", clientName:"Сдан и убран в архив",                status:"archive", createdAt: NOW - 150*DAY },
      { id:"pl", clientName:"Сдан 30-го, в конце месяца",          status:"done",   createdAt: NOW - 100*DAY },
    );
    f.contracts.push(
      { id:"cp1", objectId:"p1", number:"№ 101", date: "2026-02-10", works:[{quantity:1, price:500000}] },
      { id:"cp2", objectId:"p2", number:"№ 102", date: "2024-03-01", works:[{quantity:1, price:900000}] },
      { id:"cp3", objectId:"p3", number:"№ 103", date: dstr(-11), works:[{quantity:1, price:400000}] },
      { id:"cp4", objectId:"p4", number:"№ 104", date: dstr(-10), works:[{quantity:1, price:300000}] },
      { id:"cp5", objectId:"p5", number:"№ 105", date: dstr(-9),  works:[{quantity:1, price:200000}] },
    );
    f.productions.push(
      { objectId:"p1", prodStatus:"done",   startDate:"2026-02-20", factEndDate: dstr(-4) },
      { objectId:"p2", prodStatus:"done",   startDate:"2024-03-10", factEndDate:"2024-09-01" },
      { objectId:"p3", prodStatus:"paused", startDate: dstr(-8) },
      { objectId:"p4", prodStatus:"cancel", startDate: dstr(-7) },
      { objectId:"pm", prodStatus:"done",   startDate:"2026-05-01", factEndDate: dstr(-3) },
      { objectId:"pa", prodStatus:"done",   startDate:"2026-04-01", factEndDate: dstr(-2) },
      { objectId:"pl", prodStatus:"done",   startDate:"2026-05-05", factEndDate:"2026-06-30" },
    );
    return f;
  };
  const monthProd = () => buildAnalytics(prodFixture(), { period: "month", now: NOW }).funnels.production;
  const doneIds = () => monthProd().doneList.map(x => x.id).sort();

  it("сдача считается по ФАКТ-дате окончания, даже если договор был давно", () => {
    expect(monthProd().stages[2].label).toBe("Сдали");
    // p1 подписан в феврале, сдан 4 дня назад — обязан попасть в «Сдали» за месяц.
    expect(doneIds()).toContain("p1");
    // p2 сдан в 2024-м — в текущий месяц не лезет.
    expect(doneIds()).not.toContain("p2");
  });

  it("объект из миграции со сдачей в периоде НЕ выбрасывается", () => {
    expect(doneIds()).toContain("pm");
  });

  it("сданный и убранный в архив объект всё равно считается сданным", () => {
    expect(doneIds()).toContain("pa");
  });

  it("сдача 30-го числа попадает в месяц, хотя «сейчас» — 15-е", () => {
    // NOW = 15 июня; факт-дата 30 июня. Пока верхней границей был текущий момент,
    // такая сдача молча выпадала из месяца.
    expect(doneIds()).toContain("pl");
  });

  it("«Сдали» и плитка «Сдано за период» — одно и то же число", () => {
    const a = buildAnalytics(prodFixture(), { period: "month", now: NOW });
    expect(a.funnels.production.stages[2].count).toBe(a.production.doneInPeriod);
    expect(a.production.doneInPeriod).toBe(4);        // p1, pm, pa, pl
  });

  it("начинается с договора, дальше выход на объект и сдача", () => {
    expect(monthProd().stages.map(s => s.label))
      .toEqual(["Подписали договор", "Вышли на объект", "Сдали"]);
  });

  it("каждая стадия — события своего периода, а не подмножество прошлой", () => {
    const f = monthProd();
    // Подписали в этом месяце: p3, p4, p5 (p1 — февраль, поэтому не здесь).
    expect(f.stages[0].count).toBe(3);
    // Сдали — вообще другие объекты, поэтому сдач может быть больше, чем
    // подписаний, и это не ошибка. Конверсию между стадиями считать нельзя.
    expect(f.stages[2].count).toBeGreaterThan(f.stages[0].count);
    expect(f.flow).toBe(true);
  });

  it("срез «сейчас» отделён от потока и не привязан к периоду", () => {
    const byLabel = Object.fromEntries(monthProd().current.map(r => [r.label, r.count]));
    expect(Object.keys(byLabel)).toEqual(["Сейчас в работе", "Сейчас на паузе", "Расторгнуто всего"]);
    expect(byLabel["Сейчас на паузе"]).toBe(1);        // p3
    expect(byLabel["Расторгнуто всего"]).toBe(1);      // p4
    expect(byLabel["Сейчас в работе"]).toBe(1);        // o1 из базовой базы
  });

  it("список «кого сдали» совпадает со счётчиком — цифру можно проверить глазами", () => {
    const f = monthProd();
    expect(f.doneList.length).toBe(f.stages[2].count);
    expect(f.startedList.length).toBe(f.stages[1].count);
    expect(f.signedList.length).toBe(f.stages[0].count);
  });

  it("расторгнутый объект не считается сданным", () => {
    // У расторгнутого в факт-дате стоит день ПРЕКРАЩЕНИЯ работ, а не сдачи.
    // Если его засчитать, он и в сдачи попадёт, и «сдачу в срок» испортит.
    const f = prodFixture();
    f.objects.push({ id:"pc", clientName:"Расторгли в этом месяце", status:"cancel", createdAt: NOW - 60*DAY });
    f.contracts.push({ id:"cpc", objectId:"pc", number:"№ 106", date: dstr(-20), works:[{quantity:1, price:700000}] });
    f.productions.push({ objectId:"pc", prodStatus:"cancel", startDate: dstr(-18), factEndDate: dstr(-2) });
    const a = buildAnalytics(f, { period: "month", now: NOW });
    expect(a.funnels.production.doneList.map(x => x.id)).not.toContain("pc");
    expect(a.production.doneInPeriod).toBe(4);              // без расторгнутого
    // но расторжение видно отдельной строкой — за период, по той же дате
    expect(a.funnels.production.terminal.label).toBe("Расторгли");
    expect(a.funnels.production.terminal.count).toBe(1);
  });

  it("пустой дубль карточки не отменяет сдачу", () => {
    // Две карточки на один объект: пустой дубль создан позже по порядку в массиве.
    // Раньше побеждала последняя, и объект выглядел несданным.
    const f = prodFixture();
    f.productions.push({ objectId:"p1", prodStatus:"done", updatedAt: 0 });
    const a = buildAnalytics(f, { period: "month", now: NOW });
    expect(a.funnels.production.doneList.map(x => x.id)).toContain("p1");
    const dup = a.dataQuality.gaps.find(g => g.key === "prodDup");
    expect(dup.count).toBe(1);   // и сам дубль показан в «Качестве данных»
  });

  it("во «всё время» попадают все события, включая прошлогодние", () => {
    const allTime = buildAnalytics(prodFixture(), { period: "all", now: NOW }).funnels.production;
    expect(allTime.stages[2].count).toBe(5);           // + p2
  });
});

describe("ноль и «нет данных» — разные вещи", () => {
  // На боевой базе ни у одного сданного объекта не было плановой даты, и «Сдача в
  // срок» показывала 0% — то есть «сорвали все сроки». Пустая выборка обязана
  // возвращать null, чтобы экран нарисовал «—» и написал, чего не хватает.
  const noPlans = () => {
    const f = fixture();
    f.objects.push({ id:"n1", clientName:"Сдан без плановой даты", status:"done", createdAt: NOW - 60*DAY });
    f.productions.push({ objectId:"n1", prodStatus:"done", startDate: dstr(-20), factEndDate: dstr(-2) });
    // у o1 из базовой базы план есть — убираем, чтобы плановых дат не осталось вовсе
    f.productions[0].planEndDate = "";
    return buildAnalytics(f, { period: "month", now: NOW });
  };

  it("«сдача в срок» без плановых дат — null, а не 0%", () => {
    const p = noPlans().production;
    expect(p.doneInPeriod).toBe(1);       // сдача есть
    expect(p.onTimeRate).toBeNull();      // а сравнивать не с чем
    expect(p.onTimeSample).toBe(0);
    expect(p.avgPlanDays).toBeNull();
    expect(p.avgFactDays).toBe(18);       // факт известен: старт -20д, сдача -2д
  });

  it("средний чек не делится на объекты без суммы", () => {
    // На боевой базе из 30 подписанных сумма была известна у 8: остальные — старые
    // объекты без сметы и без договора. Они давали в сумму ноль, но увеличивали
    // знаменатель, и чек занижался вчетверо.
    const f = fixture();
    f.objects.push(
      { id:"z1", clientName:"Подписан, но пусто", status:"signed", createdAt: NOW - 4*DAY },
      { id:"z2", clientName:"И этот тоже",        status:"signed", createdAt: NOW - 4*DAY },
    );
    const { sales } = buildAnalytics(f, { period: "all", now: NOW });
    // сумма известна только у o1 (договор 1 300 000) — чек равен ей, а не трети
    expect(sales.avgCheck).toBe(1300000);
    expect(sales.avgCheckSample).toBe(1);
    expect(sales.signedWithoutValue).toBe(3);      // z1, z2 и миграционный om
    expect(sales.signedSum).toBe(1300000);         // сама сумма не меняется
  });

  it("если сумма не известна ни у кого — чек null, а не 0", () => {
    const f = fixture();
    f.contracts = [];
    f.estimates = [];
    const { sales } = buildAnalytics(f, { period: "all", now: NOW });
    expect(sales.avgCheck).toBeNull();
    expect(sales.avgCheckSample).toBe(0);
  });

  it("«цена за м²» без площадей — null, а не 0 ₸", () => {
    const f = fixture();
    for (const o of f.objects) delete o.area;
    const { sales } = buildAnalytics(f, { period: "all", now: NOW });
    expect(sales.avgPricePerSqm).toBeNull();
    expect(sales.avgPricePerSqmSample).toBe(0);
  });

  it("«срок сделки» без дат — null", () => {
    const f = fixture();
    f.contracts = [];
    f.productions = f.productions.map(p => ({ ...p, saleDate: "" }));
    const { sales } = buildAnalytics(f, { period: "all", now: NOW });
    expect(sales.avgDealDays).toBeNull();
  });

  it("«этапов закрыто» без этапов — null", () => {
    const f = fixture();
    f.productions = f.productions.map(p => ({ ...p, stages: [] }));
    const { production } = buildAnalytics(f, { period: "month", now: NOW });
    expect(production.stagesProgress).toBeNull();
  });

  it("а настоящий ноль остаётся нулём", () => {
    // Этапы есть, но ни один не закрыт — это честные 0%, не «нет данных».
    const { production } = buildAnalytics(fixture(), { period: "month", now: NOW });
    expect(production.stagesTotal).toBeGreaterThan(0);
    expect(production.stagesProgress).toBe(50);   // 1 из 2 этапов закрыт
  });
});

// Главный урок этой серии правок: тесты стояли на «идеальной» базе, где заполнено
// всё, и не ловили целый класс ошибок. В боевой базе половина полей пустая — там
// каждое среднее и каждый процент рискуют показать «0» вместо «нет данных».
// Этот блок проходит ПО ВСЕМ числам модели на пустой базе и требует, чтобы ни один
// показатель-отношение не притворился настоящим нулём.
describe("тощая база — ни один процент не врёт нулём", () => {
  const thin = () => ({
    objects: [
      { id:"t1", clientName:"Подписан, пусто", status:"signed", createdAt: NOW - 5*DAY },
      { id:"t2", clientName:"В работе, пусто", status:"work",   createdAt: NOW - 6*DAY },
      { id:"t3", clientName:"Сдан, пусто",     status:"done",   createdAt: NOW - 7*DAY },
    ],
    estimates: [], contracts: [],
    productions: [
      { objectId:"t2", prodStatus:"active" },
      { objectId:"t3", prodStatus:"done" },
    ],
    financeTx: [], accounts: [],
  });

  // Каждое поле-отношение: как называется и почему на пустой базе оно обязано быть null.
  const RATIOS = [
    ["sales.avgCheck", "нет ни одной суммы"],
    ["sales.avgPricePerSqm", "нет площадей"],
    ["sales.avgDealDays", "нет дат договора"],
    ["production.onTimeRate", "нет плановых дат"],
    ["production.avgPlanDays", "нет плановых дат"],
    ["production.avgFactDays", "нет факт-дат"],
    ["production.stagesProgress", "нет этапов"],
    ["production.avgStartLagDays", "нет дат старта"],
    ["finance.grossMarginPct", "нет выручки"],
    ["finance.marginPct", "нет выручки"],
    ["finance.marginPlanAvg", "нет объектов с планом и фактом"],
    ["finance.marginFactAvg", "нет объектов с планом и фактом"],
    ["quality.handoverPct", "нет чек-листов"],
    ["quality.remarksPerObject", "нет замечаний"],
    ["dataQuality.txWithoutContractPct", "нет операций"],
  ];
  const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

  it.each(RATIOS)("%s → null (%s)", (path) => {
    const a = buildAnalytics(thin(), { period: "month", now: NOW });
    expect(get(a, path)).toBeNull();
  });

  it("конверсия равна null только когда в период НИКТО не зашёл", () => {
    // На тощей базе объекты есть — значит 0% и 100% там честные, а не «нет данных».
    const withCohort = buildAnalytics(thin(), { period: "month", now: NOW }).sales;
    expect(withCohort.newObjects).toBe(3);
    expect(withCohort.convToEstimate).toBe(0);     // зашли, но смет никому не посчитали
    expect(withCohort.convTotal).toBe(100);        // все трое дошли до договора
    // А вот в месяце, где не зашло ни одного объекта, делить не на что.
    const empty = buildAnalytics({ ...thin(), objects: [] }, { period: "month", now: NOW }).sales;
    expect(empty.newObjects).toBe(0);
    expect(empty.convToEstimate).toBeNull();
    expect(empty.convTotal).toBeNull();
  });

  it("а счётчики и суммы остаются нулями — их ноль настоящий", () => {
    const a = buildAnalytics(thin(), { period: "month", now: NOW });
    expect(a.sales.newObjects).toBe(3);
    expect(a.sales.signedSum).toBe(0);
    expect(a.finance.income).toBe(0);
    expect(a.production.overdueObjects).toBe(0);
  });
});

describe("границы периода", () => {
  it("месяц заканчивается КОНЦОМ месяца, а не текущим моментом", () => {
    const b = periodBounds("month", { now: NOW });     // NOW = 15 июня
    expect(new Date(b.to).toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(b.to).toBeGreaterThan(NOW);
  });

  it("у «своего» периода границы владельца не переписываются", () => {
    const b = periodBounds("custom", { from: "2026-01-01", to: "2026-01-31", now: NOW });
    expect(new Date(b.to).toISOString().slice(0, 10)).toBe("2026-01-31");
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

// Ровно тот случай, из-за которого на боевой базе было ТРИ разных числа про одни и
// те же июльские договоры: 3 в воронке продаж, 5 в среднем чеке, 6 в производстве.
describe("«подписано за период» — одно число на весь дашборд", () => {
  const M = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const AUG = new Date("2026-08-15T12:00:00Z").getTime();
  // Три сделки, подписанные в августе: своя (лид августа), чужая (лид мая)
  // и расторгнутая (подписана в августе, потом разорвана).
  const base = () => ({
    objects: [
      { id:"a1", clientName:"Лид августа",   status:"signed", createdAt: Date.UTC(2026,7,3), area:50, manager:"Иван" },
      { id:"a2", clientName:"Лид мая",       status:"work",   createdAt: Date.UTC(2026,4,3), area:50, manager:"Иван" },
      { id:"a3", clientName:"Расторгнутый",  status:"cancel", createdAt: Date.UTC(2026,7,5), area:50, manager:"Иван" },
      { id:"a4", clientName:"Ещё думает",    status:"approval", createdAt: Date.UTC(2026,7,7), area:50, manager:"Иван" },
    ],
    productions: [
      { objectId:"a1", prodStatus:"active", saleDate: M(2026,7,10) },
      { objectId:"a2", prodStatus:"active", saleDate: M(2026,7,12) },
      { objectId:"a3", prodStatus:"cancel", saleDate: M(2026,7,14), factEndDate: M(2026,7,20) },
    ],
    contracts: [
      { id:"c1", objectId:"a1", totalCost: 1000000 },
      { id:"c2", objectId:"a2", totalCost: 2000000 },
      { id:"c3", objectId:"a3", totalCost: 3000000 },
    ],
    estimates: [], financeTx: [],
  });
  const run = () => buildAnalytics(base(), { period:"month", now: AUG });

  it("продажи и производство показывают ОДНО число подписанных", () => {
    const a = run();
    expect(a.sales.cohortFunnel.signedInPeriod.count).toBe(3);
    expect(a.funnels.production.stages[0].count).toBe(3);
  });

  it("расторгнутый договор остаётся подписанным: расторжение — отдельная строка", () => {
    const a = run();
    expect(a.sales.cohortFunnel.signedInPeriod.count).toBe(3);   // a3 внутри
    expect(a.funnels.production.terminal.count).toBe(1);          // и он же в «Расторгли»
    expect(a.sales.signedSum).toBe(6000000);                      // 1 + 2 + 3 млн
  });

  it("когорта считает только своих, а разницу называет вслух", () => {
    const a = run();
    // Зашли в августе: a1, a3, a4 — из них подписали a1 и a3.
    expect(a.sales.cohortFunnel.stages[0].count).toBe(3);
    expect(a.sales.cohortFunnel.stages[2].count).toBe(2);
    // Третий (a2) пришёл в мае — он в «подписано всего», но не в когорте.
    expect(a.sales.cohortFunnel.signedInPeriod.fromEarlier).toBe(1);
  });

  it("средний чек считается по тем же сделкам, что и воронка", () => {
    const a = run();
    expect(a.sales.avgCheckSample).toBe(3);
    expect(a.sales.avgCheck).toBe(2000000);
  });

  it("договор без даты подписания не попадает в месяц и виден в «качестве данных»", () => {
    const data = base();
    data.productions = data.productions.map(p => p.objectId === "a1" ? { ...p, saleDate: "" } : p);
    data.contracts = data.contracts.filter(c => c.objectId !== "a1"); // и в договоре даты нет
    const a = buildAnalytics(data, { period:"month", now: AUG });
    expect(a.sales.cohortFunnel.signedInPeriod.count).toBe(2);       // a1 выпал из августа
    const gap = a.dataQuality.gaps.find(g => g.key === "saleDate");
    expect(gap.count).toBe(1);
    expect(gap.list[0].name).toBe("Лид августа");
  });

  it("во «всё время» подписанные без даты НЕ теряются", () => {
    const data = base();
    data.productions = data.productions.map(p => ({ ...p, saleDate: "" }));
    data.contracts = [];
    const a = buildAnalytics(data, { period:"all", now: AUG });
    expect(a.sales.cohortFunnel.signedInPeriod.count).toBe(3);
    expect(a.funnels.production.stages[0].count).toBe(3);
  });

  it("пустой месяц: конверсий нет, а не «0%»", () => {
    const a = buildAnalytics(base(), { period:"month", now: new Date("2026-12-15T12:00:00Z").getTime() });
    expect(a.sales.cohortFunnel.stages[0].count).toBe(0);
    expect(a.sales.convToEstimate).toBeNull();
    expect(a.sales.convToSigned).toBeNull();
    expect(a.sales.convTotal).toBeNull();
    expect(a.sales.avgCheck).toBeNull();
  });
});

// Опечатка в дате не ломает ничего заметно: объект просто уезжает в чужой месяц и
// тихо портит там «Подписано» и средний чек. Эти проверки ловят её сами.
describe("качество данных — даты, которые противоречат друг другу", () => {
  const AUG = new Date("2026-08-01T12:00:00Z").getTime();
  const day = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  // Пустые пробелы в результат не попадают вовсе — значит «нет строки» и есть «0».
  const gap = (data, key) => buildAnalytics(data, { period: "month", now: AUG })
    .dataQuality.gaps.find(g => g.key === key) || { count: 0, list: [] };
  const one = (prod, obj = {}) => ({
    objects: [{ id: "x", clientName: "Объект", status: "signed", createdAt: Date.UTC(2026, 3, 1), ...obj }],
    productions: [{ objectId: "x", prodStatus: "active", ...prod }],
    contracts: [], estimates: [], financeTx: [],
  });

  it("дата продажи в будущем", () => {
    expect(gap(one({ saleDate: day(2026, 7, 8) }), "saleFuture").count).toBe(1);
    expect(gap(one({ saleDate: day(2026, 7, 1) }), "saleFuture").count).toBe(0);  // сегодня — не будущее
    expect(gap(one({ saleDate: day(2026, 6, 8) }), "saleFuture").count).toBe(0);
  });

  it("вышли на объект раньше, чем подписали", () => {
    const bad = gap(one({ saleDate: day(2026, 7, 8), startDate: day(2026, 3, 8) }), "startBeforeSale");
    expect(bad.count).toBe(1);
    expect(bad.list[0].name).toBe("Объект");
    expect(gap(one({ saleDate: day(2026, 3, 8), startDate: day(2026, 4, 1) }), "startBeforeSale").count).toBe(0);
    // Пустая дата — это другой пробел (saleDate), здесь не ругаемся.
    expect(gap(one({ startDate: day(2026, 4, 1) }), "startBeforeSale").count).toBe(0);
  });

  it("архив из миграции не выкидывает объект из когорты, если он в работе", () => {
    // Сырое object.status="archive" в карточке НЕ видно: кнопки подсвечиваются по
    // производству, объект показывает «В работе». Считаем так же, как показываем.
    const data = one({ prodStatus: "active" }, { status: "archive" });
    const a = buildAnalytics(data, { period: "all", now: AUG });
    expect(a.sales.cohortFunnel.stages[0].count).toBe(1);
    // А настоящий архив (производства нет) из когорты по-прежнему исключается.
    const real = { ...data, productions: [] };
    expect(buildAnalytics(real, { period: "all", now: AUG }).sales.cohortFunnel.stages[0].count).toBe(0);
  });

  it("сдали раньше, чем вышли на объект", () => {
    expect(gap(one({ startDate: day(2026, 2, 26), factEndDate: day(2026, 1, 28) }), "endBeforeStart").count).toBe(1);
    expect(gap(one({ startDate: day(2026, 1, 28), factEndDate: day(2026, 2, 26) }), "endBeforeStart").count).toBe(0);
  });

});

// Клик по строке списка должен открывать объект. У просроченных этапов id составной
// («объект:этап») — по нему объект не находится, поэтому нужна отдельная ссылка.
describe("списки аналитики — по строке можно перейти в объект", () => {
  const NOW2 = new Date("2026-06-15T12:00:00Z").getTime();
  const data = {
    objects: [{ id:"o1", clientName:"Клиент", status:"work", createdAt: NOW2 - 40*DAY }],
    productions: [{ objectId:"o1", prodStatus:"active", responsible:"Пётр",
      stages:[{ id:"s1", name:"Демонтаж", status:"todo", planEnd:"2026-06-01", priceClient:1000 }] }],
    contracts: [], estimates: [], financeTx: [],
  };
  const a = buildAnalytics(data, { period:"all", now: NOW2 });

  it("у просроченного этапа есть отдельная ссылка на объект и вкладка", () => {
    const row = a.production.overdueStageList[0];
    expect(row.id).toBe("o1:s1");        // ключ строки остаётся составным
    expect(row.objectId).toBe("o1");      // а переход идёт по объекту
    expect(row.stageTab).toBe("stages");
  });

  it("в остальных списках id — это сам объект", () => {
    for (const list of [a.sales.cohortList, a.funnels.production.signedList, a.dataQuality.gaps[0]?.list || []]) {
      for (const row of list) expect(row.id).toBe("o1");
    }
  });
});

// App-овский fmt показывает «—» для всего, что не больше нуля. Для остатка на счёте это
// ложь: минус — это долг, а не «нет данных». На боевой было «Наличные −201 868 ₸» в
// Финансах и «— ₸» в аналитике на той же самой цифре.
describe("деньги на экране — минус это минус, а не прочерк", () => {
  // Intl разделяет разряды неразрывным пробелом — сравниваем, приведя пробелы к обычным.
  const m = (v, o) => formatTenge(v, o).replace(/\s/g, " ");

  it("отрицательные показываются числом со знаком", () => {
    expect(m(-201868)).toBe("−201 868 ₸");
    expect(m(-52400)).toBe("−52 400 ₸");
  });

  it("ноль — это «0 ₸», а не прочерк: прочерк читается как пробел в данных", () => {
    expect(m(0)).toBe("0 ₸");
    expect(m(null)).toBe("0 ₸");
    expect(m(undefined)).toBe("0 ₸");
  });

  it("положительные и тысячи", () => {
    expect(m(789552)).toBe("789 552 ₸");
    expect(m(789552, { thousands: true })).toBe("790k ₸");
    expect(m(-201868, { thousands: true })).toBe("−202k ₸");
  });

  it("минус, округляющийся до нуля, знака не получает", () => {
    expect(m(-0.4)).toBe("0 ₸");
    expect(m(-400, { thousands: true })).toBe("0k ₸");
  });
});
