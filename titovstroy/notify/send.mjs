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
  makeEventContext, routeMessages, DIGESTS,
  inQuietHours, localDayKey, localParts, assertWritable, pruneSent, nextCursor,
  handleBotCommand, buildSubsChangeMessages,
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
async function main() {
  initFb();
  const settings = await readJson(K.settings, {}) || {};
  const state = await readJson(K.state, {}) || {};
  const links = await readJson(K.links, {}) || {};
  const users = (await readJson(K.users, [])) || [];
  const now = Date.now();

  // ПРИВЯЗКИ ОБРАБАТЫВАЕМ ДО ПРОВЕРКИ «ВКЛЮЧЕНО». Настраивают уведомления именно
  // тогда, когда рассылка ещё выключена: сотрудник жмёт «Запустить» в боте, в
  // группе отправляют /id, чтобы узнать её номер. Если выйти раньше, ни то ни
  // другое не сработает — и включить будет нечего.
  // ЗАЯВКИ НА ОТКЛЮЧЕНИЕ. Админка не может писать в узел привязок (защита от
  // подмены чужого chatId), поэтому она оставляет отметку времени в настройках,
  // а связь снимаем здесь. Сравниваем со временем самой привязки: если человек
  // после отключения подключился заново, его привязка новее заявки и остаётся.
  // Поэтому заявку не нужно вычищать — она просто перестаёт действовать.
  let unlinked = 0;
  for (const [userId, at] of Object.entries(settings.unlink || {})) {
    const link = links[userId];
    if (!link?.chatId || Number(link.ts || 0) > Number(at || 0)) continue;
    const who = users.find(u => u.id === userId);
    await send(link.chatId, `Уведомления TitovStroy отключены администратором.\n`
      + "Чтобы вернуть — попросите новую ссылку для подключения.");
    delete links[userId];
    unlinked += 1;
    console.log(`Отключён: ${who?.name || userId}`);
  }
  if (unlinked) await writeJson(K.links, links);

  const upd = await processUpdates(state, users, links);
  if (upd.changed) await writeJson(K.links, upd.links);
  if (upd.lastUpdateId !== state.lastUpdateId) {
    await writeJson(K.state, { ...state, lastUpdateId: upd.lastUpdateId, lastRun: now });
  }

  if (!settings.on) {
    console.log("Рассылка выключена в Админке. Привязки и команды бота обработаны, "
      + "сообщения не отправляются.");
    return;
  }

  const quiet = inQuietHours(now, settings);
  if (quiet) console.log("Тихие часы — сообщения подождут до утра, ничего не теряется.");

  // 2. События из журнала.
  //
  // Прошлый месяц нужен ТОЛЬКО на стыке: прогон в ночь на 1-е должен добрать
  // вчерашние записи. Раньше он читался каждый прогон — а это самый тяжёлый
  // кусок трафика: журнал за месяц измерен на боевой в 54 КБ на 8-е число и к
  // концу месяца вырастает в разы. Читать его 96 раз в сутки 30 дней подряд
  // ради двух дней в месяц незачем. Берём первые двое суток месяца — с запасом
  // на то, что прогоны GitHub пропускает.
  const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const nowD = new Date(now);
  const months = [ym(nowD)];
  if (localParts(now).d <= 2) {
    months.push(ym(new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 1))));
  }
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

  // 4б. «Администратор изменил, что вам приходит». Бот сам просит сходить к
  // администратору, тот отмечает — и человеку об этом никто не говорит. В тихие
  // часы не шлём и отпечаток НЕ запоминаем: иначе изменение, сделанное вечером,
  // считалось бы объявленным, а человек о нём так и не узнал бы.
  const subsChange = quiet
    ? { messages: [], fingerprints: state.subsSent || {} }
    : buildSubsChangeMessages({ users, links: upd.links, sent: state.subsSent || {} });
  if (subsChange.messages.length) {
    console.log(`Изменились подписки у: ${subsChange.messages.length}`);
  }

  const outbox = [...letters, ...subsChange.messages];
  let ok = 0;
  for (const letter of outbox) {
    if (await send(letter.chatId, letter.text)) ok += 1;
    await sleep(120);                       // мягко к лимитам Telegram
  }
  console.log(`Отправлено ${ok} из ${outbox.length}`);

  // 5. Состояние. Как двигается курсор — в nextCursor (там же про тихие часы,
  // ночью он обязан стоять на месте, иначе ночные события пропадают).
  const maxTs = entries.reduce((s, e) => Math.max(s, Number(e?.ts) || 0), 0);
  const nextSent = { ...sentIds };
  for (const m of [...events, ...reminders]) nextSent[m.id] = now;
  await writeJson(K.state, {
    lastTs: nextCursor({ prev: state.lastTs, maxTs, sinceTs, now, firstRun, quiet }),
    lastUpdateId: upd.lastUpdateId || 0,
    lastDigest: (digestDue && reminders.length >= 0) ? today : (state.lastDigest || ""),
    subsSent: subsChange.fingerprints,
    sent: pruneSent(nextSent, { now }),
    lastRun: now,
  });
  console.log("Готово.");
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
