import { describe, expect, it } from "vitest";
import {
  archiveTemplate,
  activateTemplateVersion,
  copyTemplate,
  createTemplate,
  emptyTemplateStore,
  getActiveTemplateVersion,
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
});
