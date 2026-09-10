// ГДЕ ЧЕЛОВЕК БЫЛ, КОГДА ОБНОВИЛ СТРАНИЦУ.
//
// ЗАЧЕМ. Перезагрузка браузера выкидывала на Главную: открыл объект, обновил страницу —
// ищи его заново. Сотрудник на это и пожаловался. Заодно это чинит перезагрузку по кнопке
// «Вышла новая версия»: раньше она стоила потери места, и поэтому не могла быть автоматической.
//
// ПОЧЕМУ НЕ В АДРЕСЕ СТРАНИЦЫ. Адрес у нас уже занят публичными ссылками (#/kp/…, #/progress/…),
// и складывать туда ещё и внутреннюю навигацию — это менять то, чем клиенты пользуются снаружи.
// Слишком дорого ради возврата на свой экран. Кладём в память браузера.
//
// ЧТО НЕ ВОССТАНАВЛИВАЕМ И ПОЧЕМУ:
//   — редактор сметы: он про несохранённые правки, поднимать его «сам собой» опасно;
//   — экран чужого пользователя: вошёл другой человек — он не должен оказаться в объекте
//     предыдущего. Отметка привязана к идентификатору сотрудника;
//   — раздел, на который у роли нет прав: права могли поменять, пока человека не было;
//   — вчерашнее: через полсуток человек начинает новый день и ждёт Главную, а не объект,
//     который смотрел вчера вечером.

export const LAST_SCREEN_KEY = "ts_last_screen";   // личная настройка вида, в базе ей делать нечего

// Разделы нижнего меню. Внутренние экраны (редактор сметы, карточка сделки) сюда не входят
// намеренно — см. выше.
export const NAV_SCREENS = ["dashboard", "objects", "calendar", "contracts", "analytics", "finance", "masters", "admin"];

export const MAX_AGE_MS = 12 * 3600 * 1000;

export function encodeLastScreen({ uid, screen, objectId, objWsTab, financeTab, now = Date.now() }) {
  if (!uid || !NAV_SCREENS.includes(screen)) return null;
  const out = { uid: String(uid), screen, ts: now };
  // Объект помним только вместе со своим разделом: «карточка объекта» в Финансах не значит ничего.
  if (screen === "objects" && objectId) { out.objectId = String(objectId); if (objWsTab) out.objWsTab = String(objWsTab); }
  if (screen === "finance" && financeTab) out.financeTab = String(financeTab);
  return out;
}

// allowed — разделы, доступные ЭТОЙ роли прямо сейчас. Права могли забрать, пока человека не было.
export function decodeLastScreen(raw, { uid, now = Date.now(), allowed = NAV_SCREENS, maxAgeMs = MAX_AGE_MS } = {}) {
  let saved = raw;
  if (typeof saved === "string") { try { saved = JSON.parse(saved); } catch { return null; } }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
  if (!uid || String(saved.uid) !== String(uid)) return null;
  const ts = Number(saved.ts);
  if (!Number.isFinite(ts) || now - ts > maxAgeMs || ts > now + 60_000) return null;
  if (!NAV_SCREENS.includes(saved.screen) || !allowed.includes(saved.screen)) return null;
  const out = { screen: saved.screen };
  if (saved.screen === "objects" && saved.objectId) {
    out.objectId = String(saved.objectId);
    if (saved.objWsTab) out.objWsTab = String(saved.objWsTab);
  }
  if (saved.screen === "finance" && saved.financeTab) out.financeTab = String(saved.financeTab);
  return out;
}
