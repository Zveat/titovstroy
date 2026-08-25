// Вход сотрудника — на сервере, а не в браузере.
//
// ЗАЧЕМ. Раньше приложение входило в Firebase АНОНИМНО (signInAnonymously), а логины
// и пароли лежали в базе под ключом titovstroy_users, который браузер читал сам.
// Для Firebase все посетители были одинаковыми анонимами, поэтому правила доступа
// не могли отличить прораба от постороннего: с ключом из кода сайта читались клиенты,
// договоры и финансы, и запись тоже была разрешена.
//
// ЗДЕСЬ. Пароль проверяется на сервере сервисным ключом, и в ответ выдаётся кастомный
// токен Firebase с ролью в claims. После этого:
//   • правилам есть на что опереться: auth.token.staff === true — это сотрудник;
//   • titovstroy_users браузеру больше не нужен вообще (список приходит в ответе);
//   • сброс пароля из админки работает как раньше — хэши остаются в той же базе.
//
// Зависимостей нет намеренно: кастомный токен Firebase и assertion для Google OAuth —
// это обычные JWT, подписанные RS256, а RS256 умеет встроенный crypto. Тянуть ради
// двух подписей firebase-admin со всем его деревом на serverless-функцию незачем.
const crypto = require("node:crypto");

const PROD_FIREBASE_DB_URL = "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const USERS_NODE = "titovstroy_users";
// Счётчик неудачных попыток. Тот, что в браузере (localStorage), защищает ровно до
// первого «Очистить данные сайта» — подбор пароля должен упираться в сервер.
const GUARD_NODE = "titovstroy_login_guard";
const ROLE_PERMS_NODE = "titovstroy_role_permissions";
const MAX_ATTEMPTS = 8;
const LOCK_MS = 10 * 60 * 1000;
const TOKEN_TTL_S = 3600;
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
const CUSTOM_TOKEN_AUD =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

const base64url = (input) => Buffer.from(input).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function signJwt(claims, privateKey) {
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(claims));
  const signature = crypto.createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${base64url(signature)}`;
}

// Ключи Firebase: всё кроме [a-zA-Z0-9_] превращается в «_» (та же санитизация, что в App.jsx).
const fbKey = (key) => String(key).replace(/[^a-zA-Z0-9_]/g, "_");

// Значение узла — строка JSON (новый формат) или вложенный объект (старый).
// ЧТО МОЖНО ПИСАТЬ — ВЫЧИСЛЯЕМ ЗДЕСЬ И КЛАДЁМ В ТОКЕН.
//
// Правила базы не умеют читать матрицу «Права ролей»: она лежит одной строкой JSON, а
// строку правила разобрать не могут. Если зашить в правила «только admin», они разойдутся
// с настройкой в админке: интерфейс кнопку покажет, а база запись отклонит — молча.
// Поэтому матрицу читает сервер входа (сервисным ключом) и кладёт в токен четыре флага.
// Правила смотрят на флаги, а не на роль, и всегда совпадают с тем, что настроено.
//
// Флаг ставится только при явном праве на РЕДАКТИРОВАНИЕ. Роль admin всегда получает все
// четыре: в приложении её права принудительно полные, чтобы систему нельзя было запереть.
// Матрица недоступна или роли в ней нет — падаем на «полные права только у admin»:
// для остальных это отказ, то есть безопасная сторона.
function writeScopeForRole(role, rawMatrix) {
  const isAdmin = String(role) === "admin";
  const base = { fin: isAdmin, pay: isAdmin, cat: isAdmin, usr: isAdmin };
  const matrix = parseNode(rawMatrix);
  const perms = matrix && typeof matrix === "object" && !Array.isArray(matrix) ? matrix[role] : null;
  if (!perms || typeof perms !== "object") return base;
  const has = (key) => {
    const v = perms[key];
    return v !== undefined && v !== null && v !== "none" && v !== false;
  };
  return {
    fin: isAdmin || perms.finance === "edit",
    pay: isAdmin || perms.payroll === "edit",
    cat: isAdmin || has("adminCatalog") || has("adminPrices"),
    usr: isAdmin || has("adminUsers") || has("adminRoles"),
  };
}

function parseNode(value) {
  if (value == null) return null;
  if (typeof value === "string") { try { return JSON.parse(value); } catch { return null; } }
  return value;
}

const sha256Hex = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

// btoa работает по latin1, а encodeURIComponent даёт чистый ASCII — Buffer совпадает с браузером.
const legacyHash = (text) => Buffer.from(encodeURIComponent(text), "latin1")
  .toString("base64").split("").reverse().join("");

const sameSecret = (a, b) => {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  // timingSafeEqual падает на разной длине, а сама длина хэша не секрет.
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

// Повторяет verifyPassword из App.jsx: новый формат sha256:соль:хэш плюс два старых,
// оставленных для входа по паролям, заведённым до перехода на соль.
function passwordMatches(password, stored) {
  if (!stored) return false;
  const value = String(stored);
  if (value.startsWith("sha256:")) {
    const parts = value.split(":");
    if (parts.length !== 3) return false;
    return sameSecret(sha256Hex(`${parts[1]}:${password}`), parts[2]);
  }
  return sameSecret(value, password) || sameSecret(value, legacyHash(password));
}

// В сессию и в токен пароль не попадает никогда.
function safeUser(user) {
  const { password, ...rest } = user || {};
  return rest;
}

function readServiceAccount(env) {
  const clientEmail = String(env.FIREBASE_SA_CLIENT_EMAIL || "").trim();
  // В переменных окружения перевод строки хранится как «\n» — иначе ключ не собрать в одну строку.
  const privateKey = String(env.FIREBASE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!clientEmail || !privateKey.includes("PRIVATE KEY")) return null;
  return { clientEmail, privateKey };
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function createLoginHandler(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const account = options.serviceAccount !== undefined ? options.serviceAccount : readServiceAccount(env);
  const databaseUrl = String(options.databaseUrl || env.VITE_FB_DATABASE_URL || PROD_FIREBASE_DB_URL).replace(/\/$/, "");
  const maxAttempts = options.maxAttempts || MAX_ATTEMPTS;
  const lockMs = options.lockMs || LOCK_MS;
  // Домены компании плюс всё, что явно разрешено переменной окружения (превью Vercel).
  const extraOrigins = new Set(String(env.LOGIN_ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean));
  const originAllowed = (origin) => {
    if (!origin) return false;
    if (extraOrigins.has(origin)) return true;
    let host = "";
    try { const url = new URL(origin); if (url.protocol !== "https:") return false; host = url.hostname; }
    catch { return false; }
    return host === "titovstroy.kz" || host.endsWith(".titovstroy.kz");
  };

  // Токен доступа к базе живёт час; функция между вызовами часто остаётся тёплой,
  // и незачем подписывать заново на каждый вход.
  let cachedToken = null;
  async function accessToken() {
    const seconds = Math.floor(now() / 1000);
    if (cachedToken && cachedToken.expiresAt > seconds + 60) return cachedToken.value;
    const assertion = signJwt({
      iss: account.clientEmail, scope: OAUTH_SCOPES,
      aud: "https://oauth2.googleapis.com/token", iat: seconds, exp: seconds + TOKEN_TTL_S,
    }, account.privateKey);
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion,
      }).toString(),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token) return null;
    cachedToken = { value: payload.access_token, expiresAt: seconds + (Number(payload.expires_in) || TOKEN_TTL_S) };
    return cachedToken.value;
  }

  const nodeUrl = (node, token) => `${databaseUrl}/${fbKey(node)}.json?access_token=${encodeURIComponent(token)}`;

  return async function loginHandler(req, res) {
    if (req.method !== "POST") return send(res, 405, { ok: false, code: "method_not_allowed" });
    if (!originAllowed(String(req.headers?.origin || ""))) return send(res, 403, { ok: false, code: "origin_not_allowed" });
    // Сервисный ключ не задан — вход через сервер просто не настроен. Ответ отличается от
    // «неверный пароль» намеренно: приложение по нему понимает, что нужно войти по-старому,
    // и никого не запирает снаружи, пока переменные окружения не проставлены.
    if (!account) return send(res, 503, { ok: false, code: "login_not_configured" });

    const login = String(req.body?.login || "").trim();
    const password = String(req.body?.password || "");
    if (!login || !password) return send(res, 400, { ok: false, code: "invalid_request" });

    const token = await accessToken();
    if (!token) return send(res, 503, { ok: false, code: "auth_unavailable" });

    const guardKey = fbKey(login.toLowerCase());
    const guardResponse = await fetchImpl(nodeUrl(`${GUARD_NODE}/${guardKey}`, token));
    const guard = guardResponse.ok ? (await guardResponse.json().catch(() => null)) : null;
    const lockedUntil = Number(guard?.lockedUntil) || 0;
    if (lockedUntil > now()) {
      return send(res, 429, { ok: false, code: "too_many_attempts", retryAfterMs: lockedUntil - now() });
    }

    const usersResponse = await fetchImpl(nodeUrl(USERS_NODE, token));
    if (!usersResponse.ok) return send(res, 503, { ok: false, code: "users_unavailable" });
    const users = parseNode(await usersResponse.json().catch(() => null));
    if (!Array.isArray(users) || !users.length) return send(res, 503, { ok: false, code: "users_unavailable" });

    const candidate = users.find((item) => String(item?.login || "").toLowerCase() === login.toLowerCase());
    const ok = candidate ? passwordMatches(password, candidate.password) : false;

    // Счётчик пишем ПОСЛЕ проверки и не ждём ответа базы: она уже подтвердила пароль,
    // и упавшая запись счётчика не повод не пускать человека на объекте.
    const saveGuard = (value) => fetchImpl(nodeUrl(`${GUARD_NODE}/${guardKey}`, token), {
      method: value === null ? "DELETE" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: value === null ? undefined : JSON.stringify(value),
    }).catch(() => null);

    if (!ok) {
      const attempts = (Number(guard?.attempts) || 0) + 1;
      await saveGuard({
        attempts, lastAt: now(),
        lockedUntil: attempts >= maxAttempts ? now() + lockMs : 0,
      });
      // Один и тот же ответ на «нет такого логина» и «пароль не тот»: иначе endpoint
      // отвечает на вопрос, какие логины существуют.
      return send(res, 401, { ok: false, code: "invalid_credentials" });
    }

    if (guard) saveGuard(null);

    const seconds = Math.floor(now() / 1000);
    const role = String(candidate.role || "");
    // Матрицу прав читаем ТУТ ЖЕ, тем же сервисным токеном. Ошибка чтения не запирает вход:
    // writeScopeForRole без матрицы даёт полные права только админу, остальным — отказ.
    let rawPerms = null;
    try {
      const permsResponse = await fetchImpl(nodeUrl(ROLE_PERMS_NODE, token));
      if (permsResponse.ok) rawPerms = await permsResponse.json().catch(() => null);
    } catch { rawPerms = null; }
    const scope = writeScopeForRole(role, rawPerms);
    const customToken = signJwt({
      iss: account.clientEmail, sub: account.clientEmail, aud: CUSTOM_TOKEN_AUD,
      uid: String(candidate.id || candidate.login), iat: seconds, exp: seconds + TOKEN_TTL_S,
      // staff — то, на что смотрят правила базы: «это сотрудник, а не посетитель сайта».
      // role оставляем для правил, которые могут отличать роли (например, админку).
      // fin/pay/cat/usr — что этой роли РАЗРЕШЕНО ПИСАТЬ по матрице «Права ролей»:
      // деньги, зарплаты, каталог с прайсом, пользователи с правами. Правила смотрят на
      // них, поэтому настройка в админке и правила базы не могут разойтись.
      claims: { staff: true, role, login: String(candidate.login || ""), ...scope },
    }, account.privateKey);

    return send(res, 200, { ok: true, token: customToken, user: safeUser(candidate) });
  };
}

const handler = createLoginHandler();
module.exports = handler;
module.exports.createLoginHandler = createLoginHandler;
module.exports.passwordMatches = passwordMatches;
module.exports.writeScopeForRole = writeScopeForRole;
module.exports.safeUser = safeUser;
module.exports.parseNode = parseNode;
