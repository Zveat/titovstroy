// ─────────────────────────────────────────────────────────────────────────────
// TitovStroy · Парсер мастеров с OLX.kz  (GitHub Actions, второй источник)
// ─────────────────────────────────────────────────────────────────────────────
// OLX — доска объявлений (нет рейтингов/отзывов, как на найми). Поэтому качество
// оцениваем КОСВЕННО: возраст аккаунта продавца, свежесть объявления, платное
// продвижение, кол-во фото, длина описания, компания/частник → балл «серьёзности».
//
// Что делает:
//   1) Читает настройки из ключа titovstroy-masters-olx-config (раздел «Мастера» в CRM).
//   2) Для каждой выбранной категории «Услуги» (напр. 188 «Ремонт и строительство»
//      или её подкатегории) в регионе (Караганда = 5) забирает объявления из
//      публичного JSON-API OLX (/api/v1/offers/). Без браузера и без авторизации.
//   3) Схлопывает по продавцу (user.id) — один мастер = несколько объявлений.
//   4) Докапывает телефоны (/offers/{id}/limited-phones/ — открыт, без логина, НЕ
//      создаёт заявку и НЕ уведомляет продавца). Медленно, с паузами.
//   5) Пишет в отдельный ключ titovstroy-masters-olx (найми не трогает).
//
// Конфиг (env перебивает настройки из базы — для ручного теста):
//   FIREBASE_SERVICE_ACCOUNT (secret) — обязателен
//   OLX_REGION_ID / OLX_CATEGORY_IDS / OLX_PHONES_PER_RUN
//   FB_DB_URL / OLX_MASTERS_KEY / EVENT_NAME
// ─────────────────────────────────────────────────────────────────────────────

import admin from "firebase-admin";
import {
  OLX_REPAIR_CATEGORIES,
  applyPhoneAttempt,
  expandOlxCategoryIds,
  mergeFreshSnapshot,
  parseStoredJson,
  selectPhoneTargets,
} from "./parser-core.mjs";

const API = "https://www.olx.kz/api/v1";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const env = (k, d) => {
  const v = process.env[k];
  return (v === undefined || v === null || String(v).trim() === "") ? d : String(v).trim();
};
const num = (k, d) => { const n = Number(env(k, d)); return Number.isFinite(n) ? n : d; };

const FB_DB_URL     = env("FB_DB_URL", "https://titovstroy-da1cf-default-rtdb.firebaseio.com");
const MASTERS_KEY   = env("OLX_MASTERS_KEY", "titovstroy-masters-olx");
const CONFIG_KEY    = "titovstroy-masters-olx-config";
const EVENT         = env("EVENT_NAME", "");

const PAGE_LIMIT    = 40;                                  // объявлений на страницу API
const MAX_PAGES     = num("OLX_MAX_PAGES", 25);            // предел пагинации на категорию (25×40=1000, максимум OLX)
const PHONES_HARD_CAP = num("OLX_PHONES_HARD_CAP", 300);  // очередь честная: за несколько запусков проверит всех
const PHONE_BUDGET_MS = num("OLX_PHONE_BUDGET_MS", 16 * 60e3);
const PHONE_DELAY_MIN = num("OLX_PHONE_DELAY_MIN_MS", 1200);
const PHONE_DELAY_MAX = num("OLX_PHONE_DELAY_MAX_MS", 3200);
const PHONE_SAVE_EVERY = 12;

// Карта категорий OLX «Услуги» → название специальности (чтобы видеть, кто что делает).
// Ключи — id листовых подкатегорий; парсер берёт offer.category.id и подписывает мастера.
const OLX_CAT_NAMES = Object.fromEntries([
  { id: "188", name: "Ремонт и строительство" },
  ...OLX_REPAIR_CATEGORIES,
  { id: "1564", name: "Услуги грузчика" },
  { id: "192", name: "Перевозки / грузчики" },
  { id: "186", name: "Прочие услуги" },
].map(({ id, name }) => [String(id), name]));

const fbKey      = k => String(k).replace(/[^a-zA-Z0-9_]/g, "_");
const sleep      = ms => new Promise(r => setTimeout(r, ms));
const rnd        = (a, b) => a + Math.random() * (b - a);
const clean      = s => String(s ?? "").replace(/\s+/g, " ").trim();
const onlyDigits = s => String(s ?? "").replace(/\D/g, "");
const DAY = 24 * 3600e3;

async function apiGet(path) {
  const r = await fetch(`${API}/${path}`, { headers: { "Accept": "application/json", "User-Agent": UA } });
  if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`);
  return r.json();
}

// одна страница объявлений категории в регионе
async function fetchOffers(categoryId, regionId, offset, cityId = "") {
  const location = cityId ? `&city_id=${cityId}` : `&region_id=${regionId}`;
  const j = await apiGet(`offers/?offset=${offset}&limit=${PAGE_LIMIT}&category_id=${categoryId}${location}`);
  return { items: j?.data || [], total: j?.metadata?.total_elements ?? 0 };
}

async function crawlOffers(categoryId, regionId, cityId, onOffer) {
  let got = 0, total = 0, complete = true;
  const cityIds = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    let res;
    try { res = await fetchOffers(categoryId, regionId, page * PAGE_LIMIT, cityId); }
    catch (error) {
      console.warn(`  ! кат ${categoryId}${cityId ? ` город ${cityId}` : ""} стр.${page}: ${error.message}`);
      complete = false;
      break;
    }
    total = res.total;
    if (!res.items.length) break;
    for (const offer of res.items) {
      const foundCityId = offer.location?.city?.id;
      if (foundCityId) cityIds.add(String(foundCityId));
      onOffer(offer);
    }
    got += res.items.length;
    await sleep(rnd(250, 600));
    if (res.items.length < PAGE_LIMIT) break;
  }
  if (got >= MAX_PAGES * PAGE_LIMIT && total >= got) complete = false;
  return { got, total, complete, cityIds };
}

// Балл «серьёзности/активности» 0..100 (НЕ качество работы — его на OLX не узнать).
function scoreOf(m) {
  let s = 0;
  const now = Date.now();
  const ageDays = m.accountCreated ? (now - Date.parse(m.accountCreated)) / DAY : 0;
  s += Math.min(30, ageDays / 30);                     // до +30 за возраст аккаунта (≈2.5 года = макс)
  const freshDays = m.lastRefresh ? (now - Date.parse(m.lastRefresh)) / DAY : 999;
  s += freshDays <= 7 ? 25 : freshDays <= 30 ? 15 : freshDays <= 90 ? 6 : 0; // свежесть
  if (m.promoted) s += 15;                              // платное продвижение
  s += Math.min(12, (m.photosMax || 0) * 2);           // фото
  s += Math.min(10, (m.descLen || 0) / 120);           // детальность описания
  s += Math.min(8, (m.adsCount || 1) * 2);             // несколько активных объявлений
  return Math.round(Math.min(100, s));
}

function upsert(byUser, offer, categoryName) {
  const u = offer.user || {};
  const id = u.id || offer.id;
  if (!id) return;
  const key = `olx:${id}`;
  const promo = offer.promotion || {};
  const promoted = !!(promo.top_ad || promo.highlighted || promo.premium_ad_page);
  const photos = (offer.photos || []).length;
  const descLen = (offer.description || "").length;
  const city = offer.location?.city?.name || "";
  const svc = clean(categoryName || offer.category?.type || "");
  const prev = byUser.get(key);
  const hasPhone = !!offer.contact?.phone;
  if (prev) {
    if (svc && !prev.services.includes(svc)) prev.services.push(svc);
    // держим самое свежее/богатое объявление как представителя (для телефона и url)
    if (offer.last_refresh_time && (!prev.lastRefresh || offer.last_refresh_time > prev.lastRefresh)) {
      prev.lastRefresh = offer.last_refresh_time;
      prev.offerId = offer.id; prev.url = offer.url; prev.title = clean(offer.title);
    }
    prev.promoted = prev.promoted || promoted;
    prev.photosMax = Math.max(prev.photosMax, photos);
    prev.descLen = Math.max(prev.descLen, descLen);
    prev.adsCount += 1;
    if (hasPhone) {
      prev.hasPhoneFlag = true;
      prev.phoneOfferId = offer.id;
    }
    return;
  }
  byUser.set(key, {
    source: "olx",
    extId: String(id),
    offerId: offer.id,                                  // объявление-представитель (для телефона)
    name: clean(offer.contact?.name || u.name || ""),
    title: clean(offer.title),
    url: offer.url || "",
    city,
    services: [svc].filter(Boolean),
    business: !!offer.business,
    accountCreated: u.created || null,
    lastRefresh: offer.last_refresh_time || null,
    createdTime: offer.created_time || null,
    promoted, photosMax: photos, descLen, adsCount: 1,
    hasPhoneFlag: hasPhone,
    phoneOfferId: hasPhone ? offer.id : null,
    phone: "", phoneCheckedAt: null,
    collectedAt: new Date().toISOString(),
  });
}

async function fetchPhone(offerId) {
  try {
    const r = await fetch(`${API}/offers/${offerId}/limited-phones/`, {
      headers: { "Accept": "application/json", "User-Agent": UA },
    });
    if (r.status === 404 || r.status === 410) return { status: "unavailable" };
    if (!r.ok) return { status: "retry", error: `HTTP ${r.status}` };
    const j = await r.json();
    const phone = onlyDigits(j?.data?.phones?.[0] || "");
    return phone ? { status: "found", phone } : { status: "unavailable" };
  } catch (error) {
    return { status: "retry", error: error.message || "network error" };
  }
}

// ── Firebase (узел = строка с JSON, как читает CRM) ───────────────────────────
function initFb() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa || !sa.trim()) throw new Error("Нет секрета FIREBASE_SERVICE_ACCOUNT");
  let cred; try { cred = JSON.parse(sa); }
  catch (e) { throw new Error("FIREBASE_SERVICE_ACCOUNT — невалидный JSON: " + e.message); }
  admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: FB_DB_URL });
}
async function readJson(key, empty) {
  const value = (await admin.database().ref(fbKey(key)).get()).val();
  return parseStoredJson(value, { key, empty });
}
const writeJson = (key, obj) => admin.database().ref(fbKey(key)).set(JSON.stringify(obj));

const INTERVALS = { daily: 22 * 3600e3, twice: 11 * 3600e3, weekly: 6.5 * 24 * 3600e3 };
function decideRun(cfg) {
  const freq = ["off", "daily", "twice", "weekly"].includes(cfg.frequency) ? cfg.frequency : "daily";
  const runNow = Number(cfg.runNow) || 0;
  if (EVENT === "workflow_dispatch") return { run: true, reason: "ручной запуск", runNow };
  if (runNow > (Number(cfg.lastRunNow) || 0)) return { run: true, reason: "«Обновить сейчас»", runNow };
  if (freq === "off") return { run: false, reason: "выключено", runNow };
  const iv = INTERVALS[freq] || INTERVALS.daily;
  const run = (Date.now() - (Number(cfg.lastRunAt) || 0)) >= iv;
  return { run, reason: run ? `по расписанию (${freq})` : `ещё рано (${freq})`, runNow };
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  initFb();
  const cfg = await readJson(CONFIG_KEY, {});
  const decision = decideRun(cfg);
  console.log(`OLX · freq=${cfg.frequency || "—"}, lastRunAt=${cfg.lastRunAt || 0}, runNow=${decision.runNow}/${cfg.lastRunNow || 0}`);
  console.log(`решение: ${decision.run ? "ЗАПУСК" : "ПРОПУСК"} — ${decision.reason}`);
  if (!decision.run) { await admin.app().delete(); return; }

  // РЕГИОНОВ МОЖЕТ БЫТЬ НЕСКОЛЬКО: «5» или «5,18,1» — Караганда, Астана, Алматы и т.д.
  // Раньше принималось одно число, и добавить второй город было нельзя без правки кода.
  // Города ВНУТРИ региона парсер и так находит сам (см. разбиение по cityIds ниже).
  const regionIds = String(env("OLX_REGION_ID", "") || cfg.regionId || "5")
    .split(",").map(x => Number(String(x).trim())).filter(n => Number.isFinite(n) && n > 0);
  if (!regionIds.length) regionIds.push(5);
  const selectedCategoryIds = (env("OLX_CATEGORY_IDS", "") || String(cfg.categoryIds || "") || "188")
    .split(",").map(s => s.trim()).filter(Boolean);
  const categoryIds = expandOlxCategoryIds(selectedCategoryIds);
  const configuredPhones = Number(cfg.phonesPerRun);
  const phonesPerRun = num("OLX_PHONES_PER_RUN", Number.isFinite(configuredPhones) ? configuredPhones : 60);
  console.log(`OLX-parser · регионы=[${regionIds}] категории=[${categoryIds}] телефоны/прогон=${phonesPerRun}`);

  // уже собранное → мержим (телефоны не теряем)
  const existingDoc = await readJson(MASTERS_KEY, { items: [] });
  if (!existingDoc || typeof existingDoc !== "object" || Array.isArray(existingDoc) || !Array.isArray(existingDoc.items)) {
    throw new Error(`${MASTERS_KEY}: ожидался объект с массивом items; запись остановлена`);
  }
  const existing = existingDoc.items;
  const freshByUser = new Map();
  console.log(`в базе уже: ${existing.length} (${existing.filter(m => m.phone).length} с телефоном)`);

  // сбор объявлений по категориям
  let crawlComplete = true;
  const seenOfferIds = new Set();
  // Дубли схлопываются по offer.id ЧЕРЕЗ ВСЕ регионы и категории: seenOfferIds общий, поэтому
  // одно объявление, попавшее в выдачу двух регионов, не задвоится в базе.
  for (const regionId of regionIds) {
    for (const cid of categoryIds) {
      const addOffer = (offer) => {
        const offerKey = String(offer.id || "");
        if (!offerKey || seenOfferIds.has(offerKey)) return;
        seenOfferIds.add(offerKey);
        upsert(freshByUser, offer, OLX_CAT_NAMES[offer.category?.id] || OLX_CAT_NAMES[cid] || "Услуга");
      };
      const regionResult = await crawlOffers(cid, regionId, "", addOffer);
      let categoryComplete = regionResult.complete;
      let partitioned = false;
      // Публичная выдача OLX обрезается на 1000. Для таких категорий повторяем
      // обход по каждому найденному городу региона и схлопываем дубли по offer.id.
      if (regionResult.total >= MAX_PAGES * PAGE_LIMIT && regionResult.cityIds.size) {
        partitioned = true;
        categoryComplete = true;
        for (const cityId of regionResult.cityIds) {
          const cityResult = await crawlOffers(cid, regionId, cityId, addOffer);
          if (!cityResult.complete) categoryComplete = false;
        }
      }
      if (!categoryComplete) {
        crawlComplete = false;
        console.warn(`  ! регион ${regionId}, категория ${cid} собрана частично; старые записи не будут помечены неактивными`);
      }
      console.log(`  · регион ${regionId}, категория ${cid}: объявлений ${regionResult.got} (всего ~${regionResult.total})${partitioned ? `, разбито по ${regionResult.cityIds.size} городам` : ""}`);
    }
  }
  const freshItems = [...freshByUser.values()];
  const all = mergeFreshSnapshot(existing, freshItems, { complete: crawlComplete });
  for (const m of all) m.score = scoreOf(m);          // пересчёт балла
  console.log(`ИТОГО: активных ${all.filter(m => m.active !== false).length}, всего с историей ${all.length}`);

  const buildPayload = () => ({
    updatedAt: new Date().toISOString(), source: "olx.kz",
    count: all.length,
    activeCount: all.filter(m => m.active !== false).length,
    withPhone: all.filter(m => m.phone).length,
    pendingPhone: all.filter(m => m.active !== false && !m.phone && m.hasPhoneFlag).length,
    crawlComplete,
    selectedCategoryIds,
    parsedCategoryIds: categoryIds,
    availableCategories: OLX_REPAIR_CATEGORIES,
    items: all,
  });
  await writeJson(MASTERS_KEY, buildPayload());
  console.log(`✔ список сохранён: ${all.length}`);

  // телефоны (открыты, без логина) — приоритет по баллу, с потолком/бюджетом/сохранением
  const targets = selectPhoneTargets(
    all.filter(m => m.active !== false && m.hasPhoneFlag && m.offerId),
    { limit: Math.min(Math.max(0, phonesPerRun), PHONES_HARD_CAP) },
  );
  console.log(`телефоны: цель ${targets.length}`);
  const deadline = Date.now() + PHONE_BUDGET_MS;
  let gotPhones = 0, done = 0, retryErrors = 0, lastPhoneError = "";
  for (const m of targets) {
    if (Date.now() > deadline) { console.warn(`  ! бюджет времени исчерпан на ${done}/${targets.length}`); break; }
    const result = await fetchPhone(m.phoneOfferId || m.offerId);
    Object.assign(m, applyPhoneAttempt(m, result));
    if (result.status === "found") gotPhones++;
    if (result.status === "retry") { retryErrors++; lastPhoneError = result.error || "Временная ошибка OLX"; }
    done++;
    if (done % PHONE_SAVE_EVERY === 0) {
      try { await writeJson(MASTERS_KEY, buildPayload()); console.log(`  … сохранено (номеров ${gotPhones}/${done})`); } catch {}
    }
    if (result.status === "retry" && /HTTP (403|429)/.test(result.error || "")) {
      console.warn(`  ! OLX временно ограничил телефоны (${result.error}); партия остановлена без ложной отметки «номера нет»`);
      break;
    }
    await sleep(rnd(PHONE_DELAY_MIN, PHONE_DELAY_MAX));
  }
  console.log(`телефоны: получено ${gotPhones}, обработано ${done}, временных ошибок ${retryErrors}`);

  const payload = buildPayload();
  await writeJson(MASTERS_KEY, payload);
  console.log(`✔ записано ${payload.count} мастеров (с телефоном: ${payload.withPhone}) в ${fbKey(MASTERS_KEY)}`);

  const fresh = await readJson(CONFIG_KEY, {});
  fresh.lastRunAt = Date.now();
  if (decision.runNow) fresh.lastRunNow = decision.runNow;
  fresh.lastCount = all.length; fresh.lastWithPhone = payload.withPhone;
  fresh.lastActiveCount = payload.activeCount;
  fresh.lastPendingPhone = payload.pendingPhone;
  fresh.lastRunStatus = crawlComplete ? "ok" : "partial";
  fresh.lastPhoneError = lastPhoneError;
  fresh.availableCategories = OLX_REPAIR_CATEGORIES;
  await writeJson(CONFIG_KEY, fresh);
  console.log(`настройки: lastRunAt обновлён`);

  await admin.app().delete();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
