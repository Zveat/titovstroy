import { describe, expect, it } from "vitest";
import { importLegacyHtmlTemplate } from "./legacyTemplateImporter.js";
import { extractTemplateFieldIds, renderTemplateToCanonicalHtml } from "./templateRender.js";

describe("generic legacy document importer", () => {
  it("replaces only declared markers and preserves legal text verbatim", () => {
    const html = `<!doctype html><html><body>
      <h1>Договор №TS-NUMBER-901</h1>
      <p>Заказчик: TS-CLIENT-901.</p>
      <p>1.1. Этот юридический текст, пунктуация и нумерация не изменяются.</p>
      <table><tbody><tr><td>TS-WORKS-TABLE-901</td></tr></tbody></table>
      <p>Подпись: TS-CLIENT-901</p>
      <div class="np"><button>Печать</button></div>
    </body></html>`;
    const result = importLegacyHtmlTemplate({
      html,
      markers: [
        { raw: "TS-NUMBER-901", fieldId: "contract.number", kind: "text" },
        { raw: "TS-CLIENT-901", fieldId: "client.name", kind: "text" },
        { raw: "TS-WORKS-TABLE-901", fieldId: "estimate.worksTable", kind: "table" },
      ],
      requiredFieldIds: ["contract.number", "client.name", "estimate.worksTable"],
    });

    expect(result.ok).toBe(true);
    expect(extractTemplateFieldIds(result.contentJson)).toEqual([
      "contract.number",
      "client.name",
      "estimate.worksTable",
    ]);
    expect(JSON.stringify(result.contentJson)).toContain("1.1. Этот юридический текст, пунктуация и нумерация не изменяются.");
    expect(JSON.stringify(result.contentJson).match(/client\.name/g)).toHaveLength(2);
    expect(JSON.stringify(result.contentJson)).not.toContain("Печать");
  });

  it("refuses to import when a required marker is absent", () => {
    const result = importLegacyHtmlTemplate({
      html: "<html><body><p>Текст без номера</p></body></html>",
      markers: [{ raw: "TS-NUMBER", fieldId: "contract.number", kind: "text" }],
      requiredFieldIds: ["contract.number"],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/contract\.number/);
  });

  it("renders imported scalar fields back into the same surrounding legal text", () => {
    const result = importLegacyHtmlTemplate({
      html: "<html><body><p>Акт №TS-ACT; стороны подтверждают выполнение.</p></body></html>",
      markers: [{ raw: "TS-ACT", fieldId: "avr.number", kind: "text" }],
      requiredFieldIds: ["avr.number"],
    });
    expect(result.ok).toBe(true);
    const rendered = renderTemplateToCanonicalHtml({ contentJson: result.contentJson, variables: { "avr.number": "17" } });
    expect(rendered).toContain("Акт №<span data-field-id=\"avr.number\">17</span>; стороны подтверждают выполнение.");
  });

  it("replaces a marker containing HTML entities after parsing", () => {
    const raw = "г. Караганда &nbsp;&nbsp; \"27\" декабря 2099 г.";
    const result = importLegacyHtmlTemplate({
      html: `<html><body><p>${raw}</p></body></html>`,
      markers: [{ raw, fieldId: "contract.cityDateLine", kind: "text" }],
      requiredFieldIds: ["contract.cityDateLine"],
    });

    expect(result.ok).toBe(true);
    expect(extractTemplateFieldIds(result.contentJson)).toContain("contract.cityDateLine");
    expect(JSON.stringify(result.contentJson)).not.toContain("2099");
  });

  it("preserves legal text written directly inside generic div blocks", () => {
    const result = importLegacyHtmlTemplate({
      html: `<html><body>
        <div class="form">Форма Р-1</div>
        <div class="sub">№ TS-ACT от 27 декабря 2099 г.</div>
        <div class="meta"><div><b>Основание:</b> договор без сокращений</div></div>
      </body></html>`,
      markers: [{ raw: "TS-ACT", fieldId: "avr.number", kind: "text" }],
      requiredFieldIds: ["avr.number"],
    });

    expect(result.ok).toBe(true);
    const json = JSON.stringify(result.contentJson);
    expect(json).toContain("Форма Р-1");
    expect(json).toContain("договор без сокращений");
    expect(extractTemplateFieldIds(result.contentJson)).toContain("avr.number");
  });

  it("refuses import when an observed value was not converted to a protected field", () => {
    const result = importLegacyHtmlTemplate({
      html: `<html><body>
        <p>Юридический текст договора.</p>
        <div class="np">TS-CLIENT-PHONE</div>
      </body></html>`,
      markers: [{ raw: "TS-CLIENT-PHONE", fieldId: "client.phone", kind: "text" }],
      requiredFieldIds: [],
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/client\.phone/);
  });

  it("removes legacy totals that the protected works table regenerates", () => {
    const result = importLegacyHtmlTemplate({
      html: `<html><body>
        <p>Перечень работ:</p>
        <table><tr><td>TS-WORKS</td></tr></table>
        <table><tr><td>Сводка по разделам</td></tr><tr><td>ИТОГО: 100</td></tr></table>
        <p>ИТОГО: 100</p>
        <p>Следующий юридический пункт.</p>
      </body></html>`,
      markers: [{ raw: "TS-WORKS", fieldId: "estimate.worksTable", kind: "table" }],
      requiredFieldIds: ["estimate.worksTable"],
    });

    expect(result.ok).toBe(true);
    const json = JSON.stringify(result.contentJson);
    expect(json).not.toContain("Сводка по разделам");
    expect(json).not.toContain("ИТОГО: 100");
    expect(json).toContain("Следующий юридический пункт.");
  });
});
