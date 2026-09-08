// Доступ к базе сервисным ключом из serverless-функции — по REST, без зависимостей.
//
// Ровно тот же приём, что в api/login.js: сервисный ключ Google — это обычная пара
// «почта + RSA-ключ», из неё подписывается JWT, он меняется на access_token, и
// дальше база отвечает по HTTPS. Тянуть ради этого firebase-admin со всем его
// деревом на функцию, которая живёт доли секунды, незачем.
//
// Почему отдельный файл, а не общий код с login.js: там эта логика заперта внутри
// замыкания и наружу не выведена, а login.js — вход ВСЕХ сотрудников. Ради снятия
// сорока строк дублирования трогать его не стоит; цена ошибки там несопоставима.
import crypto from "node:crypto";

const PROD_DB_URL = "https://titovstroy-da1cf-default-rtdb.firebaseio.com";
const SCOPES = "https://www.googleapis.com/auth/firebase.database "
  + "https://www.googleapis.com/auth/userinfo.email";

const base64url = (input) => Buffer.from(input).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function signJwt(claims, privateKey) {
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(claims));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${base64url(sig)}`;
}

// Ключи Firebase: всё кроме [a-zA-Z0-9_] превращается в «_» — та же санитизация,
// что в App.jsx и в службе. Путь через «/» в ключе НЕ работает.
export const fbKey = (key) => String(key).replace(/[^a-zA-Z0-9_]/g, "_");

export function readServiceAccount(env = process.env) {
  const clientEmail = String(env.FIREBASE_SA_CLIENT_EMAIL || "").trim();
  // В переменных окружения перевод строки хранится как «\n».
  const privateKey = String(env.FIREBASE_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!clientEmail || !privateKey.includes("PRIVATE KEY")) return null;
  return { clientEmail, privateKey };
}

export function createDb({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const account = readServiceAccount(env);
  const dbUrl = String(env.VITE_FB_DATABASE_URL || PROD_DB_URL).replace(/\/$/, "");
  // Функция между вызовами часто остаётся тёплой, а токен живёт час — незачем
  // подписывать заново на каждое сообщение бота.
  let cached = null;

  async function accessToken() {
    if (!account) return null;
    const sec = Math.floor(now() / 1000);
    if (cached && cached.expiresAt > sec + 60) return cached.value;
    const assertion = signJwt({
      iss: account.clientEmail, scope: SCOPES,
      aud: "https://oauth2.googleapis.com/token", iat: sec, exp: sec + 3600,
    }, account.privateKey);
    const r = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion,
      }).toString(),
    });
    const p = await r.json().catch(() => null);
    if (!r.ok || !p?.access_token) return null;
    cached = { value: p.access_token, expiresAt: sec + (Number(p.expires_in) || 3600) };
    return cached.value;
  }

  const nodeUrl = (key, token) =>
    `${dbUrl}/${fbKey(key)}.json?access_token=${encodeURIComponent(token)}`;

  // Значение узла — строка JSON (текущий формат) или уже объект (старый).
  const parse = (v) => {
    if (v == null) return null;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
    return v;
  };

  return {
    configured: () => Boolean(account),
    async read(key, fallback = null) {
      const token = await accessToken();
      if (!token) throw new Error("Сервисный ключ не настроен");
      const r = await fetchImpl(nodeUrl(key, token));
      if (!r.ok) throw new Error(`Чтение ${key}: HTTP ${r.status}`);
      const v = parse(await r.json().catch(() => null));
      return v === null ? fallback : v;
    },
    // Пишем СТРОКОЙ JSON — как это делает приложение и служба. Положить сюда
    // объект значило бы завести второй формат того же узла.
    async write(key, value) {
      const token = await accessToken();
      if (!token) throw new Error("Сервисный ключ не настроен");
      const r = await fetchImpl(nodeUrl(key, token), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(JSON.stringify(value)),
      });
      if (!r.ok) throw new Error(`Запись ${key}: HTTP ${r.status}`);
      return true;
    },
  };
}
