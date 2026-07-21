// ─────────────────────────────────────────────────────────────────────────────
// check.mjs — читает настройки парсера из базы (ключ titovstroy-masters-config,
// который редактирует раздел «Мастера» в CRM) и решает: запускать сейчас или нет,
// с какими параметрами. Выводит результат в GITHUB_OUTPUT — тяжёлые шаги workflow
// (браузер + парсинг) выполняются только если should_run=true. Пустой прогон стоит
// ~минуту (не жжём Actions-минуты).
//
// Управление из сервиса, без токенов:
//   frequency: off | daily | twice | weekly   — как часто реально парсить
//   runNow (timestamp)                          — «Обновить сейчас» из CRM
//   cities / categoryIds / phonesPerRun         — параметры обхода
//   lastRunAt / lastRunNow                      — служебные (пишет scrape.mjs)
// ─────────────────────────────────────────────────────────────────────────────
import admin from "firebase-admin";
import fs from "fs";

const DB = process.env.FB_DB_URL || "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const CONFIG_KEY = "titovstroy_masters_config"; // санитизированный titovstroy-masters-config
const EVENT = process.env.EVENT_NAME || "";     // schedule | workflow_dispatch
const INTERVALS = { daily: 22 * 3600e3, twice: 11 * 3600e3, weekly: 6.5 * 24 * 3600e3 };

function out(obj) {
  const s = Object.entries(obj).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, s);
  console.log(s.trim());
}

(async () => {
  const defaults = { should_run: "true", cities: "almaty", category_ids: "47", phones_per_run: "25", run_now: "0" };
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) { console.log("Нет секрета FIREBASE_SERVICE_ACCOUNT — пропуск."); out({ ...defaults, should_run: "false" }); return; }

  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), databaseURL: DB });
  let cfg = {};
  try {
    const snap = await admin.database().ref(CONFIG_KEY).get();
    const v = snap.val();
    cfg = typeof v === "string" ? JSON.parse(v) : (v || {});
  } catch (e) { console.warn("Не прочитал настройки:", e.message); }

  const now = Date.now();
  const freq = ["off", "daily", "twice", "weekly"].includes(cfg.frequency) ? cfg.frequency : "daily";
  const runNow = Number(cfg.runNow) || 0;
  const runNowPending = runNow > (Number(cfg.lastRunNow) || 0);

  let run = false, reason = "";
  if (EVENT === "workflow_dispatch") { run = true; reason = "ручной запуск с GitHub"; }
  else if (runNowPending) { run = true; reason = "кнопка «Обновить сейчас» в CRM"; }
  else if (freq === "off") { run = false; reason = "обновление выключено в настройках"; }
  else {
    const iv = INTERVALS[freq] || INTERVALS.daily;
    run = (now - (Number(cfg.lastRunAt) || 0)) >= iv;
    reason = run ? `по расписанию (${freq})` : `ещё рано (${freq}, ждём интервал)`;
  }

  const cities = String(cfg.cities || process.env.CITIES || "almaty").trim() || "almaty";
  const categoryIds = String(cfg.categoryIds || process.env.CATEGORY_IDS || "47").trim() || "47";
  const phones = String(Number(cfg.phonesPerRun) || process.env.PHONES_PER_RUN || 25);

  console.log(`Настройки: freq=${freq}, cities=${cities}, cats=${categoryIds}, phones=${phones}, lastRunAt=${cfg.lastRunAt || 0}, runNow=${runNow}/${cfg.lastRunNow || 0}`);
  console.log(`Решение: ${run ? "ЗАПУСК" : "ПРОПУСК"} — ${reason}`);
  out({ should_run: run ? "true" : "false", cities, category_ids: categoryIds, phones_per_run: phones, run_now: String(runNow) });
  await admin.app().delete();
})().catch(e => { console.error("check.mjs error:", e); out({ should_run: "false", cities: "almaty", category_ids: "47", phones_per_run: "25", run_now: "0" }); process.exit(0); });
