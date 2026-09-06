// ЯДРО ОБЛАКА: Firebase (общая база) + localStorage-резерв, вход сотрудника,
// эксклюзивный editor-lock, очередь грязных ключей и REST-фолбэк.
// Перенесено из App.jsx ЦЕЛИКОМ и без изменения логики — вся изменяемая
// module-scope память (метки блокировки, _mem, _deniedKeys) живёт в одном модуле,
// поэтому у неё по-прежнему ровно один экземпляр на приложение.
import { _env, firebaseConfig } from "../appConfig.js";
import { _ts } from "../format.js";
import { WORKSPACE_BACKUPS_KEY } from "../storageKeys.js";
import { EDIT_LEASE_KEY, adoptUserDirty, claimFallbackLease, clearSyncedLocalMirror, compactLocalStorageMirrors, discardOwnedDirty, isLegacyDirtyMarker, isPermissionDenied, listFlushableDirty, listOwnedDirty, makeDirtyMarker, makeLease, mayClearDirtyOnSuccess, mayUseLocalCopy, ownsActiveLease, parseLease, resolveVerifiedCloudRead, visibleDirtyKeys } from "../utils.js";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken, signOut } from "firebase/auth";
import { get, getDatabase, onValue, ref, runTransaction, set } from "firebase/database";

export let _fbDb = null;
export let _fbAuth = null;
// Promise resolves when anonymous auth is ready (or immediately if auth unavailable)
export let _fbAuthReady = Promise.resolve();
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

// ── ВХОД СОТРУДНИКА В САМ FIREBASE ─────────────────────────────────────────
// Анонимный вход выше остаётся: он нужен публичным страницам — клиентскому кабинету
// и КП, которые открывает человек без учётки. Но для сотрудника анонимного мало:
// правилам базы не на что опереться, «аноним» — это и прораб, и любой прохожий.
// После проверки пароля на сервере (/api/login) приложение входит КАСТОМНЫМ токеном
// с claims {staff:true, role}. Сессия хранится самим SDK и обновляется сама, поэтому
// после перезагрузки страницы повторный вход не нужен.
export const signInAsStaff = async (customToken) => {
  if (!_fbAuth || !customToken) return false;
  try {
    // Со сроком. Если облако не отвечает, SDK уходит в свои повторы с нарастающей
    // паузой, и кнопка входа осталась бы «Проверка…» навсегда — ровно та беда, из-за
    // которой ниже стоит таймаут у _fbAuthReady. Лучше честная ошибка и «попробуйте ещё раз».
    const timedOut = Symbol("timeout");
    const outcome = await Promise.race([
      signInWithCustomToken(_fbAuth, customToken),
      new Promise(resolve => setTimeout(() => resolve(timedOut), 15000)),
    ]);
    if (outcome === timedOut) return false;
    // Дальнейшие чтения/записи должны ждать УЖЕ сотрудника, а не прежнего анонима:
    // иначе первая же запись после входа уйдёт со старым токеном и правила её отобьют.
    _fbAuthReady = Promise.resolve();
    return true;
  } catch (e) { console.warn("staff sign-in failed", e); return false; }
};
// Выход: снимаем права сотрудника СРАЗУ, не дожидаясь закрытия вкладки. Иначе после
// «Выйти» в браузере остаётся живой токен с claims, и через консоль из него всё ещё
// читается база — при том, что интерфейс уже показывает экран входа.
// Есть ли у текущей сессии Firebase признак сотрудника. Нужен для понятного объяснения:
// после закрытия базы правилами старая анонимная сессия в браузере перестаёт что-либо
// читать, и без этой проверки человек видит красное «не удалось загрузить данные» и
// думает, что сломалась система, хотя нужно просто войти заново.
export const hasStaffClaim = async () => {
  try {
    const user = _fbAuth?.currentUser;
    if (!user) return false;
    const res = await user.getIdTokenResult();
    return res?.claims?.staff === true;
  } catch { return false; }
};
export const signOutStaff = async () => {
  if (!_fbAuth) return;
  try {
    await signOut(_fbAuth);
    const back = signInAnonymously(_fbAuth).catch(() => {});
    _fbAuthReady = Promise.race([back, new Promise(resolve => setTimeout(resolve, 5000))]);
    await _fbAuthReady;
  } catch (e) { console.warn("staff sign-out failed", e); }
};

// ─── ХРАНИЛИЩЕ: Firebase (общая) + localStorage (резерв) ───────────────────
export const _mem = {};
export const _TIMEOUT = Symbol("timeout");
export const _race = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(_TIMEOUT), ms))]);
export const _fbKey = (k) => k.replace(/[^a-zA-Z0-9_]/g, "_"); // Firebase: только буквы/цифры/_
export const _TS_SUFFIX = "__wts"; // timestamp последней локальной записи
export const _DIRTY_SUFFIX = "__dirty"; // флаг: последняя запись в облако НЕ прошла — локальная копия новее
// Число реально выполняющихся обычных storage.set по ключу. Durable dirty-маркер ставится
// ДО сетевого await, но пока запрос в полёте это ещё не ошибка облака. UI исключает такие
// ключи из аварийного счётчика; при неудаче set завершится, marker останется и станет видимым.
export const _storageWritesInFlight = new Map();
export const _beginStorageFlight = key => _storageWritesInFlight.set(key, (_storageWritesInFlight.get(key) || 0) + 1);
export const _endStorageFlight = key => {
  const left = (_storageWritesInFlight.get(key) || 1) - 1;
  if (left > 0) _storageWritesInFlight.set(key, left);
  else _storageWritesInFlight.delete(key);
};
// Идентификатор ВКЛАДКИ (на загрузку страницы) + текущий пользователь — владелец dirty-записей.
// Нужны, чтобы выход «с потерей» в одной вкладке не снимал dirty-метки другой вкладки
// и не выбрасывал правки другого пользователя.
export const _TAB_ID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export let _dirtyOwnerUid = null; // выставляется storage.setDirtyOwner при входе пользователя
// Editor-lock включается только для авторизованного приложения. Публичные страницы работают
// отдельно и не участвуют в блокировке внутренней ERP.
export let _leaseEnforced = false;
export let _editorLockHeld = false;
export let _editorLockMode = null; // "web" | "fallback"
export let _editorLockToken = null;
export let _editorSessionN = 0;
export let _editorGateN = 0;
// EditorSessionGate живёт в App.jsx и открывает новый «заход» на захват lock.
// Присвоить импортированной привязке нельзя, поэтому счётчик двигает функция.
export function nextEditorGate() { return ++_editorGateN; }
export let _editorAcquireN = 0;
export let _editorReleaseRequested = false;
export let _editorInflight = 0;
export let _editorDrainWaiters = [];
export let _webLockRelease = null;
export let _webLockAcquire = null;
export const _newEditorToken = () => `${_TAB_ID}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
export const _editorOwnsLocalLease = () => {
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
export const _editorMayWrite = () => {
  if (!_leaseEnforced) return true;
  if (!_editorLockHeld || _editorReleaseRequested) return false;
  return _editorLockMode === "web" ? true : _editorOwnsLocalLease();
};
// Центральный fail-closed гейт: «lease свободен» не является правом записи.
export function _writeGateFail() {
  if (!_leaseEnforced) return null;
  return _editorMayWrite() ? null : { reason: "read-only-tab" };
}
export function _beginEditorWrite() {
  const fail = _writeGateFail();
  if (fail) return { fail, session: null };
  const session = _editorSessionN;
  if (_leaseEnforced) _editorInflight++;
  return { fail: null, session };
}
export function _mayApplyEditorResult(session) {
  return session === _editorSessionN && _editorMayWrite();
}
export function _finishEditorRelease() {
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
export function _endEditorWrite() {
  if (_leaseEnforced && _editorInflight > 0) _editorInflight--;
  if (_editorReleaseRequested && _editorInflight === 0) _finishEditorRelease();
}
export async function _acquireEditorLock() {
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
export function _heartbeatEditorLock() {
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
export function _releaseEditorLock() {
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
export function _foreignDirty(key) {
  try { return !mayUseLocalCopy(localStorage.getItem(key + _DIRTY_SUFFIX), _dirtyOwnerUid, _TAB_ID); } catch { return false; }
}
// ── REST-ФОЛБЭК ДЛЯ ОБЛАКА ──
// Firebase SDK ходит по WebSocket — его нередко режут блокировщики рекламы, антивирусы,
// корпоративные сети и «оптимизаторы» провайдеров. При этом сама база доступна: обычный
// HTTPS-запрос (fetch) проходит. Поэтому если SDK-запись/чтение не удались — пробуем
// то же самое через REST API базы. Это устраняет вечное «облако недоступно» на машинах,
// где заблокирован именно WebSocket, а не Firebase целиком.
export const _restToken = async () => {
  try { await _fbAuthReady; const u = _fbAuth && _fbAuth.currentUser; return u ? await u.getIdToken() : null; } catch { return null; }
};
export const _restUrl = (key, token) => firebaseConfig.databaseURL + "/" + _fbKey(key) + ".json" + (token ? "?auth=" + encodeURIComponent(token) : "");
// КЛЮЧИ, В КОТОРЫЕ БАЗА ОТКАЗАЛА ПО ПРАВАМ. Отказ правил окончателен: повторять его бесполезно
// (правила ответят так же), но вредно — каждый повтор это ещё одна оценка правил, а человеку
// показывается «облако недоступно», хотя сеть в порядке. Ключ отсюда не дожимается автофлешем;
// локальная копия при этом ОСТАЁТСЯ на месте (ничего не теряется), а в реестре несохранённого
// появляется честная причина «нет прав». Снимается только явным «Повторить» — после того, как
// роли выдали право или человек перезашёл с новым токеном.
export const _deniedKeys = new Set();
// Тот же вопрос, что и в _fbRestSet: PERMISSION_DENIED от SDK означает «правила не пустили»
// ТОЛЬКО если сотрудник действительно вошёл. До завершения входа база отвечает так же,
// а это состояние временное — повтор поможет, и объявлять «нет прав» нельзя.
// (_fbAuthReady — гонка с таймаутом в 5 секунд, поэтому дождаться его недостаточно.)
export const _deniedByRules = (err) => isPermissionDenied(err) && !!(_fbAuth && _fbAuth.currentUser);
export const _noteDenied = (key, denied) => { if (denied) _deniedKeys.add(key); else _deniedKeys.delete(key); return denied; };
// Возвращает { ok, denied }: denied=true — правила отказали, повтор не поможет.
//
// ОТКАЗ СЧИТАЕМ ОТКАЗОМ, ТОЛЬКО ЕСЛИ ТОКЕН БЫЛ. База отвечает 401 и на «правила не пустили»,
// и на «запрос пришёл вообще без токена» — по коду ответа их не различить. А без токена
// запрос уходит, когда запись стартовала раньше, чем поднялась авторизация: на телефоне при
// первом входе так пишется журнал изменений. Пометить это «нет прав» — соврать человеку и
// прекратить повторы там, где повтор как раз ПОМОЖЕТ (через секунду токен будет).
// Поэтому: нет токена → обычная неудача, ключ остаётся в очереди и дожмётся сам.
export const _fbRestSet = async (key, value) => {
  if (!firebaseConfig.databaseURL) return { ok: false, denied: false };
  try {
    const token = await _restToken();
    const r = await _race(fetch(_restUrl(key, token), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }), 12000);
    if (!r || r === _TIMEOUT) return { ok: false, denied: false };
    return { ok: !!r.ok, denied: !!token && (r.status === 401 || r.status === 403) };
  } catch { return { ok: false, denied: false }; }
};
export const _fbRestGet = async (key) => {
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
export function _reconcileDirty(localStr, cloudStr) {
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
export const storage = {
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
  // ── ПОДПИСКА НА КЛЮЧ ──
  // База у нас realtime, но приложение исторически с ней работало как с обычным сервером:
  // никаких подписок, только повторные ПОЛНЫЕ чтения по таймеру. Клиентский кабинет читал
  // свой узел каждые 10 секунд, приложение обходило все кабинеты раз в минуту — и так
  // круглосуточно, пока открыта хоть одна вкладка. За сутки набегало 21 ГБ скачивания при
  // базе в 44 МБ, то есть базу выкачивали примерно 485 раз в день.
  // Подписка меняет это в корне: узел приходит ОДИН раз, дальше данные идут только когда
  // они реально изменились. Простаивающая вкладка не стоит ничего.
  // Возвращает функцию отписки или null, если SDK недоступен (тогда вызывающий остаётся на
  // старом опросе — на REST-фолбэке подписок нет).
  watch(key, onData) {
    if (!_fbDb || typeof onData !== "function") return null;
    try {
      return onValue(ref(_fbDb, _fbKey(key)), (snap) => {
        const v = snap && snap.exists() ? snap.val() : null;
        try { onData(v == null ? null : (typeof v === "string" ? v : JSON.stringify(v))); } catch {}
      }, (e) => { console.warn("watch error", key, e?.message || e); });
    } catch (e) { console.warn("watch failed", key, e); return null; }
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
        let denied = false;
        try {
          await _fbAuthReady;
          let res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
          if (res === _TIMEOUT) { await new Promise(r => setTimeout(r, 800)); res = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000); }
          if (res !== _TIMEOUT) fbOk = true; else fbError = "timeout";
        } catch(e) { denied = _deniedByRules(e); fbError = denied ? "no-rights" : (e?.message || String(e)); }
        // При отказе по правам REST-фолбэк не трогаем: он идёт с тем же токеном к тем же
        // правилам и получит тот же отказ — лишняя оценка правил без единого шанса на успех.
        if (!fbOk && !denied) { try { const rr = await _fbRestSet(key, value); if (rr.ok) { fbOk = true; fbError = null; } else if (rr.denied) { denied = true; fbError = "no-rights"; } } catch {} }
        _noteDenied(key, denied && !fbOk);
      } else {
        try { const rr = await _fbRestSet(key, value); if (rr.ok) fbOk = true; else { fbError = rr.denied ? "no-rights" : "no cloud"; _noteDenied(key, rr.denied); } } catch(e) { fbError = e?.message || String(e); }
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
  // ПОВТОР ПРИ ВНЕШНЕМ ПРЕРЫВАНИИ. Firebase отменяет выполняющуюся транзакцию, если в
  // тот же путь параллельно прилетел обычный set() — и отдаёт ошибку с текстом "set"
  // (а при исчерпании внутренних попыток — "maxretry"). Это НЕ конфликт данных и не
  // повод отказывать пользователю: сохранение прайса падало именно так, потому что
  // список смет параллельно дописывался автосохранением. Просто ждём и повторяем.
  async mutateTransaction(key, mutator, _attempt = 0) {
    const op = _beginEditorWrite();
    if (op.fail) return { committed: false, reason: op.fail.reason };
    if (!_fbDb) { _endEditorWrite(); return { committed: false, reason: "no-sdk" }; }
    let retrying = false;
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
      const reason = e?.message || String(e);
      // «set» / «maxretry» — транзакцию сбила параллельная запись. Повторяем до 3 раз
      // с нарастающей паузой: к этому моменту соседняя запись обычно уже завершилась.
      if ((reason === "set" || reason === "maxretry") && _attempt < 3) {
        retrying = true;                       // release делаем здесь, finally пропускаем
        _endEditorWrite();
        await new Promise(r => setTimeout(r, 400 * (_attempt + 1)));
        return storage.mutateTransaction(key, mutator, _attempt + 1);
      }
      return { committed: false, reason };
    } finally {
      // Двойной release сломал бы счётчик незавершённых записей (logout ждёт по нему).
      if (!retrying) _endEditorWrite();
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
    let fbOk = false, fbError = null, denied = false;
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
        // ОТКАЗ ПО ПРАВАМ — НЕ СБОЙ СЕТИ: ни повтор через паузу, ни REST не помогут, правила
        // ответят так же. Раньше на каждой такой записи делалось три попытки подряд, и ключ
        // потом бесконечно дожимался автофлешем — отсюда десятки тысяч отказов в метрике правил.
        denied = _deniedByRules(e);
        fbError = denied ? "no-rights" : (e?.message || String(e));
        if (denied) console.warn("FB set: отказано по правам —", key);
        else {
          console.warn("FB set error:", e);
          // повтор после ошибки
          try {
            await new Promise(r=>setTimeout(r,800));
            const res2 = await _race(set(ref(_fbDb, _fbKey(key)), value), 12000);
            if (res2 !== _TIMEOUT) { fbOk = true; fbError = null; }
          } catch(e2) { denied = _deniedByRules(e2); fbError = denied ? "no-rights" : (e2?.message || String(e2)); }
        }
      }
      // SDK (WebSocket) не смог — пробуем обычным HTTPS-запросом (REST). Часто именно
      // WebSocket заблокирован блокировщиком/сетью, а сама база доступна.
        if (!fbOk && !denied) {
          try { const rr = await _fbRestSet(key, value); if (rr.ok) { fbOk = true; fbError = null; } else if (rr.denied) { denied = true; fbError = "no-rights"; } } catch {}
        }
        _noteDenied(key, denied && !fbOk);
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
  // Ключи, в которых база отказала по ПРАВАМ (а не из-за сети). Для баннера: показать
  // «нет прав на раздел», а не «облако недоступно» — иначе человек чинит интернет вместо прав.
  deniedKeys() { return Array.from(_deniedKeys); },
  // Снять пометку и дать записи ещё один шанс. Вызывается кнопкой «Повторить сейчас»: право
  // могли выдать в матрице, а токен обновиться при перезаходе — тогда попытка уже пройдёт.
  clearDenied() { _deniedKeys.clear(); },
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
      // Ключ, в котором база отказала по правам, автоматически не дожимаем: правила ответят
      // так же, а каждая попытка — это ещё чтение и три записи впустую. Данные при этом никуда
      // не деваются: локальная копия и dirty-метка на месте, ключ виден в баннере, и по кнопке
      // «Повторить» (она снимает пометку) попытка повторится — например, после выдачи прав.
      if (_deniedKeys.has(key)) continue;
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
