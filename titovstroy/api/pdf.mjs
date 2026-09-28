// НАСТОЯЩИЙ PDF — НА СЕРВЕРЕ, ПОТОМУ ЧТО В ТЕЛЕФОНЕ ЕГО СДЕЛАТЬ НЕЧЕМ.
//
// Владелец открывает CRM с иконки на экране, то есть как приложение. Проверено им же:
// окно печати там не открывается ВООБЩЕ — window.print() у приложения с иконки на iOS
// не делает ничего и об этом не сообщает. А печать была единственным способом получить
// PDF в браузере: своего построителя PDF у нас нет, и заводить его в браузере нельзя —
// библиотеки такого рода рисуют страницу картинкой, и договор перестал бы выделяться,
// искаться и весил бы на порядок больше.
//
// Поэтому страницу печатает сервер. Тот же самый HTML, что уходит на печать с
// компьютера, отдаётся настоящему Chromium, и он возвращает настоящий PDF — с
// выделяемым текстом, разбитый на страницы А4 ровно так же, как на компьютере.
// Телефон дальше сам решает: сохранить в Файлы или отправить клиенту в WhatsApp.
//
// ПОЧЕМУ ВООБЩЕ БЕЗОПАСНО ОТПРАВЛЯТЬ СЮДА ДОГОВОР. Он уходит на наш же сервер, тем же
// сотрудником, который его и открыл, и НИГДЕ НЕ СОХРАНЯЕТСЯ: пришёл, отрисовался,
// ушёл обратно готовым файлом. Ни ссылки, ни файла на диске не остаётся — поэтому
// здесь нет и не должно появиться «дай ссылку на документ»: такую ссылку можно
// переслать, а договор содержит паспортные данные клиента.
//
// КТО СЮДА ПУСКАЕТСЯ — так же, как к рассылке: свой сайт по заголовку Origin и живой
// токен сотрудника, проверенный у Google, а не «доверяем строке».
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const PROD_FIREBASE_API_KEY = "AIzaSyCPawCUYGY20SB5cLLszjoNzK5ytew9tCs";
const DEFAULT_ORIGINS = [
  "https://erp.titovstroy.kz",
  "https://titovstroy.kz",
  "https://www.titovstroy.kz",
];
// Больше договора с длинной сметой никто не пришлёт: замер на боевой — 454 КБ.
const MAX_HTML = 4 * 1024 * 1024;

export function createPdfHandler({
  env = process.env,
  fetchImpl = fetch,
  launch = null,            // подменяется в тестах, чтобы не поднимать браузер
} = {}) {
  const apiKey = env.VITE_FB_API_KEY || PROD_FIREBASE_API_KEY;
  const allowedOrigins = new Set([
    ...DEFAULT_ORIGINS,
    ...String(env.PARSER_ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean),
  ]);

  // Токен проверяем У GOOGLE. Подпись поддельного токена он не подтвердит, а нам
  // достаточно знать, что за дверью живой сотрудник этой установки.
  async function staffOk(req) {
    const header = String(req.headers?.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return false;
    try {
      const r = await fetchImpl(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token }) },
      );
      const payload = await r.json().catch(() => null);
      return Boolean(r.ok && Array.isArray(payload?.users) && payload.users.length);
    } catch { return false; }
  }

  // Картинки в документе (печать, логотип) лежат на сайте. У страницы, собранной из
  // строки, своего адреса нет, поэтому подставляем основание — иначе печать пропадёт.
  function withBase(html, origin) {
    if (!origin || /<base\s/i.test(html)) return html;
    const base = `<base href="${origin.replace(/"/g, "&quot;")}/">`;
    return /<head[^>]*>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`)
      : `${base}${html}`;
  }

  async function renderPdf(html) {
    const browser = launch
      ? await launch()
      : await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1240, height: 1754 },   // А4 при 150 точках на дюйм
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    try {
      const page = await browser.newPage();
      // networkidle0 — чтобы картинки успели приехать: иначе печать выйдет без штампа.
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        // Поля нулевые НАМЕРЕННО: отступы заданы в самом документе (@page{margin:0}
        // и padding в миллиметрах). Добавить поля здесь — значит сдвинуть вёрстку,
        // которая годами печаталась с компьютера именно так.
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
      });
    } finally {
      await browser.close().catch(() => {});
    }
  }

  return async function pdfHandler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ ok: false, code: "method_not_allowed" });

    const origin = String(req.headers?.origin || "");
    if (!allowedOrigins.has(origin)) return res.status(403).json({ ok: false, code: "origin_not_allowed" });
    if (!(await staffOk(req))) return res.status(401).json({ ok: false, code: "not_staff" });

    const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
    const html = String(body.html || "");
    if (!html) return res.status(400).json({ ok: false, code: "no_html" });
    if (html.length > MAX_HTML) return res.status(413).json({ ok: false, code: "html_too_big" });

    try {
      const pdf = await renderPdf(withBase(html, origin));
      const name = fileName(body.title);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      return res.status(200).send(Buffer.from(pdf));
    } catch (error) {
      // Молчать здесь нельзя: именно молчание и довело до этой правки.
      return res.status(500).json({ ok: false, code: "render_failed", error: String(error?.message || error) });
    }
  };
}

function safeJson(raw) { try { return JSON.parse(raw); } catch { return {}; } }

export function fileName(title) {
  const clean = String(title || "Документ").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return `${clean.slice(0, 90) || "Документ"}.pdf`;
}

export default createPdfHandler();
