// ─── Аналитика: чистая считающая модель ───────────────────────────────────────
// Здесь НЕТ React и НЕТ обращений к хранилищу: на вход — уже загруженные массивы,
// на выход — числа. Поэтому блоки покрываются тестами и одинаково считаются
// и на экране «Аналитика», и на «Главной».
//
// Единица учёта — ОБЪЕКТ (сделка). Стоимость объекта = сумма всех его смет
// (основная + допы) — та же модель, что уже была в аналитике, чтобы цифры сходились.

// Причины отказа: фиксированный список, чтобы аналитика группировалась, а не
// собирала свободный текст. Ключ хранится в объекте (o.refuseReason).
export const REFUSE_REASONS = Object.freeze([
  { key: "price",       label: "Дорого" },
  { key: "competitor",  label: "Выбрали других" },
  { key: "terms",       label: "Не устроили сроки" },
  { key: "postponed",   label: "Отложили ремонт" },
  { key: "noAnswer",    label: "Пропал / не отвечает" },
  { key: "scope",       label: "Не наш профиль" },
  { key: "other",       label: "Другое" },
]);

export const refuseReasonLabel = (key) =>
  REFUSE_REASONS.find(r => r.key === key)?.label || "Не указана";

// Блоки аналитики: id ↔ право доступа. Используется и для отрисовки, и для проверки прав,
// поэтому новый блок достаточно описать здесь одной строкой.
export const ANALYTICS_BLOCKS = Object.freeze([
  { id: "sales",      label: "Продажи и воронка", icon: "🎯", permission: "analyticsSales" },
  { id: "backlog",    label: "Портфель заказов",  icon: "📦", permission: "analyticsBacklog" },
  { id: "production", label: "Производство и сроки", icon: "🔨", permission: "analyticsProduction" },
  { id: "finance",    label: "Финансы",           icon: "💰", permission: "analyticsFinance" },
  { id: "quality",    label: "Качество и клиент", icon: "⭐", permission: "analyticsQuality" },
]);

const DAY_MS = 24 * 60 * 60 * 1000;

// Даты в базе живут в двух видах: миллисекунды (createdAt) и строка «ГГГГ-ММ-ДД»
// (сроки этапов, дата договора). Приводим к числу одинаково во всех расчётах.
export function ts(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const days = (fromTs, toTs) => Math.round((toTs - fromTs) / DAY_MS);
// Для просрочки округляем ВНИЗ: пока не прошли полные сутки после плановой даты,
// это ещё «0 дней», а сутки с небольшим — «1 день», а не «2».
const daysFull = (fromTs, toTs) => Math.max(0, Math.floor((toTs - fromTs) / DAY_MS));
const monthKey = (value) => {
  const t = ts(value);
  if (!t) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Границы периода + ЗЕРКАЛЬНЫЙ предыдущий период такой же длины (для сравнения ↑/↓).
export function periodBounds(period, { from, to, now = Date.now() } = {}) {
  const end = ts(to) || now;
  let start;
  if (period === "week") start = end - 7 * DAY_MS;
  else if (period === "month") start = end - 30 * DAY_MS;
  else if (period === "3month") start = end - 90 * DAY_MS;
  else if (period === "custom") start = ts(from) || 0;
  else start = 0; // «всё время»
  const length = Math.max(0, end - start);
  return {
    from: start,
    to: end,
    // Для «всего времени» сравнивать не с чем — предыдущего окна нет.
    prevFrom: period === "all" || !length ? null : start - length,
    prevTo: period === "all" || !length ? null : start,
  };
}

const inRange = (value, from, to) => {
  const t = ts(value);
  if (!t) return false;
  return t >= from && t <= to;
};

// ─── Подготовка индексов (делается один раз на расчёт) ────────────────────────
function buildIndex({ objects = [], estimates = [], contracts = [], productions = [], financeTx = [], estimateCost }) {
  const liveObjects = objects.filter(o => o && !o.deletedAt);
  const objectIds = new Set(liveObjects.map(o => o.id));

  const estByObject = new Map();
  for (const e of estimates) {
    if (!e || e.deletedAt || !e.objectId || !objectIds.has(e.objectId)) continue;
    if (!estByObject.has(e.objectId)) estByObject.set(e.objectId, []);
    estByObject.get(e.objectId).push(e);
  }
  const prodByObject = new Map();
  for (const p of productions) {
    if (p && p.objectId) prodByObject.set(p.objectId, p);
  }
  const contractByObject = new Map();
  for (const c of contracts) {
    if (!c || c.deletedAt || !c.objectId) continue;
    // Основным считаем договор с наибольшей суммой — он и есть контракт объекта.
    const prev = contractByObject.get(c.objectId);
    if (!prev || contractSum(c) > contractSum(prev)) contractByObject.set(c.objectId, c);
  }

  const objectValue = (o) => (estByObject.get(o.id) || []).reduce((s, e) => s + num(e.total), 0);
  const objectCost = (o) => (estByObject.get(o.id) || []).reduce(
    (s, e) => s + (typeof estimateCost === "function" ? num(estimateCost(e)) : num(e.cost)),
    0,
  );

  return { liveObjects, estByObject, prodByObject, contractByObject, objectValue, objectCost };
}

export function contractSum(c) {
  const works = (c?.works || []).reduce((s, w) => s + num(w.quantity) * num(w.price), 0);
  if (works) return works;
  if (c?.priceType === "sqm") return Math.round(num(c.pricePerSqm) * num(c.area));
  return num(c?.totalCost);
}

// Единый статус объекта: карточка производства перевешивает статус сделки —
// та же логика, что в unifiedStatusOf, иначе цифры разойдутся с экраном объектов.
const PROD_TO_DEAL = { active: "work", paused: "paused", done: "done", cancel: "cancel" };
function statusOf(o, prodByObject) {
  const prod = prodByObject.get(o.id);
  return PROD_TO_DEAL[prod?.prodStatus] || o.status || "new";
}

// ─── БЛОК 1. Продажи и воронка ───────────────────────────────────────────────
function buildSales(idx, { from, to }, manager) {
  const { liveObjects, objectValue, contractByObject, prodByObject } = idx;
  const cohort = liveObjects
    .filter(o => o.status !== "archive")
    .filter(o => !manager || (o.manager || "") === manager)
    .filter(o => inRange(o.createdAt, from, to));

  const withEstimate = cohort.filter(o => objectValue(o) > 0);
  const signed = cohort.filter(o => ["signed", "work", "done", "paused"].includes(statusOf(o, prodByObject)));
  const inApproval = cohort.filter(o => statusOf(o, prodByObject) === "approval");
  const lost = cohort.filter(o => ["refuse", "cancel"].includes(statusOf(o, prodByObject)));

  const estimatedSum = withEstimate.reduce((s, o) => s + objectValue(o), 0);
  const signedSum = signed.reduce((s, o) => s + objectValue(o), 0);
  const lostSum = lost.reduce((s, o) => s + objectValue(o), 0);

  // Срок сделки: от создания объекта до даты договора. Считаем только там,
  // где обе даты есть, иначе среднее врёт.
  const dealDays = [];
  for (const o of signed) {
    const contract = contractByObject.get(o.id);
    const signedAt = ts(contract?.date || contract?.contractDate);
    const createdAt = ts(o.createdAt);
    if (signedAt && createdAt && signedAt >= createdAt) dealDays.push(days(createdAt, signedAt));
  }

  // Цена за м² — только по подписанным с указанной площадью.
  const sqmPrices = signed
    .filter(o => num(o.area) > 0 && objectValue(o) > 0)
    .map(o => objectValue(o) / num(o.area));

  const lostByReason = {};
  for (const o of lost) {
    const key = o.refuseReason || "unknown";
    if (!lostByReason[key]) lostByReason[key] = { count: 0, sum: 0 };
    lostByReason[key].count += 1;
    lostByReason[key].sum += objectValue(o);
  }

  const byManager = {};
  for (const o of cohort) {
    const key = o.manager || "Без менеджера";
    if (!byManager[key]) byManager[key] = { objects: 0, estimated: 0, signed: 0, signedSum: 0 };
    byManager[key].objects += 1;
    if (objectValue(o) > 0) byManager[key].estimated += 1;
    if (signed.includes(o)) { byManager[key].signed += 1; byManager[key].signedSum += objectValue(o); }
  }

  const byType = {};
  for (const o of cohort) {
    const key = o.objType || "—";
    if (!byType[key]) byType[key] = { objects: 0, sum: 0 };
    byType[key].objects += 1;
    byType[key].sum += objectValue(o);
  }

  return {
    newObjects: cohort.length,
    estimatedCount: withEstimate.length,
    estimatedSum,
    inApprovalCount: inApproval.length,
    inApprovalSum: inApproval.reduce((s, o) => s + objectValue(o), 0),
    signedCount: signed.length,
    signedSum,
    avgCheck: signed.length ? Math.round(signedSum / signed.length) : 0,
    // Воронка по шагам: сколько дошло от предыдущего этапа.
    convToEstimate: pct(withEstimate.length, cohort.length),
    convToSigned: pct(signed.length, withEstimate.length),
    convTotal: pct(signed.length, cohort.length),
    avgDealDays: dealDays.length ? Math.round(dealDays.reduce((s, d) => s + d, 0) / dealDays.length) : 0,
    lostCount: lost.length,
    lostSum,
    lostByReason,
    avgPricePerSqm: sqmPrices.length
      ? Math.round(sqmPrices.reduce((s, v) => s + v, 0) / sqmPrices.length)
      : 0,
    byManager,
    byType,
  };
}

// ─── БЛОК 2. Портфель заказов (состояние «сейчас», период не применяется) ─────
function buildBacklog(idx, { now }) {
  const { liveObjects, objectValue, prodByObject } = idx;
  const active = liveObjects.filter(o => ["signed", "work", "paused"].includes(statusOf(o, prodByObject)));

  const contracted = active.reduce((s, o) => s + objectValue(o), 0);
  // Выполнено по этапам: доля закрытых этапов от суммы этапов объекта.
  let doneValue = 0;
  for (const o of active) {
    const stages = prodByObject.get(o.id)?.stages || [];
    const total = stages.reduce((s, st) => s + num(st.priceClient), 0);
    if (total <= 0) continue;
    doneValue += stages
      .filter(st => st.status === "done")
      .reduce((s, st) => s + num(st.priceClient), 0);
  }

  const byForeman = {};
  for (const o of active) {
    const key = prodByObject.get(o.id)?.responsible || "Не назначен";
    if (!byForeman[key]) byForeman[key] = { objects: 0, sum: 0 };
    byForeman[key].objects += 1;
    byForeman[key].sum += objectValue(o);
  }

  // Прогноз закрытия: объекты с план-финишем в текущем месяце.
  const thisMonth = monthKey(now);
  const closingThisMonth = active.filter(o => monthKey(prodByObject.get(o.id)?.planEndDate) === thisMonth);

  return {
    activeObjects: active.length,
    contracted,
    doneValue,
    remaining: Math.max(0, contracted - doneValue),
    byForeman,
    closingThisMonthCount: closingThisMonth.length,
    closingThisMonthSum: closingThisMonth.reduce((s, o) => s + objectValue(o), 0),
  };
}

// ─── БЛОК 3. Производство и сроки ────────────────────────────────────────────
function buildProduction(idx, { from, to, now }) {
  const { liveObjects, prodByObject } = idx;
  const byStatus = { work: 0, paused: 0, done: 0 };
  let overdueObjects = 0;
  let overdueDaysTotal = 0;
  let overdueMaxDays = 0;
  let stagesTotal = 0;
  let stagesDone = 0;
  let overdueStages = 0;
  let unpaidDoneStages = 0;
  let unpaidDoneSum = 0;
  const planFact = [];

  for (const o of liveObjects) {
    const status = statusOf(o, prodByObject);
    if (byStatus[status] !== undefined) byStatus[status] += 1;
    const prod = prodByObject.get(o.id);
    if (!prod) continue;

    const planEnd = ts(prod.planEndDate);
    const factEnd = ts(prod.factEndDate);

    // Просрочка — только у незакрытых объектов с проставленным план-финишем.
    if (planEnd && !factEnd && status !== "done" && planEnd < now) {
      const late = daysFull(planEnd, now);
      overdueObjects += 1;
      overdueDaysTotal += late;
      overdueMaxDays = Math.max(overdueMaxDays, late);
    }
    // План/факт длительности — по сданным в периоде.
    if (factEnd && inRange(prod.factEndDate, from, to)) {
      const start = ts(prod.startDate);
      planFact.push({
        onTime: planEnd ? factEnd <= planEnd : null,
        planDays: start && planEnd ? days(start, planEnd) : null,
        factDays: start ? days(start, factEnd) : null,
      });
    }
    for (const st of prod.stages || []) {
      if (status !== "work" && status !== "paused") continue;
      stagesTotal += 1;
      if (st.status === "done") {
        stagesDone += 1;
        if (!st.paid) { unpaidDoneStages += 1; unpaidDoneSum += num(st.costPlan); }
      } else if (ts(st.planEnd) && ts(st.planEnd) < now) {
        overdueStages += 1;
      }
    }
  }

  const closedInPeriod = planFact.length;
  const onTime = planFact.filter(x => x.onTime === true).length;
  const withPlan = planFact.filter(x => x.onTime !== null).length;
  const planDaysArr = planFact.map(x => x.planDays).filter(v => Number.isFinite(v) && v > 0);
  const factDaysArr = planFact.map(x => x.factDays).filter(v => Number.isFinite(v) && v > 0);

  return {
    inWork: byStatus.work,
    paused: byStatus.paused,
    doneInPeriod: closedInPeriod,
    overdueObjects,
    overdueAvgDays: overdueObjects ? Math.round(overdueDaysTotal / overdueObjects) : 0,
    overdueMaxDays,
    onTimeRate: pct(onTime, withPlan),
    avgPlanDays: planDaysArr.length ? Math.round(planDaysArr.reduce((s, v) => s + v, 0) / planDaysArr.length) : 0,
    avgFactDays: factDaysArr.length ? Math.round(factDaysArr.reduce((s, v) => s + v, 0) / factDaysArr.length) : 0,
    stagesProgress: pct(stagesDone, stagesTotal),
    overdueStages,
    unpaidDoneStages,
    unpaidDoneSum,
  };
}

// ─── БЛОК 4. Финансы (факт — из транзакций, привязка по номеру договора) ─────
const normContract = (v) => String(v || "").replace(/[№#\s]/g, "").toLowerCase();

function buildFinance(idx, { from, to, now }, financeTx) {
  const { liveObjects, objectValue, objectCost, contractByObject, prodByObject } = idx;
  const live = financeTx.filter(t => t && !t.deletedAt && t.included !== false);
  const inPeriod = live.filter(t => inRange(t.date, from, to));

  let income = 0;
  let expense = 0;
  const expenseByCategory = {};
  const cashflow = {};
  for (const t of inPeriod) {
    const amount = num(t.amount);
    const mk = monthKey(t.date);
    if (!cashflow[mk]) cashflow[mk] = { income: 0, expense: 0 };
    if (t.type === "income") { income += amount; cashflow[mk].income += amount; }
    else if (t.type === "expense") {
      expense += amount;
      cashflow[mk].expense += amount;
      const cat = t.category || "Без категории";
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amount;
    }
  }

  // Факт по объектам: приход/расход собираем по номеру договора объекта.
  const factByContract = {};
  for (const t of live) {
    const cn = normContract(t.contractNo);
    if (!cn) continue;
    if (!factByContract[cn]) factByContract[cn] = { income: 0, expense: 0 };
    if (t.type === "income") factByContract[cn].income += num(t.amount);
    else if (t.type === "expense") factByContract[cn].expense += num(t.amount);
  }

  const activeObjects = liveObjects.filter(o => ["signed", "work", "paused", "done"].includes(statusOf(o, prodByObject)));
  let receivables = 0;
  let receivablesOverdue = 0;
  const objectProfit = [];
  for (const o of activeObjects) {
    const contract = contractByObject.get(o.id);
    const planValue = contractSum(contract) || objectValue(o);
    if (planValue <= 0) continue;
    const fact = factByContract[normContract(contract?.number)] || { income: 0, expense: 0 };
    const debt = Math.max(0, planValue - fact.income);
    receivables += debt;
    // Просроченной считаем дебиторку по объектам, у которых план-финиш уже прошёл.
    const planEnd = ts(prodByObject.get(o.id)?.planEndDate);
    if (debt > 0 && planEnd && planEnd < now) receivablesOverdue += debt;

    const planCost = objectCost(o);
    objectProfit.push({
      objectId: o.id,
      name: o.clientName || o.address || "Без названия",
      planValue,
      planCost,
      factIncome: fact.income,
      factExpense: fact.expense,
      // Перерасход: сколько потратили сверх плановой себестоимости по смете.
      overspend: planCost > 0 ? fact.expense - planCost : 0,
      profit: fact.income - fact.expense,
    });
  }
  objectProfit.sort((a, b) => b.profit - a.profit);

  return {
    income,
    expense,
    gross: income - expense,
    marginPct: pct(income - expense, income),
    cashflow,
    expenseByCategory,
    receivables,
    receivablesOverdue,
    topProfitable: objectProfit.slice(0, 5),
    topLoss: objectProfit.filter(x => x.profit < 0).slice(-5).reverse(),
    overspendObjects: objectProfit.filter(x => x.overspend > 0).sort((a, b) => b.overspend - a.overspend).slice(0, 5),
  };
}

// ─── БЛОК 5. Качество и клиент ───────────────────────────────────────────────
function buildQuality(idx, { from, to }) {
  const { liveObjects, prodByObject } = idx;
  let open = 0;
  let closedInPeriod = 0;
  let fromClient = 0;
  let objectsWithRemarks = 0;
  const closeDays = [];
  let handoverDone = 0;
  let handoverTotal = 0;

  for (const o of liveObjects) {
    const prod = prodByObject.get(o.id);
    if (!prod) continue;
    const defects = prod.defects || [];
    if (defects.length) objectsWithRemarks += 1;
    for (const d of defects) {
      if (!d) continue;
      if (d.source === "client") fromClient += 1;
      if (d.done) {
        if (inRange(d.doneAt || d.updatedAt, from, to)) closedInPeriod += 1;
        const opened = ts(d.ts);
        const closed = ts(d.doneAt || d.updatedAt);
        if (opened && closed && closed >= opened) closeDays.push(days(opened, closed));
      } else {
        open += 1;
      }
    }
    const handover = prod.checklistHandover || [];
    if (handover.length) {
      handoverTotal += handover.length;
      handoverDone += handover.filter(i => i?.done).length;
    }
  }

  return {
    openRemarks: open,
    closedInPeriod,
    fromClient,
    avgCloseDays: closeDays.length ? Math.round(closeDays.reduce((s, v) => s + v, 0) / closeDays.length) : 0,
    remarksPerObject: objectsWithRemarks
      ? Math.round(((open + closedInPeriod) / objectsWithRemarks) * 10) / 10
      : 0,
    handoverPct: pct(handoverDone, handoverTotal),
  };
}

// ─── Главная точка входа ─────────────────────────────────────────────────────
export function buildAnalytics(data = {}, options = {}) {
  const { period = "all", from, to, now = Date.now(), manager = "" } = options;
  const bounds = periodBounds(period, { from, to, now });
  const idx = buildIndex(data);
  const financeTx = data.financeTx || [];

  const current = {
    sales: buildSales(idx, bounds, manager),
    backlog: buildBacklog(idx, { now }),
    production: buildProduction(idx, { ...bounds, now }),
    finance: buildFinance(idx, { ...bounds, now }, financeTx),
    quality: buildQuality(idx, bounds),
  };

  // Сравнение с предыдущим периодом такой же длины. «Портфель» — состояние на
  // сейчас, его сравнивать не с чем, поэтому в дельты не попадает.
  let previous = null;
  if (bounds.prevFrom !== null) {
    const prevBounds = { from: bounds.prevFrom, to: bounds.prevTo };
    previous = {
      sales: buildSales(idx, prevBounds, manager),
      production: buildProduction(idx, { ...prevBounds, now }),
      finance: buildFinance(idx, { ...prevBounds, now }, financeTx),
      quality: buildQuality(idx, prevBounds),
    };
  }

  return { ...current, previous, bounds };
}

// Дельта в процентах для стрелочки ↑/↓. null — когда сравнивать не с чем
// (нет предыдущего периода или в нём был ноль: рост «с нуля» в процентах бессмыслен).
export function deltaPct(current, previous) {
  const c = num(current);
  const p = num(previous);
  if (previous === null || previous === undefined || p === 0) return null;
  return Math.round(((c - p) / Math.abs(p)) * 100);
}
