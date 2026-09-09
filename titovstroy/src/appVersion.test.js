import { describe, expect, it } from "vitest";
import { currentEntry, entryFrom, fetchLatestEntry, isNewer, shouldCheck } from "./appVersion.js";

// Настоящий кусок собранного index.html — с ним всё и сравнивается.
const HTML = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8" />
<script type="module" crossorigin src="/assets/index-BxDNrfVe.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react-BhFsdyyS.js">
<link rel="modulepreload" crossorigin href="/assets/index.esm-BqpXQC_4.js">
</head><body><div id="root"></div></body></html>`;

describe("имя главного файла", () => {
  it("находится в собранной странице", () => {
    expect(entryFrom(HTML)).toBe("/assets/index-BxDNrfVe.js");
  });

  it("не путается с соседним куском index.esm-*.js", () => {
    // У него после «index» точка, а не дефис — под шаблон он попасть не должен,
    // иначе сравнивали бы версию не того файла.
    expect(entryFrom(`<link href="/assets/index.esm-BqpXQC_4.js">`)).toBe("");
  });

  it("на мусоре и пустоте не падает", () => {
    for (const v of ["", null, undefined, 42, "<html></html>"]) expect(entryFrom(v)).toBe("");
  });

  it("читается из тегов открытой страницы", () => {
    const doc = { querySelectorAll: () => [
      { getAttribute: () => "/assets/react-BhFsdyyS.js" },
      { getAttribute: () => "/assets/index-BxDNrfVe.js" },
    ]};
    expect(currentEntry(doc)).toBe("/assets/index-BxDNrfVe.js");
  });

  it("страница без такого тега — пусто, а не падение", () => {
    expect(currentEntry({ querySelectorAll: () => [] })).toBe("");
    expect(currentEntry(null)).toBe("");
  });
});

describe("когда считаем, что вышла новая версия", () => {
  it("имена разошлись — новая", () => {
    expect(isNewer("/assets/index-AAAA.js", "/assets/index-BBBB.js")).toBe(true);
  });

  it("имена совпали — не новая", () => {
    expect(isNewer("/assets/index-AAAA.js", "/assets/index-AAAA.js")).toBe(false);
  });

  it("МОЛЧИМ, если одну из сторон узнать не удалось", () => {
    // Пустое приходит и в режиме разработки (там имени с отпечатком нет), и когда
    // сервер не ответил. Показать в этот момент «вышла новая версия» — соврать.
    expect(isNewer("", "/assets/index-BBBB.js")).toBe(false);
    expect(isNewer("/assets/index-AAAA.js", "")).toBe(false);
    expect(isNewer("", "")).toBe(false);
  });
});

describe("как часто спрашиваем сервер", () => {
  it("первый раз — сразу", () => {
    expect(shouldCheck(1_000_000, 0)).toBe(true);
    expect(shouldCheck(1_000_000, null)).toBe(true);
  });

  it("минуту после проверки не дёргаемся", () => {
    expect(shouldCheck(1_000_000, 1_000_000 - 59_000)).toBe(false);
    expect(shouldCheck(1_000_000, 1_000_000 - 60_000)).toBe(true);
  });
});

describe("поход на сервер", () => {
  it("возвращает имя из ответа", async () => {
    const got = await fetchLatestEntry(async () => ({ ok: true, text: async () => HTML }));
    expect(got).toBe("/assets/index-BxDNrfVe.js");
  });

  it("просит именно свежую копию, а не из кеша", async () => {
    let url = "", opts = null;
    await fetchLatestEntry(async (u, o) => { url = u; opts = o; return { ok: true, text: async () => HTML }; });
    expect(url).toMatch(/^\/index\.html\?v=\d+$/);
    expect(opts).toEqual({ cache: "no-store" });
  });

  it("нет сети или сервер ответил ошибкой — тихо пусто", async () => {
    expect(await fetchLatestEntry(async () => { throw new Error("нет сети"); })).toBe("");
    expect(await fetchLatestEntry(async () => ({ ok: false }))).toBe("");
    expect(await fetchLatestEntry(async () => null)).toBe("");
  });
});
