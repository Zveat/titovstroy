// Страница администратора: сотрудники, права, прайс, справочники, проверка базы.
// Перенос из App.jsx.
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { confirmDangerous } from "../appConfig.js";
import { hashPassword, passwordTooWeak } from "../auth/loginGuard.js";
import { logChange, writeAudit } from "../cloud/audit.js";
import { storage } from "../cloud/storage.js";
import { DEFAULT_USERS, PRICE_SEAL_REASONS } from "../constants.js";
import { IssuePanel } from "../dashboard/IssuePanel.jsx";
import { EstimateSuggestionRulesEditor } from "../estimate/EstimateSuggestions.jsx";
import { fmt, genId } from "../format.js";
import { _catalogOverrides, getEffectiveCatalog, setCatalogOverrides, setPriceOverrides } from "../pricing.js";
import { CATALOG_BACKUPS_KEY, CATALOG_KEY, PRICES_KEY, USERS_KEY } from "../storageKeys.js";
import { confirmTyped } from "../ui/DangerConfirm.jsx";
import { DEFAULT_ROLE_PERMISSIONS, ROLE_DEFINITIONS, accessAllows, contractNetTotal, resolveEstimateSuggestionRules, withCatalogOverrides } from "../utils.js";
import { AuditTab } from "./AuditTab.jsx";
import { RolePermissionsEditor } from "./RolePermissions.jsx";

export const DocumentTemplateAdminRoute = lazy(() => import("../documents/DocumentTemplateAdminRoute.jsx"));

// ─── СТРАНИЦА АДМИНИСТРАТОРА (встроена в основной layout) ────────────────────
export function AdminPageContent({ currentUser, presence = {}, onAuditPrice = null, permissions=DEFAULT_ROLE_PERMISSIONS.admin, onUsersChanged, rolePermissions=DEFAULT_ROLE_PERMISSIONS, onSaveRolePermissions=async()=>false, clients=[], saveClients=()=>{}, clientsRef={current:[]}, contragents=[], saveContragents=()=>{}, contragentsRef={current:[]}, workers=[], saveWorkers=()=>{}, workersRef={current:[]}, contracts=[], documentTemplateEnabled=false, documentTemplateService=null, documentTemplateData={}, fmt=(n)=>Math.round(Number(n)||0).toLocaleString("ru-RU"), onBeforePriceChange=async()=>true, onBackupWorkspace=()=>{}, onExportAll=()=>{}, onImportAll=()=>{}, onExportEstimatesXls=()=>{}, checkIssues=[], onNavIssue=()=>{} }) {
  const [tab, setTab] = useState("users");
  const hasAdminPermission = (key) => accessAllows(permissions[key], true);
  const adminTabs = [
    ["users","👥 Сотрудники","adminUsers"],
    ["permissions","🔐 Права ролей","adminRoles"],
    ["clients","👥 Клиенты","adminClients"],
    ["contragents","🏢 Реквизиты","adminClients"],
    ["workers","🔨 Подрядчики","adminContractors"],
    ["prices","💰 Прайс-лист", hasAdminPermission("adminCatalog") || hasAdminPermission("adminPrices") ? null : "__none"],
    ...(documentTemplateEnabled ? [["documentTemplates","📑 Шаблоны документов","templateView"]] : []),
    ["backups","🗄 Бэкапы", hasAdminPermission("adminBackups") || hasAdminPermission("adminRestore") ? null : "__none"],
    ["audit","📋 Журнал","adminAudit"],
    ["check","🔍 Проверка базы","adminDbCheck"],
  ];
  const allowedAdminTabs = adminTabs.filter(([, , key]) => key === null || (key !== "__none" && hasAdminPermission(key)));
  useEffect(() => {
    if (!allowedAdminTabs.some(([key]) => key === tab)) setTab(allowedAdminTabs[0]?.[0] || "");
  }, [tab, permissions]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [editingPass, setEditingPass] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [msg, setMsg] = useState("");
  const [localPrices, setLocalPrices] = useState(null);
  const [savedOverrides, setSavedOverrides] = useState({});
  const [localCatalog, setLocalCatalog] = useState(null);
  const [priceSearch, setPriceSearch] = useState("");
  const [priceMsg, setPriceMsg] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [showAddWork, setShowAddWork] = useState(false);
  const [newWork, setNewWork] = useState({cat:"", sub:"", name:"", unit:"м²"});
  const [editingCat, setEditingCat] = useState(null);
  const [editingSub, setEditingSub] = useState(null);
  const [catalogBackupsModal, setCatalogBackupsModal] = useState(null);
  const [adminEditItem, setAdminEditItem] = useState(null); // {mode:"newClient"|"editClient"|"newCA"|"editCA"|"newWorker"|"editWorker", data:{}}
  const [adminSubTab, setAdminSubTab] = useState("list"); // "list"|"clientEditor"|"caEditor"|"workerEditor"
  const [workerSearch, setWorkerSearch] = useState(""); // поиск в справочнике подрядчиков
  const openCatalogBackups = async () => {
    if (!hasAdminPermission("adminCatalog")) return;
    const bRaw = await storage.get(CATALOG_BACKUPS_KEY);
    let bkps = []; try { if (bRaw?.value) bkps = JSON.parse(bRaw.value); } catch {}
    setCatalogBackupsModal(Array.isArray(bkps) ? bkps : []);
  };
  const restoreCatalogBackup = async (snap) => {
    if (!hasAdminPermission("adminCatalog")) return;
    if (!snap?.data) return;
    let cat; try { cat = JSON.parse(snap.data); } catch { window.alert("Бэкап повреждён"); return; }
    if (!confirmDangerous(`Восстановить каталог на ${new Date(snap.ts).toLocaleString("ru-RU")}?\nТекущий каталог уйдёт в бэкап.`)) return;
    await saveCatalog(cat);
    logChange(currentUser, { entity: "backup", label: "Каталог работ", action: "восстановил из бэкапа",
      field: "снимок", old: new Date(snap.ts).toLocaleString("ru-RU"),
      new: `позиций: ${Array.isArray(cat) ? cat.length : "?"}`, detail: `автор снимка: ${snap.by || "—"}` });
    setCatalogBackupsModal(null);
    window.alert("Каталог восстановлен ✓");
  };

  const _priceAutoSave = useRef(null);
  useEffect(() => {
    if (!localPrices) return;
    if (_priceAutoSave.current) clearTimeout(_priceAutoSave.current);
    _priceAutoSave.current = setTimeout(() => { savePrices(); }, 2000);
    return () => clearTimeout(_priceAutoSave.current);
  }, [localPrices]);

  useEffect(() => {
    (async () => {
      try {
        const [res, cat, pr] = await Promise.all([
          storage.get(USERS_KEY),
          storage.get(CATALOG_KEY),
          storage.get(PRICES_KEY),
        ]);
        try { setUsers(res ? JSON.parse(res.value) : DEFAULT_USERS); } catch { setUsers(DEFAULT_USERS); }
        try {
          if (cat) { const parsed = JSON.parse(cat.value); setCatalogOverrides(parsed); setLocalCatalog(parsed); }
          else setLocalCatalog({ renames:{}, custom:[], hiddenCodes:[] });
        } catch { setLocalCatalog({ renames:{}, custom:[], hiddenCodes:[] }); }
        try {
          const ov = pr ? JSON.parse(pr.value) : {};
          setSavedOverrides(ov);
          const allWorks = getEffectiveCatalog();
          const lp = {};
          for (const w of allWorks) {
            const saved = ov[w.code];
            lp[w.code] = {
              tiers: saved?.tiers !== undefined ? saved.tiers.map(t=>({...t})) : (w.tiers||[]).map(t=>({...t})),
              fixedPrice: saved?.fixedPrice !== undefined ? String(saved.fixedPrice) : w.fixedPrice !== undefined ? String(w.fixedPrice) : "",
              cost: saved?.cost !== undefined ? saved.cost : undefined,
              margin: saved?.margin !== undefined ? saved.margin : undefined,
              priceFrom: saved?.priceFrom !== undefined ? saved.priceFrom : undefined,
            };
          }
          setLocalPrices(lp);
        } catch {}
      } catch {}
      setLoading(false);
    })();
  }, []);

  const saveUsers = async (list) => {
    if (!hasAdminPermission("adminUsers")) return false;
    setSaving(true);
    await storage.set(USERS_KEY, JSON.stringify(list));
    setSaving(false);
    return true;
  };
  const addUser = async () => {
    if (!hasAdminPermission("adminUsers")) return;
    if (!newLogin.trim() || !newPass.trim() || !newName.trim()) { setMsg("Заполните все поля"); return; }
    if (users.find(u => u.login.toLowerCase() === newLogin.trim().toLowerCase())) { setMsg("Логин уже занят"); return; }
    const weak = passwordTooWeak(newPass); if (weak) { setMsg(weak); return; }
    const u = { id: genId(), login: newLogin.trim(), password: await hashPassword(newPass.trim()), name: newName.trim(), role: newRole };
    const updated = [...users, u];
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
    writeAudit(currentUser,"создал пользователя","user",u.id,`${u.name} (${u.role})`);
    setNewLogin(""); setNewName(""); setNewPass(""); setNewRole("user");
    setMsg("✓ Пользователь добавлен"); setTimeout(() => setMsg(""), 2500);
  };
  const removeUser = async (id) => {
    if (!hasAdminPermission("adminUsers")) return;
    if (id === currentUser.id) { setMsg("Нельзя удалить себя"); setTimeout(()=>setMsg(""),2000); return; }
    const gone = users.find(u => u.id === id);
    const updated = users.filter(u => u.id !== id);
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
    // Доступы — самое чувствительное, что есть в системе: кто кого завёл, кому
    // сменил роль и пароль, должно быть видно в журнале поимённо.
    logChange(currentUser, { entity: "user", entityId: id, label: gone?.name || gone?.login || id,
      field: "учётная запись", action: "удалил пользователя",
      old: `${gone?.name || "?"} (${gone?.role || "?"})`, new: "—" });
  };
  const savePass = async (id) => {
    if (!hasAdminPermission("adminUsers")) return;
    if (!editingPass?.val?.trim()) return;
    const weak = passwordTooWeak(editingPass.val); if (weak) { setMsg(weak); return; }
    // pwChangedAt — метка смены пароля: сессии, вошедшие до этого момента, разлогинятся при загрузке
    const newHash = await hashPassword(editingPass.val.trim());
    const updated = users.map(u => u.id === id ? {...u, password: newHash, pwChangedAt: Date.now()} : u);
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
    const target = users.find(u => u.id === id);
    // Сам пароль в журнал НЕ пишем — только факт смены и кому.
    logChange(currentUser, { entity: "user", entityId: id, label: target?.name || target?.login || id,
      field: "пароль", action: "сменил пароль", old: "", new: "" });
    setEditingPass(null); setMsg("✓ Пароль изменён"); setTimeout(() => setMsg(""), 2500);
  };
  const saveUser = async () => {
    if (!hasAdminPermission("adminUsers")) return;
    if (!editingUser?.name?.trim() || !editingUser?.login?.trim()) return;
    const conflict = users.find(u => u.id !== editingUser.id && u.login.toLowerCase() === editingUser.login.trim().toLowerCase());
    if (conflict) { setMsg("Логин уже занят"); setTimeout(()=>setMsg(""),2000); return; }
    const updated = users.map(u => u.id === editingUser.id ? {...u, name: editingUser.name.trim(), login: editingUser.login.trim(), role: (editingUser.id===currentUser.id ? u.role : (editingUser.role||u.role||"user"))} : u);
    setUsers(updated); await saveUsers(updated); await onUsersChanged();
    const before = users.find(u => u.id === editingUser.id);
    const after = updated.find(u => u.id === editingUser.id);
    // Пишем только реально изменившиеся поля — иначе журнал засоряется пустыми правками.
    for (const [key, label] of [["name", "имя"], ["login", "логин"], ["role", "роль"]]) {
      if (before?.[key] === after?.[key]) continue;
      logChange(currentUser, { entity: "user", entityId: after.id, label: after.name || after.login,
        field: label, action: "изменил", old: before?.[key] ?? "—", new: after?.[key] ?? "—" });
    }
    setEditingUser(null); setMsg("✓ Сохранено"); setTimeout(() => setMsg(""), 2500);
  };
  const savePrices = async () => {
    if (!hasAdminPermission("adminPrices")) return;
    setPriceSaving(true);
    const overrides = {...savedOverrides};
    for (const [code, src] of Object.entries(priceCardCache)) {
      const allW = getEffectiveCatalog(); const w = allW.find(x => x.code === code); if (!w) continue;
      // New table-based: cost + margin → fixedPrice, optional priceFrom
      if (src.cost !== undefined || src.margin !== undefined || src.priceFrom !== undefined) {
        const cost = src.cost !== null && src.cost !== undefined ? Number(src.cost) : (w.cost ?? null);
        const margin = src.margin !== undefined ? Number(src.margin) : (w.margin ?? 0.4);
        const priceFrom = src.priceFrom !== undefined ? (src.priceFrom ? Number(src.priceFrom) : null) : (w.priceFrom ?? null);
        if (cost !== null && !isNaN(cost) && cost > 0) {
          const safeMargin = Math.min(0.99, Math.max(0, Number(margin) || 0));
          const price = Math.round(cost / (1 - safeMargin));
          overrides[code] = { cost, margin, fixedPrice: price, tiers: [], ...(priceFrom ? {priceFrom} : {}) };
        } else if (priceFrom) {
          overrides[code] = { ...(overrides[code]||{}), priceFrom };
        } else {
          delete overrides[code];
        }
        continue;
      }
      // Legacy tiers support
      const validTiers = (src.tiers||[]).filter(t => t.price!==""&&t.price!==undefined&&!isNaN(Number(t.price))&&t.min!==""&&t.max!=="").map(t=>({min:Number(t.min),max:Number(t.max),price:Number(t.price)}));
      if (validTiers.length > 0) { overrides[code] = {tiers: validTiers}; }
      else if (src.fixedPrice!==""&&src.fixedPrice!==undefined&&!isNaN(Number(src.fixedPrice))) { overrides[code] = {fixedPrice: Number(src.fixedPrice), tiers:[]}; }
      else { delete overrides[code]; }
    }
    if (Object.keys(priceCardCache).length > 0) {
      const protectedHistory = await onBeforePriceChange();
      // Совместимость: раньше возвращалось true/false, теперь {ok, reason, detail}.
      const sealOk = protectedHistory === true || protectedHistory?.ok === true;
      if (!sealOk) {
        setPriceSaving(false);
        const why = protectedHistory?.reason
          ? (PRICE_SEAL_REASONS[protectedHistory.reason] || protectedHistory.reason)
          : "";
        setPriceMsg(`Не удалось зафиксировать цены заполненных смет${why ? `: ${why}` : ""}. Прайс не изменён.`
          + (protectedHistory?.detail ? ` (${protectedHistory.detail})` : ""));
        setTimeout(()=>setPriceMsg(""),12000);   // за 5 секунд причину не прочитать
        return;
      }
    }
    await storage.set(PRICES_KEY, JSON.stringify(overrides));
    setPriceOverrides(overrides); setSavedOverrides(overrides);
    // Sync localPrices with saved cost/margin/priceFrom so inputs don't revert to base values
    setLocalPrices(prev => {
      const lp = {...prev};
      for (const [code, entry] of Object.entries(overrides)) {
        lp[code] = { ...(lp[code]||{}), cost: entry.cost, margin: entry.margin, priceFrom: entry.priceFrom };
      }
      return lp;
    });
    // Что именно поменяли в прайсе — поработочно. Цена работы влияет на все будущие
    // сметы, поэтому «кто и когда поднял себестоимость» обязано быть в журнале.
    for (const [code, entry] of Object.entries(priceCardCache)) {
      const w = getEffectiveCatalog().find(x => x.code === code);
      const before = savedOverrides[code] || {};
      const after = overrides[code] || {};
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      const fmtP = (e) => e && (e.cost != null || e.margin != null)
        ? `себестоимость ${e.cost ?? "—"}, маржа ${Math.round((e.margin ?? 0) * 100)}%`
        : (e?.fixedPrice != null ? `цена ${e.fixedPrice}` : "—");
      onAuditPrice?.({ entity: "price", entityId: code, label: w?.name || code,
        field: "цена работы", action: "изменил прайс", old: fmtP(before), new: fmtP(after) });
    }
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
    setPriceSaving(false); setPriceMsg("✓ Прайс сохранён!"); setTimeout(()=>setPriceMsg(""),3000);
  };
  const saveCatalog = async (cat) => {
    if (!hasAdminPermission("adminCatalog")) return;
    // Авто-бэкап перед каждым сохранением каталога
    try {
      const prev = await storage.get(CATALOG_KEY);
      if (prev && prev.value) {
        const bRaw = await storage.get(CATALOG_BACKUPS_KEY);
        let bkps = []; try { if (bRaw?.value) bkps = JSON.parse(bRaw.value); } catch {}
        if (!Array.isArray(bkps)) bkps = [];
        if (!bkps[0] || bkps[0].data !== prev.value) {
          bkps.unshift({ ts: Date.now(), data: prev.value });
          await storage.set(CATALOG_BACKUPS_KEY, JSON.stringify(bkps.slice(0, 10)));
        }
      }
    } catch(e) { console.warn("catalog backup err", e); }
    await storage.set(CATALOG_KEY, JSON.stringify(cat)); setCatalogOverrides(cat); setLocalCatalog(cat);
    const allWorks = getEffectiveCatalog();
    setLocalPrices(prev => { const lp = {...(prev||{})}; for (const w of allWorks) { if (!lp[w.code]) lp[w.code] = { tiers:(w.tiers||[]).map(t=>({...t})), fixedPrice: w.fixedPrice!=null?String(w.fixedPrice):"" }; } return lp; });
  };
  const renameWork = async (code, newName) => { const cur = _catalogOverrides; await saveCatalog(withCatalogOverrides(cur, { renames: { ...(cur.renames||{}), [code]: newName } })); };
  const addCustomWork = async () => {
    const finalCat = newWork.cat === "__new__" ? (newWork.catNew||"").trim() : newWork.cat.trim();
    const finalSub = newWork.sub === "__new__" ? (newWork.subNew||"").trim() : newWork.sub.trim();
    if (!newWork.name.trim() || !finalCat || !finalSub) return;
    const cost = Number(newWork.cost) || 0;
    const marginPct = Math.min(99, Math.max(0, Number(newWork.margin) || 40));
    const fixedPrice = cost > 0 ? Math.round(cost / (1 - marginPct / 100)) : null;
    const priceFrom = newWork.priceFrom ? (Number(newWork.priceFrom) || null) : null;
    await saveCatalog({ ...(localCatalog||{}), custom: [...((localCatalog||{}).custom||[]), { code:"CUSTOM-"+Date.now(), cat:finalCat, sub:finalSub, name:newWork.name.trim(), unit:newWork.unit||"м²", tiers:[], cost, margin: marginPct/100, fixedPrice, ...(priceFrom ? {priceFrom} : {}) }] });
    setNewWork({cat:"", catNew:"", sub:"", subNew:"", name:"", unit:"м²", cost:"", margin:40, priceFrom:""}); setShowAddWork(false);
    Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const deleteCustomWork = async (code) => { await saveCatalog({ ...(localCatalog||{}), custom: ((localCatalog||{}).custom||[]).filter(w=>w.code!==code) }); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]); };
  const renameCat = async (origKey, newCat) => {
    if (!newCat.trim()) return;
    const cur = _catalogOverrides; const cr = { ...(cur.catRenames||{}), [origKey]: newCat.trim() }; const currentName = (cur.catRenames||{})[origKey] || origKey;
    await saveCatalog(withCatalogOverrides(cur, { catRenames:cr, custom:(cur.custom||[]).map(w => w.cat===currentName ? {...w,cat:newCat.trim()} : w) }));
    setEditingCat(null); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const renameSub = async (origCatKey, origSubKey, newSub) => {
    if (!newSub.trim()) return;
    const cur = _catalogOverrides; const key = origCatKey+"|"+origSubKey; const sr = { ...(cur.subRenames||{}), [key]: newSub.trim() };
    const curCat = (cur.catRenames||{})[origCatKey] || origCatKey; const curSub = (cur.subRenames||{})[key] || origSubKey;
    await saveCatalog(withCatalogOverrides(cur, { subRenames:sr, custom:(cur.custom||[]).map(w => w.cat===curCat && w.sub===curSub ? {...w,sub:newSub.trim()} : w) }));
    setEditingSub(null); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const deleteCat = async (origCatKey) => {
    const hc = [...new Set([...((localCatalog||{}).hiddenCats||[]), origCatKey])]; const curName = (localCatalog?.catRenames||{})[origCatKey] || origCatKey;
    await saveCatalog({ ...(localCatalog||{}), hiddenCats:hc, custom:((localCatalog||{}).custom||[]).filter(w => w.cat!==curName) }); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const deleteSub = async (origCatKey, origSubKey) => {
    const key = origCatKey+"|"+origSubKey; const hs = [...new Set([...((localCatalog||{}).hiddenSubs||[]), key])];
    const curCat = (localCatalog?.catRenames||{})[origCatKey] || origCatKey; const curSub = (localCatalog?.subRenames||{})[key] || origSubKey;
    await saveCatalog({ ...(localCatalog||{}), hiddenSubs:hs, custom:((localCatalog||{}).custom||[]).filter(w => !(w.cat===curCat && w.sub===curSub)) }); Object.keys(priceCardCache).forEach(k => delete priceCardCache[k]);
  };
  const roleLabel = r => {
    const role = ROLE_DEFINITIONS.find(x => x.key === r);
    return role ? `${role.icon} ${role.label}` : "👤 Замерщик";
  };
  const roleColor = r => r==="admin" ? "#ffffff" : r==="viewer" ? "#94a3b8" : "#94a3b8";
  const PRESENCE_ONLINE = 2 * 60 * 1000;
  const formatLastSeen = (ts) => {
    if (!ts) return "ещё не заходил";
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return "только что";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff/60000)} мин назад`;
    const d = new Date(ts), now = new Date();
    const time = d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate()-1);
    if (sameDay) return `сегодня в ${time}`;
    if (d.toDateString() === yest.toDateString()) return `вчера в ${time}`;
    return `${d.toLocaleDateString("ru-RU")} в ${time}`;
  };

  return (
    <div className="page" style={{maxWidth:1600}}>
      <div className="hero" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 70%,#283549 100%)",borderRadius:16,padding:"24px 28px",marginBottom:24,position:"relative",overflow:"hidden",boxShadow:"0 4px 20px rgba(15,23,42,.3)"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(59,130,246,.08)"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:"#fff"}}>⚙️ Администрирование</h1>
          <div style={{fontSize:13,color:"rgba(255,255,255,.75)",marginTop:4}}>Сотрудники и прайс-лист</div>
        </div>
      </div>

      {/* Табы */}
      <div className="admin-tabs" style={{display:"flex",gap:3,marginBottom:24,background:"#f8fafc",borderRadius:10,padding:4,overflowX:"auto"}}>
        {allowedAdminTabs.map(([t,label])=>(
          <button key={t} onClick={()=>{ setTab(t); setAdminSubTab("list"); }} style={{
            flex:1,padding:"11px",borderRadius:8,border:"none",cursor:"pointer",
            fontFamily:"inherit",fontSize:12,fontWeight:700,whiteSpace:"nowrap",
            background: tab===t ? "#fff" : "transparent",
            color: tab===t ? "#0f172a" : "#64748b",transition:"all .1s"
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
          <div style={{fontSize:24,marginBottom:8}}>⏳</div>Загрузка...
        </div>
      ) : tab === "permissions" ? (
        <RolePermissionsEditor
          rolePermissions={rolePermissions}
          onSaveRolePermissions={onSaveRolePermissions}
        />
      ) : tab === "documentTemplates" ? (
        <Suspense fallback={<div className="dt-empty">Загрузка редактора шаблонов…</div>}>
          <DocumentTemplateAdminRoute
            service={documentTemplateService}
            permissions={permissions}
            data={documentTemplateData}
          />
        </Suspense>
      ) : tab === "users" ? (
        <div>
          {/* Список сотрудников — карточки богатые (роль, онлайн, кнопки), поэтому шире: 2 колонки.
              min(480px,100%) вместо голых 480px: у minmax жёсткий минимум, и на телефоне
              колонка оставалась 480px при экране 360 — карточка вылезала за край, кнопка
              «Изменить» обрезалась. Так же исправлены остальные широкие сетки в файле. */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(480px,100%),1fr))",gap:10,marginBottom:20,alignItems:"start"}}>
            {users.map(u => (
              <div key={u.id} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"16px 18px"}}>
                <div className="user-row" style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  {/* Аватар */}
                  <div style={{width:42,height:42,borderRadius:10,background:"#eff6ff",border:"1px solid #eff6ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>
                    {ROLE_DEFINITIONS.find(r=>r.key===u.role)?.icon || "👤"}
                  </div>
                  <div style={{flex:1,minWidth:120}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{u.name}</span>
                      <span style={{fontSize:10,fontWeight:700,color:roleColor(u.role),background:"rgba(0,0,0,.04)",borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>{roleLabel(u.role)}</span>
                      {u.id === currentUser.id && <span style={{fontSize:10,color:"#94a3b8",background:"#e2e8f0",borderRadius:4,padding:"2px 7px"}}>вы</span>}
                      {(()=>{ const online = (presence[u.id]||0) > Date.now()-PRESENCE_ONLINE; return (
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:online?"#059669":"#94a3b8",background:online?"rgba(5,150,105,.1)":"rgba(0,0,0,.04)",borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap"}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:online?"#059669":"#cbd5e1",display:"inline-block"}}/>
                          {online?"В сети":formatLastSeen(presence[u.id])}
                        </span>); })()}
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>@{u.login}</div>
                  </div>
                  <div className="user-row-btns" style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>{setEditingUser(editingUser?.id===u.id?null:{id:u.id,name:u.name,login:u.login,role:u.role||"user"});setEditingPass(null);}}
                      style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      ✏ Изменить
                    </button>
                    <button onClick={()=>{setEditingPass(editingPass?.id===u.id?null:{id:u.id,val:""});setEditingUser(null);}}
                      style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      🔑
                    </button>
                    {u.id !== currentUser.id && (
                      <button onClick={()=>removeUser(u.id)}
                        style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:7,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>✕</button>
                    )}
                  </div>
                </div>
                {editingUser?.id === u.id && (
                  <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e2e8f0",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Имя</div><input className="fi" value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}/></div>
                      <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Логин</div><input className="fi" value={editingUser.login} onChange={e=>setEditingUser(p=>({...p,login:e.target.value}))}/></div>
                    </div>
                    <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Роль</div>
                      <select className="fi" value={editingUser.role||"user"} onChange={e=>setEditingUser(p=>({...p,role:e.target.value}))} disabled={u.id===currentUser.id}>
                        <option value="user">👤 Замерщик</option>
                        <option value="manager">🧑‍💼 Руководитель</option>
                        <option value="sales_head">📈 Руководитель отдела продаж</option>
                        <option value="foreman">🔨 Прораб</option>
                        <option value="admin">👑 Администратор</option>
                        <option value="viewer">👁 Наблюдатель</option>
                      </select>
                      {u.id===currentUser.id && <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Нельзя менять свою роль</div>}
                    </div>
                    <button onClick={saveUser} style={{background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      💾 Сохранить изменения
                    </button>
                  </div>
                )}
                {editingPass?.id === u.id && (()=>{ const weak = editingPass.val ? passwordTooWeak(editingPass.val) : null; return (
                  <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #e2e8f0"}}>
                    <div style={{display:"flex",gap:8}}>
                      <input className="fi" placeholder="Новый пароль" value={editingPass.val} onChange={e=>setEditingPass(p=>({...p,val:e.target.value}))}/>
                      <button onClick={()=>savePass(u.id)} disabled={!!weak} style={{background:weak?"#cbd5e1":"#2563eb",color:"#f3f4f6",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:weak?"default":"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        Сохранить
                      </button>
                    </div>
                    {weak && <div style={{marginTop:6,fontSize:11,color:"#dc2626"}}>{weak}</div>}
                  </div>
                ); })()}
              </div>
            ))}
          </div>

          {/* Добавить нового */}
          <div style={{background:"#f8fafc",border:"1px dashed #eff6ff",borderRadius:8,padding:"20px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#334155",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
              <span>＋</span> Новый сотрудник
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Имя</div><input className="fi" placeholder="Иван Иванов" value={newName} onChange={e=>setNewName(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Логин</div><input className="fi" placeholder="ivanov" value={newLogin} onChange={e=>setNewLogin(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Пароль</div><input className="fi" placeholder="••••••" value={newPass} onChange={e=>setNewPass(e.target.value)}/></div>
              <div><div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Роль</div>
                <select className="fi" value={newRole} onChange={e=>setNewRole(e.target.value)}>
                  <option value="user">👤 Замерщик</option>
                  <option value="manager">🧑‍💼 Руководитель</option>
                  <option value="sales_head">📈 Руководитель отдела продаж</option>
                  <option value="foreman">🔨 Прораб</option>
                  <option value="admin">👑 Администратор</option>
                  <option value="viewer">👁 Наблюдатель</option>
                </select>
              </div>
            </div>
            <button onClick={addUser} className="btn btn-g" style={{width:"100%"}}>
              + Добавить сотрудника
            </button>
          </div>

          {msg && <div style={{marginTop:14,textAlign:"center",fontSize:13,fontWeight:600,color: msg.startsWith("✓") ? "#059669" : "#dc2626",padding:"10px",background:msg.startsWith("✓")?"rgba(76,175,125,.08)":"rgba(220,38,38,.08)",borderRadius:8}}>{msg}</div>}
          {saving && <div style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:8}}>💾 Сохранение...</div>}
        </div>
      ) : tab === "clients" ? (
        /* КЛИЕНТЫ */
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {adminSubTab === "list" && (<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,color:"#94a3b8",fontSize:12}}>КЛИЕНТЫ ({clients.length})</div>
              {currentUser.role !== "viewer" && (
                <button onClick={()=>{ setAdminEditItem({mode:"newClient",data:{id:Date.now().toString(),name:"",phone:"",address:"",iin:"",doc:"",type:"физ",createdAt:Date.now(),createdById:currentUser.id}}); setAdminSubTab("clientEditor"); }}
                  className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
              )}
            </div>
            {clients.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#334155",fontSize:13}}>Клиентов пока нет</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(320px,100%),1fr))",gap:10}}>
            {clients.map(c=>(
              <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{c.name||"Без имени"}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>
                      {c.type==="физ"?"👤 Физ. лицо":"🏢 Юр. лицо"}
                      {c.iin&&<span style={{marginLeft:8}}>ИИН: {c.iin}</span>}
                    </div>
                    {c.phone&&<div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>📞 {c.phone}</div>}
                    {c.address&&<div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>📍 {c.address}</div>}
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {(currentUser.role==="admin"||(currentUser.role==="user"&&c.createdById===currentUser.id))&&(
                      <button onClick={()=>{ setAdminEditItem({mode:"editClient",data:{...c}}); setAdminSubTab("clientEditor"); }}
                        style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                    )}
                    {(currentUser.role==="admin"||(currentUser.role==="user"&&c.createdById===currentUser.id))&&(
                      <button onClick={async ()=>{ if(await confirmTyped("Удалить клиента «"+(c.name||"без имени")+"»?\nЭто действие нельзя отменить через интерфейс.")){ saveClients(clientsRef.current.filter(x=>x.id!==c.id),{removedIds:[c.id],allowEmpty:true}); logChange(currentUser,{entity:"client",entityId:c.id,label:c.name||"без имени",action:"удалил клиента",detail:c.phone||""}); } }}
                        style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </>)}
          {adminSubTab === "clientEditor" && adminEditItem && (<>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setAdminSubTab("list")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
              <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{adminEditItem.mode==="newClient"?"Новый клиент":"Редактировать клиента"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Тип</div>
                <select className="fi" value={adminEditItem.data.type||"физ"} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,type:e.target.value}}))}>
                  <option value="физ">Физ. лицо</option>
                  <option value="юр">Юр. лицо</option>
                </select>
              </div>
              {[
                ["ФИО / Название организации","name"],
                ["Телефон","phone"],
                ["Адрес","address"],
                ...(adminEditItem.data.type==="юр"
                  ? [["БИН","iin"],["Директор (полностью)","director"],["Директор (кратко)","directorShort"],["Банк","bank"],["БИК","bik"],["ИИК (номер счёта)","account"],["Почта","email"]]
                  : [["ИИН","iin"],["Документ (уд. личности)","doc"]]
                )
              ].map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={adminEditItem.data[field]||""} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,[field]:e.target.value}}))} placeholder={label}/>
                </div>
              ))}
            </div>
            <button className="btn btn-g" onClick={()=>{
              const d = adminEditItem.data;
              const list = adminEditItem.mode==="newClient" ? [...clients,d] : clients.map(x=>x.id===d.id?d:x);
              saveClients(list);
              setAdminSubTab("list");
            }}>← Готово</button>
          </>)}
        </div>
      ) : tab === "contragents" ? (
        /* РЕКВИЗИТЫ МОЙ ЮР. ЛИЦ */
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {adminSubTab === "list" && (<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,color:"#94a3b8",fontSize:12}}>МОИ ЮР. ЛИЦА / РЕКВИЗИТЫ ({contragents.length})</div>
              {currentUser.role==="admin" && (
                <button onClick={()=>{ setAdminEditItem({mode:"newCA",data:{id:Date.now().toString(),name:"",bin:"",bank:"",bik:"",account:"",director:"",phone:"",email:"",address:""}}); setAdminSubTab("caEditor"); }}
                  className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(320px,100%),1fr))",gap:10}}>
            {contragents.map(c=>(
              <div key={c.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{c.name}</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>БИН: {c.bin} · {c.bank}</div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>Директор: {c.director} · {c.phone}</div>
                  </div>
                  {currentUser.role==="admin" && (
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>{ setAdminEditItem({mode:"editCA",data:{...c}}); setAdminSubTab("caEditor"); }}
                        style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                      {contragents.length>1&&<button onClick={async ()=>{ if(await confirmTyped("Удалить реквизиты «"+(c.name||"без имени")+"»?\nЭто действие нельзя отменить через интерфейс.")) saveContragents(contragentsRef.current.filter(x=>x.id!==c.id),{removedIds:[c.id],allowEmpty:true}); }}
                        style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          </>)}
          {adminSubTab === "caEditor" && adminEditItem && (<>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setAdminSubTab("list")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
              <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{adminEditItem.mode==="newCA"?"Новые реквизиты":"Редактировать реквизиты"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{gridColumn:"1/-1"}}>
                <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Файл печати</div>
                <select className="fi" value={adminEditItem.data.stampFile||"stamp.jpg"} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,stampFile:e.target.value}}))}>
                  <option value="stamp.jpg">stamp.jpg</option>
                  <option value="stamp2.jpg">stamp2.jpg</option>
                </select>
              </div>
              {[["Название","name"],["БИН","bin"],["Банк","bank"],["БИК","bik"],["Расчётный счёт","account"],["Директор","director"],["Телефон","phone"],["Email","email"],["Адрес","address"]].map(([label,field])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}</div>
                  <input className="fi" value={adminEditItem.data[field]||""} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,[field]:e.target.value}}))} placeholder={label}/>
                </div>
              ))}
            </div>
            <button className="btn btn-g" onClick={()=>{
              const d = adminEditItem.data;
              const list = adminEditItem.mode==="newCA" ? [...contragents,d] : contragents.map(x=>x.id===d.id?d:x);
              saveContragents(list);
              setAdminSubTab("list");
            }}>← Готово</button>
          </>)}
        </div>
      ) : tab === "workers" ? (
        /* СПРАВОЧНИК ПОДРЯДЧИКОВ (рабочих) */
        (()=>{
          // статистика по подрядчику: сколько договоров подряда и на какую сумму
          const workerStats = (wid) => {
            const cs = (contracts||[]).filter(c=>!c.deletedAt && (c.type==="podryad"||c.type==="podryad_annex") && c.workerId===wid);
            const sum = cs.reduce((s,c)=>s+contractNetTotal(c),0);
            return { count: cs.length, sum };
          };
          const emptyWorker = () => ({ id:Date.now().toString(), name:"", iin:"", doc:"", phone:"", email:"", address:"", spec:"" });
          const wsearch = (workerSearch||"").trim().toLowerCase();
          const shown = wsearch
            ? workers.filter(w => [w.name,w.iin,w.phone,w.spec].filter(Boolean).some(v=>String(v).toLowerCase().includes(wsearch)))
            : workers;
          return (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {adminSubTab === "list" && (<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{fontWeight:700,color:"#94a3b8",fontSize:12}}>ПОДРЯДЧИКИ / РАБОЧИЕ ({workers.length})</div>
              {currentUser.role==="admin" && (
                <button onClick={()=>{ setAdminEditItem({mode:"newWorker",data:emptyWorker()}); setAdminSubTab("workerEditor"); }}
                  className="btn btn-g" style={{fontSize:12,padding:"6px 12px"}}>+ Добавить</button>
              )}
            </div>
            {workers.length>3 && (
              <input className="fi" placeholder="🔍 Поиск по ФИО, ИИН, телефону, специализации…" value={workerSearch} onChange={e=>setWorkerSearch(e.target.value)} />
            )}
            {workers.length===0 && (
              <div style={{textAlign:"center",padding:"28px 0",color:"#94a3b8",background:"#f9fafb",borderRadius:10,border:"1px dashed #e5e7eb",fontSize:13}}>
                Подрядчиков пока нет<br/>
                <span style={{fontSize:11,color:"#cbd5e1"}}>Нажмите <b>+ Добавить</b> — или создайте нового прямо в редакторе договора подряда</span>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(340px,100%),1fr))",gap:10}}>
            {shown.map(w=>{
              const st = workerStats(w.id);
              return (
              <div key={w.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                  <div style={{minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>🔨 {w.name||"Без имени"}</span>
                      {w.spec && <span style={{fontSize:10,fontWeight:700,color:"#059669",background:"#ecfdf5",borderRadius:4,padding:"1px 7px"}}>{w.spec}</span>}
                    </div>
                    <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>
                      {[w.iin&&("ИИН "+w.iin), w.phone, w.email].filter(Boolean).join(" · ")||"— реквизиты не заполнены"}
                    </div>
                    {w.address && <div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>📍 {w.address}</div>}
                    <div style={{fontSize:11,color:"#64748b",marginTop:4}}>
                      {st.count>0
                        ? <>Договоров подряда: <b>{st.count}</b> · на сумму <b>{fmt(st.sum)} ₸</b></>
                        : <span style={{color:"#cbd5e1"}}>Договоров подряда пока нет</span>}
                    </div>
                  </div>
                  {currentUser.role==="admin" && (
                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                      <button onClick={()=>{ setAdminEditItem({mode:"editWorker",data:{...w}}); setAdminSubTab("workerEditor"); }}
                        style={{background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✎</button>
                      <button onClick={async ()=>{
                          const s = workerStats(w.id);
                          if(s.count>0){ window.alert("Нельзя удалить подрядчика «"+(w.name||"без имени")+"»: он привязан к "+s.count+" договор(ам) подряда. Сначала открепите его от договоров, чтобы ничего не потерялось."); return; }
                          if(await confirmTyped("Удалить подрядчика «"+(w.name||"без имени")+"»?\nЭто действие нельзя отменить через интерфейс.")) saveWorkers(workersRef.current.filter(x=>x.id!==w.id),{removedIds:[w.id],allowEmpty:true});
                        }}
                        style={{background:"rgba(220,38,38,.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
            </div>
          </>)}
          {adminSubTab === "workerEditor" && adminEditItem && (<>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setAdminSubTab("list")} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18}}>←</button>
              <span style={{fontWeight:700,fontSize:15,color:"#0f172a"}}>{adminEditItem.mode==="newWorker"?"Новый подрядчик":"Редактировать подрядчика"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["ФИО","name"],["ИИН","iin"],["№ документа","doc"],["Специализация","spec"],["Телефон","phone"],["Email","email"],["Адрес","address"]].map(([label,field])=>(
                <div key={field} style={field==="address"?{gridColumn:"1/-1"}:undefined}>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{label}{field==="name"?" *":""}</div>
                  <input className="fi" value={adminEditItem.data[field]||""} onChange={e=>setAdminEditItem(p=>({...p,data:{...p.data,[field]:e.target.value}}))} placeholder={label}/>
                </div>
              ))}
            </div>
            <button className="btn btn-g" onClick={()=>{
              const d = {...adminEditItem.data, name:(adminEditItem.data.name||"").trim()};
              if(!d.name){ window.alert("Укажите ФИО подрядчика"); return; }
              const list = adminEditItem.mode==="newWorker" ? [...workers,d] : workers.map(x=>x.id===d.id?d:x);
              saveWorkers(list);
              setAdminSubTab("list");
            }}>← Готово</button>
          </>)}
        </div>
          );
        })()
      ) : tab === "prices" ? (
        /* ПРАЙС-ЛИСТ */
        <div style={{paddingBottom:90}}>
          {/* Поиск + кнопка добавить */}
          <div style={{display:"flex",gap:10,marginBottom:10,alignItems:"center"}}>
            <input className="fi" placeholder="🔍 Поиск по названию, подкатегории..." value={priceSearch} onChange={e=>setPriceSearch(e.target.value)} style={{flex:1}}/>
            {hasAdminPermission("adminCatalog") && <button onClick={()=>{
              const allW = getEffectiveCatalog();
              const cats = [...new Set(allW.map(w=>w.cat))];
              setNewWork({cat:cats[0]||"",catNew:"",sub:"",subNew:"",name:"",unit:"м²",cost:"",margin:40});
              setShowAddWork(true);
            }} className="btn btn-g" style={{whiteSpace:"nowrap"}}>
              ＋ Добавить позицию
            </button>}
              {hasAdminPermission("adminCatalog") && ((localCatalog?.hiddenCats||[]).length > 0 || (localCatalog?.hiddenSubs||[]).length > 0) && (
                <button onClick={()=>{
                if (!window.confirm(`Показать все скрытые категории и подкатегории?\nСкрыто категорий: ${(localCatalog?.hiddenCats||[]).length}, подкатегорий: ${(localCatalog?.hiddenSubs||[]).length}`)) return;
                saveCatalog({...(localCatalog||{}), hiddenCats:[], hiddenSubs:[]}); // в фон, без подвисания
              }} className="btn btn-o" style={{whiteSpace:"nowrap",color:"#dc2626",borderColor:"#fca5a5"}}>
                👁 Показать скрытые ({(localCatalog?.hiddenCats||[]).length + (localCatalog?.hiddenSubs||[]).length})
              </button>
            )}
            {hasAdminPermission("adminCatalog") && <button onClick={openCatalogBackups}
              style={{background:"rgba(0,0,0,.03)",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              🕘 Бэкапы
            </button>}
          </div>

          <EstimateSuggestionRulesEditor
            catalog={getEffectiveCatalog()}
            rules={resolveEstimateSuggestionRules(localCatalog, getEffectiveCatalog())}
            usesDefaults={localCatalog?.suggestionRules == null}
            disabled={!hasAdminPermission("adminCatalog")}
            onSave={rules => saveCatalog(withCatalogOverrides(localCatalog, { suggestionRules: rules }))}
          />

          {/* Модал бэкапов каталога */}
          {catalogBackupsModal !== null && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:320,padding:16}} onClick={()=>setCatalogBackupsModal(null)}>
              <div style={{background:"#fff",borderRadius:10,padding:"20px 22px",maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🕘 Бэкапы каталога</div>
                  <button onClick={()=>setCatalogBackupsModal(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#94a3b8"}}>✕</button>
                </div>
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>Снимки каталога перед каждым изменением (последние 10). Можно откатиться к любому.</div>
                {catalogBackupsModal.length===0 && <div style={{textAlign:"center",padding:"30px 0",color:"#94a3b8",fontSize:13}}>Бэкапов каталога пока нет — они появятся после первого изменения прайс-листа</div>}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {catalogBackupsModal.map((snap,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"#f9fafb",border:"1px solid #e2e8f0",borderRadius:8}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{new Date(snap.ts).toLocaleString("ru-RU")}</div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{i===0?"последний":""}</div>
                      </div>
                      <button onClick={()=>restoreCatalogBackup(snap)}
                        style={{background:"#eff6ff",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                        Восстановить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Быстрая навигация по категориям */}
          {!priceSearch && (()=>{
            const navCats = [...new Set(getEffectiveCatalog().map(w=>w.cat))];
            return navCats.length > 1 ? (
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12,padding:"8px 10px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                <span style={{fontSize:10,color:"#94a3b8",alignSelf:"center",marginRight:4,whiteSpace:"nowrap"}}>↓ Перейти:</span>
                {navCats.map(cat=>(
                  <button key={cat} onClick={()=>document.getElementById("price-cat-"+cat.replace(/\s/g,"_"))?.scrollIntoView({behavior:"smooth",block:"start"})}
                    style={{fontSize:11,padding:"3px 10px",borderRadius:5,border:"1px solid #e2e8f0",background:"#ffffff",color:"#334155",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    {cat}
                  </button>
                ))}
              </div>
            ) : null;
          })()}

          {/* Форма добавления */}
          {hasAdminPermission("adminCatalog") && showAddWork && (()=>{
            const allW = getEffectiveCatalog();
            const cats = [...new Set(allW.map(w=>w.cat))];
            const subs = newWork.cat ? [...new Set(allW.filter(w=>w.cat===newWork.cat).map(w=>w.sub))] : [];
            const inp = {background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:8,padding:"7px 10px",fontFamily:"inherit",fontSize:12,outline:"none"};
            return (
              <div style={{background:"#f8fafc",border:"1px solid #eff6ff",borderRadius:10,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:12}}>Новая позиция</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Категория</div>
                    <select value={newWork.cat} onChange={e=>setNewWork(p=>({...p,cat:e.target.value,sub:""}))} style={{...inp,width:"100%",cursor:"pointer"}}>
                      {cats.map(c=><option key={c} value={c}>{c}</option>)}
                      <option value="__new__">＋ Новая категория...</option>
                    </select>
                    {newWork.cat==="__new__"&&<input autoFocus placeholder="Название" value={newWork.catNew||""} onChange={e=>setNewWork(p=>({...p,catNew:e.target.value}))} style={{...inp,width:"100%",marginTop:6}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Подкатегория</div>
                    <select value={newWork.sub} onChange={e=>setNewWork(p=>({...p,sub:e.target.value}))} style={{...inp,width:"100%",cursor:"pointer"}} disabled={!newWork.cat}>
                      <option value="">— выбрать —</option>
                      {subs.map(s=><option key={s} value={s}>{s}</option>)}
                      <option value="__new__">＋ Новая подкатегория...</option>
                    </select>
                    {newWork.sub==="__new__"&&<input autoFocus placeholder="Название" value={newWork.subNew||""} onChange={e=>setNewWork(p=>({...p,subNew:e.target.value}))} style={{...inp,width:"100%",marginTop:6}}/>}
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Название работы</div>
                    <input placeholder="напр. Укладка паркета" value={newWork.name} onChange={e=>setNewWork(p=>({...p,name:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Ед. измерения</div>
                    <select value={newWork.unit} onChange={e=>setNewWork(p=>({...p,unit:e.target.value}))} style={{...inp,width:"100%",cursor:"pointer"}}>
                      {["м²","м.п.","шт","усл.","кг","л"].map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Себестоимость ₸</div>
                    <input type="number" min="0" placeholder="0" value={newWork.cost||""} onChange={e=>setNewWork(p=>({...p,cost:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:4}}>Маржа %</div>
                    <input type="number" min="0" max="100" placeholder="40" value={newWork.margin||""} onChange={e=>setNewWork(p=>({...p,margin:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#b8904a",marginBottom:4}}>Цена от ₸ <span style={{color:"#94a3b8"}}>(если нет точной)</span></div>
                    <input type="number" min="0" placeholder="необязательно" value={newWork.priceFrom||""} onChange={e=>setNewWork(p=>({...p,priceFrom:e.target.value}))} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addCustomWork} style={{flex:1,background:"#e2e8f0",color:"#94a3b8",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>✓ Добавить</button>
                  <button onClick={()=>{setShowAddWork(false);setNewWork({cat:"",sub:"",name:"",unit:"м²"});}} style={{background:"rgba(220,38,38,.1)",color:"#dc2626",border:"1px solid rgba(220,38,38,.1)",borderRadius:8,padding:"10px 16px",fontFamily:"inherit",fontSize:13,cursor:"pointer"}}>Отмена</button>
                </div>
              </div>
            );
          })()}

          {/* Таблица */}
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",minWidth:820,borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
              <colgroup>
                <col style={{width:"13%"}}/>
                <col style={{width:"24%"}}/>
                <col style={{width:"5%"}}/>
                <col style={{width:"11%"}}/>
                <col style={{width:"8%"}}/>
                <col style={{width:"12%"}}/>
                <col style={{width:"11%"}}/>
                <col style={{width:"11%"}}/>
                <col style={{width:"5%"}}/>
              </colgroup>
              <thead>
                <tr style={{background:"#ffffff",position:"sticky",top:0,zIndex:5}}>
                  {["Подкатегория","Название работы","Ед.","Себестоимость ₸","Маржа %","Цена для клиента ₸","Цена от ₸","Валовая прибыль ₸",""].map((h,i)=>(
                    <th key={i} style={{padding:"10px 12px",textAlign:i>=3&&i<=7?"right":"left",fontSize:10,fontWeight:700,color:h==="Цена от ₸"?"#b8904a":"#94a3b8",textTransform:"uppercase",letterSpacing:.5,borderBottom:"2px solid #e5e7eb",whiteSpace:"normal",overflowWrap:"normal",wordBreak:"keep-all",lineHeight:1.2,verticalAlign:"bottom"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(()=>{
                  const allWorks = getEffectiveCatalog();
                  const q = priceSearch.toLowerCase();
                  const filtered = allWorks.filter(w => !q || w.name.toLowerCase().includes(q) || w.sub.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q));
                  const catOrder = []; const catMap = {};
                  for(const w of filtered){
                    if(!catMap[w.cat]){catMap[w.cat]={_origCat:w._origCat||w.cat,works:[]};catOrder.push(w.cat);}
                    catMap[w.cat].works.push(w);
                  }
                  const btnS = {background:"transparent",border:"none",cursor:"pointer",padding:"2px 5px",lineHeight:1};
                  const rows = [];
                  catOrder.forEach(cat=>{
                    const origCat = catMap[cat]._origCat;
                    // Category header
                    rows.push(
                      <tr key={"cat-"+cat} id={"price-cat-"+cat.replace(/\s/g,"_")}>
                        <td colSpan={8} style={{padding:"10px 12px 6px",paddingTop:rows.length===0?10:20}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {editingCat?.key===origCat ? (
                              <>
                                <input autoFocus value={editingCat.val} onChange={e=>setEditingCat(p=>({...p,val:e.target.value}))}
                                  onKeyDown={e=>{if(e.key==="Enter")renameCat(origCat,editingCat.val);if(e.key==="Escape")setEditingCat(null);}}
                                  style={{background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:5,padding:"3px 10px",fontFamily:"inherit",fontSize:12,fontWeight:800,outline:"none",width:200}}/>
                                <button onClick={()=>renameCat(origCat,editingCat.val)} style={{...btnS,color:"#059669",fontSize:14}}>✓</button>
                                <button onClick={()=>setEditingCat(null)} style={{...btnS,color:"#334155",fontSize:14}}>✕</button>
                              </>
                            ) : (
                              <>
                                <span style={{fontSize:11,fontWeight:700,color:"#334155",letterSpacing:.5,textTransform:"uppercase"}}>{cat}</span>
                                {hasAdminPermission("adminCatalog") && <button onClick={()=>setEditingCat({key:origCat,val:cat})} title="Переименовать" style={{...btnS,color:"#2563eb",opacity:.5,fontSize:11}}>✏️</button>}
                                {hasAdminPermission("adminCatalog") && <button onClick={()=>{if(window.confirm(`Удалить категорию "${cat}"?`))deleteCat(origCat);}} title="Удалить" style={{...btnS,color:"#dc2626",opacity:.5,fontSize:11}}>🗑</button>}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    // Group by sub within cat
                    const subOrder = []; const subMap = {};
                    catMap[cat].works.forEach(w=>{
                      if(!subMap[w.sub]){subMap[w.sub]={_origSub:w._origSub||w.sub,works:[]};subOrder.push(w.sub);}
                      subMap[w.sub].works.push(w);
                    });
                    subOrder.forEach(sub=>{
                      const origSub = subMap[sub]._origSub;
                      subMap[sub].works.forEach((w,i)=>{
                        const ov = localPrices?.[w.code];
                        const baseCost = w.cost ?? null;
                        const baseMargin = w.margin ?? 0.4;
                        const ovCost = ov?.cost !== undefined ? ov.cost : baseCost;
                        const ovMargin = ov?.margin !== undefined ? ov.margin : baseMargin;
                        const price = (ovCost !== null && ovCost !== "" && Number(ovCost) > 0) ? Math.round(Number(ovCost) / (1 - Math.min(0.99, Math.max(0, Number(ovMargin)||0)))) : (ov?.fixedPrice || w.fixedPrice || null);
                        const profit = (ovCost !== null && ovCost !== "" && Number(ovCost) > 0 && price) ? price - Number(ovCost) : null;
                        const isEven = rows.length % 2 === 0;
                        rows.push(
                          <tr key={w.code} style={{background:isEven?"transparent":"rgba(255,255,255,.015)",borderBottom:"1px solid rgba(0,0,0,.03)"}}>
                            {/* Подкатегория */}
                            <td style={{padding:"8px 12px",verticalAlign:"top",borderRight:"1px solid #e5e7eb",color:i===0?"#94a3b8":"transparent",fontSize:11}}>
                              {i===0 && (
                                <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                                  {editingSub?.cat===origCat&&editingSub?.key===origSub ? (
                                    <span style={{display:"contents"}}>
                                      <input autoFocus value={editingSub.val} onChange={e=>setEditingSub(p=>({...p,val:e.target.value}))}
                                        onKeyDown={e=>{if(e.key==="Enter")renameSub(origCat,origSub,editingSub.val);if(e.key==="Escape")setEditingSub(null);}}
                                        style={{background:"#f8fafc",border:"1px solid #e2e8f0",color:"#94a3b8",borderRadius:5,padding:"2px 7px",fontFamily:"inherit",fontSize:11,outline:"none",width:120}}/>
                                      <button onClick={()=>renameSub(origCat,origSub,editingSub.val)} style={{...btnS,color:"#059669",fontSize:12}}>✓</button>
                                      <button onClick={()=>setEditingSub(null)} style={{...btnS,color:"#94a3b8",fontSize:12}}>✕</button>
                                    </span>
                                  ) : (
                                    <span style={{display:"contents"}}>
                                      <span style={{color:"#94a3b8",fontSize:11}}>{sub}</span>
                                      {hasAdminPermission("adminCatalog") && <button onClick={()=>setEditingSub({cat:origCat,key:origSub,val:sub})} style={{...btnS,color:"#94a3b8",fontSize:10,opacity:.6}}>✏️</button>}
                                      {hasAdminPermission("adminCatalog") && <button onClick={()=>{if(window.confirm("Удалить подкатегорию?"))deleteSub(origCat,origSub);}} style={{...btnS,color:"#dc2626",fontSize:10,opacity:.6}}>🗑</button>}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            {/* Название работы */}
                            <td style={{padding:"6px 12px"}}>
                              {editingUser?.id===w.code ? (
                                <div style={{display:"flex",gap:4}}>
                                  <input autoFocus value={editingUser.name} onChange={e=>setEditingUser(p=>({...p,name:e.target.value}))}
                                    onKeyDown={e=>{if(e.key==="Enter"){renameWork(w.code,editingUser.name);setEditingUser(null);}if(e.key==="Escape")setEditingUser(null);}}
                                    style={{flex:1,background:"#f8fafc",border:"1px solid #2563eb",color:"#0f172a",borderRadius:5,padding:"3px 8px",fontFamily:"inherit",fontSize:12,outline:"none"}}/>
                                  <button onClick={()=>{renameWork(w.code,editingUser.name);setEditingUser(null);}} style={{...btnS,color:"#059669",fontSize:13}}>✓</button>
                                  <button onClick={()=>setEditingUser(null)} style={{...btnS,color:"#334155",fontSize:13}}>✕</button>
                                </div>
                              ) : (
                                <div style={{display:"flex",alignItems:"center",gap:4}}>
                                  <span style={{color:"#0f172a",flex:1}}>{w.name}</span>
                                  {hasAdminPermission("adminCatalog") && <button onClick={()=>setEditingUser({id:w.code,name:w.name})} style={{...btnS,color:"#94a3b8",fontSize:10,opacity:.5,flexShrink:0}}>✏️</button>}
                                </div>
                              )}
                            </td>
                            {/* Ед. */}
                            <td style={{padding:"6px 8px",color:"#94a3b8",textAlign:"center",fontSize:11}}>{w.unit}</td>
                            {/* Себестоимость */}
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              <input type="number" min="0"
                                disabled={!hasAdminPermission("adminPrices")}
                                placeholder={baseCost !== null ? String(baseCost) : "—"}
                                value={ovCost !== null && ovCost !== undefined ? ovCost : ""}
                                onChange={e=>{
                                  const val = e.target.value === "" ? null : Number(e.target.value);
                                  setLocalPrices(prev=>({...prev,[w.code]:{...(prev?.[w.code]||{}),cost:val}}));
                                  priceCardCache[w.code] = {...(priceCardCache[w.code]||{}), cost:val, margin:ovMargin};
                                }}
                                style={{width:"100%",background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:5,padding:"4px 8px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
                              />
                            </td>
                            {/* Маржа */}
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:3}}>
                                <input type="number" min="0" max="100" step="1"
                                  disabled={!hasAdminPermission("adminPrices")}
                                  value={Math.round(ovMargin*100)}
                                  onChange={e=>{
                                    const val = e.target.value===""?baseMargin:Math.min(0.99, Math.max(0, Number(e.target.value)/100));
                                    setLocalPrices(prev=>({...prev,[w.code]:{...(prev?.[w.code]||{}),margin:val}}));
                                    priceCardCache[w.code] = {...(priceCardCache[w.code]||{}), margin:val, cost:ovCost};
                                  }}
                                  style={{width:50,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#0f172a",borderRadius:5,padding:"4px 6px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
                                />
                                <span style={{color:"#94a3b8",fontSize:10}}>%</span>
                              </div>
                            </td>
                            {/* Цена для клиента */}
                            <td style={{padding:"6px 12px",textAlign:"right",fontWeight:700,color:"#0f172a",whiteSpace:"nowrap"}}>
                              {price ? new Intl.NumberFormat("ru-RU").format(price)+" ₸" : "—"}
                            </td>
                            {/* Цена от */}
                            <td style={{padding:"6px 8px",textAlign:"right"}}>
                              <input type="number" min="0"
                                disabled={!hasAdminPermission("adminPrices")}
                                placeholder="—"
                                value={ov?.priceFrom !== undefined ? ov.priceFrom : (w.priceFrom || "")}
                                onChange={e=>{
                                  const val = e.target.value === "" ? undefined : Number(e.target.value);
                                  setLocalPrices(prev=>({...prev,[w.code]:{...(prev?.[w.code]||{}),priceFrom:val}}));
                                  priceCardCache[w.code] = {...(priceCardCache[w.code]||{}), priceFrom:val};
                                }}
                                style={{width:"100%",background:"#fffbf0",border:"1px solid #e5d78e",color:"#92610a",borderRadius:5,padding:"4px 8px",textAlign:"right",fontFamily:"inherit",fontSize:12,outline:"none"}}
                              />
                            </td>
                            {/* Валовая прибыль */}
                            <td style={{padding:"6px 12px",textAlign:"right",color:"#059669",whiteSpace:"nowrap"}}>
                              {profit ? new Intl.NumberFormat("ru-RU").format(Math.round(profit))+" ₸" : "—"}
                            </td>
                            {/* Удалить */}
                            <td style={{padding:"6px 8px",textAlign:"center"}}>
                              {hasAdminPermission("adminCatalog") && <button onClick={()=>{
                                if(!window.confirm(`Удалить "${w.name}"?`))return;
                                if(w.code.startsWith("CUSTOM-")) deleteCustomWork(w.code);
                                else { const hc=[...new Set([...((localCatalog||{}).hiddenCodes||[]),w.code])]; saveCatalog({...(localCatalog||{}),hiddenCodes:hc}); }
                              }} style={{...btnS,color:"#dc2626",fontSize:13}}>🗑</button>}
                            </td>
                          </tr>
                        );
                      });
                    });
                  });
                  if(rows.length===0) rows.push(<tr key="empty"><td colSpan={9} style={{textAlign:"center",padding:"40px",color:"#94a3b8"}}>Ничего не найдено</td></tr>);
                  return rows;
                })()}
              </tbody>
            </table>
          </div>

          {/* ↑ Наверх */}
          <button onClick={()=>document.getElementById("price-cat-"+getEffectiveCatalog().map(w=>w.cat)[0]?.replace(/\s/g,"_"))?.scrollIntoView({behavior:"smooth",block:"start"})}
            className="float-fab" style={{position:"fixed",bottom:80,right:32,background:"#2563eb",color:"#f3f4f6",border:"none",borderRadius:999,width:40,height:40,fontSize:18,cursor:"pointer",boxShadow:"0 2px 10px rgba(0,0,0,.2)",zIndex:30,display:"flex",alignItems:"center",justifyContent:"center"}}>
            ↑
          </button>

          {/* Индикатор автосохранения */}
          {(priceMsg || priceSaving) && (
            <div className="save-strip" style={{position:"fixed",bottom:0,left:"220px",right:0,background:"#f8fafc",borderTop:"1px solid #e2e8f0",padding:"10px 24px",zIndex:20,textAlign:"center"}}>
              {priceMsg && <span style={{fontSize:13,color:"#059669",fontWeight:700}}>{priceMsg}</span>}
              {priceSaving && !priceMsg && <span style={{fontSize:12,color:"#94a3b8"}}>💾 Сохранение...</span>}
            </div>
          )}
        </div>
      ) : null}

      {/* ── БЭКАПЫ ── */}
      {tab === "backups" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* ── ФАЙЛ-БЭКАП: скачать всё в JSON / залить назад / сметы в Excel ── */}
          <div style={{fontWeight:700,color:"#334155",fontSize:14,marginBottom:2}}>Бэкап в файл (перед мержем / на всякий случай)</div>
          <div style={{fontSize:12,color:"#94a3b8",marginBottom:4}}>Скачивает ВСЕ рабочие данные (объекты, договоры, сметы, клиенты, финансы, производство, акты, реквизиты, подрядчики) одним JSON-файлом на ваш компьютер. Этим же файлом можно всё вернуть назад.</div>
          {hasAdminPermission("adminBackups") && (
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:180,flex:1}}>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>⬇️ Скачать полный бэкап (JSON)</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Файл сохранится на компьютер. Храните его до и после мержа.</div>
            </div>
            <button onClick={onExportAll} style={{background:"#0f172a",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:12.5,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:700}}>⬇️ Скачать JSON</button>
          </div>
          )}
          {hasAdminPermission("adminRestore") && (
          <div style={{background:"#fff",border:"1px solid #fde68a",borderRadius:10,padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:180,flex:1}}>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>⬆️ Восстановить из файла (JSON)</div>
              <div style={{fontSize:12,color:"#b45309",marginTop:2}}>Заменит текущие данные данными из файла. Спросит подтверждение «ВОССТАНОВИТЬ». Перед заменой всё уходит в авто-бэкап.</div>
            </div>
            <label style={{background:"#fffbeb",color:"#b45309",border:"1px solid #fde68a",borderRadius:8,padding:"9px 18px",fontSize:12.5,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:700}}>
              ⬆️ Выбрать файл…
              <input type="file" accept="application/json,.json" style={{display:"none"}} onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; if(f) onImportAll(f); }} />
            </label>
          </div>
          )}
          {hasAdminPermission("adminBackups") && (
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{minWidth:180,flex:1}}>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📊 Сметы в Excel</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Таблица всех смет: название, клиент, адрес, дата, статус, кол-во позиций, сумма. Откроется в Excel.</div>
            </div>
            <button onClick={onExportEstimatesXls} style={{background:"rgba(5,150,105,.08)",color:"#059669",border:"1px solid rgba(5,150,105,.25)",borderRadius:8,padding:"9px 18px",fontSize:12.5,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:700}}>📊 Выгрузить сметы</button>
          </div>
          )}

          {/* ── Внутренние авто-снимки Firebase ── */}
          {hasAdminPermission("adminRestore") && (<>
          <div style={{fontWeight:700,color:"#334155",fontSize:14,marginTop:12,marginBottom:2}}>Авто-снимки в базе</div>
          <div style={{fontSize:12,color:"#94a3b8",marginBottom:4}}>Снимки рабочего пространства создаются автоматически при изменениях. Восстановление возвращает всё целиком на выбранный момент.</div>
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>📦 Объекты, сметы и договора</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Единый снимок: объекты + вложенные сметы и договора</div>
            </div>
            <button onClick={onBackupWorkspace} style={{background:"rgba(37,99,235,.08)",color:"#2563eb",border:"1px solid rgba(37,99,235,.2)",borderRadius:8,padding:"8px 16px",fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",fontWeight:700}}>
              🕘 Просмотреть бэкапы
            </button>
          </div>
          </>)}
        </div>
      )}

      {tab === "audit" && <AuditTab />}

      {tab === "check" && (()=>{
        const reds = checkIssues.filter(i=>i.sev==="red").length;
        const yellows = checkIssues.length - reds;
        const verdict = reds>0 ? { color:"#dc2626", bg:"#fef2f2", bd:"#fecaca", icon:"🔴", text:"Есть критичные ошибки — не рекомендуется мерж/релиз до исправления" }
          : yellows>0 ? { color:"#92610f", bg:"#fffbeb", bd:"#fde68a", icon:"🟡", text:"Есть предупреждения — данные не сломаны, но стоит проверить" }
          : { color:"#059669", bg:"#f0fdf4", bd:"#bbf7d0", icon:"🟢", text:"База чистая — можно релизить" };
        return (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{fontSize:12.5,color:"#64748b",lineHeight:1.5}}>Проверка связей и целостности данных перед мержем в <b>main</b>, импортом или чисткой базы. Read-only — ничего не меняет. Клик по проблеме открывает нужную карточку.</div>
            <div style={{background:verdict.bg,border:`1px solid ${verdict.bd}`,borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:26}}>{verdict.icon}</span>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:verdict.color}}>{reds>0?`${reds} критичных · ${yellows} предупреждений`:yellows>0?`${yellows} предупреждений`:"Проблем не найдено"}</div>
                <div style={{fontSize:12.5,color:verdict.color,opacity:.9,marginTop:2}}>{verdict.text}</div>
              </div>
            </div>
            <IssuePanel issues={checkIssues} onNav={onNavIssue} emptyText="✓ База чистая — связи и целостность в порядке" />
          </div>
        );
      })()}
    </div>
  );
}

// Карточка с полностью локальным состоянием — изолирована от родителя
// Принимает начальные данные ОДИН РАЗ, дальше живёт сама
// При размонтировании сохраняет данные в priceCardCache
export const priceCardCache = {};
