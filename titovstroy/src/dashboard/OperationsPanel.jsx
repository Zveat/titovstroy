// Очередь решений на дашборде: одна строка — один тип проблемы. Перенос из App.jsx.
import { useState } from "react";

// Дашборд показывает не россыпь одинаковых карточек, а короткую очередь решений:
// одна строка = один тип проблемы, внутри раскрывается список конкретных объектов.
export const _OPS_META = {
  "overdue-stage": { icon:"⏱", title:"Просрочены этапы", hint:"Срок работ уже истёк" },
  "no-foreman": { icon:"👷", title:"Не назначен ответственный", hint:"Объект запущен без прораба" },
  "signed-nofin": { icon:"₸", title:"Нет финансового проекта", hint:"Договор подписан, но финансовый контур не связан" },
  "client-remark": { icon:"!", title:"Новые замечания клиентов", hint:"Нужен ответ или действие по объекту" },
  "near-handover": { icon:"⚑", title:"Скоро сдача", hint:"До срока меньше недели, остались открытые этапы" },
};
export const _issueKind = issue => String(issue?.id || "other").split(":")[0];
export function OperationsPanel({ issues, onNav, onDismiss, emptyText = "Всё под контролем — срочных задач нет" }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const redN = issues.filter(issue => issue.sev === "red").length;
  const yellowN = issues.length - redN;
  const filtered = filter === "all" ? issues : issues.filter(issue => issue.sev === filter);
  const groups = [];
  const byKind = new Map();
  for (const issue of filtered) {
    const kind = _issueKind(issue);
    if (!byKind.has(kind)) {
      const group = { kind, issues:[], sev:issue.sev };
      byKind.set(kind, group); groups.push(group);
    }
    const group = byKind.get(kind);
    group.issues.push(issue);
    if (issue.sev === "red") group.sev = "red";
  }
  groups.sort((a,b) => (a.sev === b.sev ? 0 : a.sev === "red" ? -1 : 1));

  if (!issues.length) return (
    <div style={{background:"#fff",border:"1px solid #dce7e1",borderRadius:8,padding:"16px 18px",display:"flex",alignItems:"center",gap:12}}>
      <span style={{width:30,height:30,borderRadius:7,display:"grid",placeItems:"center",background:"#ecfdf5",color:"#059669",fontWeight:900}}>✓</span>
      <div><div style={{fontSize:13.5,fontWeight:800,color:"#14532d"}}>{emptyText}</div><div style={{fontSize:11.5,color:"#64748b",marginTop:2}}>Новых операционных отклонений нет</div></div>
    </div>
  );

  return (
    <section style={{background:"#fff",border:"1px solid #dfe6ee",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 2px rgba(15,23,42,.03)"}}>
      <div style={{padding:"14px 16px",borderBottom:"1px solid #e8edf3",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
        <div style={{minWidth:210,flex:1}}>
          <div style={{fontSize:14,fontWeight:850,color:"#0f172a"}}>Операционный контроль</div>
          <div style={{fontSize:11.5,color:"#64748b",marginTop:2}}>Только отклонения, по которым нужно принять решение</div>
        </div>
        <div style={{display:"flex",alignItems:"stretch",border:"1px solid #e2e8f0",borderRadius:7,overflow:"hidden",height:34}}>
          {[["all",`Все ${issues.length}`],["red",`Срочно ${redN}`],["yellow",`Проверить ${yellowN}`]].map(([key,label])=>(
            <button key={key} type="button" onClick={()=>setFilter(key)} style={{border:0,borderRight:key==="yellow"?0:"1px solid #e2e8f0",background:filter===key?"#0f172a":"#fff",color:filter===key?"#fff":"#475569",padding:"0 12px",fontSize:11.5,fontWeight:750,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{label}</button>
          ))}
        </div>
      </div>
      {groups.length === 0 ? <div style={{padding:20,color:"#64748b",fontSize:13}}>В этой категории задач нет.</div> : groups.map(group => {
        const meta = _OPS_META[group.kind] || {icon:"•",title:group.issues[0]?.title || "Требует проверки",hint:"Откройте детали"};
        const open = !!expanded[group.kind];
        const color = group.sev === "red" ? "#dc2626" : "#d97706";
        const sample = group.issues.slice(0,2).map(issue => String(issue.detail || "").split(" · ")[0]).filter(Boolean).join(" · ");
        return <div key={group.kind} style={{borderBottom:"1px solid #edf1f5"}}>
          <button type="button" onClick={()=>setExpanded(prev=>({...prev,[group.kind]:!open}))}
            style={{width:"100%",border:0,background:"#fff",padding:"13px 16px",display:"grid",gridTemplateColumns:"36px minmax(0,1fr) auto 22px",gap:12,alignItems:"center",textAlign:"left",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{width:34,height:34,borderRadius:7,display:"grid",placeItems:"center",background:group.sev==="red"?"#fef2f2":"#fffbeb",color,fontSize:15,fontWeight:900}}>{meta.icon}</span>
            <span style={{minWidth:0}}>
              <span style={{display:"block",fontSize:13.5,fontWeight:800,color:"#0f172a"}}>{meta.title}</span>
              <span style={{display:"block",fontSize:11.5,color:"#64748b",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sample || meta.hint}</span>
            </span>
            <span style={{display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap"}}><b style={{fontSize:16,color}}>{group.issues.length}</b><span style={{fontSize:11,color:"#64748b"}}>объектов</span></span>
            <span style={{color:"#94a3b8",transform:open?"rotate(180deg)":"none",transition:"transform .15s"}}>⌄</span>
          </button>
          {open && <div style={{background:"#f8fafc",borderTop:"1px solid #edf1f5",paddingLeft:64}}>
            {group.issues.map((issue,index)=><div key={issue.id} onClick={()=>onNav&&onNav(issue.nav)}
              style={{minHeight:48,padding:"8px 14px 8px 0",borderBottom:index===group.issues.length-1?0:"1px solid #e8edf3",display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:10,alignItems:"center",cursor:onNav?"pointer":"default"}}>
              <div style={{minWidth:0}}><div style={{fontSize:12.5,fontWeight:700,color:"#1e293b"}}>{issue.title}</div>{issue.detail&&<div style={{fontSize:11,color:"#64748b",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{issue.detail}</div>}</div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>{onDismiss&&issue.dismissable&&<button type="button" title={issue.dismissLabel || "Скрыть до завтра"} onClick={event=>{event.stopPropagation();onDismiss(issue);}} style={{width:26,height:26,border:"1px solid #dbe3ec",borderRadius:6,background:"#fff",color:"#94a3b8",cursor:"pointer"}}>×</button>}<span style={{color:"#94a3b8",fontSize:16}}>›</span></div>
            </div>)}
          </div>}
        </div>;
      })}
    </section>
  );
}
