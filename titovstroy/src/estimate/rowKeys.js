// Миграция ключей строк сметы с названия работы на её код. Перенос из App.jsx.

// Мигрирует ключи rows со старого формата (name) на новый (code).
// Нужно при открытии смет, созданных до перехода на code-ключи.
// Перевод ключей строк на коды работ. Строка под НАЗВАНИЕМ (так писали раньше)
// переезжает на код работы. Если под этим кодом запись уже есть — она главнее:
// именно её показывает редактор и считает итог сметы (rows[код] || rows[название]).
// Без этой проверки исход зависел от порядка ключей в объекте: у сметы, где код
// стоит раньше названия, миграция затирала актуальную запись забытой и возвращала
// в смету работы, которые из неё удалили.
export function migrateRowsToCodeKeys(rows, catalog) {
  const src = rows || {};
  const result = {};
  const fromName = [];
  for (const [key, val] of Object.entries(src)) {
    const byCode = catalog.find(w => w.code === key);
    if (byCode) { result[key] = val; continue; }
    const byName = catalog.find(w => w.name === key);
    if (byName) fromName.push([byName.code, val]);
    else result[key] = val;
  }
  for (const [code, val] of fromName) {
    if (Object.prototype.hasOwnProperty.call(result, code)) continue; // запись под кодом главнее
    result[code] = val;
  }
  return result;
}
