import { useState, useMemo, useEffect, useCallback, useRef, Fragment, lazy, Suspense } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, runTransaction } from "firebase/database";
import ProductionModule, { flushPendingProduction, stopProductionSession, hasPendingProduction, productionDraftsAreDurable, startProductionSession, setProductionCommandHandler } from "./production/ProductionModule.jsx";
import { emptyProduction } from "./production/constants.js";
import { applyProductionCommand, createTxnApplier, accountProductionFailure, isBlockedWhileEnding, awaitQueueSettled, isRegenerableProductionCommand, _stageKey, normalizeProductionIds } from "./production/commands.js";
import { countAllProductionRecovery, listProductionRetries, saveProductionRetry, removeProductionRetry } from "./production/drafts.js";
import { triggerParserRun } from "./masters/parserTrigger.js";
import { DOCUMENT_TEMPLATE_BACKUP_SECTIONS, documentTemplateBackupSpecs, restoreDocumentTemplateSections } from "./documents/documentTemplateBackup.js";
import { createDocumentTemplateFeaturePolicy } from "./documents/documentTemplateKeys.js";
import { createDocumentTemplateRuntime } from "./documents/documentTemplateRuntime.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { normCN, CATALOG_DEFAULTS, withCatalogOverrides, groupData, tengeInWords, DEFAULT_FIN_META, mergeFinMeta, computeIssues, estimatesForObject, classifyCloudArr, classifyCloudObj, preBackupDecision, mergeAuditEntries, validateBackupSchema, isBackupRestorable, makeDirtyMarker, listOwnedDirty, adoptUserDirty, discardOwnedDirty, listFlushableDirty, visibleDirtyKeys, isLegacyDirtyMarker, mayClearDirtyOnSuccess, mayUseLocalCopy, clearSyncedLocalMirror, compactLocalStorageMirrors, resolveVerifiedCloudRead, isStaleApprovalObject, buildEstimatorDashboard, buildFinanceProjectView, financeStatusMeta, isActiveFinanceStatus, buildAuthorizedObjectPatch, ROLE_DEFINITIONS, DEFAULT_ROLE_PERMISSIONS, normalizeRolePermissions, permissionsForRole, accessAllows, docTypeAllows, EDIT_LEASE_KEY, LEASE_HEARTBEAT_MS, makeLease, parseLease, ownsActiveLease, claimFallbackLease } from "./utils.js";

const DocumentTemplateAdminRoute = lazy(() => import("./documents/DocumentTemplateAdminRoute.jsx"));
const DocumentInstanceEditor = lazy(() => import("./documents/DocumentInstanceEditor.jsx"));
const MastersSection = lazy(() => import("./masters/MastersSection.jsx").then(module => ({ default: module.MastersSection })));
const ProductionCalendar = lazy(() => import("./production/ProductionCalendar.jsx").then(module => ({ default: module.ProductionCalendar })));
const PublicKP = lazy(() => import("./public/PublicKP.jsx"));
const PublicProgress = lazy(() => import("./public/PublicProgress.jsx"));
const AdminPageContent = lazy(() => import("./admin/AdminPageContent.jsx"));
const AnalyticsPage = lazy(() => import("./analytics/AnalyticsPage.jsx"));
const FinancePage = lazy(() => import("./finance/FinancePage.jsx"));
const DOCUMENT_TEMPLATE_FEATURE = createDocumentTemplateFeaturePolicy();

// Debounce hook — задерживает обновление значения, чтобы не тригерить ре-рендер на каждый символ
function useDebounce(value, ms) {
  const [dv, setDv] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDv(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return dv;
}

// Боевая база (по умолчанию). НЕ меняется — на продакшне переменных окружения нет,
// поэтому используется именно этот конфиг, как раньше.
const _FB_PROD = {
  apiKey:            "AIzaSyCPawCUYGY20SB5cLLszjoNzK5ytew9tCs",
  authDomain:        "titovstroy-da1cf.firebaseapp.com",
  databaseURL:       "https://titovstroy-da1cf-default-rtdb.firebaseio.com",
  projectId:         "titovstroy-da1cf",
  storageBucket:     "titovstroy-da1cf.firebasestorage.app",
  messagingSenderId: "736574510792",
  appId:             "1:736574510792:web:b5d243a051caf4887337fd"
};
// Конфиг из окружения (Vercel: разные значения для Production/Preview). Если задан
// VITE_FB_DATABASE_URL — используем его (dev-база на превью-ветке), иначе — боевую.
const _env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
const _FB_ENV = {
  apiKey:            _env.VITE_FB_API_KEY,
  authDomain:        _env.VITE_FB_AUTH_DOMAIN,
  databaseURL:       _env.VITE_FB_DATABASE_URL,
  projectId:         _env.VITE_FB_PROJECT_ID,
  storageBucket:     _env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: _env.VITE_FB_SENDER_ID,
  appId:             _env.VITE_FB_APP_ID,
};
// Признак dev-окружения: конфиг взят из переменных (значит база — не боевая)
const IS_DEV_ENV = !!_FB_ENV.databaseURL;
const firebaseConfig = IS_DEV_ENV ? _FB_ENV : _FB_PROD;
// Обёртка над window.confirm для опасных массовых операций (восстановление бэкапа,
// импорт JSON и т.п.): на боевой базе добавляет явное предупреждение перед вопросом,
// чтобы не восстановить/импортировать что-то не туда по рассеянности.
const confirmDangerous = (message) => {
  const prefix = IS_DEV_ENV ? "" : "⚠️ ВЫ В БОЕВОЙ БАЗЕ (реальные данные компании).\n\n";
  return window.confirm(prefix + message);
};

// ── Typed-confirm для БЕЗВОЗВРАТНЫХ удалений (без корзины/бэкапа-в-один-клик) ──
// Императивный API поверх одной модалки, смонтированной один раз в MainApp (как window.confirm,
// но требует напечатать слово подтверждения — обычный клик по confirm() слишком легко нажать
// случайно для действия, которое нельзя отменить через интерфейс).
let _dangerModalResolve = null;
let _setDangerModalState = null;
function confirmTyped(message, requireWord = "УДАЛИТЬ") {
  return new Promise(resolve => {
    if (!_setDangerModalState) { resolve(window.confirm(message)); return; } // модалка ещё не смонтирована — fallback
    _dangerModalResolve = resolve;
    _setDangerModalState({ message, requireWord });
  });
}
function DangerConfirmModal() {
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

// ── Панель проблем: «Что горит сегодня» (дашборд) и «Проверка базы» (Админка) ──
// Компактные карточки в адаптивную сетку (2+ колонки), группы сворачиваются, длинные
// группы по умолчанию показывают несколько первых с «показать все» — чтобы панель не
// растягивалась в бесконечный вертикальный список. Клик по карточке — onNav; «×» —
// скрыть до завтра (если dismissable и передан onDismiss).
const _ISSUE_GROUPS = ["Производство", "Финансы", "Клиенты", "Данные"];
const _GRP_ICON = { "Производство":"🔨", "Финансы":"💰", "Клиенты":"👤", "Данные":"🗂" };
const _ISSUE_CAP = 6;
function IssuePanel({ issues, onNav, onDismiss, emptyText = "✓ Всё чисто — проблем не найдено" }) {
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
                        {onDismiss && issue.dismissable && <button type="button" title="Скрыть до завтра" onClick={e=>{e.stopPropagation();onDismiss(issue.id);}}
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

// Дашборд показывает не россыпь одинаковых карточек, а короткую очередь решений:
// одна строка = один тип проблемы, внутри раскрывается список конкретных объектов.
const _OPS_META = {
  "overdue-stage": { icon:"⏱", title:"Просрочены этапы", hint:"Срок работ уже истёк" },
  "no-foreman": { icon:"👷", title:"Не назначен ответственный", hint:"Объект запущен без прораба" },
  "signed-nofin": { icon:"₸", title:"Нет финансового проекта", hint:"Договор подписан, но финансовый контур не связан" },
  "client-remark": { icon:"!", title:"Новые замечания клиентов", hint:"Нужен ответ или действие по объекту" },
  "near-handover": { icon:"⚑", title:"Скоро сдача", hint:"До срока меньше недели, остались открытые этапы" },
};
const _issueKind = issue => String(issue?.id || "other").split(":")[0];
function OperationsPanel({ issues, onNav, onDismiss, emptyText = "Всё под контролем — срочных задач нет" }) {
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
              <div style={{display:"flex",alignItems:"center",gap:5}}>{onDismiss&&issue.dismissable&&<button type="button" title="Скрыть до завтра" onClick={event=>{event.stopPropagation();onDismiss(issue.id);}} style={{width:26,height:26,border:"1px solid #dbe3ec",borderRadius:6,background:"#fff",color:"#94a3b8",cursor:"pointer"}}>×</button>}<span style={{color:"#94a3b8",fontSize:16}}>›</span></div>
            </div>)}
          </div>}
        </div>;
      })}
    </section>
  );
}

function StaleObjectsPanel({ items, onOpen, onShowAll, fmt, title = "Без движения 14+ дней" }) {
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

let _fbDb = null;
let _fbAuth = null;
// Promise resolves when anonymous auth is ready (or immediately if auth unavailable)
let _fbAuthReady = Promise.resolve();
try {
  const _fbApp = initializeApp(firebaseConfig);
  _fbDb = getDatabase(_fbApp);
  _fbAuth = getAuth(_fbApp);
  const _realAuthReady = new Promise(resolve => {
    const unsub = onAuthStateChanged(_fbAuth, user => {
      unsub();
      if (user) { resolve(); }
      else { signInAnonymously(_fbAuth).then(resolve).catch(resolve); }
    });
  });
  // КОРЕНЬ БАГА «кнопка не откликается, потом всё разом открывается»: КАЖДАЯ запись/чтение
  // в облако (storage.set/get/mutateTransaction) сначала ждёт этот ЕДИНЫЙ промис. Раньше он
  // ничем не был ограничен по времени — если анонимный вход подвисал на старте (сетевой сбой
  // при загрузке страницы), ВСЕ последующие сохранения по ВСЕМУ приложению зависали НАВСЕГДА
  // (не секунды — часами), а очередь одного ключа (saveListProtected) копила все клики подряд.
  // Как только auth наконец отваливался сам собой — все накопленные клики срабатывали разом
  // (отсюда пачка окон АВР, открывшихся через полчаса). Таймаут не отменяет реальный вход —
  // просто не даёт ОДНОМУ подвисшему хендшейку остановить приложение навсегда; дальнейшие
  // Firebase-вызовы и так обёрнуты в свои _race()-таймауты и умеют деградировать (dirty-флаг,
  // REST-фолбэк) — не хуже, чем раньше, но конечно, а не бесконечно.
  _fbAuthReady = Promise.race([_realAuthReady, new Promise(resolve => setTimeout(resolve, 10000))]);
  // ── Firebase App Check (по умолчанию ВЫКЛЮЧЕН) ──
  // Подтверждает Firebase, что запросы идут из настоящего приложения. ВАЖНО: раньше App Check
  // инициализировался при одном лишь наличии VITE_RECAPTCHA_SITE_KEY. На проде ключ задан, но
  // домен titovstroy.kz не зарегистрирован в reCAPTCHA/консоли App Check → токен-обмен отдаёт
  // 403, а reCAPTCHA на повторных отказах уходит в блок на 24 часа. Enforce на Realtime Database
  // при этом ВЫКЛЮЧЕН (проверено), т.е. защиты сейчас ноль, а вред (403-шум + троттлинг) есть.
  // Поэтому теперь нужен ЯВНЫЙ флаг VITE_APPCHECK_ON="1" ВДОБАВОК к ключу — просто «забытый»
  // ключ в env больше не может молча ломать прод. Локалхост не трогаем (нет ключа/флага → нет init).
  //
  // Как ПРАВИЛЬНО включить (только после настройки, иначе снова 403):
  //  1. https://www.google.com/recaptcha/admin → ключ reCAPTCHA v3, в «Домены» добавить
  //     titovstroy.kz, www.titovstroy.kz и *.vercel.app (превью).
  //  2. Firebase Console → App Check → своё веб-приложение → Register → reCAPTCHA v3 → тот же site key.
  //  3. Vercel → Environment Variables: VITE_RECAPTCHA_SITE_KEY (site key) + VITE_APPCHECK_ON=1 → Redeploy.
  //  4. Убедиться по метрикам App Check, что идут verified-запросы (403 нет), и ТОЛЬКО ПОТОМ включать
  //     Enforce для Realtime Database. Иначе Enforce без валидных токенов положит всю базу.
  if (_env.VITE_RECAPTCHA_SITE_KEY && _env.VITE_APPCHECK_ON === "1") {
    import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
      try { initializeAppCheck(_fbApp, { provider: new ReCaptchaV3Provider(_env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true }); }
      catch(e) { console.warn("App Check init failed", e); }
    }).catch(()=>{});
  }
} catch(e) {}

const WORKS_DATA = [
  { code:"DEM-001", cat:"Черновые", sub:"Демонтаж", name:"Снятие обоев (не до основания)", unit:"м²", tiers:[], cost:200, margin:0.4, fixedPrice:333 },
  { code:"DEM-002", cat:"Черновые", sub:"Демонтаж", name:"Снятие краски (водоэмульсия / старая побелка)", unit:"м²", tiers:[], cost:700, margin:0.4, fixedPrice:1167 },
  { code:"DEM-003", cat:"Черновые", sub:"Демонтаж", name:"Снятие краски (советская / старая)", unit:"м²", tiers:[], cost:1900, margin:0.4, fixedPrice:3167 },
  { code:"DEM-004", cat:"Черновые", sub:"Демонтаж", name:"Снятие краски (сложный демонтаж)", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"DEM-005", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж плитки, керамогранит", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"DEM-006", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж декоративных покрытий", unit:"м²", tiers:[], cost:1100, margin:0.4, fixedPrice:1833 },
  { code:"DEM-007", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж гипсокартонных конструкций", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"DEM-008", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж натяжных потолков", unit:"м²", tiers:[], cost:300, margin:0.4, fixedPrice:500 },
  { code:"DEM-009", cat:"Черновые", sub:"Демонтаж", name:"Удаление штукатурки", unit:"м²", tiers:[], cost:1900, margin:0.4, fixedPrice:3167 },
  { code:"DEM-010", cat:"Черновые", sub:"Демонтаж", name:"Снятие старой стяжки (пол до основания)", unit:"м²", tiers:[], cost:4500, margin:0.4, fixedPrice:7500 },
  { code:"DEM-011", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж линолеума", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"DEM-012", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж ламината", unit:"м²", tiers:[], cost:450, margin:0.4, fixedPrice:750 },
  { code:"DEM-013", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж паркета", unit:"м²", tiers:[], cost:900, margin:0.4, fixedPrice:1500 },
  { code:"DEM-014", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж плинтусов", unit:"м.п.", tiers:[], cost:200, margin:0.4, fixedPrice:333 },
  { code:"DEM-015", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж галтели", unit:"м.п.", tiers:[], cost:100, margin:0.4, fixedPrice:167 },
  { code:"DEM-016", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж межкомнатных дверей (старые)", unit:"шт", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"DEM-017", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж межкомнатных дверей (новые)", unit:"шт", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"DEM-018", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж дверей (железные)", unit:"шт", tiers:[], cost:6000, margin:0.4, fixedPrice:10000 },
  { code:"DEM-019", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж дверей с сохранением для повторной установки", unit:"шт", tiers:[], cost:8000, margin:0.4, fixedPrice:13333 },
  { code:"DEM-020", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж сантехприборов", unit:"шт", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"DEM-021", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж розеток, выключателей", unit:"шт", tiers:[], cost:300, margin:0.4, fixedPrice:500 },
  { code:"DEM-022", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (ГКЛ)", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"DEM-023", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (монолит)", unit:"м²", tiers:[], cost:12000, margin:0.4, fixedPrice:20000 },
  { code:"DEM-024", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (кирпич)", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"DEM-025", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж перегородок (газоблок)", unit:"м²", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"DEM-026", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж радиатора отопления", unit:"шт", tiers:[], cost:5000, margin:0.4, fixedPrice:8333 },
  { code:"DEM-027", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж маяков (стены)", unit:"м²", tiers:[], cost:180, margin:0.4, fixedPrice:300 },
  { code:"DEM-028", cat:"Черновые", sub:"Демонтаж", name:"Демонтаж маяков (пол)", unit:"м²", tiers:[], cost:150, margin:0.4, fixedPrice:250 },
  { code:"MUS-001", cat:"Черновые", sub:"Вынос/мусор", name:"Вынос строительного мусора", unit:"усл.", tiers:[], cost:20000, margin:0.4, fixedPrice:33333 },
  { code:"MUS-002", cat:"Черновые", sub:"Вынос/мусор", name:"Вывоз строительного мусора", unit:"усл.", tiers:[], cost:20000, margin:0.4, fixedPrice:33333 },
  { code:"WALL-001", cat:"Черновые", sub:"Выравнивание стен", name:"Грунтовка основания стен", unit:"м²", tiers:[], cost:200, margin:0.4, fixedPrice:333 },
  { code:"WALL-002", cat:"Черновые", sub:"Выравнивание стен", name:"Монтаж маяков", unit:"м²", tiers:[], cost:450, margin:0.4, fixedPrice:750 },
  { code:"WALL-003", cat:"Черновые", sub:"Выравнивание стен", name:"Штукатурка стен (1–3 см)", unit:"м²", tiers:[], cost:1700, margin:0.4, fixedPrice:2833 },
  { code:"WALL-004", cat:"Черновые", sub:"Выравнивание стен", name:"Штукатурка стен (4–8 см)", unit:"м²", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"WALL-005", cat:"Черновые", sub:"Выравнивание стен", name:"Армирование сеткой (стены)", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"WALL-006", cat:"Черновые", sub:"Выравнивание стен", name:"Шпаклёвка стен", unit:"м²", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
  { code:"WALL-007", cat:"Черновые", sub:"Выравнивание стен", name:"Ошкуривание стен", unit:"м²", tiers:[], cost:400, margin:0.4, fixedPrice:667 },
  { code:"WALL-008", cat:"Черновые", sub:"Выравнивание стен", name:"Восстановление углов", unit:"м.п.", tiers:[], cost:800, margin:0.4, fixedPrice:1333 },
  { code:"WALL-009", cat:"Черновые", sub:"Выравнивание стен", name:"Откосы под окна/двери", unit:"м.п.", tiers:[], cost:1800, margin:0.4, fixedPrice:3000 },
  { code:"FLOOR-001", cat:"Черновые", sub:"Выравнивание пола", name:"Гидроизоляция пола", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"FLOOR-002", cat:"Черновые", sub:"Выравнивание пола", name:"Армирование сеткой (пол)", unit:"м²", tiers:[], cost:600, margin:0.4, fixedPrice:1000 },
  { code:"FLOOR-003", cat:"Черновые", sub:"Выравнивание пола", name:"Монтаж маяков (пол)", unit:"м.п.", tiers:[], cost:450, margin:0.4, fixedPrice:750 },
  { code:"FLOOR-004", cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка ц/п до 80 мм (под керамзит)", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"FLOOR-005", cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка ц/п 5–8 см", unit:"м²", tiers:[], cost:3000, margin:0.4, fixedPrice:5000 },
  { code:"FLOOR-006", cat:"Черновые", sub:"Выравнивание пола", name:"Стяжка ц/п 9–12 см", unit:"м²", tiers:[], cost:3900, margin:0.4, fixedPrice:6500 },
  { code:"FLOOR-007", cat:"Черновые", sub:"Выравнивание пола", name:"Засыпка керамзита до 100 мм", unit:"м²", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"FLOOR-008", cat:"Черновые", sub:"Выравнивание пола", name:"Наливной пол (выравнивание под покрытия)", unit:"м²", tiers:[], cost:1800, margin:0.4, fixedPrice:3000 },
  { code:"EL-001", cat:"Черновые", sub:"Электромонтаж", name:"Составление схемы электрики", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"EL-002", cat:"Черновые", sub:"Электромонтаж", name:"Штробление стен и потолков", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"EL-003", cat:"Черновые", sub:"Электромонтаж", name:"Прокладка кабелей", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"EL-004", cat:"Черновые", sub:"Электромонтаж", name:"Установка подрозетников", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"EL-005", cat:"Черновые", sub:"Электромонтаж", name:"Прокладка линий под кондиционер", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"EL-006", cat:"Черновые", sub:"Электромонтаж", name:"Монтаж кабеля под интернет/тв", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELSH-001", cat:"Черновые", sub:"Электрощит", name:"Сборка электрощита", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELSH-002", cat:"Черновые", sub:"Электрощит", name:"Автоматы, УЗО, дифавтоматы", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELSH-003", cat:"Черновые", sub:"Электрощит", name:"Распределение групп нагрузки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"OUT-001", cat:"Черновые", sub:"Выводы", name:"Розетки (вывод)", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"OUT-002", cat:"Черновые", sub:"Выводы", name:"Выключатели (вывод)", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"OUT-003", cat:"Черновые", sub:"Выводы", name:"Выводы под светильники", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SAN-001", cat:"Черновые", sub:"Водоснабжение", name:"Разводка труб холодной и горячей воды", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"SAN-002", cat:"Черновые", sub:"Водоснабжение", name:"Коллекторная система", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SAN-003", cat:"Черновые", sub:"Водоснабжение", name:"Замена стояков", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"KAN-001", cat:"Черновые", sub:"Канализация", name:"Прокладка канализационных труб", unit:"м.п.", tiers:[], cost:null, margin:0.4 },
  { code:"KAN-002", cat:"Черновые", sub:"Канализация", name:"Выводы под сантехнику", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SU-001", cat:"Черновые", sub:"Подготовка санузла", name:"Ниши под инсталляцию", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SU-002", cat:"Черновые", sub:"Подготовка санузла", name:"Перенос точек", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SU-003", cat:"Черновые", sub:"Подготовка санузла", name:"Выводы под стиральную/посудомоечную машину", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"GID-001", cat:"Черновые", sub:"Гидроизоляция", name:"Поднятие гидроизоляции на стены 20–30 см", unit:"м²", tiers:[], cost:1300, margin:0.4, fixedPrice:2167 },
  { code:"GID-002", cat:"Черновые", sub:"Гидроизоляция", name:"Обработка углов и примыканий", unit:"м.п.", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"GID-003", cat:"Черновые", sub:"Гидроизоляция", name:"Гидроизоляция под ванной и душем", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"GID-004", cat:"Черновые", sub:"Гидроизоляция", name:"Герметизация трубных выводов", unit:"шт", tiers:[], cost:600, margin:0.4, fixedPrice:1000 },
  { code:"PREP-001", cat:"Черновые", sub:"Подготовка оснований", name:"Идеальная плоскость под покраску", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"PREP-002", cat:"Черновые", sub:"Подготовка оснований", name:"Подготовка под поклейку обоев", unit:"м²", tiers:[], cost:900, margin:0.4, fixedPrice:1500 },
  { code:"PREP-003", cat:"Черновые", sub:"Подготовка оснований", name:"Шпаклёвка потолка", unit:"м²", tiers:[], cost:1300, margin:0.4, fixedPrice:2167 },
  { code:"PREP-004", cat:"Черновые", sub:"Подготовка оснований", name:"Подготовка под натяжной потолок", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"PREP-005", cat:"Черновые", sub:"Подготовка оснований", name:"Выравнивание перепадов пола", unit:"м²", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"PREP-006", cat:"Черновые", sub:"Подготовка оснований", name:"Ошкуривание потолка", unit:"м²", tiers:[], cost:400, margin:0.4, fixedPrice:667 },
  { code:"PREP-007", cat:"Черновые", sub:"Подготовка оснований", name:"Грунтовка пола", unit:"м²", tiers:[], cost:250, margin:0.4, fixedPrice:417 },
  { code:"PREP-008", cat:"Черновые", sub:"Подготовка оснований", name:"Грунтовка потолка", unit:"м²", tiers:[], cost:250, margin:0.4, fixedPrice:417 },
  { code:"ADD-001", cat:"Черновые", sub:"Дополнительно", name:"Перегородки из ГКЛ (монтаж/перенос)", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"ADD-002", cat:"Черновые", sub:"Дополнительно", name:"Перегородки из кирпича (монтаж/перенос)", unit:"м²", tiers:[], cost:5500, margin:0.4, fixedPrice:9167 },
  { code:"ADD-003", cat:"Черновые", sub:"Дополнительно", name:"Перегородки из газоблока (монтаж/перенос)", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"ADD-004", cat:"Черновые", sub:"Дополнительно", name:"Шумоизоляция стен и потолков", unit:"м²", tiers:[], cost:1800, margin:0.4, fixedPrice:3000 },
  { code:"ADD-005", cat:"Черновые", sub:"Дополнительно", name:"Утепление лоджий", unit:"м²", tiers:[], cost:1600, margin:0.4, fixedPrice:2667 },
  { code:"ADD-006", cat:"Черновые", sub:"Дополнительно", name:"Подготовка ниш под освещение", unit:"шт", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"ADD-007", cat:"Черновые", sub:"Дополнительно", name:"Короба и конструкции из ГКЛ", unit:"м.п.", tiers:[], cost:4800, margin:0.4, fixedPrice:8000 },
  { code:"OB-001", cat:"Чистовые", sub:"Стены — Обои", name:"Поклейка обоев", unit:"м²", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
  { code:"PA-001", cat:"Чистовые", sub:"Стены — Покраска", name:"Нанесение грунтовки", unit:"м²", tiers:[], cost:300, margin:0.4, fixedPrice:500 },
  { code:"PA-002", cat:"Чистовые", sub:"Стены — Покраска", name:"Покраска в 1 слой", unit:"м²", tiers:[], cost:400, margin:0.4, fixedPrice:667 },
  { code:"PA-003", cat:"Чистовые", sub:"Стены — Покраска", name:"Покраска в 2–3 слоя", unit:"м²", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"PA-004", cat:"Чистовые", sub:"Стены — Покраска", name:"Окраска откосов и ниш", unit:"м.п.", tiers:[], cost:650, margin:0.4, fixedPrice:1083 },
  { code:"DEC-001", cat:"Чистовые", sub:"Стены — Декоративные", name:"Декоративная штукатурка", unit:"м²", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"DEC-002", cat:"Чистовые", sub:"Стены — Декоративные", name:"Микробетон", unit:"м²", tiers:[], cost:5000, margin:0.4, fixedPrice:8333 },
  { code:"DEC-003", cat:"Чистовые", sub:"Стены — Декоративные", name:"Венецианка", unit:"м²", tiers:[], cost:6000, margin:0.4, fixedPrice:10000 },
  { code:"DEC-004", cat:"Чистовые", sub:"Стены — Декоративные", name:"Акцентные стены", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"PAN-001", cat:"Чистовые", sub:"Стены — Панели", name:"МДФ/ПВХ панели", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"PAN-002", cat:"Чистовые", sub:"Стены — Панели", name:"Рейки", unit:"м²", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"PAN-003", cat:"Чистовые", sub:"Стены — Панели", name:"3D панели", unit:"м²", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"CEIL-001", cat:"Чистовые", sub:"Потолки", name:"Покраска потолка", unit:"м²", tiers:[], cost:1100, margin:0.4, fixedPrice:1833 },
  { code:"CEIL-002", cat:"Чистовые", sub:"Потолки", name:"Монтаж трековых систем", unit:"м.п.", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"CEIL-003", cat:"Чистовые", sub:"Потолки", name:"Монтаж световых линий", unit:"м.п.", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"CEIL-004", cat:"Чистовые", sub:"Потолки", name:"Установка потолочных плинтусов (галтель)", unit:"м.п.", tiers:[], cost:700, margin:0.4, fixedPrice:1167 },
  { code:"CEIL-005", cat:"Чистовые", sub:"Потолки", name:"Монтаж гипсокартонных коробов и ниш", unit:"м²", tiers:[], cost:4800, margin:0.4, fixedPrice:8000 },
  { code:"FLR-001", cat:"Чистовые", sub:"Полы — Покрытия", name:"Укладка линолеума", unit:"м²", tiers:[], cost:1350, margin:0.4, fixedPrice:2250 },
  { code:"FLR-002", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж ламината", unit:"м²", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"FLR-003", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж кварц-винила", unit:"м²", tiers:[], cost:1700, margin:0.4, fixedPrice:2833 },
  { code:"FLR-004", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж паркетной доски", unit:"м²", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"FLR-005", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж инженерной доски", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"FLR-006", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж керамогранита", unit:"м²", tiers:[], cost:4000, margin:0.4, fixedPrice:6667 },
  { code:"FLR-007", cat:"Чистовые", sub:"Полы — Покрытия", name:"Монтаж плитки (пол)", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"FLRA-001", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Подложка", unit:"м²", tiers:[], cost:180, margin:0.4, fixedPrice:300 },
  { code:"FLRA-002", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Порожки", unit:"шт", tiers:[], cost:1400, margin:0.4, fixedPrice:2333 },
  { code:"FLRA-003", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов ПВХ", unit:"м.п.", tiers:[], cost:600, margin:0.4, fixedPrice:1000 },
  { code:"FLRA-004", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов МДФ", unit:"м.п.", tiers:[], cost:850, margin:0.4, fixedPrice:1417 },
  { code:"FLRA-005", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов полиуретановых/декор", unit:"м.п.", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"FLRA-006", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Монтаж плинтусов деревянных", unit:"м.п.", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
  { code:"FLRA-007", cat:"Чистовые", sub:"Полы — Сопутствующие", name:"Герметизация примыканий", unit:"м.п.", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"SN-001", cat:"Чистовые", sub:"Сантехника — Установка", name:"Унитаз (вкл. инсталляцию)", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-002", cat:"Чистовые", sub:"Сантехника — Установка", name:"Ванна", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-003", cat:"Чистовые", sub:"Сантехника — Установка", name:"Раковина", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-004", cat:"Чистовые", sub:"Сантехника — Установка", name:"Смесители", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-005", cat:"Чистовые", sub:"Сантехника — Установка", name:"Душевые системы", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-006", cat:"Чистовые", sub:"Сантехника — Установка", name:"Трапы", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-007", cat:"Чистовые", sub:"Сантехника — Установка", name:"Полотенцесушитель", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SN-008", cat:"Чистовые", sub:"Сантехника — Установка", name:"Монтаж радиатора отопления", unit:"шт", tiers:[], cost:15000, margin:0.4, fixedPrice:25000 },
  { code:"SN-009", cat:"Чистовые", sub:"Сантехника — Установка", name:"Монтаж радиатора (с заменой труб/подводки)", unit:"шт", tiers:[], cost:25000, margin:0.4, fixedPrice:41667 },
  { code:"SNA-001", cat:"Чистовые", sub:"Сантехника — Дополнительно", name:"Монтаж экранов", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"SNA-002", cat:"Чистовые", sub:"Сантехника — Дополнительно", name:"Подключение стиралки/посудомойки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-001", cat:"Чистовые", sub:"Электрика чистовая", name:"Установка розеток", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-002", cat:"Чистовые", sub:"Электрика чистовая", name:"Установка выключателей", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-003", cat:"Чистовые", sub:"Электрика чистовая", name:"Подключение светильников", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-004", cat:"Чистовые", sub:"Электрика чистовая", name:"Люстры, бра, треки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-005", cat:"Чистовые", sub:"Электрика чистовая", name:"Монтаж точечных светильников", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-006", cat:"Чистовые", sub:"Электрика чистовая", name:"Подключение вытяжки", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"ELC-007", cat:"Чистовые", sub:"Электрика чистовая", name:"Установка терморегуляторов тёплого пола", unit:"шт", tiers:[], cost:null, margin:0.4 },
  { code:"DR-001", cat:"Чистовые", sub:"Двери и проёмы", name:"Установка межкомнатных дверей (базовые)", unit:"шт", tiers:[], cost:15000, margin:0.4, fixedPrice:25000 },
  { code:"DR-002", cat:"Чистовые", sub:"Двери и проёмы", name:"Установка межкомнатных дверей (скрытый монтаж)", unit:"шт", tiers:[], cost:25000, margin:0.4, fixedPrice:41667 },
  { code:"DR-003", cat:"Чистовые", sub:"Двери и проёмы", name:"Доборы", unit:"шт", tiers:[], cost:2000, margin:0.4, fixedPrice:3333 },
  { code:"DR-004", cat:"Чистовые", sub:"Двери и проёмы", name:"Наличники", unit:"шт", tiers:[], cost:2500, margin:0.4, fixedPrice:4167 },
  { code:"DR-005", cat:"Чистовые", sub:"Двери и проёмы", name:"Установка входной двери", unit:"шт", tiers:[], cost:25000, margin:0.4, fixedPrice:41667 },
  { code:"DR-006", cat:"Чистовые", sub:"Двери и проёмы", name:"Оформление проёмов и порталов", unit:"шт", tiers:[], cost:9000, margin:0.4, fixedPrice:15000 },
  { code:"TL-001", cat:"Чистовые", sub:"Плиточные работы", name:"Укладка плитки на стены", unit:"м²", tiers:[], cost:3200, margin:0.4, fixedPrice:5333 },
  { code:"TL-002", cat:"Чистовые", sub:"Плиточные работы", name:"Укладка плитки на пол", unit:"м²", tiers:[], cost:3200, margin:0.4, fixedPrice:5333 },
  { code:"TL-003", cat:"Чистовые", sub:"Плиточные работы", name:"Раскладка под 45° (запил, диагональ)", unit:"м²", tiers:[], cost:4500, margin:0.4, fixedPrice:7500 },
  { code:"TL-004", cat:"Чистовые", sub:"Плиточные работы", name:"Декоративные вставки", unit:"шт", tiers:[], cost:1000, margin:0.4, fixedPrice:1667 },
  { code:"TL-005", cat:"Чистовые", sub:"Плиточные работы", name:"Затирка швов", unit:"м²", tiers:[], cost:500, margin:0.4, fixedPrice:833 },
  { code:"TL-006", cat:"Чистовые", sub:"Плиточные работы", name:"Монтаж фартука на кухне", unit:"м²", tiers:[], cost:3500, margin:0.4, fixedPrice:5833 },
  { code:"TL-007", cat:"Чистовые", sub:"Плиточные работы", name:"Монтаж декоративных бордюров", unit:"м.п.", tiers:[], cost:1200, margin:0.4, fixedPrice:2000 },
];

// Метки сложности точно как в Google Script
const COMPLEXITY = [
  { label:"Стандарт",              key:"std",  mult:1.0 },
  { label:"Выше среднего + 20%",   key:"mid",  mult:1.2 },
  { label:"Сложно + 50%",          key:"hard", mult:1.5 },
];

const OBJ_TYPES = ["Вторичка","Новостройка","Коммерция"];

const fmt = n => n > 0 ? new Intl.NumberFormat("ru-RU").format(Math.round(n)) : "—";
const today = () => new Date().toLocaleDateString("ru-RU");
const addWorkdays = (date, days) => { let d = new Date(date); let added = 0; while(added < days){ d.setDate(d.getDate()+1); if(d.getDay()!==0&&d.getDay()!==6) added++; } return d; };
const validUntil = () => addWorkdays(new Date(),7).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"});

// Базовая цена для отображения в колонке (без объёма) — первый диапазон или fixedPrice
// priceOverrides = {code: {fixedPrice?, tiers?}} — загружается из Firebase
let _priceOverrides = {};
export function setPriceOverrides(o) { _priceOverrides = o || {}; }

export function getEffectiveWork(work) {
  const safe = { ...work, tiers: work.tiers || [] };
  const renamed = _catalogOverrides.renames[safe.code]
    ? { ...safe, name: _catalogOverrides.renames[safe.code] }
    : safe;
  const ov = _priceOverrides[renamed.code];
  if (!ov) return renamed;
  return {
    ...renamed,
    fixedPrice: ov.fixedPrice !== undefined ? ov.fixedPrice : renamed.fixedPrice,
    tiers: ov.tiers !== undefined ? ov.tiers : renamed.tiers,
    cost: ov.cost !== undefined ? ov.cost : renamed.cost,
    margin: ov.margin !== undefined ? ov.margin : renamed.margin,
    priceFrom: ov.priceFrom !== undefined ? ov.priceFrom : renamed.priceFrom,
  };
}

export function getBasePrice(work) {
  const w = getEffectiveWork(work);
  if (w.fixedPrice) return w.fixedPrice;
  if (w.tiers && w.tiers.length > 0) return w.tiers[0].price;
  return null;
}

export function getPrice(work, qty, complexity, cpxPct) {
  if (!qty || qty <= 0) return null;
  const w = getEffectiveWork(work);
  const mult = cpxPct !== undefined && cpxPct !== null
    ? 1 + cpxPct / 100
    : (COMPLEXITY.find(c => c.key === complexity)?.mult || 1);
  let price = null;
  if (w.tiers && w.tiers.length > 0) {
    for (const t of w.tiers) {
      if (qty >= t.min && qty <= t.max) { price = t.price; break; }
    }
    if (price === null) price = w.tiers[w.tiers.length - 1]?.price ?? null;
  } else if (w.fixedPrice) {
    price = w.fixedPrice;
  }
  return (price !== null && !isNaN(Number(price))) ? Number(price) * mult : null;
}

// Виртуальная категория для позиций сметы без каталога (восстановленные из актов и пр.)
const EXTRA_CAT = "Восстановлено из актов";

// G теперь динамический - пересчитывается через getEffectiveCatalog()

// ─── УТИЛИТЫ ────────────────────────────────────────────────────────────────
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
// Себестоимость за единицу с учётом разового ручного переопределения в строке сметы
const rowCostPerUnit = (r, w) => (r && r.manualCost !== undefined && r.manualCost !== "" && !isNaN(Number(r.manualCost))) ? Number(r.manualCost) : (Number(w?.cost) || 0);
// Надёжное приведение updatedAt к числу: поддерживает и число (Date.now()), и ISO-строку
const _ts = v => { if (typeof v === "number") return v; const n = new Date(v).getTime(); return isNaN(n) ? 0 : n; };
// tengeInWords импортирован из ./utils.js
// Открыть/распечатать готовый HTML-документ. В обычном браузере открываем новую вкладку,
// в PWA (standalone) на iOS новые окна не открываются — печатаем через скрытый iframe.
const openOrPrintHtml = (html, revokeMs = 30000) => {
  const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (!isStandalone) {
    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), revokeMs);
    return;
  }
  // PWA: печать через скрытый iframe.
  // iOS/Safari в режиме приложения берёт имя PDF из заголовка ВЕРХНЕЙ страницы
  // (а не из iframe), поэтому временно подменяем document.title — чтобы в имя
  // файла попали клиент/адрес/телефон, как на ПК. После печати возвращаем обратно.
  const _tm = html.match(/<title>([\s\S]*?)<\/title>/i);
  const _wantTitle = _tm ? _tm[1].trim() : null;
  const _prevTitle = document.title;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden","true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const triggerPrint = () => {
    if (_wantTitle) document.title = _wantTitle;
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    catch(e) { /* ignore */ }
    setTimeout(()=>{ document.title = _prevTitle; }, 8000);
    setTimeout(()=>{ try{ document.body.removeChild(iframe);}catch(e){} }, 60000);
  };
  // Дать времени отрисоваться картинкам (печать/штамп) перед вызовом печати
  setTimeout(triggerPrint, 600);
};
const fmtDate = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("ru-RU", {hour:"2-digit",minute:"2-digit"});
  if (isToday) return `Сегодня ${time}`;
  if (isYesterday) return `Вчера ${time}`;
  return d.toLocaleDateString("ru-RU", {day:"numeric",month:"short"}) + " " + time;
};
// Дата + точное время (для статуса онлайн-КП: просмотр/принятие)
const fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}) : "";
// Текст статуса онлайн-КП по снимку: просмотры (+ время последнего) и принятие (+ время)
const kpStatusText = (d) => {
  if (!d) return "";
  const v = d.viewCount ? ("👁 просмотров: " + d.viewCount + (d.viewedAt ? (" · последний " + fmtDateTime(d.viewedAt)) : "")) : "👁 ещё не открыто клиентом";
  return v + (d.acceptedAt ? (" · ✅ ПРИНЯТО " + fmtDateTime(d.acceptedAt)) : "");
};

const EMPTY_PROJ = { name:"", type:"Вторичка", area:"", address:"", phone:"", manager:"" };

const STATUSES = [
  { key:"new",       label:"Новая",              color:"#2563eb", bg:"#eff6ff"   },
  { key:"progress",  label:"В работе",           color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"sent",      label:"Отправлено клиенту", color:"#7c3aed", bg:"rgba(124,58,237,.1)"  },
  { key:"agreed",    label:"Согласовано",        color:"#059669", bg:"#eff6ff"  },
  { key:"rejected",  label:"Отказ",              color:"#dc2626", bg:"rgba(220,38,38,.12)"   },
];
const CONTRACT_STATUSES = [
  { key:"draft",   label:"Черновик",     color:"#94a3b8", bg:"#f3f4f6"              },
  { key:"sign",    label:"На подписание", color:"#d97706", bg:"rgba(217,119,6,.12)" },
  { key:"signed",  label:"Заключён",     color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"archive", label:"Архив",        color:"#64748b", bg:"rgba(107,114,128,.12)"},
];
// Объекты — статусы жизненного цикла
// Единые статусы объекта (сделка + производство). Ключи старых статусов сохранены,
// чтобы существующие объекты не потеряли статус: new/approval/signed/refuse/archive.
const DEAL_STATUSES = [
  { key:"new",      label:"Новый",              color:"#64748b", bg:"#f3f4f6"              },
  { key:"approval", label:"Согласование сметы", color:"#d97706", bg:"rgba(217,119,6,.12)"  },
  { key:"signed",   label:"Договор подписан",   color:"#059669", bg:"rgba(5,150,105,.1)"   },
  { key:"refuse",   label:"Потерян",            color:"#dc2626", bg:"rgba(220,38,38,.1)"   },
  { key:"work",     label:"В работе",           color:"#2563eb", bg:"#eff6ff"              },
  { key:"paused",   label:"Приостановлен",      color:"#d97706", bg:"rgba(217,119,6,.1)"   },
  { key:"done",     label:"Выполнен",           color:"#059669", bg:"#ecfdf5"              },
  { key:"cancel",   label:"Расторгнут",         color:"#dc2626", bg:"rgba(220,38,38,.12)"  },
  { key:"archive",  label:"Архив",              color:"#64748b", bg:"rgba(107,114,128,.12)"},
];
// Производственный статус → единый (производство перевешивает статус сделки, когда объект в работе)
const PROD_TO_DEAL = { active:"work", paused:"paused", done:"done", cancel:"cancel" };
// Обратная карта: клик по статусу объекта должен сразу отражаться в отображаемом статусе.
// Т.к. unifiedStatusOf при наличии карточки производства всегда берёт производственный статус
// (это нужно для старых объектов, где статус реально хранился в производстве) — без обратного
// зеркалирования клик по кнопке ничего не менял бы визуально (см. баг «кнопки не работают»).
const DEAL_TO_PROD = { work:"active", paused:"paused", done:"done", cancel:"cancel" };
const PROD_STATUSES_LABELS = { new:"Новый", active:"В работе", paused:"Приостановлен", done:"Выполнен", cancel:"Расторгнут" };
const OBJECTS_KEY         = "titovstroy-objects";
const OBJECTS_BACKUPS_KEY = "titovstroy-objects-backups";
const PRODUCTIONS_KEY         = "titovstroy-productions";   // производственные карточки объектов
const PRODUCTIONS_BACKUPS_KEY = "titovstroy-productions-backups";
const REPORTS_KEY         = "titovstroy-reports";          // отчёты по объектам (АВР, форма Р-1)
const REPORTS_BACKUPS_KEY = "titovstroy-reports-backups";
const WORKERS_KEY         = "titovstroy-workers";          // справочник подрядчиков (рабочих)
const WORKERS_BACKUPS_KEY = "titovstroy-workers-backups";
const PODRYADS_KEY        = "titovstroy-podryads";         // договоры подряда с рабочими + их приложения
const PODRYADS_BACKUPS_KEY= "titovstroy-podryads-backups";
const MASTERS_KEY         = "titovstroy-masters";          // справочник мастеров с naimi.kz (пишет парсер, читаем только на чтение)
const MASTERS_CONFIG_KEY  = "titovstroy-masters-config";   // настройки парсера (частота, «Обновить сейчас») — редактирует Админ, читает парсер
const MASTERS_OLX_KEY        = "titovstroy-masters-olx";       // справочник мастеров с OLX.kz (второй источник, пишет отдельный парсер)
const MASTERS_OLX_CONFIG_KEY = "titovstroy-masters-olx-config";// настройки OLX-парсера
// единый снимок рабочего пространства: объекты + их сметы + их договора
const WORKSPACE_BACKUPS_KEY = "titovstroy-workspace-backups";
// legacy ключ для миграции старых сделок
const DEALS_KEY          = "titovstroy-deals";
const DEALS_BACKUPS_KEY  = "titovstroy-deals-backups";
const STORAGE_KEY        = "titovstroy-estimates";
const BACKUPS_KEY        = "titovstroy-estimates-backups"; // снимки архива для восстановления
const USERS_KEY          = "titovstroy-users";
const USERS_BACKUPS_KEY  = "titovstroy-users-backups";
const ROLE_PERMISSIONS_KEY = "titovstroy-role-permissions";
const ROLE_PERMISSIONS_BACKUPS_KEY = "titovstroy-role-permissions-backups";
const SESSION_KEY        = "titovstroy-session";
const PRESENCE_KEY       = "titovstroy-presence"; // { [userId]: lastSeenTs } — кто когда был онлайн
const PRESENCE_ONLINE_MS = 2 * 60 * 1000; // «в сети», если активность была <2 мин назад
const PRICES_KEY         = "titovstroy-prices";  // переопределённые цены {code: {fixedPrice?, tiers?}}
const PRICES_BACKUPS_KEY = "titovstroy-prices-backups"; // ОТДЕЛЬНО от каталога: цены — объект другого формата
const PUBLIC_NODES_BACKUPS_KEY = "titovstroy-public-nodes-backups"; // пред-бэкап публичных нод (КП/кабинеты) перед restore
const CATALOG_BACKUPS_KEY= "titovstroy-catalog-backups"; // снимки каталога (последние 10)
const CONTRACTS_BACKUPS_KEY = "titovstroy-contracts-backups";
const CLIENTS_BACKUPS_KEY   = "titovstroy-clients-backups";
const CONTRAGENTS_BACKUPS_KEY = "titovstroy-contragents-backups";
const CATALOG_KEY    = "titovstroy-catalog";
const CONTRACTS_KEY  = "titovstroy-contracts";
const CLIENTS_KEY    = "titovstroy-clients";
const CONTRAGENTS_KEY= "titovstroy-contragents";
// ── ФИНАНСЫ (независимый учёт: ДДС + P&L) ──
const AUDIT_KEY               = "titovstroy-audit";             // ЛЕГАСИ-журнал (архив, только чтение)
const AUDIT_INDEX_KEY         = "titovstroy-audit-index";       // список месяцев ["2026-07", ...] (какие помесячные ключи есть)
const AUDIT_MONTH_KEY         = (ym) => "titovstroy-audit-" + ym; // помесячный журнал (без лимита записей)
const _auditYM = (ts = Date.now()) => { const d = new Date(ts); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const FINANCE_TX_KEY          = "titovstroy-finance-tx";        // массив транзакций
const FINANCE_TX_BACKUPS_KEY  = "titovstroy-finance-tx-backups";
const FINANCE_META_KEY        = "titovstroy-finance-meta";      // {accounts, income, expense}
const FINANCE_META_BACKUPS_KEY= "titovstroy-finance-meta-backups";
const FINANCE_PROJECTS_KEY         = "titovstroy-finance-projects";   // массив проектов
const FINANCE_PROJECTS_BACKUPS_KEY = "titovstroy-finance-projects-backups";
// Справочник финансов по умолчанию (из исходной таблицы)
// DEFAULT_FIN_META импортирован из ./utils.js
// Категории, которые НЕ являются P&L (не выручка / не расход) — финансовая и инвестиционная деятельность
const C_FINANCING_INC = "Финансирование (не выручка)";        // доходы: займы/кредиты/вклады
const C_ASSET_INC     = "Возврат займов и активов";            // доходы: возврат активов — не P&L, инвест. раздел ДДС
const C_FINACT = "Финансовая деятельность (не расход)";        // расходы: возвраты займов/вкладов
const C_INVEST = "Инвестиции (покупка активов)";               // расходы: капвложения в ОС (кассовый метод — расход)
const C_ASSET_OUT     = "Выданные займы и прочие активы";      // расходы: займы выданные, залоги, запасы — не P&L
const FA_SUB_MAP = { "Покупка: Техника":"faTechnika","Покупка: Мебель":"faMebel","Покупка: Инвентарь":"faInventar","Покупка: Оборудование":"faOborud","Покупка: Транспорт":"faTransport" };
// Маппинг подкатегорий C_ASSET_OUT / C_ASSET_INC → ключ баланса
const ASSET_OUT_KEYS = { "Выдан займ (до 1 года)":"loansGivenShort","Выдан займ (от 1 года)":"loansGivenLong","Залоговый платёж":"collateral","Закуп запасов / материалов":"inventory","Финансовые вложения (долг.)":"financialInvest","НМА (нематериальные активы)":"intangibles" };
const ASSET_INC_KEYS = { "Возврат займа выданного (кратк.)":"loansGivenShort","Возврат займа выданного (долг.)":"loansGivenLong","Возврат залогового платежа":"collateral","Продажа / реализация запасов":"inventory","Возврат фин. вложений":"financialInvest" };
// mergeFinMeta импортирован из ./utils.js
// {renames:{code:name}, catRenames:{"Черновые":"Новое"}, subRenames:{"Черновые|Демонтаж":"Снос"},
//  hiddenCodes:[], hiddenSubs:["Черновые|Демонтаж"], hiddenCats:["Черновые"],
//  custom:[{code,cat,sub,name,unit,tiers,fixedPrice}]}

// normCN, CATALOG_DEFAULTS, withCatalogOverrides импортированы из ./utils.js
let _catalogOverrides = { ...CATALOG_DEFAULTS };
let _onCatalogChange = null;
let _catalogCache = null;
export function setCatalogOverrides(o) {
  _catalogOverrides = withCatalogOverrides(o);
  _catalogCache = null;
  if (_onCatalogChange) _onCatalogChange();
}
export function getEffectiveCatalog() {
  if (_catalogCache) return _catalogCache;
  const hc = _catalogOverrides.hiddenCats||[];
  const hs = _catalogOverrides.hiddenSubs||[];
  const base = WORKS_DATA
    .filter(w => !(_catalogOverrides.hiddenCodes||[]).includes(w.code))
    .filter(w => !hc.includes(w.cat))
    .filter(w => !hs.includes(w.cat+"|"+w.sub))
    .map(w => {
      let r = {...w, tiers: w.tiers||[], _origCat: w.cat, _origSub: w.sub};
      if (_catalogOverrides.renames[r.code]) r = {...r, name: _catalogOverrides.renames[r.code]};
      if (_catalogOverrides.catRenames[w.cat]) r = {...r, cat: _catalogOverrides.catRenames[w.cat]};
      if (_catalogOverrides.subRenames[w.cat+"|"+w.sub]) r = {...r, sub: _catalogOverrides.subRenames[w.cat+"|"+w.sub]};
      return r;
    });
  const custom = (_catalogOverrides.custom||[])
    .filter(w => !(_catalogOverrides.hiddenCodes||[]).includes(w.code))
    .map(w => {
      let r = {...w, tiers: w.tiers||[], _origCat: w.cat, _origSub: w.sub};
      if (_catalogOverrides.renames[r.code]) r = {...r, name: _catalogOverrides.renames[r.code]};
      return r;
    });
  _catalogCache = [...base, ...custom];
  return _catalogCache;
}

// Дефолтные пользователи
const DEFAULT_USERS = [
  { id:"1", login:"admin",    password:"titov2024", name:"Василий Титов",   role:"admin"  },
  { id:"2", login:"zamer1",   password:"zamer1",    name:"Замерщик 1",      role:"user"   },
];

// Старый "хэш" — на деле обратимая обфускация (base64 + реверс), не защищает пароль
// при доступе к базе. Оставлен только для проверки паролей, созданных до перехода
// на sha256Hash ниже (обратная совместимость при входе).
const simpleHash = (s) => btoa(encodeURIComponent(s)).split("").reverse().join("");

// ── Пароли: SHA-256 + случайная соль на каждого пользователя ──
// Формат хранения: "sha256:<соль>:<hex-хэш>". Реальная (необратимая) защита — доступ
// к базе больше не даёт пароль напрямую, нужен перебор. Соль своя у каждого пароля,
// чтобы у двух пользователей с одинаковым паролем хэши не совпадали.
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomSaltHex() {
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password) {
  const salt = randomSaltHex();
  const hash = await sha256Hex(salt + ":" + password);
  return `sha256:${salt}:${hash}`;
}
// Принимает и НОВЫЙ формат (sha256:соль:хэш), и старые (simpleHash, голый текст —
// у DEFAULT_USERS) — для плавного перехода без принудительного сброса паролей.
async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith("sha256:")) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    return (await sha256Hex(salt + ":" + password)) === hash;
  }
  return stored === password || stored === simpleHash(password);
}
// Минимальная сложность нового пароля — не пропускаем совсем короткие/тривиальные.
function passwordTooWeak(pw) {
  const p = String(pw || "");
  if (p.length < 6) return "Пароль должен быть не короче 6 символов";
  if (/^(\d)\1*$/.test(p) || /^(1234|12345|123456|qwerty|password|admin)$/i.test(p)) return "Слишком простой пароль, придумайте другой";
  return null;
}
// ── Блокировка входа после серии неверных попыток (защита от простого перебора) ──
const LOGIN_ATTEMPTS_KEY = "titovstroy-login-attempts";
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;
function _readLoginAttempts() {
  try { return JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || "{}"); } catch { return {}; }
}
function getLoginLockout(login) {
  const rec = _readLoginAttempts()[login.toLowerCase()];
  if (rec && rec.lockUntil && rec.lockUntil > Date.now()) return rec.lockUntil;
  return null;
}
function registerFailedLogin(login) {
  const key = login.toLowerCase();
  const all = _readLoginAttempts();
  const rec = all[key] || { count: 0 };
  rec.count = (rec.count || 0) + 1;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) { rec.lockUntil = Date.now() + LOGIN_LOCKOUT_MS; rec.count = 0; }
  all[key] = rec;
  try { localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(all)); } catch {}
}
function clearLoginAttempts(login) {
  const all = _readLoginAttempts();
  delete all[login.toLowerCase()];
  try { localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(all)); } catch {}
}

// Аудит-журнал. Структурная запись изменения:
//   {ts, userId, by, entity, entityId, label, objectId, field, action, old, new, detail, source}
//   entity: object|contract|estimate|finance_tx|user|client|stage|publish|document
//   source: manual (вручную) | import (импорт) | autosync (автосинк) | cabinet (клиентский кабинет)
// Хранится ПОМЕСЯЧНО (titovstroy-audit-ГГГГ-ММ, без лимита) + индекс существующих месяцев.
// Старый ключ titovstroy-audit больше НЕ пишется — он остаётся архивом (читается в общем журнале).
// Атомарное добавление записи в помесячный массив журнала.
// Firebase RTDB-транзакция сериализует одновременные записи → ни одна не теряется.
// В базе значение ключа — СТРОКА JSON (как во всём storage), поэтому и в транзакции строка.
const _appendAuditEntry = async (mk, entry) => {
  const op = _beginEditorWrite();
  if (op.fail) return;
  try {
    if (_fbDb) {
      try {
        await _fbAuthReady;
        const r = ref(_fbDb, _fbKey(mk));
        const res = await _race(runTransaction(r, (cur) => {
          let arr = [];
          if (typeof cur === "string") { try { const p = JSON.parse(cur); if (Array.isArray(p)) arr = p; } catch {} }
          else if (Array.isArray(cur)) arr = cur;
          return JSON.stringify([entry, ...arr]);
        }), 8000);
        if (res !== _TIMEOUT) {
          if (_mayApplyEditorResult(op.session) && !_foreignDirty(mk)) {
            try {
              const v = res?.snapshot?.val();
              if (typeof v === "string") {
                localStorage.setItem(mk, v);
                localStorage.setItem(mk + _TS_SUFFIX, Date.now().toString());
                _mem[mk] = v;
              }
            } catch {}
          }
          return;
        }
      } catch (e) { console.warn("audit tx err", e); }
    }
    const raw = await storage.get(mk);
    let arr = [];
    if (raw) { try { const p = JSON.parse(raw.value); if (Array.isArray(p)) arr = p; } catch {} }
    await storage.set(mk, JSON.stringify([entry, ...arr]));
  } finally {
    _endEditorWrite();
  }
};
const logChange = async (user, ev = {}) => {
  try {
    const ts = ev.ts || Date.now();
    const ym = _auditYM(ts);
    const entry = {
      ts,
      userId: user?.id || "?",
      by: user?.name || "?",
      entity: ev.entity || "",
      entityId: ev.entityId || "",
      label: ev.label || "",
      objectId: ev.objectId || "",
      field: ev.field || "",
      action: ev.action || "",
      old: ev.old !== undefined ? ev.old : "",
      new: ev.new !== undefined ? ev.new : "",
      detail: ev.detail || "",
      source: ev.source || "manual",
    };
    const mk = AUDIT_MONTH_KEY(ym);
    // Добавляем запись АТОМАРНО (Firebase-транзакция), чтобы при одновременных действиях
    // с разных устройств записи не затирали друг друга (read-modify-write гонка).
    await _appendAuditEntry(mk, entry);
    // индекс месяцев — дописываем только когда появился новый месяц
    try {
      const ir = await storage.get(AUDIT_INDEX_KEY);
      let idx = [];
      if (ir) { try { const p = JSON.parse(ir.value); if (Array.isArray(p)) idx = p; } catch {} }
      if (!idx.includes(ym)) { idx = [...new Set([ym, ...idx])].sort().reverse(); await storage.set(AUDIT_INDEX_KEY, JSON.stringify(idx)); }
    } catch {}
  } catch (e) { console.warn("audit write failed", e); }
};
// Обратная совместимость: старые вызовы writeAudit(user, action, entity, entityId, detail).
const writeAudit = (user, action, entity, entityId, detail = "") =>
  logChange(user, { action, entity, entityId, detail });

// Человекочитаемые поля объекта для журнала (форматируем «было/стало»)
const OBJ_FIELD_META = {
  status:      { label: "статус",        fmt: (v) => (DEAL_STATUSES.find(s => s.key === v) || {}).label || v || "—" },
  clientName:  { label: "клиент",        fmt: (v) => v || "—" },
  address:     { label: "адрес",         fmt: (v) => v || "—" },
  objType:     { label: "тип объекта",   fmt: (v) => v || "—" },
  phone:       { label: "телефон",       fmt: (v) => v || "—" },
  responsible: { label: "ответственный", fmt: (v) => v || "—" },
  foreman:     { label: "прораб",        fmt: (v) => v || "—" },
  planEndDate: { label: "план сдачи",    fmt: (v) => v ? new Date(v).toLocaleDateString("ru-RU") : "—" },
  startDate:   { label: "старт",         fmt: (v) => v ? new Date(v).toLocaleDateString("ru-RU") : "—" },
};
const _objLabel = (o) => (o?.clientName || o?.address || o?.objType || "Объект");
// Логируем изменения значимых полей объекта (по патчу): только реально изменившиеся.
// Весь хелпер в try/catch: журнал ни при каких условиях не должен мешать сохранению данных.
const logObjChange = (user, obj, patch, source = "manual") => {
  try {
    for (const f of Object.keys(patch || {})) {
      if (f === "updatedAt") continue;
      const before = obj ? obj[f] : undefined;
      const after = patch[f];
      if (before === after) continue;
      const meta = OBJ_FIELD_META[f];
      if (!meta) continue;
      logChange(user, { entity: "object", entityId: obj?.id || "", objectId: obj?.id || "", label: _objLabel(obj), field: meta.label, action: "изменил", old: meta.fmt(before), new: meta.fmt(after), source });
    }
  } catch (e) { console.warn("logObjChange failed", e); }
};
// Сумма договора (для журнала): сумма позиций, иначе м²-расчёт, иначе totalCost.
const contractAmount = (c) => {
  const ws = (c?.works || []).reduce((s, w) => s + ((Number(w.quantity) || 0) * (Number(w.price) || 0)), 0);
  if (ws) return ws;
  if (c?.priceType === "sqm") return Math.round((Number(c?.pricePerSqm) || 0) * (Number(c?.area) || 0)) || 0;
  return Number(c?.totalCost) || 0;
};
const _tng = (n) => (Math.round(Number(n) || 0)).toLocaleString("ru-RU") + " ₸";
const _finTypeLbl = { income: "поступление", expense: "расход", transfer: "перевод" };
const _cStatusLbl = (v) => (CONTRACT_STATUSES.find(s => s.key === (v || "draft")) || {}).label || v || "—";
// Логируем сохранение договора: создание, изменение суммы, изменение статуса.
// Весь хелпер в try/catch: журнал не должен мешать сохранению договора.
const logContractSave = (user, oldC, newC) => {
  try {
    const label = newC?.contractNo || newC?.number || newC?.objectName || "Договор";
    const objectId = newC?.objectId || "";
    if (!oldC) { logChange(user, { entity: "contract", entityId: newC?.id || "", objectId, label, action: "создал договор", new: _tng(contractAmount(newC)) }); return; }
    const oa = Math.round(contractAmount(oldC)), na = Math.round(contractAmount(newC));
    if (oa !== na) logChange(user, { entity: "contract", entityId: newC.id, objectId, label, field: "сумма договора", action: "изменил", old: _tng(oa), new: _tng(na) });
    const os = oldC.contractStatus || "draft", ns = newC.contractStatus || "draft";
    if (os !== ns) logChange(user, { entity: "contract", entityId: newC.id, objectId, label, field: "статус договора", action: "изменил", old: _cStatusLbl(os), new: _cStatusLbl(ns) });
  } catch (e) { console.warn("logContractSave failed", e); }
};

// Экспорт в CSV (Excel открывает напрямую; BOM + ; для русской локали)
const downloadCSV = (filename, headers, rows) => {
  const esc = (v) => {
    let s = v===null||v===undefined ? "" : String(v);
    // Защита от инъекции формул в Excel/Sheets: поле, начинающееся с = + - @,
    // предваряем апострофом, чтобы оно не выполнилось как формула
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const lines = [headers.map(esc).join(";"), ...rows.map(r=>r.map(esc).join(";"))];
  const blob = new Blob(["﻿"+lines.join("\r\n")], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
};

// ─── ХРАНИЛИЩЕ: Firebase (общая) + localStorage (резерв) ───────────────────
const _mem = {};
const _TIMEOUT = Symbol("timeout");
const _race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(_TIMEOUT), ms))]);
const _fbKey = (k) => k.replace(/[^a-zA-Z0-9_]/g, "_"); // Firebase: только буквы/цифры/_
const _TS_SUFFIX = "__wts"; // timestamp последней локальной записи
const _DIRTY_SUFFIX = "__dirty"; // флаг: последняя запись в облако НЕ прошла — локальная копия новее
// Число реально выполняющихся обычных storage.set по ключу. Durable dirty-маркер ставится
// ДО сетевого await, но пока запрос в полёте это ещё не ошибка облака. UI исключает такие
// ключи из аварийного счётчика; при неудаче set завершится, marker останется и станет видимым.
const _storageWritesInFlight = new Map();
const _beginStorageFlight = key => _storageWritesInFlight.set(key, (_storageWritesInFlight.get(key) || 0) + 1);
const _endStorageFlight = key => {
  const left = (_storageWritesInFlight.get(key) || 1) - 1;
  if (left > 0) _storageWritesInFlight.set(key, left);
  else _storageWritesInFlight.delete(key);
};
// Идентификатор ВКЛАДКИ (на загрузку страницы) + текущий пользователь — владелец dirty-записей.
// Нужны, чтобы выход «с потерей» в одной вкладке не снимал dirty-метки другой вкладки
// и не выбрасывал правки другого пользователя.
const _TAB_ID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
let _dirtyOwnerUid = null; // выставляется storage.setDirtyOwner при входе пользователя
// Editor-lock включается только для авторизованного приложения. Публичные страницы работают
// отдельно и не участвуют в блокировке внутренней ERP.
let _leaseEnforced = false;
let _editorLockHeld = false;
let _editorLockMode = null; // "web" | "fallback"
let _editorLockToken = null;
let _editorSessionN = 0;
let _editorGateN = 0;
let _editorAcquireN = 0;
let _editorReleaseRequested = false;
let _editorInflight = 0;
let _editorDrainWaiters = [];
let _webLockRelease = null;
let _webLockAcquire = null;
const _newEditorToken = () => `${_TAB_ID}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const _editorOwnsLocalLease = () => {
  try {
    return ownsActiveLease(
      localStorage.getItem(EDIT_LEASE_KEY),
      _dirtyOwnerUid,
      _TAB_ID,
      _editorLockToken,
      Date.now(),
    );
  } catch { return false; }
};
const _editorMayWrite = () => {
  if (!_leaseEnforced) return true;
  if (!_editorLockHeld || _editorReleaseRequested) return false;
  return _editorLockMode === "web" ? true : _editorOwnsLocalLease();
};
// Центральный fail-closed гейт: «lease свободен» не является правом записи.
function _writeGateFail() {
  if (!_leaseEnforced) return null;
  return _editorMayWrite() ? null : { reason: "read-only-tab" };
}
function _beginEditorWrite() {
  const fail = _writeGateFail();
  if (fail) return { fail, session: null };
  const session = _editorSessionN;
  if (_leaseEnforced) _editorInflight++;
  return { fail: null, session };
}
function _mayApplyEditorResult(session) {
  return session === _editorSessionN && _editorMayWrite();
}
function _finishEditorRelease() {
  const token = _editorLockToken;
  try {
    const l = parseLease(localStorage.getItem(EDIT_LEASE_KEY));
    if (l && l.tab === _TAB_ID && l.token === token) localStorage.removeItem(EDIT_LEASE_KEY);
  } catch {}
  _editorLockHeld = false;
  _editorLockMode = null;
  _editorLockToken = null;
  _editorReleaseRequested = false;
  _editorSessionN++;
  const release = _webLockRelease;
  _webLockRelease = null;
  if (release) release();
  const waiters = _editorDrainWaiters;
  _editorDrainWaiters = [];
  waiters.forEach(r => r());
}
function _endEditorWrite() {
  if (_leaseEnforced && _editorInflight > 0) _editorInflight--;
  if (_editorReleaseRequested && _editorInflight === 0) _finishEditorRelease();
}
async function _acquireEditorLock() {
  if (_editorLockHeld && !_editorReleaseRequested) return true;
  if (_webLockAcquire) return _webLockAcquire;
  _editorReleaseRequested = false;
  const acquireN = ++_editorAcquireN;
  const token = _newEditorToken();

  if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
    let settle;
    const acquired = new Promise(resolve => { settle = resolve; });
    _webLockAcquire = acquired;
    navigator.locks.request("titovstroy-editor", { mode: "exclusive", ifAvailable: true }, async lock => {
      if (!lock) { settle(false); return; }
      // Оболочка могла размонтироваться, пока браузер выдавал lock. Не оживляем завершённую сессию.
      if (acquireN !== _editorAcquireN) { settle(false); return; }
      _editorLockHeld = true;
      _editorLockMode = "web";
      _editorLockToken = token;
      _editorSessionN++;
      try { localStorage.setItem(EDIT_LEASE_KEY, makeLease(_dirtyOwnerUid, _TAB_ID, Date.now(), token)); } catch {}
      settle(true);
      await new Promise(resolve => { _webLockRelease = resolve; });
    }).catch(() => settle(false)).finally(() => { _webLockAcquire = null; });
    return acquired;
  }

  // Резерв для браузеров без Web Locks: write-then-verify с fencing-token. Гейт всё равно
  // fail-closed и не разрешает запись, пока токен не подтверждён повторным чтением.
  try {
    const claimed = await claimFallbackLease(localStorage, _dirtyOwnerUid, _TAB_ID, token);
    if (!claimed) return false;
    if (acquireN !== _editorAcquireN) {
      try {
        const l = parseLease(localStorage.getItem(EDIT_LEASE_KEY));
        if (l && l.tab === _TAB_ID && l.token === token) localStorage.removeItem(EDIT_LEASE_KEY);
      } catch {}
      return false;
    }
    _editorLockHeld = true;
    _editorLockMode = "fallback";
    _editorLockToken = token;
    _editorSessionN++;
    return true;
  } catch {
    return false;
  }
}
function _heartbeatEditorLock() {
  if (!_editorLockHeld || _editorReleaseRequested) return false;
  if (_editorLockMode === "fallback" && !_editorOwnsLocalLease()) {
    _editorLockHeld = false;
    _editorLockToken = null;
    _editorSessionN++;
    return false;
  }
  try { localStorage.setItem(EDIT_LEASE_KEY, makeLease(_dirtyOwnerUid, _TAB_ID, Date.now(), _editorLockToken)); } catch {}
  return true;
}
function _releaseEditorLock() {
  // Отменяет в том числе ещё не завершившуюся попытку захвата.
  _editorAcquireN++;
  if (!_editorLockHeld) return Promise.resolve();
  _editorReleaseRequested = true;
  if (_editorInflight === 0) {
    _finishEditorRelease();
    return Promise.resolve();
  }
  return new Promise(resolve => _editorDrainWaiters.push(resolve));
}
// На ключе dirty-маркер ДРУГОГО пользователя/вкладки или legacy — локальную копию трогать нельзя.
function _foreignDirty(key) {
  try { return !mayUseLocalCopy(localStorage.getItem(key + _DIRTY_SUFFIX), _dirtyOwnerUid, _TAB_ID); } catch { return false; }
}
// ── REST-ФОЛБЭК ДЛЯ ОБЛАКА ──
// Firebase SDK ходит по WebSocket — его нередко режут блокировщики рекламы, антивирусы,
// корпоративные сети и «оптимизаторы» провайдеров. При этом сама база доступна: обычный
// HTTPS-запрос (fetch) проходит. Поэтому если SDK-запись/чтение не удались — пробуем
// то же самое через REST API базы. Это устраняет вечное «облако недоступно» на машинах,
// где заблокирован именно WebSocket, а не Firebase целиком.
const _restToken = async () => {
  try { await _fbAuthReady; const u = _fbAuth && _fbAuth.currentUser; return u ? await u.getIdToken() : null; } catch { return null; }
};
const _restUrl = (key, token) => firebaseConfig.databaseURL + "/" + _fbKey(key) + ".json" + (token ? "?auth=" + encodeURIComponent(token) : "");
const _fbRestSet = async (key, value) => {
  if (!firebaseConfig.databaseURL) return false;
  try {
    const token = await _restToken();
    const r = await _race(fetch(_restUrl(key, token), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }), 12000);
    return !!(r && r !== _TIMEOUT && r.ok);
  } catch { return false; }
};
const _fbRestGet = async (key) => {
  if (!firebaseConfig.databaseURL) return { ok: false };
  try {
    const token = await _restToken();
    const r = await _race(fetch(_restUrl(key, token)), 8000);
    if (!r || r === _TIMEOUT || !r.ok) return { ok: false };
    const v = await r.json();
    // null = ключа нет (это ЧЕСТНЫЙ ответ базы, не ошибка); строка = новый формат; объект = старый
    return { ok: true, value: v === null ? null : (typeof v === "string" ? v : JSON.stringify(v)) };
  } catch { return { ok: false }; }
};
// Согласование локальной («грязной») копии с облаком: для СПИСКОВ записей с id (или
// objectId — у production-записей нет id, они живут по objectId, см. emptyProduction)
// объединяем по идентификатору и берём более свежую по updatedAt. Так незасинканная
// локальная правка НЕ теряется, но и устаревшая локальная копия НЕ прячет более свежий
// сервер (частая причина «данные откатились» после сбоя облака). Не-списки — прежнее поведение.
function _reconcileDirty(localStr, cloudStr) {
  try {
    const L = JSON.parse(localStr);
    const C = JSON.parse(cloudStr);
    const idOf = x => (x && typeof x === "object") ? (x.id != null ? x.id : x.objectId) : undefined;
    const okList = a => Array.isArray(a) && a.every(x => idOf(x) != null);
    if (okList(L) && okList(C)) {
      const map = new Map();
      for (const e of C) map.set(idOf(e), e);
      for (const e of L) { const k = idOf(e); const ex = map.get(k); if (!ex || _ts(e.updatedAt) >= _ts(ex.updatedAt)) map.set(k, e); }
      return JSON.stringify([...map.values()]);
    }
  } catch (e) {}
  return localStr; // не списки/ошибка разбора — доверяем локальной (как раньше)
}
const storage = {
  // Расширенное чтение: { value, status: 'found'|'empty'|'unavailable' }
  // 'found' — данные есть; 'empty' — источник точно ответил, данных нет;
  // 'unavailable' — Firebase не ответил/ошибка И локальной копии нет (НЕЛЬЗЯ затирать!)
  async getResult(key) {
    // ВЛАДЕНИЕ: dirty-маркер ДРУГОГО пользователя/вкладки на ключе → локальную копию использовать
    // НЕЛЬЗЯ ни из одного источника (свежий кеш 30с, dirty-ветка, старый фоллбек, _mem) — иначе
    // несохранённая смета пользователя A (аварийно закрыл вкладку, без logout) читалась бы
    // пользователем B, становилась базой его сохранений и уезжала в облако. При чужом маркере
    // читаем ТОЛЬКО Firebase; облако молчит → unavailable, а не чужая копия.
    const localAllowed = !_foreignDirty(key);
    // Свежая локальная запись (<30с) — самый надёжный источник (если копия наша)
    try {
      const ts = parseInt(localStorage.getItem(key + _TS_SUFFIX) || "0");
      if (localAllowed && Date.now() - ts < 30000) {
        const v = localStorage.getItem(key);
        if (v) return { value: v, status: "found" };
      }
    } catch(e) {}
    // Незасинхронизированные локальные правки: последняя запись в облако упала.
    // РАНЬШЕ слепо возвращали локальную копию — из-за этого устаревший локальный
    // кэш мог перекрыть более свежий сервер (и даже затолкать старьё обратно при
    // сохранении). ТЕПЕРЬ сверяем с облаком и объединяем по id: свежая правка не
    // теряется, но и старая локальная копия не прячет актуальные серверные данные.
    try {
      if (localAllowed && localStorage.getItem(key + _DIRTY_SUFFIX)) {
        const localVal = localStorage.getItem(key);
        if (localVal) {
          if (_fbDb) {
            try {
              await _fbAuthReady;
              let snap = await _race(get(ref(_fbDb, _fbKey(key))), 8000);
              if (snap && snap !== _TIMEOUT && snap.exists()) {
                const cRaw = snap.val();
                const cloudVal = typeof cRaw === "string" ? cRaw : JSON.stringify(cRaw);
                return { value: _reconcileDirty(localVal, cloudVal), status: "found" };
              }
            } catch(e) { /* облако не ответило — доверяем локальной ниже */ }
          }
          return { value: localVal, status: "found" };
        }
      }
    } catch(e) {}
    // Firebase (синхронизация между устройствами)
    let fbResponded = !_fbDb; // если FB не сконфигурирован — авторитетен localStorage
    try {
      if (_fbDb) {
        await _fbAuthReady;
        let snap = await _race(get(ref(_fbDb, _fbKey(key))), 8000);
        // Одна повторная попытка при таймауте (сеть могла мигнуть)
        if (snap === _TIMEOUT) {
          await new Promise(r=>setTimeout(r,500));
          snap = await _race(get(ref(_fbDb, _fbKey(key))), 8000);
        }
        if (snap === _TIMEOUT) {
          // SDK не ответил (WebSocket мог быть заблокирован) — пробуем REST тем же ключом
          const rr = await _fbRestGet(key);
          if (rr.ok) {
            fbResponded = true;
            if (rr.value !== null) return { value: rr.value, status: "found" };
          } else {
            fbResponded = false; // и REST не ответил — НЕ знаем что в базе
          }
        } else {
          fbResponded = true;
          if (snap && snap.exists()) {
            const v = snap.val();
            // Новый формат — строка JSON; старый — вложенный объект (обратная совместимость)
            return { value: typeof v === "string" ? v : JSON.stringify(v), status: "found" };
          }
        }
      }
    } catch(e) {
      console.warn("FB get error:", e);
      // Ошибка SDK — последний шанс через REST
      try {
        const rr = await _fbRestGet(key);
        if (rr.ok) { if (rr.value !== null) return { value: rr.value, status: "found" }; fbResponded = true; }
        else fbResponded = false;
      } catch { fbResponded = false; }
    }
    // Резерв: localStorage/_mem любой давности — ТОЛЬКО если копия не помечена чужим dirty
    if (localAllowed) {
      try { const v = localStorage.getItem(key); if (v) return { value: v, status: "found" }; } catch(e) {}
      if (_mem[key]) return { value: _mem[key], status: "found" };
    }
    // Ничего не нашли (или чужая копия под запретом): «точно пусто» либо «недоступно»
    return { value: null, status: fbResponded ? "empty" : "unavailable" };
  },
  // Чтение ТОЛЬКО из облака (Firebase). НИКОГДА не берёт localStorage/_mem — в отличие от
  // getResult, который ради оффлайна отдаёт локальную (возможно устаревшую/грязную) копию со
  // статусом "found". Нужно для ПОЛНОГО БЭКАПА: файл можно назвать полным, только если каждый
  // раздел реально прочитан из базы. Возвращает { status:'found'|'empty'|'unavailable', value, source:'firebase' }.
  async getCloudResult(key) {
    // Здесь принципиально НЕ используем SDK: get()/runTransaction при офлайне могут вернуть
    // локальный кеш (в том числе временный "[]") как найденное значение. Только REST-ответ
    // доказывает текущее состояние сервера; его отсутствие означает unavailable, не удаление.
    return resolveVerifiedCloudRead(await _fbRestGet(key));
  },
  async get(key) {
    const r = await this.getResult(key);
    return r.status === "found" ? { value: r.value } : null;
  },
  // Запись ТОЛЬКО в облако (SDK, затем REST). НЕ пишет в localStorage/_mem и НЕ ставит dirty,
  // когда облако не ответило — иначе неудачная запись при ВОССТАНОВЛЕНИИ осела бы «грязной»
  // локальной копией, и автосинк позже неожиданно затолкал бы её в облако, хотя restore был
  // объявлен частичным. При успехе снимаем подтвержденный dirty и не занимаем квоту постоянной
  // копией: актуальное рабочее значение остаётся в памяти сессии, каноническое — в Firebase.
  async setCloudOnly(key, value) {
    const op = _beginEditorWrite();
    if (op.fail) return { fbOk: false, fbError: op.fail.reason };
    let fbOk = false, fbError = null;
    try {
      if (_fbDb) {
        try {
          await _fbAuthReady;
          let res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
          if (res === _TIMEOUT) { await new Promise(r => setTimeout(r, 800)); res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000); }
          if (res !== _TIMEOUT) fbOk = true; else fbError = "timeout";
        } catch(e) { fbError = e?.message || String(e); }
        if (!fbOk) { try { if (await _fbRestSet(key, value)) { fbOk = true; fbError = null; } } catch {} }
      } else {
        try { if (await _fbRestSet(key, value)) fbOk = true; else fbError = "no cloud"; } catch(e) { fbError = e?.message || String(e); }
      }
      if (fbOk && _mayApplyEditorResult(op.session) && !_foreignDirty(key)) {
        clearSyncedLocalMirror(localStorage, _mem, key,
          raw => mayClearDirtyOnSuccess(raw, _dirtyOwnerUid, _TAB_ID),
          { dirty: _DIRTY_SUFFIX, ts: _TS_SUFFIX });
        // В памяти держим только рабочее значение текущей сессии. Истории бэкапов могут быть
        // десятками мегабайт и не нужны ни как локальный кеш, ни как офлайн-черновик.
        if (!/^titovstroy-.*-backups$/.test(key)) _mem[key] = value;
      }
      return { fbOk, fbError };
    } finally {
      _endEditorWrite();
    }
  },
  // АТОМАРНОЕ чтение-слияние-запись СПИСКА через Firebase runTransaction. mutator получает
  // текущий массив (распарсенный), возвращает новый массив ИЛИ undefined для отмены. Хранилище
  // держит значения JSON-СТРОКАМИ, поэтому парсим внутри транзакции; битое/не-массив → отмена.
  // ТОЛЬКО SDK: если транзакция не прошла (нет SDK/таймаут/не закоммичена) — возвращаем
  // committed:false, БЕЗ отката на обычный set (иначе теряется атомарность). Нужно для аудита:
  // параллельная запись между чтением и сохранением не должна затираться восстановлением.
  async mutateTransaction(key, mutator) {
    const op = _beginEditorWrite();
    if (op.fail) return { committed: false, reason: op.fail.reason };
    if (!_fbDb) { _endEditorWrite(); return { committed: false, reason: "no-sdk" }; }
    try {
      await _fbAuthReady;
      const res = await _race(runTransaction(ref(_fbDb, _fbKey(key)), (cur) => {
        let list;
        const wasNull = cur == null; // ХОЛОДНЫЙ КЕШ: без активного listener'а первый прогон
        // runTransaction всегда получает null, ДАЖЕ если на сервере есть данные (гоча SDK).
        if (wasNull) list = [];
        else if (typeof cur === "string") { try { list = JSON.parse(cur); } catch { return; } } // битый JSON → отмена
        else if (Array.isArray(cur)) list = cur;
        else return; // неожиданная форма → отмена
        if (!Array.isArray(list)) return;
        const next = mutator(list);
        if (next === undefined || !Array.isArray(next)) {
          // Отмена мутатором. При wasNull НЕЛЬЗЯ просто abort'ить: «null» может быть холодным
          // кешем, а не пустой базой — abort ушёл бы БЕЗ похода на сервер, и команда по
          // существующей карточке ложно падала бы «no-card» (а retry бился бы вечно в тот же кеш).
          // Документированный паттерн: возвращаем текущее («[]») — CAS против реального значения
          // сервера провалится и SDK ПЕРЕзапустит колбэк уже с настоящими данными; если база
          // ДЕЙСТВИТЕЛЬНО пуста — закоммитится безобидный «[]», а отмена вернётся через notOk.
          if (wasNull) return JSON.stringify(list);
          return; // отмена на РЕАЛЬНЫХ данных — честный конфликт
        }
        return JSON.stringify(next);
      }), 15000);
      if (res === _TIMEOUT) return { committed: false, reason: "timeout" };
      if (res && res.committed) {
        const v = res.snapshot ? res.snapshot.val() : null;
        const val = typeof v === "string" ? v : (v == null ? null : JSON.stringify(v));
        if (val != null && _mayApplyEditorResult(op.session) && !_foreignDirty(key)) {
          clearSyncedLocalMirror(localStorage, _mem, key,
            raw => mayClearDirtyOnSuccess(raw, _dirtyOwnerUid, _TAB_ID),
            { dirty: _DIRTY_SUFFIX, ts: _TS_SUFFIX });
          if (!/^titovstroy-.*-backups$/.test(key)) _mem[key] = val;
        }
        return { committed: true, value: val };
      }
      return { committed: false, reason: "aborted" };
    } catch(e) {
      return { committed: false, reason: e?.message || String(e) };
    } finally {
      _endEditorWrite();
    }
  },
  async set(key, value) {
    // LEASE-ГЕЙТ (ДО любых записей): живой lease другой вкладки → эта вкладка read-only,
    // не трогаем ни localStorage, ни dirty, ни Firebase.
    const op = _beginEditorWrite();
    if (op.fail) return { value, fbOk: false, fbError: op.fail.reason };
    _beginStorageFlight(key);
    // ЧУЖОЙ ЧЕРНОВИК: dirty-маркер другой вкладки/пользователя на ключе — их несохранённое
    // содержимое в localStorage[key] затирать НЕЛЬЗЯ (маркер без содержимого бесполезен: вкладка
    // отправила бы позже НАШЕ значение вместо своей правки). Пишем только в Firebase; наше
    // локальное зеркало пропускаем — getResult при чужом маркере и так читает только облако.
    const _foreign = _foreignDirty(key);
    const _technicalBackup = /^titovstroy-.*-backups$/.test(key);
    if (!_foreign && !_technicalBackup) {
      // Сначала localStorage — мгновенно, но СРАЗУ как pending. Если вкладка потеряет editor-lock
      // во время сетевого await, новая вкладка увидит владельца маркера и не примет эту копию за
      // подтверждённый кеш. Снять маркер может только успешный ответ той же editor-сессии.
      const persistPending = () => {
        localStorage.setItem(key, value);
        localStorage.setItem(key + _TS_SUFFIX, Date.now().toString());
        localStorage.setItem(key + _DIRTY_SUFFIX, makeDirtyMarker(_dirtyOwnerUid, _TAB_ID));
      };
      try { persistPending(); }
      catch(e) {
        // Старые версии могли заполнить квоту чистыми копиями и облачными бэкапами.
        // Освобождаем только их, dirty-черновики других рабочих разделов не трогаем.
        compactLocalStorageMirrors(localStorage, _mem, { dirty: _DIRTY_SUFFIX, ts: _TS_SUFFIX });
        try { persistPending(); } catch(e2) { console.warn("local pending save failed:", key, e2); }
      }
      _mem[key] = value;
    }
    // Firebase — пишем СТРОКУ JSON целиком (а не вложенный объект),
    // иначе ключи с символами / . # $ [ ] (напр. названия работ со слэшем) ломают запись.
    let fbOk = false, fbError = null;
    try {
      if (_fbDb) {
        try {
          await _fbAuthReady;
          let res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
        // Одна повторная попытка записи при таймауте/ошибке
        if (res === _TIMEOUT) {
          await new Promise(r=>setTimeout(r,800));
          res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
        }
        if (res === _TIMEOUT) { fbError = "timeout"; }
        else { fbOk = true; }
      } catch(e) {
        fbError = e?.message || String(e); console.warn("FB set error:", e);
        // повтор после ошибки
        try {
          await new Promise(r=>setTimeout(r,800));
          const res2 = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
          if (res2 !== _TIMEOUT) { fbOk = true; fbError = null; }
        } catch(e2) { fbError = e2?.message || String(e2); }
      }
      // SDK (WebSocket) не смог — пробуем обычным HTTPS-запросом (REST). Часто именно
      // WebSocket заблокирован блокировщиком/сетью, а сама база доступна.
        if (!fbOk) {
          try { if (await _fbRestSet(key, value)) { fbOk = true; fbError = null; } } catch {}
        }
      } else {
        fbError = "firebase not configured";
      }
      if (_mayApplyEditorResult(op.session)) {
        try {
          if (fbOk && !_technicalBackup) {
            clearSyncedLocalMirror(localStorage, _mem, key,
              raw => mayClearDirtyOnSuccess(raw, _dirtyOwnerUid, _TAB_ID),
              { dirty: _DIRTY_SUFFIX, ts: _TS_SUFFIX });
            _mem[key] = value;
          }
        } catch(e) {}
      }
      return { value, fbOk, fbError };
    } finally {
      _endStorageFlight(key);
      _endEditorWrite();
    }
  },
  // Список ключей с незасинхронизированными («грязными») правками
  dirtyKeys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.endsWith(_DIRTY_SUFFIX)) out.push(k.slice(0, -_DIRTY_SUFFIX.length));
      }
    } catch(e) {}
    return out;
  },
  // Текущий владелец dirty-записей (id залогиненного пользователя) — для маркеров.
  setDirtyOwner(uid) { _dirtyOwnerUid = uid == null ? null : uid; },
  adoptUserDirty() { return adoptUserDirty(localStorage, _dirtyOwnerUid, _TAB_ID, _DIRTY_SUFFIX); },
  // ── EXCLUSIVE EDITOR LOCK (включается оболочкой ДО монтирования MainApp) ──
  setLeaseEnforced(on) { _leaseEnforced = !!on; },
  isReadOnlyTab() { return !!_writeGateFail(); },
  acquireEditLease() { return _acquireEditorLock(); },
  heartbeatEditLease() { return _heartbeatEditorLock(); },
  releaseEditLease() { return _releaseEditorLock(); },
  editorSession() { return _editorSessionN; },
  mayApplyEditorResult(session) { return _mayApplyEditorResult(session); },
  // Dirty-записи ИМЕННО этого пользователя и этой вкладки (legacy-маркеры не имеют владельца).
  dirtyKeysOwned() { return listOwnedDirty(localStorage, _dirtyOwnerUid, _TAB_ID, _DIRTY_SUFFIX); },
  // Dirty-записи к АВТООТПРАВКЕ: свои И не legacy (см. listFlushableDirty — карантин legacy).
  dirtyKeysFlushable() { return listFlushableDirty(localStorage, _dirtyOwnerUid, _TAB_ID, _DIRTY_SUFFIX); },
  // Для баннера: исключаем marker активного запроса. После реального отказа запрос завершится,
  // marker останется и на следующем тике попадёт сюда.
  dirtyKeysVisible() { return visibleDirtyKeys(this.dirtyKeysFlushable(), _storageWritesInFlight); },
  // Legacy-маркеры без владельца (карантин: не авто-отправляются, видны в баннере отдельно).
  legacyDirtyKeys() {
    return this.dirtyKeys().filter(base => { try { return isLegacyDirtyMarker(localStorage.getItem(base + _DIRTY_SUFFIX)); } catch { return false; } });
  },
  legacyDirtySnapshot() {
    return this.legacyDirtyKeys().map(key => ({
      key,
      value: (() => { try { return localStorage.getItem(key); } catch { return null; } })(),
      writtenAt: (() => { try { return localStorage.getItem(key + _TS_SUFFIX); } catch { return null; } })(),
      marker: (() => { try { return localStorage.getItem(key + _DIRTY_SUFFIX); } catch { return null; } })(),
    }));
  },
  // ПОДТВЕРЖДЁННАЯ пользователем потеря при выходе: удалить СВОИ dirty-записи ЦЕЛИКОМ — метку,
  // само значение, __wts и копию в _mem. Иначе следующий пользователь получил бы чужую смету
  // (свежая локальная копия выигрывает в getResult), а её сохранение вернуло бы «потерянное» в
  // облако. Записи ДРУГИХ вкладок/пользователей не трогаем — та вкладка сама дожмёт или спросит.
  discardOwnDirty() {
    return discardOwnedDirty(localStorage, _dirtyOwnerUid, _TAB_ID, _mem, { dirty: _DIRTY_SUFFIX, ts: _TS_SUFFIX });
  },
  // Освобождает квоту браузера от подтвержденных зеркал и технических бэкапов. Реальные
  // неподтвержденные правки с dirty-маркером сохраняются и продолжают участвовать в retry.
  compactLocalMirrors() {
    return compactLocalStorageMirrors(localStorage, _mem, { dirty: _DIRTY_SUFFIX, ts: _TS_SUFFIX });
  },
  // Технические фоновые ключи не являются пользовательскими правками. Старые версии
  // могли оставить для них dirty-маркер и из-за этого спрашивать о потере данных при
  // обычном выходе сразу после входа. Удаляем только локальный технический снимок;
  // рабочие разделы (объекты, сметы, финансы и т.д.) этот метод не принимает.
  discardTechnicalDirty(key) {
    if (key !== WORKSPACE_BACKUPS_KEY) return false;
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(key + _TS_SUFFIX);
      localStorage.removeItem(key + _DIRTY_SUFFIX);
      delete _mem[key];
      return true;
    } catch {
      return false;
    }
  },
  // САМОИСЦЕЛЕНИЕ: дослать в облако зависшие локальные правки, предварительно СЛИВ с сервером
  // по id. ТОЛЬКО СВОИ записи (этот пользователь + эта вкладка, dirtyKeysFlushable): глобальный
  // флеш отправлял бы правки ДРУГОГО пользователя/вкладки под текущей сессией (правку другой
  // вкладки дожмёт её собственный интервал; legacy-маркеры — в карантине). set() при успехе
  // снимает только свой флаг.
  async flushDirty() {
    if (!_fbDb) return 0;
    if (_writeGateFail()) return 0; // read-only вкладка не дожимает (это записи)
    // Не запускаем параллельный повтор того же ключа, пока исходная запись ещё выполняется.
    const keys = this.dirtyKeysVisible();
    let done = 0;
    for (const key of keys) {
      try {
        const localVal = localStorage.getItem(key);
        if (localVal == null) { try { localStorage.removeItem(key + _DIRTY_SUFFIX); } catch(e){} continue; }
        let merged = localVal;
        try {
          await _fbAuthReady;
          const snap = await _race(get(ref(_fbDb, _fbKey(key))), 8000);
          if (snap === _TIMEOUT) continue; // облако не ответило — оставим до следующего раза
          if (snap && snap.exists()) {
            const cRaw = snap.val();
            const cloudVal = typeof cRaw === "string" ? cRaw : JSON.stringify(cRaw);
            merged = _reconcileDirty(localVal, cloudVal);
          }
        } catch(e) { continue; }
        const res = await this.set(key, merged);
        if (res && res.fbOk) done++;
      } catch(e) {}
    }
    return done;
  },
};

// ─── ЭКРАН ВХОДА ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [login, setLogin]   = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (loading) return; // защита от двойной отправки
    if (!login.trim() || !password.trim()) { setError("Введите логин и пароль"); return; }
    // Блокировка после серии неверных попыток — защита от простого перебора пароля.
    const lockUntil = getLoginLockout(login.trim());
    if (lockUntil) {
      const minLeft = Math.max(1, Math.ceil((lockUntil - Date.now()) / 60000));
      setError(`Слишком много неверных попыток. Попробуйте снова через ${minLeft} мин.`);
      return;
    }
    setLoading(true); setError("");

    // Загружаем пользователей. КРИТИЧНО различать "база подтверждённо пуста" (первый
    // запуск — можно войти дефолтным admin) и "база недоступна" (сеть моргнула) — раньше
    // оба случая тихо падали на DEFAULT_USERS по таймауту в 1.5с, а значит логин/пароль
    // из бандла (admin/titov2024) реально пускал в систему при любом сетевом сбое, даже
    // если настоящий пароль давно сменили. Теперь при "unavailable" — честная ошибка,
    // без входа по дефолтным кредам.
    let users, loadedFromStorage = false;
    const res = await storage.getResult(USERS_KEY);
    if (res.status === "found") {
      // Повреждённый JSON (не распарсился/не массив) — это НЕ «базы нет», список
      // пользователей реально существует и в нём чужие пароли. Раньше это тихо падало
      // на DEFAULT_USERS — вход по вшитым в бандл admin/titov2024 прошёл бы, даже если
      // реальные пароли давно другие. Теперь — честная блокировка входа, не бэкдор.
      try {
        const parsed = JSON.parse(res.value);
        if (!Array.isArray(parsed)) throw new Error("users is not an array");
        users = parsed; loadedFromStorage = true;
      } catch(e) {
        setError("Список пользователей повреждён — вход заблокирован для безопасности. Обратитесь к администратору.");
        setLoading(false);
        return;
      }
    } else if (res.status === "empty") {
      users = DEFAULT_USERS;
    } else {
      setError("Не удалось подключиться к базе. Проверьте интернет и попробуйте снова.");
      setLoading(false);
      return;
    }

    const candidate = users.find(u => u.login.toLowerCase() === login.trim().toLowerCase());
    const ok = candidate ? await verifyPassword(password, candidate.password) : false;

    if (ok) {
      clearLoginAttempts(login.trim());
      // Пароль не мигрируем ДО получения editor-lock: экран входа не имеет права менять общую
      // базу, пока другая вкладка может быть активным редактором. Миграция выполняется только
      // при следующей явной смене пароля из авторизованной вкладки.
      const { password: _pw, ...safeUser } = candidate; // не храним пароль в сессии
      const sessUser = { ...safeUser, authAt: Date.now() }; // время входа — для инвалидации сессии при смене пароля
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user: sessUser, savedAt: Date.now() })); } catch(e) {}
      onLogin(sessUser);
      return; // компонент размонтируется, setLoading вызывать нельзя
    } else {
      registerFailedLogin(login.trim());
      setError("Неверный логин или пароль");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;color:#111827;background:#f8fafc}h1,h2,h3{font-family:'Poppins','Inter',sans-serif;letter-spacing:-.02em}button{font-family:'Inter','Segoe UI',sans-serif}a[x-apple-data-detectors],a[href^="tel"]{color:inherit!important;text-decoration:none!important;pointer-events:none!important;-webkit-text-decoration-color:inherit!important}`}</style>
      <div style={{width:"100%",maxWidth:380}}>
        {/* Лого */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,borderRadius:8,background:"#2563eb",display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:26,color:"#f3f4f6",marginBottom:12}}>T</div>
          <div style={{fontWeight:900,fontSize:22,color:"#0f172a",letterSpacing:.3}}>TitovStroy</div>
          <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>Система расчёта смет · Вход</div>
        </div>

        {/* Форма */}
        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:8,padding:"28px 28px"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Логин</div>
            <input
              style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
              placeholder="Введите логин"
              value={login}
              onChange={e=>{setLogin(e.target.value);setError("");}}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}
              autoComplete="username"
            />
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:"#94a3b8",marginBottom:6,fontWeight:600,letterSpacing:.5,textTransform:"uppercase"}}>Пароль</div>
            <div style={{position:"relative"}}>
              <input
                style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"11px 40px 11px 14px",fontFamily:"inherit",fontSize:14,width:"100%",outline:"none",transition:"border .15s"}}
                placeholder="Введите пароль"
                type={showPass?"text":"password"}
                value={password}
                onChange={e=>{setPassword(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                autoComplete="current-password"
              />
              <button onClick={()=>setShowPass(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16}}>
                {showPass?"🙈":"👁"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{background:"rgba(220,38,38,.1)",border:"1px solid rgba(200,60,60,.25)",borderRadius:7,padding:"9px 12px",fontSize:12,color:"#dc2626",marginBottom:16,textAlign:"center"}}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{width:"100%",background:"#2563eb",color:"#f3f4f6",border:"none",cursor:loading?"not-allowed":"pointer",padding:"13px",borderRadius:8,fontFamily:"inherit",fontSize:14,fontWeight:700,opacity:loading?.6:1,transition:"all .2s"}}>
            {loading ? "Проверка..." : "Войти"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#d1d5db"}}>TitovStroy · Только для сотрудников</div>
      </div>
    </div>
  );
}

// Метаданные журнала (используются и общим журналом, и срезом по объекту)
const AUDIT_SECTION_META = {
  finance_tx: { label: "Финансы",   color: "#059669", bg: "#d1fae5", icon: "💰" },
  object:     { label: "Объекты",   color: "#2563eb", bg: "#dbeafe", icon: "🏗" },
  contract:   { label: "Договора",  color: "#7c3aed", bg: "#ede9fe", icon: "📋" },
  estimate:   { label: "Сметы",     color: "#0891b2", bg: "#cffafe", icon: "🧮" },
  stage:      { label: "Этапы",     color: "#ea580c", bg: "#ffedd5", icon: "🛠" },
  publish:    { label: "Кабинет",   color: "#0d9488", bg: "#ccfbf1", icon: "🌐" },
  document:   { label: "Документы", color: "#4f46e5", bg: "#e0e7ff", icon: "📄" },
  client:     { label: "Клиенты",   color: "#db2777", bg: "#fce7f3", icon: "🧑" },
  user:       { label: "Польз-ли",  color: "#d97706", bg: "#fef3c7", icon: "👤" },
};
const AUDIT_SOURCE_META = {
  manual:   { label: "вручную",  color: "#64748b" },
  import:   { label: "импорт",   color: "#7c3aed" },
  autosync: { label: "автосинк", color: "#0891b2" },
  cabinet:  { label: "кабинет",  color: "#d97706" },
};
// Иконка/цвет по смыслу действия (работает и со старыми текстовыми, и с новыми записями)
const _auditActionMeta = (action = "") => {
  const a = String(action).toLowerCase();
  if (/(созда|добав)/.test(a))            return { icon: "➕", color: "#059669" };
  if (/удали/.test(a))                     return { icon: "🗑", color: "#dc2626" };
  if (/восстанов/.test(a))                 return { icon: "♻️", color: "#059669" };
  if (/(назнач)/.test(a))                  return { icon: "👷", color: "#d97706" };
  if (/(опубликова|публик|доступ)/.test(a))return { icon: "🌐", color: "#0d9488" };
  if (/(измен|редактир|обнов|перенёс|перенес)/.test(a)) return { icon: "✏️", color: "#2563eb" };
  return { icon: "📝", color: "#64748b" };
};
const _auditVal = (v) => (v === null || v === undefined || v === "") ? "—" : String(v);

// Журнал изменений. Без objectId — общий (Админка, только админ), с помесячным выбором и фильтрами.
// С objectId — компактный срез по конкретному объекту (все месяцы + архив).
function AuditTab({ objectId = null }) {
  const embed = !!objectId;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);      // ["2026-07", ...] newest-first
  const [month, setMonth] = useState("");         // выбранный; "__legacy__" = архив
  const [fEntity, setFEntity] = useState("");
  const [fUser, setFUser] = useState("");
  const [q, setQ] = useState("");

  const readKey = async (k) => { try { const r = await storage.get(k); if (r) { const p = JSON.parse(r.value); if (Array.isArray(p)) return p; } } catch {} return []; };

  // Индекс месяцев (для селектора / обхода при embed)
  useEffect(() => {
    (async () => {
      let idx = await readKey(AUDIT_INDEX_KEY);
      if (!Array.isArray(idx)) idx = [];
      const cur = _auditYM();
      idx = [...new Set([cur, ...idx])].sort().reverse();
      setMonths(idx);
      if (!embed) setMonth((m) => m || idx[0] || cur);
    })();
  }, [embed]);

  // Загрузка записей
  useEffect(() => {
    (async () => {
      setLoading(true);
      let out = [];
      if (embed) {
        // все месяцы (макс. 12 последних) + архив, фильтр по объекту
        const keys = [...months.slice(0, 12).map(AUDIT_MONTH_KEY), AUDIT_KEY];
        for (const k of keys) out.push(...await readKey(k));
        out = out.filter(e => (e.objectId && e.objectId === objectId) || e.entityId === objectId);
      } else {
        if (!month) { setLoading(false); return; }
        out = month === "__legacy__" ? await readKey(AUDIT_KEY) : await readKey(AUDIT_MONTH_KEY(month));
      }
      out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setRows(out);
      setLoading(false);
    })();
  }, [embed, objectId, month, months]);

  const users = [...new Set(rows.map(e => e.by).filter(Boolean))];
  const sections = [...new Set(rows.map(e => e.entity).filter(Boolean))];
  const filtered = rows.filter(e => {
    if (fEntity && e.entity !== fEntity) return false;
    if (fUser && e.by !== fUser) return false;
    if (q) {
      const hay = [e.by, e.label, e.detail, e.field, e.action, e.old, e.new].map(x => String(x || "").toLowerCase()).join(" ");
      if (!hay.includes(q.toLowerCase().trim())) return false;
    }
    return true;
  });

  const monthLabel = (ym) => {
    if (ym === "__legacy__") return "🗄 Архив (старое)";
    const [y, m] = ym.split("-");
    const nm = ["", "янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][+m] || m;
    return `${nm} ${y}`;
  };

  const renderEntry = (e, i) => {
    const sm = AUDIT_SECTION_META[e.entity] || { label: e.entity || "—", color: "#64748b", bg: "#f1f5f9", icon: "📝" };
    const am = _auditActionMeta(e.action);
    const src = AUDIT_SOURCE_META[e.source] || null;
    const _hasVal = (v) => v !== undefined && v !== null && v !== "";
    const showDiff = _hasVal(e.old) || _hasVal(e.new);
    return (
      <div key={i} style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 10, padding: "10px 13px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: sm.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{sm.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: sm.color, background: sm.bg, padding: "1px 7px", borderRadius: 20, border: `1px solid ${sm.color}30` }}>{sm.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: am.color }}>{am.icon} {e.action}{e.field ? <span style={{ color: "#0f172a" }}> · {e.field}</span> : null}</span>
            {src && <span style={{ fontSize: 9.5, fontWeight: 700, color: src.color, background: src.color + "14", padding: "1px 7px", borderRadius: 20 }}>{src.label}</span>}
          </div>
          {e.label && <div style={{ fontSize: 12, color: "#334155", marginBottom: showDiff ? 4 : 0, overflowWrap: "break-word" }}>{e.label}</div>}
          {showDiff && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: 12, marginBottom: 2 }}>
              <span style={{ background: "#fef2f2", color: "#b91c1c", padding: "1px 8px", borderRadius: 6, textDecoration: "line-through", overflowWrap: "anywhere" }}>{_auditVal(e.old)}</span>
              <span style={{ color: "#94a3b8" }}>→</span>
              <span style={{ background: "#f0fdf4", color: "#15803d", padding: "1px 8px", borderRadius: 6, fontWeight: 700, overflowWrap: "anywhere" }}>{_auditVal(e.new)}</span>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#0f172a" }}><b style={{ color: "#2563eb" }}>{e.by}</b>{e.detail ? <span style={{ color: "#64748b", fontWeight: 400 }}> · {e.detail}</span> : null}</div>
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0, textAlign: "right" }}>
          <div>{new Date(e.ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit" })}</div>
          <div>{new Date(e.ts).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </div>
    );
  };

  const selStyle = { fontSize: 12, padding: "5px 9px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontFamily: "inherit", cursor: "pointer" };

  if (embed) {
    // Компактный срез по объекту
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {loading && <div style={{ color: "#94a3b8", textAlign: "center", padding: "20px 0", fontSize: 13 }}>Загрузка журнала…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: "20px 0", fontSize: 13 }}>Изменений по объекту пока нет</div>}
        {filtered.map(renderEntry)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Журнал изменений</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={selStyle}>
            {months.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
            <option value="__legacy__">{monthLabel("__legacy__")}</option>
          </select>
          <select value={fUser} onChange={e => setFUser(e.target.value)} style={selStyle}>
            <option value="">Все пользователи</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск: объект, договор…" style={{ ...selStyle, cursor: "text", minWidth: 150 }} />
        </div>
      </div>
      {/* Фильтр по разделу */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <button onClick={() => setFEntity("")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #e2e8f0", background: fEntity === "" ? "#0f172a" : "#f8fafc", color: fEntity === "" ? "#fff" : "#64748b", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Все</button>
        {sections.map(s => { const m = AUDIT_SECTION_META[s]; if (!m) return null; return (
          <button key={s} onClick={() => setFEntity(s === fEntity ? "" : s)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: `1px solid ${m.color}40`, background: fEntity === s ? m.color : m.bg, color: fEntity === s ? "#fff" : m.color, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{m.icon} {m.label}</button>
        ); })}
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{filtered.length} событий</span>
      </div>
      {loading && <div style={{ color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>Загрузка…</div>}
      {!loading && filtered.length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>Событий не найдено</div>}
      {filtered.map(renderEntry)}
      {filtered.length > 0 && <button onClick={() => downloadCSV("journal_" + (month === "__legacy__" ? "archive" : month) + ".csv", ["Дата", "Кто", "Раздел", "Действие", "Поле", "Было", "Стало", "Источник", "Объект/детали"], filtered.map(e => [new Date(e.ts).toLocaleString("ru-RU"), e.by, AUDIT_SECTION_META[e.entity]?.label || e.entity || "", e.action, e.field || "", _auditVal(e.old), _auditVal(e.new), AUDIT_SOURCE_META[e.source]?.label || e.source || "", e.label || e.detail || ""]))} style={{ alignSelf: "flex-start", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>⬇ Экспорт (CSV)</button>}
    </div>
  );
}


// ─── КОМПОНЕНТ КП (используется в модале и при печати) ───────────────────────
function KPContent({ proj, kpItems, fromItems, discount, discAmt, final, note }) {
  const CONDITIONS = [
    "Стоимость рассчитана исходя из указанных объемов работ без учета НДС.",
    "В стоимость работ могут входить расходы на материалы, оборудование, доставку и иные затраты, необходимые для выполнения работ, если иное прямо указано в договоре.",
    "Оплата производится по факту выполнения работ.",
    "Сроки выполнения указывается дополнительно в основном договоре.",
    "Работы выполняются по договору.",
    "Гарантия на работы составляет 12 месяцев.",
    "Срок действия настоящего предложения — 7 рабочих дней с даты составления.",
  ];
  return (
    <div style={{fontFamily:"'Golos Text','Segoe UI',sans-serif",color:"#1a1a28",background:"#f5f2ec"}}>
      {/* Шапка */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <div style={{fontWeight:900,fontSize:22,letterSpacing:-.3}}>Ценовое предложение</div>
          <div style={{fontSize:12,color:"#888",marginTop:3}}>на услуги ремонта и отделки недвижимости</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:900,fontSize:16,color:"#b8904a"}}>TitovStroy</div>
          <div style={{fontSize:11,color:"#555",marginTop:2}}>БИН 231040002769</div>
          <div style={{fontSize:11,color:"#555"}}>WA: <span style={{color:"#b8904a"}}>+7 707 982 4915</span></div>
        </div>
      </div>

      {/* Блок клиента */}
      <div style={{background:"#e8e4da",borderRadius:10,padding:"13px 16px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 20px",fontSize:13}}>
        {[["Заказчик",proj.name||"—"],["Телефон",proj.phone||"—"],["Объект",proj.type||"—"],["Адрес",proj.address||"—"],["Дата расчёта",today()],["Действует до",validUntil()],["Менеджер",proj.manager||"—"]].map(([k,v])=>(
          <div key={k}><span style={{color:"#888"}}>{k}: </span><strong>{v}</strong></div>
        ))}
      </div>

      {/* Таблица с группировкой по категориям */}
      {(() => {
        const catOrder = [];
        const catMap = {};
        for (const item of kpItems) {
          if (!catMap[item.cat]) { catMap[item.cat] = []; catOrder.push(item.cat); }
          catMap[item.cat].push(item);
        }
        let rowNum = 0;
        return (
          <div style={{marginBottom:14}}>
            {catOrder.map(cat => {
              const items = catMap[cat];
              const catTotal = items.reduce((s,x)=>s+x.total,0);
              return (
                <div key={cat} style={{marginBottom:12}}>
                  {/* Заголовок категории */}
                  <div style={{background:"#1a1a28",color:"#f5f2ec",padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"6px 6px 0 0"}}>
                    <span style={{fontWeight:700,fontSize:13,letterSpacing:.5,textTransform:"uppercase"}}>{cat}</span>
                    <span style={{fontWeight:700,fontSize:13,color:"#b8904a"}}>{fmt(catTotal)} ₸</span>
                  </div>
                  {/* Строки работ */}
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{background:"#2a2a3a",color:"#aaa"}}>
                        {["№","Раздел","Наименование","Ед.","Объём","Цена","Сумма"].map(h=>(
                          <th key={h} style={{padding:"6px 8px",textAlign:["№","Ед.","Объём"].includes(h)?"center":"left",fontSize:10,fontWeight:600,letterSpacing:.3}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item,i) => {
                        rowNum++;
                        return (
                          <tr key={i} style={{background:i%2===0?"#f5f2ec":"#ede9e0",borderBottom:"1px solid #ddd9d0"}}>
                            <td style={{padding:"6px 8px",textAlign:"center",color:"#999",fontSize:11}}>{rowNum}</td>
                            <td style={{padding:"6px 8px",color:"#8855aa",fontSize:11,fontWeight:500}}>{item.sub}</td>
                            <td style={{padding:"6px 8px",fontWeight:600,fontSize:12}}>{item.name}</td>
                            <td style={{padding:"6px 8px",textAlign:"center",color:"#888",fontSize:11}}>{item.unit}</td>
                            <td style={{padding:"6px 8px",textAlign:"center",fontWeight:500}}>{item.qty}</td>
                            <td style={{padding:"6px 8px",textAlign:"right",color:"#555"}}>{item.qty > 0 ? (item.total / item.qty).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2}) : fmt(item.price)} ₸</td>
                            <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,fontSize:12}}>{fmt(item.total)} ₸</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#e8e4da",borderTop:"2px solid #ccc"}}>
                        <td colSpan={6} style={{padding:"7px 8px",fontSize:12,fontWeight:700,color:"#444",textAlign:"right"}}>Итого по разделу «{cat}»:</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontWeight:800,fontSize:13,color:"#b8904a"}}>{fmt(catTotal)} ₸</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}

            {/* Итоговая сводка */}
            <div style={{background:"#e8e4da",borderRadius:8,padding:"12px 16px",marginTop:8,marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:12,color:"#444",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Сводка по разделам</div>
              {catOrder.map(cat => (
                <div key={cat} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5,paddingBottom:5,borderBottom:"1px solid #d0ccc0"}}>
                  <span style={{color:"#555"}}>{cat}</span>
                  <span style={{fontWeight:700}}>{fmt(catMap[cat].reduce((s,x)=>s+x.total,0))} ₸</span>
                </div>
              ))}
            </div>

            {/* Позиции "от" — не входят в итог */}
            {fromItems&&fromItems.length>0&&(
              <div style={{marginTop:12,marginBottom:4}}>
                <div style={{background:"#f0ece0",borderRadius:"6px 6px 0 0",padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:12,color:"#888",letterSpacing:.5,textTransform:"uppercase"}}>Уточняется по факту</span>
                  <span style={{fontSize:11,color:"#aaa"}}>не включено в итог</span>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <tbody>
                    {fromItems.map((item,i)=>(
                      <tr key={i} style={{background:i%2===0?"#f5f2ec":"#ede9e0",borderBottom:"1px solid #ddd9d0"}}>
                        <td style={{padding:"6px 8px",color:"#8855aa",fontSize:11,fontWeight:500,width:"18%"}}>{item.sub}</td>
                        <td style={{padding:"6px 8px",fontWeight:600,fontSize:12}}>{item.name}</td>
                        <td style={{padding:"6px 8px",textAlign:"center",color:"#888",fontSize:11,width:"6%"}}>{item.unit}</td>
                        <td style={{padding:"6px 8px",textAlign:"center",fontWeight:500,width:"8%"}}>{item.qty}</td>
                        <td style={{padding:"6px 8px",textAlign:"right",color:"#b8904a",fontWeight:700,whiteSpace:"nowrap",width:"20%"}}>от {fmt(item.priceFrom)} ₸</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Итог */}
            <div style={{background:"#1a1a28",borderRadius:10,padding:"13px 18px",color:"#f5f2ec",marginTop:8}}>
              {discount>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#e07070",marginBottom:6}}><span>Скидка {discount}%</span><span>− {fmt(discAmt)} ₸</span></div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:600,letterSpacing:.5}}>ИТОГО:</span>
                <span style={{fontSize:28,fontWeight:900,color:"#b8904a",letterSpacing:-.5}}>{fmt(final)} ₸</span>
              </div>
              {proj.area&&Number(proj.area)>0&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid rgba(255,255,255,.08)"}}>
                  <span style={{fontSize:12,color:"#888"}}>Цена за м² ({proj.area} м²)</span>
                  <span style={{fontSize:14,fontWeight:700,color:"#d4a85a"}}>≈ {fmt(final/Number(proj.area))} ₸/м²</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Примечание */}
      {note&&<div style={{background:"#e8e4da",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#555",marginBottom:14}}>{note}</div>}

      {/* Условия */}
      <div style={{background:"#ece8da",borderRadius:10,padding:"14px 18px",fontSize:12,color:"#444",lineHeight:1.75,marginBottom:20}}>
        <div style={{fontWeight:700,color:"#1a1a28",marginBottom:10,fontSize:13}}>Условия:</div>
        {CONDITIONS.map((text, i) => (
          <div key={i} style={{display:"flex",gap:10,marginBottom:5}}>
            <span style={{color:"#b8904a",fontWeight:700,minWidth:18,flexShrink:0}}>{i+1}.</span>
            <span>{text}</span>
          </div>
        ))}
        <div style={{display:"flex",gap:10,marginTop:5}}>
          <span style={{color:"#b8904a",fontWeight:700,minWidth:18,flexShrink:0}}>7.</span>
          <span>Ссылка для ознакомления с договором (шаблон):{" "}
            <a href="https://drive.google.com/file/d/1qmhQhn6LE3F3lnU_BBEDXqCiyj-LDjSC/view?usp=sharing"
              target="_blank" rel="noreferrer"
              style={{color:"#b8904a",textDecoration:"underline",wordBreak:"break-all"}}>
              https://drive.google.com/file/d/1qmhQhn6LE3F3lnU_BBEDXqCiyj-LDjSC/view
            </a>
          </span>
        </div>
      </div>

      {/* Подписи */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginTop:16}}>
        <div>
          <div style={{fontSize:11,color:"#888",marginBottom:4}}>Заказчик</div>
          <div style={{borderTop:"1px solid #bbb",paddingTop:8,marginTop:32}}/>
          <div style={{fontSize:11,color:"#666"}}>{proj.name||"________________________________"}</div>
          <div style={{fontSize:10,color:"#aaa",marginTop:2}}>М.П.</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
          <img src="/stamp.jpg" alt="Печать TitovStroy" style={{width:200,height:200,objectFit:"contain",opacity:.85,mixBlendMode:"multiply",marginBottom:4}}/>
        </div>
      </div>

    </div>
  );
}


// ─── ГЛАВНЫЙ КОМПОНЕНТ ───────────────────────────────────────────────────────

// Типы документов
const DOC_TYPES = [
  { value:"repair_fiz",  label:"Договор ремонта" },
  { value:"annex",       label:"Приложение (доп. работы) №2/3..." },
  { value:"design",      label:"Соглашение о дизайн-проекте" },
  { value:"design_add",  label:"Доп. соглашение к дизайн-проекту" },
  { value:"reservation", label:"Соглашение о резервировании" },
  { value:"podryad",     label:"Договор подряда (с рабочим)" },
  { value:"podryad_annex", label:"Доп. приложение к договору подряда" },
];
const TYPE_LABELS = { repair_fiz:"Договор ремонта", annex:"Приложение", design:"Дизайн-проект", design_add:"Доп. соглашение дизайн", reservation:"Бронь", podryad:"Договор подряда", podryad_annex:"Приложение к подряду" };

// Переиспользуемый выпадающий список с поиском (вместо некрасивых native <select>)
function SearchSelect({ value, options, onChange, placeholder = "🔍 Поиск…", style }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = options.find(o => o.value === value);
  const s = q.trim().toLowerCase();
  const filtered = s ? options.filter(o => (o.label || "").toLowerCase().includes(s) || (o.sub || "").toLowerCase().includes(s)) : options;
  return (
    <div style={{ position: "relative", ...(style || {}) }}>
      <input value={open ? q : (sel ? sel.label : "")} placeholder={placeholder}
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => { setQ(""); setOpen(true); }}
        style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#0f172a", fontSize: 13, padding: "8px 10px", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }} />
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 41, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, maxHeight: 300, overflowY: "auto", boxShadow: "0 14px 40px rgba(15,23,42,.18)" }}>
          {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "#94a3b8" }}>Ничего не найдено</div>}
          {filtered.slice(0, 120).map(o => (
            <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}
              style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 1, background: o.value === value ? "#eff6ff" : "#fff" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = o.value === value ? "#eff6ff" : "#fff"}>
              <span style={{ fontWeight: 600 }}>{o.label}</span>
              {o.sub && <span style={{ fontSize: 11, color: "#94a3b8" }}>{o.sub}</span>}
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// Числовое поле с ЛОКАЛЬНЫМ вводом: пока печатаешь — меняется только само поле,
// в стейт (и пересчёт всей сметы) значение уходит на blur/Enter. Убирает тормоза при вводе цен/объёмов.
function NumInput({ value, onCommit, style, min = "0", placeholder, className, disabled }) {
  const [local, setLocal] = useState(null);
  const shown = local !== null ? local : ((value === undefined || value === null) ? "" : String(value));
  const commit = () => { if (local === null) return; onCommit(local); setLocal(null); };
  return <input type="number" min={min} placeholder={placeholder} className={className} disabled={disabled} value={shown}
    onChange={e => setLocal(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
    style={style} />;
}

function ContractEditor({ contract, clients, contragents, onUpdate, onBack, onSave, onPdf, onSamplePdf, onGDoc, canExport=true, onAddClientFromEstimate, onUpdateClient, onCreateClient, workers=[], onCreateWorker, importObjects=[], getObjectWorks, currentUserRole, fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientData, setNewClientData] = useState({ name:"", phone:"", type:"физ" });
  const [showNewWorker, setShowNewWorker] = useState(false);
  const [newWorkerData, setNewWorkerData] = useState({ name:"", iin:"", doc:"", phone:"", address:"" });
  const [impSearch, setImpSearch] = useState("");
  const [impOpen, setImpOpen] = useState(false);
  const type = contract.type || "repair_fiz";
  const total = (contract.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
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
            <div style={{display:"flex",gap:8}}>
              <button onClick={async ()=>{
                if(!newClientData.name.trim()) return;
                const nc = {id:Date.now().toString(),createdAt:Date.now(),...newClientData,name:newClientData.name.trim()};
                await onCreateClient(nc);
                upd({clientId:nc.id});
                setShowNewClientForm(false);
                setNewClientData({name:"",phone:"",type:"физ"});
                setShowClientForm(true);
              }} style={{background:"#059669",color:"#fff",border:"none",borderRadius:8,padding:"7px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                Создать и выбрать
              </button>
              <button onClick={()=>{setShowNewClientForm(false);setNewClientData({name:"",phone:"",type:"физ"});}}
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
          return (
            <div style={{marginTop:8,padding:"12px 14px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
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
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",textAlign:"right"}}>{fmt(Number(w.quantity)*Number(w.price)||0)}</div>
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

// ── ТЕСТ: Редактор сделки (смета + договор в одной карточке) ──
function DealEditor({ deal, clients, contragents, estimate, onUpdate, onBack, onOpenEstimate, onEstimatePdf, onContractPdf, onAddClient, onUpdateClient, role, fmt }) {
  const [withStamp, setWithStamp] = useState(true);
  const [showClientForm, setShowClientForm] = useState(false);
  const upd = (patch) => onUpdate(prev=>({...prev,...patch}));
  const posCount = estimate ? Object.values(estimate.rows||{}).filter(r=>Number(r?.qty)>0).length : 0;
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

// ── Балансовый отчёт (Statement of Financial Position) ──
function BalanceSheet({ assetsSections, liabSections, capitalSection, totalAssets, totalLiab, totalCapital }) {
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

// ── Генерация договора: HTML / PDF / DOCX / WhatsApp ──

// Обёртка авторизации. MainApp монтируется ТОЛЬКО при наличии currentUser,
// поэтому при входе/выходе он целиком монтируется/размонтируется и порядок
// хуков внутри него всегда стабилен (иначе React падал в белый экран).
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (!s) return null;
      const parsed = JSON.parse(s);
      const user = parsed?.user || parsed;
      const savedAt = parsed?.savedAt || Date.now();
      if (!user?.id) return null;
      if (Date.now() - savedAt > 30 * 24 * 60 * 60 * 1000) { localStorage.removeItem(SESSION_KEY); return null; }
      return user;
    } catch(e) { return null; }
  });
  // Скользящее окно сессии: продлеваем срок при каждом открытии приложения
  useEffect(() => {
    if (!currentUser?.id) return;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user: currentUser, savedAt: Date.now() })); } catch(e) {}
  }, [currentUser?.id]);
  // Метка тестового окружения (dev-база) — чтобы не спутать превью с боевым сайтом
  useEffect(() => {
    if (!IS_DEV_ENV) return;
    const b = document.createElement("div");
    b.textContent = "🧪 ТЕСТ · dev-база";
    b.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;background:#7c3aed;color:#fff;font:700 11px/1 'Golos Text',sans-serif;padding:6px 10px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;letter-spacing:.02em";
    document.body.appendChild(b);
    return () => { try { document.body.removeChild(b); } catch {} };
  }, []);
  // Публичная страница КП по ссылке #/kp/<id> — открывается без входа
  const _kpId = (() => { const m = (typeof window !== "undefined" ? (window.location.hash || "") : "").match(/^#\/kp\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; })();
  if (_kpId) return (
    <Suspense fallback={<div style={{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"'Golos Text','Segoe UI',sans-serif",color:"#64748b"}}>Загрузка предложения…</div>}>
      <PublicKP id={_kpId} storage={storage} KPContent={KPContent} />
    </Suspense>
  );
  // Публичная страница прогресса объекта по ссылке #/progress/<токен> — без входа
  const _progToken = (() => { const m = (typeof window !== "undefined" ? (window.location.hash || "") : "").match(/^#\/progress\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; })();
  if (_progToken) return (
    <Suspense fallback={<div style={{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"'Golos Text','Segoe UI',sans-serif",color:"#64748b"}}>Загрузка кабинета…</div>}>
      <PublicProgress token={_progToken} storage={storage} />
    </Suspense>
  );
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;
  return <EditorSessionGate key={currentUser.id} currentUser={currentUser} setCurrentUser={setCurrentUser} />;
}

function EditorSessionGate({ currentUser, setCurrentUser }) {
  const [mode, setMode] = useState("checking"); // checking | editor | readonly
  const modeRef = useRef("checking");
  const setSafeMode = useCallback((next) => { modeRef.current = next; setMode(next); }, []);
  const viewerOnly = currentUser?.role === "viewer";

  const tryAcquire = useCallback(async ({ explicit = false } = {}) => {
    if (viewerOnly) {
      setSafeMode("readonly");
      if (explicit) window.alert("Для этой учётной записи доступен только просмотр.");
      return false;
    }
    setSafeMode("checking");
    const ok = await storage.acquireEditLease();
    if (ok) {
      storage.compactLocalMirrors();
      storage.adoptUserDirty();
      storage.discardTechnicalDirty(WORKSPACE_BACKUPS_KEY);
      startProductionSession(currentUser?.id);
      setSafeMode("editor");
      return true;
    }
    setSafeMode("readonly");
    if (explicit) window.alert("Редактирование сейчас активно в другой вкладке. Закройте её и повторите.");
    return false;
  }, [currentUser?.id, viewerOnly, setSafeMode]);

  useEffect(() => {
    let stopped = false;
    const ownerUid = currentUser?.id ?? null;
    const gateSession = ++_editorGateN;
    storage.setDirtyOwner(ownerUid);
    storage.setLeaseEnforced(true);
    if (viewerOnly) {
      setSafeMode("readonly");
      return () => {
        stopped = true;
        storage.releaseEditLease().finally(() => {
          if (_editorGateN === gateSession && _dirtyOwnerUid === ownerUid) {
            storage.setLeaseEnforced(false);
            storage.setDirtyOwner(null);
          }
        });
      };
    }
    storage.acquireEditLease().then(ok => {
      if (!stopped) {
        if (ok) {
          storage.compactLocalMirrors();
          storage.adoptUserDirty();
          storage.discardTechnicalDirty(WORKSPACE_BACKUPS_KEY);
          startProductionSession(ownerUid);
        }
        setSafeMode(ok ? "editor" : "readonly");
      } else if (ok) {
        storage.releaseEditLease();
      }
    });
    const iv = setInterval(() => {
      if (stopped || modeRef.current !== "editor") return;
      if (!storage.heartbeatEditLease()) setSafeMode("readonly");
    }, LEASE_HEARTBEAT_MS);
    const onLeave = () => {
      // pagehide может уйти в back-forward cache без размонтирования React. Сразу переводим UI
      // в read-only, чтобы после возврата форма не выглядела редактируемой при уже отпущенном lock.
      setSafeMode("readonly");
      storage.releaseEditLease();
    };
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("pagehide", onLeave);
    return () => {
      stopped = true;
      clearInterval(iv);
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("pagehide", onLeave);
      storage.releaseEditLease().finally(() => {
        if (_editorGateN === gateSession && _dirtyOwnerUid === ownerUid) {
          storage.setLeaseEnforced(false);
          storage.setDirtyOwner(null);
        }
      });
    };
  }, [currentUser?.id, viewerOnly, setSafeMode]);

  if (mode === "checking") {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc",fontFamily:"'Inter','Segoe UI',sans-serif",color:"#64748b",fontSize:14}}>
        Проверяю доступ к редактированию…
      </div>
    );
  }

  return (
    <MainApp
      currentUser={currentUser}
      setCurrentUser={setCurrentUser}
      editorTab={mode === "editor"}
      takeoverEditLease={() => tryAcquire({ explicit: true })}
    />
  );
}

// Мигрирует ключи rows со старого формата (name) на новый (code).
// Нужно при открытии смет, созданных до перехода на code-ключи.
function migrateRowsToCodeKeys(rows, catalog) {
  const result = {};
  for (const [key, val] of Object.entries(rows || {})) {
    const byCode = catalog.find(w => w.code === key);
    if (byCode) { result[key] = val; continue; }
    const byName = catalog.find(w => w.name === key);
    result[byName ? byName.code : key] = val;
  }
  return result;
}

function MainApp({ currentUser, setCurrentUser, editorTab, takeoverEditLease }) {
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    _onCatalogChange = () => setCatalogVersion(v => v + 1);
    return () => { _onCatalogChange = null; };
  }, []);
  // Позиции сметы (перенесено выше Gdyn — нужно для виртуальной категории из «сиротских» строк)
  const [rows, setRows] = useState({});
  const GdynBase = useMemo(() => groupData(getEffectiveCatalog()), [catalogVersion]);
  const _catKeySet = useMemo(() => {
    const s = new Set();
    for (const w of getEffectiveCatalog()) { if (w?.code) s.add(w.code); if (w?.name) s.add(w.name); }
    return s;
  }, [catalogVersion]);
  // Виртуальная категория EXTRA_CAT строится СТРОГО из строк текущей сметы (позиции без каталога,
  // напр. восстановленные из акта). Не засоряет общий каталог и видна только в той смете, где есть.
  const Gdyn = useMemo(() => {
    const extra = [];
    for (const [key, r] of Object.entries(rows || {})) {
      if (!r || !(Number(r.qty) > 0)) continue;
      if (_catKeySet.has(key)) continue; // строка есть в каталоге — не сирота
      extra.push({ code: key, name: r.manualName || key, unit: r.manualUnit || "", cat: EXTRA_CAT, sub: "Позиции", tiers: [], cost: 0, fixedPrice: Number(r.manualPrice) || 0 });
    }
    if (!extra.length) return GdynBase;
    return { ...GdynBase, [EXTRA_CAT]: { "Позиции": extra } };
  }, [GdynBase, rows, _catKeySet]);
  const cats = Object.keys(Gdyn);

  // Авторизация (currentUser приходит пропом из обёртки App — здесь компонент
  // монтируется только когда пользователь уже залогинен, поэтому хуки стабильны)
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  // ЕДИНЫЙ безопасный путь завершения сессии — endSessionSafely (определён ниже, рядом с
  // очередями производства; сюда попадает через ref). Любой выход — кнопка, принудительный
  // после смены пароля — обязан идти через него: дожать несохранённое, при неудаче спросить/
  // предупредить, и только потом чистить. Прямой setCurrentUser(null) запрещён.
  const endSessionSafelyRef = useRef(null);
  const doLogout = () => { endSessionSafelyRef.current && endSessionSafelyRef.current({ forced: false }); };
  const [loadError, setLoadError] = useState(false); // не удалось загрузить из Firebase — сохранение заблокировано
  const [dirtyCount, setDirtyCount] = useState(0); // СВОИ незасинканные dirty-записи storage (этот пользователь+вкладка) — участвует в баннере
  const [legacyDirtyN, setLegacyDirtyN] = useState(0); // legacy-маркеры без владельца (карантин — не авто-отправляются)
  const [cloudError, setCloudError] = useState(false); // последнее сохранение не ушло в облако (только локально)
  const [listBackups, setListBackups] = useState(null); // {label, items, onRestore}
  const [documentSnapshotsById, setDocumentSnapshotsById] = useState(() => new Map());
  const [documentInstanceSnapshot, setDocumentInstanceSnapshot] = useState(null);

  // Экраны: "list" | "editor" | "contracts"
  // Руководитель по умолчанию попадает на финансы
  const [screen, setScreen] = useState(currentUser?.role==="manager" ? "finance" : "dashboard");
  const [navHistory, setNavHistory] = useState([]); // стек навигации для кнопки «Назад»

  const _applyNavState = (s) => {
    if (!s) return;
    if (s.screen !== undefined) setScreen(s.screen);
    if (s.financeTab !== undefined) setFinanceTab(s.financeTab);
    setFinFilterCat(s.finFilterCat || "");
    setFinFilterCategory(s.finFilterCategory || "");
    setFinFilterContract(s.finFilterContract || "");
  };

  const navigate = (newScreen, newFinTab, extraState = {}) => {
    const snapshot = { screen, financeTab, finFilterCat, finFilterCategory, finFilterContract };
    setNavHistory(h => [...h, snapshot]);
    // пушим в браузерную историю
    try { window.history.pushState(snapshot, ""); } catch(e) {}
    if (newScreen !== undefined && newScreen !== screen) setScreen(newScreen);
    if (newFinTab !== undefined && newFinTab !== financeTab) setFinanceTab(newFinTab);
    if (extraState.finFilterCat !== undefined) setFinFilterCat(extraState.finFilterCat);
    if (extraState.finFilterCategory !== undefined) setFinFilterCategory(extraState.finFilterCategory);
    if (extraState.finFilterContract !== undefined) setFinFilterContract(extraState.finFilterContract);
  };

  const goBack = () => {
    setNavHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      _applyNavState(prev);
      return h.slice(0, -1);
    });
  };

  // Браузерная кнопка «Назад» — синхронизируем с нашим стеком
  useEffect(() => {
    const onPopState = (e) => {
      if (e.state) {
        _applyNavState(e.state);
        setNavHistory(h => h.length > 0 ? h.slice(0, -1) : h);
      } else {
        goBack();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Пользователи для выпадающего списка менеджеров
  const [allUsers, setAllUsers] = useState(DEFAULT_USERS);
  const allUsersRef = useRef(DEFAULT_USERS);
  useEffect(() => { allUsersRef.current = allUsers; }, [allUsers]);
  const [rolePermissions, setRolePermissions] = useState(() => normalizeRolePermissions());
  useEffect(() => {
    let cancelled = false;
    storage.getResult(ROLE_PERMISSIONS_KEY).then(result => {
      if (cancelled || result.status !== "found" || !result.value) return;
      try { setRolePermissions(normalizeRolePermissions(JSON.parse(result.value))); } catch {}
    }).catch(()=>{});
    return () => { cancelled = true; };
  }, []);
  const currentPermissions = useMemo(
    () => permissionsForRole(rolePermissions, currentUser.role),
    [rolePermissions, currentUser.role],
  );
  const saveRolePermissions = useCallback(async (next) => {
    if (!accessAllows(currentPermissions.adminRoles, true)) return false;
    const normalized = normalizeRolePermissions(next);
    const res = await storage.set(ROLE_PERMISSIONS_KEY, JSON.stringify(normalized));
    if (res?.fbOk === false) return false;
    setRolePermissions(normalized);
    return true;
  }, [currentPermissions.adminRoles]);

  // Присутствие { [userId]: lastSeenTs } — пишет каждый, видит только админ
  const [presence, setPresence] = useState({});
  // Сердцебиение: обновляем свою отметку «был в сети» при активности и раз в минуту
  useEffect(() => {
    if (!currentUser?.id) return;
    let stopped = false;
    const touch = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        // Пишем ТОЛЬКО свой ключ presence-<id> — без чтения-изменения общего блока,
        // иначе параллельные отметки затирают друг друга (человек, зашедший на минуту,
        // мог вообще пропасть из «был в сети»). Свой ключ никто не перетрёт.
        const now = Date.now();
        // Presence — служебный heartbeat, не бизнес-данные. Его временный отказ не должен
        // создавать dirty-черновик и включать общий аварийный баннер смет/финансов.
        const result = await storage.setCloudOnly(PRESENCE_KEY + "-" + currentUser.id, String(now));
        if (!stopped && result?.fbOk) setPresence(p => ({ ...p, [currentUser.id]: now }));
      } catch {}
    };
    touch();
    const iv = setInterval(touch, 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") touch(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stopped = true; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [currentUser?.id]);
  // Админ периодически подтягивает чужие отметки для отображения
  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    let stopped = false;
    const pull = async () => {
      try {
        const ids = (allUsersRef.current || []).map(u => u.id).filter(Boolean);
        const map = {};
        const results = await Promise.all(ids.map(id => storage.getResult(PRESENCE_KEY + "-" + id).catch(() => null)));
        results.forEach((r, i) => { if (r && r.status === "found" && r.value) { const t = parseInt(r.value, 10); if (t) map[ids[i]] = t; } });
        // Старый общий блок (обратная совместимость): берём максимум, чтобы историю «был в сети» не потерять
        try {
          const legacy = await storage.getResult(PRESENCE_KEY);
          if (legacy.status === "found" && legacy.value) {
            const m = JSON.parse(legacy.value) || {};
            for (const [k, v] of Object.entries(m)) { const t = typeof v === "number" ? v : parseInt(v, 10); if (t && (!map[k] || t > map[k])) map[k] = t; }
          }
        } catch {}
        if (!stopped) setPresence(map);
      } catch {}
    };
    pull();
    const iv = setInterval(pull, 60 * 1000);
    return () => { stopped = true; clearInterval(iv); };
  }, [currentUser?.role]);

  // Список смет { id, proj, rows, discount, note, updatedAt, total }
  const [estimates, setEstimates] = useState([]);
  // Ref всегда держит актуальный список — для автосохранения (избегаем устаревшего замыкания)
  const estimatesRef = useRef([]);
  useEffect(() => { estimatesRef.current = estimates; }, [estimates]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | saved | error

  // Текущая смета в редакторе
  const [currentId, setCurrentId] = useState(null);
  const [currentParentId, setCurrentParentId] = useState(null);
  const [currentDsNumber, setCurrentDsNumber] = useState(null);
  const [currentObjectId, setCurrentObjectId] = useState(null); // объект, к которому привязана открытая смета
  const [activeCat, setActiveCat] = useState(cats[0]);
  const [activeSub, setActiveSub] = useState(Object.keys(Gdyn[cats[0]]||{})[0]);
  const [proj, setProj] = useState({...EMPTY_PROJ});
  const [discount, setDiscount] = useState(0);
  const [markup, setMarkup] = useState(0); // внутреннее повышение цены — клиенту не показывается
  const [note, setNote] = useState("");
  const [showKP, setShowKP] = useState(false);
  const [kpLink, setKpLink] = useState("");        // онлайн-КП: ссылка для клиента
  const [kpPublishing, setKpPublishing] = useState(false);
  const [kpMsg, setKpMsg] = useState("");
  const [kpStat, setKpStat] = useState("");        // статус: открыл/принял ли клиент
  const [kpStale, setKpStale] = useState(false);   // смета изменена после публикации ссылки
  // При открытии модалки КП — подтянуть ссылку и статус, если КП уже публиковалось
  useEffect(() => {
    if (!showKP) return;
    setKpLink(""); setKpStat(""); setKpMsg(""); setKpStale(false); // сброс от предыдущей сметы (всё строго своей сметы)
    if (!currentId) return;
    let stop = false;
    (async () => {
      try {
        const r = await storage.getResult("titovstroy-kp-"+currentId);
        if (stop || !(r.status==="found" && r.value)) return;
        let d = {}; try { d = JSON.parse(r.value); } catch {}
        if (d.publishedAt) {
          setKpLink(window.location.origin + window.location.pathname + "#/kp/" + currentId);
          setKpMsg("Ссылка активна");
          setKpStat(kpStatusText(d));
          // смета изменена после публикации? (сравниваем итог/позиции/скидку со снимком)
          setKpStale(d.final !== final || (d.kpItems||[]).length !== kpItems.length || d.discount !== discount);
        }
      } catch {}
    })();
    return () => { stop = true; };
  }, [showKP, currentId]);
  const [editPrices, setEditPrices] = useState(false);
  const [editingPriceRow, setEditingPriceRow] = useState(null);
  const [showFinancial, setShowFinancial] = useState(true);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [estStatus, setEstStatus] = useState("new");
  const [estSentAt, setEstSentAt] = useState("");
  const [estComment, setEstComment] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("month"); // all | month | week | 3month
  const [statsManager, setStatsManager] = useState(""); // "" = все
  const [statsDateFrom, setStatsDateFrom] = useState("");
  const [statsDateTo, setStatsDateTo] = useState("");
  // ── Договоры ──
  const [contracts, setContracts] = useState([]);
  const contractsRef = useRef([]);
  useEffect(() => { contractsRef.current = contracts; }, [contracts]);
  const [contractClients, setContractClients] = useState([]);
  const clientsRef = useRef([]);
  useEffect(() => { clientsRef.current = contractClients; }, [contractClients]);
  const [contragents, setContragents] = useState([{id:"1",name:"ТОО TITOVSTROY",bin:"231040002769",bank:'АО "Kaspi Bank"',bik:"CASPKZKA",account:"KZ38722S000030058973",director:"Титов В.Е.",phone:"8707 667 8766",email:"titovstroy@mail.ru",address:"Казахстан, район им.Казыбек би, улица Кирпичная, дом 8г"}]);
  const contragentsRef = useRef([]);
  useEffect(() => { contragentsRef.current = contragents; }, [contragents]);
  // «Мастера» — внешний справочник с naimi.kz. Пишет отдельный парсер (GitHub Actions)
  // в ключ titovstroy-masters; приложение только ЧИТАЕТ, боевых данных не касается.
  const [masters, setMasters] = useState([]);
  const [mastersMeta, setMastersMeta] = useState(null);
  const [mastersLoaded, setMastersLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    storage.getResult(MASTERS_KEY).then(res => {
      if (!alive) return;
      setMastersLoaded(true);
      if (res && res.status === "found" && res.value) {
        try {
          const d = JSON.parse(res.value);
          setMasters(Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []));
          setMastersMeta(d && !Array.isArray(d) ? d : null);
        } catch {}
      }
    }).catch(() => { if (alive) setMastersLoaded(true); });
    return () => { alive = false; };
  }, []);
  // Настройки парсера (частота/«Обновить сейчас») — редактирует Админ, читает парсер.
  const [mastersConfig, setMastersConfig] = useState(null);
  useEffect(() => {
    let alive = true;
    storage.getResult(MASTERS_CONFIG_KEY).then(res => {
      if (!alive) return;
      if (res && res.status === "found" && res.value) { try { setMastersConfig(JSON.parse(res.value)); } catch { setMastersConfig({}); } }
      else setMastersConfig({});
    }).catch(() => { if (alive) setMastersConfig({}); });
    return () => { alive = false; };
  }, []);
  const saveMastersConfig = useCallback(async (patch) => {
    if (!accessAllows(currentPermissions.mastersManage, true)) return false;
    const next = { ...(mastersConfig || {}), ...patch, updatedAt: Date.now() };
    setMastersConfig(next);
    try {
      const r = await storage.setCloudOnly(MASTERS_CONFIG_KEY, JSON.stringify(next));
      if (!(r && r.fbOk)) return { ok: false };
      const trigger = patch?.runNow
        ? await triggerParserRun({ source: "naimi", runNow: Number(patch.runNow), getToken: _restToken })
        : null;
      return { ok: true, trigger };
    }
    catch { return false; }
  }, [mastersConfig, currentPermissions.mastersManage]);
  // Второй источник — OLX.kz (отдельный ключ/парсер, боевых данных не касается, только чтение).
  const [mastersOlx, setMastersOlx] = useState([]);
  const [mastersOlxMeta, setMastersOlxMeta] = useState(null);
  const [mastersOlxLoaded, setMastersOlxLoaded] = useState(false);
  const [mastersOlxConfig, setMastersOlxConfig] = useState(null);
  useEffect(() => {
    let alive = true;
    storage.getResult(MASTERS_OLX_KEY).then(res => {
      if (!alive) return;
      setMastersOlxLoaded(true);
      if (res && res.status === "found" && res.value) {
        try {
          const d = JSON.parse(res.value);
          setMastersOlx(Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []));
          setMastersOlxMeta(d && !Array.isArray(d) ? d : null);
        } catch {}
      }
    }).catch(() => { if (alive) setMastersOlxLoaded(true); });
    storage.getResult(MASTERS_OLX_CONFIG_KEY).then(res => {
      if (!alive) return;
      if (res && res.status === "found" && res.value) { try { setMastersOlxConfig(JSON.parse(res.value)); } catch { setMastersOlxConfig({}); } }
      else setMastersOlxConfig({});
    }).catch(() => { if (alive) setMastersOlxConfig({}); });
    return () => { alive = false; };
  }, []);
  const saveMastersOlxConfig = useCallback(async (patch) => {
    if (!accessAllows(currentPermissions.mastersManage, true)) return false;
    const next = { ...(mastersOlxConfig || {}), ...patch, updatedAt: Date.now() };
    setMastersOlxConfig(next);
    try {
      const r = await storage.setCloudOnly(MASTERS_OLX_CONFIG_KEY, JSON.stringify(next));
      if (!(r && r.fbOk)) return { ok: false };
      const trigger = patch?.runNow
        ? await triggerParserRun({ source: "olx", runNow: Number(patch.runNow), getToken: _restToken })
        : null;
      return { ok: true, trigger };
    }
    catch { return false; }
  }, [mastersOlxConfig, currentPermissions.mastersManage]);
  const _contractsLoaded = useRef(false);
  const _productionsLoaded = useRef(false); // отдельно от _contractsLoaded: productions грузится в том же запросе, но может не долететь, пока остальное — долетит
  // Флаги загрузки — это refs (не вызывают ре-рендер). Авто-синки (этапы←сметы, бюджет←договоры)
  // зависят по массивам [estimates]/[contracts], поэтому если данные, от которых зависит ГАРД
  // (productions/finance/contracts), долетают ПОЗЖЕ, чем в последний раз менялся массив-зависимость,
  // эффект больше не перезапускается и синк не срабатывает (гонка первичной загрузки). loadedTick
  // инкрементится в конце каждой загрузки и добавлен в зависимости синков — они честно
  // перезапускаются, когда всё догрузилось.
  const [loadedTick, setLoadedTick] = useState(0);
  const _bumpLoaded = useCallback(() => setLoadedTick(t => t + 1), []);
  const [contractTab, setContractTab] = useState("list"); // list | editor | clients | contragents
  const [currentContract, setCurrentContract] = useState(null);

  // Объекты
  const [objects, setObjects] = useState([]);
  const objectsRef = useRef([]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  // Желаемый статус показываем сразу после клика. Он убирается, когда объект и
  // производственная карточка подтвердили то же состояние.
  const [pendingObjectStatuses, setPendingObjectStatuses] = useState({});

  // Производственные карточки объектов (раздел «Производство»)
  const [productions, setProductions] = useState([]);
  const productionsRef = useRef([]);
  useEffect(() => { productionsRef.current = productions; }, [productions]);

  // Отчёты по объектам (АВР, форма Р-1)
  const [reports, setReports] = useState([]);
  const reportsRef = useRef([]);
  useEffect(() => { reportsRef.current = reports; }, [reports]);
  const [avrModal, setAvrModal] = useState(null); // черновик акта в построителе

  // Подрядчики (рабочие) и договоры подряда с ними
  const [workers, setWorkers] = useState([]);
  const workersRef = useRef([]);
  useEffect(() => { workersRef.current = workers; }, [workers]);
  const [podryads, setPodryads] = useState([]);
  const podryadsRef = useRef([]);
  useEffect(() => { podryadsRef.current = podryads; }, [podryads]);
  const [podryadModal, setPodryadModal] = useState(null); // черновик договора/приложения подряда
  const [newDocMenu, setNewDocMenu] = useState(false); // выпадающий выбор типа документа на «+ Новый»

  // ── ФИНАНСЫ ──
  const [financeTx, setFinanceTx] = useState([]);
  const financeTxRef = useRef([]);
  useEffect(() => { financeTxRef.current = financeTx; }, [financeTx]);
  const [financeMeta, setFinanceMeta] = useState(DEFAULT_FIN_META);
  const financeMetaRef = useRef(DEFAULT_FIN_META);
  useEffect(() => { financeMetaRef.current = financeMeta; }, [financeMeta]);
  const _financeLoaded = useRef(false);
  const [financeTab, setFinanceTab] = useState("dashboard"); // dashboard | ops | ref
  const [finPeriod, setFinPeriod] = useState("month"); // all | month | 3month | year | custom
  const [finFrom, setFinFrom] = useState("");
  const [finTo, setFinTo] = useState("");
  const [finFilterType, setFinFilterType] = useState("");
  const [finFilterAccount, setFinFilterAccount] = useState("");
  const [finFilterCategory, setFinFilterCategory] = useState("");
  const [finFilterContract, setFinFilterContract] = useState(""); // фильтр по проекту/договору
  const [finFilterCat, setFinFilterCat] = useState("");           // фильтр по категории (из ДДС/ОПУ)
  const [finSearch, setFinSearch] = useState("");
  const [finAmtMin, setFinAmtMin] = useState("");
  const [finAmtMax, setFinAmtMax] = useState("");
  const [finTxModal, setFinTxModal] = useState(null); // редактируемая/новая транзакция
  const [finCatSearch, setFinCatSearch] = useState(""); // поиск в поле статьи
  const [finCatOpen, setFinCatOpen] = useState(false);  // дропдаун статьи открыт
  const [finTxProjSearch, setFinTxProjSearch] = useState(""); // поиск в поле проекта (в модале операции)
  const [finTxProjOpen, setFinTxProjOpen] = useState(false);  // дропдаун проекта открыт (в модале операции)
  const [finTxTrash, setFinTxTrash] = useState(false); // корзина операций
  const [finImportBusy, setFinImportBusy] = useState(false);
  const [finProjects, setFinProjects] = useState([]);
  const finProjectsRef = useRef([]);
  useEffect(() => { finProjectsRef.current = finProjects; }, [finProjects]);
  const [finProjModal, setFinProjModal] = useState(null);
  const [finProjSearch, setFinProjSearch] = useState("");
  const [finProjStatusFilter, setFinProjStatusFilter] = useState("");
  const [finProjCatFilter, setFinProjCatFilter] = useState("");

  // ── Связь фин-проектов с объектами (по номеру договора) ──
  // normCN — модульная функция (см. верх файла), чтобы «№0919#153» и «0919#153» считались одним
  // map: нормализованный № договора → { object, contract, planTotal, planCost, planMargin, planMarginPct }
  const contractLinkMap = useMemo(() => {
    const m = {};
    // справочник для расчёта себестоимости сметы
    const wl = new Map();
    for (const w of getEffectiveCatalog()) { if(w?.name) wl.set(w.name,w); if(w?.code) wl.set(w.code,w); }
    const estCostOf = (e) => {
      let cost = 0;
      for (const [key,r] of Object.entries(e.rows||{})) { const qty=Number(r?.qty||0); if(!qty) continue; const w=wl.get(key); if(w) cost+=rowCostPerUnit(r,w)*qty; }
      return cost;
    };
    // Агрегаты смет по объекту: основная + дополнительные, включая старые ДС,
    // у которых связь с объектом хранится только через parentId.
    const estAgg = {};
    for (const object of objects) {
      const linked = estimatesForObject(estimates, object.id);
      if (!linked.length) continue;
      estAgg[object.id] = linked.reduce((a,e) => {
        a.total += Number(e.total) || 0;
        a.cost += estCostOf(e);
        return a;
      }, { total:0, cost:0 });
    }
    for (const c of contracts) {
      const num = normCN(c.number);
      if (!num) continue;
      const obj = c.objectId ? objects.find(o=>o.id===c.objectId) : null;
      const conTotal = (c.works||[]).reduce((s,w)=>s+((Number(w.quantity)||0)*(Number(w.price)||0)),0);
      const agg = obj ? estAgg[obj.id] : null;
      // ПЛАН = ВСЕ сметы объекта (основная + доп.) — доп. сметы сразу в плане; если смет нет — сумма работ договора
      const planTotal = (agg && agg.total>0) ? agg.total : conTotal;
      const planCost = agg ? agg.cost : 0;
      const planMargin = planTotal>0 ? planTotal - planCost : 0;
      const planMarginPct = planTotal>0 ? Math.round(planMargin/planTotal*100) : null;
      if (!m[num]) m[num] = { object:obj, contract:c, planTotal, planCost, planMargin, planMarginPct };
    }
    return m;
  }, [contracts, objects, estimates, catalogVersion]);
  const linkForContractNo = (cn) => contractLinkMap[normCN(cn)] || null;
  // открыть объект из финансов
  const openObjectFromFinance = (obj) => { if(!obj) return; setCurrentObject({...obj}); setObjectTab("workspace"); setScreen("objects"); };
  // построить черновик фин-проекта из объекта+договора
  // Основной клиентский договор проекта: доп. соглашения (annex) относятся к нему.
  // Подряд (podryad/podryad_annex) — это себестоимость, в проект Финансов не идёт.
  const mainContractOf = (c) => {
    if (!c) return null;
    if (c.type === "annex" && c.mainNumber) {
      return contractsRef.current.find(x => !x.deletedAt && x.number && normCN(x.number) === normCN(c.mainNumber)
        && x.type !== "podryad" && x.type !== "podryad_annex") || c;
    }
    return c;
  };
  // Бюджет проекта = сумма основного договора + всех его доп. соглашений (доп. работы увеличивают бюджет).
  const _worksSum = (works) => (works || []).reduce((s, w) => s + ((Number(w.quantity) || 0) * (Number(w.price) || 0)), 0);
  const finBudgetOfContract = (main) => {
    if (!main) return 0;
    const own = _worksSum(main.works);
    const annex = main.number ? contractsRef.current
      .filter(x => !x.deletedAt && x.type === "annex" && x.mainNumber && normCN(x.mainNumber) === normCN(main.number))
      .reduce((s, x) => s + _worksSum(x.works), 0) : 0;
    return own + annex;
  };
  const finProjDraftFromObject = (obj, contract) => {
    const main = mainContractOf(contract);
    return {
      id:"", contractNo: main?.number||"",
      budget: finBudgetOfContract(main)||0,
      createdAt: main?.date || new Date().toISOString().slice(0,10),
      comment:"", objectId: obj?.id||"",
    };
  };
  // завести проект в финансах из объекта (или открыть существующий). Доп. соглашение
  // не плодит новый проект — обновляет бюджет проекта основного договора СРАЗУ
  // (сохраняет), чтобы доп. работы отразились без ручного «Сохранить».
  const startFinProjFromObject = async (obj, contract) => {
    const main = mainContractOf(contract);
    const existing = main ? finProjectsRef.current.find(p=>normCN(p.contractNo)===normCN(main.number)) : null;
    setScreen("finance"); setFinanceTab("projects");
    if (existing) {
      const nb = finBudgetOfContract(main);
      const upd = { ...existing, budget: nb };
      if (Number(existing.budget) !== nb) { try { await saveFinanceProjects(finProjectsRef.current.map(p=>p.id===existing.id?upd:p)); } catch(e) {} }
      setFinProjModal(upd);
    } else {
      setFinProjModal(finProjDraftFromObject(obj, contract));
    }
  };

  const [objectTab, setObjectTab] = useState("list"); // list | workspace
  const [objWsTab, setObjWsTab] = useState("info"); // вкладка внутри карточки объекта: info | estimates | documents
  const [objInfoCollapsed, setObjInfoCollapsed] = useState(false); // свёрнут ли блок инфо клиента/объекта
  const [currentObject, setCurrentObject] = useState(null);
  // При открытии другого объекта возвращаемся на вкладку «Информация»
  useEffect(()=>{ setObjWsTab("info"); }, [currentObject?.id]);
  const [objectFilterStatus, setObjectFilterStatus] = useState("approval");
  const [statusConflictsOpen, setStatusConflictsOpen] = useState(false); // раскрыта ли панель «Проверка статусов»
  const [objectFilterType, setObjectFilterType] = useState("");
  const [objectFilterManager, setObjectFilterManager] = useState("");
  const [objectAttentionFilter, setObjectAttentionFilter] = useState("");
  const [objectDateSort, setObjectDateSort] = useState("new"); // new = сначала новые, old = сначала старые
  const [objectDateFrom, setObjectDateFrom] = useState("");
  const [objectDateTo, setObjectDateTo] = useState("");
  const [objectSearch, setObjectSearch] = useState("");
  const debouncedObjectSearch = useDebounce(objectSearch, 200);
  const [objectReturnId, setObjectReturnId] = useState(null); // id объекта, куда вернуться из редактора сметы/договора
  // legacy deals ref (не используется, но нужен для saveDeals ниже)
  const [deals, setDeals] = useState([]);
  const dealsRef = useRef([]);
  useEffect(() => { dealsRef.current = deals; }, [deals]);
  const [dealTab, setDealTab] = useState("list");
  const [currentDeal, setCurrentDeal] = useState(null);
  const [dealFilterStatus, setDealFilterStatus] = useState("");
  const [dealReturnId, setDealReturnId] = useState(null);
  const [contractClientsTab, setContractClientsTab] = useState("list");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [stampsBase64, setStampsBase64] = useState({});
  useEffect(()=>{
    let cancelled = false;
    ["stamp.jpg","stamp2.jpg"].forEach(file=>{
      fetch("/"+file).then(r=>r.blob()).then(blob=>{
        if(cancelled) return;
        const reader = new FileReader();
        reader.onload = e => { if(!cancelled) setStampsBase64(prev=>({...prev,[file]:e.target.result})); };
        reader.readAsDataURL(blob);
      }).catch(()=>{});
    });
    return ()=>{ cancelled = true; };
  },[]);
  const stampBase64 = stampsBase64["stamp.jpg"] || "";
  const [listSearch, setListSearch] = useState("");
  const [backupsModal, setBackupsModal] = useState(null); // null | массив снимков
  const [wsBackupsModal, setWsBackupsModal] = useState(null); // единый бэкап объектов (со сметами/договорами)
  const [importModal, setImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [listFilter, setListFilter] = useState(""); // "" | "Вторичка" | "Новостройка" | "Коммерция"
  const [listFilterManager, setListFilterManager] = useState(""); // "" = все
  const [listFilterStatus, setListFilterStatus] = useState(""); // "" = все статусы
  const [contractFilterStatus, setContractFilterStatus] = useState(""); // "" = все статусы договоров
  const [contractTypeFilter, setContractTypeFilter] = useState(""); // "" = все | "podryad" | "other"
  const [collapsedContracts, setCollapsedContracts] = useState({}); // id корневого договора -> true, если приложения свёрнуты
  const [listSort, setListSort] = useState("date"); // "date" | "sum" | "name"
  const debouncedListSearch = useDebounce(listSearch, 200);

  const estimatorDashboard = useMemo(
    () => buildEstimatorDashboard({ objects, estimates, productions, user: currentUser }),
    [objects, estimates, productions, currentUser],
  );
  const estimatorObjectIds = useMemo(
    () => new Set(estimatorDashboard.ownObjects.map(o => o.id)),
    [estimatorDashboard],
  );
  const accessibleObjects = useMemo(
    () => currentPermissions.objects === "own"
      ? objects.filter(o => estimatorObjectIds.has(o.id))
      : objects,
    [objects, currentPermissions.objects, estimatorObjectIds],
  );
  const accessibleEstimates = useMemo(
    () => currentPermissions.estimates === "own" ? estimatorDashboard.ownEstimates : estimates,
    [estimates, currentPermissions.estimates, estimatorDashboard],
  );
  const isOwnEstimate = useCallback((est) => !!est && (
    (est.objectId && estimatorObjectIds.has(est.objectId))
    || (currentUser.id && est.createdById === currentUser.id)
    || (currentUser.name && est.createdBy === currentUser.name)
  ), [currentUser.id, currentUser.name, estimatorObjectIds]);
  const canEditEstimate = useCallback(
    (est) => accessAllows(currentPermissions.estimateEdit, isOwnEstimate(est)),
    [currentPermissions.estimateEdit, isOwnEstimate],
  );
  const canCreateEstimateFor = useCallback(
    (estOrObject) => accessAllows(
      currentPermissions.estimateCreate,
      estOrObject?.objectId
        ? estimatorObjectIds.has(estOrObject.objectId)
        : estOrObject?.id
          ? estimatorObjectIds.has(estOrObject.id) || isOwnEstimate(estOrObject)
          : true,
    ),
    [currentPermissions.estimateCreate, estimatorObjectIds, isOwnEstimate],
  );
  const canDeleteEstimate = useCallback(
    (est) => accessAllows(currentPermissions.estimateDelete, isOwnEstimate(est)),
    [currentPermissions.estimateDelete, isOwnEstimate],
  );
  const canEditCurrentEstimate = useMemo(() => {
    const existing = estimates.find(e => e.id === currentId);
    const ownsDraft = !existing && (
      proj?._createdById === currentUser.id
      || proj?._createdBy === currentUser.name
    );
    return accessAllows(currentPermissions.estimateEdit, existing ? isOwnEstimate(existing) : ownsDraft);
  }, [currentId, currentPermissions.estimateEdit, currentUser.id, currentUser.name, estimates, isOwnEstimate, proj?._createdBy, proj?._createdById]);
  const currentEstimateIsOwn = useMemo(() => {
    const existing = estimates.find(e => e.id === currentId);
    return existing ? isOwnEstimate(existing) : proj?._createdById === currentUser.id || proj?._createdBy === currentUser.name;
  }, [currentId, currentUser.id, currentUser.name, estimates, isOwnEstimate, proj?._createdBy, proj?._createdById]);
  const canChangeCurrentEstimateStatus = accessAllows(currentPermissions.estimateStatus, currentEstimateIsOwn);
  const canPublishCurrentEstimate = accessAllows(currentPermissions.estimatePublish, currentEstimateIsOwn);
  const canExportCurrentEstimate = accessAllows(currentPermissions.estimateExport, currentEstimateIsOwn);
  const isOwnDocument = useCallback((doc) => !!doc && (
    (currentUser.id && doc.createdById === currentUser.id)
    || (currentUser.name && doc.createdBy === currentUser.name)
    || (doc.objectId && estimatorObjectIds.has(doc.objectId))
  ), [currentUser.id, currentUser.name, estimatorObjectIds]);
  // Видимость документа по категории (ремонт/дизайн/подряд/АВР) для текущей роли.
  // Раздел уже открыт правом `documents`; здесь — фильтр внутри по типу с учётом «свои/все».
  const canSeeDoc = useCallback(
    (doc) => docTypeAllows(currentPermissions, doc?.type || "repair_fiz", isOwnDocument(doc)),
    [currentPermissions, isOwnDocument],
  );
  const canSeeReport = useCallback(
    (r) => docTypeAllows(currentPermissions, "avr", isOwnDocument(r)),
    [currentPermissions, isOwnDocument],
  );
  const currentDocumentExists = !!currentContract && contracts.some(c => c.id === currentContract.id);
  const canEditCurrentDocument = accessAllows(
    currentDocumentExists ? currentPermissions.documentEdit : currentPermissions.documentCreate,
    isOwnDocument(currentContract),
  );
  const canExportCurrentDocument = accessAllows(currentPermissions.documentExport, isOwnDocument(currentContract));
  const analyticsObjects = useMemo(
    () => currentPermissions.analytics === "own" ? estimatorDashboard.ownObjects : objects,
    [objects, currentPermissions.analytics, estimatorDashboard],
  );
  const analyticsEstimates = useMemo(
    () => currentPermissions.analytics === "own" ? estimatorDashboard.ownEstimates : estimates,
    [estimates, currentPermissions.analytics, estimatorDashboard],
  );

  const filteredObjects = useMemo(() => {
    const q = debouncedObjectSearch.toLowerCase().trim();
    return [...accessibleObjects]
      .filter(o=>!o.deletedAt) // скрываем мягко-удалённые из основного списка
      .filter(o=>{
        // фильтр по статусу применяется в рендере через unifiedStatusOf (единый статус)
        if(objectFilterType && (o.objType||"Вторичка")!==objectFilterType) return false;
        if(objectFilterManager && (o.manager||"")!==objectFilterManager) return false;
        if(objectDateFrom && (o.createdAt||0) < new Date(objectDateFrom).getTime()) return false;
        if(objectDateTo && (o.createdAt||0) > new Date(objectDateTo).getTime()+86399999) return false;
        if(objectAttentionFilter === "stale-approval") {
          const production = productions.find(p => p.objectId === o.id);
          const status = pendingObjectStatuses[o.id]
            || (production && PROD_TO_DEAL[production.prodStatus])
            || o.status
            || "new";
          if(!isStaleApprovalObject({ ...o, status })) return false;
        }
        if(q && !((o.clientName||"").toLowerCase().includes(q)||(o.address||"").toLowerCase().includes(q)||(o.clientPhone||"").toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a,b)=>{ const da=a.createdAt||0, db=b.createdAt||0; return objectDateSort==="old" ? da-db : db-da; });
  }, [accessibleObjects, objectFilterStatus, objectFilterType, objectFilterManager, objectAttentionFilter, objectDateSort, objectDateFrom, objectDateTo, debouncedObjectSearch, productions, pendingObjectStatuses]);

  // Только «живые» (не удалённые) объекты — используется в дашборде, аналитике и всех расчётах
  const liveObjects = useMemo(() => accessibleObjects.filter(o=>!o.deletedAt), [accessibleObjects]);
  const openStaleObjects = useCallback(() => {
    setObjectAttentionFilter("stale-approval");
    setObjectFilterStatus("");
    setObjectFilterType("");
    setObjectFilterManager("");
    setObjectDateFrom("");
    setObjectDateTo("");
    setObjectSearch("");
    setCurrentObject(null);
    setObjectTab("list");
    setScreen("objects");
  }, []);

  // ── «Что горит» / «Проверка базы»: детектор проблем (read-only, чистая функция из utils) ──
  const _allIssues = useMemo(() => computeIssues({ objects, productions, finProjects, financeTx, contracts, estimates, clients: contractClients }), [objects, productions, finProjects, financeTx, contracts, estimates, contractClients]);
  // «Скрыть до завтра» — по устройству (localStorage), без записи в общую базу. { [issueId]: untilTs }.
  const ISSUE_DISMISS_KEY = "titovstroy-issue-dismissed";
  const [issueDismissed, setIssueDismissed] = useState(() => {
    try { const raw = JSON.parse(localStorage.getItem(ISSUE_DISMISS_KEY) || "{}"); const now = Date.now(); const kept = {}; for (const k in raw) if (raw[k] > now) kept[k] = raw[k]; return kept; } catch { return {}; }
  });
  const dismissIssueTomorrow = useCallback((id) => {
    const tomorrow = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() + 24*60*60*1000; })();
    setIssueDismissed(prev => { const next = { ...prev, [id]: tomorrow }; try { localStorage.setItem(ISSUE_DISMISS_KEY, JSON.stringify(next)); } catch {} return next; });
  }, []);
  // Открыть проблему: перейти в нужную карточку объекта / раздел
  const openIssue = useCallback((nav) => {
    if (!nav) return;
    if (nav.object) {
      const o = objectsRef.current.find(x => x.id === nav.object);
      if (o) { setCurrentObject({ ...o }); setObjectTab("workspace"); if (nav.tab) setObjWsTab(nav.tab); setScreen("objects"); return; }
      setScreen("objects"); return;
    }
    if (nav.screen) {
      setScreen(nav.screen);
      if (nav.screen === "finance" && nav.tab) setFinanceTab(nav.tab);
    }
  }, []);
  const _issueActive = (i) => !(issueDismissed[i.id] > Date.now()); // не скрыта «до завтра»
  // Операционные проблемы для дашборда admin/manager (минус скрытые «до завтра»)
  const _todayIssues = useMemo(() => _allIssues.filter(i => i.scope === "today" && _issueActive(i)), [_allIssues, issueDismissed]);
  // Целостность данных — для «Проверка базы» в Админке (скрывать нельзя)
  const _checkIssues = useMemo(() => _allIssues.filter(i => i.scope === "check"), [_allIssues]);
  // «Мои задачи» прораба: операционные проблемы по ЕГО объектам (ответственный/менеджер/создатель).
  // Финансовую группу исключаем: прораб финансы не видит, и финпроекты ему не загружаются
  // (loadFinance только для admin/manager) — иначе «подписан без финпроекта» давал бы ложные
  // срабатывания на каждом объекте. Прорабу — производство и замечания клиента.
  const _myIssues = useMemo(() => {
    const mine = new Set(objects.filter(o => {
      const p = productions.find(x => x.objectId === o.id);
      return o.createdById === currentUser.id || o.manager === currentUser.name || (p && p.responsible === currentUser.name);
    }).map(o => o.id));
    return _allIssues.filter(i => i.scope === "today" && i.group !== "Финансы" && i.nav && mine.has(i.nav.object) && _issueActive(i));
  }, [_allIssues, objects, productions, currentUser, issueDismissed]);

  // Объекты «в работе» для раздела «Производство»: только те, по которым заведён
  // проект в Финансах (связь по objectId, либо по номеру договора).
  // Сопоставить финпроект с объектом ТОЛЬКО по техническому objectId или точному
  // номеру договора. Имя/адрес/телефон не ключи: совпадения вроде двух «Сергеев»
  // показывали чужой бюджет и связывали не тот производственный проект.
  const matchFpToObject = useCallback((p) => {
    if (p.objectId) { const o = liveObjects.find(x => x.id === p.objectId); if (o) return o; }
    const link = p.contractNo ? contractLinkMap[normCN(p.contractNo)] : null;
    if (link?.object) return link.object;
    return null;
  }, [liveObjects, contractLinkMap]);

  // Единый статус объекта для всех экранов и расчётов: производственная карточка
  // перевешивает старое поле object.status, когда объект уже в производстве.
  const unifiedStatusOf = useCallback((o) => {
    if (pendingObjectStatuses[o.id]) return pendingObjectStatuses[o.id];
    const pr = productions.find(p => p.objectId === o.id);
    const derived = pr && PROD_TO_DEAL[pr.prodStatus];
    return derived || o.status || "new";
  }, [productions, pendingObjectStatuses]);
  useEffect(() => {
    setPendingObjectStatuses(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [objectId, wanted] of Object.entries(prev)) {
        const object = objects.find(o => o.id === objectId);
        if (!object) { delete next[objectId]; changed = true; continue; }
        const production = productions.find(p => p.objectId === objectId);
        const actual = (production && PROD_TO_DEAL[production.prodStatus]) || object.status || "new";
        if (actual === wanted) { delete next[objectId]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [objects, productions]);
  const financeProjectStatusKeyOf = useCallback((project) => {
    const object = matchFpToObject(project);
    return object
      ? unifiedStatusOf(object)
      : financeStatusMeta(project?.rawStatus || project?.status || "").key;
  }, [matchFpToObject, unifiedStatusOf]);
  const isActiveFinanceProject = useCallback(
    project => isActiveFinanceStatus(financeProjectStatusKeyOf(project)),
    [financeProjectStatusKeyOf],
  );
  const isCountedFinanceProject = useCallback(
    project => !["cancel", "refuse", "archive"].includes(financeProjectStatusKeyOf(project)),
    [financeProjectStatusKeyOf],
  );

  // Производство = ТОЛЬКО объекты, у которых есть активный финпроект (Финансы → Проекты).
  // Без «подписанных объектов» и без старых карточек. Отказ/архив исключены.
  const productionObjects = useMemo(() => {
    const ids = new Set();
    for (const p of (finProjects || [])) {
      if (!isActiveFinanceProject(p)) continue;
      const o = matchFpToObject(p);
      if (o) ids.add(o.id);
    }
    return liveObjects.filter(o => ids.has(o.id));
  }, [liveObjects, finProjects, matchFpToObject, isActiveFinanceProject]);

  // Проекты из Финансов, которые НЕ привязаны ни к одному объекту — их тоже можно
  // добавить в производство вручную (разовая миграция текущих работ из Google-таблиц).
  const unlinkedFinProjects = useMemo(() => {
    return (finProjects || []).filter(p => isActiveFinanceProject(p) && !matchFpToObject(p));
  }, [finProjects, matchFpToObject, isActiveFinanceProject]);

  // ── ЕДИНЫЙ ИСТОЧНИК ПРОИЗВОДСТВА: одна запись на КАЖДЫЙ финпроект (Финансы → Проекты) ──
  // Производство = все финпроекты (включая без сметы/импортированные, выполненные и отменённые).
  // К объекту привязываемся для сметы/этапов; если объекта нет — карточка живёт по ключу "fp:<id>".
  const FIN_TO_PROD = { new:"new", approval:"new", signed:"new", work:"active", paused:"paused", done:"done", cancel:"cancel", refuse:"cancel", archive:"cancel" };
  const prodEntries = useMemo(() => {
    const txByCN = {};
    for (const t of (financeTx || [])) { if (t.deletedAt || t.included === false) continue; const cn = normCN(t.contractNo); (txByCN[cn] || (txByCN[cn] = [])).push(t); }
    const entries = []; const usedObj = new Set();
    for (const fp of (finProjects || [])) {
      const o = matchFpToObject(fp);
      const objectId = o ? o.id : null;
      if (objectId) { if (usedObj.has(objectId)) continue; usedObj.add(objectId); }
      const cn = normCN(fp.contractNo);
      const tx = txByCN[cn] || [];
      const income = tx.filter(t => t.type === "income").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const expense = tx.filter(t => t.type === "expense").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const budget = Number(fp.budget) || 0;
      const finStatus = financeProjectStatusKeyOf(fp);
      entries.push({
        key: objectId || ("fp:" + fp.id), objectId, fpId: fp.id,
        name: (o?.clientName) || fp.description || fp.client || "Проект",
        address: (o?.address) || "",
        contractNo: fp.contractNo || "",
        finStatus, prodStatusDefault: FIN_TO_PROD[finStatus] || "new",
        closedAt: fp.closedAt || "",
        budget, income, expense, debt: Math.max(0, budget - income),
        margin: income > 0 ? Math.round((income - expense) / income * 100) : null,
      });
    }
    return entries;
  }, [finProjects, financeTx, matchFpToObject, financeProjectStatusKeyOf]);
  const financeObjectOf = (project) => {
    if (project?.objectId) {
      const direct = liveObjects.find(o => o.id === project.objectId);
      if (direct) return direct;
    }
    return project?.contractNo ? (contractLinkMap[normCN(project.contractNo)]?.object || null) : null;
  };
  const financeContractOf = (project, object) => {
    if (!object) return null;
    if (project?.contractNo) {
      const exact = contracts.find(c => !c.deletedAt && c.objectId === object.id && c.number && normCN(c.number) === normCN(project.contractNo)
        && c.type !== "podryad" && c.type !== "podryad_annex");
      if (exact) return mainContractOf(exact);
    }
    const candidates = contracts
      .filter(c => !c.deletedAt && c.objectId === object.id && c.type !== "podryad" && c.type !== "podryad_annex"
        && c.type !== "annex" && c.type !== "design_add")
      .sort((a,b) => {
        const signed = Number(b.contractStatus === "signed") - Number(a.contractStatus === "signed");
        return signed || (Number(b.updatedAt || b.createdAt || b.id || 0) - Number(a.updatedAt || a.createdAt || a.id || 0));
      });
    return candidates[0] || null;
  };
  const financeProjectViewOf = (project) => {
    const object = financeObjectOf(project);
    const production = object ? (productions.find(p => p.objectId === object.id) || null) : null;
    const contract = financeContractOf(project, object);
    const status = object ? (DEAL_STATUSES.find(s => s.key === unifiedStatusOf(object)) || DEAL_STATUSES[0]) : null;
    return buildFinanceProjectView({ project, object, production, contract, reports, status });
  };
  // Что «подсказывает» производство/финансы — используется только как рекомендация
  // в панели проверки статусов (не влияет на отображение автоматически).
  const suggestedStatusOf = useCallback((o) => {
    const pr = productions.find(p=>p.objectId===o.id);
    const pe = prodEntries.find(e=>e.objectId===o.id);
    const ps = pr?.prodStatus || pe?.prodStatusDefault || "";
    return PROD_TO_DEAL[ps] || null;
  }, [productions, prodEntries]);

  // Мемоизированный фильтрованный/сортированный список смет
  const filteredEstimates = useMemo(() => {
    const q = debouncedListSearch.toLowerCase().trim();
    const objIds = new Set(objects.map(o=>o.id));
    return accessibleEstimates
      // показываем сметы без объекта ИЛИ привязанные к НЕсуществующему объекту (сироты после восстановления)
      .filter(e => !e.objectId || !objIds.has(e.objectId))
      .filter(e => !listFilter || e.proj?.type === listFilter)
      .filter(e => !listFilterManager || (e.proj?.manager||e.createdBy||"") === listFilterManager)
      .filter(e => !listFilterStatus || (e.status||"new") === listFilterStatus)
      .filter(e => !q || [e.proj?.name,e.proj?.address,e.proj?.phone,e.proj?.manager].some(v=>v&&v.toLowerCase().includes(q)))
      .slice()
      .sort((a,b) => {
        if (listSort==="sum") return (b.total||0)-(a.total||0);
        if (listSort==="name") return (a.proj?.name||"").localeCompare(b.proj?.name||"","ru");
        return (b.updatedAt||0)-(a.updatedAt||0);
      });
  }, [accessibleEstimates, objects, listFilter, listFilterManager, listFilterStatus, debouncedListSearch, listSort]);

  // Когда каталог меняется — синхронизируем activeCat/activeSub
  useEffect(() => {
    if (!Gdyn[activeCat]) {
      const firstCat = Object.keys(Gdyn)[0] || "";
      setActiveCat(firstCat);
      setActiveSub(Object.keys(Gdyn[firstCat]||{})[0] || "");
    } else {
      const subsNow = Object.keys(Gdyn[activeCat]||{});
      if (!subsNow.includes(activeSub)) {
        setActiveSub(subsNow[0] || "");
      }
    }
  }, [catalogVersion]);

  // ── Мини-журнал изменений сметы ──
  // Логируем: создание, смену статуса (всегда), и «редактировал» (коалесцируем 1 запись на 10 мин).
  const _appendHistory = useCallback((exists, updated) => {
    const hist = Array.isArray(exists?.history) ? exists.history.map(h => ({ ...h })) : [];
    const now = Date.now();
    const by = currentUser?.name || "";
    const total = Math.round(updated.total || 0);
    const push = (action) => hist.push({ ts: now, by, action, total });
    if (!exists) { push("создал смету"); return hist.slice(-60); }
    if ((exists.status || "new") !== (updated.status || "new")) {
      const lbl = (STATUSES.find(s => s.key === (updated.status || "new")) || {}).label || updated.status;
      push(`статус → «${lbl}»`);
      const oldLbl = (STATUSES.find(s => s.key === (exists.status || "new")) || {}).label || exists.status || "—";
      logChange(currentUser, { entity: "estimate", entityId: updated.id || "", objectId: updated.objectId || "", label: `Смета${updated.dsNumber ? ` (ДС №${updated.dsNumber})` : ""}`, field: "статус", action: "изменил смету", old: oldLbl, new: lbl });
    }
    const last = hist[hist.length - 1];
    const recentEdit = last && last.by === by && last.action === "редактировал" && (now - last.ts) < 10 * 60 * 1000;
    if (!recentEdit) push("редактировал");
    else { last.ts = now; last.total = total; }
    return hist.slice(-60);
  }, [currentUser]);

  // Автосохранение сметы
  const _autoSaveRef = useRef(null);
  const _estFlushRef = useRef(null); // id открытой сметы — для принудительного флеша при уходе
  // Собрать актуальный список смет из текущего состояния редактора (или null, если сохранять нельзя)
  const _buildEstimateList = () => {
    if (!currentId) return null;
    const cur = estimatesRef.current;
    const exists = cur.find(e => e.id === currentId);
    const ownsDraft = !exists && (
      proj?._createdById === currentUser.id
      || proj?._createdBy === currentUser.name
    );
    if (!accessAllows(currentPermissions.estimateEdit, exists ? isOwnEstimate(exists) : ownsDraft)) return null;
    // ЗАЩИТА: не затирать смету с позициями пустой версией (если не явный сброс)
    if (exists && countFilled(exists.rows) > 0 && countFilled(rows) === 0 && !_allowEmptySave.current) return null;
    // parentId/dsNumber берём из стейта (новая ДС) ИЛИ из сохранённой записи (открытая ДС). Игнорируем самоссылку.
    const _ep = exists?.parentId && exists.parentId!==currentId ? exists.parentId : null;
    const pId = currentParentId || _ep;
    const dsN = pId ? (currentDsNumber || exists?.dsNumber) : null;
    const objId = currentObjectId || exists?.objectId || null;
    const updated = { id:currentId, proj, rows, discount, markup, note, status:estStatus, sentAt: estStatus==="sent" ? (estSentAt||exists?.sentAt||new Date().toISOString().slice(0,10)) : (exists?.sentAt||null), comment:estComment, createdAt:exists?.createdAt||Date.now(), createdBy:exists?.createdBy||currentUser?.name, updatedAt:Date.now(), updatedBy:currentUser?.name, total:final, ...(objId ? {objectId:objId} : {}), ...(pId ? {parentId:pId, dsNumber:dsN} : {}) };
    updated.history = _appendHistory(exists, updated);
    return exists ? cur.map(e=>e.id===currentId?updated:e) : [updated,...cur];
  };
  const _flushEstimate = () => {
    const newList = _buildEstimateList();
    if (!newList) return;
    setEstimates(newList);
    saveEstimates(newList);
  };
  useEffect(() => {
    if (!currentId) { _estFlushRef.current = null; return; }
    _estFlushRef.current = currentId;
    if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
    _autoSaveRef.current = setTimeout(_flushEstimate, 900);
    return () => clearTimeout(_autoSaveRef.current);
  }, [rows, proj, discount, markup, note, estStatus, estSentAt, estComment, currentPermissions.estimateEdit, isOwnEstimate]);
  // ПРИНУДИТЕЛЬНЫЙ ФЛЕШ при уходе из редактора сметы: если пользователь ушёл (сменил экран
  // верхней навигацией) до срабатывания дебаунса — всё равно сохраняем, чтобы смета не пропала.
  useEffect(() => {
    if (screen === "editor") return;
    if (!_estFlushRef.current) return;
    if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
    _flushEstimate();
    _estFlushRef.current = null;
  }, [screen]);

  // ── Загрузка списка смет из shared storage ──
  const loadContracts = useCallback(async () => {
    let ok = true;
    let prodOk = true;
    try {
      const [cr, cl, ca, ob, pd, rp, wk, py] = await Promise.all([storage.getResult(CONTRACTS_KEY), storage.getResult(CLIENTS_KEY), storage.getResult(CONTRAGENTS_KEY), storage.getResult(OBJECTS_KEY), storage.getResult(PRODUCTIONS_KEY), storage.getResult(REPORTS_KEY), storage.getResult(WORKERS_KEY), storage.getResult(PODRYADS_KEY)]);
      // Договоры
      if (cr.status === "found" && cr.value) { try { const p = JSON.parse(cr.value); if (Array.isArray(p)) { setContracts(p); contractsRef.current = p; } } catch {} }
      else if (cr.status === "empty") { setContracts([]); contractsRef.current = []; }
      else { ok = false; } // unavailable — не трогаем
      // Объекты
      if (ob.status === "found" && ob.value) { try { const p = JSON.parse(ob.value); if (Array.isArray(p)) { setObjects(p); objectsRef.current = p; } } catch {} }
      else if (ob.status === "empty") { setObjects([]); objectsRef.current = []; }
      else { ok = false; }
      // Производственные карточки — статус загрузки отслеживаем ОТДЕЛЬНО (_productionsLoaded):
      // если этот конкретный запрос не долетел, а остальные (договоры/объекты) — долетели,
      // ok выше всё равно останется true, и без отдельного флага сохранение production
      // считалось бы разрешённым при незагруженных данных (риск затереть карточки).
      if (pd.status === "found" && pd.value) { try { const p = JSON.parse(pd.value); if (Array.isArray(p)) { setProductions(p); productionsRef.current = p; } } catch {} }
      else if (pd.status === "empty") { setProductions([]); productionsRef.current = []; }
      else { prodOk = false; }
      // Отчёты (АВР)
      if (rp.status === "found" && rp.value) { try { const p = JSON.parse(rp.value); if (Array.isArray(p)) { setReports(p); reportsRef.current = p; } } catch {} }
      else if (rp.status === "empty") { setReports([]); reportsRef.current = []; }
      // Подрядчики
      if (wk.status === "found" && wk.value) { try { const p = JSON.parse(wk.value); if (Array.isArray(p)) { setWorkers(p); workersRef.current = p; } } catch {} }
      else if (wk.status === "empty") { setWorkers([]); workersRef.current = []; }
      // Договоры подряда
      if (py.status === "found" && py.value) { try { const p = JSON.parse(py.value); if (Array.isArray(p)) { setPodryads(p); podryadsRef.current = p; } } catch {} }
      else if (py.status === "empty") { setPodryads([]); podryadsRef.current = []; }
      // Клиенты
      if (cl.status === "found" && cl.value) { try { const p = JSON.parse(cl.value); if (Array.isArray(p)) { const cls = p.map(c=>({...c, createdAt:c.createdAt||Date.now()})); setContractClients(cls); clientsRef.current = cls; } } catch {} }
      else if (cl.status === "empty") { setContractClients([]); clientsRef.current = []; }
      else { ok = false; }
      // Контрагенты
      if (ca.status === "found" && ca.value) { try { const p = JSON.parse(ca.value); if (Array.isArray(p)) { setContragents(p); contragentsRef.current = p; } } catch {} }
      // контрагенты: если пусто/недоступно — оставляем дефолтный, не трогаем
    } catch(e) { console.error(e); ok = false; prodOk = false; }
    _contractsLoaded.current = ok;
    _productionsLoaded.current = ok && prodOk;
    _bumpLoaded();
  }, [_bumpLoaded]);

  const saveContracts = async (list, opts = {}) => {
    const r = await saveListProtected(CONTRACTS_KEY, CONTRACTS_BACKUPS_KEY, list, (fl)=>{ contractsRef.current = fl; setContracts(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveContractClients = async (list, opts = {}) => {
    const patched = list.map(c=>({...c, createdAt: c.createdAt||Date.now()}));
    const r = await saveListProtected(CLIENTS_KEY, CLIENTS_BACKUPS_KEY, patched, (fl)=>{ clientsRef.current = fl; setContractClients(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveContragents = async (list, opts = {}) => {
    const r = await saveListProtected(CONTRAGENTS_KEY, CONTRAGENTS_BACKUPS_KEY, list, (fl)=>{ contragentsRef.current = fl; setContragents(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveDeals = async (list, opts = {}) => {
    const r = await saveListProtected(DEALS_KEY, DEALS_BACKUPS_KEY, list, (fl)=>{ dealsRef.current = fl; setDeals(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  const saveObjects = async (list, opts = {}) => {
    const r = await saveListProtected(OBJECTS_KEY, OBJECTS_BACKUPS_KEY, list, (fl)=>{ objectsRef.current = fl; setObjects(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  // ── ЕДИНАЯ АТОМАРНАЯ ЗАПИСЬ ПРОИЗВОДСТВА (этап 2А) ──
  // saveProductions(готовыйМассив) удалён: все изменения производства идут строго командами.
  // Все изменения производства идут ТОЛЬКО через команды: mutateProductions(command). Команда
  // применяется к самому свежему списку ВНУТРИ Firebase runTransaction (см. storage.mutateTransaction),
  // поэтому параллельная правка другого поля/устройства не затирается «готовым устаревшим массивом».
  // Локальная очередь (_prodQueue) упорядочивает команды одной вкладки; транзакция защищает между
  // вкладками/устройствами. REST/обычный set для производства НЕ используем.
  const _prodQueue = useRef(Promise.resolve());
  // Множество НЕподтверждённых правок производства по changeId. Ошибка добавляет id, успешный
  // повтор ТОГО ЖЕ changeId удаляет его. Баннер «ожидают синхронизации» — пока множество не пусто.
  // changeId соглашение: "cm_*" — правки карточки из ProductionModule (его очередь сама повторяет
  // и перебазирует), "bg_*" — фоновые команды App (авто-синк, зеркало статуса, замечания клиента,
  // удаление): их при сетевой ошибке повторяет _prodRetryCmds + интервал ниже.
  const _prodUnsyncedIds = useRef(new Set());
  const _prodRetryCmds = useRef(new Map()); // changeId -> команда для фонового повтора (только bg_*)
  const _prodDraftWarningShown = useRef(false);
  const _prodRetryRevision = useRef(0);
  const [prodUnsyncedN, setProdUnsyncedN] = useState(0);
  // «Скрыть» в баннере синхронизации: реально скрывает (раньше только сбрасывал cloudError и при
  // prodUnsyncedN>0 баннер оставался). Когда всё дожато (нет ошибок и ожидающих) — сброс, чтобы
  // СЛЕДУЮЩАЯ проблема снова показала баннер.
  const [syncBannerHidden, setSyncBannerHidden] = useState(false);
  useEffect(() => { if (!cloudError && prodUnsyncedN === 0 && dirtyCount === 0 && legacyDirtyN === 0 && syncBannerHidden) setSyncBannerHidden(false); }, [cloudError, prodUnsyncedN, dirtyCount, legacyDirtyN, syncBannerHidden]);
  const _refreshProdUnsynced = useCallback(() => { setProdUnsyncedN(_prodUnsyncedIds.current.size); }, []);
  // Защита App-очереди от команд «после logout»: номер App-сессии производственных команд
  // (инкремент при завершении) + флаг «сессия завершается» (новые bg_ не принимаются).
  const _prodAppSession = useRef(0);
  const _prodEndingRef = useRef(false);
  // cloudError гасим ТОЛЬКО когда чисто ВЕЗДЕ: успех производства не должен скрывать
  // незасинканные сметы/финансы (dirty-записи storage) — и наоборот.
  const _clearCloudErrorIfAllClean = useCallback(() => {
    if (_prodUnsyncedIds.current.size === 0 && storage.dirtyKeysFlushable().length === 0) setCloudError(false);
  }, []);
  const mutateProductions = useCallback((command) => {
    // Read-only вкладка (lease у другой): команды производства НЕ выполняются вовсе —
    // ни транзакции, ни учёта changeId (это не сетевая ошибка, повторять нечего).
    if (command.type !== "resolve-change" && storage.isReadOnlyTab()) {
      return Promise.resolve({ committed: false, reason: "read-only-tab" });
    }
    const editorSession = storage.editorSession();
    // Завершение сессии: НОВЫЕ фоновые команды не принимаются (иначе эффект/таймер мог бы
    // подбросить bg_ во время дожима хвоста, и она выполнилась бы уже после выхода).
    if (isBlockedWhileEnding(command, _prodEndingRef.current)) {
      return Promise.resolve({ committed: false, reason: "session-ending" });
    }
    const durableChangeId = command.changeId != null ? String(command.changeId) : "";
    // Автосинк этапов полностью воспроизводим из уже сохранённых смет, поэтому его нет смысла
    // дублировать тяжёлой командой в localStorage. При текущем сетевом сбое он остаётся в памяти,
    // а после перезагрузки безопасно пересоберётся из смет заново.
    const durableBg = durableChangeId.startsWith("bg_")
      && command.__ephemeral !== true
      && !isRegenerableProductionCommand(command);
    if (durableBg && !command.__draftRevision) {
      command = {
        ...command,
        __draftRevision: `${Date.now().toString(36)}_${(++_prodRetryRevision.current).toString(36)}`,
      };
    }
    // 2Б: bg-команда сначала попадает в per-user localStorage, и только потом — в очередь.
    // Crash после клика, но до ответа Firebase, не теряет зеркало статуса/синк/удаление.
    if (durableBg && !saveProductionRetry(localStorage, currentUser?.id, command)) {
      // Резерв команды не влез в localStorage (переполнено старыми авто-бэкапами) — раньше
      // здесь включался cloudError, хотя Firebase ещё даже не вызывался. Из-за этого оранжевый
      // баннер мигал «облако недоступно» при полностью рабочей базе. Основной канал продолжаем;
      // если он реально упадёт, _fail ниже добавит команду в pending и покажет честный баннер.
      if (!_prodDraftWarningShown.current) {
        _prodDraftWarningShown.current = true;
        console.warn("Резерв команды производства не сохранён в localStorage (переполнено?) — синхронизация продолжается в фоне.");
      }
    }
    const sess = _prodAppSession.current; // номер сессии НА МОМЕНТ ПОСТАНОВКИ в очередь
    const run = async () => {
      // Сессия завершилась, пока команда стояла в очереди — НЕ выполняем запись вовсе
      // (проверка только «после await» недостаточна: транзакция уже успела бы записать).
      if (sess !== _prodAppSession.current) return { committed: false, reason: "session-ended" };
      const changeId = command.changeId != null ? command.changeId : null;
      // resolve-change: правка отменена самим отправителем (например, пользователь вернул значение
      // назад и дифф стал пуст) — снимаем changeId из «ожидающих» БЕЗ записи в базу.
      if (command.type === "resolve-change") {
        if (changeId != null) {
          _prodRetryCmds.current.delete(changeId);
          if (String(changeId).startsWith("bg_")) removeProductionRetry(localStorage, currentUser?.id, changeId, command.__draftRevision);
          if (_prodUnsyncedIds.current.delete(changeId)) _refreshProdUnsynced();
          _clearCloudErrorIfAllClean();
        }
        return { committed: true, list: productionsRef.current };
      }
      const _fail = (reason, conflict, list) => {
        // Учёт changeId — в чистой accountProductionFailure (commands.js). Ключевое: конфликт
        // bg_-команды снимает её и из retry, И из «ожидающих» (после «сеть упала → команда стала
        // неактуальна» повторов больше нет — раньше id зависал в множестве и баннер горел вечно).
        const acc = accountProductionFailure({ changeId, conflict, command },
          { unsynced: _prodUnsyncedIds.current, retry: _prodRetryCmds.current });
        if (conflict && changeId != null && String(changeId).startsWith("bg_")) {
          removeProductionRetry(localStorage, currentUser?.id, changeId, command.__draftRevision);
        }
        _refreshProdUnsynced();
        if (acc.cloudIssue) setCloudError(true);
        else _clearCloudErrorIfAllClean();
        return { committed: false, reason, conflict: !!conflict, list };
      };
      if (_productionsLoaded && !_productionsLoaded.current) return _fail("not-loaded", false);
      const cmd = { ...command, ts: command.ts || Date.now() };
      // Мутатор транзакции применяет команду к свежему списку. Если команда НЕ применима
      // (ok:false — нет карточки/элемента, битая) — возвращаем undefined → runTransaction
      // ОТМЕНЯЕТСЯ (committed:false), правка НЕ считается сохранённой (не «тихий успех»).
      // createTxnApplier СБРАСЫВАЕТ notOk на каждом прогоне колбэка: SDK перезапускает его
      // (холодный кеш → CAS → реальные данные), и «залипший» notOk первого прогона объявлял бы
      // РЕАЛЬНО закоммиченное сохранение конфликтом (блокер rev4-аудита №1).
      const applier = createTxnApplier(cmd);
      const res = await storage.mutateTransaction(PRODUCTIONS_KEY, applier.mutate);
      const notOk = applier.state.notOk, notOkList = applier.state.notOkList;
      if (!storage.mayApplyEditorResult(editorSession)) {
        return { committed: false, reason: "editor-session-ended" };
      }
      // Сессия завершилась, пока шла транзакция: запись (если успела) — легитимный «дожим»
      // правок ЭТОГО пользователя, но React-state и учёты больше не трогаем.
      if (sess !== _prodAppSession.current) return { committed: !!(res.committed && !notOk), reason: "session-ended" };
      if (res.committed && !notOk) {
        let next = [];
        try { next = res.value ? JSON.parse(res.value) : []; } catch { next = productionsRef.current; }
        if (Array.isArray(next)) { productionsRef.current = next; setProductions(next); }
        // Успешный (повтор) этого changeId — снимаем его из «ожидающих» и из очереди повтора.
        if (changeId != null) {
          _prodRetryCmds.current.delete(changeId);
          if (String(changeId).startsWith("bg_")) removeProductionRetry(localStorage, currentUser?.id, changeId, command.__draftRevision);
          if (_prodUnsyncedIds.current.delete(changeId)) _refreshProdUnsynced();
        }
        _clearCloudErrorIfAllClean();
        return { committed: true, list: next };
      }
      // SDK может сначала прогнать transaction-callback по холодному локальному cache=[].
      // Если соединение ещё поднимается, этот предварительный no-card нельзя выдавать за
      // подтверждённое удаление карточки: пользователь увидит ложный confirm, а черновик может
      // быть обработан против неавторитетного списка. Любой логический конфликт перепроверяем
      // отдельным облачным чтением (SDK→REST). Только если команда НЕ применима и к свежему
      // списку Firebase, возвращаем conflict:true; при недоступном облаке оставляем pending.
      if (notOk) {
        try {
          const freshResult = await storage.getCloudResult(PRODUCTIONS_KEY);
          if (freshResult.status === "unavailable") return _fail("conflict-unverified", false);
          let fresh = [];
          if (freshResult.status === "found" && freshResult.value) {
            try { fresh = JSON.parse(freshResult.value); } catch { return _fail("conflict-cloud-json", false); }
          }
          if (!Array.isArray(fresh)) return _fail("conflict-cloud-shape", false);
          const verified = applyProductionCommand(fresh, cmd);
          if (verified.ok) {
            // Конфликт был только в холодном кеше. Fresh-read заодно прогревает SDK; следующий
            // фоновый retry применит тот же идемпотентный batch, durable-draft пока не удаляем.
            return _fail("stale-transaction-cache", false);
          }
          return _fail(verified.reason || notOk, true, fresh);
        } catch {
          return _fail("conflict-unverified", false);
        }
      }
      // Транзакция не дошла до подтверждённого логического конфликта: сеть/SDK/таймаут.
      return _fail(res.reason, false);
    };
    const next = _prodQueue.current.then(run, run);
    _prodQueue.current = next.then(() => {}, () => {});
    return next;
  }, [currentUser?.id, _refreshProdUnsynced, _clearCloudErrorIfAllClean]);
  // 2Б: связать module-scope очередь с App сразу после входа и поднять фоновые команды прошлого
  // запуска. Это работает даже если пользователь ещё не открыл ни одной карточки объекта.
  useEffect(() => {
    if (!editorTab) return;
    setProductionCommandHandler(mutateProductions);
    // До этого исправления автосинк сохранял полные массивы этапов в retry. Они могли заполнить
    // localStorage и на каждом входе давали ложный баннер, хотя Firebase работал. Автосинк всегда
    // заново строится из облачных смет, поэтому удаляем только эти старые воспроизводимые команды.
    const recovered = [];
    for (const cmd of listProductionRetries(localStorage, currentUser?.id)) {
      if (isRegenerableProductionCommand(cmd)) {
        removeProductionRetry(localStorage, currentUser?.id, cmd.changeId, cmd.__draftRevision);
      } else recovered.push(cmd);
    }
    for (const cmd of recovered) {
      _prodRetryCmds.current.set(cmd.changeId, cmd);
      _prodUnsyncedIds.current.add(cmd.changeId);
    }
    if (recovered.length) {
      _refreshProdUnsynced();
      setCloudError(true);
    }
    flushPendingProduction().catch(() => {});
    for (const cmd of recovered) mutateProductions({ ...cmd, __retryFlush: true });
    return () => { setProductionCommandHandler(null); };
  }, [editorTab, currentUser?.id, mutateProductions, _refreshProdUnsynced]);
  // Фоновый повтор упавших ФОНОВЫХ команд производства (bg_*: авто-синк, статус, замечания,
  // удаление). Правки карточки (cm_*) повторяет очередь самого ProductionModule.
  useEffect(() => {
    const iv = setInterval(() => {
      if (_prodEndingRef.current) return; // сессия завершается — повторы гоняет только финальный флеш
      if (_prodRetryCmds.current.size) for (const cmd of Array.from(_prodRetryCmds.current.values())) mutateProductions(cmd);
    }, 15000);
    return () => clearInterval(iv);
  }, [mutateProductions]);
  // Размонтирование MainApp (logout, смена пользователя через key={currentUser.id}) — остановка
  // module-scope очереди производства. Страховка: все штатные пути выхода идут через
  // endSessionSafely (он дожимает и предупреждает ДО остановки), сюда доезжает уже пустая очередь.
  useEffect(() => () => { try { stopProductionSession(); } catch {} }, []);
  // ЕДИНЫЙ флеш ВСЕГО производства: правки карточек (module-очередь) + упавшие фоновые команды
  // (bg_*, с обходным флагом __retryFlush — при завершении сессии новые bg_ заблокированы, а эти
  // повторы должны пройти) + СТАБИЛИЗАЦИЯ хвоста общей очереди (пока ждали — могли добавить ещё).
  // Возвращает, сколько осталось несинхронизированным.
  const flushAllProductionPending = useCallback(async () => {
    try { await flushPendingProduction(); } catch(e) { console.warn("flush module pending err", e); }
    if (_prodRetryCmds.current.size) {
      await Promise.all(Array.from(_prodRetryCmds.current.values()).map(cmd => mutateProductions({ ...cmd, __retryFlush: true }).catch(() => {})));
    }
    await awaitQueueSettled(() => _prodQueue.current);
    // Итог по ВСЕМ учётам: множество «ожидают синхронизации» покрывает и cm_ (правки карточек),
    // и bg_ (фоновые); module pending — страховка на случай правки без попытки отправки.
    return Math.max(_prodUnsyncedIds.current.size, hasPendingProduction());
  }, [mutateProductions]);
  // ЕДИНОЕ безопасное завершение сессии (кнопка «Выйти» и принудительный выход после смены
  // пароля): 1) заблокировать НОВЫЕ фоновые команды; 2) дожать производство и обычные dirty;
  // 3) неподтверждённое производство можно безопасно оставить в per-user 2Б-черновиках;
  // 4) только данные, для которых durable-копии НЕТ, требуют confirm/alert о потере;
  // 5) при подтверждённой потере обычные dirty удаляются целиком; 6) остановка очередей и выход.
  const _endingSessionRef = useRef(false);
  const endSessionSafely = useCallback(async ({ forced = false } = {}) => {
    if (_endingSessionRef.current) return; // повторный вход (например, второй тик загрузки)
    _endingSessionRef.current = true;
    _prodEndingRef.current = true; // новые bg_ команды больше не принимаются, ретрай-таймер молчит
    try {
      let prodLeft = 0;
      try { prodLeft = await flushAllProductionPending(); }
      catch(e) { console.warn("logout flush err", e); prodLeft = Math.max(_prodUnsyncedIds.current.size, hasPendingProduction()); }
      // Дожимаем и ОБЫЧНЫЕ dirty-записи (сметы, финансы, договоры, клиенты) — иначе несохранённая
      // смета первого пользователя ушла бы в облако авто-флешем уже ПОСЛЕ входа следующего.
      try { await storage.flushDirty(); } catch(e) { console.warn("logout flushDirty err", e); }
      // Считаем и удаляем ТОЛЬКО СВОИ записи (этот пользователь + эта вкладка): выход в одной
      // вкладке не должен снимать dirty другой вкладки или другого пользователя.
      const ownedDirty = storage.dirtyKeysOwned(); // точный список ДО удаления
      const dirtyLeft = ownedDirty.length;
      const savedBgIds = new Set(listProductionRetries(localStorage, currentUser?.id).map(c => c.changeId));
      const bgDurable = Array.from(_prodRetryCmds.current.keys()).every(id => savedBgIds.has(id));
      const prodAtRisk = prodLeft > 0 && (!productionDraftsAreDurable() || !bgDurable);
      const atRisk = (prodAtRisk ? prodLeft : 0) + dirtyLeft;
      if (atRisk > 0) {
        const what = [prodAtRisk ? `производство без резервного черновика: ${prodLeft}` : "", dirtyLeft > 0 ? `сметы/финансы/прочее: ${dirtyLeft}` : ""].filter(Boolean).join("; ");
        if (forced) {
          alert(`Внимание: несинхронизированные изменения (${what}) не удалось отправить — они будут потеряны. Выход принудительный: пароль был изменён.`);
        } else {
          const drop = window.confirm(`Несинхронизированные изменения (${what}) не удалось отправить — облако не отвечает.\n\nOK — выйти и ПОТЕРЯТЬ их.\nОтмена — остаться (попробуйте «Повторить сейчас» в баннере).`);
          if (!drop) { setLogoutConfirm(false); return; } // остаёмся: finally вернёт очереди в работу
        }
        // Потеря подтверждена: удаляем СВОИ dirty-записи ЦЕЛИКОМ (метка + значение + __wts + _mem) —
        // просто снятая метка оставляла локальную копию, и следующий пользователь получал чужую
        // смету (свежая локальная копия выигрывает в getResult) и мог сохранить её в облако.
        try { storage.discardOwnDirty(); setDirtyCount(storage.dirtyKeysFlushable().length); } catch(e) {}
      }
      // prodLeft с подтверждёнными durable-черновиками НЕ теряется: stop очистит только память,
      // а следующий вход этого же uid поднимет команды из localStorage и повторит.
      try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
      // чистим глобальный кэш карточек прайса, чтобы данные не «протекли» к другому пользователю
      try{ Object.keys(priceCardCache).forEach(k=>delete priceCardCache[k]); }catch(e){}
      // Инкремент App-сессии: команды, ЕЩЁ стоящие в _prodQueue, не выполнятся (проверка ДО
      // транзакции), а ответы уже улетевших не тронут React-state. Затем — остановка module-очереди.
      _prodAppSession.current++;
      try{ stopProductionSession(); }catch(e){}
      _prodRetryCmds.current.clear(); _prodUnsyncedIds.current.clear(); _refreshProdUnsynced();
      try{ await storage.releaseEditLease(); }catch(e){}
      setCurrentUser(null); setLogoutConfirm(false);
    } finally {
      _endingSessionRef.current = false;
      _prodEndingRef.current = false; // при отмене выхода очереди снова работают штатно
    }
  }, [flushAllProductionPending, _refreshProdUnsynced, setCurrentUser, currentUser?.id]);
  endSessionSafelyRef.current = endSessionSafely;
  const saveReports = async (list, opts = {}) => {
    return await saveListProtected(REPORTS_KEY, REPORTS_BACKUPS_KEY, list, (fl)=>{ reportsRef.current = fl; setReports(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };
  const saveWorkers = async (list, opts = {}) => {
    return await saveListProtected(WORKERS_KEY, WORKERS_BACKUPS_KEY, list, (fl)=>{ workersRef.current = fl; setWorkers(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };
  const savePodryads = async (list, opts = {}) => {
    return await saveListProtected(PODRYADS_KEY, PODRYADS_BACKUPS_KEY, list, (fl)=>{ podryadsRef.current = fl; setPodryads(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };

  // ── АВР (форма Р-1): построитель и печать ──
  // Собрать строки акта из позиций сметы (цена с учётом наценки, без НДС)
  const buildAvrLinesFromEst = (est) => {
    const cat = getEffectiveCatalog();
    const lk = new Map();
    for (const w of cat) { if (w?.name) lk.set(w.name, w); if (w?.code) lk.set(w.code, w); }
    const mm = 1 + (Number(est.markup) || 0) / 100;
    const lines = [];
    for (const [key, r] of Object.entries(est.rows || {})) {
      const qty = Number(r?.qty || 0); if (qty <= 0) continue;
      const w = lk.get(key); if (!w) continue;
      let price;
      if (r.manualPrice !== undefined && r.manualPrice !== "") { const n = Number(r.manualPrice); price = isNaN(n) ? 0 : n; }
      else { const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined; price = getPrice(w, qty, r.complexity || "std", cpxPct) || 0; }
      if (!price) continue; // позиции «цена от» в акт не берём
      const name = r.manualName !== undefined ? r.manualName : w.name;
      const unit = r.manualUnit !== undefined ? r.manualUnit : w.unit;
      lines.push({ cat: w.cat || "", name, unit: unit || "", qty, price: Math.round(price * mm), included: true, doneQty: qty });
    }
    return lines;
  };
  // Открыть построитель акта по объекту и его смете
  const openAvrBuilder = (obj, est) => {
    const lines = buildAvrLinesFromEst(est);
    if (lines.length === 0) { alert("В этой смете нет позиций с точной ценой для акта."); return; }
    const cons = contractsRef.current.filter(c => c.objectId === obj.id && (c.type || "repair_fiz") !== "annex").sort((a, b) => (b.id || 0) - (a.id || 0));
    const con = cons[0];
    const existingNo = reportsRef.current.filter(r => r.objectId === obj.id).length + 1;
    setAvrModal({
      id: null, objectId: obj.id, estId: est.id,
      clientName: obj.clientName || "", clientType: obj.clientType || "физ",
      clientIin: obj.clientIin || "", address: obj.address || "",
      actNo: String(existingNo), actDate: new Date().toISOString().slice(0, 10),
      contractNo: con?.number || "", contractDate: con?.date || "",
      withStamp: false, lines,
    });
  };
  // Открыть построитель акта по объекту сразу по ВСЕМ его сметам (основная + доп. сметы/ДС) —
  // кнопка «+ Сформировать АВР» раньше брала только первую (основную) смету объекта.
  const openAvrBuilderAll = (obj, ests) => {
    const lines = (ests || []).flatMap(e => buildAvrLinesFromEst(e));
    if (lines.length === 0) { alert("В сметах этого объекта нет позиций с точной ценой для акта."); return; }
    const cons = contractsRef.current.filter(c => c.objectId === obj.id && (c.type || "repair_fiz") !== "annex").sort((a, b) => (b.id || 0) - (a.id || 0));
    const con = cons[0];
    const existingNo = reportsRef.current.filter(r => r.objectId === obj.id).length + 1;
    setAvrModal({
      id: null, objectId: obj.id, estId: ests?.[0]?.id || null,
      clientName: obj.clientName || "", clientType: obj.clientType || "физ",
      clientIin: obj.clientIin || "", address: obj.address || "",
      actNo: String(existingNo), actDate: new Date().toISOString().slice(0, 10),
      contractNo: con?.number || "", contractDate: con?.date || "",
      withStamp: false, lines,
    });
  };
  // HTML формы Р-1 (без НДС)
  const buildAvrHtml = (m) => {
    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const P = l => Number(l.price) || 0, Q = l => Number(l.doneQty) || 0;
    const items = (m.lines || []).filter(l => l.included && Q(l) > 0);
    const money = n => Math.round(Number(n) || 0).toLocaleString("ru-RU");
    const total = items.reduce((s, l) => s + Math.round(P(l) * Q(l)), 0);
    const dateStr = m.actDate ? new Date(m.actDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";
    const dateShort = m.actDate ? m.actDate.split("-").reverse().join(".") : "";
    // Название документа (как у договора: номер + клиент + дата) — от него зависит имя файла
    // при сохранении/печати в PDF (браузер подставляет заголовок вкладки), у голого «АВР №5»
    // не разобрать, чей это акт.
    const docTitle = ("АВР №" + (m.actNo || "б_н") + (m.clientName ? " " + m.clientName : "") + (dateShort ? " от " + dateShort : "")).replace(/[<>:"/\\|?*]/g, "_");
    const rowsHtml = items.map((l, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(l.name)}</td>
      <td class="c">${esc(l.unit)}</td>
      <td class="c">${Q(l).toLocaleString("ru-RU")}</td>
      <td class="r">${money(P(l))}</td>
      <td class="r">${money(P(l) * Q(l))}</td>
    </tr>`).join("");
    const stampImg = m.withStamp ? `<img src="${window.location.origin}/stamp.jpg" alt="Печать" style="position:absolute;left:40px;bottom:-140px;width:200px;height:200px;object-fit:contain;opacity:.85;mix-blend-mode:multiply;pointer-events:none"/>` : "";
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle)}</title>
<style>
*{box-sizing:border-box} body{font-family:'Times New Roman',Georgia,serif;color:#000;background:#fff;margin:0;padding:18mm 14mm}
.form{text-align:right;font-size:10px;color:#444;margin-bottom:4px}
h1{font-size:16px;text-align:center;margin:6px 0 2px;text-transform:uppercase}
.sub{text-align:center;font-size:12px;margin-bottom:14px}
.meta{font-size:12.5px;line-height:1.7;margin-bottom:12px}
.meta b{font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
th,td{border:1px solid #000;padding:5px 7px;vertical-align:top}
th{background:#f0f0f0;font-weight:700;text-align:center;font-size:11px}
td.c{text-align:center} td.r{text-align:right;white-space:nowrap}
tfoot td{font-weight:700}
.total-words{font-size:12.5px;margin:12px 0 4px} .total-words b{font-weight:700}
.sign{display:flex;justify-content:space-between;gap:40px;margin-top:34px;font-size:12.5px}
.sign .col{flex:1}
.sign .line{border-bottom:1px solid #000;height:30px;margin-bottom:3px}
.muted{color:#555;font-size:11px}
.np{margin-top:24px;text-align:center}
@media print{.np{display:none}@page{size:A4;margin:0}body{padding:14mm 12mm}}
</style></head><body>
<div class="form">Форма Р-1</div>
<h1>Акт выполненных работ (оказанных услуг)</h1>
<div class="sub">№ ${esc(m.actNo) || "____"} от ${dateStr || "«____» __________ 20__ г."}</div>
<div class="meta">
  <div><b>Исполнитель:</b> TitovStroy, БИН 231040002769, WhatsApp +7 707 982 4915</div>
  <div><b>Заказчик:</b> ${esc(m.clientName) || "—"}${m.clientIin ? ", ИИН/БИН " + esc(m.clientIin) : ""}${m.address ? ", " + esc(m.address) : ""}</div>
  <div><b>Основание (договор):</b> ${m.contractNo ? "№ " + esc(m.contractNo) : "—"}${m.contractDate ? " от " + esc(new Date(m.contractDate).toLocaleDateString("ru-RU")) : ""}</div>
</div>
<table>
  <thead><tr>
    <th style="width:36px">№</th><th>Наименование работ (услуг)</th><th style="width:64px">Ед. изм.</th>
    <th style="width:70px">Кол-во</th><th style="width:104px">Цена, ₸</th><th style="width:120px">Стоимость, ₸</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
  <tfoot><tr><td colspan="5" class="r">ИТОГО:</td><td class="r">${money(total)}</td></tr></tfoot>
</table>
<div class="total-words">Всего выполнено работ (оказано услуг) на сумму: <b>${money(total)} ₸</b><br/>(${tengeInWords(total)})</div>
<div class="muted">Сумма указана без НДС. Работы выполнены в полном объёме, заказчик претензий по объёму, качеству и срокам не имеет.</div>
<div class="sign" style="${m.withStamp ? "margin-bottom:170px" : ""}">
  <div class="col" style="position:relative"><div><b>Сдал (Исполнитель)</b></div><div class="line"></div><div class="muted">TitovStroy · подпись, дата</div>${stampImg}</div>
  <div class="col"><div><b>Принял (Заказчик)</b></div><div class="line"></div><div class="muted">${esc(m.clientName) || "подпись"} · подпись, дата</div></div>
</div>
<div class="np"><button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:Arial,sans-serif">🖨 Печать / Сохранить PDF</button></div>
</body></html>`;
  };
  // Сохранить акт в список отчётов объекта и распечатать
  const saveAndPrintAvr = (m) => {
    const items = (m.lines || []).filter(l => l.included && Number(l.doneQty) > 0);
    if (items.length === 0) { alert("Отметьте хотя бы одну позицию с количеством."); return; }
    const total = items.reduce((s, l) => s + Math.round((Number(l.price) || 0) * (Number(l.doneQty) || 0)), 0);
    const id = m.id || genId();
    const record = {
      id, objectId: m.objectId, estId: m.estId, type: "avr",
      actNo: m.actNo || "", actDate: m.actDate || new Date().toISOString().slice(0, 10),
      contractNo: m.contractNo || "", contractDate: m.contractDate || "",
      clientName: m.clientName || "", clientType: m.clientType || "физ", clientIin: m.clientIin || "", address: m.address || "",
      withStamp: !!m.withStamp,
      lines: items.map(l => ({ name: l.name, unit: l.unit, price: Number(l.price) || 0, doneQty: Number(l.doneQty) || 0 })),
      total, createdAt: m.createdAt || Date.now(), updatedAt: Date.now(), createdBy: currentUser?.name || "",
    };
    // Печать и закрытие — МГНОВЕННО (HTML акта не зависит от факта записи в облако). Сохранение
    // уходит в ФОН: раньше здесь был await полного цикла saveReports (чтение→бэкап→запись, до
    // 6-10 сек на медленном облаке) ПЕРЕД печатью — отсюда «Сохраняю… 6-10 сек». Запись
    // устойчива (localStorage-first + dirty-флаг + фоновый повтор), merge (replace:false) не
    // затирает акты с других устройств.
    saveReports([record], { replace: false }).catch(e => console.warn("bg save avr err", e));
    setAvrModal(null);
    runReportExport("pdf", record);
  };

  // ── ВОССТАНОВЛЕНИЕ СМЕТЫ ИЗ АКТА (АВР) ──
  // Если исходная смета пропала, её позиции сохранились внутри акта. Пересобираем
  // смету из строк акта (наименование/ед./кол-во/цена), привязываем к объекту.
  const restoreEstimateFromAvr = async (r, obj) => {
    if (!accessAllows(currentPermissions.estimateCreate, estimatorObjectIds.has(obj?.id))) {
      window.alert("Нет права создавать сметы.");
      return;
    }
    const lines = (r?.lines || []).filter(l => l && Number(l.doneQty) > 0);
    if (!lines.length) { window.alert("В акте нет позиций для восстановления."); return; }
    if (r.estId && estimatesRef.current.some(e => e.id === r.estId)) {
      window.alert("Смета этого акта уже есть в архиве — восстановление не требуется."); return;
    }
    if (!window.confirm(`Восстановить смету из «Акт №${r.actNo || "б/н"}»?\n\nПозиций: ${lines.length} · Сумма: ${fmt(r.total || 0)} ₸\n\nБудет создана новая смета и привязана к этому объекту. Цены берутся из акта (наценка 0). Существующие данные не изменятся.`)) return;

    const stamp = Date.now();
    const codeOf = (i) => `AVR-${r.id || stamp}-${i}`;
    // Позиции хранятся ПРЯМО в смете (наименование/ед./цена/кол-во) как «сиротские» строки —
    // они показываются в виртуальной категории EXTRA_CAT только этой сметы и НЕ засоряют общий каталог.
    const rows = {};
    lines.forEach((l, i) => { rows[codeOf(i)] = { qty: Number(l.doneQty) || 0, manualPrice: Number(l.price) || 0, manualName: l.name || "", manualUnit: l.unit || "" }; });

    // 3) Сама смета — привязана к объекту, наценка 0 (цены уже финальные)
    const estId = genId();
    const est = {
      id: estId, objectId: obj.id,
      proj: { name: obj.clientName || "", phone: obj.clientPhone || "", address: obj.address || "", type: obj.objType || "Вторичка", area: obj.area || "", manager: obj.manager || currentUser?.name || "" },
      rows, discount: 0, markup: 0,
      note: `Восстановлено из Акт №${r.actNo || "б/н"} от ${new Date(r.actDate || r.createdAt || Date.now()).toLocaleDateString("ru-RU")}`,
      status: "new", total: Number(r.total) || 0,
      createdAt: r.createdAt || Date.now(), createdBy: r.createdBy || currentUser?.name || "",
      updatedAt: Date.now(), updatedBy: currentUser?.name || "",
    };
    await saveEstimates([...estimatesRef.current, est]);
    // привяжем акт к новой смете, чтобы повторно не пересоздавать
    await saveReports([{ ...r, estId, updatedAt: Date.now() }], { replace: false });
    window.alert(`Смета восстановлена ✓\nПозиций: ${lines.length} · Сумма: ${fmt(r.total || 0)} ₸\n\nОна появилась в карточке объекта в разделе «Сметы».`);
  };

  // ════════════ ДОГОВОР ПОДРЯДА С РАБОЧИМИ (Прочие документы) ════════════
  // Сумма раздела: ручная сумма за раздел ИЛИ сумма позиций (кол-во × цена)
  const podSectionSum = (sec) => {
    if (sec.lumpSum !== "" && sec.lumpSum != null) return Number(sec.lumpSum) || 0;
    return (sec.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  };
  const podTotal = (m) => {
    if (m.manualTotal !== "" && m.manualTotal != null) return Number(m.manualTotal) || 0;
    return (m.sections || []).reduce((s, sec) => s + podSectionSum(sec), 0);
  };
  // Открыть построитель договора подряда / приложения
  const openPodryadBuilder = ({ kind = "podryad", obj = null, est = null, mainNumber = "", mainDate = "", preset = null } = {}) => {
    if (preset) { setPodryadModal({ ...preset, sections: (preset.sections || []).map(s => ({ ...s, items: (s.items || []).map(i => ({ ...i })) })) }); return; }
    let sections;
    if (est) {
      const lines = buildAvrLinesFromEst(est);
      sections = [{ title: "", lumpSum: "", items: lines.map(l => ({ name: l.name, qty: l.qty, unit: l.unit, price: "" })) }];
    } else {
      sections = [{ title: "", lumpSum: "", items: [{ name: "", qty: "", unit: "", price: "" }] }];
    }
    const podCount = podryadsRef.current.filter(p => p.kind === "podryad").length;
    const annexCount = podryadsRef.current.filter(p => p.kind === "annex").length;
    setPodryadModal({
      id: null, kind,
      number: kind === "podryad" ? String(1012 + podCount) : (mainNumber || ""),
      annexNo: kind === "annex" ? String(2 + annexCount) : "",
      mainNumber, mainDate,
      date: new Date().toISOString().slice(0, 10), city: "Караганда",
      workerId: "", worker: { name: "", iin: "", doc: "", docIssuer: "Выдан МВД РК", address: "", phone: "", email: "" },
      contragentId: contragentsRef.current[0]?.id || "",
      objectId: obj?.id || "", objectAddress: obj?.address || "",
      format: kind === "annex" ? "sections" : "table",
      sections, manualTotal: "", avans: "", termDays: "", withStamp: false,
    });
  };
  const savePodryad = async (m) => {
    const id = m.id || genId();
    const record = { ...m, id, total: podTotal(m), createdAt: m.createdAt || Date.now(), updatedAt: Date.now(), createdBy: m.createdBy || currentUser?.name || "" };
    const cur = podryadsRef.current;
    const next = cur.some(p => p.id === id) ? cur.map(p => p.id === id ? record : p) : [record, ...cur];
    await savePodryads(next, { replace: true });
    return record;
  };
  // HTML договора подряда / приложения (юридический текст — дословно из утверждённых образцов)
  const buildPodryadHtml = (m) => {
    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const money = n => Math.round(Number(n) || 0).toLocaleString("ru-RU");
    const ca = m.__templateCompany || contragentsRef.current.find(c => c.id === m.contragentId) || contragentsRef.current[0] || {};
    const w = m.worker || {};
    const dt = m.date ? new Date(m.date) : new Date();
    const dd = String(dt.getDate()).padStart(2, "0"), mm = String(dt.getMonth() + 1).padStart(2, "0"), yy = dt.getFullYear();
    const total = podTotal(m);
    const stampBlock = m.withStamp ? `<div style="margin-top:-6px"><img src="${window.location.origin}/${esc(ca.stampFile||"stamp.jpg")}" alt="Печать" style="width:230px;height:230px;object-fit:contain;opacity:.85;mix-blend-mode:multiply"/></div>` : "";
    // Реквизиты — в два столбца: слева Заказчик (наше ТОО), справа Подрядчик; печать — под подписью директора (не на тексте)
    const zakBody = `<p class="b">Заказчик:</p>
<p>${esc(ca.name || 'ТОО "TITOVSTROY"')}<br/>БИН ${esc(ca.bin || "231040002769")}<br/>Банк: ${esc(ca.bank || 'АО "Kaspi Bank"')}<br/>БИК: ${esc(ca.bik || "CASPKZKA")}<br/>Номер счёта: ${esc(ca.account || "KZ38722S000030058973")}<br/>Юр.Адрес: ${esc(ca.address || "Казахстан, улица Кирпичная, дом 8г")}<br/>Тел.: ${esc(ca.phone || "8707 667 8766")}<br/>Email: ${esc(ca.email || "titovstroy@mail.ru")}<br/>Генеральный директор:</p>
<p>${esc(ca.director || "________")}  ______________ М.П.</p>${stampBlock}`;
    const podBody = `<p class="b">Подрядчик:</p>
<p>ФИО: ${esc(w.name || "___________________")}<br/>ИИН: ${esc(w.iin || "___________")}<br/>№ документа: ${esc(w.doc || "___________")}<br/>Адрес: ${esc(w.address || "")}<br/>Тел.: ${esc(w.phone || "")}<br/>Почта: ${esc(w.email || "")}<br/>Подпись ___________</p>`;
    const reqBlock = `<table class="req"><tr><td>${zakBody}</td><td>${podBody}</td></tr></table>`;
    // Перечень работ — таблица (как Прил.1) или разделы (как Прил.2)
    const worksBlock = (() => {
      if ((m.format || "table") === "sections") {
        return (m.sections || []).map(sec => {
          const items = (sec.items || []).filter(i => (i.name || "").trim());
          const lines = items.map(i => `<p style="margin:1pt 0">- ${esc(i.name)}${i.qty ? ` — ${esc(i.qty)} ${esc(i.unit || "")}` : ""}${(i.price !== "" && i.price != null) ? ` — ${money(i.price)} ₸` : ""}</p>`).join("");
          return `<p class="b" style="margin-top:8pt">${esc(sec.title || "Работы")}:</p>${lines}<p class="b">Стоимость работ: ${money(podSectionSum(sec))} ₸</p>`;
        }).join("");
      }
      // табличный формат. В режиме «за объём» (showLinePrice) — колонки Цена + Сумма (как в редакторе)
      let n = 0;
      const rows = (m.sections || []).flatMap(sec => (sec.items || [])).filter(i => (i.name || "").trim()).map(i => {
        n++;
        const price = Number(i.price) || 0, qty = Number(i.qty) || 0;
        return `<tr><td class="tc">${n}</td><td>${esc(i.name)}</td><td class="tc">${esc(i.qty || "")}</td><td class="tc">${esc(i.unit || "")}</td>${m.showLinePrice ? `<td class="tr">${i.price !== "" && i.price != null ? money(price) : ""}</td><td class="tr">${i.price !== "" && i.price != null ? money(price * qty) : ""}</td>` : ""}</tr>`;
      }).join("");
      return `<table><thead><tr><th style="width:32px">№</th><th>Наименование работ</th><th style="width:60px">Объём</th><th style="width:50px">Ед.</th>${m.showLinePrice ? '<th style="width:88px">Цена, ₸</th><th style="width:100px">Сумма, ₸</th>' : ""}</tr></thead><tbody>${rows}</tbody></table>`;
    })();
    const CSS = `*{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Verdana,Geneva,Tahoma,sans-serif;padding:18mm 14mm 18mm 22mm;line-height:1.5;color:#000;font-size:10pt}
  p{margin:3pt 0;text-align:justify}.b{font-weight:bold}.c{text-align:center}
  h1{font-size:13pt;text-align:center;margin:8pt 0 2pt}.sub{text-align:center;margin-bottom:8pt}
  .s{font-weight:bold;text-align:center;margin:10pt 0 4pt}
  table{width:100%;border-collapse:collapse;margin:6pt 0;font-size:9pt;table-layout:fixed}
  th,td{border:1px solid #000;padding:3pt 5pt;word-wrap:break-word}
  th{background:#e5e7eb;font-weight:bold;text-align:center;font-size:9pt}.tc{text-align:center}.tr{text-align:right}
  table.req{table-layout:fixed;margin-top:10pt}
  table.req td{border:none;width:50%;vertical-align:top;padding:0 14pt 0 0;font-size:9pt}
  .pb{page-break-before:always}
  .np{margin-top:20px;text-align:center}
  @media print{.np{display:none}@page{size:A4;margin:0}body{padding:12mm 12mm 12mm 18mm}tr{page-break-inside:avoid}}`;
    // Тело главного договора (kind==="podryad") — дословный юр-текст
    const mainBody = m.kind !== "podryad" ? "" : `
<h1>Договор подряда №${esc(m.number || "____")}<br/>на выполнение ремонтно-отделочных работ</h1>
<p class="c">г. ${esc(m.city || "Караганда")} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "${dd}" ${["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"][dt.getMonth()]} ${yy} г.</p>
<p>${esc(w.name || "___________________")} ИИН ${esc(w.iin || "___________")}, № документа: ${esc(w.doc || "___________")}., ${esc(w.docIssuer || "Выдан МВД РК")}, (далее - "подрядчик") с одной стороны, и ${esc(ca.name || "ТОО TITOVSTROY")}, БИН ${esc(ca.bin || "231040002769")} (далее - "заказчик"), в лице директора ${esc(ca.directorFull || ca.director || "________")}, действующего на основании Устава, с одной стороны, совместно именуемые "Стороны", а по отдельности – "Сторона", заключили настоящий Договор о нижеследующем:</p>
<p class="s">1. Предмет договора</p>
<p>1.1. Подрядчик обязуется выполнить по заданию Заказчика работу, и сдать ее результат Заказчику, а Заказчик обязуется принять результат работы и оплатить его. Подробный перечень работ, сроки их выполнения, стоимость и иные условия указываются в Приложении №1 к настоящему договору, которое является его неотъемлемой частью. В случае противоречий между условиями договора и Приложения — применяются условия Приложения.</p>
<p>1.3. Работу Подрядчик выполняет на своем оборудовании и своими инструментами, если иное не оговорено и не утверждено сторонами с отметкой в приложение №1</p>
<p>1.4. Срок выполнения работ с указывается в приложение №1, Любые дополнительные работы выполняются на основании дополнительного соглашения сторон</p>
<p>1.4.1. Подрядчик не вправе привлекать третьих лиц без письменного согласия Заказчика.</p>
<p>1.4.2. Подрядчик обязуется не изменять объем и характер работ без предварительного письменного согласования с Заказчиком. Все изменения фиксируются в дополнительном соглашении или обновлённом Приложении №1.”</p>
<p>1.4.3. Работа считается выполненной после подписания акта приема-сдачи Работы Заказчиком или его уполномоченным представителем.</p>
<p class="s">2. Права и обязанности сторон</p>
<p>2.1. Подрядчик обязан:</p>
<p>2.1.1. Выполнить Работу с надлежащим качеством.</p>
<p>2.1.2. Соблюдать нормы СНиП, технику безопасности и правила работы на объекте.</p>
<p>2.1.3. Подрядчик несёт ответственность за сохранность переданного ему инструмента, материалов и имущества Заказчика.</p>
<p>2.1.4. В случае порчи имущества или оборудования, Подрядчик обязан возместить ущерб в полном объёме.</p>
<p>2.1.5. Подрядчик обязуется не покидать объект до подписания акта приёмки работ или письменного разрешения Заказчика.</p>
<p>2.1.6. Выполнить Работу в срок, указанный в приложение №1 настоящего договора.</p>
<p>2.1.7. Передать результат Работы Заказчику.</p>
<p>2.1.8. Безвозмездно исправить по требованию Заказчика все выявленные недостатки, если в процессе выполнения Работы Подрядчик допустил отступление от условий договора, ухудшившее качество Работы, в течение 3 дней, если иное не оговорено сторонами.</p>
<p>2.1.9. Подрядчик обязан выполнить Работу лично.</p>
<p>2.1.10. В случае выявления дефектов в период гарантийного срока (12 месяцев), Подрядчик обязан устранить их за свой счет в течение 3 рабочих дней, если иное не оговорено сторонами.</p>
<p>2.1.11. Ежедневно отправлять фото- или видеоотчет о ходе работ.</p>
<p>2.1.12. Подрядчик несёт ответственность за действия привлеченных им работников и подрядчиков, если иное не согласовано письменно с Заказчиком.</p>
<p>2.1.13. На объекте запрещено употребление алкоголя, нахождение в состоянии опьянения и курение в неположенных местах. Нарушение — основание для расторжения договора и штраф 50 000 тг.</p>
<p>2.2. Подрядчик имеет право:</p>
<p>2.3. Заказчик обязан:</p>
<p>2.3.1. В течение 7 рабочих дней после получения от Подрядчика извещения об окончании Работы либо по истечении срока, указанного в п. 1.4 настоящего договора, осмотреть и принять результат Работы, а при обнаружении отступлений от договора, ухудшающих результат Работы, или иных недостатков в Работе немедленно заявить об этом Подрядчику.</p>
<p>2.3.2. Оплатить Работу по цене, указанной в приложение №1 настоящего договора, в течение 3 банковских дней с момента приемки результатов Работы.</p>
<p>2.4. Заказчик имеет право:</p>
<p>2.4.1. Во всякое время проверять ход и качество Работы, выполняемой Подрядчиком, не вмешиваясь в его деятельность.</p>
<p class="s">3. Цена договора и порядок расчетов</p>
<p>3.1. Цена и порядок оплаты указываются в Приложении №1. Любые дополнительные работы выполняются на основании дополнительного соглашения сторон.</p>
<p>3.2. Оплата производится по факту выполнения и приемки этапа работ.</p>
<p>3.3. Предоплата не допускается, если иное не оговорено сторонами.</p>
<p>3.4. При выявлении некачественно выполненных работ Заказчик вправе уменьшить сумму оплаты пропорционально качеству выполненного.</p>
<p>3.5. Уплата Заказчиком Подрядчику цены договора осуществляется путем перечисления средств на счет подрядчика и/или наличными, в течение 4 банковских дней после выполнения Подрядчиком Работ в полном объеме, на основании Акта выполненных Работ и предоставления Подрядчиком надлежащим образом оформленного счета на оплату.</p>
<p class="s">4. Ответственность сторон</p>
<p>4.1. Подрядчик несет полную материальную ответственность за ущерб, причиненный Заказчику вследствие некачественного выполнения работ, несоблюдения сроков или повреждения имущества на объекте.</p>
<p>4.2. За нарушение сроков выполнения работ — штраф 2,5% от суммы этапа за каждый день просрочки.</p>
<p>4.3. За отказ от устранения брака — штраф 10% от суммы договора.</p>
<p>4.4. Все удержания производятся из суммы, подлежащей оплате подрядчику.</p>
<p>4.3. Меры ответственности сторон, не предусмотренные в настоящем договоре, применяются в соответствии с нормами действующего законодательства Республики Казахстан.</p>
<p>4.4. Уплата неустойки не освобождает стороны от выполнения лежащих на них обязательств или устранения нарушений.</p>
<p>4.5. Гарантийный срок на выполненные работы составляет 12 месяцев с даты подписания акта приемки.</p>
<p>4.6. Подрядчику запрещается вести переговоры с клиентами Заказчика напрямую, принимать оплату в обход Заказчика, оставлять свои контакты на объекте или использовать бренд Заказчика в личных целях. Нарушение — штраф 500 000 тг.</p>
<p>4.7. Подрядчик несёт ответственность за качество выполненных работ, включая скрытые дефекты, выявленные в течение гарантийного срока.</p>
<p>4.8. При невыполнении или ненадлежащем исполнении обязательств Заказчик имеет право привлечь третьих лиц для устранения недостатков с последующим удержанием стоимости таких работ из суммы, подлежащей выплате Подрядчику</p>
<p>4.9. Подрядчик обязуется не использовать коммерческую информацию, фотографии и материалы объектов Заказчика без письменного разрешения.</p>
<p>4.10. Подрядчик обязуется не принимать заказы от клиентов Заказчика в течение 6 месяцев после окончания работ.</p>
<p class="s">5. Обстоятельства непреодолимой силы</p>
<p>5.1. Стороны несут ответственность за неисполнение, а также ненадлежащее исполнение обязательств по настоящему Договору, в соответствии с законодательством Республики Казахстан и Договором. Ни одна из Сторон не несет ответственность за неисполнение, либо ненадлежащее исполнение каких-либо обязательств по Договору, если такое неисполнение или ненадлежащее исполнение вызвано обстоятельствами непреодолимой силы, которые Сторона не могла ни предвидеть, ни предотвратить разумными мерами.</p>
<p>5.2. К обстоятельствам непреодолимой силы Стороны относят: наводнения, пожары, войны, революции, национализации, изъятия для государственных нужд, издания нормативных правовых или иных обязательных к исполнению актов. Обстоятельствами непреодолимой силы не являются любые действия, вызванные небрежностью или виной Сторон, их уполномоченных лиц, сотрудников, агентов, а также аффилированных лиц.</p>
<p>5.3. В случае возникновения обстоятельств непреодолимой силы, Сторона, подвергшаяся их воздействию, незамедлительно уведомляет об этом другую Сторону в течение 2-х суток, путем вручения либо отправкой по почте письменного уведомления, уточняющего дату начала и описание обстоятельств или сообщения по факсимильной связи или по электронной почте с одного из адресов электронной почты, указанных в Договоре. В случае, если обстоятельства непреодолимой силы препятствуют отправлению такого уведомления, оно должно быть отправлено в рабочий день, следующий за днем окончания воздействия обстоятельств непреодолимой силы.</p>
<p>5.4. Срок исполнения обязательств Сторон по Договору приостанавливается на срок действия обстоятельств непреодолимой силы и возобновляется с даты их прекращения. Соответственно, настоящим Стороны подтверждают, что без дополнительного соглашения между Сторонами, обстоятельства непреодолимой силы не прекращают обязательства Сторон по Договору, а лишь приостанавливают сроки для их исполнения и по окончании воздействия обстоятельств непреодолимой силы Стороны продолжат исполнение обязательств по Договору в соответствии и на условиях, изложенных в нем.</p>
<p>5.5. Доказательством наличия обстоятельств непреодолимой силы служит свидетельство, выданное компетентным органом, организацией, авиаперевозчиком, транспортной организацией. В случае, если наличие обстоятельств непреодолимой силы общеизвестно, Стороны освобождаются от обязанности доказывания их воздействия.</p>
<p>5.6. В случае действия обстоятельств непреодолимой силы в течение 30 (тридцати) суток, любая из Сторон вправе расторгнуть настоящий Договор с обязательным предварительным проведением взаиморасчетов за фактически оказанные услуги, но без обязанностей по возмещению возможных убытков другой Стороны. При воздействии обстоятельств непреодолимой силы Стороны, по возможности, препятствуют разглашению конфиденциальной информации. В случае если разглашение все же произошло, Сторона должна сообщить об этом факте другой Стороне в кратчайший срок, в противном случае не уведомившая о разглашении конфиденциальной информации Сторона несет ответственность без учета воздействия обстоятельств непреодолимой силы.</p>
<p class="s">6. Порядок разрешения споров</p>
<p>6.1. Споры и разногласия, которые могут возникнуть при исполнении настоящего договора, будут по возможности разрешаться путем переговоров между сторонами.</p>
<p>6.2. В случае невозможности разрешения споров путем переговоров все споры, разногласия или требования, возникающие из настоящего контракта (договора) либо в связи с ним, в том числе касающиеся его нарушения, прекращения или недействительности подлежат окончательному урегулированию в суде по месту нахождения Заказчика, претензионный порядок обязателен. Срок рассмотрения претензии — 5 (пять) календарных дней</p>
<p class="s">7. Заключительные положения</p>
<p>7.1. Любые изменения и дополнения к настоящему договору действительны лишь при условии, что они совершены в письменной форме и подписаны уполномоченными на то представителями сторон. Приложения к настоящему договору составляют его неотъемлемую часть.</p>
<p>7.2. Настоящий договор составлен в двух экземплярах на русском языке. Оба экземпляра идентичны и имеют одинаковую силу. У каждой из сторон находится один экземпляр настоящего договора.</p>
<p>7.3. В случае расторжения договора по инициативе одной из сторон, стороны обязуются произвести взаиморасчёты за фактически выполненные и принятые работы. Договор считается расторгнутым после подписания сторонами соглашения о расторжении.</p>
<p>7.4. Договор вступает в силу с даты подписания Сторонами и действует в течение 1 года, а в части взаиморасчетов и предоставления гарантии – до их полного завершения.</p>
<p>7.5. Настоящий Договор подписан в двух экземплярах, по одному для каждой Стороны. Экземпляры идентичны и имеют равную юридическую силу.</p>
<p class="s">8. Юридические адреса сторон и банковские реквизиты</p>
${reqBlock}`;
    // Приложение (для kind==="podryad" — №1 в составе договора; для kind==="annex" — отдельный документ)
    const annexNo = m.kind === "podryad" ? "1" : (m.annexNo || "");
    const annexRefNo = m.kind === "podryad" ? m.number : (m.mainNumber || "");
    const annexRefDate = m.kind === "podryad" ? `«${dd}» ${mm}.${yy} г.` : (m.mainDate ? (() => { const d = new Date(m.mainDate); return `«${String(d.getDate()).padStart(2, "0")}» ${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} г.`; })() : "«__» __.____ г.");
    const annexBody = `
<h1${m.kind === "podryad" ? ' class="pb"' : ""}>Приложение №${esc(annexNo)}${m.kind === "annex" ? ` от ${dd}.${mm}.${yy}` : ""}<br/>Перечень этапов, видов и стоимость работ</h1>
<p class="sub">к Договору ремонтно-отделочных работ № ${esc(annexRefNo || "____")} от ${annexRefDate}</p>
<p class="b">Общие положения</p>
<p>1.1. Настоящее Приложение является неотъемлемой частью Договора ремонтно-отделочных работ и определяет этапы, виды и стоимость работ, выполняемых Подрядчиком на Объекте.</p>
<p class="b">Перечень этапов и видов работ</p>
<p>Ниже приведен перечень этапов и видов работ, их объемы, сроки выполнения и стоимость</p>
${worksBlock}
<p>2.1. Адрес проведения работ: ${esc(m.objectAddress || "___________________")}</p>
<p class="b">Условия выполнения работ</p>
<p>3.1. В стоимость Работ могут входить расходы Подрядчика на материалы, оборудование, доставку и иные затраты, необходимые для выполнения Работ, если иное прямо указано в договоре.</p>
<p>3.2. Работы выполняются поэтапно в соответствии с указанными сроками.</p>
<p>3.3. Любые дополнительные работы, не предусмотренные настоящим Приложением, выполняются на основании дополнительного соглашения сторон с корректировкой стоимости и сроков.</p>
<p class="b">Порядок оплаты</p>
<p>4.1. Оплата за работы (за исключением предоплаты) производится поэтапно на основании актов выполненных работ (форма КС-2) в течение 3 банковских дней после подписания акта.</p>
${(m.avans !== "" && m.avans != null && Number(m.avans) > 0) ? `<p>4.2. Заказчик оплачивает подрядчику аванс в размере ${money(m.avans)} тг, аванс является возвратным в случае если подрядчик не приступил к выполнению работ в день получения или на следующий день после получения авансового платежа.</p>` : ""}
<p class="b">Общая стоимость работ составляет ${money(total)} ₸</p>
${(m.termDays !== "" && m.termDays != null) ? `<p class="b">Срок выполнения работ составляет ${esc(m.termDays)} календарных дней</p>` : ""}
${reqBlock}`;
    // Название документа (как у договора: номер + подрядчик + дата) — от него зависит имя
    // файла при сохранении/печати в PDF, у голого «Приложение №2» не разобрать, к чему оно.
    const docTitle = (m.kind === "annex"
      ? "Приложение №" + (m.annexNo || "") + (w.name ? " " + w.name : "") + " к Договору №" + (m.mainNumber || "") + " от " + dd + "." + mm + "." + yy
      : "Договор подряда №" + (m.number || "") + (w.name ? " " + w.name : "") + " от " + dd + "." + mm + "." + yy
    ).replace(/[<>:"/\\|?*]/g, "_");
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(docTitle)}</title><style>${CSS}</style></head><body>${mainBody}${annexBody}
<div class="np"><button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:Arial,sans-serif">🖨 Печать / Сохранить PDF</button></div>
</body></html>`;
  };
  // upsert одной производственной карточки (ключ — objectId)
  // Удаление карточки — командой (идемпотентно, атомарно).
  const onDeleteProduction = useCallback((objectId) => {
    return mutateProductions({ type: "delete-production", objectId, changeId: "bg_del_" + objectId });
  }, [mutateProductions]);

  // ── ДОСТУП КЛИЕНТА К ПРОГРЕССУ (публичная ссылка #/progress/<токен>) ──
  const prodEntriesRef = useRef([]);
  useEffect(() => { prodEntriesRef.current = prodEntries; }, [prodEntries]);
  // Собрать ОЧИЩЕННЫЙ снимок для клиента (без себестоимости/маржи/подрядчиков/внутренних заметок)
  const buildProgressSnapshot = useCallback((objectId, prev = {}) => {
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj) return null;
    const prod = productionsRef.current.find(p => p.objectId === objectId) || {};
    const entry = (prodEntriesRef.current || []).find(e => e.objectId === objectId);
    const stages = (prod.stages || []).filter(st => st && String(st.name || "").trim());
    let doneCnt = 0;
    for (const st of stages) { if ((st.status || "todo") === "done") doneCnt++; }
    // Готовность считаем ТАК ЖЕ, как в производстве: доля выполненных этапов (по количеству)
    const progressPct = stages.length > 0 ? Math.round(doneCnt / stages.length * 100) : 0;
    const handover = (prod.checklistHandover || []).filter(i => (i.section || "") === "Клиентская приёмка").map(i => ({ text: i.text, done: !!i.done }));
    const budget = Number(entry?.budget) || 0, paid = Number(entry?.income) || 0;
    // Статус замечаний клиента подтягиваем из дефектов производства (по clientRemarkId)
    const defectDone = {};
    for (const d of (prod.defects || [])) { if (d.clientRemarkId) defectDone[d.clientRemarkId] = !!d.done; }
    const clientRemarks = (Array.isArray(prev.clientRemarks) ? prev.clientRemarks : []).map(rm => ({
      id: rm.id, text: rm.text, ts: rm.ts, done: (rm.id in defectDone) ? defectDone[rm.id] : !!rm.done,
    }));
    // Общее сообщение от компании клиенту (пишется в производстве)
    const cm = prod.clientMessage;
    const clientMessage = (cm && typeof cm === "object" && String(cm.text || "").trim())
      ? { text: String(cm.text).trim(), updatedAt: cm.updatedAt || null }
      : (typeof cm === "string" && cm.trim() ? { text: cm.trim(), updatedAt: null } : null);
    // Настройки видимости для клиента (по умолчанию всё включено). Скрытые разделы НЕ
    // просто прячутся в интерфейсе — их данные вообще не кладём в снимок, чтобы не утекли
    // даже при прямом чтении ноды.
    const cv = obj.clientVis || {};
    const showPay = cv.payments !== false, showStages = cv.stages !== false, showRemarks = cv.remarks !== false, showDocs = cv.docs !== false;
    // Индивидуальные ОПЛАТЫ клиента (только доходные операции по договорам объекта) — для «Истории».
    // Только когда оплаты разрешены к показу. Себестоимость/расходы/подрядчики сюда НЕ попадают —
    // берём исключительно income-транзакции, привязанные к номерам договоров этого объекта.
    let payments = [];
    if (showPay) {
      try {
        const objCNs = new Set((contractsRef.current || []).filter(c => c.objectId === objectId).map(c => normCN(c.number || c.contractNo || "")).filter(Boolean));
        if (objCNs.size) payments = (financeTxRef.current || [])
          .filter(t => t && !t.deletedAt && t.type === "income" && t.contractNo && objCNs.has(normCN(t.contractNo)))
          .map(t => ({ date: t.date || t.createdAt || null, amount: Math.round(Number(t.amount) || 0) }))
          .filter(p => p.amount > 0);
      } catch {}
    }
    return {
      v: 2, objectAddress: obj.address || "", clientName: obj.clientName || "", managerName: obj.manager || "",
      startDate: prod.startDate || "", planEndDate: prod.planEndDate || "", factEndDate: prod.factEndDate || "",
      progressPct, doneStages: doneCnt, totalStages: stages.length,
      // vis — что показывать клиенту (публичная страница читает эти флаги)
      vis: { payments: showPay, docs: showDocs, stages: showStages, remarks: showRemarks },
      stages: showStages ? stages.map(st => ({ name: st.manualName || st.name || "Этап", cat: st.cat || "Работы", status: st.status || "todo", planEnd: st.planEnd || "", factEnd: st.factEnd || "", priceClient: Number(st.priceClient) || 0 })) : [],
      payment: showPay ? { budget, paid, remaining: Math.max(0, budget - paid) } : null,
      payments: showPay ? payments : [],
      handover, clientRemarks: showRemarks ? clientRemarks : [], clientMessage,
      // Срок жизни ссылки — жёстко зафиксирован в объекте при включении доступа (не продлевается
      // здесь автоматически: buildProgressSnapshot вызывается и фоновой минутной republish'ей).
      expiresAt: obj.progressExpiresAt || null,
      publishedAt: Date.now(), viewCount: prev.viewCount || 0, viewedAt: prev.viewedAt || null,
    };
  }, []);
  const publishProgress = useCallback(async (objectId) => {
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj || !obj.progressShared || !obj.progressToken) return;
    const showRemarks = (obj.clientVis || {}).remarks !== false;
    // Замечания СКРЫТЫ клиенту → сначала заберём уже присланные замечания в производство,
    // чтобы они не потерялись, ПЕРЕД тем как вычистить их из публичной ноды.
    if (!showRemarks) { try { await syncRemarksRef.current?.(objectId); } catch {} }
    let prev = {};
    try { const r = await storage.getResult(PROGRESS_NODE(obj.progressToken)); if (r.status === "found" && r.value) prev = JSON.parse(r.value); } catch {}
    const snap = buildProgressSnapshot(objectId, prev);
    if (!snap) return;
    if (showRemarks) {
      // Клиент мог отправить замечание прямо в эту ноду, пока мы считали снимок (submitRemark
      // тоже пишет всю ноду целиком) — без этой подстраховки republish затёр бы его. Перед
      // записью перечитываем ноду ещё раз и добираем замечания, которых не было в prev.
      try {
        const r2 = await storage.getResult(PROGRESS_NODE(obj.progressToken));
        if (r2.status === "found" && r2.value) {
          const fresh = JSON.parse(r2.value);
          const freshRemarks = Array.isArray(fresh.clientRemarks) ? fresh.clientRemarks : [];
          const known = new Set((snap.clientRemarks || []).map(rm => rm.id));
          const missing = freshRemarks.filter(rm => rm.id && !known.has(rm.id)).map(rm => ({ id: rm.id, text: rm.text, ts: rm.ts, done: !!rm.done }));
          if (missing.length) snap.clientRemarks = [...snap.clientRemarks, ...missing];
        }
      } catch {}
    } else {
      // Раздел «Замечания» скрыт — в публичной ноде замечаний быть НЕ должно даже в сыром JSON.
      // (buildProgressSnapshot уже ставит [], но подстраховываемся явно — чтобы re-read их не вернул.)
      snap.clientRemarks = [];
    }
    try { await storage.set(PROGRESS_NODE(obj.progressToken), JSON.stringify(snap)); } catch (e) { console.warn("publishProgress err", e); }
  }, [buildProgressSnapshot]);
  const publishProgressRef = useRef(); publishProgressRef.current = publishProgress;
  const _publishDocsRef = useRef(null); // назначается ниже (после генераторов договоров/актов)
  // Забрать замечания клиента из ноды прогресса и завести их в «Замечания» производства (с пометкой «от клиента»)
  const syncClientRemarks = useCallback(async (objectId) => {
    // ТАБУ владельца: авто-импорт замечаний ПИШЕТ в производство (create + defects) без действия
    // владельца — на боевой выключен до отдельной приёмки. Если владелец решит, что это нужное
    // бизнес-исключение из табу — гейт снимается осознанно одной строкой.
    if (!IS_DEV_ENV) return;
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj || !obj.progressShared || !obj.progressToken) return;
    let node = {};
    try { const r = await storage.getResult(PROGRESS_NODE(obj.progressToken)); if (r.status === "found" && r.value) node = JSON.parse(r.value); } catch {}
    const remarks = Array.isArray(node.clientRemarks) ? node.clientRemarks : [];
    if (!remarks.length) return;
    const prod = productionsRef.current.find(p => p.objectId === objectId) || null;
    // Готовим замечания-кандидаты (id стабильный — сам clientRemarkId, чтобы повтор синка был
    // идемпотентен). Дедуп по clientRemarkId делается ВНУТРИ транзакции (merge-client-remarks),
    // поэтому параллельная правка дефектов с другого устройства не затирается.
    const cand = remarks.filter(rm => rm.id).map(rm => ({ id: "cr_" + rm.id, text: rm.text || "", done: false, ts: rm.ts || Date.now(), author: "Клиент", source: "client", clientRemarkId: rm.id }));
    if (!cand.length) return;
    if (!prod) await mutateProductions({ type: "create-if-missing", objectId, record: emptyProduction(objectId, genId), changeId: "bg_remarks_create_" + objectId });
    await mutateProductions({ type: "merge-client-remarks", objectId, remarks: cand, changeId: "bg_remarks_" + objectId });
  }, [genId, mutateProductions]);
  const syncRemarksRef = useRef(); syncRemarksRef.current = syncClientRemarks;
  // Доступ реально ещё активен (включён и срок 60 дней не истёк). Раньше срок проверялся
  // только на клиентской странице (косметически) — сама нода в базе продолжала жить и
  // обновляться фоновой republish'ей вечно, то есть по прямому запросу к базе с истёкшим
  // токеном данные оставались доступны. Теперь фоновые публикации тоже проверяют срок.
  const _progActive = (o) => !!(o.progressShared && o.progressToken && (!o.progressExpiresAt || Date.now() <= o.progressExpiresAt));
  // Отозвать доступ (ручной revoke или истёкший срок) — гасим обе ноды, не только PROGRESS_NODE,
  // иначе документы клиента (DOCS_NODE) остаются читаемы по старому токену бессрочно.
  const _revokeProgressAccess = useCallback(async (token) => {
    try { await storage.set(PROGRESS_NODE(token), JSON.stringify({ revoked: true })); } catch {}
    try { await storage.set(DOCS_NODE(token), JSON.stringify({ revoked: true })); } catch {}
  }, []);
  // Опрос замечаний клиента раз в минуту (клиент пишет прямо в ноду — производственных событий нет)
  useEffect(() => {
    const tick = () => {
      objectsRef.current.filter(o => o.progressShared && o.progressToken).forEach(async o => {
        // Срок истёк — гасим доступ насовсем вместо очередной republish'и (иначе «истёк» был
        // бы виден только в интерфейсе, а сама нода продолжала бы обновляться в базе).
        if (o.progressExpiresAt && Date.now() > o.progressExpiresAt) {
          try { await saveObjects([...objectsRef.current.filter(x => x.id !== o.id), { ...o, progressShared: false, updatedAt: Date.now() }]); } catch {}
          try { await _revokeProgressAccess(o.progressToken); } catch {}
          return;
        }
        try { await syncRemarksRef.current?.(o.id); } catch {}
        try { await publishProgressRef.current?.(o.id); } catch {}
        try { await _publishDocsRef.current?.(o.id); } catch {}
      });
    };
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [saveObjects, _revokeProgressAccess]);
  // Включить/выключить доступ клиента; возвращает ссылку (или null при выключении)
  const toggleClientShare = useCallback(async (objectId) => {
    if (!accessAllows(currentPermissions.productionClientAccess, estimatorObjectIds.has(objectId))) return null;
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj) return null;
    const linkOf = t => window.location.origin + window.location.pathname + "#/progress/" + t;
    if (obj.progressShared && obj.progressToken) {
      const token = obj.progressToken;
      await saveObjects([...objectsRef.current.filter(o => o.id !== objectId), { ...obj, progressShared: false, updatedAt: Date.now() }]);
      await _revokeProgressAccess(token);
      logChange(currentUser, { entity: "publish", entityId: objectId, objectId, label: _objLabel(obj), action: "закрыл доступ клиенту" });
      return null;
    }
    const token = obj.progressToken || (genId() + Math.random().toString(36).slice(2, 10));
    // Срок жизни ссылки — жёстко 60 дней с момента включения доступа (не продлевается
    // автоматической фоновой republish'ю). Повторное включение задаёт свежий срок.
    const progressExpiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;
    await saveObjects([...objectsRef.current.filter(o => o.id !== objectId), { ...obj, progressShared: true, progressToken: token, progressExpiresAt, updatedAt: Date.now() }]);
    const snap = buildProgressSnapshot(objectId, {});
    if (snap) { try { await storage.set(PROGRESS_NODE(token), JSON.stringify(snap)); } catch {} }
    try { await _publishDocsRef.current?.(objectId); } catch {}
    logChange(currentUser, { entity: "publish", entityId: objectId, objectId, label: _objLabel(obj), action: "открыл доступ клиенту" });
    return linkOf(token);
  }, [saveObjects, buildProgressSnapshot, _revokeProgressAccess, currentPermissions.productionClientAccess, estimatorObjectIds]);
  // Настройки видимости кабинета: что показывать клиенту (платежи/документы/этапы/замечания).
  // По умолчанию всё включено. Сразу пере-публикуем снимок и документы, чтобы клиент увидел.
  const setClientVis = useCallback(async (objectId, patch) => {
    if (!accessAllows(currentPermissions.productionClientAccess, estimatorObjectIds.has(objectId))) return;
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj) return;
    const clientVis = { ...(obj.clientVis || {}), ...patch };
    await saveObjects([...objectsRef.current.filter(o => o.id !== objectId), { ...obj, clientVis, updatedAt: Date.now() }]);
    setCurrentObject(p => (p && p.id === objectId) ? { ...p, clientVis } : p);
    try { await publishProgressRef.current?.(objectId); } catch {}
    try { await _publishDocsRef.current?.(objectId); } catch {}
    // журнал: каждый переключённый раздел видимости
    const VIS_LBL = { payments: "оплата", docs: "документы", stages: "этапы работ", remarks: "замечания" };
    for (const f of Object.keys(patch || {})) {
      const before = (obj.clientVis || {})[f] !== false, after = patch[f] !== false;
      if (before === after) continue;
      logChange(currentUser, { entity: "publish", entityId: objectId, objectId, label: _objLabel(obj), field: "видимость: " + (VIS_LBL[f] || f), action: "изменил доступ", old: before ? "показано" : "скрыто", new: after ? "показано" : "скрыто" });
    }
  }, [saveObjects, currentUser, currentPermissions.productionClientAccess, estimatorObjectIds]);
  // Публикация документов клиента (договоры/акты) при их изменении — для открытых объектов
  const _docsPubTimer = useRef(null);
  useEffect(() => {
    const shared = objectsRef.current.filter(_progActive);
    if (!shared.length) return;
    if (_docsPubTimer.current) clearTimeout(_docsPubTimer.current);
    _docsPubTimer.current = setTimeout(() => { shared.forEach(o => { try { _publishDocsRef.current?.(o.id); } catch {} }); }, 1500);
    return () => { if (_docsPubTimer.current) clearTimeout(_docsPubTimer.current); };
  }, [contracts, reports, estimates]);
  // Живое авто-обновление: при любом изменении производства/оплат пере-публикуем снимки всех открытых объектов
  const _progPubTimer = useRef(null);
  useEffect(() => {
    const shared = objectsRef.current.filter(_progActive);
    if (!shared.length) return;
    if (_progPubTimer.current) clearTimeout(_progPubTimer.current);
    _progPubTimer.current = setTimeout(() => { shared.forEach(async o => { try { await syncRemarksRef.current?.(o.id); } catch {} publishProgressRef.current?.(o.id); }); }, 1200);
    return () => { if (_progPubTimer.current) clearTimeout(_progPubTimer.current); };
  }, [prodEntries, productions]);

  // Построить этапы из привязанной к объекту сметы: группировка по категориям сметы
  const buildStagesFromEstimate = useCallback((objectId) => {
    const objEsts = estimatesForObject(estimates, objectId);
    if (!objEsts.length) return [];
    const catalog = getEffectiveCatalog();
    const map = {};
    const order = [];
    for (const est of objEsts) {
      const mk = 1 + (Number(est.markup) || 0) / 100;
      const disc = 1 - (Number(est.discount) || 0) / 100;
      for (const [key, r] of Object.entries(est.rows || {})) {
        const qty = Number(r?.qty || 0);
        if (qty <= 0) continue;
        const w = catalog.find(x => x.code === key) || catalog.find(x => x.name === key)
          || catalog.find(x => r?.manualName && x.name === r.manualName);
        const name = String(r?.manualName ?? r?.name ?? w?.name ?? key).trim();
        if (!name) continue;
        const unit = String(r?.manualUnit ?? r?.unit ?? w?.unit ?? "").trim();
        const cat = String(r?.cat ?? w?.cat ?? "Дополнительные работы").trim() || "Дополнительные работы";
        const cpxPct = r?.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
        const raw = (r?.manualPrice !== undefined && r.manualPrice !== "")
          ? Number(r.manualPrice)
          : w ? getPrice(w, qty, r?.complexity || "std", cpxPct) : Number(r?.price || 0);
        const priceClient = (Number(raw) || 0) * mk * disc * qty;
        const fallbackCost = Number(r?.costPrice ?? r?.manualCost ?? 0) * qty;
        const costPlan = w ? rowCostPerUnit(r, w) * qty : fallbackCost;
        const k = (cat + "|" + name).toLowerCase();
        if (!map[k]) { map[k] = { cat, name, unit, qty:0, priceClient:0, costPlan:0 }; order.push(k); }
        map[k].qty += qty;
        map[k].priceClient += priceClient;
        map[k].costPlan += costPlan;
      }
    }
    return order.map(k => ({
      cat:map[k].cat, name:map[k].name, unit:map[k].unit,
      qty:Math.round(map[k].qty*100)/100,
      priceClient:Math.round(map[k].priceClient),
      costPlan:Math.round(map[k].costPlan),
    }));
  }, [estimates]);

  // МИГРАЦИЯ ID (одноразово): гранулярные команды адресуют элементы массивов (этапы/журнал/
  // дефекты/чек-листы) по id. Старые данные могли иметь элементы без id или с повторяющимися id —
  // их нельзя было бы точечно менять/удалять. Присваиваем стабильные уникальные id один раз после
  // загрузки. Пишем одной подтверждённой командой replace-all-confirmed (через ту же транзакцию).
  const _prodNormalizedRef = useRef(false);
  useEffect(() => {
    if (_prodNormalizedRef.current) return;
    if (!_productionsLoaded.current) return;
    // ТАБУ владельца: НЕ трогаем боевые данные производства автоматически. Нормализацию id
    // (нужна для гранулярных команд) авто-запускаем ТОЛЬКО на dev-базе. На боевой она НЕ пишет
    // сама — при необходимости владелец запустит вручную (осознанно) отдельной операцией.
    if (!IS_DEV_ENV) { _prodNormalizedRef.current = true; return; }
    const { changed } = normalizeProductionIds(productionsRef.current); // быстрая проверка по снимку
    if (!changed) { _prodNormalizedRef.current = true; return; }
    // Применяется ВНУТРИ транзакции к свежему списку (см. команду normalize-ids), детерминированно.
    // Локальный state и флаг — ТОЛЬКО из подтверждённого результата (committed:true).
    mutateProductions({ type: "normalize-ids", changeId: "bg_normalize" }).then(res => { if (res && res.committed) _prodNormalizedRef.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedTick]);

  // АВТО-СИНХРОНИЗАЦИЯ этапов производства со сметами (без кнопок):
  // добавил позицию в смету/доп. смету → она сама появляется в Этапах и «Финансах по этапам»;
  // удалил смету/позицию → сметные этапы сами исчезают. Статус/сроки/ответственный
  // существующих этапов сохраняются. НЕ трогаем: ручные этапы (в т.ч. с введённой
  // вручную ценой, если имени нет в каталоге) и импортные карточки без объекта (fp:).
  const _stageSyncTimer = useRef(null);
  useEffect(() => {
    // Автосинхронизация разрешена владельцем: основная и дополнительные сметы обновляют
    // только сметные этапы через транзакционную команду. Ручные этапы, статусы, сроки,
    // ответственные и заметки сохраняются.
    if (!_estimatesLoaded.current || !_contractsLoaded.current || !_productionsLoaded.current) return;
    if (_stageSyncTimer.current) clearTimeout(_stageSyncTimer.current);
    _stageSyncTimer.current = setTimeout(() => {
      const prods = productionsRef.current;
      if (!prods.length) return;
      // Для каждой реальной карточки шлём КОМАНДУ sync-estimate-stages: сборку сметных этапов
      // (built) делаем здесь, а СЛИЯНИЕ (удаление ушедших сметных, обновление цифр, добавление
      // новых, сохранение ручных этапов/сроков/статусов) — внутри транзакции на свежих данных.
      // Каждому сметному этапу заранее даём стабильный id, чтобы повтор транзакции не плодил дубль.
      for (const p of prods) {
        if (!p.objectId || String(p.objectId).startsWith("fp:")) continue;
        const obj = objectsRef.current.find(o => o?.id === p.objectId && !o.deletedAt);
        // Автоматически приводим к актуальным сметам только действующие объекты. Закрытые,
        // потерянные и архивные карточки являются историей и без явного действия не меняются.
        if (!obj || !["signed", "work", "paused"].includes(obj.status)) continue;
        // Каждой сметной позиции даём стабильный estimateKey (cat|name) и заранее — id. Синк
        // сопоставляет этапы по estimateKey, а НЕ по названию: ручной этап с именем как в смете
        // (без estimateKey) не будет ни обновлён, ни удалён.
        const built = buildStagesFromEstimate(p.objectId).map(b => ({ id: genId(), estimateKey: _stageKey(b), ...b }));
        // Никогда не очищаем существующие этапы автоматически, если связанная смета
        // временно не прочиталась или действительно пуста. Удаление всех этапов — только явно.
        if (built.length === 0) continue;
        const command = { type: "sync-estimate-stages", objectId: p.objectId, estimateStages: built, changeId: "bg_sync_" + p.objectId, __ephemeral: true };
        // Главное исправление скорости/мигающего баннера: раньше при каждом входе отправляли
        // транзакцию для КАЖДОЙ карточки, даже когда менять нечего. Команды копились в локальном
        // резерве и очереди, переполняли localStorage и создавали ложное «облако недоступно».
        // Локальный снимок уже загружен из Firebase: если команда no-op, сетевой записи не будет.
        const preview = applyProductionCommand([p], command);
        if (!preview.ok || !preview.changed) continue;
        mutateProductions(command);
      }
    }, 1200);
    return () => { if (_stageSyncTimer.current) clearTimeout(_stageSyncTimer.current); };
    // loadedTick — чтобы синк перезапустился, когда productions/сметы догрузились ПОЗЖЕ estimates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimates, loadedTick]);

  // Миграция: перенести все проекты из Финансов в Производство (один раз)
  // Определён ПОСЛЕ buildStagesFromEstimate чтобы избежать temporal dead zone
  const migrateFinanceToProd = useCallback(async () => {
    const total = finProjectsRef.current.filter(p => !["cancel","refuse","archive"].includes(financeStatusMeta(p.rawStatus||p.status).key)).length;
    if (!window.confirm(`Перенести ${total} проектов из Финансов в Производство? Текущие записи производства будут заменены.`)) return;
    const finStatMap = { new:"new", approval:"new", signed:"new", work:"active", paused:"paused", done:"done", cancel:"cancel", refuse:"cancel", archive:"cancel" };
    const stagesFromEst = (objId) => buildStagesFromEstimate(objId).map(s => ({
      id: genId(), estimateKey: _stageKey(s), cat: s.cat||"Прочее", name: s.name||"", unit: s.unit||"", qty: s.qty||0,
      planStart:"", planEnd:"", factStart:"", factEnd:"",
      status:"todo", responsible:"", note:"", paid:false,
      priceClient: s.priceClient||0, costPlan: s.costPlan||0, fromEst: true,
    }));
    const newProds = [];
    const extraObjs = [];
    const seen = new Set();
    const curObjs = objectsRef.current.filter(o => !o.deletedAt);
    for (const fp of finProjectsRef.current) {
      const st = financeStatusMeta(fp.rawStatus || fp.status || "").key;
      if (["cancel","refuse","archive"].includes(st)) continue;
      let objId = fp.objectId || "";
      if (!objId && fp.contractNo) {
        const link = contractLinkMap[normCN(fp.contractNo)];
        if (link?.object) objId = link.object.id;
      }
      if (!objId) {
        const desc = ((fp.description||"")+" "+(fp.comment||"")).toLowerCase();
        const matched = curObjs.find(o =>
          (o.clientName && o.clientName.length > 2 && desc.includes(o.clientName.toLowerCase())) ||
          (o.clientPhone && o.clientPhone.length > 4 && desc.includes(o.clientPhone.toLowerCase())));
        if (matched) objId = matched.id;
      }
      if (!objId) {
        const parts = (fp.description||"").split("|").map(s=>s.trim());
        const newObj = {
          id: genId(),
          clientName: parts[0] || `Проект №${fp.contractNo}`,
          address: parts[1]||"", clientPhone: parts[2]||"",
          clientType: fp.client==="Юр лицо"?"юр":"физ",
          objType: fp.category||"Вторичка",
          area:"", status:"signed", note:`Договор №${fp.contractNo}`,
          manager:"", createdBy:"migration",
          createdAt: fp.createdAt ? new Date(fp.createdAt).getTime() : Date.now(),
          updatedAt: Date.now(),
        };
        extraObjs.push(newObj); curObjs.push(newObj); objId = newObj.id;
      }
      if (seen.has(objId)) continue;
      seen.add(objId);
      const prod = emptyProduction(objId, genId);
      prod.prodStatus = finStatMap[st]||"active";
      prod.stages = stagesFromEst(objId);
      if (fp.createdAt) prod.startDate = fp.createdAt;
      if (fp.closedAt) prod.factEndDate = fp.closedAt;
      newProds.push(prod);
    }
    if (extraObjs.length > 0) await saveObjects([...objectsRef.current, ...extraObjs], { replace: true });
    // Пользователь явно подтвердил «текущие записи будут заменены» — единственная НЕмерджащая
    // команда полной замены (замена всего списка), атомарно через ту же очередь/транзакцию.
    const migRes = await mutateProductions({ type: "replace-all-confirmed", list: newProds });
    if (!migRes.committed) { alert("Не удалось перенести производство (нет связи с базой). Повторите."); return; }
    alert(`Перенесено ${newProds.length} объектов.${extraObjs.length ? ` Создано ${extraObjs.length} новых объектов.`:""}`);
  }, [contractLinkMap, genId, buildStagesFromEstimate, mutateProductions]);

  // ── ФИНАНСЫ: загрузка/сохранение ──
  const loadFinance = useCallback(async () => {
    try {
      const [tx, mt, pj] = await Promise.all([storage.getResult(FINANCE_TX_KEY), storage.getResult(FINANCE_META_KEY), storage.getResult(FINANCE_PROJECTS_KEY)]);
      let ok = true;
      if (tx.status === "found" && tx.value) { try { const p = JSON.parse(tx.value); if (Array.isArray(p)) { setFinanceTx(p); financeTxRef.current = p; } } catch {} }
      else if (tx.status === "empty") { setFinanceTx([]); financeTxRef.current = []; }
      else ok = false;
      if (mt.status === "found" && mt.value) { try { const p = JSON.parse(mt.value); if (p && p.accounts) { const m = mergeFinMeta(p); setFinanceMeta(m); financeMetaRef.current = m; } } catch {} }
      if (pj.status === "found" && pj.value) { try { const p = JSON.parse(pj.value); if (Array.isArray(p)) {
        const curY = new Date().getFullYear();
        const fixed = p.map(proj => {
          if (!proj.createdAt) return proj;
          const d = new Date(proj.createdAt);
          if (isNaN(d.getTime()) || d.getFullYear() <= curY + 1) return proj;
          // год явно неверный — заменяем на текущий, день/месяц сохраняем
          const corrected = new Date(proj.createdAt);
          corrected.setFullYear(curY);
          return { ...proj, createdAt: corrected.toISOString().slice(0, 10) };
        });
        setFinProjects(fixed); finProjectsRef.current = fixed;
      } } catch {} }
      _financeLoaded.current = ok;
    } catch(e) { console.error(e); }
    _bumpLoaded();
  }, [_bumpLoaded]);
  const saveFinanceTx = async (list, opts = {}) => {
    return await saveListProtected(FINANCE_TX_KEY, FINANCE_TX_BACKUPS_KEY, list, (fl)=>{ financeTxRef.current = fl; setFinanceTx(fl); }, { loadedRef: _financeLoaded, ...opts });
  };
  const saveFinanceMeta = async (meta) => {
    financeMetaRef.current = meta; setFinanceMeta(meta);
    try {
      const prev = await storage.getResult(FINANCE_META_KEY);
      if (prev.status === "found" && prev.value) {
        const bRaw = await storage.get(FINANCE_META_BACKUPS_KEY); let bk=[];
        try { if (bRaw && bRaw.value) bk = JSON.parse(bRaw.value); } catch {}
        if (!Array.isArray(bk)) bk = [];
        bk.unshift({ ts: Date.now(), by: currentUser?.name||"", data: prev.value });
        await storage.set(FINANCE_META_BACKUPS_KEY, JSON.stringify(bk.slice(0,20)));
      }
      const res = await storage.set(FINANCE_META_KEY, JSON.stringify(meta));
      if (res && res.fbOk === false) setCloudError(true); else _clearCloudErrorIfAllClean();
    } catch(e) { console.error(e); setCloudError(true); }
  };

  const saveFinanceProjects = async (list, opts = {}) => {
    return await saveListProtected(FINANCE_PROJECTS_KEY, FINANCE_PROJECTS_BACKUPS_KEY, list, (fl)=>{ finProjectsRef.current = fl; setFinProjects(fl); }, { loadedRef: _financeLoaded, ...opts });
  };

  // БЫСТРОЕ ОБНОВЛЕНИЕ бюджета проектов: при любом изменении договоров (добавили/
  // изменили/удалили доп. соглашение) бюджет связанного проекта пересчитывается сам:
  // бюджет = основной договор + все его доп. соглашения. Проекты без договора в
  // сервисе (импорт из Google-таблиц) не трогаются. Debounce, чтобы не спамить сейвы.
  const _budgetSyncTimer = useRef(null);
  useEffect(() => {
    if (!_financeLoaded.current || !_contractsLoaded.current || !_productionsLoaded.current) return;
    if (_budgetSyncTimer.current) clearTimeout(_budgetSyncTimer.current);
    _budgetSyncTimer.current = setTimeout(() => {
      const fps = finProjectsRef.current;
      let changed = false;
      let updated = fps.map(fp => {
        if (!fp.contractNo) return fp;
        const main = contractsRef.current.find(c => c.number && !c.deletedAt
          && c.type !== "podryad" && c.type !== "podryad_annex" && c.type !== "annex" && c.type !== "design_add"
          && normCN(c.number) === normCN(fp.contractNo));
        if (!main) return fp;
        // nb>=0 (не nb>0): удаление ВСЕХ позиций из договора/приложений — законный бюджет 0,
        // а не признак «данные ещё не загрузились» (это уже отсечено гардом выше по _contractsLoaded).
        // Раньше nb>0 не давал бюджету обнулиться, если из договора убрали все работы.
        const nb = finBudgetOfContract(main);
        const linkedObjectId = fp.objectId || main.objectId || "";
        if ((nb >= 0 && Math.round(Number(fp.budget) || 0) !== Math.round(nb)) || linkedObjectId !== (fp.objectId || "")) {
          changed = true;
          return { ...fp, budget: nb, objectId: linkedObjectId };
        }
        return fp;
      });

      // Доводим старые активные объекты до новой схемы связей. Единственный ключ —
      // objectId; точный номер договора нужен только для безопасной миграции старых
      // проектов, в которых objectId ещё не был сохранён. Имена/адреса не участвуют.
      for (const object of objectsRef.current.filter(o => o && !o.deletedAt)) {
        const production = productionsRef.current.find(p => p.objectId === object.id);
        const status = (production && PROD_TO_DEAL[production.prodStatus]) || object.status || "new";
        if (status !== "work" && status !== "signed") continue;
        const customerContracts = contractsRef.current.filter(c => c && !c.deletedAt && c.objectId === object.id
          && c.type !== "podryad" && c.type !== "podryad_annex");
        const main = customerContracts.find(c => c.type !== "annex" && c.type !== "design_add"
          && (c.type === "repair_fiz" || c.type === "repair_yur"))
          || customerContracts.find(c => c.type !== "annex" && c.type !== "design_add")
          || null;
        const existing = updated.find(fp => fp.objectId === object.id)
          || (main && updated.find(fp => fp.contractNo && normCN(fp.contractNo) === normCN(main.number)));
        if (existing) {
          if (!existing.objectId) {
            updated = updated.map(fp => fp.id === existing.id ? { ...fp, objectId:object.id, budget:finBudgetOfContract(main) || Number(fp.budget) || 0 } : fp);
            changed = true;
          }
          continue;
        }
        const estimateTotal = estimatesForObject(estimatesRef.current, object.id).reduce((sum, estimate) => sum + (Number(estimate.total) || 0), 0);
        const budget = finBudgetOfContract(main) || estimateTotal;
        if (!main && budget <= 0) continue;
        updated.push({ ...finProjDraftFromObject(object, main), id:genId(), objectId:object.id, budget });
        changed = true;
      }
      if (changed) saveFinanceProjects(updated);
    }, 800);
    return () => { if (_budgetSyncTimer.current) clearTimeout(_budgetSyncTimer.current); };
    // loadedTick — чтобы синк перезапустился, когда финансы/договоры догрузились ПОЗЖЕ contracts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, objects, estimates, productions, loadedTick]);

  // Бэкапы списков (договоры/клиенты/контрагенты)
  const openListBackups = async (kind) => {
    const cfg = {
      list:        { backupKey: CONTRACTS_BACKUPS_KEY,   label: "договоров",   save: (l)=>saveContracts(l, {replace:true, allowEmpty:true}) },
      contracts:   { backupKey: CONTRACTS_BACKUPS_KEY,   label: "договоров",   save: (l)=>saveContracts(l, {replace:true, allowEmpty:true}) },
      clients:     { backupKey: CLIENTS_BACKUPS_KEY,     label: "клиентов",    save: (l)=>saveContractClients(l, {replace:true, allowEmpty:true}) },
      contragents: { backupKey: CONTRAGENTS_BACKUPS_KEY, label: "контрагентов", save: (l)=>saveContragents(l, {replace:true, allowEmpty:true}) },
      objects:     { backupKey: OBJECTS_BACKUPS_KEY,     label: "объектов",    save: (l)=>saveObjects(l, {replace:true, allowEmpty:true}) },
    }[kind];
    if (!cfg) return;
    const bRaw = await storage.get(cfg.backupKey);
    let items = []; try { if (bRaw?.value) items = JSON.parse(bRaw.value); } catch {}
    setListBackups({
      label: cfg.label,
      items: Array.isArray(items) ? items : [],
      onRestore: async (snap) => {
        if (!snap?.data) return;
        let list; try { list = JSON.parse(snap.data); } catch { window.alert("Бэкап повреждён"); return; }
        if (!Array.isArray(list)) { window.alert("Бэкап повреждён"); return; }
        if (!window.confirm(`Восстановить список ${cfg.label} на ${new Date(snap.ts).toLocaleString("ru-RU")}? Записей: ${list.length}.`)) return;
        await cfg.save(list);
        setListBackups(null);
        window.alert("Восстановлено ✓");
      },
    });
  };

  // Автосохранение договора: короткий дебаунс + запоминаем последнее состояние для флеша
  const _contractAutoSave = useRef(null);
  const _editContractRef = useRef(null);
  const _saveContractNow = (c) => { if (!c || c._mode) return; const list = contractsRef.current.filter(x=>x.id!==c.id); saveContracts([...list, {...c, updatedAt: Date.now()}]); };
  useEffect(() => {
    if (!currentContract || currentContract._mode) { _editContractRef.current = null; return; }
    _editContractRef.current = currentContract;
    if (_contractAutoSave.current) clearTimeout(_contractAutoSave.current);
    const snap = currentContract;
    _contractAutoSave.current = setTimeout(() => _saveContractNow(snap), 600);
    return () => clearTimeout(_contractAutoSave.current);
  }, [currentContract]);
  // ФЛЕШ: при любом уходе из редактора договора (кнопка, стрелка, боковое меню) сохраняем последнее состояние
  useEffect(() => {
    const open = screen === "contracts" && contractTab === "editor";
    if (open) return;
    const c = _editContractRef.current;
    if (c) { _editContractRef.current = null; _saveContractNow(c); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractTab, screen]);

  // Автосохранение сделки (тест)
  const _dealAutoSave = useRef(null);
  useEffect(() => {
    if (!currentDeal) return;
    if (_dealAutoSave.current) clearTimeout(_dealAutoSave.current);
    _dealAutoSave.current = setTimeout(async () => {
      const list = dealsRef.current.filter(x=>x.id!==currentDeal.id);
      const total = (currentDeal.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
      await saveDeals([...list, {...currentDeal, total, updatedAt: Date.now()}]);
    }, 1500);
    return () => clearTimeout(_dealAutoSave.current);
  }, [currentDeal]);

  const _estimatesLoaded = useRef(false); // защита: не сохранять пока не загрузились из Firebase

  // Чистка испорченных смет: parentId не может ссылаться на саму смету или на несуществующую/тоже-дочернюю.
  const sanitizeEstimates = (list) => {
    const byId = {}; list.forEach(e=>{ byId[e.id]=e; });
    return list.map(e=>{
      let pid = e.parentId;
      // самоссылка / отсутствующий родитель / родитель сам является ДС → это основная смета
      if (pid && (pid===e.id || !byId[pid] || byId[pid].parentId)) pid = null;
      if (pid === e.parentId) return e; // ничего не меняли
      const { parentId, dsNumber, ...rest } = e;
      return pid ? { ...rest, parentId: pid, dsNumber } : rest; // снимаем parentId и dsNumber у основной
    });
  };

  const loadEstimates = useCallback(async () => {
    setLoadingList(true);
    let ok = false;
    try {
      const [resR, uR, prR, catR] = await Promise.allSettled([
        storage.getResult(STORAGE_KEY),
        storage.get(USERS_KEY),
        storage.get(PRICES_KEY),
        storage.get(CATALOG_KEY),
      ]);
      // Если основная коллекция не загрузилась — считаем источник недоступным
      const result = resR.status==="fulfilled" ? resR.value : { status:"unavailable" };
      const u   = uR.status==="fulfilled"   ? uR.value   : null;
      const pr  = prR.status==="fulfilled"  ? prR.value  : null;
      const cat = catR.status==="fulfilled" ? catR.value : null;
      if (result.status === "found" && result.value) {
        try {
          const parsed = JSON.parse(result.value);
          if (Array.isArray(parsed)) {
            const clean = sanitizeEstimates(parsed);
            setEstimates(clean); estimatesRef.current = clean; ok = true;
            // Санитизация при загрузке нужна для безопасного отображения, но не является
            // действием пользователя. Не пишем её автоматически: фоновая запись при входе
            // не должна создавать dirty-черновик и блокировать обычный выход из аккаунта.
          }
          else console.error("loadEstimates: данные не массив — не трогаем");
        } catch(e) {
          console.error("loadEstimates parse error — данные не тронуты", e);
        }
      } else if (result.status === "empty") {
        // Источник точно ответил и данных нет — корректно показываем пустой список
        setEstimates([]); estimatesRef.current = []; ok = true;
      } else {
        // 'unavailable' — Firebase не ответил, локальной копии нет.
        // НЕ затираем стейт и НЕ разрешаем сохранение (иначе пустой список перетрёт базу).
        console.error("loadEstimates: данные недоступны (Firebase не ответил) — сохранение заблокировано до перезагрузки");
        setLoadError(true);
      }
      if (ok) setLoadError(false);
      try { if (u) {
        const uList=JSON.parse(u.value); setAllUsers(uList);
        // синхронизируем роль текущего пользователя если она изменилась в Firebase
        setCurrentUser(prev=>{
          if(!prev) return prev;
          const fresh=uList.find(x=>x.id===prev.id);
          // Пароль сменили после входа этой сессии → принудительный выход. НЕ мгновенный сброс:
          // через единый безопасный путь (endSessionSafely: дожать несохранённое производство,
          // предупредить о потере, и только потом чистить). setTimeout — выходим из апдейтера.
          if(fresh && fresh.pwChangedAt && fresh.pwChangedAt > (prev.authAt||0)){
            setTimeout(() => { endSessionSafelyRef.current && endSessionSafelyRef.current({ forced: true }); }, 0);
            return prev; // остаёмся смонтированными, пока безопасный выход не завершится
          }
          if(!fresh || (fresh.role===prev.role && fresh.name===prev.name)) return prev;
          const {password:_pw, ...freshSafe}=fresh; // пароль в сессии не храним
          const updated={...prev,...freshSafe};
          try{ localStorage.setItem(SESSION_KEY,JSON.stringify({user:updated,savedAt:Date.now()})); }catch(e){}
          return updated;
        });
      }} catch {}
      try { if (pr) setPriceOverrides(JSON.parse(pr.value)); } catch {}
      try {
        if (cat) {
          let parsedCat = JSON.parse(cat.value);
          // ОЧИСТКА: убираем из ОБЩЕГО каталога позиции, ранее добавленные при восстановлении из актов
          // (они засоряли все сметы категорией EXTRA_CAT и дублировали работы). Теперь такие позиции
          // живут прямо внутри своей сметы как «сиротские» строки.
          if (Array.isArray(parsedCat?.custom) && parsedCat.custom.some(w => w?.cat === EXTRA_CAT)) {
            parsedCat = { ...parsedCat, custom: parsedCat.custom.filter(w => w?.cat !== EXTRA_CAT) };
          }
          setCatalogOverrides(parsedCat);
        }
      } catch {}
    } catch(e) {
      console.error("loadEstimates error — данные не тронуты", e);
      setLoadError(true);
    }
    // Разрешаем запись ТОЛЬКО если успешно подтвердили состояние базы
    _estimatesLoaded.current = ok;
    setLoadingList(false);
    _bumpLoaded();
  }, [_bumpLoaded]);

  useEffect(() => { loadEstimates(); loadContracts(); }, []);
  // Финансы грузим для админа, руководителя и прораба (прораб видит финансы ВНУТРИ объекта:
  // вкладка Финансы + карточки. Сам раздел «Финансы» ему всё равно закрыт через effScreen).
  // Замерщику финансы НЕ грузим — он видит себестоимость/маржу только в смете при заполнении.
  useEffect(() => {
    if (currentPermissions.finance !== "none" || currentPermissions.financialDetails) loadFinance();
  }, [currentPermissions.finance, currentPermissions.financialDetails, loadFinance]);

  // ── САМОИСЦЕЛЕНИЕ СИНХРОНИЗАЦИИ ──
  const [resyncing, setResyncing] = useState(false);
  // Ручная пересинхронизация: дослать зависшие правки в облако (со слиянием) и перечитать всё с сервера
  const resyncNow = useCallback(async () => {
    if (resyncing) return;
    setResyncing(true);
    try {
      // Дожимаем и ПРОИЗВОДСТВО целиком (правки карточек + фоновые bg_* + хвост очереди команд) —
      // раньше кнопка «Повторить сейчас» гоняла только flushDirty. await: спиннер «Синхронизирую…»
      // держится, пока попытки реально не завершились.
      try { await flushAllProductionPending(); } catch(e) { console.warn("flush prod pending err", e); }
      await storage.flushDirty();
      await Promise.all([loadEstimates(), loadContracts()]);
      if (currentPermissions.finance !== "none" || currentPermissions.financialDetails) await loadFinance();
      const left = storage.dirtyKeysVisible().length;
      setDirtyCount(left);
      // гасим только когда чисто ВЕЗДЕ: успех storage не должен скрывать ошибку производства
      if (left === 0 && _prodUnsyncedIds.current.size === 0) setCloudError(false);
    } catch(e) { console.warn("resync err", e); }
    setResyncing(false);
  }, [resyncing, loadEstimates, loadContracts, loadFinance, currentUser?.role, flushAllProductionPending]);
  const _resyncRef = useRef(resyncNow); _resyncRef.current = resyncNow;
  // Авто-флеш зависших правок: при старте, периодически и при возврате сети
  useEffect(() => {
    let stop = false;
    const flush = () => { if (!stop) storage.flushDirty().then(()=>{ if(!stop) { const left = storage.dirtyKeysVisible().length; setDirtyCount(left); if (left === 0 && _prodUnsyncedIds.current.size === 0) setCloudError(false); } }).catch(()=>{}); };
    flush();
    const iv = setInterval(flush, 90000);
    const onOnline = () => _resyncRef.current && _resyncRef.current();
    window.addEventListener("online", onOnline);
    return () => { stop = true; clearInterval(iv); window.removeEventListener("online", onOnline); };
  }, []);
  // Индикатор «есть несинхронизированные изменения» (свои — dirtyCount; legacy-карантин — отдельно)
  useEffect(() => {
    const upd = () => { setDirtyCount(storage.dirtyKeysVisible().length); setLegacyDirtyN(storage.legacyDirtyKeys().length); };
    upd();
    const iv = setInterval(upd, 5000);
    return () => clearInterval(iv);
  }, []);

  // ── Сохранение списка смет с защитой от рассинхрона ──
  // opts.replace=true — записать ровно `list` (восстановление из бэкапа)
  // opts.removedIds — id, которые нужно удалить из объединённого набора (явное удаление)
  const saveEstimates = useCallback(async (list, opts = {}) => {
    if (storage.isReadOnlyTab()) return;
    if (!_estimatesLoaded.current) { console.warn("saveEstimates заблокирован: данные ещё не загружены/недоступны"); return; }
    if (!Array.isArray(list)) { console.error("saveEstimates: список не массив — отмена"); return; }
    const { replace = false, removedIds = [] } = opts;

    // Читаем актуальное состояние базы (могли изменить другие устройства)
    let stored = [];
    let prevValue = null, prevStatus = "empty";
    try {
      const prevCheck = await storage.getResult(STORAGE_KEY);
      prevStatus = prevCheck.status; prevValue = prevCheck.value;
      if (prevCheck.status === "found" && prevCheck.value) {
        try { const p = JSON.parse(prevCheck.value); if (Array.isArray(p)) stored = p; } catch {}
      } else if (prevCheck.status === "unavailable") {
        // База недоступна — не рискуем перезаписывать, чтобы не затереть чужие данные
        console.error("saveEstimates ЗАБЛОКИРОВАН: база недоступна");
        setCloudError(true);
        return;
      }
    } catch(e) { console.warn("guard check err", e); }

    // СЛИЯНИЕ: объединяем по id, для общих id берём запись с более свежим updatedAt.
    // Сметы из базы, которых нет в текущем списке, СОХРАНЯЕМ (другое устройство их добавило).
    let finalList;
    if (replace) {
      // БЕЗОПАСНАЯ ЗАМЕНА: `list` — источник истины для своих id (восстановление,
      // перенос сметы, санитизация), НО мы НИКОГДА не роняем сметы, которые есть
      // в облаке и отсутствуют в списке (кроме явно удалённых removedIds).
      // Раньше здесь был голый `finalList = list` — из-за него смета, добавленная
      // на другом устройстве, могла бесследно исчезнуть при любой replace-записи.
      const rm = new Set(removedIds);
      const map = new Map();
      for (const e of stored) if (e && e.id && !rm.has(e.id)) map.set(e.id, e);
      for (const e of list) { if (!e || !e.id || rm.has(e.id)) continue; map.set(e.id, e); }
      finalList = [...map.values()];
    } else {
      const map = new Map();
      for (const e of stored) if (e && e.id) map.set(e.id, e);
      for (const e of list) {
        if (!e || !e.id) continue;
        const ex = map.get(e.id);
        if (!ex) map.set(e.id, e);
        else map.set(e.id, _ts(e.updatedAt) >= _ts(ex.updatedAt) ? e : ex);
      }
      for (const id of removedIds) map.delete(id);
      finalList = [...map.values()];
    }

    // ФИНАЛЬНЫЙ ПРЕДОХРАНИТЕЛЬ: не затирать непустую базу пустым результатом без явного разрешения
    if (stored.length > 0 && finalList.length === 0 && !_allowEmptySave.current) {
      console.error("saveEstimates ЗАБЛОКИРОВАН: результат пустой поверх", stored.length, "смет");
      return;
    }

    // Синхронизируем UI с объединённым набором (чтобы не потерять подтянутые чужие сметы)
    estimatesRef.current = finalList;
    setEstimates(finalList);

    setSaving(true);
    setSyncStatus("saving");
    try {
      // Авто-бэкап предыдущего состояния (последние 20)
      try {
        if (prevStatus === "found" && prevValue) {
          const bRaw = await storage.get(BACKUPS_KEY);
          let backups = [];
          try { if (bRaw && bRaw.value) backups = JSON.parse(bRaw.value); } catch {}
          if (!Array.isArray(backups)) backups = [];
          const last = backups[0];
          if (!last || last.data !== prevValue) {
            backups.unshift({ ts: Date.now(), by: currentUser?.name || "", count: stored.length, data: prevValue });
            backups = backups.slice(0, 20);
            await storage.set(BACKUPS_KEY, JSON.stringify(backups));
          }
        }
      } catch(e) { console.warn("backup err", e); }
      const res = await storage.set(STORAGE_KEY, JSON.stringify(finalList));
      if (res && res.fbOk === false) { console.error("Firebase save FAILED:", res.fbError); setCloudError(true); setSyncStatus("error"); }
      else { _clearCloudErrorIfAllClean(); setSyncStatus("saved"); setTimeout(()=>setSyncStatus("idle"), 3000); }
    } catch(e) { console.error(e); setCloudError(true); setSyncStatus("error"); }
    setSaving(false);
  }, [currentUser, _clearCloudErrorIfAllClean]);

  // ── УНИВЕРСАЛЬНОЕ защищённое сохранение списка (договоры, клиенты, контрагенты) ──
  // Та же логика, что у смет: слияние по id, бэкап, защита от затирания, баннер при сбое облака.
  //
  // ЕДИНАЯ ОЧЕРЕДЬ ЗАПИСИ ПО КЛЮЧУ. Внутри — чтение(getResult)→слияние→бэкап→запись(set). Это
  // НЕ атомарно: два параллельных сохранения одного ключа прочитали бы одно и то же `stored`,
  // слили на устаревших данных, и второй set затёр бы правку первого. Особенно опасно для
  // производства, куда пишут сразу несколько источников (карточка объекта, авто-синк этапов←сметы,
  // зеркалирование статуса в saveObjField, удаление карточки). Теперь вызовы одного ключа идут
  // строго последовательно (цепочка промисов на ключ), разные ключи — по-прежнему параллельно.
  const _saveQueues = useRef(new Map()); // key -> хвостовой промис очереди
  const _saveListProtectedRaw = useCallback(async (key, backupKey, list, applyState, opts = {}) => {
    if (storage.isReadOnlyTab()) return;
    if (!Array.isArray(list)) { console.error("saveListProtected: не массив", key); return; }
    // identityKey — по какому полю мерджить (по умолчанию "id"; у production записей его нет,
    // там ключ — "objectId", иначе слияние молча даёт пустой список и сохранение блокируется).
    const { replace = false, removedIds = [], allowEmpty = false, loadedRef = null, identityKey = "id", hardReplace = false } = opts;
    if (loadedRef && !loadedRef.current) { console.warn("saveListProtected заблокирован: не загружено", key); return; }

    let stored = [], prevValue = null, prevStatus = "empty";
    try {
      const prevCheck = await storage.getResult(key);
      prevStatus = prevCheck.status; prevValue = prevCheck.value;
      if (prevCheck.status === "found" && prevCheck.value) {
        try { const p = JSON.parse(prevCheck.value); if (Array.isArray(p)) stored = p; } catch {}
      } else if (prevCheck.status === "unavailable") {
        console.error("saveListProtected ЗАБЛОКИРОВАН: база недоступна", key);
        setCloudError(true);
        return;
      }
    } catch(e) { console.warn("guard check err", e); }

    let finalList;
    if (hardReplace) {
      // ЖЁСТКАЯ ЗАМЕНА без мерджа — только для намеренных операций (напр. ручная миграция
      // с явным предупреждением админу «текущие записи будут заменены»). Не использовать
      // по умолчанию: обходит защиту от потери записей, которых нет в переданном списке.
      finalList = list;
    } else if (replace) {
      // БЕЗОПАСНАЯ ЗАМЕНА по identityKey (обычно id, для production — objectId):
      // список перекрывает свои ключи, но записи из облака, которых нет в списке, НЕ
      // теряются (кроме removedIds).
      const keyed = list.every(e => e && e[identityKey]) && stored.every(e => e && e[identityKey]);
      if (keyed) {
        const rm = new Set(removedIds);
        const map = new Map();
        for (const e of stored) if (e && e[identityKey] && !rm.has(e[identityKey])) map.set(e[identityKey], e);
        for (const e of list) { if (!e || !e[identityKey] || rm.has(e[identityKey])) continue; map.set(e[identityKey], e); }
        finalList = [...map.values()];
      } else {
        finalList = list;
      }
    } else {
      const map = new Map();
      for (const e of stored) if (e && e[identityKey]) map.set(e[identityKey], e);
      for (const e of list) {
        if (!e || !e[identityKey]) continue;
        const ex = map.get(e[identityKey]);
        if (!ex) map.set(e[identityKey], e);
        else map.set(e[identityKey], _ts(e.updatedAt) >= _ts(ex.updatedAt) ? e : ex);
      }
      for (const id of removedIds) map.delete(id);
      finalList = [...map.values()];
    }

    if (stored.length > 0 && finalList.length === 0 && !allowEmpty) {
      console.error("saveListProtected ЗАБЛОКИРОВАН: пусто поверх", stored.length, key);
      return;
    }

    if (applyState) applyState(finalList);

    try {
      if (prevStatus === "found" && prevValue) {
        const bRaw = await storage.get(backupKey);
        let backups = [];
        try { if (bRaw && bRaw.value) backups = JSON.parse(bRaw.value); } catch {}
        if (!Array.isArray(backups)) backups = [];
        if (!backups[0] || backups[0].data !== prevValue) {
          backups.unshift({ ts: Date.now(), by: currentUser?.name || "", count: stored.length, data: prevValue });
          await storage.set(backupKey, JSON.stringify(backups.slice(0, 20)));
        }
      }
      const res = await storage.set(key, JSON.stringify(finalList));
      if (res && res.fbOk === false) { console.error("Firebase save FAILED:", key, res.fbError); setCloudError(true); }
      else { _clearCloudErrorIfAllClean(); }
    } catch(e) { console.error(e); setCloudError(true); }
    return finalList;
  }, [currentUser, _clearCloudErrorIfAllClean]);

  // Обёртка-очередь: каждый вызов встаёт в хвост очереди СВОЕГО ключа и запускается только
  // после завершения предыдущего вызова того же ключа. Возвращаемый промис резолвится тем же,
  // чем и сырой сейв (finalList/undefined) — вызовы, которые await'ят результат, работают как раньше.
  const saveListProtected = useCallback((key, backupKey, list, applyState, opts = {}) => {
    const prev = _saveQueues.current.get(key) || Promise.resolve();
    const run = () => _saveListProtectedRaw(key, backupKey, list, applyState, opts);
    const next = prev.then(run, run); // запускаем независимо от исхода предыдущего в очереди
    _saveQueues.current.set(key, next.then(() => {}, () => {})); // хвост никогда не «падает», чтобы цепочка не рвалась
    return next;
  }, [_saveListProtectedRaw]);

  // Сколько позиций (с qty>0) в наборе rows
  const countFilled = (rws) => Object.values(rws||{}).filter(r => Number(r?.qty) > 0).length;
  const _allowEmptySave = useRef(false); // явное разрешение сохранить пустую смету (Сбросить позиции)

  // ── Бэкапы / восстановление ──
  const openBackups = async () => {
    try {
      const bRaw = await storage.get(BACKUPS_KEY);
      let backups = [];
      try { if (bRaw && bRaw.value) backups = JSON.parse(bRaw.value); } catch {}
      if (!Array.isArray(backups)) backups = [];
      setBackupsModal(backups);
    } catch(e) { setBackupsModal([]); }
  };
  // ТОЧЕЧНОЕ ВОССТАНОВЛЕНИЕ: вернуть ТОЛЬКО пропавшие сметы из снимка (по id),
  // не трогая ни одну существующую смету и вообще ничего больше (финансы/объекты — не при чём).
  const recoverMissingFromBackup = async (snap) => {
    if (!snap || !snap.data) return;
    let list;
    try { list = JSON.parse(snap.data); } catch { window.alert("Не удалось прочитать бэкап"); return; }
    if (!Array.isArray(list)) { window.alert("Бэкап повреждён"); return; }
    list = list.filter(e => e && typeof e==="object" && e.id);
    const haveIds = new Set(estimatesRef.current.map(e => e.id));
    const missing = list.filter(e => !haveIds.has(e.id));
    if (missing.length === 0) { window.alert("В этом снимке нет смет, которых сейчас не хватает — все уже на месте."); return; }
    const names = missing.slice(0, 12).map(e => `• ${e.proj?.name || "Без названия"}${e.proj?.address ? ` — ${e.proj.address}` : ""}`).join("\n");
    if (!window.confirm(`Вернуть недостающие сметы из снимка ${new Date(snap.ts).toLocaleString("ru-RU")}?\n\nБудет ДОБАВЛЕНО: ${missing.length}\n${names}${missing.length > 12 ? `\n…и ещё ${missing.length - 12}` : ""}\n\nСуществующие сметы, финансы и всё остальное НЕ изменятся — только добавятся пропавшие.`)) return;
    // merge (без replace): недостающие добавятся, существующие и облачные сметы останутся как есть
    await saveEstimates([...estimatesRef.current, ...missing]);
    setBackupsModal(null);
    window.alert(`Возвращено смет: ${missing.length} ✓\nОстальное осталось как было.`);
  };
  const restoreBackup = async (snap) => {
    if (!snap || !snap.data) return;
    let list;
    try { list = JSON.parse(snap.data); } catch { window.alert("Не удалось прочитать бэкап"); return; }
    if (!Array.isArray(list)) { window.alert("Бэкап повреждён"); return; }
    // Отфильтровываем мусор (null/undefined/без id), чтобы не записать битые записи
    list = list.filter(e => e && typeof e==="object" && e.id);
    if (!confirmDangerous(`Восстановить архив на момент ${new Date(snap.ts).toLocaleString("ru-RU")}?\nСметы: ${list.length}. Текущая версия уйдёт в бэкап и её можно вернуть обратно.`)) return;
    _allowEmptySave.current = true; // восстановление может заменить на меньший набор
    estimatesRef.current = list;
    setEstimates(list);
    await saveEstimates(list, { replace: true }); // ровно снимок, текущая версия уйдёт в бэкап
    setTimeout(() => { _allowEmptySave.current = false; }, 1500);
    setBackupsModal(null);
    const objIds = new Set(objectsRef.current.map(o=>o.id));
    const inObjects = list.filter(e=>e.objectId && objIds.has(e.objectId)).length;
    const standalone = list.length - inObjects;
    window.alert(`Восстановлено смет: ${list.length}\n• в объектах: ${inObjects}\n• в общем списке «Сметы»: ${standalone}`);
  };

  // ── Единый бэкап рабочего пространства: объекты + сметы + договора + финансовые операции ──
  const _wsSnapTimer = useRef(null);
  useEffect(() => {
    if (!_estimatesLoaded.current || !_contractsLoaded.current || !_financeLoaded.current) return;
    if (_wsSnapTimer.current) clearTimeout(_wsSnapTimer.current);
    _wsSnapTimer.current = setTimeout(async () => {
      try {
        const snap = {
          ts: Date.now(),
          by: currentUser?.name || "",
          objects: objectsRef.current,
          estimates: estimatesRef.current,
          contracts: contractsRef.current,
          financeTx: financeTxRef.current,
          counts: {
            o: objectsRef.current.length,
            e: estimatesRef.current.length,
            c: contractsRef.current.length,
            f: financeTxRef.current.length,
          },
        };
        const raw = await storage.get(WORKSPACE_BACKUPS_KEY);
        let arr = []; try { if (raw?.value) arr = JSON.parse(raw.value); } catch {}
        if (!Array.isArray(arr)) arr = [];
        const prev = arr[0];
        // Сигнатура по counts ловит добавление/удаление записей, но НЕ ловит правку поля
        // без изменения количества (напр. поменяли цену/статус) — добавляем max updatedAt,
        // чтобы такие правки тоже создавали новый снимок.
        const maxTs = Math.max(0, ...[...objectsRef.current, ...estimatesRef.current, ...contractsRef.current, ...financeTxRef.current].map(x => x?.updatedAt || x?.createdAt || 0));
        const sig = `${snap.counts.o}|${snap.counts.e}|${snap.counts.c}|${snap.counts.f}|${maxTs}`;
        if (prev && prev._sig === sig) return;
        snap._sig = sig;
        arr = [snap, ...arr].slice(0, 30);
        // Автоматический технический снимок не является пользовательской правкой.
        // При недоступном облаке просто повторим его после следующего изменения/входа,
        // но не создаём dirty-копию и не блокируем выход ложным предупреждением.
        await storage.setCloudOnly(WORKSPACE_BACKUPS_KEY, JSON.stringify(arr));
      } catch (e) { console.warn("ws snapshot err", e); }
    }, 8000);
    return () => { if (_wsSnapTimer.current) clearTimeout(_wsSnapTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, estimates, contracts, financeTx, loadedTick]);

  const openWorkspaceBackups = async () => {
    try {
      const raw = await storage.get(WORKSPACE_BACKUPS_KEY);
      let arr = []; try { if (raw?.value) arr = JSON.parse(raw.value); } catch {}
      setWsBackupsModal(Array.isArray(arr) ? arr : []);
    } catch { setWsBackupsModal([]); }
  };

  // ── ПОЛНЫЙ БЭКАП В ФАЙЛ: выгрузка всех рабочих данных в один JSON и загрузка обратно ──
  // Работаем НАПРЯМУЮ с ключами хранилища (не с тем, что подгружено в интерфейс), чтобы
  // бэкап всегда был полным, а восстановление — предсказуемым.
  const _backupSections = [
    { k: "objects",         label: "Объекты",           key: OBJECTS_KEY,          bkey: OBJECTS_BACKUPS_KEY },
    { k: "contracts",       label: "Договоры",          key: CONTRACTS_KEY,        bkey: CONTRACTS_BACKUPS_KEY },
    { k: "estimates",       label: "Сметы",             key: STORAGE_KEY,          bkey: BACKUPS_KEY },
    { k: "clients",         label: "Клиенты",           key: CLIENTS_KEY,          bkey: CLIENTS_BACKUPS_KEY },
    { k: "contragents",     label: "Реквизиты",         key: CONTRAGENTS_KEY,      bkey: CONTRAGENTS_BACKUPS_KEY },
    { k: "workers",         label: "Подрядчики",        key: WORKERS_KEY,          bkey: WORKERS_BACKUPS_KEY },
    { k: "podryads",        label: "Договоры подряда",  key: PODRYADS_KEY,         bkey: PODRYADS_BACKUPS_KEY },
    { k: "productions",     label: "Производство",      key: PRODUCTIONS_KEY,      bkey: PRODUCTIONS_BACKUPS_KEY },
    { k: "financeTx",       label: "Финансы: операции", key: FINANCE_TX_KEY,       bkey: FINANCE_TX_BACKUPS_KEY },
    { k: "financeProjects", label: "Финансы: проекты",  key: FINANCE_PROJECTS_KEY, bkey: FINANCE_PROJECTS_BACKUPS_KEY },
    { k: "reports",         label: "Акты",              key: REPORTS_KEY,          bkey: REPORTS_BACKUPS_KEY },
    { k: "users",           label: "Пользователи",      key: USERS_KEY,            bkey: USERS_BACKUPS_KEY },
    ...(DOCUMENT_TEMPLATE_FEATURE.includeBackups ? DOCUMENT_TEMPLATE_BACKUP_SECTIONS : []),
  ];
  // { list, ok } — читаем ТОЛЬКО из облака (getCloudResult, без localStorage-резерва). ok=false =
  // база не ответила ИЛИ значение есть, но это не валидный JSON-массив (битые данные — это ошибка,
  // а не «пустой раздел»). Раньше здесь был getResult — он ради оффлайна возвращал локальную
  // (возможно устаревшую/грязную) копию со статусом "found", и файл всё равно помечался полным,
  // хотя из Firebase ничего не прочитано. Полный бэкап — последняя страховка, врать про полноту нельзя.
  const _readArr = async (key) => {
    try { return classifyCloudArr(await storage.getCloudResult(key)); }
    catch { return { list: [], ok: false }; }
  };
  // Чтение НЕ-массива (объект: настройки/каталог/цены) из облака.
  const _readObj = async (key) => {
    try { return classifyCloudObj(await storage.getCloudResult(key)); }
    catch { return { value: null, ok: false }; }
  };
  // Параллельная обработка с ограничением одновременных запросов (чтобы сотни публичных нод
  // не ушли в облако одним залпом и не словили таймауты/троттлинг). Сохраняет порядок.
  const _mapLimit = async (items, limit, fn) => {
    const out = new Array(items.length);
    let i = 0;
    const worker = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length || 0) }, worker));
    return out;
  };
  // Выгрузка: читаем каждый ключ НАПРЯМУЮ ИЗ FIREBASE (getCloudResult) и отдаём .json файлом.
  // Файл считается ПОЛНЫМ (verifiedFromFirebase:true) только если ВСЕ разделы прочитаны из базы.
  const exportAllJSON = async () => {
    const data = {}; const failed = [];
    // Машиночитаемый статус каждого раздела: "verified" (прочитан из Firebase) / "unavailable"
    // (база не ответила/битые данные). Импорт опирается на него, а не на русские подписи.
    const sectionStatus = {};
    const mark = (k, ok, label) => { sectionStatus[k] = ok ? "verified" : "unavailable"; if (!ok && label) failed.push(label); };
    for (const s of _backupSections) {
      const r = await _readArr(s.key);
      data[s.k] = r.list;
      mark(s.k, r.ok, s.label);
    }
    // Настройки финансов, каталог, цены и матрица прав.
    const meta = await _readObj(FINANCE_META_KEY); data.financeMeta = meta.value; mark("financeMeta", meta.ok, "Финансы: настройки");
    const cat = await _readObj(CATALOG_KEY); data.catalog = cat.value; mark("catalog", cat.ok, "Каталог");
    const prices = await _readObj(PRICES_KEY); data.prices = prices.value; mark("prices", prices.ok, "Цены (переопределения)");
    const permissions = await _readObj(ROLE_PERMISSIONS_KEY); data.rolePermissions = permissions.value; mark("rolePermissions", permissions.ok, "Матрица прав");
    // Журнал аудита: индекс месяцев + каждый помесячный ключ + легаси-журнал (раньше не входил)
    let auditOk = true;
    const auditIdx = await _readArr(AUDIT_INDEX_KEY);
    if (!auditIdx.ok) { auditOk = false; failed.push("Журнал: индекс"); }
    const auditMonths = {};
    for (const ym of (Array.isArray(auditIdx.list) ? auditIdx.list : [])) {
      const mo = await _readArr(AUDIT_MONTH_KEY(ym));
      auditMonths[ym] = mo.list;
      if (!mo.ok) { auditOk = false; failed.push("Журнал: " + ym); }
    }
    const auditLegacy = await _readArr(AUDIT_KEY);
    if (!auditLegacy.ok) { auditOk = false; failed.push("Журнал: архив"); }
    data.audit = { index: auditIdx.list, months: auditMonths, legacy: auditLegacy.list };
    sectionStatus.audit = auditOk ? "verified" : "unavailable";

    // ПУБЛИЧНЫЕ НОДЫ (раньше в бэкап не входили — после восстановления ломались ссылки клиентов):
    // опубликованные КП (ключ по id сметы), кабинеты прогресса и документы кабинета (по progressToken).
    // Читаем параллельно; храним валидный JSON-объект (битый → ошибка раздела). empty → просто пропуск.
    let pubOk = true;
    const publicNodes = { kp: {}, progress: {}, docs: {} };
    const readNode = async (key) => { try { return classifyCloudObj(await storage.getCloudResult(key)); } catch { return { value: null, ok: false }; } };
    const estIds = (data.estimates || []).filter(e => e?.id).map(e => e.id);
    const kpRes = await _mapLimit(estIds, 8, id => readNode(KP_NODE(id)).then(r => ({ id, r })));
    for (const { id, r } of kpRes) {
      if (!r.ok) { pubOk = false; failed.push("КП сметы " + id); continue; }
      if (r.value) publicNodes.kp[id] = r.value;
    }
    const tokens = [...new Set((data.objects || []).filter(o => o?.progressToken).map(o => o.progressToken))];
    const progRes = await _mapLimit(tokens, 8, t => Promise.all([readNode(PROGRESS_NODE(t)), readNode(DOCS_NODE(t))]).then(([pr, dr]) => ({ t, pr, dr })));
    for (const { t, pr, dr } of progRes) {
      if (!pr.ok) { pubOk = false; failed.push("Кабинет " + t); } else if (pr.value) publicNodes.progress[t] = pr.value;
      if (!dr.ok) { pubOk = false; failed.push("Документы кабинета " + t); } else if (dr.value) publicNodes.docs[t] = dr.value;
    }
    data.publicNodes = publicNodes;
    sectionStatus.publicNodes = pubOk ? "verified" : "unavailable";

    if (failed.length) {
      const proceed = window.confirm(`⚠️ База (Firebase) не ответила при чтении: ${failed.join(", ")}.\nЭти разделы попадут в файл ПУСТЫМИ — это НЕ полный бэкап.\n\n⛔ ВАЖНО: такой файл НЕЛЬЗЯ будет использовать для «Восстановить всё» — иначе он затрёт эти разделы пустыми. Годится только для ручного разбора.\n\nРекомендуется отменить, проверить связь и повторить.\nВсё равно скачать неполный файл?`);
      if (!proceed) return;
    }
    const snapshot = {
      _type: "titovstroy-backup", _version: 2,
      _exportedAt: new Date().toISOString(),
      _env: IS_DEV_ENV ? "dev" : "prod",
      verifiedFromFirebase: failed.length === 0,
      databaseProject: firebaseConfig.projectId || "",
      databaseUrl: firebaseConfig.databaseURL || "",
      _sectionStatus: sectionStatus,
      _incomplete: failed.length ? failed : undefined,
      _counts: Object.fromEntries(_backupSections.map(s => [s.k, (data[s.k] || []).length])),
      data,
    };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `titovstroy-backup-${IS_DEV_ENV ? "dev" : "prod"}-${stamp}${failed.length ? "-НЕПОЛНЫЙ" : ""}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  // Безопасное восстановление журнала аудита: ОБЪЕДИНЕНИЕ (не замена). Записи из бэкапа,
  // которых нет в текущем журнале (по сигнатуре), добавляются; существующие не трогаются;
  // ничего не удаляется. Пишем через setCloudOnly. Возвращает { merged, skipped }.
  const _restoreAuditMerge = async (audit) => {
    let merged = 0, skipped = false;
    // Каждый месяц — АТОМАРНО через runTransaction: чтение-слияние-запись за одну операцию,
    // так параллельная новая запись аудита между чтением и записью НЕ теряется. Битое/недоступное
    // текущее значение → транзакция отменяется (committed:false) → помечаем аудит пропущенным.
    const mergeInto = async (key, backupEntries) => {
      if (!Array.isArray(backupEntries) || !backupEntries.length) return;
      let added = 0;
      const res = await storage.mutateTransaction(key, (cur) => {
        const r = mergeAuditEntries(cur, backupEntries);
        added = r.added;
        return r.merged;
      });
      if (!res.committed) { skipped = true; return; }
      merged += added;
    };
    const months = audit.months || {};
    for (const ym of Object.keys(months)) await mergeInto(AUDIT_MONTH_KEY(ym), months[ym]);
    await mergeInto(AUDIT_KEY, audit.legacy);
    // индекс месяцев — тоже атомарно (объединение множеств строк "YYYY-MM"), без потери текущих
    const fromBackup = Array.isArray(audit.index) ? audit.index : Object.keys(months);
    if (fromBackup.length) {
      const idxRes = await storage.mutateTransaction(AUDIT_INDEX_KEY, (cur) => {
        const union = [...new Set([...cur, ...fromBackup])].sort().reverse();
        return union;
      });
      if (!idxRes.committed) skipped = true;
    }
    return { merged, skipped };
  };
  // Загрузка: читаем .json, показываем сводку, требуем ввести «ВОССТАНОВИТЬ»,
  // перед заменой КАЖДЫЙ раздел уходит в свой авто-бэкап, затем ключ перезаписывается.
  const importAllJSON = async (file) => {
    if (!file) return;
    let snap;
    try { snap = JSON.parse(await file.text()); } catch { window.alert("Файл не читается как JSON."); return; }
    if (!snap || snap._type !== "titovstroy-backup" || !snap.data) { window.alert("Это не файл бэкапа TitovStroy."); return; }
    // ПРОВЕРКА СТРУКТУРЫ ДО ЛЮБОЙ ЗАПИСИ: валидный JSON может иметь неверную форму (массив
    // вместо цен, строка вместо каталога, кривые публичные ноды/журнал). При любой ошибке —
    // полная отмена, ни одна запись в Firebase не идёт.
    const _arraySpecs = [
      ..._backupSections.filter(s => !s.managedRestore).map(s => ({ key: s.k, idKey: s.k === "productions" ? "objectId" : "id" })),
      ...(DOCUMENT_TEMPLATE_FEATURE.includeBackups ? documentTemplateBackupSpecs() : []),
    ];
    const schema = validateBackupSchema(snap, _arraySpecs);
    if (!schema.ok) { window.alert("❌ Файл бэкапа повреждён или имеет неверную структуру — восстановление отменено.\n\nПричина: " + schema.error); return; }
    // ЗАПРЕТ МАССОВОГО ВОССТАНОВЛЕНИЯ НЕПОЛНОГО ФАЙЛА: если какой-то раздел не прочитался из
    // Firebase при выгрузке, он лежит в файле ПУСТЫМ — «Восстановить всё» затёр бы им рабочий
    // раздел (например, все объекты → []). Такой файл к массовому restore не допускаем.
    const restorable = isBackupRestorable(snap);
    if (!restorable.ok) { window.alert(`⛔ Массовое восстановление из НЕПОЛНОГО бэкапа запрещено — иначе пустые разделы затрут рабочие данные.\n\nПричина: ${restorable.reason}\n\nСделайте новый полный бэкап при стабильной связи. Неполный файл можно разобрать вручную, но кнопкой «Восстановить всё» его использовать нельзя.`); return; }
    // ЗАЩИТА ОТ ЧУЖОЙ БАЗЫ: файл дев-базы нельзя случайно накатить на боевую (и наоборот).
    // Сверяем И projectId, И hostname databaseURL (один проект может держать несколько RTDB).
    const curProject = firebaseConfig.projectId || "";
    if (snap.databaseProject && snap.databaseProject !== curProject) {
      window.alert(`❌ Восстановление отменено: файл сделан из ДРУГОГО проекта Firebase.\n\nВ файле: ${snap.databaseProject}\nТекущий: ${curProject}\n\nНельзя восстанавливать бэкап одной базы в другую (например, тестовую в боевую).`);
      return;
    }
    const _host = (u) => { try { return new URL(u).host; } catch { return u || ""; } };
    if (snap.databaseUrl && _host(snap.databaseUrl) !== _host(firebaseConfig.databaseURL || "")) {
      window.alert(`❌ Восстановление отменено: файл сделан из ДРУГОЙ базы Realtime Database.\n\nВ файле: ${_host(snap.databaseUrl)}\nТекущая: ${_host(firebaseConfig.databaseURL || "")}\n\nОдин проект Firebase может держать несколько баз — накатывать чужую нельзя.`);
      return;
    }
    // Доступность проверяем ТОЛЬКО по облаку (getCloudResult): getResult мог бы отдать локальную
    // копию и «разрешить» восстановление, которое на деле ушло бы только в localStorage.
    const probe = await storage.getCloudResult(OBJECTS_KEY);
    if (probe.status === "unavailable") { window.alert("База (Firebase) сейчас недоступна — восстановление отменено. Проверьте интернет и повторите."); return; }
    // Read-only вкладка (lease у другой) — восстановление запрещено (центральный гейт всё равно
    // отбил бы каждую запись, но лучше честно сказать сразу).
    if (storage.isReadOnlyTab()) { window.alert("Редактирование открыто в другой вкладке — восстановление возможно только из вкладки-редактора."); return; }
    // 2Б-ОЧЕРЕДЬ ПРОИЗВОДСТВА: сначала дожимаем её, затем требуем ПОЛНУЮ чистоту. Иначе после
    // restore старый durable-draft/retry мог бы примениться поверх только что восстановленной базы.
    try { await flushAllProductionPending(); } catch {}
    const productionPendingNow = () => {
      const allRecovery = countAllProductionRecovery(localStorage);
      return Math.max(
        hasPendingProduction(),
        _prodUnsyncedIds.current.size,
        allRecovery.total,
      );
    };
    if (productionPendingNow() > 0) {
      window.alert(`❌ Восстановление отменено: есть несинхронизированные изменения производства (${productionPendingNow()}).\n\nСначала дождитесь их отправки в облако или устраните конфликт. Иначе старая команда может примениться поверх восстановленного бэкапа.`);
      return;
    }
    // НЕСИНХРОНИЗИРОВАННЫЕ ЛОКАЛЬНЫЕ ПРАВКИ: восстановление через setCloudOnly перезапишет
    // локальную копию и снимет dirty-флаг → незасинканные правки этого устройства пропадут
    // БЕЗ попадания даже в пред-бэкап. Поэтому сначала дожимаем их в облако; если не удалось —
    // ПОЛНОСТЬЮ запрещаем восстановление, пока правки не синхронизированы.
    // Здесь НАМЕРЕННО глобальный dirtyKeys() (не «свои»): restore затирает localStorage целиком,
    // значит блокировать обязаны и правки ДРУГОЙ вкладки, и legacy-карантин.
    let _dirty = storage.dirtyKeys();
    if (_dirty.length) {
      try { await storage.flushDirty(); } catch {}
      _dirty = storage.dirtyKeys();
      if (_dirty.length) {
        window.alert(`❌ Восстановление отменено: на этом устройстве есть несохранённые в облако изменения (${_dirty.length}).\n\nСначала синхронизируйте их с облаком (кнопка «🔄 Повторить синхронизацию» / дождитесь связи) — иначе восстановление их безвозвратно сотрёт.`);
        return;
      }
    }
    const projWarn = !snap.databaseProject ? "\n\n⚠️ В файле НЕ указан проект Firebase (старый формат) — проверьте, что это бэкап ИМЕННО этой базы, иначе можно затереть данные чужими." : "";
    const d = snap.data;
    const lines = _backupSections.map(s => `• ${s.label}: ${Array.isArray(d[s.k]) ? d[s.k].length : "—"}`).join("\n");
    const envWarn = IS_DEV_ENV ? "" : "\n\n⚠️ ЭТО БОЕВАЯ БАЗА. Текущие данные будут ЗАМЕНЕНЫ данными из файла.\nПеред заменой каждый раздел уходит в свой облачный авто-бэкап (откат возможен).";
    // Старые файлы (v1) без verifiedFromFirebase — предупреждаем, что полнота не подтверждена
    const notVerified = snap.verifiedFromFirebase === false || (snap._version || 1) < 2;
    const incompleteWarn = snap._incomplete?.length
      ? `\n\n⚠️ Файл выгружен НЕПОЛНЫМ (база не отвечала при выгрузке): ${snap._incomplete.join(", ")}.`
      : (notVerified ? "\n\n⚠️ У этого файла НЕ подтверждено чтение из Firebase (старый формат) — возможно, часть данных бралась из локальной копии." : "");
    const ok = await confirmTyped(`Восстановить ВСЁ из файла бэкапа?\nОт: ${snap._exportedAt || "?"} · база «${snap._env || "?"}»${snap.databaseProject ? " · проект " + snap.databaseProject : ""}\n\n${lines}${incompleteWarn}${projWarn}${envWarn}`, "ВОССТАНОВИТЬ");
    if (!ok) return;
    // Повторная проверка несинхронизированных правок ПРЯМО ПЕРЕД первой записью: пока показывался
    // диалог подтверждения, пользователь мог что-то отредактировать. Если появились новые dirty —
    // отменяем (защита в глубину: setCloudOnly затёр бы их без пред-бэкапа).
    if (storage.dirtyKeys().length) {
      try { await storage.flushDirty(); } catch {}
      if (storage.dirtyKeys().length) { window.alert("❌ Отменено: за время подтверждения появились несохранённые изменения. Синхронизируйте их и повторите."); return; }
    }
    // За время typed-confirm могла появиться и команда производства (она не имеет __dirty).
    try { await flushAllProductionPending(); } catch {}
    if (productionPendingNow() > 0) {
      window.alert("❌ Отменено: за время подтверждения появились несохранённые изменения производства. Дождитесь синхронизации и повторите.");
      return;
    }
    let done = 0, pubDone = 0, fail = 0; const cloudFailed = [], skipped = [];
    // Восстановление одного ключа: пред-бэкап ТЕКУЩЕГО значения в облако с проверкой fbOk;
    // если текущее значение или список пред-бэкапов недоступны/битые — раздел НЕ трогаем
    // (иначе рискуем затереть без возможности отката, см. preBackupDecision). Пишем через
    // setCloudOnly — при сбое облака НЕ остаётся «грязной» локальной копии, которую автосинк
    // потом молча затолкал бы (restore должен быть подтверждён облаком или честно «не удалось»).
    const restoreKey = async (key, bkey, value, label) => {
      try {
        const cur = await storage.getCloudResult(key);
        const bk = (cur.status === "found" && cur.value) ? await storage.getCloudResult(bkey) : { status: "empty" };
        const decision = preBackupDecision(cur, bk);
        if (decision.action === "skip") { skipped.push(label); return; }
        if (cur.status === "found" && cur.value) {
          const backups = decision.backups;
          let cnt = 0; try { const p = JSON.parse(cur.value); cnt = Array.isArray(p) ? p.length : 0; } catch {}
          if (!backups[0] || backups[0].data !== cur.value) backups.unshift({ ts: Date.now(), by: currentUser?.name || "", count: cnt, data: cur.value });
          const bRes = await storage.setCloudOnly(bkey, JSON.stringify(backups.slice(0, 20)));
          if (!bRes.fbOk) { skipped.push(label); return; } // облачный пред-бэкап не создан — раздел не трогаем
        }
        const setRes = await storage.setCloudOnly(key, JSON.stringify(value));
        if (!setRes.fbOk) { cloudFailed.push(label); return; } // в облако не записалось — раздел НЕ восстановлен
        done++;
      } catch (e) { console.warn("restore fail", key, e); fail++; }
    };
    const has = (k) => Object.prototype.hasOwnProperty.call(d, k);
    for (const s of _backupSections) {
      if (s.managedRestore) continue;
      const list = Array.isArray(d[s.k]) ? d[s.k] : null;
      if (!list) continue; // нет раздела в файле — не трогаем текущий
      await restoreKey(s.key, s.bkey, list, s.label);
    }
    if (DOCUMENT_TEMPLATE_FEATURE.includeBackups) {
      await restoreDocumentTemplateSections({ data: d, has, restoreKey });
    }
    // hasOwnProperty, а не истинность: подтверждённое пустое значение тоже нужно восстановить,
    // иначе старые настройки/цены останутся, хотя в бэкапе их уже не было. Пустой объектный
    // раздел восстанавливаем как {} (не null) — загрузчики каталога/цен/настроек ждут объект.
    const objVal = (v) => (v == null ? {} : v);
    if (has("financeMeta")) await restoreKey(FINANCE_META_KEY, FINANCE_META_BACKUPS_KEY, objVal(d.financeMeta), "Финансы: настройки");
    if (has("catalog")) await restoreKey(CATALOG_KEY, CATALOG_BACKUPS_KEY, objVal(d.catalog), "Каталог");
    if (has("prices")) await restoreKey(PRICES_KEY, PRICES_BACKUPS_KEY, objVal(d.prices), "Цены (переопределения)");
    if (has("rolePermissions")) await restoreKey(ROLE_PERMISSIONS_KEY, ROLE_PERMISSIONS_BACKUPS_KEY, normalizeRolePermissions(objVal(d.rolePermissions)), "Матрица прав");
    // ПУБЛИЧНЫЕ НОДЫ (КП/кабинеты/документы) — с пред-бэкапом: перед перезаписью снимаем текущие
    // значения в PUBLIC_NODES_BACKUPS_KEY (один облачный снимок, откат возможен). Если снять/
    // подтвердить снимок не удалось — публичные ноды НЕ трогаем (иначе теряем принятие КП,
    // замечания клиента, документы без возможности вернуть). Пишем через setCloudOnly.
    if (d.publicNodes) {
      const pn = d.publicNodes;
      const targets = [
        ...Object.entries(pn.kp || {}).map(([id, val]) => ({ key: KP_NODE(id), val, label: "КП сметы " + id })),
        ...Object.entries(pn.progress || {}).map(([t, val]) => ({ key: PROGRESS_NODE(t), val, label: "Кабинет " + t })),
        ...Object.entries(pn.docs || {}).map(([t, val]) => ({ key: DOCS_NODE(t), val, label: "Документы кабинета " + t })),
      ];
      if (targets.length) {
        // снимок текущих значений (ограниченный параллелизм)
        let readFail = false;
        const curVals = await _mapLimit(targets, 8, async (t) => { const r = await storage.getCloudResult(t.key); if (r.status === "unavailable") readFail = true; return { key: t.key, value: (r.status === "found" ? r.value : null) }; });
        if (readFail) {
          skipped.push("Публичные ноды (КП/кабинеты)");
        } else {
          // пред-бэкап истории (сам ключ истории тоже должен быть читаем/не битым)
          const histCur = await storage.getCloudResult(PUBLIC_NODES_BACKUPS_KEY);
          const histDec = preBackupDecision({ status: "found", value: "[]" }, histCur);
          if (histDec.action === "skip") {
            skipped.push("Публичные ноды (КП/кабинеты)");
          } else {
            const snapNodes = {}; for (const c of curVals) if (c.value != null) snapNodes[c.key] = c.value;
            const hist = [{ ts: Date.now(), by: currentUser?.name || "", nodes: snapNodes }, ...histDec.backups].slice(0, 10);
            const bRes = await storage.setCloudOnly(PUBLIC_NODES_BACKUPS_KEY, JSON.stringify(hist));
            if (!bRes.fbOk) {
              skipped.push("Публичные ноды (КП/кабинеты)");
            } else {
              await _mapLimit(targets, 8, async (t) => {
                try { const r = await storage.setCloudOnly(t.key, JSON.stringify(t.val)); if (!r.fbOk) cloudFailed.push(t.label); else pubDone++; }
                catch (e) { console.warn("restore public fail", t.key, e); fail++; }
              });
            }
          }
        }
      }
    }
    // Журнал аудита (audit): безопасное ОБЪЕДИНЕНИЕ (не замена) — записи из бэкапа, которых нет
    // в текущем журнале, добавляются; существующие не трогаются. Так восстановление не затрёт
    // записи, добавленные после снятия бэкапа. Дедуп по сигнатуре записи.
    let auditMerged = 0;
    if (d.audit) {
      const auditRes = await _restoreAuditMerge(d.audit);
      auditMerged = auditRes.merged; if (auditRes.skipped) skipped.push("Журнал изменений");
    }
    // setCloudOnly при сбое НИЧЕГО не сохраняет (даже локально) — поэтому «не записались»
    // означает «нужно повторить», а не «лежит только на этом устройстве».
    const cloudFailedWarn = cloudFailed.length ? `\n\n⚠️ НЕ записаны в облако (сбой связи, повторите восстановление): ${cloudFailed.join(", ")}.` : "";
    const skippedWarn = skipped.length ? `\n\n⛔ ПРОПУЩЕНЫ (текущие данные НЕ тронуты — не удалось безопасно сделать пред-бэкап): ${skipped.join(", ")}.` : "";
    const failWarn = fail ? `\n\n❌ Ошибок при записи: ${fail}.` : "";
    const auditMsg = auditMerged ? `\nЖурнал изменений: +${auditMerged} записей.` : "";
    const pubMsg = pubDone ? `\nПубличных нод (КП/кабинеты): ${pubDone}.` : "";
    const okMsg = (cloudFailed.length || skipped.length || fail) ? "Восстановление завершено ЧАСТИЧНО" : "Восстановление завершено УСПЕШНО";
    window.alert(`${okMsg}: восстановлено разделов — ${done}.${pubMsg}${auditMsg}${failWarn}${skippedWarn}${cloudFailedWarn}\nСтраница сейчас перезагрузится.`);
    setTimeout(() => window.location.reload(), 1000);
  };
  // Выгрузка всех смет отдельной таблицей для Excel (CSV, открывается в Excel напрямую)
  const exportEstimatesXls = async () => {
    const estsR = await _readArr(STORAGE_KEY);
    const objsR = await _readArr(OBJECTS_KEY);
    if (!estsR.ok || !objsR.ok) {
      if (!window.confirm("⚠️ База не ответила — список смет может оказаться пустым или неполным.\nВсё равно скачать?")) return;
    }
    const ests = estsR.list, objs = objsR.list;
    const objById = {}; for (const o of objs) objById[o.id] = o;
    const stLbl = (k) => (STATUSES.find(s => s.key === (k || "new")) || {}).label || k || "";
    const rows = ests.map(e => {
      const obj = e.objectId ? objById[e.objectId] : null;
      const nPos = Object.values(e.rows || {}).filter(r => Number(r?.qty) > 0).length;
      return [
        e.proj?.name || "Без названия",
        e.proj?.phone || "",
        obj?.address || e.proj?.address || "",
        e.proj?.type || "",
        e.proj?.area ? Number(e.proj.area) : "",
        e.createdAt ? new Date(e.createdAt).toLocaleDateString("ru-RU") : "",
        e.dsNumber ? `ДС №${e.dsNumber}` : "основная",
        stLbl(e.status),
        nPos,
        Math.round(Number(e.total) || 0),
      ];
    });
    downloadCSV(`сметы-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Название", "Телефон", "Адрес объекта", "Тип", "Площадь м²", "Дата", "Вид", "Статус", "Позиций", "Сумма клиенту ₸"],
      rows);
  };

  // Точечно вытащить ТОЛЬКО пропавшие сметы из снимка рабочего пространства,
  // не восстанавливая финансы/объекты/договоры (их не трогаем совсем).
  const recoverMissingEstimatesFromWs = async (snap) => {
    const list = Array.isArray(snap?.estimates) ? snap.estimates.filter(e => e && e.id) : [];
    if (!list.length) { window.alert("В этом снимке нет смет."); return; }
    const haveIds = new Set(estimatesRef.current.map(e => e.id));
    const missing = list.filter(e => !haveIds.has(e.id));
    if (missing.length === 0) { window.alert("В этом снимке нет смет, которых сейчас не хватает — все уже на месте."); return; }
    const names = missing.slice(0, 12).map(e => `• ${e.proj?.name || "Без названия"}${e.proj?.address ? ` — ${e.proj.address}` : ""}`).join("\n");
    if (!window.confirm(`Вернуть недостающие сметы из снимка ${new Date(snap.ts).toLocaleString("ru-RU")}?\n\nБудет ДОБАВЛЕНО смет: ${missing.length}\n${names}${missing.length > 12 ? `\n…и ещё ${missing.length - 12}` : ""}\n\nФинансы, объекты и договоры НЕ трогаем — добавятся только пропавшие сметы.`)) return;
    await saveEstimates([...estimatesRef.current, ...missing]);
    setWsBackupsModal(null);
    window.alert(`Возвращено смет: ${missing.length} ✓\nФинансы и всё остальное не тронуты.`);
  };
  const restoreWorkspace = async (snap) => {
    if (!snap) return;
    const o = Array.isArray(snap.objects) ? snap.objects : [];
    const e = Array.isArray(snap.estimates) ? snap.estimates : [];
    const c = Array.isArray(snap.contracts) ? snap.contracts : [];
    const f = Array.isArray(snap.financeTx) ? snap.financeTx : [];
    if (!confirmDangerous(`Восстановить рабочее пространство на ${new Date(snap.ts).toLocaleString("ru-RU")}?\n\nОбъектов: ${o.length}\nСмет: ${e.length}\nДоговоров: ${c.length}\nФин. операций: ${f.length}\n\nТекущее состояние уйдёт в бэкап.`)) return;
    _allowEmptySave.current = true;
    objectsRef.current = o; setObjects(o);
    estimatesRef.current = e; setEstimates(e);
    contractsRef.current = c; setContracts(c);
    if (f.length > 0) { financeTxRef.current = f; setFinanceTx(f); }
    await saveObjects(o, { replace: true, allowEmpty: true });
    await saveEstimates(e, { replace: true });
    await saveContracts(c, { replace: true, allowEmpty: true });
    if (f.length > 0) await saveFinanceTx(f, { replace: true });
    setTimeout(() => { _allowEmptySave.current = false; }, 1500);
    setWsBackupsModal(null);
    window.alert(`Восстановлено ✓\nОбъектов: ${o.length} · Смет: ${e.length} · Договоров: ${c.length} · Фин. операций: ${f.length}`);
  };

  // ── Импорт смет из JSON (восстановление из PDF) ──
  const runImport = async () => {
    let payload;
    try { payload = JSON.parse(importText); }
    catch { window.alert("Не удалось прочитать JSON. Проверьте, что вставлен корректный текст."); return; }
    const incoming = Array.isArray(payload) ? payload
      : Array.isArray(payload?.estimates) ? payload.estimates : null;
    if (!incoming || incoming.length === 0) { window.alert("В JSON нет смет для импорта."); return; }
    const customWorks = Array.isArray(payload?.customWorks) ? payload.customWorks : [];
    if (!confirmDangerous(`Импортировать ${incoming.length} смет(ы)?${customWorks.length?`\nБудет добавлено пользовательских позиций в каталог: ${customWorks.length}.`:""}\nТекущий архив уйдёт в бэкап — откат доступен.`)) return;
    setImportBusy(true);
    try {
      // 1) Добавляем пользовательские позиции в каталог (без дублей по коду)
      if (customWorks.length) {
        const cur = _catalogOverrides;
        const existing = cur.custom || [];
        const codes = new Set(existing.map(w=>w.code));
        const merged = [...existing, ...customWorks.filter(w => !codes.has(w.code))];
        const nextCat = withCatalogOverrides(cur, { custom: merged });
        await storage.set(CATALOG_KEY, JSON.stringify(nextCat));
        setCatalogOverrides(nextCat);            // обновляем _catalogOverrides (для getEffectiveCatalog/getPrice)
        setCatalogVersion(v => v + 1);           // пересобираем Gdyn, чтобы суммы посчитались
      }
      // 2) Добавляем сметы (без дублей по id)
      const cur = estimatesRef.current;
      const existIds = new Set(cur.map(e=>e.id));
      const toAdd = incoming
        // валидируем структуру: объект с id и корректным rows (объект, не массив/строка)
        .filter(e => e && typeof e==="object" && e.id && !existIds.has(e.id)
          && (e.rows===undefined || (typeof e.rows==="object" && !Array.isArray(e.rows))))
        .map(e => ({ ...e, rows: (e.rows && typeof e.rows==="object" && !Array.isArray(e.rows)) ? e.rows : {}, createdAt: e.createdAt||Date.now(), updatedAt: e.updatedAt||Date.now() }));
      if (!toAdd.length) { window.alert("Все сметы из JSON уже есть в архиве (совпадение по id)."); setImportBusy(false); return; }
      const newList = [...toAdd, ...cur];
      estimatesRef.current = newList;
      setEstimates(newList);
      await saveEstimates(newList);
      setImportBusy(false);
      setImportModal(false);
      setImportText("");
      window.alert(`Импортировано смет: ${toAdd.length} ✓`);
    } catch(e) {
      console.error(e);
      setImportBusy(false);
      window.alert("Ошибка импорта: " + (e?.message||e));
    }
  };

  // ── Вычисления текущей сметы ──
  const setRow = useCallback((name, field, val) =>
    setRows(p => ({ ...p, [name]: { ...p[name], [field]: val } })), []);

  const rowPrice = (work) => {
    const r = rows[work.code] || rows[work.name] || {};
    if (r.manualPrice !== undefined && r.manualPrice !== "") { const n = Number(r.manualPrice); return isNaN(n) ? null : n; }
    const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
    return getPrice(work, Number(r.qty || 0), r.complexity || "std", cpxPct);
  };
  const rowTotal = (work) => {
    const qty = Number((rows[work.code] || rows[work.name] || {}).qty || 0);
    const price = rowPrice(work);
    return qty > 0 && price ? qty * price : 0;
  };
  // Возвращает "цену от" если у работы нет точной цены (не идёт в расчёт)
  const rowPriceFrom = (work) => {
    const r = rows[work.code] || rows[work.name] || {};
    if (r.manualPrice !== undefined && r.manualPrice !== "") return null; // ручная цена — точная
    const w = getEffectiveWork(work);
    if (w.fixedPrice || (w.tiers && w.tiers.length > 0) || w.cost) return null; // есть точная цена
    return w.priceFrom || null;
  };
  // Единый проход по каталогу — вычисляет все суммы за O(n) один раз при изменении rows
  const allSumMap = useMemo(() => {
    const subMap = {};
    const catMap = {};
    let grandTotal = 0;
    for (const cat of Object.keys(Gdyn)) {
      let catTotal = 0;
      for (const sub of Object.keys(Gdyn[cat]||{})) {
        let subTotal = 0;
        for (const w of (Gdyn[cat][sub]||[])) {
          const r = rows[w.code] || rows[w.name] || {};
          const qty = Number(r.qty || 0);
          if (!qty) continue;
          const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
          const mp = Number(r.manualPrice);
          const price = (r.manualPrice !== undefined && r.manualPrice !== "" && !isNaN(mp))
            ? mp
            : getPrice(w, qty, r.complexity || "std", cpxPct);
          if (price) subTotal += qty * price;
        }
        subMap[cat+"||"+sub] = subTotal;
        catTotal += subTotal;
      }
      catMap[cat] = catTotal;
      grandTotal += catTotal;
    }
    return { subMap, catMap, grand: grandTotal };
  }, [rows, catalogVersion]);
  const subSum = (cat, sub) => allSumMap.subMap[cat+"||"+sub] || 0;
  const catSum = (cat) => allSumMap.catMap[cat] || 0;
  const grand = Number(allSumMap.grand) || 0;
  const _markup = Number(markup) || 0;
  const _discount = Number(discount) || 0;
  const markupAmt = grand * _markup / 100;
  const grandWithMarkup = grand + markupAmt; // база для клиента (markup скрыт)
  const discAmt = grandWithMarkup * _discount / 100;
  const final = Math.round(grandWithMarkup - discAmt); // округляем итог, чтобы не копилась дробная погрешность в сохранённом total
  const kpData = useMemo(() => {
    const mm = 1 + markup / 100;
    const out = [];
    const fromOut = [];
    for (const cat of cats) for (const sub of Object.keys(Gdyn[cat]||{})) for (const w of Gdyn[cat]?.[sub]||[]) {
      const qty = Number((rows[w.code]||rows[w.name]||{}).qty||0);
      if (qty <= 0) continue;
      const r = rows[w.code]||rows[w.name]||{};
      const displayName = r.manualName !== undefined ? r.manualName : w.name;
      const displayUnit = r.manualUnit !== undefined ? r.manualUnit : w.unit;
      const price = rowPrice(w);
      if (price) {
        out.push({ ...w, name: displayName, unit: displayUnit, qty, price: price * mm, total: qty * price * mm });
      } else {
        const pf = rowPriceFrom(w);
        if (pf) fromOut.push({ ...w, name: displayName, unit: displayUnit, qty, priceFrom: pf });
      }
    }
    return { items: out, fromItems: fromOut };
  }, [rows, markup]);
  const kpItems = kpData.items;
  const kpFromItems = kpData.fromItems;
  const filledCount = useMemo(() => Object.values(rows).filter(r => Number(r?.qty) > 0).length, [rows]);
  const nonViewerUsers = useMemo(() => allUsers.filter(u => u.role !== "viewer"), [allUsers]);
  const debouncedSearch = useDebounce(search, 250);
  const searchResults = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    const q = debouncedSearch.toLowerCase();
    return getEffectiveCatalog().filter(w =>
      w.name.toLowerCase().includes(q) || w.sub.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q)
    );
  }, [debouncedSearch, catalogVersion]);
  const isSearching = search.trim().length > 0;
  // Мемоизированные вычисления аналитики — пересчитываются только при изменении данных
  const analyticsData = useMemo(() => {
    const liveObjects = analyticsObjects.filter(o => o && !o.deletedAt);
    const now = Date.now();
    let fromTs = 0, toTs = now;
    if(statsPeriod==="custom"){
      fromTs = statsDateFrom ? new Date(statsDateFrom).getTime() : 0;
      toTs   = statsDateTo   ? new Date(statsDateTo).getTime()+86399999 : now;
    } else if(statsPeriod==="all") {
      fromTs = 0;
    } else {
      const nd = new Date();
      if(statsPeriod==="week") { nd.setDate(nd.getDate()-6); fromTs = nd.getTime(); }
      else { // month, 3month — считаем от 1-го числа
        const d = new Date(nd.getFullYear(), nd.getMonth(), 1);
        if(statsPeriod==="3month") d.setMonth(d.getMonth()-2);
        fromTs = d.getTime();
      }
    }
    const inRange = ts => (ts||0) >= fromTs && (ts||0) <= toTs;
    const catalogForStats = getEffectiveCatalog();
    // Карта работ по имени и коду (строки смет ключуются по name, старые иногда по code)
    const workLookup = new Map();
    for(const w of catalogForStats){ if(w?.name) workLookup.set(w.name, w); if(w?.code) workLookup.set(w.code, w); }
    // Себестоимость одной сметы по заполненным позициям
    const estCost = (e) => {
      let cost = 0;
      for(const [key,r] of Object.entries(e.rows||{})){
        const qty = Number(r?.qty||0); if(!qty) continue;
        const w = workLookup.get(key);
        if(w) cost += rowCostPerUnit(r,w)*qty;
      }
      return cost;
    };

    // ── ОБЪЕКТ-ЦЕНТРИЧНАЯ МОДЕЛЬ ──
    // Единица учёта — ОБЪЕКТ (сделка). Стоимость объекта = сумма всех его смет (основная + доп. сметы).
    const accessibleObjectIds = new Set(liveObjects.map(o => o.id));
    const scopedEstimates = analyticsEstimates.filter(e => e.objectId && accessibleObjectIds.has(e.objectId));
    const estByObj = {}; // objectId -> [сметы]
    for(const e of scopedEstimates){ if(e.objectId){ (estByObj[e.objectId]||(estByObj[e.objectId]=[])).push(e); } }
    const objVal  = (o) => (estByObj[o.id]||[]).reduce((s,e)=>s+(e.total||0),0);
    const objCost = (o) => (estByObj[o.id]||[]).reduce((s,e)=>s+estCost(e),0);
    const objType = (o) => o.objType || "—";

    const baseObjsAll = liveObjects
      // импортированные миграцией объекты не имеют реальной даты создания (финансы→объекты) — учитываем их только во «Всё время»
      .filter(o => statsPeriod==="all" || o.createdBy!=="migration")
      .filter(o => inRange(o.createdAt||0))   // когорта строго по дате СОЗДАНИЯ (без отката на updatedAt — иначе правка/архивация тянет объект в период)
      .filter(o => !statsManager || (o.manager||"")===statsManager);
    // Рабочее множество — БЕЗ архива (как на дашборде); архив виден только в разбивке «по статусам»
    const baseObjs = baseObjsAll.filter(o => o.status!=="archive");
    // Договора, сформированные ВНУТРИ объектов (привязаны к объекту), без «Прочих договоров»
    const baseCon = contracts
      .filter(c => !c.deletedAt)
      .filter(c => c.objectId)
      .filter(c => accessibleObjectIds.has(c.objectId))
      .filter(c => inRange(new Date(c.date||0).getTime()))
      .filter(c => (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0)>0)
      .filter(c => !statsManager || (c.manager||"")=== statsManager);

    // Сводка по объектам (заменяет старые «сметы»)
    const totalEst = baseObjs.length;
    const withSumEst = baseObjs.filter(o=>objVal(o)>0);
    const totalSumEst = withSumEst.reduce((s,o)=>s+objVal(o),0);
    const avgEst = withSumEst.length ? Math.round(totalSumEst/withSumEst.length) : 0;
    const totalCon = baseCon.length;
    const totalSumCon = baseCon.reduce((s,c)=>s+(c.works||[]).reduce((ss,w)=>ss+(w.quantity*w.price||0),0),0);
    const avgCon = totalCon ? Math.round(totalSumCon/totalCon) : 0;
    const byStatus = {}; for(const s of DEAL_STATUSES) byStatus[s.key]=baseObjsAll.filter(o=>(o.status||"new")===s.key).length;
    const byType = {}; for(const o of baseObjs){ const t=objType(o); byType[t]=(byType[t]||0)+1; }

    // ── A. Финансовый обзор — по ПОДПИСАННЫМ объектам (статус объекта = источник правды) ──
    const signedObjsFin = baseObjs.filter(o=>o.status==="signed"&&objVal(o)>0);
    const wonRevenue  = signedObjsFin.reduce((s,o)=>s+objVal(o),0);
    const wonCost     = signedObjsFin.reduce((s,o)=>s+objCost(o),0);
    const wonProfit   = wonRevenue - wonCost;
    const wonMargin   = wonRevenue>0 ? Math.round(wonProfit/wonRevenue*100) : 0;
    // Потенциал — все активные объекты с суммой (кроме архива)
    const potentialObjs = baseObjs.filter(o=>o.status!=="archive"&&objVal(o)>0);
    const allRevenue  = potentialObjs.reduce((s,o)=>s+objVal(o),0);
    const allCost     = potentialObjs.reduce((s,o)=>s+objCost(o),0);
    const allProfit   = allRevenue - allCost;
    const allMargin   = allRevenue>0 ? Math.round(allProfit/allRevenue*100) : 0;

    // ── B. Воронка сделок по статусам ОБЪЕКТОВ (архив — терминал, не стадия) ──
    const funnelStatusesAn = DEAL_STATUSES.filter(s=>s.key!=="archive");
    const funnel = funnelStatusesAn.map(s=>{
      const list = baseObjs.filter(o=>(o.status||"new")===s.key);
      const sum  = list.reduce((a,o)=>a+objVal(o),0);
      const cost = list.reduce((a,o)=>a+objCost(o),0);
      return { key:s.key, label:s.label, color:s.color, bg:s.bg, count:list.length, sum, profit:sum-cost };
    });
    const signedB = funnel.find(f=>f.key==="signed") || {count:0,sum:0,profit:0};
    const refuseB = funnel.find(f=>f.key==="refuse") || {count:0,sum:0,profit:0};
    const activeObjsCount = baseObjs.filter(o=>o.status!=="archive").length;
    // Общая конверсия = подписано / все активные объекты
    const winRateOverall = activeObjsCount>0 ? Math.round(signedB.count/activeObjsCount*100) : 0;
    // Close-rate = подписано / решённые (подписано + отказ)
    const winRateSent    = (signedB.count+refuseB.count)>0 ? Math.round(signedB.count/(signedB.count+refuseB.count)*100) : 0;

    // ── D. Рентабельность по категориям (по сметам объектов в периоде) ──
    const objIdSet = new Set(baseObjs.map(o=>o.id));
    const estForCats = scopedEstimates.filter(e=>e.objectId && objIdSet.has(e.objectId));
    const catFin = {};
    for(const e of estForCats){
      for(const [key,r] of Object.entries(e.rows||{})){
        const qty=Number(r?.qty||0); if(!qty) continue;
        const w=workLookup.get(key); if(!w) continue;
        const mp = Number(r.manualPrice);
        const price = (r.manualPrice!==undefined&&r.manualPrice!==""&&!isNaN(mp)) ? mp : getPrice(w, qty, r.complexity||"std", r.cpxPct!==undefined?Number(r.cpxPct):undefined);
        const c = w.cat||"—";
        if(!catFin[c]) catFin[c]={cat:c, revenue:0, cost:0};
        if(price) catFin[c].revenue += price*qty;
        catFin[c].cost += rowCostPerUnit(r,w)*qty;
      }
    }
    const catProfit = Object.values(catFin)
      .map(c=>({...c, profit:c.revenue-c.cost, margin:c.revenue>0?Math.round((c.revenue-c.cost)/c.revenue*100):0}))
      .sort((a,b)=>b.profit-a.profit).slice(0,8);
    const topCats = catProfit.slice(0,5).map(c=>[c.cat, c.revenue]); // совместимость

    // ── C. Менеджеры: объекты, оборот, прибыль, маржа, % сдачи ──
    const validManagerNames = new Set(nonViewerUsers.map(u=>u.name));
    const managers = [...new Set(liveObjects.map(o=>o.manager||"").filter(m=>m&&validManagerNames.has(m)))];
    const managerStats = managers.map(m=>{
      const mos = baseObjs.filter(o=>(o.manager||"")===m);
      const withSum = mos.filter(o=>objVal(o)>0);
      const sum = withSum.reduce((s,o)=>s+objVal(o),0);
      const cost = withSum.reduce((s,o)=>s+objCost(o),0);
      const profit = sum-cost;
      const inwork = mos.filter(o=>o.status==="approval").length;
      const done = mos.filter(o=>o.status==="signed").length;
      const activeLeads = mos.filter(o=>o.status!=="archive").length;
      const conv = activeLeads>0 ? Math.round(done/activeLeads*100) : 0;
      return {name:m, count:mos.length, sum, profit, margin: sum>0?Math.round(profit/sum*100):0, sent:inwork, agreed:done, conv};
    }).sort((a,b)=>b.profit-a.profit);

    // ── E. Динамика по месяцам (по объектам, их сумме и конверсии) ──
    const monthMap = {};
    for(const o of baseObjs){
      if(o.status==="archive") continue;
      const d = new Date(o.createdAt||o.updatedAt||0);
      const key = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      if(!monthMap[key]) monthMap[key]={key, revenue:0, cost:0, total:0, signed:0};
      monthMap[key].revenue += objVal(o);
      monthMap[key].cost += objCost(o);
      monthMap[key].total += 1;
      if(o.status==="signed") monthMap[key].signed += 1;
    }
    const MONTH_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
    const monthly = Object.values(monthMap).sort((a,b)=>a.key.localeCompare(b.key)).slice(-12).map(m=>{
      const [y,mo]=m.key.split("-");
      return {...m, label: MONTH_RU[Number(mo)-1]+" "+y.slice(2), profit:m.revenue-m.cost, conv:m.total>0?Math.round(m.signed/m.total*100):0};
    });

    // ── F. «Зависшие» объекты в работе (без движения 14+ дней) ──
    const STALE_DAYS = 14;
    const nowMs = Date.now();
    const staleSent = liveObjects
      .filter(o=>o.status==="approval")
      .map(o=>({e:{id:o.id, proj:{name:o.clientName||o.address||"Объект", phone:o.clientPhone}, total:objVal(o), _obj:o}, days: Math.floor((nowMs-(o.updatedAt||0))/864e5)}))
      .filter(x=>x.days>=STALE_DAYS)
      .sort((a,b)=>b.days-a.days)
      .slice(0,10);
    const TYPE_L2 = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронирование"};
    const byConType = {}; for(const c of baseCon){ const t=TYPE_L2[c.type||"repair_fiz"]||"--"; byConType[t]=(byConType[t]||0)+1; }

    // ── G. Средний цикл сделки (от создания до подписания, в днях) ──
    const signedObjs = baseObjs.filter(o=>o.status==="signed"&&o.createdAt&&o.updatedAt&&o.updatedAt>o.createdAt);
    const avgDealDays = signedObjs.length>0 ? Math.round(signedObjs.reduce((s,o)=>s+Math.floor((o.updatedAt-o.createdAt)/864e5),0)/signedObjs.length) : null;
    // Среднее время «зависания» открытых сделок в согласовании (от создания до сейчас)
    const approvalOpen = liveObjects.filter(o=>o.status==="approval"&&(!statsManager||(o.manager||"")===statsManager));
    const avgApprovalDays = approvalOpen.length>0 ? Math.round(approvalOpen.reduce((s,o)=>s+Math.floor((nowMs-(o.createdAt||o.updatedAt||nowMs))/864e5),0)/approvalOpen.length) : null;

    // ── H. Конверсия по типу объекта (архив не в знаменателе — искажал бы конверсию) ──
    const convByType = {};
    for(const o of baseObjs){
      if(o.status==="archive") continue;
      const t = o.objType||"Вторичка";
      if(!convByType[t]) convByType[t]={total:0,signed:0,sumAll:0,sumSigned:0};
      convByType[t].total++;
      convByType[t].sumAll += objVal(o);
      if(o.status==="signed"){ convByType[t].signed++; convByType[t].sumSigned+=objVal(o); }
    }

    // ── I. Топ-5 объектов периода по сумме ──
    const topObjects = [...withSumEst].sort((a,b)=>objVal(b)-objVal(a)).slice(0,5);

    return { baseEst: baseObjs, baseCon, totalEst, withSumEst, totalSumEst, avgEst, totalCon, totalSumCon, avgCon, byStatus, byType, topCats, managers, managerStats, byConType, TYPE_L2,
      wonRevenue, wonCost, wonProfit, wonMargin, allRevenue, allCost, allProfit, allMargin,
      funnel, winRateOverall, winRateSent, signedB, refuseB, catProfit, monthly, staleSent,
      avgDealDays, avgApprovalDays, signedObjsCount: signedObjs.length, convByType, topObjects, objVal };
  }, [analyticsObjects, analyticsEstimates, contracts, statsPeriod, statsDateFrom, statsDateTo, statsManager, allUsers, catalogVersion]);

  // Защита от краша: если activeCat не в Gdyn — берём первый
  const safeCat = Gdyn[activeCat] ? activeCat : (Object.keys(Gdyn)[0]||"");
  const subs = Object.keys(Gdyn[safeCat] || {});
  const safeActiveSub = subs.includes(activeSub) ? activeSub : (subs[0]||"");

  // ── Перенести смету (и её доп. сметы) в новый объект ──
  const moveEstimateToObject = async (est) => {
    if (!accessAllows(currentPermissions.objectCreate, isOwnEstimate(est))) return;
    if (est.objectId) { window.alert("Эта смета уже привязана к объекту"); return; }
    const p = est.proj || {};
    if (!window.confirm(`Создать объект из сметы «${p.name||"Без названия"}» и перенести её туда?`)) return;
    const objId = genId();
    const newObj = {
      id: objId,
      clientId:"", clientName: p.name||"", clientPhone: p.phone||"", clientType:"физ",
      clientIin:"", clientDoc:"", address: p.address||"", objType: p.type||"Вторичка",
      area: p.area||"", status:"approval", note:"",
      manager: est.proj?.manager || currentUser.name,
      createdBy: est.createdBy || currentUser.name, createdById: currentUser.id,
      createdAt: est.createdAt || Date.now(), updatedAt: Date.now(),
    };
    // привязываем смету + все её доп. сметы
    const childIds = new Set(estimatesRef.current.filter(e=>e.parentId===est.id).map(e=>e.id));
    const newList = estimatesRef.current.map(e=>{
      if (e.id===est.id || childIds.has(e.id)) return {...e, objectId: objId};
      return e;
    });
    await saveObjects([newObj, ...objectsRef.current]);
    await saveEstimates(newList, { replace:true });
    window.alert(`Объект создан ✓ Смета перенесена в «Объекты»`);
  };

  // ── Открыть смету на редактирование ──
  const openEstimate = (est) => {
    if (!canEditEstimate(est)) return;
    setCurrentId(est.id);
    setCurrentParentId(est.parentId || null);
    setCurrentDsNumber(est.dsNumber || null);
    setCurrentObjectId(est.objectId || null);
    const validNames = new Set(nonViewerUsers.map(u=>u.name));
    const p = est.proj || {...EMPTY_PROJ};
    setProj({...p, manager: validNames.has(p.manager||"") ? p.manager : ""});
    setRows(migrateRowsToCodeKeys(est.rows || {}, getEffectiveCatalog()));
    setDiscount(est.discount || 0);
    setMarkup(est.markup || 0);
    setNote(est.note || "");
    setEstStatus(est.status || "new");
    setEstSentAt(est.sentAt || "");
    setEstComment(est.comment || "");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    setScreen("editor");
  };

  // ── Новая смета ──
  const newEstimate = () => {
    if (!canCreateEstimateFor(null)) return;
    const id = genId();
    setCurrentId(id);
    setCurrentParentId(null);
    setCurrentDsNumber(null);
    setCurrentObjectId(null);
    setProj({...EMPTY_PROJ, manager: currentUser.name, _createdBy: currentUser.name, _createdById: currentUser.id});
    setRows({});
    setDiscount(0);
    setMarkup(0);
    setNote("");
    setEstStatus("new");
    setEstSentAt("");
    setEstComment("");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    setScreen("editor");
  };

  // ── Сохранить текущую и вернуться к списку ──
  // Вернуться из редактора сметы туда, откуда пришли (к объекту или в список смет)
  const _backFromEditor = () => {
    const retObjId = objectReturnId || currentObjectId;
    if (retObjId) {
      const obj = objectsRef.current.find(x=>x.id===retObjId);
      setObjectReturnId(null);
      setObjectTab("workspace");
      setScreen("objects");
      if (obj) setCurrentObject({...obj});
      return;
    }
    if (dealReturnId) {
      const dl = dealsRef.current.find(x=>x.id===dealReturnId);
      setDealReturnId(null);
      if (dl) { setCurrentDeal({...dl}); setDealTab("editor"); setScreen("deals"); return; }
    }
    setScreen("list");
  };
  const saveAndBack = async () => {
    const cur = estimatesRef.current;
    const exists = cur.find(e => e.id === currentId);
    const allowed = exists
      ? accessAllows(currentPermissions.estimateEdit, isOwnEstimate(exists))
      : canCreateEstimateFor(currentObjectId ? { id: currentObjectId } : null);
    if (!allowed) {
      _backFromEditor();
      return;
    }
    // ЗАЩИТА: не затирать смету с позициями пустой версией (если не явный сброс)
    if (exists && countFilled(exists.rows) > 0 && countFilled(rows) === 0 && !_allowEmptySave.current) {
      if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
      _backFromEditor();
      return;
    }
    const _ep = exists?.parentId && exists.parentId!==currentId ? exists.parentId : null;
    const pId = currentParentId || _ep;
    const dsN = pId ? (currentDsNumber || exists?.dsNumber) : null;
    const updated = {
      id: currentId,
      proj, rows, discount, markup, note,
      status: estStatus,
      sentAt: estStatus === "sent" ? (estSentAt || exists?.sentAt || new Date().toISOString().slice(0,10)) : (exists?.sentAt || null),
      comment: estComment,
      createdAt: exists?.createdAt || Date.now(),
      createdBy: exists?.createdBy || currentUser.name,
      updatedAt: Date.now(),
      updatedBy: currentUser.name,
      total: final,
      ...((currentObjectId || exists?.objectId) ? {objectId: currentObjectId || exists.objectId} : {}),
      ...(pId ? {parentId:pId, dsNumber:dsN} : {}),
    };
    updated.history = _appendHistory(exists, updated);
    const newList = exists
      ? cur.map(e => e.id === currentId ? updated : e)
      : [updated, ...cur];
    if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
    estimatesRef.current = newList;
    setEstimates(newList);
    // Навигируем сразу (не ждём облако), сохраняем в фоне — иначе кнопка «не нажимается» при медленном сохранении
    const retObj = objectReturnId;
    const retDeal = dealReturnId;
    _backFromEditor();
    saveEstimates(newList);
    // если редактировали смету объекта — обновляем updatedAt объекта (фон)
    if (retObj) {
      const obj = objectsRef.current.find(x=>x.id===retObj);
      if (obj) {
        const updObj = {...obj, updatedAt: Date.now()};
        const rest = objectsRef.current.filter(x=>x.id!==obj.id);
        saveObjects([...rest, updObj]);
      }
    }
    // если редактировали смету сделки — синхронизируем итог обратно в сделку (фон)
    if (retDeal) {
      const dl = dealsRef.current.find(x=>x.id===retDeal);
      if (dl) {
        const updDeal = {...dl, estId: currentId, total: final, updatedAt: Date.now()};
        const rest = dealsRef.current.filter(x=>x.id!==dl.id);
        saveDeals([...rest, updDeal]);
      }
    }
  };

  // ── Новая доп. смета (ДС) к существующей ──
  const newSupplementaryEstimate = (parentEst) => {
    if (!canCreateEstimateFor(parentEst)) return;
    const cur = estimatesRef.current;
    const siblings = cur.filter(e => e.parentId === parentEst.id);
    const dsNumber = siblings.length + 1;
    const id = genId();
    setCurrentId(id);
    setCurrentParentId(parentEst.id);
    setCurrentDsNumber(dsNumber);
    setCurrentObjectId(parentEst.objectId || null);
    setProj({...(parentEst.proj||EMPTY_PROJ), manager: currentUser.name});
    setRows({});
    setDiscount(0);
    setMarkup(parentEst.markup||0);
    setNote("");
    setEstStatus("new");
    setEstSentAt("");
    setEstComment("");
    setSearch("");
    setActiveCat(cats[0]);
    setActiveSub(Object.keys(Gdyn[cats[0]]||{})[0]);
    // Сохраняем parentId до открытия редактора — автосохранение подхватит
    const newEst = {id, parentId: parentEst.id, dsNumber, ...(parentEst.objectId?{objectId:parentEst.objectId}:{}), proj:{...(parentEst.proj||EMPTY_PROJ)}, rows:{}, discount:0, markup:parentEst.markup||0, note:"", status:"new", comment:"", createdAt:Date.now(), createdBy:currentUser.name, updatedAt:Date.now(), updatedBy:currentUser.name, total:0};
    const newList = [newEst, ...cur];
    estimatesRef.current = newList;
    setEstimates(newList);
    saveEstimates(newList);
    setScreen("editor");
  };

  // ── Удалить смету ──
  const deleteEstimate = async (id) => {
    const target = estimatesRef.current.find(e => e.id === id);
    if (!target || !canDeleteEstimate(target)) return;
    const newList = estimatesRef.current.filter(e => e.id !== id);
    estimatesRef.current = newList;
    setEstimates(newList);
    // явное удаление — разрешаем пустой результат и удаляем по id из объединённого набора
    _allowEmptySave.current = true;
    await saveEstimates(newList, { removedIds: [id] });
    setTimeout(() => { _allowEmptySave.current = false; }, 1000);
  };



  // ── Генерация HTML договора ──
  const buildContractHtml = (c, client, ca, forDocx=false, stamp=stampBase64) => {
    const type = c.type || "repair_fiz";
    // Экранирование пользовательских данных в HTML (имена, адреса, названия работ
    // со спецсимволами < > & не должны ломать вёрстку печати или быть XSS)
    const esc = s => String(s==null?"":s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
    const fmtN = n => Math.round(n||0).toLocaleString("ru-RU");
    const fmtDate = s => {
      if(!s) return {d:"__",m:"___________",y:"____",full:"__.__.______"};
      const ms=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
      const dt=new Date(s+"T00:00:00"); if(isNaN(dt)) return {d:s,m:"",y:"",full:s};
      return {d:String(dt.getDate()).padStart(2,"0"),m:ms[dt.getMonth()],y:String(dt.getFullYear()),full:dt.toLocaleDateString("ru-RU")};
    };
    const dt = fmtDate(c.date);
    const dtM = fmtDate(c.mainDate||c.date);
    const dtA = fmtDate(c.annexDate||c.date);
    const total = (c.works||[]).reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
    const CSS = forDocx
      ? `*{margin:0;padding:0}
  body{font-family:Verdana,Geneva,Tahoma,sans-serif;font-size:10pt;color:#000;line-height:1.5}
  p{margin:3pt 0;text-align:justify}
  .c{text-align:center}.b{font-weight:bold}.t{font-size:13pt;font-weight:bold;text-align:center;margin:6pt 0}
  .s{font-weight:bold;margin:8pt 0 3pt}
  .city-line{text-align:center}
  table{width:100%;border-collapse:collapse;font-size:8pt;table-layout:fixed}
  th,td{border:1px solid #000;padding:2pt 4pt;word-wrap:break-word}
  th{background:#e5e7eb;font-weight:bold;text-align:center;font-size:8pt}
  .tc{text-align:center}.tr{text-align:right}
  .st{width:100%;border-collapse:collapse}
  .st td{border:none;vertical-align:top;width:50%;padding:0 8pt 0 0;font-size:9pt}`
      : `*{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Verdana,Geneva,Tahoma,sans-serif;padding:20mm 15mm 20mm 30mm;line-height:1.5;color:#000;font-size:10pt}
  p{margin:3pt 0;text-align:justify}
  .c{text-align:center}.b{font-weight:bold}.t{font-size:13pt;font-weight:bold;text-align:center;margin:6pt 0}
  .s{font-weight:bold;margin:8pt 0 3pt}
  .city-line{text-align:center;margin:4pt 0}
  table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:8pt;table-layout:fixed}
  th,td{border:1px solid #000;padding:2pt 4pt;word-wrap:break-word}
  th{background:#e5e7eb;font-weight:bold;text-align:center;font-size:8pt}
  .tc{text-align:center}.tr{text-align:right}
  .st{width:100%;border-collapse:collapse;margin-top:20pt;table-layout:auto}
  .st td{border:none;vertical-align:top;width:50%;padding:0 8pt 0 0;font-size:9pt;line-height:1.8}
  tr{page-break-inside:avoid}
  @media print{.np{display:none}body{padding:10mm 10mm 10mm 20mm}@page{size:A4;margin:0}
  tr{page-break-inside:avoid}table{page-break-inside:auto}}`
    const isYur = client?.clientType==="yur" || client?.type==="юр";
    const clName = esc(client?.name||"___________________");
    const clIIN = esc(client?.iin||"___________________");
    const clDoc = esc(client?.doc||"___________________");
    const clDir = esc(client?.director||"");
    const clAddr = esc(client?.address||"___________________");
    const clPhone = esc(client?.phone||"___________________");
    const clShort = esc((() => {
      if(!client?.name) return "___";
      const parts=(client.name||"").split(" ");
      if(isYur) return client.name;
      return parts[0]+" "+(parts[1]?parts[1][0]+".":"")+(parts[2]?parts[2][0]+".":"");
    })());
    const TITOV = {
      name: esc(ca?.name||'ТОО "TITOVSTROY"'),
      bin:  esc(ca?.bin||"231040002769"),
      bank: esc(ca?.bank||'АО "Kaspi Bank"'),
      bik:  esc(ca?.bik||"CASPKZKA"),
      acc:  esc(ca?.account||"KZ38722S000030058973"),
      addr: esc(ca?.address||"Казахстан, район им.Казыбек би, улица Кирпичная, дом 8г"),
      phone:esc(ca?.phone||"8707 667 8766"),
      email:esc(ca?.email||"titovstroy@mail.ru"),
      dir:  esc(ca?.director||"Титов В.Е."),
    };
    const sigBlock = (role1="Подрядчик:", role2="Заказчик:") => {
      let clSigRight = "";
      if(isYur){
        clSigRight = "<b>"+role2+"</b><br><br>"+clName+"<br>БИН: "+clIIN;
        if(client?.bank) clSigRight += "<br>Банк: "+esc(client.bank);
        if(client?.bik)  clSigRight += "<br>БИК: "+esc(client.bik);
        if(client?.account) clSigRight += "<br>ИИК: "+esc(client.account);
        if(clAddr)  clSigRight += "<br>Юр.Адрес: "+clAddr;
        if(clPhone) clSigRight += "<br>Тел.: "+clPhone;
        if(client?.email) clSigRight += "<br>Почта: "+esc(client.email);
        if(client?.director) clSigRight += "<br><br>Директор:<br>"+esc(client.directorShort||client.director)+" ____________________  М.П.";
      } else {
        clSigRight = "<b>"+role2+"</b><br><br>ФИО: "+clName+"<br>ИИН: "+clIIN+"<br>№ документа: "+clDoc+"<br>Адрес: "+clAddr+"<br>Тел.: "+clPhone+"<br><br>"+clShort+" Подпись ___________";
      }
      const tbl = '<table class="st"><tr>';
      const td1 = "<td><b>"+role1+"</b><br>"+TITOV.name+"<br>БИН "+TITOV.bin+"<br>Банк: "+TITOV.bank+"<br>БИК: "+TITOV.bik+"<br>Номер счёта: "+TITOV.acc+"<br>Юр.Адрес: "+TITOV.addr+"<br>Тел.: "+TITOV.phone+"<br>Email: "+TITOV.email+"<br><br>Генеральный директор:<br>"+TITOV.dir+" _______________ "+(stamp ? '<img src="'+stamp+'" style="width:200px;height:200px;object-fit:contain;vertical-align:middle;margin-left:6px;opacity:0.85;mix-blend-mode:multiply" alt=\"М.П.\"/>' : "М.П.")+"</td>";
      const td2 = "<td>"+clSigRight+"</td>";
      return tbl+td1+td2+"</tr></table>";
    };
    const worksTable = () => {
      const works = c.works||[];
      const catOrder = [], catMap = {};
      works.forEach(w=>{
        const cat = w.category||"Работы";
        if(!catMap[cat]){ catMap[cat]={total:0,rows:[]}; catOrder.push(cat); }
        const sum = w.priceFrom ? 0 : Number(w.quantity||0)*Number(w.price||0);
        catMap[cat].total += sum;
        catMap[cat].rows.push(Object.assign({},w,{sum:sum}));
      });
      const multiCat = catOrder.length > 1;
      // For DOCX: use width="" attribute which html-docx-js respects
      const thW = forDocx
        ? (w,txt,align) => "<th width=\""+w+"\" style=\"width:"+w+";font-size:7.5pt;background:#e5e7eb;font-weight:bold;text-align:"+(align||"center")+";border:1px solid #000;padding:2pt 3pt\">"+txt+"</th>"
        : (w,txt,align) => "<th style=\"width:"+w+";text-align:"+(align||"center")+"\">" + txt + "</th>";
      let html = "<table"+(forDocx ? ' width="100%" style="table-layout:fixed;width:100%;border-collapse:collapse;font-size:8pt"' : "")+">"+"<thead><tr>"
        + thW("5%","\u2116")
        + thW("45%","\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u0440\u0430\u0431\u043e\u0442","left")
        + thW("8%","\u0415\u0434.")
        + thW("8%","\u041e\u0431\u044a\u0451\u043c")
        + thW("17%","\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434.")
        + thW("17%","\u0421\u0443\u043c\u043c\u0430")
        + "</tr></thead><tbody>";
      let globalNum = 0;
      catOrder.forEach(function(cat){
        const {rows, total: catTotal} = catMap[cat];
        html += "<tr><td colspan=\"6\" style=\"background:#e5e7eb;color:#d97706;font-weight:bold;font-size:9pt;padding:3pt 5pt\">"
          + esc(cat) + " \u2014 " + fmtN(catTotal) + " \u20b8</td></tr>";
        let lastSub = "";
        rows.forEach(function(w,i){
          if(w.subcategory && w.subcategory !== lastSub){
            lastSub = w.subcategory;
            html += "<tr><td colspan=\"6\" style=\"background:#e5e7eb;color:#2563eb;font-style:italic;font-size:8.5pt;padding:2pt 5pt\">"
              + esc(w.subcategory) + "</td></tr>";
          }
          globalNum++;
          const bg = i%2===0 ? "#f3f4f6" : "#e2e8f0";
          const tdS = forDocx ? ";line-height:1.1;mso-line-height-rule:exactly" : "";
          html += "<tr style=\"background:" + bg + "\">"
            + (forDocx ? '<td width="5%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + globalNum + "</td>"
            + (forDocx ? '<td width="45%"' : '<td') + ' style="font-size:8pt'+tdS+'">' + esc(w.name||"") + "</td>"
            + (forDocx ? '<td width="8%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + (w.unit||"\u043c\xb2") + "</td>"
            + (forDocx ? '<td width="8%"' : '<td') + ' class="tc" style="font-size:8pt'+tdS+'">' + (w.quantity||"") + "</td>"
            + (forDocx ? '<td width="17%"' : '<td') + ' class="tr" style="font-size:8pt'+tdS+'">' + (w.priceFrom ? "\u043e\u0442 "+fmtN(w.priceFrom)+" \u20b8" : fmtN(w.price) + " \u20b8") + "</td>"
            + (forDocx ? '<td width="17%"' : '<td') + ' class="tr" style="font-size:8pt;font-weight:bold'+tdS+'">' + (w.priceFrom ? "\u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f" : fmtN(w.sum) + " \u20b8") + "</td>"
            + "</tr>";
        });
        html += "<tr style=\"background:#f3f4f6\">"
          + "<td colspan=\"5\" class=\"tr\" style=\"font-style:italic;font-size:9pt\">\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0443 \u00ab" + cat + "\u00bb:</td>"
          + "<td class=\"tr\" style=\"font-weight:bold\">" + fmtN(catTotal) + " \u20b8</td>"
          + "</tr>";
      });
      html += "</tbody></table>";
      if(multiCat){
        html += "<table style=\"margin-top:6pt;width:60%;margin-left:40%\"><tbody>";
        html += "<tr><td colspan=\"2\" style=\"background:#e5e7eb;font-weight:bold;font-size:9pt\">\u0421\u0432\u043e\u0434\u043a\u0430 \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0430\u043c</td></tr>";
        catOrder.forEach(function(cat){
          html += "<tr><td style=\"font-size:9pt\">" + cat + "</td><td class=\"tr\" style=\"font-weight:bold;font-size:9pt\">" + fmtN(catMap[cat].total) + " \u20b8</td></tr>";
        });
        if(c.discount>0){
          const discAmt=Math.round(total*c.discount/100);
          html += "<tr><td style=\"font-size:9pt;color:#c00\">\u0421\u043a\u0438\u0434\u043a\u0430 "+c.discount+"%</td><td class=\"tr\" style=\"font-size:9pt;color:#c00\">\u2212 "+fmtN(discAmt)+" \u20b8</td></tr>";
          html += "<tr style=\"background:#e5e7eb\"><td style=\"font-weight:bold\">\u0418\u0422\u041e\u0413\u041e \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439:</td>"
            + "<td class=\"tr\" style=\"font-weight:bold;font-size:11pt\">" + fmtN(total-discAmt) + " \u20b8</td></tr>";
        } else {
          html += "<tr style=\"background:#e5e7eb\"><td style=\"font-weight:bold\">\u0418\u0422\u041e\u0413\u041e:</td>"
            + "<td class=\"tr\" style=\"font-weight:bold;font-size:11pt\">" + fmtN(total) + " \u20b8</td></tr>";
        }
        html += "</tbody></table>";
      } else {
        if(c.discount>0){
          const discAmt=Math.round(total*c.discount/100);
          html += "<p class=\"tr\" style=\"font-size:9pt;color:#c00;padding-top:4pt\">\u0421\u043a\u0438\u0434\u043a\u0430 "+c.discount+"%: \u2212 "+fmtN(discAmt)+" \u20b8</p>";
          html += "<p class=\"tr\" style=\"font-weight:bold;font-size:11pt\">\u0418\u0422\u041e\u0413\u041e \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439: " + fmtN(total-discAmt) + " \u20b8</p>";
        } else {
          html += "<p class=\"tr\" style=\"font-weight:bold;font-size:11pt;padding-top:4pt\">\u0418\u0422\u041e\u0413\u041e: " + fmtN(total) + " \u20b8</p>";
        }
      }
      return html;
    };
    const preambula = (role="Подрядчик") => {
      const tit = esc(ca?.name||"ТОО TITOVSTROY")+", БИН "+esc(ca?.bin||"231040002769")+" (далее — \""+role+"\"), в лице директора "+esc(ca?.director||"________")+", действующего на основании Устава";
      const tail = "совместно именуемые \"Стороны\", а по отдельности – \"Сторона\", заключили настоящий документ о нижеследующем:";
      if(isYur){
        const clLine = clName+", БИН "+clIIN+" (далее — \"Заказчик\") в лице "+esc(client?.director||"Директора")+", "+esc(client?.directorShort||client?.director||"")+", действующего на основании Устава, с другой стороны, "+tail;
        return "<p>"+tit+", с одной стороны, и</p><p>"+clLine+"</p>";
      }
      const cl = clName+", ИИН "+clIIN+", № документа "+clDoc+", Выдан МВД РК, (далее — \"Заказчик\") с одной стороны, и";
      return "<p>"+cl+"</p><p>"+tit+", с другой стороны, "+tail+"</p>";
    };
    let body = "";
    // ─────── 1 & 2. ДОГОВОР РЕМОНТА (ФИЗ / ЮР) ───────
    if(type==="repair_fiz"){
      const annex1 = `<div style="page-break-before:always;mso-break-type:page-break">
  <p class="t">Приложение №1</p>
  <p class="c b">Перечень этапов, видов и стоимость работ</p>
  <p class="c">к Договору ремонтно-отделочных работ</p>
  <p class="c">№${c.number||"___"} от «${dt.d}» ${dt.m} ${dt.y} г.</p><br>
  <p class="s">1. Общие положения</p>
  <p>1.1. Настоящее Приложение является неотъемлемой частью Договора ремонтно-отделочных работ №${c.number||"___"} от «${dt.d}» ${dt.m} ${dt.y} г. и определяет этапы, виды и стоимость ремонтно-отделочных работ, выполняемых Подрядчиком на Объекте.</p>
  <p class="s">2. Перечень этапов и видов работ</p>
  <p>Ниже приведен перечень этапов и видов работ, их объемы, сроки выполнения и стоимость:</p>
  ${worksTable()}
  <p class="s">3. Условия выполнения работ</p>
  <p>3.1. В стоимость Работ могут входить расходы Подрядчика на материалы, оборудование, доставку и иные затраты, необходимые для выполнения Работ, если иное прямо указано в договоре. В случае если материалы, оборудование, инструменты, субподряд предоставляет Заказчик, Подрядчик не несет ответственности за их качество, комплектность и соответствие проектным требованиям.</p>
  <p>3.2. Работы выполняются поэтапно в соответствии с указанными сроками.</p>
  <p>3.3. Любые дополнительные работы, не предусмотренные настоящим Приложением, выполняются на основании дополнительного соглашения сторон с корректировкой стоимости и сроков.</p>
  <p class="s">4. Порядок оплаты</p>
  <p>4.1. При заключении договора заказчик вносит предоплату (аванс) в размере ${c.advancePercent??30}% (${fmtN(Math.round(total*(c.advancePercent??30)/100))} тенге), которая идет в зачет основной суммы договора, при расторжении договора предоплата возврату не подлежит.</p>
  <p>4.2. Оплата за работы (за исключением предоплаты) производится поэтапно на основании актов выполненных работ (форма КС-2) в течение 2 банковских дней после подписания акта.</p>
  <p class="s b">Общая стоимость работ составляет ${fmtN(total)} ₸</p><br>
  ${sigBlock("Подрядчик:", "Заказчик:")}
  </div>`;
      body = `
  <p class="t">Договор подряда №${c.number||"___"}</p>
  <p class="c b">на выполнение ремонтно-отделочных работ</p>
  <p class="city-line">${dt.full} г.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Караганда</p><br>
  ${preambula("Подрядчик")}
  <p class="s">1. ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ</p>
  <p>1.1. Настоящий Договор содержит следующие термины и определения:</p>
  <p>1.1.1. Договор – настоящий договор подряда со всеми приложениями и дополнениями к нему, заключенными в период его действия, подписанными Заказчиком и Подрядчиком, и являющимися его неотъемлемой частью.</p>
  <p>1.1.2. Объект – ${client?.objectType||"наименование объекта"} по адресу: ${clAddr}, где Подрядчик обязуется выполнить Работы в соответствии с настоящим Договором.</p>
  <p>1.1.3. Заказчик – юридическое или физическое лицо, указанное в преамбуле Договора, которое заказывает у Подрядчика выполнение работ.</p>
  <p>1.1.4. Подрядчик – юридическое лицо, определенное в преамбуле настоящего Договора, выполняющий подрядные, ремонтно-отделочные работы и иные работы не требующие лицензирование в соответствие с законодательством Республики Казахстан.</p>
  <p>1.1.5. Работы – комплекс ремонтно-отделочных и иных работ, установленный в Приложении №1 «Перечень этапов, видов и стоимость работ», который должен быть выполнен в соответствии с условиями настоящего Договора</p>
  <p>1.1.6. Субподрядчик – третье лицо, занимающееся предпринимательской деятельностью, привлекаемое Подрядчиком для выполнения части Работ, предусмотренных настоящим Договором. В случае если характер Работ требует наличия лицензии или иных разрешительных документов в соответствии с законодательством Республики Казахстан, Подрядчик обязуется привлекать субподрядчиков, имеющих соответствующие лицензии/разрешения..</p>
  <p>1.1.7. Строительная площадка – территория, используемая для размещения Объекта, временных зданий и сооружений, спецтехники, оборудования, складирования материалов, инструментов, инвентаря и оборудования, выполнения Работ.</p>
  <p>1.1.8. Временные здания и сооружения – здания, строения и сооружения, необходимые для обеспечения строительства и предназначенные для выполнения производственных процессов, размещения и хранения материальных ценностей или временного пребывания (перемещения) людей, грузов, а также размещения (прокладки, проводки) оборудования или коммуникаций. После окончания строительства временные здания и сооружения подлежат ликвидации. Используемые для строительства здания, сооружения или помещения, входящие в состав Объекта строительства, к временным зданиям (сооружениям) не относятся.</p>
  <p>1.1.9. Авторский надзор – правомочия автора по осуществлению контроля за разработкой строительной документации Объекта, а также реализацией проекта строительства.</p>
  <p>1.1.10. Проектно-сметная документация – документация, содержащая объемно-планировочные, конструктивные, технологические, инженерные, природоохранные, экономические и иные решения, а также сметные расчеты для организации и ведения строительства.</p>
  <p>1.1.11. Исполнительная документация – комплект рабочих чертежей на строительство объекта с надписями о соответствии выполненных в натуре работ этим чертежам или внесенным в них изменениям, сделанными лицами, ответственными за производство работ, сертификаты, технические паспорта и др. документы, удостоверяющие качество материалов, акты об освидетельствовании скрытых работ, журналы работ, акты промежуточной и окончательной приемки, проведенных испытаний систем и др.</p>
  <p>1.1.12. Материалы – все строительные материалы, включая технологическое, техническое и инженерное оборудование и системы, детали, элементы и конструкции, которые должны быть использованы для выполнения Работ на Объекте, и соответствовать утвержденной проектной и сметной документации, условиями настоящего Договора, нормативно-правовым и нормативным документам РК (строительные нормы, строительные правила, ГОСТ и др.).</p>
  <p>1.1.13. Оборудование Подрядчика – совокупность спецтехники, машин, механизмов, приборов, устройств, инструментов и инвентаря, используемых Подрядчиком для выполнения Работ на Объекте.</p>
  <p>1.1.14. Недостатки Работ – все недостатки, недоработки, недоделки, дефекты (в том числе скрытые), допущенные Подрядчиком и выявленные Заказчиком в ходе выполнения Работ, в процессе приемки выполненных Работ, или в гарантийный период. А также любые обязательства, исполненные Подрядчиком с нарушениями или с несоответствием законодательству РК, условиям настоящего Договора, проектно-сметной документации Объекта, и действующим на территории РК нормативным документам, в том числе строительным нормам и техническим регламентам. Подрядчик не несет ответственности за недостатки, возникшие по вине Заказчика, третьих лиц или в результате форс-мажора.</p>
  <p>1.1.15. Сроки выполнения Работ – временной период, установленный настоящим Договором, в течение которого Подрядчик обязан выполнить Работы.</p>
  <p>1.1.16. Гарантийный срок – период времени, установленный настоящим Договором (1 год), в течение которого Заказчик вправе предъявить Подрядчику претензии в связи с недостатками результатов выполненных им Работ, а Подрядчик обязан в срок, установленный Договором или нормами закона, устранить указанные недостатки, если они возникли по его вине.</p>
  <p class="s">2. ПРЕДМЕТ ДОГОВОРА</p>
  <p>2.1. По настоящему Договору Подрядчик обязуется по заданию Заказчика выполнить комплекс ремонтно-отделочных[ работ, установленный в Приложении №1 «Перечень видов и этапов работ», а Заказчик обязуется создать Подрядчику необходимые условия для выполнения Работ, принять их результат и уплатить обусловленную цену в соответствии со ст. 651 ГК РК.</p>
  <p>2.2. Подрядчик обязан выполнить Работы, предусмотренные настоящим Договором, в соответствии с проектной документацией, определяющей объем и содержание работ и другие предъявляемые к работам требования, и сметой, определяющей цену Работ, действующими нормативно-правовыми и нормативными документами и регламентами, законодательством РК, условиями настоящего Договора и содержанием Приложения №1.</p>
  <p>2.3. Подрядчик гарантирует наличие всех полномочий, финансовых, материальных, трудовых и иных ресурсов.</p>
  <p class="s">3. ПРАВА И ОБЯЗАННОСТИ СТОРОН</p>
  <p class="b">3.1. Заказчик обязан:</p>
  <p>3.1.1. Оплачивать Работы в соответствии с условиями настоящего Договора и в установленные сроки.</p>
  <p>3.1.2. Принимать выполненные Работы в соответствии с условиями настоящего Договора и требованиями нормативных документов, действующих на территории РК.</p>
  <p>3.1.3. Осуществлять контроль и технический надзор за ходом и качеством выполняемых Работ, соблюдением сроков их выполнения, качеством предоставленных Подрядчиком материалов (если подрядчик их предоставляет), не вмешиваясь при этом в оперативно-хозяйственную деятельность Подрядчика.</p>
  <p>3.1.4. Обеспечить ведение Авторского надзора за соответствием выполняемых работ проектной документации Объекта.</p>
  <p>3.1.5. Немедленно заявлять Подрядчику о выявленных при осуществлении контроля и технического надзора за выполнением Работ отступлениях от условий Договора, которые могут ухудшить качество Работ, или иных их недостатках. Если Заказчик не сделает такого заявления в течение 2 дней, то он теряет право в дальнейшем ссылаться на обнаруженные им недостатки.</p>
  <p>3.1.6. Оплатить стоимость выполненных Работ и (или) восстановительных работ в случае разрушения или повреждения Объекта в целом или в части выполняемых Подрядчиком Работ вследствие непреодолимой силы до истечения установленного Договором срока сдачи Работ.</p>
  <p>3.1.7. Предоставить Подрядчику беспрепятственный доступ на Строительную площадку и обеспечить необходимые разрешения на работы в охранных зонах инженерных сетей.</p>
  <p class="b">3.2. Заказчик вправе:</p>
  <p>3.2.1. Требовать внесения изменений в проектно-сметную документацию, не связанных с дополнительными расходами для Подрядчика и увеличением сроков выполнения Работ. Изменения проектно-сметной документации, требующие дополнительных расходов для Подрядчика, осуществляются за счет Заказчика на основе согласованной сторонами дополнительной сметы в течение 5 дней.</p>
  <p>3.2.2. Немедленно заявить Подрядчику об обнаружении при осуществлении контроля и надзора за выполнением Работ отступления от условий Договора, которые могут ухудшить качество Работ, или иные недостатки в них.</p>
  <p>3.2.3. Требовать от Подрядчика устранения выявленных недостатков Работ на любом этапе: в ходе выполнения Работ, при приемке результатов Работ частями или Объекта в целом, при вводе Объекта в эксплуатацию, а также в гарантийный период, с предоставлением обоснования.</p>
  <p class="b">3.3. Подрядчик обязан:</p>
  <p>3.3.1. Выполнить Работы с надлежащим качеством, в установленные Договором сроки.</p>
  <p>3.3.2. До начала производства Работ назначить и уполномочить соответствующей доверенностью лицо, ответственное за выполнение Подрядчиком Работ на Объекте.</p>
  <p>3.3.3. Незамедлительно сообщить Заказчику об обнаружении не учтенных в проектно-сметной документации работ и, в связи с этим, необходимости выполнения дополнительных Работ и, соответственно, увеличения сметной стоимости Работ. При неполучении от Заказчика ответа на свое сообщение в течение 2 дней, Подрядчик вправе приостановить выполнение Работ с отнесением убытков, вызванных простоем (включая оплату простоя работников и оборудования), на счет Заказчика. Подрядчик, не выполнивший обязанности, установленные настоящим пунктом, лишается права требовать от Заказчика оплаты выполненных им дополнительных работ и возмещения вызванных этим убытков, если не докажет необходимости немедленных действий в интересах Заказчика.</p>
  <p>3.3.4. Обеспечить выполнение Работ качественными материалами и оборудованием, в том числе деталями и конструкциями, соответствующими требованиям ГОСТ, строительным нормам, строительным правилам, техническим условиям и регламентам, экологическим, противопожарным и другим требованиям, стандартам, нормам и правилам, действующим на территории РК, если заказчик не берет ответственность за материалы и оборудование на себя, в таком случае полную и дальнейшую ответственность несет сам заказчик.</p>
  <p>3.3.5. В процессе выполнения Работ осуществлять постоянный входной контроль строительных материалов, оборудования, монтажной оснастки, определяющий их соответствие проектно-сметной документации, а также требованиям распространяющихся на них ГОСТ, строительных норм, иных норм, правил, стандартов и технических условий.</p>
  <p>3.3.6. При выполнении Работ соблюдать требования закона и иных правовых актов об охране окружающей среды и о безопасности строительных работ.</p>
  <p>3.3.7. Обеспечить соблюдение на Объекте правил техники безопасности, противопожарной безопасности, электробезопасности и промышленной санитарии, своевременный вывоз мусора и соблюдение чистоты, иных правил и регламентов, действующих в РК.</p>
  <p>3.3.8. Привлечь к выполнению Работ квалифицированных работников, обеспечить их всеми необходимыми инструментами.</p>
  <p>3.3.9. Обеспечить беспрепятственный доступ Заказчика и его уполномоченных представителей, а также представителей технического и авторского надзора к выполняемым Работам.</p>
  <p>3.3.10. Исполнять полученные указания Заказчика, если такие указания не противоречат условиям Договора и не представляют собой вмешательство в оперативно-хозяйственную деятельность Подрядчика.</p>
  <p>3.3.11. Выполнять Работы в разрешенное законом РК время и без превышения допустимого уровня шума.</p>
  <p>3.3.12. При выполнении Работ использовать качественные средства измерения, обеспечивающие максимальную точность и достоверность выполняемых измерений и соответствующие требованиям, предъявляемым к ним нормативными актами РК в части наличия всех необходимых регистраций, поверок, аттестаций.</p>
  <p>3.3.13. Уведомлять Заказчика обо всех обстоятельствах, которые могут повлиять на исполнение настоящего Договора, за исключением тех, что вызваны действиями Заказчика.</p>
  <p>3.3.14. Безвозмездно, в установленные сроки, устранять выявленные несоответствия Работ на любом этапе: в ходе выполнения Работ, при приемке результатов Работ частями или Объекта в целом, при вводе Объекта в эксплуатацию, а также в гарантийный период, только если недостатки возникли по вине подрядчика.</p>
  <p>3.3.15. Выполнять Работы с соблюдением правил проведения работ в охранных зонах инженерных сетей. Согласовать выполнение Работ с владельцами инженерных сетей.</p>
  <p>3.3.16. В случаях, когда это предусмотрено законом либо вытекает из характера выполняемых Работ и используемых материалов, обеспечить проведение предварительных испытаний и экспертиз в соответствии с регламентирующими их проведение нормативными документами РК.</p>
  <p>3.3.17. После окончания Работ вывезти с территории Объекта оборудование Подрядчика, обеспечить очистку территории производства Работ, сбор и вывоз всех отходов и строительного мусора (если это предусмотрено отдельным соглашением с Заказчиком).</p>
  <p>3.3.18. После окончания Работ на Объекте передать Заказчику исполнительную документацию на выполненные Работы в течение 10 дней.</p>
  <p class="b">3.4. Подрядчик вправе:</p>
  <p>3.4.1. Требовать пересмотра стоимости Работ, если по не зависящим от Подрядчика причинам стоимость Работ превысила смету.</p>
  <p>3.4.2. Требовать возмещения расходов, понесенных Подрядчиком в связи с установлением и устранением дефектов в проектно-сметной документации, предоставленной Заказчиком.</p>
  <p>3.4.3. Приостановить выполнение Работ в случаях, предусмотренных законами РК и условиями настоящего Договора, с уведомлением Заказчика за 2 дня и отнесением убытков на Заказчика.</p>
  <p>3.4.4. Отказаться от выполнения дополнительных работ в случае, когда они не входят в сферу профессиональной деятельности Подрядчика либо не могут быть выполнены Подрядчиком по независящим от него причинам, без ответственности за простои.</p>
  <p>3.4.5. Привлекать к исполнению своих обязательств субподрядчиков без предварительного согласия Заказчика.</p>
  <p>3.4.6. Расторгнуть Договор и требовать возмещения понесенных убытков в случае нарушения Заказчиком существенных условий настоящего Договора (включая просрочку оплаты более 3 дней), с уведомлением за 2 дня. А также и взыскать неустойку/штраф за просрочку оплаты.</p>
  <p class="s">4. СТОИМОСТЬ, СРОКИ И ПОРЯДОК ОПЛАТЫ РАБОТ</p>
  <p>4.1. Общая стоимость работ а также сроков и порядок оплаты, определяется в соответствии с Приложением №1 «Перечень видов и этапов работ».</p>
  <p>4.2. Стоимость каждой единицы Работ, установленная в Приложении №1 «Перечень видов и этапов работ», является твердой и изменению не подлежит, за исключением случаев, предусмотренных п. 3.4.1.</p>
  <p>4.3. Общая сумма Договора складывается из общей стоимости выполненных Подрядчиком и принятых Заказчиком Работ, включает все платежи Подрядчика в бюджет, все расходы Подрядчика, понесенные им в целях исполнения Договора, а также вознаграждение Подрядчика.</p>
  <p>4.4. Заказчик оплачивает выполненные Работы по факту их завершения и подписания актов приемки в течение 2 банковских дней на основании подписанных Сторонами актов выполненных работ.</p>
  <p>4.5. Все расчеты Сторон по Договору производятся в тенге, в безналичном порядке.</p>
  <p>4.6. В случае, если фактические расходы Подрядчика оказались меньше тех, которые учитывались при определении стоимости Работ, Подрядчик сохраняет право на оплату работ по Стоимости, установленной настоящим Договором. Заказчик не вправе требовать снижения цены без доказательства снижения качества.</p>
  <p>4.7. Подрядчик предоставляет Заказчику счет-фактуру, а также иные, требуемые правилами бухгалтерского учета, документы.</p>
  <p class="s">5. СРОКИ ВЫПОЛНЕНИЯ РАБОТ</p>
  <p>5.1. Подрядчик обязан выполнить Работы в соответствии с Приложением №1 «Перечень видов и этапов работ»</p>
  <p>5.2. Сроки выполнения Работ могут быть изменены по соглашению Сторон до начала или в процессе производства Работ, с уведомлением. Задержки, вызванные Заказчиком (включая несвоевременную оплату или предоставление документации), продлевают сроки без ответственности Подрядчика.</p>
  <p>5.3. Подрядчик несет ответственность за нарушение всех установленных в Договоре сроков выполнения Работ только в случае отсутствия вины Заказчика.</p>
  <p class="s">6. ПОРЯДОК ВЫПОЛНЕНИЯ РАБОТ</p>
  <p>6.1. Подрядчик выполняет работы поэтапно, в соответствии с Приложением №1 «Перечень видов и этапов работ».</p>
  <p>6.2. Заказчик разрешает Подрядчику пользоваться всей территорией Объекта для выполнения Работ по настоящему Договору, включая хранение материалов и оборудования.</p>
  <p>6.3. После завершения всех Работ, предусмотренных настоящим Договором, Подрядчик письменно Заказчика о завершении работ и вызывает его для участия в приемке Работ в течение 2 дней.</p>
  <p class="s">7. ПОРЯДОК СДАЧИ-ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ</p>
  <p>7.1. Приемка выполненных Работ осуществляется после завершения Подрядчиком каждого этапа Работ, предусмотренных настоящим Договором.</p>
  <p>7.2. Заказчик, получив сообщение Подрядчика о готовности к сдаче Работ, обязан немедленно приступить к приемке их результатов в течение 2 дней.</p>
  <p>7.3. Заказчик организует и осуществляет приемку результатов Работ за свой счет.</p>
  <p>7.4. Заказчик обязан с участием Подрядчика осмотреть и принять результаты выполненных Работ, а при обнаружении отступлений от Договора, ухудшающих Работы, или иных недостатков немедленно заявить Подрядчику об этом в письменной форме с обоснованием.</p>
  <p>7.5. В случаях, когда это предусмотрено законодательными актами либо вытекает из характера Работ, приемке результатов Работ должны предшествовать предварительные испытания. В этих случаях приемка результатов Работ может осуществляться только при положительном результате предварительных испытаний. Испытания должны быть проведены в строгом соответствии с регламентирующими СНиП и ГОСТ РК.</p>
  <p>7.6. Сдача результата Работ Подрядчиком и приемка его Заказчиком оформляются актом о приемке выполненных работ, подписываемым обеими Сторонами. При отказе одной из сторон от подписания акта, в нем делается отметка об этом и акт подписывается другой Стороной.</p>
  <p>7.7. В случае приемки Заказчиком Работ без проверки, Заказчик лишается права ссылаться на недостатки Работ, которые могли быть установлены при обычном способе их приемки (явные недостатки).</p>
  <p>7.8. Подрядчик обязан исправить все выявленные дефекты и недостатки Работ в разумный срок, установленный Подрядчиком и согласованный с Заказчиком.</p>
  <p>7.9. Заказчик вправе полностью отказаться от приемки результата Работ в случае обнаружения недостатков, которые исключают возможность его дальнейшей целевой эксплуатации и не могут быть устранены Подрядчиком или Заказчиком (только при наличии заключения независимой экспертизы).</p>
  <p>7.10. Заказчик обязан принять результаты Работ и подписать Акт выполненных работ в течение 2 дней, либо дать в те же сроки обоснованный письменный отказ с указанием конкретных недостатков.</p>
  <p>7.11. В случае необоснованного отказа Заказчика от приемки результатов выполненных Работ или от подписания акта выполненных работ, либо просрочки Заказчиком подписания акта выполненных работ без уважительных причин более чем на 2 дней, Подрядчик вправе подписать Акт выполненных Работ в одностороннем порядке и приступить к взысканию оплаты (в таком случае акт будет иметь юридическую силу и является основанием для оплаты).</p>
  <p>7.12. При возникновении между Сторонами спора по поводу недостатков выполненных Работ или их причин, по требованию любой из Сторон должна быть назначена экспертиза в аккредитованной организации. Расходы по проведению экспертизы несет Заказчик, за исключением случаев, когда экспертизой установлено наличие нарушений Договора или причинной связи между действиями Подрядчика и обнаруженными недостатками. В этих случаях расходы по экспертизе несет Подрядчик, а если экспертиза назначена по соглашению между Сторонами, - обе Стороны поровну.</p>
  <p>7.13. Сдача и ввод завершенного строительством Объекта в эксплуатацию производится Сторонами в порядке, установленном законодательством Республики Казахстан об архитектурной, градостроительной и строительной деятельности. Подрядчик передает Заказчику исполнительную документацию в полном объеме.</p>
  <p class="s">8. ГАРАНТИИ КАЧЕСТВА</p>
  <p>8.1. Подрядчик гарантирует достижение указанных в проектно-сметной документации показателей и возможность эксплуатации результатов Работ на протяжении гарантийного срока. Гарантийный срок составляет 12 месяцев со дня подписания акта окончательной приемки результатов Работ Заказчиком в соответствии со ст. 666 ГК РК.</p>
  <p>8.2. Гарантия качества распространяется на все элементы и детали выполненных Работ, включая предоставленные Подрядчиком материалы (если они были предоставлены подрядчиком, в ином случае подрядчик ответственность не несет).</p>
  <p>8.3. Подрядчик несет ответственность за недостатки выполненных Работ, обнаруженные в пределах гарантийного срока, если не докажет, что они возникли вследствие нормального износа, неправильной эксплуатации или неправильности инструкций по эксплуатации, разработанных самим Заказчиком или привлеченными им третьими лицами, ненадлежащего ремонта, произведенного самим Заказчиком или привлеченными им третьими лицами, или форс-мажора.</p>
  <p>8.4. В случае обнаружения в течение гарантийного срока отступлений в Работах от Договора, или иных недостатков, которые не могли быть установлены при обычном способе приемки (скрытые недостатки), в том числе такие, которые были умышленно скрыты Подрядчиком, Заказчик обязан известить об этом Подрядчика в разумный срок по их обнаружению (не позднее 5 дней).</p>
  <p>8.5. Если Работы выполнены Подрядчиком с отступлениями от Договора, ухудшившими Работы, или с иными недостатками, которые делают их непригодными для использования, Заказчик вправе по своему выбору потребовать от Подрядчика:</p>
  <p>8.5.1. безвозмездного устранения недостатков Работ в разумный срок;</p>
  <p>8.5.2. соразмерного уменьшения установленной стоимости Работ.</p>
  <p>8.6. Подрядчик вправе вместо устранения недостатков Работ, за которые он отвечает, безвозмездно выполнить Работы заново, если ему это целесообразно.</p>
  <p>8.7. Подрядчик, получив уведомление от Заказчика о недостатках выполненных работ, обязан явиться на Объект в срок до 10 рабочих дней для обследования выявленных недостатков и составления Дефектного акта.</p>
  <p class="s">9. ОТВЕТСТВЕННОСТЬ СТОРОН</p>
  <p>9.1. Стороны несут ответственность за нарушение условий настоящего Договора в пределах, установленных Законами Республики Казахстан (ст. 651–666 ГК РК) и настоящим Договором.</p>
  <p>9.2. За нарушение сроков выполнения Работ Заказчик вправе взыскать с Подрядчика пеню в размере 0,05% от стоимости незавершенных Работ за каждый день просрочки, но не более 5% от общей стоимости Договора.</p>
  <p>9.3. Штрафы и пени за каждое нарушение Подрядчиком обязательств по Договору могут быть взысканы Заказчиком в сумме, не превышающей 5% от общей стоимости Работ.</p>
  <p>9.4. За нарушение сроков внесения предоплаты (если предусмотрена) Подрядчик вправе взыскать с Заказчика пеню в размере 0,5% от суммы стоимости услуг за каждый день просрочки.</p>
  <p>9.5. За нарушение сроков оплаты выполненных Работ Подрядчик вправе взыскать с Заказчика пеню в размере 5% от неоплаченной суммы за каждый день просрочки, а также приостановить работы до оплаты с отнесением убытков на Заказчика.</p>
  <p>9.6. За нарушение сроков предоставления Заказчиком материалов или оборудования Подрядчик вправе взыскать с Заказчика пеню в размере 5% от стоимости задержанных работ за каждый день просрочки, а также продлить сроки выполнения.</p>
  <p>9.7. За уклонение от приемки выполненных работ Подрядчик вправе взыскать с Заказчика штраф в размере 5% от стоимости работ, а также подписать акт в одностороннем порядке.</p>
  <p>9.8. Общая ответственность Подрядчика ограничена 5% от стоимости Договора.</p>
  <p class="s">10. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ (ФОРС-МАЖОР)</p>
  <p>10.1. Каждая из Сторон настоящего Договора освобождается от ответственности, если докажет, что неисполнение договорных обязательств обусловлено обстоятельствами непреодолимой силы, которые Сторона не могла и не должна была предвидеть или предотвратить — Форс-мажор, в соответствии со ст. 13 ГК РК.</p>
  <p>10.2. К обстоятельствам непреодолимой силы относятся: пожары, стихийные бедствия, военные действия, издание актов органов государственной власти или органов местного самоуправления, торговые санкции, иные обстоятельства, если данные обстоятельства непосредственно повлияли на исполнение Сторонами договорных обязательств. Сторона, ссылающаяся на форс-мажор, обязана уведомить другую Сторону в течение 5 дней.</p>
  <p>10.3. К обстоятельствам непреодолимой силы не относятся: нарушение обязанностей со стороны контрагентов должника, отсутствие на рынке нужных для исполнения Договора материалов и оборудования, отсутствие у должника необходимых денежных средств.</p>
  <p class="s">11. СРОК ДЕЙСТВИЯ ДОГОВОРА</p>
  <p>11.1. Договор вступает в силу с момента его подписания и действует до полного исполнения Сторонами своих обязательств, включая гарантийные.</p>
  <p>11.2. Стороны пришли к соглашению, что Договор распространяет свое действие на отношения Сторон, возникшие до его заключения, если они связаны с предметом Договора.</p>
  <p>11.3. Окончание срока действия Договора или его досрочное расторжение по любой из причин не освобождает Стороны от ответственности за его нарушение.</p>
  <p>11.4. Все обязательства Сторон, за исключением гарантийных и финансовых, прекращают свое действие с момента окончания срока действия Договора или его досрочного расторжения по любой из причин. Гарантийные и финансовые обязательства Сторон действуют до полного их исполнения.</p>
  <p class="s">12. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ</p>
  <p>12.1. Применяемое право в отношении настоящего Договора — право Республики Казахстан.</p>
  <p>12.2. Стороны обязуются принять все возможные меры по досудебному урегулированию споров и разногласий, связанных с настоящим Договором, включая переписку и встречу представителей в течение 10 дней с момента возникновения спора.</p>
  <p>12.3. Любые уведомления, сообщения или претензии, полученные Сторонами в связи с ненадлежащим исполнением Договора, подлежат рассмотрению в течение 15 дней с момента получения.</p>
  <p>12.4. Все споры, не урегулированные досудебно, подлежат рассмотрению в суде по месту нахождения Подрядчика в соответствии с законодательством РК.</p>
  <p class="s">13. ОБЩИЕ ПОЛОЖЕНИЯ</p>
  <p>13.1. Каждая из сторон обязуется информировать вторую Сторону об изменении юридического адреса, почтовых и банковских реквизитов, фактического адреса и другой информации, способной повлиять на выполнение обязательств по Договору, в течение 10 календарных дней. А также нести ответственность за возможные последствия не извещения или несвоевременного извещения.</p>
  <p>13.2. Настоящий Договор и приложения к нему составлены в двух подлинных экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон.</p>
  <p>13.3. Все изменения и дополнения к настоящему Договору действительны только в письменной форме и подписываются уполномоченными представителями Сторон.</p>
  <p>13.4. Договор составлен в соответствии с ГК РК, Законом РК «Об архитектурной, градостроительной и строительной деятельности» и иными нормативными актами РК.</p>
  <p class="s">14. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</p><br>
  ${sigBlock("Подрядчик:", "Заказчик:")}
  ${annex1}`;
    // ─────── 3. ПРИЛОЖЕНИЕ №2/3 (ДОП. РАБОТЫ) ───────
    } else if(type==="annex"){
      const an = c.appendix||2;
      const prevList = Array.from({length:an-1},(_,i)=>`№${i+1}`).join(" и ");
      body = `
  <p class="t">Приложение №${an}</p>
  <p class="c b">Перечень дополнительных работ и их стоимость</p>
  <p class="c">к Договору ремонтно-отделочных работ</p>
  <p class="c">№${c.mainNumber||c.number||"___"} от «${dtM.d}» ${dtM.m} ${dtM.y} г.</p>
  <br><p class="city-line">г. Караганда ${dtA.full} г.</p><br>
  <p class="s">1. Общие положения</p>
  <p>1.1. Настоящее Приложение №${an} является неотъемлемой частью Договора ремонтно-отделочных работ №${c.mainNumber||c.number||"___"} от «${dtM.d}» ${dtM.m} ${dtM.y} г. и определяет перечень дополнительных работ, согласованных Сторонами в процессе выполнения Работ.</p>
  <p>1.2. Работы, указанные в настоящем Приложении №${an}, выполняются Подрядчиком по заданию Заказчика в рамках предмета Договора и подлежат оплате на условиях, установленных Договором, если иное прямо не предусмотрено настоящим Приложением.</p>
  <p>1.3. Стоимость работ по настоящему Приложению №${an} оплачивается Заказчиком дополнительно, увеличивает общую стоимость Договора и не входит в стоимость работ по Приложению ${prevList}.</p>
  <p>1.4. Стороны договорились, что настоящее Приложение №${an} является соглашением Сторон о выполнении дополнительных работ в понимании пункта 3.3 Приложения №1 к Договору, оформляет согласование таких работ, их объем, стоимость и сроки и заменяет собой дополнительное соглашение, предусмотренное указанным пунктом.</p><br>
  ${worksTable()}<br>
  ${sigBlock("Подрядчик:", "Заказчик:")}`;
    // ─────── 4. СОГЛАШЕНИЕ О ДИЗАЙН-ПРОЕКТЕ ───────
    } else if(type==="design"){
      const adv = c.designAdvance||25000;
      body = `
  <p class="t">СОГЛАШЕНИЕ №${c.number||"___"}</p>
  <p class="t" style="font-size:13pt">о разработке дизайн проекта</p>
  <p class="city-line">${dt.full} г.&nbsp;&nbsp;&nbsp;&nbsp;г. Караганда</p><br>
  ${preambula("Исполнитель")}
  <p class="s">1. Общие положения</p>
  <p>1.1. Исполнитель обязуется по заданию Заказчика разработать дизайн проект Объекта, расположенного по адресу: ${clAddr}.</p>
  <p>1.2. Под дизайн проектом понимается разработка интерьерных решений (перечень возможных опций): обмерочный план; планировочное решение; концепция интерьера; 3D визуализация; рабочие чертежи для выполнения ремонтных работ; ведомость отделочных материалов.</p>
  <p>1.3. Конкретный состав, объем и наполнение дизайн проекта определяется Техническим заданием, оформляемым в виде Приложения №1 к настоящему Соглашению и подписываемого Сторонами. Техническое задание является неотъемлемой частью настоящего Соглашения.</p>
  <p class="s">2. Стоимость и порядок оплаты</p>
  <p>2.1. Окончательная стоимость дизайн проекта определяется после проведения замеров Объекта и утверждения Технического задания.</p>
  <p>2.2. Стоимость может определяться: фиксированной суммой или исходя из площади Объекта стоимостью за 1 кв.м.</p>
  <p>2.3. Итоговая стоимость дизайн проекта утверждается Сторонами путем подписания Дополнительного соглашения к настоящему Соглашению после согласования Технического задания. До подписания Дополнительного соглашения стоимость считается несогласованной.</p>
  <p>2.4. Заказчик оплатил Исполнителю предоплату в размере ${fmtN(adv)} тенге.</p>
  <p>2.5. Указанная сумма засчитывается в общую стоимость дизайн проекта.</p>
  <p>2.6. Оставшаяся сумма оплачивается в сроки, согласованные Сторонами дополнительно.</p>
  <p>2.7. Внесение Заказчиком изменений в согласованное Техническое задание после подписания Дополнительного соглашения влечет пересмотр сроков и стоимости работ, оформляемый отдельным Дополнительным соглашением.</p>
  <p>2.8. В случае если Стороны не достигли соглашения по итоговой стоимости после согласования Технического задания, настоящее Соглашение может быть расторгнуто, при этом предоплата засчитывается в счет фактически выполненных работ.</p>
  <p class="s">3. Сроки выполнения</p>
  <p>3.1. Срок разработки дизайн проекта определяется и указывается в Приложении №1 к настоящему Соглашению.</p>
  <p>3.2. Срок может быть продлен в случае внесения изменений Заказчиком.</p>
  <p>3.3. В случае если Заказчик не согласовывает Техническое задание более 10 рабочих дней, Исполнитель вправе приостановить выполнение работ до момента согласования без изменения своих прав на полученную предоплату.</p>
  <p>3.4. Моментом начала выполнения работ по проектированию считается дата проведения замеров Объекта либо дата направления Заказчику первых проектных решений, в зависимости от того, что наступит ранее.</p>
  <p class="s">4. Порядок сдачи результата</p>
  <p>4.1. Результат работ передается Заказчику в электронном виде.</p>
  <p>4.2. Проект считается принятым, если в течение 3 рабочих дней Заказчик не направил мотивированные замечания.</p>
  <p>4.3. В случае если Заказчик не направил замечания в установленный срок, результат работ считается принятым без замечаний.</p>
  <p>4.4. Количество вариантов проектных решений и количество корректировок определяется Техническим заданием. Дополнительные корректировки, не предусмотренные Техническим заданием, выполняются за отдельную оплату.</p>
  <p class="s">5. Отказ и возврат средств</p>
  <p>5.1. В случае отказа Заказчика от исполнения настоящего Соглашения до начала выполнения работ, предоплата возвращается за вычетом фактически понесенных расходов.</p>
  <p>5.2. В случае отказа Заказчика после начала выполнения работ по проектированию, предоплата возврату не подлежит.</p>
  <p>5.3. В случае невозможности исполнения по вине Исполнителя предоплата возвращается полностью.</p>
  <p class="s">6. Авторские права</p>
  <p>6.1. Исполнитель сохраняет авторские права на созданный дизайн проект.</p>
  <p>6.2. Заказчик получает право использовать дизайн проект исключительно для проведения ремонтных работ на указанном Объекте.</p>
  <p>6.3. Передача Заказчиком дизайн проекта третьим лицам без письменного согласия Исполнителя не допускается.</p>
  <p>6.4. Полная передача авторских прав Заказчику производится после полной оплаты всех работ по дизайн проекту и передачи всех рабочих чертежей в полном объеме.</p>
  <p class="s">7. Прочие условия</p>
  <p>7.1. Настоящее Соглашение вступает в силу с момента подписания.</p>
  <p>7.2. Все споры разрешаются в судебном порядке по месту регистрации Исполнителя.</p>
  <p>7.3. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу.</p>
  <p>7.4. Исполнитель не несет ответственности за получение разрешений, согласование перепланировок, утверждение проектных решений в государственных органах, если иное не предусмотрено отдельным соглашением.</p>
  <p>7.5. Исполнитель вправе привлекать к выполнению работ третьих лиц, оставаясь ответственным перед Заказчиком за результат работ.</p>
  <p>7.6. Общая ответственность Исполнителя по настоящему Соглашению ограничивается суммой фактически оплаченных Заказчиком денежных средств по настоящему Соглашению.</p>
  <p>7.7. Дизайн проект носит концептуальный характер и является основанием для выполнения ремонтных работ при условии соблюдения действующих строительных норм. Окончательные технические решения принимаются Заказчиком.</p><br>
  <p class="b">Подписи сторон</p><br>
  ${sigBlock("Исполнитель:", "Заказчик:")}`;
    // ─────── 5. ДОП. СОГЛАШЕНИЕ К ДИЗАЙН-ПРОЕКТУ ───────
    } else if(type==="design_add"){
      const comp = c.composition||{};
      const COMP = [["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость отделочных материалов"]];
      const adv = c.designAdvance||25000;
      const tcost = c.priceType==="sqm"
        ? Math.round((c.pricePerSqm||0)*(c.area||0)) || null
        : c.totalCost||null;
      const rem = tcost&&adv ? tcost-adv : null;
      body = `
  <p class="t">ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ №${c.number||"_______"}</p>
  <p class="c b">к Соглашению №${c.mainNumber||"_________"} о разработке дизайн проекта</p>
  <p class="city-line">${dt.d==="__"?"":'"'}${dt.d}" ${dt.m} ${dt.y} г.&nbsp;&nbsp;&nbsp;&nbsp;г. Караганда</p><br>
  ${preambula("Исполнитель")}
  <p class="s">1. Техническое задание</p>
  <p>1.1. Стороны согласовали следующий состав дизайн проекта:</p>
  ${COMP.map(([k,l])=>`<p>[${comp[k]?"X":" "}] ${l}</p>`).join("")}
  <p>1.2. Площадь Объекта: ${c.area||"________"} кв.м.</p>
  <p>1.3. Количество вариантов планировочного решения: ${c.variantsLayout||"________"}.</p>
  <p>1.4. Количество раундов корректировок по планировке: ${c.corrLayout||"________"}.</p>
  <p>1.5. Количество раундов корректировок по визуализациям: ${c.corrVis||"________"}.</p>
  <p>1.6. Дополнительные корректировки оплачиваются отдельно по согласованию Сторон.</p>
  <p class="s">2. Стоимость</p>
  <p>2.1. Стоимость дизайн проекта определяется:</p>
  <p>[${c.priceType==="sqm"?" ":"X"}] фиксированной суммой</p>
  <p>или</p>
  <p>[${c.priceType==="sqm"?"X":" "}] из расчета ${c.pricePerSqm||"___________"} тенге за 1 кв.м.</p>
  <p>2.2. Итоговая стоимость дизайн проекта составляет ${tcost?fmtN(tcost)+" тенге":"_____________________ тенге"}.</p>
  <p>2.3. Предоплата ${fmtN(adv)} тенге засчитывается в общую стоимость.</p>
  <p>2.4. Оставшаяся сумма к оплате составляет: ${rem!==null?fmtN(rem)+" тенге":"_____________________ тенге"}.</p>
  <p class="s">3. Порядок оплаты</p>
  <p>3.1. Оплата производится в формате полной предоплаты.</p>
  <p>3.2. Передача полного комплекта рабочих чертежей осуществляется после полной оплаты.</p>
  <p class="s">4. Сроки</p>
  <p>4.1. Срок выполнения работ составляет ${c.deadline||"_________"} рабочих дней.</p>
  <p>4.2. Срок исчисляется с даты подписания настоящего Дополнительного соглашения либо с даты выполнения Заказчиком обязанностей по оплате, в зависимости от того, что наступит позднее.</p>
  <p>4.3. Срок продлевается в случае внесения изменений Заказчиком.</p>
  <p class="s">5. Прочие условия</p>
  <p>5.1. Настоящее Дополнительное соглашение является неотъемлемой частью основного Соглашения.</p>
  <p>5.2. Все остальные условия основного Соглашения остаются без изменений.</p>
  <p>5.3. Дополнительное соглашение вступает в силу с момента подписания Сторонами.</p><br>
  ${sigBlock("Исполнитель:", "Заказчик:")}`;
    // ─────── 6. СОГЛАШЕНИЕ О РЕЗЕРВИРОВАНИИ ───────
    } else if(type==="reservation"){
      const amt = c.reserveAmount||50000;
      const rsd = c.reserveStartDate ? fmtDate(c.reserveStartDate) : null;
      const rsdStr = rsd ? `«${rsd.d}» ${rsd.m} ${rsd.y} г.` : `"_____" _____________ ${dt.y} г.`;
      body = `
  <p class="t">СОГЛАШЕНИЕ №${c.number||"___"}</p>
  <p class="t" style="font-size:13pt">о резервировании даты начала ремонтно-строительных работ</p>
  <p class="city-line">${dt.full} г.&nbsp;&nbsp;&nbsp;&nbsp;г. Караганда</p><br>
  ${preambula("Исполнитель")}
  <p class="s">1. Общие положения</p>
  <p>1.2. Настоящее Соглашение подтверждает намерение сторон заключить договор подряда на выполнение ремонтно-строительных работ. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и ориентировочную дату начала работ.</p>
  <p>1.3. Стороны подтверждают, что основной договор подряда будет заключен отдельно после согласования: дизайн-проекта, сметы и технического задания.</p>
  <p class="s">2. Предмет Соглашения</p>
  <p>2.1. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и ориентировочную дату начала работ с ${rsdStr}</p>
  <p>2.2. Под резервированием понимается: включение объекта Заказчика в производственный график; блокировка временного слота бригады; планирование загрузки ресурсов; закрепление за Заказчиком определенного производственного ресурса в рамках внутреннего графика Исполнителя.</p>
  <p>2.3. Настоящее Соглашение не определяет объем, стоимость и сроки выполнения ремонтных работ.</p>
  <p class="s">3. Стоимость резервирования и порядок оплаты</p>
  <p>3.1. За резервирование даты Заказчик оплачивает фиксированный платеж в размере ${fmtN(amt)} тенге.</p>
  <p>3.2. Оплата производится Заказчиком в день подписания настоящего Соглашения.</p>
  <p>3.3. Соглашение считается заключенным и вступает в силу с момента поступления денежных средств на счет Исполнителя либо с момента фактической передачи денежных средств Исполнителю.</p>
  <p>3.4. До момента поступления оплаты Исполнитель не обязан осуществлять резервирование производственных ресурсов и даты начала работ.</p>
  <p class="s">4. Правовой статус платежа</p>
  <p>4.1. Платеж по настоящему Соглашению является оплатой услуги по резервированию производственного ресурса и услуга по резервированию считается оказанной с момента вступления настоящего Соглашения в силу.</p>
  <p>4.2. Указанный платеж не является: авансом; предоплатой; задатком; обеспечительным платежом; оплатой по договору подряда.</p>
  <p>4.3. При заключении основного договора подряда сумма резервирования засчитывается в общую стоимость работ.</p>
  <p>4.4. До заключения основного договора указанный платеж не создает обязательств Исполнителя по выполнению ремонтных работ.</p>
  <p class="s">5. Отказ сторон и возврат средств</p>
  <p>5.1. В случае отказа Заказчика после согласования сметы и подготовки к началу работ, сумма резервирования не возвращается.</p>
  <p>5.2. В случае одностороннего отказа Заказчика от заключения договора подряда по любым причинам, не связанным с нарушением обязательств Исполнителем, уплаченная сумма за резервирование возврату не подлежит, поскольку услуга по резервированию производственных ресурсов считается оказанной с момента вступления настоящего Соглашения в силу.</p>
  <p>5.3. В случае невозможности исполнения настоящего Соглашения по причинам, зависящим исключительно от Исполнителя (невозможность обеспечить бригаду в резервируемую дату), сумма возвращается Заказчику в полном объеме.</p>
  <p>5.4. Стороны подтверждают, что размер платежа является разумным и соразмерным последствиям резервирования производственного графика.</p>
  <p class="s">6. Перенос даты начала работ</p>
  <p>6.1. Заказчик вправе перенести дату начала работ не более одного раза.</p>
  <p>6.2. Перенос возможен не менее чем за 30 календарных дней до согласованной даты.</p>
  <p>6.3. При переносе менее чем за 30 дней Исполнитель вправе отказать в переносе без возврата суммы резервирования.</p>
  <p class="s">7. Обстоятельства, исключающие ответственность</p>
  <p>7.1. Стороны освобождаются от ответственности в случае наступления обстоятельств непреодолимой силы.</p>
  <p>7.2. К таким обстоятельствам относятся: чрезвычайные ситуации, запреты государственных органов, военные действия, аварии и иные события, находящиеся вне контроля сторон.</p>
  <p class="s">8. Срок действия Соглашения</p>
  <p>8.1. Соглашение вступает в силу с момента подписания и оплаты.</p>
  <p>8.2. Соглашение прекращает действие: при заключении основного договора подряда; при отказе одной из сторон; по истечению 10 календарных дней с даты предполагаемого начала работ.</p>
  <p class="s">9. Прочие условия</p>
  <p>9.1. Стороны подтверждают добровольность заключения настоящего Соглашения.</p>
  <p>9.2. Заказчик подтверждает, что ему разъяснен правовой статус платежа.</p>
  <p>9.3. Все споры решаются путем переговоров, при недостижении согласия — в судебном порядке по месту регистрации Исполнителя.</p>
  <p>9.4. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу.</p><br>
  <p class="b">Подписи сторон</p><br>
  ${sigBlock("Исполнитель:", "Заказчик:")}`;
    }
    const printBtn = forDocx ? "" : `\n<div class="np" style="margin-top:24px;text-align:center;padding:16px">\n  <button onclick="window.print()" style="padding:12px 36px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:700;font-family:Verdana,sans-serif">🖨 Распечатать / Сохранить PDF</button>\n</div>`;
    // Название документа (номер + клиент + дата, как при скачивании DOCX/GDoc) — иначе при
    // печати/сохранении в PDF браузер подставляет в имя файла голый «Договор №123» без клиента.
    const docLabelT = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[type] || "Договор";
    const dateStrT = c.date ? c.date.split("-").reverse().join(".") : "";
    // Имя файла (номер + клиент + дата ВПЕРЕДИ, ссылка на договор в конце) — иначе браузер при
    // сохранении PDF обрезает длинную прописную фразу и остаётся «Приложение №3 Перечень доп ра».
    // Тело документа не меняется (там свой полный заголовок «Перечень дополнительных работ»).
    const _clientT = client?.name ? " " + client.name : (c.estClient ? " " + c.estClient : "");
    const docTitle = (type === "annex"
      ? "Приложение №" + (c.appendix || 2) + _clientT + (dateStrT ? " от " + dateStrT : "") + " к дог. №" + (c.mainNumber || c.number || "")
      : docLabelT + " №" + (c.number || "") + _clientT + (dateStrT ? " от " + dateStrT : "")
    ).replace(/[<>:"/\\|?*]/g, "_");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(docTitle)}</title><style>${CSS}</style></head>
  <body>${body}${printBtn}
  </body></html>`;
    return html;
  };

  // Адаптер: договор подряда (тип podryad/podryad_annex) из формы редактора → модель для buildPodryadHtml
  const podryadContractToModel = (c, worker, withStamp=false) => ({
    kind: c.type==="podryad" ? "podryad" : "annex",
    number: c.number || "", annexNo: c.appendix || "",
    mainNumber: c.mainNumber || "", mainDate: c.mainDate || "",
    date: c.type==="podryad" ? (c.date||"") : (c.annexDate||c.date||""),
    city: c.city || "Караганда",
    worker: { name: worker?.name||"", iin: worker?.iin||"", doc: worker?.doc||"", docIssuer: worker?.docIssuer||"Выдан МВД РК", address: worker?.address||"", phone: worker?.phone||"", email: worker?.email||"" },
    contragentId: c.contragentId || "",
    objectAddress: c.objectAddress || "",
    // режим цены: per-line (за объём, цена в каждой строке) или lump (одна общая сумма за все работы)
    format: "table", showLinePrice: c.priceMode!=="lump",
    sections: [{ title:"", lumpSum:"", items:(c.works||[]).map(w=>({ name:w.name, qty:w.quantity, unit:w.unit, price:w.price })) }],
    manualTotal: c.priceMode==="lump" ? (c.manualTotal||"") : "",
    avans: c.avans||"", termDays: c.termDays||"", withStamp,
  });
  const generateContractPdfLegacy = (c, client, ca, withStamp=true) => {
    if (c.type==="podryad" || c.type==="podryad_annex") {
      const worker = workersRef.current.find(w=>w.id===c.workerId) || null;
      openOrPrintHtml(buildPodryadHtml(podryadContractToModel(c, worker, withStamp)), 20000);
      return;
    }
    const stampFile = ca?.stampFile || "stamp.jpg";
    const stamp = withStamp ? (stampsBase64[stampFile] || stampBase64) : "";
    const html = buildContractHtml(c, client, ca, false, stamp);
    openOrPrintHtml(html, 20000);
  };

  // ── ДОКУМЕНТЫ ДЛЯ КЛИЕНТА (договоры + акты) — публикация в отдельную ноду ──
  const contractToHtml = (c) => {
    try {
      if (c.type === "podryad" || c.type === "podryad_annex") {
        const worker = workersRef.current.find(w => w.id === c.workerId) || null;
        return buildPodryadHtml(podryadContractToModel(c, worker, false));
      }
      const client = clientsRef.current.find(x => x.id === c.clientId) || null;
      const ca = contragentsRef.current.find(x => x.id === c.contragentId) || null;
      return buildContractHtml(c, client, ca, false, "");
    } catch (e) { console.warn("contractToHtml err", e); return null; }
  };
  const _contractTitle = (c) => {
    const T = { repair_fiz: "Договор", annex: "Приложение", design: "Дизайн-проект", design_add: "Доп. соглашение", reservation: "Бронь", podryad: "Договор подряда", podryad_annex: "Приложение подряда" };
    const t = c.type || "repair_fiz";
    if (t === "annex" || t === "podryad_annex") return `${t === "podryad_annex" ? "Приложение подряда" : "Приложение"} №${c.appendix || 2}` + (c.mainNumber ? ` к №${c.mainNumber}` : "");
    return `${T[t] || "Договор"} ${c.number ? "№" + c.number : "(без номера)"}`;
  };
  // Смета для клиента: ТОЛЬКО клиентские цены (без себестоимости и маржи)
  const estimateToClientHtml = (est, obj, title) => {
    try {
      const catalog = getEffectiveCatalog();
      const mm = 1 + (Number(est.markup) || 0) / 100;
      const rows = Object.entries(est.rows || {}).filter(([, r]) => Number(r?.qty) > 0).map(([key, r]) => {
        const w = catalog.find(x => x.code === key) || catalog.find(x => x.name === key);
        if (!w) return null;
        const qty = Number(r.qty || 0);
        const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
        const raw = (r.manualPrice !== undefined && r.manualPrice !== "") ? Number(r.manualPrice) : getPrice(w, qty, r.complexity || "std", cpxPct);
        const price = Math.round((Number(raw) || 0) * mm);
        return { cat: w.cat || "Прочее", name: (r.manualName !== undefined ? r.manualName : w.name), unit: (r.manualUnit !== undefined ? r.manualUnit : (w.unit || "м²")), qty, price, sum: Math.round(price * qty) };
      }).filter(Boolean);
      if (!rows.length) return null;
      const subtotal = rows.reduce((s, r) => s + r.sum, 0);
      const disc = Number(est.discount) || 0;
      const total = Math.round(est.total || subtotal * (1 - disc / 100));
      const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const F = n => (Math.round(Number(n) || 0)).toLocaleString("ru-RU");
      const cats = []; const cmap = {};
      rows.forEach(r => { if (!cmap[r.cat]) { cmap[r.cat] = { cat: r.cat, items: [] }; cats.push(cmap[r.cat]); } cmap[r.cat].items.push(r); });
      let body = "";
      cats.forEach(g => {
        body += `<tr class="cat"><td colspan="5">${esc(g.cat)}</td></tr>`;
        g.items.forEach(r => { body += `<tr><td>${esc(r.name)}</td><td class="r">${F(r.qty)}</td><td>${esc(r.unit)}</td><td class="r">${F(r.price)}</td><td class="r">${F(r.sum)}</td></tr>`; });
      });
      const d = new Date(est.updatedAt || est.createdAt || Date.now());
      return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title || "Смета")}</title><style>
body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;margin:24px auto;max-width:820px;padding:0 14px}
h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:13px} th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
th{background:#f8fafc;font-size:11px;text-transform:uppercase;color:#64748b} .r{text-align:right;white-space:nowrap}
tr.cat td{background:#fdf6e9;font-weight:700;color:#92610f;text-transform:uppercase;font-size:11.5px}
.tot{margin-top:14px;text-align:right;font-size:15px} .tot b{font-size:18px}
@media print{body{margin:0}}
</style></head><body>
<h1>${esc(title || "Смета")}</h1>
<div class="sub">${esc([obj?.clientName, obj?.address].filter(Boolean).join(" · "))} · ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}</div>
<table><thead><tr><th>Наименование работ</th><th class="r">Кол-во</th><th>Ед.</th><th class="r">Цена, ₸</th><th class="r">Сумма, ₸</th></tr></thead><tbody>${body}</tbody></table>
<div class="tot">${disc > 0 ? `Сумма: ${F(subtotal)} ₸ · скидка ${disc}%<br/>` : ""}Итого: <b>${F(total)} ₸</b></div>
</body></html>`;
    } catch (e) { console.warn("estimateToClientHtml err", e); return null; }
  };
  const publishDocs = async (objectId) => {
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj || !obj.progressShared || !obj.progressToken) return;
    // Документы отключены в настройках видимости — пишем пустую ноду, чтобы клиент не видел
    // старые документы после выключения тумблера.
    if (obj.clientVis && obj.clientVis.docs === false) {
      try { await storage.set(DOCS_NODE(obj.progressToken), JSON.stringify({ contracts: [], estimates: [], acts: [], publishedAt: Date.now() })); } catch {}
      return;
    }
    // Только клиентские документы объекта (как в карточке объекта): договор с клиентом
    // по этому объекту + его доп. приложения. Договоры ПОДРЯДА (компания↔рабочий) и прочие
    // внутренние документы клиенту НЕ показываем.
    const mains = contractsRef.current.filter(c => !c.deletedAt && c.objectId === objectId && c.type !== "podryad" && c.type !== "podryad_annex");
    const mainNums = new Set(mains.filter(m => m.number).map(m => normCN(m.number)));
    const mainIds = new Set(mains.map(m => m.id));
    // доп. приложения к договорам объекта — по номеру родителя (на случай, если у приложения нет objectId)
    const annexes = contractsRef.current.filter(c => !c.deletedAt && c.type === "annex" && c.mainNumber && mainNums.has(normCN(c.mainNumber)) && !mainIds.has(c.id));
    const cons = [...mains, ...annexes];
    const acts = reportsRef.current.filter(r => r.objectId === objectId);
    const contracts = cons.map(c => ({ title: _contractTitle(c), html: contractToHtml(c) })).filter(x => x.html);
    const actsOut = acts.map(r => {
      let html = null;
      try { html = buildAvrHtml({ ...r, lines: (r.lines || []).map(l => ({ ...l, included: true, doneQty: l.doneQty })) }); } catch (e) {}
      return { title: `Акт №${r.actNo || "б/н"}`, date: r.actDate || r.createdAt || null, total: Number(r.total) || 0, html };
    }).filter(x => x.html);
    // Все сметы объекта (основная + доп.) — клиентские цены, без себестоимости
    const objEsts = estimatesRef.current.filter(e => e.objectId === objectId);
    const isMainEst = e => !e.parentId || e.parentId === e.id;
    const orderedEsts = [
      ...objEsts.filter(isMainEst).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      ...objEsts.filter(e => !isMainEst(e)).sort((a, b) => (a.dsNumber || 0) - (b.dsNumber || 0)),
    ];
    const mainsCount = orderedEsts.filter(isMainEst).length;
    let mi = 0;
    const estimatesOut = orderedEsts.map(e => {
      const main = isMainEst(e); if (main) mi++;
      const title = main ? `Смета${mainsCount > 1 ? ` ${mi}` : ""}` : `Доп. смета`;
      return { title, total: Math.round(e.total) || 0, date: e.updatedAt || e.createdAt || null, html: estimateToClientHtml(e, obj, title) };
    }).filter(x => x.html);
    try { await storage.set(DOCS_NODE(obj.progressToken), JSON.stringify({ contracts, estimates: estimatesOut, acts: actsOut, publishedAt: Date.now() })); } catch (e) { console.warn("publishDocs err", e); }
  };
  _publishDocsRef.current = publishDocs;

  // ТЕСТ: смета сделки = настоящая смета (estId). Работы для договора/печати берём из неё.
  const estimateToWorks = (est) => {
    if (!est) return [];
    const catalog = getEffectiveCatalog();
    const mm = 1 + (est.markup||0)/100;
    return Object.entries(est.rows||{}).filter(([,r])=>Number(r?.qty)>0).map(([key,r])=>{
      const w = catalog.find(x=>x.name===key)||catalog.find(x=>x.code===key);
      if(!w) return null;
      const qty = Number(r.qty||0);
      const cpxPct = r.cpxPct!==undefined ? Number(r.cpxPct) : undefined;
      const rawPrice = r.manualPrice!==undefined && r.manualPrice!=="" ? Number(r.manualPrice) : getPrice(w, qty, r.complexity||"std", cpxPct);
      const price = rawPrice ? rawPrice*mm : 0;
      const displayName = r.manualName!==undefined ? r.manualName : w.name;
      const displayUnit = r.manualUnit!==undefined ? r.manualUnit : (w.unit||"м²");
      return {name:displayName,quantity:qty,unit:displayUnit,price:price?Math.round(price):0};
    }).filter(Boolean);
  };
  const dealEstimate = (deal) => estimatesRef.current.find(e=>e.id===deal.estId) || null;
  const dealToContract = (deal) => {
    const est = dealEstimate(deal);
    return {
      type:"repair_fiz", number:deal.contractNumber||"", date:deal.contractDate||new Date().toISOString().slice(0,10),
      clientId:deal.clientId, contragentId:deal.contragentId, works:estimateToWorks(est), discount:(est?.discount)||0,
      advancePercent:deal.advancePercent??30, note:deal.note||"",
    };
  };
  // Открыть/создать настоящую смету для сделки (полный редактор с каталогом)
  const openDealEstimate = (deal) => {
    setDealReturnId(deal.id);
    let est = dealEstimate(deal);
    if (!est) {
      const cl = contractClients.find(x=>x.id===deal.clientId);
      const id = genId();
      est = {
        id, proj:{...EMPTY_PROJ, name:cl?.name||"", phone:cl?.phone||"", address:deal.address||cl?.address||"", type:deal.objType||"Вторичка", area:deal.area||"", manager:deal.manager||currentUser.name},
        rows:{}, discount:0, markup:0, note:"", status:"new", comment:"", _dealId:deal.id,
        createdAt:Date.now(), createdBy:currentUser.name, updatedAt:Date.now(), updatedBy:currentUser.name, total:0,
      };
      const newList = [est, ...estimatesRef.current];
      estimatesRef.current = newList; setEstimates(newList); saveEstimates(newList);
      const upd = {...deal, estId:id};
      setCurrentDeal(upd);
      const dl = dealsRef.current.filter(x=>x.id!==deal.id);
      saveDeals([...dl, upd]);
    }
    openEstimate(est);
  };
  const generateDealContractPdf = (deal, withStamp=true) => {
    const client = contractClients.find(x=>x.id===deal.clientId);
    const ca = contragents.find(x=>x.id===deal.contragentId);
    generateContractPdf(dealToContract(deal), client, ca, withStamp);
  };
  const generateDealEstimatePdf = (deal) => {
    const client = contractClients.find(x=>x.id===deal.clientId);
    const est = dealEstimate(deal);
    const works = estimateToWorks(est).filter(w=>w.name);
    const total = works.reduce((s,w)=>s+(Number(w.quantity)*Number(w.price)||0),0);
    const dPct = est?.discount||0;
    const disc = Math.round(total*dPct/100);
    const final = total - disc;
    const esc = s => String(s||"").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
    const rows = works.map((w,i)=>`<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i+1}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(w.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${w.quantity||0}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${esc(w.unit||"м²")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(w.price||0)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt((Number(w.quantity)*Number(w.price))||0)}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Смета ${esc(client?.name||deal.address||"")}</title>
    <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;color:#111827;padding:28px}@page{margin:10mm;size:A4 portrait}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:14px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase}.no-print{margin-top:20px;text-align:center}@media print{.no-print{display:none}}</style></head><body>
    <h1>Смета на ремонтные работы</h1>
    <div style="color:#6b7280;font-size:13px;margin-top:6px;line-height:1.6">
      ${client?.name?`Заказчик: <b>${esc(client.name)}</b><br>`:""}
      ${deal.address?`Объект: ${esc(deal.address)}<br>`:""}
      Дата: ${new Date().toLocaleDateString("ru-RU")}
    </div>
    <table><thead><tr><th>№</th><th>Наименование</th><th style="text-align:center">Кол-во</th><th style="text-align:center">Ед.</th><th style="text-align:right">Цена</th><th style="text-align:right">Сумма</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="margin-top:16px;text-align:right;font-size:14px">
      ${disc>0?`Сумма: ${fmt(total)} ₸<br><span style="color:#dc2626">Скидка ${dPct}%: −${fmt(disc)} ₸</span><br>`:""}
      <div style="font-size:20px;font-weight:800;margin-top:6px">Итого: ${fmt(final)} ₸</div>
    </div>
    <div class="no-print"><button onclick="window.print()" style="padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:inherit">🖨 Сохранить PDF</button></div>
    </body></html>`;
    openOrPrintHtml(html, 30000);
  };

  const generateContractDocxLegacy = async (c, client, ca) => {
    const clientName = client?.name || c.estClient || "договор";
    const num = c.number || c.id?.slice(-4) || "б-н";
    const dateStr = c.date ? c.date.split("-").reverse().join(".") : "";
    const isAnnexD = (c.type||"repair_fiz") === "annex";
    const docLabel = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[c.type||"repair_fiz"] || "Договор";
    const filename = isAnnexD
      ? ("Приложение №"+(c.appendix||2)+" "+clientName+(dateStr?" от "+dateStr:"")+" к дог. №"+(c.mainNumber||num)+".docx").replace(/[<>:"/\\|?*]/g,"_")
      : (docLabel+" №"+num+" "+clientName+(dateStr?" от "+dateStr:"")+".docx").replace(/[<>:"/\\|?*]/g,"_");

    try {
    // Раньше библиотека docx грузилась скриптом с unpkg.com в момент клика — если CDN
    // недоступен (нет интернета, блокировка сетью), генерация DOCX ломалась целиком. Теперь
    // docx — обычная npm-зависимость проекта, Vite выносит её в отдельный чанк и грузит
    // с того же домена, что и остальное приложение (тот же CDN, что и всё остальное, не
    // сторонний unpkg.com) — динамический import(), а не script-инъекция.
    let D;
    try {
      const mod = await import("docx");
      D = mod.Document ? mod : (mod.default && mod.default.Document ? mod.default : mod);
    } catch (loadErr) {
      alert("Не удалось загрузить сервис генерации DOCX.\n\nПроверьте интернет-соединение и попробуйте ещё раз. Если проблема повторяется — воспользуйтесь кнопками 📄 PDF или 📋 GDoc вместо DOCX.");
      return;
    }
    if (!D || !D.Document) { alert("Не удалось загрузить сервис генерации DOCX.\n\nПроверьте интернет-соединение и попробуйте ещё раз. Если проблема повторяется — воспользуйтесь кнопками 📄 PDF или 📋 GDoc вместо DOCX."); return; }
    const TNR = "Times New Roman";
    const mmT = mm => Math.round(mm * 56.692);
    const hp = pt => pt * 2;
    const CONTENT_W = 9356; // twips: A4 - margins 30+15mm
    const col = pct => Math.round(CONTENT_W * pct / 100);

    const isYur = client?.clientType === "yur" || client?.type === "юр";
    const clName = client?.name || "___________________";
    const clIIN = client?.iin || "___________________";
    const clDoc = client?.doc || "___________________";
    const clAddr = client?.address || "___________________";
    const clPhone = client?.phone || "___________________";
    const TITOV = {
      name: ca?.name||'ТОО "TITOVSTROY"',
      bin:  ca?.bin||"231040002769",
      bank: ca?.bank||'АО "Kaspi Bank"',
      bik:  ca?.bik||"CASPKZKA",
      acc:  ca?.account||"KZ38722S000030058973",
      addr: ca?.address||"Казахстан, район им.Казыбек би, улица Кирпичная, дом 8г",
      phone:ca?.phone||"8707 667 8766",
      email:ca?.email||"titovstroy@mail.ru",
      dir:  ca?.director||"Титов В.Е.",
    };
    const clShort = (() => { const p=(clName).split(" "); return isYur?clName:p[0]+" "+(p[1]?p[1][0]+".":"")+(p[2]?p[2][0]+".":""); })();

    const fmtMo = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
    const fmtDate = s => { if(!s) return {d:"__",m:"______",y:"____"}; const [y,m,d]=s.split("-"); return {d:String(Number(d)),m:fmtMo[Number(m)-1]||"",y}; };
    const dt = fmtDate(c.date);
    const fmtN2 = n => Math.round(Number(n)||0).toLocaleString("ru-RU");
    const total = (c.works||[]).reduce((s,w)=>s+(Number(w.quantity||0)*Number(w.price||0)),0);
    const adv = c.advancePercent ?? 30;

    const T = (text, opts={}) => new D.TextRun({text:String(text??""), font:TNR, size:hp(opts.sz||11), bold:!!opts.b, italics:!!opts.i, color:opts.col||"000000"});
    const P = (runs, opts={}) => new D.Paragraph({
      children: Array.isArray(runs)?runs:[runs],
      alignment: opts.al || D.AlignmentType.JUSTIFIED,
      spacing: {before: opts.sb??40, after: opts.sa??40},
      pageBreakBefore: !!opts.pb,
    });
    const PC = (runs, opts={}) => P(runs, {...opts, al: D.AlignmentType.CENTER});
    const BORDERS = {top:{style:D.BorderStyle.SINGLE,size:4,color:"000000"},bottom:{style:D.BorderStyle.SINGLE,size:4,color:"000000"},left:{style:D.BorderStyle.SINGLE,size:4,color:"000000"},right:{style:D.BorderStyle.SINGLE,size:4,color:"000000"}};
    const NO_BORDERS = {top:{style:D.BorderStyle.NONE},bottom:{style:D.BorderStyle.NONE},left:{style:D.BorderStyle.NONE},right:{style:D.BorderStyle.NONE}};

    const TC = (text, w, opts={}) => new D.TableCell({
      children:[P([T(text,{sz:opts.sz||8.5,b:opts.b,i:opts.i,col:opts.col})],{al:opts.al||D.AlignmentType.LEFT,sb:20,sa:20})],
      width:{size:col(w),type:D.WidthType.DXA},
      columnSpan:opts.span||1,
      borders:BORDERS,
      shading: opts.bg?{fill:opts.bg,type:"clear",color:opts.bg}:undefined,
      verticalAlign:"center",
      margins:{top:28,bottom:28,left:57,right:57},
    });

    // Таблица работ
    const makeWorksTable = () => {
      const works = c.works||[];
      const catOrder=[], catMap={};
      works.forEach(w=>{
        const cat=w.category||"\u0420\u0430\u0431\u043e\u0442\u044b";
        if(!catMap[cat]){catMap[cat]={total:0,rows:[]};catOrder.push(cat);}
        const sum=w.priceFrom ? 0 : Number(w.quantity||0)*Number(w.price||0);
        catMap[cat].total+=sum; catMap[cat].rows.push(Object.assign({},w,{sum:sum}));
      });
      const rows=[];
      rows.push(new D.TableRow({children:[TC("\u2116",5,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435 \u0440\u0430\u0431\u043e\u0442",45,{b:true,bg:"DDDDDD"}),TC("\u0415\u0434.",8,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u041e\u0431\u044a\u0451\u043c",8,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u0426\u0435\u043d\u0430 \u0437\u0430 \u0435\u0434.",17,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER}),TC("\u0421\u0443\u043c\u043c\u0430",17,{b:true,bg:"DDDDDD",al:D.AlignmentType.CENTER})]}));
      let n=0;
      catOrder.forEach(function(cat){
        const ct=catMap[cat].total, cr=catMap[cat].rows;
        rows.push(new D.TableRow({children:[TC(cat+" \u2014 "+fmtN2(ct)+" \u20b8",100,{span:6,b:true,bg:"2a2a3a",col:"c8a060"})]}));
        var lastSub="";
        cr.forEach(function(w,i){
          if(w.subcategory&&w.subcategory!==lastSub){lastSub=w.subcategory;rows.push(new D.TableRow({children:[TC(w.subcategory,100,{span:6,i:true,bg:"e8e4f0",col:"5a3a8a"})]}));}
          n++;
          var bg=i%2===0?"f8f6f0":"f0ede5";
          rows.push(new D.TableRow({children:[TC(String(n),5,{bg:bg,al:D.AlignmentType.CENTER}),TC(w.name||"",45,{bg:bg}),TC(w.unit||"\u043c\xb2",8,{bg:bg,al:D.AlignmentType.CENTER}),TC(String(w.quantity||""),8,{bg:bg,al:D.AlignmentType.CENTER}),TC(w.priceFrom ? "\u043e\u0442 "+fmtN2(w.priceFrom)+" \u20b8" : fmtN2(w.price)+" \u20b8",17,{bg:bg,al:D.AlignmentType.RIGHT}),TC(w.priceFrom ? "\u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f" : fmtN2(w.sum)+" \u20b8",17,{bg:bg,b:true,al:D.AlignmentType.RIGHT})]}));
        });
        rows.push(new D.TableRow({children:[TC("\u0418\u0442\u043e\u0433\u043e \u043f\u043e \u0440\u0430\u0437\u0434\u0435\u043b\u0443 \u00ab"+cat+"\u00bb:",83,{span:5,i:true,bg:"ede8d5",al:D.AlignmentType.RIGHT}),TC(fmtN2(ct)+" \u20b8",17,{bg:"ede8d5",b:true,al:D.AlignmentType.RIGHT})]}));
      });
      // ИТОГО строка
      // ИТОГО строка — с учётом скидки
      if(c.discount>0){
        const discAmt=Math.round(total*c.discount/100);
        rows.push(new D.TableRow({children:[TC("Скидка "+c.discount+"%:",83,{span:5,i:true,bg:"fce8e8",al:D.AlignmentType.RIGHT}),TC("\u2212 "+fmtN2(discAmt)+" \u20b8",17,{bg:"fce8e8",i:true,al:D.AlignmentType.RIGHT})]}));
        rows.push(new D.TableRow({children:[TC("\u0418\u0422\u041e\u0413\u041e \u0441\u043e \u0441\u043a\u0438\u0434\u043a\u043e\u0439:",83,{span:5,b:true,bg:"e8e0c8",al:D.AlignmentType.RIGHT}),TC(fmtN2(total-discAmt)+" \u20b8",17,{bg:"e8e0c8",b:true,sz:11,al:D.AlignmentType.RIGHT})]}));
      } else {
        rows.push(new D.TableRow({children:[TC("\u0418\u0422\u041e\u0413\u041e:",83,{span:5,b:true,bg:"e8e0c8",al:D.AlignmentType.RIGHT}),TC(fmtN2(total)+" \u20b8",17,{bg:"e8e0c8",b:true,sz:11,al:D.AlignmentType.RIGHT})]}));
      }
      return new D.Table({rows:rows,width:{size:CONTENT_W,type:D.WidthType.DXA}});
    };

    const SC = (lineArr) => new D.TableCell({
      children:lineArr.map(l=>P([T(l.t||"",{sz:10,b:l.b})],{sb:25,sa:25})),
      borders:NO_BORDERS,
      width:{size:col(50),type:D.WidthType.DXA},
      margins:{top:0,bottom:0,left:0,right:200},
    });
    const leftLines = [{t:"Подрядчик:",b:true},{t:""},{t:TITOV.name},{t:"БИН: "+TITOV.bin},{t:"Банк: "+TITOV.bank},{t:"БИК: "+TITOV.bik},{t:"Номер счёта: "+TITOV.acc},{t:"Адрес: "+TITOV.addr},{t:"Тел.: "+TITOV.phone},{t:"Email: "+TITOV.email},{t:""},{t:"Генеральный директор:"},{t:TITOV.dir+" _______________ М.П."}];
    let rightLines;
    if(isYur){
      rightLines=[{t:"Заказчик:",b:true},{t:""},{t:clName},{t:"БИН: "+clIIN}];
      if(client?.bank)rightLines.push({t:"Банк: "+client.bank});
      if(client?.bik)rightLines.push({t:"БИК: "+client.bik});
      if(client?.account)rightLines.push({t:"ИИК: "+client.account});
      rightLines.push({t:"Адрес: "+clAddr},{t:"Тел.: "+clPhone});
      if(client?.email)rightLines.push({t:"Email: "+client.email});
      rightLines.push({t:""},{t:"Директор:"},{t:(client?.directorShort||client?.director||"")+" ____________________  М.П."});
    } else {
      rightLines=[{t:"Заказчик:",b:true},{t:""},{t:"ФИО: "+clName},{t:"ИИН: "+clIIN},{t:"№ документа: "+clDoc},{t:"Адрес: "+clAddr},{t:"Тел.: "+clPhone},{t:""},{t:clShort+" Подпись ___________"}];
    }
    const sigTable = () => new D.Table({rows:[new D.TableRow({children:[SC(leftLines),SC(rightLines)]})],width:{size:CONTENT_W,type:D.WidthType.DXA}});

    // Преамбула
    const preamParas = (role="Подрядчик") => {
      const tit = (ca?.name||'ТОО "TITOVSTROY"')+', БИН '+(ca?.bin||'231040002769')+'  (далее — "'+role+'"), в лице директора '+(ca?.director||'________')+', действующего на основании Устава';
      const tail = 'совместно именуемые "Стороны", а по отдельности – "Сторона", заключили настоящий документ о нижеследующем:';
      if(isYur) return [
        P([T(tit+", с одной стороны, и")]),
        P([T(clName+", БИН "+clIIN+' (далее — "Заказчик") в лице '+(client?.director||"Директора")+", "+(client?.directorShort||client?.director||"")+", действующего на основании Устава, с другой стороны, "+tail)]),
      ];
      return [
        P([T(clName+", ИИН "+clIIN+", № документа "+clDoc+', Выдан МВД РК, (далее — "Заказчик") с одной стороны, и')]),
        P([T(tit+', с другой стороны, '+tail)]),
      ];
    };
    // Приложение №1
    const type = c.type || "repair_fiz";
    const advPct = c.advancePercent ?? 30;

    // helpers to convert HTML text to docx paragraphs
    const s = (text) => P([T(text, {b:true})]);  // section header
    const b = (text) => P([T(text, {b:true})]);  // bold
    const n = (text) => P([T(text)]);             // normal

    let children = [];

    if(type==="repair_fiz"){
      const annex1 = [
        PC([T("Приложение №1",{sz:13,b:true})],{pb:true,sb:0}),
        PC([T("Перечень этапов, видов и стоимость работ",{sz:12,b:true})]),
        PC([T("к Договору ремонтно-отделочных работ")]),
        PC([T("№"+(c.number||"___")+" от «"+dt.d+"» "+dt.m+" "+dt.y+" г.")]),
        P([]),
        s("1. Общие положения"),
        n("1.1. Настоящее Приложение является неотъемлемой частью Договора ремонтно-отделочных работ №"+(c.number||"___")+" от «"+dt.d+"» "+dt.m+" "+dt.y+" г. и определяет этапы, виды и стоимость ремонтно-отделочных работ, выполняемых Подрядчиком на Объекте."),
        s("2. Перечень этапов и видов работ"),
        makeWorksTable(),
        P([]),
        s("3. Условия выполнения работ"),
        n("3.1. В стоимость Работ могут входить расходы Подрядчика на материалы, оборудование, доставку и иные затраты, необходимые для выполнения Работ, если иное прямо указано в договоре. В случае если материалы, оборудование, инструменты, субподряд предоставляет Заказчик, Подрядчик не несет ответственности за их качество, комплектность и соответствие проектным требованиям."),
        n("3.2. Работы выполняются поэтапно в соответствии с указанными сроками."),
        n("3.3. Любые дополнительные работы, не предусмотренные настоящим Приложением, выполняются на основании дополнительного соглашения сторон с корректировкой стоимости и сроков."),
        s("4. Порядок оплаты"),
        n("4.1. При заключении договора заказчик вносит предоплату (аванс) в размере "+advPct+"% ("+fmtN2(Math.round(total*advPct/100))+" тенге), которая идет в зачет основной суммы договора, при расторжении договора предоплата возврату не подлежит."),
        n("4.2. Оплата за работы (за исключением предоплаты) производится поэтапно на основании актов выполненных работ (форма КС-2) в течение 2 банковских дней после подписания акта."),
        s("5. Общая стоимость работ составляет "+fmtN2(total)+" ₸"),
        P([]),
        b("Подписи сторон"),
        P([]),
        sigTable(),
      ];
      children = [
        PC([T("Договор подряда №"+(c.number||"___"),{sz:13,b:true})]),
        PC([T("на выполнение ремонтно-отделочных работ",{sz:12,b:true})]),
        PC([T(dt.full+" г.          г. Караганда")]),
        P([]),
        ...preamParas("Подрядчик"),
        P([]),
        s("1. ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ"),
        n("1.1.1. Договор – настоящий договор подряда со всеми приложениями и дополнениями к нему."),
        n("1.1.2. Объект – "+(client?.objectType||"наименование объекта")+" по адресу: "+clAddr+", где Подрядчик обязуется выполнить Работы."),
        n("1.1.3. Заказчик – юридическое или физическое лицо, указанное в преамбуле Договора."),
        n("1.1.4. Подрядчик – юридическое лицо, определенное в преамбуле настоящего Договора."),
        n("1.1.5. Работы – комплекс ремонтно-отделочных работ, установленный в Приложении №1."),
        n("1.1.6. Субподрядчик – третье лицо, привлекаемое Подрядчиком для выполнения части Работ."),
        n("1.1.7. Материалы – все строительные материалы, которые должны быть использованы для выполнения Работ."),
        n("1.1.10. Недостатки Работ – все недостатки, недоработки, дефекты (в том числе скрытые), допущенные Подрядчиком. Подрядчик не несет ответственности за недостатки по вине Заказчика или форс-мажора."),
        n("1.1.11. Гарантийный срок – 1 год, в течение которого Заказчик вправе предъявить претензии."),
        s("2. ПРЕДМЕТ ДОГОВОРА"),
        n("2.1. По настоящему Договору Подрядчик обязуется по заданию Заказчика выполнить комплекс ремонтно-отделочных работ, установленный в Приложении №1 «Перечень видов и этапов работ», а Заказчик обязуется создать Подрядчику необходимые условия для выполнения Работ, принять их результат и уплатить обусловленную цену в соответствии со ст. 651 ГК РК."),
        n("2.2. Подрядчик обязан выполнить Работы в соответствии с нормативно-правовыми документами РК, условиями Договора и Приложения №1."),
        n("2.3. Подрядчик гарантирует наличие всех полномочий, финансовых, материальных, трудовых и иных ресурсов."),
        s("3. ПРАВА И ОБЯЗАННОСТИ СТОРОН"),
        b("3.1. Заказчик обязан:"),
        n("3.1.1. Оплачивать Работы в соответствии с условиями настоящего Договора и в установленные сроки."),
        n("3.1.2. Принимать выполненные Работы в соответствии с условиями Договора и нормативными документами РК."),
        n("3.1.3. Осуществлять контроль и технический надзор за ходом и качеством выполняемых Работ."),
        n("3.1.5. Немедленно заявлять Подрядчику о выявленных отступлениях. Если Заказчик не сделает заявления в течение 2 дней, он теряет право ссылаться на обнаруженные недостатки."),
        n("3.1.7. Предоставить Подрядчику беспрепятственный доступ на Строительную площадку."),
        b("3.2. Заказчик вправе:"),
        n("3.2.1. Требовать внесения изменений в документацию, не связанных с дополнительными расходами для Подрядчика."),
        n("3.2.3. Требовать от Подрядчика устранения выявленных недостатков на любом этапе, в гарантийный период."),
        b("3.3. Подрядчик обязан:"),
        n("3.3.1. Выполнить Работы с надлежащим качеством, в установленные Договором сроки."),
        n("3.3.3. Незамедлительно сообщить Заказчику об обнаружении не учтенных работ и необходимости дополнительных Работ. При неполучении ответа в течение 2 дней Подрядчик вправе приостановить выполнение Работ."),
        n("3.3.4. Обеспечить выполнение Работ качественными материалами, если заказчик не берет ответственность за материалы на себя."),
        n("3.3.7. Обеспечить соблюдение правил техники безопасности, противопожарной безопасности, своевременный вывоз мусора."),
        n("3.3.12. Безвозмездно устранять выявленные несоответствия Работ, только если недостатки возникли по вине Подрядчика."),
        n("3.3.14. После окончания Работ вывезти оборудование и передать исполнительную документацию в течение 10 дней."),
        b("3.4. Подрядчик вправе:"),
        n("3.4.1. Требовать пересмотра стоимости Работ, если по независящим от Подрядчика причинам стоимость превысила смету."),
        n("3.4.3. Приостановить выполнение Работ в случаях, предусмотренных законами РК, с уведомлением за 2 дня."),
        n("3.4.5. Привлекать к исполнению своих обязательств субподрядчиков без предварительного согласия Заказчика."),
        n("3.4.6. Расторгнуть Договор и требовать возмещения убытков в случае нарушения Заказчиком существенных условий (включая просрочку оплаты более 3 дней), с уведомлением за 2 дня."),
        s("4. СТОИМОСТЬ, СРОКИ И ПОРЯДОК ОПЛАТЫ РАБОТ"),
        n("4.1. Общая стоимость работ, а также сроки и порядок оплаты определяется в соответствии с Приложением №1 «Перечень видов и этапов работ»."),
        n("4.2. Стоимость каждой единицы Работ, установленная в Приложении №1, является твердой и изменению не подлежит, за исключением случаев п. 3.4.1."),
        n("4.4. Заказчик оплачивает выполненные Работы по факту завершения и подписания актов приемки в течение 2 банковских дней."),
        n("4.5. Все расчеты Сторон производятся в тенге, в безналичном порядке."),
        s("5. СРОКИ ВЫПОЛНЕНИЯ РАБОТ"),
        n("5.1. Подрядчик обязан выполнить Работы в соответствии с Приложением №1 «Перечень видов и этапов работ»."),
        n("5.2. Сроки могут быть изменены по соглашению Сторон. Задержки, вызванные Заказчиком, продлевают сроки без ответственности Подрядчика."),
        s("6. ПОРЯДОК ВЫПОЛНЕНИЯ РАБОТ"),
        n("6.1. Подрядчик выполняет работы поэтапно, в соответствии с Приложением №1."),
        n("6.3. После завершения Работ Подрядчик письменно уведомляет Заказчика и вызывает его для приемки в течение 2 дней."),
        s("7. ПОРЯДОК СДАЧИ-ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ"),
        n("7.1. Приемка осуществляется после завершения каждого этапа Работ."),
        n("7.2. Заказчик обязан приступить к приемке в течение 2 дней после уведомления."),
        n("7.5. Сдача-приемка оформляется актом, подписываемым обеими Сторонами."),
        n("7.9. Заказчик обязан принять Работы и подписать Акт в течение 2 дней, либо дать обоснованный письменный отказ."),
        n("7.10. При необоснованном отказе Заказчика более чем на 2 дня, Подрядчик вправе подписать Акт в одностороннем порядке."),
        n("7.11. При споре назначается экспертиза. Расходы несет Заказчик, за исключением случаев, когда установлена вина Подрядчика."),
        s("8. ГАРАНТИИ КАЧЕСТВА"),
        n("8.1. Гарантийный срок составляет 12 месяцев со дня подписания акта окончательной приемки в соответствии со ст. 666 ГК РК."),
        n("8.3. Подрядчик несет ответственность за недостатки в пределах гарантийного срока, если не докажет вину Заказчика, нормальный износ или форс-мажор."),
        n("8.6. Подрядчик обязан явиться на Объект в срок до 10 рабочих дней для составления Дефектного акта."),
        s("9. ОТВЕТСТВЕННОСТЬ СТОРОН"),
        n("9.1. Стороны несут ответственность в пределах, установленных законами РК (ст. 651–666 ГК РК)."),
        n("9.2. За нарушение сроков Заказчик вправе взыскать пеню 0,05% от стоимости незавершенных Работ за каждый день, но не более 5% от общей стоимости."),
        n("9.5. За нарушение сроков оплаты Подрядчик вправе взыскать пеню 5% от неоплаченной суммы за каждый день, а также приостановить работы до оплаты."),
        n("9.8. Общая ответственность Подрядчика ограничена 5% от стоимости Договора."),
        s("10. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ (ФОРС-МАЖОР)"),
        n("10.1. Стороны освобождаются от ответственности при форс-мажоре в соответствии со ст. 13 ГК РК."),
        n("10.2. К форс-мажору относятся: пожары, стихийные бедствия, военные действия, акты государственных органов. Сторона, ссылающаяся на форс-мажор, уведомляет другую в течение 5 дней."),
        s("11. СРОК ДЕЙСТВИЯ ДОГОВОРА"),
        n("11.1. Договор вступает в силу с момента подписания и действует до полного исполнения обязательств, включая гарантийные."),
        n("11.3. Окончание срока или расторжение не освобождает Стороны от ответственности за нарушение."),
        s("12. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ"),
        n("12.1. Применяемое право – право Республики Казахстан."),
        n("12.2. Стороны принимают меры по досудебному урегулированию споров в течение 10 дней."),
        n("12.4. Все споры рассматриваются в суде по месту нахождения Подрядчика."),
        s("13. ОБЩИЕ ПОЛОЖЕНИЯ"),
        n("13.1. Стороны обязуются информировать друг друга об изменении реквизитов в течение 10 дней."),
        n("13.2. Договор составлен в двух подлинных экземплярах, имеющих одинаковую юридическую силу."),
        n("13.3. Все изменения действительны только в письменной форме."),
        n("13.4. Договор составлен в соответствии с ГК РК и иными нормативными актами РК."),
        s("14. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН"),
        P([]),
        sigTable(),
        ...annex1,
      ];

    } else if(type==="annex"){
      const an = c.appendix||2;
      const prevList = Array.from({length:an-1},(_,i)=>"№"+(i+1)).join(" и ");
      const dtA = fmtDate(c.annexDate||c.date);
      const dtM = fmtDate(c.mainDate||c.date);
      children = [
        PC([T("Приложение №"+an,{sz:13,b:true})]),
        PC([T("Перечень дополнительных работ и их стоимость",{sz:12,b:true})]),
        PC([T("к Договору ремонтно-отделочных работ")]),
        PC([T("№"+(c.mainNumber||c.number||"___")+" от «"+dtM.d+"» "+dtM.m+" "+dtM.y+" г.")]),
        P([]),
        PC([T("г. Караганда "+dtA.full+" г.")]),
        P([]),
        s("1. Общие положения"),
        n("1.1. Настоящее Приложение №"+an+" является неотъемлемой частью Договора ремонтно-отделочных работ №"+(c.mainNumber||c.number||"___")+" от «"+dtM.d+"» "+dtM.m+" "+dtM.y+" г. и определяет перечень дополнительных работ, согласованных Сторонами в процессе выполнения Работ."),
        n("1.2. Работы, указанные в настоящем Приложении №"+an+", выполняются Подрядчиком по заданию Заказчика в рамках предмета Договора и подлежат оплате на условиях, установленных Договором."),
        n("1.3. Стоимость работ по настоящему Приложению №"+an+" оплачивается Заказчиком дополнительно, увеличивает общую стоимость Договора и не входит в стоимость работ по Приложению "+prevList+"."),
        n("1.4. Настоящее Приложение №"+an+" оформляет согласование дополнительных работ, их объем, стоимость и сроки."),
        P([]),
        makeWorksTable(),
        P([]),
        b("Подписи сторон"),
        P([]),
        sigTable(),
      ];

    } else if(type==="design"){
      const advD = c.designAdvance||25000;
      children = [
        PC([T("СОГЛАШЕНИЕ №"+(c.number||"___"),{sz:13,b:true})]),
        PC([T("о разработке дизайн проекта",{sz:12,b:true})]),
        PC([T(dt.full+" г.          г. Караганда")]),
        P([]),
        ...preamParas("Исполнитель"),
        P([]),
        s("1. Общие положения"),
        n("1.1. Исполнитель обязуется по заданию Заказчика разработать дизайн проект Объекта, расположенного по адресу: "+clAddr+"."),
        n("1.2. Под дизайн проектом понимается разработка интерьерных решений (перечень возможных опций): обмерочный план; планировочное решение; концепция интерьера; 3D визуализация; рабочие чертежи для выполнения ремонтных работ; ведомость отделочных материалов."),
        n("1.3. Конкретный состав, объем и наполнение дизайн проекта определяется Техническим заданием, оформляемым в виде Приложения №1 к настоящему Соглашению."),
        s("2. Стоимость и порядок оплаты"),
        n("2.1. Окончательная стоимость дизайн проекта определяется после проведения замеров Объекта и утверждения Технического задания."),
        n("2.2. Стоимость может определяться: фиксированной суммой или исходя из площади Объекта стоимостью за 1 кв.м."),
        n("2.3. Итоговая стоимость утверждается Сторонами путем подписания Дополнительного соглашения после согласования Технического задания."),
        n("2.4. Заказчик оплатил Исполнителю предоплату в размере "+fmtN2(advD)+" тенге."),
        n("2.5. Указанная сумма засчитывается в общую стоимость дизайн проекта."),
        n("2.6. Оставшаяся сумма оплачивается в сроки, согласованные Сторонами дополнительно."),
        n("2.7. Внесение Заказчиком изменений в согласованное Техническое задание после подписания Дополнительного соглашения влечет пересмотр сроков и стоимости."),
        n("2.8. В случае если Стороны не достигли соглашения по итоговой стоимости, настоящее Соглашение может быть расторгнуто, при этом предоплата засчитывается в счет фактически выполненных работ."),
        s("3. Сроки выполнения"),
        n("3.1. Срок разработки дизайн проекта определяется и указывается в Приложении №1 к настоящему Соглашению."),
        n("3.2. Срок может быть продлен в случае внесения изменений Заказчиком."),
        n("3.3. В случае если Заказчик не согласовывает Техническое задание более 10 рабочих дней, Исполнитель вправе приостановить выполнение работ."),
        n("3.4. Моментом начала выполнения работ считается дата проведения замеров либо дата направления первых проектных решений."),
        s("4. Порядок сдачи результата"),
        n("4.1. Результат работ передается Заказчику в электронном виде."),
        n("4.2. Проект считается принятым, если в течение 3 рабочих дней Заказчик не направил мотивированные замечания."),
        n("4.4. Количество вариантов проектных решений и корректировок определяется Техническим заданием. Дополнительные корректировки выполняются за отдельную оплату."),
        s("5. Отказ и возврат средств"),
        n("5.1. В случае отказа Заказчика до начала работ, предоплата возвращается за вычетом фактически понесенных расходов."),
        n("5.2. В случае отказа Заказчика после начала работ, предоплата возврату не подлежит."),
        n("5.3. В случае невозможности исполнения по вине Исполнителя предоплата возвращается полностью."),
        s("6. Авторские права"),
        n("6.1. Исполнитель сохраняет авторские права на созданный дизайн проект."),
        n("6.2. Заказчик получает право использовать дизайн проект исключительно для проведения ремонтных работ на указанном Объекте."),
        n("6.4. Полная передача авторских прав производится после полной оплаты всех работ."),
        s("7. Прочие условия"),
        n("7.1. Настоящее Соглашение вступает в силу с момента подписания."),
        n("7.2. Все споры разрешаются в судебном порядке по месту регистрации Исполнителя."),
        n("7.3. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу."),
        n("7.6. Общая ответственность Исполнителя ограничивается суммой фактически оплаченных Заказчиком средств по настоящему Соглашению."),
        P([]),
        b("Подписи сторон"),
        P([]),
        sigTable(),
      ];

    } else if(type==="design_add"){
      const comp = c.composition||{};
      const COMP = [["plan","Обмерочный план"],["layout","Планировочное решение"],["concept","Концепция интерьера"],["vis3d","3D визуализация"],["drawings","Рабочие чертежи"],["materials","Ведомость отделочных материалов"]];
      const advD = c.designAdvance||25000;
      const tcost = c.priceType==="sqm" ? Math.round((c.pricePerSqm||0)*(c.area||0))||null : c.totalCost||null;
      const rem = (tcost&&advD) ? tcost-advD : null;
      children = [
        PC([T("ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ №"+(c.number||"___"),{sz:13,b:true})]),
        PC([T("к Соглашению №"+(c.mainNumber||"___")+" о разработке дизайн проекта",{sz:12,b:true})]),
        PC([T(dt.full+" г.          г. Караганда")]),
        P([]),
        ...preamParas("Исполнитель"),
        P([]),
        s("1. Техническое задание"),
        n("1.1. Стороны согласовали следующий состав дизайн проекта:"),
        ...COMP.map(([k,l])=>n("["+( comp[k]?"X":" ")+"] "+l)),
        n("1.2. Площадь Объекта: "+(c.area||"________")+" кв.м."),
        n("1.3. Количество вариантов планировочного решения: "+(c.variantsLayout||"________")+"."),
        n("1.4. Количество раундов корректировок по планировке: "+(c.corrLayout||"________")+"."),
        n("1.5. Количество раундов корректировок по визуализациям: "+(c.corrVis||"________")+"."),
        n("1.6. Дополнительные корректировки оплачиваются отдельно по согласованию Сторон."),
        s("2. Стоимость"),
        n("2.1. Стоимость дизайн проекта определяется:"),
        n("["+(c.priceType==="sqm"?" ":"X")+"] фиксированной суммой"),
        n("["+( c.priceType==="sqm"?"X":" ")+"] из расчета "+(c.pricePerSqm||"___________")+" тенге за 1 кв.м."),
        n("2.2. Итоговая стоимость дизайн проекта составляет "+(tcost?fmtN2(tcost)+" тенге":"_____________________ тенге")+"."),
        n("2.3. Предоплата "+fmtN2(advD)+" тенге засчитывается в общую стоимость."),
        n("2.4. Оставшаяся сумма к оплате составляет: "+(rem!==null?fmtN2(rem)+" тенге":"_____________________ тенге")+"."),
        s("3. Порядок оплаты"),
        n("3.1. Оплата производится в формате полной предоплаты."),
        n("3.2. Передача полного комплекта рабочих чертежей осуществляется после полной оплаты."),
        s("4. Сроки"),
        n("4.1. Срок выполнения работ составляет "+(c.deadline||"_________")+" рабочих дней."),
        n("4.2. Срок исчисляется с даты подписания настоящего Дополнительного соглашения либо с даты выполнения Заказчиком обязанностей по оплате."),
        n("4.3. Срок продлевается в случае внесения изменений Заказчиком."),
        s("5. Прочие условия"),
        n("5.1. Настоящее Дополнительное соглашение является неотъемлемой частью основного Соглашения."),
        n("5.2. Все остальные условия основного Соглашения остаются без изменений."),
        n("5.3. Дополнительное соглашение вступает в силу с момента подписания Сторонами."),
        P([]),
        b("Подписи сторон"),
        P([]),
        sigTable(),
      ];

    } else if(type==="reservation"){
      const amt = c.reserveAmount||50000;
      const rsd = c.reserveStartDate ? fmtDate(c.reserveStartDate) : null;
      const rsdStr = rsd ? ("«"+rsd.d+"» "+rsd.m+" "+rsd.y+" г.") : ("\"_____\" _____________ "+dt.y+" г.");
      children = [
        PC([T("СОГЛАШЕНИЕ №"+(c.number||"___"),{sz:13,b:true})]),
        PC([T("о резервировании даты начала ремонтно-строительных работ",{sz:12,b:true})]),
        PC([T(dt.full+" г.          г. Караганда")]),
        P([]),
        ...preamParas("Исполнитель"),
        P([]),
        s("1. Общие положения"),
        n("1.2. Настоящее Соглашение подтверждает намерение сторон заключить договор подряда. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и ориентировочную дату начала работ."),
        n("1.3. Основной договор подряда будет заключен отдельно после согласования дизайн-проекта, сметы и технического задания."),
        s("2. Предмет Соглашения"),
        n("2.1. Исполнитель обязуется зарезервировать за Заказчиком производственные ресурсы и дату начала работ с "+rsdStr+"."),
        n("2.2. Под резервированием понимается: включение объекта в производственный график; блокировка временного слота бригады; закрепление производственного ресурса."),
        n("2.3. Настоящее Соглашение не определяет объем, стоимость и сроки выполнения ремонтных работ."),
        s("3. Стоимость резервирования и порядок оплаты"),
        n("3.1. За резервирование даты Заказчик оплачивает фиксированный платеж в размере "+fmtN2(amt)+" тенге."),
        n("3.2. Оплата производится Заказчиком в день подписания настоящего Соглашения."),
        n("3.3. Соглашение вступает в силу с момента поступления денежных средств на счет Исполнителя."),
        s("4. Правовой статус платежа"),
        n("4.1. Платеж является оплатой услуги по резервированию производственного ресурса и считается оказанной с момента вступления Соглашения в силу."),
        n("4.2. Указанный платеж не является: авансом; предоплатой; задатком; обеспечительным платежом; оплатой по договору подряда."),
        n("4.3. При заключении основного договора подряда сумма резервирования засчитывается в общую стоимость работ."),
        s("5. Отказ сторон и возврат средств"),
        n("5.1. В случае отказа Заказчика после согласования сметы и подготовки к началу работ, сумма резервирования не возвращается."),
        n("5.2. В случае одностороннего отказа Заказчика, уплаченная сумма возврату не подлежит, поскольку услуга по резервированию считается оказанной."),
        n("5.3. В случае невозможности исполнения по причинам, зависящим исключительно от Исполнителя, сумма возвращается Заказчику полностью."),
        s("6. Перенос даты начала работ"),
        n("6.1. Заказчик вправе перенести дату начала работ не более одного раза."),
        n("6.2. Перенос возможен не менее чем за 30 календарных дней до согласованной даты."),
        s("7. Срок действия Соглашения"),
        n("8.1. Соглашение вступает в силу с момента подписания и оплаты."),
        n("8.2. Соглашение прекращает действие при заключении основного договора подряда или отказе одной из сторон."),
        s("9. Прочие условия"),
        n("9.1. Стороны подтверждают добровольность заключения настоящего Соглашения."),
        n("9.3. Все споры решаются переговорами, при недостижении согласия — в суде по месту регистрации Исполнителя."),
        n("9.4. Соглашение составлено в двух экземплярах, имеющих равную юридическую силу."),
        P([]),
        b("Подписи сторон"),
        P([]),
        sigTable(),
      ];
    }
    const doc = new D.Document({
      sections:[{
        properties:{page:{size:{width:mmT(210),height:mmT(297),orientation:D.PageOrientation.PORTRAIT},margin:{top:mmT(20),right:mmT(15),bottom:mmT(20),left:mmT(30)}}},
        children,
      }],
    });
    const blob = await D.Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),20000);
    } catch(err) {
      console.error("DOCX generation error:", err);
      alert("Ошибка при создании DOCX: "+err.message);
    }
  };

  const generateContractGDocLegacy = async (c, client, ca) => {
    const GDOC_CLIENT_ID = "363473710949-d67codd7dq0uk9g4tfl8lhhgecgcqe98.apps.googleusercontent.com";
    const clientName = client?.name || c.estClient || "договор";
    const num = c.number || c.id?.slice(-4) || "б-н";
    const dateStrG = c.date ? c.date.split("-").reverse().join(".") : "";
    const isAnnexG = (c.type||"repair_fiz") === "annex" || c.type==="podryad_annex";
    const docLabelG = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании",podryad:"Договор подряда",podryad_annex:"Приложение к договору подряда"}[c.type||"repair_fiz"] || "Договор";
    const title = isAnnexG
      ? ("Приложение №"+(c.appendix||2)+" Перечень работ к Договору №"+(c.mainNumber||num)+(dateStrG?" от "+dateStrG:"")).replace(/[<>:"/\\|?*]/g,"_")
      : (docLabelG+" №"+num+" "+clientName+(dateStrG?" от "+dateStrG:"")).replace(/[<>:"/\\|?*]/g,"_");
    const html = (c.type==="podryad"||c.type==="podryad_annex")
      ? buildPodryadHtml(podryadContractToModel(c, workersRef.current.find(w=>w.id===c.workerId)||null, false))
      : buildContractHtml(c, client, ca, true, "");

    // Загружаем Google Identity Services если ещё нет
    const loadGIS = () => new Promise((res, rej) => {
      if (window.google?.accounts?.oauth2) { res(); return; }
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = () => res();
      s.onerror = () => rej(new Error("Не удалось загрузить сервис Google (accounts.google.com недоступен). Проверьте интернет-соединение и попробуйте ещё раз, либо воспользуйтесь кнопкой 📄 PDF."));
      document.head.appendChild(s);
    });

    // Получаем access token
    const getToken = () => new Promise((res, rej) => {
      const tc = window.google.accounts.oauth2.initTokenClient({
        client_id: GDOC_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (resp) => {
          if (resp.error) rej(new Error("Ошибка авторизации: "+resp.error));
          else res(resp.access_token);
        },
      });
      tc.requestAccessToken({ prompt: "" });
    });

    try {
      await loadGIS();
      const token = await getToken();

      // Создаём Google Doc через Drive API (multipart upload с HTML контентом)
      const boundary = "titov_boundary_gdoc";
      const meta = JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" });
      const body = [
        "--"+boundary,
        "Content-Type: application/json; charset=UTF-8",
        "",
        meta,
        "--"+boundary,
        "Content-Type: text/html; charset=UTF-8",
        "",
        html,
        "--"+boundary+"--"
      ].join("\r\n");

      const resp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          "Authorization": "Bearer "+token,
          "Content-Type": "multipart/related; boundary="+boundary,
        },
        body,
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error("Drive API ошибка "+resp.status+": "+err);
      }

      const data = await resp.json();
      window.open("https://docs.google.com/document/d/"+data.id+"/edit", "_blank");

    } catch(err) {
      console.error("Google Doc error:", err);
      alert("Ошибка создания Google Doc:\n"+err.message);
    }
  };

  const sendContractWhatsApp = async (c, client, ca) => {
    const clientName = client?.name || c.estClient || "договор";
    const num = c.number || c.id?.slice(-4) || "б-н";
    const dateStr2 = c.date ? c.date.split("-").reverse().join(".") : "";
    const docLabel2 = {repair_fiz:"Договор ремонта",annex:"Приложение",design:"Соглашение о дизайн-проекте",design_add:"Доп соглашение к дизайн-проекту",reservation:"Соглашение о резервировании"}[c.type||"repair_fiz"] || "Договор";
    const safeName = (docLabel2+" №"+num+" "+clientName+(dateStr2?" от "+dateStr2:"")).replace(/[<>:"/\\|?*]/g,"_");
    const phone = (client?.phone||"").replace(/\D/g,"");

    // Пробуем Web Share API (работает на мобильных)
    if(navigator.canShare) {
      try {
        // Генерируем PDF blob через html-docx или просто HTML
        const html = buildContractHtml(c, client, ca, true, "");
        let fileToShare = null;
        const docBlob = new Blob([html], {type:"application/msword;charset=utf-8"});
        fileToShare = new File([docBlob], safeName+".doc", {type:"application/msword"});
        if(navigator.canShare({files:[fileToShare]})) {
          await navigator.share({files:[fileToShare], title:`Договор №${num}`, text:`Договор для ${clientName}`});
          return;
        }
      } catch(e) {
        if(e.name==="AbortError") return; // пользователь отменил
        // fallback ниже
      }
    }
    // Fallback: скачать DOC + открыть WhatsApp
    {
      const html = buildContractHtml(c, client, ca, true, "");
      const docBlob = new Blob([html], {type:"application/msword;charset=utf-8"});
      const url = URL.createObjectURL(docBlob);
      const a = document.createElement("a");
      a.href = url; a.download = safeName+".doc"; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),20000);
    }
    // Открываем WhatsApp с коротким сообщением
    const msg = encodeURIComponent(`Договор №${num} для ${clientName} — файл отправлен отдельно`);
    const waUrl = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    setTimeout(()=>window.open(waUrl,"_blank"), 500);
  };

  // ── Экспорт сметы в JSON ──
  const exportJSON = (est) => {
    const catalog = getEffectiveCatalog();
    const works = [];
    const rows = est.rows || {};
    for (const [key, r] of Object.entries(rows)) {
      const qty = Number(r.qty || 0);
      if (qty <= 0) continue;
      const w = catalog.find(x => x.name === key) || catalog.find(x => x.code === key);
      if (!w) continue;
      const price = getPrice(w, qty, r.complexity || "std");
      works.push({
        code: w.code || null,
        name: w.name,
        category: w.cat,
        subcategory: w.sub,
        quantity: qty,
        unit: w.unit || "м²",
        pricePerUnit: price ? Math.round(price) : 0,
        total: price ? Math.round(price * qty) : 0,
      });
    }
    const totalAmount = est.total || 0; // est.total already has discount applied
    const json = {
      estimateInfo: {
        id: est.id,
        name: est.proj?.name || "Без названия",
        date: new Date(est.createdAt || Date.now()).toISOString().split("T")[0],
        client: est.proj?.name || null,
        clientPhone: est.proj?.phone || null,
        manager: est.proj?.manager || est.createdBy || null,
        objectType: est.proj?.type || null,
        address: est.proj?.address || null,
        area: est.proj?.area ? Number(est.proj.area) : null,
        notes: est.note || null,
        discount: est.discount || 0,
      },
      works,
      summary: {
        totalItems: works.length,
        totalQuantity: Math.round(works.reduce((s, w) => s + w.quantity, 0) * 100) / 100,
        subtotal: est.total || 0,
        discount: est.discount || 0,
        totalAmount,
        currency: "KZT",
      },
      exportDate: new Date().toISOString(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const clientSlug = (est.proj?.name || "смета").toLowerCase().replace(/\s+/g, "-").replace(/[^a-zа-яё0-9-]/gi, "");
    const dateSlug = new Date(est.createdAt || Date.now()).toISOString().split("T")[0];
    a.href = url;
    a.download = `смета-${clientSlug}-${dateSlug}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // ── Следующий свободный номер договора ──
  // Берём максимальный числовой префикс из номеров существующих договоров и +1.
  const nextContractNumber = useCallback(() => {
    let max = 0;
    for (const c of (contractsRef.current || [])) {
      const m = String(c.number || "").match(/\d+/);   // первая группа цифр
      if (m) { const n = parseInt(m[0], 10); if (n > max) max = n; }
    }
    return String(max + 1).padStart(4, "0");           // напр. "0007"
  }, []);

  // ── Дублировать смету ──
  const duplicateEstimate = async (est) => {
    if (!canCreateEstimateFor(est)) return;
    const id = genId();
    const copy = {
      ...est,
      id,
      proj: { ...est.proj, name: (est.proj?.name || "Без названия") + " (копия)" },
      createdAt: Date.now(),
      createdBy: currentUser.name,
      updatedAt: Date.now(),
      updatedBy: currentUser.name,
    };
    // Копия не должна оставаться ДС того же родителя (иначе дубль dsNumber)
    delete copy.parentId;
    delete copy.dsNumber;
    const cur = estimatesRef.current;
    const newList = [copy, ...cur];
    estimatesRef.current = newList;
    setEstimates(newList);
    await saveEstimates(newList);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // РЕНДЕР
  // ─────────────────────────────────────────────────────────────────────────
  const downloadLegacyDirty = () => {
    const data = {
      type: "titovstroy-legacy-local-recovery",
      exportedAt: new Date().toISOString(),
      entries: storage.legacyDirtySnapshot(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `titovstroy-legacy-local-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Шаблоны документов живут в отдельном модуле. Здесь только связываем его с
  // текущим storage, пользователем, аудитом и неизменённым legacy-генератором.
  const documentTemplateRuntime = createDocumentTemplateRuntime({
    storage,
    actor: () => currentUser,
    audit: event => logChange(currentUser, event),
    legacyRepairRenderer: buildContractHtml,
    legacyRenderers: {
      contract: buildContractHtml,
      podryad: buildPodryadHtml,
      avr: buildAvrHtml,
      moneyWords: tengeInWords,
    },
    getData: () => ({
      objects: objectsRef.current,
      estimates: estimatesRef.current,
      contracts: contractsRef.current,
      clients: clientsRef.current,
      contragents: contragentsRef.current,
      workers: workersRef.current,
      moneyWords: tengeInWords,
    }),
    legacyExports: {
      pdf: ({ contract, client, contragent, withStamp }) => generateContractPdfLegacy(contract, client, contragent, withStamp ?? true),
      gdoc: ({ contract, client, contragent }) => generateContractGDocLegacy(contract, client, contragent),
      docx: ({ contract, client, contragent }) => generateContractDocxLegacy(contract, client, contragent),
      report_pdf: ({ report }) => openOrPrintHtml(buildAvrHtml({ ...report, lines:(report.lines||[]).map(line=>({ ...line, included:true, doneQty:line.doneQty })) })),
    },
    openOrPrintHtml,
    googleClientId: "363473710949-d67codd7dq0uk9g4tfl8lhhgecgcqe98.apps.googleusercontent.com",
    confirmLegacy: reason => window.confirm(
      `Новый шаблон не может сформировать документ:\n${reason}.\n\n` +
      "OK — использовать старый генератор.\n" +
      "Отмена — вернуться и заполнить недостающие данные."
    ),
  });
  const documentTemplateService = documentTemplateRuntime.service;
  const refreshDocumentSnapshots = useCallback(async () => {
    if (!documentTemplateRuntime.enabled) return;
    const loaded = await documentTemplateService.loadSnapshots();
    if (loaded?.status !== "found") {
      setDocumentSnapshotsById(new Map());
      return;
    }
    setDocumentSnapshotsById(new Map((loaded.snapshots || []).filter(item => item?.documentId).map(item => [item.documentId, item])));
  }, [currentUser.id]);
  useEffect(() => { refreshDocumentSnapshots(); }, [refreshDocumentSnapshots]);
  const openDocumentInstance = contract => {
    const snapshot = documentSnapshotsById.get(`contract:${contract?.id || ""}`);
    if (snapshot) setDocumentInstanceSnapshot(snapshot);
  };
  const runContractExport = async (format, contract, client, contragent, withStamp) => {
    try {
      const result = await documentTemplateRuntime.exportContract(format, { contract, client, contragent, withStamp });
      if (result?.ok === false && !result?.canUseLegacy) alert(`Не удалось создать документ: ${result.reason || "неизвестная ошибка"}`);
      if (result?.ok && documentTemplateRuntime.enabled) await refreshDocumentSnapshots();
    } catch (error) {
      alert(`Не удалось создать документ: ${error?.message || "неизвестная ошибка"}`);
    }
  };
  const generateContractPdf = (contract, client, contragent, withStamp=true) => runContractExport("pdf", contract, client, contragent, withStamp);
  const generateContractGDoc = (contract, client, contragent) => runContractExport("gdoc", contract, client, contragent);
  const generateContractDocx = (contract, client, contragent) => runContractExport("docx", contract, client, contragent);
  const generateContractSamplePdf = async contract => {
    try {
      const result = await documentTemplateRuntime.exportContractSample("pdf", { type: contract?.type || "repair_fiz" });
      if (result?.ok === false) alert(`Не удалось создать образец: ${result.reason || "неизвестная ошибка"}`);
    } catch (error) {
      alert(`Не удалось создать образец: ${error?.message || "неизвестная ошибка"}`);
    }
  };
  const runReportExport = async (format, report) => {
    try {
      const result = await documentTemplateRuntime.exportReport(format, { report });
      if (result?.ok === false) alert(`Не удалось создать акт: ${result.reason || "неизвестная ошибка"}`);
      if (result?.ok && documentTemplateRuntime.enabled) await refreshDocumentSnapshots();
    } catch (error) {
      alert(`Не удалось создать акт: ${error?.message || "неизвестная ошибка"}`);
    }
  };
  const NAV_ITEMS = useMemo(() => {
    const show = access => access !== "none" || currentPermissions.showLocked;
    return [
      ...(show(currentPermissions.dashboard) ? [{ id:"dashboard", icon:"⌂", label:"Главная" }] : []),
      ...(show(currentPermissions.objects) ? [{ id:"objects", icon:"📦", label:"Объекты" }] : []),
      ...(show(currentPermissions.calendar) ? [{ id:"calendar", icon:"📅", label:"Календарь" }] : []),
      ...(show(currentPermissions.documents) ? [{ id:"contracts", icon:"📄", label:"Прочие документы", short:"Документы" }] : []),
      ...(show(currentPermissions.analytics) ? [{ id:"analytics", icon:"📊", label:"Аналитика" }] : []),
      ...(show(currentPermissions.finance) ? [{ id:"finance", icon:"💰", label:"Финансы" }] : []),
      ...(show(currentPermissions.masters) ? [{ id:"masters", icon:"🔎", label:"Мастера" }] : []),
      ...(show(currentPermissions.admin) ? [{ id:"admin", icon:"⚙️", label:"Админка" }] : []),
    ];
  }, [currentPermissions]);

  // Роли доступа
  const _r = currentUser.role;
  const _isAdmin = _r === "admin", _isMgr = _r === "manager", _isSalesHead = _r === "sales_head", _isForeman = _r === "foreman", _isUser = _r === "user", _isViewer = _r === "viewer";
  // Эффективный экран с учётом ограничений роли
  const effScreen = (() => {
    // «Производство» объединено с «Объекты» — отдельного экрана больше нет, все ведёт в Объекты
    if (screen==="production") return "objects";
    return screen;
  })();
  const finReadonly = currentPermissions.finance === "view";
  const financeWritable = currentPermissions.finance === "edit";
  const isOwnFinanceRecord = rec => !!rec && (
    rec.createdById === currentUser.id
    || rec.createdBy === currentUser.name
    || (rec.objectId && estimatorObjectIds.has(rec.objectId))
  );
  const canFinanceCreate = financeWritable && accessAllows(currentPermissions.financeCreate, true);
  const canFinanceEditRecord = rec => financeWritable && accessAllows(currentPermissions.financeEdit, isOwnFinanceRecord(rec));
  const canFinanceDeleteRecord = rec => financeWritable && accessAllows(currentPermissions.financeDelete, isOwnFinanceRecord(rec));
  const canFinanceExport = currentPermissions.finance !== "none" && currentPermissions.financeExport !== "none";
  const canFinanceDirectories = financeWritable && currentPermissions.financeDirectories !== "none";
  const hasFinancialDetails = currentPermissions.financialDetails;
  const restrictedSection = (name, audience = "руководству") => (
    <div className="page">
      <div style={{maxWidth:560,margin:"56px auto",textAlign:"center",background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"40px 28px",boxShadow:"0 1px 3px rgba(15,23,42,.07)"}}>
        <div style={{fontSize:42,marginBottom:14}}>🔒</div>
        <div style={{fontWeight:800,fontSize:18,color:"#0f172a",marginBottom:8}}>Доступ закрыт</div>
        <div style={{fontSize:13,color:"#64748b",lineHeight:1.6}}>Раздел «{name}» доступен только {audience}.<br/>Если нужен доступ — обратитесь к администратору.</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:"#f8fafc",minHeight:"100vh",color:"#0f172a",display:"flex",flexDirection:"column"}}>
      {/* Баннер: данные не загрузились — редактирование опасно */}
      {loadError && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#dc2626",color:"#fff",padding:"10px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          ⚠️ Не удалось загрузить данные из базы. НЕ редактируйте сметы — сохранение отключено для защиты данных.
          <button onClick={()=>window.location.reload()} style={{background:"#fff",color:"#dc2626",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Обновить</button>
        </div>
      )}
      {/* Плашка read-only вкладки: lease редактирования у другой вкладки */}
      {!editorTab && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:501,background:"#475569",color:"#fff",padding:"10px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)",flexWrap:"wrap"}}>
          {_isViewer
            ? "Режим просмотра — изменения недоступны для этой учётной записи."
            : "Сервис открыт для редактирования в другой вкладке — здесь только просмотр (изменения не сохраняются)."}
          {!_isViewer && <button onClick={takeoverEditLease} style={{background:"#fff",color:"#475569",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Перехватить редактирование</button>}
        </div>
      )}
      {!loadError && !syncBannerHidden && (cloudError || prodUnsyncedN > 0 || dirtyCount > 0 || legacyDirtyN > 0) && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#d97706",color:"#fff",padding:"10px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)",flexWrap:"wrap"}}>
          ⚠️ {prodUnsyncedN > 0 ? `Изменения производства ожидают синхронизации (${prodUnsyncedN}) — ` : ""}Данные могут быть сохранены ТОЛЬКО на этом устройстве — облако недоступно{dirtyCount>0?` (несинхронизировано: ${dirtyCount})`:""}. Приложение само дожмёт синхронизацию, когда облако ответит. Если баннер не гаснет — проверьте интернет и отключите блокировщик рекламы для этого сайта.{legacyDirtyN>0?` Есть старые несинхронизированные правки без владельца (${legacyDirtyN}) — они НЕ отправляются автоматически, обратитесь к администратору.`:""}
          <button onClick={resyncNow} disabled={resyncing} style={{background:"#fff",color:"#d97706",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:resyncing?"default":"pointer",fontFamily:"inherit"}}>{resyncing?"Синхронизирую…":"🔄 Повторить сейчас"}</button>
          {legacyDirtyN>0 && <button onClick={downloadLegacyDirty} style={{background:"#fff",color:"#92400e",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Скачать старые правки</button>}
          <button onClick={()=>setSyncBannerHidden(true)} style={{background:"rgba(255,255,255,.25)",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Скрыть</button>
        </div>
      )}
      {/* Панель администратора */}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#f8fafc;overflow-x:hidden;width:100%;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a}
        h1,h2,h3{font-family:'Poppins','Inter',sans-serif;letter-spacing:-.02em;color:#0f172a}
        input,select,textarea{outline:none}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
        ::-webkit-scrollbar-thumb:hover{background:#94a3b8}
        .fi{background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;border-radius:8px;padding:9px 13px;font-family:inherit;font-size:14px;width:100%;box-sizing:border-box;transition:border-color .15s,box-shadow .15s;outline:none}
        .fi:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
        .fi::placeholder{color:#94a3b8}
        .tab-btn{background:none;border:none;cursor:pointer;padding:7px 16px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:500;color:#64748b;transition:all .15s;white-space:nowrap}
        .tab-btn:hover{color:#0f172a;background:#f1f5f9}
        .tab-btn.active{background:#eff6ff;color:#2563eb;font-weight:600}
        .sub-btn{background:none;border:none;cursor:pointer;padding:5px 10px;border-radius:6px;font-family:inherit;font-size:11.5px;color:#475569;transition:all .15s;white-space:nowrap}
        .sub-btn:hover{color:#0f172a;background:#f1f5f9}
        .sub-btn.active{background:#e2e8f0;color:#0f172a;font-weight:600}
        .wrow{display:grid;align-items:start;padding:9px 14px;border-radius:8px;gap:8px;transition:background .12s;min-width:0}
        .wrow:hover{background:#f8fafc}
        .wrow.on{background:#eff6ff}
        .num{background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;border-radius:8px;padding:6px 8px;text-align:right;font-family:inherit;font-size:13px;transition:border-color .15s,box-shadow .15s;outline:none}
        .num:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
        .num::placeholder{color:#94a3b8}
        .cpx-sel{background:#ffffff;border:1px solid #e2e8f0;color:#334155;border-radius:8px;padding:4px 6px;font-family:inherit;font-size:11px;margin-top:4px;cursor:pointer;width:auto;max-width:130px;transition:border-color .15s}
        .cpx-sel:focus{border-color:#2563eb}
        .card{background:#ffffff;box-shadow:0 1px 3px rgba(15,23,42,.07),0 4px 16px rgba(15,23,42,.04);border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
        .btn{border:none;cursor:pointer;padding:10px 20px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:600;transition:all .15s;letter-spacing:.1px}
        .btn-g{background:#2563eb;color:#ffffff;box-shadow:0 1px 2px rgba(37,99,235,.3)}
        .btn-g:hover{background:#1d4ed8;box-shadow:0 4px 12px rgba(37,99,235,.35);transform:translateY(-1px)}
        .btn-g:active{transform:translateY(0)}
        .btn-g:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
        .btn-o{background:#ffffff;color:#334155;border:1px solid #e2e8f0;box-shadow:0 1px 2px rgba(15,23,42,.05)}
        .btn-o:hover{background:#f8fafc;color:#0f172a;border-color:#cbd5e1;box-shadow:0 2px 6px rgba(15,23,42,.08)}
        .btn-red{background:rgba(220,38,38,.07);color:#dc2626;border:1px solid rgba(220,38,38,.15)}
        .btn-red:hover{background:rgba(220,38,38,.14);border-color:rgba(220,38,38,.3)}
        .badge{background:#eff6ff;color:#2563eb;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600;border:1px solid rgba(37,99,235,.15)}
        @keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .up{animation:up .2s ease forwards}
        .page{max-width:1600px;margin:0 auto;padding:32px 36px 80px}
        @media(min-width:900px){.main-grid{grid-template-columns:minmax(0,1fr) 295px!important}}
        @media(max-width:700px){
          .editor-header{gap:6px!important;padding:8px 12px!important;top:env(safe-area-inset-top,0px)!important;flex-wrap:wrap!important;row-gap:6px!important}
          .editor-header-right .proj-name{display:none}
          .tab-btn{padding:5px 10px;font-size:12px}
          .sub-btn{padding:4px 8px;font-size:11px}
          .wrow{grid-template-columns:1fr auto!important;gap:4px 10px!important;padding:10px 12px!important;align-items:center!important}
          .wrow-desk{display:none!important}
          .wrow-mob-extra{display:flex!important}
          .wrow-th{grid-template-columns:1fr auto!important}
          .cpx-sel{font-size:10px!important;padding:3px 4px!important;max-width:110px!important}
        }
        @media print{
          body *{display:none!important}
          #kp-print-portal{display:block!important;position:fixed;inset:0;background:#ffffff;padding:24px;z-index:9999;font-family:'Inter','Segoe UI',sans-serif}
          #kp-print-portal *{display:revert!important}
          .kp-no-print{display:none!important}
          @page{margin:10mm;size:A4 portrait}
        }
        .est-card{background:#ffffff;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,.06);border-radius:12px;padding:16px 18px;cursor:pointer;transition:all .15s;position:relative}
        .est-card:hover{border-color:#93c5fd;background:#ffffff;box-shadow:0 6px 20px rgba(37,99,235,.1);transform:translateY(-2px)}
        .est-card:active{transform:scale(.99);box-shadow:0 1px 3px rgba(15,23,42,.06)}
        .sidebar{width:248px;background:#1e293b;border-right:1px solid #0f172a;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;transition:width .2s ease}
        .sidebar.collapsed{width:64px}
        .nav-item{display:flex;align-items:center;gap:11px;padding:9px 13px;border-radius:9px;cursor:pointer;margin:2px 10px;transition:all .15s;position:relative}
        .nav-item:hover{background:rgba(148,163,184,.12)}
        .nav-item.active{background:linear-gradient(90deg,rgba(37,99,235,.25),rgba(37,99,235,.1))}
        .nav-item.active::before{content:"";position:absolute;left:-10px;top:7px;bottom:7px;width:3px;border-radius:0 3px 3px 0;background:#3b82f6}
        .nav-item .nav-ico{color:#94a3b8;transition:color .15s}
        .nav-item.active .nav-ico{color:#60a5fa}
        .nav-label{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;transition:opacity .1s,width .1s;color:#94a3b8}
        .nav-item:hover .nav-label{color:#e2e8f0}
        .nav-item.active .nav-label{color:#f1f5f9;font-weight:600}
        .sidebar.collapsed .nav-label{opacity:0;width:0;pointer-events:none}
        .sidebar-content{margin-left:248px;transition:margin-left .22s cubic-bezier(.4,0,.2,1);min-height:100vh;background:#f8fafc}
        .sidebar-content.collapsed{margin-left:64px}
        @media(max-width:700px){
          .sidebar{display:none!important}
          .sidebar-content{margin-left:0!important;padding-top:env(safe-area-inset-top,0px)!important;padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))!important}
          .mob-nav{display:flex!important}
          .page{padding:18px 14px 84px!important}
          .list-header,.contracts-header{padding:10px 14px!important;top:env(safe-area-inset-top,0px)!important}
          .list-pad{padding:16px 14px 0!important}
          .contracts-pad{padding:16px 14px!important}
          .an-filters{padding:14px!important}
          .an-row-fixed{flex-wrap:wrap!important}
          .btn{padding:10px 16px!important}
          .an-bar-label{width:104px!important;font-size:11px!important}
          .an-bar-right{width:88px!important;font-size:10px!important}
          .an-mtable-num{width:auto!important;min-width:48px!important}
          .user-row{flex-wrap:wrap!important}
          .user-row-btns{width:100%!important;justify-content:flex-end!important;margin-top:8px!important}
          /* Hero-баннеры: меньше отступов, скругление, без обрезки текста */
          .hero{padding:18px 18px!important;border-radius:14px!important;margin-bottom:16px!important}
          .hero h1{font-size:18px!important}
          /* KPI: ровно 2 колонки на телефоне */
          .kpi-grid{grid-template-columns:1fr 1fr!important;gap:10px!important}
          .kpi-grid>div{padding:14px 13px!important;border-radius:14px!important;min-width:0!important}
          .kpi-val{font-size:18px!important;overflow-wrap:anywhere!important}
          /* Категории работ: имя на отдельной строке, цифры ниже */
          .an-catrow{flex-wrap:wrap!important;row-gap:4px!important}
          .an-catrow .an-cat-name{flex:1 1 100%!important;white-space:normal!important;order:-1}
          .an-catrow>span:not(.an-cat-name){width:auto!important;flex:1!important;text-align:left!important;font-size:11px!important}
          /* Финансы: карточки и сетки в одну колонку */
          .fin-cards{grid-template-columns:1fr!important}
          .fin-dash-cards{grid-template-columns:1fr!important}
          .fin-tiles{grid-template-columns:1fr 1fr!important}
          .bal-grid{grid-template-columns:1fr!important}
          .bal-grid>div{border-right:none!important}
          .fin-tabs{overflow-x:auto!important;flex-wrap:nowrap!important;-webkit-overflow-scrolling:touch;padding-bottom:4px}
          .fin-tabs button{flex:0 0 auto!important}
          .fin-hero-stats{width:100%!important;justify-content:space-between!important;gap:14px!important}
          /* ДДС/ОПУ: корректный скролл на мобиле со sticky первой колонкой */
          .rep-wrap{
            -webkit-overflow-scrolling:touch!important;
            overflow-x:auto!important;
            overflow-y:auto!important;
            max-height:62vh!important;
            border-radius:10px!important;
          }
          .rep-table{font-size:11.5px!important;min-width:480px!important}
          .rep-table th,.rep-table td{padding:7px 8px!important;white-space:nowrap!important}
          .rep-table tbody td:first-child,.rep-table tbody th:first-child{position:sticky!important;left:0!important;z-index:2!important;background:#fff!important;min-width:130px!important;max-width:170px!important;white-space:normal!important;word-break:break-word!important}
          .rep-table thead th:first-child{position:sticky!important;left:0!important;z-index:6!important;min-width:130px!important}
        }
        @media(max-width:380px){
          .kpi-grid{grid-template-columns:1fr!important}
        }
        .mob-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#ffffff;border-top:1px solid #e2e8f0;z-index:50;box-shadow:0 -4px 16px rgba(15,23,42,.06);padding-bottom:env(safe-area-inset-bottom,0px);overflow-x:auto;-webkit-overflow-scrolling:touch}
        .mob-nav-item{flex:1 0 62px;min-width:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;cursor:pointer;gap:3px;border-top:2px solid transparent;transition:all .15s}
        .mob-nav-item.active{border-top-color:#2563eb;background:rgba(37,99,235,.06)}
        .fin-row:hover{background:#f8fafc}
        .fin-row:hover{box-shadow:0 8px 24px rgba(15,23,42,.10)!important;transform:translateY(-2px)}
        /* ── rep-table: ДДС и ОПУ ─────────────────────────────── */
        .rep-wrap{width:100%;overflow:auto;max-height:calc(100vh - 200px);border:1px solid #e2e8f0;border-radius:12px;background:#fff}
        .rep-table{border-collapse:collapse;font-size:13px;width:100%;min-width:700px;background:#fff}
        /* Заголовок */
        .rep-table thead th{
          position:sticky;top:0;z-index:5;
          background:#fff;color:#64748b;
          font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;
          padding:10px 16px;white-space:nowrap;
          border-bottom:2px solid #e2e8f0;
          text-align:right
        }
        .rep-table thead th:first-child{left:0;z-index:6;text-align:left;min-width:220px;max-width:280px}
        .rep-table thead th.colTot{background:#f8fafc;color:#0f172a;font-weight:700;border-left:1px solid #e2e8f0}
        /* Тело — базовые ячейки */
        .rep-table td{padding:9px 16px;white-space:nowrap;font-size:13px;border-bottom:1px solid #f1f5f9;text-align:right;color:#1e293b;background:#fff}
        .rep-table td:first-child{text-align:left;white-space:normal;word-break:break-word;min-width:220px;max-width:280px}
        /* sticky первая колонка */
        .rep-table tbody td:first-child,.rep-table tbody th:first-child{position:sticky;left:0;z-index:2}
        /* hover */
        .rep-table tbody tr:hover td{background:#f8fafc!important}
        /* итоговая колонка */
        .rep-table .colTot{background:#f8fafc;border-left:1px solid #e2e8f0}
        .rep-table tbody tr:hover .colTot{background:#f1f5f9!important}
        /* секционный заголовок-разделитель */
        .rep-section td{padding:8px 16px 6px!important;font-size:10.5px!important;font-weight:700!important;letter-spacing:.8px!important;text-transform:uppercase!important;color:#94a3b8!important;background:#f8fafc!important;border-top:1px solid #e2e8f0!important;border-bottom:1px solid #e2e8f0!important}
        /* строка итога секции */
        .rep-metric td{padding:11px 16px!important;font-weight:700!important;font-size:13.5px!important;background:#fff!important;border-top:2px solid #e2e8f0!important}
        .rep-metric td:first-child{font-weight:800!important}
        /* строка процента */
        .rep-pct td{padding:2px 16px 8px!important;font-size:11.5px!important;font-style:italic!important;color:#94a3b8!important;background:#fff!important;border-bottom:none!important}
        /* nostick */
        .rep-table.nostick tbody td:first-child{position:static}
        .rep-table.nostick thead th:first-child{left:auto}
      `}</style>

      {/* ── SIDEBAR (десктоп) ── */}
      <div className={"sidebar"+(sideCollapsed?" collapsed":"")}>
        {/* Лого */}
        <div style={{padding:"18px 16px",display:"flex",alignItems:"center",gap:11,borderBottom:"1px solid rgba(148,163,184,.12)",minHeight:64}}>
          <div style={{width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:"#ffffff",flexShrink:0,boxShadow:"0 3px 10px rgba(37,99,235,.5)"}}>T</div>
          <div className="nav-label" style={{lineHeight:1.25}}>
            <div style={{fontWeight:700,fontSize:15,color:"#f8fafc",fontFamily:"'Poppins',sans-serif"}}>TitovStroy</div>
            <div style={{fontSize:11,color:"#64748b"}}>{currentUser.name}</div>
          </div>
        </div>
        {/* Nav */}
        <nav style={{flex:1,padding:"12px 0",overflowY:"auto"}}>
          {NAV_ITEMS.map(item=>{
            const isActiveEst = effScreen==="editor" && !objectReturnId && item.id==="list";
            const isActiveObjEst = effScreen==="editor" && !!objectReturnId && item.id==="objects";
            const isActive = effScreen===item.id || isActiveEst || isActiveObjEst;
            return (
            <div key={item.id} className={"nav-item"+(isActive?" active":"")}
              onClick={()=>{ setDealReturnId(null); setObjectReturnId(null); navigate(item.id, undefined); }}>
              <span className="nav-ico" style={{fontSize:18,flexShrink:0,lineHeight:1}}>{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </div>
            );
          })}
        </nav>
        {/* Collapse + Выйти */}
        <div style={{borderTop:"1px solid rgba(148,163,184,.12)",padding:"10px 0"}}>
          <div className="nav-item" onClick={()=>{ setLogoutConfirm(true); }}>
            <span className="nav-ico" style={{fontSize:16,flexShrink:0}}>🚪</span>
            <span className="nav-label" style={{fontSize:13}}>Выйти</span>
          </div>
          <div className="nav-item" onClick={()=>setSideCollapsed(p=>!p)} style={{justifyContent:"center",marginTop:4}}>
            <span style={{fontSize:13,color:"#64748b"}}>{sideCollapsed?"▶":"◀"}</span>
          </div>
        </div>
      </div>

      {/* ── МОБИЛЬНАЯ НАВИГАЦИЯ ── */}
      <div className="mob-nav">
        {NAV_ITEMS.map(item=>{
          const isActiveEst = effScreen==="editor" && !objectReturnId && item.id==="list";
          const isActiveObjEst = effScreen==="editor" && !!objectReturnId && item.id==="objects";
          const isActive = effScreen===item.id || isActiveEst || isActiveObjEst;
          return (
          <div key={item.id} className={"mob-nav-item"+(isActive?" active":"")}
            onClick={()=>{ setDealReturnId(null); setObjectReturnId(null); navigate(item.id, undefined); }}>
            <span style={{fontSize:20}}>{item.icon}</span>
            <span style={{fontSize:9.5,color:isActive?"#2563eb":"#64748b",fontWeight:600,whiteSpace:"nowrap"}}>{item.short||item.label}</span>
          </div>
          );
        })}
      </div>

      {/* ── КОНТЕНТ ── */}
      <div className={"sidebar-content"+(sideCollapsed?" collapsed":"")} inert={!editorTab ? "" : undefined} aria-disabled={!editorTab}>

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 0: ДАШБОРД
      ═══════════════════════════════════════════════════════════════════ */}
      {/* ── ГЛАВНАЯ ПРОРАБА: «Мои задачи» (без финансовых KPI — прораб финансы не видит) ── */}
      {/* ── КАЛЕНДАРЬ ПРОИЗВОДСТВА (admin/manager/foreman) ── */}
        {effScreen === "calendar" && currentPermissions.calendar === "none" && restrictedSection("Календарь", "сотрудникам с соответствующим правом")}
        {effScreen === "calendar" && currentPermissions.calendar !== "none" && (
          <div className="page" style={{background:"#f1f5f9",minHeight:"100vh",paddingBottom:40,maxWidth:1600}}>
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"22px 26px",marginBottom:20,boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{fontSize:21,fontWeight:900,color:"#fff",marginBottom:3}}>📅 Календарь производства</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.75)"}}>Загрузка объектов, этапов и прорабов во времени · пересечения и просрочки</div>
          </div>
          <Suspense fallback={<div style={{padding:24,color:"#64748b",fontSize:13}}>Загрузка календаря…</div>}>
            <ProductionCalendar objects={liveObjects} productions={productions} onOpenObject={(id)=>openIssue({ object:id, tab:"stages" })} />
          </Suspense>
        </div>
      )}

      {/* Главная прораба: только производственные задачи, без финансовых KPI. */}
      {effScreen === "dashboard" && currentPermissions.dashboard === "none" && restrictedSection("Главная", "сотрудникам с соответствующим правом")}
      {effScreen === "dashboard" && currentPermissions.dashboard !== "none" && _isForeman && (
        <div className="page" style={{background:"#f1f5f9",minHeight:"100vh",paddingBottom:40}}>
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"24px 28px",marginBottom:24,boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{fontSize:20,fontWeight:900,color:"#fff",marginBottom:4}}>Мои задачи</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.75)"}}>{new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})} · <span style={{color:"#bfdbfe",fontWeight:600}}>{currentUser.name}</span></div>
          </div>
          <div style={{fontSize:16,fontWeight:900,color:"#0f172a",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>🔥 Что требует внимания по моим объектам</div>
          <OperationsPanel issues={_myIssues} onNav={openIssue} onDismiss={dismissIssueTomorrow} emptyText="По вашим объектам всё в порядке" />
        </div>
      )}
      {effScreen === "dashboard" && currentPermissions.dashboard !== "none" && !_isForeman && (()=>{
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const _inMonth = ts => { const d=new Date(ts||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; };
        // объекты и их суммы
        const _estByObjId = {}; for(const e of accessibleEstimates){ if(e.objectId){ (_estByObjId[e.objectId]||(_estByObjId[e.objectId]=[])).push(e); } }
        const _objVal = o => (_estByObjId[o.id]||[]).reduce((s,e)=>s+(e.total||0),0);
        const _objCost = o => { const cat = getEffectiveCatalog(); const lk = new Map(); for(const w of cat){ if(w?.name)lk.set(w.name,w); if(w?.code)lk.set(w.code,w); } let c=0; for(const e of (_estByObjId[o.id]||[])){ for(const [k,r] of Object.entries(e.rows||{})){ const q=Number(r?.qty||0); if(!q) continue; const w=lk.get(k); if(w)c+=rowCostPerUnit(r,w)*q; } } return c; };
        // Только реально созданные в этом месяце объекты (импортированные миграцией исключаем — у них дата создания искусственная)
        const objectsThisMonth = liveObjects.filter(o=>o.status!=="archive"&&o.createdBy!=="migration"&&_inMonth(o.createdAt||0));
        const objectsWithSum = objectsThisMonth.filter(o=>_objVal(o)>0);
        const totalSumMonth = objectsWithSum.reduce((s,o)=>s+_objVal(o), 0);
        // Прибыль/маржа — по сделкам, ПОДПИСАННЫМ в этом месяце (updatedAt ≈ дата подписания);
        // импортированные миграцией исключаем — их updatedAt = дата импорта, а не реального подписания
        const signedMonth = liveObjects.filter(o=>o.status==="signed"&&o.createdBy!=="migration"&&_inMonth(o.updatedAt||o.createdAt||0)&&_objVal(o)>0);
        const signedRevMonth = signedMonth.reduce((s,o)=>s+_objVal(o), 0);
        const signedCostMonth = signedMonth.reduce((s,o)=>s+_objCost(o), 0);
        const profitMonth = signedRevMonth - signedCostMonth;
        const marginMonth = signedRevMonth>0 ? Math.round(profitMonth/signedRevMonth*100) : 0;
        const approvalObjs = liveObjects.filter(o=>unifiedStatusOf(o)==="approval");
        const signedObjs = liveObjects.filter(o=>unifiedStatusOf(o)==="signed");
        const activeObjects = liveObjects.filter(o=>{ const status=unifiedStatusOf(o); return status==="work"||status==="signed"; });
        const pipelineSum = approvalObjs.reduce((s,o)=>s+_objVal(o), 0);
        const now = Date.now();
        const staleObjs = approvalObjs.filter(o=>isStaleApprovalObject({...o,status:"approval"}, now));
        const recentObjects = [...liveObjects].sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,6);
        const monthName = new Date().toLocaleDateString("ru-RU",{month:"long"});
        // ── Finance KPIs (только для admin/manager) ──
        // «Активные» = НЕ отменён и НЕ выполнен (т.е. в работе + новые). Завершённые в активные не входят.
        const _isActiveFin = isActiveFinanceProject;
        const _finKpi = hasFinancialDetails ? (() => {
          const active = (finProjects||[]).filter(_isActiveFin);
          const txMap = {}; for(const t of (financeTx||[])){if(t.deletedAt||t.included===false) continue; const cn=normCN(t.contractNo); if(!txMap[cn])txMap[cn]={inc:0,exp:0}; if(t.type==="income")txMap[cn].inc+=(Number(t.amount)||0); else txMap[cn].exp+=(Number(t.amount)||0); }
          const totalInc = active.reduce((s,p)=>s+(txMap[normCN(p.contractNo)]?.inc||0),0);
          const totalExp = active.reduce((s,p)=>s+(txMap[normCN(p.contractNo)]?.exp||0),0);
          const totalBudget = active.reduce((s,p)=>s+(Number(p.budget)||0),0);
          const totalDebt = active.reduce((s,p)=>{const inc=txMap[normCN(p.contractNo)]?.inc||0; return s+Math.max(0,(Number(p.budget)||0)-inc);},0);
          const margin = totalBudget>0?Math.round((totalBudget-totalExp)/totalBudget*100):null;
          const incMonth = (financeTx||[]).filter(t=>!t.deletedAt&&t.included!==false&&t.type==="income"&&_inMonth(t.date?new Date(t.date).getTime():0)).reduce((s,t)=>s+(Number(t.amount)||0),0);
          return {count:active.length,totalInc,totalDebt,totalBudget,margin,incMonth};
        })() : null;
        // ── Production KPIs ── Состояние берём через unifiedStatusOf (production перевешивает
        // сырой object.status, как и везде в списках/карточках) — иначе на объектах, где реальный
        // статус исторически хранится в производстве, эти счётчики занижены/неверны.
        const _prodKpi = currentPermissions.dashboard !== "none" ? (() => {
          const _ds = d => { const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
          const today = _ds(new Date());
          const prodByObj = {}; for(const p of (productions||[])) prodByObj[p.objectId]=p;
          const inWork = liveObjects.filter(o=>unifiedStatusOf(o)==="work").length;
          const overdue = liveObjects.filter(o=>{ if(unifiedStatusOf(o)!=="work") return false; const p=prodByObj[o.id]; return p?.planEndDate&&_ds(p.planEndDate)<today&&!p?.factEndDate; }).length;
          const doneMonth = liveObjects.filter(o=>{ if(unifiedStatusOf(o)!=="done") return false; const p=prodByObj[o.id]; const dt=p?.factEndDate?new Date(p.factEndDate).getTime():(o.updatedAt||0); return dt&&_inMonth(dt); }).length;
          const defects = liveObjects.reduce((s,o)=>s+((prodByObj[o.id]?.defects||[]).filter(d=>!d.done).length),0);
          return {inWork,overdue,doneMonth,defects};
        })() : null;
        return (
        <div className="page" style={{background:"#f1f5f9",minHeight:"100vh",paddingBottom:40,maxWidth:1600}}>

          {/* Заголовок — Hero Banner */}
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"28px 32px",marginBottom:24,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:180,height:180,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
            <div style={{position:"absolute",bottom:-50,right:60,width:120,height:120,borderRadius:"50%",background:"rgba(59,130,246,.05)"}}/>
            <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:-.5,marginBottom:4,fontFamily:"'Poppins',sans-serif"}}>
                  TitovStroy <span style={{opacity:.6,fontWeight:600}}>ERP</span>
                </div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.75)"}}>
                  {new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                  {" · "}<span style={{color:"#bfdbfe",fontWeight:600}}>{currentUser.role==="admin"?"Администратор":currentUser.role==="viewer"?"Просмотр":currentUser.name}</span>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {navHistory.length > 0 && <button onClick={goBack} style={{background:"none",border:"1px solid #ccc",borderRadius:6,padding:"4px 12px",cursor:"pointer",marginRight:8,fontSize:14,color:"#fff",borderColor:"rgba(255,255,255,.4)"}}>← Назад</button>}
                {staleObjs.length>0&&<button onClick={openStaleObjects} style={{background:"rgba(251,191,36,.2)",color:"#fde68a",border:"1px solid rgba(251,191,36,.3)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>⚠ {staleObjs.length} требуют внимания</button>}
                <button onClick={resyncNow} disabled={resyncing}
                  title={dirtyCount>0 ? `Есть несинхронизированные изменения (${dirtyCount}). Нажмите, чтобы синхронизировать с сервером.` : "Обновить данные с сервера"}
                  style={{fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,cursor:resyncing?"default":"pointer",fontFamily:"inherit",border:"1px solid "+(dirtyCount>0?"rgba(251,191,36,.5)":"rgba(255,255,255,.25)"),background:dirtyCount>0?"rgba(251,191,36,.2)":"rgba(255,255,255,.15)",color:dirtyCount>0?"#fde68a":"rgba(255,255,255,.9)",backdropFilter:"blur(4px)"}}>
                  {resyncing ? "🔄 Синхронизирую…"
                    : dirtyCount>0 ? `⚠ Не синхронизировано (${dirtyCount})`
                    : syncStatus==="saving"?"⏳ Сохраняю...":syncStatus==="saved"?"✓ Сохранено":syncStatus==="error"?"⚠ Ошибка":"☁ Обновить"}
                </button>
                <button onClick={()=>{ setLogoutConfirm(true); }}
                  style={{background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.25)",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:600,cursor:"pointer",color:"rgba(255,255,255,.9)",fontFamily:"inherit"}}>
                  🚪 Выйти
                </button>
              </div>
            </div>
            {/* Мини-метрики в баннере */}
            <div style={{display:"flex",gap:24,marginTop:20,flexWrap:"wrap"}}>
              {[
                {label:"Активных объектов",  val:activeObjects.length},
                {label:"В согласовании", val:approvalObjs.length},
                {label:"Договоров",       val:signedObjs.length},
              ].map((m,i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{fontSize:26,fontWeight:900,color:"#fff",lineHeight:1}}>{m.val}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:3}}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── ЧТО ГОРИТ СЕГОДНЯ ── */}
          {currentPermissions.dashboard !== "none" && (
            <div style={{marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:900,color:"#0f172a",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>🔥 {(_isUser||_isSalesHead) ? "Что требует внимания" : "Что горит сегодня"}</div>
              <OperationsPanel
                issues={_isUser ? _myIssues : (hasFinancialDetails ? _todayIssues : _todayIssues.filter(i=>i.group!=="Финансы"))}
                onNav={openIssue}
                onDismiss={dismissIssueTomorrow}
                emptyText={_isUser ? "По вашим объектам всё в порядке" : "Всё под контролем — срочных задач нет"}
              />
            </div>
          )}

          {/* KPI карточки */}
          <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14,marginBottom:24}}>
            {[
              {label:"Объектов за "+monthName, value:objectsThisMonth.length, sub:"активность месяца", icon:"📋", accent:"#2563eb"},
              {label:"Объём за "+monthName, value:fmt(Math.round(totalSumMonth))+" ₸", sub:"сумма смет", icon:"💰", accent:"#059669"},
              ...(hasFinancialDetails ? [
                {label:"Прибыль за "+monthName, value:fmt(Math.round(profitMonth))+" ₸", sub:"по подписанным", icon:"📈", accent:profitMonth>0?"#059669":"#ef4444"},
                {label:"Маржа за "+monthName, value:marginMonth+"%", sub:"рентабельность", icon:"🎯", accent:marginMonth>=35?"#059669":marginMonth>=20?"#d97706":"#ef4444"},
              ] : []),
              {label:"Пайплайн (согласование)", value:fmt(Math.round(pipelineSum))+" ₸", sub:approvalObjs.length+" объектов", icon:"🔄", accent:"#d97706"},
              {label:"Договоров подписано", value:signedObjs.length, sub:"из "+liveObjects.filter(o=>{ const us=unifiedStatusOf(o); return us==="work"||us==="signed"; }).length+" активных", icon:"✅", accent:"#059669"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"18px 20px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",transition:"transform .18s ease,box-shadow .18s ease",position:"relative",overflow:"hidden"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.accent,opacity:.85}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:12,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{s.label}</div>
                  <span style={{width:38,height:38,borderRadius:11,background:s.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</span>
                </div>
                <div className="kpi-val" style={{fontSize:26,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:6,letterSpacing:-.5}}>{s.value}</div>
                <div style={{fontSize:11.5,color:"#94a3b8",fontWeight:500}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Finance KPIs (admin/manager) ── */}
          {_finKpi&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:".05em"}}>💰 Финансы по проектам</div>
              <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14}}>
                {[
                  {label:"Активных проектов", value:_finKpi.count, sub:"в работе + новые", icon:"📁", accent:"#2563eb"},
                  {label:"Выручка за "+monthName, value:fmt(_finKpi.incMonth)+" ₸", sub:"оплачено факт", icon:"💵", accent:"#059669"},
                  {label:"Дебиторка", value:fmt(_finKpi.totalDebt)+" ₸", sub:"долги клиентов", icon:"⏳", accent:_finKpi.totalDebt>0?"#dc2626":"#059669"},
                  {label:"Маржа план", value:_finKpi.margin!=null?_finKpi.margin+"%":"—", sub:"бюджет минус расходы", icon:"📊", accent:_finKpi.margin!=null&&_finKpi.margin>=30?"#059669":_finKpi.margin!=null&&_finKpi.margin>=0?"#d97706":"#dc2626"},
                ].map((s,i)=>(
                  <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"18px 20px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",transition:"transform .18s ease,box-shadow .18s ease",position:"relative",overflow:"hidden",cursor:"pointer"}}
                    onClick={()=>setScreen("finance")}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.accent,opacity:.85}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontSize:12,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{s.label}</div>
                      <span style={{width:38,height:38,borderRadius:11,background:s.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</span>
                    </div>
                    <div className="kpi-val" style={{fontSize:26,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:6,letterSpacing:-.5}}>{s.value}</div>
                    <div style={{fontSize:11.5,color:"#94a3b8",fontWeight:500}}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Production KPIs (admin/manager) ── */}
          {_prodKpi&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:10,textTransform:"uppercase",letterSpacing:".05em"}}>🏗 Производство</div>
              <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14}}>
                {[
                  {label:"В работе", value:_prodKpi.inWork, sub:"объектов в статусе «В работе»", icon:"🔨", accent:"#2563eb"},
                  {label:"Просрочено", value:_prodKpi.overdue, sub:"плановый срок истёк", icon:"🚨", accent:_prodKpi.overdue>0?"#dc2626":"#059669"},
                  {label:"Сдано за "+monthName, value:_prodKpi.doneMonth, sub:"объектов завершено", icon:"✅", accent:"#059669"},
                  {label:"Открытых замечаний", value:_prodKpi.defects, sub:"незакрытые дефекты", icon:"⚠️", accent:_prodKpi.defects>0?"#d97706":"#059669"},
                ].map((s,i)=>(
                  <div key={i} style={{background:"#ffffff",border:"1px solid #eef2f7",borderRadius:16,padding:"18px 20px",boxShadow:"0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)",transition:"transform .18s ease,box-shadow .18s ease",position:"relative",overflow:"hidden",cursor:"pointer"}}
                    onClick={()=>setScreen("objects")}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 18px 40px -14px rgba(15,23,42,.22)";}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 1px 2px rgba(15,23,42,.04),0 10px 30px -12px rgba(15,23,42,.12)";}}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:s.accent,opacity:.85}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontSize:12,color:"#64748b",fontWeight:600,lineHeight:1.3,flex:1,paddingRight:8}}>{s.label}</div>
                      <span style={{width:38,height:38,borderRadius:11,background:s.accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{s.icon}</span>
                    </div>
                    <div className="kpi-val" style={{fontSize:26,fontWeight:800,color:"#0f172a",lineHeight:1,marginBottom:6,letterSpacing:-.5}}>{s.value}</div>
                    <div style={{fontSize:11.5,color:"#94a3b8",fontWeight:500}}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Требуют внимания */}
          <StaleObjectsPanel
            items={staleObjs.map(o=>({id:o.id,name:o.clientName||"Без клиента",address:o.address,days:Math.floor((now-(o.updatedAt||o.createdAt||0))/864e5),total:_objVal(o),object:o}))}
            onOpen={item=>{ const o=item.object; setCurrentObject({...o}); setObjectTab("workspace"); setObjWsTab("info"); setScreen("objects"); }}
            onShowAll={openStaleObjects}
            fmt={fmt}
          />

          {/* Воронка + Последние объекты */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:24}}>

            {/* Воронка по статусам */}
            {liveObjects.length>0&&(()=>{
              // Архив — терминальное хранилище, не стадия воронки; не показываем его баром
              const funnelStatuses = DEAL_STATUSES.filter(s=>s.key!=="archive");
              const maxCount = Math.max(1,...funnelStatuses.map(s=>liveObjects.filter(o=>(o.status||"new")===s.key).length));
              const signedCount = liveObjects.filter(o=>o.status==="signed").length;
              const nonArchive = liveObjects.filter(o=>o.status!=="archive").length;
              const convToSigned = nonArchive>0?Math.round(signedCount/nonArchive*100):0;
              return (
                <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"20px 22px",boxShadow:"0 1px 3px rgba(15,23,42,.07),0 4px 12px rgba(15,23,42,.04)"}}>
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:16}}>
                    <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📊 Воронка объектов</span>
                    <span style={{fontSize:12,color:"#64748b"}}>
                      <b style={{color:"#059669"}}>{convToSigned}%</b> подписано
                    </span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {funnelStatuses.map(s=>{
                      const list = liveObjects.filter(o=>(o.status||"new")===s.key);
                      const sum = list.reduce((acc,o)=>acc+(_estByObjId[o.id]||[]).reduce((ss,e)=>ss+(e.total||0),0),0);
                      const w = Math.round((list.length/maxCount)*100);
                      return (
                        <div key={s.key} onClick={()=>{ setObjectFilterStatus(s.key); setScreen("objects"); }}
                          style={{cursor:"pointer"}}
                          title={"Показать: "+s.label}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                            <span style={{fontSize:11,fontWeight:700,color:s.color,width:130,flexShrink:0}}>{s.label}</span>
                            <span style={{fontSize:11,color:"#94a3b8",flex:1,textAlign:"right"}}>{sum>0?fmt(Math.round(sum))+" ₸":"—"}</span>
                          </div>
                          <div style={{background:"#f8fafc",borderRadius:8,height:22,position:"relative",overflow:"hidden"}}>
                            <div style={{width:`${w}%`,minWidth:list.length>0?32:0,height:"100%",background:s.bg,borderLeft:`3px solid ${s.color}`,transition:"width .3s",borderRadius:"0 4px 4px 0"}}/>
                            <span style={{position:"absolute",left:10,top:0,height:"100%",display:"flex",alignItems:"center",fontSize:12,fontWeight:800,color:s.color}}>{list.length}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Последние объекты */}
            {recentObjects.length>0&&(
              <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"20px 22px",boxShadow:"0 1px 3px rgba(15,23,42,.07),0 4px 12px rgba(15,23,42,.04)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>🕐 Последние объекты</span>
                  <button onClick={()=>{ setObjectAttentionFilter(""); setCurrentObject(null); setObjectTab("list"); setScreen("objects"); }} style={{background:"none",border:"none",padding:0,color:"#2563eb",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>все →</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {recentObjects.map((o,i,arr)=>{
                    const st = DEAL_STATUSES.find(s=>s.key===unifiedStatusOf(o))||DEAL_STATUSES[0];
                    const val = _objVal(o);
                    return (
                      <div key={o.id} onClick={()=>{ setCurrentObject({...o}); setObjectTab("workspace"); setObjWsTab("info"); setScreen("objects"); }}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",borderRadius:8,cursor:"pointer",transition:"background .1s",borderBottom:i<arr.length-1?"1px solid #f3f4f6":"none"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:st.color,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#0f172a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.clientName||"Без клиента"}</div>
                          <div style={{fontSize:11,color:"#94a3b8",display:"flex",gap:6,alignItems:"center",marginTop:1}}>
                            <span style={{color:st.color,fontWeight:600}}>{st.label}</span>
                            {o.address&&<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.address}</span>}
                          </div>
                        </div>
                        {val>0&&<div style={{fontSize:12,fontWeight:700,color:"#0f172a",flexShrink:0}}>{fmt(Math.round(val))} ₸</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 1: СПИСОК СМЕТ
      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 1: СПИСОК СМЕТ
      ═══════════════════════════════════════════════════════════════════ */}
        {effScreen === "list" && currentPermissions.estimates === "none" && restrictedSection("Сметы и КП", "сотрудникам с соответствующим правом")}
        {effScreen === "list" && currentPermissions.estimates !== "none" && (
          <div style={{maxWidth:1600,margin:"0 auto",padding:"0 0 40px",minHeight:"100vh"}}>
          {/* Шапка */}
          <div className="list-header" style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",borderBottom:"1px solid #0f172a",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 12px rgba(15,23,42,.2)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
              <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#ffffff",flexShrink:0,boxShadow:"0 2px 8px rgba(37,99,235,.45)"}}>T</div>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:800,fontSize:13,whiteSpace:"nowrap",color:"#f1f5f9"}}>TitovStroy</div>
                <div style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>
                  <span style={{color:"#2563eb"}}>{currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"}</span>{" "}{currentUser.name}
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {navHistory.length > 0 && <button onClick={goBack} style={{background:"none",border:"1px solid rgba(255,255,255,.4)",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:14,color:"#fff"}}>← Назад</button>}
              {saving && <span style={{fontSize:11,color:"#94a3b8"}}>💾</span>}
              {currentPermissions.analytics !== "none" && (
                <button className="btn btn-o" style={{padding:"6px 9px",fontSize:14}} onClick={()=>setScreen("analytics")} title="Статистика">📊</button>
              )}
              {currentPermissions.estimateCreate !== "none" && (
                <button className="btn btn-g" style={{padding:"7px 14px",fontSize:12,whiteSpace:"nowrap"}} onClick={newEstimate}>+ Новая</button>
              )}
            </div>
          </div>

          <div className="list-pad" style={{padding:"20px 24px 0"}}>
            {loadingList ? (
              <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                <div style={{fontSize:24,marginBottom:10}}>⏳</div>
                <div style={{fontSize:13}}>Загрузка смет...</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Заголовок */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:17,color:"#0f172a"}}>📁 Архив смет</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Все расчёты и коммерческие предложения</div>
                  </div>
                  {currentUser.role==="admin" && (
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setImportModal(true)}
                        style={{background:"rgba(0,0,0,.03)",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        ⬆ Импорт
                      </button>
                      <button onClick={openBackups}
                        style={{background:"rgba(0,0,0,.03)",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        🕘 Бэкапы
                      </button>
                    </div>
                  )}
                </div>
                {/* Поиск и фильтры */}
                {accessibleEstimates.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:2}}>
                    <input
                      style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"9px 14px",fontFamily:"inherit",fontSize:13,outline:"none",width:"100%"}}
                      placeholder="🔍 Поиск по клиенту, адресу, телефону..."
                      value={listSearch}
                      onChange={e=>setListSearch(e.target.value)}
                    />
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {/* Фильтр по типу */}
                      {["","Вторичка","Новостройка","Коммерция"].map(t=>(
                        <button key={t} onClick={()=>setListFilter(t)}
                          style={{background:listFilter===t?"#eff6ff":"rgba(0,0,0,.03)",color:listFilter===t?"#2563eb":"#94a3b8",border:`1px solid ${listFilter===t?"rgba(184,144,74,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {t||"Все типы"}
                        </button>
                      ))}
                    </div>
                    {/* Фильтр по статусу */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>setListFilterStatus("")}
                        style={{background:!listFilterStatus?"rgba(0,0,0,.04)":"rgba(0,0,0,.03)",color:!listFilterStatus?"#ffffff":"#94a3b8",border:`1px solid ${!listFilterStatus?"rgba(255,255,255,.15)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                        Все статусы
                      </button>
                      {STATUSES.map(s=>(
                        <button key={s.key} onClick={()=>setListFilterStatus(s.key)}
                          style={{background:listFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:listFilterStatus===s.key?s.color:"#94a3b8",border:`1px solid ${listFilterStatus===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {/* Фильтр по сотруднику */}
                    {currentPermissions.estimates === "all" && nonViewerUsers.length > 1 && (
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                        <button onClick={()=>setListFilterManager("")}
                          style={{background:!listFilterManager?"#eff6ff":"rgba(0,0,0,.03)",color:!listFilterManager?"#2563eb":"#94a3b8",border:`1px solid ${!listFilterManager?"rgba(136,136,204,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                          Все сотрудники
                        </button>
                        {nonViewerUsers.map(u=>(
                          <button key={u.id} onClick={()=>setListFilterManager(u.name)}
                            style={{background:listFilterManager===u.name?"#eff6ff":"rgba(0,0,0,.03)",color:listFilterManager===u.name?"#2563eb":"#94a3b8",border:`1px solid ${listFilterManager===u.name?"rgba(136,136,204,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                            👤 {u.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <div style={{flex:1}}/>
                      {/* Сортировка */}
                      <select value={listSort} onChange={e=>setListSort(e.target.value)}
                        style={{background:"#ffffff",border:"1px solid #e2e8f0",color:"#94a3b8",borderRadius:8,padding:"4px 8px",fontSize:11,fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
                        <option value="date">По дате</option>
                        <option value="sum">По сумме</option>
                        <option value="name">По имени</option>
                      </select>
                    </div>
                  </div>
                )}

                {accessibleEstimates.length === 0 ? (
                  <div style={{textAlign:"center",padding:"80px 0"}}>
                    <div style={{fontSize:40,marginBottom:16}}>📋</div>
                    <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Смет пока нет</div>
                    <div style={{fontSize:13,color:"#334155",marginBottom:24}}>Нажмите «+ Новая смета» чтобы начать</div>
                    {currentPermissions.estimateCreate !== "none" && (
                      <button className="btn btn-g" onClick={newEstimate}>+ Создать первую смету</button>
                    )}
                  </div>
                ) : (() => {
                  const filtered = filteredEstimates;
                  // Группировка: строим из ВСЕХ смет, фильтрованные определяют видимость
                  const filteredIds = new Set(filtered.map(e=>e.id));
                  const dsMap = {}; // parentId -> [child, ...]
                  const estById = {};
                  accessibleEstimates.forEach(e=>{ estById[e.id]=e; if(e.parentId){ (dsMap[e.parentId]||(dsMap[e.parentId]=[])).push(e); } });
                  // Корневые сметы из filtered (без parentId)
                  const roots = filtered.filter(e=>!e.parentId);
                  // ДС из filtered у которых родитель НЕ в filtered — показываем как корень
                  const orphanDs = filtered.filter(e=>e.parentId && !filteredIds.has(e.parentId) && !roots.find(r=>r.id===e.id));
                  const visibleRoots = [...roots, ...orphanDs];

                  const renderCard = (est, isChild=false) => {
                    const author = est.updatedBy&&est.updatedBy!==est.createdBy ? est.updatedBy : est.createdBy;
                    // ДС наследует актуальные данные клиента из родителя (имя, тип, площадь, адрес)
                    const parentProj = est.parentId ? estById[est.parentId]?.proj : null;
                    const dProj = parentProj ? {...(est.proj||{}), name:parentProj.name, type:parentProj.type, area:parentProj.area, address:parentProj.address, phone:parentProj.phone} : (est.proj||{});
                    return (
                      <div key={est.id}>
                        {isChild && <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:16,marginBottom:2,marginTop:4}}>
                          <div style={{width:2,height:14,background:"#e2e8f0",borderRadius:2,flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#059669",fontWeight:700,background:"rgba(5,150,105,.08)",borderRadius:3,padding:"1px 6px"}}>ДС-{est.dsNumber||"?"}</span>
                        </div>}
                        <div className="est-card up" style={{padding:"10px 14px",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #d1fae5":"none",cursor:canEditEstimate(est)?"pointer":"default"}}
                          onClick={() => openEstimate(est)}>
                          {/* Строка 1: имя + сумма */}
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            {(() => { const s=STATUSES.find(x=>x.key===(est.status||"new"))||STATUSES[0]; return <span style={{fontSize:10,fontWeight:700,color:s.color,background:s.bg,borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{s.label}</span>; })()}
                            <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{dProj?.name || <span style={{color:"#94a3b8",fontStyle:"italic"}}>Без названия</span>}</span>
                              {dProj?.address && <span style={{fontSize:12,color:"#64748b",fontWeight:500}}> · 📍 {dProj.address}</span>}
                              {dProj?.phone && <span style={{fontSize:12,color:"#64748b",fontWeight:500}}> · 📞 {dProj.phone}</span>}
                            </span>
                            {est.total>0
                              ? <span style={{fontSize:14,fontWeight:800,color:"#2563eb",flexShrink:0}}>{fmt(est.total)} ₸</span>
                              : <span style={{fontSize:11,color:"#94a3b8",fontStyle:"italic",flexShrink:0}}>черновик</span>}
                          </div>
                          {est.comment&&<div style={{fontSize:11,color:"#94a3b8",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>💬 {est.comment}</div>}
                          {est.status==="sent"&&est.sentAt&&<div style={{fontSize:11,color:"#7c3aed",marginTop:2,fontWeight:600}}>📤 Отправлено {new Date(est.sentAt).toLocaleDateString("ru-RU")}</div>}
                          {/* Строка 2: мета + дата + кнопки */}
                          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}} onClick={e=>e.stopPropagation()}>
                            <span style={{fontSize:11,color:"#94a3b8",background:"rgba(0,0,0,.03)",borderRadius:4,padding:"1px 6px"}}>{dProj?.type||"—"}</span>
                            {dProj?.area&&<span style={{fontSize:11,color:"#94a3b8"}}>{dProj.area} м²</span>}
                            <span style={{flex:1}}/>
                            <span style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>{fmtDate(est.updatedAt)}</span>
                            {author&&<span style={{fontSize:10,color:"#94a3b8",whiteSpace:"nowrap"}}>· {author}</span>}
                            {accessAllows(currentPermissions.documentCreate, isOwnEstimate(est)) && <button onClick={()=>{
                              const catalog = getEffectiveCatalog();
                              const mm = 1 + (est.markup||0) / 100;
                              const works = Object.entries(est.rows||{}).filter(([,r])=>Number(r?.qty)>0).map(([key,r])=>{
                                const w = catalog.find(x=>x.name===key)||catalog.find(x=>x.code===key);
                                if(!w) return null;
                                const qty = Number(r.qty||0);
                                const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
                                const rawPrice = r.manualPrice !== undefined && r.manualPrice !== ""
                                  ? Number(r.manualPrice)
                                  : getPrice(w, qty, r.complexity||"std", cpxPct);
                                const price = rawPrice ? rawPrice * mm : null;
                                const ew = getEffectiveWork(w);
                                const pf = (!price && ew.priceFrom) ? Math.round(ew.priceFrom * mm) : null;
                                const displayName = r.manualName !== undefined ? r.manualName : w.name;
                                const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (w.unit||"м²");
                                return {name:displayName,category:w.cat||"",subcategory:w.sub||"",quantity:qty,unit:displayUnit,price:price?Math.round(price):0,priceFrom:pf||undefined};
                              }).filter(Boolean);
                              const isDs = !!est.parentId;
                              // ДС → тип annex, номер приложения = dsNumber+1 (т.к. №1 — основное)
                              const sibCount = isDs ? (dsMap[est.parentId]||[]).filter(e=>e.dsNumber<=(est.dsNumber||1)).length : 0;
                              const annexNum = isDs ? (est.dsNumber||1) + 1 : 1;
                              // Для приложения подтягиваем номер основного договора из договора родительской сметы
                              const parentContract = isDs ? contracts.find(c=>c.estId===est.parentId && (c.type||"repair_fiz")!=="annex") : null;
                              const mainNumber = parentContract?.number || "";
                              const mainDate = parentContract?.date || "";
                              const now = Date.now();
                              const newContract = {id:now.toString(),createdAt:now,objectId:est.objectId||"",number:"",date:new Date(now).toISOString().split("T")[0],clientId:parentContract?.clientId||"",contragentId:parentContract?.contragentId||contragents[0]?.id||"",works,discount:est.discount||0,appendix:annexNum,estId:est.id,estClient:dProj?.name||"",estPhone:dProj?.phone||"",estAddress:dProj?.address||"",note:"",type:isDs?"annex":"repair_fiz",createdBy:currentUser.name,createdById:currentUser.id,...(isDs?{mainNumber,mainDate}:{})};
                              setCurrentContract(newContract);
                              setContractTab("editor");
                              setScreen("contracts");
                            }} title={est.parentId?"Создать приложение":"Создать договор"}
                              style={{background:"rgba(184,144,74,.08)",color:"#2563eb",border:"1px solid #eff6ff",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                              📄
                            </button>}
                            {accessAllows(currentPermissions.objectCreate, isOwnEstimate(est)) && !isChild && !est.objectId && (
                              <button onClick={()=>moveEstimateToObject(est)}
                                title="Создать объект из этой сметы и перенести в раздел Объекты"
                                style={{background:"rgba(37,99,235,.08)",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0,fontWeight:700}}>
                                📦 В объект
                              </button>
                            )}
                            {canCreateEstimateFor(est) && !isChild && (
                              <button onClick={()=>newSupplementaryEstimate(est)}
                                title="Создать доп. смету (ДС)"
                                style={{background:"rgba(5,150,105,.08)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0,fontWeight:700}}>
                                +ДС
                              </button>
                            )}
                            {canCreateEstimateFor(est) && (
                              <button onClick={()=>duplicateEstimate(est)}
                                style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(100,100,200,.15)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                ⧉
                              </button>
                            )}
                            {canDeleteEstimate(est) && (
                              <button onClick={async ()=>{ if(await confirmTyped("Удалить смету?\nЭто действие нельзя отменить.")) deleteEstimate(est.id); }}
                                style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                🗑
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      <div style={{fontSize:11,color:"#94a3b8",marginBottom:2}}>
                        {(() => {
                          const totalRoots = accessibleEstimates.filter(e=>!e.parentId).length;
                          const foundRoots = filtered.filter(e=>!e.parentId).length;
                          return foundRoots !== totalRoots ? `Найдено: ${foundRoots}` : `Всего смет: ${totalRoots}`;
                        })()}
                      </div>
                      {visibleRoots.length === 0 && (
                        <div style={{textAlign:"center",padding:"40px 0",color:"#334155",fontSize:13}}>Ничего не найдено</div>
                      )}
                      {visibleRoots.map(est => (
                        <div key={est.id}>
                          {renderCard(est, false)}
                          {(dsMap[est.id]||[]).sort((a,b)=>(a.dsNumber||0)-(b.dsNumber||0)).map(child => renderCard(child, true))}
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 2: РЕДАКТОР СМЕТЫ
      ═══════════════════════════════════════════════════════════════════ */}
      {screen === "editor" && !canEditCurrentEstimate && restrictedSection("Редактирование сметы", "сотрудникам с соответствующим правом")}
      {screen === "editor" && canEditCurrentEstimate && (
        <div>
          {/* HEADER */}
          <div className="editor-header" style={{background:"#ffffff",borderBottom:"1px solid #e2e8f0",padding:"11px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,gap:8}}>
            <div className="editor-header-left" style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <button className="btn btn-o" style={{padding:"7px 11px",fontSize:12,flexShrink:0}} onClick={saveAndBack}>
                ← Сметы
              </button>
              <div style={{fontSize:13,fontWeight:600,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
                {proj.name || "Новая смета"}
              </div>
            </div>
            <div className="editor-header-right" style={{display:"flex",alignItems:"center",gap:8}}>
              {saving && <span style={{fontSize:11,color:"#94a3b8"}}>💾</span>}
              {filledCount > 0 && (
                <button onClick={()=>setShowSelectedOnly(s=>!s)}
                  style={{fontSize:11,padding:"6px 12px",background:showSelectedOnly?"#f0fdf4":"",border:`1px solid ${showSelectedOnly?"#059669":"#e2e8f0"}`,borderRadius:8,color:showSelectedOnly?"#059669":"#94a3b8",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  {showSelectedOnly ? `✓ Выбранные (${filledCount})` : `📋 Выбранные (${filledCount})`}
                </button>
              )}
              {currentUser.role !== "viewer" && (
                <button className="btn btn-o" style={{fontSize:11,padding:"6px 12px",background:showFinancial?"#eff6ff":"",borderColor:showFinancial?"#2563eb":""}} onClick={()=>setShowFinancial(m=>!m)}>
                  {showFinancial ? "💰 Финансы вкл" : "💰 Финансы"}
                </button>
              )}
              {currentUser.role === "viewer" && (
                <span style={{fontSize:11,color:"#94a3b8",background:"rgba(0,0,0,.04)",borderRadius:5,padding:"4px 10px"}}>👁 Только просмотр</span>
              )}
              <span className="proj-name" style={{fontSize:11,color:"#94a3b8"}}>
                {currentUser.role==="admin"?"👑":currentUser.role==="viewer"?"👁":"👤"} {currentUser.name}
              </span>
              <button className="btn btn-o" style={{padding:"8px 16px",fontSize:13}} onClick={saveAndBack}>← Назад</button>
              {saving && <span style={{fontSize:11,color:"#94a3b8"}}>💾</span>}
            </div>
          </div>

          <div style={{maxWidth:1600,margin:"0 auto",padding:"18px 18px"}}>
            {/* ОБЪЕКТ — скрываем, если смета привязана к объекту (поля ведутся в объекте) */}
            {!currentObjectId && (
            <div className="card up" style={{padding:"16px 20px",marginBottom:16}}>
              <div style={{fontSize:10,fontWeight:700,color:"#2563eb",letterSpacing:1.5,textTransform:"uppercase",marginBottom:11}}>Информация об объекте</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                {[["Клиент / Объект","name","Иванов — Бухар-Жырау 45","text"],
                  ["Тип","type","","objtype"],
                  ["Площадь, м²","area","75","text"],
                  ["Менеджер","manager","","manager"],
                  ["Телефон клиента","phone","+7 707...","text"],
                  ["Адрес","address","ул. Бухар-Жырау, 45","text"],
                ].map(([lbl,f,ph,ftype])=>(
                  <div key={f}>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>{lbl}</div>
                    {ftype==="objtype" ? (
                      <select className="fi" value={proj.type} onChange={e=>setProj(p=>({...p,type:e.target.value}))}>
                        {OBJ_TYPES.map(t=><option key={t}>{t}</option>)}
                      </select>
                    ) : ftype==="manager" ? (
                      <select className="fi" value={proj.manager||""} onChange={e=>setProj(p=>({...p,manager:e.target.value}))}>
                        <option value="">— выбрать —</option>
                        {nonViewerUsers.map(u=>(
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input className="fi" placeholder={ph} value={proj[f]||""} onChange={e=>setProj(p=>({...p,[f]:e.target.value}))}
                        disabled={currentUser.role==="viewer"} style={{opacity:currentUser.role==="viewer"?.6:1}}/>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:16,alignItems:"start"}} className="main-grid">
              {/* ТОЛЬКО ВЫБРАННЫЕ */}
              {showSelectedOnly && (() => {
                const selectedWorks = [];
                for (const cat of cats) for (const sub of Object.keys(Gdyn[cat]||{})) for (const w of Gdyn[cat]?.[sub]||[]) {
                  const r = rows[w.code]||rows[w.name]||{};
                  if (Number(r.qty||0) > 0) selectedWorks.push({...w, cat, sub});
                }
                return (
                  <div className="card up">
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>Выбранные позиции ({selectedWorks.length})</span>
                      <button onClick={()=>setShowSelectedOnly(false)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>✕ Закрыть</button>
                    </div>
                    <div className="wrow-th" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",padding:"8px 16px",fontSize:11,color:"#64748b",fontWeight:600,letterSpacing:".04em",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0",background:"#f9fafb"}}>
                      <span>Наименование</span>
                      <span className="wrow-desk" style={{textAlign:"center"}}>Ед.</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Цена за ед., ₸</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Объём</span>
                      <span className="wrow-desk" style={{textAlign:"right"}}>Итого, ₸</span>
                    </div>
                    <div style={{padding:"4px 0"}}>
                      {selectedWorks.map(work => {
                        const r = rows[work.code]||rows[work.name]||{};
                        const qty = Number(r.qty||0);
                        const price = rowPrice(work);
                        const total = rowTotal(work);
                        const displayName = r.manualName !== undefined ? r.manualName : work.name;
                        const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (work.unit||"м²");
                        return (
                          <div key={work.name} className="wrow" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",gap:4,padding:"8px 16px",borderBottom:"1px solid #f3f4f6",alignItems:"center"}}>
                            <div style={{minWidth:0}}>
                              {r.editingName ? (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <input autoFocus style={{fontSize:13,background:"#f8fafc",border:"1px solid #2563eb",color:"#0f172a",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",outline:"none",width:"100%",minWidth:0}}
                                    value={r.manualName !== undefined ? r.manualName : work.name}
                                    onChange={e=>setRow(work.code || work.name,"manualName",e.target.value)}
                                    onBlur={()=>setRow(work.code || work.name,"editingName",false)}
                                    onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.code || work.name,"editingName",false);}}/>
                                  {r.manualName !== undefined && <span onClick={()=>{setRow(work.code || work.name,"manualName",undefined);setRow(work.code || work.name,"editingName",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",flexShrink:0}}>✕</span>}
                                </div>
                              ) : (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{fontSize:13,color:"#0f172a",fontWeight:500}}>{displayName}</span>
                                  {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.code || work.name,"editingName",true)} title="Изменить название" style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.6,flexShrink:0,lineHeight:1}}>✏</span>}
                                </div>
                              )}
                              <div style={{fontSize:10,color:"#94a3b8"}}>{work.cat} · {work.sub}</div>
                              {showFinancial && currentUser.role!=="viewer" && qty > 0 && (() => {
                                const costPerUnit = rowCostPerUnit(r, work);
                                const dp = price ?? getBasePrice(work);
                                const marginPct = dp && dp > 0 && costPerUnit > 0 ? Math.round((dp - costPerUnit) / dp * 100) : null;
                                const grossProfit = dp != null && costPerUnit > 0 ? (dp - costPerUnit) * qty : null;
                                return (
                                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",marginTop:3,fontSize:10,color:"#64748b",alignItems:"center"}}>
                                    <span style={{display:"inline-flex",alignItems:"center",gap:3}}>Себест/ед:
                                      <input type="number" min="0" placeholder={String(Number(work.cost)||0)}
                                        value={r.manualCost!==undefined?r.manualCost:(work.cost||"")}
                                        onChange={e=>setRow(work.code || work.name,"manualCost",e.target.value===""?undefined:Number(e.target.value))}
                                        style={{width:64,border:"1px solid #e2e8f0",borderRadius:4,padding:"1px 5px",fontSize:11,textAlign:"right",fontFamily:"inherit",background:"#fff",color:r.manualCost!==undefined?"#2563eb":"#334155",fontWeight:r.manualCost!==undefined?700:400}}/>
                                      {r.manualCost!==undefined && <span onClick={()=>setRow(work.code || work.name,"manualCost",undefined)} title="Сбросить" style={{cursor:"pointer",color:"#ef4444"}}>✕</span>}
                                    </span>
                                    {costPerUnit > 0 && <span>Себест: <b style={{color:"#334155"}}>{fmt(costPerUnit * qty)} ₸</b></span>}
                                    {marginPct !== null && <span>Маржа: <b style={{color: marginPct>=35?"#059669":marginPct>=20?"#d97706":"#ef4444"}}>{marginPct}%</b></span>}
                                    {grossProfit !== null && grossProfit > 0 && <span>Прибыль: <b style={{color:"#059669"}}>{fmt(Math.round(grossProfit))} ₸</b></span>}
                                  </div>
                                );
                              })()}
                              {/* Mobile: qty + price + total */}
                              <div className="wrow-mob-extra" style={{flexDirection:"column",alignItems:"flex-start",gap:3,display:"none",marginTop:4}}>
                                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                  <span style={{fontSize:11,color:"#94a3b8"}}>Цена:</span>
                                  <NumInput
                                    value={r.manualPrice !== undefined ? r.manualPrice : (price||"")}
                                    onCommit={v=>setRow(work.code || work.name,"manualPrice",v===""?undefined:Number(v))}
                                    style={{width:80,border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 5px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                                  <span style={{fontSize:11,color:"#94a3b8"}}>Объём:</span>
                                  <NumInput
                                    value={r.qty||""}
                                    onCommit={v=>setRow(work.code || work.name,"qty",v)}
                                    style={{width:60,border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 5px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                                </div>
                                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
                                  <span style={{fontSize:13,fontWeight:700,color:total>0?"#2563eb":"#94a3b8"}}>{total>0?fmt(total)+" ₸":"—"}</span>
                                  <button onClick={()=>setRow(work.code || work.name,"qty","")} title="Убрать из сметы"
                                    style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14,padding:0,lineHeight:1}}>✕</button>
                                </div>
                              </div>
                            </div>
                            <div className="wrow-desk" style={{textAlign:"center"}}>
                              <input value={displayUnit}
                                onChange={e=>setRow(work.code || work.name,"manualUnit",e.target.value===(work.unit||"м²")?undefined:e.target.value)}
                                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:4,padding:"3px 4px",fontSize:11,textAlign:"center",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div className="wrow-desk" style={{textAlign:"right"}}>
                              <NumInput
                                value={r.manualPrice !== undefined ? r.manualPrice : (price||"")}
                                onCommit={v=>setRow(work.code || work.name,"manualPrice",v===""?undefined:Number(v))}
                                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:4,padding:"3px 6px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div className="wrow-desk" style={{textAlign:"right"}}>
                              <NumInput
                                value={r.qty||""}
                                onCommit={v=>setRow(work.code || work.name,"qty",v)}
                                style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:4,padding:"3px 6px",fontSize:12,textAlign:"right",fontFamily:"inherit",background:"#fff"}}/>
                            </div>
                            <div className="wrow-desk" style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
                              <span style={{fontSize:13,fontWeight:700,color:total>0?"#2563eb":"#94a3b8"}}>{total>0?fmt(total):"—"}</span>
                              <button onClick={()=>setRow(work.code || work.name,"qty","")} title="Убрать из сметы"
                                style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:14,padding:0,lineHeight:1}}>✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{padding:"12px 16px",borderTop:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:"#94a3b8"}}>Итого по выбранным позициям</span>
                      <span style={{fontSize:15,fontWeight:800,color:"#2563eb"}}>{fmt(grand)} ₸</span>
                    </div>
                  </div>
                );
              })()}

              {/* РАБОТЫ */}
              <div className="card up" style={{display:showSelectedOnly?"none":"block"}}>
                {/* Поиск */}
                <div style={{padding:"10px 12px",borderBottom:"1px solid #e2e8f0",position:"relative"}}>
                  <input className="fi" placeholder="🔍  Поиск по работам... (например: штукатурка, плитка, розетки)"
                    value={search} onChange={e=>setSearch(e.target.value)}
                    style={{paddingLeft:14,paddingRight:search?32:14}}/>
                  {search && (
                    <button onClick={()=>setSearch("")} style={{position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16,lineHeight:1}}>×</button>
                  )}
                </div>

                {/* Категории */}
                {!isSearching && <div style={{display:"flex",gap:3,padding:"10px 10px 0",borderBottom:"1px solid #e2e8f0"}}>
                  {cats.map(cat=>(
                    <button key={cat} className={`tab-btn ${activeCat===cat?"active":""}`}
                      onClick={()=>{ const s=Object.keys(Gdyn[cat]||{}); setActiveCat(cat); setActiveSub(s[0]||""); }}>
                      {cat}{catSum(cat)>0&&<span style={{marginLeft:4,fontSize:9,color:"#2563eb"}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Подкатегории */}
                {!isSearching && <div style={{display:"flex",flexWrap:"wrap",gap:3,padding:"8px 10px",borderBottom:"1px solid #e2e8f0",background:"rgba(0,0,0,.12)"}}>
                  {subs.map(sub=>(
                    <button key={sub} className={`sub-btn ${safeActiveSub===sub?"active":""}`} onClick={()=>setActiveSub(sub)}>
                      {sub}{subSum(safeCat,sub)>0&&<span style={{marginLeft:3,color:"#2563eb",fontSize:8}}>●</span>}
                    </button>
                  ))}
                </div>}

                {/* Шапка таблицы */}
                <div className="wrow-th" style={{display:"grid",gridTemplateColumns:"1fr 50px 120px 76px 90px",padding:"8px 16px",fontSize:11,color:"#64748b",fontWeight:600,letterSpacing:".04em",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0",background:"#f9fafb"}}>
                  <span>Наименование</span>
                  <span className="wrow-desk" style={{textAlign:"center"}}>Ед.</span>
                  <span className="wrow-desk" style={{textAlign:"right"}}>Цена за ед., ₸</span>
                  <span className="wrow-desk" style={{textAlign:"right"}}>Объём</span>
                  <span className="wrow-desk" style={{textAlign:"right"}}>Итого, ₸</span>
                  <span className="wrow-mob-extra" style={{textAlign:"right",display:"none"}}>Цена · Объём · Итого</span>
                </div>

                {/* Строки работ */}
                <div style={{padding:"4px 0"}}>
                  {isSearching && searchResults.length === 0 && (
                    <div style={{textAlign:"center",padding:"32px 0",color:"#94a3b8"}}>
                      <div style={{fontSize:22,marginBottom:8}}>🔍</div>
                      <div style={{fontSize:13}}>Ничего не найдено</div>
                    </div>
                  )}
                  {isSearching && searchResults.length > 0 && (
                    <div style={{padding:"4px 8px 2px",fontSize:10,color:"#94a3b8",borderBottom:"1px solid #e2e8f0",marginBottom:2}}>
                      Найдено: {searchResults.length} работ
                    </div>
                  )}
                  {(isSearching ? searchResults : (Gdyn[safeCat]?.[safeActiveSub]||[])).map(work=>{
                    const r = rows[work.code]||rows[work.name]||{};
                    const qty = Number(r.qty||0);
                    const cpx = r.complexity||"std";
                    const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : (cpx==="mid"?20:cpx==="hard"?50:0);
                    const price = rowPrice(work);
                    const basePrice = getBasePrice(work);
                    const displayPrice = price ?? basePrice;
                    const total = rowTotal(work);
                    const filled = qty > 0 && price;
                    const showBreadcrumb = isSearching;
                    const tierHint = (work.tiers||[]).length > 1
                      ? (work.tiers||[]).map(t=>`${t.min}–${t.max}: ${fmt(t.price)} ₸`).join(" · ")
                      : null;
                    const isEditingThisPrice = editingPriceRow === work.name || editPrices;
                    const costPerUnit = rowCostPerUnit(r, work);
                    const marginPct = displayPrice && displayPrice > 0 && costPerUnit > 0
                      ? Math.round((displayPrice - costPerUnit) / displayPrice * 100)
                      : null;
                    const grossProfit = qty > 0 && displayPrice != null && costPerUnit > 0
                      ? (displayPrice - costPerUnit) * qty : null;
                    const priceCell = isEditingThisPrice ? (
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <input className="num" style={{width:90}} type="number" min="0" placeholder="Цена"
                          autoFocus={editingPriceRow===work.name}
                          value={r.manualPrice!==undefined ? r.manualPrice : (price||"")}
                          onChange={e=>setRow(work.code || work.name,"manualPrice",e.target.value===""?undefined:Number(e.target.value))}
                          onBlur={()=>{ if(!editPrices) setEditingPriceRow(null); }}
                          onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape"){ if(!editPrices) setEditingPriceRow(null); } }}/>
                        {r.manualPrice!==undefined && <span onClick={()=>setRow(work.code || work.name,"manualPrice",undefined)} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",marginLeft:2}}>✕</span>}
                      </div>
                    ) : displayPrice != null ? (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:12,color:r.manualPrice!==undefined?"#2563eb":"#334155",fontWeight:r.manualPrice!==undefined?700:400}}>{fmt(displayPrice)}</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Изменить цену" style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.7,lineHeight:1}}>✏</span>}
                      </div>
                    ) : rowPriceFrom(work) ? (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:11,color:"#b8904a",fontStyle:"italic"}}>от {fmt(rowPriceFrom(work))}</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Ввести точную цену" style={{cursor:"pointer",fontSize:10,color:"#94a3b8"}}>✏</span>}
                      </div>
                    ) : (
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}>
                        <span style={{fontSize:10,color:"#94a3b8",fontStyle:"italic"}}>нет цены</span>
                        {currentUser.role!=="viewer" && <span onClick={()=>setEditingPriceRow(work.name)} title="Ввести цену" style={{cursor:"pointer",fontSize:10,color:"#94a3b8"}}>✏</span>}
                      </div>
                    );
                    const qtyInput = <NumInput className="num" style={{width:70,textAlign:"center",opacity:currentUser.role==="viewer"?.4:1}} disabled={currentUser.role==="viewer"}
                      value={r.qty||""} onCommit={v=>setRow(work.code || work.name,"qty",v)}/>;
                    const nameBlock = (
                      <div style={{minWidth:0}}>
                        {showBreadcrumb && <div style={{fontSize:10,color:"#334155",marginBottom:2}}>{work.cat} › {work.sub}</div>}
                        {r.editingName ? (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <input autoFocus style={{fontSize:13,background:"#f8fafc",border:"1px solid #2563eb",color:"#0f172a",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",outline:"none",width:"100%",minWidth:0}}
                              value={r.manualName !== undefined ? r.manualName : work.name}
                              onChange={e=>setRow(work.code || work.name,"manualName",e.target.value)}
                              onBlur={()=>setRow(work.code || work.name,"editingName",false)}
                              onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.code || work.name,"editingName",false);}}/>
                            {r.manualName !== undefined && <span onClick={()=>{setRow(work.code || work.name,"manualName",undefined);setRow(work.code || work.name,"editingName",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444",flexShrink:0}}>✕</span>}
                          </div>
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:13,color:filled?"#0f172a":"#94a3b8",lineHeight:1.3}}>{r.manualName !== undefined ? r.manualName : work.name}</span>
                            {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.code || work.name,"editingName",true)} title="Изменить название" style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.6,flexShrink:0,lineHeight:1}}>✏</span>}
                          </div>
                        )}
                        {tierHint && <div style={{fontSize:10,color:"#334155",marginTop:1}}>{tierHint}</div>}
                        {qty > 0 && currentUser.role!=="viewer" && (
                          <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4}}>
                            <span style={{fontSize:10,color:"#94a3b8"}}>Надбавка:</span>
                            <input className="num" type="number" min="-50" max="300" step="5"
                              style={{width:52,fontSize:11,padding:"2px 6px",textAlign:"right"}}
                              value={cpxPct}
                              onChange={e=>{setRow(work.code || work.name,"cpxPct",Number(e.target.value));setRow(work.code || work.name,"manualPrice",undefined);}}/>
                            <span style={{fontSize:10,color:"#94a3b8"}}>%</span>
                          </div>
                        )}
                        {showFinancial && currentUser.role!=="viewer" && qty > 0 && (
                          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",marginTop:4,fontSize:10,color:"#64748b",alignItems:"center"}}>
                            <span style={{display:"inline-flex",alignItems:"center",gap:3}}>Себест/ед:
                              <input type="number" min="0" placeholder={String(Number(work.cost)||0)}
                                value={r.manualCost!==undefined?r.manualCost:(work.cost||"")}
                                onChange={e=>setRow(work.code || work.name,"manualCost",e.target.value===""?undefined:Number(e.target.value))}
                                style={{width:64,border:"1px solid #e2e8f0",borderRadius:4,padding:"1px 5px",fontSize:11,textAlign:"right",fontFamily:"inherit",background:"#fff",color:r.manualCost!==undefined?"#2563eb":"#334155",fontWeight:r.manualCost!==undefined?700:400}}/>
                              {r.manualCost!==undefined && <span onClick={()=>setRow(work.code || work.name,"manualCost",undefined)} title="Сбросить" style={{cursor:"pointer",color:"#ef4444"}}>✕</span>}
                            </span>
                            {costPerUnit > 0 && <span>Себест: <b style={{color:"#334155"}}>{fmt(costPerUnit * qty)} ₸</b></span>}
                            {marginPct !== null && (
                              <span>Маржа: <b style={{color: marginPct>=35?"#059669":marginPct>=20?"#d97706":"#ef4444"}}>{marginPct}%</b></span>
                            )}
                            {grossProfit !== null && grossProfit > 0 && (
                              <span>Прибыль: <b style={{color:"#059669"}}>{fmt(Math.round(grossProfit))} ₸</b></span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    return (
                      <div key={work.name} className={`wrow ${filled?"on":""}`}>
                        {/* Desktop: 5 cols via CSS class; Mobile: overridden to 2 cols */}
                        <style>{`@media(min-width:701px){.wrow{grid-template-columns:1fr 50px 120px 76px 90px}}.wrow-mob-extra{display:none}@media(max-width:700px){.wrow{grid-template-columns:1fr auto!important}.wrow-mob-extra{display:flex!important}}`}</style>
                        {nameBlock}
                        <div className="wrow-desk" style={{textAlign:"center",fontSize:12,paddingTop:3,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                          {r.editingUnit ? (
                            <div style={{display:"flex",alignItems:"center",gap:3}}>
                              <input autoFocus style={{width:46,background:"#f8fafc",border:"1px solid #2563eb",borderRadius:4,padding:"2px 5px",fontSize:11,fontFamily:"inherit",outline:"none",textAlign:"center",color:"#0f172a"}}
                                value={r.manualUnit !== undefined ? r.manualUnit : work.unit}
                                onChange={e=>setRow(work.code || work.name,"manualUnit",e.target.value)}
                                onBlur={()=>setRow(work.code || work.name,"editingUnit",false)}
                                onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")setRow(work.code || work.name,"editingUnit",false);}}/>
                              {r.manualUnit !== undefined && <span onClick={()=>{setRow(work.code || work.name,"manualUnit",undefined);setRow(work.code || work.name,"editingUnit",false);}} title="Сбросить" style={{cursor:"pointer",fontSize:10,color:"#ef4444"}}>✕</span>}
                            </div>
                          ) : (
                            <>
                              <span style={{color:r.manualUnit!==undefined?"#2563eb":"#94a3b8",fontWeight:r.manualUnit!==undefined?700:400}}>{r.manualUnit !== undefined ? r.manualUnit : work.unit}</span>
                              {currentUser.role!=="viewer" && <span onClick={()=>setRow(work.code || work.name,"editingUnit",true)} title="Изменить ед. изм." style={{cursor:"pointer",fontSize:10,color:"#94a3b8",opacity:.6,lineHeight:1}}>✏</span>}
                            </>
                          )}
                        </div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:2}}>{priceCell}</div>
                        <div className="wrow-desk" style={{textAlign:"right"}}>{qtyInput}</div>
                        <div className="wrow-desk" style={{textAlign:"right",paddingTop:3}}>
                          {total>0 ? <span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>{fmt(total)}</span>
                                   : <span style={{color:"#94a3b8",fontSize:12}}>—</span>}
                        </div>
                        {/* Mobile right column: цена/ед · поле · итог */}
                        <div className="wrow-mob-extra" style={{flexDirection:"column",alignItems:"flex-end",gap:3,display:"none",paddingTop:2,minWidth:90}}>
                          <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>
                            {displayPrice!=null ? fmt(displayPrice)+" ₸/ед" : <span style={{fontStyle:"italic",fontSize:10}}>нет цены</span>}
                          </span>
                          <NumInput className="num" style={{width:82,textAlign:"center",fontSize:16,padding:"7px 10px",fontWeight:700}} placeholder="0"
                            value={r.qty||""} onCommit={v=>setRow(work.code || work.name,"qty",v)}/>
                          {total>0
                            ? <span style={{fontSize:12,fontWeight:800,color:"#0f172a",whiteSpace:"nowrap"}}>{fmt(total)} ₸</span>
                            : <span style={{fontSize:10,color:"#334155"}}>—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isSearching && subSum(safeCat,safeActiveSub)>0&&(
                  <div style={{borderTop:"1px solid #e2e8f0",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#94a3b8"}}>Итого по разделу «{safeActiveSub}»</span>
                    <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                      {showFinancial && currentUser.role!=="viewer" && (() => {
                        const subWorks = (Gdyn[safeCat]?.[safeActiveSub]||[]);
                        let subCost=0, subProfit=0;
                        for(const w of subWorks){
                          const rr=rows[w.code]||rows[w.name]||{};
                          const qty=Number(rr.qty||0);
                          const p=rowPrice(w); const bp=getBasePrice(w);
                          const dp=p??bp;
                          const cpu=rowCostPerUnit(rr,w);
                          subCost+=cpu*qty;
                          if(qty>0&&dp!=null) subProfit+=(dp-cpu)*qty;
                        }
                        return subCost>0 ? (
                          <span style={{fontSize:11,color:"#64748b"}}>
                            Себест: <b style={{color:"#334155"}}>{fmt(Math.round(subCost))} ₸</b>
                            {subProfit>0 && <> · Прибыль: <b style={{color:"#059669"}}>{fmt(Math.round(subProfit))} ₸</b></>}
                          </span>
                        ) : null;
                      })()}
                      <span style={{fontSize:15,fontWeight:700,color:"#2563eb"}}>{fmt(subSum(safeCat,safeActiveSub))} ₸</span>
                    </div>
                  </div>
                )}
                {isSearching && searchResults.length > 0 && (() => {
                  const searchTotal = searchResults.reduce((s,w) => s + rowTotal(w), 0);
                  return searchTotal > 0 ? (
                    <div style={{borderTop:"1px solid #e2e8f0",padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:"#94a3b8"}}>Итого по найденным работам</span>
                      <span style={{fontSize:15,fontWeight:700,color:"#2563eb"}}>{fmt(searchTotal)} ₸</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* ПРАВАЯ ПАНЕЛЬ */}
              <div id="summary-panel" style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:18}} className="up">
                  <div style={{fontSize:10,fontWeight:700,color:"#2563eb",letterSpacing:1.5,textTransform:"uppercase",marginBottom:14}}>Смета</div>
                  {cats.map(cat=>{
                    const cs = catSum(cat);
                    if(!cs) return null;
                    return (
                      <div key={cat} style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:.7,padding:"5px 0 3px",borderBottom:"1px solid #e2e8f0"}}>{cat}</div>
                        {Object.keys(Gdyn[cat]||{}).map(sub=>{
                          const ss = subSum(cat,sub);
                          if(!ss) return null;
                          return (
                            <div key={sub} style={{display:"flex",justifyContent:"space-between",padding:"4px 0 4px 6px",fontSize:12,borderBottom:"1px solid #f3f4f6"}}>
                              <span style={{color:"#94a3b8"}}>{sub}</span>
                              <span style={{color:"#94a3b8"}}>{fmt(ss)} ₸</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {grand===0&&<div style={{textAlign:"center",padding:"22px 0",color:"#94a3b8",fontSize:12}}>Введите объёмы →</div>}
                  {grand>0&&(
                    <>
                      <div style={{marginTop:10,paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#94a3b8"}}>Скидка %</span>
                        <input className="num" style={{width:54}} type="number" min="0" max="100"
                          value={discount} onChange={e=>setDiscount(Math.min(100,Math.max(0,Number(e.target.value))))}/>
                      </div>
                      {discount>0&&(
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#dc2626",marginTop:6}}>
                          <span>Скидка {discount}%</span><span>− {fmt(discAmt)} ₸</span>
                        </div>
                      )}
                      {currentUser.role!=="viewer" && (
                        <div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:12,color:"#94a3b8"}}>Повышение % <span style={{fontSize:10,color:"#d97706"}}>🔒</span></span>
                          <input className="num" style={{width:54}} type="number" min="0" max="300"
                            value={markup} onChange={e=>setMarkup(Math.max(0,Number(e.target.value)))}/>
                        </div>
                      )}
                      {markup>0&&currentUser.role!=="viewer"&&(
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#d97706",marginTop:4}}>
                          <span>Повышение {markup}%</span><span>+ {fmt(markupAmt)} ₸</span>
                        </div>
                      )}
                      <div style={{borderTop:"1px solid #e2e8f0",marginTop:12,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#2563eb"}}>Итого</span>
                        <span style={{fontSize:22,fontWeight:900,color:"#2563eb"}}>{fmt(final)} ₸</span>
                      </div>
                      {proj.area&&Number(proj.area)>0&&(
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,padding:"5px 8px",background:"#eff6ff",borderRadius:8}}>
                          <span style={{fontSize:11,color:"#d97706"}}>Цена за м²</span>
                          <span style={{fontSize:13,fontWeight:700,color:"#2563eb"}}>≈ {fmt(final/Number(proj.area))} ₸</span>
                        </div>
                      )}
                      {showFinancial && currentUser.role!=="viewer" && (() => {
                        const allFilled = getEffectiveCatalog().filter(w => Number((rows[w.code]||rows[w.name]||{}).qty||0) > 0);
                        let totalCost=0, totalRevenue=0;
                        for(const w of allFilled){
                          const rr=rows[w.code]||rows[w.name]||{};
                          const qty=Number(rr.qty||0);
                          const p=rowPrice(w); const bp=getBasePrice(w); const dp=p??bp;
                          totalCost += rowCostPerUnit(rr,w)*qty;
                          if(dp!=null) totalRevenue += dp*qty;
                        }
                        const revenueAfterDiscount = final; // уже с учётом скидки
                        const totalProfit = revenueAfterDiscount - totalCost;
                        const avgMargin = revenueAfterDiscount > 0 ? Math.round(totalProfit/revenueAfterDiscount*100) : 0;
                        return totalCost > 0 ? (
                          <div style={{marginTop:10,padding:"10px 12px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}}>
                            <div style={{fontSize:10,color:"#059669",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Финансы (внутренние)</div>
                            <div style={{display:"flex",flexDirection:"column",gap:5,fontSize:12}}>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#64748b"}}>Себестоимость</span>
                                <span style={{fontWeight:600,color:"#334155"}}>{fmt(Math.round(totalCost))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#64748b"}}>Цена клиента{discount>0?` (−${discount}%)`:""}</span>
                                <span style={{fontWeight:600,color:"#334155"}}>{fmt(Math.round(revenueAfterDiscount))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #bbf7d0",paddingTop:5,marginTop:2}}>
                                <span style={{color:"#059669",fontWeight:700}}>Валовая прибыль</span>
                                <span style={{fontWeight:800,color:"#059669"}}>{fmt(Math.round(totalProfit))} ₸</span>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between"}}>
                                <span style={{color:"#64748b"}}>Маржа</span>
                                <span style={{fontWeight:700,color:avgMargin>=35?"#059669":avgMargin>=20?"#d97706":"#ef4444"}}>{avgMargin}%</span>
                              </div>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}
                </div>
                {/* Статус сметы */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>Статус</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {STATUSES.map(s=>(
                      <button key={s.key} disabled={!canChangeCurrentEstimateStatus} onClick={()=>{setEstStatus(s.key);if(s.key==="sent"&&!estSentAt)setEstSentAt(new Date().toISOString().slice(0,10));}}
                        style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:8,cursor:canChangeCurrentEstimateStatus?"pointer":"default",fontFamily:"inherit",border:`1px solid ${estStatus===s.key?s.color:"rgba(0,0,0,.04)"}`,background:estStatus===s.key?s.bg:"transparent",color:estStatus===s.key?s.color:"#94a3b8",transition:"all .15s",opacity:canChangeCurrentEstimateStatus?1:.6}}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {estStatus==="sent" && (
                    <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,color:"#7c3aed",fontWeight:600}}>Дата отправки:</span>
                      <input type="date" className="fi" value={estSentAt} disabled={!canChangeCurrentEstimateStatus} onChange={e=>setEstSentAt(e.target.value)}
                        style={{fontSize:12,padding:"3px 8px",borderRadius:8,border:"1px solid rgba(124,58,237,.3)",width:150,color:"#7c3aed",fontFamily:"inherit"}}/>
                    </div>
                  )}
                </div>
                {/* История изменений */}
                {(() => {
                  const rec = estimates.find(e => e.id === currentId);
                  const hist = Array.isArray(rec?.history) ? rec.history : [];
                  if (hist.length === 0) return null;
                  return (
                    <div className="card" style={{padding:14}}>
                      <div onClick={()=>setShowHistory(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
                        <span style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase"}}>История изменений ({hist.length})</span>
                        <span style={{fontSize:12,color:"#94a3b8"}}>{showHistory?"▲":"▼"}</span>
                      </div>
                      {showHistory && (
                        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:0,maxHeight:240,overflowY:"auto"}}>
                          {[...hist].reverse().map((h,i)=>(
                            <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderTop:i>0?"1px solid rgba(0,0,0,.05)":"none",fontSize:12}}>
                              <span style={{color:"#94a3b8",whiteSpace:"nowrap",flexShrink:0,fontSize:11}}>{fmtDate(h.ts)}</span>
                              <span style={{flex:1,color:"#334155"}}><b style={{color:"#0f172a"}}>{h.by||"?"}</b> · {h.action}{h.total>0?<span style={{color:"#94a3b8"}}> · {fmt(h.total)} ₸</span>:null}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Комментарий для менеджера */}
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Комментарий</div>
                  <textarea className="fi" rows={3} style={{resize:"vertical",minHeight:60,overflowY:"auto"}} placeholder="Заметка для менеджера..." value={estComment} onChange={e=>setEstComment(e.target.value)}/>
                </div>
                <div className="card" style={{padding:14}}>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:7}}>Примечание в КП</div>
                  <textarea className="fi" rows={3} style={{resize:"vertical",minHeight:60,overflowY:"auto"}} placeholder="Доп. условия для клиента..." value={note} onChange={e=>setNote(e.target.value)}/>
                </div>
                <button className="btn btn-g" disabled={kpItems.length===0 || (!canPublishCurrentEstimate && !canExportCurrentEstimate)} onClick={()=>setShowKP(true)}>
                  Сформировать КП
                </button>

                <button className="btn btn-o" onClick={()=>{
                  if(countFilled(rows)===0 || window.confirm("Очистить все позиции этой сметы? Действие можно откатить через «Бэкапы».")){
                    _allowEmptySave.current = true;
                    setRows({});setDiscount(0);setNote("");
                    setTimeout(()=>{ _allowEmptySave.current = false; }, 3000);
                  }
                }}>
                  Сбросить позиции
                </button>
              </div>
            </div>
          </div>

          {/* Плавающая кнопка итога */}
          {screen === "editor" && canEditCurrentEstimate && grand > 0 && (
            <div style={{position:"fixed",bottom:22,right:18,zIndex:50}}>
              <button
                onClick={()=>{
                  const el = document.getElementById("summary-panel");
                  if(el) {
                    const rect = el.getBoundingClientRect();
                    if(rect.top > window.innerHeight*0.8) {
                      el.scrollIntoView({behavior:"smooth",block:"start"});
                    } else {
                      window.scrollTo({top:0,behavior:"smooth"});
                    }
                  }
                }}
                style={{
                  background:"#2563eb",
                  color:"#f3f4f6",border:"none",borderRadius:30,
                  padding:"11px 18px",fontFamily:"inherit",fontWeight:800,
                  fontSize:14,cursor:"pointer",
                  boxShadow:"0 4px 24px rgba(184,144,74,.55)",
                  display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap"
                }}>
                <span>⇅</span>
                <span>{fmt(final)} ₸</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          КП МОДАЛ
      ═══════════════════════════════════════════════════════════════════ */}
      {listBackups !== null && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}} onClick={()=>setListBackups(null)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы {listBackups.label}</div>
              <button onClick={()=>setListBackups(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Снимки перед каждым изменением (последние 20). Можно откатиться к любому.</div>
            {listBackups.items.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Бэкапов пока нет — появятся после первого изменения</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {listBackups.items.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>Записей: {snap.count}{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <button onClick={()=>listBackups.onRestore(snap)}
                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    Восстановить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {backupsModal!==null && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}}
          onClick={()=>setBackupsModal(null)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:520,width:"100%",maxHeight:"80vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы архива</div>
              <button onClick={()=>setBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Снимки архива перед каждой записью (последние 20). <b>«Вернуть недостающие»</b> — добавит только пропавшие сметы, ничего существующего и финансы не тронет. <b>«Восстановить»</b> — откатит весь архив смет к снимку.</div>
            {backupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Бэкапов пока нет</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {backupsModal.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>Смет: {snap.count}{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>recoverMissingFromBackup(snap)}
                      title="Добавить только пропавшие сметы. Существующие сметы и финансы не изменятся."
                      style={{background:"#ecfdf5",color:"#059669",border:"1px solid rgba(5,150,105,.25)",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      Вернуть недостающие
                    </button>
                    <button onClick={()=>restoreBackup(snap)}
                      title="Откатить весь архив смет к этому снимку (существующие сметы заменятся версиями из снимка). Финансы не трогает."
                      style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      Восстановить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Единый бэкап рабочего пространства */}
      {wsBackupsModal!==null && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}}
          onClick={()=>setWsBackupsModal(null)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:520,width:"100%",maxHeight:"80vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы рабочего пространства</div>
              <button onClick={()=>setWsBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Каждый снимок — объекты, сметы, договоры + финансовые операции (последние 30). Восстановление вернёт всё целиком.</div>
            {wsBackupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Снимков пока нет — появятся автоматически после изменений</div>}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {wsBackupsModal.map((snap,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>📦 {snap.counts?.o??(snap.objects?.length||0)} · 📋 {snap.counts?.e??(snap.estimates?.length||0)} · 📄 {snap.counts?.c??(snap.contracts?.length||0)} · 💰 {snap.counts?.f??(snap.financeTx?.length||0)} оп.{snap.by?` · ${snap.by}`:""}{i===0?" · последний":""}</div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>recoverMissingEstimatesFromWs(snap)}
                      title="Добавить только пропавшие сметы из этого снимка. Финансы, объекты и договоры не трогаем."
                      style={{background:"#ecfdf5",color:"#059669",border:"1px solid rgba(5,150,105,.25)",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      Вернуть сметы
                    </button>
                    <button onClick={()=>restoreWorkspace(snap)}
                      title="Восстановить ВСЁ из снимка: объекты, сметы, договоры и финансы. Текущее уйдёт в бэкап."
                      style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      Восстановить всё
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:12,lineHeight:1.5}}><b>«Вернуть сметы»</b> — безопасно: добавит только пропавшие сметы, финансы и остальное не изменятся. <b>«Восстановить всё»</b> — откатит объекты/сметы/договоры/финансы к снимку.</div>
          </div>
        </div>
      )}

      {importModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}}
          onClick={()=>!importBusy && setImportModal(false)}>
          <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:560,width:"100%",maxHeight:"85vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>⬆ Импорт смет из JSON</div>
              <button onClick={()=>!importBusy && setImportModal(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>Вставьте JSON, полученный для восстановления смет. Текущий архив уйдёт в бэкап — откат доступен через «Бэкапы».</div>
            <textarea
              value={importText}
              onChange={e=>setImportText(e.target.value)}
              placeholder='{"customWorks":[...],"estimates":[...]}'
              style={{width:"100%",minHeight:200,resize:"vertical",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontFamily:"monospace",fontSize:12,color:"#0f172a",outline:"none"}}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
              <button onClick={()=>!importBusy && setImportModal(false)}
                style={{background:"#e2e8f0",color:"#64748b",border:"none",cursor:"pointer",padding:"9px 16px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:600}}>Отмена</button>
              <button onClick={runImport} disabled={importBusy||!importText.trim()}
                style={{background:importBusy||!importText.trim()?"#93c5fd":"#2563eb",color:"#fff",border:"none",cursor:importBusy||!importText.trim()?"default":"pointer",padding:"9px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}}>
                {importBusy?"Импорт…":"Импортировать"}</button>
            </div>
          </div>
        </div>
      )}

      {showKP&&(
        <>
          {/* Overlay + modal для экрана */}
          <div className="kp-no-print" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:16}}
            onClick={()=>{ setShowKP(false); setKpLink(""); setKpStat(""); setKpMsg(""); setKpStale(false); }}>
            <div style={{background:"#ffffff",color:"#0f172a",borderRadius:8,padding:"24px 28px",maxWidth:700,width:"100%",maxHeight:"90vh",overflowY:"auto",fontFamily:"'Inter','Segoe UI',sans-serif"}}
              onClick={e=>e.stopPropagation()}>
              <KPContent proj={proj} kpItems={kpItems} fromItems={kpFromItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
              <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20,flexWrap:"wrap"}}>
                <button style={{background:"#e2e8f0",color:"#94a3b8",border:"none",cursor:"pointer",padding:"10px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:600}} onClick={()=>{ setShowKP(false); setKpLink(""); setKpMsg(""); setKpStat(""); setKpStale(false); }}>Закрыть</button>
                {canPublishCurrentEstimate && <button disabled={kpPublishing||!currentId} title="Опубликовать КП и получить ссылку для клиента" style={{background:"#b8904a",color:"#fff",border:"none",cursor:(kpPublishing||!currentId)?"default":"pointer",opacity:!currentId?0.6:1,padding:"10px 18px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}} onClick={async ()=>{
                  if(!currentId){ setKpMsg("Сначала сохраните смету"); return; }
                  setKpPublishing(true); setKpMsg("");
                  try {
                    // сохраняем отметки клиента (просмотры/принятие) при переотправке
                    let prev = {}; try { const pr = await storage.getResult("titovstroy-kp-"+currentId); if (pr.status==="found" && pr.value) prev = JSON.parse(pr.value); } catch {}
                    // Клиент мог принять КП (или открыть его) прямо в это окно, пока мы готовили
                    // снимок — перечитываем ноду ещё раз перед записью, иначе republish затрёт
                    // acceptedAt/viewCount более свежими, чем то, что мы прочитали в prev.
                    try { const pr2 = await storage.getResult("titovstroy-kp-"+currentId); if (pr2.status==="found" && pr2.value) { const fresh = JSON.parse(pr2.value); if ((fresh.viewCount||0) > (prev.viewCount||0) || fresh.acceptedAt) prev = fresh; } } catch {}
                    const snap = { proj, kpItems, fromItems:kpFromItems, discount, discAmt, final, note, publishedAt:Date.now(), viewedAt:prev.viewedAt, viewCount:prev.viewCount, acceptedAt:prev.acceptedAt };
                    const res = await storage.set("titovstroy-kp-"+currentId, JSON.stringify(snap));
                    const link = window.location.origin + window.location.pathname + "#/kp/" + currentId;
                    setKpLink(link);
                    try { await navigator.clipboard.writeText(link); } catch {}
                    setKpMsg(res && res.fbOk===false ? "⚠ Опубликовано локально (облако недоступно)" : "✓ Ссылка скопирована");
                    setKpStale(false);
                    if (prev.viewCount || prev.acceptedAt) setKpStat(kpStatusText(prev));
                  } catch(e) { setKpMsg("Ошибка публикации — проверьте интернет"); }
                  setKpPublishing(false);
                }}>{kpPublishing?"Публикуем…":"🔗 Ссылка клиенту"}</button>}
                {canExportCurrentEstimate && <button style={{background:"#2563eb",color:"#f3f4f6",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:7,fontFamily:"inherit",fontSize:13,fontWeight:700}} onClick={async ()=>{
                const el = document.getElementById("kp-print-portal");
                // Конвертируем /stamp.jpg в base64 чтобы работало в blob-окне
                let stampB64 = "";
                try {
                  const resp = await fetch("/stamp.jpg");
                  const blob = await resp.blob();
                  stampB64 = await new Promise(res => {
                    const r = new FileReader();
                    r.onload = () => res(r.result);
                    r.readAsDataURL(blob);
                  });
                } catch(e) {}
                const css = [
                  "@import url('https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;900&display=swap');",
                  "*{box-sizing:border-box;margin:0;padding:0}",
                  "body{font-family:'Inter','Segoe UI',sans-serif;background:#ffffff;color:#111827;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}",
                  "table{width:100%;border-collapse:collapse}",
                  "@page{margin:8mm;size:A4 portrait}",
                  "@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}}"
                ].join(" ");
                let innerHTML = el.innerHTML;
                if (stampB64) innerHTML = innerHTML.replace(/src="\/stamp\.jpg"/g, `src="${stampB64}"`);
                const docParts = [proj.name, proj.phone, proj.address, today()].filter(Boolean);
                const docTitle = docParts.length ? "КП " + docParts.join(" — ") : "КП TitovStroy";
                const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + docTitle + "</title><style>" + css + "</style></head><body>" + innerHTML + "<div class=\"no-print\" style=\"margin-top:24px;text-align:center\"><button onclick=\"window.print()\" style=\"padding:12px 32px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700;font-family:inherit\">🖨 Сохранить PDF</button></div></body></html>";
                openOrPrintHtml(html, 30000);
              }}>Печать / PDF</button>}
              </div>
              {kpLink && (
                <div style={{marginTop:14,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:12,color:"#059669",fontWeight:700,marginBottom:7}}>{kpMsg||"Ссылка готова"} — отправьте клиенту:</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <input readOnly value={kpLink} onFocus={e=>e.target.select()} style={{flex:1,minWidth:160,border:"1px solid #cbd5e1",borderRadius:6,padding:"8px 10px",fontSize:12,fontFamily:"inherit",color:"#0f172a",background:"#fff"}}/>
                    <a href={"https://wa.me/?text="+encodeURIComponent("Ценовое предложение от TitovStroy: "+kpLink)} target="_blank" rel="noopener" style={{background:"#25D366",color:"#fff",textDecoration:"none",padding:"9px 14px",borderRadius:6,fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>📲 WhatsApp</a>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:9,flexWrap:"wrap"}}>
                    <button onClick={async ()=>{ setKpStat("проверяю…"); try { const r=await storage.getResult("titovstroy-kp-"+currentId); let d={}; try{ if(r.status==="found"&&r.value) d=JSON.parse(r.value); }catch{} setKpStat(kpStatusText(d)); } catch { setKpStat("не удалось проверить"); } }}
                      style={{background:"#fff",border:"1px solid #cbd5e1",borderRadius:6,padding:"7px 12px",fontSize:11.5,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>🔄 Статус у клиента</button>
                    {kpStat && <span style={{fontSize:11.5,color:kpStat.includes("ПРИНЯТО")?"#059669":"#475569",fontWeight:kpStat.includes("ПРИНЯТО")?700:400}}>{kpStat}</span>}
                  </div>
                  {kpStale && <div style={{marginTop:9,background:"#fffbeb",border:"1px solid #fde68a",borderRadius:6,padding:"8px 10px",fontSize:11.5,color:"#b45309",fontWeight:600}}>⚠ Смета изменена после публикации — клиент по ссылке видит старую версию. Нажмите «🔗 Ссылка клиенту», чтобы обновить.</div>}
                  <div style={{fontSize:10.5,color:"#94a3b8",marginTop:7}}>Клиент откроет КП по ссылке и сможет нажать «Принять». При правках сметы опубликуйте заново.</div>
                </div>
              )}
            </div>
          </div>
          {/* Портал для печати — точная копия, отображается только при print */}
          <div id="kp-print-portal" style={{display:"none",fontFamily:"'Inter','Segoe UI',sans-serif",background:"#ffffff",padding:"20px 24px",color:"#0f172a"}}>
            <KPContent proj={proj} kpItems={kpItems} fromItems={kpFromItems} discount={discount} discAmt={discAmt} final={final} note={note}/>
          </div>
        </>
      )}

      {/* ЭКРАН: АНАЛИТИКА */}
      {effScreen === "analytics" && currentPermissions.analytics === "none" && restrictedSection("Аналитика", "сотрудникам с соответствующим правом")}
      {effScreen === "analytics" && currentPermissions.analytics !== "none" && (
        <Suspense fallback={<div className="page" style={{padding:"48px 24px",color:"#64748b"}}>Загрузка аналитики…</div>}>
          <AnalyticsPage runtime={{ analyticsData, currentPermissions, statsPeriod, setStatsPeriod, statsDateFrom, setStatsDateFrom, statsDateTo, setStatsDateTo, statsManager, setStatsManager, hasFinancialDetails, fmt, finProjects, isActiveFinanceProject, financeTx, productions, liveObjects, unifiedStatusOf, currentUser, setCurrentObject, setObjectTab, setScreen, StaleObjectsPanel, objects, DEAL_STATUSES }} />
        </Suspense>
      )}

      {/* ── ЭКРАН: ФИНАНСЫ (независимый учёт ДДС + P&L) ── */}
      {effScreen === "finance" && currentPermissions.finance === "none" && restrictedSection("Финансы")}
      {effScreen === "finance" && currentPermissions.finance !== "none" && (
        <Suspense fallback={<div className="page" style={{padding:"48px 24px",color:"#64748b"}}>Загрузка финансов…</div>}>
          <FinancePage runtime={{
            ASSET_INC_KEYS,
            ASSET_OUT_KEYS,
            BalanceSheet,
            C_ASSET_INC,
            C_ASSET_OUT,
            C_FINACT,
            C_FINANCING_INC,
            C_INVEST,
            FA_SUB_MAP,
            NumInput,
            SearchSelect,
            _finTypeLbl,
            _tng,
            canFinanceCreate,
            canFinanceDeleteRecord,
            canFinanceDirectories,
            canFinanceEditRecord,
            canFinanceExport,
            confirmDangerous,
            confirmTyped,
            contractsRef,
            currentPermissions,
            currentUser,
            downloadCSV,
            finAmtMax,
            finAmtMin,
            finBudgetOfContract,
            finCatOpen,
            finCatSearch,
            finFilterAccount,
            finFilterCat,
            finFilterCategory,
            finFilterContract,
            finFilterType,
            finFrom,
            finImportBusy,
            finPeriod,
            finProjCatFilter,
            finProjModal,
            finProjSearch,
            finProjStatusFilter,
            finProjects,
            finProjectsRef,
            finReadonly,
            finSearch,
            finTo,
            finTxModal,
            finTxProjOpen,
            finTxProjSearch,
            finTxTrash,
            financeContractOf,
            financeMeta,
            financeObjectOf,
            financeProjectViewOf,
            financeTab,
            financeTx,
            financeTxRef,
            genId,
            goBack,
            isCountedFinanceProject,
            linkForContractNo,
            liveObjects,
            logChange,
            navHistory,
            navigate,
            normCN,
            openObjectFromFinance,
            saveFinanceMeta,
            saveFinanceProjects,
            saveFinanceTx,
            setFinAmtMax,
            setFinAmtMin,
            setFinCatOpen,
            setFinCatSearch,
            setFinFilterAccount,
            setFinFilterCat,
            setFinFilterCategory,
            setFinFilterContract,
            setFinFilterType,
            setFinFrom,
            setFinImportBusy,
            setFinPeriod,
            setFinProjCatFilter,
            setFinProjModal,
            setFinProjSearch,
            setFinProjStatusFilter,
            setFinSearch,
            setFinTo,
            setFinTxModal,
            setFinTxProjOpen,
            setFinTxProjSearch,
            setFinTxTrash,
            unifiedStatusOf
          }} />
        </Suspense>
      )}

      {/* ── ТЕСТ: СДЕЛКИ (смета+договор в одной карточке) ── */}
      {effScreen === "objects" && currentPermissions.objects === "none" && restrictedSection("Объекты", "сотрудникам с соответствующим правом")}
      {effScreen === "objects" && currentPermissions.objects !== "none" && (()=>{
        // Данные клиента берём прямо из объекта (inline-поля)
        const objProj = (obj) => ({
          ...EMPTY_PROJ,
          name: obj.clientName || "",
          phone: obj.clientPhone || "",
          address: obj.address || "",
          type: obj.objType || "Вторичка",
          area: obj.area || "",
          manager: obj.manager || currentUser.name,
        });
        // Авто-синхронизация скрытой записи клиента (нужна договорам/PDF). Возвращает clientId.
        // Синхронно возвращает clientId и ОПТИМИСТИЧНО обновляет клиента/объект; записи в облако —
        // в фон. Раньше здесь был await двух сохранений (клиент + объект) ДО возврата, а вызывающий
        // openObjectContract await'ил его ПЕРЕД открытием редактора — при медленном/сбойном облаке
        // редактор не открывался вовсе («кнопка Договор не работает»). Данные устойчивы
        // (localStorage-first + dirty + повтор), поэтому не ждём сеть.
        const ensureObjClient = (obj) => {
          const isYur = obj.clientType==="юр";
          const cdata = { name: obj.clientName||"", phone: obj.clientPhone||"", address: obj.address||"", iin: obj.clientIin||"", doc: obj.clientDoc||"", type: obj.clientType||"физ",
            ...(isYur ? { director: obj.clientDirector||"", directorShort: obj.clientDirectorShort||"", bank: obj.clientBank||"", bik: obj.clientBik||"", account: obj.clientAccount||"", email: obj.clientEmail||"" } : {}) };
          let clientId = obj.clientId;
          const list = clientsRef.current;
          if (clientId && list.find(c=>c.id===clientId)) {
            const next = list.map(c=>c.id===clientId?{...c,...cdata}:c);
            clientsRef.current = next; setContractClients(next);
            saveContractClients(next).catch(e=>console.warn("bg client sync err", e));
          } else {
            clientId = Date.now().toString();
            const next = [...list, { id:clientId, ...cdata, createdAt:Date.now(), createdById:currentUser.id, _fromObject:obj.id }];
            clientsRef.current = next; setContractClients(next);
            saveContractClients(next).catch(e=>console.warn("bg client sync err", e));
            const updObj = {...obj, clientId, updatedAt:Date.now()};
            const nextObjs = objectsRef.current.map(x=>x.id===obj.id?updObj:x);
            objectsRef.current = nextObjs; setObjects(nextObjs);
            saveObjects(nextObjs).catch(e=>console.warn("bg obj sync err", e));
            setCurrentObject(updObj);
          }
          return clientId;
        };

        // Конвертация строк сметы в позиции договора (как кнопка 📄 в разделе Сметы)
        const estToContractWorks = (est) => {
          const catalog = getEffectiveCatalog();
          const mm = 1 + (est.markup||0)/100;
          return Object.entries(est.rows||{}).filter(([,r])=>Number(r?.qty)>0).map(([key,r])=>{
            const w = catalog.find(x=>x.name===key)||catalog.find(x=>x.code===key);
            if(!w) return null;
            const qty = Number(r.qty||0);
            const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
            const rawPrice = r.manualPrice !== undefined && r.manualPrice !== "" ? Number(r.manualPrice) : getPrice(w, qty, r.complexity||"std", cpxPct);
            const price = rawPrice ? rawPrice * mm : null;
            const ew = getEffectiveWork(w);
            const pf = (!price && ew.priceFrom) ? Math.round(ew.priceFrom * mm) : null;
            const displayName = r.manualName !== undefined ? r.manualName : w.name;
            const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (w.unit||"м²");
            return {name:displayName,category:w.cat||"",subcategory:w.sub||"",quantity:qty,unit:displayUnit,price:price?Math.round(price):0,priceFrom:pf||undefined};
          }).filter(Boolean);
        };
        // ── Вспомогательные функции для workspace ──
        const openObjectEstimate = (obj) => {
          if (!accessAllows(currentPermissions.estimateCreate, estimatorObjectIds.has(obj.id))) return;
          const id = genId();
          const cats2 = Object.keys(Gdyn);
          const newEst = {
            id,
            objectId: obj.id,
            proj: objProj(obj),
            rows: {}, discount: 0, markup: 0, note: "", status: "new", comment: "",
            createdAt: Date.now(), createdBy: currentUser.name, updatedAt: Date.now(), updatedBy: currentUser.name, total: 0,
          };
          const newList = [newEst, ...estimatesRef.current];
          estimatesRef.current = newList;
          setEstimates(newList);
          saveEstimates(newList);
          setObjectReturnId(obj.id);
          setCurrentObjectId(obj.id);
          setCurrentParentId(null);
          setCurrentDsNumber(null);
          setCurrentId(id);
          setProj(newEst.proj);
          setRows({});
          setDiscount(0);
          setMarkup(0);
          setNote("");
          setEstStatus("new");
          setEstSentAt("");
          setEstComment("");
          setSearch("");
          setActiveCat(cats2[0]);
          setActiveSub(Object.keys(Gdyn[cats2[0]]||{})[0]);
          setScreen("editor");
        };

        const openObjectEstimateEdit = (est, obj) => {
          if (!accessAllows(currentPermissions.estimateEdit, estimatorObjectIds.has(obj.id))) return;
          setObjectReturnId(obj.id);
          setCurrentObjectId(obj.id);
          const _validParent = est.parentId && est.parentId!==est.id ? est.parentId : null;
          setCurrentParentId(_validParent);
          setCurrentDsNumber(_validParent ? (est.dsNumber||null) : null);
          setCurrentId(est.id);
          // proj синхронизируем из объекта (клиент/адрес ведутся в объекте)
          setProj({...(est.proj||EMPTY_PROJ), ...objProj(obj)});
          setRows(est.rows||{});
          setDiscount(est.discount||0);
          setMarkup(est.markup||0);
          setNote(est.note||"");
          setEstStatus(est.status||"new");
          setEstSentAt(est.sentAt||"");
          setEstComment(est.comment||"");
          setSearch("");
          const cats2 = Object.keys(Gdyn);
          setActiveCat(cats2[0]);
          setActiveSub(Object.keys(Gdyn[cats2[0]]||{})[0]);
          setScreen("editor");
        };

          const openObjectContract = (obj, fromEst=null) => {
            if (!accessAllows(currentPermissions.documentCreate, estimatorObjectIds.has(obj.id))) return;
            const clientId = ensureObjClient(obj); // синхронно (записи в фон) — редактор открывается сразу
          const works = fromEst ? estToContractWorks(fromEst) : [];
          const isDs = !!(fromEst && fromEst.parentId && fromEst.parentId!==fromEst.id);
          const siblings = fromEst ? estimatesRef.current.filter(e=>e.parentId===fromEst.parentId) : [];
          const annexNum = isDs ? (fromEst.dsNumber||1)+1 : 1;
          const parentContract = isDs ? contractsRef.current.find(c=>c.estId===fromEst.parentId && (c.type||"repair_fiz")!=="annex") : null;
          const now = Date.now();
          const newC = {
            id: now.toString(),
            createdAt: now,
            objectId: obj.id,
            number: fromEst && !isDs ? nextContractNumber() : (isDs ? "" : nextContractNumber()),
            date: new Date(now).toISOString().split("T")[0],
            clientId,
            estClient: obj.clientName||"",
            estPhone: obj.clientPhone||"",
            estAddress: obj.address||"",
            contragentId: contragents[0]?.id||"",
            works,
            discount: fromEst?.discount||0,
            appendix: annexNum,
            estId: fromEst?.id||"",
            note: "",
            type: isDs ? "annex" : "repair_fiz",
            ...(isDs && parentContract ? {mainNumber: parentContract.number||"", mainDate: parentContract.date||""} : {}),
            createdBy: currentUser.name,
            createdById: currentUser.id,
          };
          setCurrentContract(newC);
          setObjectReturnId(obj.id);
          setContractTab("editor");
          setScreen("contracts");
        };

        const saveObjField = async (obj, patch) => {
          const ownsObject = estimatorObjectIds.has(obj.id);
          const permissionKey = Object.prototype.hasOwnProperty.call(patch, "status") ? "objectStatus" : "objectEdit";
          if (!accessAllows(currentPermissions[permissionKey], ownsObject)) return;
          const requestedStatus = patch.status || "";
          if (requestedStatus) {
            // Подсветка реагирует на клик немедленно. Это только UI-состояние:
            // подтверждение и повторы по-прежнему проходят через защищённые очереди.
            setPendingObjectStatuses(prev => ({ ...prev, [obj.id]: requestedStatus }));
          }
          // При подписании договора (статус «Заключён») СНАЧАЛА заводим зависимости —
          // проект в Финансах и карточку Производства, и только после их подтверждения
          // меняем статус объекта. Повтор безопасен: обе операции идемпотентны.
          if (patch.status === "signed") {
            // Существование проекта проверяем по СВЕЖИМ данным с сервера, а не по локальному
            // кэшу (finProjectsRef.current): Финансы грузятся в память только у admin/manager,
            // у замерщика/прораба кэш всегда пуст — иначе автосоздание либо тихо не срабатывало
            // (saveFinanceProjects блокировался бы флагом "не загружено"), либо на стухшем
            // кэше можно было бы наплодить дублей проекта.
            try {
              const fpRaw = await storage.getResult(FINANCE_PROJECTS_KEY);
              let projList;
              if (fpRaw.status === "found" && fpRaw.value) { try { const p = JSON.parse(fpRaw.value); projList = Array.isArray(p) ? p : []; } catch { projList = finProjectsRef.current || []; } }
              else if (fpRaw.status === "empty") { projList = []; }
              else { throw new Error("финансовые проекты недоступны"); }
              const exists = projList.some(p => p.objectId === obj.id
                || (p.contractNo && contractsRef.current.some(c => c.objectId === obj.id && normCN(c.number) === normCN(p.contractNo))));
              const dependencyWrites = [];
              if (!exists) {
                const contract = contractsRef.current.find(c => c.objectId === obj.id) || null;
                const estTotal = estimatesForObject(estimates, obj.id).reduce((s, e) => s + (Number(e.total) || 0), 0);
                const draft = finProjDraftFromObject(obj, contract);
                const proj = { ...draft, id: genId(), budget: draft.budget || estTotal || 0 };
                // saveListProtected при блокировке (loadedRef/база недоступна/"пусто поверх")
                // молча возвращает undefined БЕЗ throw — try/catch сам по себе это не ловит,
                // нужно явно проверить результат, иначе статус менялся бы, даже если проект
                // на самом деле не создан.
                dependencyWrites.push(
                  saveFinanceProjects([...projList, proj], { loadedRef: null })
                    .then(fpRes => { if (!fpRes) throw new Error("saveFinanceProjects заблокирован"); }),
                );
              }
              const hasProd = productionsRef.current.some(p => p.objectId === obj.id);
              if (!hasProd) {
                const prod = emptyProduction(obj.id, genId);
                prod.prodStatus = "new";
                // create-if-missing — команда идемпотентна: если карточка уже появилась (гонка),
                // не перезапишет её.
                dependencyWrites.push(
                  mutateProductions({ type: "create-if-missing", objectId: obj.id, record: prod })
                    .then(prodRes => { if (!prodRes.committed) throw new Error("mutateProductions(create) не подтверждён"); }),
                );
              }
              // Финансовый проект и production-карточка независимы, поэтому создаём их
              // параллельно. Это заметно сокращает ожидание статуса «Договор подписан».
              await Promise.all(dependencyWrites);
            } catch (e) {
              console.warn("auto-create finProject/production err", e);
              setPendingObjectStatuses(prev => { const next = { ...prev }; delete next[obj.id]; return next; });
              alert("Не удалось перевести в статус «Договор подписан»: не получилось создать проект в Финансах и карточку Производства (нет связи с базой). Статус НЕ изменён — попробуйте ещё раз.");
              return;
            }
          }
          const updated = {...obj, ...patch, updatedAt: Date.now()};
          // Мгновенно обновляем карточку в UI, не дожидаясь сети — иначе при медленном/просевшем
          // облаке кнопки статуса выглядят «зависшими» (подсветка держится на currentObject,
          // а он раньше обновлялся только ПОСЛЕ полного цикла saveObjects: чтение+мердж+бэкап+запись).
          setCurrentObject(updated);
          const list = objectsRef.current.map(x=>x.id===obj.id?updated:x);
          objectsRef.current = list;
          setObjects(list);
          // Синхронизируем производственный статус: unifiedStatusOf для отображения (списки,
          // фильтры, бейджи) при наличии карточки производства всегда берёт производственный
          // статус, а не obj.status — без этого клик по кнопке нигде визуально не отражался бы.
          let productionWrite = Promise.resolve({ committed: true });
          if (patch.status) {
            const pr = productionsRef.current.find(p => p.objectId === obj.id);
            if (pr) {
              const nextProdStatus = DEAL_TO_PROD[patch.status] || "new";
              if (pr.prodStatus !== nextProdStatus) {
                // set-status — команда трогает ТОЛЬКО prodStatus на свежей карточке (не шлём
                // устаревший полный массив, иначе затёрли бы параллельную правку этапов).
                productionWrite = mutateProductions({ type: "set-status", objectId: obj.id, status: nextProdStatus, changeId: "bg_status_" + obj.id });
              }
            }
          }
          const [objectSaved] = await Promise.all([saveObjects(list), productionWrite]);
          if (!objectSaved) {
            // Guard не разрешил даже локально принять запись (например, исходные данные не
            // загрузились). Возвращаем прежний объект и не создаём ложное ощущение сохранения.
            const rollback = objectsRef.current.map(x=>x.id===obj.id?obj:x);
            objectsRef.current = rollback;
            setObjects(rollback);
            setCurrentObject(obj);
            if (requestedStatus) setPendingObjectStatuses(prev => { const next = { ...prev }; delete next[obj.id]; return next; });
            window.alert("Статус не сохранён: база ещё не готова или недоступна. Обновите страницу и попробуйте снова.");
            return;
          }
          logObjChange(currentUser, obj, patch);
        };

        return (
        <div style={{padding:"20px 16px 90px",minHeight:"100vh"}}>
          {/* Шапка */}
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"22px 26px",marginBottom:20,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
            <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:13,flexWrap:"wrap"}}>
              {objectTab==="workspace" && (
                <button onClick={()=>{ setObjectTab("list"); setCurrentObject(null); }} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:22,lineHeight:1,padding:"0 4px"}}>←</button>
              )}
              <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 3px 12px rgba(37,99,235,.5)"}}>📦</div>
              <div style={{minWidth:0}}>
                <h1 style={{margin:0,fontSize:21,fontWeight:900,color:"#fff",lineHeight:1.1}}>{objectTab==="workspace" && currentObject ? (currentObject.clientName||"Новый объект") : "Объекты"}</h1>
                <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:3}}>{objectTab==="workspace" ? "Карточка объекта · сметы и договора" : "Клиенты, сметы и договора"}</div>
              </div>
              <div style={{flex:1}}/>
              {objectTab==="list" && (currentPermissions.objectCreate !== "none" || currentPermissions.objectDelete !== "none") && (<>
                {(()=>{const trashed=objectsRef.current.filter(o=>o.deletedAt); return trashed.length>0&&(<button onClick={()=>setObjectTab("trash")} style={{background:"rgba(220,38,38,.12)",color:"#dc2626",border:"1px solid rgba(220,38,38,.2)",borderRadius:8,padding:"7px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginRight:4}}>🗑 Корзина ({trashed.length})</button>);})()}
                  {currentPermissions.objectCreate !== "none" && <button className="btn btn-g" style={{fontSize:13,padding:"9px 16px"}} onClick={()=>{
                  const newObj = {id:genId(),clientId:"",clientName:"",clientPhone:"",clientType:"физ",clientIin:"",clientDoc:"",address:"",objType:"Вторичка",area:"",status:"new",note:"",manager:currentUser.name,createdBy:currentUser.name,createdById:currentUser.id,createdAt:Date.now(),updatedAt:Date.now()};
                  // Оптимистично: сразу открываем карточку нового объекта, запись — в фон (раньше был
                  // await saveObjects перед открытием → кнопка подвисала на медленном облаке).
                  const nextList = [newObj, ...objectsRef.current];
                  objectsRef.current = nextList; setObjects(nextList);
                  setCurrentObject(newObj);
                  setObjectTab("workspace");
                    saveObjects(nextList).catch(e=>console.warn("bg save object err", e));
                    writeAudit(currentUser,"создал объект","object",newObj.id,"Новый объект");
                  }}>+ Новый объект</button>}
              </>)}
            </div>
          </div>

          {/* Список объектов */}
          {objectTab==="list" && (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Поиск + сортировка + экспорт */}
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input value={objectSearch} onChange={e=>setObjectSearch(e.target.value)} placeholder="🔍 Поиск по клиенту, телефону, адресу..."
                  style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,flex:1,minWidth:200,boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}/>
                <label style={{display:"flex",alignItems:"center",gap:4,border:"1px solid #e2e8f0",borderRadius:8,padding:"0 6px 0 9px",fontSize:11,fontWeight:600,color:"#94a3b8",background:"#fff",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit"}} title="Дата от">с
                  <input type="date" value={objectDateFrom} onChange={e=>setObjectDateFrom(e.target.value)}
                    style={{border:"none",padding:"8px 0",fontSize:12,outline:"none",fontFamily:"inherit",background:"transparent",color:objectDateFrom?"#0f172a":"#94a3b8"}}/></label>
                <label style={{display:"flex",alignItems:"center",gap:4,border:"1px solid #e2e8f0",borderRadius:8,padding:"0 6px 0 9px",fontSize:11,fontWeight:600,color:"#94a3b8",background:"#fff",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit"}} title="Дата до">по
                  <input type="date" value={objectDateTo} onChange={e=>setObjectDateTo(e.target.value)}
                    style={{border:"none",padding:"8px 0",fontSize:12,outline:"none",fontFamily:"inherit",background:"transparent",color:objectDateTo?"#0f172a":"#94a3b8"}}/></label>
                {(objectDateFrom||objectDateTo) && <button onClick={()=>{setObjectDateFrom("");setObjectDateTo("");}} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:12,cursor:"pointer",color:"#94a3b8",fontFamily:"inherit"}}>✕ дата</button>}
                {currentPermissions.objectExport !== "none" && <button onClick={()=>downloadCSV(
                  "objects_"+new Date().toISOString().slice(0,10)+".csv",
                  ["Статус","Клиент","Телефон","Адрес","Тип","Площадь","Менеджер","Дата создания","Смет (шт)","Сумма смет","Договоров"],
                  filteredObjects.filter(o=>!objectFilterStatus||unifiedStatusOf(o)===objectFilterStatus).map(o=>{
                    const ests=estimates.filter(e=>e.objectId===o.id);
                    const cons=contracts.filter(c=>c.objectId===o.id && !c.deletedAt && c.type!=="podryad" && c.type!=="podryad_annex");
                    const st=DEAL_STATUSES.find(s=>s.key===unifiedStatusOf(o))||DEAL_STATUSES[0];
                    return [st.label,o.clientName||"",o.clientPhone||"",o.address||"",o.objType||"",o.area||"",o.manager||"",o.createdAt?new Date(o.createdAt).toLocaleDateString("ru-RU"):"",ests.length,Math.round(ests.reduce((s,e)=>s+(e.total||0),0)),cons.length];
                  })
                )} title="Экспорт в Excel" style={{background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>⬇ Excel</button>}
                <button onClick={()=>setObjectDateSort(v=>v==="new"?"old":"new")}
                  title={objectDateSort==="new"?"Сначала новые (нажмите для старых)":"Сначала старые (нажмите для новых)"}
                  style={{display:"flex",alignItems:"center",gap:5,border:"1px solid #e2e8f0",background:"#fff",borderRadius:8,padding:"8px 11px",fontSize:12,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
                  <span style={{fontSize:10,color:"#94a3b8"}}>дата</span>
                  <span style={{fontSize:13,color:"#2563eb"}}>{objectDateSort==="new"?"↓":"↑"}</span>
                </button>
              </div>
              {objectAttentionFilter === "stale-approval" && (
                <div style={{display:"flex",alignItems:"center",gap:8,background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:9,padding:"8px 11px",color:"#92400e",fontSize:12,fontWeight:700}}>
                  <span style={{flex:1}}>⚠ Показаны только объекты на согласовании без движения 14+ дней</span>
                  <button onClick={()=>setObjectAttentionFilter("")} style={{background:"#fff",border:"1px solid #fcd34d",borderRadius:7,padding:"4px 9px",color:"#92400e",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Показать все</button>
                </div>
              )}
              {/* Фильтр по статусу */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>setObjectFilterStatus("")}
                  style={{background:!objectFilterStatus?"#2563eb":"rgba(0,0,0,.03)",color:!objectFilterStatus?"#fff":"#94a3b8",border:`1px solid ${!objectFilterStatus?"#2563eb":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все ({liveObjects.length})</button>
                {DEAL_STATUSES.map(s=>{
                  const cnt = liveObjects.filter(o=>unifiedStatusOf(o)===s.key).length;
                  if(!cnt && objectFilterStatus!==s.key) return null;
                  return (
                    <button key={s.key} onClick={()=>setObjectFilterStatus(v=>v===s.key?"":s.key)}
                      style={{background:objectFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:objectFilterStatus===s.key?s.color:"#94a3b8",border:`1px solid ${objectFilterStatus===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      {s.label} {cnt>0&&<span style={{opacity:.6}}>({cnt})</span>}
                    </button>
                  );
                })}
              </div>
              {/* Фильтр по типу объекта */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["","Вторичка","Новостройка","Коммерция"].map(t=>(
                  <button key={t||"all"} onClick={()=>setObjectFilterType(t)}
                    style={{background:objectFilterType===t?"#eff6ff":"rgba(0,0,0,.03)",color:objectFilterType===t?"#2563eb":"#94a3b8",border:`1px solid ${objectFilterType===t?"rgba(37,99,235,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    {t||"Все типы"}
                  </button>
                ))}
              </div>
              {/* Фильтр по сотруднику */}
              {currentPermissions.objects === "all" && nonViewerUsers.length>1 && (
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>setObjectFilterManager("")}
                    style={{background:!objectFilterManager?"#eff6ff":"rgba(0,0,0,.03)",color:!objectFilterManager?"#2563eb":"#94a3b8",border:`1px solid ${!objectFilterManager?"rgba(37,99,235,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все сотрудники</button>
                  {nonViewerUsers.map(u=>(
                    <button key={u.id} onClick={()=>setObjectFilterManager(v=>v===u.name?"":u.name)}
                      style={{background:objectFilterManager===u.name?"#eff6ff":"rgba(0,0,0,.03)",color:objectFilterManager===u.name?"#2563eb":"#94a3b8",border:`1px solid ${objectFilterManager===u.name?"rgba(37,99,235,.4)":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      👤 {u.name}
                    </button>
                  ))}
                </div>
              )}

              {liveObjects.length===0 && (
                <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                  <div style={{fontSize:48,marginBottom:12}}>📦</div>
                  <div style={{fontWeight:700,marginBottom:6}}>Объектов пока нет</div>
                  <div style={{fontSize:12}}>Каждый объект — это папка с клиентом, сметами и договорами</div>
                </div>
              )}

              {/* Плитки объектов — как в «Производстве». Статус единый: производство перевешивает сделку. */}
              {(()=>{
              const usRows = filteredObjects.filter(o=>!objectFilterStatus||unifiedStatusOf(o)===objectFilterStatus);
              // Проекты из Финансов без объекта — тоже показываем (клик = создать объект, с подтверждением)
              const orphanFps = (objectAttentionFilter ? [] : prodEntries.filter(e=>!e.objectId)).filter(e=>{
                const pr = productions.find(p=>p.objectId===e.key);
                const us = PROD_TO_DEAL[pr?.prodStatus||e.prodStatusDefault]||"new";
                if(objectFilterStatus && us!==objectFilterStatus) return false;
                if(objectFilterType||objectFilterManager) return false; // тип/сотрудник у финпроекта не заданы
                const q=(objectSearch||"").toLowerCase().trim();
                if(q && ![e.name,e.address,e.contractNo].some(v=>v&&String(v).toLowerCase().includes(q))) return false;
                return true;
              });
              return (<>
              <div style={{fontSize:12,color:"#94a3b8"}}>Объектов: {usRows.length}{!objectAttentionFilter&&orphanFps.length>0?` · проектов из Финансов без объекта: ${orphanFps.length}`:""}</div>
              {objectAttentionFilter && usRows.length === 0 && (
                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"18px",textAlign:"center",color:"#166534",fontSize:13,fontWeight:700}}>
                  ✓ Сейчас нет объектов без движения 14+ дней
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
              {usRows.map(obj=>{
                const st = DEAL_STATUSES.find(s=>s.key===unifiedStatusOf(obj))||DEAL_STATUSES[0];
                const objEsts = estimates.filter(e=>e.objectId===obj.id);
                const objCons = contracts.filter(c=>c.objectId===obj.id && !c.deletedAt && canSeeDoc(c));
                const objConsClient = objCons.filter(c=>c.type!=="podryad"&&c.type!=="podryad_annex"); // без договоров подряда
                // сумма объекта = все сметы (основная + доп. сметы)
                const total = objEsts.reduce((s,e)=>s+(e.total||0),0);
                // Финансы/производство, если объект уже в работе (те же данные, что в «Производстве»);
                // для лида — тот же блок, но бюджет = сумма смет (карточки везде одинаковые)
                const pe = prodEntries.find(e=>e.objectId===obj.id);
                const pr = productions.find(p=>p.objectId===obj.id);
                const fin = pe || { budget: total, income: 0, expense: 0, debt: total, margin: null, _est: true };
                const sts = pr?.stages||[];
                const doneSt = sts.filter(s=>s.status==="done").length;
                const prog = sts.length?Math.round(doneSt/sts.length*100):0;
                const fill = fin.budget>0?Math.min(100,Math.round(fin.income/fin.budget*100)):0;
                const mCol = fin.margin==null?"#94a3b8":fin.margin>=30?"#059669":fin.margin>=0?"#f59e0b":"#dc2626";
                return (
                  <div key={obj.id} onClick={()=>{ setCurrentObject({...obj}); setObjectTab("workspace"); }}
                    style={{background:"#fff",border:"1px solid #eef2f7",borderRadius:16,cursor:"pointer",boxShadow:"0 1px 3px rgba(15,23,42,.07)",transition:"box-shadow .15s,transform .15s",overflow:"hidden",display:"flex",flexDirection:"column"}}
                    onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.08)";e.currentTarget.style.transform="translateY(-2px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.transform="none";}}>
                    {/* Цветная полоса по статусу */}
                    <div style={{height:4,background:`linear-gradient(90deg,${st.color},${st.color}99)`,flexShrink:0}}/>
                    <div style={{padding:"14px 16px",flex:1,display:"flex",flexDirection:"column"}}>
                      {/* Шапка карточки */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{obj.clientName||<span style={{color:"#94a3b8",fontStyle:"italic",fontWeight:400}}>Без клиента</span>}</div>
                          {obj.clientPhone&&<div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>📞 {obj.clientPhone}</div>}
                          {obj.address&&<div style={{fontSize:11.5,color:"#64748b",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>📍 {obj.address}{obj.area?` · ${obj.area} м²`:""}</div>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                          <span style={{fontSize:10,fontWeight:700,color:st.color,background:st.bg,borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap"}}>{st.label}</span>
                          {accessAllows(currentPermissions.objectDelete, estimatorObjectIds.has(obj.id)) && (
                            <button onClick={e=>{e.stopPropagation(); if(window.confirm("Переместить объект в корзину?")){ saveObjects(objectsRef.current.map(x=>x.id===obj.id?{...x,deletedAt:Date.now()}:x)); logChange(currentUser,{entity:"object",entityId:obj.id,objectId:obj.id,label:_objLabel(obj),action:"удалил объект"}); }}}
                              title="В корзину (можно восстановить)" style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.15)",borderRadius:6,padding:"2px 7px",fontSize:11,cursor:"pointer",fontFamily:"inherit",marginTop:2}}>🗑</button>
                          )}
                        </div>
                      </div>
                      {/* Финансовый блок — единый вид для всех карточек (как в «Производстве»).
                          У лида бюджет = сумма смет (помечено «смета»), оплаты ещё нет.
                          Видно только admin/manager — у остальных ролей нет доступа к финансам вообще. */}
                      {hasFinancialDetails && <div style={{marginBottom:10}}>
                        {fin.budget>0 ? <>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                            <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{fmt(fin.income)} <span style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>из {fmt(fin.budget)} ₸{fin._est?" · смета":""}</span></span>
                            <span style={{fontSize:12,fontWeight:800,color:fill>=100?"#059669":"#2563eb"}}>{fill}%</span>
                          </div>
                          <div style={{height:6,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                            <div style={{width:fill+"%",height:"100%",background:fill>=100?"linear-gradient(90deg,#059669,#34d399)":"linear-gradient(90deg,#2563eb,#60a5fa)",borderRadius:4,transition:"width .3s"}}/>
                          </div>
                        </> : <div><span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{fin.income>0?fmt(fin.income)+" ₸":"—"}</span><span style={{fontSize:10,color:"#94a3b8",marginLeft:7}}>{fin._est?"нет сметы":"бюджет не указан"}</span></div>}
                        <div style={{borderTop:"1px solid #f1f5f9",marginTop:10}}>
                          {[["Долг",fin.debt>0?fmt(fin.debt)+" ₸":"—",fin.debt>0?"#dc2626":"#94a3b8"],
                            ["Расходы",fin.expense>0?fmt(fin.expense)+" ₸":"—",fin.expense>0?"#dc2626":"#94a3b8"]
                          ].map(([l,v,c])=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                              <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</span>
                              <span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:fin.margin==null?"#f8fafc":fin.margin>=30?"#f0fdf4":fin.margin>=0?"#fffbeb":"#fef2f2",borderRadius:10,padding:"8px 12px",marginTop:8}}>
                          <span style={{fontSize:11,fontWeight:700,color:"#475569"}}>Маржа</span>
                          <span style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:14,fontWeight:800,color:mCol}}>{fin.income>0?fmt(fin.income-fin.expense)+" ₸":"—"}</span>
                            {fin.margin!=null&&<span style={{fontSize:10,fontWeight:800,color:"#fff",background:mCol,borderRadius:6,padding:"2px 7px"}}>{fin.margin}%</span>}
                          </span>
                        </div>
                      </div>}
                      {/* Футер (договоры — только клиентские, без подряда) */}
                      <div style={{marginTop:"auto",display:"flex",flexWrap:"wrap",gap:"4px 10px",fontSize:11,color:"#64748b",borderTop:"1px solid #f1f5f9",paddingTop:10}}>
                        <span>📋 {objEsts.length} смет</span>
                        <span>📄 {objConsClient.length} дог.</span>
                        {sts.length>0&&<span>🔨 {doneSt}/{sts.length} эт. · {prog}%</span>}
                        {obj.manager&&<span>👤 {obj.manager}</span>}
                        {obj.createdAt&&<span>📅 {fmtDate(obj.createdAt)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Проекты из Финансов, у которых ещё нет объекта: клик = создать объект (с подтверждением) */}
              {orphanFps.map(e=>{
                const pr = productions.find(p=>p.objectId===e.key);
                const usKey = PROD_TO_DEAL[pr?.prodStatus||e.prodStatusDefault]||"new";
                const st = DEAL_STATUSES.find(s=>s.key===usKey)||DEAL_STATUSES[0];
                const fill = e.budget>0?Math.min(100,Math.round(e.income/e.budget*100)):0;
                const mCol = e.margin==null?"#94a3b8":e.margin>=30?"#059669":e.margin>=0?"#f59e0b":"#dc2626";
                return (
                  <div key={e.key} onClick={()=>{
                      if(!window.confirm(`«${e.name}» — проект из Финансов, объекта у него ещё нет.\nСоздать объект со статусом «${st.label}»?`)) return;
                      const newObj = { id: Date.now().toString(), clientName: e.name||"Проект", clientPhone:"", address: e.address||"", objType:"Вторичка", status: usKey, manager: currentUser.name, createdAt: Date.now(), createdById: currentUser.id, updatedAt: Date.now(), _fromFinProject: e.fpId };
                      saveObjects([...objectsRef.current, newObj]);
                      writeAudit(currentUser,"создал объект из финпроекта","object",newObj.id,newObj.clientName);
                      setCurrentObject(newObj); setObjectTab("workspace");
                    }}
                    style={{background:"#fff",border:"1px dashed #cbd5e1",borderRadius:16,cursor:"pointer",overflow:"hidden",display:"flex",flexDirection:"column"}}>
                    <div style={{height:4,background:`linear-gradient(90deg,${st.color},${st.color}99)`,flexShrink:0}}/>
                    <div style={{padding:"14px 16px",flex:1,display:"flex",flexDirection:"column"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",lineHeight:1.3}}>{e.name}</div>
                          {e.contractNo&&<div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>№{String(e.contractNo).replace(/^№+/,"")}</div>}
                          {e.address&&<div style={{fontSize:11.5,color:"#64748b",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>📍 {e.address}</div>}
                        </div>
                        <span style={{fontSize:10,fontWeight:700,color:st.color,background:st.bg,borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap",flexShrink:0}}>{st.label}</span>
                      </div>
                      {hasFinancialDetails && <div style={{marginBottom:10}}>
                        {e.budget>0 ? <>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                            <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{fmt(e.income)} <span style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>из {fmt(e.budget)} ₸</span></span>
                            <span style={{fontSize:12,fontWeight:800,color:fill>=100?"#059669":"#2563eb"}}>{fill}%</span>
                          </div>
                          <div style={{height:6,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}><div style={{width:fill+"%",height:"100%",background:fill>=100?"linear-gradient(90deg,#059669,#34d399)":"linear-gradient(90deg,#2563eb,#60a5fa)",borderRadius:4}}/></div>
                        </> : <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{e.income>0?fmt(e.income)+" ₸":"—"}</span>}
                        <div style={{borderTop:"1px solid #f1f5f9",marginTop:10}}>
                          {[["Долг",e.debt>0?fmt(e.debt)+" ₸":"—",e.debt>0?"#dc2626":"#94a3b8"],["Расходы",e.expense>0?fmt(e.expense)+" ₸":"—",e.expense>0?"#dc2626":"#94a3b8"]].map(([l,v,c])=>(
                            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                              <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</span><span style={{fontSize:13,fontWeight:700,color:c}}>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:e.margin==null?"#f8fafc":e.margin>=30?"#f0fdf4":e.margin>=0?"#fffbeb":"#fef2f2",borderRadius:10,padding:"8px 12px",marginTop:8}}>
                          <span style={{fontSize:11,fontWeight:700,color:"#475569"}}>Маржа</span>
                          <span style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:14,fontWeight:800,color:mCol}}>{e.income>0?fmt(e.income-e.expense)+" ₸":"—"}</span>
                            {e.margin!=null&&<span style={{fontSize:10,fontWeight:800,color:"#fff",background:mCol,borderRadius:6,padding:"2px 7px"}}>{e.margin}%</span>}
                          </span>
                        </div>
                      </div>}
                      <div style={{marginTop:"auto",display:"flex",flexWrap:"wrap",gap:"4px 10px",fontSize:11,color:"#64748b",borderTop:"1px solid #f1f5f9",paddingTop:10}}>
                        <span>💼 проект из Финансов</span>
                        <span style={{color:"#2563eb",fontWeight:700}}>+ создать объект</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
              </>);
              })()}
            </div>
          )}

          {/* Workspace объекта */}
          {objectTab==="trash" && (()=>{
            const trashed = objectsRef.current.filter(o=>o.deletedAt).sort((a,b)=>b.deletedAt-a.deletedAt);
            const KEEP_MS = 30*24*60*60*1000;
            return (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <button onClick={()=>setObjectTab("list")} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 14px",fontSize:13,cursor:"pointer",color:"#64748b",fontFamily:"inherit"}}>← Назад</button>
                  <span style={{fontSize:13,color:"#94a3b8"}}>Объекты в корзине · хранятся 30 дней</span>
                </div>
                {trashed.length===0 && <div style={{textAlign:"center",color:"#94a3b8",padding:"60px 0",fontSize:14}}>Корзина пуста</div>}
                {trashed.map(obj=>{
                  const daysLeft = Math.max(0,Math.ceil((KEEP_MS-(Date.now()-(obj.deletedAt||0)))/86400000));
                  return (
                    <div key={obj.id} style={{background:"#fff",border:"1px solid #fecaca",borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                      <div style={{flex:1,minWidth:160}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{obj.clientName||"Без имени"}</div>
                        <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{obj.address||""} · удалён {new Date(obj.deletedAt||0).toLocaleDateString("ru-RU")}</div>
                        <div style={{fontSize:11,color:daysLeft<=5?"#dc2626":"#f59e0b",marginTop:2,fontWeight:600}}>{daysLeft>0?`Осталось ${daysLeft} дн. до окончательного удаления`:"Истёк срок хранения"}</div>
                      </div>
                      {accessAllows(currentPermissions.objectDelete, estimatorObjectIds.has(obj.id)) && <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>saveObjects(objectsRef.current.map(x=>x.id===obj.id?{...x,deletedAt:undefined}:x))}
                          style={{background:"#f0fdf4",color:"#059669",border:"1px solid #bbf7d0",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↩ Восстановить</button>
                        {currentUser.role==="admin" && <button onClick={async ()=>{if(await confirmTyped("Удалить объект безвозвратно?")){ const nl=objectsRef.current.filter(x=>x.id!==obj.id); objectsRef.current=nl; setObjects(nl); saveObjects(nl,{removedIds:[obj.id],allowEmpty:true}).catch(e=>console.warn("bg obj del",e)); }}}
                          style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.2)",borderRadius:8,padding:"7px 12px",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✕ Удалить</button>}
                      </div>}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {objectTab==="workspace" && currentObject && (()=>{
            const obj = currentObject;
            const _allEsts = estimates.filter(e=>e.objectId===obj.id);
            const _allCons = contracts.filter(c=>c.objectId===obj.id && !c.deletedAt && canSeeDoc(c));
            // Дерево смет: основная смета → под ней доп. сметы (ДС). parentId===id (битая ссылка) трактуем как основную.
            const _estIsMain = (e) => !e.parentId || e.parentId===e.id;
            const _estMains = _allEsts.filter(_estIsMain).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
            const objEsts = [];
            _estMains.forEach(m=>{
              objEsts.push(m);
              _allEsts.filter(e=>!_estIsMain(e) && e.parentId===m.id).sort((a,b)=>(a.dsNumber||0)-(b.dsNumber||0)).forEach(ch=>objEsts.push(ch));
            });
            // осиротевшие ДС (родитель удалён) — показываем в конце
            _allEsts.filter(e=>!_estIsMain(e) && !_estMains.some(m=>m.id===e.parentId)).forEach(ch=>objEsts.push(ch));
            // Дерево договоров: основной договор → под ним доп. соглашения (приложения)
            // Приложения (в т.ч. к договорам подряда) идут детьми под своим договором
            const _conIsChild = c => c.type==="annex" || c.type==="podryad_annex";
            const _conMains = _allCons.filter(c=>!_conIsChild(c)).sort((a,b)=>(b.id||0)-(a.id||0));
            const objCons = [];
            _conMains.forEach(m=>{
              objCons.push(m);
              _allCons.filter(c=>_conIsChild(c) && c.mainNumber && normCN(c.mainNumber)===normCN(m.number)).sort((a,b)=>(a.appendix||0)-(b.appendix||0)).forEach(ch=>objCons.push(ch));
            });
            _allCons.filter(c=>_conIsChild(c) && !(c.mainNumber && _conMains.some(m=>normCN(m.number)===normCN(c.mainNumber)))).forEach(ch=>objCons.push(ch));
            const canEdit = editorTab && accessAllows(currentPermissions.objectEdit, estimatorObjectIds.has(obj.id));
            const canChangeStatus = editorTab && accessAllows(currentPermissions.objectStatus, estimatorObjectIds.has(obj.id));
            const canAssignObject = editorTab && accessAllows(currentPermissions.objectAssign, estimatorObjectIds.has(obj.id));
            // Текст печатаем локально (отзывчиво), сохраняем на blur. Синхронизируем скрытую запись клиента.
            const setObjLocal = (patch) => setCurrentObject(p=>({...p,...patch}));
            const persistObj = () => setCurrentObject(p=>{
              const savedObj = objectsRef.current.find(x=>x.id===p.id);
              const allowedPatch = buildAuthorizedObjectPatch(savedObj, p, {
                canEdit,
                canAssign: canAssignObject,
              });
              if (!savedObj || Object.keys(allowedPatch).length === 0) return p;
              const nextDraft = { ...savedObj, ...allowedPatch };
              const clientFields = ["clientName","clientPhone","clientType","clientIin","clientDoc","clientDirector","clientDirectorShort","clientEmail","clientBank","clientBik","clientAccount","address"];
              const clientChanged = canEdit && clientFields.some(key => Object.prototype.hasOwnProperty.call(allowedPatch, key));
              const isYurP = nextDraft.clientType==="юр";
              const cdata = { name:nextDraft.clientName||"", phone:nextDraft.clientPhone||"", address:nextDraft.address||"", iin:nextDraft.clientIin||"", doc:nextDraft.clientDoc||"", type:nextDraft.clientType||"физ",
                ...(isYurP ? { director:nextDraft.clientDirector||"", directorShort:nextDraft.clientDirectorShort||"", bank:nextDraft.clientBank||"", bik:nextDraft.clientBik||"", account:nextDraft.clientAccount||"", email:nextDraft.clientEmail||"" } : {}) };
              let clientId = nextDraft.clientId;
              const cl = clientId && clientsRef.current.find(c=>c.id===clientId);
              if (clientChanged && cl) {
                // обновляем связанную запись клиента
                saveContractClients(clientsRef.current.map(c=>c.id===clientId?{...c,...cdata}:c));
              } else if (clientChanged && (nextDraft.clientName||"").trim()) {
                // имя введено, но клиент не связан — создаём запись (появится в списке, нужна договорам)
                clientId = Date.now().toString();
                saveContractClients([...clientsRef.current, { id:clientId, ...cdata, createdAt:Date.now(), createdById:currentUser.id, _fromObject:nextDraft.id }]);
              }
              const upd = {...nextDraft, clientId: clientId||"", updatedAt: Date.now()};
              saveObjects(objectsRef.current.map(x=>x.id===nextDraft.id?upd:x));
              return upd;
            });

            const clientCardNode = (
                <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10,boxSizing:"border-box"}}>
                  {/* Статус — подсветка по unifiedStatusOf (тому же, что видно в списках/финпроектах),
                      а не по сырому obj.status: иначе на старых объектах, где производство хранит
                      другой реальный статус, кнопка подсвечивала одно, а везде снаружи было видно
                      другое — визуально «два разных статуса у одного объекта». */}
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {(()=>{ const curStatus = unifiedStatusOf(obj); return DEAL_STATUSES.map(s=>{
                        const isCur = curStatus===s.key;
                        // «Договор подписан» — важный статус: авто-создаёт финпроект + карточку
                        // производства. Выделяем его (зелёная рамка/иконка ✍️) и требуем подтверждение.
                        const isSigned = s.key==="signed";
                        const onClickStatus = () => {
                          if (isSigned && !isCur) {
                            const hasFp = finProjectsRef.current.some(p=>p.objectId===obj.id) || productionsRef.current.some(p=>p.objectId===obj.id);
                            const msg = hasFp
                              ? "Перевести объект в статус «Договор подписан»?"
                              : "Перевести объект в статус «Договор подписан»?\n\nБудут созданы финансовый проект (раздел «Финансы») и карточка производства для этого объекта.";
                            if (!window.confirm(msg)) return;
                          }
                          saveObjField(obj,{status:s.key});
                        };
                        return (
                        <button key={s.key} disabled={!canChangeStatus} onClick={onClickStatus}
                          title={isSigned?"Важный статус: создаёт финансовый проект и карточку производства":undefined}
                          style={{background:isCur?s.bg:(isSigned?"rgba(5,150,105,.06)":"rgba(0,0,0,.03)"),color:isCur?s.color:(isSigned?"#059669":"#94a3b8"),border:`${isSigned?2:1}px solid ${isCur?s.color:(isSigned?"#34d399":"#e2e8f0")}`,borderRadius:8,padding:isSigned?"3px 10px":"3px 9px",fontSize:11,fontWeight:isSigned?800:600,cursor:canChangeStatus?"pointer":"default",fontFamily:"inherit",transition:"all .12s",opacity:canChangeStatus?1:.65}}>
                          {isSigned?"✍️ ":""}{s.label}
                      </button>
                      );
                    }); })()}
                  </div>

                  {/* Сводка клиента/объекта + сворачивание */}
                  <div onClick={()=>setObjInfoCollapsed(v=>!v)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"2px 0",userSelect:"none"}}>
                    <span style={{fontSize:11,color:"#2563eb",fontWeight:700,letterSpacing:.5,textTransform:"uppercase"}}>👤 Клиент и объект</span>
                    {objInfoCollapsed && (
                      <span style={{fontSize:12,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                        {[obj.clientName, obj.clientPhone, obj.address].filter(Boolean).join(" · ")||"не заполнено"}
                      </span>
                    )}
                    <span style={{marginLeft:objInfoCollapsed?0:"auto",fontSize:12,color:"#94a3b8",fontWeight:600}}>{objInfoCollapsed?"▼ развернуть":"▲ свернуть"}</span>
                  </div>

                  {/* Клиент + Объект — одна сетка */}
                  {!objInfoCollapsed && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.clientName||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientName:e.target.value})} onBlur={persistObj}
                        placeholder="ФИО / Название" />
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.clientPhone||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientPhone:e.target.value})} onBlur={persistObj}
                        placeholder="Телефон" />
                    </div>
                    <div>
                      <select className="fi" style={{fontSize:12}} value={obj.clientType||"физ"} disabled={!canEdit}
                        onChange={e=>{ setObjLocal({clientType:e.target.value}); setTimeout(persistObj,0); }}>
                        <option value="физ">Физ. лицо</option>
                        <option value="юр">Юр. лицо</option>
                      </select>
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.clientIin||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientIin:e.target.value})} onBlur={persistObj}
                        placeholder={obj.clientType==="юр"?"БИН":"ИИН"} />
                    </div>
                    <div style={{gridColumn:"2 / -1"}}>
                      <input className="fi" style={{fontSize:12}} value={obj.clientDoc||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({clientDoc:e.target.value})} onBlur={persistObj}
                        placeholder={obj.clientType==="юр"?"Устав / доверенность":"Документ (уд. личности №...)"} />
                    </div>
                    {obj.clientType==="юр" && (<>
                      <div style={{gridColumn:"1 / -1"}}>
                        <input className="fi" style={{fontSize:12}} value={obj.clientDirector||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientDirector:e.target.value})} onBlur={persistObj}
                          placeholder="Директор (полностью, напр. Иванов Иван Иванович)" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientDirectorShort||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientDirectorShort:e.target.value})} onBlur={persistObj}
                          placeholder="Директор кратко (Иванов И.И.)" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientEmail||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientEmail:e.target.value})} onBlur={persistObj}
                          placeholder="Email" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientBank||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientBank:e.target.value})} onBlur={persistObj}
                          placeholder="Банк" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientBik||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientBik:e.target.value})} onBlur={persistObj}
                          placeholder="БИК" />
                      </div>
                      <div>
                        <input className="fi" style={{fontSize:12}} value={obj.clientAccount||""} readOnly={!canEdit}
                          onChange={e=>setObjLocal({clientAccount:e.target.value})} onBlur={persistObj}
                          placeholder="ИИК (расчётный счёт)" />
                      </div>
                    </>)}
                    <div style={{gridColumn:"1 / -1"}}>
                      <input className="fi" style={{fontSize:12}} value={obj.address||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({address:e.target.value})} onBlur={persistObj}
                        placeholder="📍 Адрес объекта" />
                    </div>
                    <div>
                      <select className="fi" style={{fontSize:12}} value={obj.objType||"Вторичка"} disabled={!canEdit}
                        onChange={e=>{ setObjLocal({objType:e.target.value}); setTimeout(persistObj,0); }}>
                        {["Вторичка","Новостройка","Коммерция","Частный дом","Другое"].map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.area||""} readOnly={!canEdit} type="number"
                        onChange={e=>setObjLocal({area:e.target.value})} onBlur={persistObj}
                        placeholder="Площадь, м²" />
                    </div>
                    <div>
                      <input className="fi" style={{fontSize:12}} value={obj.manager||""} readOnly={!canAssignObject}
                        onChange={e=>setObjLocal({manager:e.target.value})} onBlur={persistObj}
                        placeholder="Менеджер" />
                    </div>
                    <div style={{gridColumn:"1 / -1"}}>
                      <textarea className="fi" rows={2} style={{fontSize:12,resize:"vertical",minHeight:44}} value={obj.note||""} readOnly={!canEdit}
                        onChange={e=>setObjLocal({note:e.target.value})} onBlur={persistObj}
                        placeholder="Заметка..." />
                    </div>
                  </div>
                  )}
                </div>
            );

            return (
              <div>
                {/* Вкладки карточки объекта: Информация · Сметы · Документы · производство */}
                <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap",borderBottom:"1px solid #e2e8f0"}}>
                  {[
                    ["info","ℹ️ Информация"],
                    ["documents",`📄 Документы (${objEsts.length+objCons.length+reports.filter(r=>r.objectId===obj.id && canSeeReport(r)).length})`],
                    ["launch","🚀 Запуск"],
                    ["stages","🔨 Этапы"],
                    ["finance","💰 Финансы"],
                    ["journal","📖 Журнал"],
                    ["defects","⚠️ Замечания"],
                    ["handover","🏁 Сдача"],
                    ...(_isAdmin ? [["changes","🧾 Изменения"]] : []),
                  ].filter(([k]) => {
                    if (k === "documents") {
                      return currentPermissions.showLocked
                        || currentPermissions.estimates !== "none"
                        || currentPermissions.documents !== "none";
                    }
                    if (["launch","stages","journal","defects","handover"].includes(k)) {
                      return currentPermissions.showLocked || currentPermissions.production !== "none";
                    }
                    return true;
                  }).map(([k,l])=>(
                    <button key={k} onClick={()=>setObjWsTab(k)}
                      style={{background:objWsTab===k?"#fff":"transparent",border:"1px solid",borderColor:objWsTab===k?"#e2e8f0":"transparent",borderBottom:objWsTab===k?"1px solid #fff":"1px solid transparent",marginBottom:-1,borderRadius:"10px 10px 0 0",padding:"9px 14px",fontSize:13,fontWeight:objWsTab===k?700:500,color:objWsTab===k?"#0f172a":"#64748b",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      {l}
                    </button>
                  ))}
                </div>

                {objWsTab==="documents" && currentPermissions.estimates !== "none" && (
                <div style={{marginTop:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📋 Сметы ({objEsts.length})</div>
                    {accessAllows(currentPermissions.estimateCreate, estimatorObjectIds.has(obj.id)) && (
                      <button className="btn btn-g" style={{fontSize:12,padding:"6px 14px"}} onClick={()=>openObjectEstimate(obj)}>+ Новая смета</button>
                    )}
                  </div>
                  {objEsts.length===0 && (
                    <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
                      Смет пока нет — нажмите «+ Новая смета»
                    </div>
                  )}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {objEsts.map((est,estIdx)=>{
                      const isChild = !_estIsMain(est);
                      const canEditEstimate = accessAllows(currentPermissions.estimateEdit, estimatorObjectIds.has(obj.id));
                      const canCreateEstimate = accessAllows(currentPermissions.estimateCreate, estimatorObjectIds.has(obj.id));
                      const canDeleteEstimateHere = accessAllows(currentPermissions.estimateDelete, estimatorObjectIds.has(obj.id));
                      const canCreateDocument = accessAllows(currentPermissions.documentCreate, estimatorObjectIds.has(obj.id));
                      const estNum = isChild ? (est.dsNumber||1)+1 : 1;
                      const posCount = Object.values(est.rows||{}).filter(r=>Number(r?.qty)>0).length;
                      const stEst = STATUSES.find(s=>s.key===(est.status||"new"))||STATUSES[0];
                      return (
                        <div key={est.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",cursor:canEditEstimate?"pointer":"default",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #d1fae5":"1px solid #e5e7eb"}}
                          onClick={canEditEstimate?()=>openObjectEstimateEdit(est, obj):undefined}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                <span style={{fontSize:10,fontWeight:700,color:isChild?"#059669":"#2563eb",background:isChild?"rgba(5,150,105,.08)":"#eff6ff",borderRadius:3,padding:"1px 6px"}}>Смета {estNum}</span>
                                <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{est.proj?.name||obj.clientName||obj.address||"Новая смета"}</span>
                                <span style={{fontSize:10,fontWeight:700,color:stEst.color,background:stEst.bg,borderRadius:4,padding:"1px 6px"}}>{stEst.label}</span>
                              </div>
                              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                {posCount} позиций · {new Date(est.updatedAt||est.createdAt||0).toLocaleDateString("ru-RU")}
                                {est.createdBy&&` · ${est.createdBy}`}
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{fmt(est.total||0)} ₸</div>
                              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                                {canCreateDocument && <button title={isChild?"Создать доп. соглашение из этой доп. сметы":"Создать договор из сметы"} onClick={()=>openObjectContract(obj,est)}
                                  style={{background:"rgba(184,144,74,.08)",color:"#2563eb",border:"1px solid #eff6ff",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📄 {isChild?"Доп. соглашение":"Договор"}</button>
                                }
                                {canCreateDocument && (
                                  <button title="Сформировать акт выполненных работ (Р-1) по этой смете" onClick={()=>openAvrBuilder(obj,est)}
                                    style={{background:"rgba(124,58,237,.08)",color:"#7c3aed",border:"1px solid rgba(124,58,237,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>📋 Акт</button>
                                )}
                                {canCreateDocument && !_isUser && !isChild && (
                                  <button title="Договор подряда с подрядчиком (работы из этой сметы, суммы редактируются). Подрядчика и «новый договор / приложение» выбираешь в редакторе." onClick={()=>{
                                    const ws = estimateToWorks(est);
                                    const podCount = contractsRef.current.filter(c=>c.type==="podryad").length;
                                    const now = Date.now();
                                    setObjectReturnId(obj.id);
                                    setCurrentContract({id:now.toString(),createdAt:now,type:"podryad",number:String(1012+podCount),date:new Date(now).toISOString().slice(0,10),city:"Караганда",clientId:"",contragentId:contragentsRef.current[0]?.id||"",works:ws,objectId:obj.id,objectAddress:obj.address||"",appendix:1,note:"",createdBy:currentUser.name,createdById:currentUser.id});
                                    setContractTab("editor"); setScreen("contracts");
                                  }}
                                    style={{background:"rgba(124,58,237,.08)",color:"#7c3aed",border:"1px solid rgba(124,58,237,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>👷 Подряд</button>
                                )}
                                {canCreateEstimate && !isChild && (
                                  <button title="Создать доп. смету к этой смете" onClick={()=>{ setObjectReturnId(obj.id); newSupplementaryEstimate(est); }}
                                    style={{background:"rgba(5,150,105,.08)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>+ Доп. смета</button>
                                )}
                                {canCreateEstimate && (
                                  <button title="Дублировать" onClick={()=>duplicateEstimate(est)}
                                    style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(100,100,200,.15)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>⧉</button>
                                )}
                                {canDeleteEstimateHere && (
                                  <button title="Удалить смету" onClick={async ()=>{ if(await confirmTyped("Удалить смету?\nЭто действие нельзя отменить.")) deleteEstimate(est.id); }}
                                    style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {objWsTab==="documents" && currentPermissions.documents !== "none" && (<>
                {/* Договоры объекта (включая договоры подряда, созданные в рамках объекта) */}
                <div style={{marginTop:24}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📄 Договоры ({objCons.length})</div>
                  </div>
                  {objCons.length===0 && (
                    <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
                      Договоров пока нет<br/>
                      <span style={{fontSize:11,color:"#d1d5db"}}>Создайте смету выше и нажмите <b>📄</b> на её карточке — договор сформируется со всеми позициями</span>
                    </div>
                  )}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {(()=>{
                      // Приложения идут СРАЗУ под своим договором. Подряд — только под договором подряда,
                      // ремонт/дизайн — только под своим (приложение подряда НЕ попадает под договор ремонта).
                      const _normNum = s => String(s||"").trim().toLowerCase().replace(/[\s№#]/g,"");
                      const _isChildC = c => c.type==="annex"||c.type==="design_add"||c.type==="podryad_annex";
                      const _isPodC = c => c.type==="podryad"||c.type==="podryad_annex";
                      const _rootsC = objCons.filter(c=>!_isChildC(c));
                      const _findParent = ch => {
                        const fam = _rootsC.filter(p=>_isPodC(p)===_isPodC(ch)); // та же «семья» (подряд/не подряд)
                        if(ch.mainNumber){ const m=fam.find(p=>_normNum(p.number)===_normNum(ch.mainNumber)); if(m) return m; }
                        return fam.length===1 ? fam[0] : null; // если родитель один — привязываем к нему
                      };
                      const _kids = {}; const _claimed = new Set();
                      objCons.forEach(c=>{ if(_isChildC(c)){ const p=_findParent(c); if(p){ (_kids[p.id]||(_kids[p.id]=[])).push(c); _claimed.add(c.id); } } });
                      Object.values(_kids).forEach(a=>a.sort((x,y)=>(x.appendix||0)-(y.appendix||0)));
                      const _ordered = [];
                      _rootsC.forEach(p=>{ _ordered.push(p); (_kids[p.id]||[]).forEach(ch=>_ordered.push(ch)); });
                      objCons.forEach(c=>{ if(_isChildC(c) && !_claimed.has(c.id)) _ordered.push(c); }); // сироты — в конец
                      return _ordered.map(c=>{
                      const cl2 = contractClients.find(x=>x.id===c.clientId);
                      const ca2 = contragents.find(x=>x.id===c.contragentId);
                      const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                      const stC = CONTRACT_STATUSES.find(x=>x.key===(c.contractStatus||"draft"))||CONTRACT_STATUSES[0];
                      const TLABEL = {repair_fiz:"Договор ремонта",annex:"Доп. соглашение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронь",podryad:"👷 Договор подряда"};
                      const isAnnex = c.type==="annex" || c.type==="podryad_annex";
                      const conTitle = isAnnex
                        ? `${c.type==="podryad_annex"?"Приложение":"Доп. соглашение"} №${c.appendix||2}`+(c.mainNumber?` к договору №${c.mainNumber}`:"")
                        : `${TLABEL[c.type||"repair_fiz"]||"Договор"} №${c.number||"б/н"}`;
                      const _isPod = c.type==="podryad"||c.type==="podryad_annex";
                      const _workerName = _isPod ? ((workers.find(w=>w.id===c.workerId)?.name)||c.worker?.name||"") : "";
                      // Замерщику подряд виден, но открывать нельзя (себестоимость)
                      const _podLocked = currentPermissions.documentEdit==="none" || (_isUser && _isPod);
                      return (
                        <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",cursor:_podLocked?"default":"pointer",transition:"all .12s",marginLeft:isAnnex?16:0,borderLeft:isAnnex?"3px solid #ede9fe":"1px solid #e5e7eb",opacity:_podLocked?.75:1}}
                          onClick={_podLocked?undefined:()=>{ setCurrentContract({...c}); setObjectReturnId(obj.id); setContractTab("editor"); setScreen("contracts"); }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                {isAnnex && <span style={{fontSize:10,fontWeight:700,color:"#7c3aed",background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>{c.type==="podryad_annex"?"Прил. подряда":"Доп. согл."}</span>}
                                <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>{conTitle}</span>
                                {_podLocked && <span title="Доступ закрыт" style={{fontSize:11}}>🔒</span>}
                                <span style={{fontSize:10,fontWeight:700,color:stC.color,background:stC.bg,borderRadius:4,padding:"1px 6px"}}>{stC.label}</span>
                              </div>
                              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                {_isPod ? (_workerName ? `🔨 ${_workerName}` : "Подрядчик не выбран") : (cl2?.name||c.estClient||"Клиент не выбран")} · {new Date(c.date||Date.now()).toLocaleDateString("ru-RU")} · {(c.works||[]).length} позиций
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{fmt(total)} ₸</div>
                              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                                {accessAllows(currentPermissions.documentExport, estimatorObjectIds.has(obj.id)) && !_podLocked && <button onClick={()=>generateContractPdf(c,cl2,ca2)}
                                  style={{background:"#e2e8f0",color:"#334155",border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>}
                                {accessAllows(currentPermissions.documentExport, estimatorObjectIds.has(obj.id)) && !_podLocked && <button onClick={()=>generateContractGDoc(c,cl2,ca2)}
                                  style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📋 GDoc</button>}
                                {documentSnapshotsById.has(`contract:${c.id}`) && accessAllows(currentPermissions.documentInstanceEdit, estimatorObjectIds.has(obj.id)) && !_podLocked && <button onClick={()=>openDocumentInstance(c)}
                                  style={{background:"#f8fafc",color:"#475569",border:"1px solid #cbd5e1",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✎ Экземпляр</button>}
                                {currentUser.role==="admin" && c.type!=="podryad" && c.type!=="podryad_annex" && (()=>{
                                  const main = mainContractOf(c);
                                  const exists = finProjectsRef.current.find(p=>normCN(p.contractNo)===normCN(main?.number));
                                  const isAnx = c.type==="annex";
                                  return <button onClick={()=>startFinProjFromObject(obj,c)}
                                    title={isAnx ? (exists?"Обновить проект основного договора (учесть доп. соглашение)":"Завести проект по основному договору (с учётом доп. соглашения)") : (exists?"Открыть проект в финансах":"Завести проект в финансах")}
                                    style={{background:exists?"#f0fdf4":"rgba(5,150,105,.1)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💰 {isAnx ? (exists?"В проект ✓":"В проект") : (exists?"В финансах ✓":"В финансы")}</button>;
                                })()}
                                  {accessAllows(currentPermissions.documentDelete, estimatorObjectIds.has(obj.id)) && (
                                    <button onClick={async ()=>{ if(await confirmTyped("Удалить договор?\nЭто действие нельзя отменить через интерфейс.")){ const nl=contractsRef.current.filter(x=>x.id!==c.id); contractsRef.current=nl; setContracts(nl); saveContracts(nl,{removedIds:[c.id],allowEmpty:true}).catch(e=>console.warn("bg contract del",e)); } }}
                                    style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                    })()}
                  </div>
                </div>

                {/* Отчёты объекта (АВР, форма Р-1) */}
                {(()=>{
                  const objReports = reports.filter(r=>r.objectId===obj.id && canSeeReport(r)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
                  return (
                    <div style={{marginTop:24}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📑 Отчёты ({objReports.length})</div>
                        {accessAllows(currentPermissions.documentCreate, estimatorObjectIds.has(obj.id)) && (
                          <button className="btn btn-g" style={{fontSize:12,padding:"6px 14px"}}
                            onClick={()=>{ if(objEsts.length===0){ alert("Сначала создайте смету — акт формируется из её позиций."); return; } openAvrBuilderAll(obj,objEsts); }}>
                            + Сформировать АВР
                          </button>
                        )}
                      </div>
                      {objReports.length===0 && (
                        <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",background:"#f9fafb",borderRadius:8,border:"1px dashed #e5e7eb",fontSize:13}}>
                          Отчётов пока нет<br/>
                          <span style={{fontSize:11,color:"#d1d5db"}}>Нажмите <b>📋 Акт</b> на карточке сметы или «+ Сформировать АВР» — выберите работы и распечатайте акт по форме Р-1</span>
                        </div>
                      )}
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {objReports.map(r=>(
                          <div key={r.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",borderLeft:"3px solid #ede9fe"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                              <div style={{minWidth:0,flex:1}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                  <span style={{fontSize:10,fontWeight:700,color:"#7c3aed",background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>АВР · Р-1</span>
                                  <span style={{fontWeight:600,fontSize:13,color:"#0f172a"}}>Акт №{r.actNo||"б/н"}</span>
                                </div>
                                <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                  {new Date(r.actDate||r.createdAt||0).toLocaleDateString("ru-RU")}
                                  {r.contractNo?` · договор №${r.contractNo}`:""} · {(r.lines||[]).length} позиций
                                  {r.createdBy?` · ${r.createdBy}`:""}
                                </div>
                              </div>
                              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                                <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{fmt(r.total||0)} ₸</div>
                                <div style={{display:"flex",gap:4}}>
                                  {accessAllows(currentPermissions.documentExport, estimatorObjectIds.has(obj.id)) && <button title="Печать / PDF" onClick={()=>runReportExport("pdf", r)}
                                    style={{background:"#e2e8f0",color:"#334155",border:"1px solid #e2e8f0",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🖨 Печать</button>
                                  }
                                  {accessAllows(currentPermissions.estimateCreate, estimatorObjectIds.has(obj.id)) && !(r.estId && estimates.some(e=>e.id===r.estId)) && (
                                    <button title="Восстановить смету из этого акта (если исходная смета пропала)" onClick={()=>restoreEstimateFromAvr(r, obj)}
                                      style={{background:"#ecfdf5",color:"#059669",border:"1px solid rgba(5,150,105,.25)",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>↩ В смету</button>
                                  )}
                                  {accessAllows(currentPermissions.documentEdit, estimatorObjectIds.has(obj.id)) && (
                                    <button title="Редактировать акт" onClick={()=>setAvrModal({ ...r, lines:(r.lines||[]).map(l=>({...l,included:true,doneQty:l.doneQty})) })}
                                      style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                                  )}
                                    {accessAllows(currentPermissions.documentDelete, estimatorObjectIds.has(obj.id)) && (
                                      <button title="Удалить акт" onClick={async ()=>{ if(await confirmTyped("Удалить акт?\nЭто действие нельзя отменить через интерфейс.")){ const nl=reportsRef.current.filter(x=>x.id!==r.id); reportsRef.current=nl; setReports(nl); saveReports(nl,{removedIds:[r.id],allowEmpty:true}).catch(e=>console.warn("bg act del",e)); } }}
                                      style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:4,padding:"2px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                </>)}

                {objWsTab==="documents"
                  && currentPermissions.estimates === "none"
                  && currentPermissions.documents === "none"
                  && (
                    <div style={{maxWidth:480,margin:"32px auto",textAlign:"center",background:"#f9fafb",border:"1px dashed #e5e7eb",borderRadius:12,padding:"32px 24px"}}>
                      <div style={{fontSize:38,marginBottom:12}}>🔒</div>
                      <div style={{fontWeight:800,fontSize:16,color:"#0f172a",marginBottom:6}}>Доступ закрыт</div>
                      <div style={{fontSize:13,color:"#64748b",lineHeight:1.5}}>Сметы и документы доступны только сотрудникам с соответствующими правами.</div>
                    </div>
                  )}

                {/* Вкладка «Финансы» объекта: видят admin/manager/foreman (руководство + прораб —
                    финансы ВНУТРИ объекта). Замерщик (user) и viewer — пометка «доступ закрыт».
                    Замерщик видит себестоимость/маржу только в смете при заполнении, больше нигде. */}
                {objWsTab==="finance" && !hasFinancialDetails && (
                  <div style={{maxWidth:480,margin:"32px auto",textAlign:"center",background:"#f9fafb",border:"1px dashed #e5e7eb",borderRadius:12,padding:"32px 24px"}}>
                    <div style={{fontSize:38,marginBottom:12}}>🔒</div>
                    <div style={{fontWeight:800,fontSize:16,color:"#0f172a",marginBottom:6}}>Доступ закрыт</div>
                    <div style={{fontSize:13,color:"#64748b",lineHeight:1.5}}>Финансы по объекту доступны руководству и прорабу.</div>
                  </div>
                )}
                {/* Журнал изменений по объекту (только админ) */}
                {objWsTab==="changes" && _isAdmin && (
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:12,color:"#64748b",marginBottom:10,lineHeight:1.5}}>Кто и когда менял статус, сумму, оплаты, сроки, прораба и доступ клиента по этому объекту.</div>
                    <AuditTab objectId={obj.id} />
                  </div>
                )}
                {/* Производственные вкладки (и производственная часть «Информации») — встроенный модуль Производства */}
                {["info","launch","stages","finance","journal","defects","handover"].includes(objWsTab)
                  && currentPermissions.production !== "none"
                  && !(objWsTab==="finance" && !hasFinancialDetails) && (
                  <div style={{marginTop: objWsTab==="info" ? 14 : 0}}>
                  <ProductionModule
                    embedObjectId={obj.id}
                    embedTab={objWsTab}
                    clientInfoCard={clientCardNode}
                    objects={accessibleObjects}
                    entries={prodEntries}
                    allObjects={accessibleObjects}
                    unlinkedProjects={unlinkedFinProjects}
                    estimates={accessibleEstimates}
                    contracts={contracts.filter(c=>c.objectId===obj.id)}
                    productions={productions}
                    productionsLoaded={_productionsLoaded.current && loadedTick >= 0}
                    autoCreate={IS_DEV_ENV && editorTab && accessAllows(currentPermissions.productionEdit, estimatorObjectIds.has(obj.id))}
                    onDeleteProduction={onDeleteProduction}
                    onToggleClientShare={toggleClientShare}
                    onSetClientVis={setClientVis}
                    buildStagesFromEstimate={buildStagesFromEstimate}
                    finProjects={finProjects}
                    financeTx={financeTx}
                    fmt={fmt}
                    genId={genId}
                    currentUser={currentUser}
                    readOnly={!editorTab || currentPermissions.production === "none"}
                    actionPermissions={{
                      edit: accessAllows(currentPermissions.productionEdit, estimatorObjectIds.has(obj.id)),
                      stages: accessAllows(currentPermissions.productionStages, estimatorObjectIds.has(obj.id)),
                      quality: accessAllows(currentPermissions.productionQuality, estimatorObjectIds.has(obj.id)),
                      clientAccess: accessAllows(currentPermissions.productionClientAccess, estimatorObjectIds.has(obj.id)),
                    }}
                    onAudit={(ev)=>logChange(currentUser, ev)}
                  />
                  </div>
                )}
                {["launch","stages","journal","defects","handover"].includes(objWsTab)
                  && currentPermissions.production === "none"
                  && (
                    <div style={{maxWidth:480,margin:"32px auto",textAlign:"center",background:"#f9fafb",border:"1px dashed #e5e7eb",borderRadius:12,padding:"32px 24px"}}>
                      <div style={{fontSize:38,marginBottom:12}}>🔒</div>
                      <div style={{fontWeight:800,fontSize:16,color:"#0f172a",marginBottom:6}}>Доступ закрыт</div>
                      <div style={{fontSize:13,color:"#64748b",lineHeight:1.5}}>Производство доступно только сотрудникам с соответствующим правом.</div>
                    </div>
                  )}
              </div>
            );
          })()}
        </div>
        );
      })()}

        {effScreen === "masters" && currentPermissions.masters === "none" && restrictedSection("Мастера", "сотрудникам с соответствующим правом")}
        {effScreen === "masters" && currentPermissions.masters !== "none" && (
          <Suspense fallback={<div className="page" style={{padding:24,color:"#64748b",fontSize:13}}>Загрузка раздела «Мастера»…</div>}>
            <MastersSection masters={masters} meta={mastersMeta} loaded={mastersLoaded} config={mastersConfig} onSaveConfig={saveMastersConfig} canManage={accessAllows(currentPermissions.mastersManage, true)} mastersOlx={mastersOlx} olxMeta={mastersOlxMeta} olxLoaded={mastersOlxLoaded} olxConfig={mastersOlxConfig} onSaveOlxConfig={saveMastersOlxConfig} />
          </Suspense>
        )}

        {effScreen === "contracts" && currentPermissions.documents === "none" && restrictedSection("Прочие документы", "сотрудникам с соответствующим правом")}
        {effScreen === "contracts" && currentPermissions.documents !== "none" && (
          <div className="page" style={{maxWidth:1600,minHeight:"100vh"}}>
          {/* Шапка + табы — скрываем в режиме редактора договора (у него своя шапка) */}
          {contractTab !== "editor" && (<>
          <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"22px 26px",marginBottom:20,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
            <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:13,flexWrap:"wrap"}}>
              <button onClick={()=>setScreen("dashboard")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:22,lineHeight:1,padding:"0 4px"}}>←</button>
              <div style={{width:40,height:40,borderRadius:11,background:"linear-gradient(135deg,#3b82f6,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 3px 12px rgba(37,99,235,.5)"}}>📄</div>
              <div style={{minWidth:0}}>
                <h1 style={{margin:0,fontSize:21,fontWeight:900,color:"#fff",lineHeight:1.1}}>Прочие документы</h1>
                <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginTop:3}}>Документы вне объектов · клиенты и контрагенты</div>
              </div>
              <div style={{flex:1}}/>
              {["list","clients","contragents"].includes(contractTab) && currentUser.role === "admin" && (
                <button onClick={()=>openListBackups(contractTab)}
                  style={{background:"rgba(255,255,255,.08)",color:"#cbd5e1",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,padding:"8px 13px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  🕘 Бэкапы
                </button>
              )}
              {contractTab === "list" && (()=>{
                const _seeDoc = c => canSeeDoc(c) && (currentPermissions.documents==="all"||c.createdById===currentUser.id||c.createdBy===currentUser.name);
                const trashedCount = contracts.filter(c=>c.deletedAt && _seeDoc(c)).length;
                return (<>
                  {trashedCount>0 && <button onClick={()=>setContractTab("trash")} style={{background:"rgba(220,38,38,.12)",color:"#ef4444",border:"1px solid rgba(220,38,38,.2)",borderRadius:8,padding:"8px 13px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>🗑 Корзина ({trashedCount})</button>}
                  {currentPermissions.documentCreate!=="none" && <button className="btn btn-g" style={{fontSize:13,padding:"9px 16px"}} onClick={()=>{ const now=Date.now(); setCurrentContract({id:now.toString(),number:nextContractNumber(),date:new Date(now).toISOString().split("T")[0],clientId:"",contragentId:contragents[0]?.id||"",works:[],appendix:1,note:"",createdAt:now,createdBy:currentUser.name,createdById:currentUser.id}); setContractTab("editor"); }}>+ Новый</button>}
                </>);
              })()}
            </div>
          </div>

          </>)}

          <div style={{paddingTop:0}}>

            {/* ── СПИСОК ДОГОВОРОВ ── */}
            {contractTab === "list" && (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {/* Фильтр по статусу */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2}}>
                  <button onClick={()=>setContractFilterStatus("")}
                    style={{background:!contractFilterStatus?"#2563eb":"rgba(0,0,0,.03)",color:!contractFilterStatus?"#fff":"#94a3b8",border:`1px solid ${!contractFilterStatus?"#2563eb":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Все</button>
                  {CONTRACT_STATUSES.map(s=>(
                    <button key={s.key} onClick={()=>setContractFilterStatus(v=>v===s.key?"":s.key)}
                      style={{background:contractFilterStatus===s.key?s.bg:"rgba(0,0,0,.03)",color:contractFilterStatus===s.key?s.color:"#94a3b8",border:`1px solid ${contractFilterStatus===s.key?s.color:"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{s.label}</button>
                  ))}
                </div>
                {/* Фильтр по типу документа (приложения относятся к своему типу) */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2}}>
                  {[["","Все","#2563eb"],["podryad","🔨 Подряд","#059669"],["repair","🛠 Ремонт","#2563eb"],["design","🎨 Дизайн","#7c3aed"],["reserve","📌 Резерв","#d97706"]].map(([k,l,col])=>{
                    const act = contractTypeFilter===k;
                    return (
                      <button key={k} onClick={()=>setContractTypeFilter(k)}
                        style={{background:act?col:"rgba(0,0,0,.03)",color:act?"#fff":"#94a3b8",border:`1px solid ${act?col:"#e2e8f0"}`,borderRadius:8,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
                    );
                  })}
                </div>
                {contracts.length === 0 && (
                  <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                    <div style={{fontSize:40,marginBottom:12}}>📋</div>
                    <div style={{fontWeight:700,marginBottom:6}}>Договоров пока нет</div>
                    <div style={{fontSize:12}}>Создайте новый или используйте кнопку 📄 на карточке сметы</div>
                  </div>
                )}
                {(() => {
                  const TLABEL = {repair_fiz:"Договор",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронь",podryad:"Договор подряда",podryad_annex:"Приложение подряда"};
                  const contractTitle = (c) => {
                    const t = c.type||"repair_fiz";
                    if(t==="annex"||t==="podryad_annex") return `${t==="podryad_annex"?"Приложение подряда":"Приложение"} №${c.appendix||2}`+(c.mainNumber?` к №${c.mainNumber}`:"");
                    const lbl = TLABEL[t]||"Договор";
                    return c.number ? `${lbl} №${c.number}` : `${lbl} (без номера)`;
                  };
                  // дочерние = приложения/доп.соглашения, ссылающиеся на номер существующего договора
                  const isChildType = (c) => (c.type==="annex"||c.type==="design_add"||c.type==="podryad_annex");
                  const _norm = s => String(s||"").trim().toLowerCase().replace(/[\s№#]/g,"");
                  const numMap = {}; // нормализованный номер -> контракт
                  contracts.forEach(c=>{ if(!c.deletedAt && c.number && !isChildType(c)){ const k=_norm(c.number); if(k) numMap[k]=c; } });
                  const childMap = {}; // parentId -> [child] (удалённые не показываем — уходят в корзину)
                  contracts.forEach(c=>{ if(!c.deletedAt && isChildType(c) && c.mainNumber && canSeeDoc(c)){ const k=_norm(c.mainNumber); if(numMap[k]){ const pid=numMap[k].id; (childMap[pid]||(childMap[pid]=[])).push(c); } } });
                  const childIds = new Set(Object.values(childMap).flat().map(c=>c.id));
                  const _objIds = new Set(objects.map(o=>o.id));
                  // показываем: договоры подряда — ВСЕГДА; остальные — без объекта или с несуществующим объектом (сироты). Без удалённых.
                  const _isPodType = c => c.type==="podryad" || c.type==="podryad_annex";
                  const _docCat = c => { const t=c.type||"repair_fiz"; if(t==="podryad"||t==="podryad_annex") return "podryad"; if(t==="design"||t==="design_add") return "design"; if(t==="reservation") return "reserve"; return "repair"; };
                  const _matchType = c => !contractTypeFilter || _docCat(c)===contractTypeFilter;
                  // Видимость по роли: админ и руководитель видят все договоры, обычный сотрудник — только свои
                  const _canSeeAllDocs = currentPermissions.documents==="all";
                  const _isOwnDoc = c => c.createdById===currentUser.id || (c.createdBy && c.createdBy===currentUser.name);
                  const roots = contracts.filter(c=>!c.deletedAt && !childIds.has(c.id) && (_canSeeAllDocs || _isOwnDoc(c)) && canSeeDoc(c) && (_isPodType(c) || !c.objectId || !_objIds.has(c.objectId)) && (!contractFilterStatus || (c.contractStatus||"draft")===contractFilterStatus) && _matchType(c));

                  const workerNameOf = (c) => (workers.find(w=>w.id===c.workerId)?.name) || c.worker?.name || "";
                  // Создать доп. приложение к договору подряда (приложение №1 встроено в договор, доп идут с №2)
                  const createPodryadAnnex = (parent) => {
                    const kids = childMap[parent.id]||[];
                    const nextNo = kids.reduce((m,k)=>Math.max(m, k.appendix||0), 1) + 1;
                    const now = Date.now();
                    setCurrentContract({
                      id: now.toString(), createdAt: now, type:"podryad_annex", appendix: nextNo,
                      mainNumber: parent.number||"", mainDate: parent.date||"",
                      number: parent.number||"", date: new Date(now).toISOString().slice(0,10),
                      workerId: parent.workerId||"", ...(parent.worker?{worker:parent.worker}:{}),
                      contragentId: parent.contragentId||"", objectId: parent.objectId||"", objectAddress: parent.objectAddress||"", estId: parent.estId||"", works: [], priceMode: parent.priceMode||"perline",
                      note:"", createdBy: currentUser.name, createdById: currentUser.id,
                    });
                    setContractTab("editor");
                  };

                  const renderContractCard = (c, isChild=false, kidsCount=0, collapsed=false) => {
                    const client = contractClients.find(x=>x.id===c.clientId);
                    const ca = contragents.find(x=>x.id===c.contragentId);
                    const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                    const isPod = c.type==="podryad" || c.type==="podryad_annex";
                    const workerName = isPod ? workerNameOf(c) : "";
                    // Замерщику подряд виден, но открывать нельзя (себестоимость)
                    const _podLocked = !accessAllows(currentPermissions.documentEdit, _isOwnDoc(c)) || (_isUser && isPod);
                    return (
                      <div key={c.id}>
                        {isChild && <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:26,marginBottom:2,marginTop:4}}>
                          <div style={{width:2,height:14,background:"#e2e8f0",borderRadius:2,flexShrink:0}}/>
                          <span style={{fontSize:10,color:"#7c3aed",fontWeight:700,background:"rgba(124,58,237,.08)",borderRadius:3,padding:"1px 6px"}}>Приложение №{c.appendix||2}</span>
                        </div>}
                        <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:8,padding:"14px 18px",cursor:_podLocked?"default":"pointer",transition:"all .15s",marginLeft:isChild?26:0,borderLeft:isChild?"3px solid #ede9fe":(isPod?"3px solid #10b981":"1px solid #e5e7eb"),opacity:_podLocked?.75:1}}
                          onClick={_podLocked?undefined:()=>{ setCurrentContract({...c}); setContractTab("editor"); }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                {!isChild && kidsCount>0 && (
                                  <button onClick={e=>{ e.stopPropagation(); setCollapsedContracts(m=>({...m,[c.id]:!m[c.id]})); }}
                                    title={collapsed?"Развернуть приложения":"Свернуть приложения"}
                                    style={{background:"rgba(0,0,0,.04)",border:"1px solid #e2e8f0",borderRadius:5,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,color:"#64748b",flexShrink:0,padding:0}}>{collapsed?"▸":"▾"}</button>
                                )}
                                {isPod && !isChild && <span style={{fontSize:14,flexShrink:0}}>🔨</span>}
                                <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>
                                  {contractTitle(c)}{isPod && workerName ? ` — ${workerName}` : ""}
                                </div>
                                {_podLocked && <span title="Доступ закрыт" style={{fontSize:12,flexShrink:0}}>🔒</span>}
                                {(()=>{ const s=CONTRACT_STATUSES.find(x=>x.key===(c.contractStatus||"draft"))||CONTRACT_STATUSES[0]; return <span style={{fontSize:10,fontWeight:700,color:s.color,background:s.bg,borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>{s.label}</span>; })()}
                                {!isChild && kidsCount>0 && <span style={{fontSize:10,fontWeight:700,color:"#7c3aed",background:"rgba(124,58,237,.08)",borderRadius:4,padding:"1px 7px",flexShrink:0,whiteSpace:"nowrap"}}>приложений: {kidsCount}</span>}
                              </div>
                              <div style={{fontSize:12,color:"#94a3b8",marginTop:3}}>
                                {isPod
                                  ? (workerName ? `🔨 ${workerName}` : "Подрядчик не выбран")
                                  : (client ? `👤 ${client.name}` : c.estClient ? `👤 ${c.estClient} (не добавлен)` : "Клиент не выбран")}
                                {ca && <span style={{marginLeft:8}}>· {ca.name}</span>}
                              </div>
                              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                                {new Date(c.date||Date.now()).toLocaleDateString("ru-RU")} · {(c.works||[]).length} позиций
                              </div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(total)} ₸</div>
                              <div style={{display:"flex",gap:5,marginTop:6}}>
                                {c.type==="podryad" && !isChild && accessAllows(currentPermissions.documentCreate, _isOwnDoc(c)) && !_isUser && (
                                  <button title="Создать доп. приложение к этому договору подряда" onClick={e=>{e.stopPropagation(); createPodryadAnnex(c);}}
                                    style={{background:"#ecfdf5",color:"#059669",border:"1px solid rgba(5,150,105,.25)",borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Приложение</button>
                                )}
                                {accessAllows(currentPermissions.documentExport, _isOwnDoc(c)) && !_podLocked && <button onClick={e=>{e.stopPropagation();
                                  const cl = contractClients.find(x=>x.id===c.clientId);
                                  const ca2 = contragents.find(x=>x.id===c.contragentId);
                                  generateContractPdf(c, cl, ca2);
                                }} style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📄 PDF</button>}
                                {accessAllows(currentPermissions.documentExport, _isOwnDoc(c)) && !_podLocked && <button onClick={e=>{e.stopPropagation();
                                  const cl = contractClients.find(x=>x.id===c.clientId);
                                  const ca2 = contragents.find(x=>x.id===c.contragentId);
                                  generateContractGDoc(c, cl, ca2);
                                }} style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(66,133,244,.2)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📋 GDoc</button>}
                                {documentSnapshotsById.has(`contract:${c.id}`) && accessAllows(currentPermissions.documentInstanceEdit, _isOwnDoc(c)) && !_podLocked && <button onClick={e=>{e.stopPropagation(); openDocumentInstance(c);}}
                                  style={{background:"#f8fafc",color:"#475569",border:"1px solid #cbd5e1",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎ Экземпляр</button>}
                                {accessAllows(currentPermissions.documentDelete, c.createdById===currentUser.id||c.createdBy===currentUser.name) && (
                                  <button onClick={e=>{e.stopPropagation(); if(window.confirm("Переместить в корзину?")){ saveContracts(contractsRef.current.map(x=>x.id===c.id?{...x,deletedAt:Date.now()}:x)); logChange(currentUser,{entity:"contract",entityId:c.id,objectId:c.objectId||"",label:c.contractNo||c.objectName||"Договор",action:"удалил договор"}); }}}
                                    style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  };

                  if (roots.length===0) return (
                    <div style={{textAlign:"center",padding:"40px 0",color:"#94a3b8",fontSize:13}}>
                      Ничего не найдено по выбранным фильтрам
                    </div>
                  );
                  return roots.map(c=>{
                    const kids = (childMap[c.id]||[]).sort((a,b)=>(a.appendix||0)-(b.appendix||0));
                    const collapsed = !!collapsedContracts[c.id];
                    return (
                      <div key={c.id} style={{display:"flex",flexDirection:"column",gap:0}}>
                        {renderContractCard(c,false,kids.length,collapsed)}
                        {!collapsed && kids.map(ch=>renderContractCard(ch,true))}
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* ── КОРЗИНА ДОГОВОРОВ ── */}
            {contractTab === "trash" && (()=>{
              const _seeDoc = c => currentPermissions.documents==="all"||c.createdById===currentUser.id||c.createdBy===currentUser.name;
              const trashed = contracts.filter(c=>c.deletedAt && _seeDoc(c));
              return (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <button onClick={()=>setContractTab("list")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18,lineHeight:1,padding:"0 4px"}}>←</button>
                  <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>🗑 Корзина договоров</span>
                </div>
                {trashed.length===0 ? (
                  <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                    <div style={{fontSize:40,marginBottom:12}}>🗑</div>
                    <div style={{fontWeight:700}}>Корзина пуста</div>
                  </div>
                ) : trashed.sort((a,b)=>b.deletedAt-a.deletedAt).map(c=>{
                  const client = contractClients.find(x=>x.id===c.clientId);
                  const total = (c.works||[]).reduce((s,w)=>s+(w.quantity*w.price||0),0);
                  const TLABEL2 = {repair_fiz:"Договор",annex:"Приложение",design:"Дизайн-проект",design_add:"Доп. соглашение",reservation:"Бронь"};
                  const title = c.number ? `${TLABEL2[c.type||"repair_fiz"]||"Договор"} №${c.number}` : (TLABEL2[c.type||"repair_fiz"]||"Договор")+" (без номера)";
                  return (
                    <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"14px 18px",opacity:.7}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:13,color:"#0f172a",textDecoration:"line-through"}}>{title}</div>
                          <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{client?`👤 ${client.name}`:""} · Удалён {new Date(c.deletedAt).toLocaleDateString("ru-RU")}</div>
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{fontWeight:700,fontSize:14,color:"#64748b"}}>{fmt(total)} ₸</span>
                            {accessAllows(currentPermissions.documentDelete, isOwnDocument(c)) && <button onClick={()=>saveContracts(contractsRef.current.map(x=>x.id===c.id?{...x,deletedAt:undefined}:x))}
                              style={{background:"rgba(5,150,105,.08)",color:"#059669",border:"1px solid rgba(5,150,105,.2)",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↩ Восстановить</button>}
                            {currentUser.role==="admin" && <button onClick={async ()=>{ if(await confirmTyped("Удалить договор навсегда?")){ const nl=contractsRef.current.filter(x=>x.id!==c.id); contractsRef.current=nl; setContracts(nl); saveContracts(nl,{removedIds:[c.id],allowEmpty:true}).catch(e=>console.warn("bg contract del",e)); } }}
                            style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕ Удалить</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}

            {/* ── РЕДАКТОР ДОГОВОРА ── */}
            {contractTab === "editor" && currentContract && !currentContract._mode && !canEditCurrentDocument && restrictedSection("Редактирование документа", "сотрудникам с соответствующим правом")}
            {contractTab === "editor" && currentContract && !currentContract._mode && canEditCurrentDocument && (
              <ContractEditor
                contract={currentContract}
                clients={contractClients}
                contragents={contragents}
                onUpdate={setCurrentContract}
                onBack={()=>{
                  // Сохраняем перед выходом (страховка к дебаунс-автосейву), но НЕ ждём облако:
                  // раньше здесь был await полного цикла записи в Firebase (чтение→бэкап→запись,
                  // каждый с таймаутом до 12с) ПЕРЕД навигацией — кнопка «Назад» подвисала на
                  // 10-15 сек при медленном облаке/переполненном localStorage. Запись устойчива
                  // (localStorage-first + dirty-флаг + фоновый повтор), поэтому уходим сразу, а
                  // сейв дожимается в фоне.
                  const c = currentContract;
                  if (c && !c._mode) { saveContracts([...contractsRef.current.filter(x=>x.id!==c.id), {...c, updatedAt: Date.now()}]).catch(e=>console.warn("bg save contract err", e)); }
                  if (objectReturnId) {
                    const obj = objectsRef.current.find(x=>x.id===objectReturnId);
                    setObjectReturnId(null);
                    if (obj) { setCurrentObject({...obj}); setObjectTab("workspace"); setScreen("objects"); return; }
                  }
                  setContractTab("list");
                }}
                onSave={async ()=>{
                  const _oldC = contracts.find(x=>x.id===currentContract.id) || null;
                  const list = contracts.filter(x=>x.id!==currentContract.id);
                  await saveContracts([...list, currentContract]);
                  logContractSave(currentUser, _oldC, currentContract);
                  if (objectReturnId) {
                    const obj = objectsRef.current.find(x=>x.id===objectReturnId);
                    setObjectReturnId(null);
                    if (obj) { setCurrentObject({...obj}); setObjectTab("workspace"); setScreen("objects"); return; }
                  }
                  setContractTab("list");
                }}
                onPdf={(withStamp)=>{
                  const cl = contractClients.find(x=>x.id===currentContract.clientId);
                  const ca = contragents.find(x=>x.id===currentContract.contragentId);
                  generateContractPdf(currentContract, cl, ca, withStamp);
                }}
                onSamplePdf={()=>generateContractSamplePdf(currentContract)}
                onGDoc={()=>{
                  const cl = contractClients.find(x=>x.id===currentContract.clientId);
                  const ca = contragents.find(x=>x.id===currentContract.contragentId);
                  generateContractGDoc(currentContract, cl, ca);
                }}
                  canExport={canExportCurrentDocument}
                  onAddClientFromEstimate={()=>{
                  const newClient = {id:Date.now().toString(),name:currentContract.estClient||"",phone:currentContract.estPhone||"",address:currentContract.estAddress||"",iin:"",doc:"",type:"физ",createdAt:Date.now()};
                  const list=[...contractClients,newClient];
                  // Оптимистично: клиент сразу в списке и выбран, запись — в фон (без подвисания)
                  clientsRef.current = list; setContractClients(list);
                  setCurrentContract(prev=>({...prev,clientId:newClient.id}));
                  saveContractClients(list).catch(e=>console.warn("bg client save err", e));
                }}
                onUpdateClient={(updated)=>{
                  saveContractClients(contractClients.map(x=>x.id===updated.id?updated:x));
                }}
                onCreateClient={(newClient)=>{
                  // Оптимистично добавляем клиента в список, запись — в фон (без подвисания кнопки)
                  const next = [...contractClients, newClient];
                  clientsRef.current = next; setContractClients(next);
                  saveContractClients(next).catch(e=>console.warn("bg client save err", e));
                }}
                workers={workers}
                onCreateWorker={(w)=>{
                  const rec = { id:w.id||genId(), ...w };
                  const cur = workersRef.current;
                  const next = cur.some(x=>x.id===rec.id) ? cur.map(x=>x.id===rec.id?rec:x) : [rec,...cur];
                  // Оптимистично: подрядчик сразу доступен для выбора, запись — в фон
                  workersRef.current = next; setWorkers(next);
                  saveWorkers(next,{replace:false}).catch(e=>console.warn("bg worker save err", e));
                  return rec.id; // id известен сразу (сгенерирован здесь) — await не нужен
                }}
                importObjects={objects.filter(o=>!o.deletedAt).map(o=>({id:o.id,label:o.clientName||o.address||o.id,address:o.address||""}))}
                getObjectWorks={(objId)=>{ const ests=estimates.filter(e=>e.objectId===objId); const main=ests.find(e=>!e.parentId||e.parentId===e.id)||ests[0]; return main?estimateToWorks(main):[]; }}
                currentUserRole={currentUser.role}
                fmt={fmt}
              />
            )}

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ЭКРАН 4: АДМИНКА
      ═══════════════════════════════════════════════════════════════════ */}
      {effScreen === "admin" && currentPermissions.admin === "none" && restrictedSection("Админка")}
      {effScreen === "admin" && currentPermissions.admin === "full" && (
        <Suspense fallback={<div className="page"><div className="dt-empty">Загрузка админки…</div></div>}>
        <AdminPageContent
          currentUser={currentUser}
          permissions={currentPermissions}
          presence={presence}
          rolePermissions={rolePermissions}
          onSaveRolePermissions={saveRolePermissions}
          onUsersChanged={async ()=>{
            const u=await storage.get(USERS_KEY);
            if(!u) return;
            const list=JSON.parse(u.value);
            setAllUsers(list);
            // синхронизируем текущего пользователя и ПРОДЛЕВАЕМ метку входа (authAt),
            // чтобы тот, кто меняет пароли (в т.ч. свой), не разлогинил сам себя
            const me=list.find(x=>x.id===currentUser.id);
            if(me){
              const {password:_pw, ...meSafe}=me; // пароль в сессии не храним
              const updated={...currentUser,...meSafe, authAt: Date.now()};
              setCurrentUser(updated);
              try{ localStorage.setItem(SESSION_KEY,JSON.stringify({user:updated,savedAt:Date.now()})); }catch(e){}
            }
          }}
          clients={contractClients}
          saveClients={saveContractClients}
          clientsRef={clientsRef}
          contragents={contragents}
          saveContragents={saveContragents}
          contragentsRef={contragentsRef}
          workers={workers}
          saveWorkers={saveWorkers}
          workersRef={workersRef}
          contracts={contracts}
          documentTemplateEnabled={DOCUMENT_TEMPLATE_FEATURE.showAdmin}
          documentTemplateService={documentTemplateService}
          documentTemplateData={{
            objects,
            estimates,
            contracts,
            clients: contractClients,
            contragents,
          }}
          fmt={fmt}
          onBackupWorkspace={openWorkspaceBackups}
          onExportAll={exportAllJSON}
          onImportAll={importAllJSON}
          onExportEstimatesXls={exportEstimatesXls}
          checkIssues={_checkIssues}
          onNavIssue={openIssue}
          runtime={{
            storage,
            USERS_KEY,
            CATALOG_KEY,
            PRICES_KEY,
            CATALOG_BACKUPS_KEY,
            DEFAULT_USERS,
            confirmDangerous,
            confirmTyped,
            genId,
            hashPassword,
            passwordTooWeak,
            writeAudit,
            logChange,
            setCatalogOverrides,
            getCatalogOverrides: () => _catalogOverrides,
            getEffectiveCatalog,
            setPriceOverrides,
            priceCardCache,
            DocumentTemplateAdminRoute,
            AuditTab,
            IssuePanel,
          }}
        />
        </Suspense>
      )}

      </div>

      <DangerConfirmModal/>

      {DOCUMENT_TEMPLATE_FEATURE.allowInstances && documentInstanceSnapshot && (
        <div style={{position:"fixed",inset:0,zIndex:9998,background:"#f8fafc",overflow:"auto"}}>
          <Suspense fallback={<div className="dt-empty">Загрузка редактора документа…</div>}>
            <DocumentInstanceEditor
              snapshot={documentInstanceSnapshot}
              service={documentTemplateService}
              onClose={()=>setDocumentInstanceSnapshot(null)}
              onSaved={snapshot=>{
                if (!snapshot) return;
                setDocumentInstanceSnapshot(snapshot);
                setDocumentSnapshotsById(current=>new Map(current).set(snapshot.documentId, snapshot));
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Модал подтверждения выхода */}
      {/* ── Построитель АВР (форма Р-1) ── */}
      {avrModal && (()=>{
        const m = avrModal;
        const upd = patch => setAvrModal(p=>({...p,...patch}));
        const updLine = (i,patch) => setAvrModal(p=>({...p, lines:p.lines.map((l,idx)=>idx===i?{...l,...patch}:l)}));
        const selected = m.lines.filter(l=>l.included && Number(l.doneQty)>0);
        const total = selected.reduce((s,l)=>s+Math.round((Number(l.price)||0)*(Number(l.doneQty)||0)),0);
        const allOn = m.lines.length>0 && m.lines.every(l=>l.included);
        const addLine = ()=>setAvrModal(p=>({...p, lines:[...p.lines, {cat:"",name:"",unit:"",qty:0,price:0,included:true,doneQty:1}]}));
        return (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAvrModal(null)}>
          <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:760,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 70px rgba(0,0,0,.3)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            {/* шапка */}
            <div style={{padding:"16px 20px",borderBottom:"1px solid #eef2f7",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:"#0f172a"}}>📋 Акт выполненных работ (Р-1)</div>
                <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Отметьте работы и при необходимости скорректируйте выполненное количество</div>
              </div>
              <button onClick={()=>setAvrModal(null)} style={{background:"none",border:"none",fontSize:24,color:"#94a3b8",cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            {/* реквизиты акта */}
            <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>№ акта<input className="fi" style={{marginTop:4}} value={m.actNo} onChange={e=>upd({actNo:e.target.value})}/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>Дата акта<input type="date" className="fi" style={{marginTop:4}} value={m.actDate} onChange={e=>upd({actDate:e.target.value})}/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>Договор №<input className="fi" style={{marginTop:4}} value={m.contractNo} onChange={e=>upd({contractNo:e.target.value})} placeholder="—"/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600}}>Дата договора<input type="date" className="fi" style={{marginTop:4}} value={m.contractDate||""} onChange={e=>upd({contractDate:e.target.value})}/></label>
              <label style={{fontSize:11,color:"#64748b",fontWeight:600,gridColumn:"1 / -1"}}>Заказчик<input className="fi" style={{marginTop:4}} value={m.clientName} onChange={e=>upd({clientName:e.target.value})} placeholder="ФИО / Название"/></label>
              <label style={{fontSize:12.5,color:"#475569",fontWeight:600,gridColumn:"1 / -1",display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:2}}>
                <input type="checkbox" checked={!!m.withStamp} onChange={e=>upd({withStamp:e.target.checked})} style={{width:16,height:16,cursor:"pointer"}}/>
                🔖 Вставить печать ТОО в акт
              </label>
            </div>
            {/* список работ */}
            <div style={{padding:"8px 20px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <button onClick={()=>setAvrModal(p=>({...p, lines:p.lines.map(l=>({...l,included:!allOn}))}))}
                style={{background:"none",border:"1px solid #e2e8f0",borderRadius:7,padding:"5px 11px",fontSize:11,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>
                {allOn?"☐ Снять все":"☑ Выбрать все"}
              </button>
              <span style={{fontSize:12,color:"#64748b"}}>Выбрано: <b>{selected.length}</b> из {m.lines.length}</span>
            </div>
            <div style={{overflowY:"auto",flex:1,padding:"6px 12px"}}>
              {m.lines.map((l,i)=>(
                <div key={i} style={{padding:"10px 8px",borderBottom:"1px solid #f1f5f9",opacity:l.included?1:.5}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <input type="checkbox" checked={l.included} onChange={e=>updLine(i,{included:e.target.checked})} style={{width:16,height:16,flexShrink:0,cursor:"pointer"}}/>
                    <input value={l.name} onChange={e=>updLine(i,{name:e.target.value})} placeholder="Наименование работ"
                      style={{flex:1,minWidth:0,padding:"6px 8px",border:"1px solid #e2e8f0",borderRadius:7,fontSize:13,fontFamily:"inherit",fontWeight:500}}/>
                    <div style={{width:92,textAlign:"right",fontSize:13,fontWeight:700,color:l.included?"#0f172a":"#cbd5e1",flexShrink:0}}>{fmt(Math.round((Number(l.price)||0)*(Number(l.doneQty)||0)))} ₸</div>
                    <button title="Удалить строку" onClick={()=>setAvrModal(p=>({...p,lines:p.lines.filter((_,idx)=>idx!==i)}))}
                      style={{background:"none",border:"none",color:"#cbd5e1",cursor:"pointer",fontSize:18,flexShrink:0,lineHeight:1,padding:0}}>×</button>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:7,paddingLeft:24,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#94a3b8"}}>Кол-во</span>
                    <input type="number" min="0" step="any" value={l.doneQty} disabled={!l.included} onChange={e=>updLine(i,{doneQty:e.target.value})}
                      style={{width:70,padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,textAlign:"right",fontFamily:"inherit"}}/>
                    <input value={l.unit} onChange={e=>updLine(i,{unit:e.target.value})} placeholder="ед."
                      style={{width:58,padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,fontFamily:"inherit"}}/>
                    <span style={{fontSize:11,color:"#94a3b8",marginLeft:6}}>Цена</span>
                    <input type="number" min="0" step="any" value={l.price} disabled={!l.included} onChange={e=>updLine(i,{price:e.target.value})}
                      style={{width:98,padding:"5px 7px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:12,textAlign:"right",fontFamily:"inherit"}}/>
                    <span style={{fontSize:11,color:"#94a3b8"}}>₸/{l.unit||"ед."}</span>
                  </div>
                </div>
              ))}
              <button onClick={addLine} style={{margin:"10px 8px 4px",background:"rgba(124,58,237,.06)",color:"#7c3aed",border:"1px dashed rgba(124,58,237,.35)",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Добавить строку</button>
            </div>
            {/* подвал */}
            <div style={{padding:"14px 20px",borderTop:"1px solid #eef2f7",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:12,color:"#64748b"}}>Итого по акту (без НДС)</div>
                <div style={{fontSize:22,fontWeight:900,color:"#0f172a"}}>{fmt(total)} ₸</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setAvrModal(null)} style={{padding:"11px 18px",borderRadius:10,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
                <button disabled={selected.length===0} onClick={()=>saveAndPrintAvr(m)}
                  style={{padding:"11px 20px",borderRadius:10,border:"none",background:selected.length===0?"#cbd5e1":"#7c3aed",color:"#fff",fontSize:14,fontWeight:700,cursor:selected.length===0?"default":"pointer",fontFamily:"inherit"}}>
                  🖨 Сохранить и печать
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {logoutConfirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setLogoutConfirm(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:"28px 24px",maxWidth:320,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.25)",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:12}}>🚪</div>
            <div style={{fontSize:17,fontWeight:700,color:"#0f172a",marginBottom:8}}>Выйти из аккаунта?</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:24}}>Вы будете перенаправлены на экран входа</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setLogoutConfirm(false)} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#475569",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Отмена</button>
              <button onClick={doLogout} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:"#ef4444",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Выйти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ПАНЕЛЬ АДМИНИСТРАТОРА (управление пользователями) ───────────────────────
// Прайс редактор — карточки ниже

// Карточка с полностью локальным состоянием — изолирована от родителя
// Принимает начальные данные ОДИН РАЗ, дальше живёт сама
// При размонтировании сохраняет данные в priceCardCache
const priceCardCache = {};
