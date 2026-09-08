// Webhook бота — публичный адрес, через который меняется привязка чатов к
// сотрудникам. Кто владеет привязкой, тот получает сводки с выручкой, валовой и
// чистой прибылью, поэтому здесь проверяется в первую очередь не «работает ли»,
// а «не работает ли для чужого».
import { describe, it, expect } from "vitest";
import { createHookHandler } from "./tghook.mjs";

const SECRET = "секрет-которым-подписывает-telegram";
const ENV = { TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_TOKEN: "bot:123" };
const USERS = [{ id: "1", name: "Пётр", login: "p",
  tg: { code: "abc123", subs: { contract_signed: true } } }];

function makeRes() {
  return {
    code: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

// Поддельная база и поддельный Telegram: тест обязан видеть НЕ только ответ
// функции, но и то, что она успела сделать наружу.
function harness({ env = ENV, links = {} } = {}) {
  const writes = [];
  const sent = [];
  const db = {
    configured: () => true,
    async read(key) { return key === "titovstroy-users" ? USERS : links; },
    async write(key, value) { writes.push({ key, value }); return true; },
  };
  const fetchImpl = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  return { writes, sent, handler: createHookHandler({ env, db, fetchImpl }) };
}

const update = (text, chatId = 555) => ({
  message: { chat: { id: chatId }, from: { first_name: "Пётр" }, text },
});
const post = (text, secret = SECRET) => ({
  method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: update(text),
});

describe("webhook бота", () => {
  it("верный секрет: привязывает чат и отвечает в Telegram", async () => {
    const { handler, writes, sent } = harness();
    const res = makeRes();
    await handler(post("/start abc123"), res);
    expect(res.code).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].key).toBe("titovstroy-tg-links");
    expect(writes[0].value["1"].chatId).toBe("555");
    expect(sent[0].body.text).toContain("Готово, Пётр");
  });

  it("чужой секрет: 401 и НИЧЕГО не сделано", async () => {
    const { handler, writes, sent } = harness();
    const res = makeRes();
    await handler(post("/start abc123", "подобранный"), res);
    expect(res.code).toBe(401);
    expect(writes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("секрет не пришёл вовсе: 401 и ничего не сделано", async () => {
    const { handler, writes } = harness();
    const res = makeRes();
    await handler({ method: "POST", headers: {}, body: update("/start abc123") }, res);
    expect(res.code).toBe(401);
    expect(writes).toHaveLength(0);
  });

  // Незаданный секрет — это открытая дверь, а не «пока без охраны»: функция
  // обязана не работать вообще, иначе первый же деплой без переменной окружения
  // отдаёт привязки любому желающему.
  it("секрет не настроен на сервере: не работает вообще", async () => {
    const { handler, writes, sent } = harness({ env: { TELEGRAM_BOT_TOKEN: "bot:123" } });
    const res = makeRes();
    await handler(post("/start abc123", ""), res);
    expect(res.code).toBe(503);
    expect(writes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("не POST — не обслуживаем", async () => {
    const { handler, writes } = harness();
    const res = makeRes();
    await handler({ method: "GET", headers: {}, body: null }, res);
    expect(res.code).toBe(405);
    expect(writes).toHaveLength(0);
  });

  it("не команда — 200 и ни записи, ни ответа (иначе Telegram будет слать заново)", async () => {
    const { handler, writes, sent } = harness();
    const res = makeRes();
    await handler(post("просто текст"), res);
    expect(res.code).toBe(200);
    expect(writes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("база не ответила — 500, чтобы Telegram повторил, и ответ не отправлен", async () => {
    const db = { configured: () => true,
      async read() { throw new Error("нет связи"); }, async write() { return true; } };
    const sent = [];
    const handler = createHookHandler({ env: ENV, db,
      fetchImpl: async () => { sent.push(1); return { ok: true, json: async () => ({ ok: true }) }; } });
    const res = makeRes();
    await handler(post("/start abc123"), res);
    expect(res.code).toBe(500);
    expect(sent).toHaveLength(0);
  });

  // Порядок важен: подтверждение «Готово» не должно уходить человеку, если
  // привязка на самом деле не записалась.
  it("привязка не записалась — подтверждение не отправляется", async () => {
    const db = { configured: () => true,
      async read(key) { return key === "titovstroy-users" ? USERS : {}; },
      async write() { throw new Error("база отказала"); } };
    const sent = [];
    const handler = createHookHandler({ env: ENV, db,
      fetchImpl: async () => { sent.push(1); return { ok: true, json: async () => ({ ok: true }) }; } });
    const res = makeRes();
    await handler(post("/start abc123"), res);
    expect(res.code).toBe(500);
    expect(sent).toHaveLength(0);
  });

  it("неизвестный код: отвечает, но привязку не трогает", async () => {
    const { handler, writes, sent } = harness();
    const res = makeRes();
    await handler(post("/start чужой"), res);
    expect(res.code).toBe(200);
    expect(writes).toHaveLength(0);
    expect(sent[0].body.text).toContain("Не узнал код");
  });
});
