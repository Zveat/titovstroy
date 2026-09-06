// Балансовый отчёт (Statement of Financial Position). Перенос из App.jsx.
import { useState } from "react";

// ── Балансовый отчёт (Statement of Financial Position) ──
export function BalanceSheet({ assetsSections, liabSections, capitalSection, totalAssets, totalLiab, totalCapital }) {
  const bf = n => new Intl.NumberFormat("ru-RU").format(Math.round(n||0));
  const [collapsed, setCollapsed] = useState(()=>new Set());
  const toggle = k => setCollapsed(s=>{ const n=new Set(s); n.has(k)?n.delete(k):n.add(k); return n; });

  const Node = ({ node, depth }) => {
    const kids = node.children||[];
    const has = kids.length>0;
    const open = !collapsed.has(node.key);
    const isSection = depth===0;
    const isInfo = !!node.info; // справочные строки — серые, курсив, не в итогах
    return (
      <>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:10,
          padding:isSection?"9px 0 5px":"4px 0",
          borderBottom:isSection?"none":"1px solid #f4f6f9",
          opacity:isInfo?0.55:1}}>
          <span style={{display:"flex",alignItems:"center",gap:7,paddingLeft:depth*18,minWidth:0}}>
            {has ? <button onClick={()=>toggle(node.key)} style={{flexShrink:0,width:15,height:15,lineHeight:"13px",textAlign:"center",border:"1px solid #cbd5e1",borderRadius:4,background:"#fff",color:"#64748b",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0}}>{open?"−":"+"}</button>
              : <span style={{width:15,flexShrink:0}}/>}
            <span style={{fontSize:isSection?13.5:12.5,fontWeight:isSection?800:(depth===1?600:400),fontStyle:isInfo?"italic":"normal",color:isSection?"#0f172a":(depth===1?"#334155":"#64748b"),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{node.label}</span>
          </span>
          <span style={{fontSize:isSection?13.5:12.5,fontWeight:isSection?800:(depth===1?700:500),fontStyle:isInfo?"italic":"normal",color:isInfo?"#94a3b8":isSection?"#0f172a":"#475569",whiteSpace:"nowrap"}}>{bf(node.value)}</span>
        </div>
        {has && open && kids.map(c=><Node key={c.key} node={c} depth={depth+1}/>)}
      </>
    );
  };

  const Bar = ({ left, right, bg, color }) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:bg,color,padding:"12px 16px",fontWeight:800,fontSize:14}}>
      <span>{left}</span><span>{bf(right)}</span>
    </div>
  );

  return (
    <div style={{border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden",background:"#fff"}}>
      <div style={{textAlign:"center",fontSize:12.5,fontWeight:700,color:"#64748b",padding:"12px 0 4px"}}>Активы = Обязательства + Капитал</div>
      <div className="bal-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
        {/* Заголовки-бары */}
        <div style={{borderRight:"1px solid #eef2f7"}}><Bar left="" right={totalAssets} bg="#5b9bb0" color="#fff"/></div>
        <div style={{display:"flex"}}>
          <div style={{flex:1}}><Bar left="" right={totalLiab} bg="#e08a7d" color="#fff"/></div>
          <div style={{flex:1.6}}><Bar left="" right={totalCapital} bg="#3a4759" color="#fff"/></div>
        </div>
        {/* ЛЕВО: Активы */}
        <div style={{padding:"14px 18px",borderRight:"1px solid #eef2f7",minWidth:0}}>
          {assetsSections.map(s=><Node key={s.key} node={s} depth={0}/>)}
          <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #5b9bb0",display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:15,color:"#0f766e"}}>
            <span>Итого активы</span><span>{bf(totalAssets)}</span>
          </div>
        </div>
        {/* ПРАВО: Обязательства + Капитал */}
        <div style={{padding:"14px 18px",minWidth:0}}>
          {liabSections.map(s=><Node key={s.key} node={s} depth={0}/>)}
          <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #e08a7d",display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:15,color:"#dc2626"}}>
            <span>Итого обязательства</span><span>{bf(totalLiab)}</span>
          </div>
          <div style={{marginTop:18}}>
            <Node node={capitalSection} depth={0}/>
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:"2px solid #3a4759",display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:15,color:"#0f172a"}}>
            <span>Обязательства + Капитал</span><span>{bf(totalLiab+totalCapital)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
