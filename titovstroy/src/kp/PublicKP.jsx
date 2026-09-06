// Публичная страница КП по секретной ссылке (#/kp/<id>, без входа). Перенос из App.jsx.
import { useEffect, useRef, useState } from "react";
import { storage } from "../cloud/storage.js";
import { KP_NODE } from "../constants.js";
import { KPContent } from "./KPContent.jsx";
import { ref } from "firebase/database";

export function PublicKP({ id }) {
  const [state, setState] = useState("loading"); // loading | notfound | ok
  const [snap, setSnap] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [confirming, setConfirming] = useState(false); // подтверждение перед принятием
  // Адаптив: КП свёрстано под «бумажную» ширину; на узком экране вписываем масштабом
  const outerRef = useRef(null), innerRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, h: 0 });
  const DESIGN_W = 680; // ширина, при которой таблицы КП не обрезаются
  useEffect(() => {
    if (state !== "ok" || !innerRef.current || !outerRef.current) return;
    const calc = () => {
      const ow = outerRef.current ? outerRef.current.clientWidth : 0;
      if (!ow || !innerRef.current) return;
      const s = Math.min(1, ow / DESIGN_W);
      setFit({ scale: s, h: Math.ceil(innerRef.current.scrollHeight * s) });
    };
    calc();
    let ro; try { ro = new ResizeObserver(calc); ro.observe(innerRef.current); } catch {}
    window.addEventListener("resize", calc);
    return () => { try { ro && ro.disconnect(); } catch {} window.removeEventListener("resize", calc); };
  }, [state, snap]);
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const r = await storage.getResult(KP_NODE(id));
        if (stop) return;
        if (r.status === "found" && r.value) {
          let data = null; try { data = JSON.parse(r.value); } catch {}
          if (data && Array.isArray(data.kpItems)) {
            setSnap(data); setAccepted(!!data.acceptedAt); setState("ok");
            // отметка просмотра — best-effort, остальные поля сохраняем
            try { storage.set(KP_NODE(id), JSON.stringify({ ...data, viewedAt: Date.now(), viewCount: (data.viewCount || 0) + 1 })); } catch {}
            return;
          }
        }
        setState("notfound");
      } catch { if (!stop) setState("notfound"); }
    })();
    return () => { stop = true; };
  }, [id]);

  const accept = async () => {
    if (!snap || accepting || accepted) return;
    setAccepting(true);
    setAccepted(true); // оптимистично: localStorage пишется синхронно, ответа облака не ждём
    try {
      const r = await storage.getResult(KP_NODE(id));
      let cur = snap; try { if (r.status === "found" && r.value) cur = JSON.parse(r.value); } catch {}
      storage.set(KP_NODE(id), JSON.stringify({ ...cur, acceptedAt: Date.now() })); // в фоне, без await
    } catch {}
    setAccepting(false);
  };

  const wrap = (children) => (
    <div style={{minHeight:"100vh",background:"#e9e4da",padding:"calc(16px + env(safe-area-inset-top,0px)) 12px 40px",boxSizing:"border-box",fontFamily:"'Golos Text','Segoe UI',sans-serif"}}>
      <div style={{maxWidth:760,margin:"0 auto"}}>{children}</div>
    </div>
  );

  if (state === "loading") return wrap(<div style={{textAlign:"center",padding:"90px 0",color:"#8a8472"}}>Загрузка предложения…</div>);
  if (state === "notfound") return wrap(
    <div style={{background:"#fff",borderRadius:14,padding:"44px 24px",textAlign:"center"}}>
      <div style={{fontSize:42,marginBottom:10}}>🔍</div>
      <div style={{fontWeight:800,fontSize:18,color:"#1a1a28",marginBottom:6}}>Предложение не найдено</div>
      <div style={{fontSize:13,color:"#888"}}>Ссылка устарела или КП ещё не опубликовано.<br/>Свяжитесь с менеджером TitovStroy: WA +7 707 982 4915</div>
    </div>
  );
  return wrap(
    <>
      <div ref={outerRef} style={{width:"100%",overflow:"hidden",height:fit.h||undefined}}>
        <div ref={innerRef} style={{width:DESIGN_W,transform:`scale(${fit.scale})`,transformOrigin:"top left"}}>
          <div style={{background:"#f5f2ec",borderRadius:14,padding:"22px 20px",boxShadow:"0 8px 30px rgba(26,26,40,.14)"}}>
            <KPContent proj={snap.proj||{}} kpItems={snap.kpItems||[]} fromItems={snap.fromItems||[]} discount={snap.discount||0} discAmt={snap.discAmt||0} final={snap.final||0} note={snap.note||""}/>
          </div>
        </div>
      </div>
      <div style={{marginTop:16,textAlign:"center"}}>
        {accepted ? (
          <div style={{background:"#ecfdf5",border:"1px solid #a7f3d0",borderRadius:12,padding:"16px 18px",color:"#059669",fontWeight:700,fontSize:15}}>✅ Спасибо! Предложение принято — менеджер свяжется с вами.</div>
        ) : confirming ? (
          <div style={{background:"#fff",border:"1px solid #e7e1d4",borderRadius:14,padding:"18px 18px",maxWidth:420,margin:"0 auto",boxShadow:"0 6px 18px rgba(26,26,40,.1)"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#1a1a28",marginBottom:6}}>Принять это предложение?</div>
            <div style={{fontSize:12,color:"#8a8472",marginBottom:14}}>Менеджер получит уведомление, что вы согласны. Это не договор — он свяжется для оформления.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirming(false)} disabled={accepting} style={{flex:1,background:"#f1ede4",color:"#6b6452",border:"none",borderRadius:10,padding:"13px 12px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
              <button onClick={accept} disabled={accepting} style={{flex:2,background:"#b8904a",color:"#fff",border:"none",borderRadius:10,padding:"13px 12px",fontSize:14,fontWeight:800,cursor:accepting?"default":"pointer",fontFamily:"inherit"}}>{accepting?"Отправляем…":"✅ Да, принять"}</button>
            </div>
          </div>
        ) : (
          <>
            <button onClick={()=>setConfirming(true)} style={{background:"#b8904a",color:"#fff",border:"none",borderRadius:12,padding:"15px 30px",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 18px rgba(184,144,74,.35)",width:"100%",maxWidth:380}}>✅ Принять предложение</button>
            <div style={{marginTop:10,fontSize:11.5,color:"#8a8472"}}>Нажав «Принять», вы подтвердите согласие с предложением. Это не договор — менеджер свяжется для оформления.</div>
          </>
        )}
        <div style={{marginTop:18,fontSize:11.5,color:"#a39e8e"}}>TitovStroy · ремонт и отделка · WA +7 707 982 4915</div>
      </div>
    </>
  );
}
