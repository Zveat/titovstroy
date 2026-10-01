import { describe, expect, it } from "vitest";
import {
  NOTIFY_CATALOG, buildDayDigest, buildDigestMessage, buildEventMessages,
  isSubscribed, renderEvent,
} from "./notifyModel.js";

const NOW = Date.parse("2026-10-01T05:27:00Z");
const plain = (t) => t.replace(/<[^>]+>/g, "");
const fullSubs = (...on) => Object.fromEntries(NOTIFY_CATALOG.map(i => [i.key, on.includes(i.key)]));

// НОВОЕ УВЕДОМЛЕНИЕ НЕ ДОЛЖНО МОЛЧАТЬ ТОЛЬКО ПОТОМУ, ЧТО ОНО НОВОЕ. Раньше ключа
// не было в настройке → не приходило никому, пока все не сходят в Админку. Так уже
// случилось со сводкой дня. Отсутствие ключа и явное «выключено» — разные вещи.
describe("подписка на то, чего раньше не было", () => {
  it("ключа в настройке нет — отвечает каталог", () => {
    const человек = { tg: { subs: { contract_signed: true } } };          // старый набор
    expect(isSubscribed(человек, "kp_sent")).toBe(true);                  // в каталоге def: true
  });

  it("явное «выключено» остаётся выключенным", () => {
    expect(isSubscribed({ tg: { subs: fullSubs("contract_signed") } }, "kp_sent")).toBe(false);
  });

  it("сняли всё — тишина, а не каталог", () => {
    // Админка пишет и снятые галочки, поэтому пустой набор значит именно «ничего».
    expect(isSubscribed({ tg: { subs: {} } }, "kp_sent")).toBe(false);
  });
});

describe("КП отправлено клиенту", () => {
  const entry = (over = {}) => ({
    ts: NOW, entity: "estimate", action: "отправил", field: "КП клиенту",
    label: "Николай", objectId: "o1", old: "—", new: "1 290 500 ₸", by: "Сергей Штанько", ...over,
  });

  it("становится сообщением с клиентом и суммой", () => {
    const [m] = buildEventMessages([entry()], { sinceTs: 0, settings: {} });
    expect(m.key).toBe("kp_sent");
    expect(plain(renderEvent(m))).toContain("КП отправлено — Николай");
    expect(plain(renderEvent(m))).toContain("1 290 500 ₸");
  });

  it("повторная отправка названа повторной — это тоже новость", () => {
    const [m] = buildEventMessages([entry({ old: "уже отправляли" })], { sinceTs: 0, settings: {} });
    expect(plain(renderEvent(m))).toContain("отправлено повторно");
  });

  it("есть в каталоге Админки и объясняет себя", () => {
    const item = NOTIFY_CATALOG.find(i => i.key === "kp_sent");
    expect(item.label).toBe("КП отправлено клиенту");
    expect(item.when.length).toBeGreaterThan(10);
    expect(item.what.length).toBeGreaterThan(10);
  });
});

describe("деньги: кому звонить", () => {
  const money = (finance) => plain(buildDigestMessage({ sales: {}, finance },
    { key: "digest_month", now: NOW, periodLabel: "сентябрь" }).text);

  it("называет должников и общую сумму", () => {
    const text = money({ receivableList: [
      { id: "a", name: "Сергей", value: 4435031 },
      { id: "b", name: "Нуржан", value: 4292172 },
    ] });
    expect(text).toContain("Ждём оплату: 2 на 8 727 203 ₸");
    expect(text).toContain("Сергей (4 435 031 ₸), Нуржан (4 292 172 ₸)");
  });

  it("движения денег не было — долги всё равно показываем, особенно тогда", () => {
    const text = money({ income: 0, expense: 0, receivableList: [{ id: "a", name: "Сергей", value: 100 }] });
    expect(text).toContain("Движения денег за период не было");
    expect(text).toContain("Ждём оплату: 1");
  });

  it("долгов нет — лишней строки нет", () => {
    expect(money({ income: 1, receivableList: [] })).not.toContain("Ждём оплату");
  });
});

// Утром на планёрке из трёх равнозначных пунктов приходится выбирать самому.
// Выбор всегда один и тот же, поэтому он и вынесен строкой.
describe("главное на сегодня", () => {
  const digest = (production, objects = [], productions = []) => plain(buildDayDigest(
    { yesterday: { sales: {} }, current: { production }, objects, productions },
    { now: NOW },
  ).text);

  it("горящий этап важнее всего — он уже стоит денег", () => {
    expect(digest({
      overdueStageList: [{ objectId: "o1", objectName: "Казарин", days: 6 }],
      staleObjects: [{ objectId: "o2", name: "Вера", days: 90 }],
    })).toContain("Главное: горит этап у Казарин — 6 дней просрочки");
  });

  it("не горит — говорим про сегодняшнюю сдачу", () => {
    const objects = [{ id: "o1", clientName: "Николай", status: "work" }];
    const productions = [{ objectId: "o1", prodStatus: "work", planEndDate: "2026-10-01" }];
    expect(digest({ overdueStageList: [], staleObjects: [] }, objects, productions))
      .toContain("Главное: сдаём Николай");
  });

  it("ни горящего, ни сегодняшнего — самый молчащий объект", () => {
    expect(digest({ overdueStageList: [], staleObjects: [{ objectId: "o2", name: "Вера", days: 90 }] }))
      .toContain("Главное: дольше всех молчит Вера — 90 дней");
  });
});
