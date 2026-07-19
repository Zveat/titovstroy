// Durable production drafts (stage 2B). This module is deliberately pure with an injected
// localStorage-compatible store so recovery rules can be tested without React/Firebase.

export const PRODUCTION_DRAFT_PREFIX = "titovstroy-production-draft-v2:";
export const PRODUCTION_RETRY_PREFIX = "titovstroy-production-retry-v1:";
const DRAFT_VERSION = 2;
const RETRY_VERSION = 1;

const enc = value => encodeURIComponent(String(value == null ? "" : value));
const isObj = value => !!value && typeof value === "object" && !Array.isArray(value);
const finiteRev = value => Number.isInteger(value) && value >= 0;

export const productionDraftKey = (uid, objectId) =>
  `${PRODUCTION_DRAFT_PREFIX}${enc(uid)}:${enc(objectId)}`;

export const productionRetryKey = uid => `${PRODUCTION_RETRY_PREFIX}${enc(uid)}`;

export function makeProductionDraft(uid, objectId, entry, savedAt = Date.now()) {
  if (!uid || objectId == null || !entry || !isObj(entry.base) || !isObj(entry.local) || !finiteRev(entry.rev)) {
    return null;
  }
  if (entry.base.objectId !== objectId || entry.local.objectId !== objectId) return null;
  if (entry.ensure != null && (!isObj(entry.ensure) || entry.ensure.objectId !== objectId)) return null;
  return {
    version: DRAFT_VERSION,
    uid: String(uid),
    objectId,
    changeId: `cm_${objectId}`,
    rev: entry.rev,
    base: entry.base,
    local: entry.local,
    ensure: entry.ensure || null,
    savedAt,
  };
}

export function parseProductionDraft(raw, expectedUid = null) {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isObj(d) || d.version !== DRAFT_VERSION || !d.uid || d.objectId == null) return null;
    if (expectedUid != null && d.uid !== String(expectedUid)) return null;
    if (d.changeId !== `cm_${d.objectId}` || !finiteRev(d.rev) || !Number.isFinite(Number(d.savedAt))) return null;
    if (!isObj(d.base) || !isObj(d.local)) return null;
    if (d.base.objectId !== d.objectId || d.local.objectId !== d.objectId) return null;
    if (d.ensure != null && (!isObj(d.ensure) || d.ensure.objectId !== d.objectId)) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveProductionDraft(store, uid, objectId, entry, savedAt = Date.now()) {
  const draft = makeProductionDraft(uid, objectId, entry, savedAt);
  if (!draft) return false;
  try {
    store.setItem(productionDraftKey(uid, objectId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeProductionDraft(store, uid, objectId, maxRev = Infinity) {
  try {
    const key = productionDraftKey(uid, objectId);
    const draft = parseProductionDraft(store.getItem(key), uid);
    if (!draft) return false;
    if (draft.rev > maxRev) return false;
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function listProductionDrafts(store, uid) {
  const out = [];
  if (!uid) return out;
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || !key.startsWith(PRODUCTION_DRAFT_PREFIX)) continue;
      const draft = parseProductionDraft(store.getItem(key), uid);
      if (draft) out.push(draft);
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => Number(a.savedAt) - Number(b.savedAt));
}

const cleanRetryCommand = command => {
  if (!isObj(command) || !command.changeId || !String(command.changeId).startsWith("bg_")) return null;
  const clean = { ...command };
  delete clean.__retryFlush;
  return clean;
};

function parseRetryState(raw, expectedUid = null) {
  const empty = {
    version: RETRY_VERSION,
    uid: expectedUid == null ? "" : String(expectedUid),
    commands: {},
    updatedAt: 0,
  };
  try {
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!isObj(parsed) || parsed.version !== RETRY_VERSION || !parsed.uid || !isObj(parsed.commands)) return empty;
    if (expectedUid != null && parsed.uid !== String(expectedUid)) return empty;
    const commands = {};
    for (const [changeId, command] of Object.entries(parsed.commands)) {
      const clean = cleanRetryCommand(command);
      if (clean && clean.changeId === changeId) commands[changeId] = clean;
    }
    return { version: RETRY_VERSION, uid: parsed.uid, commands, updatedAt: Number(parsed.updatedAt) || 0 };
  } catch {
    return empty;
  }
}

function readRetryState(store, uid) {
  return parseRetryState(store.getItem(productionRetryKey(uid)), uid);
}

export function listProductionRetries(store, uid) {
  if (!uid) return [];
  return Object.values(readRetryState(store, uid).commands);
}

// Массовый restore заменяет всю базу. Поэтому перед ним недостаточно проверить очередь текущего
// пользователя: валидный durable-draft ДРУГОГО uid на этом же устройстве позже вошёл бы в систему
// и применил старую команду поверх уже восстановленных данных. Считаем все реально исполнимые
// production-черновики/ретраи; битый мусор не считается, потому что загрузчики его игнорируют.
export function countAllProductionRecovery(store) {
  let drafts = 0;
  let retries = 0;
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      if (key.startsWith(PRODUCTION_DRAFT_PREFIX)) {
        if (parseProductionDraft(store.getItem(key))) drafts++;
      } else if (key.startsWith(PRODUCTION_RETRY_PREFIX)) {
        const state = parseRetryState(store.getItem(key));
        retries += Object.keys(state.commands).length;
      }
    }
  } catch {
    return { drafts: 0, retries: 0, total: 0 };
  }
  return { drafts, retries, total: drafts + retries };
}

export function saveProductionRetry(store, uid, command, savedAt = Date.now()) {
  if (!uid) return false;
  const clean = cleanRetryCommand(command);
  if (!clean) return false;
  try {
    const state = readRetryState(store, uid);
    state.commands[clean.changeId] = clean;
    state.updatedAt = savedAt;
    store.setItem(productionRetryKey(uid), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function removeProductionRetry(store, uid, changeId, expectedRevision = null, savedAt = Date.now()) {
  if (!uid || !changeId) return false;
  try {
    const key = productionRetryKey(uid);
    const state = readRetryState(store, uid);
    if (!Object.prototype.hasOwnProperty.call(state.commands, changeId)) return false;
    if (expectedRevision != null && state.commands[changeId].__draftRevision !== expectedRevision) return false;
    delete state.commands[changeId];
    if (Object.keys(state.commands).length === 0) store.removeItem(key);
    else {
      state.updatedAt = savedAt;
      store.setItem(key, JSON.stringify(state));
    }
    return true;
  } catch {
    return false;
  }
}
