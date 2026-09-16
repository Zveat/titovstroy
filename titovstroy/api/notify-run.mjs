// РАССЫЛКА УВЕДОМЛЕНИЙ ПРЯМО ЗДЕСЬ. Не «запусти где-нибудь прогон» — а взял и
// отправил, за секунду-две.
//
// ПОЧЕМУ НЕ ЧЕРЕЗ GITHUB ACTIONS, КАК БЫЛО. Любой прогон Actions — это выдать
// машину, выкачать репозиторий, поставить зависимости: минута в лучшем случае,
// и это ещё если очередь пустая. Плюс расписание Actions исполняется «по
// возможности»: 14 сентября из 96 запрошенных тиков случилось три. Владелец
// просил ровно обратного: сменили статус — уведомление ушло в ту же секунду;
// нажал кнопку — ушло сразу; сводка назначена на 10:00 — пришла в 10:00.
// Serverless-функция это и делает: она уже развёрнута, ей нечего готовить.
//
// ВСЁ НУЖНОЕ ЗДЕСЬ УЖЕ БЫЛО. Сервисный доступ к базе — api/fbrest.mjs (он же
// обслуживает webhook бота), токен бота — в переменных Vercel. Ничего нового
// настраивать не пришлось.
//
// ТРИ ПОВОДА ЗАПУСТИТЬСЯ, И КАЖДЫЙ ПРОВЕРЯЕТСЯ ПО-СВОЕМУ:
//
//   kind:"event" — в журнале появилось событие. Подтверждение — САМА ЗАПИСЬ:
//     функция ищет в журнале строку ровно с этой отметкой времени. Журнал
//     читается токеном обратившегося сотрудника, поэтому через эту точку нельзя
//     увидеть больше, чем человек и так видит в разделе «Журнал».
//     Почему не отметка в настройках, как у кнопки: писать настройки по правилам
//     может ТОЛЬКО администратор, а статусы объектов меняют продавцы. Требуй мы
//     от них ту же отметку, быстрые уведомления работали бы у одного человека.
//
//   kind:"sendNow" — нажали кнопку в Админке. Админка сначала кладёт заявку в
//     настройки (туда пускают только администратора), потом зовёт сюда. Сама по
//     себе точка ничего не отправит: заявки нет — работы нет.
//
//   kind:"cron" — по расписанию. Сюда пускают только по секрету NOTIFY_CRON_SECRET,
//     без токена сотрудника. Это единственный повод, который может собрать
//     сводку дня.
//
// ЗАПИСЬ В БАЗУ. Сервисный ключ обходит правила базы, поэтому вся запись идёт
// через барьер assertWritable внутри runNotify: разрешены только два узла
// рассылки, попытка тронуть боевые данные роняет вызов.
import { createDb } from "./fbrest.mjs";
import { K, runNotify } from "../src/notify/runNotify.js";
import { canSendNow, inQuietHours, localDayKey, localParts, pendingSendNow } from "../src/notify/notifyModel.js";

const PROD_FIREBASE_API_KEY = "AIzaSyCPawCUYGY20SB5cLLszjoNzK5ytew9tCs";
const PROD_FIREBASE_DB_URL = "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const DEFAULT_ORIGINS = ["https://www.titovstroy.kz", "https://titovstroy.kz", "https://erp.titovstroy.kz"];
// Событие старше этого — уже не «только что случилось».
const EVENT_MAX_AGE_MS = 10 * 60 * 1000;
const SEND_NOW_MAX_AGE_MS = 30 * 60 * 1000;
// Как часто тик из вкладки поднимает ПОЛНЫЙ прогон, даже когда по времени
// ничего не назначено. Это подстраховка для событий, чья мгновенная отправка не
// дошла: пропала сеть, функция ответила ошибкой, у человека в телефоне открыта
// старая сборка без быстрой отправки. Было десять минут — владелец получил
// уведомление об удалении смет через шесть часов, и десять минут в таком
// разговоре звучат издевательски. Три минуты: полный прогон читает журнал
// (десятки килобайт), и при одной открытой вкладке это около мегабайта в день.
const FULL_RUN_EVERY_MS = 3 * 60 * 1000;

const parseList = (value) => {
  try {
    const p = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(p) ? p : null;
  } catch { return null; }
};
const parseObj = (value) => {
  try {
    const p = typeof value === "string" ? JSON.parse(value) : value;
    return p && typeof p === "object" && !Array.isArray(p) ? p : null;
  } catch { return null; }
};

// Помесячный ключ журнала. Приложение считает месяц ПО ЧАСАМ БРАУЗЕРА (Астана,
// UTC+5), а функция живёт в UTC — пять часов в конце каждого месяца эти ответы
// расходятся. Берём все правдоподобные месяцы; обычно он ровно один.
export function auditMonthKeys(ts) {
  const ym = (shift) => {
    const d = new Date(Number(ts) + shift);
    return `titovstroy-audit-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return [...new Set([ym(0), ym(5 * 3600e3), ym(-5 * 3600e3)])];
}

function reply(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

// ЧТО-НИБУДЬ НАЗНАЧЕНО НА СЕЙЧАС?
//
// Это ответ на «сводка в 10:00 должна уйти в 10:00». Планировщик, который
// сходит с секундной точностью, требует либо платного тарифа Vercel, либо
// настройки руками во внешнем сервисе. Но время знает и само приложение: пока
// у кого-то открыта вкладка, она раз в минуту спрашивает «пора?», и в 10:00
// ответ становится «да».
//
// Вопрос стоит ДВУХ МАЛЕНЬКИХ ЧТЕНИЙ (настройки и состояние рассылки), поэтому
// спрашивать хоть каждую минуту не жалко. Тяжёлый прогон поднимается только
// когда ответ «да»: настал час сводки и сегодня её ещё не было, лежит
// невыполненная заявка от кнопки, или просто прошло десять минут с прошлого
// прогона — последнее и есть подстраховка для событий, чья мгновенная отправка
// не дошла.
export function whatIsDue({ settings = {}, state = {}, now = Date.now() } = {}) {
  if (!settings.on) return null;
  const quiet = inQuietHours(now, settings);
  const digestHour = Number.isFinite(+settings.digestHour) ? +settings.digestHour : 9;
  if (!quiet && localParts(now).hh >= digestHour && state.lastDigest !== localDayKey(now)) {
    return "digest";
  }
  if (pendingSendNow({ settings, state, now }).keys.length) return "sendNow";
  if (now - (Number(state.lastRun) || 0) > FULL_RUN_EVERY_MS) return "catchUp";
  return null;
}

export function createNotifyRunHandler({
  env = process.env, db = null, fetchImpl = globalThis.fetch, now = Date.now, dbUrl = null,
} = {}) {
  const store = db || createDb({ env, fetchImpl });
  const bot = () => String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const restUrl = String(dbUrl || env.VITE_FB_DATABASE_URL || PROD_FIREBASE_DB_URL).replace(/\/$/, "");
  const apiKey = env.VITE_FB_API_KEY || PROD_FIREBASE_API_KEY;
  const allowedOrigins = new Set([
    ...DEFAULT_ORIGINS,
    ...String(env.PARSER_ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean),
  ]);

  // Отправка в Telegram. Человек заблокировал бота или чат удалён — это не
  // авария всей рассылки, остальные письма должны уйти.
  async function sendMessage(chatId, text) {
    const token = bot();
    if (!token) throw new Error("Нет TELEGRAM_BOT_TOKEN");
    try {
      const r = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML",
          disable_web_page_preview: true }),
      });
      const j = await r.json().catch(() => ({}));
      return Boolean(j?.ok);
    } catch { return false; }
  }

  // Проверка токена сотрудника — у Google, а не «доверяем строке».
  async function staffToken(req) {
    const header = String(req.headers?.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return null;
    const r = await fetchImpl(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }) },
    );
    const p = await r.json().catch(() => null);
    return (r.ok && Array.isArray(p?.users) && p.users.length) ? token : null;
  }

  // Читаем узел ТОКЕНОМ СОТРУДНИКА: проверка повода не должна давать доступ
  // шире, чем у самого человека.
  async function readAsStaff(key, token) {
    const safe = String(key).replace(/[^a-zA-Z0-9_]/g, "_");
    const r = await fetchImpl(`${restUrl}/${safe}.json?auth=${encodeURIComponent(token)}`,
      { method: "GET", headers: { "Cache-Control": "no-store" } });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }

  return async function notifyRunHandler(req, res) {
    if (req.method !== "POST") return reply(res, 405, { ok: false, code: "method_not_allowed" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const kind = String(body.kind || "");
    const at = Number(body.at);
    const t = Number(now());

    // ── Повод 1: по расписанию. Только по секрету, без сотрудника.
    if (kind === "cron") {
      // Тот же разбор, что в notify-cron.mjs: своя переменная, а если её не
      // задали — та, которую Vercel подставляет своему планировщику сам.
      const secret = String(env.NOTIFY_CRON_SECRET || env.CRON_SECRET || "").trim();
      const given = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
      if (!secret) return reply(res, 503, { ok: false, code: "cron_not_configured" });
      if (given !== secret) return reply(res, 401, { ok: false, code: "bad_cron_secret" });
    } else {
      // ── Поводы 2 и 3 приходят из браузера сотрудника.
      const origin = String(req.headers?.origin || "");
      if (!allowedOrigins.has(origin)) return reply(res, 403, { ok: false, code: "origin_not_allowed" });
      if (kind !== "event" && kind !== "sendNow" && kind !== "due") {
        return reply(res, 400, { ok: false, code: "invalid_request" });
      }
      if (kind !== "due") {
        const maxAge = kind === "event" ? EVENT_MAX_AGE_MS : SEND_NOW_MAX_AGE_MS;
        if (!Number.isFinite(at) || at <= 0 || at > t + 5 * 60_000 || t - at > maxAge) {
          return reply(res, 400, { ok: false, code: "invalid_request" });
        }
      }
      const token = await staffToken(req);
      if (!token) return reply(res, 401, { ok: false, code: "firebase_auth_required" });

      if (kind === "due") {
        // Вопрос «пора?» задаёт открытая вкладка раз в минуту. Отвечаем дёшево:
        // два маленьких узла. Ничего не назначено — расходимся, не читая журнал.
        if (!store.configured()) return reply(res, 503, { ok: false, code: "service_key_missing" });
        const [settings, state] = await Promise.all([
          store.read(K.settings, {}), store.read(K.state, {}),
        ]);
        const due = whatIsDue({ settings: settings || {}, state: state || {}, now: t });
        if (!due) return reply(res, 200, { ok: true, idle: true });
        // Дальше — обычный полный прогон. Подтверждать тик нечем и не нужно:
        // он не может отправить ничего, чего рассылка не отправила бы сама по
        // своему расписанию, — только раньше на минуту.
      } else if (kind === "event") {
        // Подтверждение события — запись в журнале ровно с этой отметкой.
        let found = false;
        for (const key of auditMonthKeys(at)) {
          const list = parseList(await readAsStaff(key, token));
          if (list && list.some(e => Number(e?.ts) === at)) { found = true; break; }
        }
        if (!found) return reply(res, 409, { ok: false, code: "event_not_found" });
      } else {
        // Подтверждение кнопки — заявка, уже записанная админкой в настройки.
        const settings = parseObj(await readAsStaff("titovstroy-tg-settings", token)) || {};
        const queue = settings.sendNowQueue || {};
        const single = settings.sendNow || {};
        const ok = Number(queue[body.key]) === at
          || (Number(single.at) === at && canSendNow(single.key));
        if (!ok) return reply(res, 409, { ok: false, code: "request_not_pending" });
      }
    }

    if (!store.configured()) return reply(res, 503, { ok: false, code: "service_key_missing" });
    if (!bot()) return reply(res, 503, { ok: false, code: "bot_token_missing" });

    // ЗАМОК. Отправка теперь идёт в момент события, а события приходят пачками —
    // четыре объекта в «Потерян» дают четыре запроса почти одновременно.
    // Serverless-функции выполняются ПАРАЛЛЕЛЬНО: без замка два прогона прочитали
    // бы журнал раньше, чем первый отметит отправленное, и одно событие ушло бы
    // дважды. Проиграл гонку — честно отвечаем «занято», ничего не потеряв:
    // прогон, который замок взял, читает журнал целиком и заберёт и наше событие.
    let claim;
    try {
      claim = await store.claimRun(K.state);
    } catch (e) {
      return reply(res, 503, { ok: false, code: "lock_failed", error: String(e?.message || e) });
    }
    if (!claim.ok) return reply(res, 200, { ok: true, busy: true });

    const log = [];
    try {
      const result = await runNotify({
        read: (key, fallback) => store.read(key, fallback),
        write: (key, value) => store.write(key, value),
        sendMessage,
        log: (...a) => log.push(a.join(" ")),
      }, { now: t, forceDigest: kind === "cron" && body.force === true });
      return reply(res, 200, { ok: true, ...result, log });
    } catch (e) {
      // Отдаём 500, но с текстом: этот вызов делает браузер сотрудника, и глухая
      // ошибка означала бы «уведомления молчат, и никто не знает почему».
      return reply(res, 500, { ok: false, code: "run_failed", error: String(e?.message || e), log });
    }
  };
}

export default createNotifyRunHandler();
