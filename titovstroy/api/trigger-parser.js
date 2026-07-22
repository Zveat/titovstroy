const PROD_FIREBASE_API_KEY = "AIzaSyCPawCUYGY20SB5cLLszjoNzK5ytew9tCs";
const PROD_FIREBASE_DB_URL = "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const DEFAULT_ORIGINS = ["https://www.titovstroy.kz", "https://titovstroy.kz"];
const REPOSITORY = "Zveat/titovstroy";
const WORKFLOW = "naimi-parser.yml";
const CONFIG_KEYS = {
  naimi: "titovstroy_masters_config",
  olx: "titovstroy_masters_olx_config",
};

function parseStoredConfig(value) {
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

function createParserTriggerHandler(options = {}) {
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

  return async function parserTriggerHandler(req, res) {
    if (req.method !== "POST") return send(res, 405, { ok: false, code: "method_not_allowed" });
    const origin = String(req.headers?.origin || "");
    if (!allowedOrigins.has(origin)) return send(res, 403, { ok: false, code: "origin_not_allowed" });
    if (!githubToken) return send(res, 503, { ok: false, code: "trigger_not_configured" });

    const authHeader = String(req.headers?.authorization || "");
    const firebaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!firebaseToken) return send(res, 401, { ok: false, code: "firebase_auth_required" });

    const source = String(req.body?.source || "");
    const runNow = Number(req.body?.runNow);
    const currentTime = Number(now());
    if (!CONFIG_KEYS[source] || !Number.isFinite(runNow) || runNow <= 0 || runNow > currentTime + 5 * 60_000 || currentTime - runNow > 24 * 60 * 60_000) {
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

    const configResponse = await fetchImpl(
      `${databaseUrl}/${CONFIG_KEYS[source]}.json?auth=${encodeURIComponent(firebaseToken)}`,
      { method: "GET", headers: { "Cache-Control": "no-store" } },
    );
    const storedValue = await readJson(configResponse);
    const config = configResponse.ok ? parseStoredConfig(storedValue) : null;
    if (!config) return send(res, 503, { ok: false, code: "firebase_unavailable" });
    if (Number(config.runNow) !== runNow || runNow <= (Number(config.lastRunNow) || 0)) {
      return send(res, 409, { ok: false, code: "request_not_pending" });
    }

    const githubHeaders = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "titovstroy-parser-trigger",
    };
    const runsResponse = await fetchImpl(
      `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=10`,
      { method: "GET", headers: githubHeaders },
    );
    if (runsResponse.ok) {
      const runsPayload = await readJson(runsResponse);
      const matchingRun = (Array.isArray(runsPayload?.workflow_runs) ? runsPayload.workflow_runs : []).find(run => {
        const createdAt = Date.parse(run?.created_at || "");
        const successful = run?.status === "queued" || run?.status === "in_progress" || run?.conclusion === "success";
        return successful && Number.isFinite(createdAt) && createdAt >= runNow - 2_000;
      });
      if (matchingRun) {
        return send(res, 202, { ok: true, alreadyRunning: true, runId: matchingRun.id || null });
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

const handler = createParserTriggerHandler();
module.exports = handler;
module.exports.createParserTriggerHandler = createParserTriggerHandler;
module.exports.parseStoredConfig = parseStoredConfig;
