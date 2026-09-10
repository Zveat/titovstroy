import { describe, expect, it } from "vitest";
import { CACHE_MAX_AGE_MS, isCacheUsable, mastersStamp } from "./mastersCache.js";

const NOW = 1789000000000;
const entry = (over = {}) => ({ stamp: "1|100|60|90", savedAt: NOW - 1000, items: [{ id: "a" }], ...over });

describe("подпись справочника", () => {
  it("собирается из настроек парсера", () => {
    // Эти же поля раздел показывает в строке «последнее: … собрано … с тел. …».
    expect(mastersStamp({ lastRunAt: 1, lastCount: 100, lastWithPhone: 60, lastActiveCount: 90 }))
      .toBe("1|100|60|90");
  });

  it("новый обход парсера меняет подпись", () => {
    const a = mastersStamp({ lastRunAt: 1, lastCount: 100 });
    const b = mastersStamp({ lastRunAt: 2, lastCount: 101 });
    expect(a).not.toBe(b);
  });

  it("настройки не прочитались — подписи нет, а не «пустая подпись»", () => {
    // Пустая строка честнее выдуманной: копии доверяем только по возрасту.
    for (const v of [null, undefined, {}, [], "строка", 5]) expect(mastersStamp(v)).toBe("");
  });

  it("посторонние поля настроек на подпись не влияют", () => {
    // В настройках лежат ещё частота, города, категории — их правка справочник не меняет.
    expect(mastersStamp({ lastRunAt: 1, lastCount: 100, lastWithPhone: 60, lastActiveCount: 90, freq: "twice", cities: ["x"] }))
      .toBe("1|100|60|90");
  });
});

describe("годится ли сохранённая копия", () => {
  it("та же подпись и свежая — берём", () => {
    expect(isCacheUsable(entry(), "1|100|60|90", { now: NOW })).toBe(true);
  });

  it("подпись другая — парсер собрал заново, качаем", () => {
    expect(isCacheUsable(entry(), "2|101|61|90", { now: NOW })).toBe(false);
  });

  it("старше потолка — качаем, даже если подпись та же", () => {
    // Потоки добора номеров настройки не трогают, поэтому собранные ими телефоны
    // в подпись не попадают. Потолок по возрасту — единственное, что их подтянет.
    expect(isCacheUsable(entry({ savedAt: NOW - CACHE_MAX_AGE_MS - 1 }), "1|100|60|90", { now: NOW })).toBe(false);
    expect(isCacheUsable(entry({ savedAt: NOW - CACHE_MAX_AGE_MS + 1 }), "1|100|60|90", { now: NOW })).toBe(true);
  });

  it("копия из будущего не годится", () => {
    // Часы на устройстве перевели — такая копия не протухнет сама никогда.
    expect(isCacheUsable(entry({ savedAt: NOW + 3600e3 }), "1|100|60|90", { now: NOW })).toBe(false);
  });

  it("мусор и пустота — просто «не годится», без падения", () => {
    for (const bad of [null, undefined, {}, [], "нет", { items: "не массив", savedAt: NOW }, { items: [], savedAt: "вчера" }]) {
      expect(isCacheUsable(bad, "1|100|60|90", { now: NOW })).toBe(false);
    }
  });

  it("пустой справочник — законная копия, если подпись сходится", () => {
    // Пустой список бывает на новой установке: качать его заново каждый раз незачем.
    expect(isCacheUsable(entry({ items: [] }), "1|100|60|90", { now: NOW })).toBe(true);
  });

  it("нет подписи ни там ни там — решает только возраст", () => {
    expect(isCacheUsable(entry({ stamp: "" }), "", { now: NOW })).toBe(true);
    expect(isCacheUsable(entry({ stamp: "", savedAt: NOW - CACHE_MAX_AGE_MS - 1 }), "", { now: NOW })).toBe(false);
  });
});
