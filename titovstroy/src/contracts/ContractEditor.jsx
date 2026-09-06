// Редактор договора. Перенос из App.jsx.
// ВНИМАНИЕ: юридический текст договоров не меняется — только данные и вёрстка вокруг.
import { useState } from "react";
import { CLIENT_SAVE_FAIL_TEXT, CONTRACT_STATUSES, DOC_TYPES, TYPE_LABELS } from "../constants.js";
import { fmt } from "../format.js";
import { SearchSelect } from "../ui/Inputs.jsx";
import { lineTotal } from "../utils.js";

export function ContractEditor({ contract, clients, contragents, onUpdate, onBack, onSave, onPdf, onSamplePdf, onGDoc, canExport=true, onAddClientFromEstimate, onUpdateClient, onCreateClient, workers=[], onCreateWorker, importObjects=[], getObjectWorks, currentUserRole, fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientData, setNewClientData] = useState({ name:"", phone:"", type:"физ" });
  const [savingClient, setSavingClient] = useState(false);   // кнопка «Создать и выбрать» ждёт запись
  const [newClientErr, setNewClientErr] = useState("");      // причина, по которой клиент не сохранился
  const [showNewWorker, setShowNewWorker] = useState(false);
  const [newWorkerData, setNewWorkerData] = useState({ name:"", iin:"", doc:"", phone:"", address:"" });
  const [impSearch, setImpSearch] = useState("");
  const [impOpen, setImpOpen] = useState(false);
  const type = contract.type || "repair_fiz";
  const total = (contract.works||[]).reduce((s,w)=>s+lineTotal(w.quantity,w.price),0);
  const upd = (patch) => onUpdate(prev=>({...prev,...patch}));

  const isRepair   = type==="repair_fiz";
  const isAnnex    = type==="annex";
  const isDesign   = type==="design";
  const isDesAdd   = type==="design_add";
  const isRes      = type==="reservation";
  const isPodryad  = type==="podryad";
  const isPodAnnex = type==="podryad_annex";
  const isPod      = isPodryad || isPodAnnex;
  const hasWorks   = isRepair || isAnnex || isPod;
  const hasMainRef = isAnnex || isDesAdd || isPodAnnex;

  const fi = {background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,color:"#0f172a",fontSize:13,padding:"8px 10px",fontFamily:"inherit",width:"100%"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
        <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{contract.number ? `${TYPE_LABELS[type]||""} №${contract.number}` : "Новый документ"}</span>
      </div>

      {/* Тип документа + статус */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип документа</div>
          <SearchSelect value={type} onChange={v=>upd({type:v})} placeholder="Тип документа…"
            options={DOC_TYPES.map(d=>({value:d.value,label:d.label}))}/>
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Статус</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {CONTRACT_STATUSES.map(s=>(
              <button key={s.key} onClick={()=>upd({contractStatus:s.key})}
                style={{background:(contract.contractStatus||"draft")===s.key?s.bg:"rgba(0,0,0,.03)",color:(contract.contractStatus||"draft")===s.key?s.color:"#94a3b8",border:`1px solid ${(contract.contractStatus||"draft")===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Основные поля — номер и дата */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{(isAnnex||isPodAnnex)?"Приложение №":isDesAdd?"Номер доп. соглашения":"Номер договора/соглашения"}</div>
          {(isAnnex||isPodAnnex)
            ? <input className="fi" type="number" min="2" value={contract.appendix||2} onChange={e=>upd({appendix:parseInt(e.target.value)||2})}/>
            : <input className="fi" value={contract.number||""} onChange={e=>upd({number:e.target.value})} placeholder="0001#202020"/>}
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{(isAnnex||isPodAnnex)?"Дата приложения":"Дата"}</div>
          <input className="fi" type="date" value={(isAnnex||isPodAnnex)?(contract.annexDate||contract.date||""):(contract.date||"")} onChange={e=>upd((isAnnex||isPodAnnex)?{annexDate:e.target.value}:{date:e.target.value})}/>
        </div>
      </div>

      {/* Ссылка на основной договор (для Приложений и Доп.соглашений) */}
      {hasMainRef && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{isDesAdd?"Номер соглашения о дизайне":"Номер основного договора"}</div>
            <input className="fi" value={contract.mainNumber||""} onChange={e=>upd({mainNumber:e.target.value})} placeholder="0819#128"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{isDesAdd?"Дата соглашения о дизайне":"Дата основного договора"}</div>
            <input className="fi" type="date" value={contract.mainDate||""} onChange={e=>upd({mainDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: резервирование */}
      {isRes && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Сумма резервирования (₸)</div>
            <input className="fi" type="number" value={contract.reserveAmount||50000} onChange={e=>upd({reserveAmount:parseFloat(e.target.value)||0})}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата начала работ (п.2.1)</div>
            <input className="fi" type="date" value={contract.reserveStartDate||""} onChange={e=>upd({reserveStartDate:e.target.value})}/>
          </div>
        </div>
      )}

      {/* Доп поля: дизайн */}
      {isDesign && (
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
      )}

      {/* Доп поля: доп. соглашение к дизайну */}
      {isDesAdd && (<>\
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Площадь объекта (м²)</div>
            <input className="fi" type="number" value={contract.area||""} onChange={e=>upd({area:e.target.value})} placeholder="85"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Срок выполнения (раб. дней)</div>
            <input className="fi" type="number" value={contract.deadline||""} onChange={e=>upd({deadline:e.target.value})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Вариантов планировки</div>
            <input className="fi" type="number" min="1" value={contract.variantsLayout||""} onChange={e=>upd({variantsLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Раундов корр. планировки</div>
            <input className="fi" type="number" min="0" value={contract.corrLayout||""} onChange={e=>upd({corrLayout:e.target.value})} placeholder="2"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Раундов корр. визуализаций</div>
            <input className="fi" type="number" min="0" value={contract.corrVis||""} onChange={e=>upd({corrVis:e.target.value})} placeholder="2"/>
          </div>
        </div>
        {/* Тип стоимости */}
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Способ расчёта стоимости</div>
          <div style={{display:"flex",gap:16,marginBottom:8}}>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={!contract.priceType||contract.priceType==="fixed"}
                onChange={()=>upd({priceType:"fixed"})}/> Фиксированная сумма
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
              <input type="radio" name="priceType" checked={contract.priceType==="sqm"}
                onChange={()=>upd({priceType:"sqm"})}/> За м²
            </label>
          </div>
          {(!contract.priceType||contract.priceType==="fixed") ? (
            <div>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Итоговая стоимость (₸)</div>
              <input className="fi" type="number" value={contract.totalCost||""} onChange={e=>upd({totalCost:parseFloat(e.target.value)||0})} placeholder="170000"/>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Цена за м² (₸)</div>
                <input className="fi" type="number" value={contract.pricePerSqm||""} onChange={e=>upd({pricePerSqm:parseFloat(e.target.value)||0})} placeholder="2000"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Итого (авто, ₸)</div>
                <div className="fi" style={{background:"#e2e8f0",color:"#334155",fontWeight:600,display:"flex",alignItems:"center"}}>
                  {fmt(Math.round((contract.pricePerSqm||0)*(contract.area||0)))} ₸
                </div>
              </div>
            </div>
          )}
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата уже внесена (₸)</div>
          <input className="fi" type="number" value={contract.designAdvance||25000} onChange={e=>upd({designAdvance:parseFloat(e.target.value)||0})}/>
        </div>
        <div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>Состав дизайн-проекта</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость материалов"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#94a3b8",cursor:"pointer"}}>
                <input type="checkbox" checked={!!(contract.composition||{})[k]} onChange={e=>upd({composition:{...(contract.composition||{}),[k]:e.target.checked}})}/>
                {l}
              </label>
            ))}
          </div>
        </div>
      </>)}

      {/* Подрядчик (рабочий) — из отдельной базы «Подрядчики» — для договоров подряда */}
      {isPod && (
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>ПОДРЯДЧИК (рабочий)</div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <SearchSelect style={{flex:1}} value={contract.workerId||""} onChange={v=>{upd({workerId:v});setShowNewWorker(false);}} placeholder="🔍 Поиск подрядчика…"
              options={workers.map(w=>({value:w.id,label:w.name||"Без имени",sub:[w.iin&&("ИИН "+w.iin),w.phone].filter(Boolean).join(" · ")}))}/>
            <button onClick={()=>setShowNewWorker(s=>!s)} style={{background:showNewWorker?"#eff6ff":"#f3f4f6",color:"#059669",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Новый</button>
          </div>
          {showNewWorker && (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"#059669"}}>Новый подрядчик</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <input className="fi" value={newWorkerData.name} onChange={e=>setNewWorkerData(p=>({...p,name:e.target.value}))} placeholder="ФИО *"/>
                <input className="fi" value={newWorkerData.iin} onChange={e=>setNewWorkerData(p=>({...p,iin:e.target.value}))} placeholder="ИИН"/>
                <input className="fi" value={newWorkerData.doc} onChange={e=>setNewWorkerData(p=>({...p,doc:e.target.value}))} placeholder="№ документа"/>
                <input className="fi" value={newWorkerData.phone} onChange={e=>setNewWorkerData(p=>({...p,phone:e.target.value}))} placeholder="Телефон"/>
                <input className="fi" style={{gridColumn:"1 / -1"}} value={newWorkerData.address} onChange={e=>setNewWorkerData(p=>({...p,address:e.target.value}))} placeholder="Адрес"/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{ if(!newWorkerData.name.trim())return; const id=await onCreateWorker({...newWorkerData,name:newWorkerData.name.trim()}); upd({workerId:id}); setShowNewWorker(false); setNewWorkerData({name:"",iin:"",doc:"",phone:"",address:""}); }}
                  style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Создать и выбрать</button>
                <button onClick={()=>{setShowNewWorker(false);setNewWorkerData({name:"",iin:"",doc:"",phone:"",address:""});}}
                  style={{background:"#f3f4f6",color:"#64748b",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
              </div>
            </div>
          )}
          {/* Импорт работ из сметы объекта — с поиском */}
          {getObjectWorks && (()=>{
            const selected = importObjects.find(o=>o.id===contract.objectId);
            const filtered = importObjects.filter(o=>{ const s=impSearch.trim().toLowerCase(); return !s || (o.label||"").toLowerCase().includes(s); });
            return (
            <div style={{marginTop:10,position:"relative"}}>
              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Подтянуть работы из сметы объекта (суммы потом редактируются)</div>
              <input value={impOpen?impSearch:(selected?.label||"")} placeholder="🔍 Поиск объекта по имени или адресу…"
                onChange={e=>{setImpSearch(e.target.value);setImpOpen(true);}} onFocus={()=>{setImpSearch("");setImpOpen(true);}}
                style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,color:"#0f172a",fontSize:13,padding:"8px 10px",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
              {impOpen && (<>
                <div onClick={()=>setImpOpen(false)} style={{position:"fixed",inset:0,zIndex:40}}/>
                <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:41,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,marginTop:4,maxHeight:300,overflowY:"auto",boxShadow:"0 14px 40px rgba(15,23,42,.18)"}}>
                  {filtered.length===0 && <div style={{padding:"10px 12px",fontSize:12,color:"#94a3b8"}}>Ничего не найдено</div>}
                  {filtered.slice(0,80).map(o=>(
                    <div key={o.id} onClick={()=>{ const ws=getObjectWorks(o.id); upd({objectId:o.id, works:ws.length?ws:(contract.works||[]), objectAddress:o.address||contract.objectAddress||""}); setImpOpen(false); setImpSearch(""); }}
                      style={{padding:"9px 12px",cursor:"pointer",fontSize:13,color:"#0f172a",borderBottom:"1px solid #f1f5f9",display:"flex",flexDirection:"column",gap:1,background:o.id===contract.objectId?"#eff6ff":"#fff"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=o.id===contract.objectId?"#eff6ff":"#fff"}>
                      <span style={{fontWeight:600}}>{o.label}</span>
                      {o.address && o.address!==o.label && <span style={{fontSize:11,color:"#94a3b8"}}>{o.address}</span>}
                    </div>
                  ))}
                </div>
              </>)}
            </div>
            );
          })()}
        </div>
      )}
      {/* Клиент */}
      {!isPod && (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8"}}>ЗАКАЗЧИК</div>
          {contract.estClient && !contract.clientId && (
            <div style={{fontSize:11,color:"#d97706"}}>⚠ Из сметы: {contract.estClient}</div>
          )}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <SearchSelect style={{flex:1}} value={contract.clientId||""} onChange={v=>{upd({clientId:v});setShowNewClientForm(false);}} placeholder="🔍 Поиск клиента…"
            options={clients.map(c=>({value:c.id,label:(c.name||"Без имени")+((c.clientType==="yur"||c.type==="юр")?" (ЮР)":""),sub:[c.phone,c.address].filter(Boolean).join(" · ")}))}/>
          {contract.clientId
            ? <button onClick={()=>setShowClientForm(s=>!s)}
                style={{background:showClientForm?"#eff6ff":"#f3f4f6",color:"#2563eb",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                ✎ Данные
              </button>
            : <button onClick={()=>{setShowNewClientForm(s=>!s);setShowClientForm(false);}}
                style={{background:showNewClientForm?"#eff6ff":"#f3f4f6",color:"#059669",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                + Новый
              </button>
          }
        </div>
        {showNewClientForm && (
          <div style={{marginTop:8,padding:"12px 14px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"#059669"}}>Новый клиент</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>Тип</div>
                <select className="fi" value={newClientData.type} onChange={e=>setNewClientData(p=>({...p,type:e.target.value}))}>
                  <option value="физ">Физ. лицо</option>
                  <option value="юр">Юр. лицо</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>ФИО / Название *</div>
                <input className="fi" value={newClientData.name} onChange={e=>setNewClientData(p=>({...p,name:e.target.value}))} placeholder="Иванов Иван Иванович"/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>Телефон</div>
                <input className="fi" value={newClientData.phone||""} onChange={e=>setNewClientData(p=>({...p,phone:e.target.value}))} placeholder="+7 ..."/>
              </div>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>Адрес</div>
                <input className="fi" value={newClientData.address||""} onChange={e=>setNewClientData(p=>({...p,address:e.target.value}))} placeholder="г. Алматы ..."/>
              </div>
            </div>
            {newClientErr && (
              <div style={{background:"#fef2f2",border:"1px solid #fecaca",color:"#b91c1c",borderRadius:8,padding:"7px 11px",fontSize:11.5,fontWeight:600,marginBottom:8}}>
                {newClientErr}
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={async ()=>{
                if(!newClientData.name.trim() || savingClient) return;
                const nc = {id:Date.now().toString(),createdAt:Date.now(),...newClientData,name:newClientData.name.trim()};
                setSavingClient(true); setNewClientErr("");
                // Раньше форма закрывалась не глядя на результат: при отказе записи договор
                // оставался с clientId несуществующего клиента, а введённое исчезало.
                const res = await onCreateClient(nc);
                setSavingClient(false);
                if (res && res.ok === false) { setNewClientErr(CLIENT_SAVE_FAIL_TEXT(res.reason)); return; }
                upd({clientId:nc.id});
                setShowNewClientForm(false);
                setNewClientData({name:"",phone:"",type:"физ"});
                setShowClientForm(true);
              }} disabled={savingClient} style={{background:savingClient?"#6ee7b7":"#059669",color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:700,cursor:savingClient?"default":"pointer",fontFamily:"inherit"}}>
                {savingClient?"Сохраняю…":"Создать и выбрать"}
              </button>
              <button onClick={()=>{setShowNewClientForm(false);setNewClientData({name:"",phone:"",type:"физ"});setNewClientErr("");}}
                style={{background:"#f3f4f6",color:"#64748b",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                Отмена
              </button>
            </div>
          </div>
        )}
        {!contract.clientId && !showNewClientForm && contract.estClient && (
          <button onClick={async ()=>{ await onAddClientFromEstimate(); setShowClientForm(true); }}
            style={{marginTop:6,background:"#eff6ff",color:"#059669",border:"1px solid #eff6ff",borderRadius:8,padding:"5px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
            + Создать клиента из сметы ({contract.estClient})
          </button>
        )}
        {/* Инлайн-форма данных выбранного клиента */}
        {contract.clientId && showClientForm && (() => {
          const cl = clients.find(c=>c.id===contract.clientId);
          if(!cl) return null;
          const updCl = (patch)=>onUpdateClient({...cl,...patch});
          const isYur = cl.type==="юр";
          const fields = isYur
            ? [["ФИО / Название","name"],["Телефон","phone"],["Адрес","address"],["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (счёт)","account"],["Почта","email"]]
            : [["ФИО","name"],["Телефон","phone"],["Адрес","address"],["ИИН","iin"],["Документ (уд. личности)","doc"]];
          // Реквизиты, без которых договор печатается с прочерками «_______». Раньше это
          // всплывало только на бумаге: подписывать едешь, а в договоре пустое место.
          // Список ровно тот, что подставляется в шаблон (см. генератор договора).
          const required = isYur
            ? [["ФИО / Название","name"],["Телефон","phone"],["Адрес","address"],["БИН","iin"],["Директор (полностью)","director"]]
            : [["ФИО","name"],["Телефон","phone"],["Адрес","address"],["ИИН","iin"],["Документ (уд. личности)","doc"]];
          const missing = required.filter(([,f])=>!String(cl[f]||"").trim()).map(([l])=>l);
          return (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {missing.length>0 && (
                <div style={{gridColumn:"1 / -1",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:12.5,fontWeight:800,color:"#b91c1c",marginBottom:4}}>
                    ⚠️ Не заполнены реквизиты клиента — в договоре встанут прочерки
                  </div>
                  <div style={{fontSize:11.5,color:"#b91c1c",lineHeight:1.5}}>{missing.join(" · ")}</div>
                  <div style={{fontSize:10.5,color:"#94a3b8",marginTop:5}}>
                    Заполните поля ниже — они сразу уйдут в карточку клиента и в договор.
                  </div>
                </div>
              )}
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип</div>
                <select className="fi" value={cl.type||"физ"} onChange={e=>updCl({type:e.target.value})}>
                  <option value="физ">Физ. лицо</option>
                  <option value="юр">Юр. лицо</option>
                </select>
              </div>
              {fields.map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={cl[field]||""} onChange={e=>updCl({[field]:e.target.value})} placeholder={label}/>
                </div>
              ))}
              <div style={{gridColumn:"1 / -1",fontSize:10,color:"#94a3b8"}}>✓ Изменения сохраняются автоматически в карточку клиента</div>
            </div>
          );
        })()}
      </div>
      )}
      {/* Подрядчик/Заказчик (наше ТОО) */}
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>{isPod?"ЗАКАЗЧИК (наше ТОО)":"ПОДРЯДЧИК"}</div>
        <SearchSelect value={contract.contragentId||""} onChange={v=>upd({contragentId:v})} placeholder="🔍 Выбрать ТОО…"
          options={contragents.map(c=>({value:c.id,label:c.name,sub:c.bin?("БИН "+c.bin):""}))}/>
      </div>
      {/* Доп. поля договора подряда */}
      {isPod && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{gridColumn:"1 / -1"}}>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Адрес проведения работ</div>
            <input className="fi" value={contract.objectAddress||""} onChange={e=>upd({objectAddress:e.target.value})} placeholder="г. Караганда, ..."/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Аванс (₸, необязательно)</div>
            <input className="fi" type="number" value={contract.avans||""} onChange={e=>upd({avans:e.target.value})} placeholder="0"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Срок (календарных дней)</div>
            <input className="fi" type="number" value={contract.termDays||""} onChange={e=>upd({termDays:e.target.value})} placeholder="25"/>
          </div>
        </div>
      )}
      {/* Работы — только для ремонта и приложений */}
      {hasWorks && <div>
        <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>РАБОТЫ ({(contract.works||[]).length})</div>
        <div style={{background:"#f8fafc",borderRadius:8,overflow:"hidden",border:"1px solid #e2e8f0"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",padding:"8px 12px",background:"#f8fafc",fontSize:10,color:"#94a3b8",fontWeight:700}}>
            <span>НАИМЕНОВАНИЕ</span><span style={{textAlign:"center"}}>КОЛ-ВО</span><span style={{textAlign:"center"}}>ЕД.</span><span style={{textAlign:"right"}}>ЦЕНА</span><span style={{textAlign:"right"}}>СУММА</span><span/>
          </div>
          {(contract.works||[]).map((w,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 70px 55px 80px 80px 30px",gap:4,padding:"6px 12px",borderTop:"1px solid #e2e8f0",alignItems:"center"}}>
              <input value={w.name||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],name:e.target.value};upd({works:ws});}}
                style={{background:"transparent",border:"none",color:"#0f172a",fontSize:12,fontFamily:"inherit",padding:0,outline:"none",width:"100%"}}/>
              <input type="number" value={w.quantity||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],quantity:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input value={w.unit||"м²"} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],unit:e.target.value};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"center",fontFamily:"inherit",width:"100%"}}/>
              <input type="number" value={w.price||""} onChange={e=>{const ws=[...(contract.works||[])];ws[i]={...ws[i],price:parseFloat(e.target.value)||0};upd({works:ws});}}
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",fontSize:11,borderRadius:4,padding:"3px 5px",textAlign:"right",fontFamily:"inherit",width:"100%"}}/>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",textAlign:"right"}}>{fmt(lineTotal(w.quantity,w.price))}</div>
              <button onClick={()=>{const ws=(contract.works||[]).filter((_,j)=>j!==i);upd({works:ws});}}
                style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:14,padding:0}}>✕</button>
            </div>
          ))}
          <div style={{padding:"8px 12px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>upd({works:[...(contract.works||[]),{name:"",quantity:0,unit:"м²",price:0}]})}
              className="btn btn-g" style={{fontSize:11,padding:"5px 12px"}}>
              + Добавить позицию
            </button>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#94a3b8"}}>
                <span>Скидка</span>
                <input type="number" min="0" max="100" value={contract.discount||0}
                  onChange={e=>upd({discount:Math.min(100,Math.max(0,Number(e.target.value)||0))})}
                  style={{width:46,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:4,padding:"3px 6px",fontSize:11,textAlign:"right",fontFamily:"inherit",outline:"none"}}/>
                <span>%</span>
              </div>
              {(contract.discount||0)>0 ? (
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"#dc2626"}}>− {fmt(Math.round(total*(contract.discount||0)/100))} ₸</div>
                  <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(Math.round(total*(1-(contract.discount||0)/100)))} ₸</div>
                </div>
              ) : (
                <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(total)} ₸</div>
              )}
            </div>
          </div>
        </div>
      </div>}
      {/* Способ указания цены — для договоров подряда */}
      {isPod && (
        <div style={{background:"#faf5ff",border:"1px solid #ede9fe",borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:11,color:"#7c3aed",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Способ указания цены</div>
          <div style={{display:"flex",gap:18,flexWrap:"wrap",marginBottom:(contract.priceMode==="lump")?10:0}}>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#334155",cursor:"pointer"}}>
              <input type="radio" name="podPriceMode" checked={(contract.priceMode||"perline")==="perline"} onChange={()=>upd({priceMode:"perline"})}/> Цена за каждую позицию (за объём)
            </label>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#334155",cursor:"pointer"}}>
              <input type="radio" name="podPriceMode" checked={contract.priceMode==="lump"} onChange={()=>upd({priceMode:"lump"})}/> Одна сумма за все работы
            </label>
          </div>
          {contract.priceMode==="lump" ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,alignItems:"end"}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Общая сумма работ (₸)</div>
                <input className="fi" type="number" value={contract.manualTotal||""} onChange={e=>upd({manualTotal:e.target.value})} placeholder="800000"/>
              </div>
              <div style={{fontSize:12,color:"#64748b",paddingBottom:8}}>В документе цены по позициям не печатаются — только итоговая сумма и перечень работ.</div>
            </div>
          ) : (
            <div style={{fontSize:12,color:"#64748b"}}>Итог считается по строкам: <b style={{color:"#0f172a"}}>{fmt(total)} ₸</b></div>
          )}
        </div>
      )}
      {/* Предоплата для ремонтных договоров */}
      {isRepair && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Предоплата (%)</div>
            <input className="fi" type="number" min="0" max="100" value={contract.advancePercent??30}
              onChange={e=>upd({advancePercent:parseFloat(e.target.value)||0})} placeholder="30"/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Сумма предоплаты (₸)</div>
            <div className="fi" style={{background:"#e2e8f0",color:"#334155",fontWeight:600,display:"flex",alignItems:"center"}}>
              {fmt(Math.round(total*(contract.advancePercent??30)/100))} ₸
            </div>
          </div>
        </div>
      )}
      {/* Примечание */}
      <div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Примечание</div>
        <textarea className="fi" rows={2} value={contract.note||""} onChange={e=>upd({note:e.target.value})} placeholder="Дополнительные условия..."/>
      </div>
      {/* Кнопки */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button className="btn btn-o" style={{flex:1}} onClick={onBack}>← Назад</button>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
          {canExport && <button onClick={()=>onPdf(withStamp)} className="btn btn-o" style={{width:"100%"}}>
            📄 PDF
          </button>}
          <div onClick={()=>setWithStamp(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",justifyContent:"center"}}>
            <div style={{width:28,height:16,borderRadius:8,background:withStamp?"#2563eb":"#e2e8f0",position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:withStamp?12:2,width:12,height:12,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <span style={{fontSize:10,color:withStamp?"#2563eb":"#94a3b8"}}>С печатью</span>
          </div>
        </div>
        {canExport && <button onClick={onGDoc} className="btn btn-o" style={{flex:1}}>
          📋 Google Doc
        </button>}
        {canExport && <button onClick={onSamplePdf} className="btn btn-o" style={{flex:1,color:"#b45309",borderColor:"#fcd34d",background:"#fffbeb"}}
          title="PDF без данных клиента; не сохраняется как официальный документ">
          📑 Образец PDF
        </button>}
      </div>
    </div>
  );
}
