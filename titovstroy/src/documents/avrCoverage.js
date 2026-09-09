// ЧТО УЖЕ СДАНО ПРЕЖНИМИ АКТАМИ.
//
// ЗАЧЕМ. Акт по объекту редко один: сдают частями — АВР №1, потом №2, потом №3. Построитель
// открывался со ВСЕМИ позициями сметы, отмеченными галочкой, и человеку приходилось вспоминать
// по памяти, что он уже сдавал в первом и втором акте. На полсотни позиций это гарантированная
// ошибка: либо сдал дважды, либо забыл.
//
// Здесь считается только «сколько этой работы уже ушло в акты» — по данным самих актов.
// Ничего не пишется и никакие акты не меняются: это подсказка построителю, не более.
//
// СОПОСТАВЛЯЕМ ПО НАЗВАНИЮ И ЕДИНИЦЕ. Строка сохранённого акта — это {name, unit, price,
// doneQty}, идентификатора позиции в ней нет и не было. Поэтому ключ собирается из названия и
// единицы: регистр и лишние пробелы не важны. Отсюда честное ограничение: если работу
// переименовали руками в акте или в смете, совпадения не будет и позиция посчитается новой.
// Лучше так, чем склеивать разные работы по похожести.

export function avrLineKey(line) {
  const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(line?.name)}|${norm(line?.unit)}`;
}

const EMPTY_KEY = "|";

// reports — все сохранённые документы; берём акты этого объекта, кроме редактируемого
// (иначе он посчитал бы сданными свои же строки и предложил бы ноль).
export function avrCoverage(reports, objectId, { excludeId = null } = {}) {
  const out = new Map();
  for (const report of Array.isArray(reports) ? reports : []) {
    if (!report || (report.type || "avr") !== "avr") continue;
    if (report.objectId !== objectId) continue;
    if (excludeId != null && report.id === excludeId) continue;
    const actNo = String(report.actNo ?? "").trim();
    for (const line of Array.isArray(report.lines) ? report.lines : []) {
      const key = avrLineKey(line);
      if (key === EMPTY_KEY) continue;
      const qty = Number(line?.doneQty) || 0;
      if (qty <= 0) continue;
      const cur = out.get(key) || { qty: 0, acts: [] };
      cur.qty += qty;
      if (actNo && !cur.acts.includes(actNo)) cur.acts.push(actNo);
      out.set(key, cur);
    }
  }
  return out;
}

// Разметить строки построителя.
//
// applyDefaults=true (новый акт): полностью сданные позиции снимаются с галочки, частично
// сданным подставляется ОСТАТОК. То есть открыв третий акт, человек видит уже готовый выбор —
// именно то, что осталось сдать, — и правит его, а не собирает заново.
//
// applyDefaults=false (открыли сохранённый акт на правку): галочки и количества не трогаем
// вообще, только подписываем, что эта работа встречается в других актах. Менять содержимое
// уже выписанного акта нельзя — это документ, а не черновик.
export function markCoveredLines(lines, coverage, { applyDefaults = true } = {}) {
  const map = coverage instanceof Map ? coverage : new Map();
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const found = map.get(avrLineKey(line));
    if (!found) return { ...line, usedQty: 0, usedActs: [] };
    const planned = Number(line?.qty) || 0;
    const used = Number(found.qty) || 0;
    const left = Math.max(0, planned - used);
    const marked = { ...line, usedQty: used, usedActs: [...found.acts] };
    if (!applyDefaults) return marked;
    // Остаток нулевой — работа сдана целиком: снимаем галочку, но строку НЕ прячем и не
    // удаляем. Бывает, что сдают сверх сметы; человек поставит галочку и впишет количество.
    return { ...marked, included: left > 0, doneQty: left > 0 ? left : 0 };
  });
}

// Короткая подпись для строки: «сдано 5 из 10 · акт №1» либо «уже в актах №1, №2».
export function coverageLabel(line) {
  const used = Number(line?.usedQty) || 0;
  if (used <= 0) return "";
  const acts = Array.isArray(line?.usedActs) ? line.usedActs.filter(Boolean) : [];
  const where = acts.length ? ` · акт${acts.length > 1 ? "ы" : ""} №${acts.join(", №")}` : "";
  const planned = Number(line?.qty) || 0;
  if (planned > 0 && used < planned) return `сдано ${trim(used)} из ${trim(planned)}${where}`;
  return `уже сдано${where}`;
}

// Целые числа показываем без хвоста «.00»: в актах чаще всего целые квадраты и штуки.
const trim = (n) => {
  const value = Number(n) || 0;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
};

// Сколько строк уже встречалось в прежних актах — для подписи в шапке построителя.
export const coveredCount = (lines) =>
  (Array.isArray(lines) ? lines : []).filter((l) => (Number(l?.usedQty) || 0) > 0).length;
