// РАССЫЛКА ПО РАСПИСАНИЮ — НА СЕРВЕРЕ, БЕЗ БРАУЗЕРА.
//
// Владелец: «то есть если мой ноутбук выключен, ничего не будет? что за гон».
// Гон и был. Я построил часы на открытой вкладке: пока у кого-то открыта CRM,
// она спрашивает «пора?». Выключили ноутбук, закрыли телефон — часов нет, и
// сводка ждала запасного прогона Actions, который приходит когда захочет.
// Расписание, работающее только при свидетелях, — не расписание.
//
// Теперь сюда в назначенный час стучится планировщик Vercel (vercel.json →
// crons). Это его серверы, наш код там уже развёрнут, браузер не участвует
// вообще. Вкладка осталась ускорителем: открыта — сводка уйдёт ровно в свой
// час, закрыта — придёт от планировщика.
//
// ЧЕСТНО ПРО ТОЧНОСТЬ. На тарифе Hobby планировщик Vercel можно ставить раз в
// сутки, и минута в минуту он не гарантирован. Для «сводка в 10:00» это
// годится, для секундной точности — нет: её дал бы внешний планировщик (тот
// же, что каждые полчаса дёргает парсер) одним адресом и заголовком.
//
// КТО СЮДА ПУСКАЕТСЯ:
//   • задан секрет (CRON_SECRET или NOTIFY_CRON_SECRET в настройках Vercel) —
//     пускаем только по нему, кто бы ни стучался. Это самый строгий режим, и
//     он же нужен внешнему планировщику;
//   • секрет не задан — пускаем ТОЛЬКО собственный планировщик Vercel, он
//     представляется своим user-agent. Подделать заголовок, конечно, можно, и
//     поэтому в этом режиме наружу не уходит ни строчки внутренних подробностей.
//     Максимум, чего добьётся чужой, — сводка придёт раньше назначенного часа
//     один раз за сутки: что отправлять, решает не запрос, а сам движок (час
//     сводки из Админки, отметка «сегодня уже отправляли», тихие часы).
//     Задать секрет — закрыть и это.
//
import { createNotifyRunHandler } from "./notify-run.mjs";

export function createNotifyCronHandler(options = {}) {
  const env = options.env || process.env;
  const run = createNotifyRunHandler({ ...options, cronPreAuthorized: true });

  return async function notifyCronHandler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(405).json({ ok: false, code: "method_not_allowed" });
    }
    // Секрет берём из NOTIFY_CRON_SECRET, а если его не задали — из CRON_SECRET,
    // который Vercel подставляет своему планировщику сам. Одна переменная на
    // оба случая: две настройки ради одного и того же — лишний способ ошибиться.
    const secret = String(env.NOTIFY_CRON_SECRET || env.CRON_SECRET || "").trim();
    const given = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const ua = String(req.headers?.["user-agent"] || "");
    const fromVercelCron = /vercel-cron/i.test(ua);
    if (secret ? given !== secret : !fromVercelCron) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(401).json({ ok: false, code: secret ? "bad_cron_secret" : "cron_caller_unknown" });
    }
    // Дальше — обычный прогон. Переписываем запрос в тот вид, который ждёт
    // основная точка: повод «cron», проверка вызывающего уже пройдена.
    const quiet = !secret;      // пустили по user-agent — подробностей не отдаём
    const proxy = quiet ? {
      ...res,
      status: (code) => ({ json: () => res.status(code).json({ ok: code < 400 }) }),
      setHeader: (...a) => res.setHeader(...a),
    } : res;
    return run({ ...req, method: "POST", body: { kind: "cron" }, headers: req.headers }, proxy);
  };
}

export default createNotifyCronHandler();
