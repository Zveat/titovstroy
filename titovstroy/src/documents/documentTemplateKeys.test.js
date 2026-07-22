import { describe, expect, it } from "vitest";
import { createDocumentTemplateFeaturePolicy } from "./documentTemplateKeys.js";

describe("document template feature policy", () => {
  it("fully hides the feature and its backup writes when disabled", () => {
    expect(createDocumentTemplateFeaturePolicy(false, false)).toEqual({
      enabled: false,
      showAdmin: false,
      includeBackups: false,
      allowInstances: false,
    });
  });

  it("shows the editor without switching existing document exports to the pilot", () => {
    expect(createDocumentTemplateFeaturePolicy(true, false)).toEqual({
      enabled: true,
      showAdmin: true,
      includeBackups: true,
      allowInstances: false,
    });
  });

  it("opens document instances only together with the explicitly enabled export pilot", () => {
    expect(createDocumentTemplateFeaturePolicy(true, true)).toEqual({
      enabled: true,
      showAdmin: true,
      includeBackups: true,
      allowInstances: true,
    });
  });
});
