// ЕСТЬ ЛИ НА СЕРВЕРЕ СБОРКА СВЕЖЕЕ ТОЙ, ЧТО СЕЙЧАС ОТКРЫТА.
//
// ЗАЧЕМ. На телефоне приложение почти никогда не загружается заново: его сворачивают и
// разворачивают, а страница всё та же. Значит выкаченная правка может не доехать до человека
// неделями, и он об этом не узнает — просто «у меня не так, как ты говоришь».
//
// ПОЧЕМУ НЕ ЧЕРЕЗ SERVICE WORKER. Механизм «нашлось обновление» у браузера завязан на то,
// что ФАЙЛ sw.js изменился. Наш sw.js от сборки к сборке не меняется ни на байт, поэтому
// updatefound не наступает никогда, сколько ни выкатывай. Проверять надо не его.
//
// КАК ПРОВЕРЯЕМ. Vite вшивает в имя главного файла отпечаток содержимого:
// /assets/index-BxDNrfVe.js. Каждая сборка — новое имя. Берём имя из открытой страницы,
// скачиваем index.html с сервера и сравниваем. Разошлись — на сервере другая сборка.
//
// ЧЕГО ЗДЕСЬ НЕТ: перезагрузки. Она выкинула бы человека из объекта на стартовый экран
// (экраны в адресе не живут) и могла бы оборвать недописанное. Решение — за человеком.

const ENTRY = /\/assets\/index-[A-Za-z0-9_]+\.js/;

// Имя главного файла из текста index.html. Соседние куски (index.esm-*.js) не подходят
// под шаблон: после «index» у них точка, а не дефис.
export function entryFrom(html) {
  const m = String(html ?? "").match(ENTRY);
  return m ? m[0] : "";
}

// Имя главного файла открытой сейчас страницы.
export function currentEntry(doc) {
  for (const s of doc?.querySelectorAll?.("script[src]") ?? []) {
    const found = entryFrom(s.getAttribute("src") || "");
    if (found) return found;
  }
  return "";
}

// Разные имена — значит на сервере другая сборка. Пустое с любой стороны — молчим:
// в режиме разработки имени с отпечатком нет вообще, и повода дёргать человека тоже.
export function isNewer(current, latest) {
  return Boolean(current) && Boolean(latest) && current !== latest;
}

// Ходить чаще раза в минуту незачем: приложение сворачивают и разворачивают десятки раз.
export const CHECK_EVERY_MS = 60_000;

export function shouldCheck(now, lastCheckedAt, everyMs = CHECK_EVERY_MS) {
  return !lastCheckedAt || now - lastCheckedAt >= everyMs;
}

// Спрашиваем сервер. Любая осечка (нет сети, сервер молчит) — тихо «не знаю»:
// это фоновая проверка, ронять из-за неё что-либо нельзя.
export async function fetchLatestEntry(fetchImpl) {
  try {
    const res = await fetchImpl(`/index.html?v=${Date.now()}`, { cache: "no-store" });
    if (!res || !res.ok) return "";
    return entryFrom(await res.text());
  } catch (e) {
    return "";
  }
}
