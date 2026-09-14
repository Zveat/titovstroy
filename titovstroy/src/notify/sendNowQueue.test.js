// «ОТПРАВИТЬ СЕЙЧАС» ПО НЕСКОЛЬКИМ СВОДКАМ СРАЗУ.
//
// Владелец нажал все четыре сводки и получил одну. Причин было две, и обе здесь:
// заявка лежала одним полем и затиралась каждым следующим нажатием, а сводка,
// которая сегодня уже уходила, отсекалась защитой «уже отправляли» даже когда её
// просили кнопкой.
import { describe, expect, it, vi } from "vitest";
import { SEND_NOW_TTL_MS, markSendNowDone, pendingSendNow } from "./notifyModel.js";
import { requestSendNow } from "./sendNowTrigger.js";

const NOW = 1_789_400_000_000;
const FOUR = ["digest_week", "digest_month", "digest_sales_week", "digest_sales_month"];

describe("разбор заявок", () => {
  it("четыре нажатые сводки — четыре заявки, а не последняя", () => {
    const settings = { sendNowQueue: Object.fromEntries(FOUR.map((k, i) => [k, NOW - 1000 * i])) };
    const { keys } = pendingSendNow({ settings, state: {}, now: NOW });
    expect(keys.sort()).toEqual([...FOUR].sort());
  });

  it("выполненная заявка не повторяется, а соседняя — уходит", () => {
    const settings = { sendNowQueue: { digest_week: 100, digest_month: 200 } };
    const state = { sentNow: { digest_week: 100 } };
    const { keys } = pendingSendNow({ settings, state, now: 300 });
    expect(keys).toEqual(["digest_month"]);
  });

  // Раньше отметка была одна на всех: первая же выполненная заявка гасила
  // остальные, нажатые в ту же минуту.
  it("отметки о выполнении раздельные по ключам", () => {
    const done = markSendNowDone({}, ["digest_week"], { digest_week: NOW }, { now: NOW });
    const settings = { sendNowQueue: { digest_week: NOW, digest_month: NOW } };
    const { keys } = pendingSendNow({ settings, state: { sentNow: done }, now: NOW + 1000 });
    expect(keys).toEqual(["digest_month"]);
  });

  it("протухшая заявка не стреляет неожиданно через час", () => {
    const settings = { sendNowQueue: { digest_week: NOW - SEND_NOW_TTL_MS - 1 } };
    const { keys, skipped } = pendingSendNow({ settings, state: {}, now: NOW });
    expect(keys).toEqual([]);
    expect(skipped).toEqual([["digest_week", "устарела"]]);
  });

  it("руками такое не шлём — событие журнала в заявку не превращается", () => {
    const settings = { sendNowQueue: { contract_signed: NOW } };
    const { keys, skipped } = pendingSendNow({ settings, state: {}, now: NOW });
    expect(keys).toEqual([]);
    expect(skipped[0][1]).toBe("такое руками не шлём");
  });

  // Между выкаткой и перезагрузкой вкладки заявка может быть записана старым
  // приложением — одиночным полем. Терять её нельзя.
  it("заявка от старой версии приложения тоже выполняется", () => {
    const settings = { sendNow: { at: NOW, key: "digest_week" } };
    const { keys } = pendingSendNow({ settings, state: { lastSendNow: NOW - 5000 }, now: NOW });
    expect(keys).toEqual(["digest_week"]);
  });

  it("но уже выполненная старая заявка второй раз не уходит", () => {
    const settings = { sendNow: { at: NOW, key: "digest_week" } };
    const { keys } = pendingSendNow({ settings, state: { lastSendNow: NOW }, now: NOW });
    expect(keys).toEqual([]);
  });

  it("одиночное поле и список не дают дубля одного ключа", () => {
    const settings = { sendNow: { at: NOW, key: "digest_week" }, sendNowQueue: { digest_week: NOW } };
    const { keys } = pendingSendNow({ settings, state: {}, now: NOW });
    expect(keys).toEqual(["digest_week"]);
  });

  it("старые отметки о выполнении не копятся вечно", () => {
    const done = { древняя: NOW - SEND_NOW_TTL_MS - 1, свежая: NOW - 1000 };
    expect(Object.keys(markSendNowDone(done, [], {}, { now: NOW }))).toEqual(["свежая"]);
  });

  it("пустые настройки — пустой список, без падений", () => {
    expect(pendingSendNow().keys).toEqual([]);
    expect(pendingSendNow({ settings: {}, state: {}, now: NOW }).keys).toEqual([]);
  });
});

describe("нажатие кнопки складывает заявку в список", () => {
  const ok = { ok: true, json: async () => ({ ok: true, dispatched: true }) };

  it("второе нажатие не стирает первое", async () => {
    const saved = [];
    const saveSettings = async (p) => { saved.push(p); return { ok: true }; };
    const fetchImpl = async () => ok;

    await requestSendNow({ key: "digest_week", queue: {}, saveSettings,
      getToken: async () => "t", fetchImpl, now: () => NOW });
    await requestSendNow({ key: "digest_month", queue: saved[0].sendNowQueue, saveSettings,
      getToken: async () => "t", fetchImpl, now: () => NOW + 1000 });

    expect(Object.keys(saved[1].sendNowQueue).sort()).toEqual(["digest_month", "digest_week"]);
  });

  it("все четыре нажатия доживают до базы", async () => {
    let queue = {};
    const saveSettings = async (p) => { queue = p.sendNowQueue; return { ok: true }; };
    for (const [i, key] of FOUR.entries()) {
      await requestSendNow({ key, queue, saveSettings, getToken: async () => "t",
        fetchImpl: async () => ok, now: () => NOW + i * 500 });
    }
    expect(Object.keys(queue).sort()).toEqual([...FOUR].sort());
    // И прогон их все увидит.
    expect(pendingSendNow({ settings: { sendNowQueue: queue }, state: {}, now: NOW + 2000 }).keys.sort())
      .toEqual([...FOUR].sort());
  });

  it("протухшие ключи в список не тащим", async () => {
    let saved = null;
    const saveSettings = async (p) => { saved = p; return { ok: true }; };
    await requestSendNow({ key: "digest_week", queue: { старьё: NOW - SEND_NOW_TTL_MS - 1 },
      saveSettings, getToken: async () => "t", fetchImpl: async () => ok, now: () => NOW });
    expect(Object.keys(saved.sendNowQueue)).toEqual(["digest_week"]);
  });

  it("одиночное поле пишется по-прежнему — по нему сервер сверяет заявку", async () => {
    let saved = null;
    const saveSettings = async (p) => { saved = p; return { ok: true }; };
    const fetchImpl = vi.fn().mockResolvedValue(ok);
    await requestSendNow({ key: "stages", queue: {}, saveSettings,
      getToken: async () => "t", fetchImpl, now: () => NOW });
    expect(saved.sendNow).toEqual({ at: NOW, key: "stages" });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ kind: "sendNow", at: NOW, key: "stages" });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/notify-run");
  });
});
