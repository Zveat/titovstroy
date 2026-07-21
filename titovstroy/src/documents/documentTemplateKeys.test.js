import { describe, expect, it } from "vitest";
import { createDocumentTemplateFeaturePolicy } from "./documentTemplateKeys.js";

describe("document template feature policy", () => {
  it("fully hides the feature and its backup writes when disabled", () => {
    expect(createDocumentTemplateFeaturePolicy(false)).toEqual({
      enabled: false,
      showAdmin: false,
      includeBackups: false,
      allowInstances: false,
    });
  });

  it("exposes every template surface only when explicitly enabled", () => {
    expect(createDocumentTemplateFeaturePolicy(true)).toEqual({
      enabled: true,
      showAdmin: true,
      includeBackups: true,
      allowInstances: true,
    });
  });
});
