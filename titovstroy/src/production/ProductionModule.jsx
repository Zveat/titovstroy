import { useState, useMemo, useEffect, Fragment } from "react";
import { STAGE_STATUSES, emptyProduction } from "./constants.js";

// ─────────────────────────────────────────────────────────────────────────
// ПРОИЗВОДСТВО — управление и контроль объектов в работе.
// Полностью изолированный модуль: данные приходят через props, сохранение
// делегируется в App.jsx (onSaveProduction). Не зависит от внутренностей App.
//
// props:
//   objects        — живые объекты (liveObjects)
//   estimates      — все сметы (для привязки и автозаполнения этапов)
//   contracts      — все договоры (для отображения)
//   productions    — массив производственных карточек [{objectId, ...}]
//   onSaveProduction(record) — upsert одной карточки
//   buildStagesFromEstimate(objectId) — этапы из сметы [{cat, name, priceClient, costPlan}]
//   fmt, genId, currentUser
// ─────────────────────────────────────────────────────────────────────────

const stByKey = (k) => STAGE_STATUSES.find(s => s.key === k) || STAGE_STATUSES[0];

// Статусы производственных объектов (жизненный цикл)
const PROD_STATUSES = [
  { key: "new",     label: "Новый",          color: "#7c3aed", bg: "rgba(124,58,237,.1)"  },
  { key: "active",  label: "В работе",       color: "#2563eb", bg: "#eff6ff"               },
  { key: "paused",  label: "Приостановлен",  color: "#f59e0b", bg: "rgba(245,158,11,.1)"  },
  { key: "done",    label: "Выполнен",       color: "#059669", bg: "rgba(5,150,105,.1)"   },
  { key: "cancel",  label: "Отменён",        color: "#94a3b8", bg: "#f3f4f6"               },
];
const psByKey = (k) => PROD_STATUSES.find(s => s.key === k) || PROD_STATUSES[1];

// Превратить строки сметы в строки-работы (наименования). cat = блок-заголовок.
const estToStages = (fromEst, genId) => fromEst.map(s => ({
  id: genId(), cat: s.cat || "Прочее", name: s.name || "", unit: s.unit || "", qty: s.qty || 0,
  planStart: "", planEnd: "", factStart: "", factEnd: "",
  status: "todo", responsible: "", note: "", paid: false,
  priceClient: s.priceClient || 0, costPlan: s.costPlan || 0,
}));

// Группировка строк по Заголовку (категории) с сохранением порядка
const groupByCat = (rows) => {
  const g = {}; const order = [];
  for (const s of rows) { const c = s.cat || "Прочее"; if (!g[c]) { g[c] = []; order.push(c); } g[c].push(s); }
  return order.map(c => [c, g[c]]);
};

// Имя/адрес из проекта Финансов (description = "Клиент | Адрес | Телефон")
const projTitle = (p) => {
  const d = (p.description || "").split("|").map(s => s.trim());
  return d[0] || ("№" + (p.contractNo || "")) || "Проект";
};
const projAddress = (p) => {
  const d = (p.description || "").split("|").map(s => s.trim());
  return d[1] || "";
};

const _normCN = (s) => String(s||"").trim().toLowerCase().replace(/\s+/g,"");

export default function ProductionModule({
  objects, entries = [], allObjects, unlinkedProjects, estimates, contracts, productions,
  onSaveProduction, onDeleteProduction, onToggleClientShare, buildStagesFromEstimate,
  finProjects, financeTx,
  fmt, genId, currentUser,
}) {
  const [shareLink, setShareLink] = useState(null); // ссылка для клиента после включения доступа
  const [shareBusy, setShareBusy] = useState(false);
  // карта запись производства по ключу записи (objectId реального объекта или "fp:<id>")
  const entryByKey = useMemo(() => { const m = {}; for (const e of entries) m[e.key] = e; return m; }, [entries]);
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState("info");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // «Все» — иначе новые карточки (статус «new») прячутся под «В работе»
  const [addOpen, setAddOpen] = useState(false);

  const prodByObj = useMemo(() => {
    const m = {};
    for (const p of (productions || [])) m[p.objectId] = p;
    return m;
  }, [productions]);

  const launchProgress = (p) => {
    if (!p || !p.checklistLaunch?.length) return 0;
    const done = p.checklistLaunch.filter(x => x.done).length;
    return Math.round(done / p.checklistLaunch.length * 100);
  };

  // Объект может быть реальным (из objects) либо "виртуальным" — из карточки производства,
  // созданной по проекту Финансов (objectId начинается с "fp:").
  const openObj = openId ? (
    (allObjects || objects).find(o => o.id === openId) ||
    (() => { const e = entryByKey[openId]; if (e) return { id: openId, clientName: e.name || "Проект", address: e.address || "", clientPhone: "" }; const pr = prodByObj[openId]; return pr ? { id: openId, clientName: pr.title || "Проект", address: pr.address || "", clientPhone: "" } : null; })()
  ) : null;
  const openProd = openObj ? (prodByObj[openObj.id] || emptyProduction(openObj.id, genId)) : null;

  // АВТОЗАПОЛНЕНИЕ: при первом открытии объекта тянем этапы из сметы (категория › подкатегория).
  // Срабатывает только если карточки производства ещё нет — дальше пользователь управляет сам.
  useEffect(() => {
    if (!openObj) return;
    if (prodByObj[openObj.id]) return; // карточка уже существует — не трогаем
    const fromEst = buildStagesFromEstimate(openObj.id);
    const base = emptyProduction(openObj.id, genId);
    const record = { ...base, stages: fromEst.length ? estToStages(fromEst, genId) : [], updatedAt: Date.now() };
    onSaveProduction(record);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const patchProd = (patch) => onSaveProduction({ ...openProd, ...patch, updatedAt: Date.now() });

  // Данные из Финансов для текущего объекта — ДОЛЖНЫ быть до if(!openObj), иначе нарушение Rules of Hooks
  const finProj = useMemo(() => {
    if (!openObj || !finProjects?.length) return null;
    let fp = finProjects.find(p => p.objectId === openObj.id);
    if (fp) return fp;
    const objContracts = (contracts||[]).filter(c => c.objectId === openObj.id);
    for (const c of objContracts) {
      fp = finProjects.find(p => _normCN(p.contractNo) === _normCN(c.number));
      if (fp) return fp;
    }
    if (openObj.clientName && openObj.clientName.length > 2) {
      fp = finProjects.find(p => {
        const d = ((p.description||"")+" "+(p.comment||"")).toLowerCase();
        return d.includes(openObj.clientName.toLowerCase());
      });
    }
    return fp || null;
  }, [openObj, finProjects, contracts]);

  const finSummary = useMemo(() => {
    if (!finProj) return null;
    const cn = _normCN(finProj.contractNo);
    const txList = (financeTx||[]).filter(t => !t.deletedAt && t.included !== false && _normCN(t.contractNo) === cn);
    const income = txList.filter(t => t.type === "income").reduce((s,t) => s+(Number(t.amount)||0), 0);
    const expense = txList.filter(t => t.type === "expense").reduce((s,t) => s+(Number(t.amount)||0), 0);
    const budget = Number(finProj.budget) || 0;
    const debt = Math.max(0, budget - income);
    const margin = income > 0 ? Math.round((income - expense) / income * 100) : null;
    return { budget, income, expense, debt, margin, contractNo: finProj.contractNo, status: finProj.rawStatus || finProj.status };
  }, [finProj, financeTx]);

  const contractByObj = useMemo(() => {
    const m = {};
    for (const c of (contracts || [])) {
      if (c.objectId && !c.deletedAt && !m[c.objectId]) m[c.objectId] = c.number;
    }
    return m;
  }, [contracts]);

  // Финансовая сводка для каждой записи производства — берётся напрямую из prodEntries (источник = финпроект)
  const finSummaryMap = useMemo(() => {
    const map = {};
    for (const e of entries) map[e.key] = { budget: e.budget, income: e.income, expense: e.expense, debt: e.debt, margin: e.margin, contractNo: e.contractNo };
    return map;
  }, [entries]);

  // ─── СПИСОК ОБЪЕКТОВ ───
  if (!openObj) {
    const q = search.toLowerCase().trim();
    const num = v => Number(v) || 0;
    const today = _dayStart(new Date());
    const nowD = new Date();
    // Список = ВСЕ финпроекты (одна запись на проект). Источник — entries из App.
    const baseEntries = entries.map(e => ({ id: e.key, name: e.name || "Без названия", address: e.address || "—", updatedAt: prodByObj[e.key]?.updatedAt || 0 }));
    // Метрики объекта для светофора и сводки (тянутся из этапов/смет/производства)
    const metricsOf = (id) => {
      const p = prodByObj[id];
      const sts = p?.stages || [];
      const pc = sts.reduce((s, x) => s + num(x.priceClient), 0);
      const cp = sts.reduce((s, x) => s + num(x.costPlan), 0);
      const cf = sts.reduce((s, x) => s + num(x.costFact), 0);
      const mPlan = pc ? Math.round((pc - cp) / pc * 100) : null;
      const mFact = (pc && cf) ? Math.round((pc - cf) / pc * 100) : null;
      const doneStages = sts.filter(s => s.status === "done").length;
      const prog = sts.length ? Math.round(doneStages / sts.length * 100) : launchProgress(p);
      const defectsOpen = (p?.defects || []).filter(d => !d.done).length;
      // статус производства: сохранённый → иначе по статусу финпроекта (новый/в работе/выполнен/отменён)
      const e = entryByKey[id];
      const prodStatus = p?.prodStatus || e?.prodStatusDefault || "new";
      const finished = prodStatus === "done" || !!p?.factEndDate;
      let daysLeft = null, overdue = false;
      if (!finished && p?.planEndDate) { daysLeft = Math.round((_dayStart(p.planEndDate) - today) / 864e5); if (daysLeft < 0) overdue = true; }
      const overdueStages = sts.some(s => s.status !== "done" && s.planEnd && _dayStart(s.planEnd) < today);
      let sev, color, label;
      if (prodStatus === "cancel") { sev = 0; color = "#94a3b8"; label = "Отменён"; }
      else if (finished) { sev = 0; color = "#94a3b8"; label = "Сдан ✓"; }
      else if (overdue || overdueStages) { sev = 3; color = "#dc2626"; label = "Просрочка"; }
      else if ((daysLeft != null && daysLeft <= 5) || defectsOpen > 0) { sev = 2; color = "#d97706"; label = "Внимание"; }
      else { sev = 1; color = "#059669"; label = "В норме"; }
      const fdRaw = p?.factEndDate || e?.closedAt;
      const fd = (finished && fdRaw) ? new Date(fdRaw) : null;
      const finishedThisMonth = !!(fd && fd.getMonth() === nowD.getMonth() && fd.getFullYear() === nowD.getFullYear());
      return { pc, cp, cf, mPlan, mFact, prog, defectsOpen, finished, daysLeft, sev, color, label, responsible: p?.responsible || "", stagesCount: sts.length, doneStages, finishedThisMonth, prodStatus };
    };
    const rows = baseEntries
      .filter(o => !statusFilter || (prodByObj[o.id]?.prodStatus || entryByKey[o.id]?.prodStatusDefault || "new") === statusFilter)
      .filter(o => !q || [o.name, o.address].some(v => v && v.toLowerCase().includes(q)))
      .map(o => ({ ...o, m: metricsOf(o.id) }))
      .sort((a, b) => (b.m.sev - a.m.sev) || ((a.m.daysLeft == null ? 999 : a.m.daysLeft) - (b.m.daysLeft == null ? 999 : b.m.daysLeft)) || (b.updatedAt - a.updatedAt));
    const sum = rows.reduce((a, r) => { a.pc += r.m.pc; a.cp += r.m.cp; a.cf += r.m.cf; a.defects += r.m.defectsOpen; if (r.m.prodStatus === "done") { a.done++; if (r.m.finishedThisMonth) a.doneMonth++; } else if (r.m.prodStatus === "active") a.inWork++; if (r.m.sev === 3) a.overdue++; return a; }, { pc: 0, cp: 0, cf: 0, defects: 0, done: 0, doneMonth: 0, inWork: 0, overdue: 0 });
    const compMPlan = sum.pc ? Math.round((sum.pc - sum.cp) / sum.pc * 100) : null;
    const compMFact = (sum.pc && sum.cf) ? Math.round((sum.pc - sum.cf) / sum.pc * 100) : null;
    const sumCard = (label, value, sub, color) => (
      <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".03em", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: color || "#0f172a", lineHeight: 1.1, overflowWrap: "anywhere" }}>{value}</div>
        {sub && <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
      </div>
    );
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 4px" }}>
        {/* Заголовок + кнопка */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>🏗 Производство</h2>
          <button onClick={() => setAddOpen(v => !v)} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ Добавить объект</button>
        </div>
        {/* Поиск */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по клиенту, адресу…"
          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
        {/* Фильтр по статусу */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={() => setStatusFilter("")} style={{ border: "1px solid", borderColor: !statusFilter ? "#0f172a" : "#e2e8f0", background: !statusFilter ? "#0f172a" : "#fff", color: !statusFilter ? "#fff" : "#64748b", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Все</button>
          {PROD_STATUSES.map(s => (
            <button key={s.key} onClick={() => setStatusFilter(f => f === s.key ? "" : s.key)}
              style={{ border: `1px solid ${statusFilter === s.key ? s.color : "#e2e8f0"}`, background: statusFilter === s.key ? s.bg : "#fff", color: statusFilter === s.key ? s.color : "#64748b", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {s.label}
            </button>
          ))}
        </div>
        {addOpen && (() => {
          const prodIds = new Set((productions || []).map(p => p.objectId));
          const objCands = (allObjects || []).filter(o => !o.deletedAt && !prodIds.has(o.id));
          const projCands = (unlinkedProjects || []).filter(p => !prodIds.has("fp:" + p.id));
          const total = objCands.length + projCands.length;
          return (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Добавить в производство вручную ({total} доступно):</div>
              <select defaultValue="" onChange={e => {
                const v = e.target.value; if (!v) return;
                if (v.startsWith("fp:")) {
                  const p = projCands.find(x => "fp:" + x.id === v);
                  if (p) { onSaveProduction({ ...emptyProduction(v, genId), title: projTitle(p), address: projAddress(p), finProjectId: p.id, budget: Number(p.budget) || 0 }); }
                } else {
                  const o = objCands.find(x => x.id === v);
                  if (o) onSaveProduction(emptyProduction(o.id, genId));
                }
                setAddOpen(false);
              }}
                style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}>
                <option value="">— Выбрать —</option>
                {projCands.length > 0 && (
                  <optgroup label="Проекты из Финансов">
                    {projCands.map(p => <option key={"fp:" + p.id} value={"fp:" + p.id}>{projTitle(p)}{projAddress(p) ? " · " + projAddress(p) : ""}{p.contractNo ? " (№" + p.contractNo + ")" : ""}</option>)}
                  </optgroup>
                )}
                {objCands.length > 0 && (
                  <optgroup label="Объекты / лиды">
                    {objCands.map(o => <option key={o.id} value={o.id}>{o.clientName || "Без имени"}{o.address ? " · " + o.address : ""}</option>)}
                  </optgroup>
                )}
              </select>
              {total === 0 && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Всё уже в производстве.</div>}
            </div>
          );
        })()}
        {/* ── Сводка собственника ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 10, marginBottom: 16 }}>
          {sumCard("В работе", sum.inWork)}
          {sumCard("Сдано за месяц", sum.doneMonth)}
          {sumCard("Маржа компании", compMPlan != null ? `${compMPlan}%` : "—", compMFact != null ? `факт ${compMFact}%` : "план", "#059669")}
          {sumCard("Просрочено", sum.overdue, "объектов", sum.overdue ? "#dc2626" : "#059669")}
          {sumCard("Замечаний", sum.defects, "открыто", sum.defects ? "#d97706" : "#059669")}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Объектов: {rows.length} · сверху — что горит 🔴</div>
        {rows.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "50px 0", fontSize: 14 }}>Нет объектов в производстве.</div>}
        {/* ── Светофор ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {rows.map(o => {
            const m = o.m;
            const ps = psByKey(m.prodStatus);
            const cn = contractByObj[o.id];
            const fs = finSummaryMap[o.id];
            const budgetFill = fs?.budget > 0 ? Math.min(100, Math.round(fs.income / fs.budget * 100)) : 0;
            const mCol = fs?.margin == null ? "#94a3b8" : fs.margin >= 30 ? "#059669" : fs.margin >= 0 ? "#f59e0b" : "#dc2626";
            const mBg  = fs?.margin == null ? "#f8fafc" : fs.margin >= 30 ? "#f0fdf4" : fs.margin >= 0 ? "#fffbeb" : "#fef2f2";
            return (
              <div key={o.id} onClick={() => { setOpenId(o.id); setTab("info"); }}
                style={{ background: "#fff", border: "1px solid #eef2f7", borderRadius: 16, cursor: "pointer", boxShadow: "0 1px 3px rgba(15,23,42,.07)", transition: "box-shadow .15s,transform .15s", overflow: "hidden", display: "flex", flexDirection: "column" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                {/* Цветная полоса */}
                <div style={{ height: 4, background: `linear-gradient(90deg,${m.color},${m.color}99)`, flexShrink: 0 }} />
                <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
                  {/* Шапка */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{o.name}</div>
                      {(fs?.contractNo || cn) && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{String(fs?.contractNo || cn || "").replace(/^№+/, "№")}</div>}
                      {o.address && o.address !== "—" && <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.address}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: ps.color, background: ps.bg, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{ps.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: m.color, background: m.color + "18", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>{m.label}{m.daysLeft != null && !m.finished ? (m.daysLeft < 0 ? ` ${-m.daysLeft}д` : ` ${m.daysLeft}д`) : ""}</span>
                      {currentUser?.role === "admin" && onDeleteProduction && (
                        <button title="Удалить производственную карточку" onClick={e => { e.stopPropagation(); if (window.confirm(`Удалить производственную карточку «${o.name}»? (объект и смета не удаляются)`)) onDeleteProduction(o.id); }}
                          style={{ background: "rgba(220,38,38,.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,.15)", borderRadius: 6, padding: "2px 7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginTop: 2 }}>🗑</button>
                      )}
                    </div>
                  </div>
                  {/* Финансы (если есть данные из Finance) */}
                  {fs ? <>
                    <div style={{ marginBottom: 12 }}>
                      {fs.budget > 0 ? <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{fmt(fs.income)} <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>из {fmt(fs.budget)} ₸</span></span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: budgetFill >= 100 ? "#059669" : "#2563eb" }}>{budgetFill}%</span>
                        </div>
                        <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: budgetFill + "%", height: "100%", background: budgetFill >= 100 ? "linear-gradient(90deg,#059669,#34d399)" : "linear-gradient(90deg,#2563eb,#60a5fa)", borderRadius: 4, transition: "width .3s" }} />
                        </div>
                      </> : <div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{fs.income > 0 ? fmt(fs.income) + " ₸" : "—"}</span>
                        <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 7 }}>бюджет не указан</span>
                      </div>}
                    </div>
                    <div style={{ borderTop: "1px solid #f1f5f9" }}>
                      {[["Долг", fs.debt > 0 ? fmt(fs.debt) + " ₸" : "—", fs.debt > 0 ? "#dc2626" : "#94a3b8"],
                        ["Расходы", fs.expense > 0 ? fmt(fs.expense) + " ₸" : "—", fs.expense > 0 ? "#dc2626" : "#94a3b8"]
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{l}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: "auto", paddingTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: mBg, borderRadius: 10, padding: "8px 12px", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Маржа</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: mCol }}>{fs.income > 0 ? fmt(fs.income - fs.expense) + " ₸" : "—"}</span>
                          {fs.margin != null && <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: mCol, borderRadius: 6, padding: "2px 7px" }}>{fs.margin}%</span>}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 11, color: "#64748b" }}>
                        {m.stagesCount > 0 && <span>🔨 {m.doneStages}/{m.stagesCount} эт. · {m.prog}%</span>}
                        {m.defectsOpen > 0 && <span style={{ color: "#d97706" }}>⚠ {m.defectsOpen}</span>}
                        {m.responsible && <span>👷 {m.responsible}</span>}
                      </div>
                    </div>
                  </> : <>
                    {/* Нет финансовых данных — показываем прогресс по этапам */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11, color: "#64748b" }}>
                        <span>Выполнено</span><span style={{ fontWeight: 700 }}>{m.prog}%</span>
                      </div>
                      <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${m.prog}%`, height: "100%", background: m.prog === 100 ? "#059669" : "#2563eb", borderRadius: 4, transition: "width .3s" }} />
                      </div>
                    </div>
                    <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: "#64748b", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                      {m.stagesCount > 0 && <span>🔨 {m.doneStages}/{m.stagesCount} эт.</span>}
                      {m.mPlan != null && <span>📊 {m.mFact != null ? `${m.mFact}% факт` : `${m.mPlan}% план`}</span>}
                      {m.defectsOpen > 0 && <span style={{ color: "#d97706" }}>⚠ {m.defectsOpen}</span>}
                      {m.responsible && <span>👷 {m.responsible}</span>}
                    </div>
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── КАРТОЧКА ОБЪЕКТА ───
  const TABS = [
    { key: "info", label: "Информация", icon: "ℹ️" },
    { key: "launch", label: "Запуск", icon: "🚀" },
    { key: "stages", label: "Этапы и сроки", icon: "🔨" },
    { key: "finance", label: "Финансы", icon: "💰" },
    { key: "journal", label: "Журнал", icon: "📖" },
    { key: "defects", label: "Замечания", icon: "⚠️" },
    { key: "handover", label: "Сдача", icon: "🏁" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => { setShareLink(null); setOpenId(null); }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b", padding: 0 }}>←</button>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a" }}>{openObj.clientName || "Объект"}</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>{openObj.address || "—"}{openObj.clientPhone ? ` · 📞 ${openObj.clientPhone}` : ""}</div>
        </div>
      </div>

      {/* Клиент: доступ к прогрессу + сообщение — одной карточкой */}
      {currentUser?.role !== "viewer" && (() => {
        const shared = !!(openObj.progressShared && openObj.progressToken);
        const realUrl = shared ? (window.location.origin + window.location.pathname + "#/progress/" + openObj.progressToken) : null;
        const url = realUrl || shareLink;
        return (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 11 }}>
            {onToggleClientShare && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>👁 Доступ клиента к прогрессу{shared && <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}> · открыт</span>}</div>
                  <button disabled={shareBusy} onClick={async () => { setShareBusy(true); const link = await onToggleClientShare(openObj.id); setShareLink(link); setShareBusy(false); }}
                    style={{ background: shared ? "rgba(220,38,38,.08)" : "#ecfdf5", color: shared ? "#dc2626" : "#059669", border: "1px solid " + (shared ? "rgba(220,38,38,.2)" : "rgba(5,150,105,.25)"), borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: shareBusy ? "default" : "pointer", opacity: shareBusy ? .6 : 1, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    {shared ? "Закрыть доступ" : "Открыть доступ клиенту"}
                  </button>
                </div>
                {(shared || shareLink) && url && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <input readOnly value={url} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 180, border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px 9px", fontSize: 11.5, fontFamily: "inherit", color: "#0f172a", background: "#f8fafc" }} />
                    <button onClick={() => { try { navigator.clipboard.writeText(url); } catch {} }} style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid rgba(37,99,235,.2)", borderRadius: 6, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Копировать</button>
                    <a href={"https://wa.me/?text=" + encodeURIComponent("Прогресс вашего ремонта: " + url)} target="_blank" rel="noopener" style={{ background: "#25D366", color: "#fff", textDecoration: "none", padding: "7px 11px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>WhatsApp</a>
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: "#94a3b8" }}>Клиент видит прогресс, этапы, сроки и оплату. Себестоимость, маржа и подрядчики скрыты.</div>
              </div>
            )}
            {onToggleClientShare && <div style={{ borderTop: "1px solid #f1f5f9" }} />}
            {/* Сообщение клиенту — общий комментарий от компании на странице прогресса */}
            <ClientMessageCard prod={openProd} patch={patchProd} embedded />
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 4, marginBottom: 18, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ background: tab === t.key ? "#fff" : "transparent", border: "1px solid", borderColor: tab === t.key ? "#e2e8f0" : "transparent", borderBottom: tab === t.key ? "1px solid #fff" : "1px solid transparent", marginBottom: -1, borderRadius: "10px 10px 0 0", padding: "9px 16px", fontSize: 13, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? "#0f172a" : "#64748b", cursor: "pointer", fontFamily: "inherit" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && <InfoTab prod={openProd} obj={openObj} estimates={estimates} contracts={contracts} fmt={fmt} patch={patchProd} />}
      {tab === "launch" && <ChecklistTab kind="checklistLaunch" prod={openProd} patch={patchProd} genId={genId} title="Чек-лист запуска объекта" />}
      {tab === "handover" && <ChecklistTab kind="checklistHandover" prod={openProd} patch={patchProd} genId={genId} title="Чек-лист сдачи объекта" />}
      {tab === "stages" && <StagesTab prod={openProd} patch={patchProd} genId={genId} fmt={fmt} buildStagesFromEstimate={buildStagesFromEstimate} objId={openObj.id} />}
      {tab === "finance" && <FinanceTab prod={openProd} patch={patchProd} fmt={fmt} finSummary={finSummary} />}
      {tab === "journal" && <JournalTab prod={openProd} patch={patchProd} genId={genId} currentUser={currentUser} />}
      {tab === "defects" && <DefectsTab prod={openProd} patch={patchProd} genId={genId} currentUser={currentUser} />}
    </div>
  );
}

// ─── ВКЛАДКА: ИНФОРМАЦИЯ ───
const _dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
// Телефон → формат для wa.me (КЗ: 8XXXXXXXXXX → 7XXXXXXXXXX)
const _waPhone = (p) => { let d = (p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1); else if (d.length === 10) d = "7" + d; return d; };
function InfoTab({ prod, obj, estimates, contracts, fmt, patch }) {
  const objEstimates = estimates.filter(e => e.objectId === obj.id);
  const objContracts = contracts.filter(c => c.objectId === obj.id && !c.deletedAt);
  const totalEst = objEstimates.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const totalCon = objContracts.reduce((s, c) => s + (c.works || []).reduce((ss, w) => ss + (Number(w.quantity) || 0) * (Number(w.price) || 0), 0), 0);
  const stages = prod.stages || [];
  const doneStages = stages.filter(s => s.status === "done").length;
  const stageProg = stages.length ? Math.round(doneStages / stages.length * 100) : 0;
  const launch = prod.checklistLaunch || [];
  const launchDone = launch.filter(i => i.done).length;
  // Дней в работе: от даты старта до факта сдачи (или до сегодня, если ещё в работе)
  const daysInWork = prod.startDate ? Math.max(0, Math.round((_dayStart(prod.factEndDate || new Date()) - _dayStart(prod.startDate)) / 864e5)) : null;
  // Срок: сдан / до плановой сдачи / просрочка
  let deadline = { text: "—", color: "#94a3b8", sub: "срок не задан" };
  if (prod.factEndDate) deadline = { text: "Сдан ✓", color: "#059669", sub: new Date(prod.factEndDate).toLocaleDateString("ru-RU") };
  else if (prod.planEndDate) {
    const left = Math.round((_dayStart(prod.planEndDate) - _dayStart(new Date())) / 864e5);
    if (left < 0) deadline = { text: (-left) + " дн", color: "#dc2626", sub: "просрочка" };
    else if (left === 0) deadline = { text: "Сегодня", color: "#d97706", sub: "плановая сдача" };
    else deadline = { text: left + " дн", color: "#2563eb", sub: "до плановой сдачи" };
  }
  // Напоминания / просрочки
  const todayMs = _dayStart(new Date());
  const alerts = [];
  if (!prod.factEndDate && prod.planEndDate && _dayStart(prod.planEndDate) < todayMs)
    alerts.push("Плановая сдача просрочена на " + Math.round((todayMs - _dayStart(prod.planEndDate)) / 864e5) + " дн");
  stages.forEach(s => {
    if (s.status !== "done" && s.planEnd && _dayStart(s.planEnd) < todayMs)
      alerts.push("Этап «" + (s.name || "без названия") + "» просрочен на " + Math.round((todayMs - _dayStart(s.planEnd)) / 864e5) + " дн");
  });
  if (!prod.factEndDate && prod.planEndDate) {
    const lt = Math.round((_dayStart(prod.planEndDate) - todayMs) / 864e5);
    if (lt >= 0 && lt <= 3) alerts.push("Плановая сдача " + (lt === 0 ? "сегодня" : ("через " + lt + " дн")));
  }
  const cBtn = { display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
  const fld = (label, key, type = "text") => (
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <input type={type} value={prod[key] || ""} onChange={e => patch({ [key]: e.target.value })}
        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
  const Metric = ({ label, value, sub, color = "#0f172a" }) => (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "13px 15px" }}>
      <div style={{ fontSize: 10.5, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".03em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1, overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Напоминания / просрочки */}
      {alerts.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 15px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626", marginBottom: 6 }}>⚠ Требует внимания</div>
          {alerts.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: "#b91c1c", padding: "2px 0" }}>• {a}</div>)}
        </div>
      )}
      {/* Шапка объекта */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)", borderRadius: 16, padding: "20px 22px", color: "#fff" }}>
        <div style={{ fontSize: 21, fontWeight: 900, marginBottom: 6, lineHeight: 1.15 }}>{obj.clientName || "Без названия"}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 16px", fontSize: 13, color: "rgba(255,255,255,.82)" }}>
          {obj.address && <span>📍 {obj.address}</span>}
          {obj.clientPhone && <span>📞 {obj.clientPhone}</span>}
          {obj.objType && <span>🏠 {obj.objType}</span>}
          {obj.area && <span>📐 {obj.area} м²</span>}
        </div>
      </div>
      {/* Связь в один тап */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10.5, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".03em", fontWeight: 700 }}>Связь</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {obj.clientPhone ? (<>
            <a href={"tel:" + obj.clientPhone} style={{ ...cBtn, background: "#eff6ff", color: "#2563eb" }}>📞 Позвонить</a>
            <a href={"https://wa.me/" + _waPhone(obj.clientPhone)} target="_blank" rel="noopener" style={{ ...cBtn, background: "#25D366", color: "#fff" }}>📲 WhatsApp клиенту</a>
          </>) : <span style={{ fontSize: 12, color: "#94a3b8" }}>Телефон клиента не указан</span>}
          {prod.waGroup && <a href={prod.waGroup} target="_blank" rel="noopener" style={{ ...cBtn, background: "#f0fdf4", color: "#059669", border: "1px solid #bbf7d0" }}>🔗 Рабочая группа</a>}
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Ссылка на рабочую группу WhatsApp</div>
          <input value={prod.waGroup || ""} onChange={e => patch({ waGroup: e.target.value })} placeholder="https://chat.whatsapp.com/…"
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>
      {/* Ключевые метрики */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 12 }}>
        <Metric label="Дней в работе" value={daysInWork == null ? "—" : daysInWork} sub={daysInWork == null ? "не начато" : (prod.factEndDate ? "по факту сдачи" : "идёт сейчас")} color="#2563eb" />
        <Metric label="Срок" value={deadline.text} sub={deadline.sub} color={deadline.color} />
        <Metric label="Работы" value={stages.length ? `${doneStages} / ${stages.length}` : "—"} sub={stages.length ? `выполнено ${stageProg}%` : "нет работ"} color="#059669" />
        <Metric label="Запуск объекта" value={launch.length ? `${launchDone} / ${launch.length}` : "—"} sub="чек-лист запуска" color="#7c3aed" />
        <Metric label="Сумма смет" value={`${fmt(totalEst)} ₸`} sub={`${objEstimates.length} смет(ы)`} />
        <Metric label="Договоры" value={totalCon ? `${fmt(totalCon)} ₸` : (objContracts.length || "—")} sub={`${objContracts.length} шт`} />
      </div>
      {/* Прогресс по работам */}
      {stages.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 7 }}><span style={{ fontWeight: 600 }}>Прогресс по работам</span><span style={{ fontWeight: 800, color: "#059669" }}>{stageProg}%</span></div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}><div style={{ width: stageProg + "%", height: "100%", background: "#059669", borderRadius: 5, transition: "width .3s" }} /></div>
        </div>
      )}
      {/* Производственные поля */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Производственная информация</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {PROD_STATUSES.map(s => {
              const active = (prod.prodStatus || "active") === s.key;
              return <button key={s.key} onClick={() => patch({ prodStatus: s.key })}
                style={{ border: `1px solid ${active ? s.color : "#e2e8f0"}`, background: active ? s.bg : "#fff", color: active ? s.color : "#94a3b8", borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .1s" }}>{s.label}</button>;
            })}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {fld("Ответственный прораб / менеджер", "responsible")}
          {fld("Доступ (ключ, код, пропуск)", "access")}
          {fld("Дата продажи (подписание договора)", "saleDate", "date")}
          {fld("Дата начала работ", "startDate", "date")}
          {fld("Плановая дата окончания", "planEndDate", "date")}
          {fld("Фактическая дата окончания", "factEndDate", "date")}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Примечания / особенности</div>
          <textarea value={prod.note || ""} onChange={e => patch({ note: e.target.value })} rows={2}
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

// ─── ВКЛАДКА: ЧЕК-ЛИСТ (запуск / сдача) с разделами ───
function ChecklistTab({ kind, prod, patch, genId, title }) {
  const items = prod[kind] || [];
  const [newText, setNewText] = useState("");
  const upd = (id, p) => patch({ [kind]: items.map(it => it.id === id ? { ...it, ...p } : it) });
  const add = (section = "") => { if (!newText.trim()) return; patch({ [kind]: [...items, { id: genId(), text: newText.trim(), section, done: false, responsible: "", note: "" }] }); setNewText(""); };
  const doneCount = items.filter(i => i.done).length;
  // Группируем по разделам с сохранением порядка появления
  const groups = []; const gmap = {};
  items.forEach(it => { const s = it.section || ""; if (!(s in gmap)) { gmap[s] = []; groups.push(s); } gmap[s].push(it); });
  const Row = (it) => (
    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
      <input type="checkbox" checked={!!it.done} onChange={e => upd(it.id, { done: e.target.checked })} style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }} />
      <input value={it.text} onChange={e => upd(it.id, { text: e.target.value })}
        style={{ flex: 1, border: "none", fontSize: 13, fontFamily: "inherit", outline: "none", color: it.done ? "#94a3b8" : "#0f172a", textDecoration: it.done ? "line-through" : "none", background: "transparent", minWidth: 0 }} />
      <input value={it.responsible || ""} onChange={e => upd(it.id, { responsible: e.target.value })} placeholder="Кто"
        style={{ width: 110, border: "1px solid #f1f5f9", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", flexShrink: 0 }} />
    </div>
  );
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: doneCount === items.length && items.length ? "#059669" : "#2563eb" }}>{doneCount} / {items.length}</div>
      </div>
      {items.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "18px 0", fontSize: 13 }}>Чек-лист пуст. Добавьте пункты ниже.</div>}
      {groups.map(sec => (
        <div key={sec || "_"} style={{ marginBottom: sec ? 14 : 0 }}>
          {sec && <div style={{ fontSize: 11, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em", margin: "8px 0 4px" }}>{sec}</div>}
          {gmap[sec].map(Row)}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === "Enter" && add(groups.length ? groups[groups.length - 1] : "")} placeholder="Добавить пункт…"
          style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button onClick={() => add(groups.length ? groups[groups.length - 1] : "")} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Добавить</button>
      </div>
    </div>
  );
}

// ─── Сообщение клиенту (общий комментарий от компании на странице прогресса) ───
// Свёрнут по умолчанию, чтобы не занимать место над вкладками; разворачивается по кнопке.
function ClientMessageCard({ prod, patch, embedded = false }) {
  const saved = prod.clientMessage && typeof prod.clientMessage === "object" ? prod.clientMessage : null;
  const savedText = saved ? (saved.text || "") : (typeof prod.clientMessage === "string" ? prod.clientMessage : "");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(savedText);
  // Сброс поля при переключении объекта
  useEffect(() => { setText(savedText); setOpen(false); }, [prod.objectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = text.trim() !== savedText.trim();
  const save = () => {
    const t = text.trim();
    patch({ clientMessage: t ? { text: t, updatedAt: Date.now() } : null });
    setOpen(false);
  };
  const clear = () => { setText(""); patch({ clientMessage: null }); setOpen(false); };
  // В embedded-режиме карточка встроена в родительскую — без своей рамки/фона/отступов
  const wrap = embedded
    ? { background: "transparent", border: "none", borderRadius: 0, padding: 0, marginBottom: 0 }
    : { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", marginBottom: 14 };

  // Свёрнутый вид — компактная строка с превью
  if (!open) {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>💬</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Сообщение клиенту{savedText && <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}> · опубликовано</span>}</div>
          <div style={{ fontSize: 12, color: savedText ? "#64748b" : "#94a3b8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{savedText || "нет сообщения — клиент его не видит"}</div>
        </div>
        <button onClick={() => setOpen(true)} style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid rgba(37,99,235,.2)", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>{savedText ? "Изменить" : "Написать"}</button>
      </div>
    );
  }
  // Развёрнутый вид — редактор
  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>💬 Сообщение клиенту</div>
        {saved?.updatedAt && <span style={{ fontSize: 11, color: "#94a3b8" }}>обновлено {new Date(saved.updatedAt).toLocaleDateString("ru-RU")}</span>}
      </div>
      <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Например: На этой неделе закончили черновую электрику, начинаем штукатурку. Плитку привезут в пятницу…"
        style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={save} disabled={!dirty}
          style={{ background: dirty ? "#2563eb" : "#e2e8f0", color: dirty ? "#fff" : "#94a3b8", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: dirty ? "pointer" : "default", fontFamily: "inherit" }}>
          {savedText ? "Обновить сообщение" : "Опубликовать клиенту"}
        </button>
        <button onClick={() => { setText(savedText); setOpen(false); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Свернуть</button>
        {savedText && <button onClick={clear} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0, marginLeft: "auto" }}>Убрать</button>}
      </div>
      <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 8 }}>Появится отдельным блоком вверху страницы клиента. Обновляется у клиента в течение минуты или по кнопке «Обновить».</div>
    </div>
  );
}

// ─── ВКЛАДКА: ЭТАПЫ И СРОКИ ───
function StagesTab({ prod, patch, genId, fmt, buildStagesFromEstimate, objId }) {
  const stages = prod.stages || [];
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const upd = (id, p) => patch({ stages: stages.map(s => s.id === id ? { ...s, ...p } : s) });
  const addManual = () => {
    if (!newName.trim()) return;
    patch({ stages: [...stages, { id: genId(), cat: newCat.trim() || "Прочее", name: newName.trim(), unit: "", qty: 0, planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo", responsible: "", note: "", paid: false, priceClient: 0, costPlan: 0 }] });
    setNewName("");
  };
  const inWorkDays = (s) => s.factStart ? Math.max(0, Math.round((_dayStart(s.factEnd || new Date()) - _dayStart(s.factStart)) / 864e5)) + 1 : null;
  const dInp = { border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none", color: "#0f172a", width: "100%", boxSizing: "border-box" };

  // График (Гантт)
  const dates = stages.flatMap(s => [s.planStart, s.planEnd, s.factStart, s.factEnd]).filter(Boolean).map(d => new Date(d).getTime());
  const ganttStages = stages.filter(s => s.name && (s.planStart || s.factStart));
  const todayMs = _dayStart(new Date());
  const allDates = dates.length ? [...dates, todayMs] : [];
  const minD = allDates.length ? Math.min(...allDates) : 0;
  const maxD = allDates.length ? Math.max(...allDates) : 0;
  const span = maxD - minD || 1;
  const fmtD = (ts) => new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const pctOf = (ts) => ((ts - minD) / span) * 100;
  const todayPct = (todayMs >= minD && todayMs <= maxD) ? pctOf(todayMs) : null;
  const bar = (start, end, color, top, h) => {
    if (!start || !end) return null;
    const s = new Date(start).getTime(), e = new Date(end).getTime();
    return <div title={`${fmtD(s)} – ${fmtD(e)}`} style={{ position: "absolute", left: `${pctOf(s)}%`, width: `${Math.max(1.5, ((e - s) / span) * 100)}%`, height: h, borderRadius: 4, background: color, top }} />;
  };
  const grouped = groupByCat(stages);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Этапы и сроки ({stages.length})</div>
        {stages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Добавьте работу вручную ниже.</div>
        ) : (
          <div>
            {grouped.map(([cat, list]) => (
              <Fragment key={cat}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em", padding: "10px 0 5px", borderBottom: "1px solid #fdf3e3" }}>{cat}</div>
                {list.map(s => {
                  const st = stByKey(s.status);
                  const iw = inWorkDays(s);
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ width: 3, borderRadius: 3, background: st.color, flexShrink: 0, minHeight: 36 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input value={s.name} onChange={e => upd(s.id, { name: e.target.value })} placeholder="Наименование работы"
                          style={{ width: "100%", border: "none", fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "inherit", outline: "none", background: "transparent", padding: 0 }} />
                        {(s.qty > 0 || s.unit) && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{s.qty > 0 ? fmt(s.qty) : ""} {s.unit || ""}</div>}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
                          <select value={s.status} onChange={e => upd(s.id, { status: e.target.value })}
                            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 6px", fontSize: 11.5, fontFamily: "inherit", color: st.color, background: st.bg, fontWeight: 700, cursor: "pointer" }}>
                            {STAGE_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                          <input value={s.responsible || ""} onChange={e => upd(s.id, { responsible: e.target.value })} placeholder="Ответств."
                            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", width: 100 }} />
                          {iw != null && <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 700 }}>🔨 {iw} дн</span>}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginTop: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Старт план</div>
                            <input type="date" value={s.planStart || ""} onChange={e => upd(s.id, { planStart: e.target.value })} style={dInp} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Конец план</div>
                            <input type="date" value={s.planEnd || ""} onChange={e => upd(s.id, { planEnd: e.target.value })} style={dInp} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Старт факт</div>
                            <input type="date" value={s.factStart || ""} onChange={e => upd(s.id, { factStart: e.target.value })} style={dInp} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Конец факт</div>
                            <input type="date" value={s.factEnd || ""} onChange={e => upd(s.id, { factEnd: e.target.value })} style={dInp} />
                          </div>
                        </div>
                        <input value={s.note || ""} onChange={e => upd(s.id, { note: e.target.value })} placeholder="+ примечание"
                          style={{ marginTop: 6, width: "100%", border: "none", borderBottom: "1px dashed #e2e8f0", fontSize: 11, color: "#64748b", fontFamily: "inherit", outline: "none", padding: "1px 0", background: "transparent" }} />
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
        {/* Ручное добавление работы */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Заголовок (Черновые…)"
            style={{ flex: "1 1 140px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addManual()} placeholder="Наименование работы"
            style={{ flex: "2 1 180px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button onClick={addManual} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Работа</button>
        </div>
      </div>

      {/* Gantt — полноценный график */}
      {stages.length > 0 && (() => {
        const gantt = stages.filter(s => s.planStart || s.factStart);
        if (!gantt.length) return (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>График работ</div>
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Укажите плановые даты у работ выше — появится график.</div>
          </div>
        );
        const todayMs = _dayStart(new Date());
        const allMs = gantt.flatMap(s => [s.planStart, s.planEnd, s.factStart, s.factEnd].filter(Boolean).map(d => +new Date(d)));
        allMs.push(todayMs);
        const pad = 3 * 864e5;
        const startMs = Math.min(...allMs) - pad;
        const endMs = Math.max(...allMs) + pad;
        const totalDays = Math.max(1, Math.round((endMs - startMs) / 864e5));
        const PX = Math.min(28, Math.max(14, Math.round(900 / totalDays)));
        const chartW = totalDays * PX;
        const NAME_W = 164;
        const ROW_H = 46;
        const xOf = (ms) => Math.round((ms - startMs) / 864e5) * PX;
        const wOf = (a, b) => Math.max(PX, xOf(b) - xOf(a) + PX);
        const todayX = xOf(todayMs);
        // Месячные метки
        const months = [];
        const mc = new Date(startMs); mc.setDate(1); mc.setHours(0, 0, 0, 0);
        while (+mc <= endMs) { months.push({ label: mc.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }), x: xOf(+mc) }); mc.setMonth(mc.getMonth() + 1); }
        const ganttGrouped = groupByCat(gantt);
        return (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflowX: "auto" }}>
            {/* Шапка */}
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 16px 10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>График работ</span>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 22, height: 10, background: "#bfdbfe", border: "1.5px solid #3b82f6", borderRadius: 3 }} />план</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 22, height: 9, background: "#6ee7b7", borderRadius: 3 }} />факт</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 2, height: 14, background: "#ef4444", borderRadius: 1 }} />сегодня</span>
              </div>
            </div>
            <div style={{ minWidth: NAME_W + chartW + 16, paddingBottom: 8 }}>
              {/* Ось месяцев */}
              <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0" }}>
                <div style={{ width: NAME_W, flexShrink: 0 }} />
                <div style={{ position: "relative", width: chartW, height: 26, flexShrink: 0 }}>
                  {months.map((m, i) => (
                    <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, borderLeft: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, paddingLeft: 4, lineHeight: "26px", whiteSpace: "nowrap" }}>{m.label}</span>
                    </div>
                  ))}
                  <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "#ef4444", borderRadius: 1 }} />
                </div>
              </div>
              {/* Строки по категориям */}
              {ganttGrouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <div style={{ display: "flex", background: "#fffdf7" }}>
                    <div style={{ width: NAME_W, flexShrink: 0, padding: "5px 12px 3px", fontSize: 10, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em" }}>{cat}</div>
                    <div style={{ position: "relative", width: chartW, height: 20, flexShrink: 0 }}>
                      {months.map((m, i) => <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, width: 1, background: "#f0ece0" }} />)}
                      <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "rgba(239,68,68,.2)" }} />
                    </div>
                  </div>
                  {list.map(s => {
                    const st = stByKey(s.status);
                    const pS = s.planStart ? +new Date(s.planStart) : null;
                    const pE = s.planEnd ? +new Date(s.planEnd) : null;
                    const fS = s.factStart ? +new Date(s.factStart) : null;
                    const fE = s.factEnd ? +new Date(s.factEnd) : null;
                    const overdue = s.status !== "done" && pE && pE < todayMs;
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #f1f5f9", minHeight: ROW_H }}>
                        <div style={{ width: NAME_W, flexShrink: 0, padding: "6px 12px", minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? "#dc2626" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                          <div style={{ fontSize: 10, color: st.color, fontWeight: 600 }}>{st.label}{overdue ? " ⚠" : ""}</div>
                        </div>
                        <div style={{ position: "relative", width: chartW, height: ROW_H, flexShrink: 0 }}>
                          {months.map((m, i) => <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, width: 1, background: "#f1f5f9" }} />)}
                          <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "rgba(239,68,68,.18)", zIndex: 1 }} />
                          {/* Плановый бар */}
                          {pS && pE && (
                            <div title={`План: ${new Date(pS).toLocaleDateString("ru-RU")} — ${new Date(pE).toLocaleDateString("ru-RU")}`}
                              style={{ position: "absolute", left: xOf(pS), width: wOf(pS, pE), top: 8, height: 14, borderRadius: 4, background: overdue ? "#fee2e2" : st.bg, border: `1.5px solid ${overdue ? "#f87171" : st.color}`, zIndex: 2, overflow: "hidden", display: "flex", alignItems: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: overdue ? "#dc2626" : st.color, paddingLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wOf(pS, pE) > 50 ? s.name : ""}</span>
                            </div>
                          )}
                          {/* Фактический бар */}
                          {fS && (
                            <div title={`Факт: ${new Date(fS).toLocaleDateString("ru-RU")}${fE ? " — " + new Date(fE).toLocaleDateString("ru-RU") : " (идёт)"}`}
                              style={{ position: "absolute", left: xOf(fS), width: wOf(fS, fE || todayMs), top: 26, height: 12, borderRadius: 3, background: s.status === "done" ? "#34d399" : "#6ee7b7", zIndex: 2 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
              {/* Метка «сегодня» внизу */}
              <div style={{ position: "relative", height: 16, marginTop: 2 }}>
                <div style={{ position: "absolute", left: NAME_W + todayX - 16, top: 0, fontSize: 9, color: "#ef4444", fontWeight: 700, whiteSpace: "nowrap" }}>▲ сегодня</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function DateF({ label, v, on }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>{label}</div>
      <input type="date" value={v || ""} onChange={e => on(e.target.value)}
        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 6px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

// Дата+время для журнала/замечаний
const _fmtTs = (ts) => ts ? new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

// ─── ВКЛАДКА: ЖУРНАЛ ОБЪЕКТА (лента событий) ───
function JournalTab({ prod, patch, genId, currentUser }) {
  const entries = prod.journal || [];
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; patch({ journal: [{ id: genId(), ts: Date.now(), author: currentUser?.name || "—", text: text.trim() }, ...entries] }); setText(""); };
  const del = (id) => { if (window.confirm("Удалить запись?")) patch({ journal: entries.filter(e => e.id !== id) }); };
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>📖 Журнал объекта ({entries.length})</div>
      <div style={{ marginBottom: 16 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Что произошло на объекте? («залили стяжку», «клиент перенёс розетку», «привезли плитку»…)"
          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button onClick={add} disabled={!text.trim()} style={{ background: text.trim() ? "#2563eb" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit" }}>+ Запись в журнал</button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Записей пока нет. Фиксируйте всё важное — пригодится при спорах и передаче объекта.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {entries.map(e => (
            <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 4px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ width: 3, borderRadius: 3, background: "#bfdbfe", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>{_fmtTs(e.ts)} · {e.author}</div>
                <div style={{ fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.text}</div>
              </div>
              <button onClick={() => del(e.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15, flexShrink: 0, alignSelf: "flex-start" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ВКЛАДКА: ЗАМЕЧАНИЯ / ДЕФЕКТЫ ───
function DefectsTab({ prod, patch, genId, currentUser }) {
  const items = prod.defects || [];
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; patch({ defects: [{ id: genId(), text: text.trim(), done: false, ts: Date.now(), author: currentUser?.name || "—" }, ...items] }); setText(""); };
  const upd = (id, p) => patch({ defects: items.map(i => i.id === id ? { ...i, ...p } : i) });
  const del = (id) => patch({ defects: items.filter(i => i.id !== id) });
  const open = items.filter(i => !i.done).length;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>⚠️ Замечания и дефекты</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: open ? "#dc2626" : "#059669" }}>{open ? `${open} открыто` : (items.length ? "всё устранено ✓" : "—")}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Новое замечание (что исправить)…"
          style={{ flex: "1 1 200px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button onClick={add} disabled={!text.trim()} style={{ background: text.trim() ? "#dc2626" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit" }}>+ Добавить</button>
      </div>
      {items.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Замечаний нет. Сюда вносите недочёты к устранению (свои и от клиента).</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 4px", borderBottom: "1px solid #f1f5f9" }}>
              <input type="checkbox" checked={!!it.done} onChange={e => upd(it.id, { done: e.target.checked })} style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {it.source === "client" && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#2563eb", background: "rgba(37,99,235,.1)", borderRadius: 4, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>👤 ОТ КЛИЕНТА</span>}
                  <input value={it.text} onChange={e => upd(it.id, { text: e.target.value })}
                    style={{ width: "100%", border: "none", fontSize: 13, fontFamily: "inherit", outline: "none", color: it.done ? "#94a3b8" : "#0f172a", textDecoration: it.done ? "line-through" : "none", background: "transparent" }} />
                </div>
                <div style={{ fontSize: 10.5, color: "#cbd5e1", marginTop: 2 }}>{_fmtTs(it.ts)} · {it.author}{it.done ? " · устранено" : ""}</div>
              </div>
              <button onClick={() => del(it.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15, flexShrink: 0, marginTop: 2 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ВКЛАДКА: ФИНАНСОВЫЙ БЛОК (по этапам, группировка категория › подкатегория) ───
// Денежное поле: показывает «115 957 ₸» с пробелами, парсит только цифры
function MoneyInput({ value, onChange, big }) {
  const txt = (value === undefined || value === null || value === "") ? "" : new Intl.NumberFormat("ru-RU").format(value);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input type="text" inputMode="numeric" value={txt} placeholder="0"
        onChange={e => { const d = e.target.value.replace(/[^\d]/g, ""); onChange(d === "" ? undefined : Number(d)); }}
        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: big ? "8px 24px 8px 10px" : "6px 22px 6px 8px", fontSize: big ? 15 : 12, fontWeight: big ? 700 : 500, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }} />
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: big ? 12 : 11, color: "#94a3b8", pointerEvents: "none" }}>₸</span>
    </div>
  );
}

// Компактное денежное поле для таблиц: «115 957» с пробелами, ввод только цифр
// Числовое поле с ЛОКАЛЬНЫМ вводом: пока печатаешь — обновляется только само поле,
// в родителя (и сохранение) значение уходит на blur/Enter. Так не тормозит при вводе.
function NumCell({ value, onChange, ph = "—" }) {
  const fmtN = v => (v === undefined || v === null || v === "") ? "" : new Intl.NumberFormat("ru-RU").format(v);
  const [local, setLocal] = useState(null);
  const shown = local !== null ? local : fmtN(value);
  const commit = () => { if (local === null) return; const d = local.replace(/[^\d]/g, ""); onChange(d === "" ? undefined : Number(d)); setLocal(null); };
  return <input type="text" inputMode="numeric" value={shown} placeholder={ph}
    onChange={e => setLocal(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
    style={{ width: "100%", minWidth: 64, border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 6px", fontSize: 12.5, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }} />;
}
// Ввод себестоимости ЗА ЕДИНИЦУ: в поле пишем цену за 1 ед., а храним итог (за ед. × кол-во).
// Локальный ввод (commit на blur/Enter) — не тормозит. Старые данные (итог) показываются как итог÷кол-во.
function PerUnitCell({ total, qty, onChange, ph = "—" }) {
  const q = Number(qty) || 0;
  const totalNum = Number(total) || 0;
  const fmtN = n => new Intl.NumberFormat("ru-RU").format(n);
  const perUnit = (total === undefined || total === null || total === "") ? "" : (q > 0 ? Math.round(totalNum / q) : totalNum);
  const [local, setLocal] = useState(null);
  const shown = local !== null ? local : (perUnit === "" ? "" : fmtN(perUnit));
  const commit = () => { if (local === null) return; const d = local.replace(/[^\d]/g, ""); const u = d === "" ? undefined : Number(d); onChange(u === undefined ? undefined : (q > 0 ? u * q : u)); setLocal(null); };
  return (
    <div>
      <input type="text" inputMode="numeric" value={shown} placeholder={ph}
        title={q > 0 ? `за единицу × ${fmtN(q)} = ${fmtN(totalNum)} ₸` : "сумма"}
        onChange={e => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ width: "100%", minWidth: 64, border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 6px", fontSize: 12.5, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }} />
      {q > 0 && totalNum > 0 && <div style={{ fontSize: 9.5, color: "#94a3b8", textAlign: "right", marginTop: 2, whiteSpace: "nowrap" }}>= {fmtN(totalNum)} ₸</div>}
    </div>
  );
}

function FinanceTab({ prod, patch, fmt, finSummary }) {
  const stages = prod.stages || [];
  const upd = (id, p) => patch({ stages: stages.map(s => s.id === id ? { ...s, ...p } : s) });
  const num = (v) => Number(v) || 0;
  const tot = stages.reduce((a, s) => { a.priceClient += num(s.priceClient); a.costPlan += num(s.costPlan); a.costFact += num(s.costFact); return a; }, { priceClient: 0, costPlan: 0, costFact: 0 });
  const mColor = (p) => p >= 30 ? "#059669" : p >= 0 ? "#d97706" : "#dc2626";
  const mPlanSumTot = tot.priceClient - tot.costPlan;
  const mFactSumTot = tot.costFact ? tot.priceClient - tot.costFact : null;
  const mPlanTot = tot.priceClient ? Math.round(mPlanSumTot / tot.priceClient * 100) : 0;
  const mFactTot = (tot.priceClient && tot.costFact) ? Math.round((tot.priceClient - tot.costFact) / tot.priceClient * 100) : null;
  // ячейка маржи: сумма ₸ сверху, % снизу
  const margCell = (sum, pct) => pct == null
    ? <span style={{ color: "#cbd5e1" }}>—</span>
    : <><b style={{ color: mColor(pct), fontSize: 12.5 }}>{fmt(sum)} ₸</b><div style={{ fontSize: 11, fontWeight: 700, color: mColor(pct) }}>{pct}%</div></>;
  const th = { padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" };
  const tdc = { padding: "4px 6px", verticalAlign: "top" };
  const grouped = groupByCat(stages);

  const mCol = (p) => p >= 30 ? "#059669" : p >= 0 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Данные из Финансов (бюджет, оплаты, расходы) */}
      {finSummary && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>💰 Финансовый проект{finSummary.contractNo ? ` ${String(finSummary.contractNo).replace(/^№+/, "№")}` : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
            {[
              ["Бюджет (договор)", finSummary.budget > 0 ? fmt(finSummary.budget) + " ₸" : "—", "#0f172a", "#f8fafc"],
              ["Оплачено", finSummary.income > 0 ? fmt(finSummary.income) + " ₸" : "—", "#059669", "#f0fdf4"],
              ["Долг", finSummary.debt > 0 ? fmt(finSummary.debt) + " ₸" : "—", finSummary.debt > 0 ? "#dc2626" : "#94a3b8", finSummary.debt > 0 ? "#fef2f2" : "#f8fafc"],
              ["Расходы", finSummary.expense > 0 ? fmt(finSummary.expense) + " ₸" : "—", "#dc2626", "#fef2f2"],
              ["Маржа", finSummary.margin != null ? (fmt(finSummary.income - finSummary.expense) + " ₸ / " + finSummary.margin + "%") : "—", finSummary.margin != null ? mCol(finSummary.margin) : "#94a3b8", "#f0fdf4"],
            ].map(([l, v, c, bg]) => (
              <div key={l} style={{ background: bg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${c}22` }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Компактная таблица финансов по этапам */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, overflowX: "auto" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>Финансы по этапам</div>
        {stages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "26px 0", fontSize: 13 }}>Этапы появятся автоматически при открытии объекта со сметой.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: 200 }}>Наименование работы</th>
                <th style={{ ...th, textAlign: "right" }}>Цена, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Себ. план /ед, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Себ. факт /ед, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Маржа план</th>
                <th style={{ ...th, textAlign: "right" }}>Маржа факт</th>
                <th style={{ ...th, textAlign: "center" }}>Опл.</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <tr><td colSpan={7} style={{ padding: "10px 8px 4px", fontSize: 11.5, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em", background: "#fffdf7" }}>{cat}</td></tr>
                  {list.map(s => {
                    const pc = num(s.priceClient), cf = num(s.costFact);
                    const mPlanSum = pc - num(s.costPlan), mpl = pc ? Math.round(mPlanSum / pc * 100) : 0;
                    const mFactSum = cf ? pc - cf : null, mft = (pc && cf) ? Math.round((pc - cf) / pc * 100) : null;
                    return (
                      <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9", background: s.paid ? "#f0fdf4" : "transparent" }}>
                        <td style={{ ...tdc, minWidth: 200 }}>
                          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 12.5 }}>{s.name || "—"}</div>
                          {(s.qty > 0 || s.unit) && <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 1 }}>{s.qty > 0 ? fmt(s.qty) : ""} {s.unit || ""}</div>}
                          <input value={s.note || ""} onChange={e => upd(s.id, { note: e.target.value })} placeholder="+ примечание" style={{ width: "100%", maxWidth: 240, border: "none", borderBottom: "1px dashed #e2e8f0", fontSize: 11, color: "#64748b", fontFamily: "inherit", outline: "none", marginTop: 3, padding: "1px 0", background: "transparent" }} />
                        </td>
                        <td style={{ ...tdc, minWidth: 92 }}><NumCell value={s.priceClient} onChange={v => upd(s.id, { priceClient: v })} /></td>
                        <td style={{ ...tdc, minWidth: 92 }}><PerUnitCell total={s.costPlan} qty={s.qty} onChange={v => upd(s.id, { costPlan: v })} /></td>
                        <td style={{ ...tdc, minWidth: 92 }}><PerUnitCell total={s.costFact} qty={s.qty} onChange={v => upd(s.id, { costFact: v })} /></td>
                        <td style={{ padding: "6px 8px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{margCell(mPlanSum, mpl)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{margCell(mFactSum, mft)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "top" }}><input type="checkbox" checked={!!s.paid} onChange={e => upd(s.id, { paid: e.target.checked })} title="Оплачено клиентом" style={{ width: 17, height: 17, cursor: "pointer" }} /></td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 800, color: "#0f172a" }}>
                <td style={{ padding: "9px 8px" }}>ИТОГО</td>
                <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmt(tot.priceClient)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmt(tot.costPlan)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmt(tot.costFact)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{margCell(mPlanSumTot, mPlanTot)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{margCell(mFactSumTot, mFactTot)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function MarginStat({ label, pct, amt, fmt }) {
  const good = pct >= 0.3;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: pct >= 0 ? (good ? "#059669" : "#d97706") : "#dc2626" }}>{Math.round(pct * 100)}%</div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(amt)} ₸</div>
    </div>
  );
}
