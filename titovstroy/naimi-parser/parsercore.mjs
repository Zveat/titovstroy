import { OLX_REPAIR_CATEGORIES } from "../src/masters/catalog.mjs";

export { OLX_REPAIR_CATEGORIES };

const DAY = 24 * 60 * 60 * 1000;

const normalizeIds = (ids) => String(Array.isArray(ids) ? ids.join(",") : ids || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export function expandOlxCategoryIds(ids) {
  const selected = normalizeIds(ids);
  if (!selected.includes("188")) return [...new Set(selected)];
  return OLX_REPAIR_CATEGORIES.map((item) => item.id);
}

const parsedTime = (value) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
};

export function selectPhoneTargets(items, {
  limit,
  now = Date.now(),
  unavailableRetryMs = 7 * DAY,
  retryDelayMs = 6 * 60 * 60 * 1000,
} = {}) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (!cap) return [];

  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      if (!item || item.phone) return false;
      const checkedAt = parsedTime(item.phoneCheckedAt);
      if (!checkedAt) return true;
      const wait = item.phoneStatus === "unavailable" ? unavailableRetryMs : retryDelayMs;
      return now - checkedAt >= wait;
    })
    .sort((a, b) => {
      const aChecked = parsedTime(a.phoneCheckedAt);
      const bChecked = parsedTime(b.phoneCheckedAt);
      if (!aChecked && bChecked) return -1;
      if (aChecked && !bChecked) return 1;
      if (aChecked !== bChecked) return aChecked - bChecked;
      return (Number(b.score ?? b.rating) || 0) - (Number(a.score ?? a.rating) || 0)
        || (Number(b.reviews) || 0) - (Number(a.reviews) || 0);
    })
    .slice(0, cap);
}

const phoneDigits = (value) => String(value || "").replace(/\D/g, "");

export function applyPhoneAttempt(master, result, checkedAt = Date.now()) {
  const next = { ...(master || {}) };
  const status = result?.status || "retry";
  next.phoneCheckedAt = new Date(checkedAt).toISOString();
  next.phoneAttempts = (Number(next.phoneAttempts) || 0) + 1;
  next.phoneStatus = status;
  next.phoneError = result?.error ? String(result.error).slice(0, 240) : "";
  if (status === "found") {
    const phone = phoneDigits(result?.phone);
    if (phone) next.phone = phone;
    next.phoneError = "";
  }
  return next;
}

const masterKey = (item) => `${item?.source || ""}:${item?.extId || ""}`;
const PHONE_FIELDS = ["phone", "phoneStatus", "phoneCheckedAt", "phoneAttempts", "phoneError"];

export function mergeFreshSnapshot(existing, fresh, { now = Date.now(), complete = true } = {}) {
  const seenAt = new Date(now).toISOString();
  const oldByKey = new Map((Array.isArray(existing) ? existing : []).map((item) => [masterKey(item), item]));
  const result = [];
  const seen = new Set();

  for (const current of Array.isArray(fresh) ? fresh : []) {
    if (!current || !current.source || !current.extId) continue;
    const key = masterKey(current);
    if (seen.has(key)) continue;
    seen.add(key);
    const previous = oldByKey.get(key) || {};
    const merged = {
      ...previous,
      ...current,
      active: true,
      firstSeenAt: previous.firstSeenAt || previous.collectedAt || current.collectedAt || seenAt,
      lastSeenAt: seenAt,
    };
    for (const field of PHONE_FIELDS) {
      if ((current[field] === undefined || current[field] === null || current[field] === "") && previous[field] != null) {
        merged[field] = previous[field];
      }
    }
    result.push(merged);
  }

  for (const previous of Array.isArray(existing) ? existing : []) {
    const key = masterKey(previous);
    if (seen.has(key)) continue;
    result.push(complete ? { ...previous, active: false } : { ...previous });
  }
  return result;
}

export function parseStoredJson(value, { key = "данные", empty = null } = {}) {
  if (value === null || value === undefined) return empty;
  if (typeof value === "string") {
    try { return JSON.parse(value); }
    catch (error) { throw new Error(`${key}: повреждён JSON (${error.message})`); }
  }
  if (typeof value === "object") return value;
  throw new Error(`${key}: неожиданный тип данных ${typeof value}`);
}

// ── ОЧЕРЕДЬ ДОБОРА НОМЕРОВ ────────────────────────────────────────────────────
//
// ЗАЧЕМ. Телефоны OLX и naimi отдают порциями, поэтому парсер заходит за ними часто —
// каждые полчаса. Раньше такой заход читал ВСЮ базу мастеров (мегабайты), хотя нужны ему
// только те, у кого номера ещё нет: ~160 МБ трафика Firebase в сутки на пустом месте.
//
// ТЕПЕРЬ полный обход выкладывает компактную очередь — по одной строке на кандидата, только
// те поля, которые реально нужны для выбора и отметки попытки. Заход за номерами читает
// очередь (сотня килобайт вместо мегабайтов), а собранное складывает отдельным результатом.
// Полный обход потом вносит результаты в базу и пересобирает очередь.
//
// Ключ записи — «source:extId», тот же, по которому склеивается снимок.
export const phoneQueueKey = (item) => `${item?.source || ""}:${item?.extId || ""}`;

// Кандидат — активный мастер, у которого объявление обещает номер, а номера ещё нет.
export function buildPhoneQueue(items) {
  const out = [];
  for (const m of Array.isArray(items) ? items : []) {
    if (!m || m.active === false || m.phone) continue;
    if (!m.hasPhoneFlag) continue;
    const offerId = m.phoneOfferId || m.offerId;
    if (!offerId || !m.source || !m.extId) continue;
    const row = { k: phoneQueueKey(m), o: String(offerId) };
    // Поля ниже нужны selectPhoneTargets: по ним считается очередь и пауза перед повтором.
    if (m.phoneCheckedAt) row.c = m.phoneCheckedAt;
    if (m.phoneStatus) row.s = m.phoneStatus;
    if (Number(m.phoneAttempts)) row.a = Number(m.phoneAttempts);
    if (Number(m.score ?? m.rating)) row.p = Number(m.score ?? m.rating);
    if (Number(m.reviews)) row.r = Number(m.reviews);
    out.push(row);
  }
  return out;
}

// Компактная строка очереди → объект в том виде, какой понимают selectPhoneTargets
// и applyPhoneAttempt. Обратное преобразование — queueRowFromTarget.
export const queueRowToTarget = (row) => ({
  key: row?.k || "", offerId: row?.o || "", phoneOfferId: row?.o || "",
  phone: "", phoneCheckedAt: row?.c || null, phoneStatus: row?.s || "",
  phoneAttempts: Number(row?.a) || 0, score: Number(row?.p) || 0, reviews: Number(row?.r) || 0,
});

export function queueRowFromTarget(target) {
  const row = { k: target?.key || "", o: String(target?.offerId || "") };
  if (target?.phoneCheckedAt) row.c = target.phoneCheckedAt;
  if (target?.phoneStatus) row.s = target.phoneStatus;
  if (Number(target?.phoneAttempts)) row.a = Number(target.phoneAttempts);
  if (Number(target?.score)) row.p = Number(target.score);
  if (Number(target?.reviews)) row.r = Number(target.reviews);
  return row;
}

// Внести собранные номера в базу мастеров. results — { "source:extId": {phone, phoneStatus, ...} }.
// Возвращает новый список и сколько записей реально изменилось: по этому числу видно,
// была ли работа, и не пишем базу впустую.
export function applyPhoneResults(items, results) {
  const patches = results && typeof results === "object" && !Array.isArray(results) ? results : {};
  let applied = 0;
  const out = (Array.isArray(items) ? items : []).map((m) => {
    const patch = patches[phoneQueueKey(m)];
    if (!patch || typeof patch !== "object") return m;
    // Номер, добытый вручную или прошлым прогоном, НЕ перетираем пустым результатом.
    if (m.phone && !patch.phone) return m;
    applied += 1;
    return { ...m, ...patch };
  });
  return { items: out, applied };
}
