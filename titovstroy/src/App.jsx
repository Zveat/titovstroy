import { useState, useMemo, useEffect, useCallback, useRef, Fragment, lazy, Suspense } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, runTransaction, onValue } from "firebase/database";
import ProductionModule, { flushPendingProduction, stopProductionSession, hasPendingProduction, productionDraftsAreDurable, startProductionSession, setProductionCommandHandler } from "./production/ProductionModule.jsx";
import { emptyProduction } from "./production/constants.js";
import { applyProductionCommand, runVerifiedProductionTransaction, accountProductionFailure, isBlockedWhileEnding, awaitQueueSettled, isRegenerableProductionCommand, productionCommandObjectIds, _stageKey, normalizeProductionIds } from "./production/commands.js";
import { countAllProductionRecovery, listProductionRetries, saveProductionRetry, removeProductionRetry } from "./production/drafts.js";
import { MASTER_CATEGORIES, NAIMI_CITY_FALLBACK, OLX_REPAIR_CATEGORIES } from "./masters/catalog.mjs";
import { SearchMultiSelect, SearchSelect as MasterSearchSelect } from "./masters/MasterSelects.jsx";
import { parserRunMessage, triggerParserRun } from "./masters/parserTrigger.js";
import { MasterCrmButton, MasterCrmDatabase, MasterCrmEditor } from "./masters/MasterCRM.jsx";
import { interactionsForContact, masterSourceKey, normalizeMasterCrm } from "./masters/masterCrm.js";
import { EstimateSuggestions, EstimateSuggestionRulesEditor } from "./estimate/EstimateSuggestions.jsx";
import ObjectDispatcher from "./object-control/ObjectDispatcher.jsx";
import { AnalyticsBlocks } from "./analytics/AnalyticsBlocks.jsx";
import { PayrollModule } from "./payroll/PayrollModule.jsx";
import { STAFF_KEY, STAFF_BACKUPS_KEY, PAYROLL_MAP_KEY } from "./payroll/payrollModel.js";
import { ACCRUALS_KEY, ACCRUALS_BACKUPS_KEY } from "./payroll/payrollAccruals.js";
import { Dashboard } from "./analytics/Dashboard.jsx";
import { buildAnalytics, makeManagerResolver, REFUSE_REASONS } from "./analytics/analyticsModel.js";
import { DOCUMENT_TEMPLATE_BACKUP_SECTIONS, documentTemplateBackupSpecs, restoreDocumentTemplateSections } from "./documents/documentTemplateBackup.js";
import { createDocumentTemplateFeaturePolicy } from "./documents/documentTemplateKeys.js";
import { createDocumentTemplateRuntime } from "./documents/documentTemplateRuntime.js";
import { getAuth, signInAnonymously, signInWithCustomToken, signOut, onAuthStateChanged } from "firebase/auth";
import { clientPhotosByStage, stageReportsKey, normalizeStageReports } from "./stage-reports/model.js";
import { requestServerLogin, lockoutMessage } from "./auth/loginClient.js";
import { backupIndexKey, backupItemKey, normalizeIndex, pushIndex, mergeBackupViews, makeSnapshot, loadSnapshotData } from "./backups.js";
import { ClientPhotoReport, ClientTabs, PhotoLightbox, stagesWithPhotos } from "./stage-reports/ClientPhotos.jsx";
import { normCN, contractNetTotal, clientUnitPrice, basePriceFromClient, lineTotal, CATALOG_DEFAULTS, withCatalogOverrides, groupData, tengeInWords, DEFAULT_FIN_META, mergeFinMeta, computeIssues, estimatesForObject, financeProjectMatchesSearch, applyWorkPricingOverride, createEstimatePricingSnapshot, resolveEstimateRowWork, sealLegacyEstimateRows, resolveEstimateRows, existingEstimateRowKey, buildCalendarStages, foremanLoad, classifyCloudArr, classifyCloudObj, preBackupDecision, mergeAuditEntries, validateBackupSchema, isBackupRestorable, makeDirtyMarker, listOwnedDirty, adoptUserDirty, discardOwnedDirty, listFlushableDirty, visibleDirtyKeys, isLegacyDirtyMarker, mayClearDirtyOnSuccess, mayUseLocalCopy, clearSyncedLocalMirror, compactLocalStorageMirrors, resolveVerifiedCloudRead, isStaleApprovalObject, isPermissionDenied, buildEstimatorDashboard, buildFinanceProjectView, financeStatusMeta, isActiveFinanceStatus, buildAuthorizedObjectPatch, matchesFinanceOperationsPreset, summarizeFinanceOperations, sortProductionStages, sumPaidProductionStages, resolveProgressBudget, startPublicProgressAutoRefresh, resolveEstimateSuggestionRules, buildEstimateSuggestions, resolveFinanceProjectBudget, splitAuditMonths, ROLE_DEFINITIONS, DEFAULT_ROLE_PERMISSIONS, normalizeRolePermissions, permissionsForRole, accessAllows, docTypeAllows, EDIT_LEASE_KEY, LEASE_HEARTBEAT_MS, makeLease, parseLease, ownsActiveLease, claimFallbackLease, SAVE_FAIL_REASONS, saveFailReasonText, saveFailLabel, mergeSaveFail, clearSaveFailsFor, saveFailIdsFor, warrantyState, summarizeWarrantyClaims, WARRANTY_CLAIM_STATUSES, WARRANTY_DEFAULT_MONTHS } from "./utils.js";
import { WORKS_DATA } from "./catalog/worksData.js";
// Ключи узлов Firebase — все в одном месте, см. src/storageKeys.js
import {
  OBJECTS_KEY, OBJECTS_BACKUPS_KEY, PRODUCTIONS_KEY, PRODUCTIONS_BACKUPS_KEY, REPORTS_KEY,
  REPORTS_BACKUPS_KEY, WORKERS_KEY, WORKERS_BACKUPS_KEY, PODRYADS_KEY, PODRYADS_BACKUPS_KEY, MASTERS_KEY,
  MASTERS_CONFIG_KEY, MASTERS_OLX_KEY, MASTERS_OLX_CONFIG_KEY, MASTERS_CRM_KEY, WORKSPACE_BACKUPS_KEY,
  DEALS_KEY, DEALS_BACKUPS_KEY, STORAGE_KEY, BACKUPS_KEY, USERS_KEY, USERS_BACKUPS_KEY,
  ROLE_PERMISSIONS_KEY, ROLE_PERMISSIONS_BACKUPS_KEY, SESSION_KEY, PRESENCE_KEY, PRICES_KEY,
  PRICES_BACKUPS_KEY, PUBLIC_NODES_BACKUPS_KEY, CATALOG_BACKUPS_KEY, CONTRACTS_BACKUPS_KEY,
  CLIENTS_BACKUPS_KEY, CONTRAGENTS_BACKUPS_KEY, CATALOG_KEY, CONTRACTS_KEY, CLIENTS_KEY, CONTRAGENTS_KEY,
  AUDIT_KEY, AUDIT_INDEX_KEY, AUDIT_MONTH_KEY, FINANCE_TX_KEY, FINANCE_TX_BACKUPS_KEY, FINANCE_META_KEY,
  FINANCE_META_BACKUPS_KEY, FINANCE_PROJECTS_KEY, FINANCE_PROJECTS_BACKUPS_KEY, LOGIN_ATTEMPTS_KEY
} from "./storageKeys.js";

// Вынесено из этого файла в отдельные модули (перенос без изменения логики):
import { AdminPageContent, priceCardCache } from "./admin/AdminPageContent.jsx";
import { AuditTab } from "./admin/AuditTab.jsx";
import { RolePermissionsEditor } from "./admin/RolePermissions.jsx";
import { IS_DEV_ENV, _env, confirmDangerous, firebaseConfig } from "./appConfig.js";
import { clearLoginAttempts, getLoginLockout, hashPassword, passwordTooWeak, registerFailedLogin, verifyPassword } from "./auth/loginGuard.js";
import { _finTypeLbl, _objLabel, _tng, logChange, logContractSave, logObjChange, writeAudit } from "./cloud/audit.js";
import { _dirtyOwnerUid, _editorGateN, _fbAuthReady, _mem, _restToken, hasStaffClaim, nextEditorGate, signOutStaff, storage } from "./cloud/storage.js";
import { ASSET_INC_KEYS, ASSET_OUT_KEYS, AUDIT_SECTION_META, AUDIT_SOURCE_META, COMPANY_WA, CONTRACT_STATUSES, C_ASSET_INC, C_ASSET_OUT, C_FINACT, C_FINANCING_INC, C_INVEST, DEAL_STATUSES, DEAL_TO_PROD, DEFAULT_USERS, DOCS_NODE, EMPTY_PROJ, EXTRA_CAT, FA_SUB_MAP, KP_NODE, OBJ_TYPES, PRICE_SEAL_REASONS, PROD_TO_DEAL, PROGRESS_NODE, STATUSES, _PROG_ST, _auditActionMeta, _auditVal } from "./constants.js";
import { ContractEditor } from "./contracts/ContractEditor.jsx";
import { IssuePanel } from "./dashboard/IssuePanel.jsx";
import { OperationsPanel } from "./dashboard/OperationsPanel.jsx";
import { StaleObjectsPanel } from "./dashboard/StaleObjectsPanel.jsx";
import { buildAvrHtml, buildContractHtml as _buildContractHtml, buildPodryadHtml as _buildPodryadHtml,
  generateContractDocxLegacy, generateContractGDocLegacy as _generateContractGDocLegacy,
  podryadContractToModel } from "./documents/legacyDocs.js";
import { migrateRowsToCodeKeys } from "./estimate/rowKeys.js";
import { BalanceSheet } from "./finance/BalanceSheet.jsx";
import { _auditYM, _ts, downloadCSV, fmt, fmtDate, genId, kpStatusText, openOrPrintHtml, today } from "./format.js";
import { KPContent } from "./kp/KPContent.jsx";
import { PublicKP } from "./kp/PublicKP.jsx";
import { MastersSection } from "./masters/MastersSection.jsx";
import { _catalogOverrides, getBasePrice, getEffectiveCatalog, getEffectiveWork, getEstimateRowPrice, getPrice, rowCostPerUnit, setCatalogOverrides, setOnCatalogChange, setPriceOverrides } from "./pricing.js";
import { ProductionCalendar } from "./production/ProductionCalendar.jsx";
import { PublicProgress } from "./public/PublicProgress.jsx";
import { LoginScreen } from "./screens/LoginScreen.jsx";
import { DangerConfirmModal, confirmTyped } from "./ui/DangerConfirm.jsx";
import { NumInput, SearchSelect } from "./ui/Inputs.jsx";

const DocumentInstanceEditor = lazy(() => import("./documents/DocumentInstanceEditor.jsx"));
const DOCUMENT_TEMPLATE_FEATURE = createDocumentTemplateFeaturePolicy();

// Debounce hook — задерживает обновление значения, чтобы не тригерить ре-рендер на каждый символ
function useDebounce(value, ms) {
  const [dv, setDv] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDv(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return dv;
}


// ─── ГЛАВНЫЙ КОМПОНЕНТ ───────────────────────────────────────────────────────


// ── Генерация договора: HTML / PDF / DOCX / WhatsApp ──


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
  if (_kpId) return <PublicKP id={_kpId} />;
  // Публичная страница прогресса объекта по ссылке #/progress/<токен> — без входа
  const _progToken = (() => { const m = (typeof window !== "undefined" ? (window.location.hash || "") : "").match(/^#\/progress\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; })();
  if (_progToken) return <PublicProgress token={_progToken} />;
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
    const gateSession = nextEditorGate();
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


function MainApp({ currentUser, setCurrentUser, editorTab, takeoverEditLease }) {
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    setOnCatalogChange(() => setCatalogVersion(v => v + 1));
    return () => { setOnCatalogChange(null); };
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
  // Вход в браузере остался анонимным (заходили до перевода на серверный вход) — база
  // закрыта правилами и ничего не отдаёт. Лечится одним повторным входом.
  const [needsReauth, setNeedsReauth] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      // ЖДЁМ восстановления сессии. Firebase поднимает её из браузера асинхронно, и без
      // этого ожидания проверка попадает в момент, когда currentUser ещё null — плашка
      // показывалась у того, у кого всё в порядке.
      try { await _fbAuthReady; } catch {}
      const ok = await hasStaffClaim();
      if (alive) setNeedsReauth(!ok);
    })();
    return () => { alive = false; };
  }, []);
  const [dirtyCount, setDirtyCount] = useState(0); // СВОИ незасинканные dirty-записи storage (этот пользователь+вкладка) — участвует в баннере
  const [legacyDirtyN, setLegacyDirtyN] = useState(0); // legacy-маркеры без владельца (карантин — не авто-отправляются)
  const [deniedN, setDeniedN] = useState(0); // записи, отбитые ПРАВАМИ базы (не сетью) — в баннере отдельной строкой
  // Отказ базы по правам — это НЕ обязательно «роль без прав». Интерфейс держит вход в
  // localStorage 30 дней, а сессия Firebase к этому моменту может стать анонимной: тогда
  // база отбивает ЛЮБУЮ запись, хотя с ролью всё в порядке, а данные на экране приходят
  // из локального кеша и выглядят живыми. Ловили на боевой: телефон показывал дашборд с
  // настоящими цифрами и одновременно «у вашей роли нет прав» на журнал.
  // Признак сотрудника проверяется один раз при запуске, поэтому перепроверяем его после
  // первого же отказа — иначе человека отправляет к администратору за правами тот, у кого
  // с правами всё хорошо и нужно просто войти заново.
  useEffect(() => {
    if (!deniedN) return;
    let alive = true;
    (async () => { const ok = await hasStaffClaim(); if (alive) setNeedsReauth(!ok); })();
    return () => { alive = false; };
  }, [deniedN]);
  const [cloudError, setCloudError] = useState(false); // последнее сохранение не ушло в облако (только локально)
  // ── РЕЕСТР НЕСОХРАНЁННОГО ───────────────────────────────────────────────────
  // Отказ записи внутри saveListProtected/saveEstimates возвращал undefined, и почти
  // все вызывающие это молча проглатывали (фоновый .catch, оптимистичный UI). Итог —
  // «внёс, вышел, зашёл, а данных нет». Теперь КАЖДЫЙ отказ попадает сюда: видно, какой
  // раздел не сохранился и почему, а payload остаётся в памяти и уходит по «Повторить».
  // Одна запись на пару ключ+причина (повторы только считаются), payload — самый свежий.
  const [saveFails, setSaveFails] = useState([]);        // [{key,label,reason,ts,count}]
  const _saveFailPayloads = useRef(new Map());           // failId -> функция повтора
  const _saveListProtectedQueued = useRef(null);         // ссылка на saveListProtected (объявлен ниже)
  const _retryFailedSavesRef = useRef(null);             // ссылка на retryFailedSaves (объявлен ниже)
  const _saveFailsRef = useRef([]);                      // для endSessionSafely — без пересоздания колбэка
  // Одна строка на пару ключ+причина: повторные отказы только увеличивают счётчик, а
  // payload заменяется свежим, чтобы «Повторить» отправило РОВНО те данные, что не ушли
  // (слияние по id внутри сейва не даст откатить чужие правки).
  const _reportSaveFail = useCallback((key, reason, runRetry) => {
    // read-only-tab уже объяснён отдельным серым баннером наверху, а формы получают причину
    // через opts.onBlocked — вторая красная плашка про то же самое была бы просто шумом.
    if (reason === "read-only-tab") return;
    if (runRetry) _saveFailPayloads.current.set(`${key}|${reason}`, runRetry);
    const next = mergeSaveFail(_saveFailsRef.current, { key, reason });
    _saveFailsRef.current = next;
    setSaveFails(next);
  }, []);
  const _clearSaveFails = useCallback((key) => {
    // Map и ref чистим СИНХРОННО: выход из сессии спрашивает про остаток сразу после await,
    // когда React ещё не успел перерисовать состояние.
    for (const id of saveFailIdsFor([..._saveFailPayloads.current.keys()], key)) _saveFailPayloads.current.delete(id);
    _saveFailsRef.current = clearSaveFailsFor(_saveFailsRef.current, key);
    setSaveFails(prev => prev.some(f => f.key === key) ? clearSaveFailsFor(prev, key) : prev);
  }, []);
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
    setFinFilterPreset(s.finFilterPreset || "");
    setFinFilterType(s.finFilterType || "");
    setFinFilterAccount(s.finFilterAccount || "");
  };

  const navigate = (newScreen, newFinTab, extraState = {}) => {
    const snapshot = { screen, financeTab, finFilterCat, finFilterCategory, finFilterContract, finFilterPreset, finFilterType, finFilterAccount };
    setNavHistory(h => [...h, snapshot]);
    // пушим в браузерную историю
    try { window.history.pushState(snapshot, ""); } catch(e) {}
    if (newScreen !== undefined && newScreen !== screen) setScreen(newScreen);
    if (newFinTab !== undefined && newFinTab !== financeTab) setFinanceTab(newFinTab);
    if (extraState.finFilterCat !== undefined) setFinFilterCat(extraState.finFilterCat);
    if (extraState.finFilterCategory !== undefined) setFinFilterCategory(extraState.finFilterCategory);
    if (extraState.finFilterContract !== undefined) setFinFilterContract(extraState.finFilterContract);
    if (extraState.finFilterPreset !== undefined) setFinFilterPreset(extraState.finFilterPreset);
    if (extraState.finFilterType !== undefined) setFinFilterType(extraState.finFilterType);
    if (extraState.finFilterAccount !== undefined) setFinFilterAccount(extraState.finFilterAccount);
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
  // Ref, чтобы в saveRolePermissions сравнить «было → стало» без устаревшего замыкания.
  const rolePermissionsRef = useRef(rolePermissions);
  useEffect(() => { rolePermissionsRef.current = rolePermissions; }, [rolePermissions]);
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
    // Что именно поменяли в правах — поимённо по ролям и ключам: «кто открыл финансы
    // прорабу» это ровно тот вопрос, ради которого журнал и нужен.
    const prev = rolePermissionsRef.current || {};
    for (const role of Object.keys(normalized)) {
      const a = prev[role] || {}, b = normalized[role] || {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (String(a[key]) === String(b[key])) continue;
        logChange(currentUser, { entity: "role", entityId: role, label: `Роль: ${role}`,
          field: key, action: "изменил право", old: String(a[key] ?? "—"), new: String(b[key] ?? "—") });
      }
    }
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
  // Состав списка сотрудников строкой. Пока список не догрузился из базы, allUsersRef
  // держит ВСТРОЕННЫЕ значения по умолчанию (id «1» и «2») — таких людей в базе нет,
  // и первый pull спрашивает отметки несуществующих ключей. Без этой зависимости эффект
  // больше не перезапускался, отметки подтягивались только следующим тиком таймера, и
  // первую минуту после открытия админка показывала «ещё не заходил» тем, кто был онлайн
  // только что. Проверено на боевой: сразу — «ещё не заходил», через 75 с — «3 мин назад».
  const presenceUserIds = useMemo(
    () => (allUsers || []).map(u => u.id).filter(Boolean).join(","),
    [allUsers],
  );
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
  }, [currentUser?.role, presenceUserIds]);

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
  // Справочники мастеров грузятся ТОЛЬКО когда человек открыл раздел «Мастера».
  // Вместе они весят около 4 МБ (одна база с OLX — 3,4 МБ), а используются ровно на
  // одном экране. Раньше качались при КАЖДОМ входе в систему, кто бы туда ни заходил:
  // четыре пятых всего трафика загрузки приложения уходило на справочник, который
  // большинство сотрудников не открывает никогда.
  const [mastersNeeded, setMastersNeeded] = useState(false);
  useEffect(() => { if (screen === "masters") setMastersNeeded(true); }, [screen]);
  const [masters, setMasters] = useState([]);
  const [mastersMeta, setMastersMeta] = useState(null);
  const [mastersLoaded, setMastersLoaded] = useState(false);
  useEffect(() => {
    if (!mastersNeeded) return undefined;
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
  }, [mastersNeeded]);
  // Настройки парсера (частота/«Обновить сейчас») — редактирует Админ, читает парсер.
  const [mastersConfig, setMastersConfig] = useState(null);
  useEffect(() => {
    if (!mastersNeeded) return undefined;
    let alive = true;
    storage.getResult(MASTERS_CONFIG_KEY).then(res => {
      if (!alive) return;
      if (res && res.status === "found" && res.value) { try { setMastersConfig(JSON.parse(res.value)); } catch { setMastersConfig({}); } }
      else setMastersConfig({});
    }).catch(() => { if (alive) setMastersConfig({}); });
    return () => { alive = false; };
  }, [mastersNeeded]);
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
    if (!mastersNeeded) return undefined;
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
  }, [mastersNeeded]);
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
  // Внутренняя CRM мастеров хранится отдельно от выгрузок Naimi/OLX. Поэтому ежедневный
  // парсер может полностью заменить свои списки, не затронув заметки и собственную базу.
  const [mastersCrm, setMastersCrm] = useState(() => normalizeMasterCrm(null));
  useEffect(() => {
    if (!mastersNeeded) return undefined;
    let alive = true;
    storage.getResult(MASTERS_CRM_KEY).then(res => {
      if (!alive) return;
      if (res?.status === "found" && res.value) {
        try { setMastersCrm(normalizeMasterCrm(JSON.parse(res.value))); } catch { setMastersCrm(normalizeMasterCrm(null)); }
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [mastersNeeded]);
  const saveMastersCrm = useCallback(async (nextValue) => {
    if (currentPermissions.masters === "none") return false;
    const next = normalizeMasterCrm(nextValue);
    setMastersCrm(next);
    try {
      const result = await storage.set(MASTERS_CRM_KEY, JSON.stringify(next));
      return result?.fbOk !== false;
    } catch { return false; }
  }, [currentPermissions.masters]);
  const _contractsLoaded = useRef(false);
  const _productionsLoaded = useRef(false); // отдельно от _contractsLoaded: productions грузится в том же запросе, но может не долететь, пока остальное — долетит
  // ФОТ — тоже ОТДЕЛЬНЫЙ флаг. На _contractsLoaded завязывать нельзя: он падает в false,
  // если не долетели договоры/объекты/клиенты, и тогда сохранение сотрудника молча
  // блокировалось причиной «раздел ещё не догрузился» — при том, что справочник ФОТ
  // прочитался нормально. Владелец видел это как «форма добавляет через раз».
  const _payrollLoaded = useRef(false);
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
  // Поиск по работам внутри построителя акта. Держим ОТДЕЛЬНЫМ состоянием, а не полем черновика:
  // черновик уходит в сохранение акта, и строка поиска там не нужна. Сбрасывается при открытии
  // и закрытии окна — иначе второй акт открылся бы с чужим фильтром и половиной скрытых работ.
  const [avrSearch, setAvrSearch] = useState("");
  useEffect(() => { if (!avrModal) setAvrSearch(""); }, [!!avrModal]);
  // Реквизиты акта (номер, даты, заказчик, печать) на телефоне занимали почти всё окно, и на
  // список работ оставалась полоска в одну строку. Поэтому блок сворачивается: на узком экране
  // закрыт по умолчанию, на широком открыт — там места хватает и прятать нечего.
  const [avrReqOpen, setAvrReqOpen] = useState(true);
  const _narrowScreen = () => typeof window !== "undefined" && window.innerWidth <= 640;

  // Подрядчики (рабочие) и договоры подряда с ними
  const [workers, setWorkers] = useState([]);
  const workersRef = useRef([]);
  // ФОТ: справочник сотрудников и таблица соответствий «подкатегория → сотрудник».
  const [staff, setStaff] = useState([]);
  const staffRef = useRef([]);
  const [payrollMap, setPayrollMap] = useState({});
  const payrollMapRef = useRef({});
  // Начисления ФОТ («заработал») — отдельный список, к операциям кассы отношения не имеет.
  const [accruals, setAccruals] = useState([]);
  const accrualsRef = useRef([]);
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
  const [finFilterPreset, setFinFilterPreset] = useState("");     // точная выборка из карточек дашборда
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
  // Сохранение проекта асинхронное, а модалка закрывается только после await —
  // второй клик по «Сохранить» успевал создать вторую карточку с тем же договором
  // (ловили дубль по №1034). Ref держит признак «запись уже идёт».
  const finProjSavingRef = useRef(false);
  const [finProjSearch, setFinProjSearch] = useState("");
  const [orphanOpen, setOrphanOpen] = useState(false); // список «договор есть, проекта нет» — свёрнут по умолчанию
  const [finProjStatusFilter, setFinProjStatusFilter] = useState("");
  const [finProjCatFilter, setFinProjCatFilter] = useState("");

  // ── Связь фин-проектов с объектами (по номеру договора) ──
  // normCN — модульная функция (см. верх файла), чтобы «№0919#153» и «0919#153» считались одним
  // map: нормализованный № договора → { object, contract, planTotal, planCost, planMargin, planMarginPct }
  const contractLinkMap = useMemo(() => {
    const m = {};
    // справочник для расчёта себестоимости сметы
    const _catForCost = getEffectiveCatalog();
    const estCostOf = (e) => {
      let cost = 0;
      for (const { row:r, work:w, qty } of resolveEstimateRows(e.rows, _catForCost)) cost += rowCostPerUnit(r,w)*qty;
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
      const conTotal = contractNetTotal(c); // со скидкой договора — это цена клиента
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
  // Каждый документ считается СО СВОЕЙ скидкой (contractNetTotal) — как в печатной форме.
  const finBudgetOfContract = (main) => {
    if (!main) return 0;
    const own = contractNetTotal(main);
    const annex = main.number ? contractsRef.current
      .filter(x => !x.deletedAt && x.type === "annex" && x.mainNumber && normCN(x.mainNumber) === normCN(main.number))
      .reduce((s, x) => s + contractNetTotal(x), 0) : 0;
    return own + annex;
  };
  const finProjDraftFromObject = (obj, contract) => {
    const main = mainContractOf(contract);
    const estimateTotal = obj?.id
      ? estimatesForObject(estimatesRef.current, obj.id).reduce((sum, estimate) => sum + (Number(estimate.total) || 0), 0)
      : 0;
    const contractsV2 = obj?.financeCalcMode === "contracts-v2";
    return {
      id:"", contractNo: main?.number||"",
      budget: contractsV2 ? finBudgetOfContract(main) : (estimateTotal || finBudgetOfContract(main) || 0),
      createdAt: main?.date || new Date().toISOString().slice(0,10),
      comment:"", objectId: obj?.id||"",
      ...(contractsV2 ? { financeCalcMode:"contracts-v2" } : {}),
    };
  };
  // завести проект в финансах из объекта (или открыть существующий). Доп. соглашение
  // не плодит новый проект — обновляет бюджет проекта основного договора СРАЗУ
  // (сохраняет), чтобы доп. работы отразились без ручного «Сохранить».
  const startFinProjFromObject = async (obj, contract) => {
    const main = mainContractOf(contract);
    const existing = (obj?.id ? finProjectsRef.current.find(p => p.objectId === obj.id) : null)
      || (main ? finProjectsRef.current.find(p=>normCN(p.contractNo)===normCN(main.number)) : null);
    setScreen("finance"); setFinanceTab("projects");
    if (existing) {
      const estimateTotal = obj?.id
        ? estimatesForObject(estimatesRef.current, obj.id).reduce((sum, estimate) => sum + (Number(estimate.total) || 0), 0)
        : 0;
      const contractsV2 = obj?.financeCalcMode === "contracts-v2" || existing.financeCalcMode === "contracts-v2";
      const nb = contractsV2 ? finBudgetOfContract(main) : (estimateTotal || finBudgetOfContract(main) || Number(existing.budget) || 0);
      const upd = { ...existing, objectId:obj?.id || existing.objectId || "", contractNo:main?.number || existing.contractNo || "", budget: nb,
        ...(contractsV2 ? { financeCalcMode:"contracts-v2" } : {}) };
      if (Number(existing.budget) !== nb || upd.objectId !== (existing.objectId || "") || upd.contractNo !== (existing.contractNo || "") || upd.financeCalcMode !== existing.financeCalcMode) {
        try { await saveFinanceProjects(finProjectsRef.current.map(p=>p.id===existing.id?upd:p)); } catch(e) {}
      }
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
  // Имя менеджера копируется в объект при создании (снимок текста, а не ссылка на
  // учётку), поэтому после переименования сотрудника в старых объектах остаётся
  // прежнее написание — один человек выглядит как несколько. Сводим варианты к
  // заведённому сотруднику ОДНИМ резолвером: он же используется в аналитике,
  // поэтому фильтр «Объекты» и разрез по менеджерам показывают одни и те же цифры.
  const resolveManagerName = useMemo(() => makeManagerResolver(allUsers), [allUsers]);
  const [objectAttentionFilter, setObjectAttentionFilter] = useState("");
  const [objectDateSort, setObjectDateSort] = useState("new"); // new = сначала новые, old = сначала старые
  // Шапка «Объектов» разрослась: поиск с датами, три ряда фильтров и две сводки
  // по шесть-десять плиток — до первой карточки объекта уходило две трети экрана.
  // Всё это свёрнуто и раскрывается по клику; выбор запоминается на устройстве,
  // чтобы не открывать одно и то же каждый раз.
  const _objPanel = (key, def) => { try { const v = localStorage.getItem("titovstroy-objpanel-" + key); return v == null ? def : v === "1"; } catch { return def; } };
  const [objFiltersOpen, setObjFiltersOpen] = useState(() => _objPanel("filters", false));
  const [objSummaryOpen, setObjSummaryOpen] = useState(() => _objPanel("summary", false));
  const [objDispatchOpen, setObjDispatchOpen] = useState(() => _objPanel("dispatch", false));
  const _setObjPanel = (key, setter) => (value) => {
    setter(value);
    try { localStorage.setItem("titovstroy-objpanel-" + key, value ? "1" : "0"); } catch {}
  };
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
  const [mobMoreOpen, setMobMoreOpen] = useState(false); // лист «Ещё» нижней панели телефона
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

  // Генераторы документов вынесены в src/documents/legacyDocs.js — там же лежит и весь
  // юридический текст. Здесь остались тонкие обёртки: они подставляют актуальные списки
  // и печать из состояния и сохраняют ПРЕЖНИЕ сигнатуры, поэтому ни один вызов менять не
  // пришлось — в том числе проводка «Шаблонов документов» (legacyRenderers/legacyExports).
  const buildPodryadHtml = (m) => _buildPodryadHtml(m, contragentsRef.current);
  const buildContractHtml = (c, client, ca, forDocx = false, stamp = stampBase64) =>
    _buildContractHtml(c, client, ca, forDocx, stamp);
  const generateContractGDocLegacy = (c, client, ca) =>
    _generateContractGDocLegacy(c, client, ca, workersRef.current, contragentsRef.current);
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
        if(objectFilterManager && resolveManagerName(o.manager)!==resolveManagerName(objectFilterManager)) return false;
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
  }, [accessibleObjects, objectFilterStatus, objectFilterType, objectFilterManager, resolveManagerName, objectAttentionFilter, objectDateSort, objectDateFrom, objectDateTo, debouncedObjectSearch, productions, pendingObjectStatuses]);

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
  // Отбор по чипу статуса. ОДНА функция на список, счётчик и выгрузку: раньше условие
  // было продублировано в двух местах, и «На гарантии» попало только в экспорт —
  // на экране чип показывал 22, а список давал 0.
  const matchesObjectChip = useCallback((o) => {
    if (!objectFilterStatus) return true;
    // «На гарантии» — не статус объекта, а срез по сроку от факт-даты сдачи.
    if (objectFilterStatus === "__warranty") {
      const pr = productions.find(p => p.objectId === o.id);
      return !!pr && warrantyState(pr).status === "active";
    }
    return unifiedStatusOf(o) === objectFilterStatus;
  }, [objectFilterStatus, productions, unifiedStatusOf]);
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
    // Операции без номера договора (зарплаты, аренда, реклама — общефирменные) НЕ
    // складываем в ключ "": проект с пустым contractNo иначе забирал этот общий котёл
    // себе целиком. Ловили на объекте без договора: карточка показывала расход 22,5 млн
    // и маржу −4755%, хотя по объекту не было ни одной операции.
    for (const t of (financeTx || [])) { if (t.deletedAt || t.included === false) continue; const cn = normCN(t.contractNo); if (!cn) continue; (txByCN[cn] || (txByCN[cn] = [])).push(t); }
    const entries = []; const usedObj = new Set();
    for (const fp of (finProjects || [])) {
      const o = matchFpToObject(fp);
      const objectId = o ? o.id : null;
      if (objectId) { if (usedObj.has(objectId)) continue; usedObj.add(objectId); }
      const cn = normCN(fp.contractNo);
      const tx = txByCN[cn] || [];
      const income = tx.filter(t => t.type === "income").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const expense = tx.filter(t => t.type === "expense").reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const estimateBudget = o
        ? estimatesForObject(estimates, o.id).reduce((sum, estimate) => sum + (Number(estimate.total) || 0), 0)
        : 0;
      const contractsV2 = o?.financeCalcMode === "contracts-v2" || fp.financeCalcMode === "contracts-v2";
      const budget = contractsV2 ? (Number(fp.budget) || 0) : (estimateBudget > 0 ? estimateBudget : (Number(fp.budget) || 0));
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
  }, [finProjects, financeTx, estimates, matchFpToObject, financeProjectStatusKeyOf]);
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
    return buildFinanceProjectView({
      project,
      object,
      production,
      contract,
      estimates,
      contractTotal: finBudgetOfContract(contract),
      reports,
      status,
    });
  };
  const financeBudgetOf = project => financeProjectViewOf(project).budget;
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
  // Старые сметы не хранили цену и себестоимость строки. При первом безопасном сохранении
  // фиксируем базовые значения каталога, чтобы дальнейшие изменения прайса не меняли историю.
  // Для новых строк снимок создаётся сразу из актуального прайса в setRow ниже.
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
    const sealedRows = sealLegacyEstimateRows(rows, getEffectiveCatalog().map(getEffectiveWork));
    const updated = { id:currentId, proj, rows:sealedRows, discount, markup, note, status:estStatus, sentAt: estStatus==="sent" ? (estSentAt||exists?.sentAt||new Date().toISOString().slice(0,10)) : (exists?.sentAt||null), comment:estComment, createdAt:exists?.createdAt||Date.now(), createdBy:exists?.createdBy||currentUser?.name, updatedAt:Date.now(), updatedBy:currentUser?.name, total:final, ...(objId ? {objectId:objId} : {}), ...(pId ? {parentId:pId, dsNumber:dsN} : {}) };
    updated.history = _appendHistory(exists, updated);
    return exists ? cur.map(e=>e.id===currentId?updated:e) : [updated,...cur];
  };
  // Подпись содержимого сметы БЕЗ служебных полей. updatedAt меняется при каждой пересборке,
  // поэтому сравнивать целиком нельзя — иначе «изменений нет» не наступает никогда.
  const _estSig = (e) => e ? JSON.stringify([e.rows, e.proj, e.discount, e.markup, e.note,
    e.status, e.sentAt, e.comment, e.objectId || "", e.parentId || "", e.dsNumber || ""]) : "";
  const _estSavedSig = useRef("");
  const _flushEstimate = () => {
    const newList = _buildEstimateList();
    if (!newList) return;
    // ГЛАВНОЕ ПО ТРАФИКУ. Каждое сохранение сметы читает ВЕСЬ список смет из базы (слияние с
    // чужими правками — та самая защита «ничего не теряется»). Автосохранение срабатывало на
    // любое изменение состояния редактора, в том числе когда содержимое сметы не менялось
    // вовсе. По метрикам базы час работы со сметами давал 7,45 ГБ скачивания. Сравниваем
    // подпись: не изменилось — в базу не ходим вообще.
    const sig = _estSig(newList.find(e => e.id === currentId));
    if (sig && sig === _estSavedSig.current) return;
    _estSavedSig.current = sig;
    setEstimates(newList);
    saveEstimates(newList);
  };
  // Открыли другую смету — прежняя подпись к ней не относится.
  useEffect(() => { _estSavedSig.current = ""; }, [currentId]);
  useEffect(() => {
    if (!currentId) { _estFlushRef.current = null; return; }
    _estFlushRef.current = currentId;
    if (_autoSaveRef.current) clearTimeout(_autoSaveRef.current);
    // 2,5 секунды вместо 0,9: при наборе текста дебаунс в 0,9 с срабатывал почти на каждой
    // паузе между словами, и каждый раз это был полный обход списка смет. Потерять правку
    // нельзя: уход из редактора, смена экрана и закрытие вкладки дожимают сохранение сами.
    _autoSaveRef.current = setTimeout(_flushEstimate, 2500);
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
      // ФОТ (зарплаты, начисления, справочник сотрудников) грузится ОТДЕЛЬНО и только тем,
      // кому он открыт — см. loadPayroll ниже. Раньше эти три ключа читались здесь, при
      // старте, у ЛЮБОЙ роли: замерщик и наблюдатель скачивали зарплаты всей компании,
      // хотя раздел им закрыт. Это и лишний трафик в каждом запуске, и данные в чужом
      // браузере.
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
    _auditListDiff("client", clientsRef.current, patched, x => x?.name || x?.phone || "Клиент");
    const r = await saveListProtected(CLIENTS_KEY, CLIENTS_BACKUPS_KEY, patched, (fl)=>{ clientsRef.current = fl; setContractClients(fl); }, { loadedRef: _contractsLoaded, ...opts });
    return r;
  };
  // ── ДИФФ СПИСКА В ЖУРНАЛ ────────────────────────────────────────────────────
  // Справочники (клиенты, подрядчики, работники, акты, договоры подряда) сохраняются
  // целым массивом, поэтому точку «что именно поменяли» ловим сравнением было/стало
  // по id. Без этого целые разделы вообще не попадали в журнал: пропал подрядчик —
  // и concов не найти.
  const _auditListDiff = useCallback((entity, prev, next, labelOf, fields = null) => {
    try {
      const before = new Map((prev || []).filter(x => x?.id).map(x => [x.id, x]));
      const after = new Map((next || []).filter(x => x?.id).map(x => [x.id, x]));
      const ev = (o) => ({ entity, entityId: o?.id || "", label: labelOf(o) || o?.id || "" });
      for (const [id, o] of after) {
        if (before.has(id)) continue;
        logChange(currentUser, { ...ev(o), field: "запись", action: "создал", old: "—", new: labelOf(o) });
      }
      for (const [id, o] of before) {
        if (after.has(id)) continue;
        // Мягкое удаление (deletedAt) прилетает как изменение — не путаем с созданием.
        logChange(currentUser, { ...ev(o), field: "запись", action: "удалил", old: labelOf(o), new: "—" });
      }
      for (const [id, o] of after) {
        const was = before.get(id);
        if (!was) continue;
        if (!was.deletedAt && o.deletedAt) {
          logChange(currentUser, { ...ev(o), field: "запись", action: "удалил", old: labelOf(was), new: "—" });
          continue;
        }
        // Пишем ТОЛЬКО значимые поля: иначе служебные updatedAt засорят журнал.
        const keys = fields || Object.keys(o).filter(k => !["updatedAt", "id", "__ts"].includes(k));
        for (const k of keys) {
          const a = was[k], b = o[k];
          if (a === b) continue;
          if (typeof a === "object" || typeof b === "object") continue;   // вложенное не разбираем
          logChange(currentUser, { ...ev(o), field: k, action: "изменил",
            old: a === undefined || a === "" ? "—" : String(a), new: b === undefined || b === "" ? "—" : String(b) });
        }
      }
    } catch (e) { console.warn("audit diff", entity, e); }
  }, [currentUser]);

  // ── БЭКАПЫ / ИМПОРТ / ЭКСПОРТ В ЖУРНАЛ ──────────────────────────────────────
  // Откат базы и импорт — единственные операции, которые могут разом заменить данные
  // целого раздела, и до сих пор они не оставляли следа. Пишем: что за операция, какой
  // раздел, на какой момент откатили и сколько записей приехало.
  // Возвращает промис: там, где после операции идёт reload, запись надо дождаться.
  const logBackupOp = useCallback((action, label, ev = {}) => {
    return logChange(currentUser, { entity: "backup", label, action, source: ev.source || "manual",
      field: ev.field || "", old: ev.old ?? "", new: ev.new ?? "", detail: ev.detail || "",
      entityId: ev.entityId || "", objectId: ev.objectId || "" });
  }, [currentUser]);
  const _snapMoment = (ts) => { try { return new Date(ts).toLocaleString("ru-RU"); } catch { return String(ts || "?"); } };

  const saveContragents = async (list, opts = {}) => {
    _auditListDiff("contragent", contragentsRef.current, list, x => x?.name || x?.bin || "Реквизиты");
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
  const publishProgressRef = useRef(null);
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
      const res = await runVerifiedProductionTransaction(cmd, {
        transact: mutate => storage.mutateTransaction(PRODUCTIONS_KEY, mutate),
        readFresh: () => storage.getCloudResult(PRODUCTIONS_KEY),
      });
      if (!storage.mayApplyEditorResult(editorSession)) {
        return { committed: false, reason: "editor-session-ended" };
      }
      // Сессия завершилась, пока шла транзакция: запись (если успела) — легитимный «дожим»
      // правок ЭТОГО пользователя, но React-state и учёты больше не трогаем.
      if (sess !== _prodAppSession.current) return { committed: !!res.committed, reason: "session-ended" };
      if (res.committed) {
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
        // Обновляем публичный кабинет сразу после подтвержденной записи статуса/этапов.
        // Не ждём публикацию здесь: внутреннее сохранение уже завершено, а кнопки остаются быстрыми.
        for (const objectId of productionCommandObjectIds(command)) {
          Promise.resolve()
            .then(() => publishProgressRef.current?.(objectId))
            .catch(error => console.warn("publishProgress after production save", error));
        }
        return { committed: true, list: next };
      }
      return _fail(res.reason, !!res.conflict, res.list);
    };
    const next = _prodQueue.current.then(run, run);
    _prodQueue.current = next.then(() => {}, () => {});
    return next;
  }, [currentUser?.id, _refreshProdUnsynced, _clearCloudErrorIfAllClean]);

  const dismissDashboardIssue = useCallback(async issue => {
    if (!issue?.id) return;
    if (issue.dismissAction?.type !== "client-remark") {
      dismissIssueTomorrow(issue.id);
      return;
    }
    const { objectId, itemId } = issue.dismissAction;
    if (!objectId || !itemId) return;
    const result = await mutateProductions({
      type:"patch-item",
      objectId,
      field:"defects",
      itemId,
      patch:{
        dashboardDismissedAt:Date.now(),
        dashboardDismissedBy:currentUser?.id || currentUser?.name || "admin",
      },
      changeId:`bg_dismiss_remark_${objectId}_${itemId}`,
    });
    if (!result?.committed && !result?.conflict) {
      alert("Не удалось убрать замечание с главной. Проверьте соединение и повторите.");
    }
  }, [currentUser?.id, currentUser?.name, dismissIssueTomorrow, mutateProductions]);

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
      // Отбитые записи (реестр несохранённого) живут только в памяти вкладки — при выходе
      // они исчезнут вместе с ней. Пробуем дожать, остаток предъявляем в том же вопросе.
      try { await _retryFailedSavesRef.current?.(); } catch(e) { console.warn("logout retry fails err", e); }
      const failsLeft = _saveFailsRef.current || [];
      const savedBgIds = new Set(listProductionRetries(localStorage, currentUser?.id).map(c => c.changeId));
      const bgDurable = Array.from(_prodRetryCmds.current.keys()).every(id => savedBgIds.has(id));
      const prodAtRisk = prodLeft > 0 && (!productionDraftsAreDurable() || !bgDurable);
      const atRisk = (prodAtRisk ? prodLeft : 0) + dirtyLeft + failsLeft.length;
      if (atRisk > 0) {
        const what = [prodAtRisk ? `производство без резервного черновика: ${prodLeft}` : "", dirtyLeft > 0 ? `сметы/финансы/прочее: ${dirtyLeft}` : "",
                      failsLeft.length ? `не принято базой: ${failsLeft.map(f => f.label).join(", ")}` : ""].filter(Boolean).join("; ");
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
      // Права сотрудника в самом Firebase снимаем ЗДЕСЬ — после того, как всё дожато и
      // lease отпущен. Раньше было бы рано: незавершённая запись ушла бы уже анонимом и
      // её отбили бы правила. Позже — некуда: интерфейс уже показывает экран входа, а
      // токен с claims в браузере ещё живой.
      try{ await signOutStaff(); }catch(e){}
      setCurrentUser(null); setLogoutConfirm(false);
    } finally {
      _endingSessionRef.current = false;
      _prodEndingRef.current = false; // при отмене выхода очереди снова работают штатно
    }
  }, [flushAllProductionPending, _refreshProdUnsynced, setCurrentUser, currentUser?.id]);
  endSessionSafelyRef.current = endSessionSafely;
  const saveReports = async (list, opts = {}) => {
    // Акты/АВР — документы под подпись, их появление и правки должны быть видны.
    _auditListDiff("report", reportsRef.current, list, x => `${x?.type || "Акт"} ${x?.number || ""}`.trim());
    return await saveListProtected(REPORTS_KEY, REPORTS_BACKUPS_KEY, list, (fl)=>{ reportsRef.current = fl; setReports(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };
  // ── ФОТ (модуль src/payroll) ──
  // Только ДОБАВЛЕНИЕ: свои ключи, ничего существующего не трогаем. Справочник идёт
  // через тот же saveListProtected, что и остальные списки, — мердж, бэкапы, защита
  // «пусто поверх» работают как везде.
  const saveStaff = async (list, opts = {}) => {
    _auditListDiff("staff", staffRef.current, list, x => x?.name || x?.position || "Сотрудник");
    return await saveListProtected(STAFF_KEY, STAFF_BACKUPS_KEY, list, (fl)=>{ staffRef.current = fl; setStaff(fl); }, { loadedRef: _payrollLoaded, ...opts });
  };
  // Начисления — обычный список со своим ключом: тот же мердж по id, бэкапы и защита
  // «пусто поверх», что у остальных списков. Финансовые операции не трогаются.
  const saveAccruals = async (list, opts = {}) => {
    _auditListDiff("staff", accrualsRef.current, list,
      x => `Начисление ${x?.month || ""} ${x?.amount ? `${x.amount} ₸` : ""}`.trim());
    return await saveListProtected(ACCRUALS_KEY, ACCRUALS_BACKUPS_KEY, list, (fl)=>{ accrualsRef.current = fl; setAccruals(fl); }, { loadedRef: _payrollLoaded, ...opts });
  };
  // Соответствия «подкатегория → сотрудник» — это объект, а не список, поэтому пишем
  // напрямую. Сами операции при этом не меняются вообще.
  const savePayrollMap = async (map) => {
    const prev = payrollMapRef.current;
    payrollMapRef.current = map; setPayrollMap(map);
    try {
      const res = await storage.set(PAYROLL_MAP_KEY, JSON.stringify(map || {}));
      if (res && res.fbOk === false) { setCloudError(true); }
      else _clearCloudErrorIfAllClean();
      logChange(currentUser, { entity: "staff", label: "Соответствия ФОТ", action: "изменил",
        field: "подкатегории", old: `${Object.keys(prev || {}).length} шт`, new: `${Object.keys(map || {}).length} шт` });
      return true;
    } catch (e) {
      console.error(e); setCloudError(true);
      payrollMapRef.current = prev; setPayrollMap(prev);
      window.alert("Соответствия не сохранены: облако не подтвердило запись.");
      return false;
    }
  };
  const saveWorkers = async (list, opts = {}) => {
    _auditListDiff("worker", workersRef.current, list, x => x?.name || x?.phone || "Работник");
    return await saveListProtected(WORKERS_KEY, WORKERS_BACKUPS_KEY, list, (fl)=>{ workersRef.current = fl; setWorkers(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };
  const savePodryads = async (list, opts = {}) => {
    _auditListDiff("podryad", podryadsRef.current, list, x => `Подряд № ${x?.number || "?"} · ${x?.worker?.name || ""}`.trim());
    return await saveListProtected(PODRYADS_KEY, PODRYADS_BACKUPS_KEY, list, (fl)=>{ podryadsRef.current = fl; setPodryads(fl); }, { loadedRef: _contractsLoaded, ...opts });
  };

  // ── АВР (форма Р-1): построитель и печать ──
  // Собрать строки акта из позиций сметы (цена с учётом наценки, без НДС)
  const buildAvrLinesFromEst = (est) => {
    const cat = getEffectiveCatalog();
    const pricing = { markupPercent: Number(est.markup) || 0, discountPercent: Number(est.discount) || 0 };
    const lines = [];
    // Строки берём тем же правилом, что и смета: иначе в акт попадали работы,
    // удалённые из сметы (их прежняя запись под названием остаётся в данных).
    for (const { row: r, work: w, qty } of resolveEstimateRows(est.rows, cat, { extraCat: EXTRA_CAT })) {
      let price;
      if (r.manualPrice !== undefined && r.manualPrice !== "") { const n = Number(r.manualPrice); price = isNaN(n) ? 0 : n; }
      else { const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined; price = getEstimateRowPrice(r, w, qty, r.complexity || "std", cpxPct) || 0; }
      if (!price) continue; // позиции «цена от» в акт не берём
      const name = r.manualName !== undefined ? r.manualName : w.name;
      const unit = r.manualUnit !== undefined ? r.manualUnit : w.unit;
      // Цена в акте — ровно та же, что в смете и договоре (одна формула на всё).
      lines.push({ cat: w.cat || "", name, unit: unit || "", qty, price: clientUnitPrice(price, pricing), included: true, doneQty: qty });
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
    setAvrSearch("");   // новый акт открываем без чужого фильтра
    setAvrReqOpen(!_narrowScreen());
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
    setAvrSearch("");   // новый акт открываем без чужого фильтра
    setAvrReqOpen(!_narrowScreen());
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
  const onDeleteProduction = useCallback((objectId) => {
    return mutateProductions({ type: "delete-production", objectId, changeId: "bg_del_" + objectId });
  }, [mutateProductions]);

  // ── ДОСТУП КЛИЕНТА К ПРОГРЕССУ (публичная ссылка #/progress/<токен>) ──
  // Когда какой объект публиковали последний раз — ключи «p:<id>» (снимок) и «d:<id>»
  // (документы). Общий тормоз для всех путей публикации, включая фоновые.
  const _pubAt = useRef(new Map());
  // Подпись последнего опубликованного снимка по объекту — чтобы не публиковать одно и то же.
  const _pubSig = useRef(new Map());
  const prodEntriesRef = useRef([]);
  useEffect(() => { prodEntriesRef.current = prodEntries; }, [prodEntries]);
  // Отчёты по этапам лежат отдельным узлом на объект (см. stage-reports/model.js)
  // и в состоянии приложения не держатся: их читает только публикация снимка и
  // сама карточка объекта, когда её открыли.
  const _readStageReports = useCallback(async (objectId) => {
    try {
      const result = await storage.getResult(stageReportsKey(objectId));
      if (result?.status !== "found" || !result.value) return [];
      return normalizeStageReports(JSON.parse(result.value));
    } catch { return []; }
  }, []);
  // Собрать ОЧИЩЕННЫЙ снимок для клиента (без себестоимости/маржи/подрядчиков/внутренних заметок)
  const buildProgressSnapshot = useCallback((objectId, prev = {}, stageReports = []) => {
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj) return null;
    const prod = productionsRef.current.find(p => p.objectId === objectId) || {};
    const entry = (prodEntriesRef.current || []).find(e => e.objectId === objectId);
    const stages = sortProductionStages(prod.stages || []).filter(st => st && String(st.name || "").trim());
    let doneCnt = 0;
    for (const st of stages) { if ((st.status || "todo") === "done") doneCnt++; }
    // Готовность считаем ТАК ЖЕ, как в производстве: доля выполненных этапов (по количеству)
    const progressPct = stages.length > 0 ? Math.round(doneCnt / stages.length * 100) : 0;
    const handover = (prod.checklistHandover || []).filter(i => (i.section || "") === "Клиентская приёмка").map(i => ({ text: i.text, done: !!i.done }));
    const budget = resolveProgressBudget(entry?.budget, stages);
    // Статус «Готово» влияет только на прогресс. Оплата подтверждается отдельно
    // галочкой «Оплачено» во вкладке «Финансы» карточки объекта.
    const paid = sumPaidProductionStages(stages);
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
    // Фото по работам. Ради них клиент и заходит: видно, что было до, что
    // спрятано внутри конструкции и что получилось. Скрытые вручную и
    // недогруженные не отдаём — clientPhotosByStage их отсекает, заодно
    // выбрасывая внутренние поля (кто снял) из публичного снимка.
    const _clientPhotos = clientPhotosByStage(stageReports);
    const cv = obj.clientVis || {};
    const showPay = cv.payments !== false, showStages = cv.stages !== false, showRemarks = cv.remarks !== false, showDocs = cv.docs !== false;
    const showPhotos = cv.photos !== false;
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
      vis: { payments: showPay, docs: showDocs, stages: showStages, remarks: showRemarks, photos: showPhotos },
      stages: showStages ? stages.map(st => ({ photos: showPhotos ? (_clientPhotos[st.id] || []) : [], name: st.manualName || st.name || "Этап", cat: st.cat || "Работы", status: st.status || "todo", planEnd: st.planEnd || "", factEnd: st.factEnd || "", priceClient: Number(st.priceClient) || 0 })) : [],
      payment: showPay ? { budget, paid, remaining: Math.max(0, budget - paid) } : null,
      payments: showPay ? payments : [],
      handover, clientRemarks: showRemarks ? clientRemarks : [], clientMessage,
      // Срок жизни ссылки — жёстко зафиксирован в объекте при включении доступа (не продлевается
      // здесь автоматически: buildProgressSnapshot вызывается и фоновой минутной republish'ей).
      expiresAt: obj.progressExpiresAt || null,
      publishedAt: Date.now(), viewCount: prev.viewCount || 0, viewedAt: prev.viewedAt || null,
    };
  }, []);
  const publishProgress = useCallback(async (objectId, opts = {}) => {
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj || !obj.progressShared || !obj.progressToken) return;
    // ТОРМОЗ. Публикация читает ноду прогресса и отчёты по этапам, то есть стоит
    // трафика. Раньше она срабатывала от массивов, которые меняют идентичность на
    // каждый чих (productions, prodEntries), и по кругу гоняла ВСЕ открытые кабинеты
    // в КАЖДОЙ вкладке. За двое суток это вылилось в 58 ГБ исходящего трафика базы
    // и 57 долларов. Клиентская страница сама обновляется раз в 10 секунд, так что
    // задержка в минуту незаметна, а фоновая публикация перестаёт крутиться вхолостую.
    // ПОДПИСЬ ИЗ ПАМЯТИ — до любого обращения к базе. Публикация читает ноду прогресса
    // дважды и отчёты по этапам, а дёргается она от изменений производства, то есть по
    // всем открытым кабинетам сразу. Если по объекту ничего из видимого клиенту не
    // поменялось, публиковать нечего — и тогда мы не тратим НИ ОДНОГО чтения.
    // Особенно важно на нескольких устройствах: замок редактора живёт в браузере, то
    // есть телефон и компьютер считаются отдельными редакторами и работают параллельно.
    const prodNow = productionsRef.current.find(p => p.objectId === objectId) || {};
    const entryNow = (prodEntriesRef.current || []).find(e => e.objectId === objectId) || {};
    const sig = JSON.stringify([
      obj.updatedAt, obj.clientVis, obj.progressShared, obj.progressExpiresAt,
      prodNow.updatedAt,
      (prodNow.stages || []).map(st => [st.id, st.status, st.name, st.planEnd, st.factEnd, st.paid, st.priceClient]),
      (prodNow.checklistHandover || []).map(i => [i.id, i.done, i.section, i.text]),
      (prodNow.defects || []).map(d => [d.id, d.done, d.clientRemarkId]),
      prodNow.clientMessage, entryNow.budget, entryNow.paid,
    ]);
    if (!opts.force && _pubSig.current.get(objectId) === sig) return;
    if (!opts.force) {
      const last = _pubAt.current.get("p:" + objectId) || 0;
      if (Date.now() - last < 60_000) return;
    }
    _pubAt.current.set("p:" + objectId, Date.now());
    _pubSig.current.set(objectId, sig);
    const showRemarks = (obj.clientVis || {}).remarks !== false;
    // Замечания СКРЫТЫ клиенту → сначала заберём уже присланные замечания в производство,
    // чтобы они не потерялись, ПЕРЕД тем как вычистить их из публичной ноды.
    if (!showRemarks) { try { await syncRemarksRef.current?.(objectId); } catch {} }
    let prev = {};
    try { const r = await storage.getResult(PROGRESS_NODE(obj.progressToken)); if (r.status === "found" && r.value) prev = JSON.parse(r.value); } catch {}
    const snap = buildProgressSnapshot(objectId, prev, await _readStageReports(objectId));
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
  publishProgressRef.current = publishProgress;
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
  // Только во вкладке-редакторе: фоновая работа не должна умножаться на число открытых
  // вкладок. Раньше умножалась — и каждая вкладка гоняла свой круг публикаций.
  // Подпись набора опубликованных кабинетов. Именно она в зависимостях эффекта, а не сами
  // объекты: objects меняется от любой правки, и подписки пересоздавались бы постоянно —
  // а каждое пересоздание заново качает все узлы. Строка меняется только когда кабинет
  // реально открыли или закрыли.
  const _progWatchKey = useMemo(
    () => objects.filter(o => o?.progressShared && o?.progressToken).map(o => `${o.id}:${o.progressToken}`).sort().join(","),
    [objects],
  );
  useEffect(() => {
    if (!editorTab) return undefined;
    // ПОДПИСКА вместо опроса. Раньше приложение раз в минуту читало узел КАЖДОГО
    // опубликованного кабинета целиком, с каждого рабочего места: десять кабинетов и три
    // открытые вкладки = тридцать полных чтений в минуту круглосуточно. Замечания клиента
    // приходят редко, а платили за них постоянно. Теперь узел приходит один раз, дальше —
    // только когда клиент действительно что-то написал (и приходит сразу, а не через минуту).
    const stops = [];
    for (const pair of _progWatchKey ? _progWatchKey.split(",") : []) {
      const objectId = pair.slice(0, pair.lastIndexOf(":"));
      const token = pair.slice(pair.lastIndexOf(":") + 1);
      if (!objectId || !token) continue;
      const stop = storage.watch(PROGRESS_NODE(token), () => {
        try { syncRemarksRef.current?.(objectId); } catch {}
      });
      if (stop) stops.push(stop);
    }
    // Срок доступа. Раньше проверялся тем же ежеминутным опросом; теперь отдельным редким
    // таймером — истёкший кабинет не та срочность, чтобы проверять его каждую минуту.
    const checkExpiry = () => {
      objectsRef.current.filter(o => o.progressShared && o.progressToken).forEach(async o => {
        if (!o.progressExpiresAt || Date.now() <= o.progressExpiresAt) return;
        // Гасим доступ насовсем: иначе «истёк» был бы виден только в интерфейсе, а сама нода
        // продолжала бы жить и читаться по старому токену.
        try { await saveObjects([...objectsRef.current.filter(x => x.id !== o.id), { ...o, progressShared: false, updatedAt: Date.now() }]); } catch {}
        try { await _revokeProgressAccess(o.progressToken); } catch {}
      });
    };
    checkExpiry();
    const iv = setInterval(checkExpiry, 30 * 60 * 1000);
    return () => { clearInterval(iv); for (const stop of stops) { try { stop(); } catch {} } };
  }, [saveObjects, _revokeProgressAccess, editorTab, _progWatchKey]);
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
    const snap = buildProgressSnapshot(objectId, {}, await _readStageReports(objectId));
    if (snap) { try { await storage.set(PROGRESS_NODE(token), JSON.stringify(snap)); } catch {} }
    try { await _publishDocsRef.current?.(objectId, { force: true }); } catch {}
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
    // Владелец переключил, что видит клиент — публикуем немедленно, мимо тормоза.
    try { await publishProgressRef.current?.(objectId, { force: true }); } catch {}
    try { await _publishDocsRef.current?.(objectId, { force: true }); } catch {}
    // журнал: каждый переключённый раздел видимости
    const VIS_LBL = { payments: "оплата", docs: "документы", stages: "этапы работ", remarks: "замечания", photos: "фотоотчёт" };
    for (const f of Object.keys(patch || {})) {
      const before = (obj.clientVis || {})[f] !== false, after = patch[f] !== false;
      if (before === after) continue;
      logChange(currentUser, { entity: "publish", entityId: objectId, objectId, label: _objLabel(obj), field: "видимость: " + (VIS_LBL[f] || f), action: "изменил доступ", old: before ? "показано" : "скрыто", new: after ? "показано" : "скрыто" });
    }
  }, [saveObjects, currentUser, currentPermissions.productionClientAccess, estimatorObjectIds]);
  // Публикация документов клиента (договоры/акты) при их изменении — для открытых объектов
  const _docsPubTimer = useRef(null);
  useEffect(() => {
    if (!editorTab) return undefined;
    const shared = objectsRef.current.filter(_progActive);
    if (!shared.length) return undefined;
    if (_docsPubTimer.current) clearTimeout(_docsPubTimer.current);
    _docsPubTimer.current = setTimeout(() => { shared.forEach(o => { try { _publishDocsRef.current?.(o.id); } catch {} }); }, 1500);
    return () => { if (_docsPubTimer.current) clearTimeout(_docsPubTimer.current); };
  }, [contracts, reports, estimates, editorTab]);
  // Живое авто-обновление: при любом изменении производства/оплат пере-публикуем снимки всех открытых объектов
  const _progPubTimer = useRef(null);
  useEffect(() => {
    if (!editorTab) return undefined;
    const shared = objectsRef.current.filter(_progActive);
    if (!shared.length) return undefined;
    if (_progPubTimer.current) clearTimeout(_progPubTimer.current);
    _progPubTimer.current = setTimeout(() => { shared.forEach(o => { publishProgressRef.current?.(o.id); }); }, 1200);
    return () => { if (_progPubTimer.current) clearTimeout(_progPubTimer.current); };
    // syncRemarks отсюда убран: он читает ноду по каждому кабинету, а зависимости этого
    // эффекта меняются постоянно. Замечания клиента забирает опрос раз в минуту выше.
  }, [prodEntries, productions, editorTab]);

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
      // Тем же правилом, что и сама смета: иначе в этапы производства
      // попадали работы, удалённые из сметы (их прежняя запись под названием
      // остаётся в данных и раньше подхватывалась отсюда напрямую).
      for (const { key, row: r, work: w, qty } of resolveEstimateRows(est.rows, catalog, { extraCat: EXTRA_CAT })) {
        const name = String(r?.manualName ?? r?.name ?? w?.name ?? key).trim();
        if (!name) continue;
        const unit = String(r?.manualUnit ?? r?.unit ?? w?.unit ?? "").trim();
        const cat = String(r?.cat ?? w?.cat ?? "Дополнительные работы").trim() || "Дополнительные работы";
        const cpxPct = r?.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
        const raw = (r?.manualPrice !== undefined && r.manualPrice !== "")
          ? Number(r.manualPrice)
          : w ? getEstimateRowPrice(r, w, qty, r?.complexity || "std", cpxPct) : Number(r?.price || 0);
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
        // Статус — ЕДИНЫЙ (карточка производства перевешивает поле объекта), а не сырое
        // obj.status: у объекта из миграции в поле лежит «archive», хотя на экране он
        // «В работе», и синк его молча пропускал. Считаем прямо из p — колбэк
        // unifiedStatusOf сюда тащить нельзя, он зависит от productions и зациклил бы эффект.
        if (!obj) continue;
        const objStatus = PROD_TO_DEAL[p.prodStatus] || obj.status || "new";
        if (!["signed", "work", "paused"].includes(objStatus)) continue;
        // Каждой сметной позиции даём стабильный estimateKey (cat|name) и заранее — id. Синк
        // сопоставляет этапы по estimateKey, а НЕ по названию: ручной этап с именем как в смете
        // (без estimateKey) не будет ни обновлён, ни удалён.
        const built = buildStagesFromEstimate(p.objectId).map(b => ({ id: genId(), estimateKey: _stageKey(b), ...b }));
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
        // Загрузка не должна молча переписывать бизнес-данные. Некорректные даты показывает
        // «Проверка базы», а исправляет их только пользователь в исходной карточке.
        setFinProjects(p); finProjectsRef.current = p;
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

  // Старые объекты сохраняют схему «сметы, затем договор». Только новые объекты
  // с financeCalcMode=contracts-v2 считают бюджет по договору и допсоглашениям.
  const _budgetSyncTimer = useRef(null);
  useEffect(() => {
    if (!_financeLoaded.current || !_contractsLoaded.current || !_estimatesLoaded.current || !_productionsLoaded.current) return;
    if (_budgetSyncTimer.current) clearTimeout(_budgetSyncTimer.current);
    _budgetSyncTimer.current = setTimeout(() => {
      const fps = finProjectsRef.current;
      let changed = false;
      let updated = fps.map(fp => {
        const directObject = fp.objectId
          ? objectsRef.current.find(o => o && !o.deletedAt && o.id === fp.objectId)
          : null;
        const mainByNumber = fp.contractNo ? contractsRef.current.find(c => c.number && !c.deletedAt
          && c.type !== "podryad" && c.type !== "podryad_annex" && c.type !== "annex" && c.type !== "design_add"
          && normCN(c.number) === normCN(fp.contractNo)) : null;
        const linkedObjectId = directObject?.id || mainByNumber?.objectId || "";
        if (!linkedObjectId && !mainByNumber) return fp;
        const main = mainByNumber || contractsRef.current.find(c => c && !c.deletedAt && c.objectId === linkedObjectId
          && c.type !== "podryad" && c.type !== "podryad_annex" && c.type !== "annex" && c.type !== "design_add") || null;
        const linkedObject = directObject || objectsRef.current.find(o => o && !o.deletedAt && o.id === linkedObjectId) || null;
        const budgetView = resolveFinanceProjectBudget({
          project: fp,
          object: linkedObject,
          estimates: estimatesRef.current,
          contractTotal: finBudgetOfContract(main),
        });
        const nb = budgetView.budget;
        const contractsV2 = budgetView.calcMode === "contracts-v2";
        const hasCurrentBudgetSource = budgetView.source !== "legacy";
        if ((hasCurrentBudgetSource && Math.round(Number(fp.budget) || 0) !== Math.round(nb)) || linkedObjectId !== (fp.objectId || "") || (contractsV2 && fp.financeCalcMode !== "contracts-v2")) {
          changed = true;
          return { ...fp, budget: nb, objectId: linkedObjectId, ...(contractsV2 ? { financeCalcMode:"contracts-v2" } : {}) };
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
            const budgetView = resolveFinanceProjectBudget({ project:existing, object, estimates:estimatesRef.current, contractTotal:finBudgetOfContract(main) });
            updated = updated.map(fp => fp.id === existing.id ? { ...fp, objectId:object.id, budget:budgetView.budget, ...(budgetView.calcMode === "contracts-v2" ? { financeCalcMode:"contracts-v2" } : {}) } : fp);
            changed = true;
          }
          continue;
        }
        const projectDraft = finProjDraftFromObject(object, main);
        const budgetView = resolveFinanceProjectBudget({ project:projectDraft, object, estimates:estimatesRef.current, contractTotal:finBudgetOfContract(main) });
        if (!main && budgetView.budget <= 0) continue;
        updated.push({ ...projectDraft, id:genId(), objectId:object.id, budget:budgetView.budget });
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
    // Оба источника: новые снимки по указателю и старые из общего массива.
    const [bRaw, iRaw] = await Promise.all([storage.get(cfg.backupKey), storage.get(backupIndexKey(cfg.backupKey))]);
    const items = mergeBackupViews(bRaw?.value, iRaw?.value, cfg.backupKey);
    setListBackups({
      label: cfg.label,
      items,
      onRestore: async (snap) => {
        const data = await loadSnapshotData(snap, async (k) => (await storage.get(k))?.value || null);
        if (!data) { window.alert("Снимок не читается — возможно, облако недоступно. Попробуйте ещё раз."); return; }
        let list; try { list = JSON.parse(data); } catch { window.alert("Бэкап повреждён"); return; }
        if (!Array.isArray(list)) { window.alert("Бэкап повреждён"); return; }
        if (!window.confirm(`Восстановить список ${cfg.label} на ${new Date(snap.ts).toLocaleString("ru-RU")}? Записей: ${list.length}.`)) return;
        const wasN = ({ list: contractsRef, contracts: contractsRef, clients: clientsRef,
                        contragents: contragentsRef, objects: objectsRef }[kind]?.current || []).length;
        await cfg.save(list);
        logBackupOp("восстановил из бэкапа", `Список ${cfg.label}`,
          { field: "снимок", old: `${_snapMoment(snap.ts)} · было записей: ${wasN}`,
            new: `записей в снимке: ${list.length}`, detail: `автор снимка: ${snap.by || "—"}` });
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
      const total = (currentDeal.works||[]).reduce((s,w)=>s+lineTotal(w.quantity,w.price),0);
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

  // ФОТ отдельной загрузкой и только тем, кому он нужен: зарплаты — самые чувствительные
  // данные в базе, и качать их в браузер каждому при входе незачем. Отдельным эффектом с
  // зависимостью от прав (а не внутри loadContracts) — иначе права, которые приезжают
  // асинхронно, на момент старта ещё не известны и гейт сработал бы наугад.
  const loadPayroll = useCallback(async () => {
    try {
      const [stf, pmap, acc] = await Promise.all([
        storage.getResult(STAFF_KEY), storage.getResult(PAYROLL_MAP_KEY), storage.getResult(ACCRUALS_KEY),
      ]);
      // Пустой ключ — нормальный исход (раздел новый), недоступный — нет: только он должен
      // запрещать запись, чтобы не затереть облачный справочник пустым списком.
      _payrollLoaded.current = stf.status !== "unavailable" && acc.status !== "unavailable";
      if (stf.status === "found" && stf.value) { try { const p = JSON.parse(stf.value); if (Array.isArray(p)) { setStaff(p); staffRef.current = p; } } catch {} }
      else if (stf.status === "empty") { setStaff([]); staffRef.current = []; }
      if (pmap.status === "found" && pmap.value) { try { const p = JSON.parse(pmap.value); if (p && typeof p === "object" && !Array.isArray(p)) { setPayrollMap(p); payrollMapRef.current = p; } } catch {} }
      else if (pmap.status === "empty") { setPayrollMap({}); payrollMapRef.current = {}; }
      if (acc.status === "found" && acc.value) { try { const p = JSON.parse(acc.value); if (Array.isArray(p)) { setAccruals(p); accrualsRef.current = p; } } catch {} }
      else if (acc.status === "empty") { setAccruals([]); accrualsRef.current = []; }
    } catch (e) { console.warn("loadPayroll", e); }
    _bumpLoaded();
  }, [_bumpLoaded]);

  useEffect(() => { loadEstimates(); loadContracts(); }, []);
  // Финансы читают справочник сотрудников (выплаты зарплаты в расходах), поэтому грузим ФОТ
  // и тем, у кого открыты деньги. Всем остальным — не грузим вовсе, и запись остаётся
  // заблокированной (_payrollLoaded=false).
  useEffect(() => {
    if (currentPermissions.payroll !== "none" || currentPermissions.finance !== "none") loadPayroll();
  }, [currentPermissions.payroll, currentPermissions.finance, loadPayroll]);
  // Финансы грузим для админа, руководителя и прораба (прораб видит финансы ВНУТРИ объекта:
  // вкладка Финансы + карточки. Сам раздел «Финансы» ему всё равно закрыт через effScreen).
  // Замерщику финансы НЕ грузим — он видит себестоимость/маржу только в смете при заполнении.
  useEffect(() => {
    if (currentPermissions.finance !== "none" || currentPermissions.financialDetails || currentPermissions.objectFinanceSummary) loadFinance();
  }, [currentPermissions.finance, currentPermissions.financialDetails, currentPermissions.objectFinanceSummary, loadFinance]);

  // ── САМОИСЦЕЛЕНИЕ СИНХРОНИЗАЦИИ ──
  const [resyncing, setResyncing] = useState(false);
  // Ручная пересинхронизация: дослать зависшие правки в облако (со слиянием) и перечитать всё с сервера
  const resyncNow = useCallback(async () => {
    if (resyncing) return;
    setResyncing(true);
    try {
      // «Повторить» — единственный способ снова попробовать запись, отбитую по ПРАВАМ.
      // Автоповторов у неё нет специально (правила ответят так же), но к этому моменту право
      // могли выдать в матрице, а человек — перезайти и получить токен с новым флагом.
      storage.clearDenied();
      // Дожимаем и ПРОИЗВОДСТВО целиком (правки карточек + фоновые bg_* + хвост очереди команд) —
      // раньше кнопка «Повторить сейчас» гоняла только flushDirty. await: спиннер «Синхронизирую…»
      // держится, пока попытки реально не завершились.
      try { await flushAllProductionPending(); } catch(e) { console.warn("flush prod pending err", e); }
      // Отклонённые записи (реестр несохранённого) — тоже часть «повторить»: без этого
      // кнопка чинила только dirty-очередь, а отбитый сейв так и лежал мёртвым.
      try { await _retryFailedSavesRef.current?.(); } catch(e) { console.warn("retry fails err", e); }
      await storage.flushDirty();
      await Promise.all([loadEstimates(), loadContracts()]);
      if (currentPermissions.finance !== "none" || currentPermissions.financialDetails || currentPermissions.objectFinanceSummary) await loadFinance();
      const left = storage.dirtyKeysVisible().length;
      setDirtyCount(left);
      // гасим только когда чисто ВЕЗДЕ: успех storage не должен скрывать ошибку производства
      if (left === 0 && _prodUnsyncedIds.current.size === 0) setCloudError(false);
    } catch(e) { console.warn("resync err", e); }
    setResyncing(false);
  }, [resyncing, loadEstimates, loadContracts, loadFinance, currentUser?.role, flushAllProductionPending]);
  const _resyncRef = useRef(resyncNow); _resyncRef.current = resyncNow;
  const cloudErrorRef = useRef(cloudError); cloudErrorRef.current = cloudError;
  // Авто-флеш зависших правок: при старте, периодически, при возврате сети и
  // при возвращении в приложение.
  //
  // Про телефон. Когда вкладка уходит в фон, браузер замораживает таймеры:
  // человек переключился на другое приложение, вернулся — а баннер «облако
  // недоступно» ещё висит, потому что следующая проверка будет только через
  // полторы минуты. Отсюда ощущение, что он не гаснет вообще. Поэтому:
  //   · проверяем сразу при возврате на вкладку (visibilitychange/pageshow);
  //   · пока баннер горит, проверяем чаще — раз в 20 секунд вместо 90.
  // Условие гашения берём из общего помощника: раньше здесь считались ВИДИМЫЕ
  // dirty-ключи, включая legacy-карантин, который автоматически не отправляется
  // никогда, — с ним баннер не погас бы уже ни при каких условиях.
  useEffect(() => {
    let stop = false, iv = 0;
    const flush = () => {
      if (stop) return;
      storage.flushDirty()
        .then(() => { if (!stop) { setDirtyCount(storage.dirtyKeysVisible().length); _clearCloudErrorIfAllClean(); } })
        .catch(() => { if (!stop) setDirtyCount(storage.dirtyKeysVisible().length); })
        .finally(() => { if (!stop) schedule(); });
    };
    const schedule = () => {
      clearTimeout(iv);
      iv = setTimeout(flush, cloudErrorRef.current ? 20000 : 90000);
    };
    const onWake = () => { if (document.visibilityState === "visible") flush(); };
    flush();
    const onOnline = () => _resyncRef.current && _resyncRef.current();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      stop = true; clearTimeout(iv);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [_clearCloudErrorIfAllClean]);
  // Индикатор «есть несинхронизированные изменения» (свои — dirtyCount; legacy-карантин — отдельно)
  useEffect(() => {
    const upd = () => { setDirtyCount(storage.dirtyKeysVisible().length); setLegacyDirtyN(storage.legacyDirtyKeys().length); setDeniedN(storage.deniedKeys().length); };
    upd();
    const iv = setInterval(upd, 5000);
    return () => clearInterval(iv);
  }, []);

  // ── Сохранение списка смет с защитой от рассинхрона ──
  // opts.replace=true — записать ровно `list` (восстановление из бэкапа)
  // opts.removedIds — id, которые нужно удалить из объединённого набора (явное удаление)
  const saveEstimates = useCallback(async (list, opts = {}) => {
    // Те же молчаливые выходы, что и в saveListProtected: смета «сохранена» в интерфейсе,
    // а в базу не ушла. Теперь каждый отказ виден в реестре несохранённого и повторяем.
    const _blocked = (reason) => {
      try { opts.onBlocked?.(reason); } catch {}
      _reportSaveFail(STORAGE_KEY, reason, reason === "bad-list" ? null : () => saveEstimatesRef.current(list, opts));
      return undefined;
    };
    if (storage.isReadOnlyTab()) return _blocked("read-only-tab");
    if (!_estimatesLoaded.current) { console.warn("saveEstimates заблокирован: данные ещё не загружены/недоступны"); return _blocked("not-loaded"); }
    if (!Array.isArray(list)) { console.error("saveEstimates: список не массив — отмена"); return _blocked("bad-list"); }
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
        return _blocked("db-unavailable");
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
      return _blocked("empty-over-data");
    }

    // Синхронизируем UI с объединённым набором (чтобы не потерять подтянутые чужие сметы)
    estimatesRef.current = finalList;
    setEstimates(finalList);

    setSaving(true);
    setSyncStatus("saving");
    try {
      // Авто-бэкап предыдущего состояния (последние 20). Каждый снимок — свой ключ,
      // читаем только оглавление: архив смет весил 5,4 МБ и читался на КАЖДОЕ
      // сохранение, а смета автосохраняется раз в 0,9 секунды. См. src/backups.js.
      try {
        if (prevStatus === "found" && prevValue) {
          const idxKey = backupIndexKey(BACKUPS_KEY);
          let index = [];
          try { const raw = await storage.get(idxKey); index = normalizeIndex(raw?.value); } catch {}
          const sameAsLast = index[0] && index[0].count === stored.length && Date.now() - index[0].ts < 60_000;
          if (!sameAsLast) {
            const ts = Date.now();
            const snap = makeSnapshot({ ts, by: currentUser?.name || "", count: stored.length, data: prevValue });
            const step = pushIndex(index, snap);
            await storage.setCloudOnly(backupItemKey(BACKUPS_KEY, ts), JSON.stringify(snap));
            await storage.setCloudOnly(idxKey, JSON.stringify(step.index));
            for (const oldTs of step.drop) {
              try { await storage.setCloudOnly(backupItemKey(BACKUPS_KEY, oldTs), null); } catch {}
            }
          }
        }
      } catch(e) { console.warn("backup err", e); }
      const res = await storage.set(STORAGE_KEY, JSON.stringify(finalList));
      if (res && res.fbOk === false) {
        console.error("Firebase save FAILED:", res.fbError); setCloudError(true); setSyncStatus("error"); setSaving(false);
        if (opts.requireCloud) return _blocked(res.fbError === "read-only-tab" ? "read-only-tab" : "cloud-failed");
        return false;
      }
      else { _clearCloudErrorIfAllClean(); setSyncStatus("saved"); setTimeout(()=>setSyncStatus("idle"), 3000); }
    } catch(e) {
      console.error(e); setCloudError(true); setSyncStatus("error"); setSaving(false);
      if (opts.requireCloud) return _blocked("cloud-failed");
      return false;
    }
    setSaving(false);
    _clearSaveFails(STORAGE_KEY);
    return finalList;
  }, [currentUser, _clearCloudErrorIfAllClean, _reportSaveFail, _clearSaveFails]);
  const saveEstimatesRef = useRef(null);
  saveEstimatesRef.current = saveEstimates;

  // Перед изменением прайса закрепляем действующие на этот момент цену и себестоимость
  // только в заполненных legacy-строках. Транзакция работает с самой свежей облачной
  // версией списка, поэтому параллельная правка сметы другого сотрудника не перезаписывается.
  // Само открытие приложения ничего не мигрирует. Если облако не подтвердило запись,
  // AdminPage блокирует изменение прайса.
  const protectHistoricalEstimatePricing = useCallback(async () => {
    const catalog = getEffectiveCatalog().map(getEffectiveWork);
    let sealError = "";
    const result = await storage.mutateTransaction(STORAGE_KEY, currentList => {
      let changed = false;
      const protectedList = currentList.map(estimate => {
        // Одна битая смета не должна ронять всю заморозку и блокировать прайс
        // навсегда: оставляем её как есть и называем её id в сообщении.
        let protectedRows;
        try { protectedRows = sealLegacyEstimateRows(estimate?.rows, catalog); }
        catch (e) { sealError = `смета ${estimate?.id || "?"}: ${e?.message || e}`; return estimate; }
        if (protectedRows === estimate?.rows) return estimate;
        changed = true;
        return { ...estimate, rows: protectedRows };
      });
      return changed ? protectedList : currentList;
    });
    // Возвращаем ПРИЧИНУ отказа, а не голое false: сбоев шесть, а сообщение было одно.
    if (!result?.committed) return { ok: false, reason: result?.reason || "unknown", detail: sealError };
    if (!result.value) return { ok: false, reason: "empty", detail: sealError };
    try {
      const protectedList = JSON.parse(result.value);
      if (!Array.isArray(protectedList)) return { ok: false, reason: "not-array", detail: sealError };
      estimatesRef.current = protectedList;
      setEstimates(protectedList);
      return { ok: true, detail: sealError };
    } catch {
      return { ok: false, reason: "bad-json", detail: sealError };
    }
  }, []);

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
    // МОЛЧАЛИВЫЕ ОТКАЗЫ — главная причина «внёс операцию, вышел, а её нет». Пять веток
    // ниже возвращали undefined без единого слова наружу, а вызывающий код это не
    // проверял. Теперь причина уходит в opts.onBlocked, и вызывающий может показать её.
    // Причина уходит и вызывающему (opts.onBlocked — форма покажет её у себя), и в общий
    // реестр несохранённого, чтобы фоновые сохранения без обработчика тоже были видны.
    const _blocked = (reason) => {
      try { opts.onBlocked?.(reason); } catch {}
      // bad-list — программная ошибка, повторять тот же мусор смысла нет.
      _reportSaveFail(key, reason, reason === "bad-list" ? null
        : () => _saveListProtectedQueued.current(key, backupKey, list, applyState, opts));
      return undefined;
    };
    if (storage.isReadOnlyTab()) return _blocked("read-only-tab");
    if (!Array.isArray(list)) { console.error("saveListProtected: не массив", key); return _blocked("bad-list"); }
    // identityKey — по какому полю мерджить (по умолчанию "id"; у production записей его нет,
    // там ключ — "objectId", иначе слияние молча даёт пустой список и сохранение блокируется).
    const { replace = false, removedIds = [], allowEmpty = false, loadedRef = null, identityKey = "id", hardReplace = false } = opts;
    if (loadedRef && !loadedRef.current) { console.warn("saveListProtected заблокирован: не загружено", key); return _blocked("not-loaded"); }

    let stored = [], prevValue = null, prevStatus = "empty";
    try {
      const prevCheck = await storage.getResult(key);
      prevStatus = prevCheck.status; prevValue = prevCheck.value;
      if (prevCheck.status === "found" && prevCheck.value) {
        try { const p = JSON.parse(prevCheck.value); if (Array.isArray(p)) stored = p; } catch {}
      } else if (prevCheck.status === "unavailable") {
        console.error("saveListProtected ЗАБЛОКИРОВАН: база недоступна", key);
        setCloudError(true);
        return _blocked("db-unavailable");
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
      return _blocked("empty-over-data");
    }

    if (applyState) applyState(finalList);

    try {
      if (prevStatus === "found" && prevValue) {
        // Снимок — в свой ключ, в указателе только оглавление. Читаем оглавление
        // (сотни байт), а не весь архив (мегабайты): см. src/backups.js.
        const idxKey = backupIndexKey(backupKey);
        let index = [];
        try { const raw = await storage.get(idxKey); index = normalizeIndex(raw?.value); } catch {}
        // Тот же самый список уже лежит верхним снимком — второй раз не пишем.
        const lastCount = index[0] ? index[0].count : null;
        const sameAsLast = lastCount === stored.length && index[0] && Date.now() - index[0].ts < 60_000;
        if (!sameAsLast) {
          const ts = Date.now();
          const snap = makeSnapshot({ ts, by: currentUser?.name || "", count: stored.length, data: prevValue });
          const step = pushIndex(index, snap);
          await storage.setCloudOnly(backupItemKey(backupKey, ts), JSON.stringify(snap));
          await storage.setCloudOnly(idxKey, JSON.stringify(step.index));
          // Вытесненные снимки стираем, иначе база растёт без предела.
          for (const oldTs of step.drop) {
            try { await storage.setCloudOnly(backupItemKey(backupKey, oldTs), null); } catch {}
          }
        }
      }
      const res = await storage.set(key, JSON.stringify(finalList));
      if (res && res.fbOk === false) {
        console.error("Firebase save FAILED:", key, res.fbError); setCloudError(true);
        // Для денег «записалось локально» — это НЕ записалось. requireCloud заставляет
        // считать такой исход провалом, чтобы вызывающий не закрывал форму молча.
        if (opts.requireCloud) return _blocked(res.fbError === "read-only-tab" ? "read-only-tab" : "cloud-failed");
      } else { _clearCloudErrorIfAllClean(); }
    } catch(e) {
      console.error(e); setCloudError(true);
      if (opts.requireCloud) return _blocked("cloud-failed");
    }
    // Дошли до конца — раздел записан, старые строки «не сохранено» по нему снимаем.
    _clearSaveFails(key);
    return finalList;
  }, [currentUser, _clearCloudErrorIfAllClean, _reportSaveFail, _clearSaveFails]);

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
  _saveListProtectedQueued.current = saveListProtected;

  // «Повторить» на плашке: гоняем сохранённые payload'ы заново. Строка исчезает сама —
  // успешный сейв того же ключа снимает её через _clearSaveFails.
  const [retryingSaves, setRetryingSaves] = useState(false);
  const retryFailedSaves = useCallback(async () => {
    const jobs = [...(_saveFailPayloads.current?.values() || [])];
    if (!jobs.length) { _saveFailsRef.current = []; setSaveFails([]); return; }
    setRetryingSaves(true);
    try { for (const run of jobs) { try { await run(); } catch (e) { console.warn("retry save", e); } } }
    finally { setRetryingSaves(false); }
  }, []);
  _retryFailedSavesRef.current = retryFailedSaves;

  // Сколько позиций (с qty>0) в наборе rows
  const countFilled = (rws) => Object.values(rws||{}).filter(r => Number(r?.qty) > 0).length;
  const _allowEmptySave = useRef(false); // явное разрешение сохранить пустую смету (Сбросить позиции)

  // ── Бэкапы / восстановление ──
  const openBackups = async () => {
    try {
      // Новые снимки лежат по указателю, старые — в общем массиве. Показываем и те, и те.
      const [bRaw, iRaw] = await Promise.all([storage.get(BACKUPS_KEY), storage.get(backupIndexKey(BACKUPS_KEY))]);
      setBackupsModal(mergeBackupViews(bRaw?.value, iRaw?.value, BACKUPS_KEY));
    } catch(e) { setBackupsModal([]); }
  };
  // Данные снимка: у старого они в самой строке, у нового — в своём ключе.
  const _snapData = async (snap) => loadSnapshotData(snap, async (k) => (await storage.get(k))?.value || null);
  // ТОЧЕЧНОЕ ВОССТАНОВЛЕНИЕ: вернуть ТОЛЬКО пропавшие сметы из снимка (по id),
  // не трогая ни одну существующую смету и вообще ничего больше (финансы/объекты — не при чём).
  const recoverMissingFromBackup = async (snap) => {
    if (!snap) return;
    const data = await _snapData(snap);
    if (!data) { window.alert("Снимок не читается — возможно, облако недоступно. Попробуйте ещё раз."); return; }
    let list;
    try { list = JSON.parse(data); } catch { window.alert("Не удалось прочитать бэкап"); return; }
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
    if (!snap) return;
    const data = await _snapData(snap);
    if (!data) { window.alert("Снимок не читается — возможно, облако недоступно. Попробуйте ещё раз."); return; }
    let list;
    try { list = JSON.parse(data); } catch { window.alert("Не удалось прочитать бэкап"); return; }
    if (!Array.isArray(list)) { window.alert("Бэкап повреждён"); return; }
    // Отфильтровываем мусор (null/undefined/без id), чтобы не записать битые записи
    list = list.filter(e => e && typeof e==="object" && e.id);
    if (!confirmDangerous(`Восстановить архив на момент ${new Date(snap.ts).toLocaleString("ru-RU")}?\nСметы: ${list.length}. Текущая версия уйдёт в бэкап и её можно вернуть обратно.`)) return;
    const wasN = estimatesRef.current.length;
    _allowEmptySave.current = true; // восстановление может заменить на меньший набор
    estimatesRef.current = list;
    setEstimates(list);
    await saveEstimates(list, { replace: true }); // ровно снимок, текущая версия уйдёт в бэкап
    logBackupOp("восстановил из бэкапа", "Архив смет",
      { field: "снимок", old: `${_snapMoment(snap.ts)} · было смет: ${wasN}`,
        new: `смет в снимке: ${list.length}`, detail: `автор снимка: ${snap.by || "—"}` });
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
        // Оглавление вместо всего архива: снимок весит ~350 КБ, и тридцать штук в одном
        // ключе давали 8,4 МБ, которые читались и переписывались после КАЖДОЙ правки.
        const wsIdxKey = backupIndexKey(WORKSPACE_BACKUPS_KEY);
        let wsIndex = [];
        try { const iRaw = await storage.get(wsIdxKey); wsIndex = normalizeIndex(iRaw?.value); } catch {}
        // Сигнатура по counts ловит добавление/удаление записей, но НЕ ловит правку поля
        // без изменения количества (напр. поменяли цену/статус) — добавляем max updatedAt,
        // чтобы такие правки тоже создавали новый снимок.
        const maxTs = Math.max(0, ...[...objectsRef.current, ...estimatesRef.current, ...contractsRef.current, ...financeTxRef.current].map(x => x?.updatedAt || x?.createdAt || 0));
        const sig = `${snap.counts.o}|${snap.counts.e}|${snap.counts.c}|${snap.counts.f}|${maxTs}`;
        // Подпись держим в оглавлении: «ничего не изменилось» видно, не читая сам снимок.
        if (wsIndex[0] && wsIndex[0].sig === sig) return;
        snap._sig = sig;
        // Автоматический технический снимок не является пользовательской правкой.
        // При недоступном облаке просто повторим его после следующего изменения/входа,
        // но не создаём dirty-копию и не блокируем выход ложным предупреждением.
        const step = pushIndex(wsIndex, { ts: snap.ts, by: snap.by, count: snap.counts.e, sig, counts: snap.counts }, 30);
        await storage.setCloudOnly(backupItemKey(WORKSPACE_BACKUPS_KEY, snap.ts), JSON.stringify(snap));
        await storage.setCloudOnly(wsIdxKey, JSON.stringify(step.index));
        for (const oldTs of step.drop) {
          try { await storage.setCloudOnly(backupItemKey(WORKSPACE_BACKUPS_KEY, oldTs), null); } catch {}
        }
      } catch (e) { console.warn("ws snapshot err", e); }
    }, 8000);
    return () => { if (_wsSnapTimer.current) clearTimeout(_wsSnapTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, estimates, contracts, financeTx, loadedTick]);

  const openWorkspaceBackups = async () => {
    try {
      // Список строим по оглавлению — сами снимки (по 350 КБ) не читаем. Старый общий
      // массив тоже показываем: снимки, сделанные до перехода, никуда не делись.
      const [raw, iRaw] = await Promise.all([
        storage.get(WORKSPACE_BACKUPS_KEY), storage.get(backupIndexKey(WORKSPACE_BACKUPS_KEY)),
      ]);
      let legacy = []; try { if (raw?.value) legacy = JSON.parse(raw.value); } catch {}
      const idx = normalizeIndex(iRaw?.value).map(r => ({ ...r, key: backupItemKey(WORKSPACE_BACKUPS_KEY, r.ts) }));
      const seen = new Set(idx.map(r => r.ts));
      const old = Array.isArray(legacy) ? legacy.filter(x => x?.ts && !seen.has(x.ts)) : [];
      setWsBackupsModal([...idx, ...old].sort((a, b) => (b.ts || 0) - (a.ts || 0)));
    } catch { setWsBackupsModal([]); }
  };
  // Полный снимок рабочей области: у старых он лежит прямо в строке, у новых — в своём ключе.
  const _wsFull = async (row) => {
    if (row && Array.isArray(row.objects)) return row;
    if (!row?.key) return null;
    try {
      const raw = await storage.get(row.key);
      if (!raw?.value) return null;
      const parsed = JSON.parse(raw.value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch { return null; }
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
    // Выгрузка = копия всей базы уходит на чужой диск. Кто и когда её сделал — должно быть видно.
    logBackupOp(failed.length ? "выгрузил НЕПОЛНЫЙ бэкап" : "выгрузил полный бэкап", "Экспорт базы (JSON)",
      { field: "файл", new: a.download,
        detail: Object.entries(snapshot._counts || {}).map(([k, n]) => `${k}: ${n}`).join(", ")
                + (failed.length ? ` · НЕ прочитано: ${failed.join(", ")}` : "") });
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
    // Пишем НАМЕРЕНИЕ до первой записи: если восстановление развалится на середине,
    // в журнале всё равно останется, кто и каким файлом его запускал.
    await logBackupOp("начал восстановление ВСЕЙ базы из файла", "Импорт базы (JSON)",
      { field: "файл", old: `текущая база: ${firebaseConfig.projectId || "?"}`,
        new: `${snap._exportedAt || "?"} · база «${snap._env || "?"}»${snap.databaseProject ? " · проект " + snap.databaseProject : ""}`,
        detail: Object.entries(snap._counts || {}).map(([k, n]) => `${k}: ${n}`).join(", ")
                + (snap._incomplete ? ` · файл НЕПОЛНЫЙ: ${snap._incomplete.join(", ")}` : ""), source: "import" });
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
    // Ждём записи журнала ДО перезагрузки — иначе итог операции просто не успевал сохраниться.
    await logBackupOp(okMsg === "Восстановление завершено УСПЕШНО" ? "восстановил ВСЮ базу из файла" : "восстановил базу ЧАСТИЧНО",
      "Импорт базы (JSON)",
      { field: "результат", old: `${snap._exportedAt || "?"} · база «${snap._env || "?"}»`,
        new: `разделов: ${done}${pubDone ? `, публичных нод: ${pubDone}` : ""}${auditMerged ? `, журнал +${auditMerged}` : ""}`,
        detail: [fail ? `ошибок: ${fail}` : "", skipped.length ? `пропущено: ${skipped.join(", ")}` : "",
                 cloudFailed.length ? `не записано в облако: ${cloudFailed.join(", ")}` : ""].filter(Boolean).join(" · "),
        source: "import" });
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
      const nPos = resolveEstimateRows(e.rows, getEffectiveCatalog()).length;
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
    logBackupOp("выгрузил сметы в таблицу", "Экспорт смет (CSV)",
      { field: "файл", new: `сметы-${new Date().toISOString().slice(0, 10)}.csv`,
        detail: `строк: ${rows.length}${(!estsR.ok || !objsR.ok) ? " · база отвечала не полностью" : ""}` });
  };

  // Точечно вытащить ТОЛЬКО пропавшие сметы из снимка рабочего пространства,
  // не восстанавливая финансы/объекты/договоры (их не трогаем совсем).
  const recoverMissingEstimatesFromWs = async (row) => {
    const snap = await _wsFull(row);
    if (!snap) { window.alert("Снимок не читается — возможно, облако недоступно. Попробуйте ещё раз."); return; }
    const list = Array.isArray(snap?.estimates) ? snap.estimates.filter(e => e && e.id) : [];
    if (!list.length) { window.alert("В этом снимке нет смет."); return; }
    const haveIds = new Set(estimatesRef.current.map(e => e.id));
    const missing = list.filter(e => !haveIds.has(e.id));
    if (missing.length === 0) { window.alert("В этом снимке нет смет, которых сейчас не хватает — все уже на месте."); return; }
    const names = missing.slice(0, 12).map(e => `• ${e.proj?.name || "Без названия"}${e.proj?.address ? ` — ${e.proj.address}` : ""}`).join("\n");
    if (!window.confirm(`Вернуть недостающие сметы из снимка ${new Date(snap.ts).toLocaleString("ru-RU")}?\n\nБудет ДОБАВЛЕНО смет: ${missing.length}\n${names}${missing.length > 12 ? `\n…и ещё ${missing.length - 12}` : ""}\n\nФинансы, объекты и договоры НЕ трогаем — добавятся только пропавшие сметы.`)) return;
    await saveEstimates([...estimatesRef.current, ...missing]);
    logBackupOp("вернул недостающие сметы из снимка", "Снимок рабочего пространства",
      { field: "сметы", old: _snapMoment(snap.ts), new: `добавлено: ${missing.length}`,
        detail: missing.slice(0, 10).map(e => e.proj?.name || e.id).join(", ") + (missing.length > 10 ? "…" : "") });
    setWsBackupsModal(null);
    window.alert(`Возвращено смет: ${missing.length} ✓\nФинансы и всё остальное не тронуты.`);
  };
  const restoreWorkspace = async (row) => {
    if (!row) return;
    const snap = await _wsFull(row);
    if (!snap) { window.alert("Снимок не читается — возможно, облако недоступно. Попробуйте ещё раз."); return; }
    const o = Array.isArray(snap.objects) ? snap.objects : [];
    const e = Array.isArray(snap.estimates) ? snap.estimates : [];
    const c = Array.isArray(snap.contracts) ? snap.contracts : [];
    const f = Array.isArray(snap.financeTx) ? snap.financeTx : [];
    if (!confirmDangerous(`Восстановить рабочее пространство на ${new Date(snap.ts).toLocaleString("ru-RU")}?\n\nОбъектов: ${o.length}\nСмет: ${e.length}\nДоговоров: ${c.length}\nФин. операций: ${f.length}\n\nТекущее состояние уйдёт в бэкап.`)) return;
    const wasO = objectsRef.current.length, wasE = estimatesRef.current.length,
          wasC = contractsRef.current.length, wasF = financeTxRef.current.length;
    _allowEmptySave.current = true;
    objectsRef.current = o; setObjects(o);
    estimatesRef.current = e; setEstimates(e);
    contractsRef.current = c; setContracts(c);
    if (f.length > 0) { financeTxRef.current = f; setFinanceTx(f); }
    await saveObjects(o, { replace: true, allowEmpty: true });
    await saveEstimates(e, { replace: true });
    await saveContracts(c, { replace: true, allowEmpty: true });
    if (f.length > 0) await saveFinanceTx(f, { replace: true });
    logBackupOp("восстановил рабочее пространство", "Снимок рабочего пространства",
      { field: "снимок", old: `${_snapMoment(snap.ts)} · было: объектов ${wasO}, смет ${wasE}, договоров ${wasC}, фин. операций ${wasF}`,
        new: `стало: объектов ${o.length}, смет ${e.length}, договоров ${c.length}, фин. операций ${f.length || wasF}`,
        detail: f.length ? "" : "финансы в снимке пусты — не тронуты" });
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
      logBackupOp("импортировал сметы из JSON", "Импорт смет",
        { field: "сметы", old: `было: ${cur.length}`, new: `добавлено: ${toAdd.length}`,
          detail: [`в файле: ${incoming.length}`, customWorks.length ? `позиций в каталог: ${customWorks.length}` : "",
                   `id: ${toAdd.slice(0, 10).map(x => x.id).join(", ")}${toAdd.length > 10 ? "…" : ""}`].filter(Boolean).join(" · "),
          source: "import" });
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
  const setRow = useCallback((name, field, val) => setRows(prev => {
    // ОТКУДА БРАЛИСЬ ДВОЙНИКИ. Читал редактор строку как rows[код] || rows[название]
    // (старые сметы хранили строки по названию), а писал ВСЕГДА по коду. Первая же
    // правка старой строки заводила вторую запись под кодом, а запись под названием
    // оставалась в данных со СТАРЫМ объёмом и больше нигде не показывалась. Дальше
    // очистка объёма чистила только запись под кодом — и удалённая работа продолжала
    // жить в данных. Пишем туда, где строка уже лежит; новая по-прежнему идёт по коду.
    name = existingEstimateRowKey(prev, name, getEffectiveCatalog());
    const before = prev[name] || {};
    let next = { ...before, [field]: val };
    // Новая заполненная позиция фиксирует актуальные цену/себестоимость именно сейчас.
    // Снимок не удаляем при временном обнулении количества: это часть истории сметы.
    if (field === "qty" && Number(before.qty || 0) <= 0 && Number(val || 0) > 0 && !before.pricingSnapshot) {
      const work = getEffectiveCatalog().find(w => w.code === name || w.name === name);
      if (work) next = { ...next, pricingSnapshot: createEstimatePricingSnapshot(getEffectiveWork(work)) };
    }
    return { ...prev, [name]: next };
  }), []);

  // Подсказки только анализируют текущую смету. Добавление идёт через setRow,
  // поэтому цена и себестоимость фиксируются тем же способом, что при ручном вводе.
  const estimateSuggestionCatalog = useMemo(() => getEffectiveCatalog(), [catalogVersion]);
  const estimateSuggestionRules = useMemo(
    () => resolveEstimateSuggestionRules(_catalogOverrides, estimateSuggestionCatalog),
    [catalogVersion, estimateSuggestionCatalog],
  );
  const estimateSuggestions = useMemo(() => buildEstimateSuggestions(
    rows,
    estimateSuggestionCatalog,
    estimateSuggestionRules,
  ).map(item => {
    const targetWork = estimateSuggestionCatalog.find(work => work.code === item.targetCode);
    return {
      ...item,
      targetPrice: targetWork ? getBasePrice(targetWork) : null,
    };
  }), [rows, estimateSuggestionCatalog, estimateSuggestionRules]);
  const addEstimateSuggestions = useCallback(items => {
    for (const item of items || []) {
      const qty = Number(item?.qty);
      if (item?.targetCode && Number.isFinite(qty) && qty > 0) {
        setRow(item.targetCode, "qty", qty);
      }
    }
  }, [setRow]);

  // Общая скидка сметы применяется К КАЖДОЙ ПОЗИЦИИ, а не только к итогу: цена за
  // единицу, сумма строки, разделы, КП и все документы из сметы показывают одно и
  // то же число. Базовая (прайсовая) цена при этом не переписывается — она остаётся
  // в каталоге/manualPrice, поэтому процент скидки можно менять туда-обратно.
  const _discPct = Math.min(100, Math.max(0, Number(discount) || 0));
  const _markupPct = Math.max(0, Number(markup) || 0);
  const _pricing = { markupPercent: _markupPct, discountPercent: _discPct };
  const rowBasePrice = (work) => {
    const r = rows[work.code] || rows[work.name] || {};
    const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
    return getEstimateRowPrice(r, work, Number(r.qty || 0), r.complexity || "std", cpxPct);
  };
  // Цена в таблице — ровно та, что попадёт в КП, договор и акт.
  const rowPrice = (work) => clientUnitPrice(rowBasePrice(work), _pricing);
  const rowTotal = (work) => lineTotal((rows[work.code] || rows[work.name] || {}).qty, rowPrice(work));
  // Возвращает "цену от" если у работы нет точной цены (не идёт в расчёт)
  const rowPriceFrom = (work) => {
    const r = rows[work.code] || rows[work.name] || {};
    if (r.manualPrice !== undefined && r.manualPrice !== "") return null; // ручная цена — точная
    const w = resolveEstimateRowWork(getEffectiveWork(work), r);
    if (w.fixedPrice || (w.tiers && w.tiers.length > 0) || w.cost) return null; // есть точная цена
    return w.priceFrom || null;
  };
  // Единый проход по каталогу — вычисляет все суммы за O(n) один раз при изменении rows
  const allSumMap = useMemo(() => {
    const subMap = {};
    const catMap = {};
    let grandTotal = 0;      // итог для клиента: наценка + скидка
    let grandBaseTotal = 0;  // с наценкой, но без скидки — чтобы показать размер скидки
    let grandListTotal = 0;  // чистый прайс — чтобы показать размер наценки
    for (const cat of Object.keys(Gdyn)) {
      let catTotal = 0; let catBase = 0; let catList = 0;
      for (const sub of Object.keys(Gdyn[cat]||{})) {
        let subTotal = 0; let subBase = 0; let subList = 0;
        for (const w of (Gdyn[cat][sub]||[])) {
          const r = rows[w.code] || rows[w.name] || {};
          const qty = Number(r.qty || 0);
          if (!qty) continue;
          const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
          const base = getEstimateRowPrice(r, w, qty, r.complexity || "std", cpxPct);
          if (base) {
            subTotal += lineTotal(qty, clientUnitPrice(base, _pricing));
            subBase  += lineTotal(qty, clientUnitPrice(base, { markupPercent: _markupPct }));
            subList  += lineTotal(qty, base);
          }
        }
        subMap[cat+"||"+sub] = subTotal;
        catTotal += subTotal; catBase += subBase; catList += subList;
      }
      catMap[cat] = catTotal;
      grandTotal += catTotal; grandBaseTotal += catBase; grandListTotal += catList;
    }
    return { subMap, catMap, grand: grandTotal, grandBase: grandBaseTotal, grandList: grandListTotal };
  }, [rows, catalogVersion, _discPct, _markupPct]);
  const subSum = (cat, sub) => allSumMap.subMap[cat+"||"+sub] || 0;
  const catSum = (cat) => allSumMap.catMap[cat] || 0;
  const grand = Number(allSumMap.grand) || 0;
  const _markup = _markupPct;
  const _discount = _discPct;
  // И наценка, и скидка уже сидят в цене каждой позиции, поэтому к итогу ничего
  // не применяется повторно: итог = сумма строк. markupAmt и discAmt нужны только
  // для справочных строк «+ наценка» / «скидка учтена в ценах».
  const grandWithMarkup = Number(allSumMap.grandBase) || 0; // с наценкой, без скидки
  const markupAmt = grandWithMarkup - (Number(allSumMap.grandList) || 0);
  const discAmt = grandWithMarkup - grand;
  const final = grand;
  const kpData = useMemo(() => {
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
        out.push({ ...w, name: displayName, unit: displayUnit, qty, price, total: lineTotal(qty, price) });
      } else {
        const pf = rowPriceFrom(w);
        if (pf) fromOut.push({ ...w, name: displayName, unit: displayUnit, qty, priceFrom: clientUnitPrice(pf, _pricing) });
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
      for(const { row:r, work:w, qty } of resolveEstimateRows(e.rows, catalogForStats)) cost += rowCostPerUnit(r,w)*qty;
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
    // Статус для аналитики берём ЕДИНЫЙ (как на экране объектов): карточка производства
    // перевешивает статус сделки. Иначе подписанный объект, ушедший в работу, пропадал
    // из выручки и из воронки — цифры занижались, как только начинались работы.
    const _prodByObjAn = new Map((productions||[]).filter(p=>p&&p.objectId).map(p=>[p.objectId,p]));
    const uStatus = (o) => PROD_TO_DEAL[_prodByObjAn.get(o.id)?.prodStatus] || o.status || "new";
    // Подписанным считаем всё, что дошло до договора и дальше (в работе, на паузе, сдано).
    const SIGNED_SET = new Set(["signed","work","paused","done"]);
    // Рабочее множество — БЕЗ архива (как на дашборде); архив виден только в разбивке «по статусам».
    // Архив тоже по ЕДИНОМУ статусу: у объектов из миграции в поле лежит «archive», хотя на
    // экране они «В работе»/«Выполнен», и раньше они молча выпадали отсюда целиком.
    const baseObjs = baseObjsAll.filter(o => uStatus(o)!=="archive");

    // Список менеджеров — для кнопок фильтра на экране аналитики.
    const validManagerNames = new Set(nonViewerUsers.map(u=>u.name));
    const managers = [...new Set(liveObjects.map(o=>o.manager||"").filter(m=>m&&validManagerNames.has(m)))];

    const totalEst = baseObjs.length;   // только для пустого состояния «нет данных за период»

    // ── D. Рентабельность по категориям (по сметам объектов в периоде) ──
    const objIdSet = new Set(baseObjs.map(o=>o.id));
    const estForCats = scopedEstimates.filter(e=>e.objectId && objIdSet.has(e.objectId));
    const catFin = {};
    for(const e of estForCats){
      for(const { row:r, work:w, qty } of resolveEstimateRows(e.rows, catalogForStats)){
        const mp = Number(r.manualPrice);
        const price = (r.manualPrice!==undefined&&r.manualPrice!==""&&!isNaN(mp)) ? mp : getEstimateRowPrice(r, w, qty, r.complexity||"std", r.cpxPct!==undefined?Number(r.cpxPct):undefined);
        const c = w.cat||"—";
        if(!catFin[c]) catFin[c]={cat:c, revenue:0, cost:0};
        if(price) catFin[c].revenue += price*qty;
        catFin[c].cost += rowCostPerUnit(r,w)*qty;
      }
    }
    const catProfit = Object.values(catFin)
      // margin=null, а не 0, когда выручки нет: при нулевом знаменателе маржа не «нулевая»,
      // она неизвестна. Ноль здесь ещё и красил категорию в красный, будто она убыточная.
      .map(c=>({...c, profit:c.revenue-c.cost, margin:c.revenue>0?Math.round((c.revenue-c.cost)/c.revenue*100):null}))
      .sort((a,b)=>b.profit-a.profit).slice(0,8);

    // ВНИМАНИЕ: здесь когда-то считались менеджерские сводки, конверсия по типам,
    // динамика по месяцам, воронка, win rate, средний цикл сделки, топ объектов и
    // зависшие сделки — около двухсот строк. Ни одно из этих значений на экран не
    // выводилось: аналитика давно живёт на модуле buildAnalytics. Считалось это на
    // каждый рендер и выбрасывалось, а любой, кто читал код, думал, что цифры живые.
    // Нужен новый показатель — добавлять в analyticsModel.js, а не сюда.
    return { totalEst, managers, catProfit, objVal, estCost };
  }, [analyticsObjects, analyticsEstimates, contracts, productions, statsPeriod, statsDateFrom, statsDateTo, statsManager, allUsers, catalogVersion]);

  // Показатели «Главной» считаются той же моделью, но всегда за текущий месяц и
  // без фильтра по менеджеру — период на экране аналитики главную не двигает.
  //
  // СРЕЗ — ПО ПРАВУ «ГЛАВНАЯ» ИЗ МАТРИЦЫ РОЛЕЙ. Значение own в матрице было, но код
  // его не применял: сюда уходил ПОЛНЫЙ список объектов, и замерщик, у которого список
  // объектов пуст, всё равно читал с главной оборот всей компании — портфель, суммы
  // подписанного, сдачу месяца и график динамики по месяцам. Проверено на боевой.
  // Достаточно сузить objects/estimates: buildAnalytics сшивает сметы, договоры и
  // производство через objectId и всё, что не привязано к видимым объектам, отбрасывает.
  const dashboardObjects = useMemo(
    () => currentPermissions.dashboard === "own" ? estimatorDashboard.ownObjects : objects,
    [objects, currentPermissions.dashboard, estimatorDashboard],
  );
  const dashboardEstimates = useMemo(
    () => currentPermissions.dashboard === "own" ? estimatorDashboard.ownEstimates : estimates,
    [estimates, currentPermissions.dashboard, estimatorDashboard],
  );
  const dashboardStats = useMemo(() => buildAnalytics(
    { objects: dashboardObjects, estimates: dashboardEstimates, contracts, productions, financeTx,
      accounts: financeMeta?.accounts || [], estimateCost: analyticsData.estCost },
    { period: "month", users: allUsers },
  ), [dashboardObjects, dashboardEstimates, contracts, productions, financeTx, financeMeta, analyticsData, allUsers]);

  // Блоки аналитики (продажи / портфель / производство / финансы / качество).
  // Считает чистая функция buildAnalytics — те же числа доступны и для «Главной».
  // Себестоимость сметы берём тем же estCost, что и остальная аналитика, иначе
  // «перерасход к смете» разошёлся бы с блоком прибыли.
  const analyticsBlocks = useMemo(() => buildAnalytics(
    {
      objects: analyticsObjects,
      estimates: analyticsEstimates,
      contracts,
      productions,
      financeTx,
      accounts: financeMeta?.accounts || [],
      estimateCost: analyticsData.estCost,
    },
    {
      period: statsPeriod,
      from: statsDateFrom ? new Date(statsDateFrom).getTime() : null,
      to: statsDateTo ? new Date(statsDateTo).getTime() + 86399999 : null,
      manager: statsManager,
      // Имя менеджера у объекта — свободный текст, поэтому передаём реальных
      // сотрудников: варианты («Сергей Ш.») сводятся к заведённому в системе.
      users: allUsers,
    },
  ), [analyticsObjects, analyticsEstimates, contracts, productions, financeTx, financeMeta, analyticsData,
      statsPeriod, statsDateFrom, statsDateTo, statsManager, allUsers]);

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
      financeCalcMode:"contracts-v2",
    };
    // привязываем смету + все её доп. сметы
    const childIds = new Set(estimatesRef.current.filter(e=>e.parentId===est.id).map(e=>e.id));
    const newList = estimatesRef.current.map(e=>{
      if (e.id===est.id || childIds.has(e.id)) return {...e, objectId: objId};
      return e;
    });
    // Порядок важен: сначала объект, потом привязка смет. Если объект не записался, а
    // сметы уже получили его objectId — они повисли бы на несуществующем объекте, при
    // этом пользователю сказали бы «Объект создан ✓».
    let blockedReason = "";
    const savedObj = await saveObjects([newObj, ...objectsRef.current], { onBlocked: (r)=>{ blockedReason = r; } });
    if (!savedObj) {
      window.alert(`Объект НЕ создан: ${saveFailReasonText(blockedReason)}.\n\nСмета осталась на месте, ничего не перенесено. Повторите после «Повторить сохранение» в красной плашке сверху.`);
      return;
    }
    await saveEstimates(newList, { replace:true });
    window.alert(`Объект создан ✓ Смета перенесена в «Объекты»`);
  };

  // ── ЖУРНАЛ ПО СМЕТАМ ───────────────────────────────────────────────────────
  // Смета — главный денежный документ, а в журнале по ней до сих пор было пусто:
  // писалась только смена статуса. Проблема была в том, ЧТО именно писать: смета
  // автосохраняется каждые 0,9 секунды, и запись на каждое сохранение превратила бы
  // журнал в ленту нажатий клавиш. Поэтому пишем ИТОГ сессии редактирования —
  // сравниваем смету в момент открытия и в момент выхода, одна запись на заход.
  const _estAuditBase = useRef(null);
  const _estSnapshot = (est) => {
    if (!est) return null;
    const rows = Object.entries(est.rows || {}).filter(([, r]) => Number(r?.qty) > 0);
    return {
      id: est.id,
      name: est.proj?.name || est.proj?.address || "Смета",
      total: Math.round(Number(est.total) || 0),
      count: rows.length,
      discount: Number(est.discount) || 0,
      markup: Number(est.markup) || 0,
      status: est.status || "new",
      codes: new Set(rows.map(([code]) => code)),
    };
  };
  const _auditEstimateSession = useCallback((nextEst) => {
    const was = _estAuditBase.current;
    _estAuditBase.current = null;
    if (!was || !nextEst || was.id !== nextEst.id) return;
    const now = _estSnapshot(nextEst);
    if (!now) return;
    const added = [...now.codes].filter(c => !was.codes.has(c)).length;
    const gone = [...was.codes].filter(c => !now.codes.has(c)).length;
    const label = `${now.name}${nextEst.dsNumber ? ` (ДС №${nextEst.dsNumber})` : ""}`;
    const ev = { entity: "estimate", entityId: now.id, label, objectId: nextEst.objectId || "" };
    // Сумма — главное, что человек ищет в журнале. Отдельной записью, с разбором:
    // «+3 работы, −1» объясняет, откуда взялась разница, без списка на сорок строк.
    if (now.total !== was.total) {
      const parts = [added ? `+${added} работ` : "", gone ? `−${gone} работ` : ""].filter(Boolean);
      logChange(currentUser, { ...ev, field: "сумма сметы", action: "изменил смету",
        old: `${was.total.toLocaleString("ru-RU")} ₸`, new: `${now.total.toLocaleString("ru-RU")} ₸`,
        detail: parts.join(", ") });
    } else if (added || gone) {
      // Состав поменялся, а сумма нет — это тоже правка, и как раз такую хочется видеть.
      logChange(currentUser, { ...ev, field: "состав сметы", action: "изменил смету",
        old: `${was.count} работ`, new: `${now.count} работ`,
        detail: [added ? `+${added}` : "", gone ? `−${gone}` : ""].filter(Boolean).join(", ") });
    }
    if (now.discount !== was.discount) {
      logChange(currentUser, { ...ev, field: "скидка", action: "изменил смету", old: `${was.discount}%`, new: `${now.discount}%` });
    }
    if (now.markup !== was.markup) {
      logChange(currentUser, { ...ev, field: "наценка", action: "изменил смету", old: `${was.markup}%`, new: `${now.markup}%` });
    }
  }, [currentUser]);

  // ── Открыть смету на редактирование ──
  const openEstimate = (est) => {
    if (!canEditEstimate(est)) return;
    _estAuditBase.current = _estSnapshot(est);
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
    // Итог правки — в журнал. Здесь, а не в автосохранении: одна запись за заход в
    // смету вместо ленты из сорока по ходу набора.
    if (exists) _auditEstimateSession(updated);
    else logChange(currentUser, { entity: "estimate", entityId: updated.id, objectId: updated.objectId || "",
      label: updated.proj?.name || updated.proj?.address || "Смета", field: "смета", action: "создал смету",
      old: "—", new: `${Math.round(Number(updated.total) || 0).toLocaleString("ru-RU")} ₸` });
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
    // Удаление сметы в журнал: восстановить её можно только из бэкапа, и без записи
    // непонятно, была ли она вообще и кто её убрал.
    logChange(currentUser, { entity: "estimate", entityId: id, objectId: target.objectId || "",
      label: target.proj?.name || target.proj?.address || "Смета", field: "смета", action: "удалил смету",
      old: `${Math.round(Number(target.total) || 0).toLocaleString("ru-RU")} ₸`, new: "—" });
    // явное удаление — разрешаем пустой результат и удаляем по id из объединённого набора
    _allowEmptySave.current = true;
    await saveEstimates(newList, { removedIds: [id] });
    setTimeout(() => { _allowEmptySave.current = false; }, 1000);
  };


  // ── Генерация HTML договора ──
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
      const _estDiscPct = Math.min(100, Math.max(0, Number(est.discount) || 0));
      const _estPricing = { markupPercent: Number(est.markup) || 0, discountPercent: _estDiscPct };
      const rows = resolveEstimateRows(est.rows, catalog, { extraCat: EXTRA_CAT }).map(({ row: r, work: w, qty }) => {
        const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
        const raw = getEstimateRowPrice(r, w, qty, r.complexity || "std", cpxPct);
        // Скидка сметы сидит в цене каждой позиции — так же, как в редакторе и в договоре.
        const price = clientUnitPrice(raw, _estPricing);
        return { cat: w.cat || "Прочее", name: (r.manualName !== undefined ? r.manualName : w.name), unit: (r.manualUnit !== undefined ? r.manualUnit : (w.unit || "м²")), qty, price, sum: lineTotal(qty, price) };
      }).filter(Boolean);
      if (!rows.length) return null;
      const subtotal = rows.reduce((s, r) => s + r.sum, 0);
      const disc = _estDiscPct;
      const total = subtotal; // цены строк уже со скидкой — вычитать нечего
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
<div class="tot">${disc > 0 ? `Скидка ${disc}% учтена в ценах<br/>` : ""}Итого: <b>${F(total)} ₸</b></div>
</body></html>`;
    } catch (e) { console.warn("estimateToClientHtml err", e); return null; }
  };
  const publishDocs = async (objectId, opts = {}) => {
    const obj = objectsRef.current.find(o => o.id === objectId);
    if (!obj || !obj.progressShared || !obj.progressToken) return;
    // Тот же тормоз, но реже: документы клиента меняются раз в недели, а перегенерация
    // тянет договоры, сметы и акты и собирает HTML заново — самая дорогая из публикаций.
    if (!opts.force) {
      const last = _pubAt.current.get("d:" + objectId) || 0;
      if (Date.now() - last < 600_000) return;
    }
    _pubAt.current.set("d:" + objectId, Date.now());
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
  // Наценка и скидка сметы — один набор параметров цены на все документы из неё.
  const _estPricingOf = (est) => ({ markupPercent: Number(est?.markup) || 0, discountPercent: Number(est?.discount) || 0 });
  const estimateToWorks = (est) => {
    if (!est) return [];
    const catalog = getEffectiveCatalog();
    const pricing = _estPricingOf(est);
    // resolveEstimateRows — то же правило выбора строки, что у самой сметы.
    // Раньше здесь перебирались rows напрямую, и договор воскрешал работы,
    // удалённые из сметы (их старая запись под названием остаётся в данных),
    // а свободные позиции без работы в каталоге, наоборот, выбрасывались.
    return resolveEstimateRows(est.rows, catalog, { extraCat: EXTRA_CAT }).map(({ row: r, work: w, qty }) => {
      const cpxPct = r.cpxPct!==undefined ? Number(r.cpxPct) : undefined;
      const rawPrice = getEstimateRowPrice(r, w, qty, r.complexity||"std", cpxPct);
      const displayName = r.manualName!==undefined ? r.manualName : w.name;
      const displayUnit = r.manualUnit!==undefined ? r.manualUnit : (w.unit||"м²");
      return {name:displayName,quantity:qty,unit:displayUnit,price:clientUnitPrice(rawPrice, pricing)};
    });
  };
  const dealEstimate = (deal) => estimatesRef.current.find(e=>e.id===deal.estId) || null;
  const dealToContract = (deal) => {
    const est = dealEstimate(deal);
    return {
      type:"repair_fiz", number:deal.contractNumber||"", date:deal.contractDate||new Date().toISOString().slice(0,10),
      clientId:deal.clientId, contragentId:deal.contragentId,
      works: estimateToWorks(est), discount: 0, // цены позиций уже клиентские
      ...((Number(est?.discount) || 0) > 0 ? { discountApplied: Number(est.discount) } : {}),
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
    const total = works.reduce((s,w)=>s+lineTotal(w.quantity,w.price),0);
    const dPct = est?.discount||0;
    const disc = Math.round(total*dPct/100);
    const final = total - disc;
    const esc = s => String(s||"").replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
    const rows = works.map((w,i)=>`<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i+1}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(w.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${w.quantity||0}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${esc(w.unit||"м²")}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(w.price||0)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(lineTotal(w.quantity,w.price))}</td></tr>`).join("");
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
    for (const { row: r, work: w, qty } of resolveEstimateRows(est.rows, catalog, { extraCat: EXTRA_CAT })) {
      const price = getEstimateRowPrice(r, w, qty, r.complexity || "std", r.cpxPct !== undefined ? Number(r.cpxPct) : undefined);
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

  // Нижняя панель телефона: максимум пять мест. Разделов бывает восемь, а подписи русские —
  // больше пяти в строку читаемо не помещается ни на одном телефоне. Редко используемые
  // уходят под «Ещё» в порядке этого списка; если и после этого больше четырёх — убираем
  // с конца. Порядок самих пунктов не меняется, чтобы привычные места не «прыгали».
  const [mobPrimary, mobMore] = useMemo(() => {
    if (NAV_ITEMS.length <= 5) return [NAV_ITEMS, []];
    const hidden = new Set();
    for (const id of ["masters", "admin", "contracts", "calendar"]) {
      if (NAV_ITEMS.length - hidden.size <= 4) break;
      if (NAV_ITEMS.some(i => i.id === id)) hidden.add(id);
    }
    for (let i = NAV_ITEMS.length - 1; i >= 0 && NAV_ITEMS.length - hidden.size > 4; i -= 1) hidden.add(NAV_ITEMS[i].id);
    return [NAV_ITEMS.filter(i => !hidden.has(i.id)), NAV_ITEMS.filter(i => hidden.has(i.id))];
  }, [NAV_ITEMS]);

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
  // ФОТ — своё право, а не производная от «Финансов»: зарплаты всех сотрудников
  // видеть должен не каждый, кому открыты деньги компании.
  const canPayroll = currentPermissions.payroll !== "none";
  const payrollWritable = currentPermissions.payroll === "edit";
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
  const hasObjectFinanceSummary = currentPermissions.objectFinanceSummary;
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
      {/* Сессия браузера ещё анонимная: база уже закрыта правилами, читать нечего.
          Показываем это отдельно от «облако недоступно» — причина другая и лечится входом. */}
      {/* Раньше эта подсказка показывалась ТОЛЬКО вместе с ошибкой загрузки. Но при
          устаревшем входе данные спокойно приходят из локального кеша, loadError
          false — и человек видел вместо неё «у вашей роли нет прав» и шёл к
          администратору. Показываем всегда, когда база не признаёт сотрудника. */}
      {needsReauth && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:501,background:"#b45309",color:"#fff",padding:"10px 16px",paddingTop:"calc(10px + env(safe-area-inset-top,0px))",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,flexWrap:"wrap",boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          🔑 Нужно войти заново — в этом браузере старый вход, база его больше не пускает. Дело НЕ в правах роли и НЕ в интернете. Всё несохранённое осталось на устройстве и уйдёт в базу после входа.
          <button onClick={()=>doLogout()} style={{background:"#fff",color:"#b45309",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Выйти и войти</button>
        </div>
      )}
      {/* Баннер: данные не загрузились — редактирование опасно */}
      {loadError && !needsReauth && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#dc2626",color:"#fff",padding:"10px 16px",paddingTop:"calc(10px + env(safe-area-inset-top,0px))",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          ⚠️ Не удалось загрузить данные из базы. НЕ редактируйте сметы — сохранение отключено для защиты данных.
          <button onClick={()=>window.location.reload()} style={{background:"#fff",color:"#dc2626",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Обновить</button>
        </div>
      )}
      {/* Плашка read-only вкладки: lease редактирования у другой вкладки */}
      {!editorTab && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:501,background:"#475569",color:"#fff",padding:"10px 16px",paddingTop:"calc(10px + env(safe-area-inset-top,0px))",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)",flexWrap:"wrap"}}>
          {_isViewer
            ? "Режим просмотра — изменения недоступны для этой учётной записи."
            : "Сервис открыт для редактирования в другой вкладке — здесь только просмотр (изменения не сохраняются)."}
          {!_isViewer && <button onClick={takeoverEditLease} style={{background:"#fff",color:"#475569",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Перехватить редактирование</button>}
        </div>
      )}
      {/* НЕ СОХРАНЕНО. Оранжевый баннер ниже — про «ушло локально, дожмём»; этот про «не ушло
          вообще». Красный, не прячется сам и держит payload: «Повторить» шлёт те же данные. */}
      {saveFails.length > 0 && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:502,background:"#b91c1c",color:"#fff",padding:"10px 16px",paddingTop:"calc(10px + env(safe-area-inset-top,0px))",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.25)",flexWrap:"wrap"}}>
          <span>⛔ НЕ СОХРАНЕНО:{" "}
            {saveFails.map((f,i)=>(
              <span key={f.id}>{i>0?" · ":" "}<b>{f.label}</b> — {saveFailReasonText(f.reason)}{f.count>1?` (×${f.count})`:""}</span>
            ))}
          </span>
          <button onClick={retryFailedSaves} disabled={retryingSaves}
            style={{background:"#fff",color:"#b91c1c",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:retryingSaves?"default":"pointer",fontFamily:"inherit"}}>
            {retryingSaves?"Повторяю…":"🔄 Повторить сохранение"}</button>
          <button onClick={()=>{ _saveFailPayloads.current.clear(); _saveFailsRef.current = []; setSaveFails([]); }}
            style={{background:"rgba(255,255,255,.2)",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            Отклонить</button>
        </div>
      )}
      {/* ОТКАЗ ПО ПРАВАМ И СБОЙ СЕТИ — РАЗНЫЕ БЕДЫ, И ЛЕЧАТСЯ ПО-РАЗНОМУ.
          Раньше баннер был один на оба случая и всегда говорил «облако недоступно»: человек с
          отобранным правом чинил интернет и отключал блокировщик, хотя сеть была в порядке, а
          приложение в это время молотило повторами, которые правила отбивали снова и снова. */}
      {!loadError && !needsReauth && !syncBannerHidden && (cloudError || prodUnsyncedN > 0 || dirtyCount > 0 || legacyDirtyN > 0 || deniedN > 0) && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:deniedN>0?"#b91c1c":"#d97706",color:"#fff",padding:"10px 16px",paddingTop:"calc(10px + env(safe-area-inset-top,0px))",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,.2)",flexWrap:"wrap"}}>
          {deniedN > 0
            ? <>🚫 База отклонила сохранение: у вашей роли нет прав на эти разделы ({deniedN}). Дело НЕ в интернете — повторять бесполезно, пока право не выдадут. Данные остались на этом устройстве и не потеряны: попросите администратора открыть доступ в «Права ролей», затем выйдите и войдите заново и нажмите «Повторить сейчас». Разделы: {storage.deniedKeys().map(k => saveFailLabel(k)).join(", ")}.</>
            : <>⚠️ {prodUnsyncedN > 0 ? `Изменения производства ожидают синхронизации (${prodUnsyncedN}) — ` : ""}Данные могут быть сохранены ТОЛЬКО на этом устройстве — облако недоступно{dirtyCount>0?` (несинхронизировано: ${dirtyCount})`:""}. Приложение само дожмёт синхронизацию, когда облако ответит. Если баннер не гаснет — проверьте интернет и отключите блокировщик рекламы для этого сайта.{legacyDirtyN>0?` Есть старые несинхронизированные правки без владельца (${legacyDirtyN}) — они НЕ отправляются автоматически, обратитесь к администратору.`:""}</>}
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
        .wrow-th-mob{display:none}
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
        /* Строка работы на телефоне: название сверху во всю ширину, под ним
           одна строка «цена за единицу — поле объёма — итог». Пятиколоночная
           шапка десктопа на телефоне скрыта: она описывала колонки, которых
           здесь нет, и подписи стояли не над своими данными. */
        @media(max-width:700px){
          .wrow{grid-template-columns:minmax(0,1fr)!important;row-gap:7px!important;
            align-items:stretch!important;padding:11px 12px!important}
          /* Шапка на телефоне: «Наименование» строкой, под ней подписи ровно
             над своими значениями — те же пропорции, что в строке работы.
             Пятиколоночная сетка десктопа здесь не годится: колонок три. */
          .wrow-th{display:block!important;padding:8px 12px!important}
          .wrow-th-mob{display:flex!important;gap:10px;margin-top:4px;align-items:baseline}
          .wth-qty{width:78px;flex-shrink:0;text-align:center}
          .wrow-mob-line{display:flex!important;align-items:center;gap:10px}
          .wrow-mob-line{padding:0}
          .wml-price{flex:1;min-width:0;font-size:11.5px;color:#94a3b8;white-space:nowrap;
            display:flex;align-items:center;gap:5px}
          /* priceCell собран для правой колонки десктопа — на телефоне он слева */
          .wml-price>div{justify-content:flex-start!important;min-width:0}
          .wml-unit{flex-shrink:0}
          .wml-total{flex-shrink:0;min-width:76px;text-align:right;font-size:12.5px;
            font-weight:800;color:#0f172a;white-space:nowrap}
        }
        /* Ряд категорий сметы (Черновые · Чистовые · Санузел · Прочие) стоял
           одной строкой без переноса и без прокрутки — всё, что не влезало
           в экран, просто обрезалось и было недоступно. Теперь листается
           пальцем; полосу прокрутки прячем, чтобы не съедала высоту. */
        .est-cats{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .est-cats::-webkit-scrollbar{display:none}
        .est-cats>button{flex:0 0 auto;white-space:nowrap}
        /* Плавающие элементы на телефоне перекрывались нижним меню (68px плюс
           безопасная зона), а полоска автосохранения ещё и была сдвинута на
           ширину бокового меню, которого на телефоне нет. */
        @media(max-width:700px){
          .float-fab{bottom:calc(80px + env(safe-area-inset-bottom,0px))!important;right:16px!important}
          .save-strip{left:0!important;bottom:calc(68px + env(safe-area-inset-bottom,0px))!important}
        }
        /* Панель редактора сметы на телефоне. Кнопки были разной высоты,
           «Финансы вкл» переносилось на две строки, а значок сохранения стоял
           дважды — в начале ряда и в конце. Дубль убран, кнопки приведены
           к одной высоте, надписи не переносятся. */
        @media(max-width:700px){
          .editor-header-right{flex-wrap:wrap!important;gap:6px!important;
            justify-content:flex-end!important;flex:1 1 100%!important}
          .editor-header-right button{min-height:34px!important;padding:6px 11px!important;
            font-size:11.5px!important;white-space:nowrap!important;line-height:1.1!important}
        }
        /* Вкладки карточки объекта: на телефоне их девять и они разваливались
           на три ряда, съедая пол-экрана. Одна строка с прокруткой вбок —
           полоса прокрутки скрыта, листается пальцем. */
        @media(max-width:700px){
          .obj-tabs{flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch;
            scrollbar-width:none;padding-bottom:2px}
          .obj-tabs::-webkit-scrollbar{display:none}
          .obj-tabs button{flex:0 0 auto!important;white-space:nowrap!important}
        }
        /* Карточка сметы на телефоне: ряд из шести кнопок не сжимался
           (flexShrink:0) и не переносился, поэтому выдавливал название и дату
           в узкую колонку, а сам вылезал за карточку. На узком экране
           разворачиваем карточку в столбец, кнопкам разрешаем перенос. */
        @media(max-width:700px){
          .est-card-row{flex-direction:column!important;align-items:stretch!important;gap:10px!important}
          /* Сумма — своей строкой, кнопки — от левого края. Пока сумма стояла
             в одной строке с кнопками, а кнопки прижимались вправо, шесть штук
             разваливались на три рваных ряда с дырами по краям. */
          .est-card-acts{flex-direction:column!important;align-items:stretch!important;gap:8px!important}
          .est-card-btns{flex-wrap:wrap!important;gap:6px!important;justify-content:flex-start!important}
          .est-card-btns button{padding:6px 10px!important;font-size:11px!important}
        }
        /* Карточка договора в «Документах» — та же болезнь, что была у сметы.
           Правая колонка (сумма + «+ Приложение», PDF, GDoc, корзина) стоит с
           flexShrink:0 и без переноса: на телефоне она забирала почти всю
           ширину, название «Договор подряда №1017 — Мукашев Чингиз Мейрамович»
           сжималось в колонку в пару слов и уходило под кнопки. */
        @media(max-width:700px){
          .doc-card-row{flex-direction:column!important;align-items:stretch!important;gap:10px!important}
          /* Сумма — своей строкой. Если оставить её в одной строке с кнопками,
             четыре кнопки перестают помещаться и рвутся на два неровных ряда. */
          .doc-card-side{text-align:left!important;display:flex!important;flex-direction:column!important;
            align-items:stretch!important;gap:8px!important}
          .doc-card-btns{flex-wrap:wrap!important;gap:6px!important;margin-top:0!important;
            justify-content:flex-start!important}
          .doc-card-btns button{padding:5px 8px!important;font-size:11px!important}
        }
        @media(max-width:700px){
          .sidebar{display:none!important}
          .sidebar-content{margin-left:0!important;padding-top:env(safe-area-inset-top,0px)!important;padding-bottom:calc(68px + env(safe-area-inset-bottom,0px))!important}
          .mob-nav-wrap{display:block!important}
          /* Полоска под часами и вырезом. Приложение открыто как отдельное
             (apple-mobile-web-app-capable), строка состояния прозрачная, поэтому
             прокручиваемый список проезжал прямо под часами и уровнем сети —
             фильтры «Все · Подряд · Ремонт» читались вперемешку с 23:57 и 5G.
             Отступа сверху тут мало: он держит только начало страницы, а
             прокрутка идёт под ним. Нужна непрозрачная накладка.
             z-index 45: выше содержимого, ниже нижнего меню (50) и окон (200+). */
          body::before{content:"";position:fixed;top:0;left:0;right:0;
            height:env(safe-area-inset-top,0px);background:#f8fafc;z-index:45;pointer-events:none}
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
        /* Нижнее меню. Разделов у админа восемь, и в панель телефона (412px) они не влезали:
           «Мастера» обрезались посередине, «Админка» уезжала за экран, снизу появлялась полоса
           прокрутки. Ужимать подписи бесполезно — русские слова по 9 букв требуют ~55px, а на
           восемь пунктов приходится по 51px. Поэтому в панели максимум ПЯТЬ мест: если разделов
           больше, редкие уходят под «Ещё» (лист над панелью). Пункты делят ширину поровну
           (flex:1 1 0), так что на любом экране ничего не режется и не прокручивается. */
        .mob-nav-wrap{display:none;position:fixed;bottom:0;left:0;right:0;z-index:50}
        .mob-nav{display:flex;background:#ffffff;border-top:1px solid #e2e8f0;box-shadow:0 -4px 16px rgba(15,23,42,.06);padding-bottom:env(safe-area-inset-bottom,0px)}
        .mob-nav-item{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;cursor:pointer;gap:3px;border-top:2px solid transparent;transition:all .15s}
        .mob-nav-item.active{border-top-color:#2563eb;background:rgba(37,99,235,.06)}
        .mob-nav-label{font-size:9.5px;font-weight:600;line-height:1.15;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
        .mob-more{background:#fff;border-top:1px solid #e2e8f0;border-radius:14px 14px 0 0;box-shadow:0 -10px 28px rgba(15,23,42,.12);padding:6px 0 4px}
        .mob-more-item{display:flex;align-items:center;gap:12px;padding:12px 18px;cursor:pointer;font-size:14px;font-weight:600;color:#334155}
        .mob-more-item.active{color:#2563eb;background:rgba(37,99,235,.06)}
        .mob-more-bd{position:fixed;inset:0;z-index:49;background:rgba(15,23,42,.18)}
        @media(max-width:365px){.mob-nav-item{padding:8px 2px}.mob-nav-label{font-size:9px}}
        /* Панели нет — не должно быть и затемнения: иначе поворот телефона в планшетную
           ширину оставил бы серую пелену поверх интерфейса. */
        @media(min-width:701px){.mob-more-bd{display:none}}
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
      {(() => {
        const goto = (id) => { setMobMoreOpen(false); setDealReturnId(null); setObjectReturnId(null); navigate(id, undefined); };
        const activeOf = (item) => effScreen===item.id
          || (effScreen==="editor" && !objectReturnId && item.id==="list")
          || (effScreen==="editor" && !!objectReturnId && item.id==="objects");
        const moreActive = mobMore.some(activeOf);
        return (
        <div className="mob-nav-wrap">
          {mobMoreOpen && mobMore.length>0 && (
            <div className="mob-more">
              {mobMore.map(item=>(
                <div key={item.id} className={"mob-more-item"+(activeOf(item)?" active":"")} onClick={()=>goto(item.id)}>
                  <span style={{fontSize:17,width:22,textAlign:"center",flexShrink:0}}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mob-nav">
            {mobPrimary.map(item=>{
              const isActive = activeOf(item);
              return (
              <div key={item.id} className={"mob-nav-item"+(isActive?" active":"")} onClick={()=>goto(item.id)}>
                <span style={{fontSize:19,lineHeight:1}}>{item.icon}</span>
                <span className="mob-nav-label" style={{color:isActive?"#2563eb":"#64748b"}}>{item.short||item.label}</span>
              </div>
              );
            })}
            {mobMore.length>0 && (
              <div className={"mob-nav-item"+(moreActive||mobMoreOpen?" active":"")} onClick={()=>setMobMoreOpen(v=>!v)}>
                <span style={{fontSize:19,lineHeight:1}}>⋯</span>
                <span className="mob-nav-label" style={{color:moreActive||mobMoreOpen?"#2563eb":"#64748b"}}>Ещё</span>
              </div>
            )}
          </div>
        </div>
        );
      })()}
      {mobMoreOpen && mobMore.length>0 && <div className="mob-more-bd" onClick={()=>setMobMoreOpen(false)}/>}

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
          <ProductionCalendar objects={liveObjects} productions={productions} onOpenObject={(id)=>openIssue({ object:id, tab:"stages" })} />
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
          <OperationsPanel issues={_myIssues} onNav={openIssue} onDismiss={_isAdmin ? dismissDashboardIssue : undefined} emptyText="По вашим объектам всё в порядке" />
        </div>
      )}
      {effScreen === "dashboard" && currentPermissions.dashboard !== "none" && !_isForeman && (()=>{
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const _inMonth = ts => { const d=new Date(ts||0); return d.getMonth()===thisMonth&&d.getFullYear()===thisYear; };
        // объекты и их суммы
        const _estByObjId = {}; for(const e of accessibleEstimates){ if(e.objectId){ (_estByObjId[e.objectId]||(_estByObjId[e.objectId]=[])).push(e); } }
        const _objVal = o => (_estByObjId[o.id]||[]).reduce((s,e)=>s+(e.total||0),0);
        // Здесь считались плитки месяца: объекты, сумма, прибыль и маржа за текущий месяц.
        // Ни одна из них не выводилась — шапка главной давно берёт эти цифры из buildAnalytics.
        // Считалось на каждый рендер (в т.ч. полный обход каталога на каждый объект) и
        // выбрасывалось. Удалено; новые показатели — в analyticsModel.js.
        const approvalObjs = liveObjects.filter(o=>unifiedStatusOf(o)==="approval");
        // Договоры считаем по самим документам. Статус объекта меняется после запуска
        // производства, поэтому он не может быть источником факта подписания договора.
        const visibleObjectIds = new Set(liveObjects.map(o=>o.id));
        const signedContracts = contracts.filter(c=>{
          if(!c || c.deletedAt || c.contractStatus!=="signed") return false;
          if(["annex","design_add","podryad","podryad_annex"].includes(c.type)) return false;
          return canSeeDoc(c) && (!c.objectId || visibleObjectIds.has(c.objectId));
        });
        const signedContractsMonth = signedContracts.filter(c=>{
          if(/^\d{4}-\d{2}-\d{2}$/.test(String(c.date||""))){
            const [year,month]=String(c.date).split("-").map(Number);
            return year===thisYear && month===thisMonth+1;
          }
          return _inMonth(c.updatedAt||c.createdAt||0);
        });
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
          // без номера договора — общефирменные операции, к конкретному проекту не
          // относятся (иначе проект с пустым contractNo забирает их все, см. prodEntries)
          const txMap = {}; for(const t of (financeTx||[])){if(t.deletedAt||t.included===false) continue; const cn=normCN(t.contractNo); if(!cn) continue; if(!txMap[cn])txMap[cn]={inc:0,exp:0}; if(t.type==="income")txMap[cn].inc+=(Number(t.amount)||0); else txMap[cn].exp+=(Number(t.amount)||0); }
          const totalInc = active.reduce((s,p)=>s+(txMap[normCN(p.contractNo)]?.inc||0),0);
          const totalExp = active.reduce((s,p)=>s+(txMap[normCN(p.contractNo)]?.exp||0),0);
          const totalBudget = active.reduce((s,p)=>s+financeBudgetOf(p),0);
          const totalDebt = active.reduce((s,p)=>{const inc=txMap[normCN(p.contractNo)]?.inc||0; return s+Math.max(0,financeBudgetOf(p)-inc);},0);
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
                // Здесь стояло число ДОКУМЕНТОВ-договоров со статусом «подписан» за
                // всё время. Как показатель оно вводило в заблуждение: договор-документ
                // заводят далеко не на каждую сделку, поэтому цифра была в разы меньше
                // числа реально подписанных объектов и противоречила аналитике.
                // Берём те же числа, что и аналитика, — они считаются одной моделью.
                {label:"Подписано за месяц", val:dashboardStats.sales.signedCount},
                {label:"Сдано за месяц", val:dashboardStats.production.doneInPeriod},
              ].map((m,i)=>(
                <div key={i} style={{textAlign:"center"}}>
                  <div style={{fontSize:26,fontWeight:900,color:"#fff",lineHeight:1}}>{m.val}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:3}}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Ключевые цифры компании: сколько в работе, что просрочено, деньги. */}
          <Dashboard
            data={dashboardStats}
            fmt={fmt}
            financialDetails={hasFinancialDetails}
            permissions={currentPermissions}
            onNavFinance={currentPermissions.finance !== "none" ? () => setScreen("finance") : undefined}
            // objectId — у просроченных этапов id составной («объект:этап»), поиск по нему
            // не находил объект и клик молча не срабатывал.
            onOpenObject={item => openIssue({ object: item?.objectId || item?.id, tab: item?.stageTab || "info" })}
          />

          {/* ── ЧТО ГОРИТ СЕГОДНЯ ── */}
          {currentPermissions.dashboard !== "none" && (
            <div style={{marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:900,color:"#0f172a",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>🔥 {(_isUser||_isSalesHead) ? "Что требует внимания" : "Что горит сегодня"}</div>
              <OperationsPanel
                issues={_isUser ? _myIssues : (hasFinancialDetails ? _todayIssues : _todayIssues.filter(i=>i.group!=="Финансы"))}
                onNav={openIssue}
                onDismiss={_isAdmin ? dismissDashboardIssue : undefined}
                emptyText={_isUser ? "По вашим объектам всё в порядке" : "Всё под контролем — срочных задач нет"}
              />
            </div>
          )}

          {/* Требуют внимания */}
          <StaleObjectsPanel
            items={staleObjs.map(o=>({id:o.id,name:o.clientName||"Без клиента",address:o.address,days:Math.floor((now-(o.updatedAt||o.createdAt||0))/864e5),total:_objVal(o),object:o}))}
            onOpen={item=>{ const o=item.object; setCurrentObject({...o}); setObjectTab("workspace"); setObjWsTab("info"); setScreen("objects"); }}
            onShowAll={openStaleObjects}
            fmt={fmt}
          />


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
              {/* Место под значок держим всегда: раньше он появлялся и исчезал при
                  каждом автосохранении, менял ширину строки и дёргал панель. */}
              <span aria-hidden={!saving} style={{fontSize:11,color:"#94a3b8",width:14,textAlign:"center",
                flexShrink:0,opacity:saving?1:0,transition:"opacity .18s ease"}}>💾</span>
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
                            {/* Договор по этой смете уже есть — видно ДО нажатия. Именно так
                                появились №1040 и №1041: одну смету выгрузили в договор дважды
                                с разницей в час, и оба ушли клиенту. */}
                            {(()=>{ const made = contracts.find(c=>c.estId===est.id && (c.type||"repair_fiz")!=="annex");
                              return made ? <span title={`Договор уже создан ${fmtDate(made.date)}`}
                                style={{fontSize:10,color:"#047857",background:"#ecfdf5",border:"1px solid #bbf7d0",borderRadius:4,padding:"1px 6px",whiteSpace:"nowrap",flexShrink:0}}>
                                📄 {made.number ? "№"+made.number : "есть"}</span> : null; })()}
                            {accessAllows(currentPermissions.documentCreate, isOwnEstimate(est)) && <button onClick={()=>{
                              // Второй договор по той же смете — почти всегда промах, а не замысел.
                              const twin = contracts.find(c=>c.estId===est.id && (c.type||"repair_fiz")!=="annex");
                              if (twin && !est.parentId) {
                                const sum = (twin.works||[]).reduce((s,w)=>s+Math.round((Number(w.price)||0)*(Number(w.quantity)||0)),0);
                                if (!window.confirm(`По этой смете уже есть договор ${twin.number?"№"+twin.number:"(без номера)"} от ${fmtDate(twin.date)} на ${sum.toLocaleString("ru-RU")} ₸.\n\nСоздать ВТОРОЙ договор по той же смете?\n\nOK — создать ещё один.\nОтмена — открыть существующий не отсюда, а во вкладке «Документы».`)) return;
                              }
                              const catalog = getEffectiveCatalog();
                              const pricing = _estPricingOf(est);
                              const works = resolveEstimateRows(est.rows, catalog, { extraCat: EXTRA_CAT }).map(({ row: r, work: w, qty })=>{
                                const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
                                const rawPrice = r.manualPrice !== undefined && r.manualPrice !== ""
                                  ? Number(r.manualPrice)
                                  : getEstimateRowPrice(r, w, qty, r.complexity||"std", cpxPct);
                                const price = clientUnitPrice(rawPrice, pricing);
                                const ew = resolveEstimateRowWork(getEffectiveWork(w), r);
                                const pf = (!price && ew.priceFrom) ? clientUnitPrice(ew.priceFrom, pricing) : null;
                                const displayName = r.manualName !== undefined ? r.manualName : w.name;
                                const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (w.unit||"м²");
                                return {name:displayName,category:w.cat||"",subcategory:w.sub||"",quantity:qty,unit:displayUnit,price:price||0,priceFrom:pf||undefined};
                              });
                              const isDs = !!est.parentId;
                              // ДС → тип annex, номер приложения = dsNumber+1 (т.к. №1 — основное)
                              const sibCount = isDs ? (dsMap[est.parentId]||[]).filter(e=>e.dsNumber<=(est.dsNumber||1)).length : 0;
                              const annexNum = isDs ? (est.dsNumber||1) + 1 : 1;
                              // Для приложения подтягиваем номер основного договора из договора родительской сметы
                              const parentContract = isDs ? contracts.find(c=>c.estId===est.parentId && (c.type||"repair_fiz")!=="annex") : null;
                              const mainNumber = parentContract?.number || "";
                              const mainDate = parentContract?.date || "";
                              const now = Date.now();
                              const newContract = {id:now.toString(),createdAt:now,objectId:est.objectId||"",number:"",date:new Date(now).toISOString().split("T")[0],clientId:parentContract?.clientId||"",contragentId:parentContract?.contragentId||contragents[0]?.id||"",works,discount:0,...((Number(est.discount)||0)>0?{discountApplied:Number(est.discount)}:{}),appendix:annexNum,estId:est.id,estClient:dProj?.name||"",estPhone:dProj?.phone||"",estAddress:dProj?.address||"",note:"",type:isDs?"annex":"repair_fiz",createdBy:currentUser.name,createdById:currentUser.id,...(isDs?{mainNumber,mainDate}:{})};
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
              {/* Место под значок держим всегда: раньше он появлялся и исчезал при
                  каждом автосохранении, менял ширину строки и дёргал панель. */}
              <span aria-hidden={!saving} style={{fontSize:11,color:"#94a3b8",width:14,textAlign:"center",
                flexShrink:0,opacity:saving?1:0,transition:"opacity .18s ease"}}>💾</span>
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
                      {/* Телефон: подписи стоят ровно над своими значениями —
                          те же пропорции, что у строки работы ниже. */}
                      <div className="wrow-th-mob">
                        <span className="wml-price">Цена за ед.</span>
                        <span className="wth-qty">Объём</span>
                        <span className="wml-total">Итого</span>
                      </div>
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
                                      <input type="number" min="0" placeholder={String(Number(resolveEstimateRowWork(getEffectiveWork(work), r).cost)||0)}
                                        value={r.manualCost!==undefined?r.manualCost:(resolveEstimateRowWork(getEffectiveWork(work), r).cost||"")}
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
                                    value={price||""}
                                    onCommit={v=>setRow(work.code || work.name,"manualPrice",v===""?undefined:basePriceFromClient(Number(v), _pricing))}
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
                                value={price||""}
                                onCommit={v=>setRow(work.code || work.name,"manualPrice",v===""?undefined:basePriceFromClient(Number(v), _pricing))}
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
                {!isSearching && <div className="est-cats" style={{display:"flex",gap:3,padding:"10px 10px 0",borderBottom:"1px solid #e2e8f0"}}>
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
                  {/* Телефон: подписи стоят ровно над своими значениями —
                      те же пропорции, что у строки работы ниже. */}
                  <div className="wrow-th-mob">
                    <span className="wml-price">Цена за ед.</span>
                    <span className="wth-qty">Объём</span>
                    <span className="wml-total">Итого</span>
                  </div>
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
                    const resolvedRowWork = resolveEstimateRowWork(getEffectiveWork(work), r);
                    const tierHint = (resolvedRowWork.tiers||[]).length > 1
                      ? (resolvedRowWork.tiers||[]).map(t=>`${t.min}–${t.max}: ${fmt(t.price)} ₸`).join(" · ")
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
                        {/* Вводим и показываем КЛИЕНТСКУЮ цену, а храним прайсовую: manualPrice
                            лежит без повышения и скидки, иначе менять их процент было бы уже нечем.
                            Раньше здесь введённое число сохранялось как есть, а на экран выводилось
                            уже с повышением — набрал 2000 при повышении 10%, получил 2200. Соседние
                            два поля (мобильная вёрстка и режим правки цен) считали правильно,
                            расходилось только это. */}
                        <NumInput className="num" style={{width:90}} placeholder="Цена"
                          autoFocus={editingPriceRow===work.name}
                          value={price||""}
                          onCommit={v=>setRow(work.code || work.name,"manualPrice",v===""?undefined:basePriceFromClient(Number(v), _pricing))}
                          onBlur={()=>{ if(!editPrices) setEditingPriceRow(null); }}
                          onKeyDown={e=>{ if(e.key==="Escape"){ if(!editPrices) setEditingPriceRow(null); } }}/>
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
                              <input type="number" min="0" placeholder={String(Number(resolvedRowWork.cost)||0)}
                                value={r.manualCost!==undefined?r.manualCost:(resolvedRowWork.cost||"")}
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
                        {/* Раскладка строки: десктоп — пять колонок. Мобильная вынесена в общий
                            блок стилей, чтобы правила не дублировались в каждой строке
                            и не спорили друг с другом важностью. */}
                        <style>{`@media(min-width:701px){.wrow{grid-template-columns:1fr 50px 120px 76px 90px}}`}</style>
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
                        {/* Телефон: одна строка под названием — цена за единицу слева,
                            поле объёма посередине, итог справа. Колонки десктопа сюда не
                            переносятся: их шапка «Цена · Объём · Итого» на телефоне скрыта,
                            потому что описывала пять колонок, которых здесь нет. */}
                        <div className="wrow-mob-line" style={{display:"none"}}>
                          {/* Цена за единицу редактируется так же, как на компьютере:
                              переиспользуем тот же priceCell — карандаш, поле, сброс
                              ручной цены. Своя копия разошлась бы с десктопной. */}
                          <span className="wml-price">
                            {priceCell}
                            {displayPrice!=null && <span className="wml-unit">₸/ед</span>}
                          </span>
                          <NumInput className="num" style={{width:78,textAlign:"center",fontSize:16,padding:"7px 8px",fontWeight:700,flexShrink:0}} placeholder="0"
                            value={r.qty||""} onCommit={v=>setRow(work.code || work.name,"qty",v)}/>
                          <span className="wml-total">{total>0 ? fmt(total)+" ₸" : ""}</span>
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
                {currentUser.role !== "viewer" && (
                  <EstimateSuggestions
                    estimateKey={`${currentId || "new"}:${currentObjectId || ""}`}
                    suggestions={estimateSuggestions}
                    onAdd={addEstimateSuggestions}
                    fmt={fmt}
                  />
                )}
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
                          <span>Скидка {discount}% <span style={{color:"#94a3b8",fontSize:11}}>· учтена в ценах</span></span><span>− {fmt(discAmt)} ₸</span>
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
                          <span>Повышение {markup}% <span style={{color:"#94a3b8",fontSize:11}}>· учтено в ценах</span></span><span>+ {fmt(markupAmt)} ₸</span>
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
            <div className="float-fab" style={{position:"fixed",bottom:22,right:18,zIndex:50}}>
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
      {effScreen === "analytics" && currentPermissions.analytics !== "none" && (()=>{
        // Экран живёт на модуле buildAnalytics (<AnalyticsBlocks/>). Отсюда нужны только
        // кнопки фильтра по менеджерам, рентабельность по категориям и признак пустого периода.
        const { totalEst, managers, catProfit } = analyticsData;
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
            {/* Блоки бизнес-показателей. Видимость каждого блока — своя галочка в правах роли,
                финансовые цифры внутри дополнительно скрыты без financialDetails. */}
            <AnalyticsBlocks
              data={analyticsBlocks}
              permissions={currentPermissions}
              fmt={fmt}
              financialDetails={hasFinancialDetails}
              catProfit={catProfit}
              // Клик по строке любого списка (в т.ч. «Качество данных») открывает объект:
              // раньше список только называл проблему, а искать её приходилось руками.
              onOpenObject={(it) => openIssue({ object: it?.objectId || it?.id, tab: it?.stageTab || "info" })}
            />

            {totalEst===0&&<div style={{textAlign:"center",color:"#334155",fontSize:13,padding:"60px 0"}}><div style={{fontSize:32,marginBottom:12}}>📊</div>Нет данных за выбранный период</div>}
          </div>
        );
      })()}

      {/* ── ЭКРАН: ФИНАНСЫ (независимый учёт ДДС + P&L) ── */}
      {effScreen === "finance" && currentPermissions.finance === "none" && restrictedSection("Финансы")}
      {effScreen === "finance" && currentPermissions.finance !== "none" && (()=>{
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
          .filter(t=>matchesFinanceOperationsPreset(t, finFilterPreset))
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
        const opsSummary = summarizeFinanceOperations(opsList);

        const PERIODS=[["all","Всё"],["month","Месяц"],["3month","3 мес"],["year","Год"],["custom","Период"]];
        const TYPE_LABEL={income:"Доход",expense:"Расход",transfer:"Перевод"};
        const TYPE_COLOR={income:"#059669",expense:"#dc2626",transfer:"#7c3aed"};
        const PRESET_LABEL={
          revenue:"Выручка без авансов",
          cogs:"Себестоимость",
          gross:"Валовая прибыль: выручка и себестоимость",
          "pnl-expense":"Расходы ОПУ без дивидендов",
          "net-profit":"Чистая прибыль: доходы и расходы ОПУ",
          dividends:"Дивиденды",
          "cash-in":"Все поступления ДДС",
          "cash-out":"Все выплаты ДДС",
          "cash-flow":"Денежный поток: поступления и выплаты",
        };

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
                    const debtH = finProjects.filter(isCountedFinanceProject).reduce((s,p)=>s+Math.max(0,financeBudgetOf(p)-(projIncH[normCN(p.contractNo)]||0)),0);
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
              {[["dashboard","📊 Дашборд"],["dds","💸 ДДС месяц"],["opu","📈 ОПУ месяц"],["balance","⚖️ Баланс"],["ops","📋 Операции"],["projects","🏗 Проекты"],...(canPayroll?[ ["payroll","👥 ФОТ"] ]:[]),...(canFinanceDirectories?[ ["ref","⚙️ Справочник"] ]:[])].map(([k,l])=>(
                <button key={k} onClick={()=>navigate(undefined, k)} style={{fontSize:13,fontWeight:700,padding:"9px 16px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(financeTab===k?"#2563eb":"#e2e8f0"),background:financeTab===k?"#2563eb":"#fff",color:financeTab===k?"#fff":"#64748b"}}>{l}</button>
              ))}
            </div>

            {/* Фильтр периода (для дашборда и операций) */}
            {financeTab!=="ref" && financeTab!=="projects" && financeTab!=="payroll" && (
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
              const cogsSum = periodTx.filter(t=>t.type==="expense"&&t.category==="Прямые расходы (COGS / себестоимость)").reduce((s,t)=>s+(Number(t.amount)||0),0);
              const grossP = incSumNoAdv - cogsSum;
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
              const KpiRow=({label,val,color,bold,big,onClick})=>(
                <div role={onClick?"button":undefined} tabIndex={onClick?0:undefined} onClick={onClick} onKeyDown={onClick?e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}:undefined}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:bold?"9px 0":"6px 0",borderBottom:"1px solid #f5f7fa",gap:8,cursor:onClick?"pointer":"default",borderRadius:onClick?6:0}}
                  title={onClick?"Показать операции, из которых рассчитана сумма":undefined}>
                  <span style={{fontSize:bold?13:12.5,color:bold?"#0f172a":"#64748b",fontWeight:bold?700:500}}>{label}</span>
                  <span style={{fontSize:big?20:(bold?15:13.5),fontWeight:bold?800:600,color:color||"#0f172a",whiteSpace:"nowrap"}}>
                    {typeof val==="number"?fM(val)+" ₸":val}{onClick?<span style={{fontSize:10,color:"#94a3b8",marginLeft:6}}>↗</span>:null}
                  </span>
                </div>
              );
              const openOpsPreset = (preset, extra={}) => navigate(undefined,"ops",{
                finFilterPreset:preset,
                finFilterType:"",
                finFilterAccount:"",
                finFilterCat:"",
                finFilterCategory:"",
                finFilterContract:"",
                ...extra,
              });
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
                      <KpiRow label="Выручка (без авансов)" val={incSumNoAdv} color="#059669" onClick={()=>openOpsPreset("revenue")}/>
                      <KpiRow label="Валовая прибыль" val={grossP} color={grossP>=0?"#0891b2":"#dc2626"} bold onClick={()=>openOpsPreset("gross")}/>
                      <KpiRow label="Расходы (без дивид.)" val={expNoDivSum} color="#dc2626" onClick={()=>openOpsPreset("pnl-expense")}/>
                      <KpiRow label="Дивиденды" val={divSum} color="#d97706" onClick={()=>openOpsPreset("dividends")}/>
                      {Object.entries(divByRecipient).filter(([r])=>r!=="Не указан").map(([r,v])=>(
                        <div key={r} style={{display:"flex",justifyContent:"space-between",padding:"3px 0 3px 14px",borderBottom:"1px solid #f5f7fa",gap:8}}>
                          <span style={{fontSize:11.5,color:"#94a3b8"}}>↳ {r}</span>
                          <span style={{fontSize:12,fontWeight:600,color:"#d97706",whiteSpace:"nowrap"}}>{fM(v)} ₸</span>
                        </div>
                      ))}
                      <KpiRow label="Чистая прибыль" val={netP} color={netP>=0?"#2563eb":"#dc2626"} bold big onClick={()=>openOpsPreset("net-profit")}/>
                      <KpiRow label="Рентабельность" val={rentab+"%"} color={rentab>=0?"#7c3aed":"#dc2626"} bold/>
                    </CardSection>

                    {/* Денежный поток */}
                    <CardSection title="💸 Денежный поток, ₸" accent="#0891b2">
                      <KpiRow label="Поступления (вкл. авансы)" val={incomeSum} color="#059669" onClick={()=>openOpsPreset("cash-in")}/>
                      <KpiRow label="Выплаты" val={expenseSum} color="#dc2626" onClick={()=>openOpsPreset("cash-out")}/>
                      <KpiRow label="Разница" val={incomeSum-expenseSum} color={(incomeSum-expenseSum)>=0?"#0891b2":"#dc2626"} bold big onClick={()=>openOpsPreset("cash-flow")}/>
                      <div style={{marginTop:12,padding:"10px 12px",background:"#f8fafc",borderRadius:10,fontSize:11.5,color:"#64748b",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>Сальдо по всем счетам</span><b style={{color:"#0f172a",fontSize:13}}>{fM(totalBalance)} ₸</b>
                      </div>
                    </CardSection>

                    {/* Остатки */}
                    <CardSection title="💳 Остатки на счетах, ₸" accent="#7c3aed">
                      {accounts.map(a=>(
                        <div key={a.id} role="button" tabIndex={0} onClick={()=>openOpsPreset("",{finFilterAccount:a.name})} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openOpsPreset("",{finFilterAccount:a.name});}}} title="Показать операции по счёту" style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f5f7fa",cursor:"pointer"}}>
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
                        pMonthMap[k].budget+=financeBudgetOf(p);
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
              const goOps=(cat,sub)=>{ navigate(undefined,"ops",{finFilterCat:cat||"",finFilterCategory:sub||"",finFilterContract:"",finFilterPreset:""}); };
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
              const goOps=(cat,sub)=>{ navigate(undefined,"ops",{finFilterCat:cat||"",finFilterCategory:sub||"",finFilterContract:"",finFilterPreset:""}); };
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
              const receivablesMoney = finProjects.filter(isCountedFinanceProject).reduce((s,p)=>s+Math.max(0,financeBudgetOf(p)-(projInc[normCN(p.contractNo)]||0)),0);
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
              {(finFilterContract || finFilterCat || finFilterCategory || finFilterPreset) && (
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                  {finFilterPreset && <div style={{display:"flex",alignItems:"center",gap:6,background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:9,padding:"7px 12px"}}>
                    <span style={{fontSize:12,fontWeight:700,color:"#7c3aed"}}>↗ {PRESET_LABEL[finFilterPreset]||"Выборка дашборда"}</span>
                    <button onClick={()=>setFinFilterPreset("")} title="Снять фильтр" style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>
                  </div>}
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
              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                {[
                  ["Поступления",opsSummary.income,"#059669","#f0fdf4"],
                  ["Выплаты",opsSummary.expense,"#dc2626","#fef2f2"],
                  ["Разница",opsSummary.net,opsSummary.net>=0?"#0891b2":"#dc2626",opsSummary.net>=0?"#ecfeff":"#fef2f2"],
                  ["Переводы",opsSummary.transfer,"#7c3aed","#f5f3ff"],
                ].map(([label,value,color,bg])=>(
                  <div key={label} style={{background:bg,border:"1px solid "+color+"22",borderRadius:10,padding:"11px 13px"}}>
                    <div style={{fontSize:11,color:"#64748b",fontWeight:650,marginBottom:4}}>{label} по фильтру</div>
                    <div style={{fontSize:17,fontWeight:850,color}}>{fM(value)} ₸</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:7,fontSize:11,color:"#94a3b8",textAlign:"right"}}>
                Учтено операций: {opsSummary.counted}{opsSummary.excluded?` · не входят в отчёты: ${opsSummary.excluded}`:""}
              </div>
            </>)}

            {/* ───── ПРОЕКТЫ ───── */}
            {/* ФОТ — отдельный модуль src/payroll. App только отдаёт данные и сейверы.
                readOnly: право «Финансы» имеет значения none/view/edit, писать может
                только edit. Сравнение с несуществующим "all" держало раздел в режиме
                чтения вообще у всех, включая админа. */}
            {financeTab==="payroll" && canPayroll && (
              <PayrollModule
                financeTx={financeTx}
                workers={workers}
                users={allUsers}
                staff={staff}
                saveStaff={saveStaff}
                subcategoryMap={payrollMap}
                saveSubcategoryMap={savePayrollMap}
                accruals={accruals}
                saveAccruals={saveAccruals}
                objects={objects}
                productions={productions}
                finProjects={finProjects}
                contracts={contracts}
                saveFinanceTx={saveFinanceTx}
                fmt={fmt}
                genId={genId}
                readOnly={!editorTab || !payrollWritable}
              />
            )}

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
              // ── ДОГОВОР ЕСТЬ, ПРОЕКТА НЕТ ──
              // Сделка живая (подписан / в работе / пауза / сдан), договор оформлен, а строки
              // в «Проектах» нет: приходы по нему не считаются, долг не виден. Такие и ловим.
              // На «Согласовании» договор часто печатают ЗАРАНЕЕ, до подписания — денег по нему
              // ещё никто не ждёт, и в списке это был бы шум. Поэтому статусы те же, что и у
              // виртуальных строк выше (_projectStatuses), а не «все, кроме отказа».
              const _seenCN = new Set([...finProjects, ...virtualProjects].map(p=>normCN(p.contractNo)).filter(Boolean));
              const _seenObj = new Set([..._coveredObjIds, ...virtualProjects.map(p=>p.objectId)].filter(Boolean));
              const orphanContracts = contracts.filter(c => {
                const type = String(c.type || "repair_fiz");
                if (type === "annex" || type === "reservation" || type === "podryad" || type === "podryad_annex") return false;
                if (!String(c.number || "").trim()) return false;
                if (_seenCN.has(normCN(c.number))) return false;
                const o = c.objectId ? liveObjects.find(x => x.id === c.objectId) : null;
                if (!o || _seenObj.has(o.id)) return false;
                return _projectStatuses.has(unifiedStatusOf(o));
              });
              const days = (a,b) => { if(!a||!b) return null; const d=Math.round((new Date(b)-new Date(a))/86400000); return d>=0?d:null; };
              const yesno = v => v==="да"||v==="yes"||v===true||v==="1"||v==="Да"||v==="ДА";
              // totals
              const totBudget = filtered.reduce((s,p)=>s+financeBudgetOf(p),0);
              const totIncome = filtered.reduce((s,p)=>s+(projStats[normCN(p.contractNo)]?.income||0),0);
              const totExpense = filtered.reduce((s,p)=>s+(projStats[normCN(p.contractNo)]?.expense||0),0);
              const totDebt = filtered.reduce((s,p)=>s+Math.max(0,financeBudgetOf(p)-(projStats[normCN(p.contractNo)]?.income||0)),0);
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

                  {/* Свёрнуто в одну строку: это подсказка, а не раздел. Раньше жёлтый блок
                      во всю ширину перекрикивал и заголовок, и сами проекты. */}
                  {orphanContracts.length > 0 && (
                    <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,marginBottom:14,overflow:"hidden"}}>
                      <button type="button" onClick={()=>setOrphanOpen(v=>!v)}
                        style={{width:"100%",display:"flex",alignItems:"center",gap:9,flexWrap:"wrap",background:"transparent",border:0,
                          padding:"11px 14px",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:"#d97706",flexShrink:0}}/>
                        <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>Договор есть, проекта нет</span>
                        <span style={{fontSize:11.5,fontWeight:800,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:20,padding:"1px 8px"}}>{orphanContracts.length}</span>
                        <span style={{fontSize:12,color:"#94a3b8"}}>оплаты и долг по ним не считаются</span>
                        <span style={{marginLeft:"auto",fontSize:11,color:"#94a3b8"}}>{orphanOpen?"Свернуть ▲":"Показать ▼"}</span>
                      </button>
                      {orphanOpen && (
                        <div style={{borderTop:"1px solid #f1f5f9"}}>
                          {orphanContracts.map(c=>{
                            const o = liveObjects.find(x=>x.id===c.objectId);
                            const sum = (c.works||[]).reduce((s,w)=>s+Math.round((Number(w.price)||0)*(Number(w.quantity)||0)),0);
                            return (
                              <div key={c.id} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",padding:"9px 14px",borderBottom:"1px solid #f8fafc"}}>
                                <b style={{fontSize:12.5,color:"#0f172a",whiteSpace:"nowrap"}}>№{c.number}</b>
                                <span style={{fontSize:12.5,color:"#475569",minWidth:0,overflowWrap:"anywhere"}}>{o?.clientName || c.estClient || "—"}</span>
                                <span style={{fontSize:11.5,color:"#cbd5e1",whiteSpace:"nowrap"}}>{fmtDate(c.date)}</span>
                                <b style={{fontSize:12.5,color:"#0f172a",whiteSpace:"nowrap",marginLeft:"auto"}}>{fmt(sum)} ₸</b>
                                {o && <button onClick={()=>openObjectFromFinance(o)}
                                  style={{background:"#f8fafc",color:"#2563eb",border:"1px solid #e2e8f0",borderRadius:7,padding:"5px 11px",fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Открыть объект</button>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
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
                      const budget = view.budget;
                      const st = projStats[normCN(p.contractNo)]||{income:0,expense:0};
                      const income = st.income;
                      const expense = st.expense;
                      const debt = Math.max(0,budget-income);
                      const marginVal = income-expense;
                      const marginPct = income>0 ? Math.round(marginVal/income*100) : null;
                      const col = view.statusColor;
                      const dur = days(view.startDate, view.factEndDate);
                      const budgetFill = budget>0 ? Math.min(100,Math.round(income/budget*100)) : 0;
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
                              {budget>0 ? <>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                                  <span style={{fontSize:16,fontWeight:800,color:"#059669"}}>{fM(income)} <span style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>из {fM(budget)} ₸</span></span>
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
                      if (finProjSavingRef.current) return; // двойной клик по «Сохранить»
                      finProjSavingRef.current = true;
                      try {
                        const cur = finProjectsRef.current;
                        // Один объект / один номер договора = один финпроект. Дубль ломает
                        // сводки: бюджет и операции договора считаются дважды.
                        let targetId = mp.id;
                        if (!targetId) {
                          const cn = normCN(mp.contractNo);
                          const dup = cur.find(x => (mp.objectId && x.objectId === mp.objectId) || (cn && normCN(x.contractNo) === cn));
                          if (dup) {
                            if (!window.confirm("Для этого объекта (или номера договора) финансовый проект уже есть.\n\nОбновить существующий вместо создания второго?")) return;
                            targetId = dup.id;
                          }
                        }
                        const { _virtual, ...mpClean } = mp; // служебный флаг виртуальной строки в базу не пишем
                        const proj = {...mpClean, id: targetId||genId(), budget:view.linked?view.budget:(Number(mp.budget)||0), paidFact:Number(mp.paidFact)||0, expenses:Number(mp.expenses)||0, createdBy:mp.createdBy||currentUser.name, createdById:mp.createdById||currentUser.id, updatedAt:Date.now()};
                        const list = targetId ? cur.map(x=>x.id===targetId?{...x,...proj}:x) : [proj,...cur];
                        await saveFinanceProjects(list);
                        setFinProjModal(null);
                      } finally { finProjSavingRef.current = false; }
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
                          {mp.id && (()=>{ const st=projStats[normCN(mp.contractNo)]||{income:0,expense:0}; const debt=Math.max(0,view.budget-st.income); const mrg=st.income>0?Math.round((st.income-st.expense)/st.income*100):null;
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
                            <div>
                              <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>{view.linked?"Стоимость проекта · рассчитывается автоматически":"Стоимость проекта, ₸"}</div>
                              <input type="number" className="fi" value={view.linked?view.budget:(mp.budget||0)} disabled={view.linked} onChange={e=>setp("budget",e.target.value)} style={view.linked?{background:"#f8fafc",color:"#334155"}:undefined}/>
                              {view.linked&&<div style={{fontSize:10.5,color:"#64748b",marginTop:5}}>Источник: {view.budgetSource==="estimates"?`все актуальные сметы объекта (${view.estimateCount})`:view.budgetSource==="contracts"?"договор и доп. соглашения":"старые импортированные данные"}. Изменяется в объекте.</div>}
                            </div>
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
                              logBackupOp("импортировал финансы из JSON", "Импорт финансов",
                                { field: "файл", old: file.name,
                                  new: `операций: ${data.transactions?.length||0}${data.projects?`, проектов: ${data.projects.length}`:""}`,
                                  detail: data.meta?.accounts ? "настройки финансов заменены файлом" : "", source: "import" });
                              alert("Импортировано операций: "+(data.transactions?.length||0)+(data.projects?" | проектов: "+data.projects.length:""));
                            } catch(err){
                              logBackupOp("ОШИБКА импорта финансов", "Импорт финансов", { field: "файл", old: file.name, new: "—", detail: String(err?.message||err), source: "import" });
                              alert("Ошибка импорта: "+err.message);
                            }
                            setFinImportBusy(false); e.target.value="";
                          }}/>
                      </label>
                      <button onClick={()=>{
                        const data={meta:financeMeta,transactions:financeTx,projects:finProjects};
                        const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
                        const url=URL.createObjectURL(blob); const a=document.createElement("a");
                        a.href=url; a.download="titovstroy-finance-"+new Date().toISOString().slice(0,10)+".json";
                        document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),5000);
                        logBackupOp("выгрузил финансы", "Экспорт финансов (JSON)",
                          { field: "файл", new: a.download, detail: `операций: ${financeTx.length}, проектов: ${finProjects.length}` });
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
              const save = async ()=>{
                if (m.id ? !canFinanceEditRecord(m) : !canFinanceCreate) return;
                if (m.__saving) return;                       // защита от двойного нажатия
                const amt=Number(m.amount)||0;
                if(amt<=0){ alert("Укажите сумму"); return; }
                if(m.type==="transfer" && m.account===m.accountTo){ alert("Счета должны отличаться"); return; }
                const ts=m.date?new Date(m.date).getTime():Date.now();
                const tx={ id:m.id||genId(), type:m.type, date:ts, amount:amt, account:m.account, accountTo:m.type==="transfer"?m.accountTo:undefined,
                  category:m.type==="transfer"?"Перевод":m.category, subcategory:m.type==="transfer"?"":m.subcategory, note:m.note||"", contractNo:m.contractNo||"",
                  recipient:m.recipient||"",
                  // Получатель — только у расхода и только если выбран. Иначе поля в записи
                  // просто нет: старые операции и операции без получателя остаются как были.
                  payee:(m.type==="expense" && m.payee && m.payee.id) ? { kind:m.payee.kind||"staff", id:m.payee.id } : undefined,
                  isAdvance:m.type==="income"?!!m.isAdvance:false,
                  included:m.included!==false, opuMonth:m.opuMonth, createdAt:m.createdAt||Date.now(), createdBy:m.createdBy||currentUser.name, createdById:m.createdById||currentUser.id, updatedAt:Date.now() };
                const isNew = !m.id;
                const _oldTx = m.id ? financeTxRef.current.find(x=>x.id===m.id) : null;
                // РАНЬШЕ: окно закрывалось сразу, а сохранение уходило «в никуда» — без await
                // и без проверки. С телефона это давало потерю: операция показана, форма
                // закрыта, а запись либо блокировалась (финансы ещё не догрузились), либо
                // не успевала уйти до закрытия браузера. Теперь ждём подтверждения облака
                // и закрываем окно ТОЛЬКО после него.
                let blockedReason = "";
                setFinTxModal(p => p && ({ ...p, __saving: true, __err: "" }));
                const saved = await saveFinanceTx([tx], {
                  replace: false,
                  requireCloud: true,                          // локальной записи недостаточно
                  onBlocked: (r) => { blockedReason = r; },
                });
                if (!saved) {
                  const why = {
                    "not-loaded": "финансы ещё не загрузились — подождите пару секунд и повторите",
                    "read-only-tab": "приложение открыто в другой вкладке — редактирует она",
                    "db-unavailable": "нет связи с базой",
                    "cloud-failed": "не удалось записать в облако — проверьте интернет",
                    "empty-over-data": "защита от затирания: попробуйте ещё раз",
                  }[blockedReason] || "не удалось сохранить";
                  // Данные НЕ теряем: окно остаётся с введённой операцией.
                  setFinTxModal(p => p && ({ ...p, __saving: false, __err: `Не сохранено: ${why}` }));
                  return;
                }
                setFinTxModal(null);
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
                        const projRows = finProjects.map(project => {
                          const directObject = project.objectId ? objects.find(o => o.id === project.objectId) : null;
                          const link = project.contractNo ? linkForContractNo(project.contractNo) : null;
                          const object = directObject || link?.object || null;
                          const contract = directObject ? financeContractOf(project, directObject) : (link?.contract || null);
                          return { project, object, contract };
                        }).filter(({ project, object, contract }) =>
                          financeProjectMatchesSearch(project, finTxProjSearch, { object, contract }));
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
                            {/* Номер, которого нет ни в одном договоре и проекте. Операция
                                сохранится (номер может быть от ещё не заведённого договора),
                                но деньги по ней никуда не попадут — ни в оплаты, ни в долг.
                                Так три операции на 385 000 ₸ уехали на «11.0» из старого импорта
                                и не попали никуда. */}
                            {(()=>{
                              const cn = String(m.contractNo || "").trim();
                              if (!cn) return null;
                              const key = normCN(cn);
                              const known = finProjects.some(p=>normCN(p.contractNo)===key) || contracts.some(c=>normCN(c.number)===key);
                              return known ? null : (
                                <div style={{marginTop:5,fontSize:11.5,color:"#b45309",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,padding:"5px 9px",lineHeight:1.35}}>
                                  Договора «{cn}» нет ни в проектах, ни в договорах. Операция сохранится, но в оплаты и долг по проекту не попадёт.
                                </div>
                              );
                            })()}
                            {finTxProjOpen && (
                              <div style={{position:"absolute",zIndex:999,top:"100%",left:0,right:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.13)",maxHeight:220,overflowY:"auto",marginTop:2}}>
                                <div onMouseDown={e=>{e.preventDefault();setFinTxProjSearch("");set("contractNo","");setFinTxProjOpen(false);}} style={{padding:"9px 14px",fontSize:12,color:"#94a3b8",cursor:"pointer",borderBottom:"1px solid #f1f5f9"}}
                                  onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"} onMouseLeave={e=>e.currentTarget.style.background=""}>— без проекта —</div>
                                {projRows.map(({project:p, object, contract},i)=>(
                                  <div key={p.id || p.contractNo || i} onMouseDown={e=>{ const resolvedNo=contract?.number||p.contractNo||""; e.preventDefault();setFinTxProjSearch(resolvedNo);set("contractNo",resolvedNo);setFinTxProjOpen(false);}}
                                    style={{padding:"9px 14px",fontSize:13,color:"#0f172a",cursor:"pointer",background:m.contractNo===p.contractNo?"#eff6ff":"transparent",borderBottom:"1px solid #f8fafc"}}
                                    onMouseEnter={e=>e.currentTarget.style.background="#f1f5f9"} onMouseLeave={e=>e.currentTarget.style.background=m.contractNo===p.contractNo?"#eff6ff":"transparent"}>
                                    <span style={{fontWeight:700}}>{p.contractNo || "Без номера"}</span>
                                    {(()=>{ const label = [object?.clientName || contract?.customer || contract?.customerName || p.description, object?.address || contract?.address || contract?.objectAddress].filter(Boolean).join(" · "); return label ? <span style={{color:"#64748b",marginLeft:6,fontSize:12}}>{label.slice(0,80)}</span> : null; })()}
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
                      {/* КОМУ УШЛИ ДЕНЬГИ. Поле необязательное и только для расхода: приход
                          и переводы к ФОТ отношения не имеют. Раньше человек жил в НАЗВАНИИ
                          подкатегории («ФОТ РОП»), поэтому на каждого нового сотрудника
                          заводилась новая подкатегория, а 24 млн подрядчикам шли одной
                          строкой на всех. Операции без получателя работают как раньше. */}
                      {/* Дивиденды исключены намеренно: это не ФОТ, и у них ВЫШЕ есть своё
                          поле «Получатель (учредитель)». Два поля с одинаковым названием
                          подряд — ровно та путаница, на которую пожаловался владелец. */}
                      {m.type==="expense" && m.subcategory!=="Дивиденды учредителям" && (staff.length > 0 || workers.length > 0) && (
                        <div>
                          <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Кому выплата <span style={{color:"#cbd5e1"}}>· для раздела ФОТ, необязательно</span></div>
                          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                            <select className="fi" style={{width:130,flexShrink:0}}
                              value={m.payee?.kind || "staff"}
                              onChange={e=>set("payee", { kind:e.target.value, id:"" })}>
                              <option value="staff">Сотрудник</option>
                              <option value="worker">Подрядчик</option>
                            </select>
                            <select className="fi" style={{flex:1,minWidth:150}}
                              value={m.payee?.id || ""}
                              onChange={e=>set("payee", e.target.value ? { kind:m.payee?.kind || "staff", id:e.target.value } : null)}>
                              <option value="">— не указан —</option>
                              {((m.payee?.kind === "worker" ? workers : staff) || [])
                                .filter(x => x && x.id && (x.status !== "fired"))
                                .map(x => <option key={x.id} value={x.id}>{x.name || "Без имени"}{x.position ? ` · ${x.position}` : ""}</option>)}
                            </select>
                          </div>
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
                      {m.__err && (
                        // Операция НЕ потеряна: она осталась в форме, можно нажать ещё раз.
                        <div style={{flex:"1 1 100%",background:"#fef2f2",border:"1px solid #fecaca",color:"#b91c1c",
                          borderRadius:9,padding:"8px 12px",fontSize:12.5,fontWeight:600,marginBottom:8}}>
                          {m.__err}. Данные сохранены в форме — нажмите «Сохранить» ещё раз.
                        </div>
                      )}
                      <button onClick={save} disabled={!!m.__saving}
                        style={{background:m.__saving?"#93b4f5":"#2563eb",color:"#fff",border:"none",borderRadius:9,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:m.__saving?"default":"pointer",fontFamily:"inherit"}}>
                        {m.__saving ? "Сохраняю…" : "Сохранить"}</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

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
          const pricing = _estPricingOf(est);
          return resolveEstimateRows(est.rows, catalog, { extraCat: EXTRA_CAT }).map(({ row: r, work: w, qty }) => {
            const cpxPct = r.cpxPct !== undefined ? Number(r.cpxPct) : undefined;
            const rawPrice = getEstimateRowPrice(r, w, qty, r.complexity||"std", cpxPct);
            const price = clientUnitPrice(rawPrice, pricing);
            const ew = resolveEstimateRowWork(getEffectiveWork(w), r);
            const pf = (!price && ew.priceFrom) ? clientUnitPrice(ew.priceFrom, pricing) : null;
            const displayName = r.manualName !== undefined ? r.manualName : w.name;
            const displayUnit = r.manualUnit !== undefined ? r.manualUnit : (w.unit||"м²");
            return {name:displayName,category:w.cat||"",subcategory:w.sub||"",quantity:qty,unit:displayUnit,price:price||0,priceFrom:pf||undefined};
          });
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
            // Второй договор по той же смете — почти всегда промах. Так появились №1040 и
            // №1041 на 4 435 030 ₸ каждый: одну смету выгрузили дважды с разницей в час, и
            // оба ушли клиенту. Проверка стоит ЗДЕСЬ, а не у кнопки: договор создают из
            // нескольких мест, и у каждой кнопки свою проверку пришлось бы дублировать.
            if (fromEst && !fromEst.parentId) {
              const twin = contractsRef.current.find(c => c.estId === fromEst.id && (c.type||"repair_fiz") !== "annex");
              if (twin) {
                const sum = (twin.works||[]).reduce((s,w)=>s+Math.round((Number(w.price)||0)*(Number(w.quantity)||0)),0);
                if (!window.confirm(`По этой смете уже есть договор ${twin.number?"№"+twin.number:"(без номера)"} от ${fmtDate(twin.date)} на ${sum.toLocaleString("ru-RU")} ₸.\n\nСоздать ВТОРОЙ договор по той же смете?\n\nОК — создать ещё один.\nОтмена — открыть существующий из списка документов ниже.`)) return;
              }
            }
            const clientId = ensureObjClient(obj); // синхронно (записи в фон) — редактор открывается сразу
          // Цены позиций уже клиентские (наценка и скидка внутри), поэтому документ
          // самодостаточен: его сумма = сумме позиций, и все экраны видят одно число.
          const works = fromEst ? estToContractWorks(fromEst) : [];
          const _fromDisc = Number(fromEst?.discount) || 0;
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
            discount: 0, // скидка уже внутри цен позиций — второй раз не вычитаем
            ...(_fromDisc > 0 ? { discountApplied: _fromDisc } : {}),
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
          // РАСТОРЖЕНИЕ / АРХИВ ПРИ ОТКРЫТОМ КАБИНЕТЕ. Ничего не закрываем сами (боевые
          // данные меняем только по явному решению владельца), но и молчать нельзя:
          // у расторгнутого объекта ссылка продолжала жить до конца 60 дней, и клиент
          // всё это время видел этапы и историю оплат.
          let revokeShareAfterSave = false;
          if (["cancel", "archive"].includes(requestedStatus) && _progActive(obj)) {
            const what = requestedStatus === "cancel" ? "расторгнут" : "уходит в архив";
            revokeShareAfterSave = window.confirm(
              `Объект ${what}, а кабинет клиента открыт — он продолжит видеть этапы, прогресс и историю оплат.\n\nЗакрыть клиенту доступ?\n\nOK — закрыть доступ.\nОтмена — оставить открытым.`);
          }
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
              // «Дата продажи (подписание договора)» — по ней считаются срок сделки и
              // простой до старта. Проставляем её из даты договора, чтобы не заполнять
              // руками. Это НЕ авто-миграция: запись происходит только по явному
              // действию владельца — клику по статусу «Договор подписан».
              // Берём ОСНОВНОЙ клиентский договор: доп. соглашения (annex) подписываются
              // позже и дали бы поздний срок сделки, подряд — это себестоимость.
              const saleDateFromContract = contractsRef.current
                .filter(c => c && !c.deletedAt && c.objectId === obj.id && c.date
                  && c.type !== "annex" && c.type !== "podryad" && c.type !== "podryad_annex")
                .map(c => String(c.date).slice(0, 10))
                .sort()[0] || "";

              const hasProd = productionsRef.current.some(p => p.objectId === obj.id);
              if (!hasProd) {
                const prod = emptyProduction(obj.id, genId);
                prod.prodStatus = "new";
                if (saleDateFromContract) prod.saleDate = saleDateFromContract;
                // create-if-missing — команда идемпотентна: если карточка уже появилась (гонка),
                // не перезапишет её.
                dependencyWrites.push(
                  mutateProductions({ type: "create-if-missing", objectId: obj.id, record: prod })
                    .then(prodRes => { if (!prodRes.committed) throw new Error("mutateProductions(create) не подтверждён"); }),
                );
              } else if (saleDateFromContract) {
                // Карточка уже есть: заполняем дату продажи ТОЛЬКО если она пустая —
                // выставленную вручную не перетираем.
                const existingProd = productionsRef.current.find(p => p.objectId === obj.id);
                if (existingProd && !existingProd.saleDate) {
                  dependencyWrites.push(
                    mutateProductions({
                      type: "patch-card",
                      objectId: obj.id,
                      patch: { saleDate: saleDateFromContract },
                      changeId: `bg_saledate_${obj.id}`,
                    }).catch(e => console.warn("saleDate patch err", e)),
                  );
                }
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
          // Доступ гасим ТОЛЬКО после подтверждённой записи статуса и только если владелец
          // согласился. Обе ноды (прогресс и документы) и флаг у объекта — как в ручном
          // «закрыть доступ», плюс запись в журнал: это видимое клиенту действие.
          if (revokeShareAfterSave && obj.progressToken) {
            try {
              const fresh = objectsRef.current.find(x => x.id === obj.id) || obj;
              const next = objectsRef.current.filter(x => x.id !== obj.id);
              await saveObjects([...next, { ...fresh, progressShared: false, updatedAt: Date.now() }]);
              await _revokeProgressAccess(obj.progressToken);
              logChange(currentUser, { entity: "publish", entityId: obj.id, objectId: obj.id, label: _objLabel(obj),
                action: "закрыл доступ клиенту", detail: `объект ${requestedStatus === "cancel" ? "расторгнут" : "в архиве"}` });
            } catch (e) { console.warn("revoke on status err", e); }
          }
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
                  const newObj = {id:genId(),clientId:"",clientName:"",clientPhone:"",clientType:"физ",clientIin:"",clientDoc:"",address:"",objType:"Вторичка",area:"",status:"new",note:"",manager:currentUser.name,createdBy:currentUser.name,createdById:currentUser.id,createdAt:Date.now(),updatedAt:Date.now(),financeCalcMode:"contracts-v2"};
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
                {currentPermissions.objectExport !== "none" && <button onClick={()=>downloadCSV(
                  "objects_"+new Date().toISOString().slice(0,10)+".csv",
                  ["Статус","Клиент","Телефон","Адрес","Тип","Площадь","Менеджер","Дата создания","Смет (шт)","Сумма смет","Договоров"],
                  filteredObjects.filter(matchesObjectChip).map(o=>{
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
                {(()=>{
                  // Тип, сотрудник и период — под кнопкой: ими пользуются редко, а два
                  // ряда чипов занимали место постоянно. Сколько фильтров включено —
                  // видно на кнопке, иначе забытый фильтр молча «прячет» объекты.
                  const on = (objectFilterType?1:0) + (objectFilterManager?1:0) + ((objectDateFrom||objectDateTo)?1:0);
                  return (
                    <button onClick={()=>_setObjPanel("filters", setObjFiltersOpen)(!objFiltersOpen)}
                      style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${on?"#2563eb":"#e2e8f0"}`,background:on?"#eff6ff":"#fff",color:on?"#2563eb":"#64748b",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      ⚙ Фильтры{on?` · ${on}`:""} <span style={{fontSize:10}}>{objFiltersOpen?"▲":"▼"}</span>
                    </button>
                  );
                })()}
                {/* Считаем здесь же: usRows объявляется ниже по разметке, и обращение
                    к ней отсюда роняло весь экран «Объекты» в белый лист. */}
                <span style={{fontSize:12,color:"#94a3b8",whiteSpace:"nowrap"}}>Объектов: {filteredObjects.filter(matchesObjectChip).length}</span>
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
                {/* Гарантия — не статус объекта, а отдельный срез: сданный объект живёт
                    ещё 12 месяцев, и раньше он просто пропадал из поля зрения. */}
                {(()=>{
                  const cnt = liveObjects.filter(o=>{
                    const pr = productions.find(p=>p.objectId===o.id);
                    return pr && warrantyState(pr).status==="active";
                  }).length;
                  if(!cnt && objectFilterStatus!=="__warranty") return null;
                  const on = objectFilterStatus==="__warranty";
                  return (
                    <button onClick={()=>setObjectFilterStatus(v=>v==="__warranty"?"":"__warranty")}
                      style={{background:on?"#ecfdf5":"rgba(0,0,0,.03)",color:on?"#059669":"#94a3b8",border:`1px solid ${on?"#059669":"#e2e8f0"}`,borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      🛡 На гарантии {cnt>0&&<span style={{opacity:.6}}>({cnt})</span>}
                    </button>
                  );
                })()}
              </div>
              {/* Тип, сотрудник и период — раскрываются кнопкой «Фильтры» */}
              {objFiltersOpen && (<>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <label style={{display:"flex",alignItems:"center",gap:4,border:"1px solid #e2e8f0",borderRadius:8,padding:"0 6px 0 9px",fontSize:11,fontWeight:600,color:"#94a3b8",background:"#fff",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit"}} title="Дата от">с
                  <input type="date" value={objectDateFrom} onChange={e=>setObjectDateFrom(e.target.value)}
                    style={{border:"none",padding:"8px 0",fontSize:12,outline:"none",fontFamily:"inherit",background:"transparent",color:objectDateFrom?"#0f172a":"#94a3b8"}}/></label>
                <label style={{display:"flex",alignItems:"center",gap:4,border:"1px solid #e2e8f0",borderRadius:8,padding:"0 6px 0 9px",fontSize:11,fontWeight:600,color:"#94a3b8",background:"#fff",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit"}} title="Дата до">по
                  <input type="date" value={objectDateTo} onChange={e=>setObjectDateTo(e.target.value)}
                    style={{border:"none",padding:"8px 0",fontSize:12,outline:"none",fontFamily:"inherit",background:"transparent",color:objectDateTo?"#0f172a":"#94a3b8"}}/></label>
                {(objectDateFrom||objectDateTo) && <button onClick={()=>{setObjectDateFrom("");setObjectDateTo("");}} style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",fontSize:12,cursor:"pointer",color:"#94a3b8",fontFamily:"inherit"}}>✕ дата</button>}
              </div>
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
              </>)}

              {liveObjects.length===0 && (
                <div style={{textAlign:"center",padding:"60px 0",color:"#94a3b8"}}>
                  <div style={{fontSize:48,marginBottom:12}}>📦</div>
                  <div style={{fontWeight:700,marginBottom:6}}>Объектов пока нет</div>
                  <div style={{fontSize:12}}>Каждый объект — это папка с клиентом, сметами и договорами</div>
                </div>
              )}

              {/* Плитки объектов — как в «Производстве». Статус единый: производство перевешивает сделку. */}
              {(()=>{
              const usRows = filteredObjects.filter(matchesObjectChip);
              // Та же математика, что в «Финансы → Проекты», но только по объектам,
              // оставшимся после текущих фильтров списка. Без отдельного права
              // финансовые значения не вычисляются для интерфейса и не выводятся в DOM.
              let objectFinanceSummary = null;
              if (hasObjectFinanceSummary) {
                const selectedObjectIds = new Set(usRows.map(o=>o.id));
                // На согласовании фактических оплат и расходов ещё может не быть. Здесь
                // показываем коммерческий план непосредственно из смет выбранных объектов.
                if (objectFilterStatus === "approval") {
                  const catalog = getEffectiveCatalog();
                  let budget = 0;
                  let planCost = 0;
                  for (const object of usRows) {
                    for (const estimate of estimatesForObject(estimates, object.id)) {
                      let calculatedTotal = 0;
                      let estimateCost = 0;
                      for (const { row, work, qty } of resolveEstimateRows(estimate.rows, catalog)) {
                        const cpxPct = row?.cpxPct!==undefined ? Number(row.cpxPct) : undefined;
                        const unitPrice = work
                          ? getEstimateRowPrice(row,work,qty,row?.complexity||"std",cpxPct)
                          : Number(row?.manualPrice ?? row?.price ?? row?.pricingSnapshot?.price ?? 0);
                        calculatedTotal += (Number(unitPrice)||0)*qty;
                        estimateCost += work
                          ? rowCostPerUnit(row,work)*qty
                          : (Number(row?.manualCost ?? row?.costPrice ?? row?.pricingSnapshot?.cost ?? 0)||0)*qty;
                      }
                      const markup = 1+(Number(estimate.markup)||0)/100;
                      const discount = 1-(Number(estimate.discount)||0)/100;
                      budget += Number(estimate.total)||calculatedTotal*markup*discount;
                      planCost += estimateCost;
                    }
                  }
                  const gross = budget-planCost;
                  objectFinanceSummary={kind:"plan",budget,planCost,gross,margin:budget>0?Math.round(gross/budget*100):0,objects:usRows.length};
                } else {
                const linkedProjects = finProjects.filter(p=>selectedObjectIds.has(financeObjectOf(p)?.id));
                const coveredObjectIds = new Set(linkedProjects.map(p=>financeObjectOf(p)?.id).filter(Boolean));
                const virtualProjects = usRows
                  .filter(o=>!coveredObjectIds.has(o.id))
                  .map(o=>{
                    const c=financeContractOf({},o);
                    const estimateTotal=estimates
                      .filter(e=>e.objectId===o.id)
                      .reduce((sum,e)=>sum+(Number(e.total)||0),0);
                    return {id:"",_virtual:true,objectId:o.id,contractNo:c?.number||"",budget:finBudgetOfContract(c)||estimateTotal||0,createdAt:String(o.createdAt||"")};
                  });
                const projects=[...linkedProjects,...virtualProjects];
                const stats={};
                for (const tx of financeTx) {
                  if (tx.deletedAt||tx.included===false) continue;
                  const cn=normCN(tx.contractNo);
                  if (!cn) continue;
                  if (!stats[cn]) stats[cn]={income:0,expense:0};
                  if (tx.type==="income") stats[cn].income+=Number(tx.amount)||0;
                  else if (tx.type==="expense") stats[cn].expense+=Number(tx.amount)||0;
                }
                const budget=projects.reduce((sum,p)=>sum+financeBudgetOf(p),0);
                const income=projects.reduce((sum,p)=>sum+(stats[normCN(p.contractNo)]?.income||0),0);
                const expense=projects.reduce((sum,p)=>sum+(stats[normCN(p.contractNo)]?.expense||0),0);
                const debt=projects.reduce((sum,p)=>sum+Math.max(0,financeBudgetOf(p)-(stats[normCN(p.contractNo)]?.income||0)),0);
                objectFinanceSummary={kind:"actual",budget,income,expense,debt,gross:income-expense,margin:income>0?Math.round((income-expense)/income*100):0,objects:usRows.length};
                }
              }
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
              {!objectAttentionFilter && orphanFps.length>0 && <div style={{fontSize:12,color:"#94a3b8"}}>Проектов из Финансов без объекта: {orphanFps.length}</div>}
              {objectFinanceSummary && objectFinanceSummary.objects>0 && (()=>{
                const money=n=>new Intl.NumberFormat("ru-RU").format(Math.round(Number(n)||0))+" ₸";
                const s=objectFinanceSummary;
                const tiles=s.kind==="plan" ? [
                  ["Объём смет · план",money(s.budget),"#2563eb","#eff6ff"],
                  ["Себестоимость · план",money(s.planCost),"#dc2626","#fef2f2"],
                  ["Валовая прибыль · план",money(s.gross),s.gross>=0?"#059669":"#dc2626",s.gross>=0?"#f0fdf4":"#fef2f2"],
                  ["Маржа · план",s.margin+"%",s.margin>=30?"#059669":s.margin>=0?"#f59e0b":"#dc2626","#fffbeb"],
                ] : [
                  ["Объём продаж",money(s.budget),"#0f172a","#f1f5f9"],
                  ["Оплачено факт",money(s.income),"#059669","#f0fdf4"],
                  ["Дебиторка",s.debt>0?money(s.debt):"—",s.debt>0?"#dc2626":"#94a3b8","#fef2f2"],
                  ["Расходы",money(s.expense),"#dc2626","#fef2f2"],
                  ["Валовая прибыль",money(s.gross),s.gross>=0?"#059669":"#dc2626","#f0fdf4"],
                  ["Маржа",s.margin+"%",s.margin>=30?"#059669":s.margin>=0?"#f59e0b":"#dc2626","#fffbeb"],
                ];
                // Свёрнуто по умолчанию: шесть плиток стояли над списком всегда, а
                // нужны эпизодически. В свёрнутом виде — две главные цифры строкой.
                const head = s.kind==="plan"
                  ? `объём смет ${money(s.budget)} · маржа ${s.margin}%`
                  : `продажи ${money(s.budget)}${s.debt>0?` · долг ${money(s.debt)}`:""}`;
                return <div style={{margin:"2px 0 4px"}}>
                  <button onClick={()=>_setObjPanel("summary", setObjSummaryOpen)(!objSummaryOpen)}
                    style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
                      background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",cursor:"pointer",
                      fontFamily:"inherit",textAlign:"left",marginBottom:objSummaryOpen?8:0}}>
                    <span style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",minWidth:0}}>
                      <span style={{fontSize:12,fontWeight:800,color:"#475569"}}>💰 {s.kind==="plan"?"План по сметам":"Финансы"}</span>
                      <span style={{fontSize:12,color:"#64748b"}}>{head}</span>
                    </span>
                    <span style={{fontSize:10.5,color:"#94a3b8",whiteSpace:"nowrap"}}>{s.objects} об. {objSummaryOpen?"▲":"▼"}</span>
                  </button>
                  {objSummaryOpen && <div className="fin-tiles" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
                    {tiles.map(([label,value,color,bg])=><div key={label} style={{background:bg,border:"1px solid "+color+"22",borderRadius:10,padding:"10px 12px",minWidth:0}}>
                      <div style={{fontSize:10.5,color:"#64748b",fontWeight:650,marginBottom:3}}>{label}</div>
                      <div style={{fontSize:16,fontWeight:850,color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>
                    </div>)}
                  </div>}
                </div>;
              })()}
              {/* Диспетчерская: кто из объектов текущего списка требует внимания и почему.
                  Только для руководителей и только когда не включён фильтр «без движения» —
                  иначе два разных списка проблем стояли бы друг под другом. */}
              {currentPermissions.productionControl !== "none" && !objectAttentionFilter && usRows.length > 0 && (
                <ObjectDispatcher
                  objects={usRows}
                  productions={productions}
                  onOpenObject={(object) => openIssue({ object: object.id, tab: "control" })}
                  open={objDispatchOpen}
                  onToggle={_setObjPanel("dispatch", setObjDispatchOpen)}
                />
              )}
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
                  <div key={e.key} onClick={async ()=>{
                      if(!window.confirm(`«${e.name}» — проект из Финансов, объекта у него ещё нет.\nСоздать объект со статусом «${st.label}»?`)) return;
                      const newObj = { id: Date.now().toString(), clientName: e.name||"Проект", clientPhone:"", address: e.address||"", objType:"Вторичка", status: usKey, manager: currentUser.name, createdAt: Date.now(), createdById: currentUser.id, updatedAt: Date.now(), _fromFinProject: e.fpId };
                      // Раньше уходили в карточку не дождавшись записи: при отказе пользователь
                      // работал в объекте, которого в базе нет, и всё введённое в нём терялось.
                      let blockedReason = "";
                      const saved = await saveObjects([...objectsRef.current, newObj], { onBlocked: (r)=>{ blockedReason = r; } });
                      if (!saved) { window.alert(`Объект НЕ создан: ${saveFailReasonText(blockedReason)}. Проект в Финансах не тронут.`); return; }
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
                            // К моменту подписания телефон и адрес обязаны быть: по ним звонят,
                            // на них едут и они попадают в договор. Не блокируем — бывает, что
                            // данные дозаполняют следом, — но говорим вслух, пока не поздно.
                            const missing = [
                              String(obj.clientPhone || "").replace(/\D/g, "").length < 6 ? "телефон клиента" : "",
                              String(obj.address || "").trim() ? "" : "адрес объекта",
                            ].filter(Boolean);
                            const warn = missing.length ? `\n\n⚠️ Не заполнено: ${missing.join(", ")}. Эти данные нужны для договора и для связи с клиентом.` : "";
                            const msg = (hasFp
                              ? "Перевести объект в статус «Договор подписан»?"
                              : "Перевести объект в статус «Договор подписан»?\n\nБудут созданы финансовый проект (раздел «Финансы») и карточка производства для этого объекта.") + warn;
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

                  {/* Причина отказа — появляется только у потерянных объектов.
                      Нужна для аналитики: без неё видно «сколько потеряли», но не видно «почему». */}
                  {["refuse","cancel"].includes(unifiedStatusOf(obj)) && (
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:"#dc2626",fontWeight:700}}>Причина отказа</span>
                      <select className="fi" style={{width:"auto",minWidth:180,fontSize:12}}
                        disabled={!canChangeStatus}
                        value={obj.refuseReason||""}
                        onChange={e=>saveObjField(obj,{refuseReason:e.target.value})}>
                        <option value="">— не указана —</option>
                        {REFUSE_REASONS.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    </div>
                  )}

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
                      {/* Менеджер — ТОЛЬКО выбор из сотрудников. Свободный ввод убран: раньше
                          сюда попадал произвольный текст, и один человек дробился на несколько
                          вариантов написания, ломая фильтр по сотруднику и аналитику.
                          Старое значение, которого нет в списке, показываем отдельным пунктом,
                          чтобы оно не потерялось молча при первом же открытии карточки. */}
                      <select className="fi" style={{fontSize:12}} disabled={!canAssignObject}
                        value={obj.manager||""}
                        onChange={e=>{ setObjLocal({manager:e.target.value}); persistObj(); }}>
                        <option value="">— менеджер не назначен —</option>
                        {nonViewerUsers.map(u=>(<option key={u.id} value={u.name}>{u.name}</option>))}
                        {obj.manager && !nonViewerUsers.some(u=>u.name===obj.manager) && (
                          <option value={obj.manager}>{obj.manager} (нет в сотрудниках)</option>
                        )}
                      </select>
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
                <div className="obj-tabs" style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap",borderBottom:"1px solid #e2e8f0"}}>
                  {[
                    ["info","ℹ️ Информация"],
                    // Оперативные вкладки: «Сегодня» — экран прораба, «Управление» — руководителя.
                    // Видимость настраивается в «Админка → Права ролей», а не зашита по ролям.
                    ...(currentPermissions.productionToday !== "none" || currentPermissions.showLocked ? [["today","☀️ Сегодня"]] : []),
                    ...(currentPermissions.productionControl !== "none" || currentPermissions.showLocked ? [["control","🎛 Управление"]] : []),
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
                    if (k === "today") return currentPermissions.showLocked || currentPermissions.productionToday !== "none";
                    if (k === "control") return currentPermissions.showLocked || currentPermissions.productionControl !== "none";
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
                  {/* СМЕТЫ ПРОТИВ ДОГОВОРОВ. Работы считают в смете, а бумагу оформляют
                      договором и приложениями — и они расходятся молча. На боевой нашлось
                      1 423 886 ₸ работ у объекта в работе, на которые договора нет. Считаем
                      здесь, где рядом лежат обе стопки и где создают недостающее приложение. */}
                  {(()=>{
                    const estSum = objEsts.reduce((sum,e)=>sum+(Number(e.total)||0),0);
                    const conSum = objCons
                      .filter(c=>String(c.type||"")!=="reservation" && !String(c.type||"").startsWith("podryad"))
                      .reduce((sum,c)=>sum+(c.works||[]).reduce((w,x)=>w+Math.round((Number(x.price)||0)*(Number(x.quantity)||0)),0),0);
                    if (estSum<=0 || conSum<=0) return null;
                    const gap = estSum - conSum;
                    // Порог в 2%: копеечные расхождения от округления — не повод кричать.
                    if (Math.abs(gap)/Math.max(estSum,conSum) <= 0.02) return null;
                    const short = gap>0;
                    return (
                      /* Всё содержимое — одной левой колонкой. Раньше строка с суммами
                         прижималась вправо (marginLeft:auto): на широком экране она стояла
                         в конце заголовка, а на телефоне переносилась и висела у правого
                         края, из-за чего плашка выглядела кривой. */
                      <div style={{background:"#fff",border:"1px solid "+(short?"#fde68a":"#e2e8f0"),borderRadius:11,padding:"11px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"flex-start"}}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:short?"#d97706":"#64748b",flexShrink:0,marginTop:6}}/>
                        <div style={{minWidth:0,display:"grid",gap:4}}>
                          <div style={{display:"flex",gap:8,alignItems:"baseline",flexWrap:"wrap"}}>
                            <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>
                              {short ? "Смета не покрыта договором" : "Договоров больше, чем смет"}
                            </span>
                            <span style={{fontSize:12.5,fontWeight:800,color:short?"#b45309":"#64748b",whiteSpace:"nowrap"}}>
                              {fmt(Math.abs(gap))} ₸
                            </span>
                          </div>
                          <div style={{fontSize:11.5,color:"#64748b",overflowWrap:"anywhere"}}>
                            сметы {fmt(estSum)} ₸ · договоры {fmt(conSum)} ₸
                          </div>
                          <div style={{fontSize:11.5,color:"#94a3b8"}}>
                            {short
                              ? "Работы засметированы, но бумаги на них нет — оформите приложение к договору."
                              : "Либо есть лишний договор, либо потеряна доп. смета."}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
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
                      const posCount = resolveEstimateRows(est.rows, getEffectiveCatalog()).length;
                      const stEst = STATUSES.find(s=>s.key===(est.status||"new"))||STATUSES[0];
                      return (
                        <div key={est.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",cursor:canEditEstimate?"pointer":"default",marginLeft:isChild?16:0,borderLeft:isChild?"3px solid #d1fae5":"1px solid #e5e7eb"}}
                          onClick={canEditEstimate?()=>openObjectEstimateEdit(est, obj):undefined}>
                          <div className="est-card-row" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
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
                            <div className="est-card-acts" style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>{fmt(est.total||0)} ₸</div>
                              <div className="est-card-btns" style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                                {/* Договор по этой смете уже есть — видно ДО нажатия, чтобы
                                    не выгружать одну смету в документ второй раз. */}
                                {!isChild && (()=>{ const made = contracts.find(c=>c.estId===est.id && (c.type||"repair_fiz")!=="annex");
                                  return made ? <span title={`Договор уже создан ${fmtDate(made.date)}`}
                                    style={{background:"#ecfdf5",color:"#047857",border:"1px solid #bbf7d0",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>
                                    📄 {made.number ? "№"+made.number : "есть"}</span> : null; })()}
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
                      const total = contractNetTotal(c); // со скидкой договора — как в печатной форме
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
                                    <button title="Редактировать акт" onClick={()=>{ setAvrSearch(""); setAvrReqOpen(!_narrowScreen()); setAvrModal({ ...r, lines:(r.lines||[]).map(l=>({...l,included:true,doneQty:l.doneQty})) }); }}
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
                    <div style={{fontSize:12,color:"#64748b",marginBottom:10,lineHeight:1.5}}>Кто и когда менял статус работ, сроки, суммы и оплаты, добавлял фото и отчёты о расчётах, менял прораба и доступ клиента по этому объекту.</div>
                    <AuditTab objectId={obj.id} />
                  </div>
                )}
                {/* Производственные вкладки (и производственная часть «Информации») — встроенный модуль Производства */}
                {["info","today","control","launch","stages","finance","journal","defects","handover"].includes(objWsTab)
                  && currentPermissions.production !== "none"
                  // У «Сегодня» и «Управления» СВОИ права. Без этой проверки роль с
                  // «Нет доступа» всё равно видела содержимое: показ вкладки решался
                  // по общему праву на карточку производства.
                  && !(objWsTab === "today" && currentPermissions.productionToday === "none")
                  && !(objWsTab === "control" && currentPermissions.productionControl === "none")
                  && !(objWsTab==="finance" && !hasFinancialDetails) && (
                  <div style={{marginTop: objWsTab==="info" ? 14 : 0}}>
                  {/* Отчёты по этапам пишут в свой узел сами (через storage), а после
                      записи просят перепубликовать снимок клиента: в состоянии
                      приложения этот узел не живёт, и авто-republish по productions
                      его бы не заметил. */}
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
                    stageReportsStorage={storage}
                    onStageReportsChanged={(objectId) => { try { publishProgressRef.current?.(objectId, { force: true }); } catch {} }}
                    buildStagesFromEstimate={buildStagesFromEstimate}
                    finProjects={finProjects}
                    financeTx={financeTx}
                    reports={reports.filter(r=>r.objectId===obj.id)}
                    staffOptions={nonViewerUsers}
                    fmt={fmt}
                    genId={genId}
                    currentUser={currentUser}
                    readOnly={!editorTab || currentPermissions.production === "none"}
                    actionPermissions={{
                      edit: accessAllows(currentPermissions.productionEdit, estimatorObjectIds.has(obj.id)),
                      stages: accessAllows(currentPermissions.productionStages, estimatorObjectIds.has(obj.id)),
                      quality: accessAllows(currentPermissions.productionQuality, estimatorObjectIds.has(obj.id)),
                      clientAccess: accessAllows(currentPermissions.productionClientAccess, estimatorObjectIds.has(obj.id)),
                      today: accessAllows(currentPermissions.productionToday, estimatorObjectIds.has(obj.id)),
                      control: accessAllows(currentPermissions.productionControl, estimatorObjectIds.has(obj.id)),
                    }}
                    onAudit={(ev)=>logChange(currentUser, ev)}
                  />
                  </div>
                )}
                {["today","control","launch","stages","journal","defects","handover"].includes(objWsTab)
                  && (currentPermissions.production === "none"
                    || (objWsTab === "today" && currentPermissions.productionToday === "none")
                    || (objWsTab === "control" && currentPermissions.productionControl === "none"))
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
        {effScreen === "masters" && currentPermissions.masters !== "none" && <MastersSection masters={masters} meta={mastersMeta} loaded={mastersLoaded} config={mastersConfig} onSaveConfig={saveMastersConfig} canManage={accessAllows(currentPermissions.mastersManage, true)} mastersOlx={mastersOlx} olxMeta={mastersOlxMeta} olxLoaded={mastersOlxLoaded} olxConfig={mastersOlxConfig} onSaveOlxConfig={saveMastersOlxConfig} crmData={mastersCrm} onSaveCrm={saveMastersCrm} currentUser={currentUser} />}

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
                    const total = contractNetTotal(c); // со скидкой договора
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
                          <div className="doc-card-row" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
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
                            <div className="doc-card-side" style={{textAlign:"right",flexShrink:0}}>
                              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{fmt(total)} ₸</div>
                              <div className="doc-card-btns" style={{display:"flex",gap:5,marginTop:6}}>
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
                  const total = contractNetTotal(c); // со скидкой договора
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
                  // Договор живёт в currentContract, а не в списке: уйти к списку при
                  // неудавшейся записи означало потерять правки. Остаёмся в редакторе.
                  let blockedReason = "";
                  const savedC = await saveContracts([...list, currentContract], { onBlocked: (r)=>{ blockedReason = r; } });
                  if (!savedC) {
                    window.alert(`Договор НЕ сохранён: ${saveFailReasonText(blockedReason)}.\n\nОстаёмся в редакторе — данные на месте. Нажмите «Сохранить» ещё раз или «Повторить сохранение» в красной плашке сверху.`);
                    return;
                  }
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
                  // Момент истины: дальше договор уходит на печать. Пустые реквизиты
                  // превращаются в «___________» уже на бумаге, и это выясняется у клиента.
                  if (!cl) {
                    if (!window.confirm("Клиент не выбран — в договоре все его данные будут прочерками.\n\nВсё равно сформировать?")) return;
                  } else {
                    const isYur = cl.type === "юр";
                    const req = isYur
                      ? [["ФИО / Название","name"],["Телефон","phone"],["Адрес","address"],["БИН","iin"],["Директор (полностью)","director"]]
                      : [["ФИО","name"],["Телефон","phone"],["Адрес","address"],["ИИН","iin"],["Документ (уд. личности)","doc"]];
                    const miss = req.filter(([,f]) => !String(cl[f] || "").trim()).map(([l]) => l);
                    if (miss.length && !window.confirm(`В договоре останутся прочерки — у клиента не заполнено:\n\n• ${miss.join("\n• ")}\n\nВсё равно сформировать?`)) return;
                  }
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
                onCreateClient={async (newClient)=>{
                  // Клиент сразу в списке (кнопка не подвисает), но результат записи
                  // возвращаем форме: договор не должен ссылаться на клиента, которого
                  // в базе нет — форма покажет причину и не закроется.
                  const next = [...contractClients, newClient];
                  clientsRef.current = next; setContractClients(next);
                  let blockedReason = "";
                  const saved = await saveContractClients(next, { onBlocked: (r)=>{ blockedReason = r; } }).catch(e=>{ console.warn("bg client save err", e); return undefined; });
                  return saved ? { ok: true } : { ok: false, reason: blockedReason };
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
                // Объекты для импорта — ТОЛЬКО доступные текущей роли (liveObjects уже сужен
                // правом «Просмотр объектов»). Раньше сюда уходил ПОЛНЫЙ список: в выпадашке
                // «импорт объекта» замерщик с objects:"own" видел клиентов и адреса всей
                // компании, а по клику затягивал в договор работы и клиентские цены из чужой
                // сметы. Проверка по id обязательна и в getObjectWorks: список можно сузить,
                // но вызов приходит с id и должен отказывать сам по себе.
                importObjects={liveObjects.map(o=>({id:o.id,label:o.clientName||o.address||o.id,address:o.address||""}))}
                getObjectWorks={(objId)=>{ if(!liveObjects.some(o=>o.id===objId)) return []; const ests=estimates.filter(e=>e.objectId===objId); const main=ests.find(e=>!e.parentId||e.parentId===e.id)||ests[0]; return main?estimateToWorks(main):[]; }}
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
        <AdminPageContent
          currentUser={currentUser}
          onAuditPrice={ev => logChange(currentUser, ev)}
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
          onBeforePriceChange={protectHistoricalEstimatePricing}
          onBackupWorkspace={openWorkspaceBackups}
          onExportAll={exportAllJSON}
          onImportAll={importAllJSON}
          onExportEstimatesXls={exportEstimatesXls}
          checkIssues={_checkIssues}
          onNavIssue={openIssue}
        />
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
        // ПОИСК ПО РАБОТАМ. В акте бывает под полсотни строк, и мотать их глазами неудобно.
        // Фильтруем ОТОБРАЖЕНИЕ, но тащим с собой исходный индекс: updLine и удаление строки
        // адресуются по позиции в m.lines, и если отдать им номер из отфильтрованного списка,
        // правка уедет в соседнюю работу. Поэтому visible — пары {l, i} с настоящим i.
        const q = avrSearch.trim().toLowerCase();
        const visible = m.lines
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => !q || `${l.name || ""} ${l.cat || ""} ${l.unit || ""}`.toLowerCase().includes(q));
        // «Выбрать все» при активном поиске работает по НАЙДЕННЫМ строкам: набрал «демонтаж» —
        // отметил весь демонтаж одной кнопкой. Без фильтра ведёт себя как раньше.
        const scope = q ? visible.map(v => v.l) : m.lines;
        const allOn = scope.length > 0 && scope.every(l => l.included);
        const toggleAll = () => {
          const idx = new Set(visible.map(v => v.i));
          setAvrModal(p => ({ ...p, lines: p.lines.map((l, i) => (q && !idx.has(i)) ? l : { ...l, included: !allOn }) }));
        };
        // Новая строка не совпадёт с фильтром и визуально «не добавится» — поэтому поиск сбрасываем.
        const addLine = ()=>{ setAvrSearch(""); setAvrModal(p=>({...p, lines:[...p.lines, {cat:"",name:"",unit:"",qty:0,price:0,included:true,doneQty:1}]})); };
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
            {/* реквизиты акта — сворачиваются, чтобы на телефоне список работ не сжимался в полоску */}
            <button onClick={()=>setAvrReqOpen(v=>!v)}
              style={{width:"100%",textAlign:"left",background:avrReqOpen?"none":"#f8fafc",border:"none",borderBottom:"1px solid #f1f5f9",padding:"10px 20px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:"#94a3b8",transform:avrReqOpen?"rotate(90deg)":"none",transition:"transform .15s",display:"inline-block"}}>▶</span>
              <span style={{fontSize:12.5,fontWeight:700,color:"#475569"}}>Реквизиты акта</span>
              {!avrReqOpen && (
                <span style={{fontSize:12,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
                  №{m.actNo||"—"} · {m.actDate||"—"}{m.clientName?` · ${m.clientName}`:""}
                </span>
              )}
            </button>
            {avrReqOpen && (
            <div style={{padding:"14px 20px",borderBottom:"1px solid #f1f5f9",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
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
            )}
            {/* список работ */}
            <div style={{padding:"10px 20px 8px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:"1 1 200px",minWidth:0}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#94a3b8",pointerEvents:"none"}}>🔍</span>
                <input value={avrSearch} onChange={e=>setAvrSearch(e.target.value)} placeholder="Поиск по работам"
                  style={{width:"100%",padding:"7px 28px 7px 30px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                {avrSearch && <button onClick={()=>setAvrSearch("")} title="Очистить"
                  style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#94a3b8",fontSize:16,cursor:"pointer",lineHeight:1,padding:2}}>×</button>}
              </div>
              <button onClick={toggleAll} disabled={visible.length===0}
                style={{background:"none",border:"1px solid #e2e8f0",borderRadius:7,padding:"6px 11px",fontSize:11,fontWeight:600,color:visible.length?"#475569":"#cbd5e1",cursor:visible.length?"pointer":"default",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
                {allOn ? "☐ Снять" : "☑ Выбрать"}{q ? " найденные" : " все"}
              </button>
              <span style={{fontSize:12,color:"#64748b",whiteSpace:"nowrap",flexShrink:0}}>
                Выбрано: <b>{selected.length}</b> из {m.lines.length}
                {q && <span style={{color:"#7c3aed",fontWeight:600}}> · найдено {visible.length}</span>}
              </span>
            </div>
            {/* minHeight: даже с раскрытыми реквизитами списку остаётся читаемая высота,
                а не полоска в одну строку (flex-элемент со скроллом иначе сжимается до нуля) */}
            <div style={{overflowY:"auto",flex:1,minHeight:170,padding:"6px 12px",WebkitOverflowScrolling:"touch"}}>
              {q && visible.length===0 && (
                <div style={{padding:"26px 8px",textAlign:"center",color:"#94a3b8",fontSize:13}}>
                  Ничего не нашлось по запросу «{avrSearch.trim()}»
                </div>
              )}
              {visible.map(({l,i})=>(
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

