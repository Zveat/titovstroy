// Журнал изменений: помесячное хранение + обёртки логирования по сущностям.
// Перенос из App.jsx без изменения логики.
import { CONTRACT_STATUSES, DEAL_STATUSES } from "../constants.js";
import { _auditYM, fmt } from "../format.js";
import { AUDIT_INDEX_KEY, AUDIT_MONTH_KEY } from "../storageKeys.js";
import { contractNetTotal } from "../utils.js";
import { _TIMEOUT, _TS_SUFFIX, _beginEditorWrite, _endEditorWrite, _fbAuthReady, _fbDb, _fbKey, _foreignDirty, _mayApplyEditorResult, _mem, _race, storage } from "./storage.js";
import { ref, runTransaction } from "firebase/database";

// Аудит-журнал. Структурная запись изменения:
//   {ts, userId, by, entity, entityId, label, objectId, field, action, old, new, detail, source}
//   entity: object|contract|estimate|finance_tx|user|client|stage|publish|document
//   source: manual (вручную) | import (импорт) | autosync (автосинк) | cabinet (клиентский кабинет)
// Хранится ПОМЕСЯЧНО (titovstroy-audit-ГГГГ-ММ, без лимита) + индекс существующих месяцев.
// Старый ключ titovstroy-audit больше НЕ пишется — он остаётся архивом (читается в общем журнале).
// Атомарное добавление записи в помесячный массив журнала.
// Firebase RTDB-транзакция сериализует одновременные записи → ни одна не теряется.
// В базе значение ключа — СТРОКА JSON (как во всём storage), поэтому и в транзакции строка.
export const _appendAuditEntry = async (mk, entry) => {
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
export const logChange = async (user, ev = {}) => {
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
export const writeAudit = (user, action, entity, entityId, detail = "") =>
  logChange(user, { action, entity, entityId, detail });

// Человекочитаемые поля объекта для журнала (форматируем «было/стало»)
export const OBJ_FIELD_META = {
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
export const _objLabel = (o) => (o?.clientName || o?.address || o?.objType || "Объект");
// Логируем изменения значимых полей объекта (по патчу): только реально изменившиеся.
// Весь хелпер в try/catch: журнал ни при каких условиях не должен мешать сохранению данных.
export const logObjChange = (user, obj, patch, source = "manual") => {
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
// Сумма договора (для журнала): сумма позиций со скидкой, иначе м²-расчёт, иначе totalCost.
export const contractAmount = (c) => {
  const ws = contractNetTotal(c);
  if (ws) return ws;
  if (c?.priceType === "sqm") return Math.round((Number(c?.pricePerSqm) || 0) * (Number(c?.area) || 0)) || 0;
  return Number(c?.totalCost) || 0;
};
export const _tng = (n) => (Math.round(Number(n) || 0)).toLocaleString("ru-RU") + " ₸";
export const _finTypeLbl = { income: "поступление", expense: "расход", transfer: "перевод" };
export const _cStatusLbl = (v) => (CONTRACT_STATUSES.find(s => s.key === (v || "draft")) || {}).label || v || "—";
// Логируем сохранение договора: создание, изменение суммы, изменение статуса.
// Весь хелпер в try/catch: журнал не должен мешать сохранению договора.
export const logContractSave = (user, oldC, newC) => {
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
