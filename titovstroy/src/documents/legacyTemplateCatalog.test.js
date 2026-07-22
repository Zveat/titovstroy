import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPE_REGISTRY } from "./documentTypeRegistry.js";
import {
  LEGACY_TEMPLATE_DEFINITIONS,
  createLegacyTemplateCatalogSeeds,
} from "./legacyTemplateCatalog.js";

const htmlFor = type => {
  const definition = LEGACY_TEMPLATE_DEFINITIONS.find(item => item.type === type);
  const blocks = definition.markers.map(marker => marker.kind === "table"
    ? `<table><tr><td>${marker.raw}</td></tr></table>`
    : `<p>${marker.raw}</p>`);
  return `<html><body><h1>${type}</h1>${blocks.join("")}</body></html>`;
};

const renderers = {
  contract: contract => htmlFor(contract.type),
  podryad: model => htmlFor(model.kind === "annex" ? "podryad_annex" : "podryad"),
  avr: () => htmlFor("avr_r1").replace("</body>", "<p>TS-MONEY-WORDS</p></body>"),
  moneyWords: () => "TS-MONEY-WORDS",
};

describe("complete legacy template catalog", () => {
  it("builds one editable seed for every registered legal document", () => {
    const result = createLegacyTemplateCatalogSeeds(renderers);
    expect(result.ok).toBe(true);
    expect(result.seeds.map(seed => seed.template.type)).toEqual(DOCUMENT_TYPE_REGISTRY.map(item => item.id));
    expect(result.seeds.every(seed => seed.contentJson.type === "doc")).toBe(true);
    expect(result.seeds.every(seed => seed.metadata.importReport.ok)).toBe(true);
    expect(result.seeds.every(seed => seed.metadata.previewVariables && typeof seed.metadata.previewVariables === "object")).toBe(true);
    expect(result.seeds.every(seed => seed.template.requiredFieldIds.every(fieldId => seed.metadata.previewVariables[fieldId] != null))).toBe(true);
    expect(result.seeds.find(seed => seed.template.type === "repair_fiz")?.template.source).toBe("legacy-repair");
    expect(result.seeds.filter(seed => seed.template.type !== "repair_fiz").every(seed => seed.template.source === "legacy-import")).toBe(true);
    expect(JSON.stringify(result.seeds.find(seed => seed.template.type === "avr_r1")?.contentJson)).toContain("avr.totalWords");
  });

  it("refuses the entire catalog when a renderer or required marker is missing", () => {
    expect(createLegacyTemplateCatalogSeeds({ ...renderers, avr: null })).toMatchObject({ ok: false, seeds: [] });
    const broken = createLegacyTemplateCatalogSeeds({ ...renderers, contract: () => "<html><body>broken</body></html>" });
    expect(broken).toMatchObject({ ok: false, seeds: [] });
    expect(broken.reason).toMatch(/маркер|генератор/iu);
  });

  it("uses unique marker values inside each document to avoid accidental legal-text replacement", () => {
    for (const definition of LEGACY_TEMPLATE_DEFINITIONS) {
      const raw = definition.markers.map(marker => marker.raw);
      expect(new Set(raw).size).toBe(raw.length);
      expect(definition.requiredFieldIds.every(fieldId => definition.markers.some(marker => marker.fieldId === fieldId))).toBe(true);
    }
  });
});
