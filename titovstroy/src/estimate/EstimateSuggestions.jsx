import { useEffect, useMemo, useState } from "react";

const inputStyle = {
  border: "1px solid #dbe4f0",
  borderRadius: 6,
  background: "#fff",
  color: "#0f172a",
  fontFamily: "inherit",
  fontSize: 12,
  outline: "none",
};

export function EstimateSuggestions({ estimateKey, suggestions = [], onAdd, fmt = n => n }) {
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    setOpen(false);
    setOverrides({});
  }, [estimateKey]);

  useEffect(() => {
    if (suggestions.length === 0) setOpen(false);
  }, [suggestions.length]);

  const prepared = useMemo(() => suggestions.map(item => {
    const own = overrides[item.targetCode] || {};
    const qty = own.qty !== undefined ? own.qty : item.qty;
    const selected = own.selected !== undefined ? own.selected : item.defaultSelected;
    return { ...item, qty, selected };
  }), [suggestions, overrides]);

  const ready = prepared.filter(item => item.selected && Number(item.qty) > 0);
  if (suggestions.length === 0) return null;

  const patchItem = (code, patch) => setOverrides(prev => ({
    ...prev,
    [code]: { ...(prev[code] || {}), ...patch },
  }));

  return (
    <section style={{ borderTop:"1px solid #e2e8f0", background:"#f8fafc" }}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        style={{
          width:"100%", minHeight:52, padding:"10px 14px", border:0, background:"transparent",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
          cursor:"pointer", fontFamily:"inherit", textAlign:"left",
        }}
      >
        <span style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
          <span style={{ width:30, height:30, borderRadius:7, display:"grid", placeItems:"center", background:"#fff7ed", color:"#c2410c", flexShrink:0 }}>💡</span>
          <span style={{ minWidth:0 }}>
            <span style={{ display:"block", fontSize:13, fontWeight:800, color:"#0f172a" }}>Рекомендуем проверить связанные работы</span>
            <span style={{ display:"block", marginTop:2, fontSize:11, color:"#64748b" }}>
              {suggestions.length} {suggestions.length === 1 ? "позиция из прайса" : "позиций из прайса"} · ничего не добавляется автоматически
            </span>
          </span>
        </span>
        <span style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {ready.length > 0 && <span style={{ padding:"3px 8px", borderRadius:999, background:"#dcfce7", color:"#047857", fontSize:11, fontWeight:800 }}>{ready.length} выбрано</span>}
          <span aria-hidden="true" style={{ color:"#64748b", fontSize:14 }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div style={{ borderTop:"1px solid #e2e8f0", background:"#fff" }}>
          <div style={{ padding:"4px 14px" }}>
            {prepared.map(item => (
              <div key={item.targetCode} style={{
                display:"grid", gridTemplateColumns:"minmax(220px,1fr) auto auto", gap:12,
                alignItems:"center", padding:"10px 0", borderBottom:"1px solid #eef2f7",
              }} className="estimate-suggestion-row">
                <label style={{ display:"flex", alignItems:"flex-start", gap:9, minWidth:0, cursor:"pointer" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(item.selected)}
                    onChange={event => patchItem(item.targetCode, { selected:event.target.checked })}
                    style={{ marginTop:2, width:16, height:16, accentColor:"#2563eb", flexShrink:0 }}
                  />
                  <span style={{ minWidth:0 }}>
                    <span style={{ display:"block", fontSize:12, fontWeight:800, color:"#0f172a" }}>{item.targetName}</span>
                    <span style={{ display:"block", marginTop:2, fontSize:10, lineHeight:1.35, color:"#64748b" }}>{item.reason} · к «{item.sourceName}»</span>
                  </span>
                </label>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.qty}
                    onChange={event => patchItem(item.targetCode, { qty:event.target.value })}
                    placeholder="Объём"
                    aria-label={`Объём: ${item.targetName}`}
                    style={{ ...inputStyle, width:88, padding:"7px 8px", textAlign:"right" }}
                  />
                  <span style={{ minWidth:30, fontSize:11, color:"#64748b" }}>{item.targetUnit}</span>
                </div>
                <div style={{ minWidth:92, textAlign:"right", fontSize:11, color:"#64748b" }}>
                  {Number(item.targetPrice) > 0 ? <><b style={{ color:"#334155" }}>{fmt(item.targetPrice)} ₸</b><br/>за единицу</> : "Цена не задана"}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding:"11px 14px", display:"flex", justifyContent:"flex-end", gap:8, flexWrap:"wrap" }}>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-o" style={{ fontSize:12 }}>Свернуть</button>
            <button
              type="button"
              disabled={ready.length === 0}
              onClick={() => { onAdd?.(ready); setOpen(false); }}
              className="btn"
              style={{ fontSize:12, background:ready.length ? "#2563eb" : "#cbd5e1", color:"#fff", cursor:ready.length ? "pointer" : "not-allowed" }}
            >
              ＋ Добавить выбранные{ready.length ? ` (${ready.length})` : ""}
            </button>
          </div>
          <style>{`@media(max-width:700px){.estimate-suggestion-row{grid-template-columns:1fr auto!important}.estimate-suggestion-row>div:last-child{display:none}}`}</style>
        </div>
      )}
    </section>
  );
}

export function EstimateSuggestionRulesEditor({ catalog = [], rules = [], usesDefaults, disabled, onSave }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ sourceCode:"", targetCode:"", multiplier:"1", reason:"", defaultSelected:true });
  const sortedCatalog = useMemo(() => [...catalog].sort((a,b) => String(a.name).localeCompare(String(b.name), "ru")), [catalog]);
  const byCode = useMemo(() => new Map(catalog.map(item => [item.code, item])), [catalog]);

  const addRule = () => {
    if (!draft.sourceCode || !draft.targetCode || draft.sourceCode === draft.targetCode) return;
    const multiplier = draft.multiplier === "" ? null : Number(draft.multiplier);
    if (multiplier !== null && (!Number.isFinite(multiplier) || multiplier <= 0)) return;
    const next = [
      ...rules.filter(rule => !(rule.sourceCode === draft.sourceCode && rule.targetCode === draft.targetCode)),
      {
        sourceCode:draft.sourceCode,
        targetCode:draft.targetCode,
        multiplier,
        reason:draft.reason.trim() || "Связанная работа",
        defaultSelected:draft.defaultSelected,
      },
    ];
    onSave(next);
    setDraft({ sourceCode:"", targetCode:"", multiplier:"1", reason:"", defaultSelected:true });
  };

  return (
    <section style={{ marginBottom:12, border:"1px solid #e2e8f0", borderRadius:8, background:"#fff", overflow:"hidden" }}>
      <button type="button" onClick={() => setOpen(value => !value)} style={{
        width:"100%", padding:"11px 13px", border:0, background:"#f8fafc", cursor:"pointer",
        display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, fontFamily:"inherit", textAlign:"left",
      }}>
        <span>
          <b style={{ fontSize:13, color:"#0f172a" }}>💡 Связанные работы для подсказок</b>
          <span style={{ marginLeft:8, color:"#64748b", fontSize:11 }}>{rules.length} правил{usesDefaults ? " · базовый набор" : ""}</span>
        </span>
        <span style={{ color:"#64748b" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding:13 }}>
          <div style={{ fontSize:11, color:"#64748b", marginBottom:10 }}>Подсказки используют только позиции, которые сейчас существуют в этом прайсе. Автоматического добавления в смету нет.</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
            {rules.length === 0 && <div style={{ padding:"12px 0", color:"#94a3b8", fontSize:12 }}>Подсказки отключены.</div>}
            {rules.map((rule, index) => {
              const source = byCode.get(rule.sourceCode);
              const target = byCode.get(rule.targetCode);
              return (
                <div key={`${rule.sourceCode}-${rule.targetCode}`} style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) auto", gap:10, alignItems:"center", padding:"8px 10px", border:"1px solid #eef2f7", borderRadius:6 }}>
                  <div style={{ minWidth:0, fontSize:11, color:"#475569" }}>
                    <b style={{ color:"#0f172a" }}>{source?.name || rule.sourceCode}</b> → <b style={{ color:"#2563eb" }}>{target?.name || rule.targetCode}</b>
                    <span style={{ color:"#94a3b8" }}> · {rule.multiplier === null ? "объём вручную" : `× ${rule.multiplier}`} · {rule.reason}</span>
                  </div>
                  <button type="button" disabled={disabled} onClick={() => onSave(rules.filter((_, i) => i !== index))} title="Удалить правило" style={{ border:0, background:"transparent", color:"#dc2626", cursor:disabled?"not-allowed":"pointer", fontSize:15 }}>×</button>
                </div>
              );
            })}
          </div>

          {!disabled && (
            <div style={{ display:"grid", gridTemplateColumns:"minmax(150px,1fr) 24px minmax(150px,1fr) 92px minmax(180px,1fr) auto", gap:7, alignItems:"center" }} className="suggestion-rule-form">
              <select value={draft.sourceCode} onChange={e => setDraft(prev => ({ ...prev, sourceCode:e.target.value }))} style={{ ...inputStyle, padding:"7px 8px", minWidth:0 }}>
                <option value="">Если выбрана работа…</option>
                {sortedCatalog.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              <span style={{ textAlign:"center", color:"#94a3b8" }}>→</span>
              <select value={draft.targetCode} onChange={e => setDraft(prev => ({ ...prev, targetCode:e.target.value }))} style={{ ...inputStyle, padding:"7px 8px", minWidth:0 }}>
                <option value="">Подсказать работу…</option>
                {sortedCatalog.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              <input type="number" min="0" step="0.01" value={draft.multiplier} onChange={e => setDraft(prev => ({ ...prev, multiplier:e.target.value }))} placeholder="× / вручную" title="Коэффициент объёма; оставьте пустым для ручного ввода" style={{ ...inputStyle, padding:"7px 8px", width:"100%" }}/>
              <input value={draft.reason} onChange={e => setDraft(prev => ({ ...prev, reason:e.target.value }))} placeholder="Почему рекомендуем" style={{ ...inputStyle, padding:"7px 8px", minWidth:0 }}/>
              <button type="button" onClick={addRule} className="btn btn-o" style={{ padding:"7px 10px", fontSize:11, whiteSpace:"nowrap" }}>＋ Правило</button>
              <label style={{ gridColumn:"1 / -1", display:"flex", alignItems:"center", gap:7, fontSize:11, color:"#64748b" }}>
                <input type="checkbox" checked={draft.defaultSelected} onChange={e => setDraft(prev => ({ ...prev, defaultSelected:e.target.checked }))}/>
                Сразу отмечать рекомендацию (пользователь всё равно подтверждает общей кнопкой)
              </label>
            </div>
          )}

          {!disabled && (
            <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
              <button type="button" className="btn btn-o" style={{ fontSize:11 }} onClick={() => onSave(null)}>Вернуть базовые правила</button>
              <button type="button" className="btn btn-o" style={{ fontSize:11, color:"#dc2626" }} onClick={() => onSave([])}>Отключить подсказки</button>
            </div>
          )}
          <style>{`@media(max-width:900px){.suggestion-rule-form{grid-template-columns:1fr!important}.suggestion-rule-form>span{display:none}}`}</style>
        </div>
      )}
    </section>
  );
}
