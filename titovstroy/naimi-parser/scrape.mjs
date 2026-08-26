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
} from "./parsercore.mjs";

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
// У бесплатного аккаунта naimi суточный лимит на раскрытие номеров (в логах видно: ~6 за прогон,
// потом идёт стена «пусто»). Дальше долбить бессмысленно — только жжём 11 минут и плодим заявки.
// Столько «пусто» подряд → считаем лимит исчерпанным и останавливаем партию.
const PHONE_MISS_STREAK = num("PHONE_MISS_STREAK", 12);

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
  // Ничего не готово к запросу — это НЕ «номера кончились», а «ещё не отлежались»:
  // мастера без номера ждут повтора (retry) после прошлой попытки. Помечаем прогон idle,
  // чтобы он не засчитался в счётчик пустых и не выключил harvest раньше времени.
  if (!targets.length) {
    const waiting = masters.filter(m => m.active !== false && m.specialistId && !m.phone).length;
    console.log(`телефоны: сейчас нечего запрашивать — ${waiting} ждут повтора (retry ещё не истёк)`);
    return { got: 0, done: 0, authError: "", idle: true };
  }
  console.log(`телефоны: цель ${targets.length} (потолок ${PHONES_HARD_CAP}, бюджет ${Math.round(PHONE_BUDGET_MS / 60e3)} мин)`);

  const deadline = Date.now() + PHONE_BUDGET_MS;
  let got = 0, done = 0, firstRaw = true, authError = "", limitError = "", failDumps = 0, missStreak = 0;
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
      const msg = String(j?.message || j?.content?.message || "");
      if (r.status === 401 || r.status === 403 || (j && j.status === false && /access denied|unauthor|401|403/i.test(msg))) {
        authError = `Сессия Naimi не принята: ${j?.message || `HTTP ${r.status}`}`;
        result = { status: "retry", error: authError };
      } else if (j && j.status === false && /лимит|limit|исчерп|превыш|достиг|too many|quota|в день|сутк|day/i.test(msg)) {
        // Явное сообщение о суточном лимите: retry (короткий кулдаун), НЕ «нет номера» на 7 дней, и стоп.
        limitError = `Naimi суточный лимит: ${msg}`.slice(0, 200);
        result = { status: "retry", error: limitError };
      } else if (!r.ok) {
        result = { status: "retry", error: `HTTP ${r.status}` };
      } else {
        const c = j?.content || j || {};
        const phone = onlyDigits(c.phone || c.number || c.contact || c.phone_number || "");
        if (phone) {
          result = { status: "found", phone };
        } else {
          // На naimi у КАЖДОГО мастера есть номер (без него нет регистрации) и скрыть его нельзя.
          // Значит «пусто» — это НЕ «номера нет», а скрытый лимит/временный сбой. Помечаем retry
          // (кулдаун 6ч), НЕ unavailable (7 дней), иначе мастер надолго выпадает из очереди и база
          // «застревает» намного ниже 100%. Первые «пусто» печатаем — видеть реальный ответ naimi.
          result = { status: "retry", error: "пусто (вероятно скрытый лимит) — повтор" };
          if (failDumps < 3) { console.log("  · ответ без номера:", JSON.stringify(j).slice(0, 200)); failDumps++; }
        }
      }
    } catch (e) { result = { status: "retry", error: e.message || "network error" }; }
    Object.assign(m, applyPhoneAttempt(m, result));
    if (result.status === "found") { got++; missStreak = 0; } else missStreak++;
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
    if (limitError) {
      console.warn(`  ! ${limitError}. Суточный лимит naimi исчерпан — партия остановлена, добор завтра.`);
      break;
    }
    // Стена «пусто» подряд — почти наверняка исчерпан суточный лимит (наблюдали: ~6 номеров, дальше 0).
    // Стоп, чтобы не жечь бюджет и не плодить пустые заявки; необработанные мастера остаются в очереди.
    if (missStreak >= PHONE_MISS_STREAK) {
      limitError = `Похоже, суточный лимит naimi исчерпан (${missStreak} «пусто» подряд)`;
      console.warn(`  ! ${limitError} — партия остановлена на ${done}/${targets.length}, добор завтра.`);
      break;
    }
    await sleep(rnd(PHONE_DELAY_MIN, PHONE_DELAY_MAX));     // человеческая пауза
  }
  console.log(`телефоны: получено ${got} из ${done} обработанных (партия за прогон)`);
  return { got, done, authError: authError || limitError };
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
// HARVEST-режим найми. Лимит найми СКОЛЬЗЯЩИЙ (~5-6 раскрытий в ~час), а на naimi у КАЖДОГО
// мастера есть номер (без него нет регистрации, скрыть нельзя) → пока есть непокрытые (pending>0),
// это ВСЕГДА собираемая работа. Поэтому собираем каждые NAIMI_HARVEST_GAP_MS, пока не выберем всех.
// Дёргает найми тот же внешний OLX-крон (каждые ~30 мин), decideRun пропускает, пока не прошёл зазор.
// ВАЖНО (был баг): РАНЬШЕ harvest выключался после ОДНОГО прогона с 0 номеров (lastGotPhones===0) —
// а 0 легко ловится, если прогон стартовал в момент исчерпанного окна лимита. Из-за этого найми
// падал на расписание раз в 11ч и «застревал». ТЕПЕРЬ выключаем harvest только после
// NAIMI_ZERO_GIVEUP ПОДРЯД пустых прогонов (реальное исчерпание), а один-два 0 переживаем.
// Каждый номер найми = ЗАЯВКА от РЕАЛЬНОГО аккаунта, поэтому зазор «средний» (2ч). Настраивается env.
const NAIMI_HARVEST_GAP_MS = num("NAIMI_HARVEST_GAP_MS", 2 * 3600e3); // «средний» темп: раз в 2 часа
// ПОСЛЕ СУТОЧНОГО ЛИМИТА — ЖДЁМ ДОЛЬШЕ. Лимит naimi суточный: заход через два часа после того,
// как он сработал, соберёт РОВНО НОЛЬ номеров, а стоить будет полного чтения базы мастеров
// (у неё уже тысячи записей, и она растёт с каждым новым городом). Двенадцать таких пустых
// заходов в сутки — это мегабайты трафика Firebase впустую. Ждём до следующего дня.
const NAIMI_LIMIT_COOLDOWN_MS = num("NAIMI_LIMIT_COOLDOWN_MS", 10 * 3600e3);
const NAIMI_ZERO_GIVEUP = num("NAIMI_ZERO_GIVEUP", 8);                // столько ПОДРЯД пустых прогонов → стоп harvest
function decideRun(cfg) {
  const freq = ["off", "daily", "twice", "weekly"].includes(cfg.frequency) ? cfg.frequency : "daily";
  const runNow = Number(cfg.runNow) || 0;
  const runNowPending = runNow > (Number(cfg.lastRunNow) || 0);
  const forced = env("FORCE_NAIMI", "") === "1";      // явный форс (env/секрет воркфлоу) — для ручного теста
  // ВАЖНО: workflow_dispatch БОЛЬШЕ не форсит найми. Иначе частый внешний крон (он для OLX и
  // дёргает ВЕСЬ воркфлоу каждые ~30 мин) гонял бы найми десятки раз в день → бан реального аккаунта.
  // Найми идёт по своему зазору (harvest) или расписанию; форс — кнопкой «Обновить сейчас» или FORCE_NAIMI=1.
  if (forced)                        return { run: true, reason: "форс FORCE_NAIMI", runNow };
  if (runNowPending)                 return { run: true, reason: "кнопка «Обновить сейчас» в CRM", runNow };
  if (freq === "off")                return { run: false, reason: "обновление выключено в настройках", runNow };
  const sinceLast = Date.now() - (Number(cfg.lastRunAt) || 0);
  // HARVEST: пока есть непокрытые номера И harvest не «сдался» (мало пустых прогонов подряд) —
  // собираем каждые ~2ч. Один-два 0-прогона (окно лимита) НЕ выключают harvest, в отличие от старой
  // логики. Выключается только после NAIMI_ZERO_GIVEUP подряд пустых (реально всё выбрано/аккаунт лёг).
  const pending = Number(cfg.lastPendingPhone) || 0;
  const zeroStreak = Number(cfg.naimiZeroStreak) || 0;
  // Прошлый заход упёрся в суточный лимит naimi — ждём до следующего дня, а не два часа.
  const limitHit = /лимит|limit|исчерп|превыш|достиг|quota/i.test(String(cfg.lastPhoneError || ""));
  const harvestGap = limitHit ? NAIMI_LIMIT_COOLDOWN_MS : NAIMI_HARVEST_GAP_MS;
  if (pending > 0 && zeroStreak < NAIMI_ZERO_GIVEUP && sinceLast >= harvestGap) {
    return { run: true, reason: `сбор номеров (осталось ~${pending}, пустых подряд ${zeroStreak}), темп ${Math.round(harvestGap / 3600e3 * 10) / 10}ч${limitHit ? " (после суточного лимита)" : ""}`, runNow };
  }
  if (pending > 0 && limitHit && sinceLast < harvestGap) {
    return { run: false, reason: `суточный лимит naimi — ждём ${Math.round((harvestGap - sinceLast) / 3600e3 * 10) / 10}ч, чтобы не читать базу впустую`, runNow };
  }
  const iv = INTERVALS[freq] || INTERVALS.daily;
  const run = sinceLast >= iv;
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
  freshCfg.lastGotPhones = phoneSummary.got;            // сколько собрано за прогон (для логов/диагностики)
  // Счётчик ПУСТЫХ прогонов подряд: >0 собрали → сброс в 0; 0 собрали → +1. harvest выключается,
  // только когда счётчик дорастёт до NAIMI_ZERO_GIVEUP (реальное исчерпание), а не с первого нуля.
  // idle-прогон (никого не было готово к запросу — все ждут retry) НЕ трогает счётчик: иначе
  // harvest выключался бы просто потому, что заходили чаще, чем истекает retry, и номера
  // «замерзали» бы навсегда при непустой базе.
  if (!phoneSummary.idle) {
    freshCfg.naimiZeroStreak = phoneSummary.got > 0 ? 0 : (Number(freshCfg.naimiZeroStreak) || 0) + 1;
  }
  freshCfg.lastRunStatus = crawlComplete ? "ok" : "partial";
  freshCfg.lastPhoneError = phoneSummary.authError || "";
  if (availableCities.length) freshCfg.availableCities = availableCities;
  await writeJson(CONFIG_KEY, freshCfg);
  console.log(`настройки: lastRunAt обновлён, lastRunNow=${decision.runNow}`);

  await admin.app().delete();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
