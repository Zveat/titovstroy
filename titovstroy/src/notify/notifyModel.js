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
  { key: "production", icon: "🛠", label: "Производство и этапы",
    hint: "просроченные этапы, объекты без движения, сдача в этом месяце, сдвиг дат" },
  { key: "sales", icon: "📋", label: "Сделки, сметы и договоры",
    hint: "новые объекты, смена статуса, согласование сметы, договоры, удаления" },
  { key: "finance", icon: "💰", label: "Финансы и оплаты",
    hint: "операции по деньгам, просроченная дебиторка. Суммы уйдут в Telegram" },
  { key: "security", icon: "🔐", label: "Безопасность и админка",
    hint: "смена прав, пользователи, бэкапы, неудачные попытки входа" },
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
  // ── Сделки и производство по объекту ──
  { entity: "object", field: /статус/, topic: "sales", icon: "🏗",
    title: (e) => `Объект «${nameOf(e)}»`,
    body: (e) => `${esc(e.old) || "—"} → <b>${esc(e.new) || "—"}</b>` },
  { entity: "object", action: /созда/, topic: "sales", icon: "➕",
    title: () => "Новый объект",
    body: (e) => `<b>${nameOf(e)}</b>` },
  { entity: "object", action: /удали/, topic: "sales", icon: "🗑",
    title: () => "Удалён объект",
    body: (e) => `<b>${nameOf(e)}</b>` },
  { entity: "object", topic: "production", icon: "📅",
    title: (e) => `Объект «${nameOf(e)}»`,
    body: (e) => `${esc(e.field) || "поле"}: ${esc(e.old) || "—"} → <b>${esc(e.new) || "—"}</b>` },

  // ── Сметы ──
  { entity: "estimate", action: /удали/, topic: "sales", icon: "🗑",
    title: () => "Удалена смета",
    body: (e) => `<b>${nameOf(e)}</b>` },
  { entity: "estimate", topic: "sales", icon: "🧮",
    title: (e) => `Смета «${nameOf(e)}»`,
    body: (e) => (e.old || e.new) ? `${esc(e.old) || "—"} → <b>${esc(e.new) || "—"}</b>` : esc(e.action) },

  // ── Договоры, клиенты, подряд, кабинет клиента ──
  { entity: "contract", topic: "sales", icon: "📋",
    title: (e) => `Договор «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },
  { entity: "client", topic: "sales", icon: "🧑",
    title: (e) => `Клиент «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },
  { entity: "podryad", topic: "production", icon: "🔨",
    title: (e) => `Подряд «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },
  { entity: "publish", topic: "sales", icon: "🌐",
    title: (e) => `Кабинет клиента «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },

  // ── Акты и этапы ──
  { entity: "report", action: /удали/, topic: "production", icon: "🗑",
    title: () => "Удалена запись акта", body: (e) => nameOf(e) },
  { entity: "report", topic: "production", icon: "🧾",
    title: (e) => `Акт «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },
  // Фотоотчёты и галочки чек-листа идут десятками за смену и сообщением не
  // являются — их видно в карточке объекта. Держим их вне рассылки намеренно.
  { entity: "stage", skip: /(фото|чек-лист)/i, topic: "production", icon: "🛠",
    title: (e) => `Этап «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },

  // ── Деньги ──
  { entity: "finance_tx", action: /удали/, topic: "finance", icon: "🗑",
    title: () => "Удалена операция", body: (e) => `${nameOf(e)}${e.old ? ` — <b>${esc(e.old)}</b>` : ""}` },
  { entity: "finance_tx", topic: "finance", icon: "💰",
    title: () => "Операция по деньгам",
    body: (e) => `${nameOf(e)}${e.new ? `\n<b>${esc(e.new)}</b>` : ""}` },
  { entity: "price", topic: "finance", icon: "💲",
    title: () => "Прайс-лист", body: (e) => bodyOfChange(e) },

  // ── Безопасность ──
  // Обычный вход — самая частая запись в журнале и ничего не значит.
  // Неудачная попытка значит ровно наоборот, поэтому разделены.
  { entity: "session", action: /неудач/, topic: "security", icon: "⚠️",
    title: () => "Неудачная попытка входа", body: (e) => esc(e.label || e.detail) },
  { entity: "session", drop: true },
  { entity: "role", topic: "security", icon: "🔐",
    title: (e) => `Права роли «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },
  { entity: "user", topic: "security", icon: "👤",
    title: (e) => `Учётная запись «${nameOf(e)}»`, body: (e) => bodyOfChange(e) },
  { entity: "backup", topic: "security", icon: "💾",
    title: () => "Бэкап базы", body: (e) => bodyOfChange(e) },
  { entity: "document_template", topic: "security", icon: "📑",
    title: () => "Шаблоны документов", body: (e) => bodyOfChange(e) },
];

function bodyOfChange(e) {
  const what = trim(e.field);
  const change = (e.old || e.new) ? `${esc(e.old) || "—"} → <b>${esc(e.new) || "—"}</b>` : "";
  const act = esc(trim(e.action));
  if (what && change) return `${esc(what)}: ${change}`;
  if (change) return `${act ? act + ": " : ""}${change}`;
  return act || nameOf(e);
}

// Одна запись журнала → сообщение (или null, если это шум).
export function auditMessage(entry) {
  if (!entry || typeof entry !== "object") return null;
  const entity = trim(entry.entity);
  for (const rule of RULES) {
    if (rule.entity !== entity) continue;
    if (rule.action && !rule.action.test(low(entry.action))) continue;
    if (rule.field && !rule.field.test(low(entry.field))) continue;
    if (rule.skip && rule.skip.test(`${entry.field} ${entry.action}`)) return null;
    if (rule.drop) return null;
    return {
      id: auditDedupId(entry),
      ts: Number(entry.ts) || 0,
      topic: rule.topic,
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
export function buildEventMessages(entries = [], { sinceTs = 0, sentIds = {} } = {}) {
  const fresh = (Array.isArray(entries) ? entries : [])
    .filter(e => Number(e?.ts) > Number(sinceTs || 0))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const mapped = [];
  for (const e of fresh) {
    const m = auditMessage(e);
    if (m && !sentIds[m.id]) mapped.push(m);
  }
  return groupMessages(mapped);
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

export function buildReminderMessages(analytics = {}, { now = Date.now() } = {}) {
  const prod = analytics.production || {};
  const backlog = analytics.backlog || {};
  const finance = analytics.finance || {};
  const day = localDateLabel(now);
  const out = [];

  const overdue = (prod.overdueStageList || []).slice();
  if (overdue.length) {
    out.push({
      id: `rem~stages~${fingerprint(idsOf(overdue))}`,
      topic: "production", kind: "reminder",
      person: null,
      lines: overdue,
      text: block(`🛠 <b>Просроченные этапы</b> · ${day}`, overdue.map(x =>
        `• ${esc(x.name)} — <b>${daysWord(x.days)}</b>${x.manager ? ` · ${esc(x.manager)}` : ""}`)),
    });
    // То же самое, но адресно: каждому — только его этапы.
    for (const [person, items] of byPerson(overdue)) {
      out.push({
        id: `rem~stages~${fingerprint([person, ...idsOf(items)])}`,
        topic: "production", kind: "reminder", person,
        text: block(`🛠 <b>Ваши просроченные этапы</b> · ${day}`, items.map(x =>
          `• ${esc(x.name)} — <b>${daysWord(x.days)}</b>`)),
      });
    }
  }

  const stale = (prod.staleObjects || []).slice();
  if (stale.length) {
    out.push({
      id: `rem~stale~${fingerprint(idsOf(stale))}`,
      topic: "production", kind: "reminder", person: null,
      text: block(`🔇 <b>Объекты без движения</b> · ${day}`, stale.map(x =>
        `• ${esc(x.name)} — тишина <b>${daysWord(x.days)}</b>${x.manager ? ` · ${esc(x.manager)}` : ""}`)),
    });
    for (const [person, items] of byPerson(stale)) {
      out.push({
        id: `rem~stale~${fingerprint([person, ...idsOf(items)])}`,
        topic: "production", kind: "reminder", person,
        text: block(`🔇 <b>Ваши объекты без движения</b> · ${day}`, items.map(x =>
          `• ${esc(x.name)} — тишина <b>${daysWord(x.days)}</b>`)),
      });
    }
  }

  if (backlog.closingThisMonthCount) {
    out.push({
      id: `rem~closing~${fingerprint((backlog.closingThisMonthIds || [String(backlog.closingThisMonthCount)]))}`,
      topic: "production", kind: "reminder", person: null,
      text: `📦 <b>Сдаётся в этом месяце</b> · ${day}\n`
        + `Объектов: <b>${backlog.closingThisMonthCount}</b>`
        + (backlog.closingThisMonthSum ? ` на <b>${tenge(backlog.closingThisMonthSum)}</b>` : ""),
    });
  }

  const debts = (finance.receivableList || []).filter(r => r.overdue);
  if (debts.length) {
    out.push({
      id: `rem~debt~${fingerprint(idsOf(debts))}`,
      topic: "finance", kind: "reminder", person: null,
      text: block(`💸 <b>Просроченная оплата</b> · ${day}`, debts.map(x =>
        `• ${esc(x.name)} — <b>${tenge(x.value)}</b>${x.manager ? ` · ${esc(x.manager)}` : ""}`)),
    });
    for (const [person, items] of byPerson(debts)) {
      out.push({
        id: `rem~debt~${fingerprint([person, ...idsOf(items)])}`,
        topic: "finance", kind: "reminder", person,
        text: block(`💸 <b>Ваша просроченная оплата</b> · ${day}`, items.map(x =>
          `• ${esc(x.name)} — <b>${tenge(x.value)}</b>`)),
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

// Итог: список писем «в такой-то чат такой-то текст». Дальше остаётся только
// отправить — никакой логики в отправщике не остаётся.
export function routeMessages(messages = [], { users = [], links = {}, settings = {} } = {}) {
  const out = [];
  const seen = new Set();
  const push = (chatId, msg, text) => {
    const chat = trim(chatId);
    if (!chat) return;
    const key = `${chat}~${msg.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ chatId: chat, text, messageId: msg.id, topic: msg.topic });
  };

  const groupChat = trim(settings.groupChatId);
  const groupTopics = Array.isArray(settings.groupTopics) ? settings.groupTopics : [];
  for (const msg of messages) {
    const text = msg.text || renderEvent(msg);
    // Личное напоминание адресовано конкретному человеку — в общий чат оно не идёт.
    if (groupChat && !msg.person && groupTopics.includes(msg.topic)) push(groupChat, msg, text);

    for (const u of users) {
      const link = links[u?.id];
      if (!link?.chatId) continue;
      if (!userTopics(u).includes(msg.topic)) continue;
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
