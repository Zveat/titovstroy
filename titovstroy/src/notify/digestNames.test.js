import { describe, expect, it } from "vitest";
import {
  buildDigestMessage, buildEventMessages, makeEventContext, renderEvent, spanDays,
} from "./notifyModel.js";

// «Подписано договоров: 2» — половина новости: вторая половина в том, КОГО подписали.
// То же с потерями: разбивка по причинам отвечает «почему», а звонить придётся людям.

const NOW = Date.parse("2026-10-01T05:27:00Z");
const plain = (t) => t.replace(/<[^>]+>/g, "");
const digest = (sales) => plain(buildDigestMessage({ sales, finance: {} },
  { key: "digest_month", now: NOW, periodLabel: "сентябрь" }).text);

describe("имена в сводке за период", () => {
  it("называет, кого подписали и на сколько", () => {
    const text = digest({
      signedCount: 2, signedSum: 2581296,
      signedList: [
        { id: "a", name: "Запорожец Александра", sum: 1290796 },
        { id: "b", name: "Казарин Артем", sum: 1290500 },
      ],
    });
    expect(text).toContain("Подписано договоров: 2 на 2 581 296 ₸");
    expect(text).toContain("Запорожец Александра (1 290 796 ₸), Казарин Артем (1 290 500 ₸)");
  });

  it("называет, кого потеряли и почему", () => {
    const text = digest({
      lostCount: 2, lostSum: 7923256,
      lostByReason: { price: { count: 1, sum: 6294438 }, other: { count: 1, sum: 1628818 } },
      lostList: [
        { id: "a", name: "Женис", sum: 6294438, reason: "Дорого" },
        { id: "b", name: "Нурбай", sum: 1628818, reason: "Другое" },
      ],
    });
    expect(text).toContain("Женис (6 294 438 ₸, Дорого), Нурбай (1 628 818 ₸, Другое)");
  });

  it("длинный список обрывается на трёх и считает остальных", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, name: `Клиент ${i + 1}`, sum: 1000 - i }));
    expect(digest({ signedCount: 6, signedSum: 6000, signedList: many }))
      .toContain("Клиент 1 (1 000 ₸), Клиент 2 (999 ₸), Клиент 3 (998 ₸) и ещё 3");
  });

  it("сумма неизвестна — пишем только имя, а не «0 ₸»", () => {
    // Ноль у объекта без сметы и договора означает «данных нет», а не «бесплатно».
    expect(digest({ signedCount: 1, signedList: [{ id: "a", name: "Без сметы", sum: 0 }] }))
      .toContain("Без сметы");
    expect(digest({ signedCount: 1, signedList: [{ id: "a", name: "Без сметы", sum: 0 }] }))
      .not.toContain("0 ₸");
  });

  it("списков нет — сводка выглядит как прежде", () => {
    const text = digest({ signedCount: 0, lostCount: 0 });
    expect(text).toContain("Подписано договоров: 0");
    expect(text.split("\n").every(l => !l.startsWith("   "))).toBe(true);
  });
});

// «Объект сдан» без цифр — просто галочка. Сдача это итог: за сколько сделали и
// сколько он стоил.
const doneEntry = {
  ts: NOW, entity: "object", action: "изменил", field: "факт сдачи",
  label: "Николай", objectId: "o1", old: "—", new: "28.01.2026", by: "P.Zveat",
};
const doneText = (prod, sums) => plain(renderEvent(buildEventMessages([doneEntry], {
  sinceTs: 0, settings: {},
  context: makeEventContext({ productions: [{ objectId: "o1", ...prod }], sumsByObject: sums }),
})[0]));

describe("сдача объекта с цифрами", () => {
  it("показывает сумму и сколько шла стройка", () => {
    const text = doneText({ startDate: "2025-10-01", factEndDate: "2026-01-28" }, { o1: 1290500 });
    expect(text).toContain("сумма: 1 290 500 ₸");
    expect(text).toContain("стройка шла 119 дней");
  });

  it("с планом разошлись — говорим насколько", () => {
    expect(doneText({ startDate: "2026-01-01", planEndDate: "2026-02-01", factEndDate: "2026-02-11" }, {}))
      .toContain("на 10 дней дольше плана");
    expect(doneText({ startDate: "2026-01-01", planEndDate: "2026-02-11", factEndDate: "2026-02-01" }, {}))
      .toContain("на 10 дней быстрее плана");
  });

  it("уложились день в день — лишней строки нет", () => {
    const text = doneText({ startDate: "2026-01-01", planEndDate: "2026-02-01", factEndDate: "2026-02-01" }, {});
    expect(text).toContain("стройка шла 31 день");
    expect(text).not.toContain("плана");
  });

  it("даты не заполнены — молчим, а не пишем «0 дней»", () => {
    expect(doneText({ factEndDate: "2026-02-01" }, {})).not.toContain("стройка шла");
    expect(spanDays("", "2026-02-01")).toBe(null);
    expect(spanDays("2026-02-01", "2026-01-01")).toBe(null);   // факт раньше старта — мусор
    expect(spanDays("2026-01-01", "2026-01-31")).toBe(30);
  });
});
