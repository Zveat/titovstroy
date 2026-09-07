// ОТПРАВЩИК УВЕДОМЛЕНИЙ В TELEGRAM. Запускается по расписанию из GitHub Actions.
//
// Читает базу служебным ключом, решает что кому отправить (вся логика — в
// src/notify/notifyModel.js, она под тестами) и шлёт. Здесь только ввод-вывод.
//
// ГЛАВНОЕ ПРО БЕЗОПАСНОСТЬ. Служебный ключ обходит правила базы: технически он
// может переписать что угодно, включая сметы и финансы. Поэтому запись идёт
// ТОЛЬКО через writeJson, а он пропускает лишь два собственных узла
// (assertWritable). Всё остальное — чтение. Любая попытка записать в боевые
// данные роняет прогон с ошибкой, а не портит базу молча.
import admin from "firebase-admin";
import { buildAnalytics } from "../src/analytics/analyticsModel.js";
import { refuseReasonLabel } from "../src/analytics/analyticsModel.js";
import {
  buildEventMessages, buildReminderMessages, buildDateReminders, buildDigestMessage,
  makeEventContext, routeMessages, renderEvent, DIGESTS,
  inQuietHours, localDayKey, localParts, assertWritable, pruneSent,
  findUserByCode, NOTIFY_CATALOG, isSubscribed, esc,
} from "../src/notify/notifyModel.js";

const FB_DB_URL = process.env.FB_DB_URL || "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const DRY = process.env.DRY_RUN === "1";
const FORCE_DIGEST = process.env.FORCE_DIGEST === "1";

const K = {
  settings: "titovstroy-tg-settings",
  links:    "titovstroy-tg-links",
  state:    "titovstroy-tg-state",
  users:    "titovstroy-users",
  auditIdx: "titovstroy-audit-index",
  auditMonth: (ym) => "titovstroy-audit-" + ym,
  objects: "titovstroy-objects", estimates: "titovstroy-estimates",
  contracts: "titovstroy-contracts", productions: "titovstroy-productions",
  financeTx: "titovstroy-finance-tx", financeMeta: "titovstroy-finance-meta",
};

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
  if (DRY || !BOT) return { links, changed: false, lastUpdateId: state.lastUpdateId };
  let updates = [];
  try {
    updates = await tg("getUpdates", {
      offset: (Number(state.lastUpdateId) || 0) + 1, timeout: 0, limit: 100,
      allowed_updates: ["message"],
    });
  } catch (e) { console.warn("getUpdates:", e.message); return { links, changed: false, lastUpdateId: state.lastUpdateId }; }

  let changed = false;
  let lastUpdateId = Number(state.lastUpdateId) || 0;
  for (const u of updates) {
    lastUpdateId = Math.max(lastUpdateId, Number(u.update_id) || 0);
    const msg = u.message;
    if (!msg || !msg.chat) continue;
    const chatId = String(msg.chat.id);
    const text = String(msg.text || "").trim();

    if (/^\/start\b/.test(text)) {
      const code = text.replace(/^\/start\b/, "").trim();
      const user = findUserByCode(users, code);
      if (!user) {
        await send(chatId, "Не узнал код. Откройте ссылку из Админки TitovStroy: "
          + "«Уведомления» → напротив вашей фамилии кнопка «Подключить».");
        continue;
      }
      links[user.id] = { chatId, tgName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ")
        || msg.from?.username || "", ts: Date.now() };
      changed = true;
      const mine = NOTIFY_CATALOG.filter(n => isSubscribed(user, n.key));
      await send(chatId, `Готово, ${esc(user.name || user.login)}. Уведомления TitovStroy подключены.\n\n`
        + (mine.length ? `Буду присылать (${mine.length}):\n`
            + mine.slice(0, 20).map(n => `• ${n.icon} ${esc(n.label)}`).join("\n")
            + (mine.length > 20 ? `\n<i>…и ещё ${mine.length - 20}</i>` : "")
          : "Пока ничего не отмечено — попросите администратора выбрать уведомления в Админке.")
        + "\n\nОтключить — команда /stop");
      continue;
    }

    if (/^\/stop\b/.test(text)) {
      const id = Object.keys(links).find(k => String(links[k]?.chatId) === chatId);
      if (id) { delete links[id]; changed = true; }
      await send(chatId, "Отключено. Чтобы вернуть — снова откройте ссылку из Админки.");
      continue;
    }

    if (/^\/(chatid|id)\b/.test(text)) {
      // Для общего чата: бота добавляют в группу, он подсказывает её номер,
      // который админ вставляет в Админке. Иначе номер группы взять негде.
      await send(chatId, `Номер этого чата: <code>${chatId}</code>\n`
        + "Вставьте его в Админке → Уведомления → «Общий чат».");
      continue;
    }
  }
  return { links, changed, lastUpdateId };
}

// ── Основной прогон ──────────────────────────────────────────────────────────
async function main() {
  initFb();
  const settings = await readJson(K.settings, {}) || {};
  const state = await readJson(K.state, {}) || {};
  const links = await readJson(K.links, {}) || {};
  const users = (await readJson(K.users, [])) || [];
  const now = Date.now();

  if (!settings.on) {
    console.log("Уведомления выключены в Админке — выходим, ничего не отправлено.");
    return;
  }

  // 1. Привязки (всегда, даже в тихие часы: человек ждёт ответа прямо сейчас)
  const upd = await processUpdates(state, users, links);
  if (upd.changed) await writeJson(K.links, upd.links);

  const quiet = inQuietHours(now, settings);
  if (quiet) console.log("Тихие часы — сообщения подождут до утра, ничего не теряется.");

  // 2. События из журнала (текущий и прошлый месяц — на случай прогона в ночь на 1-е)
  const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const nowD = new Date(now);
  const months = [ym(nowD), ym(new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 1)))];
  let entries = [];
  for (const m of months) entries = entries.concat((await readJson(K.auditMonth(m), [])) || []);

  // ПЕРВЫЙ ЗАПУСК. Курсора ещё нет — если взять ноль, в чат прилетит вся история
  // за три месяца одной простынёй. Поэтому стартуем «с этого момента».
  const firstRun = !Number(state.lastTs);
  const sinceTs = firstRun ? now : Number(state.lastTs);
  if (firstRun) console.log("Первый запуск: старые записи журнала не рассылаем, начинаем с текущего момента.");

  const sentIds = pruneSent(state.sent || {}, { now });
  // Карточки производства нужны и событиям (дополнить «договор подписан» датами),
  // и напоминаниям о будущем — читаем один раз.
  const productions = (await readJson(K.productions, [])) || [];
  const events = quiet ? [] : buildEventMessages(entries, {
    sinceTs, sentIds, settings, context: makeEventContext({ productions }),
  });
  console.log(`Журнал: записей ${entries.length}, к отправке событий ${events.length}`);

  // 3. Напоминания — раз в сутки, после часа сводки
  const digestHour = Number.isFinite(+settings.digestHour) ? +settings.digestHour : 9;
  const today = localDayKey(now);
  const digestDue = FORCE_DIGEST
    || (!quiet && localParts(now).hh >= digestHour && state.lastDigest !== today);
  let reminders = [];
  if (digestDue) {
    const [objects, estimates, contracts, financeTx, financeMeta] = await Promise.all([
      readJson(K.objects, []), readJson(K.estimates, []), readJson(K.contracts, []),
      readJson(K.financeTx, []), readJson(K.financeMeta, {}),
    ]);
    const data = { objects: objects || [], estimates: estimates || [], contracts: contracts || [],
      productions, financeTx: financeTx || [], accounts: financeMeta?.accounts || [] };
    const analytics = buildAnalytics(data, { period: "month", users, now });

    // Ключ напоминания считается по СОСТАВУ списка, не по дате: пока горит одно
    // и то же, второй раз не пишем. Но раз в неделю повторяем — иначе давняя
    // проблема, о которой сказали один раз, тихо выпадет из виду.
    const repeatMs = (Number(settings.repeatAfterDays) || 7) * 24 * 3600e3;
    const all = [
      ...buildReminderMessages(analytics, { now, settings }),
      // Про будущее: «через три дня выходим», «через пять сдаём». Считается по
      // карточкам производства, а не по журналу — в журнале будущего нет.
      ...buildDateReminders({ objects: data.objects, productions }, { now, settings }),
    ];
    reminders = all.filter(m => !(sentIds[m.id] && now - sentIds[m.id] < repeatMs));
    console.log(`Сводка дня: напоминаний ${all.length}, к отправке ${reminders.length}`
      + `${all.length !== reminders.length ? " (остальное уже отправляли, состав не менялся)" : ""}`);

    // СВОДКИ ЗА ПЕРИОД. Неделя — по понедельникам, месяц — 1-го числа: сводка
    // «за неделю» в среду отвечает на вопрос, которого никто не задавал.
    // Считаем ОТДЕЛЬНОЙ buildAnalytics со своим периодом, иначе в «итогах
    // недели» стояли бы месячные числа.
    const localNow = localParts(now);
    const weekday = new Date(Date.UTC(localNow.y, localNow.m - 1, localNow.d)).getUTCDay();
    for (const d of DIGESTS) {
      const due = FORCE_DIGEST
        || (d.key === "digest_week" && weekday === 1)      // понедельник
        || (d.key === "digest_month" && localNow.d === 1); // первое число
      if (!due) continue;
      const periodAnalytics = buildAnalytics(data, { period: d.period, users, now });
      const msg = buildDigestMessage(periodAnalytics, { key: d.key, now, reasonLabel: refuseReasonLabel });
      if (msg && !sentIds[msg.id]) reminders.push(msg);
    }
  }

  // 4. Кому что
  const letters = routeMessages([...events, ...reminders], { users, links: upd.links, settings });
  console.log(`К отправке писем: ${letters.length}`);

  let ok = 0;
  for (const letter of letters) {
    if (await send(letter.chatId, letter.text)) ok += 1;
    await sleep(120);                       // мягко к лимитам Telegram
  }
  console.log(`Отправлено ${ok} из ${letters.length}`);

  // 5. Состояние. Курсор двигаем по МАКСИМАЛЬНОЙ метке журнала, а не по «сейчас»:
  // запись, добавленная во время прогона, иначе была бы пропущена навсегда.
  const maxTs = entries.reduce((s, e) => Math.max(s, Number(e?.ts) || 0), 0);
  const nextSent = { ...sentIds };
  for (const m of [...events, ...reminders]) nextSent[m.id] = now;
  await writeJson(K.state, {
    lastTs: Math.max(Number(state.lastTs) || 0, firstRun ? now : Math.min(maxTs || sinceTs, now)),
    lastUpdateId: upd.lastUpdateId || 0,
    lastDigest: (digestDue && reminders.length >= 0) ? today : (state.lastDigest || ""),
    sent: pruneSent(nextSent, { now }),
    lastRun: now,
  });
  console.log("Готово.");
}

main().catch((e) => { console.error("СБОЙ:", e.message); process.exit(1); });
