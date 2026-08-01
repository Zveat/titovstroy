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

export const STAFF_KEY = "titovstroy-staff";
export const STAFF_BACKUPS_KEY = "titovstroy-staff-backups";
export const PAYROLL_MAP_KEY = "titovstroy-payroll-map";

export const PAYEE_KINDS = { staff: "Сотрудник", worker: "Подрядчик" };

// Подкатегории, которые ДЕНЬГИ человеку, но НЕ зарплата: дивиденды, возврат займа
// и т.п. Видеть их в разрезе по людям нужно, считать зарплатой — нельзя, иначе
// сверка «начислено / выплачено» покажет вечную переплату.
// Живут в той же карте правил под служебным ключом: имя подкатегории никогда не
// начинается с «__», поэтому пересечься они не могут.
export const NON_WAGE_KEY = "__nonWage";
export const nonWageSet = (map) => new Set(Array.isArray(map?.[NON_WAGE_KEY]) ? map[NON_WAGE_KEY] : []);
export const isNonWage = (tx, map) => nonWageSet(map).has(String(tx?.subcategory || "").trim());
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
// Считаем ТОЛЬКО расходы: приход и переводы между счетами к ФОТ отношения не имеют.
// Операции без получателя НЕ выбрасываем — они идут в «не разложено», иначе итог отчёта
// молча разошёлся бы с итогом расходов, а это ровно тот класс вранья, который мы чиним.
export function buildPayrollReport(financeTx = [], opts = {}) {
  const { staff = [], workers = [], subcategoryMap = {}, from = 0, to = Number.MAX_SAFE_INTEGER } = opts;
  const staffById = new Map(staff.filter(s => s && s.id).map(s => [s.id, s]));
  const workersById = new Map(workers.filter(w => w && w.id).map(w => [w.id, w]));

  const nonWage = nonWageSet(subcategoryMap);
  const rows = new Map();
  const monthSet = new Set();
  // Помесячные итоги считаем и для «не разложено», и для всего расхода: иначе колонка
  // месяца в таблице показывала бы только именованные строки и не сходилась бы с «Всего».
  const unassignedByMonth = {};
  const totalByMonth = {};
  // Те же итоги, но по ЗАРПЛАТНОЙ базе. Нужны, чтобы вся таблица могла считаться
  // только по ФОТ и при этом сходиться сама с собой: без этого зарплату пришлось бы
  // вычитать в уме из «всего».
  const wageByMonthTotal = {};
  const unassignedWageByMonth = {};
  let total = 0, unassigned = 0, unassignedCount = 0, wageTotal = 0, nonWageTotal = 0;
  let unassignedWage = 0, unassignedWageCount = 0;

  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const when = ts(t.date);
    if (!when || when < from || when > to) continue;
    const amount = num(t.amount);
    total += amount;
    const mk = payrollMonthKey(t.date);
    if (mk) { monthSet.add(mk); totalByMonth[mk] = (totalByMonth[mk] || 0) + amount; }

    const nw = nonWage.has(String(t.subcategory || "").trim());
    if (nw) nonWageTotal += amount;
    else { wageTotal += amount; if (mk) wageByMonthTotal[mk] = (wageByMonthTotal[mk] || 0) + amount; }

    const who = resolvePayee(t, { staffById, workersById, subcategoryMap });
    if (!who) {
      unassigned += amount; unassignedCount++;
      if (mk) unassignedByMonth[mk] = (unassignedByMonth[mk] || 0) + amount;
      if (!nw) {
        unassignedWage += amount; unassignedWageCount++;
        if (mk) unassignedWageByMonth[mk] = (unassignedWageByMonth[mk] || 0) + amount;
      }
      continue;
    }

    const key = `${who.kind}:${who.id}`;
    if (!rows.has(key)) rows.set(key, {
      key, kind: who.kind, id: who.id, name: who.name, position: who.position,
      source: who.source, total: 0, count: 0, byMonth: {},
      // wage* — только зарплатная часть. Именно она сверяется с начислениями.
      wage: 0, nonWage: 0, wageByMonth: {},
    });
    const r = rows.get(key);
    r.total += amount;
    r.count += 1;
    if (mk) r.byMonth[mk] = (r.byMonth[mk] || 0) + amount;
    if (nw) r.nonWage += amount;
    else { r.wage += amount; if (mk) r.wageByMonth[mk] = (r.wageByMonth[mk] || 0) + amount; }
    // Если хотя бы одна операция человека размечена явно — помечаем строку как явную:
    // так видно, кто уже переведён на новое поле, а кто держится на соответствиях.
    if (who.source === "operation") r.source = "operation";
  }

  const list = [...rows.values()].sort((a, b) => b.total - a.total);
  const months = [...monthSet].sort();
  return {
    rows: list,
    months,
    total,
    wageTotal,
    nonWageTotal,
    totalByMonth,
    wageByMonthTotal,
    unassigned,
    unassignedByMonth,
    unassignedCount,
    unassignedWage,
    unassignedWageByMonth,
    unassignedWageCount,
    staffTotal: list.filter(r => r.kind === "staff").reduce((s, r) => s + r.total, 0),
    workerTotal: list.filter(r => r.kind === "worker").reduce((s, r) => s + r.total, 0),
    staffWage: list.filter(r => r.kind === "staff").reduce((s, r) => s + r.wage, 0),
    workerWage: list.filter(r => r.kind === "worker").reduce((s, r) => s + r.wage, 0),
  };
}

// Подкатегории расходов со суммами — исходник для экрана «разбор истории».
// Показываем ВСЕ, а не только похожие на ФОТ: что считать зарплатой, решает владелец,
// а не регулярное выражение по названию.
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
  const nonWage = nonWageSet(subcategoryMap);
  const wantKind = workerId ? "worker" : "staff";
  const wantId = workerId || staffId;
  const ops = [];
  const byMonth = {};
  const byContract = {};
  let total = 0, wage = 0, nonWageSum = 0;
  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const when = ts(t.date);
    if (!when || when < from || when > to) continue;
    const who = resolvePayee(t, { staffById, workersById, subcategoryMap });
    if (!who || who.kind !== wantKind || who.id !== wantId) continue;
    const amount = num(t.amount);
    const nw = nonWage.has(String(t.subcategory || "").trim());
    total += amount;
    if (nw) nonWageSum += amount; else wage += amount;
    const mk = payrollMonthKey(t.date);
    if (mk) byMonth[mk] = (byMonth[mk] || 0) + amount;
    const cn = String(t.contractNo || "").trim() || "— без договора —";
    byContract[cn] = (byContract[cn] || 0) + amount;
    ops.push({ id: t.id, date: when, amount, subcategory: t.subcategory || "", contractNo: t.contractNo || "",
      comment: txComment(t), source: who.source, nonWage: nw });
  }
  ops.sort((a, b) => b.date - a.date);
  return { total, wage, nonWage: nonWageSum, count: ops.length, byMonth, byContract, ops };
}
