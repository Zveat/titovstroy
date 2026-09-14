// Быстрые уведомления: что будит рассылку, что нет, и как сворачивается пачка.
import { describe, expect, it, vi } from "vitest";
import { createInstantNotifier, dispatchEventRun, isNotifiableEntry } from "./instantNotify.js";

const entry = (over = {}) => ({
  ts: 1_700_000_000_000, entity: "object", entityId: "o1", objectId: "o1",
  label: "Вера", field: "статус", action: "изменил", old: "Новый", new: "Потерян",
  by: "Сергей Штанько", ...over,
});

// Ручные таймеры: ждать по-настоящему двадцать секунд в тесте нельзя.
function fakeClock() {
  let t = 0;
  const jobs = new Map();
  let id = 0;
  return {
    now: () => t,
    setTimer: (fn, ms) => { const key = ++id; jobs.set(key, { fn, at: t + ms }); return key; },
    clearTimer: (key) => { jobs.delete(key); },
    advance(ms) {
      t += ms;
      for (const [key, job] of [...jobs]) {
        if (job.at <= t) { jobs.delete(key); job.fn(); }
      }
    },
  };
}

describe("что считать поводом разбудить рассылку", () => {
  it("смена статуса объекта — повод", () => {
    expect(isNotifiableEntry(entry())).toBe(true);
  });

  it("подписание договора — повод", () => {
    expect(isNotifiableEntry(entry({ new: "Договор подписан" }))).toBe(true);
  });

  it("удаление сметы — повод", () => {
    expect(isNotifiableEntry(entry({ entity: "estimate", field: "", action: "удалил" }))).toBe(true);
  });

  // Журнал пишется на КАЖДУЮ правку: телефон клиента, адрес, права ролей. Если
  // будить рассылку на всё подряд, прогонов станут сотни, а сообщений — ноль.
  it("правка телефона — не повод", () => {
    expect(isNotifiableEntry(entry({ field: "телефон", old: "+7...", new: "+7..." }))).toBe(false);
  });

  it("очистка фактической даты сдачи — не повод (объект не сдан, дату стёрли)", () => {
    expect(isNotifiableEntry(entry({ field: "факт сдачи", old: "30.09.2026", new: "—" }))).toBe(false);
  });

  it("мусор вместо записи не роняет приложение", () => {
    expect(isNotifiableEntry(null)).toBe(false);
    expect(isNotifiableEntry("строка")).toBe(false);
    expect(isNotifiableEntry({})).toBe(false);
  });
});

describe("пауза на сворачивание пачки", () => {
  it("одно событие уходит после тишины, а не мгновенно", () => {
    const clock = fakeClock();
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const n = createInstantNotifier({ dispatch, ...clock, idleMs: 20_000, maxWaitMs: 90_000 });

    n.note(entry());
    clock.advance(19_000);
    expect(dispatch).not.toHaveBeenCalled();
    clock.advance(2_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  // Ровно тот случай из сентября: четыре объекта в «Потерян» за полторы минуты.
  it("пачка из четырёх правок — один запуск, а не четыре", () => {
    const clock = fakeClock();
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const n = createInstantNotifier({ dispatch, ...clock, idleMs: 20_000, maxWaitMs: 90_000 });

    for (let i = 0; i < 4; i++) {
      n.note(entry({ ts: 1_700_000_000_000 + i * 1000, entityId: "o" + i }));
      clock.advance(10_000);
    }
    expect(dispatch).not.toHaveBeenCalled();
    clock.advance(20_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("непрерывный поток правок не откладывает отправку дольше потолка", () => {
    const clock = fakeClock();
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const n = createInstantNotifier({ dispatch, ...clock, idleMs: 20_000, maxWaitMs: 90_000 });

    for (let i = 0; i < 30; i++) {
      n.note(entry({ ts: 1_700_000_000_000 + i * 1000, entityId: "o" + i }));
      clock.advance(5_000);
    }
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("предъявляем серверу отметку самой свежей записи пачки", () => {
    const clock = fakeClock();
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const n = createInstantNotifier({ dispatch, ...clock, idleMs: 20_000, maxWaitMs: 90_000 });

    n.note(entry({ ts: 100 }));
    n.note(entry({ ts: 900, entityId: "o2" }));
    n.note(entry({ ts: 500, entityId: "o3" }));
    clock.advance(20_000);
    expect(dispatch).toHaveBeenCalledWith(900);
  });

  it("не-событие таймер не заводит", () => {
    const clock = fakeClock();
    const dispatch = vi.fn();
    const n = createInstantNotifier({ dispatch, ...clock });
    expect(n.note(entry({ field: "телефон" }))).toBe(false);
    expect(n.pending()).toBe(false);
    clock.advance(200_000);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("сбой запуска не выбрасывается наружу — журнал важнее уведомления", () => {
    const clock = fakeClock();
    const dispatch = vi.fn(() => { throw new Error("сеть"); });
    const n = createInstantNotifier({ dispatch, ...clock });
    n.note(entry());
    expect(() => clock.advance(20_000)).not.toThrow();
  });
});

describe("запрос на запуск", () => {
  const token = async () => "tok";

  it("уходит с видом заявки «событие» и отметкой времени", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, dispatched: true }) });
    const r = await dispatchEventRun(777, { getToken: token, fetchImpl });
    expect(r.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/notify-run");
    expect(JSON.parse(init.body)).toEqual({ kind: "event", at: 777 });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("без токена никуда не ходим", async () => {
    const fetchImpl = vi.fn();
    const r = await dispatchEventRun(777, { getToken: async () => null, fetchImpl });
    expect(r).toEqual({ ok: false, code: "firebase_auth_unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("упавшая сеть — это ответ, а не исключение", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const r = await dispatchEventRun(777, { getToken: token, fetchImpl });
    expect(r).toEqual({ ok: false, code: "trigger_unavailable" });
  });
});
