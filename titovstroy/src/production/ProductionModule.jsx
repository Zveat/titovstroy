import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { STAGE_STATUSES, emptyProduction } from "./constants.js";
import { normCN, estimatesForObject, findFinanceProjectForObject, sortProductionStages, moveProductionStage } from "../utils.js";
import { buildFlushBatch, normalizeProductionIds, rebaseLocalProduction, _stageKey } from "./commands.js";
import { listProductionDrafts, removeProductionDraft, saveProductionDraft } from "./drafts.js";
import ObjectControlModule from "../object-control/ObjectControlModule.jsx";
import { updateStageStatus, upsertDailyReport } from "../object-control/objectControl.js";

// ─────────────────────────────────────────────────────────────────────────
// ПРОИЗВОДСТВО — управление и контроль объектов в работе.
// Полностью изолированный модуль: данные приходят через props, сохранение
// делегируется в App.jsx командами через setProductionCommandHandler. Не зависит от внутренностей App.
//
// props:
//   objects        — живые объекты (liveObjects)
//   estimates      — все сметы (для привязки и автозаполнения этапов)
//   contracts      — все договоры (для отображения)
//   productions    — массив производственных карточек [{objectId, ...}]
//   Командный handler привязывает MainApp через setProductionCommandHandler().
//   buildStagesFromEstimate(objectId) — этапы из сметы [{cat, name, priceClient, costPlan}]
//   fmt, genId, currentUser
// ─────────────────────────────────────────────────────────────────────────

const stByKey = (k) => STAGE_STATUSES.find(s => s.key === k) || STAGE_STATUSES[0];
const localDateKey = () => {
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Превратить строки сметы в строки-работы (наименования). cat = блок-заголовок. estimateKey
// (стабильный ключ сметной позиции) ОБЯЗАТЕЛЕН — по нему автосинк сопоставляет этапы; без него
// первый же синк добавил бы дубли этих же позиций.
const estToStages = (fromEst, genId) => fromEst.map(s => ({
  id: genId(), estimateKey: _stageKey(s), cat: s.cat || "Прочее", name: s.name || "", unit: s.unit || "", qty: s.qty || 0,
  planStart: "", planEnd: "", factStart: "", factEnd: "",
  status: "todo", responsible: "", note: "", paid: false,
  priceClient: s.priceClient || 0, costPlan: s.costPlan || 0, fromEst: true,
}));

// Группировка строк по Заголовку (категории) с сохранением порядка
const groupByCat = (rows) => {
  const g = {}; const order = [];
  for (const s of rows) { const c = s.cat || "Прочее"; if (!g[c]) { g[c] = []; order.push(c); } g[c].push(s); }
  return order.map(c => [c, g[c]]);
};

// Нормализация номера договора — ЕДИНАЯ с App.jsx (normCN из utils.js): убираем не только
// пробелы, но и № и #. Раньше здесь была своя усечённая версия (только пробелы) — из-за неё
// «№1012» и «1012» считались разными, и операции/проект могли не сойтись в финвкладке объекта,
// хотя в разделе Финансы (где normCN) — сходились. Теперь один источник истины.

// ── ОЧЕРЕДЬ СОХРАНЕНИЯ ПРОИЗВОДСТВА (MODULE-SCOPE: переживает размонтирование компонента) ──
// Несохранённые правки живут в Map на уровне модуля И синхронно зеркалятся в per-user
// localStorage-черновики. Поэтому они переживают размонтирование карточки, перезагрузку страницы
// и падение браузера; после входа тем же пользователем очередь гидратируется и повторяется.
const _pendingByObj = new Map();   // objectId -> { base, local, rev, ensure }
                                   //   base   — последнее ПОДТВЕРЖДЁННОЕ сервером состояние (точка диффа)
                                   //   local  — текущий локальный ввод пользователя
                                   //   ensure — record создания, пока карточка НИ РАЗУ не подтверждена (иначе null)
const _flushPromises = new Map();  // objectId -> Promise ИДУЩЕГО flush (single-flight: повторный
                                   // вызов возвращает ТОТ ЖЕ Promise — ожидающие ждут реального конца)
const _revByObj = new Map();       // objectId -> версия локальной правки
const _confirmedByObj = new Map(); // objectId -> последняя подтверждённая сервером карточка
const _draftByObj = new Map();     // objectId -> ЕДИНЫЙ draft-record новой карточки (одни id для UI и create)
let _cmdFn = null;                 // актуальный командный handler MainApp
let _uiApply = null;               // (objId, card) => void — обновить открытую карточку в UI (когда смонтированы)
let _sessionN = 0;                 // номер production-сессии: stopProductionSession() инкрементирует;
                                   // каждый await в flush сверяет номер — поздний ответ УЖЕ
                                   // остановленной сессии не трогает состояние (и не воскрешает Map'ы)
let _draftUid = null;
let _draftStore = null;
let _draftFailureShown = false;
const _changeIdOf = (objId) => "cm_" + objId; // стабилен ПО ОБЪЕКТУ (не по попытке) — см. flush

function _persistEntry(objId, entry) {
  if (!_draftUid || !_draftStore || !entry) return false;
  const ok = saveProductionDraft(_draftStore, _draftUid, objId, entry);
  if (!ok && !_draftFailureShown) {
    _draftFailureShown = true;
    console.error("Не удалось сохранить локальный черновик производства", objId);
    if (typeof window !== "undefined" && window.alert) {
      window.alert("Не удалось сохранить локальный черновик производства. Не закрывайте страницу до синхронизации и освободите место в хранилище браузера.");
    }
  }
  return ok;
}
function _removeEntryDraft(objId, maxRev = Infinity) {
  if (!_draftUid || !_draftStore) return false;
  return removeProductionDraft(_draftStore, _draftUid, objId, maxRev);
}

// Цикл-до-сходимости (НЕ рекурсия): повторная отправка при новых правках/перебазировании — внутри
// ЭТОГО ЖЕ Promise, чтобы flushPendingProduction()/logout ждали ФАКТИЧЕСКОГО завершения, а не
// первой попытки. Guard от патологического пинг-понга; остаток дожмёт фоновый интервал.
async function _flushRun(objId) {
  for (let guard = 0; guard < 20; guard++) {
    if (!_cmdFn) return;
    const sess = _sessionN;
    const entry = _pendingByObj.get(objId);
    if (!entry) return;
    const startRev = entry.rev;
    const batch = buildFlushBatch(entry.base, entry.local, objId, Date.now());
    if (!batch && !entry.ensure) {
      // Менять нечего (пользователь вернул всё как было) и создавать нечего: снимаем pending и
      // ЯВНО гасим changeId в App (resolve-change) — иначе после ошибки баннер завис бы навсегда.
      // await: «Повторить сейчас»/logout ждут и снятия баннера, а не только записи.
      _pendingByObj.delete(objId);
      _removeEntryDraft(objId, startRev);
      try { await _cmdFn({ type: "resolve-change", changeId: _changeIdOf(objId) }); } catch { /* без записи в базу */ }
      return;
    }
    // Новая (ни разу не подтверждённая) карточка: создаём В ТОЙ ЖЕ транзакции (ensureRecord) —
    // record тот же объект, что и openProd в UI, поэтому id этапов/чек-листов совпадают.
    // Для УЖЕ подтверждённой карточки ensure=null — удалённую с другого устройства не воскрешаем.
    const cmd = batch || { type: "create-if-missing", objectId: objId, record: entry.ensure };
    if (batch && entry.ensure) batch.ensureRecord = entry.ensure;
    cmd.changeId = _changeIdOf(objId);
    let res; try { res = await _cmdFn(cmd); } catch { res = { committed: false }; }
    if (sess !== _sessionN) return; // сессия остановлена (logout) во время запроса — состояние не трогаем
    const curRev = _revByObj.get(objId);
    if (res && res.committed) {
      const confirmed = (res.list || []).find(p => p && p.objectId === objId) || null;
      if (confirmed) _confirmedByObj.set(objId, confirmed); // подтверждённая база — для следующих диффов
      _draftByObj.delete(objId); // карточка существует на сервере — черновик создания больше не нужен
      if (curRev === startRev) {
        // новых правок не было — объект синхронизирован
        _pendingByObj.delete(objId);
        _removeEntryDraft(objId, startRev);
        if (_uiApply && confirmed) _uiApply(objId, confirmed);
        return;
      }
      // появились новые правки: базу двигаем на подтверждённое, НОВЫЙ локальный ввод сохраняем,
      // следующая итерация отправит дифф подтверждённого против нового local.
      const e = _pendingByObj.get(objId);
      if (e) {
        const nextEntry = { ...e, base: confirmed || e.base, ensure: null };
        _persistEntry(objId, nextEntry);
        _pendingByObj.set(objId, nextEntry);
      }
      continue;
    }
    if (res && res.conflict) {
      // Команда НЕ применима к текущим серверным данным (не сеть): например, правленный элемент
      // удалён с другого устройства. Повтор того же batch зациклился бы — перебазируем.
      const server = (Array.isArray(res.list) ? res.list : []).find(p => p && p.objectId === objId) || null;
      const e = _pendingByObj.get(objId);
      if (!e) return;
      if (!server && !e.ensure) {
        // Карточку удалили на другом устройстве. Не воскрешаем автоматически, но и durable-draft
        // молча не выбрасываем: владелец явно выбирает, какое действие считать истинным.
        const restore = (typeof window !== "undefined" && window.confirm)
          ? window.confirm("Карточка производства удалена на другом устройстве, но здесь остались несохранённые правки.\n\nOK — восстановить карточку с вашими правками.\nОтмена — принять удаление и удалить локальный черновик.")
          : false;
        if (sess !== _sessionN) return;
        if (restore) {
          const rev = (_revByObj.get(objId) || 0) + 1;
          const record = { ...e.local, objectId: objId, updatedAt: Date.now() };
          // КРИТИЧНО: base оставляем прежней подтверждённой версией, а local — восстановленной.
          // Тогда следующий batch несёт И ensureRecord (создать, если карточки правда нет),
          // И реальный diff base→local. Раньше base=local=record давал только create-if-missing:
          // если карточка между проверкой и повтором уже существовала, create становился no-op,
          // черновик удалялся как «успешный», а офлайн-правка терялась.
          const nextEntry = { base: e.base, local: record, rev, ensure: record };
          _revByObj.set(objId, rev);
          _draftByObj.set(objId, record);
          _persistEntry(objId, nextEntry);
          _pendingByObj.set(objId, nextEntry);
          if (_uiApply) _uiApply(objId, record);
          continue;
        }
        _pendingByObj.delete(objId); _draftByObj.delete(objId); _confirmedByObj.delete(objId);
        _removeEntryDraft(objId);
        try { await _cmdFn({ type: "resolve-change", changeId: _changeIdOf(objId) }); } catch { /* без записи в базу */ }
        return;
      }
      if (!server) return; // ensure есть, а конфликт без серверной карточки — оставляем фоновому повтору
      const merged = rebaseLocalProduction(e.base, e.local, server, objId, {
        // Правленный локально элемент удалён с другого устройства — ЯВНЫЙ выбор пользователя,
        // а не молчаливое воскрешение (чужое удаление — тоже данные, терять его молча нельзя).
        onDeletedConflict: (field, item) => {
          const label = item.name || item.text || "элемент";
          const ok = (typeof window !== "undefined" && window.confirm)
            ? window.confirm(`«${label}» удалён с другого устройства, а вы его правили.\n\nOK — восстановить вашу версию.\nОтмена — принять удаление (ваша правка этого элемента будет отброшена).`)
            : true; // без window (не браузер) — по умолчанию ничего не теряем
          return ok ? "restore" : "drop";
        },
      });
      if (sess !== _sessionN) return; // window.confirm мог висеть — перепроверяем сессию
      _confirmedByObj.set(objId, server);
      const rev = (_revByObj.get(objId) || 0) + 1; _revByObj.set(objId, rev);
      const nextEntry = { base: server, local: merged, rev, ensure: null };
      _persistEntry(objId, nextEntry);
      _pendingByObj.set(objId, nextEntry);
      if (_uiApply) _uiApply(objId, merged);
      continue; // следующая итерация отправит перебазированный дифф
    }
    // Сетевая/прочая ошибка: entry остаётся в pending — повтор при следующей правке, фоновом
    // интервале, уходе со страницы или явном «Повторить сейчас» (flushPendingProduction).
    return;
  }
}
// single-flight через Map промисов: пока flush объекта идёт, повторный вызов вернёт ТОТ ЖЕ Promise.
function _flushObj(objId) {
  if (objId == null) return Promise.resolve();
  const running = _flushPromises.get(objId);
  if (running) return running;
  const p = _flushRun(objId).catch(error => {
    console.error("Production flush failed", objId, error);
  }).then(() => { if (_flushPromises.get(objId) === p) _flushPromises.delete(objId); });
  _flushPromises.set(objId, p);
  return p;
}
function _flushAllPending() { for (const objId of Array.from(_pendingByObj.keys())) _flushObj(objId); }

// Начать production-сессию ПОСЛЕ получения editor-lock, но ДО монтирования MainApp.
// Поднимает только черновики этого uid; данные другого пользователя даже не попадают в память.
export function startProductionSession(uid, store = (typeof localStorage !== "undefined" ? localStorage : null)) {
  _sessionN++;
  _pendingByObj.clear(); _flushPromises.clear(); _revByObj.clear(); _confirmedByObj.clear(); _draftByObj.clear();
  _cmdFn = null; _uiApply = null;
  _draftUid = uid == null ? null : String(uid);
  _draftStore = store;
  _draftFailureShown = false;
  if (!_draftUid || !_draftStore) return 0;
  const drafts = listProductionDrafts(_draftStore, _draftUid);
  for (const draft of drafts) {
    const entry = { base: draft.base, local: draft.local, rev: draft.rev, ensure: draft.ensure || null };
    _pendingByObj.set(draft.objectId, entry);
    _revByObj.set(draft.objectId, draft.rev);
    if (draft.ensure) _draftByObj.set(draft.objectId, draft.ensure);
    else _confirmedByObj.set(draft.objectId, draft.base);
  }
  _ensureBgFlush();
  return drafts.length;
}

// Handler задаётся MainApp сразу после создания mutateProductions, поэтому восстановленные после
// reload черновики повторяются даже если пользователь ещё не открыл карточку объекта.
export function setProductionCommandHandler(fn) {
  _cmdFn = typeof fn === "function" ? fn : null;
  if (_cmdFn) {
    _ensureBgFlush();
    if (_pendingByObj.size) _flushAllPending();
  }
}

// Для App («Повторить сейчас», logout): дожать несохранённые правки производства.
// Резолвится, когда ВСЕ flush-циклы реально завершились (включая повторные отправки внутри цикла).
export function flushPendingProduction() {
  return Promise.all(Array.from(_pendingByObj.keys()).map(objId => _flushObj(objId)));
}
// Есть ли несохранённые правки производства (для logout-подтверждения).
export function hasPendingProduction() { return _pendingByObj.size; }
export function productionDraftsAreDurable() {
  if (_pendingByObj.size === 0) return true;
  if (!_draftUid || !_draftStore) return false;
  const saved = new Map(listProductionDrafts(_draftStore, _draftUid).map(d => [d.objectId, d]));
  for (const [objectId, entry] of _pendingByObj) {
    const draft = saved.get(objectId);
    if (!draft || draft.rev < entry.rev) return false;
  }
  return true;
}

// Фоновый повтор + флеш при скрытии/закрытии страницы — на уровне МОДУЛЯ, именованными
// функциями: одна регистрация (guard _bgTimer), ничего не копится при повторных монтированиях,
// pending повторяется даже когда компонент размонтирован (пользователь ушёл из карточки объекта).
let _bgTimer = null;
function _bgTick() { if (_pendingByObj.size && _cmdFn) _flushAllPending(); }
function _bgOnHide() { if (document.visibilityState === "hidden") _bgTick(); }
function _ensureBgFlush() {
  if (_bgTimer != null) return;
  _bgTimer = setInterval(_bgTick, 12000);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", _bgOnHide);
  if (typeof window !== "undefined") { window.addEventListener("beforeunload", _bgTick); window.addEventListener("pagehide", _bgTick); }
}

// ВЫХОД ИЗ АККАУНТА / размонтирование MainApp: ПОЛНАЯ остановка и очистка module-scope
// состояния — иначе очередь, черновики и интервал пережили бы logout, и правка одного
// пользователя могла бы отправиться под другим. ВАЖНО: сама остановка НЕ отправляет ничего —
// дождаться отправки (await flushPendingProduction) и спросить пользователя при неудаче обязан
// ВЫЗЫВАЮЩИЙ (doLogout) ДО вызова. Инкремент _sessionN гарантирует, что запрос, ушедший до
// остановки и ответивший после, не запишет ничего обратно в очищенные Map'ы.
export function stopProductionSession() {
  _sessionN++;
  if (_bgTimer != null) { clearInterval(_bgTimer); _bgTimer = null; }
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", _bgOnHide);
  if (typeof window !== "undefined") { window.removeEventListener("beforeunload", _bgTick); window.removeEventListener("pagehide", _bgTick); }
  _cmdFn = null; _uiApply = null;
  _pendingByObj.clear(); _flushPromises.clear(); _revByObj.clear(); _confirmedByObj.clear(); _draftByObj.clear();
  _draftUid = null; _draftStore = null; _draftFailureShown = false;
}

// ТОЛЬКО ДЛЯ ТЕСТОВ (vitest): доступ к внутренностям очереди. В коде приложения не использовать.
export const __prodQueueTesting = {
  pending: _pendingByObj, confirmed: _confirmedByObj, revs: _revByObj,
  setCmd(fn) { _cmdFn = fn; },
  flushObj: _flushObj,
  persist: _persistEntry,
};

export default function ProductionModule({
  objects, entries = [], allObjects, unlinkedProjects, estimates, contracts, productions,
  productionsLoaded = true, // false, пока productions ещё грузятся — гейт автосоздания карточки
  autoCreate = false, // ТАБУ: авто-создание карточки при открытии объекта — ТОЛЬКО где явно включено (App: dev-база)
  onDeleteProduction, onToggleClientShare, onSetClientVis, buildStagesFromEstimate,
  finProjects, financeTx,
  fmt, genId, currentUser, readOnly: externallyReadOnly = false, onAudit,
  staffOptions = [], // сотрудники системы для выбора ответственного (свободный ввод убран)
  actionPermissions = {},
  embedObjectId, embedTab, clientInfoCard, // встроенный режим: карточка одного объекта внутри раздела «Объекты»
}) {
  // карта запись производства по ключу записи (objectId реального объекта или "fp:<id>")
  const entryByKey = useMemo(() => { const m = {}; for (const e of entries) m[e.key] = e; return m; }, [entries]);
  // Модуль используется только во встроенном режиме — карточкой объекта в «Объектах»
  // (единственный вызов, всегда с embedObjectId). Отдельного списка/своей карточки-с-
  // вкладками больше нет — это раньше был неиспользуемый параллельный экран.
  const activeId = embedObjectId;

  const prodByObj = useMemo(() => {
    const m = {};
    for (const p of (productions || [])) m[p.objectId] = p;
    return m;
  }, [productions]);

  // Объект может быть реальным (из objects) либо "виртуальным" — из карточки производства,
  // созданной по проекту Финансов (objectId начинается с "fp:").
  const openObj = activeId ? (
    (allObjects || objects).find(o => o.id === activeId) ||
    (() => { const e = entryByKey[activeId]; if (e) return { id: activeId, clientName: e.name || "Проект", address: e.address || "", clientPhone: "" }; const pr = prodByObj[activeId]; return pr ? { id: activeId, clientName: pr.title || "Проект", address: pr.address || "", clientPhone: "" } : null; })()
  ) : null;
  // ЕДИНЫЙ draft новой карточки: он же openProd в UI, он же record команды создания — ОДНИ и те
  // же id этапов/чек-листов. Раньше UI показывал один emptyProduction, а в Firebase создавался
  // ДРУГОЙ (со своими random id) — быстрая правка чек-листа слала patch-item по UI-id, которого
  // на сервере нет → no-item навсегда. Черновик стабилен по objectId (module-scope Map).
  const getDraft = (objId) => {
    let d = _draftByObj.get(objId);
    if (!d) {
      const fromEst = buildStagesFromEstimate(objId);
      d = { ...emptyProduction(objId, genId), stages: fromEst.length ? estToStages(fromEst, genId) : [], updatedAt: Date.now() };
      _draftByObj.set(objId, d);
    }
    return d;
  };
  // Мемоизируем: без useMemo новая identity openProd на каждый рендер зацикливала эффект
  // синхронизации локального состояния.
  const openProd = useMemo(() => {
    if (!openObj) return null;
    const raw = prodByObj[openObj.id] || _confirmedByObj.get(openObj.id) || getDraft(openObj.id);
    // Только локальная форма: старые элементы получают детерминированные id для UI, но в Firebase
    // это попадёт лишь при явном редактировании карточки через normalize-card-ids в том же batch.
    return normalizeProductionIds([raw]).list[0] || raw;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodByObj, openObj?.id]);

  // АВТОЗАПОЛНЕНИЕ: при первом открытии объекта без карточки — создание через pending-очередь
  // (стабильный changeId, повтор до подтверждения; раньше одноразовый неудачный create просто
  // терялся). Только когда productions ЗАГРУЖЕНЫ — иначе можно завести draft для объекта,
  // у которого карточка на сервере уже есть. ТАБУ: на боевой autoCreate выключен (открытие
  // объекта — не «явное действие с данными»); первое РЕАЛЬНОЕ редактирование (patchProd)
  // создаст карточку и там — это уже явное действие владельца.
  useEffect(() => {
    if (!openObj || !productionsLoaded || !autoCreate) return;
    if (currentUser?.role === "viewer") return; // viewer не создаёт карточку даже на dev
    const objId = openObj.id;
    if (prodByObj[objId] || _confirmedByObj.get(objId)) return; // карточка уже есть — не трогаем
    if (_pendingByObj.has(objId)) return; // создание/правки уже в очереди
    const draft = getDraft(objId);
    const rev = (_revByObj.get(objId) || 0) + 1; _revByObj.set(objId, rev);
    const entry = { base: draft, local: draft, rev, ensure: draft };
    _persistEntry(objId, entry);
    _pendingByObj.set(objId, entry);
    _flushObj(objId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, productionsLoaded, autoCreate]);

  // ── СОХРАНЕНИЕ ПРОИЗВОДСТВА (per-object, single-flight, versioned; очередь — module-scope) ──
  // patch() применяется МГНОВЕННО (инстант UI); в облако уходит ОДИН batch на пользовательское
  // сохранение (все команды диффа целиком в одной транзакции). Сама очередь и flush — на уровне
  // модуля (_pendingByObj/_flushObj выше): переживают размонтирование компонента. Здесь — только
  // привязка к UI: локальное состояние открытой карточки, дебаунс, восстановление при открытии.
  const initialLocal = () => {
    const key = openObj?.id;
    const draft = key != null ? _pendingByObj.get(key) : null;
    return draft ? draft.local : openProd; // монтирование: несохранённые правки прошлого визита — восстанавливаем
  };
  const [localProd, setLocalProd] = useState(initialLocal);
  const localProdRef = useRef(localProd);
  const openKeyRef = useRef(openObj?.id);
  const saveTimerRef = useRef(null);
  // База диффа: свежайшее из подтверждённого транзакцией (_confirmedByObj) и props (подписка).
  // props могут ЗАПАЗДЫВАТЬ после commit'а — дифф от устаревшей базы заново отправил бы старые
  // значения и затёр правку другого устройства (репро аудитора: note D → снова B).
  const bestBaseOf = (objId) => {
    const conf = _confirmedByObj.get(objId);
    const srv = prodByObj[objId] || null;
    if (conf && srv) return (Number(conf.updatedAt) || 0) >= (Number(srv.updatedAt) || 0) ? conf : srv;
    return conf || srv || null;
  };

  // Регистрация UI-моста для module-scope flush (обновить открытую карточку после подтверждения).
  useEffect(() => {
    _uiApply = (objId, card) => { if (objId === openKeyRef.current && card) { localProdRef.current = card; setLocalProd(card); } };
    return () => { _uiApply = null; };
  }, []);

  // Фоновый повтор/unload-флеш регистрируются на уровне модуля ОДИН раз (_ensureBgFlush) —
  // ничего не копится при повторных монтированиях и работает даже после размонтирования.
  useEffect(() => {
    _ensureBgFlush();
    if (_pendingByObj.size) _flushAllPending(); // хвост прошлого визита — досылаем сразу
    return () => { _flushAllPending(); };       // размонтирование: попытка сразу; очередь живёт дальше
  }, []);

  // Переключение объекта / обновление из props.
  useEffect(() => {
    const key = openObj?.id;
    const objChanged = key !== openKeyRef.current;
    if (objChanged) {
      openKeyRef.current = key;
      // предыдущий объект: его pending уже в _pendingByObj — досылаем (не теряем при переключении)
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      if (_pendingByObj.size) _flushAllPending();
      // новый объект: восстанавливаем несохранённые правки, если есть, иначе — серверное состояние
      const draft = key != null ? _pendingByObj.get(key) : null;
      const nextLocal = draft ? draft.local : openProd;
      localProdRef.current = nextLocal; setLocalProd(nextLocal);
      return;
    }
    // серверное обновление текущего объекта: подхватываем ТОЛЬКО если нет несохранённых правок
    // (иначе затёрли бы ввод). Если props отстают от только что подтверждённого — берём подтверждённое.
    if (key != null && !_pendingByObj.has(key)) {
      const conf = _confirmedByObj.get(key);
      const src = conf && openProd && (Number(conf.updatedAt) || 0) > (Number(openProd.updatedAt) || 0) ? conf : openProd;
      localProdRef.current = src; setLocalProd(src);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openProd, openObj?.id]);

  // Роль viewer — ТОЛЬКО чтение: жёсткий запрет на уровне данных (не только визуальный) —
  // без него наблюдатель мог бы менять карточку или создать её первым же редактированием.
  const baseReadOnly = externallyReadOnly || currentUser?.role === "viewer";
  const mainReadOnly = baseReadOnly || actionPermissions.edit === false;
  const stagesReadOnly = baseReadOnly || actionPermissions.stages === false;
  const qualityReadOnly = baseReadOnly || actionPermissions.quality === false;
  const clientAccessReadOnly = baseReadOnly || actionPermissions.clientAccess === false;
  const tabReadOnly = ["stages", "today"].includes(embedTab)
    ? stagesReadOnly
    : embedTab === "control"
      ? stagesReadOnly
    : ["launch", "handover", "journal", "defects"].includes(embedTab)
      ? qualityReadOnly
      : mainReadOnly;
  const patchProd = (patch, allowed = true) => {
    if (baseReadOnly || !allowed) return; // запрет записи обязателен именно на уровне данных
    const objId = openObj && openObj.id;
    if (objId == null) return;
    const next = { ...localProdRef.current, ...patch, updatedAt: Date.now() };
    const prevEntry = _pendingByObj.get(objId);
    const known = bestBaseOf(objId); // подтверждённая серверная база (если карточка уже существует)
    const base = prevEntry ? prevEntry.base : (known || getDraft(objId));
    const ensure = prevEntry ? prevEntry.ensure : (known ? null : getDraft(objId));
    const rev = (_revByObj.get(objId) || 0) + 1;
    _revByObj.set(objId, rev);
    const entry = { base, local: next, rev, ensure };
    // Сначала синхронный durable draft, затем UI/память: crash после отображения правки не должен
    // оставлять её только в React-state.
    _persistEntry(objId, entry);
    _pendingByObj.set(objId, entry);
    localProdRef.current = next; setLocalProd(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => _flushObj(objId), 600);
  };
  const mainPatch = (patch) => patchProd(patch, !mainReadOnly);
  const stagesPatch = (patch) => patchProd(patch, !stagesReadOnly);
  const qualityPatch = (patch) => patchProd(patch, !qualityReadOnly);
  const clientAccessPatch = (patch) => patchProd(patch, !clientAccessReadOnly);
  const handleTodayStageStatus = (stageId, status) => {
    const current = localProdRef.current;
    const stages = (current?.stages || []).map(stage => (
      stage?.id === stageId ? updateStageStatus(stage, status, localDateKey()) : stage
    ));
    stagesPatch({ stages });
  };
  const handleCloseDay = (report) => {
    const current = localProdRef.current;
    stagesPatch({
      dailyReports: upsertDailyReport(current?.dailyReports || [], report, Date.now()),
    });
  };

  // Данные из Финансов для текущего объекта — ДОЛЖНЫ быть до if(!openObj), иначе нарушение Rules of Hooks
  const finProj = useMemo(() => {
    return findFinanceProjectForObject(openObj, contracts, finProjects);
  }, [openObj, finProjects, contracts]);

  const finSummary = useMemo(() => {
    if (!openObj) return null;
    const objectContracts = (contracts || []).filter(c => c && !c.deletedAt && c.objectId === openObj.id
      && c.type !== "podryad" && c.type !== "podryad_annex");
    const projectNo = normCN(finProj?.contractNo);
    const mainContracts = objectContracts.filter(c => c.type !== "annex" && c.type !== "design_add");
    const main = mainContracts.find(c => projectNo && normCN(c.number) === projectNo)
      || mainContracts.find(c => c.type === "repair_fiz" || c.type === "repair_yur")
      || mainContracts[0]
      || null;
    const mainNo = normCN(main?.number);
    const annexes = mainNo
      ? objectContracts.filter(c => (c.type === "annex" || c.type === "design_add") && normCN(c.mainNumber) === mainNo)
      : [];
    const worksTotal = c => (c?.works || []).reduce((sum, work) => sum
      + (Number(work.quantity) || 0) * (Number(work.price) || 0), 0);
    const contractBudget = main ? worksTotal(main) + annexes.reduce((sum, c) => sum + worksTotal(c), 0) : 0;
    const estimatePlan = estimatesForObject(estimates, openObj.id).reduce((sum, estimate) => sum + (Number(estimate.total) || 0), 0);

    if (!finProj && !main && estimatePlan <= 0) return null;
    const txNumbers = new Set([finProj?.contractNo, main?.number, ...annexes.map(c => c.number)].map(normCN).filter(Boolean));
    const txList = (financeTx||[]).filter(t => !t.deletedAt && t.included !== false && txNumbers.has(normCN(t.contractNo)));
    const income = txList.filter(t => t.type === "income").reduce((s,t) => s+(Number(t.amount)||0), 0);
    const expense = txList.filter(t => t.type === "expense").reduce((s,t) => s+(Number(t.amount)||0), 0);
    // Для карточки объекта договор и допсоглашения — источник правды. Сохранённый
    // бюджет финпроекта нужен только как fallback для импортированных проектов без договора.
    const budget = contractBudget || Number(finProj?.budget) || estimatePlan || 0;
    const debt = Math.max(0, budget - income);
    const margin = income > 0 ? Math.round((income - expense) / income * 100) : null;
    return {
      budget, estimatePlan, income, expense, debt, margin,
      contractNo: main?.number || finProj?.contractNo,
      status: finProj?.rawStatus || finProj?.status,
      hasProject: !!finProj,
    };
  }, [openObj, finProj, financeTx, contracts, estimates]);

  // Единственный вызов этого компонента (App.jsx) всегда встроенный (embedObjectId задан) —
  // отдельного списка объектов и своей карточки-с-вкладками больше нет. Раньше здесь был
  // недостижимый параллельный экран (~260 строк): свой список производства, добавление
  // объекта вручную, финансовая сводка по каждой карточке — БЕЗ проверки роли (в отличие
  // от вкладки «Финансы» в карточке объекта). Кода не было видно ни разу, потому что сюда
  // никто не попадал, но при случайном повторном использовании компонента без embedObjectId
  // он бы показал бюджет/долг/маржу кому угодно. Убран целиком вместе с мёртвым списком.
  if (!openObj || !openProd) return <div style={{ color: "#94a3b8", fontSize: 13, padding: "16px 4px" }}>Нет данных производства.</div>;
  const _objLbl = openObj.clientName || openObj.address || "Объект";
  // try/catch: журнал не должен мешать сохранению производственных данных
  const audit = (ev) => { try { if (onAudit) onAudit({ objectId: openObj.id, label: _objLbl, source: "manual", ...ev }); } catch (e) { console.warn("audit failed", e); } };
  return (
    <div style={{ maxWidth: 1600, margin: "0 auto" }}>
      {embedTab !== "control" && (tabReadOnly || (embedTab === "info" && clientAccessReadOnly)) && <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px", fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>👁 Режим просмотра — часть действий недоступна для вашей роли.</div>}
      {embedTab === "info" && <InfoTab prod={localProd} obj={openObj} estimates={estimates} contracts={contracts} fmt={fmt} patch={mainPatch} clientAccessPatch={clientAccessPatch} onToggleClientShare={onToggleClientShare} onSetClientVis={onSetClientVis} currentUser={currentUser} clientInfoCard={clientInfoCard} audit={audit} readOnly={mainReadOnly} clientAccessReadOnly={clientAccessReadOnly} staffOptions={staffOptions} />}
      {embedTab === "control" && <ObjectControlModule mode="control" object={openObj} production={localProd} currentUser={currentUser} readOnly={stagesReadOnly} onPatchProduction={stagesPatch} />}
      {embedTab === "today" && <ObjectControlModule mode="today" object={openObj} production={localProd} currentUser={currentUser} readOnly={stagesReadOnly} onStageStatus={handleTodayStageStatus} onCloseDay={handleCloseDay} onPatchProduction={stagesPatch} />}
      {!["info", "control", "today"].includes(embedTab) && <fieldset disabled={tabReadOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      {embedTab === "launch" && <ChecklistTab kind="checklistLaunch" prod={localProd} patch={qualityPatch} genId={genId} title="Чек-лист запуска объекта" />}
      {embedTab === "handover" && <ChecklistTab kind="checklistHandover" prod={localProd} patch={qualityPatch} genId={genId} title="Чек-лист сдачи объекта" />}
      {embedTab === "stages" && <StagesTab prod={localProd} patch={stagesPatch} genId={genId} fmt={fmt} buildStagesFromEstimate={buildStagesFromEstimate} objId={openObj.id} audit={audit} />}
      {embedTab === "finance" && <FinanceTab prod={localProd} patch={mainPatch} fmt={fmt} finSummary={finSummary} />}
      {embedTab === "journal" && <JournalTab prod={localProd} patch={qualityPatch} genId={genId} currentUser={currentUser} />}
      {embedTab === "defects" && <DefectsTab prod={localProd} patch={qualityPatch} genId={genId} currentUser={currentUser} />}
      </fieldset>}
    </div>
  );
}

// ─── ВКЛАДКА: ИНФОРМАЦИЯ ───
const _dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
// Телефон → формат для wa.me (КЗ: 8XXXXXXXXXX → 7XXXXXXXXXX)
const _waPhone = (p) => { let d = (p || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1); else if (d.length === 10) d = "7" + d; return d; };
function InfoTab({ prod, obj, estimates, contracts, fmt, patch, clientAccessPatch, onToggleClientShare, onSetClientVis, currentUser, clientInfoCard, audit, readOnly=false, clientAccessReadOnly=false, staffOptions=[] }) {
  const objEstimates = estimates.filter(e => e.objectId === obj.id);
  // Только клиентские договоры: подряд (с рабочим) — это себестоимость, в метрику «Договоры» не входит
  const objContracts = contracts.filter(c => c.objectId === obj.id && !c.deletedAt && c.type !== "podryad" && c.type !== "podryad_annex");
  const totalEst = objEstimates.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const totalCon = objContracts.reduce((s, c) => s + (c.works || []).reduce((ss, w) => ss + (Number(w.quantity) || 0) * (Number(w.price) || 0), 0), 0);
  const stages = prod.stages || [];
  const doneStages = stages.filter(s => s.status === "done").length;
  const stageProg = stages.length ? Math.round(doneStages / stages.length * 100) : 0;
  const launch = prod.checklistLaunch || [];
  const launchDone = launch.filter(i => i.done).length;
  // Дней в работе: от даты старта до факта сдачи (или до сегодня, если ещё в работе)
  const daysInWork = prod.startDate ? Math.max(0, Math.round((_dayStart(prod.factEndDate || new Date()) - _dayStart(prod.startDate)) / 864e5)) : null;
  // Срок: сдан / до плановой сдачи / просрочка
  let deadline = { text: "—", color: "#94a3b8", sub: "срок не задан" };
  if (prod.factEndDate) deadline = { text: "Сдан ✓", color: "#059669", sub: new Date(prod.factEndDate).toLocaleDateString("ru-RU") };
  else if (prod.planEndDate) {
    const left = Math.round((_dayStart(prod.planEndDate) - _dayStart(new Date())) / 864e5);
    if (left < 0) deadline = { text: (-left) + " дн", color: "#dc2626", sub: "просрочка" };
    else if (left === 0) deadline = { text: "Сегодня", color: "#d97706", sub: "плановая сдача" };
    else deadline = { text: left + " дн", color: "#2563eb", sub: "до плановой сдачи" };
  }
  // Напоминания / просрочки
  const todayMs = _dayStart(new Date());
  const alerts = [];
  if (!prod.factEndDate && prod.planEndDate && _dayStart(prod.planEndDate) < todayMs)
    alerts.push("Плановая сдача просрочена на " + Math.round((todayMs - _dayStart(prod.planEndDate)) / 864e5) + " дн");
  stages.forEach(s => {
    if (s.status !== "done" && s.planEnd && _dayStart(s.planEnd) < todayMs)
      alerts.push("Этап «" + (s.name || "без названия") + "» просрочен на " + Math.round((todayMs - _dayStart(s.planEnd)) / 864e5) + " дн");
  });
  if (!prod.factEndDate && prod.planEndDate) {
    const lt = Math.round((_dayStart(prod.planEndDate) - todayMs) / 864e5);
    if (lt >= 0 && lt <= 3) alerts.push("Плановая сдача " + (lt === 0 ? "сегодня" : ("через " + lt + " дн")));
  }
  const cBtn = { display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
  const _fldFocus = useRef("");
  const _fmtFld = (type, v) => type === "date" ? (v ? new Date(v).toLocaleDateString("ru-RU") : "—") : (v || "—");
  // auditLabel задаётся только для значимых полей (прораб/сроки) — тогда на blur пишем «было→стало»
  const fld = (label, key, type = "text", auditLabel = null) => (
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <input type={type} value={prod[key] || ""}
        onFocus={e => { _fldFocus.current = e.target.value; }}
        onChange={e => patch({ [key]: e.target.value })}
        onBlur={e => { if (auditLabel && audit && e.target.value !== _fldFocus.current) audit({ entity: "object", field: auditLabel, action: "изменил", old: _fmtFld(type, _fldFocus.current), new: _fmtFld(type, e.target.value) }); }}
        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
  // Выбор ответственного — только из сотрудников системы. Свободный ввод убран намеренно:
  // раньше сюда попадал произвольный текст, и один человек существовал в базе в нескольких
  // написаниях («Сергей Штанько» / «Сергей Ш.» / «Сергей Ш»), что ломало разрезы по ответственным.
  // Значение, которого нет в списке (уволенный, старая запись), показываем отдельным пунктом —
  // чтобы открытие карточки не затирало то, что уже записано.
  const fldStaff = (label, key, auditLabel = null) => {
    const current = prod[key] || "";
    const known = (staffOptions || []).map(u => (typeof u === "string" ? u : u?.name)).filter(Boolean);
    return (
      <div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
        <select value={current} disabled={readOnly}
          onChange={e => {
            const next = e.target.value;
            if (next === current) return;
            patch({ [key]: next });
            if (auditLabel && audit) audit({ entity: "object", field: auditLabel, action: "изменил", old: current || "—", new: next || "—" });
          }}
          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13,
                   fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: readOnly ? "#f8fafc" : "#fff" }}>
          <option value="">— не назначен —</option>
          {known.map(name => <option key={name} value={name}>{name}</option>)}
          {current && !known.includes(current) && <option value={current}>{current} (нет в сотрудниках)</option>}
        </select>
      </div>
    );
  };
  const Metric = ({ label, value, sub, color = "#0f172a" }) => (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "13px 15px", minHeight: 86, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 10.5, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".03em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1, overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Напоминания / просрочки */}
      {alerts.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 15px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626", marginBottom: 6 }}>⚠ Требует внимания</div>
          {alerts.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: "#b91c1c", padding: "2px 0" }}>• {a}</div>)}
        </div>
      )}
      {/* Ключевые метрики */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))", gap: 12 }}>
        <Metric label="Дней в работе" value={daysInWork == null ? "—" : daysInWork} sub={daysInWork == null ? "не начато" : (prod.factEndDate ? "по факту сдачи" : "идёт сейчас")} color="#2563eb" />
        <Metric label="Срок" value={deadline.text} sub={deadline.sub} color={deadline.color} />
        <Metric label="Работы" value={stages.length ? `${doneStages} / ${stages.length}` : "—"} sub={stages.length ? `выполнено ${stageProg}%` : "нет работ"} color="#059669" />
        <Metric label="Запуск объекта" value={launch.length ? `${launchDone} / ${launch.length}` : "—"} sub="чек-лист запуска" color="#7c3aed" />
        <Metric label="Сумма смет" value={`${fmt(totalEst)} ₸`} sub={`${objEstimates.length} смет(ы)`} />
        <Metric label="Договоры" value={totalCon ? `${fmt(totalCon)} ₸` : (objContracts.length || "—")} sub={`${objContracts.length} шт`} />
      </div>
      {/* Прогресс по работам */}
      {stages.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 7 }}><span style={{ fontWeight: 600 }}>Прогресс по работам</span><span style={{ fontWeight: 800, color: "#059669" }}>{stageProg}%</span></div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" }}><div style={{ width: stageProg + "%", height: "100%", background: "#059669", borderRadius: 5, transition: "width .3s" }} /></div>
        </div>
      )}
      {/* Клиент и объект — статус уже выбирается тут, поэтому в «Производственной информации» ниже статус-кнопки не дублируются */}
      {clientInfoCard}
      <fieldset disabled={readOnly} style={{border:"none",margin:0,padding:0,minWidth:0,display:"contents"}}>
      {/* Производственные поля */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Производственная информация</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {fldStaff("Ответственный прораб / менеджер", "responsible", "прораб")}
          {fld("Доступ (ключ, код, пропуск)", "access")}
          {fld("Дата продажи (подписание договора)", "saleDate", "date")}
          {fld("Дата начала работ", "startDate", "date", "старт работ")}
          {fld("Плановая дата окончания", "planEndDate", "date", "план сдачи")}
          {fld("Фактическая дата окончания", "factEndDate", "date", "факт сдачи")}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Примечания / особенности</div>
          <textarea value={prod.note || ""} onChange={e => patch({ note: e.target.value })} rows={2}
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        </div>
      </div>

      {/* Связь в один тап */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10.5, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".03em", fontWeight: 700 }}>Связь</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {obj.clientPhone ? (<>
            <a href={"tel:" + obj.clientPhone} style={{ ...cBtn, background: "#eff6ff", color: "#2563eb" }}>📞 Позвонить</a>
            <a href={"https://wa.me/" + _waPhone(obj.clientPhone)} target="_blank" rel="noopener" style={{ ...cBtn, background: "#25D366", color: "#fff" }}>📲 WhatsApp клиенту</a>
          </>) : <span style={{ fontSize: 12, color: "#94a3b8" }}>Телефон клиента не указан</span>}
          {prod.waGroup && <a href={prod.waGroup} target="_blank" rel="noopener" style={{ ...cBtn, background: "#f0fdf4", color: "#059669", border: "1px solid #bbf7d0" }}>🔗 Рабочая группа</a>}
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Ссылка на рабочую группу WhatsApp</div>
          <input value={prod.waGroup || ""} onChange={e => patch({ waGroup: e.target.value })} placeholder="https://chat.whatsapp.com/…"
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>
      </fieldset>

      {/* Клиент: доступ к прогрессу + сообщение */}
      <ClientAccessBlock obj={obj} prod={prod} patch={clientAccessPatch} onToggleClientShare={onToggleClientShare} onSetClientVis={onSetClientVis} currentUser={currentUser} readOnly={clientAccessReadOnly} />
    </div>
  );
}

// ─── Блок «Клиент»: доступ к прогрессу + сообщение (внизу вкладки «Информация») ───
function ClientAccessBlock({ obj, prod, patch, onToggleClientShare, onSetClientVis, currentUser, readOnly=false }) {
  const [shareLink, setShareLink] = useState(null); // ссылка для клиента после включения доступа
  const [shareBusy, setShareBusy] = useState(false);
  if (currentUser?.role === "viewer") return null;
  const shared = !!(obj.progressShared && obj.progressToken);
  const realUrl = shared ? (window.location.origin + window.location.pathname + "#/progress/" + obj.progressToken) : null;
  const url = realUrl || shareLink;
  const cv = obj.clientVis || {};
  const visRows = [["stages","Этапы работ"],["payments","Оплата по договору"],["docs","Документы"],["remarks","Замечания клиента"]];
  return (
    <fieldset disabled={readOnly} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11, margin:0, minWidth:0 }}>
      {onToggleClientShare && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>👁 Доступ клиента к прогрессу{shared && <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}> · открыт</span>}
              {shared && obj.progressExpiresAt && <span style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 500 }}> (до {new Date(obj.progressExpiresAt).toLocaleDateString("ru-RU")})</span>}
            </div>
            <button disabled={shareBusy} onClick={async () => { setShareBusy(true); const link = await onToggleClientShare(obj.id); setShareLink(link); setShareBusy(false); }}
              style={{ background: shared ? "rgba(220,38,38,.08)" : "#ecfdf5", color: shared ? "#dc2626" : "#059669", border: "1px solid " + (shared ? "rgba(220,38,38,.2)" : "rgba(5,150,105,.25)"), borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: shareBusy ? "default" : "pointer", opacity: shareBusy ? .6 : 1, fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {shared ? "Закрыть доступ" : "Открыть доступ клиенту"}
            </button>
          </div>
          {(shared || shareLink) && url && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input readOnly value={url} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 180, border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px 9px", fontSize: 11.5, fontFamily: "inherit", color: "#0f172a", background: "#f8fafc" }} />
              <button onClick={() => { try { navigator.clipboard.writeText(url); } catch {} }} style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid rgba(37,99,235,.2)", borderRadius: 6, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Копировать</button>
              <a href={"https://wa.me/?text=" + encodeURIComponent("Прогресс вашего ремонта: " + url)} target="_blank" rel="noopener" style={{ background: "#25D366", color: "#fff", textDecoration: "none", padding: "7px 11px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>WhatsApp</a>
            </div>
          )}
          <div style={{ fontSize: 10.5, color: "#94a3b8" }}>Клиент видит только то, что отмечено ниже. Себестоимость, маржа и подрядчики скрыты всегда.</div>
          {/* Настройки видимости — что показывать клиенту (по умолчанию всё включено) */}
          {onSetClientVis && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
              {visRows.map(([key, label]) => {
                const on = cv[key] !== false;
                return (
                  <button key={key} onClick={() => onSetClientVis(obj.id, { [key]: !on })}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: on ? "#ecfdf5" : "#f1f5f9", color: on ? "#059669" : "#94a3b8", border: "1px solid " + (on ? "rgba(5,150,105,.25)" : "#e2e8f0"), borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    <span>{on ? "☑" : "☐"}</span>{label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {onToggleClientShare && <div style={{ borderTop: "1px solid #f1f5f9" }} />}
      {/* Сообщение клиенту — общий комментарий от компании на странице прогресса */}
      <ClientMessageCard prod={prod} patch={patch} embedded />
    </fieldset>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

// ─── ВКЛАДКА: ЧЕК-ЛИСТ (запуск / сдача) с разделами ───
function ChecklistTab({ kind, prod, patch, genId, title }) {
  const items = prod[kind] || [];
  const [newText, setNewText] = useState("");
  const upd = (id, p) => patch({ [kind]: items.map(it => it.id === id ? { ...it, ...p } : it) });
  const add = (section = "") => { if (!newText.trim()) return; patch({ [kind]: [...items, { id: genId(), text: newText.trim(), section, done: false, responsible: "", note: "" }] }); setNewText(""); };
  const doneCount = items.filter(i => i.done).length;
  // Группируем по разделам с сохранением порядка появления
  const groups = []; const gmap = {};
  items.forEach(it => { const s = it.section || ""; if (!(s in gmap)) { gmap[s] = []; groups.push(s); } gmap[s].push(it); });
  const Row = (it) => (
    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid #f1f5f9" }}>
      <input type="checkbox" checked={!!it.done} onChange={e => upd(it.id, { done: e.target.checked })} style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }} />
      <input value={it.text} onChange={e => upd(it.id, { text: e.target.value })}
        style={{ flex: 1, border: "none", fontSize: 13, fontFamily: "inherit", outline: "none", color: it.done ? "#94a3b8" : "#0f172a", textDecoration: it.done ? "line-through" : "none", background: "transparent", minWidth: 0 }} />
      <input value={it.responsible || ""} onChange={e => upd(it.id, { responsible: e.target.value })} placeholder="Кто"
        style={{ width: 110, border: "1px solid #f1f5f9", borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", flexShrink: 0 }} />
    </div>
  );
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: doneCount === items.length && items.length ? "#059669" : "#2563eb" }}>{doneCount} / {items.length}</div>
      </div>
      {items.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: "18px 0", fontSize: 13 }}>Чек-лист пуст. Добавьте пункты ниже.</div>}
      {groups.map(sec => (
        <div key={sec || "_"} style={{ marginBottom: sec ? 14 : 0 }}>
          {sec && <div style={{ fontSize: 11, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em", margin: "8px 0 4px" }}>{sec}</div>}
          {gmap[sec].map(Row)}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => e.key === "Enter" && add(groups.length ? groups[groups.length - 1] : "")} placeholder="Добавить пункт…"
          style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button onClick={() => add(groups.length ? groups[groups.length - 1] : "")} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Добавить</button>
      </div>
    </div>
  );
}

// ─── Сообщение клиенту (общий комментарий от компании на странице прогресса) ───
// Свёрнут по умолчанию, чтобы не занимать место над вкладками; разворачивается по кнопке.
function ClientMessageCard({ prod, patch, embedded = false }) {
  const saved = prod.clientMessage && typeof prod.clientMessage === "object" ? prod.clientMessage : null;
  const savedText = saved ? (saved.text || "") : (typeof prod.clientMessage === "string" ? prod.clientMessage : "");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(savedText);
  // Сброс поля при переключении объекта
  useEffect(() => { setText(savedText); setOpen(false); }, [prod.objectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = text.trim() !== savedText.trim();
  const save = () => {
    const t = text.trim();
    patch({ clientMessage: t ? { text: t, updatedAt: Date.now() } : null });
    setOpen(false);
  };
  const clear = () => { setText(""); patch({ clientMessage: null }); setOpen(false); };
  // В embedded-режиме карточка встроена в родительскую — без своей рамки/фона/отступов
  const wrap = embedded
    ? { background: "transparent", border: "none", borderRadius: 0, padding: 0, marginBottom: 0 }
    : { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", marginBottom: 14 };

  // Свёрнутый вид — компактная строка с превью
  if (!open) {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>💬</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Сообщение клиенту{savedText && <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}> · опубликовано</span>}</div>
          <div style={{ fontSize: 12, color: savedText ? "#64748b" : "#94a3b8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{savedText || "нет сообщения — клиент его не видит"}</div>
        </div>
        <button onClick={() => setOpen(true)} style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid rgba(37,99,235,.2)", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>{savedText ? "Изменить" : "Написать"}</button>
      </div>
    );
  }
  // Развёрнутый вид — редактор
  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>💬 Сообщение клиенту</div>
        {saved?.updatedAt && <span style={{ fontSize: 11, color: "#94a3b8" }}>обновлено {new Date(saved.updatedAt).toLocaleDateString("ru-RU")}</span>}
      </div>
      <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Например: На этой неделе закончили черновую электрику, начинаем штукатурку. Плитку привезут в пятницу…"
        style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={save} disabled={!dirty}
          style={{ background: dirty ? "#2563eb" : "#e2e8f0", color: dirty ? "#fff" : "#94a3b8", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12.5, fontWeight: 700, cursor: dirty ? "pointer" : "default", fontFamily: "inherit" }}>
          {savedText ? "Обновить сообщение" : "Опубликовать клиенту"}
        </button>
        <button onClick={() => { setText(savedText); setOpen(false); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Свернуть</button>
        {savedText && <button onClick={clear} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0, marginLeft: "auto" }}>Убрать</button>}
      </div>
      <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 8 }}>Появится отдельным блоком вверху страницы клиента. Обновляется у клиента в течение минуты или по кнопке «Обновить».</div>
    </div>
  );
}

// ─── ВКЛАДКА: ЭТАПЫ И СРОКИ ───
function StagesTab({ prod, patch, genId, fmt, buildStagesFromEstimate, objId, audit }) {
  const stages = prod.stages || [];
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const upd = (id, p) => patch({ stages: stages.map(s => s.id === id ? { ...s, ...p } : s) });
  // Журнал изменений этапа (прораб/срок) — пишем на blur, только если значение реально изменилось
  const _stFocus = useRef("");
  const _fmtDate = (v) => v ? new Date(v).toLocaleDateString("ru-RU") : "—";
  const auditStage = (stage, field, oldV, newV) => { if (audit && oldV !== newV) audit({ entity: "stage", field, action: "изменил", old: oldV || "—", new: newV || "—", detail: `этап: ${stage.name || "без названия"}` }); };
  const addManual = () => {
    if (!newName.trim()) return;
    patch({ stages: [...stages, { id: genId(), cat: newCat.trim() || "Прочее", name: newName.trim(), unit: "", qty: 0, planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo", responsible: "", note: "", paid: false, priceClient: 0, costPlan: 0 }] });
    setNewName("");
  };
  // Этапы синхронизируются со сметами АВТОМАТИЧЕСКИ (эффект в App.jsx по [estimates]):
  // позиции из смет сами добавляются/обновляются/удаляются (флаг fromEst), ручные этапы не трогаются.
  // Поэтому ручной кнопки «Обновить из смет» больше нет.
  const inWorkDays = (s) => s.factStart ? Math.max(0, Math.round((_dayStart(s.factEnd || new Date()) - _dayStart(s.factStart)) / 864e5)) + 1 : null;
  const dInp = { border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", outline: "none", color: "#0f172a", width: "100%", boxSizing: "border-box" };

  // График (Гантт)
  const dates = stages.flatMap(s => [s.planStart, s.planEnd, s.factStart, s.factEnd]).filter(Boolean).map(d => new Date(d).getTime());
  const ganttStages = stages.filter(s => s.name && (s.planStart || s.factStart));
  const todayMs = _dayStart(new Date());
  const allDates = dates.length ? [...dates, todayMs] : [];
  const minD = allDates.length ? Math.min(...allDates) : 0;
  const maxD = allDates.length ? Math.max(...allDates) : 0;
  const span = maxD - minD || 1;
  const fmtD = (ts) => new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const pctOf = (ts) => ((ts - minD) / span) * 100;
  const todayPct = (todayMs >= minD && todayMs <= maxD) ? pctOf(todayMs) : null;
  const bar = (start, end, color, top, h) => {
    if (!start || !end) return null;
    const s = new Date(start).getTime(), e = new Date(end).getTime();
    return <div title={`${fmtD(s)} – ${fmtD(e)}`} style={{ position: "absolute", left: `${pctOf(s)}%`, width: `${Math.max(1.5, ((e - s) / span) * 100)}%`, height: h, borderRadius: 4, background: color, top }} />;
  };
  // ПОРЯДОК ЭТАПОВ: порядок массива дифф НЕ отслеживает (сравнение по id), поэтому храним явное
  // числовое поле order на этапе — его изменение дифф ловит как обычную правку поля (patch-item)
  // и сохраняет в облако. Сортируем по order (у кого нет — по текущей позиции в массиве, стабильно).
  const sortedStages = sortProductionStages(stages);
  // Переставить этап местами с соседом (той же категории). Если порядок ещё не проставлен —
  // проставляем последовательный один раз для всех (в текущем порядке), затем меняем два значения.
  const moveStage = (id, neighborId) => {
    if (!neighborId) return;
    const list = sortedStages.filter(s => (s.cat || "Прочее") === ((sortedStages.find(x => x.id === id)?.cat) || "Прочее"));
    const target = list.findIndex(s => s.id === neighborId);
    if (target >= 0) patch({ stages: moveProductionStage(stages, id, target) });
  };
  const grouped = groupByCat(sortedStages);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Этапы и сроки ({stages.length})</div>
          <span title="Позиции из смет объекта появляются, обновляются и удаляются в этапах автоматически. Ручные этапы не трогаются."
            style={{ fontSize: 11, color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>🔄 Синхронизируется со сметами автоматически</span>
        </div>
        {stages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Добавьте работу вручную ниже.</div>
        ) : (
          <div>
            {grouped.map(([cat, list]) => (
              <Fragment key={cat}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em", padding: "10px 0 5px", borderBottom: "1px solid #fdf3e3" }}>{cat}</div>
                {list.map((s, li) => {
                  const st = stByKey(s.status);
                  const iw = inWorkDays(s);
                  const upId = li > 0 ? list[li - 1].id : null;
                  const downId = li < list.length - 1 ? list[li + 1].id : null;
                  const arrBtn = (on) => ({ background: "none", border: "none", color: on ? "#94a3b8" : "#e2e8f0", cursor: on ? "pointer" : "default", fontSize: 12, lineHeight: 1, padding: 0, height: 15 });
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      {/* Быстрая перестановка в пределах категории: край, шаг или точная позиция. */}
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flexShrink: 0, gap: 2, width: 40 }}>
                        <div style={{ display:"flex", gap:3 }}>
                          <button title="В начало раздела" disabled={!upId} onClick={() => patch({ stages: moveProductionStage(stages, s.id, 0) })} style={arrBtn(!!upId)}>⇤</button>
                          <button title="Выше" disabled={!upId} onClick={() => moveStage(s.id, upId)} style={arrBtn(!!upId)}>▲</button>
                        </div>
                        <select title="Позиция в разделе" value={li} onChange={e => patch({ stages: moveProductionStage(stages, s.id, Number(e.target.value)) })}
                          style={{width:38,height:24,border:"1px solid #e2e8f0",borderRadius:6,fontSize:11,color:"#475569",background:"#fff",textAlign:"center",fontFamily:"inherit"}}>
                          {list.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}
                        </select>
                        <div style={{ display:"flex", gap:3 }}>
                          <button title="Ниже" disabled={!downId} onClick={() => moveStage(s.id, downId)} style={arrBtn(!!downId)}>▼</button>
                          <button title="В конец раздела" disabled={!downId} onClick={() => patch({ stages: moveProductionStage(stages, s.id, list.length - 1) })} style={arrBtn(!!downId)}>⇥</button>
                        </div>
                      </div>
                      <div style={{ width: 3, borderRadius: 3, background: st.color, flexShrink: 0, minHeight: 36 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input value={s.name} onChange={e => upd(s.id, { name: e.target.value })} placeholder="Наименование работы"
                          style={{ width: "100%", border: "none", fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "inherit", outline: "none", background: "transparent", padding: 0 }} />
                        {(s.qty > 0 || s.unit) && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{s.qty > 0 ? fmt(s.qty) : ""} {s.unit || ""}</div>}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
                          <select value={s.status} onChange={e => upd(s.id, { status: e.target.value })}
                            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 6px", fontSize: 11.5, fontFamily: "inherit", color: st.color, background: st.bg, fontWeight: 700, cursor: "pointer" }}>
                            {STAGE_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                          <input value={s.responsible || ""} onChange={e => upd(s.id, { responsible: e.target.value })} placeholder="Ответств."
                            onFocus={e => { _stFocus.current = e.target.value; }}
                            onBlur={e => auditStage(s, "прораб этапа", _stFocus.current, e.target.value)}
                            style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", width: 100 }} />
                          {iw != null && <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 700 }}>🔨 {iw} дн</span>}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginTop: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Старт план</div>
                            <input type="date" value={s.planStart || ""} onChange={e => upd(s.id, { planStart: e.target.value })} style={dInp} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Конец план</div>
                            <input type="date" value={s.planEnd || ""} onChange={e => upd(s.id, { planEnd: e.target.value })}
                              onFocus={e => { _stFocus.current = e.target.value; }}
                              onBlur={e => auditStage(s, "срок этапа (план)", _fmtDate(_stFocus.current), _fmtDate(e.target.value))} style={dInp} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Старт факт</div>
                            <input type="date" value={s.factStart || ""} onChange={e => upd(s.id, { factStart: e.target.value })} style={dInp} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 2 }}>Конец факт</div>
                            <input type="date" value={s.factEnd || ""} onChange={e => upd(s.id, { factEnd: e.target.value })} style={dInp} />
                          </div>
                        </div>
                        <input value={s.note || ""} onChange={e => upd(s.id, { note: e.target.value })} placeholder="+ примечание"
                          style={{ marginTop: 6, width: "100%", border: "none", borderBottom: "1px dashed #e2e8f0", fontSize: 11, color: "#64748b", fontFamily: "inherit", outline: "none", padding: "1px 0", background: "transparent" }} />
                      </div>
                      <button onClick={() => { if (window.confirm(`Удалить этап «${s.name || "без названия"}»?\n\nВажно: если эта работа ещё есть в смете объекта — этап вернётся при следующей синхронизации. Чтобы убрать навсегда, удалите работу из сметы.`)) patch({ stages: stages.filter(x => x.id !== s.id) }); }}
                        title="Удалить этап" style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px", flexShrink: 0, alignSelf: "flex-start" }}>×</button>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
        {/* Ручное добавление работы */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Заголовок (Черновые…)"
            style={{ flex: "1 1 140px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addManual()} placeholder="Наименование работы"
            style={{ flex: "2 1 180px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button onClick={addManual} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Работа</button>
        </div>
      </div>

      {/* Gantt — полноценный график */}
      {stages.length > 0 && (() => {
        const gantt = stages.filter(s => s.planStart || s.factStart);
        if (!gantt.length) return (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>График работ</div>
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Укажите плановые даты у работ выше — появится график.</div>
          </div>
        );
        const todayMs = _dayStart(new Date());
        const allMs = gantt.flatMap(s => [s.planStart, s.planEnd, s.factStart, s.factEnd].filter(Boolean).map(d => +new Date(d)));
        allMs.push(todayMs);
        const pad = 3 * 864e5;
        const startMs = Math.min(...allMs) - pad;
        const endMs = Math.max(...allMs) + pad;
        const totalDays = Math.max(1, Math.round((endMs - startMs) / 864e5));
        const PX = Math.min(28, Math.max(14, Math.round(900 / totalDays)));
        const chartW = totalDays * PX;
        const NAME_W = 164;
        const ROW_H = 46;
        const xOf = (ms) => Math.round((ms - startMs) / 864e5) * PX;
        const wOf = (a, b) => Math.max(PX, xOf(b) - xOf(a) + PX);
        const todayX = xOf(todayMs);
        // Месячные метки
        const months = [];
        const mc = new Date(startMs); mc.setDate(1); mc.setHours(0, 0, 0, 0);
        while (+mc <= endMs) { months.push({ label: mc.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }), x: xOf(+mc) }); mc.setMonth(mc.getMonth() + 1); }
        const ganttGrouped = groupByCat(gantt);
        return (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflowX: "auto" }}>
            {/* Шапка */}
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 16px 10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>График работ</span>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 22, height: 10, background: "#bfdbfe", border: "1.5px solid #3b82f6", borderRadius: 3 }} />план</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 22, height: 9, background: "#6ee7b7", borderRadius: 3 }} />факт</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 2, height: 14, background: "#ef4444", borderRadius: 1 }} />сегодня</span>
              </div>
            </div>
            <div style={{ minWidth: NAME_W + chartW + 16, paddingBottom: 8 }}>
              {/* Ось месяцев */}
              <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0" }}>
                <div style={{ width: NAME_W, flexShrink: 0 }} />
                <div style={{ position: "relative", width: chartW, height: 26, flexShrink: 0 }}>
                  {months.map((m, i) => (
                    <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, borderLeft: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, paddingLeft: 4, lineHeight: "26px", whiteSpace: "nowrap" }}>{m.label}</span>
                    </div>
                  ))}
                  <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "#ef4444", borderRadius: 1 }} />
                </div>
              </div>
              {/* Строки по категориям */}
              {ganttGrouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <div style={{ display: "flex", background: "#fffdf7" }}>
                    <div style={{ width: NAME_W, flexShrink: 0, padding: "5px 12px 3px", fontSize: 10, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em" }}>{cat}</div>
                    <div style={{ position: "relative", width: chartW, height: 20, flexShrink: 0 }}>
                      {months.map((m, i) => <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, width: 1, background: "#f0ece0" }} />)}
                      <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "rgba(239,68,68,.2)" }} />
                    </div>
                  </div>
                  {list.map(s => {
                    const st = stByKey(s.status);
                    const pS = s.planStart ? +new Date(s.planStart) : null;
                    const pE = s.planEnd ? +new Date(s.planEnd) : null;
                    const fS = s.factStart ? +new Date(s.factStart) : null;
                    const fE = s.factEnd ? +new Date(s.factEnd) : null;
                    const overdue = s.status !== "done" && pE && pE < todayMs;
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #f1f5f9", minHeight: ROW_H }}>
                        <div style={{ width: NAME_W, flexShrink: 0, padding: "6px 12px", minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? "#dc2626" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                          <div style={{ fontSize: 10, color: st.color, fontWeight: 600 }}>{st.label}{overdue ? " ⚠" : ""}</div>
                        </div>
                        <div style={{ position: "relative", width: chartW, height: ROW_H, flexShrink: 0 }}>
                          {months.map((m, i) => <div key={i} style={{ position: "absolute", left: m.x, top: 0, bottom: 0, width: 1, background: "#f1f5f9" }} />)}
                          <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "rgba(239,68,68,.18)", zIndex: 1 }} />
                          {/* Плановый бар */}
                          {pS && pE && (
                            <div title={`План: ${new Date(pS).toLocaleDateString("ru-RU")} — ${new Date(pE).toLocaleDateString("ru-RU")}`}
                              style={{ position: "absolute", left: xOf(pS), width: wOf(pS, pE), top: 8, height: 14, borderRadius: 4, background: overdue ? "#fee2e2" : st.bg, border: `1.5px solid ${overdue ? "#f87171" : st.color}`, zIndex: 2, overflow: "hidden", display: "flex", alignItems: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: overdue ? "#dc2626" : st.color, paddingLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wOf(pS, pE) > 50 ? s.name : ""}</span>
                            </div>
                          )}
                          {/* Фактический бар */}
                          {fS && (
                            <div title={`Факт: ${new Date(fS).toLocaleDateString("ru-RU")}${fE ? " — " + new Date(fE).toLocaleDateString("ru-RU") : " (идёт)"}`}
                              style={{ position: "absolute", left: xOf(fS), width: wOf(fS, fE || todayMs), top: 26, height: 12, borderRadius: 3, background: s.status === "done" ? "#34d399" : "#6ee7b7", zIndex: 2 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
              {/* Метка «сегодня» внизу */}
              <div style={{ position: "relative", height: 16, marginTop: 2 }}>
                <div style={{ position: "absolute", left: NAME_W + todayX - 16, top: 0, fontSize: 9, color: "#ef4444", fontWeight: 700, whiteSpace: "nowrap" }}>▲ сегодня</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function DateF({ label, v, on }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>{label}</div>
      <input type="date" value={v || ""} onChange={e => on(e.target.value)}
        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 6px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

// Дата+время для журнала/замечаний
const _fmtTs = (ts) => ts ? new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

// ─── ВКЛАДКА: ЖУРНАЛ ОБЪЕКТА (лента событий) ───
function JournalTab({ prod, patch, genId, currentUser }) {
  const entries = prod.journal || [];
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; patch({ journal: [{ id: genId(), ts: Date.now(), author: currentUser?.name || "—", text: text.trim() }, ...entries] }); setText(""); };
  const del = (id) => { if (window.confirm("Удалить запись?")) patch({ journal: entries.filter(e => e.id !== id) }); };
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>📖 Журнал объекта ({entries.length})</div>
      <div style={{ marginBottom: 16 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Что произошло на объекте? («залили стяжку», «клиент перенёс розетку», «привезли плитку»…)"
          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button onClick={add} disabled={!text.trim()} style={{ background: text.trim() ? "#2563eb" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit" }}>+ Запись в журнал</button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Записей пока нет. Фиксируйте всё важное — пригодится при спорах и передаче объекта.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {entries.map(e => (
            <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 4px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ width: 3, borderRadius: 3, background: "#bfdbfe", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>{_fmtTs(e.ts)} · {e.author}</div>
                <div style={{ fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.text}</div>
              </div>
              <button onClick={() => del(e.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15, flexShrink: 0, alignSelf: "flex-start" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ВКЛАДКА: ЗАМЕЧАНИЯ / ДЕФЕКТЫ ───
function DefectsTab({ prod, patch, genId, currentUser }) {
  const items = prod.defects || [];
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; patch({ defects: [{ id: genId(), text: text.trim(), done: false, ts: Date.now(), author: currentUser?.name || "—" }, ...items] }); setText(""); };
  const upd = (id, p) => patch({ defects: items.map(i => i.id === id ? { ...i, ...p } : i) });
  const del = (id) => patch({ defects: items.filter(i => i.id !== id) });
  const open = items.filter(i => !i.done).length;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>⚠️ Замечания и дефекты</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: open ? "#dc2626" : "#059669" }}>{open ? `${open} открыто` : (items.length ? "всё устранено ✓" : "—")}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Новое замечание (что исправить)…"
          style={{ flex: "1 1 200px", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button onClick={add} disabled={!text.trim()} style={{ background: text.trim() ? "#dc2626" : "#cbd5e1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit" }}>+ Добавить</button>
      </div>
      {items.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px 0", fontSize: 13 }}>Замечаний нет. Сюда вносите недочёты к устранению (свои и от клиента).</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 4px", borderBottom: "1px solid #f1f5f9" }}>
              <input type="checkbox" checked={!!it.done} onChange={e => upd(it.id, { done: e.target.checked })} style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {it.source === "client" && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#2563eb", background: "rgba(37,99,235,.1)", borderRadius: 4, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>👤 ОТ КЛИЕНТА</span>}
                  <input value={it.text} onChange={e => upd(it.id, { text: e.target.value })}
                    style={{ width: "100%", border: "none", fontSize: 13, fontFamily: "inherit", outline: "none", color: it.done ? "#94a3b8" : "#0f172a", textDecoration: it.done ? "line-through" : "none", background: "transparent" }} />
                </div>
                <div style={{ fontSize: 10.5, color: "#cbd5e1", marginTop: 2 }}>{_fmtTs(it.ts)} · {it.author}{it.done ? " · устранено" : ""}</div>
              </div>
              <button onClick={() => del(it.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: 15, flexShrink: 0, marginTop: 2 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ВКЛАДКА: ФИНАНСОВЫЙ БЛОК (по этапам, группировка категория › подкатегория) ───
// Денежное поле: показывает «115 957 ₸» с пробелами, парсит только цифры
function MoneyInput({ value, onChange, big }) {
  const txt = (value === undefined || value === null || value === "") ? "" : new Intl.NumberFormat("ru-RU").format(value);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input type="text" inputMode="numeric" value={txt} placeholder="0"
        onChange={e => { const d = e.target.value.replace(/[^\d]/g, ""); onChange(d === "" ? undefined : Number(d)); }}
        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: big ? "8px 24px 8px 10px" : "6px 22px 6px 8px", fontSize: big ? 15 : 12, fontWeight: big ? 700 : 500, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }} />
      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: big ? 12 : 11, color: "#94a3b8", pointerEvents: "none" }}>₸</span>
    </div>
  );
}

// Компактное денежное поле для таблиц: «115 957» с пробелами, ввод только цифр
// Числовое поле с ЛОКАЛЬНЫМ вводом: пока печатаешь — обновляется только само поле,
// в родителя (и сохранение) значение уходит на blur/Enter. Так не тормозит при вводе.
function NumCell({ value, onChange, ph = "—" }) {
  const fmtN = v => (v === undefined || v === null || v === "") ? "" : new Intl.NumberFormat("ru-RU").format(v);
  const [local, setLocal] = useState(null);
  const shown = local !== null ? local : fmtN(value);
  const commit = () => { if (local === null) return; const d = local.replace(/[^\d]/g, ""); onChange(d === "" ? undefined : Number(d)); setLocal(null); };
  return <input type="text" inputMode="numeric" value={shown} placeholder={ph}
    onChange={e => setLocal(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
    style={{ width: "100%", minWidth: 64, border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 6px", fontSize: 12.5, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }} />;
}
// Ввод себестоимости ЗА ЕДИНИЦУ: в поле пишем цену за 1 ед., а храним итог (за ед. × кол-во).
// Локальный ввод (commit на blur/Enter) — не тормозит. Старые данные (итог) показываются как итог÷кол-во.
function PerUnitCell({ total, qty, onChange, ph = "—" }) {
  const q = Number(qty) || 0;
  const totalNum = Number(total) || 0;
  const fmtN = n => new Intl.NumberFormat("ru-RU").format(n);
  const perUnit = (total === undefined || total === null || total === "") ? "" : (q > 0 ? Math.round(totalNum / q) : totalNum);
  const [local, setLocal] = useState(null);
  const shown = local !== null ? local : (perUnit === "" ? "" : fmtN(perUnit));
  const commit = () => { if (local === null) return; const d = local.replace(/[^\d]/g, ""); const u = d === "" ? undefined : Number(d); onChange(u === undefined ? undefined : (q > 0 ? u * q : u)); setLocal(null); };
  return (
    <div>
      <input type="text" inputMode="numeric" value={shown} placeholder={ph}
        title={q > 0 ? `за единицу × ${fmtN(q)} = ${fmtN(totalNum)} ₸` : "сумма"}
        onChange={e => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ width: "100%", minWidth: 64, border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 6px", fontSize: 12.5, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }} />
      {q > 0 && totalNum > 0 && <div style={{ fontSize: 9.5, color: "#94a3b8", textAlign: "right", marginTop: 2, whiteSpace: "nowrap" }}>= {fmtN(totalNum)} ₸</div>}
    </div>
  );
}

function FinanceTab({ prod, patch, fmt, finSummary }) {
  const stages = prod.stages || [];
  const upd = (id, p) => patch({ stages: stages.map(s => s.id === id ? { ...s, ...p } : s) });
  const num = (v) => Number(v) || 0;
  const tot = stages.reduce((a, s) => { a.priceClient += num(s.priceClient); a.costPlan += num(s.costPlan); a.costFact += num(s.costFact); return a; }, { priceClient: 0, costPlan: 0, costFact: 0 });
  const mColor = (p) => p >= 30 ? "#059669" : p >= 0 ? "#d97706" : "#dc2626";
  const mPlanSumTot = tot.priceClient - tot.costPlan;
  const mFactSumTot = tot.costFact ? tot.priceClient - tot.costFact : null;
  const mPlanTot = tot.priceClient ? Math.round(mPlanSumTot / tot.priceClient * 100) : 0;
  const mFactTot = (tot.priceClient && tot.costFact) ? Math.round((tot.priceClient - tot.costFact) / tot.priceClient * 100) : null;
  // ячейка маржи: сумма ₸ сверху, % снизу
  const margCell = (sum, pct) => pct == null
    ? <span style={{ color: "#cbd5e1" }}>—</span>
    : <><b style={{ color: mColor(pct), fontSize: 12.5 }}>{fmt(sum)} ₸</b><div style={{ fontSize: 11, fontWeight: 700, color: mColor(pct) }}>{pct}%</div></>;
  const th = { padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" };
  const tdc = { padding: "4px 6px", verticalAlign: "top" };
  // Финансовые строки показываем в том же ручном порядке, что и этапы.
  const grouped = groupByCat(sortProductionStages(stages));

  const mCol = (p) => p >= 30 ? "#059669" : p >= 0 ? "#d97706" : "#dc2626";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Сводка: если есть финпроект — по факту (бюджет/оплаты/расходы),
          иначе — по плану из сметы/этапов (объект ещё не в производстве/финансах). */}
      {finSummary ? (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>💰 Финансы объекта{finSummary.contractNo ? ` · договор №${String(finSummary.contractNo).replace(/^№+/, "")}` : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
            {[
              ["Договор + допсоглашения", finSummary.budget > 0 ? fmt(finSummary.budget) + " ₸" : "—", "#0f172a", "#f8fafc"],
              ...(finSummary.estimatePlan > 0 && Math.round(finSummary.estimatePlan) !== Math.round(finSummary.budget)
                ? [["Все сметы (план)", fmt(finSummary.estimatePlan) + " ₸", "#2563eb", "#eff6ff"]]
                : []),
              ["Оплачено", finSummary.income > 0 ? fmt(finSummary.income) + " ₸" : "—", "#059669", "#f0fdf4"],
              ["Долг", finSummary.debt > 0 ? fmt(finSummary.debt) + " ₸" : "—", finSummary.debt > 0 ? "#dc2626" : "#94a3b8", finSummary.debt > 0 ? "#fef2f2" : "#f8fafc"],
              ["Расходы", finSummary.expense > 0 ? fmt(finSummary.expense) + " ₸" : "—", "#dc2626", "#fef2f2"],
              ["Маржа", finSummary.margin != null ? (fmt(finSummary.income - finSummary.expense) + " ₸ / " + finSummary.margin + "%") : "—", finSummary.margin != null ? mCol(finSummary.margin) : "#94a3b8", "#f0fdf4"],
            ].map(([l, v, c, bg]) => (
              <div key={l} style={{ background: bg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${c}22` }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>📐 План по смете</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>Проект в Финансах ещё не заведён (оплаты/расходы появятся, когда объект пойдёт в работу).</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
            {[
              ["Выручка (план)", tot.priceClient > 0 ? fmt(tot.priceClient) + " ₸" : "—", "#2563eb", "#eff6ff"],
              ["Себестоимость (план)", tot.costPlan > 0 ? fmt(tot.costPlan) + " ₸" : "—", "#dc2626", "#fef2f2"],
              ["Маржа (план)", tot.priceClient > 0 ? (fmt(mPlanSumTot) + " ₸ / " + mPlanTot + "%") : "—", tot.priceClient > 0 ? mCol(mPlanTot) : "#94a3b8", "#f0fdf4"],
              ...(tot.costFact > 0 ? [["Маржа (факт)", fmt(mFactSumTot) + " ₸ / " + mFactTot + "%", mCol(mFactTot || 0), "#f0fdf4"]] : []),
            ].map(([l, v, c, bg]) => (
              <div key={l} style={{ background: bg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${c}22` }}>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Компактная таблица финансов по этапам */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, overflowX: "auto" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>Финансы по этапам</div>
        {stages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "26px 0", fontSize: 13 }}>Этапы появятся автоматически при открытии объекта со сметой.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left", minWidth: 200 }}>Наименование работы</th>
                <th style={{ ...th, textAlign: "right" }}>Цена, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Себ. план /ед, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Себ. факт /ед, ₸</th>
                <th style={{ ...th, textAlign: "right" }}>Маржа план</th>
                <th style={{ ...th, textAlign: "right" }}>Маржа факт</th>
                <th style={{ ...th, textAlign: "center" }}>Опл.</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, list]) => (
                <Fragment key={cat}>
                  <tr><td colSpan={7} style={{ padding: "10px 8px 4px", fontSize: 11.5, fontWeight: 800, color: "#b8904a", textTransform: "uppercase", letterSpacing: ".04em", background: "#fffdf7" }}>{cat}</td></tr>
                  {list.map(s => {
                    const pc = num(s.priceClient), cf = num(s.costFact);
                    const mPlanSum = pc - num(s.costPlan), mpl = pc ? Math.round(mPlanSum / pc * 100) : 0;
                    const mFactSum = cf ? pc - cf : null, mft = (pc && cf) ? Math.round((pc - cf) / pc * 100) : null;
                    return (
                      <tr key={s.id} style={{ borderTop: "1px solid #f1f5f9", background: s.paid ? "#f0fdf4" : "transparent" }}>
                        <td style={{ ...tdc, minWidth: 200 }}>
                          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 12.5 }}>{s.name || "—"}</div>
                          {(s.qty > 0 || s.unit) && <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 1 }}>{s.qty > 0 ? fmt(s.qty) : ""} {s.unit || ""}</div>}
                          <input value={s.note || ""} onChange={e => upd(s.id, { note: e.target.value })} placeholder="+ примечание" style={{ width: "100%", maxWidth: 240, border: "none", borderBottom: "1px dashed #e2e8f0", fontSize: 11, color: "#64748b", fontFamily: "inherit", outline: "none", marginTop: 3, padding: "1px 0", background: "transparent" }} />
                        </td>
                        <td style={{ ...tdc, minWidth: 92 }}><NumCell value={s.priceClient} onChange={v => upd(s.id, { priceClient: v })} /></td>
                        <td style={{ ...tdc, minWidth: 92 }}><PerUnitCell total={s.costPlan} qty={s.qty} onChange={v => upd(s.id, { costPlan: v })} /></td>
                        <td style={{ ...tdc, minWidth: 92 }}><PerUnitCell total={s.costFact} qty={s.qty} onChange={v => upd(s.id, { costFact: v })} /></td>
                        <td style={{ padding: "6px 8px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{margCell(mPlanSum, mpl)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>{margCell(mFactSum, mft)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "top" }}><input type="checkbox" checked={!!s.paid} onChange={e => upd(s.id, { paid: e.target.checked })} title="Оплачено клиентом" style={{ width: 17, height: 17, cursor: "pointer" }} /></td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 800, color: "#0f172a" }}>
                <td style={{ padding: "9px 8px" }}>ИТОГО</td>
                <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmt(tot.priceClient)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmt(tot.costPlan)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right" }}>{fmt(tot.costFact)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{margCell(mPlanSumTot, mPlanTot)}</td>
                <td style={{ padding: "9px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{margCell(mFactSumTot, mFactTot)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function MarginStat({ label, pct, amt, fmt }) {
  const good = pct >= 0.3;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: pct >= 0 ? (good ? "#059669" : "#d97706") : "#dc2626" }}>{Math.round(pct * 100)}%</div>
      <div style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(amt)} ₸</div>
    </div>
  );
}
