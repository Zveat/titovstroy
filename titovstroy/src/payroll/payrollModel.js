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
export const STAFF_STATUSES = [
  { key: "active", label: "Работает", color: "#059669", bg: "#ecfdf5" },
  { key: "fired",  label: "Уволен",   color: "#94a3b8", bg: "#f1f5f9" },
];
export const staffStatusMeta = (k) => STAFF_STATUSES.find(s => s.key === k) || STAFF_STATUSES[0];

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

  const rows = new Map();
  const monthSet = new Set();
  let total = 0, unassigned = 0, unassignedCount = 0;

  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const when = ts(t.date);
    if (!when || when < from || when > to) continue;
    const amount = num(t.amount);
    total += amount;
    const mk = payrollMonthKey(t.date);
    if (mk) monthSet.add(mk);

    const who = resolvePayee(t, { staffById, workersById, subcategoryMap });
    if (!who) { unassigned += amount; unassignedCount++; continue; }

    const key = `${who.kind}:${who.id}`;
    if (!rows.has(key)) rows.set(key, {
      key, kind: who.kind, id: who.id, name: who.name, position: who.position,
      source: who.source, total: 0, count: 0, byMonth: {},
    });
    const r = rows.get(key);
    r.total += amount;
    r.count += 1;
    if (mk) r.byMonth[mk] = (r.byMonth[mk] || 0) + amount;
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
    unassigned,
    unassignedCount,
    staffTotal: list.filter(r => r.kind === "staff").reduce((s, r) => s + r.total, 0),
    workerTotal: list.filter(r => r.kind === "worker").reduce((s, r) => s + r.total, 0),
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

// Сводка по одному человеку: помесячно и по объектам. Для карточки сотрудника.
export function buildStaffDetail(financeTx = [], opts = {}) {
  const { staffId, workerId, staff = [], workers = [], subcategoryMap = {}, from = 0, to = Number.MAX_SAFE_INTEGER } = opts;
  const staffById = new Map(staff.filter(s => s && s.id).map(s => [s.id, s]));
  const workersById = new Map(workers.filter(w => w && w.id).map(w => [w.id, w]));
  const wantKind = workerId ? "worker" : "staff";
  const wantId = workerId || staffId;
  const ops = [];
  const byMonth = {};
  const byContract = {};
  let total = 0;
  for (const t of financeTx) {
    if (!t || t.deletedAt || t.included === false || t.type !== "expense") continue;
    const when = ts(t.date);
    if (!when || when < from || when > to) continue;
    const who = resolvePayee(t, { staffById, workersById, subcategoryMap });
    if (!who || who.kind !== wantKind || who.id !== wantId) continue;
    const amount = num(t.amount);
    total += amount;
    const mk = payrollMonthKey(t.date);
    if (mk) byMonth[mk] = (byMonth[mk] || 0) + amount;
    const cn = String(t.contractNo || "").trim() || "— без договора —";
    byContract[cn] = (byContract[cn] || 0) + amount;
    ops.push({ id: t.id, date: when, amount, subcategory: t.subcategory || "", contractNo: t.contractNo || "",
      comment: t.comment || t.description || "", source: who.source });
  }
  ops.sort((a, b) => b.date - a.date);
  return { total, count: ops.length, byMonth, byContract, ops };
}
