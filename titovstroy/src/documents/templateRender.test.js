import { describe, expect, it } from "vitest";
import { createTemplateExtensions } from "./editorExtensions.js";
import {
  DEFAULT_PAGE,
  compareCanonicalDocuments,
  extractTemplateFieldIds,
  normalizeLegalText,
  renderTemplateToCanonicalHtml,
} from "./templateRender.js";

const doc = content => ({ type: "doc", content });
const paragraph = (...content) => ({ type: "paragraph", content });
const text = (value, marks) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const protectedField = fieldId => ({ type: "protectedField", attrs: { fieldId } });

describe("safe document template renderer", () => {
  it("escapes resolved values and ignores arbitrary stored handlers and styles", () => {
    const html = renderTemplateToCanonicalHtml({
      contentJson: doc([
        { ...paragraph(text("Клиент: "), protectedField("client.name")), attrs: { onclick: "steal()", style: "color:red" } },
      ]),
      variables: { "client.name": "<script>alert(1)</script>" },
      page: DEFAULT_PAGE,
    });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("color:red");
  });

  it("renders only allowlisted marks and typography", () => {
    const html = renderTemplateToCanonicalHtml({
      contentJson: doc([paragraph(
        text("Жирный", [{ type: "bold" }]),
        text(" текст", [{ type: "textStyle", attrs: { fontFamily: "Arial", fontSize: "12pt", color: "red", onclick: "bad" } }]),
      )]),
      variables: {},
      page: { ...DEFAULT_PAGE, fontFamily: "Comic Sans", fontSizePt: 99 },
    });
    expect(html).toContain("<strong>Жирный</strong>");
    expect(html).toContain("font-family:Arial");
    expect(html).toContain("font-size:12pt");
    expect(html).not.toContain("color:red");
    expect(html).not.toContain("Comic Sans");
    expect(html).toContain("font-family:Times New Roman");
    expect(html).toContain("font-size:11pt");
  });

  it("extracts protected fields once and rejects unknown fields", () => {
    const contentJson = doc([
      paragraph(protectedField("client.name"), protectedField("client.name")),
      { type: "dataTable", attrs: { fieldId: "estimate.worksTable" } },
    ]);
    expect(extractTemplateFieldIds(contentJson)).toEqual(["client.name", "estimate.worksTable"]);
    expect(() => renderTemplateToCanonicalHtml({
      contentJson: doc([paragraph(protectedField("unknown.field"))]),
      variables: {},
      page: DEFAULT_PAGE,
    })).toThrow(/unknown\.field/);
  });

  it("renders work tables from structured values and escapes row content", () => {
    const html = renderTemplateToCanonicalHtml({
      contentJson: doc([{ type: "dataTable", attrs: { fieldId: "estimate.worksTable" } }]),
      variables: {
        "estimate.worksTable": {
          rows: [{ name: "Штукатурка <стен>", unit: "м²", quantity: 10, price: 5000, sum: 50000 }],
          subtotal: 50000,
          discountPercent: 0,
          discountAmount: 0,
          total: 50000,
        },
      },
      page: DEFAULT_PAGE,
    });
    expect(html).toContain("Штукатурка &lt;стен&gt;");
    expect(html).toContain("50&nbsp;000");
    expect(html).toContain("<table");
    expect(html).toContain("Итого по разделу «Работы»");
    expect(html).toContain("ИТОГО: 50&nbsp;000&nbsp;₸");
  });

  it("compares legal text without changing punctuation, spelling, or paragraph order", () => {
    expect(normalizeLegalText("<p>1.  Текст</p>\n<p>2. Пункт.</p>")).toBe("1. Текст 2. Пункт.");
    expect(compareCanonicalDocuments("<p>1. Текст</p>", "<p>1. Текст</p>").ok).toBe(true);
    const changed = compareCanonicalDocuments("<p>1. Текст</p>", "<p>1. Другой текст</p>");
    expect(changed.ok).toBe(false);
    expect(changed.textEqual).toBe(false);
    expect(changed.firstDifference).toMatchObject({ kind: "text" });
    const reordered = compareCanonicalDocuments("<p>Первый</p><p>Второй</p>", "<p>Второй</p><p>Первый</p>");
    expect(reordered.paragraphsEqual).toBe(false);
  });

  it("reports table structure differences separately", () => {
    const report = compareCanonicalDocuments(
      "<p>Текст</p><table><tr><td>1</td></tr></table>",
      "<p>Текст</p><table><tr><td>1</td><td>2</td></tr></table>",
    );
    expect(report.ok).toBe(false);
    expect(report.tablesEqual).toBe(false);
    expect(report.firstDifference).not.toBe(null);
  });

  it("does not invent paragraph differences for TipTap paragraphs inside table cells", () => {
    const report = compareCanonicalDocuments(
      "<p>До</p><table><tr><td>Ячейка</td></tr></table><p>После</p>",
      "<p>До</p><table><tr><td><p>Ячейка</p></td></tr></table><p>После</p>",
    );
    expect(report.paragraphsEqual).toBe(true);
  });

  it("builds a locked editor extension set", () => {
    const names = createTemplateExtensions({ editable: true }).map(extension => extension.name);
    expect(names).toEqual(expect.arrayContaining(["starterKit", "textStyle", "textAlign", "table", "protectedField", "dataTable", "pageBreak"]));
  });
});
