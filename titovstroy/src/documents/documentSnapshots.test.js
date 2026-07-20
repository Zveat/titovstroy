import { describe, expect, it } from "vitest";
import {
  appendDocumentRevision,
  createDocumentSnapshot,
  documentCreatedAt,
  getSnapshotForDocument,
  isTemplateEligible,
  snapshotContent,
} from "./documentSnapshots.js";

const doc = text => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const ACTOR = { id: "admin-1", name: "Администратор" };
const VERSION = {
  id: "repair:v1",
  templateId: "repair",
  publishedAt: 2000,
  contentJson: doc("legal v1"),
  page: { size: "A4" },
};
const SNAPSHOT_INPUT = {
  contract: { id: "3000", objectId: "object-1", type: "repair_fiz", createdAt: 3000 },
  version: VERSION,
  variables: { "contract.number": "1019" },
  canonicalHtml: "<p>legal v1</p>",
  title: "Договор №1019",
  actor: ACTOR,
  now: 3500,
};

describe("immutable document snapshots", () => {
  it("uses the real creation time and never applies a template retroactively", () => {
    expect(documentCreatedAt({ id: "1000", createdAt: 1000 })).toBe(1000);
    expect(documentCreatedAt({ id: "3000" })).toBe(3000);
    expect(isTemplateEligible({ id: "1000", createdAt: 1000 }, { publishedAt: 2000 })).toBe(false);
    expect(isTemplateEligible({ id: "3000", createdAt: 3000 }, { publishedAt: 2000 })).toBe(true);
  });

  it("deep-clones the published version, variables, and canonical output", () => {
    const snap = createDocumentSnapshot(SNAPSHOT_INPUT);
    const changedTemplate = { ...VERSION, contentJson: doc("new global text") };
    VERSION.contentJson.content[0].content[0].text = "mutated source";
    SNAPSHOT_INPUT.variables["contract.number"] = "changed";
    expect(snap.contentSnapshot).toEqual(doc("legal v1"));
    expect(changedTemplate.contentJson).not.toEqual(snap.contentSnapshot);
    expect(snap.variablesSnapshot["contract.number"]).toBe("1019");
    expect(snap.canonicalHtmlSnapshot).toBe("<p>legal v1</p>");
  });

  it("appends an individual revision without changing the base snapshot", () => {
    const snap = createDocumentSnapshot({ ...SNAPSHOT_INPUT, version: { ...VERSION, contentJson: doc("legal v1") }, variables: { "contract.number": "1019" } });
    const revised = appendDocumentRevision(snap, doc("individual edit"), ACTOR, 4000);
    expect(revised.instanceVersions).toHaveLength(1);
    expect(revised.instanceVersions[0]).toMatchObject({ id: "contract:3000:r1", savedById: "admin-1" });
    expect(snap.instanceVersions).toHaveLength(0);
    expect(snapshotContent(revised)).toEqual(doc("individual edit"));
    expect(snapshotContent(snap)).toEqual(doc("legal v1"));
  });

  it("finds exactly one snapshot and rejects ambiguous duplicate ids", () => {
    const snap = createDocumentSnapshot({ ...SNAPSHOT_INPUT, version: { ...VERSION, contentJson: doc("legal v1") }, variables: {} });
    expect(getSnapshotForDocument([snap], "contract:3000")).toEqual(snap);
    expect(getSnapshotForDocument([snap, structuredClone(snap)], "contract:3000")).toBe(null);
  });
});
