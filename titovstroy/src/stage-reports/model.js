// ОТЧЁТЫ ПО ЭТАПУ — чистая логика, без React, Firebase и DOM. Всё здесь покрыто
// тестами: это единственное место, где решается, что увидит клиент и кто что
// может подтверждать.
//
// Два независимых инструмента:
//   photo   — фотоотчёт по конкретной работе, для клиента;
//   payment — отчёт прораба о расчёте с бригадой, для руководителя.
//
// ХРАНЕНИЕ. Ключ — на объект: titovstroy-stage-reports-<objectId>. Значение —
// ПЛОСКИЙ МАССИВ записей, у каждой rec ("photo"/"payment"), stageId и id.
// Почему так, а не путь stageReports/photos/<объект>/<этап>/<фото> из ТЗ:
//   1) обёртка storage работает плоскими ключами — вложенные пути через «/» в
//      ней не работают, ключи санитизируются;
//   2) storage.mutateTransaction — единственная в проекте защита от гонок двух
//      устройств — умеет только массивы.
// Адресация та же (объект → этап → запись), данные лежат отдельно от смет,
// договоров, финансов и карточки производства, ничего существующего не
// перезаписывается.

export const stageReportsKey = (objectId) => "titovstroy-stage-reports-" + String(objectId || "");

export const REC_PHOTO = "photo";
export const REC_PAYMENT = "payment";

// ── ФОТО ────────────────────────────────────────────────────────────────────
// Порядок жёсткий: клиент читает историю работы сверху вниз. «В процессе» —
// самая ценная: когда стена зашита, каркас и утеплитель уже ничем не доказать.
// Подписи разные для прораба и для клиента. Прорабу нужно коротко и в его
// словах — он выбирает стадию съёмки. Клиенту «В процессе» не говорит ничего:
// он не знает, что там снимали и зачем. Ему важно, ЧТО это доказывает.
export const PHOTO_KINDS = [
  { key: "before", label: "До", hint: "как было до работы",
    clientLabel: "Как было", clientHint: "до начала работ" },
  { key: "during", label: "В процессе", hint: "скрытые работы: каркас, утеплитель, разводка",
    clientLabel: "Скрытые работы", clientHint: "каркас, утеплитель, разводка — после отделки этого уже не увидеть" },
  { key: "after", label: "После", hint: "результат",
    clientLabel: "Результат", clientHint: "как получилось" },
];
export const PHOTO_KIND_KEYS = PHOTO_KINDS.map((item) => item.key);
export const MAX_PHOTOS_PER_KIND = 30;

// Сжатие в браузере до отправки. Фото с телефона 3–5 МБ, после этого ~300 КБ:
// при трёх фото в день на три десятка объектов это разница между гигабайтом и
// десятью в месяц. Превью отдельным файлом — чтобы лента открывалась сразу.
export const FULL_MAX_SIDE = 1600;
export const FULL_QUALITY = 0.78;
export const THUMB_MAX_SIDE = 400;
export const THUMB_QUALITY = 0.72;

export const REVIEW_PENDING = "pending";
export const REVIEW_APPROVED = "approved";
export const REVIEW_REJECTED = "rejected";

// ── ОТЧЁТ О РАСЧЁТЕ ─────────────────────────────────────────────────────────
// Вид оплаты, а не «оплачено / не оплачено». Разница нужна для расхождения:
// при авансе и частичной оплате факт МЕНЬШЕ согласованного по определению, и
// показывать это как экономию — врать. Там это остаток, а не выгода.
export const PAY_MODES = [
  { key: "full", label: "Полная оплата", partial: false },
  { key: "partial", label: "Частичная", partial: true },
  { key: "advance", label: "Аванс", partial: true },
];
export const PAY_MODE_KEYS = PAY_MODES.map((item) => item.key);
// Записи, созданные до разделения видов оплаты, читаем по-старому — иначе у них
// пропала бы подпись режима.
const LEGACY_PAY_MODES = { paid: "Полная оплата", due: "Частичная" };
export const payModeMeta = (key) =>
  PAY_MODES.find((item) => item.key === key)
  || (LEGACY_PAY_MODES[key] ? { key, label: LEGACY_PAY_MODES[key], partial: key === "due" } : PAY_MODES[0]);
export const isPartialPayment = (report) => payModeMeta(report?.mode).partial === true;

// «Нужны пояснения» — не отказ: отчёт возвращается прорабу, он дописывает и
// отправляет снова, история проверки при этом не теряется.
export const REPORT_STATUSES = [
  { key: "pending", label: "На проверке", color: "#b45309", bg: "#fffbeb" },
  { key: "approved", label: "Подтверждён", color: "#047857", bg: "#ecfdf5" },
  { key: "clarify", label: "Нужны пояснения", color: "#2563eb", bg: "#eff6ff" },
  { key: "rejected", label: "Отклонён", color: "#b91c1c", bg: "#fef2f2" },
];
export const REPORT_STATUS_KEYS = REPORT_STATUSES.map((item) => item.key);
export const reportStatusMeta = (key) =>
  REPORT_STATUSES.find((item) => item.key === key) || REPORT_STATUSES[0];

export function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${uuid || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}`;
}

const num = (value) => {
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value) => String(value ?? "").trim();

// Во сколько ужать, чтобы длинная сторона стала не больше max. Апскейл не
// делаем: маленькое фото от растягивания лучше не станет, только потяжелеет.
export function fitSize(width, height, max) {
  const w = Math.max(0, Math.round(Number(width) || 0));
  const h = Math.max(0, Math.round(Number(height) || 0));
  if (!w || !h) return { width: 0, height: 0, scaled: false };
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h, scaled: false };
  const k = max / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

// ── СПИСОК ЗАПИСЕЙ ──────────────────────────────────────────────────────────
export const emptyStageReports = () => [];

// Из облака может прийти что угодно: null, старый формат, обрезанный JSON.
// Приводим к рабочей форме, отбрасывая только заведомо непригодное (без id или
// без этапа такую запись всё равно некуда показать).
export function normalizeStageReports(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => {
    if (!item || typeof item !== "object" || !text(item.id)) return false;
    // У фото этап обязателен: снимок без работы показать негде.
    if (item.rec === REC_PHOTO) return !!text(item.stageId);
    // У выплаты работа задаётся распределением. Старые записи знали один этап —
    // их читаем по stageId, ничего не переписывая в базе.
    if (item.rec === REC_PAYMENT) return paymentLines(item).length > 0;
    return false;
  });
}

// Распределение выплаты по работам. Одним чеком закрывают несколько работ:
// заплатили мастеру 300 000, из них 100 000 за демонтаж и 200 000 за остальное.
// Модель «одна выплата = одна работа» такое записать не может — чек повисал бы
// целиком на одной работе и врал.
export function paymentLines(report) {
  const raw = Array.isArray(report?.lines) ? report.lines : [];
  const out = raw
    .filter((line) => line && text(line.stageId))
    .map((line) => ({ stageId: text(line.stageId), agreed: Math.round(num(line.agreed)), fact: Math.round(num(line.fact)) }));
  if (out.length) return out;
  // Записи до появления распределения: одна работа, суммы лежали в самой записи.
  if (text(report?.stageId)) {
    return [{ stageId: text(report.stageId), agreed: Math.round(num(report.agreed)), fact: Math.round(num(report.fact)) }];
  }
  return [];
}

// Сумма чека. У старых записей отдельного поля не было — там это факт.
export const paymentAmount = (report) =>
  Math.round(num(report?.amount !== undefined && report?.amount !== null && report?.amount !== "" ? report.amount : report?.fact));
export const allocatedTotal = (report) => paymentLines(report).reduce((sum, line) => sum + line.fact, 0);
export const agreedTotal = (report) => paymentLines(report).reduce((sum, line) => sum + line.agreed, 0);
// Сколько из чека не разложено по работам. Отрицательное — разложили больше,
// чем в чеке: это ошибка ввода, и её надо показывать так же заметно.
export const unallocated = (report) => paymentAmount(report) - allocatedTotal(report);

const replaceById = (list, record) => {
  const base = normalizeStageReports(list);
  const index = base.findIndex((item) => item.id === record.id);
  if (index < 0) return [...base, record];
  const next = base.slice();
  next[index] = record;
  return next;
};

export const findRecord = (list, id) => normalizeStageReports(list).find((item) => item.id === id) || null;
export const removeRecord = (list, id) => normalizeStageReports(list).filter((item) => item.id !== id);

export const listPhotos = (list, stageId) => normalizeStageReports(list)
  .filter((item) => item.rec === REC_PHOTO && item.stageId === String(stageId || ""))
  .sort((a, b) => PHOTO_KIND_KEYS.indexOf(a.kind) - PHOTO_KIND_KEYS.indexOf(b.kind) || (a.createdAt || 0) - (b.createdAt || 0));

// Все выплаты объекта, свежие сверху.
export const listAllPayments = (list) => normalizeStageReports(list)
  .filter((item) => item.rec === REC_PAYMENT)
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

// Выплаты, которые задели конкретную работу.
export const listPayments = (list, stageId) => listAllPayments(list)
  .filter((item) => paymentLines(item).some((line) => line.stageId === String(stageId || "")));

// Сколько всего ушло по работе из всех выплат и сколько по ней согласовано.
export function stagePaymentTotals(list, stageId) {
  const key = String(stageId || "");
  let fact = 0, agreed = 0, count = 0;
  for (const report of listAllPayments(list)) {
    for (const line of paymentLines(report)) {
      if (line.stageId !== key) continue;
      fact += line.fact; agreed += line.agreed; count++;
    }
  }
  return { fact, agreed, count, over: fact - agreed };
}

export const countPhotosOfKind = (list, stageId, kind) =>
  listPhotos(list, stageId).filter((item) => item.kind === kind).length;

export const countStagePhotos = (list, stageId) => listPhotos(list, stageId).length;

// ── ФОТО ────────────────────────────────────────────────────────────────────
// Фото без этапа не существует: «просто в объект» грузить нельзя, иначе через
// месяц никто не скажет, к какой работе относится снимок.
export function validatePhoto(input = {}) {
  const errors = [];
  if (!text(input.objectId)) errors.push("Не указан объект");
  if (!text(input.stageId)) errors.push("Фото нужно привязать к этапу");
  if (!PHOTO_KIND_KEYS.includes(input.kind)) errors.push("Не выбран тип фото: до, в процессе или после");
  return errors;
}

export function makePhotoRecord(input = {}) {
  const errors = validatePhoto(input);
  if (errors.length) throw new Error(errors.join("; "));
  const now = Number(input.createdAt) || Date.now();
  return {
    rec: REC_PHOTO,
    id: text(input.id) || makeId("ph"),
    objectId: text(input.objectId),
    stageId: text(input.stageId),
    kind: input.kind,
    url: text(input.url),
    thumbUrl: text(input.thumbUrl) || text(input.url),
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    size: Number(input.size) || 0,
    note: text(input.note),
    // Прораб решает, показывать ли клиенту. По умолчанию да: он снимает именно
    // для отчёта, и лишний тап на каждом фото никто делать не станет.
    showClient: input.showClient !== false,
    review: REVIEW_PENDING,
    reviewNote: "",
    reviewedBy: "", reviewedById: "", reviewedAt: 0,
    author: text(input.author),
    authorId: text(input.authorId),
    createdAt: now,
  };
}

export function addPhoto(list, record) {
  const base = normalizeStageReports(list);
  if (countPhotosOfKind(base, record.stageId, record.kind) >= MAX_PHOTOS_PER_KIND) {
    throw new Error(`Больше ${MAX_PHOTOS_PER_KIND} фото на один тип нельзя`);
  }
  return [...base, record];
}

export function patchPhoto(list, photoId, patch) {
  const current = findRecord(list, photoId);
  if (!current || current.rec !== REC_PHOTO) return normalizeStageReports(list);
  return replaceById(list, { ...current, ...patch, rec: REC_PHOTO, id: current.id });
}

export function reviewPhoto(list, photoId, verdict, reviewer = {}) {
  if (![REVIEW_APPROVED, REVIEW_REJECTED, REVIEW_PENDING].includes(verdict)) {
    throw new Error("Неизвестное решение по фото");
  }
  return patchPhoto(list, photoId, {
    review: verdict,
    reviewedBy: text(reviewer.name),
    reviewedById: text(reviewer.id),
    reviewedAt: Date.now(),
  });
}

// Что уходит клиенту. Два условия и оба обязательны: прораб пометил «показывать
// клиенту» И руководитель подтвердил. Плюс ссылка — недогруженное фото показывать
// нельзя, клиент увидит битую картинку и решит, что работа не сделана.
export const isClientVisible = (photo) =>
  !!photo && photo.rec === REC_PHOTO && photo.showClient !== false
  && photo.review === REVIEW_APPROVED && !!photo.url;

// Снимок для клиентского кабинета: по этапам, без внутренних полей. Автор
// съёмки, решения руководителя и внутренние заметки наружу не уходят.
export function clientPhotosByStage(list) {
  const out = {};
  for (const photo of normalizeStageReports(list)) {
    if (!isClientVisible(photo)) continue;
    (out[photo.stageId] ||= []).push({
      id: photo.id,
      kind: photo.kind,
      url: photo.url,
      thumbUrl: photo.thumbUrl || photo.url,
      note: photo.note || "",
      ts: Number(photo.createdAt) || 0,
    });
  }
  for (const items of Object.values(out)) {
    items.sort((a, b) => PHOTO_KIND_KEYS.indexOf(a.kind) - PHOTO_KIND_KEYS.indexOf(b.kind) || a.ts - b.ts);
  }
  return out;
}

// Сколько фото ждёт решения руководителя. Без этого счётчика непроверенные фото
// тихо копятся, клиент не видит ничего и никто не понимает почему.
export const countAwaitingReview = (list) => normalizeStageReports(list)
  .filter((item) => item.rec === REC_PHOTO && item.showClient !== false
    && item.review === REVIEW_PENDING && !!item.url).length;

// ── РАСЧЁТ С РАБОЧИМИ ───────────────────────────────────────────────────────
export function validatePaymentReport(input = {}) {
  const errors = [];
  const lines = paymentLines({ lines: input.lines, stageId: input.stageId, agreed: input.agreed, fact: input.fact });
  if (!text(input.objectId)) errors.push("Не указан объект");
  if (!lines.length) errors.push("Выберите хотя бы одну работу");
  if (!PAY_MODE_KEYS.includes(input.mode)) errors.push("Не выбран вид оплаты: полная, частичная или аванс");
  if (!text(input.payee)) errors.push("Не указано, кому платим");
  if (!(num(input.amount ?? input.fact) > 0)) errors.push("Сумма выплаты должна быть больше нуля");
  // Разложить больше, чем в чеке, нельзя: это уже не «не дозаполнил», а ошибка,
  // из-за которой по работам пройдёт денег больше, чем реально выдано.
  const over = lines.reduce((sum, line) => sum + line.fact, 0) - Math.round(num(input.amount ?? input.fact));
  if (over > 0) errors.push(`По работам разложено на ${over.toLocaleString("ru-RU")} ₸ больше, чем в выплате`);
  return errors;
}

export function makePaymentReport(input = {}) {
  const errors = validatePaymentReport(input);
  if (errors.length) throw new Error(errors.join("; "));
  const now = Number(input.createdAt) || Date.now();
  const lines = paymentLines({ lines: input.lines, stageId: input.stageId, agreed: input.agreed, fact: input.fact });
  return {
    rec: REC_PAYMENT,
    id: text(input.id) || makeId("pr"),
    objectId: text(input.objectId),
    // Первая работа дублируется в stageId ради старых мест, которые читают
    // запись как одностадийную. Истина — в lines.
    stageId: lines[0].stageId,
    mode: input.mode,
    payee: text(input.payee),
    amount: Math.round(num(input.amount ?? input.fact)),
    lines,
    note: text(input.note),
    receipts: Array.isArray(input.receipts) ? input.receipts.filter(Boolean) : [],
    date: text(input.date) || new Date(now).toISOString().slice(0, 10),
    author: text(input.author),
    authorId: text(input.authorId),
    status: "pending",
    reviewNote: "",
    reviewedBy: "", reviewedById: "", reviewedAt: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// Отклонение = разложено по работам − согласовано по этим же работам. Ради этой
// строки всё и делается: нашли бригаду за 150, отчитались за 250 — разница видна.
export const paymentDeviation = (report) => allocatedTotal(report) - agreedTotal(report);
// Переплата — всегда повод для разговора, при любом виде оплаты.
export const isOverpaid = (report) => paymentDeviation(report) > 0;
// Сколько ещё осталось отдать. Считаем только для аванса и частичной: при полной
// оплате недобор — это экономия, а не долг перед бригадой.
export const paymentRemainder = (report) => {
  if (!isPartialPayment(report)) return 0;
  return Math.max(0, agreedTotal(report) - allocatedTotal(report));
};

// Разложить сумму по работам пропорционально их себестоимости из сметы. Остаток
// от округления добрасываем в самую крупную строку, иначе итог не сойдётся с
// чеком на копейки и человек будет искать ошибку там, где её нет.
export function allocateByPlan(stages = [], amount = 0) {
  const rows = (Array.isArray(stages) ? stages : [])
    .map((stage) => ({ stageId: text(stage?.id ?? stage?.stageId), plan: Math.max(0, Math.round(num(stage?.costPlan ?? stage?.agreed))) }))
    .filter((row) => row.stageId);
  const total = Math.round(num(amount));
  if (!rows.length || total <= 0) return rows.map((row) => ({ stageId: row.stageId, agreed: row.plan, fact: 0 }));
  const planSum = rows.reduce((sum, row) => sum + row.plan, 0);
  const out = planSum > 0
    ? rows.map((row) => ({ stageId: row.stageId, agreed: row.plan, fact: Math.floor(total * row.plan / planSum) }))
    : rows.map((row, index) => ({ stageId: row.stageId, agreed: row.plan, fact: Math.floor(total / rows.length) + (index === 0 ? total % rows.length : 0) }));
  const rest = total - out.reduce((sum, row) => sum + row.fact, 0);
  if (rest !== 0 && out.length) {
    let biggest = 0;
    for (let i = 1; i < out.length; i++) if (out[i].fact > out[biggest].fact) biggest = i;
    out[biggest].fact += rest;
  }
  return out;
}

export const addPaymentReport = (list, report) => [...normalizeStageReports(list), report];

export function patchPaymentReport(list, reportId, patch) {
  const current = findRecord(list, reportId);
  if (!current || current.rec !== REC_PAYMENT) return normalizeStageReports(list);
  return replaceById(list, { ...current, ...patch, rec: REC_PAYMENT, id: current.id, updatedAt: Date.now() });
}

// Свой отчёт не подтверждают. В этом весь смысл проверки: иначе прораб закрывает
// сам себя и контроль превращается в формальность.
export function canReviewPayment(report, user, permissions = {}) {
  if (!report || !user) return false;
  if (String(report.authorId || "") === String(user.id || "")) return false;
  return permissions.canReview === true;
}

export function reviewPaymentReport(list, reportId, verdict, reviewer = {}, comment = "") {
  if (!REPORT_STATUS_KEYS.includes(verdict) || verdict === "pending") {
    throw new Error("Неизвестное решение по отчёту");
  }
  return patchPaymentReport(list, reportId, {
    status: verdict,
    reviewNote: text(comment),
    reviewedBy: text(reviewer.name),
    reviewedById: text(reviewer.id),
    reviewedAt: Date.now(),
  });
}

// Сводка по объекту для руководителя: сколько ждёт проверки и на какую сумму
// расхождение. Отдельно переплаты — именно они повод для разговора.
export function summarizePayments(list) {
  let pending = 0, overpaid = 0, deviation = 0, total = 0, loose = 0, paid = 0;
  for (const report of listAllPayments(list)) {
    total++;
    paid += paymentAmount(report);
    if (report.status === "pending") pending++;
    const delta = paymentDeviation(report);
    if (delta > 0) { overpaid++; deviation += delta; }
    const rest = unallocated(report);
    if (rest !== 0) loose += Math.abs(rest);
  }
  return { total, pending, overpaid, deviation, loose, paid };
}
