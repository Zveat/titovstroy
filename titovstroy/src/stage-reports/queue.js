// ОЧЕРЕДЬ ОТПРАВКИ ФОТО.
//
// Прораб снимает в подвале, где связи нет. Без очереди загрузка падает молча и
// теряется ровно то доказательство скрытых работ, ради которого всё затевалось.
// Поэтому файл сначала ложится в хранилище на устройстве и только потом уходит
// в облако; успех удаляет запись из очереди, неудача оставляет её с пометкой.
//
// Хранилище — IndexedDB: localStorage двоичные данные не держит. Но вся логика
// очереди (порядок, счётчик попыток, статусы, повтор) написана поверх
// внедряемого backend'а, поэтому в тестах она гоняется на памяти, а не «как-то
// работает только в браузере».

export const QUEUE_DB = "titovstroy-stage-reports";
export const QUEUE_STORE = "queue";

// Что показывать на плитке. «Загружается» — прямо сейчас в сети; «в очереди» —
// ждёт своей попытки; «не удалось» — попытка была и провалилась.
export const QUEUE_UPLOADING = "uploading";
export const QUEUE_QUEUED = "queued";
export const QUEUE_FAILED = "failed";

export function entryStatus(entry, activeId) {
  if (entry && activeId && entry.id === activeId) return QUEUE_UPLOADING;
  if (entry && Number(entry.attempts) > 0 && entry.lastError) return QUEUE_FAILED;
  return QUEUE_QUEUED;
}

export const QUEUE_STATUS_LABELS = {
  [QUEUE_UPLOADING]: "Загружается",
  [QUEUE_QUEUED]: "В очереди",
  [QUEUE_FAILED]: "Не удалось",
};

// ── Хранилища ───────────────────────────────────────────────────────────────
export function memoryBackend(seed = []) {
  const map = new Map(seed.map((item) => [item.id, item]));
  return {
    async put(entry) { map.set(entry.id, entry); return entry; },
    async remove(id) { map.delete(id); },
    async all() { return [...map.values()]; },
  };
}

export function indexedDbBackend() {
  const open = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("indexeddb-unavailable")); return; }
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb-open-failed"));
  });
  const run = (mode, action) => open().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, mode);
    const request = action(transaction.objectStore(QUEUE_STORE));
    transaction.oncomplete = () => { db.close(); resolve(request?.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("indexeddb-tx-failed")); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error("indexeddb-tx-aborted")); };
  }));
  return {
    put: (entry) => run("readwrite", (store) => store.put(entry)).then(() => entry),
    remove: (id) => run("readwrite", (store) => store.delete(id)),
    all: () => run("readonly", (store) => store.getAll()).then((rows) => (Array.isArray(rows) ? rows : [])),
  };
}

// ── Очередь ─────────────────────────────────────────────────────────────────
export function createQueue(backend) {
  const store = backend || memoryBackend();
  return {
    // В очередь кладём ДО отправки: если вкладку закроют посреди загрузки,
    // снимок останется на устройстве и уйдёт следующей попыткой.
    async add(entry) {
      const record = { attempts: 0, lastError: "", createdAt: Date.now(), ...entry };
      await store.put(record);
      return record;
    },
    async remove(id) { await store.remove(id); },
    async all() { return (await store.all()) || []; },
    async forObject(objectId) {
      const all = (await store.all()) || [];
      return all
        .filter((item) => String(item?.objectId || "") === String(objectId || ""))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    },
    async markFailed(entry, error) {
      const record = {
        ...entry,
        attempts: Number(entry.attempts || 0) + 1,
        lastError: String(error?.message || error || "Не удалось отправить"),
        lastTriedAt: Date.now(),
      };
      await store.put(record);
      return record;
    },
  };
}

// Отправка всего, что накопилось по объекту. Каждая запись обрабатывается
// отдельно: одно упавшее фото не должно останавливать остальные, иначе один
// битый файл держит в очереди весь день съёмки.
//
// send(entry) → готовая запись для базы. onUploaded вызывается ТОЛЬКО после
// успешной отправки, чтобы в базе не появилось фото без файла.
export async function flushQueue(queue, send, hooks = {}) {
  const { objectId, onUploaded, onActive, onChange } = hooks;
  const waiting = objectId ? await queue.forObject(objectId) : await queue.all();
  const result = { sent: 0, failed: 0, errors: [] };
  for (const entry of waiting) {
    onActive?.(entry.id);
    try {
      const record = await send(entry);
      await queue.remove(entry.id);
      result.sent++;
      onUploaded?.(record, entry);
    } catch (error) {
      await queue.markFailed(entry, error);
      result.failed++;
      result.errors.push(String(error?.message || error));
    } finally {
      onActive?.(null);
      await onChange?.();
    }
  }
  return result;
}
