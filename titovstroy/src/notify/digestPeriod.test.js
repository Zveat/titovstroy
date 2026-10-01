import { describe, expect, it } from "vitest";
import {
  DIGESTS, buildDigestMessage, closedMonthBounds, closedWeekBounds, digestWindow, monthLabel, rangeLabel,
} from "./notifyModel.js";

// РАДИ ЧЕГО. 1 октября владельцу пришли «Итоги месяца» со сплошными нулями: сводка
// приходит 1-го числа и считала ТЕКУЩИЙ месяц, то есть первые десять часов октября.
// Здесь закреплено, что период — закрытый: 1 октября это сентябрь целиком.

const astana = (iso) => Date.parse(iso);              // в тестах время задаём явно, в UTC
const local = (ms) => new Date(ms + 5 * 3600000).toISOString().slice(0, 19);

describe("период сводки — закрытый, а не текущий", () => {
  it("1 октября — это весь сентябрь, от полуночи до полуночи по Караганде", () => {
    const now = astana("2026-10-01T05:27:00Z");       // 10:27 местного, как в том сообщении
    const b = closedMonthBounds(now);
    expect(local(b.from)).toBe("2026-09-01T00:00:00");
    expect(local(b.to + 1)).toBe("2026-10-01T00:00:00");
    expect(b.to).toBeLessThan(now);                    // период уже закрыт
  });

  it("1 января — это декабрь прошлого года, а не нулевой месяц", () => {
    const b = closedMonthBounds(astana("2027-01-01T04:00:00Z"));
    expect(local(b.from)).toBe("2026-12-01T00:00:00");
    expect(local(b.to + 1)).toBe("2027-01-01T00:00:00");
    expect(monthLabel(b.from)).toBe("декабрь");
  });

  it("сводка 1-го числа не смотрит в будущее ни на секунду", () => {
    for (const day of ["2026-03-01", "2026-05-01", "2026-11-01"]) {
      const now = astana(`${day}T05:00:00Z`);
      expect(closedMonthBounds(now).to).toBeLessThan(now);
    }
  });

  it("понедельник — это прошедшая неделя, с понедельника по воскресенье", () => {
    const monday = astana("2026-09-28T04:00:00Z");     // 09:00 понедельника
    const b = closedWeekBounds(monday);
    expect(local(b.from)).toBe("2026-09-21T00:00:00"); // предыдущий понедельник
    expect(local(b.to + 1)).toBe("2026-09-28T00:00:00");
    expect(rangeLabel(b.from, b.to)).toBe("21–27 сентября");
  });

  it("неделя на стыке месяцев называется обоими месяцами", () => {
    const monday = astana("2026-10-05T04:00:00Z");
    const b = closedWeekBounds(monday);
    expect(rangeLabel(b.from, b.to)).toBe("28 сентября — 4 октября");
  });

  it("каждая месячная и недельная сводка получает свой закрытый период", () => {
    const now = astana("2026-10-01T05:27:00Z");
    for (const d of DIGESTS.filter(x => x.period === "month")) {
      expect(digestWindow(d, now)).toMatchObject({ label: "сентябрь" });
    }
    for (const d of DIGESTS.filter(x => x.period === "week")) {
      expect(digestWindow(d, now).label).toMatch(/сентябр/);
    }
    // Ежедневная считает себя сама — она про вчера и сегодня, см. buildDayDigest.
    expect(digestWindow(DIGESTS.find(x => x.period === "day"), now)).toBe(null);
  });

  it("в заголовке стоит период, а не день отправки", () => {
    const now = astana("2026-10-01T05:27:00Z");
    const msg = buildDigestMessage({ sales: {}, finance: {} },
      { key: "digest_month", now, periodLabel: "сентябрь" });
    expect(msg.text.split("\n")[0]).toContain("Итоги месяца</b> · сентябрь");
    // Без подписи периода ведём себя как раньше — не ломаем ежедневную.
    const plain = buildDigestMessage({ sales: {}, finance: {} }, { key: "digest_month", now });
    expect(plain.text.split("\n")[0]).toContain("1 октября");
  });
});
