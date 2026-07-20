import { describe, expect, it, vi } from "vitest";
import {
  buildCanonicalExport,
  buildDocxBlobFromCanonical,
  openPdfFromCanonical,
  uploadGoogleDocFromCanonical,
} from "./exportAdapters.js";
import { createDocumentSnapshot } from "./documentSnapshots.js";

const doc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Договор ", marks: [{ type: "bold" }] }, { type: "protectedField", attrs: { fieldId: "contract.number" } }] },
    { type: "paragraph", content: [{ type: "text", text: "Подчёркнуто", marks: [{ type: "underline" }] }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Пункт" }] }] }] },
    { type: "pageBreak" },
    { type: "dataTable", attrs: { fieldId: "estimate.worksTable" } },
  ],
};

const snapshot = createDocumentSnapshot({
  contract: { id: "3000", type: "repair_fiz", createdAt: 3000 },
  version: { id: "repair:v1", templateId: "repair", publishedAt: 2000, contentJson: doc, page: { size: "A4" } },
  variables: {
    "contract.number": "1019",
    "estimate.worksTable": { rows: [{ name: "Работа", unit: "м²", quantity: 1, price: 1000, sum: 1000, category: "Работы" }], subtotal: 1000, discountPercent: 0, discountAmount: 0, total: 1000 },
  },
  canonicalHtml: "",
  title: "Договор №1019",
  actor: { id: "a", name: "A" },
  now: 3500,
});

const fakeDocx = () => {
  class Box { constructor(value) { Object.assign(this, value); } }
  return {
    Document: Box, Paragraph: Box, TextRun: Box, Table: Box, TableRow: Box, TableCell: Box,
    AlignmentType: { LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFIED: "justify" },
    WidthType: { PERCENTAGE: "pct" }, BorderStyle: { SINGLE: "single" }, HeadingLevel: { HEADING_2: "h2" },
    Packer: { toBlob: vi.fn(async value => new Blob([JSON.stringify(value)])) },
  };
};

describe("canonical document export adapters", () => {
  it("sends one canonical representation to PDF, Google Docs and DOCX", async () => {
    const exportDoc = buildCanonicalExport(snapshot);
    const pdf = vi.fn();
    const uploadHtml = vi.fn(async input => ({ id: "gdoc-1", ...input }));
    const pdfResult = await openPdfFromCanonical(exportDoc, pdf);
    const gdocResult = await uploadGoogleDocFromCanonical(exportDoc, { uploadHtml });
    const docxResult = await buildDocxBlobFromCanonical(exportDoc, fakeDocx());
    expect(pdf).toHaveBeenCalledWith(exportDoc.canonicalHtml);
    expect(uploadHtml).toHaveBeenCalledWith({ title: exportDoc.title, html: exportDoc.canonicalHtml });
    expect(pdfResult.normalizedText).toBe(exportDoc.normalizedText);
    expect(gdocResult.normalizedText).toBe(exportDoc.normalizedText);
    expect(docxResult.normalizedText).toBe(exportDoc.normalizedText);
    expect(docxResult.blob).toBeInstanceOf(Blob);
  });

  it("fails visibly instead of dropping an unsupported node", async () => {
    const broken = { ...buildCanonicalExport(snapshot), contentJson: { type: "doc", content: [{ type: "video" }] } };
    const result = await buildDocxBlobFromCanonical(broken, fakeDocx());
    expect(result).toEqual({ ok: false, reason: "unsupported-node:video" });
  });
});
