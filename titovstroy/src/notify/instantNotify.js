// УВЕДОМЛЕНИЯ ПО ФАКТУ, А НЕ КОГДА ПРОСНЁТСЯ РАСПИСАНИЕ.
//
// ЧТО БЫЛО СЛОМАНО. Рассылку запускал GitHub Actions по крону. Крон GitHub
// исполняет «по возможности»: из 96 запрошенных тиков в сутки 14 сентября
// случилось ТРИ — 06:31, 12:00 и 18:54. На этот случай в telegramnotify.yml
// стояла подстраховка workflow_run (цепляться к парсеру мастеров, который
// ходит стабильно раз в полчаса), и в комментарии она названа «на деле
// основной». Она не сработала НИ РАЗУ: у воркфлоу ноль прогонов с событием
// workflow_run за всё время. То есть подстраховки не было вообще.
//
// Отсюда и жалоба владельца: смену статуса сделали в 21:57 и 22:01, а в чат
// это пришло в 22:55 — и то лишь потому, что он сам нажал «Отправить сейчас».
//
// ЧТО ДЕЛАЕМ ЗДЕСЬ. Событие рождается в браузере: человек сменил статус —
// приложение дописало строку в журнал. В этот же момент оно и просит запустить
// рассылку. Ждать полчаса, чтобы кто-то заметил уже записанное, незачем.
//
// ПОЧЕМУ НЕ МГНОВЕННО, А ЧЕРЕЗ ПАУЗУ. Воронку разбирают пачкой: в сентябре
// четыре объекта перевели в «Потерян» за полторы минуты. Мгновенный запуск на
// каждую строку дал бы четыре прогона и четыре сообщения вместо одного
// свёрнутого. Поэтому ждём тишины в 20 секунд (человек за это время успевает
// доклацать пачку) и запускаем один раз. Потолок в полторы минуты — чтобы
// непрерывный поток правок не откладывал отправку бесконечно.
//
// ЕСЛИ ЗАПУСК НЕ УДАЛСЯ — МОЛЧИМ. Это фоновая ускорялка, а не действие
// пользователя: он менял статус объекта, а не «отправлял уведомление».
// Ругаться ему в лицо не на что, событие уже лежит в журнале и уйдёт
// ближайшим прогоном. Поэтому ни alert, ни баннера — только console.debug.
import { auditMessage } from "./notifyModel.js";

export const IDLE_MS = 20_000;
export const MAX_WAIT_MS = 90_000;

// Стоит ли вообще будить рассылку из-за этой записи журнала.
//
// Спрашиваем ровно у того же кода, который потом собирает сообщение, — иначе
// два списка «что считать событием» разъедутся, и правило, добавленное в
// notifyModel, молча перестанет приходить быстро. Настройки передаём пустые
// СОЗНАТЕЛЬНО: здесь решается только «это вообще событие?». Выключенные темы,
// заглушённые объекты и тихие часы — забота самого прогона, он читает
// настоящие настройки служебным ключом. Ошибиться в нашу сторону дёшево:
// лишний прогон не отправит ничего, а пропущенное событие ждёт полчаса.
export function isNotifiableEntry(entry) {
  try { return !!auditMessage(entry, {}); } catch { return false; }
}

// Фабрика нужна тестам: там своё время и свои таймеры, без ожидания реальных
// двадцати секунд.
export function createInstantNotifier({
  dispatch,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  idleMs = IDLE_MS,
  maxWaitMs = MAX_WAIT_MS,
} = {}) {
  let timer = null;
  let firstAt = 0;          // когда пришло первое событие текущей пачки
  let latestTs = 0;         // отметка самой свежей записи — её и предъявляем серверу

  const fire = () => {
    timer = null;
    firstAt = 0;
    const ts = latestTs;
    latestTs = 0;
    if (!ts) return;
    try {
      Promise.resolve(dispatch(ts)).catch(() => {});
    } catch { /* фоновая ускорялка молчит при любом сбое */ }
  };

  return {
    note(entry) {
      if (!isNotifiableEntry(entry)) return false;
      const ts = Number(entry?.ts) || Number(now());
      if (ts > latestTs) latestTs = ts;
      const t = Number(now());
      if (!firstAt) firstAt = t;
      if (timer) clearTimer(timer);
      // Сколько осталось до потолка — чтобы поток правок не отодвигал отправку.
      const left = Math.max(0, maxWaitMs - (t - firstAt));
      timer = setTimer(fire, Math.min(idleMs, left));
      return true;
    },
    // Уходя со страницы, отправлять уже поздно, но и висящий таймер не нужен.
    cancel() {
      if (timer) clearTimer(timer);
      timer = null; firstAt = 0; latestTs = 0;
    },
    pending() { return !!timer; },
  };
}

// Сам запрос на запуск. Тело повторяет sendNowTrigger, но заявка другая:
// там человек нажал кнопку и ждёт ответа, здесь — фоновый толчок по событию,
// и подтверждением служит сама запись журнала (её проверяет api/trigger-notify).
export async function dispatchEventRun(ts, { getToken, fetchImpl = fetch } = {}) {
  try {
    const token = await getToken();
    if (!token) return { ok: false, code: "firebase_auth_unavailable" };
    const response = await fetchImpl("/api/trigger-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: "event", at: ts }),
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* пустой ответ — не беда */ }
    if (response.ok && payload?.ok) return { ok: true, ...payload };
    return { ok: false, code: payload?.code || `http_${response.status || 0}` };
  } catch {
    return { ok: false, code: "trigger_unavailable" };
  }
}
