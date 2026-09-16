// Быстрые уведомления: что будит рассылку, что нет, и как сворачивается пачка.
import { describe, expect, it, vi } from "vitest";
import { createInstantNotifier, dispatchEventRun, isNotifiableEntry } from "./instantNotify.js";

const entry = (over = {}) => ({
  ts: 1_700_000_000_000, entity: "object", entityId: "o1", objectId: "o1",
  label: "Вера", field: "статус", action: "изменил", old: "Новый", new: "Потерян",
  by: "Сергей Штанько", ...over,
});

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

describe("отправляем сразу, без паузы", () => {
  // Владелец: «нахуй мне задержка такая». Пауза в 20 секунд была не только
  // медленной — закрытая в эти секунды вкладка не отправляла НИЧЕГО, и событие
  // ждало часового запасного прогона. Ровно так удаление смет опоздало на 6 часов.
  it("событие уходит в тот же момент, без всяких таймеров", () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const n = createInstantNotifier({ dispatch });
    n.note(entry());
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(1_700_000_000_000);
    expect(n.pending()).toBe(false);
  });

  // Пачку сворачивает сам прогон: он читает журнал целиком. От браузера это
  // никогда и не зависело, а замок на стороне сервера не даёт послать дважды.
  it("пачка из четырёх правок: толкаем на каждую, дублей не боимся", () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const n = createInstantNotifier({ dispatch });
    for (let i = 0; i < 4; i++) n.note(entry({ ts: 1_700_000_000_000 + i * 1000, entityId: "o" + i }));
    expect(dispatch).toHaveBeenCalledTimes(4);
  });

  it("одна и та же запись дважды не уезжает", () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const n = createInstantNotifier({ dispatch });
    expect(n.note(entry())).toBe(true);
    expect(n.note(entry())).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("не-событие не толкает", () => {
    const dispatch = vi.fn();
    const n = createInstantNotifier({ dispatch });
    expect(n.note(entry({ field: "телефон" }))).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("сбой отправки не выбрасывается наружу — журнал важнее уведомления", () => {
    const dispatch = vi.fn(() => { throw new Error("сеть"); });
    const n = createInstantNotifier({ dispatch });
    expect(() => n.note(entry())).not.toThrow();
  });
});

describe("запрос на запуск", () => {
  const token = async () => "tok";

  it("уходит с видом заявки «событие», отметкой времени и keepalive", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, dispatched: true }) });
    const r = await dispatchEventRun(777, { getToken: token, fetchImpl });
    expect(r.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/notify-run");
    expect(JSON.parse(init.body)).toEqual({ kind: "event", at: 777 });
    expect(init.headers.Authorization).toBe("Bearer tok");
    // Без keepalive браузер обрывает запрос вместе с закрываемой страницей.
    expect(init.keepalive).toBe(true);
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
