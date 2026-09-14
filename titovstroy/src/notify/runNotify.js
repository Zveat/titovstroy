// ОДИН ПРОГОН РАССЫЛКИ — БЕЗ ПРИВЯЗКИ К ТОМУ, ГДЕ ОН ИДЁТ.
//
// Раньше весь этот код жил внутри notify/send.mjs, то есть внутри GitHub Actions,
// и запустить рассылку иначе как прогоном Actions было нельзя. Прогон — это
// checkout, установка зависимостей и минута ожидания в лучшем случае, а очередь
// GitHub может держать его и дольше. Для «сменил статус — пришло уведомление»
// это не годится.
//
// Поэтому вся работа вынесена сюда и принимает ввод-вывод снаружи:
//   read(key, fallback)      — прочитать узел базы
//   write(key, value)        — записать узел (барьер assertWritable внутри)
//   sendMessage(chatId, text) — отправить, вернуть true/false
//   processUpdates(...)      — опрос команд бота; нужен только там, где webhook
//                              выключен. На Vercel команды приходят сами.
//
// Теперь это запускает и serverless-функция на Vercel (api/notify-run.mjs —
// доли секунды, основной путь), и прежний прогон Actions (запасной).
//
// БЕЗОПАСНОСТЬ ЗДЕСЬ ТА ЖЕ. Оба вызывающих ходят в базу ключом, который обходит
// её правила: технически он может переписать сметы и финансы. Поэтому запись
// идёт ТОЛЬКО через здешний writeGuarded с assertWritable — разрешены два
// собственных узла, всё остальное роняет прогон, а не портит базу молча.
import { buildAnalytics, refuseReasonLabel } from "../analytics/analyticsModel.js";
import { buildObjectSums } from "./objectSums.js";
import {
  DIGESTS, assertWritable, buildDateReminders, buildDigestMessage, buildEventMessages,
  buildReminderMessages, buildSubsChangeMessages, inQuietHours, isDigestDue, localDayKey,
  localParts, makeEventContext, markSendNowDone, nextCursor, pendingSendNow, pruneSent,
  routeMessages,
} from "./notifyModel.js";

export const K = {
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

export async function runNotify(io, { now = Date.now(), forceDigest = false } = {}) {
  const log = io.log || (() => {});
  const read = io.read;
  const write = async (key, value) => { assertWritable(key); return io.write(key, value); };
  const send = io.sendMessage;

  const settings = (await read(K.settings, {})) || {};
  const state = (await read(K.state, {})) || {};
  const links = (await read(K.links, {})) || {};
  const users = (await read(K.users, [])) || [];

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
    await send(link.chatId, "Уведомления TitovStroy отключены администратором.\n"
      + "Чтобы вернуть — попросите новую ссылку для подключения.");
    delete links[userId];
    unlinked += 1;
    log(`Отключён: ${who?.name || userId}`);
  }
  if (unlinked) await write(K.links, links);

  // Опрос команд бота — только там, где нет webhook. Отсутствие — норма.
  const upd = io.processUpdates
    ? await io.processUpdates({ state, users, links })
    : { links, changed: false, lastUpdateId: state.lastUpdateId };
  if (upd.changed) await write(K.links, upd.links);
  if (upd.lastUpdateId !== state.lastUpdateId) {
    await write(K.state, { ...state, lastUpdateId: upd.lastUpdateId, lastRun: now });
  }

  if (!settings.on) {
    log("Рассылка выключена в Админке. Привязки и команды бота обработаны, "
      + "сообщения не отправляются.");
    return { off: true, sent: 0, events: 0, reminders: 0 };
  }

  const quiet = inQuietHours(now, settings);
  if (quiet) log("Тихие часы — сообщения подождут до утра, ничего не теряется.");

  // СОБЫТИЯ ИЗ ЖУРНАЛА.
  //
  // Прошлый месяц нужен ТОЛЬКО на стыке: прогон в ночь на 1-е должен добрать
  // вчерашние записи. Читать его каждый раз — самый тяжёлый кусок трафика:
  // журнал за месяц измерен на боевой в 54 КБ на 8-е число и к концу месяца
  // вырастает в разы. Берём первые двое суток месяца, с запасом.
  const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const nowD = new Date(now);
  const months = [ym(nowD)];
  if (localParts(now).d <= 2) {
    months.push(ym(new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - 1, 1))));
  }
  let entries = [];
  for (const m of months) entries = entries.concat((await read(K.auditMonth(m), [])) || []);

  // ПЕРВЫЙ ЗАПУСК. Курсора ещё нет — если взять ноль, в чат прилетит вся история
  // за три месяца одной простынёй. Поэтому стартуем «с этого момента».
  const firstRun = !Number(state.lastTs);
  const sinceTs = firstRun ? now : Number(state.lastTs);
  if (firstRun) log("Первый запуск: старые записи журнала не рассылаем, начинаем с текущего момента.");

  const sentIds = pruneSent(state.sent || {}, { now });

  // ПЕРВЫЙ ПРОХОД — БЕЗ ДОПОЛНЕНИЙ, ТОЛЬКО ЧТОБЫ УЗНАТЬ, ЕСТЬ ЛИ ВООБЩЕ СОБЫТИЯ.
  // Набор сообщений от дополнений не зависит (они лишь добавляют строки внутрь),
  // а тяжёлые узлы за ними читать незачем, если отправлять нечего.
  let events = quiet ? [] : buildEventMessages(entries, { sinceTs, sentIds, settings });

  const digestHour = Number.isFinite(+settings.digestHour) ? +settings.digestHour : 9;
  const today = localDayKey(now);

  // ОТПРАВИТЬ СЕЙЧАС, КНОПКОЙ ИЗ АДМИНКИ. Заявок может быть несколько: владелец
  // нажимает подряд все сводки, которые хочет увидеть. Тихие часы и «уже
  // отправляли сегодня» для ручной отправки не действуют — их и просят обойти.
  const { keys: askKeys, ats: askAts, skipped } = pendingSendNow({ settings, state, now });
  const manual = askKeys.length > 0;
  for (const [key, why] of skipped) log(`Заявка «отправить сейчас» (${key}) пропущена: ${why}`);
  if (manual) log(`Ручная отправка: ${askKeys.join(", ")}`);

  const digestDue = forceDigest || manual
    || (!quiet && localParts(now).hh >= digestHour && state.lastDigest !== today);

  // КАРТОЧКИ ПРОИЗВОДСТВА — 421 КБ. Прогонов теперь много (каждое событие плюс
  // расписание), и подавляющее большинство не находит ничего. Читаем, только
  // когда есть что дополнять (события) или что считать (сводка).
  const productions = (events.length || digestDue) ? ((await read(K.productions, [])) || []) : [];

  // СУММЫ — ТОЛЬКО ЕСЛИ ДОГОВОР ДЕЙСТВИТЕЛЬНО ПОДПИСАЛИ. Договоры и сметы вместе
  // весят 374 КБ, а подписаний — три в месяц.
  let sumsByObject = null;
  if (events.some(m => (m.key || m.event) === "contract_signed")) {
    const [contracts, estimates] = await Promise.all([
      read(K.contracts, []), read(K.estimates, []),
    ]);
    sumsByObject = buildObjectSums(contracts || [], estimates || []);
    log(`Подписание в журнале — читаю суммы: объектов с суммой ${Object.keys(sumsByObject).length}`);
  }
  if (events.length) {
    events = buildEventMessages(entries, {
      sinceTs, sentIds, settings, context: makeEventContext({ productions, sumsByObject }),
    });
  }
  log(`Журнал: записей ${entries.length}, к отправке событий ${events.length}`);

  let reminders = [];
  if (digestDue) {
    const [objects, estimates, contracts, financeTx, financeMeta] = await Promise.all([
      read(K.objects, []), read(K.estimates, []), read(K.contracts, []),
      read(K.financeTx, []), read(K.financeMeta, {}),
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
    if (manual) {
      // Просили конкретные — остальное не трогаем, иначе нажатие «покажи
      // просроченные этапы» вываливало бы разом и сводку, и всё остальное.
      reminders = all.filter(m => askKeys.includes(m.key || m.event));
      log(`Ручная отправка «${askKeys.join(", ")}»: сообщений ${reminders.length}`
        + (reminders.length ? "" : " — сейчас по этим напоминаниям нечего показать"));
    } else {
      reminders = all.filter(m => !(sentIds[m.id] && now - sentIds[m.id] < repeatMs));
      log(`Сводка дня: напоминаний ${all.length}, к отправке ${reminders.length}`
        + `${all.length !== reminders.length ? " (остальное уже отправляли, состав не менялся)" : ""}`);
    }

    // СВОДКИ ЗА ПЕРИОД. Пора ли слать — решает isDigestDue по периоду самой
    // сводки: перечисление ключей рано или поздно расходится с каталогом, и
    // сводки отдела продаж из-за этого не уходили ни разу.
    for (const d of DIGESTS) {
      if (manual && !askKeys.includes(d.key)) continue;   // шлём ровно те, что просили
      if (!isDigestDue(d, { now, force: forceDigest || manual })) continue;
      const periodAnalytics = buildAnalytics(data, { period: d.period, users, now });
      const msg = buildDigestMessage(periodAnalytics, { key: d.key, now, reasonLabel: refuseReasonLabel });
      // ПО КНОПКЕ «УЖЕ ОТПРАВЛЯЛИ» НЕ ДЕЙСТВУЕТ. У напоминаний защиту сняли
      // сразу, а у сводок она осталась — и нажатие на сводку, которая сегодня
      // уже уходила, молча не давало ничего.
      if (msg && (manual || !sentIds[msg.id])) reminders.push(msg);
    }
  }

  const letters = routeMessages([...events, ...reminders], { users, links: upd.links, settings });
  log(`К отправке писем: ${letters.length}`);

  // «Администратор изменил, что вам приходит». Бот сам просит сходить к
  // администратору, тот отмечает — и человеку об этом никто не говорит. В тихие
  // часы не шлём и отпечаток НЕ запоминаем: иначе изменение, сделанное вечером,
  // считалось бы объявленным, а человек о нём так и не узнал бы.
  const subsChange = quiet
    ? { messages: [], fingerprints: state.subsSent || {} }
    : buildSubsChangeMessages({ users, links: upd.links, sent: state.subsSent || {} });
  if (subsChange.messages.length) log(`Изменились подписки у: ${subsChange.messages.length}`);

  const outbox = [...letters, ...subsChange.messages];
  let ok = 0;
  for (const letter of outbox) {
    if (await send(letter.chatId, letter.text)) ok += 1;
    if (io.pause) await io.pause();          // мягко к лимитам Telegram
  }
  log(`Отправлено ${ok} из ${outbox.length}`);

  // Состояние. Как двигается курсор — в nextCursor (там же про тихие часы:
  // ночью он обязан стоять на месте, иначе ночные события пропадают).
  const maxTs = entries.reduce((s, e) => Math.max(s, Number(e?.ts) || 0), 0);
  const nextSent = { ...sentIds };
  for (const m of [...events, ...reminders]) nextSent[m.id] = now;
  await write(K.state, {
    lastTs: nextCursor({ prev: state.lastTs, maxTs, sinceTs, now, firstRun, quiet }),
    lastUpdateId: upd.lastUpdateId || 0,
    // Ручная отправка НЕ закрывает день: иначе нажатие кнопки утром отменило бы
    // обычную дневную сводку, и человек получил бы одно сообщение вместо двух.
    lastDigest: (digestDue && !manual) ? today : (state.lastDigest || ""),
    // Заявки выполнены — второй раз по ним не шлём. Отметка по каждому ключу
    // своя: одна общая означала бы, что первая выполненная гасит все остальные,
    // нажатые в ту же минуту.
    sentNow: markSendNowDone(state.sentNow || {}, askKeys, askAts, { now }),
    // Старое общее поле — ради заявок от прежней версии приложения.
    lastSendNow: Math.max(
      Number(state.lastSendNow) || 0,
      ...askKeys.map(k => Number(askAts[k]) || 0),
    ),
    subsSent: subsChange.fingerprints,
    sent: pruneSent(nextSent, { now }),
    lastRun: now,
  });
  return { off: false, sent: ok, outbox: outbox.length, events: events.length,
    reminders: reminders.length, manual: askKeys, quiet, digestDue };
}
