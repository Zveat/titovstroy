// ─────────────────────────────────────────────────────────────────────────────
// TitovStroy · Парсер мастеров с naimi.kz  (запускается на GitHub Actions)
// ─────────────────────────────────────────────────────────────────────────────
// Что делает:
//   1) Читает настройки парсера из базы (ключ titovstroy-masters-config — его
//      редактирует раздел «Мастера» в CRM): частота, «Обновить сейчас», города,
//      категории, сколько телефонов за прогон. По ним решает — парсить сейчас или нет.
//   2) Берёт справочник услуг и СПИСОК мастеров напрямую с публичного JSON-API naimi
//      (без браузера — быстро и стабильно). Город передаётся заголовком App-City.
//   3) Мержит с уже собранным (телефоны и история не теряются), дедуплицирует.
//   4) (опц.) МЕДЛЕННО докапывает телефоны — но номер naimi отдаёт ТОЛЬКО
//      авторизованным, поэтому нужен секрет NAIMI_SESSION (сессия аккаунта naimi).
//      Без него шаг телефонов просто пропускается, прогон успешный.
//   5) Пишет всё в Firebase RTDB под ключ titovstroy-masters в формате CRM.
//
// Боевые данные сервиса не трогает — только свой ключ.
//
// Конфиг — через переменные окружения (в workflow) + настройки из базы:
//   FIREBASE_SERVICE_ACCOUNT  (secret)  — JSON сервисного аккаунта Firebase (обязателен)
//   NAIMI_SESSION / NAIMI_USER (secret) — сессия naimi для телефонов (опц.)
//   FB_DB_URL / MASTERS_KEY             — база и ключ (есть безопасные значения по умолчанию)
//   EVENT_NAME                          — schedule | workflow_dispatch (ручной запуск парсит всегда)
//   CITIES / CATEGORY_IDS / PHONES_PER_RUN — переопределяют настройки из базы (для ручного теста)
// ─────────────────────────────────────────────────────────────────────────────

import admin from "firebase-admin";
import {
  applyPhoneAttempt,
  mergeFreshSnapshot,
  parseStoredJson,
  selectPhoneTargets,
} from "./parser-core.mjs";

const API  = "https://apipub.naimi.kz/app";
const SITE = "https://naimi.kz";
const IMG  = "https://upload.naimi.kz/image/";
const UA   = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ВАЖНО: пустую строку из GitHub (незаданная переменная приходит как "") считаем «нет значения».
// Иначе `"" ?? default` вернул бы "" → пустой URL базы / пустой ключ (запись в корень!).
const env = (k, d) => {
  const v = process.env[k];
  return (v === undefined || v === null || String(v).trim() === "") ? d : String(v).trim();
};
const num = (k, d) => { const n = Number(env(k, d)); return Number.isFinite(n) ? n : d; };

const FB_DB_URL   = env("FB_DB_URL", "https://titovstroy-da1cf-default-rtdb.firebaseio.com");
const MASTERS_KEY = env("MASTERS_KEY", "titovstroy-masters");
const CONFIG_KEY  = "titovstroy-masters-config";          // настройки из раздела «Мастера» в CRM
const EVENT       = env("EVENT_NAME", "");
const NAIMI_SESSION = env("NAIMI_SESSION", "");            // для телефонов (Api-Session)
const NAIMI_USER    = env("NAIMI_USER", "");              // для телефонов (Api-User), опц.

const LIMIT           = 30;                                // мастеров на страницу API
const MAX_PAGES       = num("MAX_PAGES", 20);              // предел пагинации на услугу
const PHONE_DELAY_MIN = num("PHONE_DELAY_MIN_MS", 4000);
const PHONE_DELAY_MAX = num("PHONE_DELAY_MAX_MS", 11000);
const PHONES_HARD_CAP = num("PHONES_HARD_CAP", 60);       // потолок номеров за прогон (защита от опечатки в настройках)
const PHONE_BUDGET_MS = num("PHONE_BUDGET_MS", 11 * 60e3); // лимит времени на телефоны (job timeout 20 мин)
const PHONE_SAVE_EVERY = 8;                                // промежуточное сохранение каждые N номеров

const fbKey      = k => String(k).replace(/[^a-zA-Z0-9_]/g, "_");
const sleep      = ms => new Promise(r => setTimeout(r, ms));
const rnd        = (a, b) => a + Math.random() * (b - a);
const clean      = s => String(s ?? "").replace(/\s+/g, " ").trim();
const onlyDigits = s => String(s ?? "").replace(/\D/g, "");

// ── naimi JSON-API ────────────────────────────────────────────────────────────
async function apiGet(path, citySlug) {
  const headers = { "Accept": "application/json", "User-Agent": UA, "App-Platform": "web" };
  if (citySlug) headers["App-City"] = citySlug;            // фильтр по городу — заголовком (слаг!)
  const r = await fetch(`${API}/${path}`, { headers });
  if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`);
  return r.json();
}

async function getServices(categoryId) {
  const j = await apiGet(`pub/catalogue/main/services?category_id=${categoryId}`);
  return (j?.content?.services || [])
    .map(s => ({ id: s.id, name: clean(s.name), slug: s.slug }))
    .filter(s => s.slug);
}

async function getCitiesCatalogue() {
  const j = await apiGet("pub/reference/city/list");
  const raw = j?.content?.cities || j?.content || j?.data || [];
  const list = Array.isArray(raw) ? raw : Object.values(raw || {}).flat();
  return list.map(city => ({
    id: String(city.slug || city.code || city.id || ""),
    slug: String(city.slug || city.code || city.id || ""),
    name: clean(city.name || city.title || city.label || city.slug || ""),
  })).filter(city => city.slug && city.name);
}

// Список мастеров по услуге в городе (с пагинацией по has_more).
async function getSpecialists(citySlug, serviceSlug) {
  const acc = [];
  let complete = true;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let j;
    try {
      j = await apiGet(
        `pub/catalogue/categories/work/specialists?slug=${encodeURIComponent(serviceSlug)}` +
        `&limit=${LIMIT}&page=${page}&review_filter=`, citySlug);
    } catch (e) { console.warn(`   ! ${serviceSlug} стр.${page}: ${e.message}`); complete = false; break; }
    const list = j?.content?.specialists || [];
    acc.push(...list);
    if (!j?.content?.has_more || !list.length) break;
    if (page === MAX_PAGES) complete = false;
    await sleep(rnd(250, 700));                            // лёгкая пауза между страницами
  }
  return { items: acc, complete };
}

function normalize(raw, ctx) {
  const id = raw.id ?? raw.specialist_id ?? null;
  const priceFrom = Array.isArray(raw.prices) && raw.prices.length
    ? (raw.prices[0]?.sum ?? raw.prices[0]?.price ?? null) : null;
  return {
    source: "naimi",
    extId: String(id ?? ""),
    specialistId: id,                                       // нужен для запроса телефона
    name: clean(raw.name || raw.full_name || raw.title),
    slug: String(id ?? ""),
    url: id ? `${SITE}/specialist/${id}` : "",
    city: ctx.city,
    category: ctx.category,
    services: [ctx.service].filter(Boolean),
    rating: Number(raw.star_rate ?? raw.rating ?? 0) || null,
    reviews: Number(raw.nb_reviews ?? raw.reviews_count ?? 0) || 0,
    verified: !!(raw.is_verified ?? raw.verified ?? false),
    about: clean(raw.about || ""),                          // «что делает» — описание мастера
    avatar: raw.avatar ? (String(raw.avatar).startsWith("http") ? raw.avatar : IMG + raw.avatar) : "",
    workId: raw.work_id ?? null,
    priceFrom,
    phone: "",
    phoneCheckedAt: null,
    collectedAt: new Date().toISOString(),
  };
}

// ── Телефоны (нужна авторизованная сессия naimi — иначе «Access denied») ───────
function sessionHeaders() {
  const h = { "Content-Type": "application/json", "Accept": "application/json",
              "User-Agent": UA, "Origin": SITE, "App-Platform": "web" };
  if (NAIMI_SESSION) h["Api-Session"] = NAIMI_SESSION;
  if (NAIMI_USER)    h["Api-User"] = NAIMI_USER;
  return h;
}

async function fillPhones(masters, phonesPerRun, citySlug, saveProgress) {
  if (!NAIMI_SESSION) {
    console.log("телефоны: пропуск — нет секрета NAIMI_SESSION (номер naimi отдаёт только авторизованным).");
    return { got: 0, done: 0, authError: "Не задан NAIMI_SESSION" };
  }
  // Жёсткий потолок за прогон — чтобы опечатка в настройках (напр. 10000) не устроила
  // многочасовой прогон с сотнями лишних «звонков» и таймаутом.
  const cap = Math.min(Math.max(0, Number(phonesPerRun) || 0), PHONES_HARD_CAP);
  // Сначала все ещё не проверенные, затем самые старые повторы. Так очередь
  // неизбежно доходит до каждого мастера, а не крутится вокруг верхушки рейтинга.
  const targets = selectPhoneTargets(
    masters.filter(m => m.active !== false && m.specialistId),
    { limit: cap },
  );
  if (!targets.length) { console.log("телефоны: докапывать нечего"); return { got: 0, done: 0, authError: "" }; }
  console.log(`телефоны: цель ${targets.length} (потолок ${PHONES_HARD_CAP}, бюджет ${Math.round(PHONE_BUDGET_MS / 60e3)} мин)`);

  const deadline = Date.now() + PHONE_BUDGET_MS;
  let got = 0, done = 0, firstRaw = true, authError = "";
  for (const m of targets) {
    if (Date.now() > deadline) {
      console.warn(`  ! лимит времени исчерпан — стоп на ${done}/${targets.length}, собранное сохранено`);
      break;
    }
    let result;
    try {
      const headers = sessionHeaders();
      const masterCity = m.city || citySlug;
      if (masterCity) headers["App-City"] = masterCity;
      const r = await fetch(`${API}/pub/call/specialist`, {
        method: "PUT", headers,
        body: JSON.stringify({ specialist_id: m.specialistId }),
      });
      const j = await r.json().catch(() => null);
      if (firstRaw) { console.log("  · пример ответа телефона:", JSON.stringify(j).slice(0, 200)); firstRaw = false; }
      if (r.status === 401 || r.status === 403 || (j && j.status === false && /access denied|unauthor|401|403/i.test(String(j.message || "")))) {
        authError = `Сессия Naimi не принята: ${j?.message || `HTTP ${r.status}`}`;
        result = { status: "retry", error: authError };
      } else if (!r.ok) {
        result = { status: "retry", error: `HTTP ${r.status}` };
      } else {
        const c = j?.content || j || {};
        const phone = onlyDigits(c.phone || c.number || c.contact || c.phone_number || "");
        result = phone ? { status: "found", phone } : { status: "unavailable" };
      }
    } catch (e) { result = { status: "retry", error: e.message || "network error" }; }
    Object.assign(m, applyPhoneAttempt(m, result));
    if (result.status === "found") got++;
    done++;
    // Сохраняем прогресс по ходу — чтобы таймаут/сбой не терял уже собранные номера,
    // и следующий прогон не звонил повторно тем, у кого номер уже есть.
    if (saveProgress && done % PHONE_SAVE_EVERY === 0) {
      try { await saveProgress(); console.log(`  … сохранено (номеров ${got}, обработано ${done}/${targets.length})`); }
      catch (e) { console.warn("  ! промежуточное сохранение:", e.message); }
    }
    if (authError) {
      console.warn(`  ! ${authError}. Обнови секрет NAIMI_SESSION. Партия остановлена.`);
      break;
    }
    await sleep(rnd(PHONE_DELAY_MIN, PHONE_DELAY_MAX));     // человеческая пауза
  }
  console.log(`телефоны: получено ${got} из ${done} обработанных (партия за прогон)`);
  return { got, done, authError };
}

// ── Firebase (узел = строка с JSON, как читает CRM) ───────────────────────────
function initFb() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa || !sa.trim()) throw new Error("Нет секрета FIREBASE_SERVICE_ACCOUNT");
  let cred;
  try { cred = JSON.parse(sa); }
  catch (e) { throw new Error("FIREBASE_SERVICE_ACCOUNT — не валидный JSON (вставь содержимое .json целиком): " + e.message); }
  admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: FB_DB_URL });
}
async function readJson(key, empty) {
  const snap = await admin.database().ref(fbKey(key)).get();
  return parseStoredJson(snap.val(), { key, empty });
}
async function writeJson(key, obj) {
  await admin.database().ref(fbKey(key)).set(JSON.stringify(obj));
}

// ── Решение «парсить сейчас или нет» по настройкам из базы ─────────────────────
const INTERVALS = { daily: 22 * 3600e3, twice: 11 * 3600e3, weekly: 6.5 * 24 * 3600e3 };
function decideRun(cfg) {
  const freq = ["off", "daily", "twice", "weekly"].includes(cfg.frequency) ? cfg.frequency : "daily";
  const runNow = Number(cfg.runNow) || 0;
  const runNowPending = runNow > (Number(cfg.lastRunNow) || 0);
  if (EVENT === "workflow_dispatch") return { run: true, reason: "ручной запуск с GitHub", runNow };
  if (runNowPending)                 return { run: true, reason: "кнопка «Обновить сейчас» в CRM", runNow };
  if (freq === "off")                return { run: false, reason: "обновление выключено в настройках", runNow };
  const iv = INTERVALS[freq] || INTERVALS.daily;
  const run = (Date.now() - (Number(cfg.lastRunAt) || 0)) >= iv;
  return { run, reason: run ? `по расписанию (${freq})` : `ещё рано (${freq}, ждём интервал)`, runNow };
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  initFb();

  // 1) настройки из базы + решение
  const cfg = await readJson(CONFIG_KEY, {});
  const decision = decideRun(cfg);
  console.log(`настройки: freq=${cfg.frequency || "—"}, lastRunAt=${cfg.lastRunAt || 0}, runNow=${decision.runNow}/${cfg.lastRunNow || 0}`);
  console.log(`решение: ${decision.run ? "ЗАПУСК" : "ПРОПУСК"} — ${decision.reason}`);
  if (!decision.run) { await admin.app().delete(); return; }

  // параметры обхода: env (ручной ввод) → настройки из базы → дефолт
  const cities = (env("CITIES", "") || String(cfg.cities || "") || "almaty")
    .split(",").map(s => s.trim()).filter(Boolean);
  const categoryIds = (env("CATEGORY_IDS", "") || String(cfg.categoryIds || "") || "47")
    .split(",").map(s => Number(s.trim())).filter(Boolean);
  const configuredPhones = Number(cfg.phonesPerRun);
  const phonesPerRun = num("PHONES_PER_RUN", Number.isFinite(configuredPhones) ? configuredPhones : 25);
  console.log(`naimi-parser · города=[${cities}] категории=[${categoryIds}] телефоны/прогон=${phonesPerRun}` +
              (NAIMI_SESSION ? " (сессия задана)" : " (без сессии — телефоны пропускаются)"));

  // 2) уже собранное → мержим (телефоны и история не теряются)
  const existingDoc = await readJson(MASTERS_KEY, { items: [] });
  if (!existingDoc || typeof existingDoc !== "object" || Array.isArray(existingDoc) || !Array.isArray(existingDoc.items)) {
    throw new Error(`${MASTERS_KEY}: ожидался объект с массивом items; запись остановлена`);
  }
  const existing = existingDoc.items;
  const freshById = new Map();
  console.log(`в базе уже: ${existing.length} мастеров (${existing.filter(m => m.phone).length} с телефоном)`);

  // 3) справочник услуг по категориям
  const services = [];
  let crawlComplete = true;
  const availableCities = await getCitiesCatalogue().catch(e => {
    console.warn("cities err", e.message);
    return Array.isArray(cfg.availableCities) ? cfg.availableCities : [];
  });
  for (const cid of categoryIds) {
    const s = await getServices(cid).catch(e => {
      crawlComplete = false;
      console.warn("services err", e.message);
      return [];
    });
    for (const x of s) services.push({ ...x, categoryName: `cat-${cid}` });
  }
  console.log(`услуг к обходу: ${services.length}`);

  // 4) сбор списков напрямую с API (город × услуга)
  for (const city of cities) {
    for (const svc of services) {
      const pageResult = await getSpecialists(city, svc.slug);
      const raws = pageResult.items;
      if (!pageResult.complete) crawlComplete = false;
      let added = 0;
      for (const raw of raws) {
        const m = normalize(raw, { city, category: svc.categoryName, service: svc.name });
        if (!m.name || !m.extId) continue;
        const key = `${m.source}:${m.extId}`;
        const prev = freshById.get(key);
        if (prev) {
          for (const s of m.services) if (!prev.services.includes(s)) prev.services.push(s);
          if (!prev.specialistId && m.specialistId) prev.specialistId = m.specialistId;
          // обновляем «живые» поля, телефон и историю не трогаем
          prev.rating = m.rating ?? prev.rating;
          prev.reviews = m.reviews ?? prev.reviews;
          if (m.about && !prev.about) prev.about = m.about;
          if (m.avatar && !prev.avatar) prev.avatar = m.avatar;
        } else { freshById.set(key, m); added++; }
      }
      console.log(`  · ${city} / ${svc.name}: +${added} новых (получено ${raws.length})`);
      await sleep(rnd(200, 500));
    }
  }
  const all = mergeFreshSnapshot(existing, [...freshById.values()], { complete: crawlComplete });
  console.log(`ИТОГО: активных ${all.filter(m => m.active !== false).length}, всего с историей ${all.length}`);

  const buildPayload = () => ({
    updatedAt: new Date().toISOString(), source: "naimi.kz",
    count: all.length,
    activeCount: all.filter(m => m.active !== false).length,
    withPhone: all.filter(m => m.phone).length,
    pendingPhone: all.filter(m => m.active !== false && !m.phone).length,
    crawlComplete,
    items: all,
  });

  // 5) СНАЧАЛА сохраняем список (чтобы возможный таймаут на телефонах не потерял данные)
  await writeJson(MASTERS_KEY, buildPayload());
  console.log(`✔ список сохранён: ${all.length} мастеров`);

  // 6) телефоны — с промежуточным сохранением и лимитом по времени (только если задана сессия naimi)
  let phoneSummary = { got: 0, done: 0, authError: "" };
  try { phoneSummary = await fillPhones(all, phonesPerRun, cities[0], () => writeJson(MASTERS_KEY, buildPayload())); }
  catch (e) { console.warn("этап телефонов:", e.message); phoneSummary.authError = e.message; }

  // 7) финальная запись + отметка в настройках (для расписания и кнопки «Обновить сейчас»)
  const payload = buildPayload();
  await writeJson(MASTERS_KEY, payload);
  console.log(`✔ записано ${payload.count} мастеров (с телефоном: ${payload.withPhone}) в ${fbKey(MASTERS_KEY)}`);

  const freshCfg = await readJson(CONFIG_KEY, {});
  freshCfg.lastRunAt = Date.now();
  if (decision.runNow) freshCfg.lastRunNow = decision.runNow;
  freshCfg.lastCount = all.length;
  freshCfg.lastWithPhone = payload.withPhone;
  freshCfg.lastActiveCount = payload.activeCount;
  freshCfg.lastPendingPhone = payload.pendingPhone;
  freshCfg.lastRunStatus = crawlComplete ? "ok" : "partial";
  freshCfg.lastPhoneError = phoneSummary.authError || "";
  if (availableCities.length) freshCfg.availableCities = availableCities;
  await writeJson(CONFIG_KEY, freshCfg);
  console.log(`настройки: lastRunAt обновлён, lastRunNow=${decision.runNow}`);

  await admin.app().delete();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
