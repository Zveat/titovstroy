// РАССЫЛКА ПО РАСПИСАНИЮ. Тот же движок, что и у мгновенной отправки, только
// повод другой: не действие человека, а наступившее время.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ АДРЕС. Планировщики ходят GET-запросом и без токена
// сотрудника — им нечем подтвердить повод, кроме общего секрета. Смешивать это
// с точкой, куда приходит браузер, не стоит: там проверки другие и строже.
//
// ЭТОТ АДРЕС НИКОМУ НЕ ОБЯЗАТЕЛЕН, И ЭТО ВАЖНО. Расписание держится само:
// открытая вкладка раз в минуту спрашивает «пора?» (notify/notifyTicker.js), и
// в час сводки ответ становится «да» — настраивать для этого нечего. Плюс раз в
// час то же самое делает прогон Actions, когда вкладок нет вовсе.
//
// Точка оставлена на случай, если захочется расписание, не зависящее от
// открытого браузера: внешний планировщик (тот же, что дёргает парсер мастеров)
// шлёт сюда GET с заголовком Authorization: Bearer <секрет>, где секрет —
// переменная CRON_SECRET или NOTIFY_CRON_SECRET в настройках Vercel. Пока
// переменной нет, адрес честно отвечает «не настроено» и ничего не делает.
//
// Планировщика самого Vercel здесь нет намеренно: на тарифе Hobby он ходит РАЗ
// В СУТКИ и с точностью «в течение часа» — хуже и тика, и часового запаса, а
// без переменной ещё и падал бы каждый день в панели.
//
// ЧТО ИМЕННО УЙДЁТ, РЕШАЕТ НЕ РАСПИСАНИЕ, А САМ ДВИЖОК: он смотрит час сводки
// из Админки, отметку «сегодня уже отправляли» и тихие часы. Поэтому лишний
// заход безвреден — он просто ничего не найдёт. Значит планировщик можно
// ставить хоть каждые пять минут, и это же делает его подстраховкой для
// событий, если у кого-то не дошла мгновенная отправка.
import { createNotifyRunHandler } from "./notify-run.mjs";

export function createNotifyCronHandler(options = {}) {
  const env = options.env || process.env;
  const run = createNotifyRunHandler(options);

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
    if (!secret) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ ok: false, code: "cron_not_configured" });
    }
    if (given !== secret) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(401).json({ ok: false, code: "bad_cron_secret" });
    }
    // Дальше — обычный прогон. Переписываем запрос в тот вид, который ждёт
    // основная точка: повод «cron», проверка секрета уже пройдена.
    return run({ ...req, method: "POST", body: { kind: "cron" }, headers: req.headers }, res);
  };
}

export default createNotifyCronHandler();
