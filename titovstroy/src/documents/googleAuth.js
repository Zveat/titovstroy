// ВХОД В GOOGLE — ОДИН НА ВСЕ ПУТИ ЭКСПОРТА.
//
// Документ в Google Doc умеют делать два генератора: новый (по шаблонам) и старый
// (legacyDocs.js). До этого у каждого был СВОЙ вход в Google, и оба просили доступ
// уже после того, как документ подготовлен. На телефоне это и убивало кнопку:
// браузер даёт открыть окно Google только в тот же миг, когда человек нажал, и всего
// на несколько секунд. Пока шла подготовка (а она читала склад шаблонов на 1,83 МБ),
// разрешение сгорало, окно гасло молча, и никто ничего не сообщал — владелец жал
// «Google Doc», и не происходило ровно ничего.
//
// Теперь порядок обратный и общий для обоих генераторов:
//
//   prewarm() — подтянуть библиотеку Google заранее. Её загрузка сама по себе съедала
//               то самое разрешение, если начинать её по нажатию;
//   begin()   — спросить доступ ПРЯМО В НАЖАТИИ, первой строкой, до всякой подготовки.
//               Обещание кладётся сюда и ждёт;
//   token()   — забрать обещанное, когда документ готов. Никто не позвал begin —
//               спросим здесь же, как было раньше: хуже не станет.
//
// Состояние живёт в модуле: ESM даёт один экземпляр на приложение, и два места в коде
// не начнут спрашивать доступ параллельно.

export const GOOGLE_DRIVE_CLIENT_ID = "363473710949-d67codd7dq0uk9g4tfl8lhhgecgcqe98.apps.googleusercontent.com";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const LOAD_FAILED = "Не удалось загрузить сервис Google (accounts.google.com недоступен). "
  + "Проверьте интернет и попробуйте ещё раз, либо возьмите PDF.";
// Ждём ответа со СРОКОМ. Google зовёт обработчик только при ответе: если окно не
// открылось или его закрыли крестиком, не ответит никто, и ждать можно вечно.
const NO_ANSWER = "Google не ответил: окно входа не открылось или было закрыто. "
  + "На телефоне это обычно значит, что браузер погасил окно Google.";
const ANSWER_WAIT_MS = 90000;

let libraryPromise = null;
let pending = null;

const gis = () => (typeof window !== "undefined" ? window.google?.accounts?.oauth2 : null);

function loadLibrary() {
  if (gis()) return Promise.resolve();
  if (typeof document === "undefined") return Promise.reject(new Error(LOAD_FAILED));
  if (!libraryPromise) {
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      // Забываем неудачу: следующая попытка должна начать заново, а не упираться в неё.
      script.onerror = () => { libraryPromise = null; reject(new Error(LOAD_FAILED)); };
      document.head.appendChild(script);
    });
  }
  return libraryPromise;
}

function askAccess(clientId, scope) {
  return new Promise((resolve, reject) => {
    const oauth2 = gis();
    if (!oauth2) { reject(new Error(LOAD_FAILED)); return; }
    const timer = setTimeout(() => reject(new Error(NO_ANSWER)), ANSWER_WAIT_MS);
    const finish = (fn) => (value) => { clearTimeout(timer); fn(value); };
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: response => response?.error
        ? finish(reject)(new Error(`Ошибка авторизации: ${response.error}`))
        : finish(resolve)(response.access_token),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export function prewarmGoogleAuth() {
  return loadLibrary().catch(() => { /* не вышло — попробуем при нажатии */ });
}

// Зовётся СИНХРОННО из обработчика нажатия. Библиотека на месте — окно Google
// откроется тем же жестом; не на месте — дождёмся её и спросим, пусть и с риском.
export function beginGoogleAuth({ clientId = GOOGLE_DRIVE_CLIENT_ID, scope = GOOGLE_DRIVE_SCOPE } = {}) {
  pending = gis() ? askAccess(clientId, scope) : loadLibrary().then(() => askAccess(clientId, scope));
  pending.catch(() => { /* разберёт тот, кто придёт за токеном */ });
  return pending;
}

export async function googleAccessToken({ clientId = GOOGLE_DRIVE_CLIENT_ID, scope = GOOGLE_DRIVE_SCOPE } = {}) {
  const waiting = pending;
  pending = null;                       // следующий документ спросит заново
  if (waiting) return waiting;
  await loadLibrary();
  return askAccess(clientId, scope);
}

// Только для тестов: вернуть модуль в исходное состояние.
export function _resetGoogleAuth() { libraryPromise = null; pending = null; }
