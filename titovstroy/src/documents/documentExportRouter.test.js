import { describe, expect, it, vi } from "vitest";
import { createDocumentExportRouter } from "./documentExportRouter.js";

const doc = text => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const contract = { id: "contract-1", objectId: "object-1", clientId: "client-1", contragentId: "company-1", type: "repair_fiz", number: "1019", date: "2026-07-20", createdAt: 3000, works: [{ id: "w1", name: "Работа", category: "Работы", quantity: 1, price: 1000 }] };
const client = { id: "client-1", name: "Иванов Иван Иванович", iin: "900101300000", address: "Адрес" };
const contragent = { id: "company-1", name: "ТОО", bin: "1", bank: "Банк", bik: "BIK", account: "KZ", director: "Директор" };
const version = { id: "repair:v1", templateId: "repair", publishedAt: 2000, contentJson: doc("Договор"), page: { size: "A4" } };
const data = { objects: [{ id: "object-1", address: "Адрес", type: "Вторичка" }], estimates: [{ id: "estimate-1", objectId: "object-1", works: contract.works }], contracts: [contract], clients: [client], contragents: [contragent] };

const setup = ({ enabled = true, snapshot = null, createCommitted = true, confirmLegacy = vi.fn(() => true) } = {}) => {
  const legacy = vi.fn(async () => ({ ok: true, route: "legacy" }));
  const canonical = vi.fn(async value => ({ ok: true, route: "template", documentId: value.documentId }));
  let stored = snapshot;
  const service = {
    loadTemplates: vi.fn(async () => ({ status: "found", store: { templates: [{ id: "repair", type: "repair_fiz", status: "published", activeVersionId: version.id, versions: [version] }] } })),
    getSnapshot: vi.fn(async () => ({ status: stored ? "found" : "empty", snapshot: stored })),
    createSnapshot: vi.fn(async input => {
      if (!createCommitted) return { ok: false, committed: false, reason: "network" };
      stored = { documentId: `contract:${input.contract.id}`, title: input.title, contentSnapshot: input.version.contentJson, variablesSnapshot: input.variables, canonicalHtmlSnapshot: input.canonicalHtml, page: input.version.page, instanceVersions: [] };
      return { ok: true, committed: true, snapshots: [stored] };
    }),
  };
  const router = createDocumentExportRouter({ enabled, service, getData: () => data, exportLegacy: legacy, exportCanonical: canonical, confirmLegacy });
  return { router, service, legacy, canonical, confirmLegacy };
};

describe("document export router", () => {
  it("uses the unchanged legacy path while the pilot flag is off", async () => {
    const { router, legacy, service } = setup({ enabled: false });
    expect((await router.exportContract("pdf", { contract, client, contragent })).route).toBe("legacy");
    expect(legacy).toHaveBeenCalledOnce();
    expect(service.loadTemplates).not.toHaveBeenCalled();
  });

  it("never silently opens the old generator when required data is missing", async () => {
    const confirmLegacy = vi.fn(() => false);
    const { router, legacy } = setup({ confirmLegacy });

    const result = await router.exportContract("pdf", { contract, client: null, contragent });

    expect(result).toMatchObject({ ok: false, canUseLegacy: true, route: "template-blocked" });
    expect(confirmLegacy).toHaveBeenCalledWith(expect.stringContaining("Клиент договора"), expect.any(Object));
    expect(legacy).not.toHaveBeenCalled();
  });

  it("uses the old generator only after explicit confirmation", async () => {
    const confirmLegacy = vi.fn(() => true);
    const { router, legacy } = setup({ confirmLegacy });

    const result = await router.exportContract("pdf", { contract, client: null, contragent });

    expect(result).toMatchObject({ ok: true, route: "legacy" });
    expect(confirmLegacy).toHaveBeenCalledOnce();
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("never applies a published template to an older contract", async () => {
    const { router, legacy, service } = setup();
    const old = { ...contract, id: "old", createdAt: 1000 };
    expect((await router.exportContract("pdf", { contract: old, client, contragent })).route).toBe("legacy");
    expect(legacy).toHaveBeenCalledOnce();
    expect(service.createSnapshot).not.toHaveBeenCalled();
  });

  it("atomically creates one snapshot and reuses it on later exports", async () => {
    const { router, service, canonical } = setup();
    expect((await router.exportContract("pdf", { contract, client, contragent })).route).toBe("template");
    expect((await router.exportContract("gdoc", { contract, client, contragent })).route).toBe("template");
    expect(service.createSnapshot).toHaveBeenCalledOnce();
    expect(canonical).toHaveBeenCalledTimes(2);
  });

  it("keeps the button working through legacy when snapshot cannot be confirmed", async () => {
    const { router, legacy } = setup({ createCommitted: false });
    const result = await router.exportContract("docx", { contract, client, contragent });
    expect(result).toMatchObject({ ok: true, route: "legacy" });
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("automatically uses the legacy path when snapshot creation throws", async () => {
    const { router, service, legacy } = setup();
    service.createSnapshot.mockRejectedValueOnce(new Error("firebase unavailable"));
    const result = await router.exportContract("pdf", { contract, client, contragent });
    expect(result).toMatchObject({ ok: true, route: "legacy" });
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("leaves every non-pilot document type on the legacy path", async () => {
    const { router, legacy } = setup();
    await router.exportContract("pdf", { contract: { ...contract, type: "annex" }, client, contragent });
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("uses the published template for a new standalone reservation agreement", async () => {
    const reservation = {
      id: "reservation-1", type: "reservation", number: "1020", date: "2026-07-23", createdAt: 4000,
      clientId: client.id, contragentId: contragent.id, reserveAmount: 50000, reserveStartDate: "2026-08-01",
    };
    const reservationVersion = {
      id: "reservation:v1", templateId: "legacy-reservation-agreement", publishedAt: 3000,
      contentJson: doc("Соглашение о резервировании"), page: { size: "A4" },
    };
    let stored = null;
    const legacy = vi.fn(async () => ({ ok: true, route: "legacy" }));
    const canonical = vi.fn(async snapshot => ({ ok: true, route: "template", documentId: snapshot.documentId }));
    const service = {
      loadTemplates: vi.fn(async () => ({ status: "found", store: { templates: [{
        id: "legacy-reservation-agreement", type: "reservation", status: "published",
        activeVersionId: reservationVersion.id, versions: [reservationVersion],
      }] } })),
      getSnapshot: vi.fn(async () => ({ status: stored ? "found" : "empty", snapshot: stored })),
      createSnapshot: vi.fn(async input => {
        stored = {
          documentId: `contract:${input.contract.id}`, title: input.title,
          contentSnapshot: input.version.contentJson, variablesSnapshot: input.variables,
          canonicalHtmlSnapshot: input.canonicalHtml, page: input.version.page, instanceVersions: [],
        };
        return { ok: true, committed: true, snapshots: [stored] };
      }),
    };
    const router = createDocumentExportRouter({
      enabled: true, service,
      getData: () => ({ ...data, objects: [], estimates: [], contracts: [reservation] }),
      exportLegacy: legacy, exportCanonical: canonical,
    });

    const result = await router.exportContract("pdf", { contract: reservation, client, contragent });

    expect(result).toMatchObject({ ok: true, route: "template", documentId: "contract:reservation-1" });
    expect(service.createSnapshot).toHaveBeenCalledOnce();
    expect(service.createSnapshot.mock.calls[0][0].variables["object.address"]).toBe(client.address);
    expect(legacy).not.toHaveBeenCalled();
  });
});
