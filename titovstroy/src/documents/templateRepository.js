import {
  activateTemplateVersion,
  archiveTemplate,
  copyTemplate,
  createTemplate,
  emptyTemplateStore,
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

  async function loadTemplates() {
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
    const transaction = await storage.mutateTransaction(templatesKey, list => {
      outcome = command(normalizeTemplateStore(list?.[0]));
      return outcome.ok ? [outcome.store] : undefined;
    });
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
    copyTemplate: (sourceTemplateId, input, actor, now) => transactTemplates(store => copyTemplate(store, sourceTemplateId, input, actor, now)),
    saveDraft: (templateId, contentJson, actor, now, metadata) => transactTemplates(store => saveTemplateDraft(store, templateId, contentJson, actor, now, metadata)),
    publish: (templateId, publication, actor, now) => transactTemplates(store => publishTemplateDraft(store, templateId, publication, actor, now)),
    rollback: (templateId, versionId, actor, now) => transactTemplates(store => activateTemplateVersion(store, templateId, versionId, actor, now)),
    archive: (templateId, actor, now) => transactTemplates(store => archiveTemplate(store, templateId, actor, now)),
  };
}
