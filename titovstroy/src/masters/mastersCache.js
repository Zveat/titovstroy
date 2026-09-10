// СПРАВОЧНИК МАСТЕРОВ ХРАНИМ В БРАУЗЕРЕ, ЧТОБЫ НЕ КАЧАТЬ ЕГО КАЖДУЮ ЗАГРУЗКУ.
//
// ЗАЧЕМ. Замер на боевой (кадры WebSocket, а не догадка): вход в раздел «Мастера» —
// 6,00 МБ, переключение на вкладку OLX — ещё 11,10 МБ. Фильтры, поиск и возврат в
// раздел бесплатны, платим ровно за каждую ЗАГРУЗКУ СТРАНИЦЫ. Сами узлы столько и
// весят: naimi 5,8 МБ, OLX 10,1 МБ. Восемь заходов за день — 137 МБ, и это ровно
// форма часовых пиков на графике Firebase.
//
// ПОЧЕМУ НЕ «ЧИТАТЬ ЧАСТЯМИ». Записи лежат одним значением на ключ (так их пишет
// парсер), выборку по куску база отдать не может. Менять раскладку — это трогать
// парсер и боевые данные ради экономии, чего делать нельзя.
//
// ПО ЧЕМУ ПОНИМАЕМ, ЧТО КОПИЯ УСТАРЕЛА. По узлу настроек парсера (6 КБ): полный обход
// в конце прогона пишет туда lastRunAt/lastCount/lastWithPhone. Совпали — справочник
// тот же, качать нечего. Заходы «только номера» настройки НЕ трогают (у них своя
// отметка в отдельном узле), поэтому собранные ими телефоны в подпись не попадают —
// на этот случай есть потолок по возрасту и кнопка «обновить» в разделе.
//
// ЕСЛИ ХРАНИЛИЩЕ БРАУЗЕРА НЕДОСТУПНО (приватное окно, запрет на данные сайта, старый
// браузер) — молча читаем из базы, как раньше. Кэш обязан только ускорять; сломать
// раздел он не может ни при каком исходе.

export const CACHE_DB = "titovstroy-cache";
export const CACHE_STORE = "masters";
export const CACHE_MAX_AGE_MS = 6 * 3600 * 1000;
// Ждать хранилище дольше пары секунд бессмысленно: за это время справочник уже
// прочитался бы из базы. Зависший запрос к IndexedDB не должен вешать раздел.
const IDB_TIMEOUT_MS = 2000;

const S = (v) => (v === null || v === undefined ? "" : String(v));

// Подпись справочника из узла настроек парсера. Пустая строка = подписи нет
// (настройки не прочитались) — тогда доверяем копии только по возрасту.
export function mastersStamp(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return "";
  const parts = [S(config.lastRunAt), S(config.lastCount), S(config.lastWithPhone), S(config.lastActiveCount)];
  return parts.some(Boolean) ? parts.join("|") : "";
}

// Годится ли сохранённая копия. Требуем И совпадения подписи, И свежести: подпись
// ловит новый обход парсера, возраст — телефоны, дособранные потоками между обходами.
export function isCacheUsable(entry, stamp, { now = Date.now(), maxAgeMs = CACHE_MAX_AGE_MS } = {}) {
  if (!entry || !Array.isArray(entry.items)) return false;
  const savedAt = Number(entry.savedAt);
  if (!Number.isFinite(savedAt) || savedAt > now + 60_000) return false;   // часы перевели
  if (now - savedAt > maxAgeMs) return false;
  return S(entry.stamp) === S(stamp);
}

const withTimeout = (promise, ms = IDB_TIMEOUT_MS) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(() => resolve(null), ms)),
]);

function openDb() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(CACHE_DB, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      try { if (!req.result.objectStoreNames.contains(CACHE_STORE)) req.result.createObjectStore(CACHE_STORE); }
      catch { /* создать не вышло — работаем без кэша */ }
    };
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

export async function readCache(baseKey) {
  const db = await withTimeout(openDb());
  if (!db) return null;
  try {
    return await withTimeout(new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, "readonly");
      const req = tx.objectStore(CACHE_STORE).get(String(baseKey));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    }));
  } catch { return null; }
  finally { try { db.close(); } catch { /* уже закрыта */ } }
}

export async function writeCache(baseKey, entry) {
  const db = await withTimeout(openDb());
  if (!db) return false;
  try {
    return await withTimeout(new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      // Место в браузере не бесконечно: справочник на 10 МБ может не поместиться.
      // Не поместился — просто читаем из базы в следующий раз.
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      try { tx.objectStore(CACHE_STORE).put(entry, String(baseKey)); } catch { resolve(false); }
    }));
  } catch { return false; }
  finally { try { db.close(); } catch { /* уже закрыта */ } }
}
