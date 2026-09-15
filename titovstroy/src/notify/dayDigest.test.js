// ЕЖЕДНЕВНАЯ СВОДКА И РАЗЛИЧИЕ МЕЖДУ НЕДЕЛЬНЫМИ.
//
// Владелец: «эти уведомления одинаковые, прибыль и продажи присылают одно и то
// же». Так и было: блок «Деньги» рисовался, только если в периоде было движение
// денег, а в его базе последняя операция датирована 1 августа — блок исчезал, и
// руководительская сводка становилась продажной минус разрез по менеджерам.
import { describe, expect, it } from "vitest";
import {
  DIGESTS, buildDayDigest, buildDigestMessage, isDigestDue, yesterdayBounds,
} from "./notifyModel.js";

const NOW = Date.UTC(2026, 8, 15, 5, 0);          // 15 сентября, 10:00 по Астане
const SALES = {
  newObjects: 3, estimatedCount: 2, estimatedSum: 4_200_000,
  signedCount: 1, signedSum: 1_290_796, lostCount: 1, lostSum: 2_138_336,
  convToEstimate: 66, convToSigned: 50, convTotal: 33,
  byManager: { "Сергей Штанько": { objects: 3, signed: 1, signedSum: 1_290_796 } },
  lostByReason: { expensive: { count: 1, sum: 2_138_336 } },
};
const NO_MONEY = { income: 0, expense: 0 };
const MONEY = { income: 5_000_000, expense: 3_000_000, gross: 2_000_000,
  grossMarginPct: 40, net: 1_200_000, marginPct: 24, receivablesOverdue: 300_000 };

describe("сводки перестали быть одинаковыми", () => {
  // Это и есть жалоба владельца, дословно проверенная.
  it("без движения денег руководительская и продажная РАЗНЫЕ", () => {
    const lead = buildDigestMessage({ sales: SALES, finance: NO_MONEY }, { key: "digest_week", now: NOW });
    const team = buildDigestMessage({ sales: SALES, finance: NO_MONEY }, { key: "digest_sales_week", now: NOW });
    expect(lead.text).not.toBe(team.text);
  });

  it("у руководительской блок «Деньги» есть ВСЕГДА, даже когда движения не было", () => {
    const lead = buildDigestMessage({ sales: SALES, finance: NO_MONEY }, { key: "digest_week", now: NOW });
    expect(lead.text).toContain("Деньги");
    expect(lead.text).toContain("Движения денег за период не было");
  });

  it("с движением показываем настоящие числа", () => {
    const lead = buildDigestMessage({ sales: SALES, finance: MONEY }, { key: "digest_week", now: NOW });
    expect(lead.text).toContain("Валовая прибыль");
    expect(lead.text).toContain("Чистая прибыль");
    expect(lead.text).toContain("Просрочено к оплате");
  });

  // Главное правило проекта: клиенту и общему чату — никакой прибыли.
  it("в продажной НЕТ ни прибыли, ни выручки, ни маржи — она уходит в общий чат", () => {
    const team = buildDigestMessage({ sales: SALES, finance: MONEY }, { key: "digest_sales_week", now: NOW });
    for (const forbidden of ["Деньги", "Выручка", "Валовая", "Чистая прибыль", "Просрочено к оплате"]) {
      expect(team.text).not.toContain(forbidden);
    }
  });

  it("разрез по менеджерам — только в продажной", () => {
    const lead = buildDigestMessage({ sales: SALES, finance: MONEY }, { key: "digest_week", now: NOW });
    const team = buildDigestMessage({ sales: SALES, finance: MONEY }, { key: "digest_sales_week", now: NOW });
    expect(team.text).toContain("По менеджерам");
    expect(lead.text).not.toContain("По менеджерам");
  });
});

describe("ежедневная сводка", () => {
  const CARD = (over) => ({ objectId: "o1", startDate: "2026-09-15", ...over });
  const OBJ = (over) => ({ id: "o1", clientName: "Николай", status: "В работе", ...over });
  const CURRENT = { production: { overdueStageList: [], staleObjects: [] } };

  it("уходит каждый день, а не по понедельникам", () => {
    const day = DIGESTS.find(d => d.key === "digest_day");
    expect(day.period).toBe("day");
    for (const d of [0, 1, 2, 3, 4, 5, 6]) {
      expect(isDigestDue(day, { now: NOW + d * 86400000 })).toBe(true);
    }
  });

  it("считается по ВЧЕРАШНИМ суткам по местному времени", () => {
    const { from, to } = yesterdayBounds(NOW);
    // 14 сентября 00:00 Астаны = 13 сентября 19:00 UTC.
    expect(new Date(from).toISOString()).toBe("2026-09-13T19:00:00.000Z");
    expect(to - from).toBe(86400000 - 1);
  });

  it("показывает итог вчерашнего дня — то, чего нет в отдельных событиях", () => {
    const m = buildDayDigest({ yesterday: { sales: SALES }, current: CURRENT,
      objects: [], productions: [] }, { now: NOW });
    expect(m.text).toContain("Вчера");
    expect(m.text).toContain("Зашло новых");
    expect(m.text).toContain("Подписано договоров");
    expect(m.text).toContain("Потеряли");
  });

  it("показывает, что стартует и что сдаём СЕГОДНЯ", () => {
    const m = buildDayDigest({
      yesterday: { sales: {} }, current: CURRENT,
      objects: [OBJ(), OBJ({ id: "o2", clientName: "Вера" })],
      productions: [CARD(), CARD({ objectId: "o2", startDate: "", planEndDate: "2026-09-15" })],
    }, { now: NOW });
    expect(m.text).toContain("Старт работ: <b>Николай</b>");
    expect(m.text).toContain("Сдача по плану: <b>Вера</b>");
  });

  // ОБА СПИСКА БЕРУТСЯ ИЗ production. staleObjects выглядит как «бэклог», и
  // сначала я читал его из analytics.backlog — счётчик был бы всегда нулевым, а
  // тест этого не ловил, потому что был написан из того же неверного
  // предположения. Поймали настоящие данные. Поэтому здесь backlog НЕ передаём
  // вовсе: если кто-то снова уведёт чтение туда, тест упадёт.
  it("считает горящее, но не пересказывает его списком — на это есть напоминания", () => {
    const m = buildDayDigest({
      yesterday: { sales: SALES },
      current: { production: {
        overdueStageList: [{ objectId: "o1", days: 5 }, { objectId: "o2", days: 2 }],
        staleObjects: [{ objectId: "o3", days: 12 }],
      } },
      objects: [], productions: [],
    }, { now: NOW });
    expect(m.text).toContain("Просрочено этапов: <b>2</b>");
    expect(m.text).toContain("дольше всех — 5 дней");
    expect(m.text).toContain("Объектов без движения: <b>1</b>");
  });

  // Сводка «сегодня ничего», приходящая каждое утро, за неделю приучает её не читать.
  it("пустой день — сообщения нет вообще", () => {
    expect(buildDayDigest({ yesterday: { sales: {} }, current: CURRENT,
      objects: [], productions: [] }, { now: NOW })).toBe(null);
  });

  it("вчера пусто, но сегодня сдача — сообщение есть и говорит об этом прямо", () => {
    const m = buildDayDigest({
      yesterday: { sales: {} }, current: CURRENT,
      objects: [OBJ()], productions: [CARD()],
    }, { now: NOW });
    expect(m.text).toContain("По воронке движения не было");
    expect(m.text).toContain("Старт работ");
  });

  it("сданный объект в «сегодня» не попадает", () => {
    const m = buildDayDigest({
      yesterday: { sales: {} }, current: CURRENT,
      objects: [OBJ()], productions: [CARD({ factEndDate: "2026-09-10" })],
    }, { now: NOW });
    expect(m).toBe(null);
  });

  it("заглушённый объект не попадает ни в «сегодня», ни в счётчики", () => {
    const settings = { objectMode: "except", objectList: ["o1"] };
    const m = buildDayDigest({
      yesterday: { sales: {} },
      current: { production: { overdueStageList: [{ objectId: "o1", days: 5 }], staleObjects: [] } },
      objects: [OBJ()], productions: [CARD()],
    }, { now: NOW, settings });
    expect(m).toBe(null);
  });

  // Она уходит в общий чат — значит денег в ней быть не может.
  it("в ежедневной нет ни прибыли, ни выручки", () => {
    const m = buildDayDigest({ yesterday: { sales: SALES, finance: MONEY }, current: CURRENT,
      objects: [], productions: [] }, { now: NOW });
    for (const forbidden of ["Выручка", "прибыль", "маржа", "Деньги"]) {
      expect(m.text).not.toContain(forbidden);
    }
    expect(DIGESTS.find(d => d.key === "digest_day").money).toBe(false);
  });

  it("одна сводка в день: повторный сбор даёт тот же id", () => {
    const a = buildDayDigest({ yesterday: { sales: SALES }, current: CURRENT, objects: [], productions: [] }, { now: NOW });
    const b = buildDayDigest({ yesterday: { sales: SALES }, current: CURRENT, objects: [], productions: [] }, { now: NOW + 3600_000 });
    expect(a.id).toBe(b.id);
  });
});
