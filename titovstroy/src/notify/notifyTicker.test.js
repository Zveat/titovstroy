// РАСПИСАНИЕ БЕЗ ПЛАНИРОВЩИКА: вкладка спрашивает «пора?», решает сервер.
//
// Здесь проверяется главное свойство — что тик ДЁШЕВ, пока ничего не назначено,
// и что в час сводки он становится «да». Если это сломать, либо сводка перестанет
// приходить вовремя, либо каждая минута начнёт читать журнал.
import { describe, expect, it, vi } from "vitest";
import { whatIsDue } from "../../api/notify-run.mjs";
import { askIfDue, startNotifyTicker } from "./notifyTicker.js";

// 14 сентября 2026, Астана UTC+5.
const at = (hh, mm = 0) => Date.UTC(2026, 8, 14, hh - 5, mm);
const ON = { on: true, digestHour: 10 };
const FRESH = (now) => ({ lastRun: now - 1000, lastDigest: "2026-09-14" });

describe("когда сервер говорит «пора»", () => {
  it("в 09:59 — ещё нет", () => {
    const now = at(9, 59);
    expect(whatIsDue({ settings: ON, state: FRESH(now), now })).toBe(null);
  });

  it("в 10:00 — да, сводка", () => {
    const now = at(10, 0);
    expect(whatIsDue({ settings: ON, state: { ...FRESH(now), lastDigest: "2026-09-13" }, now }))
      .toBe("digest");
  });

  it("сводку сегодня уже отправляли — снова не поднимаем", () => {
    const now = at(11, 0);
    expect(whatIsDue({ settings: ON, state: FRESH(now), now })).toBe(null);
  });

  it("час сводки берётся из Админки, а не зашит", () => {
    const now = at(9, 0);
    const state = { lastRun: now - 1000, lastDigest: "2026-09-13" };
    expect(whatIsDue({ settings: { on: true, digestHour: 9 }, state, now })).toBe("digest");
    // Тот же момент, но сводка назначена на полдень — значит ещё рано.
    expect(whatIsDue({ settings: { on: true, digestHour: 12 }, state, now })).toBe(null);
  });

  // Час сводки можно выставить внутрь тишины (по умолчанию 22:00–08:00). Тогда
  // сводка не пропадает и не будит ночью — она уходит, как только говорить
  // снова можно. Проверяем оба конца, чтобы это не «починили» в обратную сторону.
  it("сводка, назначенная на ночь, уходит с концом тихих часов", () => {
    const night = at(7, 0);
    const state = { lastRun: night - 1000, lastDigest: "2026-09-13" };
    expect(whatIsDue({ settings: { on: true, digestHour: 7 }, state, now: night })).toBe(null);
    const morning = at(8, 0);
    expect(whatIsDue({ settings: { on: true, digestHour: 7 },
      state: { ...state, lastRun: morning - 1000 }, now: morning })).toBe("digest");
  });

  it("нажатая кнопка поднимает прогон, не дожидаясь часа", () => {
    const now = at(12, 0);
    const settings = { ...ON, sendNowQueue: { digest_week: now - 5000 } };
    expect(whatIsDue({ settings, state: FRESH(now), now })).toBe("sendNow");
  });

  // Подстраховка для событий, чья мгновенная отправка не дошла.
  it("десять минут без прогона — поднимаем полный, добрать пропущенное", () => {
    const now = at(12, 0);
    expect(whatIsDue({ settings: ON, state: { ...FRESH(now), lastRun: now - 11 * 60_000 }, now }))
      .toBe("catchUp");
  });

  it("прогон был только что — тик ничего не стоит", () => {
    const now = at(12, 0);
    expect(whatIsDue({ settings: ON, state: FRESH(now), now })).toBe(null);
  });

  it("рассылка выключена — тик всегда пустой", () => {
    const now = at(10, 0);
    expect(whatIsDue({ settings: { on: false, digestHour: 10 }, state: {}, now })).toBe(null);
  });

  // Ночью сводку не поднимаем: молчание тихих часов важнее пунктуальности.
  it("в тихие часы сводка ждёт утра", () => {
    const now = at(2, 0);
    const settings = { ...ON, digestHour: 1, quietFrom: 23, quietTo: 7 };
    const state = { lastRun: now - 1000, lastDigest: "2026-09-13" };
    expect(whatIsDue({ settings, state, now })).toBe(null);
  });
});

describe("сам тик", () => {
  // Дать микрозадачам провернуться: тик не наслаивает вопросы, и пока
  // предыдущий не завершился, следующий намеренно пропускается.
  const settle = () => new Promise(r => setTimeout(r, 0));
  const clock = () => {
    let fn = null;
    return { setTimer: (f) => { fn = f; return 1; }, clearTimer: () => { fn = null; },
      beat: () => fn && fn(), stopped: () => fn === null };
  };

  // Открыл CRM в 10:00:05 — сводка должна уйти в 10:00:06, а не через интервал.
  it("спрашивает СРАЗУ при открытии, не дожидаясь первого тика", () => {
    const c = clock();
    const ask = vi.fn().mockResolvedValue({ ok: true, idle: true });
    startNotifyTicker({ ask, ...c, intervalMs: 1000 });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("и потом по таймеру", async () => {
    const c = clock();
    const ask = vi.fn().mockResolvedValue({ ok: true, idle: true });
    startNotifyTicker({ ask, ...c, intervalMs: 1000 });
    await settle();                          // первый вопрос должен завершиться
    await c.beat();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  // Телефон разблокировали — спрашиваем, не дожидаясь двух минут.
  it("спрашивает при возврате на вкладку", async () => {
    const c = clock();
    const ask = vi.fn().mockResolvedValue({ ok: true, idle: true });
    let wake = null;
    startNotifyTicker({ ask, ...c, onVisible: (beat) => { wake = beat; return () => { wake = null; }; } });
    expect(ask).toHaveBeenCalledTimes(1);
    await settle();
    await wake();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("остановка отписывает и от возврата на вкладку", () => {
    const c = clock();
    let off = false;
    const stop = startNotifyTicker({ ask: vi.fn(), ...c, onVisible: () => () => { off = true; } });
    stop();
    expect(off).toBe(true);
  });

  it("невидимую вкладку не спрашивает — ночью экран заблокирован", async () => {
    const c = clock();
    const ask = vi.fn();
    startNotifyTicker({ ask, isVisible: () => false, ...c });
    await c.beat();
    expect(ask).not.toHaveBeenCalled();     // ни сразу, ни по таймеру
  });

  it("вопросы не наслаиваются: прогон идёт — новый не задаём", async () => {
    const c = clock();
    let release;
    const ask = vi.fn(() => new Promise(r => { release = r; }));
    startNotifyTicker({ ask, ...c });
    c.beat();
    c.beat();
    expect(ask).toHaveBeenCalledTimes(1);
    release({ ok: true });
  });

  it("остановка снимает таймер", () => {
    const c = clock();
    const stop = startNotifyTicker({ ask: vi.fn(), ...c });
    stop();
    expect(c.stopped()).toBe(true);
  });

  it("упавший вопрос не выбрасывается наружу", async () => {
    const c = clock();
    const ask = vi.fn().mockRejectedValue(new Error("сеть"));
    startNotifyTicker({ ask, ...c });
    await expect(c.beat()).resolves.not.toThrow();
  });
});

describe("запрос «пора?»", () => {
  it("уходит видом due и с токеном", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, idle: true }) });
    const r = await askIfDue({ getToken: async () => "tok", fetchImpl });
    expect(r.idle).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/notify-run");
    expect(JSON.parse(init.body)).toEqual({ kind: "due" });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("без токена никуда не ходим", async () => {
    const fetchImpl = vi.fn();
    expect((await askIfDue({ getToken: async () => null, fetchImpl })).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
