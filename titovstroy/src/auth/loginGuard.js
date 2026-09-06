// Пароли и защита от подбора при входе. Перенос из App.jsx без изменения логики.
import { LOGIN_ATTEMPTS_KEY } from "../storageKeys.js";

// Старый "хэш" — на деле обратимая обфускация (base64 + реверс), не защищает пароль
// при доступе к базе. Оставлен только для проверки паролей, созданных до перехода
// на sha256Hash ниже (обратная совместимость при входе).
export const simpleHash = (s) => btoa(encodeURIComponent(s)).split("").reverse().join("");

// ── Пароли: SHA-256 + случайная соль на каждого пользователя ──
// Формат хранения: "sha256:<соль>:<hex-хэш>". Реальная (необратимая) защита — доступ
// к базе больше не даёт пароль напрямую, нужен перебор. Соль своя у каждого пароля,
// чтобы у двух пользователей с одинаковым паролем хэши не совпадали.
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
export function randomSaltHex() {
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function hashPassword(password) {
  const salt = randomSaltHex();
  const hash = await sha256Hex(salt + ":" + password);
  return `sha256:${salt}:${hash}`;
}
// Принимает и НОВЫЙ формат (sha256:соль:хэш), и старые (simpleHash, голый текст —
// у DEFAULT_USERS) — для плавного перехода без принудительного сброса паролей.
export async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith("sha256:")) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    return (await sha256Hex(salt + ":" + password)) === hash;
  }
  return stored === password || stored === simpleHash(password);
}
// Минимальная сложность нового пароля — не пропускаем совсем короткие/тривиальные.
export function passwordTooWeak(pw) {
  const p = String(pw || "");
  if (p.length < 6) return "Пароль должен быть не короче 6 символов";
  if (/^(\d)\1*$/.test(p) || /^(1234|12345|123456|qwerty|password|admin)$/i.test(p)) return "Слишком простой пароль, придумайте другой";
  return null;
}
// ── Блокировка входа после серии неверных попыток (защита от простого перебора) ──
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
export function _readLoginAttempts() {
  try { return JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || "{}"); } catch { return {}; }
}
export function getLoginLockout(login) {
  const rec = _readLoginAttempts()[login.toLowerCase()];
  if (rec && rec.lockUntil && rec.lockUntil > Date.now()) return rec.lockUntil;
  return null;
}
export function registerFailedLogin(login) {
  const key = login.toLowerCase();
  const all = _readLoginAttempts();
  const rec = all[key] || { count: 0 };
  rec.count = (rec.count || 0) + 1;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) { rec.lockUntil = Date.now() + LOGIN_LOCKOUT_MS; rec.count = 0; }
  all[key] = rec;
  try { localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(all)); } catch {}
}
export function clearLoginAttempts(login) {
  const all = _readLoginAttempts();
  delete all[login.toLowerCase()];
  try { localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(all)); } catch {}
}
