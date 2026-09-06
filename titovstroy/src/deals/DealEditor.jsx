// Редактор сделки (смета + договор в одной карточке). Перенос из App.jsx.
import { useState } from "react";
import { DEAL_STATUSES } from "../constants.js";
import { fmt } from "../format.js";
import { getEffectiveCatalog } from "../pricing.js";
import { resolveEstimateRows } from "../utils.js";

// ── ТЕСТ: Редактор сделки (смета + договор в одной карточке) ──
export function DealEditor({ deal, clients, contragents, estimate, onUpdate, onBack, onOpenEstimate, onEstimatePdf, onContractPdf, onAddClient, onUpdateClient, role, fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const upd = (patch) => onUpdate(prev=>({...prev,...patch}));
  // Через resolveEstimateRows, а не подсчётом строк: одна работа может лежать в
  // rows дважды (под кодом и под названием), и прямой подсчёт завышал число позиций.
  const posCount = estimate ? resolveEstimateRows(estimate.rows, getEffectiveCatalog()).length : 0;
  const fin = Math.round(estimate?.total || 0);
  const readonly = role==="viewer";
  const client = clients.find(c=>c.id===deal.clientId);
  const stIdx = DEAL_STATUSES.findIndex(s=>s.key===(deal.status||"lead"));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
        <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{client?.name || "Новая сделка"}</span>
      </div>

      {/* ВОРОНКА СТАТУСОВ */}
      <div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Этап сделки</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {DEAL_STATUSES.map((s,i)=>{
            const active = (deal.status||"lead")===s.key;
            const passed = i<stIdx;
            return (
              <button key={s.key} disabled={readonly} onClick={()=>upd({status:s.key})}
                style={{background:active?s.bg:passed?"rgba(5,150,105,.05)":"rgba(0,0,0,.03)",color:active?s.color:passed?"#059669":"#94a3b8",border:`1px solid ${active?s.color:passed?"rgba(5,150,105,.2)":"#e2e8f0"}`,borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:active?700:600,cursor:readonly?"default":"pointer",fontFamily:"inherit"}}>
                {passed?"✓ ":""}{s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* КЛИЕНТ */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>КЛИЕНТ</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <select className="fi" style={{flex:1}} disabled={readonly} value={deal.clientId||""} onChange={e=>upd({clientId:e.target.value})}>
            <option value="">— Выбрать клиента —</option>
            {clients.map(c=>(<option key={c.id} value={c.id}>{c.name}{c.type==="юр"?" (ЮР)":""}</option>))}
          </select>
          {!readonly && <button onClick={()=>{const n=window.prompt("Имя нового клиента:"); if(n!==null) onAddClient(n);}}
            style={{background:"#eff6ff",color:"#059669",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Новый</button>}
          {deal.clientId && <button onClick={()=>setShowClientForm(s=>!s)}
            style={{background:showClientForm?"#eff6ff":"#f3f4f6",color:"#2563eb",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>✎ Данные</button>}
        </div>
        {deal.clientId && showClientForm && client && (() => {
          const updCl=(patch)=>onUpdateClient({...client,...patch});
          const isYur=client.type==="юр";
          const fields = isYur
            ? [["ФИО / Название","name"],["Телефон","phone"],["Адрес","address"],["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (счёт)","account"],["Почта","email"]]
            : [["ФИО","name"],["Телефон","phone"],["Адрес","address"],["ИИН","iin"],["Документ","doc"]];
          return (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип</div>
                <select className="fi" value={client.type||"физ"} onChange={e=>updCl({type:e.target.value})}><option value="физ">Физ. лицо</option><option value="юр">Юр. лицо</option></select></div>
              {fields.map(([label,field])=>(
                <div key={field}><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={client[field]||""} onChange={e=>updCl({[field]:e.target.value})} placeholder={label}/></div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* ОБЪЕКТ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип объекта</div>
          <select className="fi" disabled={readonly} value={deal.objType||"Вторичка"} onChange={e=>upd({objType:e.target.value})}>
            <option>Вторичка</option><option>Новостройка</option><option>Коммерция</option>
          </select></div>
        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Адрес объекта</div>
          <input className="fi" disabled={readonly} value={deal.address||""} onChange={e=>upd({address:e.target.value})} placeholder="ул., дом, кв."/></div>
        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Площадь, м²</div>
          <input className="fi" type="number" disabled={readonly} value={deal.area||""} onChange={e=>upd({area:e.target.value})} placeholder="0"/></div>
      </div>

      {/* СМЕТА (настоящая, с каталогом) */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>СМЕТА <span style={{fontWeight:500,color:"#cbd5e1"}}>— заполняется через каталог, как в разделе «Сметы»</span></div>
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"16px 18px"}}>
          {estimate ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:13,color:"#0f172a",fontWeight:700}}>{posCount} позиций на {fmt(fin)} ₸</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Смета заполнена через каталог</div>
              </div>
              {!readonly && <button onClick={onOpenEstimate} className="btn btn-g" style={{fontSize:13,padding:"9px 16px"}}>✏️ Редактировать смету</button>}
            </div>
          ) : (
            <div style={{textAlign:"center",padding:"6px 0"}}>
              <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>Смета ещё не заполнена</div>
              {!readonly && <button onClick={onOpenEstimate} className="btn btn-g" style={{fontSize:13,padding:"10px 20px"}}>📋 Заполнить смету (каталог)</button>}
            </div>
          )}
        </div>
      </div>

      {/* ЮР. ЧАСТЬ (для договора) */}
      <div style={{border:"1px solid #fbcfe8",borderRadius:8,padding:"14px 16px",background:"rgba(219,39,119,.03)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#db2777",marginBottom:10}}>📄 ДАННЫЕ ДЛЯ ДОГОВОРА</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Номер договора</div>
            <input className="fi" disabled={readonly} value={deal.contractNumber||""} onChange={e=>upd({contractNumber:e.target.value})}/></div>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата договора</div>
            <input className="fi" type="date" disabled={readonly} value={deal.contractDate||""} onChange={e=>upd({contractDate:e.target.value})}/></div>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Подрядчик (ТОО)</div>
            <select className="fi" disabled={readonly} value={deal.contragentId||""} onChange={e=>upd({contragentId:e.target.value})}>
              <option value="">— Выбрать ТОО —</option>
              {contragents.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
            </select></div>
          <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата (%)</div>
            <input className="fi" type="number" min="0" max="100" disabled={readonly} value={deal.advancePercent??30} onChange={e=>upd({advancePercent:parseFloat(e.target.value)||0})}/></div>
        </div>
      </div>

      {/* Примечание */}
      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Примечание</div>
        <textarea className="fi" rows={2} disabled={readonly} value={deal.note||""} onChange={e=>upd({note:e.target.value})} placeholder="Доп. условия..."/></div>

      {/* Действия: две печати из одних данных */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn btn-o" style={{flex:"1 1 120px"}} onClick={onBack}>← Назад</button>
        <button onClick={onEstimatePdf} className="btn btn-o" style={{flex:"1 1 120px"}}>📄 PDF сметы</button>
        <div style={{flex:"1 1 120px",display:"flex",flexDirection:"column",gap:4}}>
          <button onClick={()=>onContractPdf(withStamp)} className="btn btn-o" style={{width:"100%"}}>📄 PDF договора</button>
          <div onClick={()=>setWithStamp(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",justifyContent:"center"}}>
            <div style={{width:28,height:16,borderRadius:8,background:withStamp?"#db2777":"#e2e8f0",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:withStamp?12:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:10,color:withStamp?"#db2777":"#94a3b8"}}>С печатью</span>
          </div>
        </div>
      </div>
      <div style={{fontSize:10,color:"#94a3b8",textAlign:"center"}}>✓ Сохраняется автоматически</div>
    </div>
  );
}
