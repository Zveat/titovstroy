// Резервные копии списков: КАЖДЫЙ снимок — отдельным ключом, а не одним массивом.
//
// ЗАЧЕМ. Раньше все 20 копий списка лежали в одном ключе. Любое сохранение читало
// весь этот массив целиком, дописывало в начало предыдущую версию и писало обратно.
// На боевой базе архив смет весил 5,4 МБ, финансовых операций — 6,1 МБ: одна правка
// стоила мегабайтов скачивания. За двое суток набежало 58 ГБ исходящего трафика и
// 57 долларов счёта.
//
// ТЕПЕРЬ. Снимок пишется в свой ключ «<backupKey>-<ts>», а рядом лежит указатель
// «<backupKey>-idx» — короткий список {ts, by, count} без самих данных, пара сотен
// байт. Сохранение читает только указатель, данные не читает вообще. Восстановление
// тянет ровно один выбранный снимок.
//
// СТАРЫЕ КОПИИ НЕ ПРОПАДАЮТ: прежний массив остаётся на месте и по-прежнему
// показывается в списке — mergeBackupViews склеивает оба источника.

export const BACKUP_KEEP = 20;

export const backupIndexKey = (backupKey) => `${backupKey}-idx`;
export const backupItemKey = (backupKey, ts) => `${backupKey}-${ts}`;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Указатель из облака может прийти чем угодно — мусор отбрасываем, а не падаем.
export function normalizeIndex(raw) {
  let arr = raw;
  if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const ts = num(item?.ts);
    if (!ts || seen.has(ts)) continue;
    seen.add(ts);
    // sig — необязательная подпись содержимого. Нужна общему снимку рабочей области:
    // по ней видно «ничего не изменилось», не читая сам снимок.
    const row = { ts, by: String(item?.by || ""), count: num(item?.count) };
    if (item?.sig) row.sig = String(item.sig);
    // counts — четыре числа общего снимка (объекты/сметы/договоры/операции). Держим их
    // в оглавлении, чтобы окно со списком снимков не читало сами снимки.
    if (item?.counts && typeof item.counts === "object") row.counts = { ...item.counts };
    out.push(row);
  }
  return out.sort((a, b) => b.ts - a.ts);
}

// ПРОРЕЖИВАНИЕ ПО ВРЕМЕНИ: «всё за последние сутки + по одной точке на день назад».
//
// ЗАЧЕМ. Общий снимок рабочей области создаётся на КАЖДОЕ изменение (через 8 секунд
// после того, как правки утихли). Мест было 30, и активный рабочий день съедал их
// целиком: на боевой все тридцать снимков уложились в 15 часов — с 9 сентября 21:19
// по 10 сентября 11:33, причём девять из них за девять минут. Откатиться можно было
// только на сегодня-вчера, а всё, что старше, уже вытеснено. Владелец это и заметил:
// в списке подряд идут 9 сентября и 22 июля, между ними пусто.
//
// ПОЧЕМУ ИМЕННО СУТКИ. Ошибку в данных замечают в тот же день — «сделал в 10, увидел
// в 18». Пока снимку меньше суток, он нужен весь, с мелким шагом. Дальше от дня нужна
// одна точка: разбираться в двадцати снимках позапрошлого вторника всё равно никто не
// будет, а вот дотянуться до позапрошлого вторника — нужно.
const DAY_MS = 24 * 3600 * 1000;
const dayKeyOf = (ts, tzOffsetMin) => Math.floor((ts + tzOffsetMin * 60000) / DAY_MS);
export function thinIndex(rows, {
  now = Date.now(), recentMs = DAY_MS, recentMax = 20, dailyMax = 20, tzOffsetMin = 5 * 60,
} = {}) {
  const sorted = normalizeIndex(rows);                  // по убыванию времени
  const cut = now - recentMs;
  const out = sorted.filter((r) => r.ts > cut).slice(0, recentMax);
  const seenDay = new Set();
  for (const r of sorted) {
    if (r.ts > cut) continue;
    const d = dayKeyOf(r.ts, tzOffsetMin);
    if (seenDay.has(d)) continue;                       // за этот день точка уже есть
    seenDay.add(d);
    out.push(r);                                        // список убывающий — порядок сохраняется
    if (seenDay.size >= dailyMax) break;
  }
  return out;
}

// Добавить снимок в указатель. Возвращает новый указатель и список ts, чьи ключи
// пора удалить: иначе старые снимки остались бы в базе навсегда и место росло бы.
// Третьим аргументом можно передать число (сколько держать) или настройки:
// { keep, thin } — thin включает прореживание по времени, см. thinIndex выше.
export function pushIndex(index, entry, keepOrOpts = BACKUP_KEEP) {
  const opts = keepOrOpts && typeof keepOrOpts === "object" ? keepOrOpts : { keep: keepOrOpts };
  const keep = Number.isFinite(Number(opts.keep)) ? Number(opts.keep) : BACKUP_KEEP;
  const ts = num(entry?.ts);
  if (!ts) return { index: normalizeIndex(index), drop: [] };
  const rest = normalizeIndex(index).filter((item) => item.ts !== ts);
  const head = { ts, by: String(entry?.by || ""), count: num(entry?.count) };
  if (entry?.sig) head.sig = String(entry.sig);
  if (entry?.counts && typeof entry.counts === "object") head.counts = { ...entry.counts };
  const next = [head, ...rest]
    .sort((a, b) => b.ts - a.ts);
  const thinned = opts.thin ? thinIndex(next, { now: ts, ...opts.thin }) : next;
  const kept = thinned.slice(0, keep);
  const keptTs = new Set(kept.map((item) => item.ts));
  return { index: kept, drop: next.filter((item) => !keptTs.has(item.ts)).map((item) => item.ts) };
}

// Единый список для окна «Бэкапы»: новые снимки (по указателю) и старые из общего
// массива. У новых поля data нет — данные подтягиваются при восстановлении.
export function mergeBackupViews(legacy, index, backupKey = "") {
  const rows = [];
  const seen = new Set();
  for (const item of normalizeIndex(index)) {
    seen.add(item.ts);
    rows.push({ ts: item.ts, by: item.by, count: item.count, key: backupItemKey(backupKey, item.ts) });
  }
  let old = legacy;
  if (typeof old === "string") { try { old = JSON.parse(old); } catch { old = []; } }
  if (Array.isArray(old)) {
    for (const item of old) {
      const ts = num(item?.ts);
      if (!ts || seen.has(ts)) continue;
      seen.add(ts);
      rows.push({ ts, by: String(item?.by || ""), count: num(item?.count), data: item?.data });
    }
  }
  return rows.sort((a, b) => b.ts - a.ts);
}

// Снимок для записи. Отдельной функцией, чтобы формат был в одном месте и совпадал
// с тем, что читает восстановление.
export const makeSnapshot = ({ ts = Date.now(), by = "", count = 0, data = "" } = {}) =>
  ({ ts: num(ts), by: String(by || ""), count: num(count), data: String(data ?? "") });

// Данные снимка: у старых записей они лежат прямо в строке списка, у новых — в своём
// ключе. readKey возвращает строку значения ключа (или null).
export async function loadSnapshotData(row, readKey) {
  if (row && typeof row.data === "string" && row.data) return row.data;
  if (!row?.key || typeof readKey !== "function") return null;
  const raw = await readKey(row.key);
  if (!raw) return null;
  let parsed = raw;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { return null; } }
  const data = parsed?.data;
  return typeof data === "string" && data ? data : null;
}
