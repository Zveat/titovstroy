// ЗАПУСК РАССЫЛКИ УВЕДОМЛЕНИЙ ИЗ БРАУЗЕРА. Два повода, одна дверь:
//   • kind:"sendNow" — администратор нажал «Отправить сейчас» в Админке;
//   • kind:"event"   — в журнале появилось событие, и ждать расписания незачем.
//
// Зачем отдельная точка, а не прямой вызов GitHub из браузера: токен GitHub в бандл
// класть нельзя, его сразу увидит кто угодно. Поэтому браузер приходит сюда со своим
// токеном Firebase, а токеном GitHub распоряжается только сервер.
//
// ПРОВЕРКИ ИДУТ ЛЕСЕНКОЙ И КАЖДАЯ ЗАКРЫВАЕТ СВОЁ:
//   1. origin из белого списка — чужой сайт не дёрнет запуск из браузера сотрудника;
//   2. токен Firebase живой (проверяем у Google, а не верим строке);
//   3. ПОВОД УЖЕ ЛЕЖИТ В БАЗЕ. Сама по себе эта точка ничего запустить не может —
//      она только подтверждает то, что записано до неё:
//        sendNow → админка сначала пишет sendNow={at,key} в настройки уведомлений,
//                  куда правила пускают только администратора;
//        event   → в помесячном журнале есть запись ровно с этой отметкой времени.
//      Разные поводы здесь не случайны: настройки писать может ТОЛЬКО администратор
//      (правило auth.token.usr), а статусы объектов меняют продавцы. Требуй мы от
//      них отметку в настройках — быстрые уведомления работали бы у одного человека
//      в компании. Журнал же пишет каждый, кто вообще что-то меняет, и подделать в
//      нём чужое событие не проще, чем сделать настоящее: запись и есть действие.
//   4. повод свежий и ещё не выполненный (sendNow сверяем с отметкой в состоянии
//      рассылки; для события — со свежестью записи и с уже идущими прогонами).
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
// Событию срок короче: приложение просит запуск через 20 секунд после записи, и
// всё, что старше десяти минут, — это не «только что случилось».
const EVENT_MAX_AGE_MS = 10 * 60 * 1000;
// Запас на дорогу записи до базы. Прогон, начавшийся позже этого момента, наше
// событие в журнале уже увидит — второй запуск ради него не нужен.
const RUN_SEES_ENTRY_MS = 15 * 1000;

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

// Помесячный ключ журнала. Приложение считает месяц ПО ЧАСАМ БРАУЗЕРА (Астана,
// UTC+5), а Vercel живёт в UTC — пять часов в конце каждого месяца эти два ответа
// расходятся, и запись, лежащая в октябре, искалась бы в сентябре. Поэтому берём
// все правдоподобные месяцы и смотрим по очереди; обычно он ровно один.
function auditMonthKeys(ts) {
  const ym = (shiftMs) => {
    const d = new Date(Number(ts) + shiftMs);
    return `titovstroy_audit_${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return [...new Set([ym(0), ym(5 * 3600e3), ym(-5 * 3600e3)])];
}

// Журнал — МАССИВ, а parseStored массивы отбрасывает намеренно (он для настроек,
// где массив значил бы испорченное значение). Поэтому для журнала свой разбор:
// общий на двоих он молча возвращал бы null, и событие «не находилось» бы никогда.
function parseStoredList(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Есть ли в журнале запись ровно с этой отметкой времени. Отметка уникальна с
// точностью до миллисекунды и ставится тем же кодом, что пишет запись, — угадать
// её со стороны нельзя, а совпадение означает «действие правда было».
function hasEntryAt(list, ts) {
  return Array.isArray(list) && list.some(e => Number(e?.ts) === Number(ts));
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

    const kind = String(req.body?.kind || "sendNow");
    if (kind !== "sendNow" && kind !== "event") {
      return send(res, 400, { ok: false, code: "invalid_request" });
    }
    const at = Number(req.body?.at);
    const currentTime = Number(now());
    const maxAge = kind === "event" ? EVENT_MAX_AGE_MS : MAX_AGE_MS;
    if (!Number.isFinite(at) || at <= 0 || at > currentTime + 5 * 60_000 || currentTime - at > maxAge) {
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

    // Повод должен уже лежать в базе — иначе эта точка была бы кнопкой «запусти
    // рассылку» для любого, кто просто вошёл в сервис.
    const settingsResponse = await fetchImpl(
      `${databaseUrl}/${SETTINGS_KEY}.json?auth=${encodeURIComponent(firebaseToken)}`,
      { method: "GET", headers: { "Cache-Control": "no-store" } },
    );
    const settings = settingsResponse.ok ? parseStored(await readJson(settingsResponse)) : null;
    if (!settings) return send(res, 503, { ok: false, code: "firebase_unavailable" });

    const githubHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "titovstroy-notify-trigger",
    };

    if (kind === "event") {
      // Рассылка выключена — будить нечего, и это не ошибка вызывающего.
      if (!settings.on) return send(res, 200, { ok: true, skipped: "notify_off" });

      // Событие подтверждаем самим журналом: запись с такой отметкой должна там
      // быть. Журнал читаем токеном САМОГО сотрудника, а не служебным ключом, —
      // значит запросом сюда нельзя увидеть больше, чем человек и так видит в
      // разделе «Журнал».
      let found = false;
      for (const key of auditMonthKeys(at)) {
        const monthResponse = await fetchImpl(
          `${databaseUrl}/${key}.json?auth=${encodeURIComponent(firebaseToken)}`,
          { method: "GET", headers: { "Cache-Control": "no-store" } },
        );
        if (!monthResponse.ok) continue;
        if (hasEntryAt(parseStoredList(await readJson(monthResponse)), at)) { found = true; break; }
      }
      if (!found) return send(res, 409, { ok: false, code: "event_not_found" });

      // Прогон уже в очереди — он прочитает журнал после нас и заберёт событие
      // сам. Второй запуск дал бы лишний прогон и ничего нового. Прогон, который
      // ИДЁТ, засчитываем только если он начался заметно позже записи: начатый
      // раньше мог прочитать журнал до неё.
      const runsResponse = await fetchImpl(
        `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?per_page=10`,
        { method: "GET", headers: githubHeaders },
      );
      if (runsResponse.ok) {
        const runsPayload = await readJson(runsResponse);
        const covering = (Array.isArray(runsPayload?.workflow_runs) ? runsPayload.workflow_runs : []).find(run => {
          if (run?.status === "queued") return true;
          const createdAt = Date.parse(run?.created_at || "");
          return run?.status === "in_progress" && Number.isFinite(createdAt) && createdAt >= at + RUN_SEES_ENTRY_MS;
        });
        if (covering) return send(res, 202, { ok: true, coalesced: true, runId: covering.id || null });
      }
    } else {
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
    }

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
module.exports.auditMonthKeys = auditMonthKeys;
module.exports.hasEntryAt = hasEntryAt;
