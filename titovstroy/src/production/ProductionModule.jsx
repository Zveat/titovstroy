import { useState, useMemo, useEffect, Fragment } from "react";
import {
  TASK_CATEGORIES, STAGE_STATUSES, emptyProduction,
} from "./constants.js";

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

// Превратить строки из сметы в объекты-этапы
const estToStages = (fromEst, genId) => fromEst.map(s => ({
  id: genId(), cat: s.cat || "Прочее", sub: s.sub || s.name || "", name: s.name || "",
  planStart: "", planEnd: "", factStart: "", factEnd: "",
  status: "todo", responsible: "", note: "", paid: false,
  priceClient: s.priceClient || 0, costPlan: s.costPlan || 0, works: s.works || [],
}));

// Группировка этапов по категории с сохранением порядка
const groupByCat = (stages) => {
  const g = {}; const order = [];
  for (const s of stages) { const c = s.cat || "Прочее"; if (!g[c]) { g[c] = []; order.push(c); } g[c].push(s); }
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

export default function ProductionModule({
  objects, allObjects, unlinkedProjects, estimates, contracts, productions,
  onSaveProduction, buildStagesFromEstimate,
  fmt, genId, currentUser,
}) {
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState("info");
  const [search, setSearch] = useState("");
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
    objects.find(o => o.id === openId) ||
    (() => { const pr = prodByObj[openId]; return pr ? { id: openId, clientName: pr.title || "Проект", address: pr.address || "", clientPhone: "" } : null; })()
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

  // ─── СПИСОК ОБЪЕКТОВ ───
  if (!openObj) {
    const q = search.toLowerCase().trim();
    const num = v => Number(v) || 0;
    const today = _dayStart(new Date());
    const nowD = new Date();
    const objIdSet = new Set(objects.map(o => o.id));
    const baseEntries = [
      ...objects.map(o => ({ id: o.id, name: o.clientName || "Без названия", address: o.address || "—", updatedAt: o.updatedAt || 0 })),
      ...(productions || []).filter(p => String(p.objectId).startsWith("fp:") && !objIdSet.has(p.objectId)).map(p => ({ id: p.objectId, name: p.title || "Проект", address: p.address || "—", updatedAt: p.updatedAt || 0 })),
    ];
    // Метрики объекта для светофора и сводки (тянутся из этапов/смет/производства)
    const metricsOf = (id) => {
      const p = prodByObj[id];
      const sts = p?.stages || [];
      const pc = sts.reduce((s, x) => s + num(x.priceClient), 0);
      const cp = sts.reduce((s, x) => s + num(x.costPlan), 0);
      const cf = sts.reduce((s, x) => s + num(x.costFact), 0);
      const mPlan = pc ? Math.round((pc - cp) / pc * 100) : null;
      const mFact = (pc && cf) ? Math.round((pc - cf) / pc * 100) : null;
      const received = (p?.clientPayments && p.clientPayments.length)
        ? p.clientPayments.reduce((s, x) => s + num(x.amount), 0)
        : num(p?.clientPaid);
      const debt = Math.max(0, pc - received);
      const doneStages = sts.filter(s => s.status === "done").length;
      const prog = sts.length ? Math.round(doneStages / sts.length * 100) : launchProgress(p);
      const defectsOpen = (p?.defects || []).filter(d => !d.done).length;
      const finished = !!p?.factEndDate;
      let daysLeft = null, overdue = false;
      if (!finished && p?.planEndDate) { daysLeft = Math.round((_dayStart(p.planEndDate) - today) / 864e5); if (daysLeft < 0) overdue = true; }
      const overdueStages = sts.some(s => s.status !== "done" && s.planEnd && _dayStart(s.planEnd) < today);
      let sev, color, label;
      if (finished) { sev = 0; color = "#94a3b8"; label = "Сдан ✓"; }
      else if (overdue || overdueStages) { sev = 3; color = "#dc2626"; label = "Просрочка"; }
      else if ((daysLeft != null && daysLeft <= 5) || defectsOpen > 0) { sev = 2; color = "#d97706"; label = "Внимание"; }
      else { sev = 1; color = "#059669"; label = "В норме"; }
      const fd = finished ? new Date(p.factEndDate) : null;
      const finishedThisMonth = !!(fd && fd.getMonth() === nowD.getMonth() && fd.getFullYear() === nowD.getFullYear());
      return { pc, cp, cf, mPlan, mFact, debt, prog, defectsOpen, finished, daysLeft, sev, color, label, responsible: p?.responsible || "", stagesCount: sts.length, doneStages, finishedThisMonth };
    };
    const rows = baseEntries
      .filter(o => !q || [o.name, o.address].some(v => v && v.toLowerCase().includes(q)))
      .map(o => ({ ...o, m: metricsOf(o.id) }))
      .sort((a, b) => (b.m.sev - a.m.sev) || ((a.m.daysLeft == null ? 999 : a.m.daysLeft) - (b.m.daysLeft == null ? 999 : b.m.daysLeft)) || (b.updatedAt - a.updatedAt));
    const sum = rows.reduce((a, r) => { a.pc += r.m.pc; a.cp += r.m.cp; a.cf += r.m.cf; a.debt += r.m.debt; a.defects += r.m.defectsOpen; if (r.m.finished) { a.done++; if (r.m.finishedThisMonth) a.doneMonth++; } else a.inWork++; if (r.m.sev === 3) a.overdue++; return a; }, { pc: 0, cp: 0, cf: 0, debt: 0, defects: 0, done: 0, doneMonth: 0, inWork: 0, overdue: 0 });
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>🏗 Производство</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по клиенту, адресу…"
              style={{ flex: "1 1 200px", minWidth: 180, border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
            <button onClick={() => setAddOpen(v => !v)} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ Добавить объект</button>
          </div>
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
          {sumCard("Дебиторка", `${fmt(sum.debt)} ₸`, "клиенты должны", sum.debt > 0 ? "#dc2626" : "#059669")}
          {sumCard("Просрочено", sum.overdue, "объектов", sum.overdue ? "#dc2626" : "#059669")}
          {sumCard("Замечаний", sum.defects, "открыто", sum.defects ? "#d97706" : "#059669")}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Объектов: {rows.length} · сверху — что горит 🔴</div>
        {rows.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "50px 0", fontSize: 14 }}>Нет объектов в производстве.</div>}
        {/* ── Светофор ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
          {rows.map(o => {
            const m = o.m;
            return (
              <div key={o.id} onClick={() => { setOpenId(o.id); setTab("info"); }}
                style={{ background: "#fff", border: "1px solid #e2e8f0", borderLeft: `4px solid ${m.color}`, borderRadius: 14, padding: 16, cursor: "pointer", transition: "box-shadow .15s, transform .1s" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.address}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: m.color, background: m.color + "18", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>{m.label}{(m.daysLeft != null && !m.finished) ? (m.daysLeft < 0 ? ` ${-m.daysLeft}д` : ` ${m.daysLeft}д`) : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 10px" }}>
                  <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${m.prog}%`, height: "100%", background: m.prog === 100 ? "#059669" : "#2563eb", transition: "width .3s" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", minWidth: 34, textAlign: "right" }}>{m.prog}%</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: "#64748b" }}>
                  {m.stagesCount > 0 && <span>🔨 {m.doneStages}/{m.stagesCount}</span>}
                  {m.mPlan != null && <span>📊 маржа {m.mFact != null ? `${m.mFact}% факт` : `${m.mPlan}% план`}</span>}
                  {m.debt > 0 && <span style={{ color: "#dc2626" }}>💸 {fmt(m.debt)} ₸</span>}
                  {m.defectsOpen > 0 && <span style={{ color: "#d97706" }}>⚠ {m.defectsOpen}</span>}
                  {m.responsible && <span>👷 {m.responsible}</span>}
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
    { key: "tasks", label: "Задачи", icon: "✅" },
    { key: "finance", label: "Финансы", icon: "💰" },
    { key: "journal", label: "Журнал", icon: "📖" },
    { key: "defects", label: "Замечания", icon: "⚠️" },
    { key: "handover", label: "Сдача", icon: "🏁" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => setOpenId(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b", padding: 0 }}>←</button>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a" }}>{openObj.clientName || "Объект"}</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>{openObj.address || "—"}{openObj.clientPhone ? ` · 📞 ${openObj.clientPhone}` : ""}</div>
        </div>
      </div>

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
      {tab === "stages" && <StagesTab prod={openProd} patch={patchProd} genId={genId} buildStagesFromEstimate={buildStagesFromEstimate} objId={openObj.id} />}
      {tab === "tasks" && <TasksTab prod={openProd} patch={patchProd} genId={genId} />}
      {tab === "finance" && <FinanceTab prod={openProd} patch={patchProd} genId={genId} fmt={fmt} buildStagesFromEstimate={buildStagesFromEstimate} objId={openObj.id} />}
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
        <Metric label="Этапы" value={stages.length ? `${doneStages} / ${stages.length}` : "—"} sub={stages.length ? `выполнено ${stageProg}%` : "нет этапов"} color="#059669" />
        <Metric label="Запуск объекта" value={launch.length ? `${launchDone} / ${launch.length}` : "—"} sub="чек-лист запуска" color="#7c3aed" />
        <Metric label="Сумма смет" value={`${fmt(totalEst)} ₸`} sub={`${objEstimates.length} смет(ы)`} />
        <Metric label="Договоры" value={totalCon ? `${fmt(totalCon)} ₸` : (objContracts.length || "—")} sub={`${objContracts.length} шт`} />
      </div>
      {/* Прогресс по этапам */}
      {stages.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 7 }}><span style={{ fontWeight: 600 }}>Прогресс по этапам</span><span style={{ fontWeight: 800, color: "#059669" }}>{stageProg}%</span></div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}><div style={{ width: stageProg + "%", height: "100%", background: "#059669", borderRadius: 5, transition: "width .3s" }} /></div>
        </div>
      )}
      {/* Производственные поля */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Производственная информация</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          {fld("Ответственный прораб / менеджер", "responsible")}
          {fld("Доступ (ключ, код, пропуск)", "access")}
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

// ─── ВКЛАДКА: ЧЕК-ЛИСТ (запуск / сдача) ───
function ChecklistTab({ kind, prod, patch, genId, title }) {
  const items = prod[kind] || [];
  const [newText, setNewText] = useState("");
  const upd = (id, p) => patch({ [kind]: items.map(it => it.id === id ? { ...it, ...p } : it) });
  const del = (id) => patch({ [kind]: items.filter(it => it.id !== id) });
  const add = () => { if (!newText.trim()) return; patch({ [kind]: [...items, { id: genId(), text: newText.trim(), done: false, responsible: "", note: "" }] }); setNewText(""); };
  const doneCount = items.filter(i => i.done).length;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: doneCount === items.length && items.length ? "#059669" : "#2563eb" }}>{doneCount} / {items.length}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
            <input type="checkbox" checked={!!it.done} onChange={e => upd(it.id, { done: e.target.checked })} style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }} />
            <input value={it.text} onChange={e => upd(it.id, { text: e.target.value })}
              style={{ flex: 1, border: "none", fontSize: 13, fontFamily: "inherit", outline: "none", color: it.done ? "#94a3b8" : "#0f172a", textDecoration: it.done ? "line-through" : "none", background: "transparent", minWidth: 0 }} />
            <input value={it.responsible || ""} onChange={e => upd(it.id, { responsible: e.target.value })} placeholder="Кто"
              style={{ width: 110, border: "1px solid #f1f5f9", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", flexShrink: 0 }} />
            <button onClick={() => del(it.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Добавить пункт…"
          style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button onClick={add} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Добавить</button>
      </div>
    </div>
  );
}

// ─── ВКЛАДКА: ЭТАПЫ И СРОКИ (группировка категория › подкатегория + Gantt) ───
function StagesTab({ prod, patch, genId, buildStagesFromEstimate, objId }) {
  const stages = prod.stages || [];
  const [newCat, setNewCat] = useState("");
  const [newName, setNewName] = useState("");
  const upd = (id, p) => patch({ stages: stages.map(s => s.id === id ? { ...s, ...p } : s) });
  const del = (id) => patch({ stages: stages.filter(s => s.id !== id) });
  const addManual = () => {
    if (!newName.trim()) return;
    patch({ stages: [...stages, { id: genId(), cat: newCat.trim() || "Прочее", name: newName.trim(), planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo", responsible: "", note: "", priceClient: 0, costPlan: 0 }] });
    setNewName("");
  };
  const syncFromEstimate = () => {
    const fromEst = buildStagesFromEstimate(objId);
    if (!fromEst.length) { alert("Нет привязанной сметы с позициями."); return; }
    const exist = new Set(stages.map(s => ((s.cat || "") + "|" + (s.name || "")).toLowerCase()));
    const toAdd = fromEst
      .filter(s => !exist.has(((s.cat || "") + "|" + (s.name || "")).toLowerCase()))
      .map(s => ({ id: genId(), cat: s.cat || "Прочее", sub: s.sub || s.name || "", name: s.name, planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo", responsible: "", note: "", paid: false, priceClient: s.priceClient || 0, costPlan: s.costPlan || 0, works: s.works || [] }));
    if (!toAdd.length) { alert("Все этапы из сметы уже добавлены."); return; }
    patch({ stages: [...stages, ...toAdd] });
  };
  // наименования работ под этап (из этапа, иначе из сметы), длительности
  const estStages = buildStagesFromEstimate(objId) || [];
  const worksFor = (s) => (Array.isArray(s.works) && s.works.length) ? s.works
    : ((estStages.find(f => ((f.cat || "") + "|" + (f.name || "")).toLowerCase() === ((s.cat || "") + "|" + (s.name || "")).toLowerCase())?.works) || []);
  const daysIncl = (a, b) => (a && b) ? Math.max(0, Math.round((_dayStart(b) - _dayStart(a)) / 864e5)) + 1 : null;
  const inWorkDays = (s) => s.factStart ? Math.max(0, Math.round((_dayStart(s.factEnd || new Date()) - _dayStart(s.factStart)) / 864e5)) + 1 : null;
  const thS = { padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap", textAlign: "left" };
  const tdS = { padding: "5px 8px", verticalAlign: "top" };
  const dInp = { width: "100%", minWidth: 118, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 11.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" };

  const grouped = groupByCat(stages);

  // График (Гантт): шкала дат + линия «сегодня» + бары план/факт
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Этапы и сроки ({stages.length})</div>
          <button onClick={syncFromEstimate} style={{ background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ Обновить из сметы</button>
        </div>
        {stages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Нажмите «Обновить из сметы» или добавьте этап вручную ниже.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...thS, minWidth: 170 }}>Этап / работы</th>
                <th style={thS}>Статус</th>
                <th style={thS}>План (старт / конец)</th>
                <th style={thS}>Факт (старт / конец)</th>
                <th style={thS}>Дней</th>
                <th style={thS}>Ответств.</th>
                <th style={thS}></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <tr><td colSpan={7} style={{ padding: "9px 8px 3px", fontSize: 11, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em" }}>{cat}</td></tr>
                  {list.map(s => {
                    const st = stByKey(s.status);
                    const ws = worksFor(s).filter(w => w.name);
                    const iw = inWorkDays(s), pd = daysIncl(s.planStart, s.planEnd);
                    return (
                      <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ ...tdS, minWidth: 170, borderLeft: `3px solid ${st.color}` }}>
                          <input value={s.name} onChange={e => upd(s.id, { name: e.target.value })} placeholder="Этап (подкатегория)" style={{ width: "100%", border: "none", fontSize: 12.5, fontWeight: 600, color: "#0f172a", fontFamily: "inherit", outline: "none", background: "transparent", padding: 0 }} />
                          {ws.length > 0 && <div style={{ fontSize: 10.5, color: "#94a3b8", lineHeight: 1.4, marginTop: 1 }}>{ws.map(w => w.name).join(", ")}</div>}
                          <input value={s.note || ""} onChange={e => upd(s.id, { note: e.target.value })} placeholder="+ примечание" style={{ width: "100%", maxWidth: 220, border: "none", borderBottom: "1px dashed #e2e8f0", fontSize: 11, color: "#64748b", fontFamily: "inherit", outline: "none", marginTop: 3, padding: "1px 0", background: "transparent" }} />
                        </td>
                        <td style={tdS}>
                          <select value={s.status} onChange={e => upd(s.id, { status: e.target.value })} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 6px", fontSize: 11.5, fontFamily: "inherit", color: st.color, background: st.bg, fontWeight: 700, cursor: "pointer", maxWidth: 116 }}>
                            {STAGE_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        </td>
                        <td style={tdS}>
                          <input type="date" value={s.planStart || ""} onChange={e => upd(s.id, { planStart: e.target.value })} style={dInp} />
                          <input type="date" value={s.planEnd || ""} onChange={e => upd(s.id, { planEnd: e.target.value })} style={{ ...dInp, marginTop: 3 }} />
                        </td>
                        <td style={tdS}>
                          <input type="date" value={s.factStart || ""} onChange={e => upd(s.id, { factStart: e.target.value })} style={dInp} />
                          <input type="date" value={s.factEnd || ""} onChange={e => upd(s.id, { factEnd: e.target.value })} style={{ ...dInp, marginTop: 3 }} />
                        </td>
                        <td style={{ ...tdS, whiteSpace: "nowrap", fontSize: 11.5 }}>
                          {iw != null && <div style={{ color: "#2563eb", fontWeight: 700 }}>🔨 {iw}</div>}
                          {pd != null && <div style={{ color: "#94a3b8" }}>план {pd}</div>}
                          {iw == null && pd == null && <span style={{ color: "#cbd5e1" }}>—</span>}
                        </td>
                        <td style={tdS}>
                          <input value={s.responsible || ""} onChange={e => upd(s.id, { responsible: e.target.value })} placeholder="—" style={{ width: "100%", minWidth: 80, border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px", fontSize: 11.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                        </td>
                        <td style={{ ...tdS, textAlign: "center" }}>
                          <button onClick={() => del(s.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15 }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {/* Ручное добавление */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Категория (необяз.)"
            style={{ flex: "1 1 140px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addManual()} placeholder="Название этапа"
            style={{ flex: "2 1 200px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button onClick={addManual} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Этап</button>
        </div>
      </div>

      {/* Gantt */}
      {stages.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, overflowX: "auto" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>График работ (Гантт)</div>
          {ganttStages.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Укажите план/факт даты у этапов выше — здесь появится график.</div>
          ) : (
            <div style={{ minWidth: 480 }}>
              <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
                <span><span style={{ display: "inline-block", width: 14, height: 8, background: "#93c5fd", borderRadius: 3, marginRight: 4, verticalAlign: "middle" }} />План</span>
                <span><span style={{ display: "inline-block", width: 14, height: 8, background: "#059669", borderRadius: 3, marginRight: 4, verticalAlign: "middle" }} />Факт</span>
                {todayPct != null && <span><span style={{ display: "inline-block", width: 2, height: 12, background: "#ef4444", marginRight: 5, verticalAlign: "middle" }} />Сегодня</span>}
              </div>
              {/* ось дат */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ width: 160, flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#94a3b8" }}>
                  <span>{fmtD(minD)}</span><span>{fmtD((minD + maxD) / 2)}</span><span>{fmtD(maxD)}</span>
                </div>
              </div>
              {ganttStages.map(s => {
                const st = stByKey(s.status);
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                    <div style={{ width: 160, flexShrink: 0, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                      <div style={{ fontSize: 9.5, color: st.color }}>{st.label}</div>
                    </div>
                    <div style={{ position: "relative", flex: 1, height: 28, background: "#f8fafc", borderRadius: 6, minWidth: 240, border: "1px solid #f1f5f9" }}>
                      {todayPct != null && <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: "#ef4444", zIndex: 2 }} />}
                      {bar(s.planStart, s.planEnd, "#93c5fd", 5, 8)}
                      {bar(s.factStart, s.factEnd, "#059669", 16, 8)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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

// ─── ВКЛАДКА: СРОЧНЫЕ ЗАДАЧИ ───
function TasksTab({ prod, patch, genId }) {
  const tasks = prod.tasks || [];
  const [newText, setNewText] = useState("");
  const [newCat, setNewCat] = useState("material");
  const upd = (id, p) => patch({ tasks: tasks.map(t => t.id === id ? { ...t, ...p } : t) });
  const del = (id) => patch({ tasks: tasks.filter(t => t.id !== id) });
  const add = () => { if (!newText.trim()) return; patch({ tasks: [{ id: genId(), text: newText.trim(), category: newCat, responsible: "", done: false }, ...tasks] }); setNewText(""); };
  const catBy = (k) => TASK_CATEGORIES.find(c => c.key === k) || TASK_CATEGORIES[TASK_CATEGORIES.length - 1];
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Срочные задачи ({tasks.filter(t => !t.done).length} активных)</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={newCat} onChange={e => setNewCat(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
          {TASK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Новая задача…"
          style={{ flex: "1 1 200px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button onClick={add} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Добавить</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {tasks.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Нет задач</div>}
        {tasks.map(t => {
          const c = catBy(t.category);
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
              <input type="checkbox" checked={!!t.done} onChange={e => upd(t.id, { done: e.target.checked })} style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.color + "18", borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>{c.label}</span>
              <input value={t.text} onChange={e => upd(t.id, { text: e.target.value })}
                style={{ flex: 1, border: "none", fontSize: 13, fontFamily: "inherit", outline: "none", color: t.done ? "#94a3b8" : "#0f172a", textDecoration: t.done ? "line-through" : "none", background: "transparent", minWidth: 0 }} />
              <input value={t.responsible || ""} onChange={e => upd(t.id, { responsible: e.target.value })} placeholder="Кто"
                style={{ width: 110, border: "1px solid #f1f5f9", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", flexShrink: 0 }} />
              <button onClick={() => del(t.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✕</button>
            </div>
          );
        })}
      </div>
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
                <input value={it.text} onChange={e => upd(it.id, { text: e.target.value })}
                  style={{ width: "100%", border: "none", fontSize: 13, fontFamily: "inherit", outline: "none", color: it.done ? "#94a3b8" : "#0f172a", textDecoration: it.done ? "line-through" : "none", background: "transparent" }} />
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
function NumCell({ value, onChange, ph = "—" }) {
  const txt = (value === undefined || value === null || value === "") ? "" : new Intl.NumberFormat("ru-RU").format(value);
  return <input type="text" inputMode="numeric" value={txt} placeholder={ph}
    onChange={e => { const d = e.target.value.replace(/[^\d]/g, ""); onChange(d === "" ? undefined : Number(d)); }}
    style={{ width: "100%", minWidth: 64, border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 6px", fontSize: 12.5, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }} />;
}

function FinanceTab({ prod, patch, genId, fmt, buildStagesFromEstimate, objId }) {
  const stages = prod.stages || [];
  const upd = (id, p) => patch({ stages: stages.map(s => s.id === id ? { ...s, ...p } : s) });
  const syncFromEstimate = () => {
    const fromEst = buildStagesFromEstimate(objId);
    if (!fromEst.length) { alert("Нет привязанной сметы с позициями."); return; }
    const exist = new Set(stages.map(s => ((s.cat || "") + "|" + (s.name || "")).toLowerCase()));
    const toAdd = fromEst
      .filter(s => !exist.has(((s.cat || "") + "|" + (s.name || "")).toLowerCase()))
      .map(s => ({ id: genId(), cat: s.cat || "Прочее", sub: s.sub || s.name || "", name: s.name, planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo", responsible: "", note: "", paid: false, priceClient: s.priceClient || 0, costPlan: s.costPlan || 0, works: s.works || [] }));
    const merged = stages.map(s => {
      const m = fromEst.find(f => ((f.cat || "") + "|" + (f.name || "")).toLowerCase() === ((s.cat || "") + "|" + (s.name || "")).toLowerCase());
      return m ? { ...s, sub: s.sub || m.sub || s.name, works: (m.works && m.works.length) ? m.works : (s.works || []), priceClient: s.priceClient || m.priceClient || 0, costPlan: s.costPlan || m.costPlan || 0 } : s;
    });
    patch({ stages: [...merged, ...toAdd] });
  };
  // Наименования работ под этап: из самого этапа, иначе подтягиваем из сметы на лету (без сохранения)
  const estStages = buildStagesFromEstimate(objId) || [];
  const worksFor = (s) => (Array.isArray(s.works) && s.works.length) ? s.works
    : ((estStages.find(f => ((f.cat || "") + "|" + (f.name || "")).toLowerCase() === ((s.cat || "") + "|" + (s.name || "")).toLowerCase())?.works) || []);
  const num = (v) => Number(v) || 0;
  const tot = stages.reduce((a, s) => { a.priceClient += num(s.priceClient); a.costPlan += num(s.costPlan); a.costFact += num(s.costFact); return a; }, { priceClient: 0, costPlan: 0, costFact: 0 });
  // Платежи клиента — удобный список (аванс, этапные платежи) вместо одного поля
  const payments = (prod.clientPayments && prod.clientPayments.length) ? prod.clientPayments
    : (num(prod.clientPaid) > 0 ? [{ id: "legacy", date: "", amount: num(prod.clientPaid), note: "" }] : []);
  const received = payments.reduce((s, p) => s + num(p.amount), 0);
  const debt = tot.priceClient - received;
  const savePay = (arr) => patch({ clientPayments: arr, clientPaid: undefined });
  const grouped = groupByCat(stages);
  const mColor = (p) => p >= 30 ? "#059669" : p >= 0 ? "#d97706" : "#dc2626";
  const mPlanTot = tot.priceClient ? Math.round((tot.priceClient - tot.costPlan) / tot.priceClient * 100) : 0;
  const mFactTot = (tot.priceClient && tot.costFact) ? Math.round((tot.priceClient - tot.costFact) / tot.priceClient * 100) : null;
  const th = { padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" };
  const tdc = { padding: "4px 6px", verticalAlign: "top" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Деньги клиента + платежи */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 22px", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>К оплате: <b style={{ fontSize: 14, color: "#0f172a" }}>{fmt(tot.priceClient)} ₸</b></span>
          <span style={{ fontSize: 12, color: "#64748b" }}>Получено: <b style={{ fontSize: 14, color: "#059669" }}>{fmt(received)} ₸</b></span>
          <span style={{ fontSize: 12, color: "#64748b" }}>Дебиторка: <b style={{ fontSize: 14, color: debt > 0 ? "#dc2626" : "#059669" }}>{fmt(Math.max(0, debt))} ₸</b>{debt < 0 ? ` (переплата ${fmt(-debt)} ₸)` : ""}</span>
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>Платежи от клиента</div>
        {payments.length === 0 && <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 6 }}>Платежей пока нет</div>}
        {payments.map(p => (
          <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <input type="date" value={p.date || ""} onChange={e => savePay(payments.map(x => x.id === p.id ? { ...x, date: e.target.value } : x))} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            <div style={{ width: 130 }}><NumCell value={p.amount} onChange={v => savePay(payments.map(x => x.id === p.id ? { ...x, amount: v } : x))} ph="сумма" /></div>
            <input value={p.note || ""} onChange={e => savePay(payments.map(x => x.id === p.id ? { ...x, note: e.target.value } : x))} placeholder="комментарий (аванс / этап…)" style={{ flex: "1 1 120px", minWidth: 100, border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            <button onClick={() => savePay(payments.filter(x => x.id !== p.id))} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        ))}
        <button onClick={() => savePay([...payments, { id: genId(), date: new Date().toISOString().slice(0, 10), amount: undefined, note: "" }])} style={{ marginTop: 4, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Платёж от клиента</button>
      </div>

      {/* Компактная таблица финансов по этапам */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Финансы по этапам</div>
          <button onClick={syncFromEstimate} style={{ background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ Обновить из сметы</button>
        </div>
        {stages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "26px 0", fontSize: 13 }}>Нажмите «Обновить из сметы» — этапы и суммы подтянутся.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 660, fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: 160 }}>Этап / работы</th>
                <th style={{ ...th, textAlign: "right" }}>Цена, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Себ. план, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Себ. факт, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Маржа п/ф</th>
                <th style={{ ...th, textAlign: "center" }}>Опл.</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <tr><td colSpan={6} style={{ padding: "9px 8px 3px", fontSize: 11, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em" }}>{cat}</td></tr>
                  {list.map(s => {
                    const pc = num(s.priceClient), cf = num(s.costFact);
                    const mpl = pc ? Math.round((pc - num(s.costPlan)) / pc * 100) : 0;
                    const mft = (pc && cf) ? Math.round((pc - cf) / pc * 100) : null;
                    const ws = worksFor(s).filter(w => w.name);
                    return (
                      <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9", background: s.paid ? "#f0fdf4" : "transparent" }}>
                        <td style={{ ...tdc, minWidth: 160 }}>
                          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 12.5 }}>{s.sub || s.name || "—"}</div>
                          {ws.length > 0 && <div style={{ fontSize: 10.5, color: "#94a3b8", lineHeight: 1.4, marginTop: 1 }}>{ws.map(w => w.name).join(", ")}</div>}
                          <input value={s.note || ""} onChange={e => upd(s.id, { note: e.target.value })} placeholder="+ примечание" style={{ width: "100%", maxWidth: 220, border: "none", borderBottom: "1px dashed #e2e8f0", fontSize: 11, color: "#64748b", fontFamily: "inherit", outline: "none", marginTop: 3, padding: "1px 0", background: "transparent" }} />
                        </td>
                        <td style={{ ...tdc, minWidth: 92 }}><NumCell value={s.priceClient} onChange={v => upd(s.id, { priceClient: v })} /></td>
                        <td style={{ ...tdc, minWidth: 92 }}><NumCell value={s.costPlan} onChange={v => upd(s.id, { costPlan: v })} /></td>
                        <td style={{ ...tdc, minWidth: 92 }}><NumCell value={s.costFact} onChange={v => upd(s.id, { costFact: v })} /></td>
                        <td style={{ padding: "6px 8px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}><b style={{ color: mColor(mpl) }}>{mpl}%</b><span style={{ color: "#cbd5e1" }}> / </span>{mft != null ? <b style={{ color: mColor(mft) }}>{mft}%</b> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
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
                <td style={{ padding: "9px 8px", textAlign: "right", whiteSpace: "nowrap" }}><b style={{ color: mColor(mPlanTot) }}>{mPlanTot}%</b><span style={{ color: "#cbd5e1" }}> / </span>{mFactTot != null ? <b style={{ color: mColor(mFactTot) }}>{mFactTot}%</b> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
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
