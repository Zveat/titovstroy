// ВХОД «ЗАПУСТИТЬ РАССЫЛКУ». Точка публичная: адрес знает любой, кто открыл
// сайт. Проверяется в первую очередь не «запускается ли», а «не запускается ли
// у того, кому не положено, и не по выдуманному поводу».
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createNotifyTriggerHandler, auditMonthKeys, hasEntryAt } = require("./trigger-notify.js");

const NOW = 1_789_400_000_000;

function responseRecorder() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
  };
}

const request = (body, over = {}) => ({
  method: "POST",
  headers: { origin: "https://erp.titovstroy.kz", authorization: "Bearer id-token" },
  body,
  ...over,
});

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const IDENTITY = json(200, { users: [{ localId: "u1" }] });

// Подставной мир: кто чем отвечает, решает карта по кускам адреса.
function world({ settings = { on: true }, month = [], runs = [], dispatch = json(204, {}) } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method || "GET" });
    if (u.includes("accounts:lookup")) return IDENTITY;
    if (u.includes("titovstroy_tg_settings")) return json(200, JSON.stringify(settings));
    if (u.includes("titovstroy_tg_state")) return json(200, JSON.stringify({ lastSendNow: 0 }));
    if (/titovstroy_audit_/.test(u)) return json(200, JSON.stringify(month));
    if (u.includes("/runs")) return json(200, { workflow_runs: runs });
    if (u.includes("/dispatches")) return dispatch;
    throw new Error("непредусмотренный запрос: " + u);
  };
  return { calls, fetchImpl };
}

const handler = (w) => createNotifyTriggerHandler({
  githubToken: "gh", fetchImpl: w.fetchImpl, now: () => NOW,
  databaseUrl: "https://db.example.com", allowedOrigins: ["https://erp.titovstroy.kz"],
});

const ENTRY = { ts: NOW - 30_000, entity: "object", field: "статус", new: "Потерян" };

describe("заявка по событию", () => {
  it("запускает прогон, когда запись с такой отметкой правда есть в журнале", async () => {
    const w = world({ month: [ENTRY] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: ENTRY.ts }), res);
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ ok: true, dispatched: true });
    expect(w.calls.some(c => c.url.includes("/dispatches") && c.method === "POST")).toBe(true);
  });

  // Главное в этой точке: без настоящего действия она ничего не запускает.
  it("выдуманная отметка времени — отказ, GitHub не трогаем", async () => {
    const w = world({ month: [ENTRY] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: NOW - 31_000 }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("event_not_found");
    expect(w.calls.some(c => c.url.includes("/dispatches"))).toBe(false);
  });

  it("чужой сайт не дёрнет запуск даже с правильным телом", async () => {
    const w = world({ month: [ENTRY] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: ENTRY.ts },
      { headers: { origin: "https://evil.example", authorization: "Bearer id-token" } }), res);
    expect(res.statusCode).toBe(403);
    expect(w.calls.length).toBe(0);
  });

  it("протухшее событие не будит рассылку — это уже не «только что»", async () => {
    const old = NOW - 11 * 60_000;
    const w = world({ month: [{ ...ENTRY, ts: old }] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: old }), res);
    expect(res.statusCode).toBe(400);
    expect(w.calls.length).toBe(0);
  });

  it("рассылка выключена — тихо расходимся, а не падаем", async () => {
    const w = world({ settings: { on: false }, month: [ENTRY] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: ENTRY.ts }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, skipped: "notify_off" });
    expect(w.calls.some(c => c.url.includes("/dispatches"))).toBe(false);
  });

  it("прогон уже стоит в очереди — второй не заводим", async () => {
    const w = world({ month: [ENTRY], runs: [{ id: 7, status: "queued" }] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: ENTRY.ts }), res);
    expect(res.body).toEqual({ ok: true, coalesced: true, runId: 7 });
    expect(w.calls.some(c => c.url.includes("/dispatches"))).toBe(false);
  });

  it("идущий прогон начался ПОСЛЕ записи — он её увидит, нового не надо", async () => {
    const w = world({ month: [ENTRY],
      runs: [{ id: 8, status: "in_progress", created_at: new Date(ENTRY.ts + 20_000).toISOString() }] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: ENTRY.ts }), res);
    expect(res.body.coalesced).toBe(true);
  });

  // Тонкое место: прогон, стартовавший ДО записи, мог прочитать журнал без неё.
  it("идущий прогон начался ДО записи — запускаем свой", async () => {
    const w = world({ month: [ENTRY],
      runs: [{ id: 9, status: "in_progress", created_at: new Date(ENTRY.ts - 5_000).toISOString() }] });
    const res = responseRecorder();
    await handler(w)(request({ kind: "event", at: ENTRY.ts }), res);
    expect(res.body).toEqual({ ok: true, dispatched: true });
  });

  it("журнал читается токеном самого сотрудника, а не служебным ключом", async () => {
    const w = world({ month: [ENTRY] });
    await handler(w)(request({ kind: "event", at: ENTRY.ts }), responseRecorder());
    const read = w.calls.find(c => /titovstroy_audit_/.test(c.url));
    expect(read.url).toContain("auth=id-token");
  });
});

describe("кнопка «Отправить сейчас» работает как раньше", () => {
  it("заявка в настройках совпала — запускаем", async () => {
    const w = world({ settings: { on: true, sendNow: { at: NOW - 1000, key: "stages" } } });
    const res = responseRecorder();
    await handler(w)(request({ at: NOW - 1000 }), res);
    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ ok: true, dispatched: true });
  });

  it("заявки в настройках нет — отказ", async () => {
    const w = world({ settings: { on: true } });
    const res = responseRecorder();
    await handler(w)(request({ at: NOW - 1000 }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("request_not_pending");
  });

  it("неизвестный вид заявки отбрасывается", async () => {
    const w = world();
    const res = responseRecorder();
    await handler(w)(request({ kind: "чтонибудь", at: NOW - 1000 }), res);
    expect(res.statusCode).toBe(400);
    expect(w.calls.length).toBe(0);
  });
});

describe("месяц журнала на стыке", () => {
  // Приложение считает месяц по часам Астаны (UTC+5), Vercel живёт в UTC:
  // 1 октября в 02:00 по Астане — это ещё 30 сентября по UTC.
  it("на стыке месяцев ищем и в сентябре, и в октябре", () => {
    const boundary = Date.UTC(2026, 8, 30, 21, 30); // 1 окт 02:30 по Астане
    const keys = auditMonthKeys(boundary);
    expect(keys).toContain("titovstroy_audit_2026_09");
    expect(keys).toContain("titovstroy_audit_2026_10");
  });

  it("в середине месяца ключ ровно один — лишнего не читаем", () => {
    expect(auditMonthKeys(Date.UTC(2026, 8, 15, 12, 0))).toEqual(["titovstroy_audit_2026_09"]);
  });

  it("запись ищется по точному совпадению отметки", () => {
    expect(hasEntryAt([{ ts: 5 }, { ts: 7 }], 7)).toBe(true);
    expect(hasEntryAt([{ ts: 5 }, { ts: 7 }], 6)).toBe(false);
    expect(hasEntryAt(null, 7)).toBe(false);
  });
});
