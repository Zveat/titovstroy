// Подтверждение безвозвратных удалений: нужно напечатать слово. Перенос из App.jsx.
import { useEffect, useState } from "react";

// ── Typed-confirm для БЕЗВОЗВРАТНЫХ удалений (без корзины/бэкапа-в-один-клик) ──
// Императивный API поверх одной модалки, смонтированной один раз в MainApp (как window.confirm,
// но требует напечатать слово подтверждения — обычный клик по confirm() слишком легко нажать
// случайно для действия, которое нельзя отменить через интерфейс).
export let _dangerModalResolve = null;
export let _setDangerModalState = null;
export function confirmTyped(message, requireWord = "УДАЛИТЬ") {
  return new Promise(resolve => {
    if (!_setDangerModalState) { resolve(window.confirm(message)); return; } // модалка ещё не смонтирована — fallback
    _dangerModalResolve = resolve;
    _setDangerModalState({ message, requireWord });
  });
}
export function DangerConfirmModal() {
  const [state, setState] = useState(null);
  const [val, setVal] = useState("");
  useEffect(() => { _setDangerModalState = setState; return () => { _setDangerModalState = null; }; }, []);
  const close = (result) => { const r = _dangerModalResolve; _dangerModalResolve = null; setState(null); setVal(""); if (r) r(result); };
  if (!state) return null;
  const ok = val.trim().toUpperCase() === state.requireWord;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:20}} onClick={()=>close(false)}>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"24px 26px",maxWidth:380,width:"100%"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:32,marginBottom:10,textAlign:"center"}}>🗑️</div>
        <div style={{fontSize:14,color:"#334155",marginBottom:14,whiteSpace:"pre-line",textAlign:"center"}}>{state.message}</div>
        <div style={{fontSize:12,color:"#94a3b8",marginBottom:8,textAlign:"center"}}>Чтобы подтвердить, напечатайте <b style={{color:"#dc2626"}}>{state.requireWord}</b>:</div>
        <input autoFocus className="fi" value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter" && ok) close(true); if(e.key==="Escape") close(false); }}
          style={{width:"100%",textAlign:"center",fontWeight:700,letterSpacing:1,marginBottom:16,boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button className="btn btn-o" style={{padding:"9px 20px"}} onClick={()=>close(false)}>Отмена</button>
          <button className="btn btn-red" disabled={!ok} style={{padding:"9px 20px",opacity:ok?1:.5,cursor:ok?"pointer":"default"}} onClick={()=>close(true)}>Удалить</button>
        </div>
      </div>
    </div>
  );
}
