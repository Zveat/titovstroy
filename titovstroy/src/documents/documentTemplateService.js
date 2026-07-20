import { REPAIR_TEMPLATE_ENABLED } from "./documentTemplateKeys.js";
import { appendDocumentRevision, createDocumentSnapshot, getSnapshotForDocument } from "./documentSnapshots.js";
import { createRepairLegacySeed } from "./repairLegacySeed.js";
import { createTemplateRepository } from "./templateRepository.js";

const actionLabels = Object.freeze({
  createTemplate: "создал шаблон",
  copyTemplate: "создал шаблон",
  saveDraft: "изменил черновик",
  publish: "опубликовал версию",
  rollback: "откатил версию",
  archive: "архивировал шаблон",
  seedLegacyRepair: "импортировал действующий договор",
});

export function createDocumentTemplateService({
  storage,
  actor,
  audit,
  legacyRepairRenderer,
  repairTemplateEnabled = REPAIR_TEMPLATE_ENABLED,
} = {}) {
  const repository = createTemplateRepository({ storage });
  const currentActor = () => typeof actor === "function" ? actor() : actor;

  const run = async (method, entityId, invoke) => {
    const result = await invoke(currentActor(), Date.now());
    if (result.ok && result.committed && typeof audit === "function") {
      audit({
        entity: "document_template",
        entityId: entityId || result.value?.id || "",
        action: actionLabels[method],
        source: "manual",
        new: result.value?.activeVersionId || result.value?.status || "",
      });
    }
    return result;
  };

  return {
    repairTemplateEnabled,
    loadTemplates: repository.loadTemplates,
    loadSnapshots: repository.loadSnapshots,
    mutateSnapshots: repository.mutateSnapshots,
    getSnapshot: async documentId => {
      const loaded = await repository.loadSnapshots();
      return { ...loaded, snapshot: loaded.status === "found" ? getSnapshotForDocument(loaded.snapshots, documentId) : null };
    },
    createSnapshot: async input => {
      let failure = "";
      const result = await repository.mutateSnapshots(list => {
        try {
      const documentId = `contract:${input?.contract?.id || ""}`;
      const existing = list.filter(item => item?.documentId === documentId);
      if (existing.length > 0) return undefined;
      return [...list, createDocumentSnapshot({ ...input, actor: currentActor(), now: Date.now() })];
        } catch (error) {
          failure = error?.message || "Снимок документа не создан";
          return undefined;
        }
      });
      return failure ? { ...result, ok: false, committed: false, reason: failure } : result;
    },
    appendSnapshotRevision: async (documentId, contentJson) => {
      let failure = "";
      const result = await repository.mutateSnapshots(list => {
        try {
      const matches = list.map((item, index) => ({ item, index })).filter(entry => entry.item?.documentId === documentId);
      if (matches.length !== 1) {
        failure = "Экземпляр документа не найден однозначно";
        return undefined;
      }
      const next = [...list];
      next[matches[0].index] = appendDocumentRevision(matches[0].item, contentJson, currentActor(), Date.now());
      return next;
        } catch (error) {
          failure = error?.message || "Индивидуальная версия не сохранена";
          return undefined;
        }
      });
      return failure ? { ...result, ok: false, committed: false, reason: failure } : result;
    },
    createTemplate: input => run("createTemplate", input?.id, (by, now) => repository.createTemplate(input, by, now)),
    copyTemplate: (sourceTemplateId, input) => run("copyTemplate", input?.id, (by, now) => repository.copyTemplate(sourceTemplateId, input, by, now)),
    saveDraft: (templateId, contentJson, metadata) => run("saveDraft", templateId, (by, now) => repository.saveDraft(templateId, contentJson, by, now, metadata)),
    publish: (templateId, publication) => run("publish", templateId, (by, now) => repository.publish(templateId, publication, by, now)),
    rollback: (templateId, versionId) => run("rollback", templateId, (by, now) => repository.rollback(templateId, versionId, by, now)),
    archive: templateId => run("archive", templateId, (by, now) => repository.archive(templateId, by, now)),
    seedLegacyRepair: async ({ requiredFieldIds } = {}) => {
      if (!repairTemplateEnabled) return { ok: false, committed: false, reason: "Пилот шаблонов выключен" };
      const seed = createRepairLegacySeed({ buildLegacyHtml: legacyRepairRenderer, requiredFieldIds });
      if (!seed.ok) return { ...seed, committed: false };
      return run("seedLegacyRepair", "repair-fiz-legacy", (by, now) => repository.createTemplateWithDraft({
        id: "repair-fiz-legacy",
        type: "repair_fiz",
        name: "Договор ремонта",
        category: "contracts",
        source: "legacy-repair",
        supportedExports: ["pdf", "gdoc", "docx"],
        usageContexts: ["objects"],
      }, seed.contentJson, by, now, {
        source: seed.source,
        legacyFingerprint: seed.legacyFingerprint,
        legacyNormalizedText: seed.legacyNormalizedText,
        importReport: seed.importReport,
      }));
    },
    renderLegacyRepair: (...args) => {
      if (typeof legacyRepairRenderer !== "function") throw new Error("Действующий генератор договора не подключён");
      return legacyRepairRenderer(...args);
    },
  };
}
