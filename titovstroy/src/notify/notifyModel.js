// УВЕДОМЛЕНИЯ В TELEGRAM — чистая логика: что считать событием, как это назвать
// по-русски и кому отправить. Здесь НЕТ ни сети, ни базы, ни Telegram — только
// функции над данными. Поэтому её целиком покрывают тесты, а сам отправщик
// (notify/send.mjs, GitHub Actions) остаётся тонкой обёрткой.
//
// ПОЧЕМУ ЖУРНАЛ, А НЕ ПЕРЕХВАТ ДЕЙСТВИЙ В ПРИЛОЖЕНИИ. Приложение уже пишет в
// журнал всё, что делает человек. Ловить события в самом коде сохранения — это
// лезть в пути записи боевых данных ради уведомлений: цена ошибки — потерянная
// смета, а выигрыш — минута скорости. Журнал даёт то же самое со стороны и
// ничего не может испортить.
//
// ЧТО СЧИТАЕМ СОБЫТИЕМ. За три месяца в журнале 142 записи, из них 39 — обычные
// входы в систему и десятки — правка прав пачкой. Если слать всё подряд, канал
// перестанут читать на второй день. Ниже — список того, что действительно
// стоит сообщения, остальное молча пропускается.

// ─── НАПРАВЛЕНИЯ ──────────────────────────────────────────────────────────────
export const NOTIFY_TOPICS = Object.freeze([
  { key: "objects", icon: "🏗", label: "Объекты и сроки",
    hint: "подписание, приближение старта и сдачи, просрочки" },
  { key: "digest", icon: "📈", label: "Сводки руководителю",
    hint: "итоги недели и месяца одним сообщением" },
]);
export const NOTIFY_TOPIC_KEYS = Object.freeze(NOTIFY_TOPICS.map(t => t.key));
export const NOTIFY_TOPIC_BY_KEY = Object.freeze(
  Object.fromEntries(NOTIFY_TOPICS.map(t => [t.key, t]))
);

// Часовой пояс компании. Казахстан с 2024 года весь на UTC+5, перевода часов нет,
// поэтому фиксированное смещение честнее возни с базой часовых поясов в Actions.
export const TZ_OFFSET_MIN = 5 * 60;

// ─── МЕЛОЧИ ───────────────────────────────────────────────────────────────────
const S = (v) => (v === null || v === undefined ? "" : String(v));
const low = (v) => S(v).toLowerCase();
const trim = (v) => S(v).trim();

// Местное время из метки времени. Нужно и для «во сколько это было», и для
// тихих часов, и для ключа дня у ежедневной сводки.
export function localParts(ts, offsetMin = TZ_OFFSET_MIN) {
  const d = new Date(Number(ts || 0) + offsetMin * 60000);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hh: d.getUTCHours(), mm: d.getUTCMinutes(),
  };
}
export function localDayKey(ts, offsetMin = TZ_OFFSET_MIN) {
  const p = localParts(ts, offsetMin);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
export function localTimeLabel(ts, offsetMin = TZ_OFFSET_MIN) {
  const p = localParts(ts, offsetMin);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}
const MONTHS_RU = ["января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря"];
export function localDateLabel(ts, offsetMin = TZ_OFFSET_MIN) {
  const p = localParts(ts, offsetMin);
  return `${p.d} ${MONTHS_RU[p.m - 1]}`;
}
// «12 дней» / «1 день» / «22 дня» — без этого сообщения читаются как машинные.
export function plural(n, one, few, many) {
  const a = Math.abs(Number(n) || 0) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const daysWord = (n) => `${n} ${plural(n, "день", "дня", "дней")}`;

// Telegram парсит HTML — сырые < & в именах клиентов ломали бы сообщение целиком.
export function esc(v) {
  return S(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// НАЗВАНИЕ ЗАПИСИ. В боевом журнале встречаются записи с пустым label — объект
// завели без имени, пользователя создали до ввода ФИО. Без запасного варианта
// в чат уходило «➕ Новый объект» вообще без объекта и «Учётная запись «»»:
// сообщение есть, смысла нет. Проверено на реальных записях.
export function nameOf(entry) {
  const v = trim(entry?.label) || trim(entry?.detail) || trim(entry?.entityId);
  return esc(v || "без названия");
}

// ─── ТИХИЕ ЧАСЫ ───────────────────────────────────────────────────────────────
// Ночью не пишем никому: строитель, разбуженный в 3:40 сообщением «смета
// согласована», отключит бота и больше не включит. Событие не теряется —
// оно уйдёт первым же прогоном после наступления утра.
export function inQuietHours(ts, settings = {}) {
  const from = Number.isFinite(+settings.quietFrom) ? +settings.quietFrom : 22;
  const to = Number.isFinite(+settings.quietTo) ? +settings.quietTo : 8;
  if (from === to) return false;                       // тишина выключена
  const h = localParts(ts).hh;
  return from < to ? (h >= from && h < to) : (h >= from || h < to);
}

// ─── ПРАВИЛА: КАКАЯ ЗАПИСЬ ЖУРНАЛА СТАНОВИТСЯ СООБЩЕНИЕМ ──────────────────────
// Каждое правило: на что смотрим (entity + что в action/field) → направление,
// значок и как назвать по-русски. Порядок важен: берётся первое подошедшее.
const RULES = [
  // ЕДИНСТВЕННОЕ событие из журнала — подписание договора. Владелец назвал его
  // прямо, остальные (смена любого статуса, правки смет, удаления, админка,
  // деньги, акты, этапы) убраны по его же просьбе: «убери лишние, оставь что
  // я просил». Механика ловли их всех сохранена в истории — вернуть любое
  // означает добавить сюда строку и строку в каталог ниже, не больше.
  { key: "contract_signed", entity: "object", field: /статус/, topic: "objects", icon: "📝",
    when: (e) => /подписан/i.test(S(e?.new)),
    title: (e) => `Договор подписан — ${nameOf(e)}`,
    body: (e) => `${esc(e.old) || "—"} → <b>${esc(e.new)}</b>` },
];

// СПИСОК ДЛЯ АДМИНКИ. Ровно то, что владелец просил, и ни строкой больше.
//
// Путь сюда был такой. Сначала список собирался из правил один-в-один — вышло
// 29 строк, и владелец сказал: «дохера всяких». Тогда близкое слили в общие
// строки вроде «Админка и безопасность» — и он ответил точнее: «ты всё равно
// сильно обобщаешь, как я должен понять какое конкретно и почему придёт».
// Оба раза он прав, и вывод один: строк должно быть мало И каждая должна
// объяснять себя сама. Поэтому у каждой есть what (что придёт) и when (когда
// сработает) — экран показывает их прямо под названием.
export const NOTIFY_EVENTS = Object.freeze([
  { key: "contract_signed", icon: "📝", topic: "objects", kind: "event",
    label: "Договор подписан",
    when: "как только статус объекта сменили на «Договор подписан»",
    what: "клиент, кто перевёл, плановые даты старта и сдачи, ответственный прораб" },
]);

// ─── ФИЛЬТР ПО ОБЪЕКТАМ ───────────────────────────────────────────────────────
// Зачем: половина объектов в базе через производство ещё не ведётся — их не
// начали вести, а не забросили. Без этого фильтра ежедневная сводка вываливала
// бы по ним «тишина 47 дней» и читать её перестали бы в первую неделю.
//   all    — по всем объектам
//   only   — ТОЛЬКО по отмеченным (белый список): включаем объекты по мере того,
//            как их реально берут в работу. Пустой список = полная тишина.
//   except — по всем, КРОМЕ отмеченных (чёрный список)
// Сообщения, не привязанные к объекту (права, пользователи, прайс), фильтр не
// трогает: иначе, отметив один объект, владелец случайно выключил бы себе всю
// безопасность.
export const OBJECT_MODES = Object.freeze([
  { key: "all", label: "По всем объектам", hint: "как есть: любой объект в базе" },
  { key: "only", label: "Только по отмеченным", hint: "тишина по умолчанию, включаем по мере запуска" },
  { key: "except", label: "По всем, кроме отмеченных", hint: "глушим отдельные объекты" },
]);
export function objectAllowed(objectId, settings = {}) {
  const id = trim(objectId);
  if (!id) return true;
  const mode = settings.objectMode || "all";
  const list = Array.isArray(settings.objectList) ? settings.objectList.map(trim) : [];
  if (mode === "only") return list.includes(id);
  if (mode === "except") return !list.includes(id);
  return true;
}

// Одна запись журнала → сообщение (или null, если это шум либо выключено).
export function auditMessage(entry, settings = {}) {
  if (!entry || typeof entry !== "object") return null;
  const entity = trim(entry.entity);
  for (const rule of RULES) {
    if (rule.entity !== entity) continue;
    if (rule.action && !rule.action.test(low(entry.action))) continue;
    if (rule.field && !rule.field.test(low(entry.field))) continue;
    if (rule.when && !rule.when(entry)) return null;
    if (rule.drop) return null;
    if (!objectAllowed(entry.objectId, settings)) return null;
    return {
      id: auditDedupId(entry),
      ts: Number(entry.ts) || 0,
      topic: rule.topic,
      key: rule.key,
      event: rule.key,
      icon: rule.icon,
      title: rule.title(entry),
      body: rule.body(entry),
      by: trim(entry.by),
      objectId: trim(entry.objectId),
      entity,
      // Для группировки пачек: 30 правок прав одной роли — одно сообщение.
      groupKey: `${entity}|${trim(entry.action)}|${trim(entry.by)}|${trim(entry.label)}`,
    };
  }
  return null;                                   // сущность без правила — не шлём
}

export function auditDedupId(entry) {
  return [entry?.ts, entry?.entity, entry?.entityId, entry?.field, entry?.action]
    .map(v => S(v).replace(/\s+/g, "_")).join("~");
}

// ─── СВОРАЧИВАНИЕ ПАЧЕК ───────────────────────────────────────────────────────
// Сохранение матрицы прав пишет в журнал по записи на КАЖДОЕ право — в базе
// лежит пачка из 30+ записей с одной секундой. Тридцать сообщений подряд про
// одну и ту же операцию — это отписка от бота, поэтому пачка становится одной
// строкой «изменил 30 прав».
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const GROUP_MIN = 3;
export function groupMessages(messages) {
  const out = [];
  const byKey = new Map();
  for (const m of messages) {
    const bucket = byKey.get(m.groupKey);
    if (bucket && m.ts - bucket.lastTs <= GROUP_WINDOW_MS) {
      bucket.items.push(m); bucket.lastTs = m.ts; continue;
    }
    const fresh = { items: [m], lastTs: m.ts };
    byKey.set(m.groupKey, fresh);
    out.push(fresh);
  }
  return out.map(({ items }) => {
    if (items.length < GROUP_MIN) return items;
    const first = items[0];
    // Глагол берём из самого действия. Пачка удалений, подписанная «изменено», —
    // это неправда в сообщении о том, что данные пропали (ловили на 15 актах).
    const act = low(first.groupKey.split("|")[1] || "");
    // [одна штука, много штук, счётные формы существительного]
    const verb = /удал/.test(act) ? ["удалена", "удалено", "запись", "записи", "записей"]
      : /(созда|добав)/.test(act) ? ["добавлена", "добавлено", "запись", "записи", "записей"]
      : ["изменён", "изменено", "пункт", "пункта", "пунктов"];
    const head = items.length === 1 ? verb[0] : verb[1];
    // Названия повторяются («avr, avr, avr…») — показываем только разные.
    const names = [...new Set(items
      .map(i => i.body.replace(/<[^>]*>/g, "").split(":")[0].split("\n")[0].trim())
      .filter(Boolean))];
    const shown = names.slice(0, 6).join(", ");
    return [{
      ...first,
      id: `${first.id}~x${items.length}`,
      body: `${head} <b>${items.length}</b> ${plural(items.length, verb[2], verb[3], verb[4])}`
        + (shown ? `\n<i>${esc(shown)}${names.length > 6 ? "…" : ""}</i>` : ""),
      grouped: items.length,
    }];
  }).flat();
}

// ─── СОБЫТИЯ ИЗ ЖУРНАЛА ───────────────────────────────────────────────────────
// ПОЧЕМУ СООБЩЕНИЕ О ПОДПИСАНИИ ДОПОЛНЯЕТСЯ ДАТАМИ. «Договор подписан» без дат —
// это половина новости: следом сразу возникает вопрос «а когда выходить». Даты
// уже лежат в карточке производства, дотянуть их сюда стоит одну строку, а
// человеку не надо лезть в сервис, чтобы понять, что делать дальше.
function eventExtras(msg, entry, ctx) {
  if (!ctx || !msg.objectId) return "";
  const prod = ctx.prodBy?.get(msg.objectId);
  if (!prod) return "";
  const rows = [];
  if (msg.key === "contract_signed") {
    if (prod.startDate) rows.push(`старт работ: <b>${esc(dateRu(prod.startDate))}</b>`);
    if (prod.planEndDate) rows.push(`сдача по плану: <b>${esc(dateRu(prod.planEndDate))}</b>`);
    if (!rows.length) rows.push("<i>даты старта и сдачи не заполнены</i>");
    if (prod.responsible) rows.push(`ответственный: ${esc(prod.responsible)}`);
  }
  return rows.length ? "\n" + rows.join("\n") : "";
}
export function dateRu(v) {
  const t = v ? new Date(v).getTime() : NaN;
  if (!Number.isFinite(t)) return S(v);
  const p = localParts(t, 0);
  return `${p.d} ${MONTHS_RU[p.m - 1]} ${p.y}`;
}

export function buildEventMessages(entries = [], { sinceTs = 0, sentIds = {}, settings = {}, context = null } = {}) {
  const fresh = (Array.isArray(entries) ? entries : [])
    .filter(e => Number(e?.ts) > Number(sinceTs || 0))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const mapped = [];
  for (const e of fresh) {
    const m = auditMessage(e, settings);
    if (!m || sentIds[m.id]) continue;
    const extra = eventExtras(m, e, context);
    mapped.push(extra ? { ...m, body: m.body + extra } : m);
  }
  return groupMessages(mapped);
}

// Готовит справочники для дополнения сообщений (карточки производства по объекту).
export function makeEventContext({ productions = [] } = {}) {
  const prodBy = new Map();
  for (const p of productions || []) if (p && p.objectId) prodBy.set(p.objectId, p);
  return { prodBy };
}

export function renderEvent(msg) {
  const when = msg.ts ? localTimeLabel(msg.ts) : "";
  const who = msg.by ? esc(msg.by) : "";
  const foot = [who, when].filter(Boolean).join(" · ");
  return `${msg.icon} <b>${msg.title}</b>\n${msg.body}${foot ? `\n<i>${foot}</i>` : ""}`;
}

// ─── НАПОМИНАНИЯ ──────────────────────────────────────────────────────────────
// Считаются НЕ из журнала, а из тех же чисел, что показывает «Главная»
// (buildAnalytics). Смысл в том, что журнал знает только про сделанное, а
// молчащий объект и просроченный этап — это как раз про НЕ сделанное: в журнале
// их нет по определению, и без напоминаний они тихо тонут.
const REMINDER_LIMIT = 12;

// ПОЧЕМУ КЛЮЧ СЧИТАЕТСЯ ПО СОСТАВУ, А НЕ ПО ДАТЕ. Первая версия помечала сводку
// днём — и «объект молчит 47 дней» приходило каждое утро, назавтра «48 дней», и
// так месяц. Это ровно тот случай, когда уведомления отключают. Ключ считается
// по СОСТАВУ списка (какие именно объекты), а счётчик дней в него не входит.
// Пока список тот же — сводка не повторяется; появился новый объект или ушёл
// старый — приходит сразу. Плюс раз в неделю напоминание всё же повторяется,
// чтобы забытое не выпало из виду совсем (см. repeatAfterDays в отправщике).
function fingerprint(parts) {
  const s = parts.filter(Boolean).map(v => S(v)).sort().join("|");
  let hA = 0x811c9dc5, hB = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    hA = (hA ^ s.charCodeAt(i)) >>> 0; hA = (hA * 16777619) >>> 0;
    hB = (hB + s.charCodeAt(i) * (i + 7)) >>> 0;
  }
  return `${hA.toString(36)}${hB.toString(36)}`;
}
const idsOf = (items) => items.map(x => S(x.id || x.objectId || x.name));

// Напоминания — тоже отдельными выключателями, и у каждого свой порог. Пороги
// важнее выключателей: «молчит больше 14 дней» и «больше 45» — это разговор
// про разные объекты, а не про громкость.
export const NOTIFY_REMINDERS = Object.freeze([
  { key: "stages", icon: "⏰", topic: "objects", kind: "reminder", def: true,
    label: "Просроченные этапы",
    when: "раз в сутки, если плановая дата этапа прошла, а этап не закрыт",
    what: "список: этап, объект, сколько дней горит, ответственный",
    threshold: { field: "minDays", label: "просрочка от", unit: "дн.", def: 0, max: 180 } },
  { key: "stale", icon: "🔇", topic: "objects", kind: "reminder", def: true,
    label: "Объекты без движения",
    when: "раз в сутки, если в карточке производства ничего не меняли дольше порога",
    what: "список: объект, сколько дней тишина, ответственный",
    threshold: { field: "minDays", label: "тишина от", unit: "дн.", def: 14, max: 365 } },
]);

export function reminderOn(key, settings) {
  const cfg = settings?.reminders?.[key];
  if (cfg && Object.prototype.hasOwnProperty.call(cfg, "on")) return !!cfg.on;
  const known = NOTIFY_REMINDERS.find(r => r.key === key) || DATE_REMINDERS.find(r => r.key === key);
  return !!known?.def;
}
export function reminderNum(key, field, settings) {
  const v = Number(settings?.reminders?.[key]?.[field]);
  if (Number.isFinite(v) && v >= 0) return v;
  return Number(NOTIFY_REMINDERS.find(r => r.key === key)?.threshold?.def) || 0;
}

export function buildReminderMessages(analytics = {}, { now = Date.now(), settings = {} } = {}) {
  const prod = analytics.production || {};
  const backlog = analytics.backlog || {};
  const finance = analytics.finance || {};
  const day = localDateLabel(now);
  const out = [];
  // Строки, попавшие под глушение объекта, до текста сообщения не доходят —
  // не «приходят серым», а не приходят вовсе.
  const keep = (list) => (list || []).filter(x => objectAllowed(x.objectId || x.id, settings));

  const overdue = reminderOn("stages", settings)
    ? keep(prod.overdueStageList).filter(x => (Number(x.days) || 0) >= reminderNum("stages", "minDays", settings))
    : [];
  if (overdue.length) {
    out.push({
      id: `rem~stages~${fingerprint(idsOf(overdue))}`,
      key: "stages", topic: "production", kind: "reminder",
      person: null,
      lines: overdue,
      text: block(`🛠 <b>Просроченные этапы</b> · ${day}`, overdue.map(x =>
        `• ${esc(x.name)} — <b>${daysWord(x.days)}</b>${x.manager ? ` · ${esc(x.manager)}` : ""}`)),
    });
    // То же самое, но адресно: каждому — только его этапы.
    for (const [person, items] of byPerson(overdue)) {
      out.push({
        id: `rem~stages~${fingerprint([person, ...idsOf(items)])}`,
        key: "stages", topic: "production", kind: "reminder", person,
        text: block(`🛠 <b>Ваши просроченные этапы</b> · ${day}`, items.map(x =>
          `• ${esc(x.name)} — <b>${daysWord(x.days)}</b>`)),
      });
    }
  }

  const stale = reminderOn("stale", settings)
    ? keep(prod.staleObjects).filter(x => (Number(x.days) || 0) >= reminderNum("stale", "minDays", settings))
    : [];
  if (stale.length) {
    out.push({
      id: `rem~stale~${fingerprint(idsOf(stale))}`,
      key: "stale", topic: "production", kind: "reminder", person: null,
      text: block(`🔇 <b>Объекты без движения</b> · ${day}`, stale.map(x =>
        `• ${esc(x.name)} — тишина <b>${daysWord(x.days)}</b>${x.manager ? ` · ${esc(x.manager)}` : ""}`)),
    });
    for (const [person, items] of byPerson(stale)) {
      out.push({
        id: `rem~stale~${fingerprint([person, ...idsOf(items)])}`,
        key: "stale", topic: "production", kind: "reminder", person,
        text: block(`🔇 <b>Ваши объекты без движения</b> · ${day}`, items.map(x =>
          `• ${esc(x.name)} — тишина <b>${daysWord(x.days)}</b>`)),
      });
    }
  }

  return out;
}

function byPerson(items) {
  const map = new Map();
  for (const it of items) {
    const who = trim(it.manager);
    if (!who) continue;
    if (!map.has(who)) map.set(who, []);
    map.get(who).push(it);
  }
  return [...map.entries()];
}
function block(head, lines) {
  const shown = lines.slice(0, REMINDER_LIMIT);
  const more = lines.length - shown.length;
  return `${head}\n${shown.join("\n")}${more > 0 ? `\n<i>…и ещё ${more}</i>` : ""}`;
}
export function tenge(v) {
  const n = Math.round(Number(v) || 0);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₸`;
}

// ─── НАПОМИНАНИЯ ПО ДАТАМ: СТАРТ И СДАЧА ──────────────────────────────────────
// Это принципиально другой вид, чем всё выше. Журнал и просрочки говорят про
// прошлое — «сделали» и «не сделали вовремя». Здесь про БУДУЩЕЕ: через три дня
// выходить на объект, через пять — сдавать. Такое напоминание единственное, что
// вообще способно предотвратить срыв, а не сообщить о нём задним числом.
//
// За сколько дней предупреждать — задаётся списком, потому что «за 3 и за 1» и
// «за 10, 5 и 2» это разные разговоры: первый про «собрать бригаду», второй про
// «успеть закрыть хвосты».
export const DATE_REMINDERS = Object.freeze([
  { key: "start_soon", icon: "🚀", topic: "objects", kind: "dates", def: true,
    label: "Скоро старт работ", field: "startDate", defDays: [3, 2, 1],
    when: "за 3, 2 и 1 день до плановой даты начала работ (дни настраиваются)",
    what: "список объектов: у кого когда старт, ответственный",
    head: "Старт работ" },
  { key: "handover_soon", icon: "🏁", topic: "objects", kind: "dates", def: true,
    label: "Скоро сдача объекта", field: "planEndDate", defDays: [10, 5, 4, 2],
    when: "за 10, 5, 4 и 2 дня до плановой даты сдачи (дни настраиваются)",
    what: "список объектов: у кого когда сдача, ответственный",
    head: "Сдача объекта" },
]);

// Статусы, при которых напоминать не о чем: сделка не состоялась или всё закрыто.
const DEAD_STATUS = new Set(["refuse", "done", "cancel", "archive"]);

export function reminderDays(key, settings) {
  const raw = settings?.reminders?.[key]?.days;
  const def = DATE_REMINDERS.find(r => r.key === key)?.defDays || [];
  if (!Array.isArray(raw)) return def;
  const list = [...new Set(raw.map(v => Math.trunc(Number(v))).filter(v => Number.isFinite(v) && v >= 0 && v <= 90))];
  return list.sort((a, b) => b - a);
}
function dayStart(ts, offsetMin = TZ_OFFSET_MIN) {
  const d = new Date(Number(ts) + offsetMin * 60000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offsetMin * 60000;
}
// Сколько ПОЛНЫХ дней осталось. Считаем по календарным суткам, а не по 24 часам:
// иначе «завтра в 9 утра» в семь вечера превращалось бы в «через 0 дней».
export function daysUntil(dateValue, now = Date.now()) {
  const t = dateValue ? new Date(dateValue).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.round((dayStart(t) - dayStart(now)) / 86400000);
}

export function buildDateReminders({ objects = [], productions = [] } = {}, { now = Date.now(), settings = {} } = {}) {
  const prodBy = new Map();
  for (const p of productions || []) if (p && p.objectId) prodBy.set(p.objectId, p);
  const out = [];

  for (const rule of DATE_REMINDERS) {
    if (!reminderOn(rule.key, settings)) continue;
    const days = reminderDays(rule.key, settings);
    if (!days.length) continue;
    const hits = [];
    for (const o of objects || []) {
      if (!o || o.deletedAt) continue;
      if (!objectAllowed(o.id, settings)) continue;
      const prod = prodBy.get(o.id);
      if (!prod) continue;
      // Уже сдан — ни про старт, ни про сдачу говорить не о чем.
      if (prod.factEndDate) continue;
      const status = trim(prod.prodStatus) || trim(o.status);
      if (DEAD_STATUS.has(status)) continue;
      const left = daysUntil(prod[rule.field], now);
      if (left === null || !days.includes(left)) continue;
      hits.push({
        objectId: o.id,
        name: trim(o.clientName) || trim(o.address) || "Без названия",
        manager: trim(prod.responsible) || trim(o.manager),
        left,
      });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a.left - b.left);
    const line = (x) => `• ${esc(x.name)} — ${x.left === 0 ? "<b>сегодня</b>"
      : x.left === 1 ? "<b>завтра</b>" : `через <b>${daysWord(x.left)}</b>`}`;
    out.push({
      id: `${rule.key}~${fingerprint(hits.map(x => `${x.objectId}:${x.left}`))}`,
      key: rule.key, topic: rule.topic, kind: "reminder", person: null,
      text: block(`${rule.icon} <b>${rule.head}</b> · ${localDateLabel(now)}`,
        hits.map(x => `${line(x)}${x.manager ? ` · ${esc(x.manager)}` : ""}`)),
    });
    for (const [person, items] of byPerson(hits)) {
      out.push({
        id: `${rule.key}~${fingerprint([person, ...items.map(x => `${x.objectId}:${x.left}`)])}`,
        key: rule.key, topic: rule.topic, kind: "reminder", person,
        text: block(`${rule.icon} <b>${rule.head} — ваши объекты</b> · ${localDateLabel(now)}`,
          items.map(line)),
      });
    }
  }
  return out;
}

// ─── СВОДКИ РУКОВОДИТЕЛЮ ──────────────────────────────────────────────────────
// Итоги периода одним сообщением: сколько зашло, сколько посчитали, сколько
// подписали, какая конверсия, сколько потеряли и почему, и что с деньгами.
// Все числа — из той же buildAnalytics, что рисует «Аналитику», поэтому сводка
// в Telegram и экран не могут разойтись.
export const DIGESTS = Object.freeze([
  { key: "digest_week", icon: "📈", topic: "digest", kind: "digest", def: true, money: true,
    label: "Сводка за неделю — с прибылью", period: "week", title: "Итоги недели",
    when: "по понедельникам, в час сводки (по умолчанию 9:00)",
    what: "продажи и конверсия ПЛЮС выручка, валовая и чистая прибыль. "
      + "Только руководству: в общий чат такое слать нельзя" },
  { key: "digest_month", icon: "📊", topic: "digest", kind: "digest", def: true, money: true,
    label: "Сводка за месяц — с прибылью", period: "month", title: "Итоги месяца",
    when: "1-го числа, в час сводки",
    what: "то же самое за прошедший месяц" },
  // ТА ЖЕ СВОДКА, НО БЕЗ ДЕНЕГ КОМПАНИИ. Первую версию нельзя было отправить в
  // общий чат: там валовая и чистая прибыль, а в чате сидит вся команда. Здесь
  // только то, что отдел продаж и так видит по своей работе — сколько зашло,
  // посчитали, подписали, на какую сумму и с какой конверсией. Ни выручки, ни
  // прибыли, ни маржи, ни себестоимости, ни дебиторки. Плюс разрез по
  // менеджерам: в общем чате это как раз то, ради чего сводку и читают.
  { key: "digest_sales_week", icon: "🧑‍💼", topic: "digest", kind: "digest", def: true, money: false,
    label: "Сводка отдела продаж за неделю", period: "week", title: "Отдел продаж — итоги недели",
    when: "по понедельникам, в час сводки",
    what: "зашло новых, посчитано смет, подписано договоров и на сколько, средний чек, "
      + "конверсия, потери с причинами, разрез по менеджерам. Без прибыли — можно в общий чат" },
  { key: "digest_sales_month", icon: "🏆", topic: "digest", kind: "digest", def: true, money: false,
    label: "Сводка отдела продаж за месяц", period: "month", title: "Отдел продаж — итоги месяца",
    when: "1-го числа, в час сводки",
    what: "то же самое за прошедший месяц" },
]);

const pctText = (v) => (v === null || v === undefined ? "—" : `${v}%`);
const numText = (v) => (v === null || v === undefined ? "—" : String(v));

export function buildDigestMessage(analytics = {}, { key, now = Date.now(), reasonLabel = (k) => k } = {}) {
  const meta = DIGESTS.find(d => d.key === key);
  if (!meta) return null;
  const sales = analytics.sales || {};
  const fin = analytics.finance || {};
  const lines = [];

  lines.push(`${meta.icon} <b>${meta.title}</b> · ${localDateLabel(now)}`);
  lines.push("");
  lines.push("<b>Продажи</b>");
  lines.push(`• Зашло новых: <b>${numText(sales.newObjects)}</b>`);
  lines.push(`• Посчитано смет: <b>${numText(sales.estimatedCount)}</b>`
    + (sales.estimatedSum ? ` на ${tenge(sales.estimatedSum)}` : ""));
  lines.push(`• Подписано договоров: <b>${numText(sales.signedCount)}</b>`
    + (sales.signedSum ? ` на <b>${tenge(sales.signedSum)}</b>` : ""));
  if (sales.avgCheck) lines.push(`• Средний чек: <b>${tenge(sales.avgCheck)}</b>`);
  lines.push(`• Конверсия: смета ${pctText(sales.convToEstimate)}`
    + ` · договор ${pctText(sales.convToSigned)} · итог <b>${pctText(sales.convTotal)}</b>`);

  const lost = Number(sales.lostCount) || 0;
  if (lost) {
    lines.push("");
    lines.push(`<b>Потеряли: ${lost}</b>${sales.lostSum ? ` на ${tenge(sales.lostSum)}` : ""}`);
    const reasons = Object.entries(sales.lostByReason || {})
      .sort((a, b) => (b[1]?.count || 0) - (a[1]?.count || 0)).slice(0, 6);
    for (const [rk, v] of reasons) {
      lines.push(`• ${esc(rk === "unknown" ? "Причина не указана" : reasonLabel(rk))} — ${v.count}`
        + (v.sum ? ` (${tenge(v.sum)})` : ""));
    }
  }

  // РАЗРЕЗ ПО МЕНЕДЖЕРАМ — только в сводке отдела продаж: в общем чате именно
  // ради него её и читают. В руководительскую не тащим, там своя оптика.
  if (!meta.money) {
    const rows = Object.entries(sales.byManager || {})
      .filter(([, v]) => (v?.objects || 0) > 0 || (v?.signed || 0) > 0)
      .sort((a, b) => (b[1]?.signedSum || 0) - (a[1]?.signedSum || 0))
      .slice(0, 10);
    if (rows.length) {
      lines.push("");
      lines.push("<b>По менеджерам</b>");
      for (const [who, v] of rows) {
        lines.push(`• ${esc(who)}: зашло ${v.objects || 0}, подписано <b>${v.signed || 0}</b>`
          + (v.signedSum ? ` на ${tenge(v.signedSum)}` : ""));
      }
    }
  }

  // ДЕНЬГИ КОМПАНИИ — только в руководительской сводке. В сводке отдела продаж
  // их нет намеренно: её отправляют в общий чат, где сидит вся команда.
  // Показываем, только если движение вообще было: строка «Выручка 0 ₸ · маржа —»
  // выглядит как поломка, а не как факт.
  if (meta.money && (Number(fin.income) || Number(fin.expense))) {
    lines.push("");
    lines.push("<b>Деньги</b>");
    lines.push(`• Выручка: <b>${tenge(fin.income)}</b>`);
    lines.push(`• Валовая прибыль: <b>${tenge(fin.gross)}</b> (${pctText(fin.grossMarginPct)})`);
    lines.push(`• Чистая прибыль: <b>${tenge(fin.net)}</b> (${pctText(fin.marginPct)})`);
    if (Number(fin.receivablesOverdue)) {
      lines.push(`• Просрочено к оплате: <b>${tenge(fin.receivablesOverdue)}</b>`);
    }
  }

  return {
    id: `${key}~${localDayKey(now)}`,
    key, topic: meta.topic, kind: "digest", person: null,
    text: lines.join("\n"),
  };
}

// ─── ЕДИНЫЙ КАТАЛОГ ───────────────────────────────────────────────────────────
// Всё, что вообще может прийти, одним списком: и события журнала, и напоминания,
// и сводки. Подписка идёт по ЭТИМ ключам — отдельно для каждого сотрудника и
// отдельно для общего чата. Направление осталось только группировкой в админке:
// «включить всё производство» одной кнопкой.
export const NOTIFY_CATALOG = Object.freeze([
  ...NOTIFY_EVENTS, ...NOTIFY_REMINDERS, ...DATE_REMINDERS, ...DIGESTS,
].map(n => Object.freeze({ ...n, def: n.def !== false })));
export const NOTIFY_BY_KEY = Object.freeze(Object.fromEntries(NOTIFY_CATALOG.map(n => [n.key, n])));

// ─── КОМУ ОТПРАВЛЯТЬ ──────────────────────────────────────────────────────────
// Подписка сотрудника лежит в его карточке: u.tg = { topics: [...], scope, code }.
// scope: "all" — все объекты компании, "own" — только там, где он ответственный.
export function userTopics(user) {
  const raw = user?.tg?.topics;
  if (!Array.isArray(raw)) return [];
  return raw.filter(t => NOTIFY_TOPIC_KEYS.includes(t));
}
export function userScope(user) {
  return user?.tg?.scope === "all" ? "all" : "own";
}

// ПОДПИСКА ИДЁТ ПО КАЖДОМУ УВЕДОМЛЕНИЮ ОТДЕЛЬНО, а не по направлению целиком.
// Причина простая: «Производство» — это и «завтра выходим на объект», и
// «удалили запись акта». Прорабу нужно первое и не нужно второе, а
// руководителю наоборот. Направление осталось только группировкой в админке.
//
// Совместимость: у кого отмечены направления (первая версия), но нет
// поштучных отметок — считаем подписанным на всё «по умолчанию включённое»
// внутри этих направлений. Никто ничего не теряет и настраивать заново не надо.
export function subsOf(holder) {
  const subs = holder?.tg ? holder.tg.subs : holder?.subs;
  if (subs && typeof subs === "object") return subs;
  return null;
}
export function isSubscribed(holder, key, topics = null) {
  const subs = subsOf(holder);
  if (subs && Object.prototype.hasOwnProperty.call(subs, key)) return !!subs[key];
  if (subs) return false;                       // поштучная настройка есть — она и решает
  const list = topics || (holder?.tg ? userTopics(holder) : []);
  const meta = NOTIFY_BY_KEY[key];
  if (!meta || !list.length) return false;
  return list.includes(meta.topic) && meta.def; // старая настройка по направлениям
}
export function groupSubscribed(settings, key) {
  const subs = settings?.groupSubs;
  if (subs && Object.prototype.hasOwnProperty.call(subs, key)) return !!subs[key];
  if (subs) return false;
  const topics = Array.isArray(settings?.groupTopics) ? settings.groupTopics : [];
  const meta = NOTIFY_BY_KEY[key];
  if (!meta || !topics.length) return false;
  return topics.includes(meta.topic) && meta.def;
}

// Итог: список писем «в такой-то чат такой-то текст». Дальше остаётся только
// отправить — никакой логики в отправщике не остаётся.
export function routeMessages(messages = [], { users = [], links = {}, settings = {} } = {}) {
  const out = [];
  const seen = new Set();
  const push = (chatId, msg, text) => {
    const chat = trim(chatId);
    if (!chat) return;
    const dedup = `${chat}~${msg.id}`;
    if (seen.has(dedup)) return;
    seen.add(dedup);
    out.push({ chatId: chat, text, messageId: msg.id, topic: msg.topic, key: msg.key });
  };

  const groupChat = trim(settings.groupChatId);
  for (const msg of messages) {
    const text = msg.text || renderEvent(msg);
    const key = msg.key || msg.event;
    // Личное напоминание адресовано конкретному человеку — в общий чат оно не идёт.
    if (groupChat && !msg.person && groupSubscribed(settings, key)) push(groupChat, msg, text);

    for (const u of users) {
      const link = links[u?.id];
      if (!link?.chatId) continue;
      if (!isSubscribed(u, key)) continue;
      if (msg.person) {
        // адресное — только тому, чьё имя стоит ответственным
        if (trim(msg.person) !== trim(u.name)) continue;
      } else if (msg.kind === "reminder" && userScope(u) !== "all") {
        // общую сводку получают только те, кому положено видеть всю компанию;
        // остальным уже ушла их персональная часть
        continue;
      }
      push(link.chatId, msg, text);
    }
  }
  return out;
}

// ─── КОД ПРИВЯЗКИ ─────────────────────────────────────────────────────────────
// Сотрудник открывает ссылку t.me/бот?start=КОД и жмёт «Запустить» — всё.
// Код случайный и живёт в карточке сотрудника: угадать чужой нельзя, а
// отвязать можно, просто сменив его.
export function makeLinkCode(rand = Math.random) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i += 1) s += abc[Math.floor(rand() * abc.length) % abc.length];
  return s;
}
export function linkUrl(botName, code) {
  const bot = trim(botName).replace(/^@/, "");
  if (!bot || !trim(code)) return "";
  return `https://t.me/${bot}?start=${trim(code)}`;
}
export function findUserByCode(users = [], code) {
  const c = trim(code).toLowerCase();
  if (!c) return null;
  return users.find(u => trim(u?.tg?.code).toLowerCase() === c) || null;
}

// ─── ЗАЩИТА БОЕВЫХ ДАННЫХ ─────────────────────────────────────────────────────
// Отправщик работает служебным ключом, а он обходит правила базы — то есть может
// записать куда угодно. Единственное, что стоит между ним и боевыми данными, —
// вот этот список. Ему разрешены ТОЛЬКО собственные узлы уведомлений; всё
// остальное он читает и никогда не пишет.
export const NOTIFY_WRITABLE_KEYS = Object.freeze(["titovstroy-tg-links", "titovstroy-tg-state"]);
export function assertWritable(key) {
  if (!NOTIFY_WRITABLE_KEYS.includes(key)) {
    throw new Error(`Уведомлениям запрещено писать в «${key}». Разрешены только ${NOTIFY_WRITABLE_KEYS.join(", ")}`);
  }
  return key;
}

// Состояние: что уже отправлено. Чистим старое, иначе узел растёт вечно.
export function pruneSent(sent = {}, { now = Date.now(), keepMs = 7 * 24 * 3600e3 } = {}) {
  const out = {};
  for (const [id, ts] of Object.entries(sent || {})) {
    if (Number(ts) > now - keepMs) out[id] = Number(ts);
  }
  return out;
}
