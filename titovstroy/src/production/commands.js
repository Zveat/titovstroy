// ── КОМАНДЫ ПРОИЗВОДСТВА (чистая логика, без Firebase/React) ──
// Все изменения списка производственных карточек описываются командами и применяются ОДНОЙ
// чистой функцией applyProductionCommand(list, command). Функция:
//   • синхронна, детерминирована, без побочных эффектов (нет сети, genId, Date.now);
//   • все id/таймстемпы приходят в команде (caller готовит стабильный id заранее);
//   • ВОЗВРАЩАЕТ РЕЗУЛЬТАТ { list, ok, changed, reason }, различая:
//       ok:false            — команда НЕ применима (нет карточки/элемента, битая) → это ошибка,
//                             а НЕ «тихий успех» (транзакция должна откатиться);
//       ok:true, changed:F  — идемпотентный no-op (дубль add / remove отсутствующего / статус тот же);
//       ok:true, changed:T  — реально применено.
// Так mutateProductions применяет команду к САМОМУ СВЕЖЕМУ списку внутри runTransaction, а при
// ok:false откатывает транзакцию (правка НЕ считается сохранённой).

// Массивы-поэлементные: их меняют granular-командами add/patch/remove-item по id (а НЕ целиком
// через patch-card), чтобы правка одного элемента не затирала изменения другого устройства.
export const ARRAY_FIELDS = [
  "stages",
  "journal",
  "defects",
  "checklistLaunch",
  "checklistHandover",
  "dailyReports",
  "tasks",
  "supplyRequests",
];

// Стабильный ключ сметной позиции (для сопоставления этапов со сметой). Тримим каждую часть.
export const _stageKey = (s) => (((s && s.cat) || "").trim() + "|" + ((s && s.name) || "").trim()).toLowerCase();

const _idxOf = (list, objectId) => list.findIndex(p => p && p.objectId === objectId);
const _ok = (list, changed) => ({ list, ok: true, changed, reason: null });
const _err = (list, reason) => ({ list, ok: false, changed: false, reason });
const _eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Эти фоновые команды не являются пользовательским вводом: они целиком пересобираются из
// сохранённых смет при каждом запуске. Их можно не хранить и безопасно удалить из старого retry.
export function isRegenerableProductionCommand(command) {
  return command?.type === "sync-estimate-stages";
}

// Старый формат сметного этапа не имел estimateKey, но уже имел fromEst:true. Такой этап можно
// безопасно убрать, если соответствующей работы больше нет в актуальных сметах И пользователь
// ни разу не начал с ним работать. Любой срок, статус, ответственный, примечание или оплата
// делают этап неприкосновенным. Поле order не учитываем: старый автосинк заполнял его сам,
// поэтому оно не доказывает, что пользователь редактировал этап.
export function isUntouchedLegacyEstimateStage(stage) {
  if (!stage || stage.fromEst !== true || stage.estimateKey != null) return false;
  const status = stage.status == null || stage.status === "" ? "todo" : stage.status;
  return status === "todo"
    && !stage.planStart && !stage.planEnd && !stage.factStart && !stage.factEnd
    && !String(stage.responsible || "").trim()
    && !String(stage.note || "").trim()
    && stage.paid !== true;
}

// Синхронизация сметных этапов. Ручной этап (fromEst !== true), даже если названием совпал со
// сметой, не меняется. Старые сметные этапы fromEst:true без estimateKey мигрируются на новый
// ключ с сохранением сроков/статуса; нетронутые строки, которых уже нет в смете, удаляются.
export function syncEstimateStages(card, built) {
  const cur = (card && card.stages) || [];
  const builtArr = Array.isArray(built) ? built : [];
  const keyOfBuilt = (b) => (b.estimateKey != null ? b.estimateKey : _stageKey(b));
  const builtByKey = new Map();
  for (const b of builtArr) builtByKey.set(keyOfBuilt(b), b);
  const isEst = (s) => s && s.fromEst === true && s.estimateKey != null;
  const isLegacyEst = (s) => s && s.fromEst === true && s.estimateKey == null;
  let changed = false;
  const claimed = new Set(cur.filter(isEst).map(s => s.estimateKey).filter(k => builtByKey.has(k)));
  const kept = [];

  for (const s of cur) {
    if (isEst(s)) {
      const b = builtByKey.get(s.estimateKey);
      if (!b) { changed = true; continue; }
      if (s.qty !== b.qty || s.priceClient !== b.priceClient || s.costPlan !== b.costPlan || (b.unit && s.unit !== b.unit)) {
        changed = true;
        kept.push({ ...s, unit: b.unit || s.unit, qty: b.qty, priceClient: b.priceClient, costPlan: b.costPlan });
      } else kept.push(s);
      continue;
    }

    if (isLegacyEst(s)) {
      const k = _stageKey(s);
      const b = builtByKey.get(k);
      if (b && !claimed.has(k)) {
        // Одноразовая миграция старого сметного этапа: сохраняем пользовательские поля,
        // добавляем происхождение и обновляем только расчётные значения из актуальной сметы.
        changed = true;
        claimed.add(k);
        kept.push({ ...s, estimateKey: k, unit: b.unit || s.unit, qty: b.qty, priceClient: b.priceClient, costPlan: b.costPlan });
        continue;
      }
      if (isUntouchedLegacyEstimateStage(s)) {
        // Либо работа удалена из сметы, либо это нетронутый старый дубль уже мигрированного этапа.
        changed = true;
        continue;
      }
    }

    kept.push(s); // ручной или реально использованный старый этап — не трогаем
  }

  // Какие ключи уже заняты после миграции. Ручной этап с тем же названием продолжает блокировать
  // создание дубля, но сам не становится сметным и его цифры не перезаписываются.
  const occupied = new Set();
  for (const s of kept) { occupied.add(_stageKey(s)); if (s.estimateKey != null) occupied.add(s.estimateKey); }
  const next = kept.slice();
  // Добавляем сметные позиции, чей ключ не занят ни одним существующим этапом.
  for (const b of builtArr) {
    const k = keyOfBuilt(b);
    if (occupied.has(k)) continue; // уже есть этап с этим именем/ключом — не дублируем
    changed = true;
    next.push({
      id: b.id, estimateKey: k, cat: b.cat, name: b.name, unit: b.unit || "", qty: b.qty,
      planStart: "", planEnd: "", factStart: "", factEnd: "", status: "todo",
      responsible: "", note: "", paid: false, priceClient: b.priceClient, costPlan: b.costPlan, fromEst: true,
    });
  }
  return { changed, stages: next };
}

// Применить ОДНУ команду. Возвращает { list, ok, changed, reason }.
function applyOne(arr, cmd, ts) {
  if (!cmd || typeof cmd !== "object") return _err(arr, "bad-command");
  const idx = cmd.objectId != null ? _idxOf(arr, cmd.objectId) : -1;
  const bump = (card) => ({ ...card, updatedAt: ts || card.updatedAt });
  const field = cmd.field;

  switch (cmd.type) {
    case "patch-card": {
      if (idx < 0) return _err(arr, "no-card");
      const patch = cmd.patch || {};
      const nc = { ...arr[idx] }; let changed = false;
      for (const k of Object.keys(patch)) if (!_eq(nc[k], patch[k])) { nc[k] = patch[k]; changed = true; }
      if (!changed) return _ok(arr, false);
      const out = arr.slice(); out[idx] = bump(nc); return _ok(out, true);
    }
    case "set-status": {
      if (idx < 0) return _err(arr, "no-card");
      if (arr[idx].prodStatus === cmd.status) return _ok(arr, false);
      const out = arr.slice(); out[idx] = bump({ ...arr[idx], prodStatus: cmd.status }); return _ok(out, true);
    }
    case "normalize-card-ids": {
      if (idx < 0) return _err(arr, "no-card");
      const normalized = normalizeProductionIds([arr[idx]]);
      if (!normalized.changed) return _ok(arr, false);
      const out = arr.slice();
      out[idx] = bump(normalized.list[0]);
      return _ok(out, true);
    }
    case "add-item": {
      if (idx < 0) return _err(arr, "no-card");
      if (!ARRAY_FIELDS.includes(field) || !cmd.item) return _err(arr, "bad-item");
      const curA = arr[idx][field] || [];
      if (cmd.item.id != null && curA.some(x => x && x.id === cmd.item.id)) return _ok(arr, false); // дубль по id
      const out = arr.slice(); out[idx] = bump({ ...arr[idx], [field]: [...curA, cmd.item] }); return _ok(out, true);
    }
    case "patch-item": {
      if (idx < 0) return _err(arr, "no-card");
      if (!ARRAY_FIELDS.includes(field)) return _err(arr, "bad-item");
      const curA = arr[idx][field] || [];
      if (!curA.some(x => x && x.id === cmd.itemId)) return _err(arr, "no-item"); // элемента нет — ошибка, не тихий успех
      const out = arr.slice(); out[idx] = bump({ ...arr[idx], [field]: curA.map(x => (x && x.id === cmd.itemId ? { ...x, ...(cmd.patch || {}) } : x)) }); return _ok(out, true);
    }
    case "remove-item": {
      if (idx < 0) return _err(arr, "no-card");
      if (!ARRAY_FIELDS.includes(field)) return _err(arr, "bad-item");
      const curA = arr[idx][field] || [];
      const nextA = curA.filter(x => !(x && x.id === cmd.itemId));
      if (nextA.length === curA.length) return _ok(arr, false); // нечего удалять — идемпотентно
      const out = arr.slice(); out[idx] = bump({ ...arr[idx], [field]: nextA }); return _ok(out, true);
    }
    case "delete-production": {
      if (idx < 0) return _ok(arr, false); // уже нет — идемпотентно
      const out = arr.slice(); out.splice(idx, 1); return _ok(out, true);
    }
    case "create-if-missing": {
      if (idx >= 0) return _ok(arr, false); // уже есть — НЕ перезаписываем
      if (!cmd.record) return _err(arr, "no-record");
      return _ok([...arr, cmd.record], true);
    }
    case "sync-estimate-stages": {
      if (idx < 0) return _err(arr, "no-card");
      const r = syncEstimateStages(arr[idx], cmd.estimateStages || []);
      if (!r.changed) return _ok(arr, false);
      const out = arr.slice(); out[idx] = bump({ ...arr[idx], stages: r.stages }); return _ok(out, true);
    }
    case "merge-client-remarks": {
      if (idx < 0) return _err(arr, "no-card");
      const remarks = Array.isArray(cmd.remarks) ? cmd.remarks : [];
      const defects = arr[idx].defects || [];
      const known = new Set(defects.filter(d => d && d.clientRemarkId != null).map(d => d.clientRemarkId));
      const add = remarks.filter(rm => rm && rm.clientRemarkId != null && !known.has(rm.clientRemarkId));
      if (!add.length) return _ok(arr, false); // всё уже заведено — идемпотентно
      const out = arr.slice(); out[idx] = bump({ ...arr[idx], defects: [...add, ...defects] }); return _ok(out, true);
    }
    case "replace-all-confirmed": {
      return Array.isArray(cmd.list) ? _ok(cmd.list.slice(), true) : _err(arr, "no-list");
    }
    default:
      return _err(arr, "unknown-command");
  }
}

// Публичная функция: применяет команду (в т.ч. batch — набор под-команд, применяемых ЦЕЛИКОМ:
// любая невалидная под-команда откатывает весь batch к исходному списку). Возвращает
// { list, ok, changed, reason }.
export function applyProductionCommand(list, cmd) {
  const arr = Array.isArray(list) ? list : [];
  const ts = (cmd && cmd.ts) || 0;
  // Нормализация id: применяется к СВЕЖЕМУ списку внутри транзакции (детерминированно), а не
  // заменяет всё старым снимком — свежие правки другого устройства сохраняются.
  if (cmd && cmd.type === "normalize-ids") {
    const r = normalizeProductionIds(arr);
    return _ok(r.list, r.changed);
  }
  if (cmd && cmd.type === "batch") {
    let cur = arr, anyChanged = false;
    // ensureRecord — гарантируем карточку ПЕРЕД под-командами (идемпотентно, не перезаписывает).
    if (cmd.ensureRecord && cmd.objectId != null && _idxOf(cur, cmd.objectId) < 0) {
      const cr = applyOne(cur, { type: "create-if-missing", objectId: cmd.objectId, record: cmd.ensureRecord }, ts);
      if (!cr.ok) return _err(arr, "batch-ensure:" + (cr.reason || "?"));
      cur = cr.list; anyChanged = anyChanged || cr.changed;
    }
    for (const sub of (cmd.commands || [])) {
      const r = applyOne(cur, { ...sub, ts }, ts);
      if (!r.ok) return _err(arr, "batch-sub:" + (r.reason || "?")); // весь batch невалиден → откат
      cur = r.list; anyChanged = anyChanged || r.changed;
    }
    return _ok(cur, anyChanged);
  }
  return applyOne(arr, cmd || {}, ts);
}

// Разница двух состояний карточки → минимальный набор granular-команд. Скалярные поля → один
// patch-card; КАЖДЫЙ массив (этапы/журнал/дефекты/чек-листы) сравнивается по id → add/patch/
// remove-item. Элементы без id ИГНОРИРУЮТСЯ (их нельзя адресовать) — перед включением механизма
// все элементы нормализуются (normalizeProductionIds), поэтому id есть у всех.
export function diffProductionToCommands(prev, next, objectId, ts) {
  const cmds = [];
  const P = prev || {}, N = next || {};
  const cardPatch = {};
  const cardKeys = new Set([...Object.keys(P), ...Object.keys(N)]);
  for (const f of ARRAY_FIELDS) cardKeys.delete(f);
  cardKeys.delete("updatedAt"); cardKeys.delete("objectId");
  for (const k of cardKeys) if (!_eq(P[k], N[k])) cardPatch[k] = N[k];
  if (Object.keys(cardPatch).length) cmds.push({ type: "patch-card", objectId, patch: cardPatch, ts });
  for (const field of ARRAY_FIELDS) {
    const pa = Array.isArray(P[field]) ? P[field] : [];
    const na = Array.isArray(N[field]) ? N[field] : [];
    const pById = new Map(pa.filter(x => x && x.id != null).map(x => [x.id, x]));
    const nById = new Map(na.filter(x => x && x.id != null).map(x => [x.id, x]));
    for (const it of na) {
      if (!it || it.id == null) continue;
      if (!pById.has(it.id)) { cmds.push({ type: "add-item", objectId, field, item: it, ts }); continue; }
      const p = pById.get(it.id);
      const patch = {}; const sk = new Set([...Object.keys(p), ...Object.keys(it)]);
      for (const k of sk) if (k !== "id" && !_eq(p[k], it[k])) patch[k] = it[k];
      if (Object.keys(patch).length) cmds.push({ type: "patch-item", objectId, field, itemId: it.id, patch, ts });
    }
    for (const it of pa) if (it && it.id != null && !nById.has(it.id)) cmds.push({ type: "remove-item", objectId, field, itemId: it.id, ts });
  }
  return cmds;
}

// Собрать batch из ОДНОГО пользовательского сохранения: все команды диффа применяются ЦЕЛИКОМ
// в одной транзакции. БЕЗ ensureRecord: если карточку удалили с другого устройства, patch-команды
// вернут no-card → транзакция откатится (конфликт), карточка НЕ воскресает из старого снимка.
// Создание новой карточки — отдельной командой create-if-missing (автозаполнение при первом открытии).
// Возвращает null, если менять нечего.
export function buildFlushBatch(lastSent, local, objectId, ts) {
  // Старые карточки могут содержать элементы без id. В UI их локально нормализует
  // ProductionModule, а при ЯВНОМ сохранении эта же детерминированная нормализация первой
  // под-командой применяется к свежей серверной карточке. Простое открытие ничего не пишет.
  const prevNorm = normalizeProductionIds([lastSent || {}]);
  const localNorm = normalizeProductionIds([local || {}]);
  const prev = prevNorm.list[0] || lastSent;
  const next = localNorm.list[0] || local;
  const commands = diffProductionToCommands(prev, next, objectId, ts);
  if (!commands.length) return null;
  if (prevNorm.changed) commands.unshift({ type: "normalize-card-ids", objectId, ts });
  return { type: "batch", objectId, commands, ts };
}

// Во время завершения сессии (logout) НОВЫЕ фоновые команды производства (bg_*) не принимаются:
// эффект/таймер мог бы подбросить команду, пока хвост очереди дожимается, и она выполнилась бы
// уже ПОСЛЕ выхода. Пропускаются: повторы из финального флеша (__retryFlush), правки карточек
// (cm_* — их дожимает module-очередь) и resolve-change (снятие баннера).
export function isBlockedWhileEnding(command, ending) {
  if (!ending || !command) return false;
  if (command.type === "resolve-change" || command.__retryFlush) return false;
  const id = command.changeId;
  return id != null && String(id).startsWith("bg_");
}

// Дождаться СТАБИЛИЗАЦИИ очереди-цепочки промисов: пока ждали хвост, туда могли поставить новые
// задачи — ждём циклом, пока ссылка на хвост не перестанет меняться. Возвращает true, если
// очередь устоялась (false — превышен предохранитель maxRounds).
export async function awaitQueueSettled(getTail, maxRounds = 20) {
  let tail = getTail();
  for (let i = 0; i < maxRounds; i++) {
    try { await tail; } catch { /* ошибки задач очередь не рушат */ }
    const next = getTail();
    if (next === tail) return true;
    tail = next;
  }
  return false;
}

// Учёт НЕУДАЧИ команды производства (App): что делать с changeId в множестве «ожидают
// синхронизации» (unsynced: Set) и в очереди фонового повтора (retry: Map). Чистая функция над
// переданными структурами — тестируется без React. Возвращает { cloudIssue } — сигналить ли
// «облако недоступно».
//   • сетевая ошибка: changeId → unsynced; bg_* — ещё и в retry (App повторит по интервалу);
//   • КОНФЛИКТ (команда неприменима к текущим данным): bg_* стала неактуальной — снимаем
//     ПОЛНОСТЬЮ (и из retry, и из unsynced — иначе повторов уже нет, а баннер завис бы навсегда);
//     cm_* остаётся в unsynced — модуль сам перебазирует и повторит тем же changeId.
export function accountProductionFailure({ changeId, conflict, command }, { unsynced, retry }) {
  if (changeId == null) return { cloudIssue: !conflict };
  if (conflict) {
    retry.delete(changeId);
    if (String(changeId).startsWith("cm_")) unsynced.add(changeId);
    else unsynced.delete(changeId);
    return { cloudIssue: false };
  }
  unsynced.add(changeId);
  if (String(changeId).startsWith("bg_")) retry.set(changeId, { ...command });
  return { cloudIssue: true };
}

// Мутатор для storage.mutateTransaction: применяет команду к КАЖДОМУ прогону колбэка транзакции.
// КРИТИЧНО: SDK ПЕРЕЗАПУСКАЕТ колбэк (холодный кеш: первый прогон null/[], после CAS-провала —
// реальные данные), поэтому результат ПРОШЛОГО прогона обязан сбрасываться в начале каждого.
// Иначе успешный второй прогон закоммитится в облако, а «залипший» notOk первого объявит
// сохранение конфликтом — интерфейс отбросил бы очередь при реально сохранённых данных.
export function createTxnApplier(cmd) {
  const state = { notOk: null, notOkList: null };
  const mutate = (curList) => {
    state.notOk = null; state.notOkList = null; // сброс прошлого прогона — НЕ убирать
    const r = applyProductionCommand(curList, cmd);
    if (!r.ok) { state.notOk = r.reason; state.notOkList = curList; return undefined; }
    return r.list;
  };
  return { mutate, state };
}

// Firebase может первый раз вызвать transaction-callback с холодным cache=[] и отменить
// корректную команду как no-card. После подтверждённого облачного чтения повторяем транзакцию
// сразу, а не заставляем пользователя ждать фонового интервала.
export async function runVerifiedProductionTransaction(command, { transact, readFresh }) {
  const runOnce = async () => {
    const applier = createTxnApplier(command);
    try {
      const result = await transact(applier.mutate);
      return { result: result || { committed: false }, notOk: applier.state.notOk, notOkList: applier.state.notOkList };
    } catch (error) {
      return { result: { committed: false, reason: error?.message || "transaction-failed" }, notOk: null, notOkList: null };
    }
  };

  const first = await runOnce();
  if (first.result.committed && !first.notOk) return { ...first.result, conflict: false };
  // Promise.race в storage не отменяет ещё выполняющуюся Firebase-транзакцию. После таймаута
  // нельзя запускать вторую: исходная может позднее закоммититься и получится две записи.
  if (first.result.reason === "timeout") return { committed: false, conflict: false, reason: "timeout" };
  if (!first.notOk) return { committed: false, conflict: false, reason: first.result.reason || "transaction-failed" };

  let freshResult;
  try { freshResult = await readFresh(); }
  catch { return { committed: false, conflict: false, reason: "conflict-unverified" }; }
  if (!freshResult || freshResult.status === "unavailable") {
    return { committed: false, conflict: false, reason: "conflict-unverified" };
  }

  let fresh = [];
  if (freshResult.status === "found" && freshResult.value) {
    try { fresh = JSON.parse(freshResult.value); }
    catch { return { committed: false, conflict: false, reason: "conflict-cloud-json" }; }
  }
  if (!Array.isArray(fresh)) return { committed: false, conflict: false, reason: "conflict-cloud-shape" };

  const verified = applyProductionCommand(fresh, command);
  if (!verified.ok) {
    return { committed: false, conflict: true, reason: verified.reason || first.notOk, list: fresh };
  }

  const second = await runOnce();
  if (second.result.committed && !second.notOk) return { ...second.result, conflict: false };
  return {
    committed: false,
    conflict: false,
    reason: second.notOk || second.result.reason || "transaction-retry-failed",
    list: second.notOkList,
  };
}

// ПЕРЕБАЗИРОВАНИЕ локальных правок на новую серверную карточку (конфликт: batch не прошёл,
// потому что элемент, который правили локально, изменён/удалён с другого устройства, или
// карточка создана там с другими id). Реплей диффа oldBase→local ПОВЕРХ серверной карточки:
//   • скалярные правки — как patch-card;
//   • patch-item по элементу, которого на сервере уже НЕТ → ЯВНЫЙ конфликт: решает
//     opts.onDeletedConflict(field, item) → "restore" (восстановить локальную версию add'ом)
//     или "drop" (принять чужое удаление, локальная правка осознанно отбрасывается).
//     Без колбэка — "restore" (ничего не теряем по умолчанию);
//   • remove-item отсутствующего — no-op;
//   • элементы, добавленные УДАЛЁННО (их нет в oldBase), дифф не удаляет → сохраняются.
// Возвращает слитую карточку (новый local; base для следующего flush — серверная карточка).
export function rebaseLocalProduction(oldBase, local, server, objectId, opts) {
  const onDeleted = (opts && opts.onDeletedConflict) || (() => "restore");
  // Legacy-элементы могли ещё не иметь id в server/oldBase. Нормализуем все три стороны одной
  // content-based функцией перед replay, иначе индексный id после удаления/перестановки мог бы
  // направить локальную правку в соседний элемент.
  const oldNorm = normalizeProductionIds([oldBase]).list[0] || oldBase;
  const localNorm = normalizeProductionIds([local]).list[0] || local;
  const serverNorm = normalizeProductionIds([server]).list[0] || server;
  const cmds = diffProductionToCommands(oldNorm, localNorm, objectId, 0);
  let cur = [serverNorm];
  for (const c of cmds) {
    let cc = c;
    if (c.type === "patch-item") {
      const arr = cur[0][c.field] || [];
      if (!arr.some(x => x && x.id === c.itemId)) {
        const item = (localNorm[c.field] || []).find(x => x && x.id === c.itemId);
        if (!item) continue;
        if (onDeleted(c.field, item) !== "restore") continue; // «принять удаление» — правка отброшена ОСОЗНАННО
        cc = { type: "add-item", objectId, field: c.field, item };
      }
    }
    const r = applyProductionCommand(cur, cc);
    if (r.ok) cur = r.list; // не ok (дубль add и т.п.) — пропускаем, элемент уже есть
  }
  return cur[0];
}

const _stableForId = value => {
  if (Array.isArray(value)) return value.map(_stableForId);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).filter(k => k !== "id").sort()) out[key] = _stableForId(value[key]);
  return out;
};
const _idHash = value => {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

// Присвоить стабильные ДЕТЕРМИНИРОВАННЫЕ id элементам массивов без id / с повторяющимися id.
// ID строится из поля и content-hash элемента (без id), поэтому перестановка строк не меняет
// адресацию. Одинаковые дубли получают детерминированные "_" по порядку. Это особенно важно для
// первой явной правки старой карточки: индексные id могли попасть в соседний этап после удаления.
export function normalizeProductionIds(list) {
  let changed = false;
  const out = (Array.isArray(list) ? list : []).map(card => {
    if (!card || typeof card !== "object") return card;
    let cardChanged = false;
    const nc = { ...card };
    for (const field of ARRAY_FIELDS) {
      const arr = card[field];
      if (!Array.isArray(arr)) continue;
      const idCounts = new Map();
      for (const item of arr) {
        const id = item && typeof item === "object" ? item.id : null;
        if (id != null && id !== "") idCounts.set(id, (idCounts.get(id) || 0) + 1);
      }
      const seen = new Set();
      let fieldChanged = false;
      const freshId = (item, index) => {
        const seed = item && typeof item === "object" ? _stableForId(item) : { value: item, index };
        let cand = "auto:" + field + ":" + _idHash(seed);
        while (seen.has(cand)) cand += "_";
        return cand;
      };
      const na = arr.map((it, index) => {
        if (!it || typeof it !== "object") { fieldChanged = true; const id = freshId(it, index); seen.add(id); return { id, _broken: true, value: it }; }
        let id = it.id;
        // Если один id встречается несколько раз, НЕ сохраняем «первый попавшийся»: после
        // перестановки строк на другом устройстве первым мог стать другой элемент, и patch ушёл бы
        // в него. Все участники дубля получают content-id; уникальные сохранённые id не меняем.
        if (id == null || id === "" || idCounts.get(id) > 1 || seen.has(id)) {
          id = freshId(it, index);
          fieldChanged = true;
        }
        seen.add(id);
        return id === it.id ? it : { ...it, id };
      });
      if (fieldChanged) { nc[field] = na; cardChanged = true; }
    }
    if (cardChanged) changed = true;
    return cardChanged ? nc : card;
  });
  return { changed, list: out };
}

// Объекты, состояние которых реально затрагивает команда. Нужны для немедленной
// публикации клиентского кабинета после подтверждённой транзакции.
export function productionCommandObjectIds(command) {
  const ids = [];
  const seen = new Set();
  const visit = cmd => {
    if (!cmd || typeof cmd !== "object" || cmd.type === "resolve-change") return;
    if (cmd.objectId != null && String(cmd.objectId).trim()) {
      const id = String(cmd.objectId);
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
    if (cmd.type === "batch" && Array.isArray(cmd.commands)) cmd.commands.forEach(visit);
  };
  visit(command);
  return ids;
}
