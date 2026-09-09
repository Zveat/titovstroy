import { describe, expect, it } from "vitest";
import { childrenBytes, createTrafficMeter, formatBytes, utf8Len } from "./trafficMeter.js";

describe("сколько весит строка", () => {
  it("латиница — байт на символ", () => {
    expect(utf8Len("abc")).toBe(3);
  });

  it("кириллица — два байта на букву, иначе счёт занизит вдвое", () => {
    // Ради этого и написана своя функция: length у строки считает символы, а платим мы за байты.
    expect(utf8Len("да")).toBe(4);
    expect("да".length).toBe(2);
  });

  it("эмодзи — четыре байта, а не восемь", () => {
    // В UTF-16 эмодзи занимает ДВЕ единицы, и наивный обход посчитал бы его дважды.
    expect(utf8Len("🔥")).toBe(4);
  });

  it("пустое и мусор не роняют счёт", () => {
    for (const v of ["", null, undefined]) expect(utf8Len(v)).toBe(0);
    expect(utf8Len(42)).toBe(2);
  });
});

describe("узел с детьми", () => {
  it("складывает длины детей", () => {
    expect(childrenBytes({ a: "12345", b: "678" })).toBe(8);
  });

  it("ребёнок-объект тоже считается", () => {
    expect(childrenBytes({ a: { x: 1 } })).toBe(utf8Len('{"x":1}'));
  });

  it("не узел — ноль, а не падение", () => {
    for (const v of [null, undefined, "строка", 42]) expect(childrenBytes(v)).toBe(0);
  });
});

describe("счётчик", () => {
  const meter = (t = { v: 0 }) => createTrafficMeter(() => t.v);

  it("складывает по ключам и отдаёт самые тяжёлые первыми", () => {
    const m = meter();
    m.note("titovstroy-objects", 100);
    m.note("titovstroy-masters", 5000);
    m.note("titovstroy-objects", 400);
    const s = m.stats();
    expect(s.bytes).toBe(5500);
    expect(s.reads).toBe(3);
    expect(s.top[0]).toEqual({ key: "titovstroy-masters", bytes: 5000 });
    expect(s.top[1]).toEqual({ key: "titovstroy-objects", bytes: 500 });
  });

  it("нулевые и отрицательные чтения не засчитываются", () => {
    const m = meter();
    m.note("k", 0); m.note("k", -5); m.note("k", "мусор");
    expect(m.stats()).toMatchObject({ bytes: 0, reads: 0 });
  });

  it("считает обрывы связи отдельно", () => {
    // При переподключении база заново шлёт всё, на что подписана вкладка, — это тоже трафик,
    // просто незаметный. Поэтому обрывы видно отдельным числом.
    const m = meter();
    m.noteReconnect(); m.noteReconnect();
    expect(m.stats().reconnects).toBe(2);
  });

  it("показывает, сколько вкладка живёт", () => {
    const t = { v: 0 };
    const m = meter(t);
    t.v = 90 * 60000;
    expect(m.stats().minutes).toBe(90);
  });

  it("в списке не больше восьми ключей — это отчёт для человека", () => {
    const m = meter();
    for (let i = 0; i < 20; i++) m.note(`k${i}`, i + 1);
    expect(m.stats().top).toHaveLength(8);
  });
});

describe("как показываем человеку", () => {
  it("мегабайты, килобайты и байты", () => {
    expect(formatBytes(2_500_000)).toBe("2.38 МБ");
    expect(formatBytes(4096)).toBe("4 КБ");
    expect(formatBytes(500)).toBe("500 Б");
    expect(formatBytes(0)).toBe("0 Б");
  });
});
