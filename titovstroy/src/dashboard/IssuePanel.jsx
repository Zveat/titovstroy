// Панель проблем «Что горит сегодня» / «Проверка базы». Перенос из App.jsx.
import { useState } from "react";

// ── Панель проблем: «Что горит сегодня» (дашборд) и «Проверка базы» (Админка) ──
// Компактные карточки в адаптивную сетку (2+ колонки), группы сворачиваются, длинные
// группы по умолчанию показывают несколько первых с «показать все» — чтобы панель не
// растягивалась в бесконечный вертикальный список. Клик по карточке — onNav; «×» —
// скрыть до завтра (если dismissable и передан onDismiss).
export const _ISSUE_GROUPS = ["Гарантия", "Производство", "Финансы", "Клиенты", "Данные"];
export const _GRP_ICON = { "Гарантия":"🛡", "Производство":"🔨", "Финансы":"💰", "Клиенты":"👤", "Данные":"🗂" };
export const _ISSUE_CAP = 6;
export function IssuePanel({ issues, onNav, onDismiss, emptyText = "✓ Всё чисто — проблем не найдено" }) {
  const [openGroups, setOpenGroups] = useState({});
  const [showAll, setShowAll] = useState({});
  const reds = issues.filter(i => i.sev === "red").length;
  const yellows = issues.length - reds;
  if (!issues.length) {
    return (
      <div style={{ background:"#fff", border:"1px solid #dbe7df", borderLeft:"4px solid #10b981", borderRadius:8, padding:"14px 16px", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ color:"#059669", fontSize:18, lineHeight:1 }}>✓</span>
        <span style={{ fontSize:13.5, fontWeight:700, color:"#166534" }}>{emptyText}</span>
      </div>
    );
  }
  const byGroup = {};
  for (const issue of issues) (byGroup[issue.group] || (byGroup[issue.group] = [])).push(issue);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap", color:"#64748b", fontSize:12.5 }}>
        {reds>0 && <span><b style={{ color:"#dc2626", fontSize:16 }}>{reds}</b> требуют решения</span>}
        {yellows>0 && <span><b style={{ color:"#d97706", fontSize:16 }}>{yellows}</b> проверить</span>}
      </div>
      {_ISSUE_GROUPS.filter(group => byGroup[group]).map(group => {
        const list = byGroup[group];
        const critical = list.filter(i=>i.sev==="red").length;
        const isOpen = (group in openGroups) ? openGroups[group] : critical>0;
        const shown = (showAll[group] || list.length<=_ISSUE_CAP) ? list : list.slice(0,_ISSUE_CAP);
        return (
          <section key={group} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
            <button type="button" onClick={()=>setOpenGroups(prev=>({...prev,[group]:!isOpen}))}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:10, border:0, background:"#fff", padding:"11px 14px", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
              <span style={{ width:28, height:28, borderRadius:6, background:"#f1f5f9", display:"grid", placeItems:"center", fontSize:14 }}>{_GRP_ICON[group]}</span>
              <span style={{ flex:1, fontSize:13.5, fontWeight:800, color:"#0f172a" }}>{group}</span>
              <span style={{ fontSize:12, color:"#64748b" }}>{list.length}</span>
              {critical>0 && <span style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444" }}/>}
              <span style={{ color:"#94a3b8", transform:isOpen?"rotate(180deg)":"none", transition:"transform .15s" }}>⌄</span>
            </button>
            {isOpen && (
              <div style={{ borderTop:"1px solid #eef2f7" }}>
                {shown.map((issue,index) => {
                  const red = issue.sev==="red";
                  return (
                    <div key={issue.id} onClick={()=>onNav&&onNav(issue.nav)}
                      style={{ display:"grid", gridTemplateColumns:"4px minmax(0,1fr) auto", gap:12, alignItems:"center", minHeight:58, padding:"9px 12px 9px 0", marginLeft:14, borderBottom:index===shown.length-1?"none":"1px solid #f1f5f9", cursor:onNav?"pointer":"default" }}>
                      <span style={{ width:4, height:32, borderRadius:2, background:red?"#ef4444":"#f59e0b" }}/>
                      <span style={{ minWidth:0 }}>
                        <span style={{ display:"block", fontSize:13, fontWeight:750, color:"#0f172a", lineHeight:1.35 }}>{issue.title}</span>
                        {issue.detail && <span style={{ display:"block", fontSize:11.5, color:"#64748b", lineHeight:1.4, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{issue.detail}</span>}
                      </span>
                      <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                        {onDismiss && issue.dismissable && <button type="button" title={issue.dismissLabel || "Скрыть до завтра"} onClick={e=>{e.stopPropagation();onDismiss(issue);}}
                          style={{ width:28, height:28, border:"1px solid #e2e8f0", borderRadius:6, background:"#fff", color:"#94a3b8", cursor:"pointer", fontFamily:"inherit" }}>×</button>}
                        <span style={{ color:"#cbd5e1", fontSize:16 }}>›</span>
                      </span>
                    </div>
                  );
                })}
                {list.length>_ISSUE_CAP && <button type="button" onClick={()=>setShowAll(prev=>({...prev,[group]:!prev[group]}))}
                  style={{ border:0, borderTop:"1px solid #f1f5f9", width:"100%", background:"#fafcff", color:"#2563eb", padding:"8px 14px", textAlign:"left", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  {showAll[group]?"Свернуть":`Показать все ${list.length}`}
                </button>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
