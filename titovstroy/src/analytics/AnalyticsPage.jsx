export default function AnalyticsPage({ runtime }) {
  const { analyticsData, currentPermissions, statsPeriod, setStatsPeriod, statsDateFrom, setStatsDateFrom, statsDateTo, setStatsDateTo, statsManager, setStatsManager, hasFinancialDetails, fmt, finProjects, isActiveFinanceProject, financeTx, productions, liveObjects, unifiedStatusOf, currentUser, setCurrentObject, setObjectTab, setScreen, StaleObjectsPanel, objects, DEAL_STATUSES } = runtime;
        const { baseEst, baseCon, totalEst, withSumEst, totalSumEst, avgEst, totalCon, totalSumCon, avgCon, byStatus, byType, topCats, managers, managerStats, byConType, TYPE_L2,
          wonRevenue, wonCost, wonProfit, wonMargin, allRevenue, allCost, allProfit, allMargin, funnel, winRateOverall, winRateSent, catProfit, monthly, staleSent,
          avgDealDays, avgApprovalDays, signedObjsCount, convByType, topObjects, objVal } = analyticsData;
        const PERIOD_BTNS = [["all","Всё время"],["month","Месяц"],["3month","3 месяца"],["week","Неделя"],["custom","Вручную"]];
        return (
          <div className="page" style={{maxWidth:1600}}>
            <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"24px 28px",marginBottom:24,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
              <div style={{position:"relative",zIndex:1}}>
                <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#fff"}}>📊 Аналитика</h1>
                <div style={{fontSize:13,color:"rgba(255,255,255,.75)",marginTop:4}}>Статистика по объектам и договорам</div>
              </div>
            </div>
            <div className="an-filters" style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"16px 18px",marginBottom:20,display:"flex",flexWrap:"wrap",gap:16}}>
              <div style={{flex:"1 1 300px"}}>
                <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Период</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {PERIOD_BTNS.map(([k,l])=>(
                    <button key={k} onClick={()=>setStatsPeriod(k)}
                      style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                        border:"1px solid "+(statsPeriod===k?"#2563eb":"rgba(0,0,0,.04)"),
                        background:statsPeriod===k?"#eff6ff":"transparent",
                        color:statsPeriod===k?"#2563eb":"#94a3b8"}}>{l}</button>
                  ))}
                </div>
                {statsPeriod==="custom" && (
                  <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
                    <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>С</div><input type="date" className="fi" style={{width:"auto"}} value={statsDateFrom} onChange={e=>setStatsDateFrom(e.target.value)}/></div>
                    <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>По</div><input type="date" className="fi" style={{width:"auto"}} value={statsDateTo} onChange={e=>setStatsDateTo(e.target.value)}/></div>
                  </div>
                )}
              </div>
              {currentPermissions.analytics === "all" && <div style={{flex:"1 1 200px"}}>
                <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Менеджер</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  <button onClick={()=>setStatsManager("")} style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(!statsManager?"#2563eb":"rgba(0,0,0,.04)"),background:!statsManager?"rgba(136,136,204,.15)":"transparent",color:!statsManager?"#2563eb":"#94a3b8"}}>🏢 Все</button>
                  {managers.map(m=>(<button key={m} onClick={()=>setStatsManager(m)} style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(statsManager===m?"#2563eb":"rgba(0,0,0,.04)"),background:statsManager===m?"rgba(136,136,204,.15)":"transparent",color:statsManager===m?"#2563eb":"#94a3b8"}}>👤 {m}</button>))}
                </div>
              </div>}
            </div>
            <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:20}}>
              {[["Создано объектов",totalEst,"в периоде, без архива","#2563eb","📋"],["Объём объектов",fmt(totalSumEst)+" ₸","сумма смет","#2563eb","💰"],["Ср. чек",fmt(avgEst)+" ₸","на объект","#059669","🎯"],["Договоров",totalCon,"по объектам","#2563eb","📄"],["Объём договоров",fmt(totalSumCon)+" ₸","сумма договоров","#2563eb","🧾"],["Средний договор",fmt(avgCon)+" ₸","на договор","#059669","📊"]].map(([l,v,s,c,ic],i)=>(
                <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"16px 18px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",position:"relative",overflow:"hidden",transition:"transform .18s ease,box-shadow .18s ease"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:c,opacity:.85}}/>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontSize:11.5,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{l}</div>
                    <span style={{width:34,height:34,borderRadius:10,background:c+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{ic}</span>
                  </div>
                  <div className="kpi-val" style={{fontSize:21,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:5,letterSpacing:-.5}}>{v}</div>
                  <div style={{fontSize:11,color:"#94a3b8",fontWeight:500}}>{s}</div>
                </div>
              ))}
            </div>

            {/* ── A. Финансовый обзор ── */}
            {hasFinancialDetails && <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                <span style={{fontSize:11,color:"#059669",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>💰 Финансы — подписанные договоры (заработано)</span>
                <span style={{fontSize:11,color:"#94a3b8"}}>в выбранном периоде</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                {[
                  ["Выручка", fmt(Math.round(wonRevenue))+" ₸", "#2563eb"],
                  ["Себестоимость", fmt(Math.round(wonCost))+" ₸", "#64748b"],
                  ["Валовая прибыль", fmt(Math.round(wonProfit))+" ₸", "#059669"],
                  ["Средняя маржа", wonMargin+"%", wonMargin>=35?"#059669":wonMargin>=20?"#d97706":"#ef4444"],
                ].map(([l,v,c],i)=>(
                  <div key={i} style={{padding:"12px 14px",background:"#f9fafb",borderRadius:8,borderLeft:`3px solid ${c}`}}>
                    <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{l}</div>
                    <div style={{fontSize:19,fontWeight:900,color:c,lineHeight:1}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px dashed #e5e7eb",display:"flex",gap:18,flexWrap:"wrap",fontSize:12,color:"#64748b"}}>
                <span>Потенциал (все активные объекты с суммой): <b style={{color:"#334155"}}>{fmt(Math.round(allRevenue))} ₸</b> выручка · прибыль <b style={{color:"#059669"}}>{fmt(Math.round(allProfit))} ₸</b> · маржа <b style={{color:"#334155"}}>{allMargin}%</b></span>
              </div>
            </div>}

            {/* ── B. Воронка с деньгами и конверсией ── */}
            <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                <span style={{fontSize:11,color:"#7c3aed",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>🪜 Воронка сделок (объекты)</span>
                <span style={{fontSize:12,color:"#64748b"}}>Конверсия: <b style={{color:"#059669"}}>{winRateOverall}%</b> от всех · <b style={{color:"#7c3aed"}}>{winRateSent}%</b> из решённых</span>
              </div>
              {(() => {
                const maxSum = Math.max(1, ...funnel.map(f=>f.sum));
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {funnel.map(f=>(
                      <div key={f.key} style={{display:"flex",alignItems:"center",gap:12}}>
                        <span className="an-bar-label" style={{fontSize:12,fontWeight:600,color:f.color,width:140,flexShrink:0}}>{f.label}</span>
                        <div style={{flex:1,minWidth:60,background:"rgba(0,0,0,.04)",borderRadius:8,height:26,position:"relative",overflow:"hidden"}}>
                          <div style={{width:`${Math.round(f.sum/maxSum*100)}%`,minWidth:f.count>0?2:0,height:"100%",background:f.bg,borderLeft:`3px solid ${f.color}`}}/>
                          <span style={{position:"absolute",left:10,top:0,height:"100%",display:"flex",alignItems:"center",gap:8,fontSize:11,fontWeight:700,color:f.color}}>{f.count} шт · {fmt(Math.round(f.sum))} ₸</span>
                        </div>
                        {hasFinancialDetails && <span className="an-bar-right" style={{fontSize:11,color:"#059669",width:130,textAlign:"right",flexShrink:0}}>{f.profit>0?"приб. "+fmt(Math.round(f.profit))+" ₸":"—"}</span>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* ── B2. Финансы и производство — текущий снимок (по всей компании) ── */}
            {(()=>{
              const _norm = s => String(s||"").replace(/[№#\s]/g,"").toLowerCase();
              const _inM = ts => { const d=new Date(ts||0); const n=new Date(); return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); };
              const _ds = d => { const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
              // Активные = НЕ отменён и НЕ выполнен (в работе + новые)
              const activeFp = (finProjects||[]).filter(isActiveFinanceProject);
              const txMap = {}; for(const t of (financeTx||[])){ if(t.deletedAt||t.included===false) continue; const cn=_norm(t.contractNo); if(!txMap[cn])txMap[cn]={inc:0,exp:0}; if(t.type==="income")txMap[cn].inc+=(Number(t.amount)||0); else txMap[cn].exp+=(Number(t.amount)||0); }
              // ВСЁ по АКТИВНЫМ проектам — числа сходятся: Бюджет = Получено + Дебиторка
              const totalBudget = activeFp.reduce((s,p)=>s+(Number(p.budget)||0),0);
              const totalInc = activeFp.reduce((s,p)=>s+(txMap[_norm(p.contractNo)]?.inc||0),0);
              const totalExp = activeFp.reduce((s,p)=>s+(txMap[_norm(p.contractNo)]?.exp||0),0);
              const totalDebt = activeFp.reduce((s,p)=>{const inc=txMap[_norm(p.contractNo)]?.inc||0; return s+Math.max(0,(Number(p.budget)||0)-inc);},0);
              const recvPct = totalBudget>0?Math.round(totalInc/totalBudget*100):0;
              const planMargin = totalBudget>0?Math.round((totalBudget-totalExp)/totalBudget*100):null;
              const incMonth = (financeTx||[]).filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&_inM(t.date?new Date(t.date).getTime():0)).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const expMonth = (financeTx||[]).filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&_inM(t.date?new Date(t.date).getTime():0)).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const today = _ds(new Date());
              // Производство — состояние через unifiedStatusOf (production перевешивает сырой
              // object.status, как и везде), иначе счётчики занижены на объектах-исключениях.
              const _pbk = {}; for(const p of (productions||[])) _pbk[p.objectId]=p;
              const prodActive = liveObjects.filter(o=>unifiedStatusOf(o)==="work").length;
              const prodOverdue = liveObjects.filter(o=>{ if(unifiedStatusOf(o)!=="work") return false; const p=_pbk[o.id]; return p?.planEndDate&&_ds(p.planEndDate)<today&&!p?.factEndDate; }).length;
              const prodDoneMonth = liveObjects.filter(o=>{ if(unifiedStatusOf(o)!=="done") return false; const p=_pbk[o.id]; const dt=p?.factEndDate?new Date(p.factEndDate).getTime():(o.updatedAt||0); return dt&&_inM(dt); }).length;
              const prodDefects = liveObjects.reduce((s,o)=>s+((_pbk[o.id]?.defects||[]).filter(d=>!d.done).length),0);
              const prodAnyCount = liveObjects.filter(o=>{ const us=unifiedStatusOf(o); return us==="work"||us==="paused"||us==="done"; }).length;
              if(activeFp.length===0 && prodAnyCount===0) return null;
              const finCards = [
                ["Сумма контрактов", fmt(Math.round(totalBudget))+" ₸", activeFp.length+" активных проектов", "#2563eb"],
                ["Получено", fmt(Math.round(totalInc))+" ₸", recvPct+"% от контрактов", "#059669"],
                ["Дебиторка", fmt(Math.round(totalDebt))+" ₸", "осталось получить", totalDebt>0?"#dc2626":"#059669"],
                ["Расходы", fmt(Math.round(totalExp))+" ₸", "по активным проектам", "#64748b"],
                ["Маржа план", planMargin!=null?planMargin+"%":"—", "контракты − расходы", planMargin!=null&&planMargin>=30?"#059669":planMargin!=null&&planMargin>=0?"#d97706":"#dc2626"],
                ["Денежный поток за месяц", fmt(Math.round(incMonth-expMonth))+" ₸", "приход "+fmt(Math.round(incMonth))+" − расход "+fmt(Math.round(expMonth)), incMonth-expMonth>=0?"#059669":"#dc2626"],
              ];
              const prodCards = [
                ["В работе", prodActive, "объектов в статусе «В работе»", "#2563eb"],
                ["Просрочено", prodOverdue, "срок истёк", prodOverdue>0?"#dc2626":"#059669"],
                ["Сдано за месяц", prodDoneMonth, "объектов завершено", "#059669"],
                ["Открытых замечаний", prodDefects, "незакрытые дефекты", prodDefects>0?"#d97706":"#059669"],
              ];
              const Card = ([l,v,s,c],i)=>(
                <div key={i} style={{padding:"12px 14px",background:"#f9fafb",borderRadius:8,borderLeft:`3px solid ${c}`}}>
                  <div style={{fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{l}</div>
                  <div style={{fontSize:17,fontWeight:900,color:c,lineHeight:1.1}}>{v}</div>
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>{s}</div>
                </div>
              );
              return (
                <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:14}}>
                    <span style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700}}>{hasFinancialDetails?"💼 Финансы и производство":"🏗 Производство"}</span>
                    <span style={{fontSize:11,color:"#94a3b8"}}>текущий снимок · не зависит от периода</span>
                  </div>
                  {hasFinancialDetails && activeFp.length>0 && <>
                    <div style={{fontSize:10,color:"#059669",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>💰 Финансы по проектам</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:prodAnyCount>0?16:0}}>{finCards.map(Card)}</div>
                  </>}
                  {prodAnyCount>0 && <>
                    <div style={{fontSize:10,color:"#d97706",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>🏗 Производство</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>{prodCards.map(Card)}</div>
                  </>}
                </div>
              );
            })()}

            {/* ── E. Динамика по месяцам ── */}
            {monthly.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:16}}>📈 Динамика по месяцам</div>
                {(() => {
                  const maxRev = Math.max(1, ...monthly.map(m=>m.revenue));
                  return (
                    <div style={{display:"flex",alignItems:"flex-end",gap:10,height:160,overflowX:"auto",paddingBottom:4}}>
                      {monthly.map(m=>(
                        <div key={m.key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,minWidth:46,flex:"1 0 46px"}}>
                          <div style={{fontSize:9,color:"#059669",fontWeight:700,whiteSpace:"nowrap"}}>{hasFinancialDetails&&m.profit>0?Math.round(m.profit/1000)+"k":""}</div>
                          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:110,width:"100%",justifyContent:"center"}}>
                            <div title={"Выручка: "+fmt(Math.round(m.revenue))+" ₸"} style={{width:14,height:`${Math.max(2,Math.round(m.revenue/maxRev*110))}px`,background:"#93c5fd",borderRadius:"3px 3px 0 0"}}/>
                            {hasFinancialDetails && <div title={"Прибыль: "+fmt(Math.round(m.profit))+" ₸"} style={{width:14,height:`${Math.max(2,Math.round(Math.max(0,m.profit)/maxRev*110))}px`,background:"#059669",borderRadius:"3px 3px 0 0"}}/>}
                          </div>
                          <div style={{fontSize:9,fontWeight:700,color:m.conv>=40?"#059669":m.conv>=20?"#d97706":"#94a3b8",whiteSpace:"nowrap"}} title="Конверсия в подписанные">{m.total>0?m.conv+"%":""}</div>
                          <div style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div style={{display:"flex",gap:16,marginTop:10,fontSize:11,color:"#94a3b8"}}>
                  <span><span style={{display:"inline-block",width:10,height:10,background:"#93c5fd",borderRadius:2,marginRight:5}}/>Выручка</span>
                  {hasFinancialDetails && <span><span style={{display:"inline-block",width:10,height:10,background:"#059669",borderRadius:2,marginRight:5}}/>Прибыль</span>}
                  <span>% — конверсия в подписанные за месяц</span>
                </div>
              </div>
            )}

            {/* ── F. «Зависшие» объекты в работе ── */}
            <StaleObjectsPanel
              items={staleSent.map(({e,days})=>({id:e.id,name:e.proj?.name||"Объект",address:e._obj?.address,days,total:e.total,object:e._obj}))}
              onOpen={item=>{ if(currentUser.role!=="viewer"&&item.object){ setCurrentObject({...item.object}); setObjectTab("workspace"); setScreen("objects"); } }}
              fmt={fmt}
              title="На согласовании без движения 14+ дней"
            />

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(380px,1fr))",gap:16,marginBottom:16}}>
              <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"18px"}}>
                <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>Объекты</div>
                <div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По статусам</div>
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
                  {DEAL_STATUSES.map(s=>(
                    <div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:8}}>
                      <span style={{fontSize:12,color:s.color,fontWeight:600}}>{s.label}</span>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:80,height:4,background:"rgba(255,255,255,.06)",borderRadius:2,overflow:"hidden"}}>
                          <div style={{width:totalEst?(byStatus[s.key]/totalEst*100)+"%":"0%",height:"100%",background:s.color,borderRadius:2}}/>
                        </div>
                        <span style={{fontSize:13,fontWeight:700,color:"#0f172a",minWidth:20,textAlign:"right"}}>{byStatus[s.key]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {Object.keys(byType).length>0 && <><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типу объекта</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(<span key={t} style={{fontSize:11,padding:"3px 10px",borderRadius:4,background:"rgba(0,0,0,.04)",color:"#94a3b8"}}>{t}: <strong style={{color:"#0f172a"}}>{n}</strong></span>))}</div></>}
              </div>
              <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"18px"}}>
                <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>Договора по объектам</div>
                {Object.keys(byConType).length>0 && <><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>По типам</div><div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>{Object.entries(byConType).sort((a,b)=>b[1]-a[1]).map(([t,n])=>(<div key={t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:8}}><span style={{fontSize:12,color:"#94a3b8"}}>{t}</span><span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>{n}</span></div>))}</div></>}
                {baseCon.length>0 && <><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontWeight:700}}>Договора в периоде</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{[...baseCon].sort((a,b)=>Number(b.id||0)-Number(a.id||0)).slice(0,6).map(c=>{const obj=objects.find(o=>o.id===c.objectId);const sum=(c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);return(<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(0,0,0,.02)",borderRadius:8,cursor:"pointer"}} onClick={()=>{if(obj){setCurrentObject({...obj});setObjectTab("workspace");setScreen("objects");}}}><div style={{minWidth:0}}><div style={{fontSize:12,color:"#0f172a",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{TYPE_L2[c.type||"repair_fiz"]} #{c.number||"--"}</div><div style={{fontSize:10,color:"#94a3b8"}}>{obj?.clientName||"--"}</div></div><span style={{fontSize:12,fontWeight:700,color:"#2563eb",flexShrink:0,marginLeft:8}}>{fmt(sum)} ₸</span></div>);})}</div></>}
                {totalCon===0 && <div style={{textAlign:"center",color:"#334155",fontSize:13,padding:"30px 0"}}>Нет договоров по объектам за период</div>}
              </div>
            </div>
            {/* ── C. Менеджеры по прибыли ── */}
            {!statsManager && managerStats.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>👥 Менеджеры — {hasFinancialDetails?"прибыль и конверсия":"оборот и конверсия"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 12px",fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.5}}>
                    <span style={{flex:1}}>Менеджер</span>
                    <span style={{width:70,textAlign:"right"}}>Оборот</span>
                    {hasFinancialDetails && <span style={{width:70,textAlign:"right"}}>Прибыль</span>}
                    {hasFinancialDetails && <span style={{width:46,textAlign:"right"}}>Маржа</span>}
                    <span style={{width:54,textAlign:"right"}}>Конв.</span>
                  </div>
                  {managerStats.map(m=>(
                    <div key={m.name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#f9fafb",borderRadius:8,cursor:"pointer"}} onClick={()=>setStatsManager(m.name)}>
                      <span style={{fontSize:13,color:"#0f172a",flex:1,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>👤 {m.name} <span style={{fontSize:10,color:"#94a3b8"}}>· {m.count}</span></span>
                      <span style={{fontSize:12,fontWeight:600,color:"#334155",width:70,textAlign:"right"}}>{fmt(Math.round(m.sum/1000))}k</span>
                      {hasFinancialDetails && <span style={{fontSize:12,fontWeight:700,color:"#059669",width:70,textAlign:"right"}}>{fmt(Math.round(m.profit/1000))}k</span>}
                      {hasFinancialDetails && <span style={{fontSize:12,fontWeight:700,width:46,textAlign:"right",color:m.margin>=35?"#059669":m.margin>=20?"#d97706":"#ef4444"}}>{m.margin}%</span>}
                      <span style={{fontSize:12,fontWeight:700,color:"#7c3aed",width:54,textAlign:"right"}}>{m.conv}%</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>{hasFinancialDetails?"Оборот/прибыль":"Оборот"} — в тыс. ₸. Конверсия = подписано / активные объекты (кроме архива).</div>
              </div>
            )}

            {/* ── G+H. Цикл сделки + Конверсия по типу ── */}
            {(avgDealDays!==null || avgApprovalDays!==null || Object.keys(convByType).length>0) && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:16}}>
                {avgDealDays!==null && (
                  <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:11,color:"#7c3aed",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>⏱ Средний цикл сделки</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                      <span style={{fontSize:36,fontWeight:900,color:"#0f172a"}}>{avgDealDays}</span>
                      <span style={{fontSize:14,color:"#64748b"}}>дней</span>
                      {avgApprovalDays!==null && <span style={{fontSize:12,color:"#94a3b8",marginLeft:"auto"}}>в согласовании сейчас: <b style={{color:avgApprovalDays>14?"#dc2626":"#0f172a"}}>{avgApprovalDays} дн.</b></span>}
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>от создания объекта до подписания договора</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>по {signedObjsCount} подписанным договорам в периоде</div>
                  </div>
                )}
                {avgDealDays===null && avgApprovalDays!==null && (
                  <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:11,color:"#d97706",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>⏳ Среднее время в согласовании</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                      <span style={{fontSize:36,fontWeight:900,color:avgApprovalDays>14?"#dc2626":"#0f172a"}}>{avgApprovalDays}</span>
                      <span style={{fontSize:14,color:"#64748b"}}>дней</span>
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>открытые сделки в статусе «Согласование»</div>
                  </div>
                )}
                {Object.keys(convByType).length>0 && (
                  <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                    <div style={{fontSize:11,color:"#059669",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:14}}>🏠 Конверсия по типу объекта</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {Object.entries(convByType).sort((a,b)=>b[1].total-a[1].total).map(([t,d])=>{
                        const conv = d.total>0 ? Math.round(d.signed/d.total*100) : 0;
                        return (
                          <div key={t} style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:12,color:"#334155",width:100,flexShrink:0}}>{t}</span>
                            <div style={{flex:1,background:"rgba(0,0,0,.04)",borderRadius:4,height:20,position:"relative",overflow:"hidden"}}>
                              <div style={{width:conv+"%",height:"100%",background:"rgba(5,150,105,.15)",borderLeft:"3px solid #059669"}}/>
                              <span style={{position:"absolute",left:8,top:0,height:"100%",display:"flex",alignItems:"center",fontSize:11,fontWeight:700,color:"#059669"}}>{d.signed}/{d.total}</span>
                            </div>
                            <span style={{fontSize:12,fontWeight:700,color:conv>=50?"#059669":conv>=25?"#d97706":"#64748b",width:36,textAlign:"right"}}>{conv}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>подписано / всего объектов</div>
                  </div>
                )}
              </div>
            )}

            {/* ── I. Топ объектов по сумме ── */}
            {topObjects.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:16,boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>🏆 Топ объектов периода по сумме</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {topObjects.map((o,i)=>{
                    const v = objVal(o);
                    const st = DEAL_STATUSES.find(s=>s.key===unifiedStatusOf(o))||DEAL_STATUSES[0];
                    return (
                      <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"#f9fafb",borderRadius:8,cursor:"pointer"}}
                        onClick={()=>{setCurrentObject({...o});setObjectTab("workspace");setScreen("objects");}}>
                        <span style={{fontSize:11,color:"#94a3b8",minWidth:18,fontWeight:700}}>#{i+1}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:"#0f172a",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.clientName||"Без клиента"}</div>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2,flexWrap:"wrap"}}>
                            <span style={{fontSize:10,fontWeight:700,color:st.color,background:st.bg,borderRadius:4,padding:"1px 6px"}}>{st.label}</span>
                            <span style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.objType||"Вторичка"}{o.address?` · ${o.address}`:""}</span>
                          </div>
                        </div>
                        <span style={{fontSize:13,fontWeight:800,color:"#0f172a",flexShrink:0}}>{fmt(v)} ₸</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── D. Рентабельность по категориям ── */}
            {hasFinancialDetails && catProfit.length>0 && (
              <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",boxShadow:"0 1px 3px rgba(15,23,42,.06)"}}>
                <div style={{fontSize:11,color:"#2563eb",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:12}}>🏗 Рентабельность по категориям работ</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {catProfit.map((c,i)=>(
                    <div key={c.cat} className="an-catrow" style={{display:"flex",alignItems:"center",gap:10,fontSize:12,padding:"9px 12px",background:"#f9fafb",borderRadius:8}}>
                      <span style={{fontSize:10,color:"#94a3b8",minWidth:16}}>{i+1}.</span>
                      <span className="an-cat-name" style={{color:"#0f172a",fontWeight:500,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.cat}</span>
                      <span style={{color:"#64748b",width:90,textAlign:"right"}}>выр. {fmt(Math.round(c.revenue/1000))}k</span>
                      <span style={{color:"#059669",fontWeight:700,width:90,textAlign:"right"}}>приб. {fmt(Math.round(c.profit/1000))}k</span>
                      <span style={{fontWeight:700,width:46,textAlign:"right",color:c.margin>=35?"#059669":c.margin>=20?"#d97706":"#ef4444"}}>{c.margin}%</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>По ценам позиций до скидки. Суммы в тыс. ₸.</div>
              </div>
            )}
            {totalEst===0&&<div style={{textAlign:"center",color:"#334155",fontSize:13,padding:"60px 0"}}><div style={{fontSize:32,marginBottom:12}}>📊</div>Нет данных за выбранный период</div>}
          </div>
        );
}
