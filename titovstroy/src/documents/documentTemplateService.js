import { REPAIR_TEMPLATE_ENABLED } from "./documentTemplateKeys.js";
import { createTemplateRepository } from "./templateRepository.js";

const actionLabels = Object.freeze({
  createTemplate: "создал шаблон",
  copyTemplate: "создал шаблон",
  saveDraft: "изменил черновик",
  publish: "опубликовал версию",
  rollback: "откатил версию",
  archive: "архивировал шаблон",
});

export function createDocumentTemplateService({ storage, actor, audit, legacyRepairRenderer } = {}) {
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
    repairTemplateEnabled: REPAIR_TEMPLATE_ENABLED,
    loadTemplates: repository.loadTemplates,
    loadSnapshots: repository.loadSnapshots,
    mutateSnapshots: repository.mutateSnapshots,
    createTemplate: input => run("createTemplate", input?.id, (by, now) => repository.createTemplate(input, by, now)),
    copyTemplate: (sourceTemplateId, input) => run("copyTemplate", input?.id, (by, now) => repository.copyTemplate(sourceTemplateId, input, by, now)),
    saveDraft: (templateId, contentJson, metadata) => run("saveDraft", templateId, (by, now) => repository.saveDraft(templateId, contentJson, by, now, metadata)),
    publish: (templateId, publication) => run("publish", templateId, (by, now) => repository.publish(templateId, publication, by, now)),
    rollback: (templateId, versionId) => run("rollback", templateId, (by, now) => repository.rollback(templateId, versionId, by, now)),
    archive: templateId => run("archive", templateId, (by, now) => repository.archive(templateId, by, now)),
    renderLegacyRepair: (...args) => {
      if (typeof legacyRepairRenderer !== "function") throw new Error("Действующий генератор договора не подключён");
      return legacyRepairRenderer(...args);
    },
  };
}
