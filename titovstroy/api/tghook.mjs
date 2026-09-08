// Мгновенные ответы бота в Telegram.
//
// ЗАЧЕМ. Раньше сообщения из бота забирала только служба в GitHub Actions, раз в
// прогон. Расписание стоит на 15 минут, но GitHub держит его как получится — за
// 11 часов из ~43 запланированных прогонов реально запустились 4. Человек жал
// «Запустить» и час сидел в тишине, после чего резонно решал, что не работает:
// это ловилось трижды подряд («кнопки не работают», «нажал отключить — висит»,
// «заново не переподключает»), и каждый раз причина была одна — читать сообщения
// было некому. Теперь Telegram сам стучится сюда при каждом сообщении, и ответ
// приходит за секунду. За прогонами остаётся только рассылка, где задержка
// значения не имеет: сводки суточные.
//
// ПОЧЕМУ ЭТО ЗАКРЫТО СЕКРЕТОМ. Адрес функции публичный, а сообщение бота — это
// команда «привяжи вот этот чат к вот этому сотруднику». Без проверки любой, кто
// узнал бы адрес, отправил бы сюда поддельный /start и получал бы в свой Telegram
// сводки с выручкой, валовой и чистой прибылью. Поэтому:
//   • Telegram при setWebhook подписывает КАЖДЫЙ запрос заголовком с секретом;
//   • секрет сверяется побайтово с постоянным временем сравнения;
//   • если секрет не задан в переменных окружения — функция не работает ВООБЩЕ
//     (отвечает 503 и ничего не делает). Незаданный секрет — это открытая дверь,
//     а не «пока без охраны», поэтому здесь fail-closed.
//
// ЧТО ОНА МОЖЕТ ТРОГАТЬ. Только titovstroy-tg-links, и это проверяется тем же
// assertWritable, что и у службы: сервисный ключ обходит правила базы, значит
// единственная защита боевых данных — список разрешённых узлов в коде.
import crypto from "node:crypto";
import { createDb } from "./fbrest.mjs";
import { handleBotCommand, assertWritable } from "../src/notify/notifyModel.js";

const K_LINKS = "titovstroy-tg-links";
const K_USERS = "titovstroy-users";

const sameSecret = (a, b) => {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  // timingSafeEqual падает на разной длине, поэтому длину сверяем отдельно.
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

async function tgSend(token, chatId, text, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML",
      disable_web_page_preview: true }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `HTTP ${r.status}`);
  return true;
}

// Vercel обычно разбирает JSON сам, но на всякий случай принимаем и строку:
// пустое или битое тело — это не наш формат, и молча выходим.
function readUpdate(body) {
  if (!body) return null;
  if (typeof body === "string") { try { return JSON.parse(body); } catch { return null; } }
  return typeof body === "object" ? body : null;
}

export function createHookHandler({ env = process.env, db = null,
  fetchImpl = globalThis.fetch } = {}) {
  const store = db || createDb({ env, fetchImpl });

  return async function hookHandler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ ok: false });

    // trim обязателен: в поле Vercel и в секрете GitHub легко остаётся пробел
    // или перевод строки в конце, а сравнение здесь побайтовое. Тогда всё
    // выглядит настроенным, а бот молча отвечает отказом — искать такое можно
    // долго. Пробелов внутри секрета быть и не может: Telegram разрешает в нём
    // только буквы, цифры, «_» и «-».
    const secret = String(env.TELEGRAM_WEBHOOK_SECRET || "").trim();
    const bot = String(env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!secret || !bot || !store.configured()) return res.status(503).json({ ok: false });

    const got = String(req.headers?.["x-telegram-bot-api-secret-token"] || "").trim();
    if (!sameSecret(got, secret)) return res.status(401).json({ ok: false });

    const update = readUpdate(req.body);
    const msg = update?.message;
    // Не сообщение или не команда — Telegram должен получить 200, иначе он будет
    // слать это же снова и снова.
    if (!msg?.chat) return res.status(200).json({ ok: true });

    let users = [];
    let links = {};
    try {
      [users, links] = await Promise.all([
        store.read(K_USERS, []), store.read(K_LINKS, {}),
      ]);
    } catch (e) {
      // База не ответила — это временно. Отвечаем 500, чтобы Telegram повторил
      // доставку: потерять «Запустить» хуже, чем ответить с задержкой.
      console.error("Бот: база недоступна:", e.message);
      return res.status(500).json({ ok: false });
    }

    const out = handleBotCommand({ text: msg.text, chatId: msg.chat.id, from: msg.from,
      users: Array.isArray(users) ? users : [], links: links && typeof links === "object" ? links : {} });
    if (!out) return res.status(200).json({ ok: true });
    console.log(out.log);

    // Сначала запись, потом ответ. Если упадёт запись, человек не получит
    // «Готово», хотя привязки нет: обратный порядок оставил бы его с
    // подтверждением, которому ничего не соответствует.
    if (out.links) {
      try { await store.write(assertWritable(K_LINKS), out.links); }
      catch (e) {
        console.error("Бот: не записались привязки:", e.message);
        return res.status(500).json({ ok: false });
      }
    }
    try { await tgSend(bot, String(msg.chat.id), out.reply, fetchImpl); }
    catch (e) { console.warn(`Бот: не доставлено в ${msg.chat.id}: ${e.message}`); }

    return res.status(200).json({ ok: true });
  };
}

export default createHookHandler();
