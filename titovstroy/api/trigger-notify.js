// «ОТПРАВИТЬ СЕЙЧАС» ИЗ АДМИНКИ — ЗАПУСК РАССЫЛКИ УВЕДОМЛЕНИЙ.
//
// Зачем отдельная точка, а не прямой вызов GitHub из браузера: токен GitHub в бандл
// класть нельзя, его сразу увидит кто угодно. Поэтому браузер приходит сюда со своим
// токеном Firebase, а токеном GitHub распоряжается только сервер.
//
// ПРОВЕРКИ ИДУТ ЛЕСЕНКОЙ И КАЖДАЯ ЗАКРЫВАЕТ СВОЁ:
//   1. origin из белого списка — чужой сайт не дёрнет запуск из браузера сотрудника;
//   2. токен Firebase живой (проверяем у Google, а не верим строке);
//   3. заявка УЖЕ ЛЕЖИТ В БАЗЕ: админка сначала пишет sendNow={at,key} в настройки
//      уведомлений, куда пускают только администратора, и лишь потом зовёт сюда.
//      Сама по себе эта точка ничего запустить не может — она только подтверждает
//      уже записанное намерение. Это тот же приём, что и у запуска парсера.
//   4. заявка свежая и ещё не выполненная (сверяем с отметкой в состоянии рассылки).
//
// Проверка подписи и порядок шагов повторяют api/trigger-parser.js. Держать их одним
// общим файлом не стал намеренно: это два разных запуска с разными условиями, а
// править работающий вход в парсер ради переиспользования тридцати строк — лишний
// риск на боевом сервисе. Меняешь проверки здесь — посмотри и туда.
const PROD_FIREBASE_API_KEY = "AIzaSyCPawCUYGY20SB5cLLszjoNzK5ytew9tCs";
const PROD_FIREBASE_DB_URL = "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const DEFAULT_ORIGINS = ["https://www.titovstroy.kz", "https://titovstroy.kz", "https://erp.titovstroy.kz"];
const REPOSITORY = "Zveat/titovstroy";
const WORKFLOW = "telegramnotify.yml";
const SETTINGS_KEY = "titovstroy_tg_settings";
const STATE_KEY = "titovstroy_tg_state";
// Сколько заявка считается живой. Дольше получаса — это уже не «нажал и жду»,
// а забытая отметка, по которой сообщение придёт неожиданно.
const MAX_AGE_MS = 30 * 60 * 1000;

function parseStored(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function createNotifyTriggerHandler(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const githubToken = options.githubToken !== undefined ? options.githubToken : process.env.GITHUB_PARSER_TOKEN;
  const firebaseApiKey = options.firebaseApiKey || process.env.VITE_FB_API_KEY || PROD_FIREBASE_API_KEY;
  const databaseUrl = String(options.databaseUrl || process.env.VITE_FB_DATABASE_URL || PROD_FIREBASE_DB_URL).replace(/\/$/, "");
  const repository = options.repository || REPOSITORY;
  const workflow = options.workflow || WORKFLOW;
  const now = options.now || Date.now;
  const allowedOrigins = new Set(options.allowedOrigins || [
    ...DEFAULT_ORIGINS,
    ...String(process.env.PARSER_ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean),
  ]);

  return async function notifyTriggerHandler(req, res) {
    if (req.method !== "POST") return send(res, 405, { ok: false, code: "method_not_allowed" });
    const origin = String(req.headers?.origin || "");
    if (!allowedOrigins.has(origin)) return send(res, 403, { ok: false, code: "origin_not_allowed" });
    if (!githubToken) return send(res, 503, { ok: false, code: "trigger_not_configured" });

    const authHeader = String(req.headers?.authorization || "");
    const firebaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!firebaseToken) return send(res, 401, { ok: false, code: "firebase_auth_required" });

    const at = Number(req.body?.at);
    const currentTime = Number(now());
    if (!Number.isFinite(at) || at <= 0 || at > currentTime + 5 * 60_000 || currentTime - at > MAX_AGE_MS) {
      return send(res, 400, { ok: false, code: "invalid_request" });
    }

    const identityResponse = await fetchImpl(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: firebaseToken }),
      },
    );
    const identity = await readJson(identityResponse);
    if (!identityResponse.ok || !Array.isArray(identity?.users) || !identity.users.length) {
      return send(res, 401, { ok: false, code: "invalid_firebase_auth" });
    }

    // Заявка должна уже лежать в базе — иначе эта точка была бы кнопкой «запусти
    // рассылку» для любого, кто просто вошёл в сервис.
    const settingsResponse = await fetchImpl(
      `${databaseUrl}/${SETTINGS_KEY}.json?auth=${encodeURIComponent(firebaseToken)}`,
      { method: "GET", headers: { "Cache-Control": "no-store" } },
    );
    const settings = settingsResponse.ok ? parseStored(await readJson(settingsResponse)) : null;
    if (!settings) return send(res, 503, { ok: false, code: "firebase_unavailable" });
    const ask = parseStored(settings.sendNow) || {};
    if (Number(ask.at) !== at) return send(res, 409, { ok: false, code: "request_not_pending" });

    // Уже выполненную заявку не перезапускаем: иначе двойное нажатие давало бы два
    // одинаковых сообщения. Состояние рассылки браузеру читать нельзя (правила),
    // поэтому проверку делает сервер — он ходит с тем же токеном и получит отказ,
    // а отказ здесь считаем «не знаем» и пропускаем дальше: последнее слово всё
    // равно за самим прогоном, он сверяет ту же отметку перед отправкой.
    const stateResponse = await fetchImpl(
      `${databaseUrl}/${STATE_KEY}.json?auth=${encodeURIComponent(firebaseToken)}`,
      { method: "GET", headers: { "Cache-Control": "no-store" } },
    );
    if (stateResponse.ok) {
      const state = parseStored(await readJson(stateResponse));
      if (state && Number(state.lastSendNow) >= at) {
        return send(res, 409, { ok: false, code: "already_sent" });
      }
    }

    const githubHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "titovstroy-notify-trigger",
    };
    const dispatchResponse = await fetchImpl(
      `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: { ...githubHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    if (!dispatchResponse.ok) {
      return send(res, 502, { ok: false, code: "github_dispatch_failed", status: dispatchResponse.status });
    }
    return send(res, 202, { ok: true, dispatched: true });
  };
}

const handler = createNotifyTriggerHandler();
module.exports = handler;
module.exports.createNotifyTriggerHandler = createNotifyTriggerHandler;
