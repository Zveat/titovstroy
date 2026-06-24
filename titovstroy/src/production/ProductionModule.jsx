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
  id: genId(), cat: s.cat || "Прочее", name: s.name || "",
  planStart: "", planEnd: "", factStart: "", factEnd: "",
  status: "todo", responsible: "", note: "",
  priceClient: s.priceClient || 0, costPlan: s.costPlan || 0,
}));

// Группировка этапов по категории с сохранением порядка
const groupByCat = (stages) => {
  const g = {}; const order = [];
  for (const s of stages) { const c = s.cat || "Прочее"; if (!g[c]) { g[c] = []; order.push(c); } g[c].push(s); }
  return order.map(c => [c, g[c]]);
};

export default function ProductionModule({
  objects, allObjects, estimates, contracts, productions,
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

  const openObj = objects.find(o => o.id === openId);
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
    const list = objects
      .filter(o => !q || [o.clientName, o.address, o.clientPhone].some(v => v && v.toLowerCase().includes(q)))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
          const candidates = (allObjects || []).filter(o => !o.deletedAt && !prodIds.has(o.id));
          return (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Добавить объект в производство вручную ({candidates.length} доступно):</div>
              <select defaultValue="" onChange={e => { const o = (allObjects || []).find(x => x.id === e.target.value); if (o) { onSaveProduction(emptyProduction(o.id, genId)); setAddOpen(false); } }}
                style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}>
                <option value="">— Выбрать объект —</option>
                {candidates.map(o => <option key={o.id} value={o.id}>{o.clientName || "Без имени"}{o.address ? " · " + o.address : ""}</option>)}
              </select>
              {candidates.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Все объекты уже в производстве.</div>}
            </div>
          );
        })()}
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Объектов: {list.length}</div>
        {list.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "50px 0", fontSize: 14 }}>Нет объектов. Объекты создаются в разделе «Объекты».</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
          {list.map(o => {
            const p = prodByObj[o.id];
            const prog = launchProgress(p);
            const stages = p?.stages || [];
            const doneStages = stages.filter(s => s.status === "done").length;
            const estCount = estimates.filter(e => e.objectId === o.id).length;
            return (
              <div key={o.id} onClick={() => { setOpenId(o.id); setTab("info"); }}
                style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, cursor: "pointer", transition: "box-shadow .15s, transform .1s" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.clientName || "Без названия"}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.address || "—"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${prog}%`, height: "100%", background: prog === 100 ? "#059669" : "#2563eb", transition: "width .3s" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: prog === 100 ? "#059669" : "#2563eb", minWidth: 34, textAlign: "right" }}>{prog}%</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94a3b8" }}>
                  <span>📋 запуск {prog}%</span>
                  {stages.length > 0 && <span>🔨 этапы {doneStages}/{stages.length}</span>}
                  {estCount > 0 && <span>📐 смет {estCount}</span>}
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
    </div>
  );
}

// ─── ВКЛАДКА: ИНФОРМАЦИЯ ───
function InfoTab({ prod, obj, estimates, contracts, fmt, patch }) {
  const objEstimates = estimates.filter(e => e.objectId === obj.id);
  const objContracts = contracts.filter(c => c.objectId === obj.id && !c.deletedAt);
  const totalEst = objEstimates.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const fld = (label, key, type = "text") => (
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <input type={type} value={prod[key] || ""} onChange={e => patch({ [key]: e.target.value })}
        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <Stat label="Смет по объекту" value={objEstimates.length} />
        <Stat label="Сумма смет" value={`${fmt(totalEst)} ₸`} />
        <Stat label="Договоров" value={objContracts.length} />
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
      .map(s => ({ id: genId(), cat: s.cat || "Прочее", name: s.name, planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo", responsible: "", note: "", priceClient: s.priceClient || 0, costPlan: s.costPlan || 0 }));
    if (!toAdd.length) { alert("Все этапы из сметы уже добавлены."); return; }
    patch({ stages: [...stages, ...toAdd] });
  };

  const grouped = groupByCat(stages);

  // Gantt
  const dates = stages.flatMap(s => [s.planStart, s.planEnd, s.factStart, s.factEnd]).filter(Boolean).map(d => new Date(d).getTime());
  const minD = dates.length ? Math.min(...dates) : 0;
  const maxD = dates.length ? Math.max(...dates) : 0;
  const span = maxD - minD || 1;
  const bar = (start, end, color, top) => {
    if (!start || !end) return null;
    const s = new Date(start).getTime(), e = new Date(end).getTime();
    const left = ((s - minD) / span) * 100;
    const width = Math.max(2, ((e - s) / span) * 100);
    return <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: 7, borderRadius: 4, background: color, top }} />;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Этапы работ ({stages.length})</div>
          <button onClick={syncFromEstimate} style={{ background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ Обновить из сметы</button>
        </div>
        {stages.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Этапы подтянутся из сметы автоматически. Можно добавить и вручную ниже.</div>}

        {grouped.map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>{cat}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {list.map(s => {
                const st = stByKey(s.status);
                return (
                  <div key={s.id} style={{ border: "1px solid #f1f5f9", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                      <input value={s.name} onChange={e => upd(s.id, { name: e.target.value })} placeholder="Название этапа"
                        style={{ flex: "1 1 200px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", outline: "none" }} />
                      <select value={s.status} onChange={e => upd(s.id, { status: e.target.value })}
                        style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "inherit", color: st.color, background: st.bg, fontWeight: 700, cursor: "pointer" }}>
                        {STAGE_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                      <button onClick={() => del(s.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15 }}>✕</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
                      <DateF label="План старт" v={s.planStart} on={v => upd(s.id, { planStart: v })} />
                      <DateF label="План конец" v={s.planEnd} on={v => upd(s.id, { planEnd: v })} />
                      <DateF label="Факт старт" v={s.factStart} on={v => upd(s.id, { factStart: v })} />
                      <DateF label="Факт конец" v={s.factEnd} on={v => upd(s.id, { factEnd: v })} />
                      <div>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Ответственный</div>
                        <input value={s.responsible || ""} onChange={e => upd(s.id, { responsible: e.target.value })}
                          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Ручное добавление */}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
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
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>График работ (план / факт)</div>
          {dates.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Укажите даты этапов выше — здесь появится график.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 11, color: "#64748b" }}>
                <span><span style={{ display: "inline-block", width: 14, height: 7, background: "#93c5fd", borderRadius: 3, marginRight: 4, verticalAlign: "middle" }} />План</span>
                <span><span style={{ display: "inline-block", width: 14, height: 7, background: "#059669", borderRadius: 3, marginRight: 4, verticalAlign: "middle" }} />Факт</span>
              </div>
              {stages.filter(s => s.name).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 180, fontSize: 12, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{s.name}</div>
                  <div style={{ position: "relative", flex: 1, height: 24, background: "#f8fafc", borderRadius: 6, minWidth: 200 }}>
                    {bar(s.planStart, s.planEnd, "#93c5fd", 6)}
                    {bar(s.factStart, s.factEnd, "#059669", 13)}
                  </div>
                </div>
              ))}
            </>
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

// ─── ВКЛАДКА: ФИНАНСОВЫЙ БЛОК (по этапам, группировка категория › подкатегория) ───
function FinanceTab({ prod, patch, genId, fmt, buildStagesFromEstimate, objId }) {
  const stages = prod.stages || [];
  const upd = (id, p) => patch({ stages: stages.map(s => s.id === id ? { ...s, ...p } : s) });
  const syncFromEstimate = () => {
    const fromEst = buildStagesFromEstimate(objId);
    if (!fromEst.length) { alert("Нет привязанной сметы с позициями."); return; }
    const exist = new Set(stages.map(s => ((s.cat || "") + "|" + (s.name || "")).toLowerCase()));
    const toAdd = fromEst
      .filter(s => !exist.has(((s.cat || "") + "|" + (s.name || "")).toLowerCase()))
      .map(s => ({ id: genId(), cat: s.cat || "Прочее", name: s.name, planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo", responsible: "", note: "", priceClient: s.priceClient || 0, costPlan: s.costPlan || 0 }));
    const merged = stages.map(s => {
      const m = fromEst.find(f => ((f.cat || "") + "|" + (f.name || "")).toLowerCase() === ((s.cat || "") + "|" + (s.name || "")).toLowerCase());
      return m ? { ...s, priceClient: s.priceClient || m.priceClient || 0, costPlan: s.costPlan || m.costPlan || 0 } : s;
    });
    patch({ stages: [...merged, ...toAdd] });
  };
  const num = (v) => Number(v) || 0;
  const tot = stages.reduce((a, s) => { a.priceClient += num(s.priceClient); a.costPlan += num(s.costPlan); a.costFact += num(s.costFact); return a; }, { priceClient: 0, costPlan: 0, costFact: 0 });
  const marginPlan = tot.priceClient ? (tot.priceClient - tot.costPlan) / tot.priceClient : 0;
  const marginFact = tot.priceClient ? (tot.priceClient - tot.costFact) / tot.priceClient : 0;
  const grouped = groupByCat(stages);

  const cell = { padding: "8px 10px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #f1f5f9" };
  const inpC = { width: 90, border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 6px", fontSize: 12, textAlign: "right", fontFamily: "inherit", outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <Stat label="Цена клиенту" value={`${fmt(tot.priceClient)} ₸`} />
        <Stat label="Себест. план" value={`${fmt(tot.costPlan)} ₸`} />
        <Stat label="Себест. факт" value={`${fmt(tot.costFact)} ₸`} />
        <MarginStat label="Маржа план" pct={marginPlan} amt={tot.priceClient - tot.costPlan} fmt={fmt} />
        <MarginStat label="Маржа факт" pct={marginFact} amt={tot.priceClient - tot.costFact} fmt={fmt} />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Финансы по этапам</div>
          <button onClick={syncFromEstimate} style={{ background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ Обновить из сметы</button>
        </div>
        {stages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "30px 0", fontSize: 13 }}>Этапы подтянутся из сметы автоматически.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr style={{ fontSize: 11, color: "#94a3b8", textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>Этап</th>
                <th style={{ padding: "8px 10px" }}>Цена клиенту</th>
                <th style={{ padding: "8px 10px" }}>Себест. план</th>
                <th style={{ padding: "8px 10px" }}>Себест. факт</th>
                <th style={{ padding: "8px 10px" }}>Маржа факт</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <tr><td colSpan={5} style={{ padding: "10px 10px 4px", fontSize: 11, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em" }}>{cat}</td></tr>
                  {list.map(s => {
                    const m = num(s.priceClient) ? (num(s.priceClient) - num(s.costFact)) / num(s.priceClient) : 0;
                    return (
                      <tr key={s.id}>
                        <td style={{ ...cell, textAlign: "left", fontWeight: 600, color: "#0f172a", paddingLeft: 20 }}>{s.name || "—"}</td>
                        <td style={cell}><input type="number" value={s.priceClient ?? ""} onChange={e => upd(s.id, { priceClient: e.target.value === "" ? undefined : Number(e.target.value) })} style={inpC} /></td>
                        <td style={cell}><input type="number" value={s.costPlan ?? ""} onChange={e => upd(s.id, { costPlan: e.target.value === "" ? undefined : Number(e.target.value) })} style={inpC} /></td>
                        <td style={cell}><input type="number" value={s.costFact ?? ""} onChange={e => upd(s.id, { costFact: e.target.value === "" ? undefined : Number(e.target.value) })} style={inpC} /></td>
                        <td style={{ ...cell, fontWeight: 700, color: m >= 0 ? "#059669" : "#dc2626" }}>{num(s.costFact) ? `${Math.round(m * 100)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, color: "#0f172a", borderTop: "2px solid #e2e8f0" }}>
                <td style={{ padding: "10px", textAlign: "left" }}>ИТОГО</td>
                <td style={{ padding: "10px", textAlign: "right" }}>{fmt(tot.priceClient)}</td>
                <td style={{ padding: "10px", textAlign: "right" }}>{fmt(tot.costPlan)}</td>
                <td style={{ padding: "10px", textAlign: "right" }}>{fmt(tot.costFact)}</td>
                <td style={{ padding: "10px", textAlign: "right", color: marginFact >= 0 ? "#059669" : "#dc2626" }}>{Math.round(marginFact * 100)}%</td>
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
