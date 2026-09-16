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

    // ОДИН ПРОГОН ЗА РАЗ. Уведомления теперь отправляются в момент события, а
    // события идут пачками: перевели четыре объекта — четыре запроса почти
    // одновременно. Serverless-функции выполняются ПАРАЛЛЕЛЬНО, поэтому без
    // замка два прогона прочитали бы журнал до того, как первый отметит
    // отправленное, и одно событие ушло бы дважды. Раньше от этого спасала
    // очередь GitHub Actions; теперь её нет.
    //
    // Замок ставим честным CAS: база отдаёт ETag текущего значения, и запись
    // принимается, только если значение с тех пор не менялось (if-match).
    // Проиграл гонку — получил 412 и просто не запускаешься. Никаких «прочитал,
    // подумал, записал», на которых замки и ломаются.
    //
    // Держится замок недолго: прогон живёт секунды, а зависший не должен
    // заблокировать рассылку надолго.
    async claimRun(key, { ttlMs = 60_000, now: nowFn = now } = {}) {
      const token = await accessToken();
      if (!token) throw new Error("Сервисный ключ не настроен");
      const url = nodeUrl(key, token);
      const r = await fetchImpl(url, { headers: { "X-Firebase-ETag": "true" } });
      if (!r.ok) throw new Error(`Чтение ${key}: HTTP ${r.status}`);
      const etag = r.headers?.get?.("ETag") || "";
      const state = parse(await r.json().catch(() => null)) || {};
      const at = Number(nowFn());
      if (at - (Number(state.runningAt) || 0) < ttlMs) return { ok: false, busy: true };
      const put = await fetchImpl(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(etag ? { "if-match": etag } : {}) },
        body: JSON.stringify(JSON.stringify({ ...state, runningAt: at })),
      });
      if (put.status === 412) return { ok: false, busy: true };   // замок взял кто-то другой
      if (!put.ok) throw new Error(`Замок ${key}: HTTP ${put.status}`);
      return { ok: true, state: { ...state, runningAt: at } };
    },
  };
}
