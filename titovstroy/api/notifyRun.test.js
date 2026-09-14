// ОТПРАВКА УВЕДОМЛЕНИЙ ИЗ SERVERLESS-ФУНКЦИИ.
//
// Адрес публичный: его знает любой, кто открыл сайт. Поэтому проверяется в
// первую очередь не «отправляет ли», а «не отправляет ли по выдуманному поводу
// и не пускает ли чужого». Отдельно — что сервисный ключ, который обходит
// правила базы, не может записать ничего, кроме двух узлов рассылки.
import { describe, expect, it, vi } from "vitest";
import { auditMonthKeys, createNotifyRunHandler } from "./notify-run.mjs";
import { createNotifyCronHandler } from "./notify-cron.mjs";

const NOW = 1_789_400_000_000;
const ENV = { TELEGRAM_BOT_TOKEN: "bot:123", NOTIFY_CRON_SECRET: "секрет" };
const ENTRY = { ts: NOW - 30_000, entity: "object", entityId: "o1", objectId: "o1",
  label: "Вера", field: "статус", action: "изменил", old: "Новый", new: "Потерян", by: "Сергей" };

function recorder() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(v) { this.body = v; return this; },
  };
}

// Подставная база: что читается — задаём, что пишется — запоминаем.
function fakeDb(nodes = {}) {
  const writes = [];
  return {
    writes,
    configured: () => true,
    async read(key, fallback = null) {
      return key in nodes ? nodes[key] : fallback;
    },
    async write(key, value) { writes.push([key, value]); return true; },
  };
}

const MONTH_KEY = auditMonthKeys(ENTRY.ts)[0];

// Всё, что нужно, чтобы рассылка реально что-то отправила.
const LIVE = {
  "titovstroy-tg-settings": { on: true, quietFrom: 23, quietTo: 7 },
  "titovstroy-tg-state": { lastTs: ENTRY.ts - 60_000 },
  "titovstroy-tg-links": { u1: { chatId: "555", ts: 1 } },
  "titovstroy-users": [{ id: "u1", name: "Пётр", tg: { subs: { object_status: true } } }],
  [MONTH_KEY]: [ENTRY],
};

function harness({ nodes = LIVE, env = ENV, staffOk = true, journal = [ENTRY] } = {}) {
  const sent = [];
  const db = fakeDb(nodes);
  const fetchImpl = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.includes("accounts:lookup")) {
      return { ok: staffOk, status: staffOk ? 200 : 401,
        json: async () => (staffOk ? { users: [{ localId: "u1" }] } : {}) };
    }
    if (u.includes("/sendMessage")) {
      sent.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ ok: true }) };
    }
    if (/titovstroy_audit_/.test(u)) return { ok: true, json: async () => JSON.stringify(journal) };
    if (u.includes("titovstroy_tg_settings")) {
      return { ok: true, json: async () => JSON.stringify(nodes["titovstroy-tg-settings"] || {}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  const handler = createNotifyRunHandler({ env, db, fetchImpl, now: () => NOW });
  return { handler, sent, db, fetchImpl };
}

const req = (body, over = {}) => ({
  method: "POST",
  headers: { origin: "https://erp.titovstroy.kz", authorization: "Bearer id-token" },
  body, ...over,
});

describe("кто может попросить отправку", () => {
  it("чужой сайт — нет, и до базы дело не доходит", async () => {
    const h = harness();
    const res = recorder();
    await h.handler(req({ kind: "event", at: ENTRY.ts },
      { headers: { origin: "https://evil.example", authorization: "Bearer id-token" } }), res);
    expect(res.statusCode).toBe(403);
    expect(h.sent).toHaveLength(0);
  });

  it("без живого токена сотрудника — нет", async () => {
    const h = harness({ staffOk: false });
    const res = recorder();
    await h.handler(req({ kind: "event", at: ENTRY.ts }), res);
    expect(res.statusCode).toBe(401);
    expect(h.sent).toHaveLength(0);
  });

  // Главное свойство: точка не умеет отправлять «просто так».
  it("выдуманная отметка времени — ничего не уходит", async () => {
    const h = harness();
    const res = recorder();
    await h.handler(req({ kind: "event", at: NOW - 31_000 }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("event_not_found");
    expect(h.sent).toHaveLength(0);
  });

  it("событие старше десяти минут — не «только что»", async () => {
    const h = harness();
    const res = recorder();
    await h.handler(req({ kind: "event", at: NOW - 11 * 60_000 }), res);
    expect(res.statusCode).toBe(400);
  });

  it("неизвестный повод отбрасывается", async () => {
    const h = harness();
    const res = recorder();
    await h.handler(req({ kind: "чтонибудь", at: NOW }), res);
    expect(res.statusCode).toBe(400);
  });

  it("журнал читается токеном сотрудника, а не сервисным ключом", async () => {
    const h = harness();
    await h.handler(req({ kind: "event", at: ENTRY.ts }), recorder());
    const read = h.fetchImpl.mock.calls.map(c => String(c[0])).find(u => /titovstroy_audit_/.test(u));
    expect(read).toContain("auth=id-token");
  });
});

describe("настоящее событие доходит до Telegram", () => {
  it("сообщение уходит в этом же вызове, без всяких прогонов", async () => {
    const h = harness();
    const res = recorder();
    await h.handler(req({ kind: "event", at: ENTRY.ts }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].chat_id).toBe("555");
    expect(h.sent[0].text).toContain("Вера");
  });

  it("рассылка выключена — молчим, но честно отвечаем", async () => {
    const h = harness({ nodes: { ...LIVE, "titovstroy-tg-settings": { on: false } } });
    const res = recorder();
    await h.handler(req({ kind: "event", at: ENTRY.ts }), res);
    expect(res.body.off).toBe(true);
    expect(h.sent).toHaveLength(0);
  });

  // Сервисный ключ обходит правила базы — барьер обязан держать.
  it("пишет ТОЛЬКО свои узлы, к боевым данным не прикасается", async () => {
    const h = harness();
    await h.handler(req({ kind: "event", at: ENTRY.ts }), recorder());
    const keys = h.db.writes.map(([k]) => k);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).toMatch(/^titovstroy-tg-(state|links)$/);
  });
});

describe("кнопка «Отправить сейчас»", () => {
  const withQueue = {
    ...LIVE,
    "titovstroy-tg-settings": { on: true, sendNowQueue: { digest_sales_month: NOW - 1000 } },
  };

  it("заявка записана в настройках — отправляем", async () => {
    const h = harness({ nodes: withQueue });
    const res = recorder();
    await h.handler(req({ kind: "sendNow", at: NOW - 1000, key: "digest_sales_month" }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.manual).toEqual(["digest_sales_month"]);
  });

  it("заявки нет — отказ, ничего не шлём", async () => {
    const h = harness({ nodes: { ...LIVE, "titovstroy-tg-settings": { on: true } } });
    const res = recorder();
    await h.handler(req({ kind: "sendNow", at: NOW - 1000, key: "digest_sales_month" }), res);
    expect(res.statusCode).toBe(409);
    expect(h.sent).toHaveLength(0);
  });
});

describe("расписание", () => {
  const cronReq = (over = {}) => ({ method: "GET", headers: { authorization: "Bearer секрет" }, ...over });

  it("без секрета не пускает", async () => {
    const h = harness();
    const cron = createNotifyCronHandler({ env: ENV, db: h.db, fetchImpl: h.fetchImpl, now: () => NOW });
    const res = recorder();
    await cron(cronReq({ headers: { authorization: "Bearer не-тот" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("секрет не задан — говорим прямо, а не делаем вид, что работает", async () => {
    const h = harness();
    const cron = createNotifyCronHandler({ env: { TELEGRAM_BOT_TOKEN: "b" }, db: h.db,
      fetchImpl: h.fetchImpl, now: () => NOW });
    const res = recorder();
    await cron(cronReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("cron_not_configured");
  });

  it("по секрету прогон идёт и без токена сотрудника", async () => {
    const h = harness();
    const cron = createNotifyCronHandler({ env: ENV, db: h.db, fetchImpl: h.fetchImpl, now: () => NOW });
    const res = recorder();
    await cron(cronReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("секрет Vercel (CRON_SECRET) принимается наравне со своим", async () => {
    const h = harness();
    const cron = createNotifyCronHandler({ env: { TELEGRAM_BOT_TOKEN: "b", CRON_SECRET: "вер" },
      db: h.db, fetchImpl: h.fetchImpl, now: () => NOW });
    const res = recorder();
    await cron(cronReq({ headers: { authorization: "Bearer вер" } }), res);
    expect(res.statusCode).toBe(200);
  });
});

describe("месяц журнала на стыке", () => {
  it("1 октября по Астане ищем и в сентябре, и в октябре", () => {
    const keys = auditMonthKeys(Date.UTC(2026, 8, 30, 21, 30));
    expect(keys).toContain("titovstroy-audit-2026-09");
    expect(keys).toContain("titovstroy-audit-2026-10");
  });

  it("в середине месяца ключ один — лишнего не читаем", () => {
    expect(auditMonthKeys(Date.UTC(2026, 8, 15, 12))).toEqual(["titovstroy-audit-2026-09"]);
  });
});
