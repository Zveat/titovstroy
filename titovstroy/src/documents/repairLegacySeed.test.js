import { describe, expect, it } from "vitest";
import { resolveRepairContractVariables } from "./autofields.js";
import { createRepairLegacySeed, createRepairParityReport } from "./repairLegacySeed.js";
import { extractTemplateFieldIds, renderTemplateToCanonicalHtml } from "./templateRender.js";

const syntheticLegacyRenderer = (contract, client, company) => `<!doctype html><html><body>
  <p><b>Договор №${contract.number}</b></p>
  <p>Заказчик: ${client.name}; ИИН ${client.iin}</p>
  <p>Подрядчик: ${company.name}; БИН ${company.bin}</p>
  <table><tbody><tr><td>${contract.works[0].name}</td></tr></tbody></table>
  <p>Неизменяемый юридический пункт: стороны обязаны исполнить договор.</p>
</body></html>`;

describe("legacy repair template seed", () => {
  it("imports legal text from the active renderer and replaces only sentinels", () => {
    const seed = createRepairLegacySeed({
      buildLegacyHtml: syntheticLegacyRenderer,
      requiredFieldIds: ["contract.number", "client.name", "client.iin", "company.name", "company.bin", "estimate.worksTable"],
    });
    expect(seed.ok).toBe(true);
    expect(seed.source).toBe("legacy-repair");
    expect(extractTemplateFieldIds(seed.contentJson)).toEqual(expect.arrayContaining([
      "contract.number",
      "client.name",
      "client.iin",
      "company.name",
      "company.bin",
      "estimate.worksTable",
    ]));
    expect(seed.importReport.ok).toBe(true);
    expect(JSON.stringify(seed.contentJson)).toContain("Неизменяемый юридический пункт");
    expect(JSON.stringify(seed.contentJson).match(/estimate\.worksTable/g)).toHaveLength(1);
  });

  it("refuses a seed when the legacy renderer drops a protected marker", () => {
    const seed = createRepairLegacySeed({
      buildLegacyHtml: () => "<html><body><p>Только текст</p></body></html>",
      requiredFieldIds: ["contract.number"],
    });
    expect(seed.ok).toBe(false);
    expect(seed.reason).toMatch(/маркер/iu);
  });

  it("compares a candidate against the unchanged renderer", () => {
    const contentJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Совпадает" }] }] };
    const context = {
      object: { id: "object-1", address: "Караганда", type: "Вторичка" },
      contract: {
        number: "1019",
        date: "2026-07-20",
        works: [{ id: "work-1", name: "Работа", category: "Работы", unit: "м²", quantity: 1, price: 1000 }],
        advancePercent: 30,
      },
      estimate: {},
      client: { name: "Иванов Иван Иванович", iin: "900101300000" },
      contragent: {
        name: "ТОО TITOVSTROY",
        bin: "231040002769",
        bank: "Банк",
        bik: "BIK",
        account: "KZ1",
        director: "Титов В.Е.",
      },
    };
    const variables = resolveRepairContractVariables(context).values;
    const report = createRepairParityReport({
      buildLegacyHtml: () => renderTemplateToCanonicalHtml({ contentJson, variables }),
      contentJson,
      context,
    });
    expect(report.ok).toBe(true);
  });
});
