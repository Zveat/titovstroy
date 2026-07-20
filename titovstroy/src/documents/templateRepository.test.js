import { describe, expect, it } from "vitest";
import { createDocumentTemplateService } from "./documentTemplateService.js";
import { createTemplateRepository } from "./templateRepository.js";

const ACTOR = { id: "admin-1", name: "Администратор" };
const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Текст" }] }] };

const publication = {
  contentJson: DOC,
  normalizedText: "Текст",
  fieldIds: [],
  page: { size: "A4" },
  checksum: "checksum",
  parityReport: { ok: true },
  exportChecks: { pdf: true, gdoc: true, docx: true },
  requiredFieldIds: [],
  manualLegalReview: true,
};

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const queues = new Map();
  return {
    values,
    async getResult(key) {
      return values.has(key)
        ? { status: "found", value: values.get(key) }
        : { status: "empty", value: null };
    },
    async mutateTransaction(key, mutator) {
      const previous = queues.get(key) || Promise.resolve();
      let release;
      const current = new Promise(resolve => { release = resolve; });
      queues.set(key, previous.then(() => current));
      await previous;
      try {
        const raw = values.get(key);
        let list = [];
        if (typeof raw === "string") list = JSON.parse(raw);
        else if (Array.isArray(raw)) list = structuredClone(raw);
        const next = mutator(structuredClone(list));
        if (!Array.isArray(next)) return { committed: false, reason: "aborted" };
        values.set(key, JSON.stringify(next));
        return { committed: true, value: JSON.stringify(next) };
      } catch (error) {
        return { committed: false, reason: error.message };
      } finally {
        release();
      }
    },
  };
}

function failingStorage() {
  return {
    async getResult() { return { status: "unavailable", value: null }; },
    async mutateTransaction() { return { committed: false, reason: "network-down" }; },
  };
}

async function repositoryWithDraft(storage = fakeStorage()) {
  const repository = createTemplateRepository({ storage, templatesKey: "templates", snapshotsKey: "snapshots" });
  expect((await repository.createTemplate({ id: "repair", type: "repair_fiz", name: "Договор" }, ACTOR, 10)).ok).toBe(true);
  expect((await repository.saveDraft("repair", DOC, ACTOR, 20)).ok).toBe(true);
  return repository;
}

describe("transactional document template repository", () => {
  it("distinguishes empty, unavailable, and corrupt reads", async () => {
    expect((await createTemplateRepository({ storage: fakeStorage(), templatesKey: "templates" }).loadTemplates()).status).toBe("empty");
    expect((await createTemplateRepository({ storage: failingStorage(), templatesKey: "templates" }).loadTemplates()).status).toBe("unavailable");
    expect((await createTemplateRepository({ storage: fakeStorage({ templates: "not-json" }), templatesKey: "templates" }).loadTemplates()).status).toBe("corrupt");
    expect((await createTemplateRepository({ storage: fakeStorage({ templates: JSON.stringify([{ templates: "broken" }]) }), templatesKey: "templates" }).loadTemplates()).status).toBe("corrupt");
  });

  it("creates, saves, publishes, rolls back, and archives through transactions", async () => {
    const repository = await repositoryWithDraft();
    const published = await repository.publish("repair", publication, ACTOR, 100);
    expect(published).toMatchObject({ ok: true, committed: true });
    expect(published.value.activeVersionId).toBe("repair:v1");
    expect((await repository.rollback("repair", "repair:v1", ACTOR, 110)).ok).toBe(true);
    expect((await repository.archive("repair", ACTOR, 120)).value.status).toBe("archived");
  });

  it("allows only one publication of the same saved draft", async () => {
    const repository = await repositoryWithDraft();
    const [first, second] = await Promise.all([
      repository.publish("repair", publication, ACTOR, 100),
      repository.publish("repair", publication, ACTOR, 100),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect([first, second].find(result => !result.ok).reason).toMatch(/черновик|draft|version/iu);
    const loaded = await repository.loadTemplates();
    expect(loaded.store.templates[0].versions).toHaveLength(1);
  });

  it("never reports local success when the cloud transaction fails", async () => {
    const repository = createTemplateRepository({ storage: failingStorage(), templatesKey: "templates" });
    const created = await repository.createTemplate({ id: "repair", type: "repair_fiz" }, ACTOR, 10);
    expect(created).toMatchObject({ ok: false, committed: false });
    expect(created.reason).toMatch(/network-down/);
  });

  it("loads and mutates immutable snapshot arrays independently from templates", async () => {
    const storage = fakeStorage();
    const repository = createTemplateRepository({ storage, templatesKey: "templates", snapshotsKey: "snapshots" });
    expect((await repository.loadSnapshots()).status).toBe("empty");
    const added = await repository.mutateSnapshots(list => [...list, { documentId: "doc-1", objectId: "obj-1" }]);
    expect(added).toMatchObject({ ok: true, committed: true });
    expect((await repository.loadSnapshots()).snapshots).toEqual([{ documentId: "doc-1", objectId: "obj-1" }]);
    expect((await repository.loadTemplates()).status).toBe("empty");
  });

  it("service injects the real actor into drafts and audits only committed actions", async () => {
    const events = [];
    const service = createDocumentTemplateService({ storage: fakeStorage(), actor: ACTOR, audit: event => events.push(event) });
    expect((await service.createTemplate({ id: "repair", type: "repair_fiz" })).ok).toBe(true);
    expect((await service.saveDraft("repair", DOC, { note: "draft" })).ok).toBe(true);
    const loaded = await service.loadTemplates();
    expect(loaded.store.templates[0].draft).toMatchObject({ savedById: "admin-1", note: "draft" });
    expect(events.map(event => event.action)).toEqual(["создал шаблон", "изменил черновик"]);
  });

  it("seeds the unchanged repair renderer and its draft in one committed operation", async () => {
    const storage = fakeStorage();
    const service = createDocumentTemplateService({
      storage,
      actor: ACTOR,
      repairTemplateEnabled: true,
      legacyRepairRenderer: (contract, client, company) => `<html><body><p>Договор №${contract.number}</p><p>${client.name} ${client.iin}</p><p>${company.name} ${company.bin}</p><table><tr><td>${contract.works[0].name}</td></tr></table></body></html>`,
    });
    const result = await service.seedLegacyRepair({
      requiredFieldIds: ["contract.number", "client.name", "client.iin", "company.name", "company.bin", "estimate.worksTable"],
    });
    expect(result).toMatchObject({ ok: true, committed: true });
    const loaded = await service.loadTemplates();
    expect(loaded.store.templates).toHaveLength(1);
    expect(loaded.store.templates[0]).toMatchObject({ id: "repair-fiz-legacy", source: "legacy-repair", status: "draft" });
    expect(loaded.store.templates[0].draft.contentJson.type).toBe("doc");
  });

  it("creates and revises snapshots without writing the template store", async () => {
    const storage = fakeStorage();
    const service = createDocumentTemplateService({ storage, actor: ACTOR });
    const created = await service.createSnapshot({
      contract: { id: "contract-1", objectId: "object-1", type: "repair_fiz", createdAt: 3000 },
      version: { id: "repair:v1", templateId: "repair", publishedAt: 2000, contentJson: DOC, page: { size: "A4" } },
      variables: { "contract.number": "1019" },
      canonicalHtml: "<p>Текст</p>",
      title: "Договор №1019",
    });
    expect(created).toMatchObject({ ok: true, committed: true });
    const revisedDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Личная правка" }] }] };
    expect(await service.appendSnapshotRevision("contract:contract-1", revisedDoc)).toMatchObject({ ok: true, committed: true });
    expect((await service.getSnapshot("contract:contract-1")).snapshot.instanceVersions).toHaveLength(1);
    expect((await service.loadTemplates()).status).toBe("empty");
  });
});
