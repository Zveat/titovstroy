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
  { id: "cash",       label: "Деньги",           icon: "🏦", permission: "analyticsFinance" },
  { id: "dataQuality",label: "Качество данных",  icon: "🧹", permission: "analyticsQuality" },
]);

const DAY_MS = 24 * 60 * 60 * 1000;
// Сколько дней без правок считаем «объект забыли».
const STALE_DAYS = 14;

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

// Границы периода + предыдущий период для сравнения ↑/↓.
// ВАЖНО: границы обязаны совпадать с теми, что считает экран «Аналитика» для старых
// плиток (месяц = с 1-го числа, 3 месяца = с 1-го числа минус 2 месяца, неделя =
// последние 7 дней). Иначе один и тот же показатель на одном экране покажет два
// разных числа — на этом уже обожглись.
export function periodBounds(period, { from, to, now = Date.now() } = {}) {
  const nowDate = new Date(now);
  let start = 0;
  let end = now;
  let prevFrom = null;
  let prevTo = null;

  if (period === "custom") {
    start = ts(from) || 0;
    end = ts(to) || now;
    const length = Math.max(0, end - start);
    if (length) { prevFrom = start - length; prevTo = start; }
  } else if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    start = d.getTime();
    prevFrom = start - 7 * DAY_MS;
    prevTo = start;
  } else if (period === "month" || period === "3month") {
    const year = nowDate.getUTCFullYear();
    const month = nowDate.getUTCMonth();
    const span = period === "3month" ? 3 : 1;
    start = Date.UTC(year, month - (span - 1), 1);
    // Верхняя граница — КОНЕЦ месяца, а не «сейчас». Иначе объект, сданный
    // 30 числа, 28-го в «сдано за месяц» не попадал: дата в будущем относительно
    // текущего момента, хотя месяц тот же. То же самое с операциями и стартами.
    end = Date.UTC(year, month + 1, 1) - 1;
    // Предыдущий период — столько же КАЛЕНДАРНЫХ месяцев перед началом текущего.
    prevFrom = Date.UTC(year, month - (span - 1) - span, 1);
    prevTo = start;
  } else {
    // «Всё время» — значит всё: верхнюю границу не ставим вообще. Иначе объект с
    // датой сдачи вперёд по календарю не попадал даже сюда.
    end = Number.MAX_SAFE_INTEGER;
  }
  // Дата без времени («2026-07-28») парсится в полночь. Если верхняя граница —
  // «сейчас», то всё, что помечено сегодняшним днём, но позже текущего часа,
  // выпадало бы из периода. Поэтому минимум — конец текущих суток. У «своего»
  // периода границы задаёт владелец, их не трогаем.
  if (period !== "custom") {
    const endOfToday = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() + 1) - 1;
    if (end < endOfToday) end = endOfToday;
  }
  // «Всё время» — сравнивать не с чем, prevFrom/prevTo остаются null.
  return { from: start, to: end, prevFrom, prevTo };
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

  // Смета может быть привязана к объекту напрямую (objectId) ИЛИ висеть на родителе
  // через parentId — так заводятся доп. сметы. Если считать только по objectId,
  // допы теряются и объект стоит дешевле, чем в финансах (там связка по родителю).
  // Поднимаемся по цепочке родителей до сметы, у которой objectId есть.
  const liveEstimates = (estimates || []).filter(e => e && !e.deletedAt);
  const estById = new Map(liveEstimates.filter(e => e.id).map(e => [e.id, e]));
  const ownerCache = new Map();
  const ownerObjectOf = (estimate) => {
    let current = estimate;
    const seen = new Set();
    const chain = [];
    while (current) {
      if (current.objectId) break;
      if (!current.id || seen.has(current.id)) { current = null; break; }
      seen.add(current.id);
      if (ownerCache.has(current.id)) { current = { objectId: ownerCache.get(current.id) }; break; }
      chain.push(current.id);
      current = current.parentId ? estById.get(current.parentId) : null;
    }
    const objectId = current?.objectId || "";
    for (const id of chain) ownerCache.set(id, objectId);
    return objectId;
  };

  const estByObject = new Map();
  for (const e of liveEstimates) {
    const objectId = ownerObjectOf(e);
    if (!objectId || !objectIds.has(objectId)) continue;
    if (!estByObject.has(objectId)) estByObject.set(objectId, []);
    estByObject.get(objectId).push(e);
  }
  // Карточек производства на один объект может оказаться несколько (гонка создания на
  // двух устройствах). Раньше побеждала просто ПОСЛЕДНЯЯ в массиве — и если это была
  // пустая карточка-дубль, объект терял и дату сдачи, и старт, и прораба: в аналитике
  // он выглядел несданным. Берём самую свежую по updatedAt, а при равенстве — ту, где
  // реально заполнены даты.
  const prodFilled = (p) => (ts(p?.factEndDate) ? 1 : 0) + (ts(p?.startDate) ? 1 : 0)
    + (ts(p?.saleDate) ? 1 : 0) + ((p?.stages || []).length ? 1 : 0);
  const prodByObject = new Map();
  const prodDuplicates = new Map();
  for (const p of productions) {
    if (!p || !p.objectId) continue;
    const prev = prodByObject.get(p.objectId);
    if (!prev) { prodByObject.set(p.objectId, p); continue; }
    prodDuplicates.set(p.objectId, (prodDuplicates.get(p.objectId) || 1) + 1);
    const better = ts(p.updatedAt) !== ts(prev.updatedAt)
      ? ts(p.updatedAt) > ts(prev.updatedAt)
      : prodFilled(p) > prodFilled(prev);
    if (better) prodByObject.set(p.objectId, p);
  }
  const contractByObject = new Map();
  for (const c of contracts) {
    if (!c || c.deletedAt || !c.objectId) continue;
    // Договоры подряда — это себестоимость (в старых записях они лежали в том же списке).
    // В выручку/дату продажи они попадать не должны.
    if (c.type === "podryad" || c.type === "podryad_annex") continue;
    // Основным считаем договор с наибольшей суммой — он и есть контракт объекта.
    const prev = contractByObject.get(c.objectId);
    if (!prev || contractSum(c) > contractSum(prev)) contractByObject.set(c.objectId, c);
  }

  const objectValue = (o) => (estByObject.get(o.id) || []).reduce((s, e) => s + num(e.total), 0);
  const objectCost = (o) => (estByObject.get(o.id) || []).reduce(
    (s, e) => s + (typeof estimateCost === "function" ? num(estimateCost(e)) : num(e.cost)),
    0,
  );

  return { liveObjects, estByObject, prodByObject, prodDuplicates, contractByObject, objectValue, objectCost };
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

// ─── ОДНО определение «договор подписан в периоде» на весь дашборд ────────────
// Было три разных числа про одни и те же договоры (проверено на июле 2026):
//   3 — воронка продаж (когорта: только те, кто и зашёл в июле),
//   5 — средний чек и сумма подписанного (без расторгнутых),
//   6 — производство (все подписания июля).
// Правильное — 6. «cancel» ВКЛЮЧЁН намеренно: расторгнутый договор всё равно был
// подписан, и подписан именно в этом месяце; расторжение — отдельная строка
// «Расторгли», а не повод задним числом стереть продажу. Когорта остаётся как есть,
// но она отвечает на другой вопрос и подписана отдельно.
const SIGNED_STATUSES = ["signed", "work", "paused", "done", "cancel"];
// Дата подписания: поле «Дата продажи» карточки производства, запасной вариант —
// дата договора.
const signedAtOf = (o, prodByObject, contractByObject) =>
  ts(prodByObject.get(o.id)?.saleDate)
  || ts(contractByObject.get(o.id)?.date || contractByObject.get(o.id)?.contractDate);
// Во «Всё время» дата подписания у части старых объектов не заполнена. Отбирать их
// по дате — значит занижать итог из-за пробелов в данных, а не из-за продаж, поэтому
// там берём по статусу.
function signedInPeriod(idx, { from, to }, period, byManager = () => true) {
  const { liveObjects, prodByObject, contractByObject } = idx;
  return liveObjects
    .filter(byManager)
    .filter(o => SIGNED_STATUSES.includes(statusOf(o, prodByObject)))
    .filter(o => period === "all" || inRange(signedAtOf(o, prodByObject, contractByObject), from, to));
}


// Менеджер у объекта — СВОБОДНЫЙ ТЕКСТ (приходит из формы сметы), поэтому один и тот
// же человек попадает в базу как «Сергей Штанько», «Сергей Ш.» и «Сергей Ш». Сводим
// варианты к реальному сотруднику: точное совпадение, иначе — единственный сотрудник,
// чьё имя начинается с введённого. Если подходящих несколько — не угадываем и
// оставляем как есть, чтобы не приписать объекты чужому человеку.
export function makeManagerResolver(users = []) {
  const norm = (v) => String(v || "").trim().replace(/\s+/g, " ").replace(/\.+$/, "").toLowerCase();
  const known = (users || [])
    .map(u => (typeof u === "string" ? u : u?.name))
    .filter(Boolean)
    .map(name => ({ name, key: norm(name) }));
  const cache = new Map();
  return (raw) => {
    const original = String(raw || "").trim();
    if (!original) return "Без менеджера";
    if (cache.has(original)) return cache.get(original);
    const key = norm(original);
    let result = original;
    const exact = known.find(u => u.key === key);
    if (exact) result = exact.name;
    else {
      const starts = known.filter(u => u.key.startsWith(key + " ") || u.key.startsWith(key));
      // Сводим к сотруднику только если подходит ровно один. Если совпадений нет —
      // это не заведённый сотрудник (уволенный, опечатка, чужое имя): показываем
      // отдельной строкой, чтобы разрез строился по реальным людям.
      if (starts.length === 1) result = starts[0].name;
      // Совпадений нет вовсе — человек не заведён в сотрудниках (уволен, опечатка).
      // Совпадений несколько — сокращение неоднозначно, оставляем как есть,
      // чтобы не приписать объекты не тому человеку.
      else if (starts.length === 0 && known.length) result = `${original} (нет в сотрудниках)`;
    }
    cache.set(original, result);
    return result;
  };
}

// ─── БЛОК 1. Продажи и воронка ───────────────────────────────────────────────
function buildSales(idx, { from, to }, manager, period, resolveManager = (v) => (v || "Без менеджера")) {
  const { liveObjects, objectValue, contractByObject, prodByObject } = idx;
  const cohort = liveObjects
    // Архив смотрим по ИТОГОВОМУ статусу, как и весь остальной интерфейс. Раньше здесь
    // читалось сырое object.status, а его в карточке не видно: кнопки статуса
    // подсвечиваются по производству, поэтому объект показывает «В работе», хотя в поле
    // лежит «archive» от миграции из финансов. Такой объект молча выпадал из когорты, и
    // починить это из интерфейса было нельзя — он и так выглядел правильно.
    .filter(o => statusOf(o, prodByObject) !== "archive")
    // Объекты, залитые миграцией из финансов, не имеют настоящей даты создания —
    // в периодах они исказили бы приток. Учитываем их только во «Всё время»
    // (ровно так же, как считают старые плитки аналитики).
    .filter(o => period === "all" || o.createdBy !== "migration")
    // Фильтр по менеджеру тоже через канонизацию, иначе выбор «Сергей Штанько»
    // потерял бы его объекты, записанные как «Сергей Ш.».
    .filter(o => !manager || resolveManager(o.manager) === resolveManager(manager))
    .filter(o => inRange(o.createdAt, from, to));

  // Сумма сделки: если договор заведён — берём его сумму (это реальные деньги),
  // иначе сумму смет объекта. Так же считает финансовый блок, поэтому цифры сходятся.
  const dealValue = (o) => contractSum(contractByObject.get(o.id)) || objectValue(o);

  const withEstimate = cohort.filter(o => objectValue(o) > 0);
  // Когорта (создан в периоде) — правильная база для КОНВЕРСИИ: сколько из зашедших
  // в этом месяце дошли до договора. Договор, подписанный в этом месяце по лиду
  // прошлого, сюда НЕ входит — он попадёт в воронку своего месяца захода.
  const signedFromCohort = cohort.filter(o => SIGNED_STATUSES.includes(statusOf(o, prodByObject)));

  // А «Подписано за период» и все денежные средние считаются по ДАТЕ ПОДПИСАНИЯ:
  // договор, заключённый в июле по объекту с мая, — это июльская продажа.
  // Определение — общее с производством (signedInPeriod), чтобы «сколько договоров
  // в июле» было ОДНИМ числом, а не тремя.
  const signedAt = (o) => signedAtOf(o, prodByObject, contractByObject);
  // Отсева архивных и «миграционных» здесь НЕТ намеренно, в отличие от когорты выше.
  // Когорта отбирается по дате СОЗДАНИЯ объекта, а у мигрированных её фактически нет —
  // они бы исказили приток. Тут же отбор идёт по дате ПОДПИСАНИЯ, она настоящая:
  // договор, заключённый в июле, — июльская продажа, кем бы объект ни был заведён и
  // убрали ли его потом в архив. Из-за лишнего отсева такие сделки пропадали.
  const isSelectedManager = (o) => !manager || resolveManager(o.manager) === resolveManager(manager);
  const signed = signedInPeriod(idx, { from, to }, period, isSelectedManager);
  const inApproval = cohort.filter(o => statusOf(o, prodByObject) === "approval");
  // «Потеряли» — это про отказ клиента ДО работ. Расторжение уже подписанного
  // договора — другая история, её сюда не мешаем.
  const lost = cohort.filter(o => statusOf(o, prodByObject) === "refuse");
  const cancelled = cohort.filter(o => statusOf(o, prodByObject) === "cancel");

  const estimatedSum = withEstimate.reduce((s, o) => s + objectValue(o), 0);
  const signedSum = signed.reduce((s, o) => s + dealValue(o), 0);
  // Подписанные, у которых сумма известна. Старые объекты без сметы и без договора
  // стоят «0 ₸» — это не бесплатная сделка, а отсутствие данных, поэтому в средних
  // они не участвуют (в самой сумме их ноль всё равно ничего не меняет).
  const signedValued = signed.filter(o => dealValue(o) > 0);
  const lostSum = lost.reduce((s, o) => s + objectValue(o), 0);

  // Срок сделки: от создания объекта до даты договора. Считаем только там,
  // где обе даты есть, иначе среднее врёт.
  // Срок сделки = от заведения объекта до подписания договора. Дата подписания —
  // это поле «Дата продажи (подписание договора)» в карточке производства; если его
  // не заполнили, берём дату договора как запасной вариант.
  const dealDays = [];
  for (const o of signed) {
    const closedAt = signedAt(o);
    const createdAt = ts(o.createdAt);
    if (closedAt && createdAt && closedAt >= createdAt) dealDays.push(days(createdAt, closedAt));
  }

  // Цена за м² — только по подписанным с указанной площадью.
  const sqmPrices = signed
    .filter(o => num(o.area) > 0 && dealValue(o) > 0)
    .map(o => dealValue(o) / num(o.area));

  const lostByReason = {};
  for (const o of lost) {
    const key = o.refuseReason || "unknown";
    if (!lostByReason[key]) lostByReason[key] = { count: 0, sum: 0 };
    lostByReason[key].count += 1;
    lostByReason[key].sum += objectValue(o);
  }

  const signedSet = new Set(signedFromCohort.map(o => o.id));
  const byManager = {};
  for (const o of cohort) {
    const key = resolveManager(o.manager);
    if (!byManager[key]) byManager[key] = { objects: 0, estimated: 0, estimatedSum: 0, signed: 0, signedValued: 0, signedSum: 0 };
    byManager[key].objects += 1;
    if (objectValue(o) > 0) { byManager[key].estimated += 1; byManager[key].estimatedSum += objectValue(o); }
    if (signedSet.has(o.id)) {
      byManager[key].signed += 1;
      byManager[key].signedSum += dealValue(o);
      if (dealValue(o) > 0) byManager[key].signedValued += 1;
    }
  }

  const byType = {};
  for (const o of cohort) {
    const key = o.objType || "—";
    if (!byType[key]) byType[key] = { objects: 0, sum: 0, signed: 0, signedSum: 0, conv: 0 };
    byType[key].objects += 1;
    byType[key].sum += objectValue(o);
    if (signedSet.has(o.id)) { byType[key].signed += 1; byType[key].signedSum += dealValue(o); }
  }
  // Конверсия по типу: где мы реально сильнее — вторичка, новостройка или коммерция.
  for (const v of Object.values(byType)) v.conv = pct(v.signed, v.objects);
  // Средний чек считаем ТОЛЬКО по объектам с известной суммой (см. ниже, там же
  // подробно). Иначе менеджер со старыми объектами без смет выглядит хуже, чем есть.
  for (const v of Object.values(byManager)) {
    v.avgCheck = v.signedValued ? Math.round(v.signedSum / v.signedValued) : null;
  }

  return {
    newObjects: cohort.length,
    // КОГОРТНАЯ воронка — движение, а не срез. Берём объекты, ЗАШЕДШИЕ в периоде,
    // и смотрим, докуда каждый из них дошёл к текущему моменту. Стадии строго
    // вложены друг в друга (подписал ⊂ посчитал смету ⊂ зашёл), поэтому конверсия
    // между шагами честная. Срез «кто где стоит сейчас» — это другая картинка,
    // она живёт отдельно и на вопрос «как отработали июль» не отвечает.
    cohortFunnel: {
      // Все стадии считаются от одной когорты — тех, кто зашёл в периоде.
      basisNote: "все три стадии — только те, кто зашёл в этом периоде",
      stages: [
        { key: "in", label: "Зашло новых", count: cohort.length,
          sum: cohort.reduce((s, o) => s + objectValue(o), 0) },
        { key: "estimate", label: "Посчитана смета", count: withEstimate.length, sum: estimatedSum },
        { key: "contract", label: "Договор подписан", count: signedFromCohort.length,
          sum: signedFromCohort.reduce((s, o) => s + dealValue(o), 0),
          note: "из зашедших в периоде" },
      ],
      lost: { count: lost.length, sum: lostSum },
      // Ещё в работе: зашли, но пока ни договора, ни отказа — это то, что можно дожать.
      inProgress: {
        count: Math.max(0, cohort.length - signedFromCohort.length - lost.length),
        sum: cohort
          .filter(o => !signedSet.has(o.id) && statusOf(o, prodByObject) !== "refuse")
          .reduce((s, o) => s + objectValue(o), 0),
      },
      // Ответ на вопрос «а сколько мы вообще продали в этом месяце» — прямо здесь,
      // а не только в блоке производства. Это ТО ЖЕ число, что «Подписали договор»
      // справа: одно определение signedInPeriod на оба блока. Разница с когортной
      // стадией выше — ровно те договоры, чьи лиды зашли в прошлых месяцах.
      signedInPeriod: {
        label: "Подписано в периоде всего",
        count: signed.length,
        sum: signedSum,
        fromEarlier: Math.max(0, signed.length - signedFromCohort.length),
      },
    },
    // Список для проверки: по нему видно, ЧТО именно посчиталось в «Новых объектах».
    cohortList: cohort
      .map(o => ({
        id: o.id,
        name: o.clientName || o.address || "Без названия",
        createdAt: ts(o.createdAt),
        manager: resolveManager(o.manager),
        status: statusOf(o, prodByObject),
        value: objectValue(o),
      }))
      .sort((a, b) => b.createdAt - a.createdAt),
    // Считаем объекты, а не сметы: у одного объекта смет может быть много (допы
    // добавляются уже после подписания), и счётчик смет вводил бы в заблуждение.
    estimatedCount: withEstimate.length,
    estimatedSum,
    estimatesTotalCount: cohort.reduce((s, o) => s + (idx.estByObject.get(o.id) || []).length, 0),
    inApprovalCount: inApproval.length,
    inApprovalSum: inApproval.reduce((s, o) => s + objectValue(o), 0),
    signedCount: signed.length,
    signedSum,
    // СРЕДНИЙ ЧЕК — по объектам, у которых сумма ВООБЩЕ известна (есть договор или
    // смета). Раньше делили на всех подписанных, включая тех, у кого ни договора,
    // ни сметы нет: такой объект в сумму не давал ничего, но знаменатель увеличивал.
    // На боевой базе из 30 подписанных сумма была известна у 8 — чек занижался
    // вчетверо (614 749 ₸ вместо 2 305 308 ₸).
    avgCheck: signedValued.length ? Math.round(signedSum / signedValued.length) : null,
    avgCheckSample: signedValued.length,
    signedWithoutValue: signed.length - signedValued.length,
    // Воронка по шагам: сколько дошло от предыдущего этапа.
    // Конверсия без единого зашедшего объекта — это «—», а не «0%»: делить не на что,
    // а «0%» читается как «ни одна сделка не дошла».
    convToEstimate: cohort.length ? pct(withEstimate.length, cohort.length) : null,
    convToSigned: withEstimate.length ? pct(signedFromCohort.length, withEstimate.length) : null,
    convTotal: cohort.length ? pct(signedFromCohort.length, cohort.length) : null,
    signedFromCohortCount: signedFromCohort.length,
    avgDealDays: dealDays.length ? Math.round(dealDays.reduce((s, d) => s + d, 0) / dealDays.length) : null,
    // Сколько сделок реально попало в среднее: срок считается только там, где есть
    // и дата создания объекта, и дата договора. Без этого числа среднее по 2 сделкам
    // выглядит как вывод по всей компании.
    avgDealDaysSample: dealDays.length,
    lostCount: lost.length,
    lostSum,
    cancelledCount: cancelled.length,
    lostByReason,
    // Площадь заполняют не всегда. Пустая выборка — это «—», а не «0 ₸ за м²»:
    // ноль читался бы как «работаем бесплатно».
    avgPricePerSqm: sqmPrices.length
      ? Math.round(sqmPrices.reduce((s, v) => s + v, 0) / sqmPrices.length)
      : null,
    avgPricePerSqmSample: sqmPrices.length,
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
  let stagesValue = 0;
  let objectsWithStagePrices = 0;
  for (const o of active) {
    const stages = prodByObject.get(o.id)?.stages || [];
    const total = stages.reduce((s, st) => s + num(st.priceClient), 0);
    // Без заполненных цен этапов «выполнено» посчитать нечем. Такой объект не
    // занижает показатель — он просто не участвует (иначе всегда было бы 0 ₸).
    if (total <= 0) continue;
    objectsWithStagePrices += 1;
    stagesValue += total;
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
    stagesValue,
    objectsWithStagePrices,
    stagesProgressPct: stagesValue > 0 ? pct(doneValue, stagesValue) : null,
    remaining: Math.max(0, stagesValue - doneValue),
    byForeman,
    closingThisMonthCount: closingThisMonth.length,
    closingThisMonthSum: closingThisMonth.reduce((s, o) => s + objectValue(o), 0),
    closingThisMonthIds: closingThisMonth.map(o => o.id),
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
  const startLagDays = [];
  const staleObjects = [];
  const overdueStageList = [];
  const doneList = [];       // сдали в периоде (факт-дата окончания попала в окно)
  const startedList = [];    // вышли на объект в периоде

  for (const o of liveObjects) {
    const status = statusOf(o, prodByObject);
    if (byStatus[status] !== undefined) byStatus[status] += 1;
    const prod = prodByObject.get(o.id);
    if (!prod) continue;

    const planEnd = ts(prod.planEndDate);
    const factEnd = ts(prod.factEndDate);

    // Просрочка — только у незакрытых объектов с проставленным план-финишем.
    // Просрочка только у живых объектов: расторгнутый или архивный «просроченным» не бывает.
    const alive = status === "work" || status === "paused" || status === "signed";
    if (planEnd && !factEnd && alive && planEnd < now) {
      const late = daysFull(planEnd, now);
      overdueObjects += 1;
      overdueDaysTotal += late;
      overdueMaxDays = Math.max(overdueMaxDays, late);
    }
    // СДАЧА за период — по факт-дате окончания. Считаем ЗДЕСЬ один раз и отдаём
    // список наружу: воронка производства берёт его же, поэтому «Сдали» на графике
    // и плитка «Сдано за период» физически не могут разойтись.
    // Никаких доп. фильтров (архив, объекты из миграции) тут нет намеренно: факт-дата
    // реальная, и объект, сданный в этом месяце, обязан посчитаться независимо от
    // того, как он попал в базу и убрали ли его потом в архив.
    // А вот РАСТОРГНУТЫЕ исключаем: у них в факт-дате стоит день, когда работы
    // прекратили, а не сдали объект. Иначе расторжение попадало бы в сдачи и заодно
    // портило «сдачу в срок» и среднюю длительность.
    if (factEnd && status !== "cancel" && inRange(prod.factEndDate, from, to)) {
      const start = ts(prod.startDate);
      planFact.push({
        onTime: planEnd ? factEnd <= planEnd : null,
        planDays: start && planEnd ? days(start, planEnd) : null,
        factDays: start ? days(start, factEnd) : null,
      });
      doneList.push(o);
    }
    if (inRange(prod.startDate, from, to)) startedList.push(o);
    // Простой: подписали договор — когда реально вышли на объект.
    const saleAt = ts(prod.saleDate);
    const startAt = ts(prod.startDate);
    if (saleAt && startAt && startAt >= saleAt) startLagDays.push(days(saleAt, startAt));
    // Объекты без движения: карточку давно не трогали, а объект живой.
    if ((status === "work" || status === "signed" || status === "paused")) {
      const touched = ts(o.updatedAt) || ts(prod.updatedAt) || ts(o.createdAt);
      if (touched && daysFull(touched, now) >= STALE_DAYS) {
        staleObjects.push({
          id: o.id,
          name: o.clientName || o.address || "Без названия",
          createdAt: touched,
          manager: o.manager || "",
          value: 0,
          days: daysFull(touched, now),
        });
      }
    }
    for (const st of prod.stages || []) {
      if (status !== "work" && status !== "paused") continue;
      stagesTotal += 1;
      if (st.status === "done") {
        stagesDone += 1;
        // Галочка `paid` в карточке производства подписана «Оплачено клиентом»,
        // поэтому это НЕ долг бригадам, а закрытые работы, за которые клиент ещё
        // не заплатил. Сумма — цена клиенту, а не себестоимость.
        if (!st.paid) { unpaidDoneStages += 1; unpaidDoneSum += num(st.priceClient); }
      } else if (ts(st.planEnd) && ts(st.planEnd) < now) {
        overdueStages += 1;
        // Поимённо: какие именно этапы горят и на каком объекте.
        overdueStageList.push({
          id: `${o.id}:${st.id || st.name}`,
          name: `${st.name || "Этап"} · ${o.clientName || o.address || "объект"}`,
          createdAt: ts(st.planEnd),
          manager: st.responsible || prod.responsible || "",
          value: num(st.priceClient),
          days: daysFull(ts(st.planEnd), now),
        });
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
    doneList,
    startedList,
    overdueObjects,
    overdueAvgDays: overdueObjects ? Math.round(overdueDaysTotal / overdueObjects) : 0,
    overdueMaxDays,
    // НОЛЬ И «НЕТ ДАННЫХ» — РАЗНЫЕ ВЕЩИ. Если ни у одного сданного объекта не
    // проставлена ПЛАНОВАЯ дата, «сдача в срок» показывала 0% — то есть «сорвали
    // все сроки», хотя на самом деле сравнивать не с чем. Возвращаем null, экран
    // рисует «—» и пишет, чего не хватает. Так же с планом/фактом длительности.
    onTimeRate: withPlan ? pct(onTime, withPlan) : null,
    onTimeSample: withPlan,
    avgPlanDays: planDaysArr.length ? Math.round(planDaysArr.reduce((s, v) => s + v, 0) / planDaysArr.length) : null,
    avgFactDays: factDaysArr.length ? Math.round(factDaysArr.reduce((s, v) => s + v, 0) / factDaysArr.length) : null,
    // Это доля ЭТАПОВ ПО КОЛИЧЕСТВУ на объектах в работе. Рядом в портфеле живёт
    // похожий показатель, но он считается ПО ДЕНЬГАМ и даёт другое число —
    // подписи развели, чтобы они не выглядели противоречием.
    stagesProgress: stagesTotal ? pct(stagesDone, stagesTotal) : null,
    stagesTotal,
    stagesDone,
    overdueStages,
    overdueStageList: overdueStageList.sort((a, b) => b.days - a.days),
    unpaidDoneStages,
    unpaidDoneSum,
    avgStartLagDays: startLagDays.length
      ? Math.round(startLagDays.reduce((s, v) => s + v, 0) / startLagDays.length) : null,
    startLagSample: startLagDays.length,
    staleObjects: staleObjects.sort((a, b) => b.days - a.days),
  };
}

// ─── БЛОК 4. Финансы (факт — из транзакций, привязка по номеру договора) ─────
const normContract = (v) => String(v || "").replace(/[№#\s]/g, "").toLowerCase();

// Те же категории-исключения, что в ОПУ на экране «Финансы». Займы, вклады, возвраты
// и покупка активов — это НЕ выручка и НЕ расход периода. Без этих исключений
// «Поступления» в аналитике не сходились бы с ОПУ.
const C_FINANCING_INC = "Финансирование (не выручка)";
const C_ASSET_INC = "Возврат займов и активов";
const C_FINACT = "Финансовая деятельность (не расход)";
const C_ASSET_OUT = "Выданные займы и прочие активы";
const C_COGS = "Прямые расходы (COGS / себестоимость)";   // прямая себестоимость объектов
const S_DIV = "Дивиденды учредителям";                    // распределение прибыли, не расход
const isPLIncome = (t) => !t.isAdvance && t.category !== C_FINANCING_INC && t.category !== C_ASSET_INC;
// Расход P&L — как на экране «Финансы»: без дивидендов (это распределение прибыли),
// без финансовой деятельности и без выданных займов/активов.
const isPLExpense = (t) => t.category !== C_FINACT && t.category !== C_ASSET_OUT && t.subcategory !== S_DIV;
// Дата операции: как в финансах — сначала дата операции, потом дата создания.
const txDate = (t) => t.date || t.createdAt || 0;

function buildFinance(idx, { from, to, now }, financeTx) {
  const { liveObjects, objectValue, objectCost, contractByObject, prodByObject } = idx;
  const live = financeTx.filter(t => t && !t.deletedAt && t.included !== false);
  const inPeriod = live.filter(t => inRange(txDate(t), from, to));

  let income = 0;
  let expense = 0;
  let cogs = 0;
  const expenseByCategory = {};
  const cashflow = {};
  for (const t of inPeriod) {
    const amount = num(t.amount);
    const mk = monthKey(txDate(t));
    if (!cashflow[mk]) cashflow[mk] = { income: 0, expense: 0 };
    // Денежный поток показывает ВСЕ движения (это касса), а выручка/расход —
    // только то, что попадает в прибыль. Поэтому фильтры разные и это намеренно.
    if (t.type === "income") {
      cashflow[mk].income += amount;
      if (isPLIncome(t)) income += amount;
    } else if (t.type === "expense") {
      cashflow[mk].expense += amount;
      if (isPLExpense(t)) {
        expense += amount;
        // Валовая прибыль в финучёте вычитает ТОЛЬКО прямую себестоимость (COGS),
        // а не все расходы — иначе получалась бы чистая прибыль.
        if (t.category === C_COGS) cogs += amount;
        const cat = t.category || "Без категории";
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amount;
      }
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
  // Объекты без номера договора: платежи сопоставить НЕ С ЧЕМ. Раньше такой объект
  // целиком уходил в дебиторку («никто не платил»), из-за чего долг был раздут.
  // Теперь считаем их отдельно и показываем как пробел в данных, а не как долг.
  let unlinkedObjects = 0;
  let unlinkedSum = 0;
  const objectProfit = [];
  const receivableList = [];
  const marginPlanFact = [];
  for (const o of activeObjects) {
    const contract = contractByObject.get(o.id);
    const contractNo = normContract(contract?.number);
    const planValue = contractSum(contract) || objectValue(o);
    if (planValue <= 0) continue;
    if (!contractNo) {
      unlinkedObjects += 1;
      unlinkedSum += planValue;
      continue;
    }
    const fact = factByContract[contractNo] || { income: 0, expense: 0 };
    const debt = Math.max(0, planValue - fact.income);
    receivables += debt;
    // Просроченной считаем дебиторку по объектам, у которых план-финиш уже прошёл.
    const planEnd = ts(prodByObject.get(o.id)?.planEndDate);
    if (debt > 0 && planEnd && planEnd < now) receivablesOverdue += debt;
    if (debt > 0) {
      receivableList.push({
        id: o.id,
        name: o.clientName || o.address || "Без названия",
        createdAt: ts(o.createdAt),
        manager: o.manager || "",
        value: debt,
        overdue: !!(planEnd && planEnd < now),
      });
    }

    const planCost = objectCost(o);
    // План/факт маржи: сколько закладывали в смете и что получилось по деньгам.
    // Факт считаем только там, где объект оплачен хотя бы частично и есть расходы,
    // иначе «маржа» недостроенного объекта показывала бы ерунду.
    if (planValue > 0 && planCost > 0 && fact.income > 0 && fact.expense > 0) {
      const planMargin = pct(planValue - planCost, planValue);
      const factMargin = pct(fact.income - fact.expense, fact.income);
      marginPlanFact.push({
        id: o.id,
        name: o.clientName || o.address || "Без названия",
        createdAt: ts(o.createdAt),
        manager: o.manager || "",
        planMargin,
        factMargin,
        drop: planMargin - factMargin,
        value: planValue,
      });
    }
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
    cogs,
    // Считаем ровно как экран «Финансы»: валовая = выручка − COGS,
    // чистая = выручка − все расходы P&L, рентабельность = чистая / выручка.
    gross: income - cogs,
    // Маржа считается ОТ ВЫРУЧКИ. Нет поступлений — процента не существует.
    grossMarginPct: income > 0 ? pct(income - cogs, income) : null,
    net: income - expense,
    marginPct: income > 0 ? pct(income - expense, income) : null,
    cashflow,
    expenseByCategory,
    receivables,
    receivablesOverdue,
    receivableList: receivableList.sort((a, b) => b.value - a.value),
    unlinkedObjects,
    unlinkedSum,
    // Средневзвешенные план/факт маржи по компании — главный ответ на вопрос
    // «где мы теряем деньги»: заложили столько, получилось столько.
    // Нет ни одного объекта, где известны и план, и факт, — показывать «0% / 0%»
    // нельзя: это выглядит как «вся маржа потеряна».
    marginPlanAvg: marginPlanFact.length
      ? Math.round(marginPlanFact.reduce((s, x) => s + x.planMargin, 0) / marginPlanFact.length) : null,
    marginFactAvg: marginPlanFact.length
      ? Math.round(marginPlanFact.reduce((s, x) => s + x.factMargin, 0) / marginPlanFact.length) : null,
    marginSample: marginPlanFact.length,
    marginDrops: marginPlanFact.filter(x => x.drop >= 10).sort((a, b) => b.drop - a.drop),
    topProfitable: objectProfit.slice(0, 5),
    topLoss: objectProfit.filter(x => x.profit < 0).slice(-5).reverse(),
    overspendObjects: objectProfit.filter(x => x.overspend > 0).sort((a, b) => b.overspend - a.overspend).slice(0, 5),
  };
}

// Остатки по счетам — считаются ровно как на экране «Финансы»: начальный остаток
// счёта плюс приходы, минус расходы, переводы двигают деньги между счетами.
function buildCash(financeTx, accounts, backlog) {
  const balances = {};
  for (const a of accounts || []) balances[a.name] = num(a.opening);
  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false) continue;
    const amt = num(t.amount);
    if (t.type === "income") balances[t.account] = (balances[t.account] || 0) + amt;
    else if (t.type === "expense") balances[t.account] = (balances[t.account] || 0) - amt;
    else if (t.type === "transfer") {
      balances[t.account] = (balances[t.account] || 0) - amt;
      balances[t.accountTo] = (balances[t.accountTo] || 0) + amt;
    }
  }
  const total = Object.values(balances).reduce((s, v) => s + v, 0);
  return {
    total,
    byAccount: Object.entries(balances)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    // Ожидаемый приход — долг по объектам, которые должны закрыться в этом месяце.
    expectedThisMonth: backlog.closingThisMonthDebt || 0,
  };
}

// ─── БЛОК 5. Качество и клиент ───────────────────────────────────────────────
// ВАЖНО про даты: у замечания в базе есть только `ts` (когда завели) и флаг `done`.
// Даты ЗАКРЫТИЯ не существует, поэтому «закрыто за период» и «средний срок закрытия»
// посчитать физически нечем — такие показатели здесь не выдумываем. Считаем то, что
// есть: сколько открыто, сколько всего, и сколько висит дольше недели.
function buildQuality(idx, { now }) {
  const { liveObjects, prodByObject } = idx;
  let open = 0;
  let closed = 0;
  let fromClient = 0;
  let openFromClient = 0;
  let openOverWeek = 0;
  let oldestOpenDays = 0;
  let objectsWithRemarks = 0;
  let handoverDone = 0;
  let handoverTotal = 0;
  let objectsInHandover = 0;
  const byForeman = {};

  for (const o of liveObjects) {
    const prod = prodByObject.get(o.id);
    if (!prod) continue;
    const status = statusOf(o, prodByObject);
    const defects = (prod.defects || []).filter(Boolean);
    if (defects.length) objectsWithRemarks += 1;
    const foreman = prod.responsible || "Не назначен";
    if (!byForeman[foreman]) byForeman[foreman] = { objects: 0, open: 0, total: 0 };
    byForeman[foreman].objects += 1;
    for (const d of defects) {
      const isClient = d.source === "client";
      if (isClient) fromClient += 1;
      byForeman[foreman].total += 1;
      if (d.done) { closed += 1; continue; }
      open += 1;
      byForeman[foreman].open += 1;
      if (isClient) openFromClient += 1;
      const opened = ts(d.ts);
      if (opened) {
        const age = daysFull(opened, now);
        if (age >= 7) openOverWeek += 1;
        oldestOpenDays = Math.max(oldestOpenDays, age);
      }
    }
    // Чек-лист сдачи имеет смысл только у объектов в работе и сданных: у новых он
    // всегда пустой и занижал бы процент по всей компании.
    if (status === "work" || status === "done") {
      const handover = prod.checklistHandover || [];
      if (handover.length) {
        objectsInHandover += 1;
        handoverTotal += handover.length;
        handoverDone += handover.filter(i => i?.done).length;
      }
    }
  }

  return {
    openRemarks: open,
    closedRemarks: closed,
    fromClient,
    openFromClient,
    openOverWeek,
    oldestOpenDays,
    remarksPerObject: objectsWithRemarks
      ? Math.round(((open + closed) / objectsWithRemarks) * 10) / 10
      : null,
    // Отдаём и базу: 1 закрытый пункт из 580 округляется в «0%», и без базы этот
    // ноль не отличить от «чек-листов вообще нет».
    handoverPct: handoverTotal ? pct(handoverDone, handoverTotal) : null,
    handoverDone,
    handoverTotal,
    objectsInHandover,
    byForeman,
  };
}

// Качество данных: почему показатели бывают пустыми. Не считает бизнес — считает,
// насколько заполнена база. Одновременно это рабочий список «что дозаполнить».
function buildDataQuality(idx, financeTx, resolveManager, now = Date.now()) {
  // Конец СЕГОДНЯШНЕГО дня: дата, поставленная сегодня, будущей не считается.
  const nd = new Date(now);
  const endOfToday = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate() + 1) - 1;
  const { liveObjects, objectValue, prodByObject, prodDuplicates, contractByObject } = idx;
  const active = liveObjects.filter(o => !["archive", "refuse"].includes(statusOf(o, prodByObject)));
  const signed = liveObjects.filter(o => ["signed", "work", "paused", "done"].includes(statusOf(o, prodByObject)));

  const gaps = [
    { key: "manager", label: "Без менеджера",
      items: active.filter(o => !o.manager || resolveManager(o.manager).includes("нет в сотрудниках")) },
    { key: "area", label: "Без площади", items: active.filter(o => !num(o.area)) },
    { key: "estimate", label: "Без сметы", items: active.filter(o => objectValue(o) <= 0) },
    { key: "contract", label: "Подписан, но нет договора", items: signed.filter(o => !contractByObject.get(o.id)) },
    { key: "prodCard", label: "В работе без карточки производства",
      items: liveObjects.filter(o => statusOf(o, prodByObject) === "work" && !prodByObject.get(o.id)) },
    { key: "planEnd", label: "В работе без плановой даты сдачи",
      items: liveObjects.filter(o => statusOf(o, prodByObject) === "work" && !ts(prodByObject.get(o.id)?.planEndDate)) },
    // Раньше здесь смотрели ТОЛЬКО поле «Дата продажи» и ругались на объекты, у
    // которых дата есть в договоре и всё считается нормально. Проверяем ровно то,
    // чем пользуется воронка: без обеих дат объект не попадёт НИ В ОДИН месяц —
    // ни в «Подписано за период», ни в средний чек, ни в срок сделки.
    { key: "saleDate", label: "Подписан, но месяц продажи неизвестен",
      items: signed.filter(o => !signedAtOf(o, prodByObject, contractByObject)) },
    { key: "foreman", label: "В работе без прораба",
      items: liveObjects.filter(o => statusOf(o, prodByObject) === "work" && !prodByObject.get(o.id)?.responsible) },
    // Сдача считается по факт-дате окончания. Без неё объект стоит «Выполнен», но
    // ни в «Сдали за период», ни в «сдача в срок» не попадает — и пропажу видно
    // только глазами. Поэтому выносим в явный список.
    { key: "factEnd", label: "Выполнен без даты окончания",
      items: liveObjects.filter(o => statusOf(o, prodByObject) === "done"
        && !ts(prodByObject.get(o.id)?.factEndDate)) },
    // ── ДАТЫ, КОТОРЫЕ ПРОТИВОРЕЧАТ ДРУГ ДРУГУ ───────────────────────────────
    // Опечатка в дате не ломает ничего заметно: объект просто уезжает в чужой
    // месяц и тихо портит там и «Подписано», и средний чек. Ловим сами.
    { key: "saleFuture", label: "Дата продажи в будущем",
      items: signed.filter(o => {
        const t = signedAtOf(o, prodByObject, contractByObject);
        return t && t > endOfToday;
      }) },
    // Выйти на объект раньше, чем продали, нельзя. Обычно это либо опечатка в дате
    // продажи, либо в поле старта лежит на самом деле дата продажи.
    { key: "startBeforeSale", label: "Вышли на объект раньше, чем подписали",
      items: signed.filter(o => {
        const sale = signedAtOf(o, prodByObject, contractByObject);
        const start = ts(prodByObject.get(o.id)?.startDate);
        return sale && start && start < sale;
      }) },
    { key: "endBeforeStart", label: "Сдали раньше, чем вышли на объект",
      items: liveObjects.filter(o => {
        const start = ts(prodByObject.get(o.id)?.startDate);
        const end = ts(prodByObject.get(o.id)?.factEndDate);
        return start && end && end < start;
      }) },
    // Дубль карточки производства: аналитика берёт одну (самую свежую), поэтому
    // правки, внесённые во вторую, в цифры не попадут. Это надо чинить руками.
    { key: "prodDup", label: "Несколько карточек производства",
      items: liveObjects.filter(o => (prodDuplicates?.get(o.id) || 0) > 1) },
  ].map(g => ({
    key: g.key,
    label: g.label,
    count: g.items.length,
    list: g.items.slice(0, 50).map(o => ({
      id: o.id,
      name: o.clientName || o.address || "Без названия",
      createdAt: ts(o.createdAt),
      manager: o.manager || "",
      value: objectValue(o),
    })),
  }));

  const liveTx = financeTx.filter(t => t && !t.deletedAt && t.included !== false && t.type !== "transfer");
  const txWithoutContract = liveTx.filter(t => !String(t.contractNo || "").trim()).length;

  return {
    gaps: gaps.filter(g => g.count > 0),
    totalGaps: gaps.reduce((s, g) => s + g.count, 0),
    activeObjects: active.length,
    txTotal: liveTx.length,
    txWithoutContract,
    txWithoutContractPct: liveTx.length ? pct(txWithoutContract, liveTx.length) : null,
  };
}

// Тренд за последние 6 месяцев — для графика на «Главной». Считается всегда за
// свой интервал, независимо от выбранного периода: график должен показывать
// динамику, а не кусок выбранного фильтра.
function buildTrend(idx, financeTx, now, months = 6) {
  const { liveObjects, objectValue, contractByObject, prodByObject } = idx;
  const keys = [];
  const base = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const byMonth = {};
  for (const k of keys) byMonth[k] = { month: k, income: 0, expense: 0, signed: 0, signedSum: 0 };

  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false) continue;
    const k = monthKey(txDate(t));
    if (!byMonth[k]) continue;
    const amt = num(t.amount);
    if (t.type === "income" && isPLIncome(t)) byMonth[k].income += amt;
    else if (t.type === "expense" && isPLExpense(t)) byMonth[k].expense += amt;
  }
  for (const o of liveObjects) {
    if (!["signed", "work", "done", "paused"].includes(statusOf(o, prodByObject))) continue;
    const contract = contractByObject.get(o.id);
    const k = monthKey(ts(prodByObject.get(o.id)?.saleDate) || ts(contract?.date || contract?.contractDate));
    if (!byMonth[k]) continue;
    byMonth[k].signed += 1;
    byMonth[k].signedSum += contractSum(contract) || objectValue(o);
  }
  return keys.map(k => byMonth[k]);
}

// Две воронки — они про разное и мешать их нельзя:
//   ПРОДАЖИ     — путь сделки до договора, терминал «Потерян» (buildSales.cohortFunnel).
//   ПРОИЗВОДСТВО — путь уже подписанного объекта, терминал «Расторгнут» (здесь).
// Производственная воронка — ПОТОК СОБЫТИЙ за период, а не когорта.
//
// Когортой (как в продажах) её делать нельзя: цикл стройки — месяцы, поэтому у
// объектов, подписанных в июле, к концу июля физически не может быть сдачи, и
// «Выполнено» вечно показывало бы 0, хотя в июле реально сдавали объекты,
// подписанные весной. Здесь правильный вопрос — не «докуда доехала когорта», а
// «что произошло на стройке за месяц»: сколько зашло, сколько вышло на объект,
// сколько сдали.
//
// Каждая стадия — СВОИ объекты (у них разные даты), поэтому конверсию между
// стадиями считать нельзя: showConversion на графике выключен.
//
// Даты берём те же, что и остальная аналитика, чтобы цифры сходились:
// подписание — saleDate (запасной вариант дата договора), выход на объект —
// startDate, сдача — factEndDate (по ней же считается плитка «Сдано за период»).
function buildFunnels(idx, { from, to }, period, manager, resolveManager = (v) => (v || "Без менеджера"), prod = {}) {
  const { liveObjects, objectValue, contractByObject, prodByObject } = idx;
  const dealValue = (o) => contractSum(contractByObject.get(o.id)) || objectValue(o);
  const sum = (list) => list.reduce((s, o) => s + dealValue(o), 0);
  const brief = (list) => list.slice(0, 50).map(o => ({
    id: o.id,
    name: o.clientName || o.address || "Без названия",
    createdAt: ts(prodByObject.get(o.id)?.factEndDate) || ts(o.createdAt),
    manager: o.manager || "",
    value: dealValue(o),
  }));

  // ВАЖНО: здесь НЕТ отсева архивных и объектов из миграции. Он есть в продажах,
  // и там он к месту: у мигрированных объектов нет настоящей даты создания, они
  // исказили бы приток. Но сдача, старт и подписание — события с РЕАЛЬНЫМИ датами.
  // Из-за этого отсева объекты, заведённые миграцией или убранные потом в архив,
  // пропадали из «Сдали», хотя в плитке «Сдано за период» считались, — два разных
  // числа про одно и то же.
  const byManager = (o) => !manager || resolveManager(o.manager) === resolveManager(manager);
  const scope = liveObjects.filter(byManager);

  const statusIn = (o, ...keys) => keys.includes(statusOf(o, prodByObject));
  const happened = (value) => inRange(value, from, to);

  // ОДНО определение с блоком продаж (signedInPeriod): раньше здесь была своя копия
  // условия, и «Подписали договор» справа не сходилось с «Подписано» слева.
  const signedNow = signedInPeriod(idx, { from, to }, period, byManager);
  // Старт и сдача берутся ИЗ buildProduction — один расчёт на оба экрана.
  const startedNow = (prod.startedList || []).filter(byManager);
  const doneNow = (prod.doneList || []).filter(byManager);

  const inWork = scope.filter(o => statusIn(o, "work"));
  const paused = scope.filter(o => statusIn(o, "paused"));
  const cancelled = scope.filter(o => statusIn(o, "cancel"));
  // Отдельного поля «дата расторжения» в карточке нет, но у расторгнутого объекта в
  // факт-дате окончания стоит день, когда работы прекратили. По нему и привязываем
  // расторжение к периоду. У кого даты нет — в период не попадёт, поэтому рядом
  // остаётся строка «Расторгнуто всего».
  const cancelledNow = cancelled.filter(o => happened(prodByObject.get(o.id)?.factEndDate));

  return {
    production: {
      flow: true,   // график: без «% с прошлой стадии»
      // Каждая стадия — своё событие своей даты, объекты в стадиях РАЗНЫЕ. Пишем это
      // прямо на карточке, иначе читается как воронка и напрашивается вопрос
      // «почему сдали меньше, чем подписали».
      basisNote: "события месяца, у каждой стадии свои объекты — это не воронка",
      stages: [
        { key: "signed", label: "Подписали договор", count: signedNow.length, sum: sum(signedNow),
          note: "включая лиды прошлых месяцев" },
        { key: "start", label: "Вышли на объект", count: startedNow.length, sum: sum(startedNow),
          note: "по дате старта" },
        { key: "done", label: "Сдали", count: doneNow.length, sum: sum(doneNow),
          note: "по факт-дате окончания" },
      ],
      // Расторжения периода — исход потока, поэтому идут вместе со стадиями.
      terminal: { label: "Расторгли", count: cancelledNow.length, sum: sum(cancelledNow) },
      // Срез «сейчас» — он про другое, поэтому и подписан отдельно.
      current: [
        { label: "Сейчас в работе", count: inWork.length, sum: sum(inWork), color: "#0f766e" },
        { label: "Сейчас на паузе", count: paused.length, sum: sum(paused), color: "#b45309" },
        { label: "Расторгнуто всего", count: cancelled.length, sum: sum(cancelled), color: "#dc2626" },
      ],
      // Списки «что именно посчиталось» — чтобы цифру можно было проверить глазами.
      signedList: brief(signedNow),
      startedList: brief(startedNow),
      doneList: brief(doneNow),
    },
  };
}

// ─── Главная точка входа ─────────────────────────────────────────────────────
export function buildAnalytics(data = {}, options = {}) {
  const { period = "all", from, to, now = Date.now(), manager = "", users = [] } = options;
  const resolveManager = makeManagerResolver(users);
  const bounds = periodBounds(period, { from, to, now });
  const idx = buildIndex(data);
  const financeTx = data.financeTx || [];

  const current = {
    sales: buildSales(idx, bounds, manager, period, resolveManager),
    backlog: buildBacklog(idx, { now }),
    production: buildProduction(idx, { ...bounds, now }),
    finance: buildFinance(idx, { ...bounds, now }, financeTx),
    quality: buildQuality(idx, { now }),
  };
  current.cash = buildCash(financeTx, data.accounts || [], {
    closingThisMonthDebt: (current.finance.receivableList || [])
      .filter(r => (current.backlog.closingThisMonthIds || []).includes(r.id))
      .reduce((s, r) => s + r.value, 0),
  });
  current.dataQuality = buildDataQuality(idx, financeTx, resolveManager, now);
  current.trend = buildTrend(idx, financeTx, now);
  current.funnels = buildFunnels(idx, bounds, period, manager, resolveManager, current.production);

  // Сравнение с предыдущим периодом. «Портфель» и «Качество» — состояние на сейчас
  // (в базе нет дат закрытия замечаний), поэтому у них сравнения нет и быть не может.
  let previous = null;
  if (bounds.prevFrom !== null) {
    const prevBounds = { from: bounds.prevFrom, to: bounds.prevTo };
    previous = {
      sales: buildSales(idx, prevBounds, manager, period, resolveManager),
      production: buildProduction(idx, { ...prevBounds, now }),
      finance: buildFinance(idx, { ...prevBounds, now }, financeTx),
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
