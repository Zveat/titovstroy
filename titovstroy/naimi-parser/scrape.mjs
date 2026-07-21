// ─────────────────────────────────────────────────────────────────────────────
// TitovStroy · Парсер мастеров с naimi.kz  (запускается на GitHub Actions)
// ─────────────────────────────────────────────────────────────────────────────
// Что делает:
//   1) Берёт справочники (города, услуги) с публичного JSON-API naimi.
//   2) Для каждой пары «город × услуга» открывает страницу списка в Playwright и
//      ПЕРЕХВАТЫВАЕТ ответ API со списком мастеров (стабильный JSON, а не CSS-селекторы).
//   3) Мержит с уже собранным (телефоны и данные не теряются), дедуплицирует.
//   4) МЕДЛЕННО докапывает телефоны: за один прогон подтягивает номер только у
//      небольшой партии мастеров без номера, с человеческими случайными паузами.
//      Так база наполняется постепенно, без всплеска запросов → не блокируют.
//   5) Пишет всё в Firebase RTDB под ключ titovstroy-masters в формате CRM.
//
// Боевые данные сервиса не трогает — только свой ключ.
//
// Конфиг — через переменные окружения (в workflow):
//   FIREBASE_SERVICE_ACCOUNT  (secret)  — JSON сервисного аккаунта Firebase
//   FB_DB_URL / MASTERS_KEY             — база и ключ (по умолчанию боевая / titovstroy-masters)
//   CITIES / CATEGORY_IDS               — что обходить (по умолчанию almaty / 47=Ремонт)
//   MAX_SERVICES_PER_CAT / MAX_PAGES    — ограничители обхода
//   FETCH_PHONES        ("1"|"0")       — докапывать ли телефоны (по умолч. 1)
//   PHONES_PER_RUN                      — сколько номеров тянуть за прогон (по умолч. 25)
//   PHONE_DELAY_MIN_MS/PHONE_DELAY_MAX_MS — пауза между номерами (по умолч. 4000–11000 мс)
//   HEADFUL             ("1")           — показать браузер локально
// ─────────────────────────────────────────────────────────────────────────────

import admin from "firebase-admin";
import { chromium } from "playwright";

const API = "https://apipub.naimi.kz/app";
const SITE = "https://naimi.kz";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const env = (k, d) => (process.env[k] ?? d);
const num = (k, d) => Number(env(k, d));
const FB_DB_URL = env("FB_DB_URL", "https://titovstroy-da1cf-default-rtdb.firebaseio.com");
const MASTERS_KEY = env("MASTERS_KEY", "titovstroy-masters");
const CITIES = env("CITIES", "almaty").split(",").map(s => s.trim()).filter(Boolean);
const CATEGORY_IDS = env("CATEGORY_IDS", "47").split(",").map(s => Number(s.trim())).filter(Boolean);
const MAX_SERVICES_PER_CAT = num("MAX_SERVICES_PER_CAT", 999);
const MAX_PAGES = num("MAX_PAGES", 6);
const FETCH_PHONES = env("FETCH_PHONES", "1") === "1";
const PHONES_PER_RUN = num("PHONES_PER_RUN", 25);
const PHONE_DELAY_MIN = num("PHONE_DELAY_MIN_MS", 4000);
const PHONE_DELAY_MAX = num("PHONE_DELAY_MAX_MS", 11000);
const HEADFUL = env("HEADFUL", "") === "1";

const fbKey = k => String(k).replace(/[^a-zA-Z0-9_]/g, "_");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();
const onlyDigits = s => String(s ?? "").replace(/\D/g, "");

// ── Справочники (обычный GET) ─────────────────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(`${API}/${path}`, { headers: { "Accept": "application/json", "User-Agent": UA } });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  const j = await r.json();
  return j?.content ?? j;
}
async function getServices(categoryId) {
  const c = await apiGet(`pub/catalogue/main/services?category_id=${categoryId}`);
  return (c?.services || []).map(s => ({ id: s.id, name: clean(s.name), slug: s.slug })).filter(s => s.slug);
}

// ── Достаём массив мастеров из произвольного JSON-ответа ──────────────────────
function extractSpecialists(json) {
  const looksLikeMaster = o => o && typeof o === "object" &&
    (o.slug || o.id || o.specialist_id) && (o.name || o.full_name || o.title || o.first_name);
  const found = [];
  const visit = (node, depth) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      if (node.length && node.filter(looksLikeMaster).length >= Math.max(1, node.length * 0.5)) {
        for (const o of node) if (looksLikeMaster(o)) found.push(o);
      } else node.forEach(x => visit(x, depth + 1));
    } else if (typeof node === "object") for (const k of Object.keys(node)) visit(node[k], depth + 1);
  };
  visit(json?.content ?? json, 0);
  return found;
}
function normalize(raw, ctx) {
  const name = clean(raw.name || raw.full_name || raw.title ||
    [raw.first_name, raw.last_name].filter(Boolean).join(" "));
  const slug = raw.slug || raw.specialist_slug || String(raw.id || raw.specialist_id || "");
  return {
    source: "naimi",
    extId: String(raw.id || raw.specialist_id || slug),
    specialistId: raw.specialist_id || raw.id || null, // нужен для запроса телефона
    name, slug,
    url: slug ? `${SITE}/spec/${slug}` : "",
    city: ctx.city, category: ctx.category, services: [ctx.service].filter(Boolean),
    rating: Number(raw.rating ?? raw.rate ?? raw.mark ?? 0) || null,
    reviews: Number(raw.reviews_count ?? raw.reviews ?? raw.review_count ?? 0) || 0,
    verified: !!(raw.is_verified ?? raw.verified ?? raw.is_pro ?? false),
    avatar: raw.avatar?.image || raw.avatar || raw.photo || "",
    experience: clean(raw.experience || raw.exp || ""),
    priceFrom: raw.price_from ?? raw.min_price ?? null,
    phone: "",
    phoneCheckedAt: null,
    collectedAt: new Date().toISOString(),
  };
}

// ── Сбор списка мастеров со страницы услуги (перехват API-ответа) ─────────────
async function collectForServiceCity(browser, citySlug, service, categoryName, byId) {
  const ctx = await browser.newContext({ userAgent: UA, locale: "ru-RU" });
  const page = await ctx.newPage();
  const captured = [];
  let sawEndpoint = "";
  page.on("response", async resp => {
    try {
      const u = resp.url();
      if (!u.includes("apipub.naimi.kz") && !u.includes("/api/app")) return;
      if (resp.request().method() === "OPTIONS") return;
      if (!(resp.headers()["content-type"] || "").includes("json")) return;
      const json = await resp.json().catch(() => null);
      const masters = json ? extractSpecialists(json) : [];
      if (masters.length) { captured.push(...masters); if (!sawEndpoint) sawEndpoint = `${resp.request().method()} ${u}`; }
    } catch {}
  });
  const pageUrl = `${SITE}/${citySlug}/service/${service.slug}`;
  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(3500);
    for (let p = 0; p < MAX_PAGES; p++) {
      const before = captured.length;
      await page.mouse.wheel(0, 6000).catch(() => {});
      const moreBtn = await page.$('button:has-text("Показать"), button:has-text("Ещё")').catch(() => null);
      if (moreBtn) await moreBtn.click().catch(() => {});
      await sleep(2500);
      if (captured.length === before) break;
    }
  } catch (e) { console.warn(`  ! ${pageUrl}: ${e.message}`); }
  await ctx.close();

  let added = 0;
  for (const raw of captured) {
    const m = normalize(raw, { city: citySlug, category: categoryName, service: service.name });
    if (!m.name || !m.extId) continue;
    const key = `${m.source}:${m.extId}`;
    const prev = byId.get(key);
    if (prev) {
      for (const s of m.services) if (!prev.services.includes(s)) prev.services.push(s);
      if (!prev.specialistId && m.specialistId) prev.specialistId = m.specialistId;
    } else { byId.set(key, m); added++; }
  }
  if (sawEndpoint) console.log(`  · эндпоинт списка: ${sawEndpoint}`);
  console.log(`  · ${citySlug} / ${service.name}: +${added} новых (перехвачено ${captured.length})`);
  return added;
}

// ── Медленный докап телефонов через сессию браузера (с человеческими паузами) ─
async function fillPhones(browser, masters) {
  const targets = masters.filter(m => !m.phone && m.specialistId).slice(0, PHONES_PER_RUN);
  if (!targets.length) { console.log("телефоны: докапывать нечего"); return 0; }

  // отдельный контекст с cookies живого сайта — запрос выглядит как «показать телефон»
  const ctx = await browser.newContext({ userAgent: UA, locale: "ru-RU" });
  const page = await ctx.newPage();
  try { await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 30000 }); await sleep(2000); } catch {}

  let got = 0, firstRaw = true;
  for (const m of targets) {
    try {
      const resp = await ctx.request.put(`${API}/pub/call/specialist`, {
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Origin": SITE, "Referer": m.url || SITE },
        data: { specialist_id: m.specialistId },
        timeout: 15000,
      });
      const j = await resp.json().catch(() => null);
      if (firstRaw) { console.log("  · пример ответа телефона:", JSON.stringify(j).slice(0, 200)); firstRaw = false; }
      const c = j?.content || j || {};
      const phone = onlyDigits(c.phone || c.number || c.contact || c.phone_number || "");
      m.phoneCheckedAt = new Date().toISOString();
      if (phone) { m.phone = phone; got++; }
      else if (resp.status() === 401 || resp.status() === 403) {
        console.warn(`  ! телефон требует авторизации (HTTP ${resp.status()}) — нужен вход по аккаунту naimi. Стоп на этом прогоне.`);
        break;
      }
    } catch (e) { console.warn(`  ! телефон ${m.specialistId}: ${e.message}`); }
    await sleep(rnd(PHONE_DELAY_MIN, PHONE_DELAY_MAX)); // человеческая пауза
  }
  await ctx.close();
  console.log(`телефоны: получено ${got} из ${targets.length} (партия за прогон)`);
  return got;
}

// ── Firebase: чтение существующего и запись (узел = строка с JSON, как в CRM) ──
function initFb() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) throw new Error("Нет секрета FIREBASE_SERVICE_ACCOUNT");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)), databaseURL: FB_DB_URL });
}
async function readExisting() {
  try {
    const snap = await admin.database().ref(fbKey(MASTERS_KEY)).get();
    const v = snap.val();
    if (typeof v === "string") return JSON.parse(v).items || [];
    if (v && Array.isArray(v.items)) return v.items;
  } catch (e) { console.warn("чтение существующего:", e.message); }
  return [];
}
async function writeToFirebase(masters) {
  const payload = { updatedAt: new Date().toISOString(), source: "naimi.kz", count: masters.length,
    withPhone: masters.filter(m => m.phone).length, items: masters };
  await admin.database().ref(fbKey(MASTERS_KEY)).set(JSON.stringify(payload));
  console.log(`✔ записано ${masters.length} мастеров (с телефоном: ${payload.withPhone}) в ${fbKey(MASTERS_KEY)}`);
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`naimi-parser · города=[${CITIES}] категории=[${CATEGORY_IDS}] телефоны=${FETCH_PHONES} (до ${PHONES_PER_RUN}/прогон, пауза ${PHONE_DELAY_MIN}-${PHONE_DELAY_MAX}мс)`);
  initFb();

  // 1) уже собранное → мержим, чтобы телефоны и история не терялись
  const existing = await readExisting();
  const byId = new Map(existing.map(m => [`${m.source}:${m.extId}`, m]));
  console.log(`в базе уже: ${existing.length} мастеров (${existing.filter(m => m.phone).length} с телефоном)`);

  // 2) справочник услуг
  const services = [];
  for (const cid of CATEGORY_IDS) {
    const s = await getServices(cid).catch(e => (console.warn("services err", e.message), []));
    for (const x of s.slice(0, MAX_SERVICES_PER_CAT)) services.push({ ...x, categoryName: `cat-${cid}` });
  }
  console.log(`услуг к обходу: ${services.length}`);

  // 3) обход списков
  const browser = await chromium.launch({ headless: !HEADFUL, args: ["--no-sandbox"] });
  for (const city of CITIES) {
    for (const svc of services) {
      await collectForServiceCity(browser, city, svc, svc.categoryName, byId);
      await sleep(rnd(1200, 2200));
    }
  }
  const all = [...byId.values()];
  console.log(`ИТОГО мастеров в базе: ${all.length}`);

  // 4) медленный докап телефонов
  if (FETCH_PHONES) { try { await fillPhones(browser, all); } catch (e) { console.warn("phones stage:", e.message); } }
  await browser.close();

  // 5) запись
  await writeToFirebase(all);
  await admin.app().delete();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
