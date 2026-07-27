import { describe, it, expect } from "vitest";
import {
  buildAnalytics, periodBounds, deltaPct, contractSum, ts,
  REFUSE_REASONS, refuseReasonLabel, ANALYTICS_BLOCKS,
} from "./analyticsModel.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const dstr = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);

// Небольшая, но «полная» база: объекты на разных стадиях, сметы, договор,
// производство с этапами и замечаниями, транзакции.
const fixture = () => ({
  objects: [
    { id:"o1", clientName:"Клиент 1", status:"signed", createdAt: NOW - 20*DAY, area:50, objType:"Квартира", manager:"Иван" },
    { id:"o2", clientName:"Клиент 2", status:"approval", createdAt: NOW - 10*DAY, area:80, objType:"Квартира", manager:"Иван" },
    { id:"o3", clientName:"Клиент 3", status:"refuse", createdAt: NOW - 5*DAY, refuseReason:"price", manager:"Пётр" },
    { id:"o4", clientName:"Клиент 4", status:"new", createdAt: NOW - 2*DAY, manager:"Пётр" },
    { id:"od", clientName:"Удалённый", status:"signed", createdAt: NOW - 3*DAY, deletedAt: NOW },
  ],
  estimates: [
    { id:"e1", objectId:"o1", total:1000000, cost:600000 },
    { id:"e1b", objectId:"o1", total:200000, cost:120000 },   // доп.смета — суммируется
    { id:"e2", objectId:"o2", total:800000, cost:500000 },
    { id:"e3", objectId:"o3", total:300000, cost:200000 },
  ],
  contracts: [
    { id:"c1", objectId:"o1", number:"№ 12", date: dstr(-15), works:[{quantity:1, price:1200000}] },
  ],
  productions: [
    { objectId:"o1", prodStatus:"active", responsible:"Прораб А",
      startDate: dstr(-14), planEndDate: dstr(-1), // план-финиш вчера → просрочка
      stages:[
        { id:"s1", name:"Демонтаж", status:"done", planEnd: dstr(-10), priceClient:400000, costPlan:250000, paid:false },
        { id:"s2", name:"Стяжка", status:"todo", planEnd: dstr(-2), priceClient:800000, costPlan:500000 },
      ],
      defects:[
        { id:"d1", text:"Скол", source:"client", ts: NOW - 9*DAY, done:true, doneAt: NOW - 7*DAY },
        { id:"d2", text:"Грязь", source:"client", ts: NOW - 3*DAY, done:false },
      ],
      checklistHandover:[{ id:"h1", done:true }, { id:"h2", done:false }],
    },
  ],
  financeTx: [
    { id:"t1", type:"income",  amount:700000, date: dstr(-8),  contractNo:"№12" },
    { id:"t2", type:"expense", amount:300000, date: dstr(-6),  contractNo:"№ 12", category:"Материалы" },
    { id:"t3", type:"expense", amount:100000, date: dstr(-4),  contractNo:"№12", category:"Зарплата" },
    { id:"t4", type:"income",  amount:999,    date: dstr(-4),  contractNo:"№12", deletedAt: NOW },   // удалена
    { id:"t5", type:"income",  amount:888,    date: dstr(-4),  contractNo:"№12", included:false },   // исключена
  ],
});

describe("аналитика — период и сравнение", () => {
  it("считает границы периода и зеркальный предыдущий", () => {
    const b = periodBounds("month", { now: NOW });
    expect(b.to).toBe(NOW);
    expect(b.from).toBe(NOW - 30 * DAY);
    expect(b.prevTo).toBe(b.from);
    expect(b.prevFrom).toBe(b.from - 30 * DAY);
  });

  it("для «всё время» предыдущего периода нет", () => {
    const b = periodBounds("all", { now: NOW });
    expect(b.prevFrom).toBeNull();
    expect(b.prevTo).toBeNull();
  });

  it("дельта: считает процент, но не делит на ноль", () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    expect(deltaPct(50, 0)).toBeNull();
    expect(deltaPct(50, null)).toBeNull();
  });

  it("ts понимает и миллисекунды, и строку даты", () => {
    expect(ts(NOW)).toBe(NOW);
    expect(ts("2026-06-15")).toBe(new Date("2026-06-15").getTime());
    expect(ts("")).toBe(0);
    expect(ts(null)).toBe(0);
  });
});

describe("аналитика — продажи и воронка", () => {
  const { sales } = buildAnalytics(fixture(), { period: "month", now: NOW });

  it("удалённые объекты не попадают в когорту", () => {
    expect(sales.newObjects).toBe(4);
  });

  it("стоимость объекта = сумма всех его смет, включая допы", () => {
    // o1 = 1 000 000 + 200 000
    expect(sales.signedSum).toBe(1200000);
  });

  it("считает конверсию по шагам", () => {
    expect(sales.estimatedCount).toBe(3);          // o1, o2, o3 со сметами
    expect(sales.signedCount).toBe(1);
    expect(sales.convToEstimate).toBe(75);         // 3 из 4
    expect(sales.convToSigned).toBe(33);           // 1 из 3
    expect(sales.convTotal).toBe(25);              // 1 из 4
  });

  it("считает потери с причиной отказа", () => {
    expect(sales.lostCount).toBe(1);
    expect(sales.lostSum).toBe(300000);
    expect(sales.lostByReason.price).toEqual({ count: 1, sum: 300000 });
  });

  it("считает срок сделки и цену за м²", () => {
    expect(sales.avgDealDays).toBe(5);             // создан -20д, договор -15д
    expect(sales.avgPricePerSqm).toBe(24000);      // 1 200 000 / 50
  });

  it("разбивает по менеджерам", () => {
    expect(sales.byManager["Иван"]).toMatchObject({ objects: 2, signed: 1, signedSum: 1200000 });
    expect(sales.byManager["Пётр"].objects).toBe(2);
  });
});

describe("аналитика — производство и сроки", () => {
  const { production } = buildAnalytics(fixture(), { period: "month", now: NOW });

  it("видит просроченный объект и считает дни", () => {
    expect(production.inWork).toBe(1);
    expect(production.overdueObjects).toBe(1);
    expect(production.overdueAvgDays).toBe(1);
  });

  it("считает прогресс и просроченные этапы", () => {
    expect(production.stagesProgress).toBe(50);    // 1 из 2 закрыт
    expect(production.overdueStages).toBe(1);      // s2 просрочен
  });

  it("показывает неоплаченные закрытые этапы (долг бригадам)", () => {
    expect(production.unpaidDoneStages).toBe(1);
    expect(production.unpaidDoneSum).toBe(250000);
  });
});

describe("аналитика — финансы", () => {
  const { finance } = buildAnalytics(fixture(), { period: "month", now: NOW });

  it("не учитывает удалённые и исключённые операции", () => {
    expect(finance.income).toBe(700000);
    expect(finance.expense).toBe(400000);
    expect(finance.gross).toBe(300000);
  });

  it("считает маржу и расходы по категориям", () => {
    expect(finance.marginPct).toBe(43);
    expect(finance.expenseByCategory).toEqual({ "Материалы": 300000, "Зарплата": 100000 });
  });

  it("считает дебиторку по договору, номер сверяется без № и пробелов", () => {
    // договор 1 200 000, получено 700 000
    expect(finance.receivables).toBe(500000);
    expect(finance.receivablesOverdue).toBe(500000); // план-финиш прошёл
  });

  it("считает перерасход к плановой себестоимости сметы", () => {
    // план себестоимости o1 = 600 000 + 120 000 = 720 000, факт расход 400 000 → перерасхода нет
    expect(finance.overspendObjects).toEqual([]);
    expect(finance.topProfitable[0]).toMatchObject({ objectId: "o1", profit: 300000 });
  });
});

describe("аналитика — портфель и качество", () => {
  const { backlog, quality } = buildAnalytics(fixture(), { period: "month", now: NOW });

  it("портфель: законтрактовано, выполнено и остаток", () => {
    expect(backlog.activeObjects).toBe(1);
    expect(backlog.contracted).toBe(1200000);
    expect(backlog.doneValue).toBe(400000);
    expect(backlog.remaining).toBe(800000);
    expect(backlog.byForeman["Прораб А"]).toMatchObject({ objects: 1 });
  });

  it("качество: открытые замечания и срок закрытия", () => {
    expect(quality.openRemarks).toBe(1);
    expect(quality.closedInPeriod).toBe(1);
    expect(quality.fromClient).toBe(2);
    expect(quality.avgCloseDays).toBe(2);
    expect(quality.handoverPct).toBe(50);
  });
});

describe("аналитика — служебное", () => {
  it("сумма договора: работы важнее, затем цена за м², затем итог", () => {
    expect(contractSum({ works:[{quantity:2, price:100}] })).toBe(200);
    expect(contractSum({ priceType:"sqm", pricePerSqm:1000, area:50 })).toBe(50000);
    expect(contractSum({ totalCost:777 })).toBe(777);
    expect(contractSum(null)).toBe(0);
  });

  it("у каждого блока есть своё право доступа", () => {
    expect(ANALYTICS_BLOCKS.map(b => b.permission)).toEqual([
      "analyticsSales", "analyticsBacklog", "analyticsProduction", "analyticsFinance", "analyticsQuality",
    ]);
  });

  it("причина отказа: известная и неизвестная", () => {
    expect(refuseReasonLabel("price")).toBe("Дорого");
    expect(refuseReasonLabel("нет такой")).toBe("Не указана");
    expect(REFUSE_REASONS.length).toBeGreaterThan(3);
  });

  it("предыдущий период считается для сравнения", () => {
    const res = buildAnalytics(fixture(), { period: "month", now: NOW });
    expect(res.previous).not.toBeNull();
    expect(res.previous.sales.newObjects).toBe(0);   // всё создано внутри текущего окна
    const all = buildAnalytics(fixture(), { period: "all", now: NOW });
    expect(all.previous).toBeNull();
  });
});
