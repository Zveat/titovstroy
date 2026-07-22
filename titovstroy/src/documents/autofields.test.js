import { describe, expect, it } from "vitest";
import {
  AUTOFIELD_DEFINITIONS,
  buildRepairPreviewContext,
  formatRepairWorksTable,
  requiredFieldIdsForType,
  resolveDocumentVariables,
  resolveRepairContractVariables,
  validateResolvedVariables,
} from "./autofields.js";

const FIXTURE = {
  object: {
    id: "obj-1",
    clientId: "client-1",
    address: "г. Караганда, ул. Тестовая, 10",
    objType: "Вторичка",
    area: 55,
  },
  contract: {
    id: "contract-1",
    objectId: "obj-1",
    clientId: "client-1",
    contragentId: "company-1",
    type: "repair_fiz",
    number: "1019",
    date: "2026-07-20",
    discount: 10,
    advancePercent: 30,
    works: [
      { id: "work-1", category: "Черновые работы", name: "Штукатурка стен", unit: "м²", quantity: 10, price: 5000 },
    ],
  },
  estimate: {
    id: "estimate-1",
    objectId: "obj-1",
    discount: 10,
    works: [
      { id: "work-1", category: "Черновые работы", name: "Штукатурка стен", unit: "м²", quantity: 10, price: 5000 },
    ],
  },
  client: {
    id: "client-1",
    name: "Иванов Иван Иванович",
    iin: "900101300000",
    doc: "N1234567",
    phone: "+7 700 000 00 00",
    address: "г. Караганда, ул. Клиентская, 1",
    type: "физ",
  },
  contragent: {
    id: "company-1",
    name: "ТОО TITOVSTROY",
    bin: "231040002769",
    bank: "АО Kaspi Bank",
    bik: "CASPKZKA",
    account: "KZ38722S000030058973",
    director: "Титов В.Е.",
    phone: "+7 707 667 87 66",
    email: "titovstroy@mail.ru",
    address: "г. Караганда, ул. Кирпичная, 8г",
  },
};

describe("document autofields", () => {
  it("exposes a closed unique registry and required fields for repair contracts", () => {
    const ids = AUTOFIELD_DEFINITIONS.map(field => field.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(requiredFieldIdsForType("repair_fiz")).toEqual(expect.arrayContaining([
      "client.name",
      "client.iin",
      "object.address",
      "contract.number",
      "estimate.worksTable",
      "company.bin",
    ]));
  });

  it("resolves scalar values and a deterministic works table without mutating inputs", () => {
    const before = structuredClone(FIXTURE);
    const result = resolveRepairContractVariables(FIXTURE);

    expect(result.values["contract.number"]).toBe("1019");
    expect(result.values["client.iin"]).toBe("900101300000");
    expect(result.values["company.bin"]).toBe("231040002769");
    // The active legal generator states the contract price before discount.
    expect(result.values["contract.total"]).toBe(50000);
    expect(result.values["estimate.worksTable"].rows[0]).toMatchObject({
      name: "Штукатурка стен",
      unit: "м²",
      quantity: 10,
      price: 5000,
      sum: 50000,
    });
    expect(result.values["estimate.worksTable"]).toMatchObject({ subtotal: 50000, discountPercent: 10, discountAmount: 5000, total: 45000 });
    expect(FIXTURE).toEqual(before);
  });

  it("reports required values that are empty instead of inventing legal data", () => {
    const result = resolveRepairContractVariables({ ...FIXTURE, client: { ...FIXTURE.client, iin: "" } });
    expect(result.ok).toBe(false);
    expect(result.missing).toContainEqual({ fieldId: "client.iin", label: "ИИН / БИН клиента" });
    expect(validateResolvedVariables(result).ok).toBe(false);
  });

  it("formats price-from rows without treating them as a fixed contract amount", () => {
    const table = formatRepairWorksTable([
      { name: "Скрытые работы", unit: "шт.", quantity: 2, price: 1000 },
      { name: "По факту", unit: "м²", quantity: 5, price: 0, priceFrom: 3000 },
    ], 5);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]).toMatchObject({ priceFrom: 3000, sum: 0, isVariablePrice: true });
    expect(table).toMatchObject({ subtotal: 2000, discountAmount: 100, total: 1900 });
  });

  it("builds preview context only from exact ids and picks newest active root records", () => {
    const result = buildRepairPreviewContext({
      objectId: "obj-1",
      objects: [FIXTURE.object, { id: "obj-deleted", deletedAt: 1 }],
      contracts: [
        { ...FIXTURE.contract, id: "old-contract", updatedAt: 1 },
        { ...FIXTURE.contract, id: "new-contract", updatedAt: 2 },
        { ...FIXTURE.contract, id: "deleted-contract", updatedAt: 3, deletedAt: 3 },
      ],
      estimates: [
        { ...FIXTURE.estimate, id: "old-estimate", updatedAt: 1 },
        { ...FIXTURE.estimate, id: "new-estimate", updatedAt: 2 },
        { ...FIXTURE.estimate, id: "child-estimate", parentId: "new-estimate", updatedAt: 3 },
      ],
      clients: [FIXTURE.client],
      contragents: [FIXTURE.contragent],
    });
    expect(result.ok).toBe(true);
    expect(result.contract.id).toBe("new-contract");
    expect(result.estimate.id).toBe("new-estimate");
    expect(result.client.id).toBe("client-1");
    expect(result.contragent.id).toBe("company-1");
  });

  it("never falls back to matching a client or company by name", () => {
    const result = buildRepairPreviewContext({
      objectId: "obj-1",
      objects: [{ ...FIXTURE.object, clientId: "" , clientName: FIXTURE.client.name }],
      contracts: [{ ...FIXTURE.contract, clientId: "", contragentId: "", estClient: FIXTURE.client.name }],
      estimates: [FIXTURE.estimate],
      clients: [FIXTURE.client],
      contragents: [FIXTURE.contragent],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/clientId|клиент/iu);
  });

  it("resolves every contract template type without changing the source records", () => {
    const contractor = { id: "worker-1", name: "Петров Пётр", iin: "900101300001", doc: "ID1" };
    const variants = [
      { type: "repair_fiz" },
      { type: "annex", mainNumber: "1019", appendix: 2, mainDate: "2026-07-20", annexDate: "2026-07-21" },
      { type: "design" },
      { type: "design_add", mainNumber: "D-1", composition: { plan: true }, area: 55, priceType: "sqm", pricePerSqm: 10000 },
      { type: "reservation", reserveStartDate: "2026-08-01" },
      { type: "podryad", workerId: contractor.id, city: "Караганда", termDays: 20 },
      { type: "podryad_annex", workerId: contractor.id, mainNumber: "P-1", appendix: 1 },
    ];
    for (const variant of variants) {
      const context = { ...structuredClone(FIXTURE), contract: { ...structuredClone(FIXTURE.contract), ...variant }, contractor };
      const before = structuredClone(context);
      const result = resolveDocumentVariables(context, variant.type);
      expect(result.ok, `${variant.type}: ${result.missing.map(item => item.fieldId).join(",")}`).toBe(true);
      expect(context).toEqual(before);
    }
  });

  it("resolves a new AVR from its frozen report lines", () => {
    const result = resolveDocumentVariables({
      object: FIXTURE.object,
      contragent: FIXTURE.contragent,
      moneyWords: value => `${value} прописью`,
      report: {
        id: "avr-1", objectId: "obj-1", actNo: "2", actDate: "2026-07-22",
        clientName: "Иванов Иван", clientIin: "900101300000", address: "Адрес",
        lines: [{ name: "Штукатурка", unit: "м²", price: 5000, doneQty: 3 }],
      },
    }, "avr_r1");
    expect(result.ok).toBe(true);
    expect(result.values["avr.total"]).toBe(15000);
    expect(result.values["estimate.completedWorksTable"].rows).toHaveLength(1);
  });
});
