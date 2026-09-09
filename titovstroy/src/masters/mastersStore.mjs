// ХРАНЕНИЕ СПРАВОЧНИКА МАСТЕРОВ: ПО ОДНОЙ ЗАПИСИ НА УЗЕЛ.
//
// ЗАЧЕМ. Раньше весь список лежал в базе ОДНОЙ строкой JSON — так устроено всё остальное
// хранилище приложения. Для списков в сотни записей это нормально, для справочника мастеров
// перестало: Firebase даёт 10 МиБ на ОДНО значение, а список копится сам (пропавшие объявления
// не удаляются, а помечаются active:false и остаются навсегда). 7 сентября 2026 узел OLX дорос
// до предела, запись начала падать, и справочник встал: ни новых мастеров, ни новых телефонов.
//
// Теперь каждая запись — отдельный дочерний узел. Предел в 10 МиБ считается на значение, а не
// на узел с детьми, поэтому упереться в него больше нельзя. Побочно стало дешевле: прогон
// парсера пишет только ИЗМЕНИВШИЕСЯ записи, а не перезаливает мегабайты целиком по три раза.
//
// РАСКЛАДКА (base = "titovstroy-masters" или "titovstroy-masters-olx"):
//   base + "-rec"   дети: ключ записи → строка JSON с самой записью
//   base + "-info"  одна маленькая строка: счётчики, дата обновления, категории
//   base            СТАРЫЙ узел. Парсер его больше не трогает и не удаляет: пока он есть,
//                   приложение старой версии (открытая вкладка, кеш браузера) продолжает
//                   показывать последний хороший список. Удалять — осознанно и руками.
//
// Модуль общий: его импортируют и парсеры (naimi-parser/), и приложение (src/). Ровно поэтому
// здесь только чистые функции — ни Firebase, ни браузерного API.

export const recordsKey = (base) => `${base}-rec`;
export const infoKey = (base) => `${base}-info`;

// ИМЯ ДОЧЕРНЕГО УЗЛА ИЗ «источник:идентификатор».
//
// Firebase запрещает в имени узла . $ # [ ] / и управляющие символы. Простая замена «всё
// лишнее на подчёркивание» здесь не годится: два разных мастера могли бы получить одно имя и
// молча слиться в одного — это ровно та потеря данных, которой быть не должно. Поэтому
// кодируем: разрешённые символы остаются как есть, остальные превращаются в «-» плюс код
// символа. Дефис сам по себе тоже кодируется, поэтому обратной неоднозначности нет.
export function recordKey(item) {
  const raw = `${item?.source || ""}:${item?.extId || ""}`;
  let out = "";
  for (const ch of raw) {
    out += /[A-Za-z0-9_]/.test(ch) ? ch : `-${ch.codePointAt(0).toString(16).padStart(4, "0")}`;
  }
  return out;
}

// Запись без источника или идентификатора склеить не с чем: у неё нет имени узла, и при
// следующем обходе она превратилась бы в дубль. Такие пропускаем — их и раньше отбрасывал
// mergeFreshSnapshot.
const usable = (item) => Boolean(item && item.source && item.extId);

export function encodeRecords(items) {
  const out = {};
  for (const item of Array.isArray(items) ? items : []) {
    if (!usable(item)) continue;
    out[recordKey(item)] = JSON.stringify(item);
  }
  return out;
}

// Дети приходят как { имя: строка JSON }. Битую запись пропускаем и считаем — один
// испорченный узел не должен ронять весь справочник, но и молчать о нём нельзя.
export function decodeRecords(children) {
  const items = [];
  let broken = 0;
  for (const raw of Object.values(children && typeof children === "object" ? children : {})) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) { items.push(raw); continue; }
    try {
      const parsed = JSON.parse(String(raw));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) items.push(parsed);
      else broken += 1;
    } catch { broken += 1; }
  }
  return { items, broken };
}

// СЛИЯНИЕ ДВУХ ИСТОЧНИКОВ НА ВРЕМЯ ПЕРЕЕЗДА.
//
// Переезд со старой раскладки — это одна большая запись, и она может не доехать: у прогона
// есть предел по времени, а сеть иногда рвётся. Тогда в новом узле окажется часть записей, и
// если довериться ему как единственной правде, у недоехавших пропали бы собранные телефоны —
// а их добывают месяцами, по два десятка за прогон.
//
// Поэтому пока переезд не подтверждён отметкой в «-info», прогон читает оба узла и сливает:
// что уже переехало — то главное, остальное берётся из старого. Прерванный переезд от этого
// просто продолжается на следующем прогоне, а потерять ничего нельзя.
export function mergeRecords(primary, secondary) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(primary) ? primary : []) {
    if (!usable(item)) continue;
    seen.add(recordKey(item));
    out.push(item);
  }
  for (const item of Array.isArray(secondary) ? secondary : []) {
    if (!usable(item) || seen.has(recordKey(item))) continue;
    seen.add(recordKey(item));
    out.push(item);
  }
  return out;
}

// Пишем только то, что реально изменилось. На обычном прогоне меняются десятки записей из
// тысяч, и разница между «залить 10 МБ» и «залить 30 КБ» — это и время прогона, и деньги.
export function changedRecords(before, after) {
  const prev = before && typeof before === "object" ? before : {};
  const next = after && typeof after === "object" ? after : {};
  const out = {};
  for (const [key, value] of Object.entries(next)) {
    if (prev[key] !== value) out[key] = value;
  }
  return out;
}

// ЗАПИСЬ НЕ ДОЛЖНА ПРОПАДАТЬ. mergeFreshSnapshot историю не выбрасывает — пропавшие мастера
// остаются с active:false. Если после слияния имя узла всё-таки исчезло, значит что-то пошло
// не так (например, у записи потерялся extId), и записывать такой результат нельзя: узлы,
// которых нет в обновлении, остались бы в базе рассинхронизированными со счётчиками.
// Возвращаем имена пропавших — вызывающий решает, падать или чинить.
export function droppedRecords(before, after) {
  const prev = before && typeof before === "object" ? before : {};
  const next = after && typeof after === "object" ? after : {};
  return Object.keys(prev).filter((key) => !(key in next));
}

// Обновление детей уходит порциями. Целиком это те же мегабайты одним запросом — как раз то,
// от чего мы уходим; по одному ребёнку — тысячи запросов подряд. Порция в несколько сотен
// записей укладывается в сотни килобайт и в один заход.
export function chunkRecords(records, size = 400) {
  const entries = Object.entries(records && typeof records === "object" ? records : {});
  const limit = Number.isFinite(size) && size > 0 ? Math.floor(size) : 400;
  const out = [];
  for (let i = 0; i < entries.length; i += limit) {
    out.push(Object.fromEntries(entries.slice(i, i + limit)));
  }
  return out;
}

// Счётчики для узла «-info». Экран берёт их отсюда и не обязан ради шапки читать весь список.
//
// «Ждёт номера» у источников считается по-разному, и разница не косметическая. На OLX автор
// вправе скрыть телефон, поэтому у записи есть флаг hasPhoneFlag: скрывшего в очередь ставить
// бессмысленно. На naimi без телефона нет регистрации — там флага нет и номер есть у всех.
// Отсюда правило «не false»: у OLX явное false исключает, у naimi отсутствие флага включает.
export function buildInfo(items, extra = {}) {
  const list = Array.isArray(items) ? items : [];
  return {
    ...extra,
    updatedAt: new Date().toISOString(),
    count: list.length,
    activeCount: list.filter((m) => m?.active !== false).length,
    withPhone: list.filter((m) => m?.phone).length,
    pendingPhone: list.filter((m) => m?.active !== false && !m?.phone && m?.hasPhoneFlag !== false).length,
  };
}
