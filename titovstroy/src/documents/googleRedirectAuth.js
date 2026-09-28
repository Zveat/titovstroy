// ВХОД В GOOGLE БЕЗ ВСПЛЫВАЮЩЕГО ОКНА — ПЕРЕХОДОМ И ВОЗВРАТОМ.
//
// Почему пришлось: в приложении, запущенном с иконки, окно входа Google открывается
// ВСТРОЕННЫМ Safari поверх приложения. У такого окна нет связи с вызвавшей страницей,
// поэтому ответу некуда приехать: окно пишет «Подождите…», закрывается — и всё. Это
// не чинится ни порядком вызова, ни ожиданием; проверено на боевой дважды.
//
// Зато обычный ПЕРЕХОД на другой адрес в приложении с иконки остаётся внутри
// приложения, и возврат тоже. Значит вместо окна делаем так: уходим на страницу
// Google, человек подтверждает (или его сразу возвращают, если он уже подтверждал),
// Google приводит его обратно на наш адрес и кладёт ключ в хвост ссылки.
//
// ЧТО ПРОВЕРЕНО ЗАПРОСОМ, А НЕ ВЗЯТО ИЗ ГОЛОВЫ: Google отвечает этому клиенту
// «redirect_uri_mismatch», а не «такой способ не поддерживается». То есть способ
// рабочий, и нужен ровно один разовый шаг в консоли Google — зарегистрировать адрес
// возврата. Без него Google покажет свою страницу с ошибкой.
//
// КЛЮЧ ЖИВЁТ В ПАМЯТИ ВКЛАДКИ И НИКУДА НЕ ЗАПИСЫВАЕТСЯ. В хранилище на время
// перехода ложится только «что я собирался сделать»: вид документа и его номер.
// Ни текста договора, ни ключа там нет.

const PENDING_KEY = "titovstroy-gdoc-pending";
const PENDING_TTL_MS = 10 * 60 * 1000;      // не дошёл за десять минут — забыли

export const GOOGLE_DRIVE_CLIENT_ID = "363473710949-d67codd7dq0uk9g4tfl8lhhgecgcqe98.apps.googleusercontent.com";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

// Адрес возврата — корень сайта. Ровно его и надо зарегистрировать в консоли Google.
export const redirectUri = (origin) => String(origin || "").replace(/\/$/, "") + "/";

export function buildAuthUrl({ origin, state, clientId = GOOGLE_DRIVE_CLIENT_ID, scope = GOOGLE_DRIVE_SCOPE }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "token",
    scope,
    state,
    include_granted_scopes: "true",
    // prompt не задаём: уже подтверждавшего Google вернёт молча, новому покажет окно.
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

const randomState = () => {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
};

// Запомнить задуманное и уйти к Google. Возвращает false, если уйти не вышло —
// тогда зовущий делает по-старому, через окно.
export function startGoogleRedirect(job, { store = localStorage, win = window } = {}) {
  try {
    const state = randomState();
    store.setItem(PENDING_KEY, JSON.stringify({ job, state, at: Date.now() }));
    win.location.assign(buildAuthUrl({ origin: win.location.origin, state }));
    return true;
  } catch {
    try { store.removeItem(PENDING_KEY); } catch { /* и это не вышло — неважно */ }
    return false;
  }
}

// Забрать то, с чем нас вернул Google. Зовётся один раз при запуске приложения.
// Хвост ссылки вычищается СРАЗУ: ключ не должен остаться в адресной строке, в
// истории браузера и в том, что человек может случайно переслать.
export function takeGoogleRedirectResult({ store = localStorage, win = window } = {}) {
  let saved = null;
  try { saved = JSON.parse(store.getItem(PENDING_KEY) || "null"); } catch { saved = null; }

  const hash = String(win.location?.hash || "");
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("access_token");
  const error = params.get("error");
  const state = params.get("state");
  if (!token && !error) return null;                       // обычный запуск

  const clean = () => {
    try { store.removeItem(PENDING_KEY); } catch { /* уже нет */ }
    try {
      const { pathname, search } = win.location;
      win.history?.replaceState?.(null, "", `${pathname}${search}`);
    } catch { /* перепишем в следующий раз */ }
  };

  if (error) { clean(); return { ok: false, reason: errorText(error) }; }
  // Чужой или протухший ответ не принимаем: ключ на это и завязан.
  if (!saved || saved.state !== state) { clean(); return { ok: false, reason: "Ответ Google не совпал с запросом — попробуйте ещё раз" }; }
  if (Date.now() - Number(saved.at || 0) > PENDING_TTL_MS) { clean(); return { ok: false, reason: "Слишком долго — попробуйте ещё раз" }; }

  clean();
  return { ok: true, token, job: saved.job };
}

function errorText(code) {
  if (code === "access_denied") return "Доступ к Google Диску не разрешён";
  if (/redirect_uri/i.test(code)) return "Адрес возврата не зарегистрирован в консоли Google";
  return `Google отказал: ${code}`;
}

export const _pendingKey = PENDING_KEY;
