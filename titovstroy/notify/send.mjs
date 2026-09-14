// ОТПРАВЩИК УВЕДОМЛЕНИЙ В TELEGRAM — ЗАПАСНОЙ ПУТЬ, ЧЕРЕЗ GITHUB ACTIONS.
//
// ОСНОВНОЙ ПУТЬ ТЕПЕРЬ ДРУГОЙ: api/notify-run.mjs на Vercel. Событие в сервисе
// доходит до Telegram за секунду-две, потому что функция уже запущена и просто
// делает работу. Прогон Actions на то же самое тратит минуту: выдать машину,
// выкачать репозиторий, поставить зависимости. Для «сменил статус — пришло
// уведомление» это не годится, и держать его основным было ошибкой.
//
// Здесь он остаётся подстраховкой на случай, когда Vercel недоступен, и ради
// опроса команд бота, если webhook выключен. Вся работа — в общем движке
// src/notify/runNotify.js, тут только ввод-вывод.
//
// ГЛАВНОЕ ПРО БЕЗОПАСНОСТЬ. Служебный ключ обходит правила базы: технически он
// может переписать что угодно, включая сметы и финансы. Поэтому запись идёт
// ТОЛЬКО через writeJson, а он пропускает лишь два собственных узла
// (assertWritable). Всё остальное — чтение. Любая попытка записать в боевые
// данные роняет прогон с ошибкой, а не портит базу молча.
import admin from "firebase-admin";
import { assertWritable, handleBotCommand } from "../src/notify/notifyModel.js";
import { K, runNotify } from "../src/notify/runNotify.js";

const FB_DB_URL = process.env.FB_DB_URL || "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const DRY = process.env.DRY_RUN === "1";
const FORCE_DIGEST = process.env.FORCE_DIGEST === "1";


const fbKey = (k) => String(k).replace(/[^a-zA-Z0-9_]/g, "_");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function initFb() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa || !sa.trim()) throw new Error("Нет секрета FIREBASE_SERVICE_ACCOUNT");
  let cred;
  try { cred = JSON.parse(sa); }
  catch (e) { throw new Error("FIREBASE_SERVICE_ACCOUNT — не валидный JSON: " + e.message); }
  admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: FB_DB_URL });
}

// Узел в этой базе — строка с JSON (так пишет само приложение), но у старых
// ключей встречается и готовый объект. Терпим оба варианта.
async function readJson(key, empty = null) {
  const v = (await admin.database().ref(fbKey(key)).get()).val();
  if (v === null || v === undefined) return empty;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return empty; } }
  if (typeof v === "object") return v;
  return empty;
}
async function writeJson(key, obj) {
  assertWritable(key);                       // единственный барьер перед боевой базой
  if (DRY) { console.log(`[сухой прогон] запись в ${key} пропущена`); return; }
  await admin.database().ref(fbKey(key)).set(JSON.stringify(obj));
}

// ── Telegram ─────────────────────────────────────────────────────────────────
async function tg(method, payload) {
  if (!BOT) throw new Error("Нет секрета TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}
async function send(chatId, text) {
  if (DRY) { console.log(`[сухой прогон] → ${chatId}\n${text}\n`); return true; }
  try {
    await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
    return true;
  } catch (e) {
    // Человек заблокировал бота или чат удалён — это не авария всего прогона.
    console.warn(`  ! не доставлено в ${chatId}: ${e.message}`);
    return false;
  }
}

// ── Привязка сотрудников: /start КОД ─────────────────────────────────────────
// Сотрудник открывает ссылку из Админки и жмёт «Запустить» — Telegram сам
// отправляет боту «/start КОД». Здесь мы этот код узнаём и запоминаем чат.
async function processUpdates(state, users, links) {
  if (!BOT) { console.warn("Нет секрета TELEGRAM_BOT_TOKEN — привязки не обрабатываются.");
    return { links, changed: false, lastUpdateId: state.lastUpdateId }; }
  if (DRY) { console.log("Сухой прогон: команды бота не читаем.");
    return { links, changed: false, lastUpdateId: state.lastUpdateId }; }
  let updates = [];
  try {
    updates = await tg("getUpdates", {
      offset: (Number(state.lastUpdateId) || 0) + 1, timeout: 0, limit: 100,
      allowed_updates: ["message"],
    });
  } catch (e) {
    // Telegram отдаёт сообщения ЛИБО опросом, ЛИБО в webhook — одновременно нельзя.
    // Когда webhook включён (api/tghook.mjs на Vercel), getUpdates отвечает 409, и
    // это не поломка: команды бота в этот момент обрабатываются мгновенно, а прогону
    // остаётся только рассылка. Ругаться на это не надо, иначе в логе каждые
    // 15 минут висит «ошибка», за которой перестают следить.
    if (/can't use getUpdates|409/i.test(e.message)) {
      console.log("Бот работает через webhook — опрос не нужен, команды уже обработаны.");
    } else {
      console.warn("getUpdates:", e.message);
    }
    return { links, changed: false, lastUpdateId: state.lastUpdateId };
  }

  // Что бот увидел — обязательно в лог. Без этого «бот не отвечает» невозможно
  // разобрать: в логе стояло только «к отправке событий 0», и пришлось ли
  // сообщение вообще, приходилось выяснять по метке привязки в базе.
  console.log(`Бот: новых сообщений ${updates.length}`);
  let changed = false;
  let current = links;
  let lastUpdateId = Number(state.lastUpdateId) || 0;
  for (const u of updates) {
    lastUpdateId = Math.max(lastUpdateId, Number(u.update_id) || 0);
    const msg = u.message;
    if (!msg || !msg.chat) continue;
    // Разбор команд — общий с webhook (handleBotCommand), чтобы ответы бота не
    // зависели от того, каким путём пришло сообщение.
    const out = handleBotCommand({ text: msg.text, chatId: msg.chat.id, from: msg.from,
      users, links: current });
    if (!out) continue;
    console.log(`  ${out.log}`);
    if (out.links) { current = out.links; changed = true; }
    await send(String(msg.chat.id), out.reply);
  }
  return { links: current, changed, lastUpdateId };
}

// ── Основной прогон ──────────────────────────────────────────────────────────
// Вся работа — в общем движке src/notify/runNotify.js: его же запускает
// serverless-функция на Vercel, которая теперь и есть основной путь (доли
// секунды вместо прогона Actions). Здесь остаётся только ввод-вывод: Firebase
// сервисным ключом, Telegram и опрос команд бота, если webhook выключен.
async function main() {
  initFb();
  const r = await runNotify({
    read: readJson,
    write: writeJson,
    sendMessage: send,
    // Опрос команд нужен ТОЛЬКО здесь: на Vercel их приносит webhook.
    processUpdates: ({ state, users, links }) => processUpdates(state, users, links),
    pause: () => sleep(120),
    log: (...a) => console.log(...a),
  }, { now: Date.now(), forceDigest: FORCE_DIGEST });
  if (!r.off) console.log("Готово.");
}

// ЗАКРЫТЬ СОЕДИНЕНИЕ ОБЯЗАТЕЛЬНО. Firebase Admin держит открытый сокет к базе,
// и без явного закрытия node не завершается: работа сделана, а прогон висит до
// таймаута GitHub и падает как «Cancelled» — ровно это и случилось на первом
// запуске (10 минут, отменён). Парсер мастеров делает то же самое в каждой
// точке выхода, я это упустил.
async function shutdown() {
  try { await admin.app().delete(); } catch (e) { /* приложение не поднялось — нечего закрывать */ }
}
main()
  .then(async () => { await shutdown(); process.exit(0); })
  .catch(async (e) => { console.error("СБОЙ:", e.message); await shutdown(); process.exit(1); });
