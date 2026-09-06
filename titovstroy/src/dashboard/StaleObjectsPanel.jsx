// Объекты без движения 14+ дней. Перенос из App.jsx.
import { fmt } from "../format.js";

export function StaleObjectsPanel({ items, onOpen, onShowAll, fmt, title = "Без движения 14+ дней" }) {
  if (!items?.length) return null;
  return (
    <section style={{background:"#fff",border:"1px solid #e2e8f0",borderLeft:"4px solid #f59e0b",borderRadius:8,marginBottom:24,overflow:"hidden",boxShadow:"0 1px 2px rgba(15,23,42,.04)"}}>
      <div style={{padding:"13px 16px",borderBottom:"1px solid #edf1f5",display:"flex",alignItems:"center",gap:10}}>
        <span style={{width:30,height:30,borderRadius:7,background:"#fffbeb",color:"#b45309",display:"grid",placeItems:"center",fontSize:15}}>⏱</span>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:13.5,fontWeight:800,color:"#0f172a"}}>{title}</div><div style={{fontSize:11.5,color:"#64748b",marginTop:1}}>{items.length} {items.length===1?"объект требует":"объектов требуют"} контакта или смены статуса</div></div>
        {onShowAll&&<button type="button" onClick={onShowAll} style={{border:0,background:"transparent",color:"#2563eb",fontSize:11.5,fontWeight:750,cursor:"pointer",fontFamily:"inherit",padding:"6px 0"}}>Все объекты →</button>}
      </div>
      <div>
        {items.slice(0,5).map((item,index)=><button type="button" key={item.id} onClick={()=>onOpen&&onOpen(item)}
          style={{width:"100%",border:0,borderBottom:index===Math.min(items.length,5)-1?0:"1px solid #edf1f5",background:"#fff",padding:"10px 16px",display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto 18px",gap:14,alignItems:"center",textAlign:"left",cursor:onOpen?"pointer":"default",fontFamily:"inherit"}}>
          <span style={{minWidth:0}}><b style={{display:"block",fontSize:12.5,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name || "Объект без названия"}</b>{item.address&&<span style={{display:"block",fontSize:11,color:"#64748b",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.address}</span>}</span>
          <span style={{fontSize:11.5,fontWeight:750,color:item.days>=30?"#dc2626":"#b45309",whiteSpace:"nowrap"}}>{item.days} дн.</span>
          <span style={{fontSize:12,fontWeight:750,color:"#334155",whiteSpace:"nowrap"}}>{item.total>0?fmt(Math.round(item.total))+" ₸":"—"}</span>
          <span style={{color:"#94a3b8",fontSize:16}}>›</span>
        </button>)}
      </div>
    </section>
  );
}
