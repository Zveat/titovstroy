import {
  activateTemplateVersion,
  archiveTemplate,
  copyTemplate,
  createTemplate,
  emptyTemplateStore,
  importLegacyTemplateCatalog,
  normalizeTemplateStore,
  publishTemplateDraft,
  saveTemplateDraft,
} from "./templateModel.js";
import { DOCUMENT_SNAPSHOTS_KEY, DOCUMENT_TEMPLATES_KEY } from "./documentTemplateKeys.js";

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

const parseList = raw => {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false, reason: "not-array" };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
};

export function createTemplateRepository({
  storage,
  templatesKey = DOCUMENT_TEMPLATES_KEY,
  snapshotsKey = DOCUMENT_SNAPSHOTS_KEY,
} = {}) {
  if (!storage?.getResult || !storage?.mutateTransaction) throw new Error("Для шаблонов требуется storage с getResult и mutateTransaction");

  // СКЛАД ШАБЛОНОВ ЧИТАЕТСЯ НЕ НА КАЖДОЕ НАЖАТИЕ. Замер на боевой 28 сентября: узел
  // весит 1,83 МБ (одни черновики, опубликован ровно один шаблон), и каждое нажатие
  // «PDF» или «Google Doc» тянуло его целиком — чтобы выяснить, что шаблона нет, и
  // отдать документ старому генератору. На компьютере это доли секунды, на телефоне по
  // мобильной сети — секунды, и за эти секунды iOS успевает отобрать у нажатия право
  // открыть окно: и печать, и вход в Google гасли МОЛЧА. Отсюда «раньше работало» —
  // пока склад был маленьким, всё успевало.
  //
  // Поэтому у чтения появился срок годности, и просит его ТОЛЬКО экспорт: редактору
  // шаблонов свежесть важнее, он читает как раньше, без срока. Любая запись склада
  // сбрасывает запомненное, так что своя же правка не потеряется.
  let memo = null;                       // { at, value }
  const forgetTemplates = () => { memo = null; };

  async function loadTemplates({ maxAgeMs = 0 } = {}) {
    const age = Number(maxAgeMs) || 0;
    if (memo && age > 0 && Date.now() - memo.at < age) return memo.value;
    const value = await readTemplates();
    // Запоминаем только целое и прочитанное: «недоступно» и «испорчено» кешировать
    // нельзя — иначе одна неудачная секунда связи заморозила бы экспорт на весь срок.
    if (value.status === "found") memo = { at: Date.now(), value };
    return value;
  }

  async function readTemplates() {
    const result = await storage.getResult(templatesKey);
    if (result?.status !== "found") {
      return { status: result?.status || "unavailable", store: emptyTemplateStore() };
    }
    const parsed = parseList(result.value);
    if (!parsed.ok || parsed.value.length !== 1) return { status: "corrupt", store: emptyTemplateStore(), reason: parsed.reason || "invalid-store-count" };
    const candidate = parsed.value[0];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !Array.isArray(candidate.templates)) {
      return { status: "corrupt", store: emptyTemplateStore(), reason: "invalid-template-store" };
    }
    return { status: "found", store: normalizeTemplateStore(candidate) };
  }

  async function loadSnapshots() {
    const result = await storage.getResult(snapshotsKey);
    if (result?.status !== "found") return { status: result?.status || "unavailable", snapshots: [] };
    const parsed = parseList(result.value);
    if (!parsed.ok) return { status: "corrupt", snapshots: [], reason: parsed.reason };
    return { status: parsed.value.length ? "found" : "empty", snapshots: clone(parsed.value) };
  }

  async function transactTemplates(command) {
    let outcome = { ok: false, reason: "not-run" };
    forgetTemplates();                   // правим склад — запомненное больше не годится
    const transaction = await storage.mutateTransaction(templatesKey, list => {
      outcome = command(normalizeTemplateStore(list?.[0]));
      return outcome.ok ? [outcome.store] : undefined;
    });
    forgetTemplates();                   // и после записи тоже: в памяти уже новая версия
    return transaction?.committed && outcome.ok
      ? { ...outcome, committed: true }
      : { ok: false, committed: false, reason: outcome.reason === "not-run" ? (transaction?.reason || "transaction-failed") : (outcome.reason || transaction?.reason || "transaction-failed") };
  }

  async function mutateSnapshots(mutator) {
    let outcome = { ok: false, reason: "not-run" };
    const transaction = await storage.mutateTransaction(snapshotsKey, list => {
      const current = clone(Array.isArray(list) ? list : []);
      const next = mutator(current);
      if (!Array.isArray(next)) {
        outcome = { ok: false, reason: "snapshot-mutator-aborted" };
        return undefined;
      }
      outcome = { ok: true, snapshots: clone(next) };
      return next;
    });
    return transaction?.committed && outcome.ok
      ? { ...outcome, committed: true }
      : { ok: false, committed: false, reason: outcome.reason === "not-run" ? (transaction?.reason || "transaction-failed") : (outcome.reason || transaction?.reason || "transaction-failed") };
  }

  return {
    loadTemplates,
    loadSnapshots,
    mutateSnapshots,
    createTemplate: (input, actor, now) => transactTemplates(store => createTemplate(store, input, actor, now)),
    createTemplateWithDraft: (input, contentJson, actor, now, metadata) => transactTemplates(store => {
      const created = createTemplate(store, input, actor, now);
      if (!created.ok) return created;
      return saveTemplateDraft(created.store, created.value.id, contentJson, actor, now, metadata);
    }),
    importLegacyCatalog: (seeds, actor, now) => transactTemplates(store => importLegacyTemplateCatalog(store, seeds, actor, now)),
    copyTemplate: (sourceTemplateId, input, actor, now) => transactTemplates(store => copyTemplate(store, sourceTemplateId, input, actor, now)),
    saveDraft: (templateId, contentJson, actor, now, metadata) => transactTemplates(store => saveTemplateDraft(store, templateId, contentJson, actor, now, metadata)),
    publish: (templateId, publication, actor, now) => transactTemplates(store => publishTemplateDraft(store, templateId, publication, actor, now)),
    rollback: (templateId, versionId, actor, now) => transactTemplates(store => activateTemplateVersion(store, templateId, versionId, actor, now)),
    archive: (templateId, actor, now) => transactTemplates(store => archiveTemplate(store, templateId, actor, now)),
  };
}
