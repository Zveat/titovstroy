import { describe, expect, it } from "vitest";
import {
  archiveTemplate,
  activateTemplateVersion,
  buildTemplateActions,
  copyTemplate,
  createTemplate,
  emptyTemplateStore,
  getActiveTemplateVersion,
  getTemplateEditorState,
  importLegacyTemplateCatalog,
  filterTemplates,
  normalizeTemplateStore,
  publishTemplateDraft,
  saveTemplateDraft,
  validateTemplateContent,
} from "./templateModel.js";

const ACTOR = { id: "u-admin", name: "Администратор" };
const doc = (text, fields = []) => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text }] },
    ...fields.map(fieldId => ({ type: "paragraph", content: [{ type: "protectedField", attrs: { fieldId } }] })),
  ],
});

function createRepairDraft(content = doc("Первая версия", ["contract.number"])) {
  const created = createTemplate(emptyTemplateStore(), {
    id: "repair",
    type: "repair_fiz",
    name: "Договор ремонта",
    category: "repair",
    supportedExports: ["pdf", "gdoc", "docx"],
    usageContexts: ["contract"],
    source: "custom",
  }, ACTOR, 10);
  return saveTemplateDraft(created.store, "repair", content, ACTOR, 20).store;
}

function publish(store, label, now) {
  return publishTemplateDraft(store, "repair", {
    contentJson: doc(label, ["contract.number"]),
    normalizedText: label,
    fieldIds: ["contract.number"],
    page: { size: "A4" },
    checksum: `sum-${label}`,
    parityReport: { ok: true },
    exportChecks: { pdf: true, gdoc: true, docx: true },
    requiredFieldIds: ["contract.number"],
    manualLegalReview: true,
  }, ACTOR, now);
}

describe("document template model", () => {
  it("normalizes invalid persisted values to an empty safe store", () => {
    expect(normalizeTemplateStore(null)).toEqual(emptyTemplateStore());
    expect(normalizeTemplateStore({ templates: "broken" })).toEqual(emptyTemplateStore());
  });

  it("keeps draft changes separate from the active published version", () => {
    const v1 = publish(createRepairDraft(), "v1", 100);
    expect(v1.ok).toBe(true);
    const edited = saveTemplateDraft(v1.store, "repair", doc("draft-v2", ["contract.number"]), ACTOR, 200);
    expect(edited.ok).toBe(true);
    expect(getActiveTemplateVersion(edited.store, "repair_fiz").contentJson).toEqual(doc("v1", ["contract.number"]));
    expect(edited.value.draft.contentJson).toEqual(doc("draft-v2", ["contract.number"]));
  });

  it("keeps imported preview metadata when an editor saves the draft", () => {
    const created = createTemplate(emptyTemplateStore(), {
      id: "legacy-preview",
      type: "annex",
      name: "Дополнительное соглашение",
      requiredFieldIds: ["contract.mainNumber"],
    }, ACTOR, 10);
    const imported = saveTemplateDraft(created.store, "legacy-preview", doc("Юридический текст", ["contract.mainNumber"]), ACTOR, 20, {
      previewVariables: { "contract.mainNumber": "1019" },
      legacyFingerprint: "fingerprint-1",
    });
    const edited = saveTemplateDraft(imported.store, "legacy-preview", doc("Юридический текст без изменений", ["contract.mainNumber"]), ACTOR, 30, {
      page: { size: "A4" },
    });

    expect(edited.value.requiredFieldIds).toEqual(["contract.mainNumber"]);
    expect(edited.value.draft.previewVariables).toEqual({ "contract.mainNumber": "1019" });
    expect(edited.value.draft.legacyFingerprint).toBe("fingerprint-1");
  });

  it("keeps preview metadata in a published immutable version", () => {
    const created = createTemplate(emptyTemplateStore(), {
      id: "legacy-preview",
      type: "annex",
      name: "Дополнительное соглашение",
    }, ACTOR, 10);
    const imported = saveTemplateDraft(created.store, "legacy-preview", doc("Юридический текст", ["contract.mainNumber"]), ACTOR, 20, {
      previewVariables: { "contract.mainNumber": "1019" },
    });
    const published = publishTemplateDraft(imported.store, "legacy-preview", {
      contentJson: imported.value.draft.contentJson,
      requiredFieldIds: ["contract.mainNumber"],
      manualLegalReview: true,
      exportChecks: { pdf: true, gdoc: true, docx: true },
    }, ACTOR, 30);

    expect(published.ok).toBe(true);
    expect(published.value.versions[0].previewVariables).toEqual({ "contract.mainNumber": "1019" });
    expect(getTemplateEditorState(published.value)).toEqual({
      contentJson: doc("Юридический текст", ["contract.mainNumber"]),
      previewVariables: { "contract.mainNumber": "1019" },
      page: {},
    });
  });

  it("publishes immutable versions and rollback only selects an older version", () => {
    const v1 = publish(createRepairDraft(), "v1", 100).store;
    const withDraft = saveTemplateDraft(v1, "repair", doc("v2", ["contract.number"]), ACTOR, 200).store;
    const v2 = publish(withDraft, "v2", 300).store;
    const rolled = activateTemplateVersion(v2, "repair", "repair:v1", ACTOR, 400);

    expect(rolled.ok).toBe(true);
    expect(rolled.store.templates[0].versions).toHaveLength(2);
    expect(rolled.store.templates[0].activeVersionId).toBe("repair:v1");
    expect(rolled.store.templates[0].versions[1].contentJson).toEqual(doc("v2", ["contract.number"]));
  });

  it("copies published content into a new independent draft", () => {
    const source = publish(createRepairDraft(), "v1", 100).store;
    const copied = copyTemplate(source, "repair", {
      id: "repair-copy",
      name: "Копия договора",
    }, ACTOR, 500);

    expect(copied.ok).toBe(true);
    expect(copied.store.templates).toHaveLength(2);
    expect(copied.value.activeVersionId).toBe(null);
    expect(copied.value.versions).toEqual([]);
    expect(copied.value.draft.contentJson).toEqual(doc("v1", ["contract.number"]));
    copied.value.draft.contentJson.content[0].content[0].text = "Изменено";
    expect(getActiveTemplateVersion(source, "repair_fiz").contentJson.content[0].content[0].text).toBe("v1");
  });

  it("copies the legal field requirements and preview values with an imported template", () => {
    const created = createTemplate(emptyTemplateStore(), {
      id: "legacy-source",
      type: "annex",
      name: "Дополнительное соглашение",
      requiredFieldIds: ["contract.mainNumber"],
    }, ACTOR, 10);
    const drafted = saveTemplateDraft(created.store, "legacy-source", doc("Текст", ["contract.mainNumber"]), ACTOR, 20, {
      previewVariables: { "contract.mainNumber": "1019" },
    });
    const copied = copyTemplate(drafted.store, "legacy-source", { id: "legacy-copy", name: "Копия" }, ACTOR, 30);

    expect(copied.value.requiredFieldIds).toEqual(["contract.mainNumber"]);
    expect(copied.value.draft.previewVariables).toEqual({ "contract.mainNumber": "1019" });
  });

  it("blocks a legacy first publication without parity and manual legal review", () => {
    const created = createTemplate(emptyTemplateStore(), {
      id: "legacy-repair",
      type: "repair_fiz",
      name: "Legacy",
      source: "legacy-repair",
    }, ACTOR, 1).store;
    const withDraft = saveTemplateDraft(created, "legacy-repair", doc("legal", ["contract.number"]), ACTOR, 2).store;
    const denied = publishTemplateDraft(withDraft, "legacy-repair", {
      contentJson: doc("legal", ["contract.number"]),
      requiredFieldIds: ["contract.number"],
      parityReport: { ok: false },
      manualLegalReview: false,
      exportChecks: { pdf: true, gdoc: true, docx: true },
    }, ACTOR, 3);
    expect(denied.ok).toBe(false);
    expect(denied.reason).toMatch(/сравнен|провер/iu);
  });

  it("requires explicit legal review for every imported legacy document", () => {
    const created = createTemplate(emptyTemplateStore(), {
      id: "legacy-avr",
      type: "avr_r1",
      name: "АВР",
      source: "legacy-import",
    }, ACTOR, 1).store;
    const withDraft = saveTemplateDraft(created, "legacy-avr", doc("legal", ["avr.number"]), ACTOR, 2).store;
    const denied = publishTemplateDraft(withDraft, "legacy-avr", {
      contentJson: doc("legal", ["avr.number"]),
      requiredFieldIds: ["avr.number"],
      fieldIds: ["avr.number"],
      parityReport: { ok: true },
      manualLegalReview: false,
      exportChecks: { pdf: true, gdoc: true, docx: true },
    }, ACTOR, 3);
    expect(denied.ok).toBe(false);
    expect(denied.reason).toMatch(/ручн|юрид/iu);
  });

  it("validates required protected fields without rewriting content", () => {
    expect(validateTemplateContent(doc("Текст", ["contract.number"]), ["contract.number"])).toEqual({ ok: true, errors: [] });
    expect(validateTemplateContent(doc("Текст"), ["contract.number"])).toEqual({
      ok: false,
      errors: ["Нет обязательного поля: contract.number"],
    });
  });

  it("archives metadata without deleting versions", () => {
    const published = publish(createRepairDraft(), "v1", 100).store;
    const archived = archiveTemplate(published, "repair", ACTOR, 600);
    expect(archived.ok).toBe(true);
    expect(archived.value.status).toBe("archived");
    expect(archived.value.versions).toHaveLength(1);
  });

  it("filters the template library by query, category, and status", () => {
    const templates = [
      { id: "repair", name: "Договор ремонта", category: "contracts", type: "repair_fiz", status: "published" },
      { id: "custom", name: "Памятка клиенту", category: "custom", type: "custom", status: "draft" },
    ];
    expect(filterTemplates(templates, { query: "ремонт" }).map(item => item.id)).toEqual(["repair"]);
    expect(filterTemplates(templates, { category: "custom", status: "draft" }).map(item => item.id)).toEqual(["custom"]);
    expect(filterTemplates(templates, { status: "archived" })).toEqual([]);
  });

  it("builds only actions allowed by the role", () => {
    const template = { id: "repair", status: "published", versions: [{ id: "repair:v1" }] };
    expect(buildTemplateActions(template, {
      templateView: "all",
      templateEdit: "all",
      templateArchive: "all",
      templateRollback: "all",
    })).toEqual(["open", "copy", "archive", "history"]);
    expect(buildTemplateActions(template, {
      templateView: "all",
      templateEdit: "none",
      templateArchive: "none",
      templateRollback: "none",
    })).toEqual(["open"]);
    expect(buildTemplateActions(template, { templateView: "none" })).toEqual([]);
  });

  it("imports a legacy catalog without overwriting existing drafts and is idempotent", () => {
    const existing = createRepairDraft(doc("Пользовательский черновик", ["contract.number"]));
    const seeds = [
      { template: { id: "repair", type: "repair_fiz", name: "Договор ремонта", source: "legacy-import" }, contentJson: doc("Системный договор", ["contract.number"]), metadata: { legacyFingerprint: "repair-1" } },
      { template: { id: "avr", type: "avr_r1", name: "АВР", source: "legacy-import" }, contentJson: doc("Акт", ["avr.number"]), metadata: { legacyFingerprint: "avr-1" } },
    ];

    const first = importLegacyTemplateCatalog(existing, seeds, ACTOR, 700);
    expect(first.ok).toBe(true);
    expect(first.value).toEqual({ createdIds: ["avr"], skippedIds: ["repair"] });
    expect(first.store.templates.find(item => item.id === "repair").draft.contentJson).toEqual(doc("Пользовательский черновик", ["contract.number"]));
    expect(first.store.templates.find(item => item.id === "avr").draft.contentJson).toEqual(doc("Акт", ["avr.number"]));

    const second = importLegacyTemplateCatalog(first.store, seeds, ACTOR, 800);
    expect(second.ok).toBe(true);
    expect(second.value).toEqual({ createdIds: [], skippedIds: ["repair", "avr"] });
    expect(second.store).toEqual(first.store);
  });

  it("preserves the stricter source policy of each imported legal template", () => {
    const seeds = [
      {
        template: {
          id: "repair",
          type: "repair_fiz",
          name: "Договор ремонта",
          source: "legacy-repair",
        },
        contentJson: doc("Договор", ["contract.number"]),
        metadata: { source: "legacy-repair" },
      },
      {
        template: {
          id: "avr",
          type: "avr_r1",
          name: "АВР",
          source: "legacy-import",
        },
        contentJson: doc("Акт", ["avr.number"]),
        metadata: { source: "legacy-import" },
      },
    ];

    const imported = importLegacyTemplateCatalog(emptyTemplateStore(), seeds, ACTOR, 700);

    expect(imported.ok).toBe(true);
    expect(imported.store.templates.find(item => item.id === "repair")?.source).toBe("legacy-repair");
    expect(imported.store.templates.find(item => item.id === "avr")?.source).toBe("legacy-import");
  });

  it("rejects the whole legacy catalog when one seed is invalid", () => {
    const source = emptyTemplateStore();
    const result = importLegacyTemplateCatalog(source, [
      { template: { id: "repair", type: "repair_fiz" }, contentJson: doc("Договор", ["contract.number"]) },
      { template: { id: "broken", type: "avr_r1" }, contentJson: { type: "broken" } },
    ], ACTOR, 900);
    expect(result.ok).toBe(false);
    expect(result.store).toEqual(source);
  });
});
