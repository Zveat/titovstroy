// ─────────────────────────────────────────────────────────────────────────────
// ФОТ, часть вторая: НАЧИСЛЕНО (сколько человек заработал) против ВЫПЛАЧЕНО
// (сколько ему ушло денег из кассы). Первая часть модуля отвечала только на
// второй вопрос, а весь смысл мотивации — в разнице между ними.
//
// Почему это отдельный слой, а не поле в операции:
//   • бонус РОПа начисляется при СДАЧЕ объекта, а платится когда угодно потом —
//     месяц начисления и месяц выплаты в принципе разные;
//   • оклад начисляется, даже если в этом месяце не заплатили ни тенге;
//   • авансы — это выплата без начисления, и они должны уходить в минус долга,
//     а не теряться.
//
// ГЛАВНОЕ ПРАВИЛО: ничего не начисляется само. Модель только ПРЕДЛАГАЕТ
// (proposeAccruals), записывает — владелец кнопкой. Ни объекты, ни производство,
// ни финансы этот слой не читает на запись и никогда не меняет.
// ─────────────────────────────────────────────────────────────────────────────

import { payrollMonthKey } from "./payrollModel.js";

export const ACCRUALS_KEY = "titovstroy-payroll-accruals";
export const ACCRUALS_BACKUPS_KEY = "titovstroy-payroll-accruals-backups";

export const ACCRUAL_KINDS = {
  salary:  { label: "Оклад",        color: "#2563eb", bg: "#eff6ff" },
  percent: { label: "% с объекта",  color: "#059669", bg: "#ecfdf5" },
  piece:   { label: "За единицу",   color: "#7c3aed", bg: "#f5f3ff" },
  manual:  { label: "Вручную",      color: "#64748b", bg: "#f1f5f9" },
};
export const accrualKindMeta = (k) => ACCRUAL_KINDS[k] || ACCRUAL_KINDS.manual;

export const PERCENT_TRIGGERS = [
  { key: "handover", label: "при сдаче объекта", hint: "бонус попадает в месяц фактического окончания работ" },
  { key: "signed",   label: "при подписании",    hint: "бонус попадает в месяц продажи / даты договора" },
];

const num = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const ts = (v) => { if (!v) return 0; const d = new Date(v); return isNaN(d) ? 0 : d.getTime(); };
// Имена менеджеров в объектах живут строкой и пишутся по-разному («Сергей Штанько»,
// «Сергей Ш.», «Сергей Ш»). Сравниваем по огрублённому ключу, иначе один и тот же
// человек размажется на три строки отчёта.
const normName = (v) => String(v || "").trim().replace(/\s+/g, " ").replace(/\.+$/, "").toLowerCase();

export function normalizeScheme(raw = {}) {
  const s = raw || {};
  return {
    salary: Math.max(0, num(s.salary)),
    percentRate: Math.max(0, num(s.percentRate)),
    percentTrigger: s.percentTrigger === "signed" ? "signed" : "handover",
    pieceRate: Math.max(0, num(s.pieceRate)),
    pieceLabel: String(s.pieceLabel || "").trim() || "целевой замер",
    // Как этот человек подписан в поле «менеджер» на объектах. Список, а не строка:
    // в боевой базе одно и то же имя встречается в трёх написаниях.
    managerNames: Array.isArray(s.managerNames)
      ? s.managerNames.map(x => String(x || "").trim()).filter(Boolean)
      : String(s.managerNames || "").split(",").map(x => x.trim()).filter(Boolean),
  };
}
export const schemeIsEmpty = (sc) => {
  const s = normalizeScheme(sc);
  return !s.salary && !s.percentRate && !s.pieceRate;
};

export function normalizeAccrual(raw = {}) {
  const kind = ACCRUAL_KINDS[raw.kind] ? raw.kind : "manual";
  return {
    id: raw.id || "",
    staffId: raw.staffId || "",
    month: String(raw.month || ""),
    kind,
    amount: Math.round(num(raw.amount)),
    base: num(raw.base) || 0,
    rate: num(raw.rate) || 0,
    qty: num(raw.qty) || 0,
    objectId: raw.objectId || "",
    objectLabel: String(raw.objectLabel || ""),
    note: String(raw.note || "").trim(),
    source: raw.source === "auto" ? "auto" : "manual",
    createdAt: raw.createdAt || Date.now(),
  };
}

// Ключ «одно и то же начисление». По нему предложения не дублируются: пересчитать
// месяц можно сколько угодно раз, второй раз то же самое не предложится.
export const accrualKey = (a) => `${a.staffId}|${a.month}|${a.kind}|${a.objectId || ""}`;

// ── События по объектам ─────────────────────────────────────────────────────
// Одна строка на объект: сколько стоит договор, когда подписали, когда сдали.
// Собираем из того, что уже есть в базе; ничего не досочиняем — если суммы нет,
// так и пишем, и объект уходит в «нужно разобраться», а не в тихий ноль.
export function buildObjectEvents({ objects = [], productions = [], finProjects = [], contracts = [] } = {}) {
  const prodBy = new Map();
  for (const p of productions) if (p && p.objectId) prodBy.set(p.objectId, p);
  const projBy = new Map();
  for (const p of finProjects) if (p && p.objectId && !p.deletedAt) projBy.set(p.objectId, p);
  // Дата основного договора — запасной источник для триггера «при подписании».
  const contractBy = new Map();
  for (const c of contracts) {
    if (!c || !c.objectId || c.deletedAt) continue;
    if (c.type === "podryad" || c.type === "podryad_annex") continue;   // это себестоимость, не продажа
    const when = ts(c.date || c.mainDate);
    if (!when) continue;
    const prev = contractBy.get(c.objectId);
    if (!prev || when < prev.when) contractBy.set(c.objectId, { when, number: c.number || "" });
  }

  const out = [];
  for (const o of objects) {
    if (!o || o.deletedAt) continue;
    const prod = prodBy.get(o.id) || null;
    const proj = projBy.get(o.id) || null;
    // Отменённое не премируется.
    const cancelled = prod?.prodStatus === "cancel" || o.status === "cancel" ||
      String(proj?.status || "").toLowerCase().includes("отмен");
    if (cancelled) continue;

    const contract = contractBy.get(o.id) || null;
    const signedAt = ts(prod?.saleDate) || (contract ? contract.when : 0) || ts(proj?.createdAt);
    // Сдача — только по факту завершённого производства. У расторгнутых объектов
    // дата окончания тоже проставлена, поэтому одной даты мало (ловили на гарантии).
    const handoverAt = prod?.prodStatus === "done" ? ts(prod?.factEndDate) : 0;

    out.push({
      objectId: o.id,
      label: String(o.address || o.clientName || proj?.description || "Объект").trim(),
      manager: String(o.manager || "").trim(),
      contractNo: proj?.contractNo || contract?.number || "",
      budget: num(proj?.budget),
      hasProject: !!proj,
      signedAt,
      handoverAt,
    });
  }
  return out;
}

// Кто из сотрудников стоит за именем менеджера на объекте.
export function matchStaffByManager(managerName, staff = []) {
  const key = normName(managerName);
  if (!key) return null;
  for (const s of staff) {
    if (!s || !s.id) continue;
    const sc = normalizeScheme(s.scheme);
    if (sc.managerNames.some(n => normName(n) === key)) return s;
  }
  // Запасной вариант — совпадение по имени сотрудника: если владелец завёл человека
  // ровно так же, как он подписан на объектах, отдельную настройку требовать незачем.
  for (const s of staff) if (s && s.id && normName(s.name) === key) return s;
  return null;
}

// ── Предложения к начислению за месяц ───────────────────────────────────────
// Возвращает то, что МОЖНО начислить, и отдельно — то, с чем нужно разобраться
// руками. Ничего не сохраняет.
export function proposeAccruals({ month, staff = [], events = [], existing = [] } = {}) {
  const items = [];
  const issues = [];
  if (!month) return { items, issues };

  const have = new Set((existing || []).map(a => accrualKey(normalizeAccrual(a))));
  const active = staff.filter(s => s && s.id && s.status !== "fired");

  // 1. Оклады — по одному на человека в месяц.
  for (const s of active) {
    const sc = normalizeScheme(s.scheme);
    if (sc.salary <= 0) continue;
    const a = normalizeAccrual({ staffId: s.id, month, kind: "salary", amount: sc.salary,
      source: "auto", note: "оклад по схеме" });
    if (!have.has(accrualKey(a))) items.push({ ...a, staffName: s.name, reason: "оклад" });
  }

  // 2. Процент с объектов — по триггеру каждого сотрудника отдельно: у РОПа бонус
  //    может считаться при сдаче, а у кого-то при подписании.
  const wantPercent = active.filter(s => normalizeScheme(s.scheme).percentRate > 0);
  // Какие триггеры вообще используются. Если бонусы у всех считаются при сдаче, то
  // месяц подписания — не событие: гнать такие объекты в «разобраться» значит топить
  // настоящие пропуски в шуме.
  const usedTriggers = new Set(wantPercent.map(s => normalizeScheme(s.scheme).percentTrigger));
  for (const ev of events) {
    const inMonthHandover = ev.handoverAt && payrollMonthKey(ev.handoverAt) === month;
    const inMonthSigned = ev.signedAt && payrollMonthKey(ev.signedAt) === month;
    if (!inMonthHandover && !inMonthSigned) continue;

    const who = matchStaffByManager(ev.manager, staff);
    if (!who || who.status === "fired" || normalizeScheme(who.scheme).percentRate <= 0) {
      // Событие месяца, за которое кому-то может быть положен процент, но получателя
      // не видно. Молчать нельзя: именно так бонусы и теряются.
      const relevant = [inMonthHandover && "handover", inMonthSigned && "signed"]
        .filter(t => t && usedTriggers.has(t));
      if (relevant.length) issues.push({
        objectId: ev.objectId, label: ev.label, manager: ev.manager, budget: ev.budget,
        contractNo: ev.contractNo,
        trigger: relevant[0],
        reason: !ev.manager ? "на объекте не указан менеджер"
          : !who ? `«${ev.manager}» не связан ни с одним сотрудником`
          : who.status === "fired" ? `${who.name} уволен`
          : `у ${who.name} не задан процент`,
      });
      continue;
    }
    const sc = normalizeScheme(who.scheme);
    const fired = sc.percentTrigger === "handover" ? inMonthHandover : inMonthSigned;
    if (!fired) continue;
    if (ev.budget <= 0) {
      issues.push({ objectId: ev.objectId, label: ev.label, manager: ev.manager, budget: 0,
        contractNo: ev.contractNo, trigger: sc.percentTrigger,
        reason: ev.hasProject ? "в проекте не заполнена сумма договора" : "у объекта нет проекта в финансах" });
      continue;
    }
    const a = normalizeAccrual({
      staffId: who.id, month, kind: "percent", objectId: ev.objectId, objectLabel: ev.label,
      base: ev.budget, rate: sc.percentRate, amount: Math.round(ev.budget * sc.percentRate / 100),
      source: "auto",
      note: `${sc.percentRate}% от ${Math.round(ev.budget).toLocaleString("ru-RU")} ₸${ev.contractNo ? ` · ${ev.contractNo}` : ""}`,
    });
    if (!have.has(accrualKey(a))) items.push({ ...a, staffName: who.name,
      reason: sc.percentTrigger === "handover" ? "сдача объекта" : "подписание договора" });
  }

  items.sort((a, b) => b.amount - a.amount);
  issues.sort((a, b) => b.budget - a.budget);
  return { items, issues };
}

// ── Сверка: начислено против выплаченного ───────────────────────────────────
// paidByStaff — то, что уже посчитал buildPayrollReport: { staffId: {byMonth, total} }.
//
// Считаем ТОЛЬКО с первого месяца, в котором есть начисления. Иначе у человека,
// которому платили год до внедрения раздела, вылезла бы гигантская «переплата» —
// формально верная и абсолютно бесполезная.
export function buildPayrollBalance({ staff = [], accruals = [], paidByStaff = {} } = {}) {
  const byStaff = new Map();
  for (const raw of accruals) {
    const a = normalizeAccrual(raw);
    if (!a.staffId || !a.month) continue;
    if (!byStaff.has(a.staffId)) byStaff.set(a.staffId, { accrued: {}, kinds: {} });
    const r = byStaff.get(a.staffId);
    r.accrued[a.month] = (r.accrued[a.month] || 0) + a.amount;
    r.kinds[a.kind] = (r.kinds[a.kind] || 0) + a.amount;
  }

  const rows = [];
  const monthSet = new Set();
  for (const s of staff) {
    if (!s || !s.id) continue;
    const acc = byStaff.get(s.id);
    if (!acc) continue;                       // учёт начислений по человеку не ведётся
    const accMonths = Object.keys(acc.accrued).sort();
    const startMonth = accMonths[0];
    const paidAll = paidByStaff[s.id]?.byMonth || {};
    const months = [...new Set([...accMonths, ...Object.keys(paidAll).filter(m => m >= startMonth)])].sort();

    let accrued = 0, paid = 0;
    const byMonth = {};
    for (const m of months) {
      const a = acc.accrued[m] || 0;
      const p = paidAll[m] || 0;
      accrued += a; paid += p;
      byMonth[m] = { accrued: a, paid: p, delta: a - p };
      monthSet.add(m);
    }
    rows.push({
      staffId: s.id, name: s.name || "Без имени", position: s.position || "",
      startMonth, months, byMonth, kinds: acc.kinds,
      accrued, paid, balance: accrued - paid,
    });
  }

  rows.sort((a, b) => b.balance - a.balance);
  return {
    rows,
    months: [...monthSet].sort(),
    accrued: rows.reduce((s, r) => s + r.accrued, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    // Долг компании перед людьми и переплата — врозь: сложив их в одну цифру,
    // мы бы показали ноль там, где одному должны, а другому переплатили.
    debt: rows.filter(r => r.balance > 0).reduce((s, r) => s + r.balance, 0),
    advance: rows.filter(r => r.balance < 0).reduce((s, r) => s - r.balance, 0),
  };
}

// Начисления одного месяца, сгруппированные по людям — для экрана месяца.
export function monthAccruals(accruals = [], month, staff = []) {
  const nameOf = new Map(staff.filter(s => s && s.id).map(s => [s.id, s]));
  const list = accruals
    .map(normalizeAccrual)
    .filter(a => a.month === month)
    .map(a => ({ ...a, staffName: nameOf.get(a.staffId)?.name || "Сотрудник (удалён)",
      position: nameOf.get(a.staffId)?.position || "" }))
    .sort((a, b) => b.amount - a.amount);
  return { list, total: list.reduce((s, a) => s + a.amount, 0) };
}
