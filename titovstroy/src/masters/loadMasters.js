// ЧТЕНИЕ СПРАВОЧНИКА МАСТЕРОВ ЭКРАНОМ.
//
// Раскладка описана в mastersStore.mjs: записи лежат по одной на узел («-rec»), счётчики для
// шапки — отдельной маленькой строкой («-info»). Здесь только сборка этого в то, что ждёт экран.
//
// СТАРЫЙ УЗЕЛ ОСТАЁТСЯ ЗАПАСНЫМ ПУТЁМ. Пока парсер не сделал первый прогон в новой раскладке,
// новый узел пуст, и читать надо старый — иначе раздел встретил бы пустым списком. Он же
// выручает, если новый узел прочитать не удалось: показать вчерашние данные честнее, чем
// пустой экран. Когда владелец удалит старый узел, эта ветка просто перестанет что-либо
// находить — ломаться тут нечему.
//
// КОПИЯ В БРАУЗЕРЕ. Справочник весит мегабайты и меняется дважды в сутки, а качался
// при каждой загрузке страницы. Перед чтением базы спрашиваем сохранённую копию —
// подробности и цифры замера в mastersCache.js. Кэш только ускоряет: не открылся,
// протух, не совпала подпись — читаем из базы ровно как раньше.
import { storage as defaultStore } from "../cloud/storage.js";
import { isCacheUsable, readCache, writeCache } from "./mastersCache.js";
import { decodeRecords, infoKey, recordsKey } from "./mastersStore.mjs";

const parseAny = (result) => {
  if (!result || result.status !== "found" || !result.value) return null;
  try {
    const value = JSON.parse(result.value);
    return value && typeof value === "object" ? value : null;
  } catch { return null; }
};
// Счётчики — всегда объект. Массив на этом ключе означал бы, что туда записали что-то другое.
const parse = (result) => {
  const value = parseAny(result);
  return value && !Array.isArray(value) ? value : null;
};

export async function loadMasters(baseKey, store = defaultStore, { stamp = "", force = false, cache = true } = {}) {
  if (cache && !force) {
    try {
      const saved = await readCache(baseKey);
      if (isCacheUsable(saved, stamp)) {
        return { items: saved.items, meta: saved.meta || null, format: saved.format || "cache", broken: 0, fromCache: true, savedAt: saved.savedAt };
      }
    } catch { /* копии нет или хранилище недоступно — читаем из базы */ }
  }

  const fresh = await loadFromDb(baseKey, store);
  if (cache) {
    // Записать не вышло (нет места, приватное окно) — не беда: в следующий раз просто
    // прочитаем из базы. Ошибку сюда пускать нельзя, раздел уже получил данные.
    try { await writeCache(baseKey, { stamp, savedAt: Date.now(), items: fresh.items, meta: fresh.meta, format: fresh.format }); }
    catch { /* см. выше */ }
  }
  return fresh;
}

async function loadFromDb(baseKey, store) {
  // Оба узла запрашиваем сразу: «-info» весит килобайт и ждать его последовательно незачем.
  const [records, info] = await Promise.all([
    store.getChildren(recordsKey(baseKey)),
    store.getResult(infoKey(baseKey)),
  ]);

  if (records && records.status === "found") {
    const { items, broken } = decodeRecords(records.value);
    if (broken) console.warn(`${baseKey}: пропущено повреждённых записей ${broken}`);
    return { items, meta: parse(info), format: "records", broken };
  }

  const legacy = parseAny(await store.getResult(baseKey));
  const rows = Array.isArray(legacy?.items) ? legacy.items : (Array.isArray(legacy) ? legacy : []);
  return { items: rows, meta: legacy && !Array.isArray(legacy) ? legacy : null, format: "legacy", broken: 0 };
}
