import { Fragment } from "react";

export default function FinancePage({ runtime }) {
  const { ASSET_INC_KEYS, ASSET_OUT_KEYS, BalanceSheet, C_ASSET_INC, C_ASSET_OUT, C_FINACT, C_FINANCING_INC, C_INVEST, FA_SUB_MAP, NumInput, SearchSelect, _finTypeLbl, _tng, canFinanceCreate, canFinanceDeleteRecord, canFinanceDirectories, canFinanceEditRecord, canFinanceExport, confirmDangerous, confirmTyped, contractsRef, currentPermissions, currentUser, downloadCSV, finAmtMax, finAmtMin, finBudgetOfContract, finCatOpen, finCatSearch, finFilterAccount, finFilterCat, finFilterCategory, finFilterContract, finFilterType, finFrom, finImportBusy, finPeriod, finProjCatFilter, finProjModal, finProjSearch, finProjStatusFilter, finProjects, finProjectsRef, finReadonly, finSearch, finTo, finTxModal, finTxProjOpen, finTxProjSearch, finTxTrash, financeContractOf, financeMeta, financeObjectOf, financeProjectViewOf, financeTab, financeTx, financeTxRef, genId, goBack, isCountedFinanceProject, linkForContractNo, liveObjects, logChange, navHistory, navigate, normCN, openObjectFromFinance, saveFinanceMeta, saveFinanceProjects, saveFinanceTx, setFinAmtMax, setFinAmtMin, setFinCatOpen, setFinCatSearch, setFinFilterAccount, setFinFilterCat, setFinFilterCategory, setFinFilterContract, setFinFilterType, setFinFrom, setFinImportBusy, setFinPeriod, setFinProjCatFilter, setFinProjModal, setFinProjSearch, setFinProjStatusFilter, setFinSearch, setFinTo, setFinTxModal, setFinTxProjOpen, setFinTxProjSearch, setFinTxTrash, unifiedStatusOf } = runtime;
        const fM = n => new Intl.NumberFormat("ru-RU").format(Math.round(n||0));
        const now = new Date();
        const periodStart = (()=>{
          if (finPeriod==="all") return 0;
          if (finPeriod==="custom") return finFrom ? new Date(finFrom).getTime() : 0;
          const d = new Date(now.getFullYear(), now.getMonth(), 1); // 1-е число текущего месяца
          if (finPeriod==="month") return d.getTime();
          if (finPeriod==="3month") { d.setMonth(d.getMonth()-2); return d.getTime(); }
          if (finPeriod==="year") { d.setMonth(d.getMonth()-11); return d.getTime(); }
          return d.getTime();
        })();
        const periodEnd = (finPeriod==="custom" && finTo) ? new Date(finTo).getTime()+86400000 : Infinity;
        const inPeriod = ts => ts>=periodStart && ts<periodEnd;
        const accounts = financeMeta.accounts||[];

        // Остатки по счетам (за всё время)
        const balances = {};
        accounts.forEach(a=>{ balances[a.name] = Number(a.opening)||0; });
        for (const t of financeTx) {
          if (t.deletedAt || t.included===false) continue;
          const amt = Number(t.amount)||0;
          if (t.type==="income") balances[t.account] = (balances[t.account]||0)+amt;
          else if (t.type==="expense") balances[t.account] = (balances[t.account]||0)-amt;
          else if (t.type==="transfer") { balances[t.account]=(balances[t.account]||0)-amt; balances[t.accountTo]=(balances[t.accountTo]||0)+amt; }
        }
        const totalBalance = Object.values(balances).reduce((s,v)=>s+v,0);

        // Показатели за период (без переводов)
        const periodTx = financeTx.filter(t=>!t.deletedAt && t.included!==false && inPeriod(t.date||t.createdAt||0));
        const incomeSum = periodTx.filter(t=>t.type==="income").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const expenseSum = periodTx.filter(t=>t.type==="expense").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const profit = incomeSum-expenseSum;
        const margin = incomeSum>0 ? Math.round(profit/incomeSum*100) : 0;

        // P&L: расходы по группам (категориям)
        const expByCat = {};
        periodTx.filter(t=>t.type==="expense").forEach(t=>{ const k=t.category||"Без категории"; expByCat[k]=(expByCat[k]||0)+(Number(t.amount)||0); });
        const expCats = Object.entries(expByCat).sort((a,b)=>b[1]-a[1]);
        const incByCat = {};
        periodTx.filter(t=>t.type==="income").forEach(t=>{ const k=t.category||"Без категории"; incByCat[k]=(incByCat[k]||0)+(Number(t.amount)||0); });
        const incCats = Object.entries(incByCat).sort((a,b)=>b[1]-a[1]);

        // Динамика по месяцам (выручка / вал.прибыль / чистая прибыль)
        const _C_COGS="Прямые расходы (COGS / себестоимость)";
        const _C_FIN="Финансовые расходы"; const _S_DIV="Дивиденды учредителям";
        const monthMap = {};
        // Считаем за ВСЁ время для полноты картины, но берём только период
        financeTx.forEach(t=>{
          if (t.deletedAt||t.included===false||t.type==="transfer") return;
          const ts=t.date||t.createdAt||0; if(!inPeriod(ts)) return;
          const d=new Date(ts); const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
          if(!monthMap[key]) monthMap[key]={inc:0,cogs:0,exp:0};
          const amt=Number(t.amount)||0;
          if(t.type==="income") monthMap[key].inc+=amt;
          else if(t.type==="expense"){
            monthMap[key].exp+=amt;
            if(t.category===_C_COGS) monthMap[key].cogs+=amt;
          }
        });
        const months = Object.keys(monthMap).sort().slice(-24);
        const maxMonth = Math.max(1,...months.map(m=>Math.max(monthMap[m].inc, monthMap[m].inc-monthMap[m].cogs, monthMap[m].inc-monthMap[m].exp)));
        const MNAMES=["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

        // Список операций (фильтры + поиск)
        const fq = finSearch.toLowerCase().trim();
        const opsList = financeTx
          .filter(t=>!t.deletedAt) // скрываем мягко-удалённые
          .filter(t=>inPeriod(t.date||t.createdAt||0))
          .filter(t=>!finFilterType || t.type===finFilterType)
          .filter(t=>!finFilterAccount || t.account===finFilterAccount || t.accountTo===finFilterAccount)
          .filter(t=>finAmtMin===""||(Number(t.amount)||0)>=Number(finAmtMin))
          .filter(t=>finAmtMax===""||(Number(t.amount)||0)<=Number(finAmtMax))
          .filter(t=>!finFilterCategory || t.subcategory===finFilterCategory)
          .filter(t=>!finFilterContract || (t.contractNo||"").trim()===finFilterContract.trim())
          .filter(t=>!finFilterCat || t.category===finFilterCat)
          .filter(t=>!fq || [t.category,t.subcategory,t.note,t.contractNo,t.account].some(v=>v&&String(v).toLowerCase().includes(fq)))
          // Сортировка: сначала по дате операции (новые дни сверху), а В ПРЕДЕЛАХ ОДНОЙ ДАТЫ —
          // по времени ДОБАВЛЕНИЯ (createdAt), затем сохранения (updatedAt), затем id. Раньше был
          // только date → операции одного дня шли в случайном порядке ключей Firebase.
          .sort((a,b)=>
            ((b.date||b.createdAt||0)-(a.date||a.createdAt||0)) ||
            ((b.createdAt||0)-(a.createdAt||0)) ||
            ((b.updatedAt||0)-(a.updatedAt||0)) ||
            String(b.id||"").localeCompare(String(a.id||""))
          );

        const PERIODS=[["all","Всё"],["month","Месяц"],["3month","3 мес"],["year","Год"],["custom","Период"]];
        const TYPE_LABEL={income:"Доход",expense:"Расход",transfer:"Перевод"};
        const TYPE_COLOR={income:"#059669",expense:"#dc2626",transfer:"#7c3aed"};

        const openNewTx = (type="income") => { if (!canFinanceCreate) return; setFinCatSearch(""); setFinCatOpen(false); setFinTxProjSearch(""); setFinTxProjOpen(false); setFinTxModal({ id:null, type, date:new Date().toISOString().slice(0,10), amount:"", account:accounts[0]?.name||"", accountTo:accounts[1]?.name||"", category:"", subcategory:"", note:"", contractNo:"" }); };
        const openEditTx = (t) => { if (!canFinanceEditRecord(t)) return; setFinCatSearch(t.subcategory||t.category||""); setFinCatOpen(false); setFinTxProjSearch(t.contractNo||""); setFinTxProjOpen(false); setFinTxModal({ ...t, date:new Date(t.date||t.createdAt||Date.now()).toISOString().slice(0,10) }); };

        return (
          <div className="page" style={{maxWidth:1600}}>
            {/* Hero */}
            <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"24px 28px",marginBottom:20,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(16,185,129,.10)"}}/>
              <div style={{position:"relative",zIndex:1,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div>
                  <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#fff"}}>💰 Финансы</h1>
                  <div style={{fontSize:13,color:"rgba(255,255,255,.75)",marginTop:4}}>Учёт доходов, расходов и движения денег</div>
                  {finReadonly && <div style={{display:"inline-block",marginTop:6,background:"rgba(251,191,36,.18)",border:"1px solid rgba(251,191,36,.4)",borderRadius:6,padding:"2px 10px",fontSize:11,fontWeight:700,color:"#fbbf24"}}>👁 Только просмотр</div>}
                </div>
                <div className="fin-hero-stats" style={{display:"flex",gap:24,alignItems:"flex-end",flexWrap:"wrap"}}>
                  {navHistory.length > 0 && <button onClick={goBack} style={{background:"none",border:"1px solid rgba(255,255,255,.4)",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:14,color:"#fff",alignSelf:"center"}}>← Назад</button>}
                  {(()=>{
                    const projIncH={};
                    for(const t of financeTx){ if(t.deletedAt||t.included===false)continue; const cn=normCN(t.contractNo); if(!cn)continue; if(t.type==="income") projIncH[cn]=(projIncH[cn]||0)+(Number(t.amount)||0); }
                    const debtH = finProjects.filter(isCountedFinanceProject).reduce((s,p)=>s+Math.max(0,(Number(p.budget)||0)-(projIncH[normCN(p.contractNo)]||0)),0);
                    return <>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Дебиторка (по проектам)</div>
                        <div style={{fontSize:20,fontWeight:900,color:"#fbbf24"}}>{fM(Math.round(debtH))} ₸</div>
                      </div>
                      <div style={{width:1,height:36,background:"rgba(255,255,255,.15)"}}/>
                    </>;
                  })()}
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Всего на счетах</div>
                    <div style={{fontSize:24,fontWeight:900,color:totalBalance>=0?"#34d399":"#f87171"}}>{fM(totalBalance)} ₸</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Табы */}
            <div className="fin-tabs" style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
              {[["dashboard","📊 Дашборд"],["dds","💸 ДДС месяц"],["opu","📈 ОПУ месяц"],["balance","⚖️ Баланс"],["ops","📋 Операции"],["projects","🏗 Проекты"],...(canFinanceDirectories?[ ["ref","⚙️ Справочник"] ]:[])].map(([k,l])=>(
                <button key={k} onClick={()=>navigate(undefined, k)} style={{fontSize:13,fontWeight:700,padding:"9px 16px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(financeTab===k?"#2563eb":"#e2e8f0"),background:financeTab===k?"#2563eb":"#fff",color:financeTab===k?"#fff":"#64748b"}}>{l}</button>
              ))}
            </div>

            {/* Фильтр периода (для дашборда и операций) */}
            {financeTab!=="ref" && financeTab!=="projects" && (
              <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
                {PERIODS.map(([k,l])=>(
                  <button key={k} onClick={()=>setFinPeriod(k)} style={{fontSize:12,fontWeight:600,padding:"6px 13px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(finPeriod===k?"#2563eb":"#e2e8f0"),background:finPeriod===k?"#eff6ff":"#fff",color:finPeriod===k?"#2563eb":"#94a3b8"}}>{l}</button>
                ))}
                {finPeriod==="custom" && (<>
                  <input type="date" className="fi" style={{width:"auto"}} value={finFrom} onChange={e=>setFinFrom(e.target.value)}/>
                  <input type="date" className="fi" style={{width:"auto"}} value={finTo} onChange={e=>setFinTo(e.target.value)}/>
                </>)}
              </div>
            )}

            {/* ───── ДАШБОРД ───── */}
            {financeTab==="dashboard" && (()=>{
              // ── P&L (совпадает с ОПУ) ──
              const S_DIV="Дивиденды учредителям";
              const divTx = periodTx.filter(t=>t.type==="expense"&&t.subcategory===S_DIV);
              const divSum = divTx.reduce((s,t)=>s+(Number(t.amount)||0),0);
              const divByRecipient = {};
              divTx.forEach(t=>{ const r=t.recipient||"Не указан"; divByRecipient[r]=(divByRecipient[r]||0)+(Number(t.amount)||0); });
              // Выручка без авансов и без финансирования (займы/вклады/возврат активов — не выручка)
              const incSumNoAdv = periodTx.filter(t=>t.type==="income"&&!t.isAdvance&&t.category!==C_FINANCING_INC&&t.category!==C_ASSET_INC).reduce((s,t)=>s+(Number(t.amount)||0),0);
              // Расходы P&L: без дивидендов, без финансовой деятельности и выданных займов/активов (они не расход); CapEx — расход кассовым методом
              const expNoDivSum = periodTx.filter(t=>t.type==="expense"&&t.subcategory!==S_DIV&&t.category!==C_FINACT&&t.category!==C_ASSET_OUT).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const netP = incSumNoAdv - expNoDivSum;
              const rentab = incSumNoAdv>0?Math.round(netP/incSumNoAdv*100):0;

              // ── Доходы по категориям объектов (для кругового) ──
              const incBySub = {};
              periodTx.filter(t=>t.type==="income"&&!t.isAdvance).forEach(t=>{
                const k = t.subcategory||t.category||"Прочее";
                incBySub[k]=(incBySub[k]||0)+(Number(t.amount)||0);
              });
              const incSlices=Object.entries(incBySub).sort((a,b)=>b[1]-a[1]);

              // ── Расходы по подкатегориям (дивиденды разбиваем по получателям) ──
              const expBySub = {};
              periodTx.filter(t=>t.type==="expense").forEach(t=>{
                if(t.subcategory==="Дивиденды учредителям" && t.recipient){
                  const k="Дивиденды: "+t.recipient;
                  expBySub[k]=(expBySub[k]||0)+(Number(t.amount)||0);
                } else {
                  const k = t.subcategory||t.category||"Прочее";
                  expBySub[k]=(expBySub[k]||0)+(Number(t.amount)||0);
                }
              });
              const expSlices=Object.entries(expBySub).sort((a,b)=>b[1]-a[1]);

              // ── Кольцевая диаграмма (donut) ──
              const PIE_COLORS=["#2563eb","#059669","#f59e0b","#8b5cf6","#dc2626","#0891b2","#d97706","#e11d48","#84cc16","#06b6d4","#ec4899","#14b8a6"];
              const Donut=({slices,total,size=170,thickness=24,centerLabel})=>{
                const r=(size-thickness)/2, cx=size/2, circ=2*Math.PI*r;
                if(!total||slices.length===0) return <div style={{width:size,height:size,borderRadius:"50%",border:"24px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#cbd5e1",boxSizing:"border-box"}}>нет данных</div>;
                let offset=0;
                return (
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
                    <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness}/>
                    <g transform={`rotate(-90 ${cx} ${cx})`}>
                      {slices.slice(0,12).map(([label,v],i)=>{
                        const len=(v/total)*circ;
                        const el=<circle key={label} cx={cx} cy={cx} r={r} fill="none" stroke={PIE_COLORS[i%PIE_COLORS.length]} strokeWidth={thickness} strokeDasharray={`${len} ${circ-len}`} strokeDashoffset={-offset} strokeLinecap="butt"><title>{label}: {fM(v)} ₸</title></circle>;
                        offset+=len; return el;
                      })}
                    </g>
                    <text x={cx} y={cx-2} textAnchor="middle" fontSize={size>150?16:13} fontWeight="800" fill="#0f172a">{fM(total)}</text>
                    <text x={cx} y={cx+15} textAnchor="middle" fontSize={10} fill="#94a3b8">{centerLabel||"₸ всего"}</text>
                  </svg>
                );
              };

              const cardSt={background:"#fff",border:"1px solid #eef2f7",borderRadius:18,boxShadow:"0 1px 2px rgba(15,23,42,.04),0 12px 32px -16px rgba(15,23,42,.14)"};
              const CardSection=({title,accent,children,full})=>(
                <div style={{...cardSt,overflow:"hidden",gridColumn:full?"1 / -1":"auto"}}>
                  <div style={{height:4,background:accent||"#2563eb"}}/>
                  <div style={{padding:"16px 20px"}}>
                    <div style={{fontSize:13.5,fontWeight:800,color:"#0f172a",marginBottom:14,letterSpacing:-.2}}>{title}</div>
                    {children}
                  </div>
                </div>
              );
              const KpiRow=({label,val,color,bold,big})=>(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:bold?"9px 0":"6px 0",borderBottom:"1px solid #f5f7fa",gap:8}}>
                  <span style={{fontSize:bold?13:12.5,color:bold?"#0f172a":"#64748b",fontWeight:bold?700:500}}>{label}</span>
                  <span style={{fontSize:big?20:(bold?15:13.5),fontWeight:bold?800:600,color:color||"#0f172a",whiteSpace:"nowrap"}}>
                    {typeof val==="number"?fM(val)+" ₸":val}
                  </span>
                </div>
              );
              const LegendItem=({label,val,total,color})=>{ const p=total>0?Math.round(val/total*100):0; return (
                <div style={{marginBottom:9}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3,gap:8}}>
                    <span style={{display:"flex",alignItems:"center",gap:7,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><span style={{width:9,height:9,borderRadius:3,background:color,flexShrink:0}}/>{label}</span>
                    <span style={{fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>{fM(val)} <span style={{color,fontSize:11}}>· {p}%</span></span>
                  </div>
                  <div style={{height:5,background:"#f1f5f9",borderRadius:5}}><div style={{height:"100%",width:p+"%",background:color,borderRadius:5,transition:"width .4s"}}/></div>
                </div>
              );};

              return (
                <div style={{marginBottom:20}}>
                  {/* ── Верхний ряд: 3 сводных карточки ── */}
                  <div className="fin-dash-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:16}}>
                    {/* Прибыль */}
                    <CardSection title="💎 Прибыль, ₸" accent="#2563eb">
                      <KpiRow label="Выручка (без авансов)" val={incSumNoAdv} color="#059669"/>
                      <KpiRow label="Расходы (без дивид.)" val={expNoDivSum} color="#dc2626"/>
                      <KpiRow label="Дивиденды" val={divSum} color="#d97706"/>
                      {Object.entries(divByRecipient).filter(([r])=>r!=="Не указан").map(([r,v])=>(
                        <div key={r} style={{display:"flex",justifyContent:"space-between",padding:"3px 0 3px 14px",borderBottom:"1px solid #f5f7fa",gap:8}}>
                          <span style={{fontSize:11.5,color:"#94a3b8"}}>↳ {r}</span>
                          <span style={{fontSize:12,fontWeight:600,color:"#d97706",whiteSpace:"nowrap"}}>{fM(v)} ₸</span>
                        </div>
                      ))}
                      <KpiRow label="Чистая прибыль" val={netP} color={netP>=0?"#2563eb":"#dc2626"} bold big/>
                      <KpiRow label="Рентабельность" val={rentab+"%"} color={rentab>=0?"#7c3aed":"#dc2626"} bold/>
                    </CardSection>

                    {/* Денежный поток */}
                    <CardSection title="💸 Денежный поток, ₸" accent="#0891b2">
                      <KpiRow label="Поступления (вкл. авансы)" val={incomeSum} color="#059669"/>
                      <KpiRow label="Выплаты" val={expenseSum} color="#dc2626"/>
                      <KpiRow label="Разница" val={incomeSum-expenseSum} color={(incomeSum-expenseSum)>=0?"#0891b2":"#dc2626"} bold big/>
                      <div style={{marginTop:12,padding:"10px 12px",background:"#f8fafc",borderRadius:10,fontSize:11.5,color:"#64748b",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>Сальдо по всем счетам</span><b style={{color:"#0f172a",fontSize:13}}>{fM(totalBalance)} ₸</b>
                      </div>
                    </CardSection>

                    {/* Остатки */}
                    <CardSection title="💳 Остатки на счетах, ₸" accent="#7c3aed">
                      {accounts.map(a=>(
                        <div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f5f7fa"}}>
                          <span style={{fontSize:12.5,color:"#64748b"}}>{a.name}</span>
                          <span style={{fontSize:13.5,fontWeight:700,color:(balances[a.name]||0)>=0?"#0f172a":"#dc2626"}}>{fM(balances[a.name]||0)} ₸</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",paddingTop:10}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>ИТОГО</span>
                        <span style={{fontSize:20,fontWeight:800,color:totalBalance>=0?"#7c3aed":"#dc2626"}}>{fM(totalBalance)} ₸</span>
                      </div>
                    </CardSection>
                  </div>

                  {/* ── Структура платежей: Доходы (отдельный ряд) ── */}
                  <div style={{marginBottom:16}}>
                    <CardSection title="📊 Структура платежей — Доходы, ₸" accent="#059669" full>
                      <div style={{display:"flex",gap:28,alignItems:"center",flexWrap:"wrap"}}>
                        <Donut slices={incSlices} total={incomeSum} centerLabel="доходы"/>
                        <div style={{flex:1,minWidth:280,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"0 28px"}}>
                          {incSlices.slice(0,12).map(([k,v],i)=><LegendItem key={k} label={k} val={v} total={incomeSum} color={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                        </div>
                      </div>
                    </CardSection>
                  </div>

                  {/* ── Структура платежей: Расходы (отдельный ряд) ── */}
                  <div style={{marginBottom:16}}>
                    <CardSection title="📊 Структура платежей — Расходы, ₸" accent="#dc2626" full>
                      <div style={{display:"flex",gap:28,alignItems:"center",flexWrap:"wrap"}}>
                        <Donut slices={expSlices} total={expenseSum} centerLabel="расходы"/>
                        <div style={{flex:1,minWidth:280,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"0 28px"}}>
                          {expSlices.slice(0,12).map(([k,v],i)=><LegendItem key={k} label={k} val={v} total={expenseSum} color={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                        </div>
                      </div>
                    </CardSection>
                  </div>

                  {/* ── Динамика по месяцам (линейный график) ── */}
                  <div style={{background:"#0f172a",borderRadius:16,padding:"16px 18px",marginBottom:12,boxShadow:"0 8px 32px rgba(0,0,0,.25)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:14}}>
                      <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>📈 Динамика по месяцам</div>
                      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        {[["#10b981","Выручка"],["#0891b2","Вал. приб."],["#8b5cf6","Чистая приб."]].map(([c,l])=>(
                          <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#64748b"}}>
                            <span style={{width:16,height:2,background:c,borderRadius:2,display:"inline-block"}}/>
                            <span style={{color:"#64748b"}}>{l}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    {months.length===0 && <div style={{color:"#334155",fontSize:13,padding:"24px 0",textAlign:"center"}}>Нет данных за период</div>}
                    {months.length>0 && (()=>{
                      const W=720, H=160, PL=56, PR=16, PT=12, PB=28;
                      const cW=W-PL-PR, cH=H-PT-PB, n=months.length;
                      const fmtY = v => v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?Math.round(v/1000)+"k":"0";
                      const xOf = i => PL+(n===1?cW/2:i/(n-1)*cW);
                      const yOf = v => PT+cH-(Math.max(0,v)/maxMonth)*cH;
                      const mkBezier = pts => {
                        if(!pts.length) return "";
                        if(pts.length===1) return `M${pts[0][0]},${pts[0][1]}`;
                        let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
                        for(let i=0;i<pts.length-1;i++){
                          const [x0,y0]=pts[i],[x1,y1]=pts[i+1],cpx=(x0+x1)/2;
                          d+=` C${cpx.toFixed(1)},${y0.toFixed(1)} ${cpx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
                        }
                        return d;
                      };
                      const LINES=[
                        {fn:d=>d.inc,       color:"#10b981", gid:"lg1", op1:.3, op2:.02},
                        {fn:d=>d.inc-d.cogs,color:"#38bdf8", gid:"lg2", op1:.2, op2:.0},
                        {fn:d=>d.inc-d.exp, color:"#a78bfa", gid:"lg3", op1:.2, op2:.0},
                      ];
                      const yTicks=[0,.25,.5,.75,1].map(r=>({y:PT+cH*(1-r),v:Math.round(maxMonth*r)}));
                      return (
                        <div style={{overflowX:"auto"}}>
                          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:280,display:"block"}}>
                            <defs>
                              {LINES.map(({color,gid,op1,op2})=>(
                                <linearGradient key={gid} id={gid} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={color} stopOpacity={op1}/>
                                  <stop offset="100%" stopColor={color} stopOpacity={op2}/>
                                </linearGradient>
                              ))}
                            </defs>
                            {/* grid */}
                            {yTicks.map((t,i)=>(
                              <g key={i}>
                                <line x1={PL} y1={t.y} x2={W-PR} y2={t.y} stroke={i===0?"#1e293b":"#172033"} strokeWidth="1" strokeDasharray={i===0?"":"4 4"}/>
                                <text x={PL-6} y={t.y+4} fontSize="10" fill="#475569" textAnchor="end">{fmtY(t.v)}</text>
                              </g>
                            ))}
                            {/* area fills */}
                            {LINES.map(({fn,gid},li)=>{
                              const pts=months.map((m,i)=>[xOf(i),yOf(fn(monthMap[m]))]);
                              const bp=mkBezier(pts);
                              if(!bp) return null;
                              const area=bp+` L${xOf(n-1).toFixed(1)},${PT+cH} L${xOf(0).toFixed(1)},${PT+cH} Z`;
                              return <path key={li} d={area} fill={`url(#${gid})`}/>;
                            })}
                            {/* lines */}
                            {LINES.map(({fn,color},li)=>{
                              const pts=months.map((m,i)=>[xOf(i),yOf(fn(monthMap[m]))]);
                              return <path key={li} d={mkBezier(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/>;
                            })}
                            {/* dots */}
                            {LINES.map(({fn,color},li)=>months.map((m,i)=>{
                              const v=fn(monthMap[m]); const [yr,mo]=m.split("-");
                              return <circle key={`${li}-${i}`} cx={xOf(i)} cy={yOf(v)} r="3" fill={color} stroke="#0f172a" strokeWidth="1.5">
                                <title>{MNAMES[parseInt(mo)-1]} {yr}: {fM(Math.round(v))} ₸</title>
                              </circle>;
                            }))}
                            {/* x labels */}
                            {months.map((m,i)=>{
                              const [yr,mo]=m.split("-");
                              return <text key={m} x={xOf(i)} y={H-4} fontSize="10" fill="#475569" textAnchor="middle">{MNAMES[parseInt(mo)-1]} {yr.slice(2)}</text>;
                            })}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ── График по проектам ── */}
                  <div style={{background:"#0f172a",borderRadius:16,padding:"16px 18px",marginBottom:12,boxShadow:"0 8px 32px rgba(0,0,0,.25)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:14}}>
                      <div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>📦 Проекты по месяцам</div>
                      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                        {[["#3b82f6","План"],["#10b981","Факт"],["#f59e0b","Вал. приб."]].map(([c,l])=>(
                          <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10}}>
                            <span style={{width:10,height:10,background:c,borderRadius:2,display:"inline-block",opacity:.9}}/>
                            <span style={{color:"#64748b"}}>{l}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    {(()=>{
                      const _now = Date.now(), _maxTs = _now + 90*24*3600*1000, _minTs = _now - 3*365*24*3600*1000;
                      const pmKey = p => {
                        const ts = p.createdAt ? new Date(p.createdAt).getTime() : 0;
                        if(!ts||ts>_maxTs||ts<_minTs) return null;
                        const d=new Date(ts); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
                      };
                      const _normCn = s => (s||"").replace(/[№\s]/g,"").trim();
                      const txByContract = {};
                      financeTx.forEach(t=>{ if(t.deletedAt||t.included===false||t.type==="transfer"||!t.contractNo) return;
                        const k=_normCn(t.contractNo);
                        if(!txByContract[k]) txByContract[k]={inc:0,cogs:0};
                        const amt=Number(t.amount)||0;
                        if(t.type==="income") txByContract[k].inc+=amt;
                        else if(t.type==="expense"&&t.category===_C_COGS) txByContract[k].cogs+=amt;
                      });
                      const pMonthMap = {};
                      finProjects.filter(isCountedFinanceProject).forEach(p=>{ const k=pmKey(p); if(!k) return;
                        if(!pMonthMap[k]) pMonthMap[k]={count:0,budget:0,inc:0,gross:0};
                        const cx = txByContract[_normCn(p.contractNo)] || {inc:0,cogs:0};
                        pMonthMap[k].count++;
                        pMonthMap[k].budget+=(Number(p.budget)||0);
                        pMonthMap[k].inc+=cx.inc;
                        pMonthMap[k].gross+=Math.max(0,cx.inc-cx.cogs);
                      });
                      const pMonths = Object.keys(pMonthMap).sort().slice(-18);
                      if(pMonths.length===0) return <div style={{color:"#334155",fontSize:13,padding:"32px 0",textAlign:"center"}}>Нет данных по проектам</div>;
                      const pMax = Math.max(1,...pMonths.map(m=>Math.max(pMonthMap[m].budget,pMonthMap[m].inc)));
                      const fmtM = v => v>=1000000?(v/1000000).toFixed(1)+"M":v>=1000?Math.round(v/1000)+"k":"0";
                      const W=720, H=160, PL=56, PR=16, PT=10, PB=28;
                      const cW=W-PL-PR, cH=H-PT-PB, nm=pMonths.length;
                      const slotW=cW/nm;
                      const BAR_W=Math.max(8,Math.min(28,slotW*0.28));
                      const yOf=v=>PT+cH-(Math.max(0,v)/pMax)*cH;
                      const yTicks=[0,.25,.5,.75,1].map(r=>({y:PT+cH*(1-r),v:Math.round(pMax*r)}));
                      return (
                        <div style={{overflowX:"auto"}}>
                          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:360,display:"block"}}>
                            <defs>
                              <linearGradient id="pg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".9"/><stop offset="100%" stopColor="#1d4ed8" stopOpacity=".7"/></linearGradient>
                              <linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity=".9"/><stop offset="100%" stopColor="#059669" stopOpacity=".7"/></linearGradient>
                              <linearGradient id="pg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" stopOpacity=".9"/><stop offset="100%" stopColor="#d97706" stopOpacity=".7"/></linearGradient>
                            </defs>
                            {/* grid */}
                            {yTicks.map((t,i)=>(
                              <g key={i}>
                                <line x1={PL} y1={t.y} x2={W-PR} y2={t.y} stroke={i===0?"#1e293b":"#172033"} strokeWidth="1" strokeDasharray={i===0?"":"4 4"}/>
                                <text x={PL-6} y={t.y+4} fontSize="10" fill="#475569" textAnchor="end">{fmtM(t.v)}</text>
                              </g>
                            ))}
                            {/* bars */}
                            {pMonths.map((m,idx)=>{
                              const d=pMonthMap[m]; const [yr,mo]=m.split("-");
                              const cx=PL+idx*slotW+slotW/2;
                              const bud=d.budget, inc=d.inc, gro=d.gross;
                              const yB=yOf(bud), yI=yOf(inc), yG=yOf(gro);
                              const hB=Math.max(1,PT+cH-yB), hI=Math.max(0,PT+cH-yI), hG=Math.max(0,PT+cH-yG);
                              const offsets=[-BAR_W-2, 0, BAR_W+2];
                              return (
                                <g key={m}>
                                  {/* budget bar */}
                                  <rect x={cx+offsets[0]-BAR_W/2} y={yB} width={BAR_W} height={hB} rx="3" fill="url(#pg1)">
                                    <title>Объём продаж: {fM(Math.round(bud))} ₸</title>
                                  </rect>
                                  {/* income bar */}
                                  {hI>0&&<rect x={cx+offsets[1]-BAR_W/2} y={yI} width={BAR_W} height={hI} rx="3" fill="url(#pg2)">
                                    <title>Факт: {fM(Math.round(inc))} ₸</title>
                                  </rect>}
                                  {/* gross bar */}
                                  {hG>0&&<rect x={cx+offsets[2]-BAR_W/2} y={yG} width={BAR_W} height={hG} rx="3" fill="url(#pg3)">
                                    <title>Вал. прибыль: {fM(Math.round(gro))} ₸</title>
                                  </rect>}
                                  {/* count badge */}
                                  <text x={cx} y={Math.min(yB,yI>0?yI:yB)-6} fontSize="9.5" fill="#64748b" textAnchor="middle" fontWeight="600">{d.count} пр.</text>
                                  {/* x label */}
                                  <text x={cx} y={H-4} fontSize="10" fill="#475569" textAnchor="middle">{MNAMES[parseInt(mo)-1]} {yr.slice(2)}</text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* ───── ДДС: ОТЧЁТ О ДВИЖЕНИИ ДЕНЕЖНЫХ СРЕДСТВ ───── */}
            {financeTab==="dds" && (()=>{
              const MN=["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
              const tsKey = ts => { const d=new Date(ts); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
              const mLabel = k => { const [y,m]=k.split("-"); return MN[parseInt(m)-1]+" "+y.slice(2); };
              // месяцы внутри выбранного периода
              const monthsSet={};
              financeTx.forEach(t=>{ if(t.deletedAt||t.included===false)return; const ts=t.date||t.createdAt||0; if(inPeriod(ts)) monthsSet[tsKey(ts)]=true; });
              const months=Object.keys(monthsSet).sort();
              // САЛЬДО НАЧАЛЬНОЕ на старте периода = opening + чистый поток всех операций до первого месяца
              const startBal0 = accounts.reduce((s,a)=>s+(Number(a.opening)||0),0);
              const firstMonth = months[0];
              let saldoStart = startBal0;
              if(firstMonth){
                financeTx.forEach(t=>{ if(t.deletedAt||t.included===false)return; const ts=t.date||t.createdAt||0; if(tsKey(ts) < firstMonth){ if(t.type==="income") saldoStart+=Number(t.amount)||0; else if(t.type==="expense") saldoStart-=Number(t.amount)||0; } });
              }
              // агрегатор: по типу/категории/подкатегории и по месяцам
              const agg = (pred) => { const byM={}; let tot=0; months.forEach(m=>byM[m]=0);
                financeTx.forEach(t=>{ if(t.deletedAt||t.included===false)return; const ts=t.date||t.createdAt||0; if(!inPeriod(ts)||!pred(t))return; const m=tsKey(ts); if(m in byM){byM[m]+=Number(t.amount)||0; tot+=Number(t.amount)||0;} });
                return {byM,tot};
              };
              const incTotal = agg(t=>t.type==="income");
              const expTotal = agg(t=>t.type==="expense");
              // ── классификация операций по видам деятельности (IAS 7) ──
              const S_DIV="Дивиденды учредителям";
              const actOf = t => {
                const s=((t.subcategory||"")+" "+(t.category||""));
                // Инвестиционный поток: ОС, долгосрочные активы (НМА, долг займы, фин вложения)
                if(t.category===C_INVEST || /оборудован|основн\w* средств|покупка авто|автомобил|капитальн|станок|техник|мебел|инвентар|транспорт/i.test(s)) return "inv";
                if(t.category===C_ASSET_INC || t.category===C_ASSET_OUT) {
                  // Долгосрочные вложения → инвест; краткосрочные и залоги → операц
                  const sub=t.subcategory||"";
                  if(/долг|от 1 года|фин.*влож|нма|нематериальн/i.test(sub)) return "inv";
                  return "op";
                }
                // Финансовый поток: займы полученные/возвраты, кредиты, вклады учредителей, дивиденды
                if(t.category===C_FINANCING_INC || t.category===C_FINACT || t.subcategory===S_DIV || /займ|кредит|ссуд|учредител|дивиденд|вклад/i.test(s)) return "fin";
                return "op";
              };
              const incCats=(financeMeta.income||[]), expCats=(financeMeta.expense||[]);
              const actInc=(act)=>agg(t=>t.type==="income"&&actOf(t)===act);
              const actExp=(act)=>agg(t=>t.type==="expense"&&actOf(t)===act);
              const actNet=(act)=>{const i=actInc(act),e=actExp(act);const byM={};months.forEach(m=>byM[m]=(i.byM[m]||0)-(e.byM[m]||0));return {byM,tot:i.tot-e.tot};};
              const ACTS=[
                {key:"op",label:"Операционная деятельность",desc:"клиенты, поставщики, зарплаты, налоги",color:"#0891b2",bg:"#ecfeff"},
                {key:"inv",label:"Инвестиционная деятельность",desc:"покупка / продажа оборудования и активов",color:"#7c3aed",bg:"#f5f3ff"},
                {key:"fin",label:"Финансовая деятельность",desc:"займы, дивиденды, вклады учредителей",color:"#d97706",bg:"#fffbeb"},
              ];
              const nCols=months.length+2;
              // нарастающее сальдо конечное
              const saldoEnd={}; let run=saldoStart;
              months.forEach(m=>{ run+=(incTotal.byM[m]||0)-(expTotal.byM[m]||0); saldoEnd[m]=run; });
              const fmt = v => v ? fM(v) : "—";
              const sumStyle=(v)=>({textAlign:"right",fontWeight:700,color:v>=0?"#0f172a":"#dc2626"});
              // строки-помощники
              const goOps=(cat,sub)=>{ navigate(undefined,"ops",{finFilterCat:cat||"",finFilterCategory:sub||"",finFilterContract:""}); };
              const groupRow=(label,ser,color,cat)=>(
                <tr key={"g-"+label} onClick={()=>goOps(cat||label,"")} style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{paddingLeft:24,fontWeight:700,color:"#334155"}}>{label} <span style={{fontSize:9,color:"#cbd5e1",marginLeft:4}}>↗</span></td>
                  {months.map(m=><td key={m} style={{textAlign:"right",color,fontWeight:600}}>{fmt(ser.byM[m])}</td>)}
                  <td className="colTot" style={{textAlign:"right",fontWeight:800,color}}>{fmt(ser.tot)}</td>
                </tr>
              );
              const subRow=(label,ser,cat)=>(
                <tr key={"s-"+label} onClick={()=>goOps(cat||"",label)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{paddingLeft:40,color:"#64748b",fontSize:11.5}}>{label} <span style={{fontSize:9,color:"#cbd5e1",marginLeft:4}}>↗</span></td>
                  {months.map(m=><td key={m} style={{textAlign:"right",color:"#94a3b8",fontSize:11.5}}>{fmt(ser.byM[m])}</td>)}
                  <td className="colTot" style={{textAlign:"right",color:"#64748b",fontSize:11.5}}>{fmt(ser.tot)}</td>
                </tr>
              );
              return (
                <div className="card" style={{padding:"18px 20px",width:"100%",boxSizing:"border-box"}}>
                  <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:4}}>💸 Отчёт о движении денежных средств (ДДС)</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Прямой метод · кассовый принцип · разбивка по видам деятельности (IAS 7) · {months.length} мес.</div>
                  {months.length===0 ? <div style={{color:"#94a3b8",textAlign:"center",padding:30}}>Нет данных за период</div> : (
                  <div className="rep-wrap">
                  <table className="rep-table">
                    <thead><tr>
                      <th>Статья</th>
                      {months.map(m=><th key={m} style={{textAlign:"right"}}>{mLabel(m)}</th>)}
                      <th className="colTot" style={{textAlign:"right"}}>Итого</th>
                    </tr></thead>
                    <tbody>
                      <tr onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={{fontWeight:700,color:"#475569"}}>Сальдо на начало</td>{months.map((m,i)=><td key={m} style={sumStyle(i===0?saldoStart:saldoEnd[months[i-1]])}>{fM(i===0?saldoStart:saldoEnd[months[i-1]])}</td>)}<td className="colTot" style={sumStyle(saldoStart)}>{fM(saldoStart)}</td></tr>
                      {ACTS.map(act=>{
                        const inc=actInc(act.key), exp=actExp(act.key), net=actNet(act.key);
                        if(inc.tot===0 && exp.tot===0) return null;
                        const incG=incCats.map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="income"&&t.category===c.cat&&actOf(t)===act.key)})).filter(g=>g.tot!==0);
                        const expG=expCats.map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="expense"&&t.category===c.cat&&actOf(t)===act.key)})).filter(g=>g.tot!==0);
                        return (<Fragment key={act.key}>
                          <tr className="rep-section"><td colSpan={nCols}>{act.label} <span style={{fontWeight:400,letterSpacing:0,textTransform:"none",fontSize:11,color:"#cbd5e1"}}>· {act.desc}</span></td></tr>
                          {incG.length>0 && <tr><td colSpan={nCols} style={{paddingLeft:18,paddingTop:4,paddingBottom:2,fontWeight:600,color:"#64748b",fontSize:11.5}}>Поступления</td></tr>}
                          {incG.map(g=>(<Fragment key={g.cat}>{groupRow(g.cat,g,"#1e293b",g.cat)}{g.subs.map(sub=>{const s=agg(t=>t.type==="income"&&t.category===g.cat&&t.subcategory===sub&&actOf(t)===act.key); return s.tot===0?null:subRow(sub,s,g.cat);})}</Fragment>))}
                          {expG.length>0 && <tr><td colSpan={nCols} style={{paddingLeft:18,paddingTop:4,paddingBottom:2,fontWeight:600,color:"#64748b",fontSize:11.5}}>Платежи</td></tr>}
                          {expG.map(g=>(<Fragment key={g.cat}>{groupRow(g.cat,g,"#dc2626",g.cat)}{g.subs.map(sub=>{const s=agg(t=>t.type==="expense"&&t.category===g.cat&&t.subcategory===sub&&actOf(t)===act.key); if(s.tot===0)return null; if(sub===S_DIV){const drec={}; financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&t.subcategory===S_DIV&&t.recipient&&actOf(t)===act.key).forEach(t=>{const r=t.recipient,m=tsKey(t.date||t.createdAt||0);if(!months.includes(m))return;if(!drec[r]){drec[r]={byM:{},tot:0};months.forEach(mo=>{drec[r].byM[mo]=0;});}drec[r].byM[m]=(drec[r].byM[m]||0)+(Number(t.amount)||0);drec[r].tot+=(Number(t.amount)||0);}); return(<Fragment key={sub}>{subRow(sub,s,g.cat)}{Object.entries(drec).map(([r,ser])=>(<tr key={"dr-"+r}><td style={{paddingLeft:56,color:"#94a3b8",fontSize:11}}>↳ {r}</td>{months.map(m=><td key={m} style={{textAlign:"right",color:"#94a3b8",fontSize:11}}>{ser.byM[m]>0?fmt(ser.byM[m]):"—"}</td>)}<td className="colTot" style={{textAlign:"right",color:"#94a3b8",fontSize:11}}>{fmt(ser.tot)}</td></tr>))}</Fragment>);} return subRow(sub,s,g.cat);})}</Fragment>))}
                          <tr className="rep-metric"><td>Чистый поток · {act.label.toLowerCase()}</td>{months.map(m=><td key={m} style={{color:(net.byM[m]||0)<0?"#dc2626":undefined}}>{(net.byM[m]||0)>=0?"+":""}{fmt(net.byM[m])}</td>)}<td className="colTot" style={{color:net.tot<0?"#dc2626":undefined}}>{net.tot>=0?"+":""}{fmt(net.tot)}</td></tr>
                        </Fragment>);
                      })}
                      <tr className="rep-metric" style={{borderTop:"2px solid #cbd5e1"}}><td style={{fontWeight:900}}>ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК</td>{months.map(m=>{const v=(incTotal.byM[m]||0)-(expTotal.byM[m]||0);return <td key={m} style={{color:v<0?"#dc2626":undefined}}>{v>=0?"+":""}{fmt(v)}</td>;})}<td className="colTot" style={{color:(incTotal.tot-expTotal.tot)<0?"#dc2626":undefined}}>{(incTotal.tot-expTotal.tot)>=0?"+":""}{fmt(incTotal.tot-expTotal.tot)}</td></tr>
                      <tr className="rep-metric"><td style={{fontWeight:900}}>Сальдо на конец</td>{months.map(m=><td key={m} style={{...sumStyle(saldoEnd[m])}}>{fM(saldoEnd[m])}</td>)}<td className="colTot" style={{...sumStyle(run)}}>{fM(run)}</td></tr>
                    </tbody>
                  </table>
                  </div>)}
                </div>
              );
            })()}

            {/* ───── ОПУ: ОТЧЁТ О ПРИБЫЛЯХ И УБЫТКАХ ───── */}
            {financeTab==="opu" && (()=>{
              const MN=["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
              const mLabel=k=>{const[y,m]=k.split("-");return MN[parseInt(m)-1]+" "+y.slice(2);};
              const ymOf = d => { if(!d) return null; const dt=new Date(d); if(isNaN(dt)) return null; return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0"); };
              // ── ДОХОД (признание по этапам): оплата клиента = сдача этапа, в месяце оплаты ──
              const opMonth = t => { const d=new Date(t.date||t.createdAt||0); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); };
              const inPM = m => m && inPeriod(new Date(m+"-01").getTime());
              // единый список строк ОПУ: доходы и расходы по дате операции (этап сдан / расход понесён)
              // финансирование (займы/вклады) и возвраты займов/активов — НЕ P&L, исключаем из ОПУ
              // CapEx (покупка ОС) — кассовый метод: расход в ОПУ; выданные займы/залоги — актив, не расход
              const isFinInc = t => t.category===C_FINANCING_INC || t.category===C_ASSET_INC;
              const isNonPL = t => t.category===C_FINACT || t.category===C_ASSET_OUT;
              const opuRows=[
                ...financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&!t.isAdvance&&!isFinInc(t)).map(t=>({type:"income",category:t.category,subcategory:t.subcategory,amount:Number(t.amount)||0,month:opMonth(t)})),
                ...financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&(t.isAdvance||isFinInc(t))).map(t=>({type:"advance",category:t.category,subcategory:t.subcategory,amount:Number(t.amount)||0,month:opMonth(t)})),
                ...financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&!isNonPL(t)).map(t=>({type:"expense",category:t.category,subcategory:t.subcategory,amount:Number(t.amount)||0,month:opMonth(t)})),
              ];
              const monthsSet={};
              opuRows.forEach(r=>{ if(inPM(r.month)) monthsSet[r.month]=true; });
              const months=Object.keys(monthsSet).sort();
              const agg=(pred)=>{ const byM={}; let tot=0; months.forEach(m=>byM[m]=0);
                opuRows.forEach(r=>{ if(!inPM(r.month)||!pred(r))return; if(r.month in byM){byM[r.month]+=r.amount; tot+=r.amount;} });
                return {byM,tot};
              };
              const income=agg(t=>t.type==="income");
              const adv=agg(t=>t.type==="advance");
              const expTotalA=agg(t=>t.type==="expense");
              const incGroups=(financeMeta.income||[]).map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="income"&&t.category===c.cat)}));
              const expGroups=(financeMeta.expense||[]).map(c=>({cat:c.cat,subs:c.subs||[],...agg(t=>t.type==="expense"&&t.category===c.cat)}));
              const profitByM={}; months.forEach(m=>profitByM[m]=(income.byM[m]||0)-(expTotalA.byM[m]||0));
              const totProfit=income.tot-expTotalA.tot;
              // ── метрики P&L по международным стандартам ──
              const C_COGS="Прямые расходы (COGS / себестоимость)", C_OPEX="Косвенные расходы (OPEX / операционные)", C_FIN="Финансовые расходы";
              const S_DIV="Дивиденды учредителям"; // распределение прибыли, не расход
              const cogs=agg(t=>t.type==="expense"&&t.category===C_COGS);
              const opex=agg(t=>t.type==="expense"&&t.category===C_OPEX);
              const finc=agg(t=>t.type==="expense"&&t.category===C_FIN&&t.subcategory!==S_DIV); // фин.расходы без дивидендов
              const div=agg(t=>t.type==="expense"&&t.category===C_FIN&&t.subcategory===S_DIV);  // дивиденды
              // разбивка дивидендов по получателям для ОПиУ
              const divByRecOpu = {};
              financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&t.subcategory===S_DIV&&t.recipient).forEach(t=>{
                const r=t.recipient; const m=opMonth(t); if(!inPM(m)) return;
                if(!divByRecOpu[r]){divByRecOpu[r]={byM:{},tot:0}; months.forEach(mo=>{divByRecOpu[r].byM[mo]=0;});}
                divByRecOpu[r].byM[m]=(divByRecOpu[r].byM[m]||0)+(Number(t.amount)||0);
                divByRecOpu[r].tot+=(Number(t.amount)||0);
              });
              const sub=(a,b)=>{ const byM={}; months.forEach(m=>byM[m]=(a.byM[m]||0)-(b.byM[m]||0)); return {byM,tot:a.tot-b.tot}; };
              const gross=sub(income,cogs);          // Валовая прибыль = Выручка − COGS
              const ebitda=sub(gross,opex);          // EBITDA / Операционная прибыль = ВП − OPEX
              const net=sub(ebitda,finc);            // Чистая прибыль = EBITDA − Фин.расходы
              const retained=sub(net,div);           // Нераспределённая прибыль = Чистая − Дивиденды
              const pctRow=(num)=>{ const byM={}; months.forEach(m=>byM[m]=income.byM[m]>0?Math.round(num.byM[m]/income.byM[m]*100):null); return {byM,tot:income.tot>0?Math.round(num.tot/income.tot*100):null}; };
              const grossM=pctRow(gross), ebitdaM=pctRow(ebitda), netM=pctRow(net);
              const fmt=v=>v?fM(v):"—";
              const fpct=v=>v===null?"—":v+"%";
              const HCell={padding:"7px 9px",textAlign:"right",color:"#64748b",fontWeight:700,whiteSpace:"nowrap",fontSize:11.5};
              // строка-метрика (subtotal) и строка-процент
              // строка итога секции (крупная, цветной фон)
              const MetricRow=({label,ser})=>(<tr className="rep-metric">
                <td>{label}</td>
                {months.map(m=>{const v=ser.byM[m]||0;return <td key={m} style={{color:v<0?"#dc2626":undefined}}>{v?fM(v):"—"}</td>;})}
                <td className="colTot" style={{color:ser.tot<0?"#dc2626":undefined}}>{ser.tot?fM(ser.tot):"—"}</td>
              </tr>);
              const PctRow=({label,ser})=>(<tr className="rep-pct">
                <td>{label}</td>
                {months.map(m=><td key={m}>{fpct(ser.byM[m])}</td>)}
                <td className="colTot">{fpct(ser.tot)}</td>
              </tr>);
              const goOps=(cat,sub)=>{ navigate(undefined,"ops",{finFilterCat:cat||"",finFilterCategory:sub||"",finFilterContract:""}); };
              // группа расходов: категория + подкатегории
              const ExpGroupRows=({cat,exclude=[]})=>{
                const meta=(financeMeta.expense||[]).find(c=>c.cat===cat); if(!meta)return null;
                const gt=agg(t=>t.type==="expense"&&t.category===cat&&!exclude.includes(t.subcategory)); if(gt.tot===0)return null;
                return (<Fragment>
                  <tr onClick={()=>goOps(cat,"")} style={{cursor:"pointer",borderTop:"1px solid #e2e8f0"}} onMouseEnter={e=>e.currentTarget.style.background="#fff7ed"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{padding:"8px 14px",fontWeight:700,color:"#1e293b",fontSize:13}}>{cat} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                    {months.map(m=><td key={m} style={{padding:"8px 14px",textAlign:"right",color:"#dc2626",fontWeight:600}}>{gt.byM[m]?fM(gt.byM[m]):"—"}</td>)}
                    <td className="colTot" style={{padding:"8px 14px",textAlign:"right",fontWeight:800,color:"#dc2626"}}>{gt.tot?fM(gt.tot):"—"}</td>
                  </tr>
                  {(meta.subs||[]).filter(s2=>!exclude.includes(s2)).map(s2=>{
                    const s=agg(t=>t.type==="expense"&&t.category===cat&&t.subcategory===s2); if(s.tot===0)return null;
                    return (<tr key={s2} onClick={()=>goOps(cat,s2)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#fef9f0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                      <td style={{padding:"5px 14px 5px 28px",color:"#64748b",fontSize:12}}>· {s2} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                      {months.map(m=><td key={m} style={{padding:"5px 14px",textAlign:"right",color:"#94a3b8",fontSize:12}}>{s.byM[m]?fM(s.byM[m]):"—"}</td>)}
                      <td className="colTot" style={{padding:"5px 14px",textAlign:"right",color:"#64748b",fontSize:12}}>{s.tot?fM(s.tot):"—"}</td>
                    </tr>);
                  })}
                </Fragment>);
              };
              return (
                <div className="card" style={{padding:"18px 20px",width:"100%",boxSizing:"border-box"}}>
                  <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:4}}>📈 Отчёт о прибылях и убытках (ОПУ / P&L)</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Признание по этапам: выручка = <b>оплата сданного этапа</b> в месяце сдачи (= дата оплаты клиентом), расходы — по дате операции · {months.length} мес.</div>
                  {months.length===0 ? <div style={{color:"#94a3b8",textAlign:"center",padding:30}}>Нет данных за период</div> : (<>
                  <div className="rep-wrap">
                  <table className="rep-table">
                    <thead><tr>
                      <th>Статья</th>
                      {months.map(m=><th key={m} style={{textAlign:"right"}}>{mLabel(m)}</th>)}
                      <th className="colTot" style={{textAlign:"right"}}>Итого</th>
                    </tr></thead>
                    <tbody>
                      {/* ── Доходы ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Доходы</td></tr>
                      {incGroups.filter(g=>g.tot!==0).map(g=>(<Fragment key={g.cat}>
                        <tr onClick={()=>goOps(g.cat,"")} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <td style={{fontWeight:700,color:"#1e293b"}}>{g.cat} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                          {months.map(m=><td key={m} style={{fontWeight:600}}>{g.byM[m]?fM(g.byM[m]):"—"}</td>)}
                          <td className="colTot" style={{fontWeight:800}}>{g.tot?fM(g.tot):"—"}</td>
                        </tr>
                        {g.subs.map(sub=>{ const s=agg(t=>t.type==="income"&&t.category===g.cat&&t.subcategory===sub); if(s.tot===0)return null; return (
                          <tr key={sub} onClick={()=>goOps(g.cat,sub)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                            <td style={{paddingLeft:28,color:"#64748b",fontSize:12}}>· {sub} <span style={{fontSize:9,color:"#cbd5e1"}}>↗</span></td>
                            {months.map(m=><td key={m} style={{color:"#94a3b8",fontSize:12}}>{s.byM[m]?fM(s.byM[m]):"—"}</td>)}
                            <td className="colTot" style={{color:"#64748b",fontSize:12}}>{s.tot?fM(s.tot):"—"}</td>
                          </tr>
                        );})}
                      </Fragment>))}
                      <MetricRow label="Выручка (Revenue)" ser={income}/>
                      {adv.tot!==0 && (<tr className="rep-pct"><td style={{paddingLeft:28}} title="Авансы — обязательство, не входят в выручку и прибыль">· Справочно: авансы полученные (обязательство)</td>{months.map(m=><td key={m}>{adv.byM[m]?fM(adv.byM[m]):"—"}</td>)}<td className="colTot">{adv.tot?fM(adv.tot):"—"}</td></tr>)}
                      {/* ── Себестоимость ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Себестоимость (COGS)</td></tr>
                      <ExpGroupRows cat={C_COGS}/>
                      <MetricRow label="ВАЛОВАЯ ПРИБЫЛЬ" ser={gross}/>
                      <PctRow label="Валовая маржинальность" ser={grossM}/>
                      {/* ── OPEX ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Операционные расходы (OPEX)</td></tr>
                      <ExpGroupRows cat={C_OPEX}/>
                      <MetricRow label="EBITDA / Операционная прибыль" ser={ebitda}/>
                      <PctRow label="Операционная рентабельность" ser={ebitdaM}/>
                      {/* ── Финансовые расходы ── */}
                      <tr className="rep-section"><td colSpan={months.length+2}>Финансовые расходы (налоги, комиссии)</td></tr>
                      <ExpGroupRows cat={C_FIN} exclude={[S_DIV]}/>
                      <MetricRow label="ЧИСТАЯ ПРИБЫЛЬ" ser={net}/>
                      <PctRow label="Рентабельность по чистой прибыли" ser={netM}/>
                      {div.tot!==0 && (<>
                        <tr className="rep-section"><td colSpan={months.length+2}>Распределение прибыли</td></tr>
                        <tr onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={{paddingLeft:28,color:"#64748b",fontSize:12}}>− Дивиденды учредителям</td>{months.map(m=><td key={m} style={{color:"#94a3b8",fontSize:12}}>{fmt(div.byM[m])}</td>)}<td className="colTot" style={{color:"#64748b",fontSize:12}}>{fmt(div.tot)}</td></tr>
                        {Object.entries(divByRecOpu).map(([r,ser])=>(
                          <tr key={r} onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={{paddingLeft:40,color:"#94a3b8",fontSize:11}}>↳ {r}</td>{months.map(m=><td key={m} style={{color:"#94a3b8",fontSize:11}}>{ser.byM[m]>0?fmt(ser.byM[m]):"—"}</td>)}<td className="colTot" style={{color:"#94a3b8",fontSize:11}}>{fmt(ser.tot)}</td></tr>
                        ))}
                        <MetricRow label="НЕРАСПРЕДЕЛЁННАЯ ПРИБЫЛЬ" ser={retained}/>
                      </>)}
                    </tbody>
                  </table>
                  </div>
                  <div style={{marginTop:16,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                    {[
                      ["Выручка",fM(income.tot)+" ₸",null,"#059669","#f0fdf4"],
                      ["Валовая прибыль",fM(gross.tot)+" ₸",grossM.tot,"#0891b2","#ecfeff"],
                      ["EBITDA",fM(ebitda.tot)+" ₸",ebitdaM.tot,"#7c3aed","#f5f3ff"],
                      ["Чистая прибыль",fM(net.tot)+" ₸",netM.tot,"#2563eb","#eff6ff"],
                    ].map(([l,v,pc,c,bg])=>(
                      <div key={l} style={{background:bg,borderRadius:12,padding:"12px 14px",border:"1px solid "+c+"22"}}>
                        <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{l}</div>
                        <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
                        {pc!==null&&<div style={{fontSize:11,color:c,marginTop:2,fontWeight:600}}>{pc}% от выручки</div>}
                      </div>
                    ))}
                  </div>
                  </>)}
                </div>
              );
            })()}

            {/* ───── БАЛАНС (IFRS / Statement of Financial Position) ───── */}
            {financeTab==="balance" && (()=>{
              const bi = financeMeta.balanceItems || {};
              const n = v => Number(v)||0;
              // приход по проектам (для дебиторки)
              const projInc={};
              for(const t of financeTx){ if(t.deletedAt||t.included===false)continue; const cn=normCN(t.contractNo); if(!cn)continue; if(t.type==="income") projInc[cn]=(projInc[cn]||0)+(Number(t.amount)||0); }
              // ── Денежные средства по типам счетов ──
              const byType = { cash:0, bank:0, card:0, ewallet:0 };
              accounts.forEach(a=>{ const tp=a.accType||"bank"; byType[tp]=(byType[tp]||0)+(balances[a.name]||0); });
              const cash = byType.cash+byType.bank+byType.card+byType.ewallet;
              // Дебиторка (денежная — клиенты должны оплатить деньгами по проектам)
              const receivablesMoney = finProjects.filter(isCountedFinanceProject).reduce((s,p)=>s+Math.max(0,(Number(p.budget)||0)-(projInc[normCN(p.contractNo)]||0)),0);
              // Авансы клиентов (обязательство)
              const advances = financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&t.isAdvance).reduce((s,t)=>s+(Number(t.amount)||0),0);

              // ── Авто-расчёт из операций (все статьи баланса — только из транзакций) ──
              const sumTx = pred => financeTx.filter(t=>!t.deletedAt&&t.included!==false&&pred(t)).reduce((s,t)=>s+(Number(t.amount)||0),0);
              const subEq = (t,name) => t.subcategory===name;
              // полученные займы (до года) = получено − возвращено
              const autoLoanShort = sumTx(t=>t.type==="income"&&subEq(t,"Полученный заём (до 1 года)")) - sumTx(t=>t.type==="expense"&&subEq(t,"Возврат займа (до 1 года)"));
              const autoLoanLong = sumTx(t=>t.type==="income"&&subEq(t,"Полученный заём (от 1 года)")) - sumTx(t=>t.type==="expense"&&subEq(t,"Возврат займа (от 1 года)"));
              const autoCreditLong = sumTx(t=>t.type==="income"&&subEq(t,"Полученный кредит (от 1 года)")) - sumTx(t=>t.type==="expense"&&subEq(t,"Погашение кредита (от 1 года)"));
              const autoFounders = sumTx(t=>t.type==="income"&&subEq(t,"Вклад учредителя")) - sumTx(t=>t.type==="expense"&&subEq(t,"Возврат вклада учредителю"));
              // покупка основных средств по типам (накопленные капвложения)
              const autoFA = {};
              Object.entries(FA_SUB_MAP).forEach(([sub,key])=>{ autoFA[key]=sumTx(t=>t.type==="expense"&&subEq(t,sub)); });
              // прочие активы из C_ASSET_OUT минус возвраты из C_ASSET_INC
              const autoAsset = {};
              financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="expense"&&t.category===C_ASSET_OUT).forEach(t=>{ const k=ASSET_OUT_KEYS[t.subcategory]; if(k) autoAsset[k]=(autoAsset[k]||0)+(Number(t.amount)||0); });
              financeTx.filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&t.category===C_ASSET_INC).forEach(t=>{ const k=ASSET_INC_KEYS[t.subcategory]; if(k) autoAsset[k]=(autoAsset[k]||0)-(Number(t.amount)||0); });
              const ag = k => Math.max(0, autoAsset[k]||0);

              // ── АКТИВЫ ──
              // recv (дебиторка) — только информационно, в кассовом учёте не актив (выручка не признана)
              const recv = receivablesMoney;
              const collateral = ag("collateral");
              const loansGivenShort = ag("loansGivenShort");
              const inventory = ag("inventory");
              const otherCurrent = collateral + loansGivenShort;
              const currentAssets = cash + inventory + otherCurrent; // recv НЕ включается — кассовый метод
              const fa = { faTechnika:autoFA.faTechnika||0, faMebel:autoFA.faMebel||0, faInventar:autoFA.faInventar||0, faOborud:autoFA.faOborud||0, faTransport:autoFA.faTransport||0 };
              const fixedAssets = fa.faTechnika+fa.faMebel+fa.faInventar+fa.faOborud+fa.faTransport;
              const loansGivenLong = ag("loansGivenLong");
              const financialInvest = ag("financialInvest");
              const intangibles = ag("intangibles");
              const otherNonCurrent = loansGivenLong + financialInvest + intangibles;
              const nonCurrentAssets = fixedAssets + otherNonCurrent;
              const totalAssets = currentAssets + nonCurrentAssets;

              // ── ОБЯЗАТЕЛЬСТВА ──
              const payables = 0; // кредиторка — в кассовом учёте = 0 (все фактические оплаты уже в расходах)
              const loansShort = autoLoanShort;
              const otherShort = loansShort + advances;
              const shortLiab = payables + otherShort;
              const creditsLong = autoCreditLong;
              const loansLong = autoLoanLong;
              const longLiab = creditsLong + loansLong;
              const totalLiab = shortLiab + longLiab;

              // ── КАПИТАЛ ── (нераспределённая прибыль = накопленная чистая прибыль из ОПУ за всё время)
              const S_DIV_BAL = "Дивиденды учредителям";
              const allTimeInc  = sumTx(t => t.type==="income"  && !t.isAdvance && t.category!==C_FINANCING_INC && t.category!==C_ASSET_INC);
              const allTimeExp  = sumTx(t => t.type==="expense" && t.subcategory!==S_DIV_BAL && t.category!==C_FINACT && t.category!==C_ASSET_OUT);
              const allTimeDivs = sumTx(t => t.type==="expense" && t.subcategory===S_DIV_BAL);
              const retained    = allTimeInc - allTimeExp - allTimeDivs;
              const founders    = accounts.reduce((s,a)=>s+(Number(a.opening)||0),0) + autoFounders;
              const otherCap    = 0;
              const totalCapital = founders + otherCap + retained;

              const assetsSections = [
                { key:"ca", label:"Оборотные активы", value:currentAssets, children:[
                  // recv — дебиторка показана справочно ниже, не включена в активы (кассовый метод)
                  { key:"recv", label:"Дебиторка (справочно, не актив)", value:recv, info:true, children:[
                    { key:"recv-m", label:"Денежная", value:recv },
                  ]},
                  { key:"cash", label:"Денежные средства", value:cash, children:[
                    { key:"cash-c", label:"Наличные", value:byType.cash },
                    { key:"cash-b", label:"Безналичные (банк)", value:byType.bank },
                    { key:"cash-k", label:"Карты", value:byType.card },
                    { key:"cash-e", label:"Электронные кошельки", value:byType.ewallet },
                  ]},
                  { key:"inv", label:"Запасы", value:inventory },
                  { key:"oc", label:"Другие оборотные", value:otherCurrent, children:[
                    { key:"oc-col", label:"Залоговые платежи", value:collateral },
                    { key:"oc-l", label:"Выданные займы (до 1 года)", value:loansGivenShort },
                  ]},
                ]},
                { key:"nca", label:"Внеоборотные активы", value:nonCurrentAssets, children:[
                  { key:"fa", label:"Основные средства", value:fixedAssets, children:[
                    { key:"fa-t", label:"Техника", value:fa.faTechnika },
                    { key:"fa-m", label:"Мебель", value:fa.faMebel },
                    { key:"fa-i", label:"Инвентарь", value:fa.faInventar },
                    { key:"fa-o", label:"Оборудование", value:fa.faOborud },
                    { key:"fa-tr", label:"Транспорт", value:fa.faTransport },
                  ]},
                  { key:"onc", label:"Другие внеоборотные", value:otherNonCurrent, children:[
                    { key:"onc-l", label:"Выданные займы (от 1 года)", value:loansGivenLong },
                    { key:"onc-f", label:"Финансовые вложения", value:financialInvest },
                    { key:"onc-i", label:"Нематериальные активы", value:intangibles },
                  ]},
                ]},
              ];
              const liabSections = [
                { key:"sl", label:"Краткосрочные обязательства", value:shortLiab, children:[
                  { key:"pay", label:"Кредиторская задолженность", value:payables, children:[
                    { key:"pay-m", label:"Денежная", value:0 },
                    { key:"pay-n", label:"Неденежная", value:0 },
                  ]},
                  { key:"os", label:"Другие краткосрочные", value:otherShort, children:[
                    { key:"os-adv", label:"Авансы клиентов (предоплата)", value:advances },
                    { key:"os-l", label:"Полученные займы (до 1 года)", value:loansShort },
                  ]},
                ]},
                { key:"ll", label:"Долгосрочные обязательства", value:longLiab, children:[
                  { key:"ll-c", label:"Кредиты", value:creditsLong },
                  { key:"ll-o", label:"Другие долгосрочные", value:loansLong, children:[
                    { key:"ll-o-l", label:"Полученные займы (от 1 года)", value:loansLong },
                  ]},
                ]},
              ];
              const capitalSection = { key:"cap", label:"Капитал", value:totalCapital, children:[
                { key:"cap-f", label:"Вложения учредителей", value:founders },
                { key:"cap-r", label:"Нераспределённая прибыль", value:retained },
              ]};

              const diff = totalAssets - (totalLiab + totalCapital);
              return (
                <div className="card" style={{padding:"20px 22px",width:"100%",boxSizing:"border-box"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>⚖️ Балансовый отчёт</div>
                    <span style={{fontSize:10.5,fontWeight:700,color:"#64748b",background:"#f1f5f9",borderRadius:6,padding:"2px 8px"}}>KZT</span>
                  </div>
                  <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Управленческий баланс (IFRS) на текущую дату · нераспределённая прибыль — балансирующая статья</div>
                  <BalanceSheet
                    assetsSections={assetsSections}
                    liabSections={liabSections}
                    capitalSection={capitalSection}
                    totalAssets={totalAssets}
                    totalLiab={totalLiab}
                    totalCapital={totalCapital}
                  />
                  <div style={{marginTop:14,padding:"10px 14px",borderRadius:10,background:Math.abs(diff)<1?"#f0fdf4":"#fef2f2",border:"1px solid "+(Math.abs(diff)<1?"#bbf7d0":"#fecaca")}}>
                    <span style={{fontSize:12.5,fontWeight:700,color:Math.abs(diff)<1?"#059669":"#dc2626"}}>{Math.abs(diff)<1?"✓ Баланс сходится":"⚠ Расхождение "+fM(diff)+" ₸"}: Активы {fM(totalAssets)} = Обязательства+Капитал {fM(totalLiab+totalCapital)}</span>
                  </div>
                  <div style={{marginTop:10,fontSize:11,color:"#94a3b8",lineHeight:1.6}}>
                    Денежные средства разбиты по типам счетов (задаётся в Справочнике). Основные средства, запасы, займы и кредиторку вводите вручную в Справочнике → «Статьи баланса». Дебиторка — автоматически по проектам (стоимость − оплачено), авансы клиентов — из операций с флагом «Аванс».
                  </div>
                </div>
              );
            })()}

            {/* ───── ОПЕРАЦИИ ───── */}
            {financeTab==="ops" && (<>
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                {canFinanceCreate && <button onClick={()=>openNewTx("income")} style={{background:"#059669",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Доход</button>}
                {canFinanceCreate && <button onClick={()=>openNewTx("expense")} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Расход</button>}
                {canFinanceCreate && <button onClick={()=>openNewTx("transfer")} style={{background:"#7c3aed",color:"#fff",border:"none",borderRadius:9,padding:"9px 15px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Перевод</button>}
                <div style={{flex:1}}/>
                {canFinanceExport && <button onClick={()=>downloadCSV(
                  "operations_"+new Date().toISOString().slice(0,10)+".csv",
                  ["Дата","Тип","Сумма","Счёт","Счёт (куда)","Категория","Подкатегория","Договор","Комментарий","Учитывается"],
                  opsList.map(t=>[
                    new Date(t.date||t.createdAt||0).toLocaleDateString("ru-RU"),
                    TYPE_LABEL[t.type]||t.type,
                    Math.round(Number(t.amount)||0),
                    t.account||"", t.accountTo||"", t.category||"", t.subcategory||"",
                    t.contractNo||"", t.note||"", t.included===false?"нет":"да",
                  ])
                )} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>⬇ Excel (CSV)</button>}
                {currentPermissions.financeDelete !== "none" && (()=>{const td=financeTx.filter(t=>t.deletedAt); return td.length>0&&(<button onClick={()=>setFinTxTrash(true)} style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.18)",borderRadius:9,padding:"9px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🗑 {td.length}</button>);})()}
                <span style={{fontSize:12,color:"#94a3b8"}}>Операций: <b style={{color:"#334155"}}>{opsList.length}</b></span>
              </div>
              {(finFilterContract || finFilterCat || finFilterCategory) && (
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                  {finFilterContract && <div style={{display:"flex",alignItems:"center",gap:6,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:9,padding:"7px 12px"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>📋 Проект: {finFilterContract}</span>
                    <button onClick={()=>setFinFilterContract("")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>
                  </div>}
                  {finFilterCat && <div style={{display:"flex",alignItems:"center",gap:6,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:9,padding:"7px 12px"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#059669"}}>📂 {finFilterCat}</span>
                    <button onClick={()=>setFinFilterCat("")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>
                  </div>}
                  {finFilterCategory && <div style={{display:"flex",alignItems:"center",gap:6,background:"#fefce8",border:"1px solid #fef08a",borderRadius:9,padding:"7px 12px"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#ca8a04"}}>📌 {finFilterCategory}</span>
                    <button onClick={()=>setFinFilterCategory("")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>
                  </div>}
                </div>
              )}
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                <input className="fi" placeholder="🔍 Поиск по статье, комментарию, договору..." value={finSearch} onChange={e=>setFinSearch(e.target.value)} style={{flex:"1 1 240px"}}/>
                <select className="fi" style={{width:"auto"}} value={finFilterType} onChange={e=>setFinFilterType(e.target.value)}>
                  <option value="">Все типы</option><option value="income">Доходы</option><option value="expense">Расходы</option><option value="transfer">Переводы</option>
                </select>
                <select className="fi" style={{width:"auto"}} value={finFilterAccount} onChange={e=>setFinFilterAccount(e.target.value)}>
                  <option value="">Все счета</option>{accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                {(()=>{
                  const cats = [...new Set(financeTx.filter(t=>!t.deletedAt && t.subcategory).map(t=>t.subcategory))].sort();
                  return cats.length>0 ? (
                    <select className="fi" style={{width:"auto"}} value={finFilterCategory} onChange={e=>setFinFilterCategory(e.target.value)}>
                      <option value="">Все подкатегории</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : null;
                })()}
                <input className="fi" type="number" placeholder="Сумма от" value={finAmtMin} onChange={e=>setFinAmtMin(e.target.value)} style={{width:110}}/>
                <input className="fi" type="number" placeholder="до" value={finAmtMax} onChange={e=>setFinAmtMax(e.target.value)} style={{width:90}}/>
              </div>
              <div className="card" style={{overflow:"hidden"}}>
                {opsList.length===0 && <div style={{textAlign:"center",color:"#94a3b8",fontSize:13,padding:"40px 0"}}>Нет операций</div>}
                {opsList.map(t=>(
                  <div key={t.id} onClick={()=>openEditTx(t)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:"1px solid #f1f5f9",cursor:canFinanceEditRecord(t)?"pointer":"default",opacity:t.included===false?0.5:1}} className="fin-row">
                    <span style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLOR[t.type],flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,color:"#0f172a",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {t.included===false?<span title="Не учитывается в балансе" style={{color:"#dc2626",fontWeight:700}}>⊘ </span>:null}{t.type==="transfer" ? (t.account+" → "+t.accountTo) : (t.category||"—")}{t.subcategory?<span style={{color:"#94a3b8",fontWeight:400}}> · {t.subcategory}</span>:null}
                      </div>
                      <div style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {new Date(t.date||t.createdAt||0).toLocaleDateString("ru-RU")} · {t.account}{t.contractNo?" · "+t.contractNo:""}{t.note?" · "+t.note:""}
                      </div>
                    </div>
                    <div style={{fontSize:14,fontWeight:800,color:TYPE_COLOR[t.type],whiteSpace:"nowrap"}}>{t.type==="expense"?"−":t.type==="income"?"+":""}{fM(t.amount)} ₸</div>
                  </div>
                ))}
              </div>
            </>)}

            {/* ───── ПРОЕКТЫ ───── */}
            {financeTab==="projects" && (()=>{
              const projStats = {};
              for (const t of financeTx) {
                if (t.deletedAt || t.included===false) continue;
                const cn = normCN(t.contractNo);
                if (!cn) continue;
                if (!projStats[cn]) projStats[cn] = { income:0, expense:0 };
                if (t.type==="income") projStats[cn].income += Number(t.amount)||0;
                else if (t.type==="expense") projStats[cn].expense += Number(t.amount)||0;
              }
              // ВИРТУАЛЬНЫЕ ПРОЕКТЫ: объект в активном/сделочном статусе (подписан/в работе/
              // приостановлен/выполнен) может не иметь сохранённого финпроекта — например, когда
              // статус выставили напрямую, минуя «Договор подписан» (только он авто-создаёт
              // финпроект). Раньше такой объект в «Проекты» не попадал. Теперь показываем для него
              // строку из самого объекта (objects как источник финпроекта). Ничего не пишем в базу:
              // при открытии и сохранении такой строки создаётся реальный финпроект (id пустой →
              // savep создаёт новый). Дедуп по объекту (financeObjectOf покрывает связь и по
              // objectId, и по номеру договора).
              const _coveredObjIds = new Set();
              for (const p of finProjects) { const o = financeObjectOf(p); if (o) _coveredObjIds.add(o.id); }
              const _projectStatuses = new Set(["signed","work","paused","done"]);
              const virtualProjects = liveObjects
                .filter(o => !_coveredObjIds.has(o.id) && _projectStatuses.has(unifiedStatusOf(o)))
                .map(o => { const c = financeContractOf({}, o); return { id:"", _virtual:true, objectId:o.id, contractNo:c?.number||"", budget: finBudgetOfContract(c)||0, createdAt: String(o.createdAt||"") }; });
              const sorted = [...finProjects, ...virtualProjects].sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
              const allStatuses = [...new Map(sorted.map(p=>financeProjectViewOf(p)).filter(v=>v.statusKey).map(v=>[v.statusKey,{key:v.statusKey,label:v.statusLabel,color:v.statusColor}])).values()];
              const allCats = [...new Set(sorted.map(p=>financeProjectViewOf(p).category).filter(v=>v&&v!=="—"))];
              const q = finProjSearch.toLowerCase();
              const filtered = sorted
                .filter(p=>!finProjStatusFilter || financeProjectViewOf(p).statusKey===finProjStatusFilter)
                .filter(p=>!finProjCatFilter || financeProjectViewOf(p).category===finProjCatFilter)
                .filter(p=>{
                  if (!q) return true;
                  const v = financeProjectViewOf(p);
                  return [v.contractNo,v.customerName,v.customerPhone,v.address,v.category,p.comment]
                    .some(x=>String(x||"").toLowerCase().includes(q));
                });
              const days = (a,b) => { if(!a||!b) return null; const d=Math.round((new Date(b)-new Date(a))/86400000); return d>=0?d:null; };
              const yesno = v => v==="да"||v==="yes"||v===true||v==="1"||v==="Да"||v==="ДА";
              // totals
              const totBudget = filtered.reduce((s,p)=>s+(Number(p.budget)||0),0);
              const totIncome = filtered.reduce((s,p)=>s+(projStats[normCN(p.contractNo)]?.income||0),0);
              const totExpense = filtered.reduce((s,p)=>s+(projStats[normCN(p.contractNo)]?.expense||0),0);
              const totDebt = filtered.reduce((s,p)=>s+Math.max(0,(Number(p.budget)||0)-(projStats[normCN(p.contractNo)]?.income||0)),0);
              const totMargin = totIncome>0 ? Math.round((totIncome-totExpense)/totIncome*100) : 0;
              return (
                <div>
                  {/* Заголовок + кнопка */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:10,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                      <h2 style={{margin:0,fontSize:18,fontWeight:800,color:"#0f172a"}}>🏗 Проекты</h2>
                      <span style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>{filtered.length} из {finProjects.length}</span>
                    </div>
                    {canFinanceCreate && <button onClick={()=>setFinProjModal({id:"",objectId:"",contractNo:"",budget:0,b24:"нет",comment:"",createdBy:currentUser.name,createdById:currentUser.id})}
                      style={{background:"#059669",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(5,150,105,.3)"}}>+ Проект</button>}
                  </div>
                  {/* Фильтры */}
                  <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                    <input className="fi" style={{flex:"1 1 180px",maxWidth:260}} value={finProjSearch} onChange={e=>setFinProjSearch(e.target.value)} placeholder="🔍 Поиск..."/>
                    {[{key:"",label:"Все статусы",color:"#2563eb"},...allStatuses].map(({key:v,label:l,color})=>{
                      const col=color||"#64748b";
                      const on=finProjStatusFilter===v;
                      return <button key={v} onClick={()=>setFinProjStatusFilter(v)} style={{fontSize:12,fontWeight:700,padding:"6px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(on?(v?col:"#2563eb"):"#e2e8f0"),background:on?(v?col+"18":"#eff6ff"):"#fff",color:on?(v?col:"#2563eb"):"#94a3b8"}}>{l}</button>;
                    })}
                    {allCats.length>1 && <select className="fi" style={{width:"auto",minWidth:130}} value={finProjCatFilter} onChange={e=>setFinProjCatFilter(e.target.value)}>
                      <option value="">Все типы</option>
                      {allCats.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>}
                  </div>
                  {/* Итого-плитки */}
                  {filtered.length>0 && (()=>{
                    const tiles=[
                      ["Объём продаж",fM(totBudget)+" ₸","#0f172a","#f1f5f9"],
                      ["Оплачено факт",fM(totIncome)+" ₸","#059669","#f0fdf4"],
                      ["Дебиторка",totDebt>0?fM(totDebt)+" ₸":"—",totDebt>0?"#dc2626":"#94a3b8","#fef2f2"],
                      ["Расходы",fM(totExpense)+" ₸","#dc2626","#fef2f2"],
                      ["Валовая прибыль",fM(totIncome-totExpense)+" ₸",(totIncome-totExpense)>=0?"#059669":"#dc2626","#f0fdf4"],
                      ["Маржа",totMargin+"%",totMargin>=30?"#059669":totMargin>=0?"#f59e0b":"#dc2626","#fffbeb"],
                    ];
                    return <div className="fin-tiles" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
                      {tiles.map(([l,v,c,bg])=>(
                        <div key={l} style={{background:bg,borderRadius:12,padding:"12px 14px",border:"1px solid "+c+"22"}}>
                          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:3}}>{l}</div>
                          <div style={{fontSize:17,fontWeight:800,color:c}}>{v}</div>
                        </div>
                      ))}
                    </div>;
                  })()}
                  {/* Карточки проектов */}
                  <div className="fin-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
                    {filtered.map(p=>{
                      const view = financeProjectViewOf(p);
                      const st = projStats[normCN(p.contractNo)]||{income:0,expense:0};
                      const income = st.income;
                      const expense = st.expense;
                      const debt = Math.max(0,(Number(p.budget)||0)-income);
                      const marginVal = income-expense;
                      const marginPct = income>0 ? Math.round(marginVal/income*100) : null;
                      const col = view.statusColor;
                      const dur = days(view.startDate, view.factEndDate);
                      const budgetFill = p.budget>0 ? Math.min(100,Math.round(income/p.budget*100)) : 0;
                      const mCol = marginPct===null?"#94a3b8":marginPct>=30?"#059669":marginPct>=0?"#f59e0b":"#dc2626";
                      const mBg  = marginPct===null?"#f8fafc":marginPct>=30?"#f0fdf4":marginPct>=0?"#fffbeb":"#fef2f2";
                      return (
                          <div key={p.id||("vp:"+p.objectId)||p.contractNo} onClick={()=>{ if(canFinanceEditRecord(p)) setFinProjModal({...p}); }}
                            style={{background:"#fff",border:"1px solid #eef2f7",borderRadius:16,cursor:canFinanceEditRecord(p)?"pointer":"default",boxShadow:"0 1px 3px rgba(15,23,42,.07)",transition:"box-shadow .15s,transform .15s",overflow:"hidden",display:"flex",flexDirection:"column"}}
                          className="fin-row">
                          {/* Цветная полоса статуса */}
                          <div style={{height:4,background:`linear-gradient(90deg,${col},${col}99)`,flexShrink:0}}/>
                          <div style={{padding:"14px 16px 16px",flex:1,display:"flex",flexDirection:"column"}}>
                            {/* Шапка */}
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:8}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:14,fontWeight:800,color:"#0f172a",letterSpacing:"-.2px",lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{view.customerName}{view.address?` · ${view.address}`:""}</div>
                                <div style={{fontSize:11,color:view.linked?"#94a3b8":"#dc2626",marginTop:3,fontWeight:view.linked?400:700}}>
                                  {view.linked ? (view.contractNo ? `Договор №${String(view.contractNo).replace(/^№+/,"")}` : "Договор не создан") : "⚠ Не привязан к объекту"}
                                </div>
                              </div>
                              <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:view.statusBg,color:col,whiteSpace:"nowrap",flexShrink:0,lineHeight:1.6}}>{view.statusLabel}</span>
                            </div>
                            {/* Мета-чипы */}
                            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12,fontSize:10,alignItems:"center",minHeight:22}}>
                              {[view.customerType,view.category].filter(Boolean).map((m,i)=><span key={i} style={{color:"#64748b",background:"#f1f5f9",borderRadius:6,padding:"2px 7px",fontWeight:600}}>{m}</span>)}
                              {view.saleDate&&<span style={{color:"#94a3b8"}} title="Дата продажи">🤝 {view.saleDate}</span>}
                              {view.startDate&&<span style={{color:"#94a3b8"}} title="Дата начала работ">🔨 {view.startDate}</span>}
                              {view.planEndDate&&<span style={{color:"#94a3b8"}} title="Плановая дата окончания">📅 {view.planEndDate}</span>}
                              {view.factEndDate&&<span style={{color:"#059669"}} title="Фактическая дата окончания">✓ {view.factEndDate}{dur!==null?` · ${dur}д.`:""}</span>}
                              {view.object && <button onClick={e=>{ e.stopPropagation(); openObjectFromFinance(view.object); }} title="Открыть объект" style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:6,padding:"2px 7px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↗ Объект</button>}
                            </div>
                            {/* Прогресс оплаты */}
                            <div style={{marginBottom:12}}>
                              {p.budget>0 ? <>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                                  <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{fM(income)} <span style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>из {fM(p.budget)} ₸</span></span>
                                  <span style={{fontSize:12,fontWeight:800,color:budgetFill>=100?"#059669":"#2563eb"}}>{budgetFill}%</span>
                                </div>
                                <div style={{height:6,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                                  <div style={{height:"100%",width:budgetFill+"%",background:budgetFill>=100?"linear-gradient(90deg,#059669,#34d399)":"linear-gradient(90deg,#2563eb,#60a5fa)",borderRadius:4,transition:"width .3s"}}/>
                                </div>
                              </> : <div>
                                <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{income>0?fM(income)+" ₸":"—"}</span>
                                <span style={{fontSize:10,color:"#94a3b8",marginLeft:7}}>бюджет не указан</span>
                              </div>}
                            </div>
                            {/* Финансовые строки */}
                            <div style={{borderTop:"1px solid #f1f5f9"}}>
                              {[
                                ["Долг", debt>0?fM(debt)+" ₸":"—", debt>0?"#dc2626":"#94a3b8"],
                                ["Расходы", expense>0?fM(expense)+" ₸":"—", expense>0?"#dc2626":"#94a3b8"],
                              ].map(([l,v,c])=>(
                                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
                                  <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</span>
                                  <span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
                                </div>
                              ))}
                            </div>
                            {/* Нижняя часть: маржа + флаги — прижата к низу карточки */}
                            <div style={{marginTop:"auto",paddingTop:10}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:mBg,borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                                <span style={{fontSize:11,fontWeight:700,color:"#475569"}}>Маржа</span>
                                <span style={{display:"flex",alignItems:"center",gap:7}}>
                                  <span style={{fontSize:14,fontWeight:800,color:mCol}}>{income>0?fM(marginVal)+" ₸":"—"}</span>
                                  {marginPct!==null&&<span style={{fontSize:10,fontWeight:800,color:"#fff",background:mCol,borderRadius:6,padding:"2px 7px"}}>{marginPct}%</span>}
                                </span>
                              </div>
                              <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                                {[["Договор",view.contractSigned],["АВР",view.hasAvr]].map(([l,v])=>(
                                  <span key={l} style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:yesno(v)?"#f0fdf4":"#fef2f2",color:yesno(v)?"#059669":"#dc2626",display:"inline-flex",alignItems:"center",gap:3}}>{yesno(v)?"✓":"✗"} {l}</span>
                                ))}
                                {p.contractNo && <button onClick={e=>{ e.stopPropagation(); navigate(undefined,"ops",{finFilterContract:p.contractNo}); }} style={{marginLeft:"auto",background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:7,padding:"4px 9px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📋 Операции</button>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filtered.length===0 && <div style={{color:"#94a3b8",textAlign:"center",padding:40,fontSize:14,gridColumn:"1/-1"}}>Проекты не найдены</div>}
                  </div>
                  {/* Модалка проекта */}
                  {finProjModal !== null && (()=>{
                    const mp = finProjModal;
                    const view = financeProjectViewOf(mp);
                    const setp = (k,v) => setFinProjModal(p=>({...p,[k]:v}));
                    const savep = async () => {
                      if (mp.id ? !canFinanceEditRecord(mp) : !canFinanceCreate) return;
                      if (!mp.id && !mp.objectId) { window.alert("Сначала выберите объект. Новый финансовый проект без объекта создавать нельзя."); return; }
                        const { _virtual, ...mpClean } = mp; // служебный флаг виртуальной строки в базу не пишем
                        const proj = {...mpClean, id: mp.id||genId(), budget:Number(mp.budget)||0, paidFact:Number(mp.paidFact)||0, expenses:Number(mp.expenses)||0, createdBy:mp.createdBy||currentUser.name, createdById:mp.createdById||currentUser.id, updatedAt:Date.now()};
                      const cur = finProjectsRef.current;
                      const list = mp.id ? cur.map(x=>x.id===mp.id?proj:x) : [proj,...cur];
                      await saveFinanceProjects(list);
                      setFinProjModal(null);
                    };
                    const delp = async () => {
                      if (!canFinanceDeleteRecord(mp)) return;
                      if (!mp.id) return; if (!await confirmTyped("Удалить проект?\nЭто действие нельзя отменить через интерфейс.")) return;
                      // removedIds обязательно — иначе merge при сохранении вернёт удалённый проект из облака
                      await saveFinanceProjects(finProjectsRef.current.filter(x=>x.id!==mp.id), {removedIds:[mp.id], allowEmpty:true});
                      setFinProjModal(null);
                    };
                    return (
                      <div onClick={()=>setFinProjModal(null)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"22px 24px",width:"100%",maxWidth:720,maxHeight:"92vh",overflowY:"auto",overflowX:"hidden",boxSizing:"border-box",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                            <h3 style={{margin:0,fontSize:17,fontWeight:800,color:"#0f172a"}}>{mp.id?"Редактировать":"Новый"} проект</h3>
                            <button onClick={()=>setFinProjModal(null)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>✕</button>
                          </div>
                          {/* показываем расчётные цифры если проект существует */}
                          {mp.id && (()=>{ const st=projStats[normCN(mp.contractNo)]||{income:0,expense:0}; const debt=Math.max(0,(Number(mp.budget)||0)-st.income); const mrg=st.income>0?Math.round((st.income-st.expense)/st.income*100):null;
                            const link=view.contractNo ? linkForContractNo(view.contractNo) : null; const plan=link?.planTotal||0; const pCost=link?.planCost||0; const pMrgPct=link?.planMarginPct;
                            const Cell=({l,v,c})=><div><div style={{fontSize:10,color:"#94a3b8"}}>{l}</div><div style={{fontWeight:800,color:c}}>{v}</div></div>;
                            return <>
                              {/* ФАКТ (по ДДС) */}
                              <div style={{background:"#f8fafc",borderRadius:10,padding:"10px 14px",marginBottom:plan>0?6:12}}>
                                <div style={{fontSize:10,fontWeight:800,color:"#0f172a",marginBottom:6}}>📊 ФАКТ (по оплатам)</div>
                                <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                                  <Cell l="ОПЛАЧЕНО" v={fM(st.income)+" ₸"} c="#059669"/>
                                  <Cell l="ДОЛГ" v={debt>0?fM(debt)+" ₸":"—"} c={debt>0?"#dc2626":"#94a3b8"}/>
                                  <Cell l="РАСХОДЫ" v={fM(st.expense)+" ₸"} c="#dc2626"/>
                                  <Cell l="МАРЖА" v={mrg===null?"—":fM(st.income-st.expense)+" ₸ / "+mrg+"%"} c={mrg===null?"#94a3b8":mrg>=30?"#059669":mrg>=0?"#f59e0b":"#dc2626"}/>
                                </div>
                              </div>
                              {/* ПЛАН (по смете) */}
                              {plan>0 && <div style={{background:"#eff6ff",borderRadius:10,padding:"10px 14px",marginBottom:12,border:"1px solid #dbeafe"}}>
                                <div style={{fontSize:10,fontWeight:800,color:"#1e40af",marginBottom:6}}>📐 ПЛАН (по смете объекта)</div>
                                <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                                  <Cell l="ВЫРУЧКА" v={fM(plan)+" ₸"} c="#2563eb"/>
                                  {pCost>0&&<Cell l="СЕБЕСТОИМОСТЬ" v={fM(pCost)+" ₸"} c="#dc2626"/>}
                                  {pCost>0&&<Cell l="МАРЖА ПЛАН" v={fM(plan-pCost)+" ₸"+(pMrgPct!==null?" / "+pMrgPct+"%":"")} c={pMrgPct>=30?"#059669":pMrgPct>=0?"#f59e0b":"#dc2626"}/>}
                                  <Cell l="ВЫПОЛНЕНО" v={plan>0?Math.round(st.income/plan*100)+"%":"—"} c="#7c3aed"/>
                                </div>
                              </div>}
                            </>;
                          })()}
                          {/* Связь с объектом / выбор объекта */}
                          {(()=>{
                            const objectOptions = [...liveObjects].sort((a,b)=>String(a.clientName||a.address||"").localeCompare(String(b.clientName||b.address||""),"ru"));
                            return <div style={{background:view.linked?"#eff6ff":"#fff7ed",border:"1px solid "+(view.linked?"#bfdbfe":"#fdba74"),borderRadius:10,padding:"11px 14px",marginBottom:11}}>
                              <div style={{fontSize:11,color:view.linked?"#1e40af":"#9a3412",fontWeight:800,marginBottom:6}}>{view.linked?"🔗 Проект связан с объектом":"⚠ Проект не привязан к объекту"}</div>
                              <SearchSelect
                                style={{marginBottom:view.linked?8:0}}
                                value={view.objectId||""}
                                placeholder="🔍 Найти объект по имени/адресу…"
                                options={[{value:"",label:"— выбрать объект —"}, ...objectOptions.map(o=>{ const c=financeContractOf(mp,o); return {value:o.id, label:`${o.clientName||"Без клиента"} — ${o.address||"без адреса"}${c?.number?` · №${c.number}`:""}`}; })]}
                                onChange={v=>{
                                  const object = liveObjects.find(o=>o.id===v);
                                  if (!object) { setp("objectId",""); return; }
                                  const contract = financeContractOf(mp, object);
                                  setFinProjModal(prev=>({
                                    ...prev,
                                    objectId:object.id,
                                    ...(!prev.id ? { contractNo:contract?.number||"", budget:finBudgetOfContract(contract)||Number(prev.budget)||0 } : {}),
                                  }));
                                }}
                              />
                              {view.object && <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <div style={{fontSize:12,color:"#1e40af"}}>📍 {view.address||view.customerName}</div>
                                <button onClick={()=>{ setFinProjModal(null); openObjectFromFinance(view.object); }} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↗ Открыть объект</button>
                              </div>}
                            </div>;
                          })()}
                          <div style={{display:"grid",gap:11}}>
                            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 14px"}}>
                              <div style={{fontSize:11,fontWeight:800,color:"#475569",marginBottom:8}}>Данные объекта · только просмотр</div>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"9px 14px"}}>
                                {[
                                  ["Заказчик",view.customerName],
                                  ["Тип заказчика",view.customerType],
                                  ["Категория",view.category],
                                  ["Статус",view.statusLabel],
                                  ["№ договора",view.contractNo||"Не создан"],
                                  ["Дата продажи",view.saleDate||"—"],
                                  ["Дата начала",view.startDate||"—"],
                                  ["План окончания",view.planEndDate||"—"],
                                  ["Факт окончания",view.factEndDate||"—"],
                                  ["Ответственный",view.manager||"—"],
                                ].map(([label,value])=><div key={label}><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>{label}</div><div style={{fontSize:12,color:"#0f172a",fontWeight:700}}>{value}</div></div>)}
                              </div>
                              <div style={{fontSize:10.5,color:"#64748b",marginTop:9,lineHeight:1.4}}>Эти сведения меняются только в карточке объекта и сразу отображаются здесь.</div>
                            </div>
                            <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Стоимость проекта, ₸</div><input type="number" className="fi" value={mp.budget||0} onChange={e=>setp("budget",e.target.value)}/></div>
                            <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Финансовый комментарий</div><input className="fi" value={mp.comment||""} onChange={e=>setp("comment",e.target.value)}/></div>
                          </div>
                          <div style={{display:"flex",gap:8,marginTop:18}}>
                            {mp.id && canFinanceDeleteRecord(mp) && <button onClick={delp} style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Удалить</button>}
                            <div style={{flex:1}}/>
                            <button onClick={()=>setFinProjModal(null)} style={{background:"#fff",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                            <button onClick={savep} style={{background:"#059669",color:"#fff",border:"none",borderRadius:9,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Сохранить</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ───── СПРАВОЧНИК ───── */}
            {financeTab==="ref" && (()=>{
              const meta = financeMeta;
              const upd = (m)=>saveFinanceMeta(m);
              return (
                <div style={{display:"grid",gap:18}}>
                  {/* Счета */}
                  <div className="card" style={{padding:"18px 20px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>💳 Счета</div>
                      <button onClick={()=>upd({...meta,accounts:[...meta.accounts,{id:genId(),name:"Новый счёт",opening:0,accType:"bank"}]})} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Счёт</button>
                    </div>
                    {meta.accounts.map((a,i)=>(
                      <div key={a.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
                        <input className="fi" style={{flex:"1 1 140px"}} value={a.name} onChange={e=>{const acc=[...meta.accounts];acc[i]={...a,name:e.target.value};upd({...meta,accounts:acc});}}/>
                        <select className="fi" style={{width:"auto",minWidth:130}} value={a.accType||"bank"} onChange={e=>{const acc=[...meta.accounts];acc[i]={...a,accType:e.target.value};upd({...meta,accounts:acc});}}>
                          {[["cash","Наличные"],["bank","Безналичные"],["card","Карта физлица"],["ewallet","Электронный"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                        </select>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:11,color:"#94a3b8"}}>остаток на начало</span>
                          <input className="fi" type="number" style={{width:110}} value={a.opening} onChange={e=>{const acc=[...meta.accounts];acc[i]={...a,opening:Number(e.target.value)||0};upd({...meta,accounts:acc});}}/>
                        </div>
                        <button onClick={async ()=>{if(await confirmTyped("Удалить счёт «"+a.name+"»?\nОперации, у которых указан этот счёт, останутся в истории, но счёт из справочника пропадёт — баланс по ним перестанет считаться.")){upd({...meta,accounts:meta.accounts.filter(x=>x.id!==a.id)});}}} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16}}>✕</button>
                      </div>
                    ))}
                  </div>
                  {/* Статьи баланса теперь полностью выводятся из операций — ручной ввод не нужен */}
                  <div className="card" style={{padding:"16px 20px",background:"#f0fdf4",border:"1px solid #bbf7d0"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#166534",marginBottom:6}}>✅ Баланс автоматически из операций</div>
                    <div style={{fontSize:12,color:"#15803d",lineHeight:1.6}}>
                      Все статьи баланса формируются из операций:<br/>
                      • <b>Основные средства</b> — расходы категории «Инвестиции (покупка активов)»<br/>
                      • <b>Займы выданные, залоги, запасы</b> — расходы категории «Выданные займы и прочие активы»<br/>
                      • <b>Займы полученные, кредиты, вклады</b> — доходы/расходы категории «Финансирование»<br/>
                      • <b>Денежные средства</b> — остатки по всем счетам<br/>
                      • <b>Дебиторка</b> — разница бюджета проектов и полученных оплат
                    </div>
                  </div>
                  {/* Категории доходов и расходов */}
                  {[["income","Доходы","#059669"],["expense","Расходы","#dc2626"]].map(([key,lbl,col])=>(
                    <div key={key} className="card" style={{padding:"18px 20px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div style={{fontSize:14,fontWeight:800,color:col}}>{key==="income"?"📈":"📉"} Категории: {lbl}</div>
                        <button onClick={()=>upd({...meta,[key]:[...meta[key],{cat:"Новая категория",subs:[]}]})} style={{background:col+"12",color:col,border:"1px solid "+col+"33",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Категория</button>
                      </div>
                      {meta[key].map((c,ci)=>(
                        <div key={ci} style={{marginBottom:14,paddingBottom:12,borderBottom:"1px solid #f1f5f9"}}>
                          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                            <input className="fi" style={{flex:1,fontWeight:700}} value={c.cat} onChange={e=>{const arr=[...meta[key]];arr[ci]={...c,cat:e.target.value};upd({...meta,[key]:arr});}}/>
                            <button onClick={()=>{const arr=[...meta[key]];arr[ci]={...c,subs:[...(c.subs||[]),"Новая подкатегория"]};upd({...meta,[key]:arr});}} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"6px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",color:"#475569",whiteSpace:"nowrap"}}>+ подкат.</button>
                            <button onClick={async ()=>{if(await confirmTyped("Удалить категорию «"+c.cat+"»?\nОперации с этой категорией останутся в истории, но категория из справочника пропадёт.")){const arr=meta[key].filter((_,x)=>x!==ci);upd({...meta,[key]:arr});}}} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:15}}>✕</button>
                          </div>
                          <div style={{paddingLeft:14,display:"flex",flexDirection:"column",gap:5}}>
                            {(c.subs||[]).map((s,si)=>(
                              <div key={si} style={{display:"flex",gap:6,alignItems:"center"}}>
                                <span style={{color:"#cbd5e1"}}>•</span>
                                <input className="fi" style={{flex:1,fontSize:12,padding:"5px 9px"}} value={s} onChange={e=>{const arr=[...meta[key]];const subs=[...c.subs];subs[si]=e.target.value;arr[ci]={...c,subs};upd({...meta,[key]:arr});}}/>
                                <button onClick={()=>{const arr=[...meta[key]];arr[ci]={...c,subs:c.subs.filter((_,x)=>x!==si)};upd({...meta,[key]:arr});}} style={{background:"none",border:"none",color:"#cbd5e1",cursor:"pointer",fontSize:13}}>✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {/* Импорт / экспорт */}
                  <div className="card" style={{padding:"18px 20px"}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:6}}>📥 Импорт / экспорт данных</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Импорт добавит операции и проекты из файла к текущим (без замены существующих). Файл JSON со структурой {`{meta, transactions, projects}`}.</div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                      <label style={{background:"#2563eb",color:"#fff",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:finImportBusy?"wait":"pointer",fontFamily:"inherit",opacity:finImportBusy?.6:1}}>
                        {finImportBusy?"Импорт...":"📂 Импортировать JSON"}
                        <input type="file" accept=".json,application/json" style={{display:"none"}} disabled={finImportBusy}
                          onChange={async e=>{
                            const file=e.target.files?.[0]; if(!file) return;
                            if (!confirmDangerous(`Импортировать файл «${file.name}»?\nОперации, справочник категорий и проекты из файла добавятся к текущим (не заменят целиком).`)) { e.target.value=""; return; }
                            setFinImportBusy(true);
                            try {
                              const txt=await file.text(); const data=JSON.parse(txt);
                              if(data.meta && data.meta.accounts) await saveFinanceMeta(data.meta);
                              if(Array.isArray(data.transactions)){
                                const norm=data.transactions.map(t=>({...t,id:t.id||genId(),updatedAt:Date.now()}));
                                await saveFinanceTx(norm,{replace:false,allowEmpty:true});
                              }
                              if(Array.isArray(data.projects)){
                                const norm=data.projects.map(p=>({...p,id:p.id||genId()}));
                                await saveFinanceProjects(norm);
                              }
                              alert("Импортировано операций: "+(data.transactions?.length||0)+(data.projects?" | проектов: "+data.projects.length:""));
                            } catch(err){ alert("Ошибка импорта: "+err.message); }
                            setFinImportBusy(false); e.target.value="";
                          }}/>
                      </label>
                      <button onClick={()=>{
                        const data={meta:financeMeta,transactions:financeTx,projects:finProjects};
                        const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
                        const url=URL.createObjectURL(blob); const a=document.createElement("a");
                        a.href=url; a.download="titovstroy-finance-"+new Date().toISOString().slice(0,10)+".json";
                        document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),5000);
                      }} style={{background:"#fff",color:"#475569",border:"1px solid #e2e8f0",borderRadius:9,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💾 Экспорт ({financeTx.length})</button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ───── КОРЗИНА ОПЕРАЦИЙ ───── */}
            {finTxTrash && (
              <div onClick={()=>setFinTxTrash(false)} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"22px 24px",width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                    <h3 style={{margin:0,fontSize:16,fontWeight:800,color:"#0f172a"}}>🗑 Корзина операций</h3>
                    <button onClick={()=>setFinTxTrash(false)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>✕</button>
                  </div>
                  {financeTx.filter(t=>t.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt).map(t=>{
                    const TYPE_COLOR={income:"#059669",expense:"#dc2626",transfer:"#7c3aed"};
                    const TYPE_LABEL={income:"Доход",expense:"Расход",transfer:"Перевод"};
                    const daysLeft=Math.max(0,Math.ceil((30*864e5-(Date.now()-(t.deletedAt||0)))/864e5));
                    return (
                      <div key={t.id} style={{borderBottom:"1px solid #f1f5f9",padding:"12px 0",display:"flex",alignItems:"center",gap:12}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:TYPE_COLOR[t.type]||"#94a3b8",flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{TYPE_LABEL[t.type]} · {new Intl.NumberFormat("ru-RU").format(Math.round(Number(t.amount)||0))} ₸</div>
                          <div style={{fontSize:11,color:"#94a3b8"}}>{t.category||""}{t.note?" · "+t.note:""} · {new Date(t.date||t.createdAt||0).toLocaleDateString("ru-RU")}</div>
                          <div style={{fontSize:11,color:daysLeft<=3?"#dc2626":"#f59e0b",fontWeight:600}}>осталось {daysLeft} дн.</div>
                        </div>
                          {canFinanceDeleteRecord(t) && <button onClick={()=>{ saveFinanceTx([{...t,deletedAt:undefined,updatedAt:Date.now()}],{replace:false}).catch(e=>console.warn("bg tx restore err", e)); }}
                            style={{background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↩</button>
                          }
                          {canFinanceDeleteRecord(t) && <button onClick={async()=>{if(await confirmTyped("Удалить операцию безвозвратно?")) saveFinanceTx([],{replace:false,removedIds:[t.id],allowEmpty:true}).catch(e=>console.warn("bg tx delete err", e)); }}
                          style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.2)",borderRadius:7,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
                        }
                      </div>
                    );
                  })}
                  {financeTx.filter(t=>t.deletedAt).length===0 && <div style={{textAlign:"center",color:"#94a3b8",padding:"30px 0"}}>Корзина пуста</div>}
                </div>
              </div>
            )}

            {/* ───── МОДАЛКА: операция ───── */}
            {finTxModal && (()=>{
              const m = finTxModal;
              const set = (k,v)=>setFinTxModal(p=>({...p,[k]:v}));
              const catSource = m.type==="income" ? financeMeta.income : m.type==="expense" ? financeMeta.expense : [];
              const subSource = catSource.find(c=>c.cat===m.category)?.subs || [];
              const save = ()=>{
                if (m.id ? !canFinanceEditRecord(m) : !canFinanceCreate) return;
                const amt=Number(m.amount)||0;
                if(amt<=0){ alert("Укажите сумму"); return; }
                if(m.type==="transfer" && m.account===m.accountTo){ alert("Счета должны отличаться"); return; }
                const ts=m.date?new Date(m.date).getTime():Date.now();
                const tx={ id:m.id||genId(), type:m.type, date:ts, amount:amt, account:m.account, accountTo:m.type==="transfer"?m.accountTo:undefined,
                  category:m.type==="transfer"?"Перевод":m.category, subcategory:m.type==="transfer"?"":m.subcategory, note:m.note||"", contractNo:m.contractNo||"",
                  recipient:m.recipient||"",
                  isAdvance:m.type==="income"?!!m.isAdvance:false,
                  included:m.included!==false, opuMonth:m.opuMonth, createdAt:m.createdAt||Date.now(), createdBy:m.createdBy||currentUser.name, createdById:m.createdById||currentUser.id, updatedAt:Date.now() };
                const isNew = !m.id;
                const _oldTx = m.id ? financeTxRef.current.find(x=>x.id===m.id) : null;
                setFinTxModal(null);
                // merge (replace:false) — не перезатираем облако: операции с других устройств не теряются
                saveFinanceTx([tx],{replace:false});
                // журнал: привязываем к объекту по номеру договора, если получается
                const _oid = (tx.contractNo && (contractsRef.current.find(c=>normCN(c.number||"")===normCN(tx.contractNo)||normCN(c.contractNo||"")===normCN(tx.contractNo))||{}).objectId) || "";
                const _tl = _finTypeLbl[tx.type] || tx.type;
                const _lbl = `${_tl}${tx.category?` · ${tx.category}`:""}${tx.contractNo?` · дог. ${tx.contractNo}`:""}`;
                if (isNew) logChange(currentUser, { entity:"finance_tx", entityId:tx.id, objectId:_oid, label:_lbl, action:"создал операцию", new:_tng(tx.amount) });
                else logChange(currentUser, { entity:"finance_tx", entityId:tx.id, objectId:_oid, label:_lbl, field:"сумма", action:"изменил операцию", old:_tng(_oldTx?.amount), new:_tng(tx.amount) });
              };
              const del = ()=>{
                if (!canFinanceDeleteRecord(m)) return;
                if(!m.id) return; if(!confirm("Переместить операцию в корзину?")) return;
                const ex=financeTxRef.current.find(x=>x.id===m.id); if(!ex){ setFinTxModal(null); return; }
                const deleted={...ex,deletedAt:Date.now(),updatedAt:Date.now()};
                setFinTxModal(null);
                saveFinanceTx([deleted],{replace:false});
                const _doid = (ex.contractNo && (contractsRef.current.find(c=>normCN(c.number||"")===normCN(ex.contractNo)||normCN(c.contractNo||"")===normCN(ex.contractNo))||{}).objectId) || "";
                const _dtl = _finTypeLbl[ex.type] || ex.type;
                logChange(currentUser, { entity:"finance_tx", entityId:m.id, objectId:_doid, label:`${_dtl}${ex.category?` · ${ex.category}`:""}`, action:"удалил операцию", old:_tng(ex.amount) });
              };
              return (
                <div onClick={()=>{setFinCatOpen(false);setFinTxModal(null);}} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
                  <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"22px 24px",width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <h3 style={{margin:0,fontSize:17,fontWeight:800,color:"#0f172a"}}>{m.id?"Изменить":"Новая"} операция</h3>
                      <button onClick={()=>setFinTxModal(null)} style={{background:"none",border:"none",fontSize:20,color:"#94a3b8",cursor:"pointer"}}>✕</button>
                    </div>
                    {/* Тип */}
                    <div style={{display:"flex",gap:6,marginBottom:14}}>
                      {[["income","Доход","#059669"],["expense","Расход","#dc2626"],["transfer","Перевод","#7c3aed"]].map(([k,l,c])=>(
                        <button key={k} onClick={()=>set("type",k)} style={{flex:1,padding:"8px 0",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(m.type===k?c:"#e2e8f0"),background:m.type===k?c:"#fff",color:m.type===k?"#fff":"#94a3b8"}}>{l}</button>
                      ))}
                    </div>
                    <div style={{display:"grid",gap:12}}>
                      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Дата</div><input type="date" className="fi" value={m.date} onChange={e=>set("date",e.target.value)}/></div>
                      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Сумма, ₸</div><NumInput className="fi" value={m.amount} onCommit={v=>set("amount",v)} placeholder="0"/></div>
                      {m.type==="transfer" ? (<>
                        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Со счёта</div><select className="fi" value={m.account} onChange={e=>set("account",e.target.value)}>{financeMeta.accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
                        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>На счёт</div><select className="fi" value={m.accountTo} onChange={e=>set("accountTo",e.target.value)}>{financeMeta.accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
                      </>) : (<>
                        <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Счёт</div><select className="fi" value={m.account} onChange={e=>set("account",e.target.value)}>{financeMeta.accounts.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
                        {(()=>{
                          const q = finCatSearch.toLowerCase();
                          // строим плоский список с заголовками категорий
                          const rows = [];
                          for (const grp of catSource) {
                            const matchedSubs = grp.subs.filter(s => !q || s.toLowerCase().includes(q) || grp.cat.toLowerCase().includes(q));
                            if (!matchedSubs.length && q && !grp.cat.toLowerCase().includes(q)) continue;
                            rows.push({ kind:"header", cat:grp.cat });
                            for (const s of matchedSubs) rows.push({ kind:"sub", cat:grp.cat, sub:s });
                          }
                          const selectItem = (cat, sub) => {
                            set("category", cat);
                            set("subcategory", sub||"");
                            setFinCatSearch(sub||cat);
                            setFinCatOpen(false);
                          };
                          const displayVal = finCatSearch;
                          return (
                            <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Статья</div>
                              <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                                <input className="fi" style={{paddingRight:28}} value={displayVal}
                                  onFocus={()=>setFinCatOpen(true)}
                                  onBlur={()=>setTimeout(()=>setFinCatOpen(false),180)}
                                  onChange={e=>{ setFinCatSearch(e.target.value); setFinCatOpen(true); set("category",e.target.value); set("subcategory",""); }}
                                  placeholder="— начните вводить или выберите —"/>
                                {displayVal && <span onMouseDown={e=>{e.preventDefault();setFinCatSearch("");set("category","");set("subcategory","");setFinCatOpen(false);}} style={{position:"absolute",right:8,cursor:"pointer",color:"#94a3b8",fontSize:14,lineHeight:1}}>✕</span>}
                              </div>
                              {finCatOpen && rows.length>0 && (
                                <div style={{position:"absolute",zIndex:999,top:"100%",left:0,right:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.13)",maxHeight:260,overflowY:"auto",marginTop:2}}>
                                  {rows.map((r,i)=> r.kind==="header"
                                    ? <div key={i} style={{padding:"8px 14px 4px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,background:"#f8fafc",borderBottom:"1px solid #f1f5f9",position:"sticky",top:0}}>{r.cat}</div>
                                    : <div key={i} onMouseDown={e=>{e.preventDefault();selectItem(r.cat,r.sub);}}
                                        style={{padding:"8px 14px 8px 24px",fontSize:13,color:"#0f172a",cursor:"pointer",transition:"background .1s",background: m.subcategory===r.sub&&m.category===r.cat ? "#eff6ff" : "transparent"}}
                                        onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"}
                                        onMouseLeave={e=>e.currentTarget.style.background=m.subcategory===r.sub&&m.category===r.cat?"#eff6ff":"transparent"}
                                      >{r.sub}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </>)}
                      {(()=>{
                        const pq = finTxProjSearch.toLowerCase();
                        const projRows = finProjects.filter(p=>!pq || (p.contractNo||"").toLowerCase().includes(pq) || (p.description||"").toLowerCase().includes(pq) || (p.comment||"").toLowerCase().includes(pq));
                        return (
                          <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Проект / № договора</div>
                            <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                              <input className="fi" style={{paddingRight:28}} value={finTxProjSearch}
                                onFocus={()=>setFinTxProjOpen(true)}
                                onBlur={()=>setTimeout(()=>setFinTxProjOpen(false),180)}
                                onChange={e=>{ setFinTxProjSearch(e.target.value); setFinTxProjOpen(true); set("contractNo",e.target.value); }}
                                placeholder="— без проекта —"/>
                              {finTxProjSearch && <span onMouseDown={e=>{e.preventDefault();setFinTxProjSearch("");set("contractNo","");setFinTxProjOpen(false);}} style={{position:"absolute",right:8,cursor:"pointer",color:"#94a3b8",fontSize:14,lineHeight:1}}>✕</span>}
                            </div>
                            {finTxProjOpen && (
                              <div style={{position:"absolute",zIndex:999,top:"100%",left:0,right:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.13)",maxHeight:220,overflowY:"auto",marginTop:2}}>
                                <div onMouseDown={e=>{e.preventDefault();setFinTxProjSearch("");set("contractNo","");setFinTxProjOpen(false);}} style={{padding:"9px 14px",fontSize:12,color:"#94a3b8",cursor:"pointer",borderBottom:"1px solid #f1f5f9"}}
                                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>— без проекта —</div>
                                {projRows.map((p,i)=>(
                                  <div key={i} onMouseDown={e=>{e.preventDefault();setFinTxProjSearch(p.contractNo||"");set("contractNo",p.contractNo||"");setFinTxProjOpen(false);}}
                                    style={{padding:"9px 14px",fontSize:13,color:"#0f172a",cursor:"pointer",background:m.contractNo===p.contractNo?"#eff6ff":"transparent",borderBottom:"1px solid #f8fafc"}}
                                    onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"} onMouseLeave={e=>e.currentTarget.style.background=m.contractNo===p.contractNo?"#eff6ff":"transparent"}>
                                    <span style={{fontWeight:700}}>{p.contractNo}</span>
                                    {p.description&&<span style={{color:"#64748b",marginLeft:6,fontSize:12}}>{p.description.slice(0,50)}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {m.subcategory==="Дивиденды учредителям" && (
                        <div>
                          <div style={{fontSize:11,color:"#d97706",marginBottom:4,fontWeight:700}}>👤 Получатель (учредитель)</div>
                          <input className="fi" value={m.recipient||""} onChange={e=>set("recipient",e.target.value)} placeholder="Имя учредителя"/>
                        </div>
                      )}
                      <div><div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Комментарий</div><input className="fi" value={m.note} onChange={e=>set("note",e.target.value)} placeholder="комментарий"/></div>
                      {m.type==="income" && (
                        <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,color:"#475569",cursor:"pointer",fontWeight:600,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:9,padding:"9px 11px"}}>
                          <input type="checkbox" checked={!!m.isAdvance} onChange={e=>set("isAdvance",e.target.checked)} style={{width:16,height:16,cursor:"pointer",marginTop:1}}/>
                          <span>Аванс (предоплата) — <b>обязательство, не выручка</b>. Учтётся в ДДС как приход, но в ОПиУ не попадёт в доход. Снимите галочку, когда работа сдана.</span>
                        </label>
                      )}
                      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#475569",cursor:"pointer",fontWeight:600}}>
                        <input type="checkbox" checked={m.included!==false} onChange={e=>set("included",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
                        Учитывать в балансе и отчётах
                      </label>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:18,flexWrap:"wrap"}}>
                      {m.id && canFinanceDeleteRecord(m) && <button onClick={del} style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
                      {m.id && canFinanceCreate && <button onClick={()=>{ const copy={...m,id:null,createdAt:undefined,updatedAt:undefined,date:new Date().toISOString().slice(0,10)}; setFinCatSearch(copy.subcategory||copy.category||""); setFinTxProjSearch(copy.contractNo||""); setFinTxModal(copy); }} style={{background:"#f8fafc",color:"#475569",border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📋 Копия</button>}
                      <div style={{flex:1}}/>
                      <button onClick={()=>setFinTxModal(null)} style={{background:"#fff",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                      <button onClick={save} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:9,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Сохранить</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
}
