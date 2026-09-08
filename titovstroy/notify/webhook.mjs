// Включить / выключить / проверить webhook бота.
//
// Запускается из GitHub Actions («Run workflow» → поле «webhook»), потому что
// токен бота уже лежит там в секретах: так его не приходится вставлять в
// браузер или носить по переписке.
//
// ПРОВЕРИТЬ — самое полезное из трёх. Telegram показывает СВОЙ взгляд на бота:
// какой адрес он зовёт, сколько сообщений ждёт доставки и, главное, с какой
// ошибкой он получил отказ в последний раз. Именно этого не хватало, когда бот
// молчал: снаружи это выглядело одинаково — и «никто не писал», и «мы не
// прочитали», и «Vercel отказал».

// trim — по той же причине, что и в api/tghook.mjs: хвостовой перевод строки
// в секрете превратил бы «настроено» в молчаливый отказ.
const BOT = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const URL_ = (process.env.WEBHOOK_URL || "https://erp.titovstroy.kz/api/tghook").trim();
const ACTION = (process.env.WEBHOOK_ACTION || "проверить").trim();

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}

const when = (sec) => (sec ? new Date(Number(sec) * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—");

async function show() {
  const i = await tg("getWebhookInfo");
  // Задан ли secret_token, Telegram не показывает — узнать это можно только
  // включив заново. Врать про «секрет проверяется: да» здесь нельзя: строчка,
  // которой нечем подтвердиться, хуже её отсутствия.
  console.log(`Адрес:            ${i.url || "(не задан — бот работает опросом)"}`);
  console.log(`Ждут доставки:    ${i.pending_update_count ?? 0}`);
  console.log(`Последняя ошибка: ${i.last_error_message || "нет"}${i.last_error_date ? ` (${when(i.last_error_date)})` : ""}`);
  if (i.last_synchronization_error_date) {
    console.log(`Сбой синхронизации: ${when(i.last_synchronization_error_date)}`);
  }
  return i;
}

async function main() {
  if (!BOT) throw new Error("Нет секрета TELEGRAM_BOT_TOKEN");

  if (ACTION === "включить") {
    if (!SECRET) {
      throw new Error("Нет секрета TELEGRAM_WEBHOOK_SECRET. Без него включать нельзя: "
        + "адрес функции публичный, и без подписи Telegram любой смог бы прислать "
        + "поддельный /start и привязать чужой чат к сотруднику.");
    }
    // drop_pending_updates НЕ ставим: сообщения, которые человек уже отправил
    // боту, должны дойти, а не исчезнуть при переключении.
    await tg("setWebhook", { url: URL_, secret_token: SECRET, allowed_updates: ["message"] });
    console.log(`Включено: ${URL_}`);
    console.log("Опрос из прогонов больше не нужен — служба сама это увидит и перестанет опрашивать.\n");
    await show();
    return;
  }

  if (ACTION === "выключить") {
    await tg("deleteWebhook", {});
    console.log("Выключено. Бот снова отвечает только во время прогонов службы (до часа).\n");
    await show();
    return;
  }

  await show();
}

main().catch((e) => { console.error("СБОЙ:", e.message); process.exit(1); });
