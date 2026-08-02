// ─────────────────────────────────────────────────────────────────────────────
// ФОТ — расчётная модель. Чистые функции, без React и без storage: всё, что тут
// есть, проверяется тестами отдельно от интерфейса.
//
// Зачем модуль вообще. На боевой базе 79% расходов компании — это выплаты людям
// (38,3 млн из 48,4), но разложить их по именам было нельзя: человек жил в НАЗВАНИИ
// подкатегории («ФОТ РОП», «ФОТ таргетолог»), а 24 млн подрядчикам шли одной
// подкатегорией на всех.
//
// Ничего существующего модуль не переписывает:
//   • у операции появляется НЕОБЯЗАТЕЛЬНОЕ поле payee — старые операции валидны как есть;
//   • история читается через таблицу соответствий «подкатегория → сотрудник», которая
//     лежит отдельным ключом и сами операции не трогает.
// ─────────────────────────────────────────────────────────────────────────────

import { normCN } from "../utils.js";   // нормализация номера договора — та же, что в финансах

export const STAFF_KEY = "titovstroy-staff";
export const STAFF_BACKUPS_KEY = "titovstroy-staff-backups";
export const PAYROLL_MAP_KEY = "titovstroy-payroll-map";

export const PAYEE_KINDS = { staff: "Сотрудник", worker: "Подрядчик" };

// Подкатегории, которые в ФОТ не входят ВООБЩЕ: дивиденды, материалы, аренда,
// эквайринг. Раньше они шли отдельной колонкой «не зарплата» — владелец справедливо
// сказал, что дивидендам в разделе про зарплату делать нечего совсем. Теперь такие
// операции просто не попадают в расчёт: ни в итог, ни в строки людей.
// Живут в той же карте правил под служебным ключом: имя подкатегории никогда не
// начинается с «__», поэтому пересечься они не могут. Ключ оставлен прежний —
// у владельца в базе уже отмечены «Дивиденды учредителям».
export const EXCLUDE_KEY = "__nonWage";
export const excludedSet = (map) => new Set(Array.isArray(map?.[EXCLUDE_KEY]) ? map[EXCLUDE_KEY] : []);
export const isExcluded = (tx, map) => excludedSet(map).has(String(tx?.subcategory || "").trim());
export const STAFF_STATUSES = [
  { key: "active", label: "Работает", color: "#059669", bg: "#ecfdf5" },
  { key: "fired",  label: "Уволен",   color: "#94a3b8", bg: "#f1f5f9" },
];
export const staffStatusMeta = (k) => STAFF_STATUSES.find(s => s.key === k) || STAFF_STATUSES[0];

// Комментарий операции. В боевой базе он лежит в note (559 расходов из 578), а не в
// comment/description — поиск по нему не находил ничего.
export const txComment = (t) => String(t?.note || t?.comment || t?.description || "").trim();
const num = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const ts = (v) => { if (!v) return 0; const d = new Date(v); return isNaN(d) ? 0 : d.getTime(); };
// Месяц в UTC — той же зоной, что и остальная аналитика, иначе операция, внесённая
// ночью, попадала бы в соседний месяц.
export const payrollMonthKey = (v) => {
  const t = ts(v); if (!t) return "";
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (key) => {
  const [y, m] = String(key || "").split("-");
  const names = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return names[Number(m) - 1] ? `${names[Number(m) - 1]} ${String(y).slice(2)}` : key;
};

export function normalizeStaff(raw = {}) {
  return {
    id: raw.id || "",
    name: String(raw.name || "").trim(),
    position: String(raw.position || "").trim(),
    userId: raw.userId || "",             // необязательная привязка к учётной записи
    hiredAt: raw.hiredAt || "",
    status: raw.status === "fired" ? "fired" : "active",
    note: String(raw.note || "").trim(),
    // Схема мотивации живёт здесь же, но разбирает её payrollAccruals — тут только
    // проносим как есть, чтобы правка любого другого поля её не стёрла.
    scheme: raw.scheme && typeof raw.scheme === "object" ? raw.scheme : {},
    updatedAt: raw.updatedAt || Date.now(),
  };
}

// Кто получатель операции. Порядок важен: ЯВНОЕ поле сильнее таблицы соответствий —
// иначе операция, у которой получателя поправили руками, снова читалась бы по старой
// подкатегории и правка не имела бы смысла.
export function resolvePayee(tx, { staffById, workersById, subcategoryMap = {} } = {}) {
  if (!tx) return null;
  const sMap = staffById instanceof Map ? staffById : new Map();
  const wMap = workersById instanceof Map ? workersById : new Map();
  const p = tx.payee;
  if (p && p.id) {
    if (p.kind === "worker") {
      const w = wMap.get(p.id);
      return { kind: "worker", id: p.id, name: w?.name || "Подрядчик (удалён)", position: "Подрядчик", source: "operation" };
    }
    const s = sMap.get(p.id);
    if (s) return { kind: "staff", id: p.id, name: s.name || "Без имени", position: s.position || "", source: "operation" };
    // Сотрудника удалили, а операция на него ссылается — молчать нельзя, иначе сумма
    // просто исчезнет из отчёта и итог разойдётся с расходами.
    return { kind: "staff", id: p.id, name: "Сотрудник (удалён)", position: "", source: "operation" };
  }
  const key = String(tx.subcategory || "").trim();
  const mappedId = key && subcategoryMap[key];
  if (mappedId) {
    const s = sMap.get(mappedId);
    if (s) return { kind: "staff", id: mappedId, name: s.name || "Без имени", position: s.position || "", source: "map" };
  }
  return null;
}

// Отчёт «кому сколько ушло».
// Считаем ТОЛЬКО расходы и ТОЛЬКО ФОТ: приход, переводы и подкатегории, помеченные
// «не ФОТ» (дивиденды, материалы, аренда), в расчёт не идут вовсе.
// Операции без получателя НЕ выбрасываем — они идут в «не разложено», иначе итог отчёта
// молча разошёлся бы с суммой зарплатных расходов, а это ровно тот класс вранья,
// который мы чиним.
export function buildPayrollReport(financeTx = [], opts = {}) {
  const { staff = [], workers = [], subcategoryMap = {}, from = 0, to = Number.MAX_SAFE_INTEGER } = opts;
  const staffById = new Map(staff.filter(s => s && s.id).map(s => [s.id, s]));
  const workersById = new Map(workers.filter(w => w && w.id).map(w => [w.id, w]));
  const excluded = excludedSet(subcategoryMap);

  const rows = new Map();
  const monthSet = new Set();
  const totalByMonth = {};
  const unassignedByMonth = {};
  const staffByMonth = {};
  const workerByMonth = {};
  let total = 0, unassigned = 0, unassignedCount = 0, excludedTotal = 0;

  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const when = ts(t.date);
    if (!when || when < from || when > to) continue;
    const amount = num(t.amount);
    // Не ФОТ — мимо кассы целиком. Сумму запоминаем только чтобы показать, сколько
    // расходов сознательно вынесено за рамки раздела.
    if (excluded.has(String(t.subcategory || "").trim())) { excludedTotal += amount; continue; }

    total += amount;
    const mk = payrollMonthKey(t.date);
    if (mk) { monthSet.add(mk); totalByMonth[mk] = (totalByMonth[mk] || 0) + amount; }

    const who = resolvePayee(t, { staffById, workersById, subcategoryMap });
    if (!who) {
      unassigned += amount; unassignedCount++;
      if (mk) unassignedByMonth[mk] = (unassignedByMonth[mk] || 0) + amount;
      continue;
    }

    const key = `${who.kind}:${who.id}`;
    if (!rows.has(key)) rows.set(key, {
      key, kind: who.kind, id: who.id, name: who.name, position: who.position,
      source: who.source, total: 0, count: 0, byMonth: {},
    });
    const r = rows.get(key);
    r.total += amount;
    r.count += 1;
    if (mk) r.byMonth[mk] = (r.byMonth[mk] || 0) + amount;
    if (mk) {
      const bag = who.kind === "staff" ? staffByMonth : workerByMonth;
      bag[mk] = (bag[mk] || 0) + amount;
    }
    // Если хотя бы одна операция человека размечена явно — помечаем строку как явную:
    // так видно, кто уже переведён на новое поле, а кто держится на соответствиях.
    if (who.source === "operation") r.source = "operation";
  }

  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  const staffRows = list.filter(r => r.kind === "staff");
  const workerRows = list.filter(r => r.kind === "worker");
  return {
    rows: list,
    staffRows,
    workerRows,
    months: [...monthSet].sort(),
    total,
    totalByMonth,
    excludedTotal,
    unassigned,
    unassignedByMonth,
    unassignedCount,
    staffTotal: staffRows.reduce((s, r) => s + r.total, 0),
    workerTotal: workerRows.reduce((s, r) => s + r.total, 0),
    staffByMonth,
    workerByMonth,
  };
}

// Подкатегории расходов со суммами — исходник для экрана разбора истории.
// Показываем ВСЕ, включая исключённые из ФОТ: там же владелец их и отмечает,
// а значит должен видеть.
export function expenseSubcategoryTotals(financeTx = []) {
  const g = new Map();
  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const key = String(t.subcategory || "").trim() || "— без подкатегории —";
    if (!g.has(key)) g.set(key, { subcategory: key, category: String(t.category || ""), count: 0, total: 0 });
    const r = g.get(key);
    r.count += 1;
    r.total += num(t.amount);
  }
  return [...g.values()].sort((a, b) => b.total - a.total);
}

// Расходные операции с уже разобранным получателем — для экрана массовой простановки.
// Возвращаем именно ОПЕРАЦИИ, а не подкатегории: в «Зарплатах рабочих / подрядчиков»
// 184 операции на разные бригады, и одним человеком такую подкатегорию не закрыть.
export function listExpenseOps(financeTx = [], opts = {}) {
  const { staff = [], workers = [], subcategoryMap = {},
    subcategory = "", onlyUnassigned = false, query = "",
    from = 0, to = Number.MAX_SAFE_INTEGER } = opts;
  const staffById = new Map(staff.filter(s => s && s.id).map(s => [s.id, s]));
  const workersById = new Map(workers.filter(w => w && w.id).map(w => [w.id, w]));
  const q = String(query || "").trim().toLowerCase();

  const rows = [];
  let total = 0, allCount = 0, allTotal = 0;
  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const when = ts(t.date);
    if (!when || when < from || when > to) continue;
    const amount = num(t.amount);
    allCount++; allTotal += amount;

    const who = resolvePayee(t, { staffById, workersById, subcategoryMap });
    if (subcategory && String(t.subcategory || "").trim() !== subcategory) continue;
    if (onlyUnassigned && who) continue;
    if (q) {
      const hay = `${t.subcategory || ""} ${txComment(t)} ${t.contractNo || ""} ${t.account || ""} ${t.recipient || ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    total += amount;
    rows.push({
      id: t.id, date: when, amount,
      subcategory: t.subcategory || "", category: t.category || "",
      contractNo: t.contractNo || "", comment: txComment(t),
      payee: who,
      // Явная разметка снимается кнопкой, разметка «по подкатегории» — только правилом.
      explicit: !!(t.payee && t.payee.id),
    });
  }
  rows.sort((a, b) => b.date - a.date);
  return { rows, total, count: rows.length, allCount, allTotal };
}

// Сводка по одному человеку: помесячно и по объектам. Для карточки сотрудника.
export function buildStaffDetail(financeTx = [], opts = {}) {
  const { staffId, workerId, staff = [], workers = [], subcategoryMap = {}, from = 0, to = Number.MAX_SAFE_INTEGER } = opts;
  const staffById = new Map(staff.filter(s => s && s.id).map(s => [s.id, s]));
  const workersById = new Map(workers.filter(w => w && w.id).map(w => [w.id, w]));
  const excluded = excludedSet(subcategoryMap);
  const wantKind = workerId ? "worker" : "staff";
  const wantId = workerId || staffId;
  const ops = [];
  const byMonth = {};
  const byContract = {};
  const bySubcategory = {};
  let total = 0, first = 0, last = 0;
  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const when = ts(t.date);
    if (!when || when < from || when > to) continue;
    const who = resolvePayee(t, { staffById, workersById, subcategoryMap });
    if (!who || who.kind !== wantKind || who.id !== wantId) continue;
    if (excluded.has(String(t.subcategory || "").trim())) continue;   // не ФОТ — не показываем
    const amount = num(t.amount);
    total += amount;
    if (!first || when < first) first = when;
    if (when > last) last = when;
    const mk = payrollMonthKey(t.date);
    if (mk) byMonth[mk] = (byMonth[mk] || 0) + amount;
    const cn = String(t.contractNo || "").trim() || "— без договора —";
    byContract[cn] = (byContract[cn] || 0) + amount;
    const sub = String(t.subcategory || "").trim() || "— без подкатегории —";
    bySubcategory[sub] = (bySubcategory[sub] || 0) + amount;
    ops.push({ id: t.id, date: when, month: mk, amount, subcategory: t.subcategory || "", contractNo: t.contractNo || "",
      comment: txComment(t), source: who.source });
  }
  ops.sort((a, b) => b.date - a.date);
  const monthsCount = Object.keys(byMonth).length;
  return {
    total, count: ops.length, byMonth, byContract, bySubcategory, ops,
    months: Object.keys(byMonth).sort(),
    first, last,
    // Средняя выплата и средний месяц — разные вещи: человеку могут платить трижды
    // в месяц частями, и «средняя выплата» тогда ни о чём не говорит.
    avgOp: ops.length ? total / ops.length : 0,
    avgMonth: monthsCount ? total / monthsCount : 0,
    maxOp: ops.reduce((m, o) => Math.max(m, o.amount), 0),
  };
}

// ── Динамика ────────────────────────────────────────────────────────────────
// ФОТ по месяцам на фоне всех расходов и выручки. Считаем из тех же операций, что
// и остальные финансы: переводы между своими счетами — не доход и не расход, они
// мимо. Расходы берём ВСЕ, включая помеченные «не ФОТ»: доля ФОТ имеет смысл
// только от полной суммы, которую компания потратила.
//
// basis — что считать зарплатой:
//   "all"   — всё, что не отмечено «не ФОТ» (как в отчёте «Кому сколько ушло»);
//   "named" — только выплаты с известным получателем.
// Пока история не разобрана до конца, «всё» завышает долю (в неё попадают материалы
// и эквайринг), а «только размеченное» её занижает — правда посередине, и владелец
// должен видеть обе границы, а не одну цифру, выдающую себя за истину.
export function buildPayrollDynamics(financeTx = [], report = null, opts = {}) {
  const { monthsBack = 12, basis = "all" } = opts;
  const payrollOf = (m) => basis === "named"
    ? (report?.staffByMonth?.[m] || 0) + (report?.workerByMonth?.[m] || 0)
    : (report?.totalByMonth?.[m] || 0);
  const incomeByMonth = {};
  const expenseByMonth = {};
  const monthSet = new Set(report?.months || []);
  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false) continue;
    if (t.type !== "income" && t.type !== "expense") continue;
    const mk = payrollMonthKey(t.date);
    if (!mk) continue;
    monthSet.add(mk);
    const bag = t.type === "income" ? incomeByMonth : expenseByMonth;
    bag[mk] = (bag[mk] || 0) + num(t.amount);
  }

  // Сколько человек получило деньги в месяце — по строкам отчёта, чтобы «средняя
  // на человека» не делилась на всех подряд, включая тех, кто в этом месяце не работал.
  const peopleByMonth = {};
  for (const r of (report?.rows || [])) {
    for (const [m, v] of Object.entries(r.byMonth || {})) if (v > 0) peopleByMonth[m] = (peopleByMonth[m] || 0) + 1;
  }

  const all = [...monthSet].sort();
  const idx = new Map(all.map((m, i) => [m, i]));
  const months = monthsBack > 0 ? all.slice(-monthsBack) : all;
  const rows = months.map(m => {
    const payroll = payrollOf(m);
    const income = incomeByMonth[m] || 0;
    const expense = expenseByMonth[m] || 0;
    const people = peopleByMonth[m] || 0;
    // Предыдущий месяц ищем во ВСЕЙ истории, а не в видимом окне: иначе у первой
    // строки таблицы изменения не было бы никогда, хотя данные за него есть.
    const prevKey = all[(idx.get(m) ?? 0) - 1] || null;
    const prev = prevKey ? payrollOf(prevKey) : null;
    return {
      month: m, payroll, income, expense, people,
      staff: report?.staffByMonth?.[m] || 0,
      worker: report?.workerByMonth?.[m] || 0,
      unassigned: report?.unassignedByMonth?.[m] || 0,
      shareExpense: expense > 0 ? payroll / expense : null,
      shareIncome: income > 0 ? payroll / income : null,
      avgPerPerson: people > 0 ? payroll / people : 0,
      prevMonth: prevKey, prevPayroll: prev,
      delta: prev === null ? null : payroll - prev,
      deltaPct: prev ? (payroll - prev) / prev : null,
    };
  });

  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const totalPayroll = sum(r => r.payroll);
  const totalIncome = sum(r => r.income);
  const totalExpense = sum(r => r.expense);
  return {
    rows, months, allMonths: all, basis,
    last: rows[rows.length - 1] || null,
    maxPayroll: rows.reduce((m, r) => Math.max(m, r.payroll), 0),
    maxBar: rows.reduce((m, r) => Math.max(m, r.payroll, r.income), 0),
    totalPayroll, totalIncome, totalExpense,
    avgPayroll: rows.length ? totalPayroll / rows.length : 0,
    shareExpense: totalExpense > 0 ? totalPayroll / totalExpense : null,
    shareIncome: totalIncome > 0 ? totalPayroll / totalIncome : null,
  };
}

// Кто вырос, кто просел: месяц к месяцу по людям.
// Появившихся и переставших получать помечаем отдельно — «рост на 100%» от нуля
// это не рост, а новый человек, и читать это как процент нельзя.
export function payrollMovers(report = null, monthPrev = "", monthCur = "") {
  const list = [];
  for (const r of (report?.rows || [])) {
    const prev = r.byMonth?.[monthPrev] || 0;
    const cur = r.byMonth?.[monthCur] || 0;
    if (!prev && !cur) continue;
    list.push({
      key: r.key, kind: r.kind, id: r.id, name: r.name, position: r.position,
      prev, cur, delta: cur - prev,
      pct: prev > 0 && cur > 0 ? (cur - prev) / prev : null,
      appeared: !prev && cur > 0,
      stopped: prev > 0 && !cur,
    });
  }
  return {
    up: list.filter(x => x.delta > 0).sort((a, b) => b.delta - a.delta),
    down: list.filter(x => x.delta < 0).sort((a, b) => a.delta - b.delta),
  };
}

// Номер договора → человеческое название объекта. В операции лежит только номер
// («№0919#152»), а владельцу нужен адрес. Связь ищем ровно так же, как её ищут
// финансы: сначала договоры, потом финпроекты, и только по номеру — имя и телефон
// ключами связи не являются.
export function contractObjectIndex({ objects = [], contracts = [], finProjects = [] } = {}) {
  const objById = new Map(objects.filter(o => o && o.id).map(o => [o.id, o]));
  const byNo = new Map();
  const put = (no, objectId) => {
    const k = normCN(no);
    if (k && objectId && !byNo.has(k)) byNo.set(k, objectId);
  };
  for (const c of contracts) { if (!c || c.deletedAt) continue; put(c.number, c.objectId); put(c.mainNumber, c.objectId); }
  for (const p of finProjects) { if (!p || p.deletedAt) continue; put(p.contractNo, p.objectId); }
  return (no) => {
    const o = objById.get(byNo.get(normCN(no)));
    if (!o) return "";
    return String(o.address || o.clientName || "").trim();
  };
}
