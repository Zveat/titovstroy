import { describe, expect, it, vi } from "vitest";
import { createPdfHandler, fileName } from "./pdf.mjs";

// Сюда уезжает договор с паспортными данными клиента, поэтому проверяется не только
// «печатает ли», но и КОГО пускаем. Браузер в тестах не поднимается: печать подменена.

const fakeChrome = (onContent = () => {}) => {
  const page = {
    setContent: vi.fn(async (html) => onContent(html)),
    pdf: vi.fn(async () => Buffer.from("%PDF-1.4 притворяюсь документом")),
  };
  const browser = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
  return { browser, page, launch: async () => browser };
};

const fakeRes = () => {
  const out = { status: 0, headers: {}, body: null, json: null };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status(code) { out.status = code; return this; },
    json(payload) { out.json = payload; return this; },
    send(buffer) { out.body = buffer; return this; },
  };
  return { res, out };
};

const okLookup = async () => ({ ok: true, json: async () => ({ users: [{ localId: "u1" }] }) });
const badLookup = async () => ({ ok: false, json: async () => ({ error: { message: "INVALID_ID_TOKEN" } }) });

const request = (over = {}) => ({
  method: "POST",
  headers: { origin: "https://erp.titovstroy.kz", authorization: "Bearer живой", ...(over.headers || {}) },
  body: { html: "<html><head></head><body>Договор</body></html>", title: "Договор №1", ...(over.body || {}) },
  ...(over.method ? { method: over.method } : {}),
});

describe("печать документа на сервере", () => {
  it("печатает и отдаёт файл с человеческим именем", async () => {
    const { launch, page, browser } = fakeChrome();
    const handler = createPdfHandler({ env: {}, fetchImpl: okLookup, launch });
    const { res, out } = fakeRes();
    await handler(request(), res);

    expect(out.status).toBe(200);
    expect(out.headers["Content-Type"]).toBe("application/pdf");
    expect(out.headers["Content-Disposition"]).toContain('filename="Договор №1.pdf"');
    expect(out.body.toString()).toContain("%PDF");
    // Лист и поля берутся из самого документа: добавить их здесь значило бы сдвинуть
    // вёрстку, которая годами печаталась с компьютера именно так.
    expect(page.pdf).toHaveBeenCalledWith(expect.objectContaining({
      format: "A4", preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    }));
    expect(browser.close).toHaveBeenCalled();     // браузер за собой закрываем всегда
  });

  it("подставляет основание адреса, иначе печать и логотип не приедут", async () => {
    let seen = "";
    const { launch } = fakeChrome(html => { seen = html; });
    const handler = createPdfHandler({ env: {}, fetchImpl: okLookup, launch });
    const { res } = fakeRes();
    await handler(request(), res);
    expect(seen).toContain('<base href="https://erp.titovstroy.kz/">');
  });

  it("чужой сайт не пускаем — иначе договор печатал бы кто угодно", async () => {
    const { launch } = fakeChrome();
    const handler = createPdfHandler({ env: {}, fetchImpl: okLookup, launch });
    const { res, out } = fakeRes();
    await handler(request({ headers: { origin: "https://chuzhoi.example" } }), res);
    expect(out.status).toBe(403);
    expect(out.json).toMatchObject({ code: "origin_not_allowed" });
  });

  it("токен проверяем у Google, а не верим строке", async () => {
    const { launch, browser } = fakeChrome();
    const handler = createPdfHandler({ env: {}, fetchImpl: badLookup, launch });
    const { res, out } = fakeRes();
    await handler(request(), res);
    expect(out.status).toBe(401);
    expect(out.json).toMatchObject({ code: "not_staff" });
    expect(browser.newPage).not.toHaveBeenCalled();   // до печати дело не дошло
  });

  it("без токена — сразу отказ", async () => {
    const { launch } = fakeChrome();
    const handler = createPdfHandler({ env: {}, fetchImpl: okLookup, launch });
    const { res, out } = fakeRes();
    await handler(request({ headers: { authorization: "" } }), res);
    expect(out.status).toBe(401);
  });

  it("не POST и пустой документ отбиваем", async () => {
    const { launch } = fakeChrome();
    const handler = createPdfHandler({ env: {}, fetchImpl: okLookup, launch });

    const get = fakeRes();
    await handler({ ...request(), method: "GET" }, get.res);
    expect(get.out.status).toBe(405);

    const empty = fakeRes();
    await handler(request({ body: { html: "" } }), empty.res);
    expect(empty.out.status).toBe(400);
  });

  it("слишком большой документ не печатаем", async () => {
    const { launch } = fakeChrome();
    const handler = createPdfHandler({ env: {}, fetchImpl: okLookup, launch });
    const { res, out } = fakeRes();
    await handler(request({ body: { html: "x".repeat(5 * 1024 * 1024) } }), res);
    expect(out.status).toBe(413);
  });

  it("упавшая печать объясняет себя словами, а не молчит", async () => {
    const launch = async () => ({
      newPage: async () => ({ setContent: async () => { throw new Error("страница не открылась"); } }),
      close: async () => {},
    });
    const handler = createPdfHandler({ env: {}, fetchImpl: okLookup, launch });
    const { res, out } = fakeRes();
    await handler(request(), res);
    expect(out.status).toBe(500);
    expect(out.json).toMatchObject({ code: "render_failed" });
    expect(out.json.error).toContain("страница не открылась");
  });

  it("адрес установки можно расширить настройкой — для другой компании", async () => {
    const { launch } = fakeChrome();
    const handler = createPdfHandler({
      env: { PARSER_ALLOWED_ORIGINS: "https://crm.drugaya.kz" }, fetchImpl: okLookup, launch,
    });
    const { res, out } = fakeRes();
    await handler(request({ headers: { origin: "https://crm.drugaya.kz" } }), res);
    expect(out.status).toBe(200);
  });

  it("имя файла не ломает файловую систему и не растёт без предела", () => {
    expect(fileName('Дог/1045 "Запорожец"')).toBe("Дог_1045 _Запорожец_.pdf");
    expect(fileName("")).toBe("Документ.pdf");
    expect(fileName("я".repeat(200)).length).toBeLessThanOrEqual(94);
  });
});
