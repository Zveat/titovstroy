import { snapshotContent } from "./documentSnapshots.js";
import { normalizeLegalText, renderTemplateToCanonicalHtml } from "./templateRender.js";

const money = value => Math.round(Number(value) || 0).toLocaleString("ru-RU");

const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const paragraphWithField = (html, fieldId) => {
  const escapedFieldId = String(fieldId || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`<p\\b[^>]*>(?:(?!<\\/p>)[\\s\\S])*data-field-id=["']${escapedFieldId}["'](?:(?!<\\/p>)[\\s\\S])*<\\/p>`, "gi");
  return [...String(html || "").matchAll(expression)];
};

const replaceMatch = (source, match, replacement) => `${source.slice(0, match.index)}${replacement}${source.slice(match.index + match[0].length)}`;

export function addCompanyStamp(html, stampUrl, documentType = "") {
  const source = String(html || "");
  if (!stampUrl) return source;
  const src = escapeHtml(stampUrl);
  const type = String(documentType || "");
  const directorParagraphs = paragraphWithField(source, "company.director");

  if (type === "podryad" || type === "podryad_annex") {
    const anchor = directorParagraphs.at(-1);
    if (!anchor) return source;
    const stamp = `<div class="document-company-stamp document-company-stamp-subcontract" style="margin-top:-6px"><img src="${src}" alt="Печать" style="width:230px;height:230px;object-fit:contain;opacity:.85;mix-blend-mode:multiply"/></div>`;
    return replaceMatch(source, anchor, `${anchor[0]}${stamp}`);
  }

  if (type === "avr_r1") {
    const companyParagraphs = paragraphWithField(source, "company.name");
    const anchor = companyParagraphs.at(-1);
    if (!anchor) return source;
    const stamp = `<div class="document-company-stamp document-company-stamp-avr" style="height:206px;position:relative;margin-top:-6px;page-break-inside:avoid"><img src="${src}" alt="Печать" style="position:absolute;left:40px;top:0;width:200px;height:200px;object-fit:contain;opacity:.85;mix-blend-mode:multiply;pointer-events:none"/></div>`;
    return replaceMatch(source, anchor, `${anchor[0]}${stamp}`);
  }

  const anchor = directorParagraphs.at(-1);
  if (!anchor) return source;
  const stamp = `<img class="document-company-stamp document-company-stamp-contract" src="${src}" style="width:200px;height:200px;object-fit:contain;vertical-align:middle;margin-left:6px;opacity:0.85;mix-blend-mode:multiply" alt="М.П."/>`;
  return replaceMatch(source, anchor, anchor[0].replace(/<\/p>$/i, `${stamp}</p>`));
}

export function addBrowserPdfControls(html, title = "Документ", { stampUrl = "", documentType = "" } = {}) {
  const source = String(html || "");
  const controls = `<div class="document-pdf-actions" style="margin:24px 0 8px;text-align:center;padding:16px"><button type="button" onclick="window.print()" style="padding:12px 36px;background:#2563eb;color:#fff;border:0;border-radius:7px;font:700 14px Arial,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(37,99,235,.2)">🖨 Распечатать / Сохранить PDF</button></div>`;
  const printStyle = `<style data-document-pdf-controls>@media print{.document-pdf-actions{display:none!important}}</style>`;
  const titleTag = `<title>${escapeHtml(title || "Документ")}</title>`;
  let output = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(source)
    ? source.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, titleTag)
    : source.replace(/<head([^>]*)>/i, `<head$1>${titleTag}`);
  output = /<\/head>/i.test(output) ? output.replace(/<\/head>/i, `${printStyle}</head>`) : `${printStyle}${output}`;
  output = addCompanyStamp(output, stampUrl, documentType);
  return /<\/body>/i.test(output) ? output.replace(/<\/body>/i, `${controls}</body>`) : `${output}${controls}`;
}

export function buildCanonicalExport(snapshot) {
  if (!snapshot?.documentId) throw new Error("Снимок документа отсутствует");
  const contentJson = snapshotContent(snapshot);
  if (!contentJson) throw new Error("Содержимое снимка отсутствует");
  const variablesSnapshot = structuredClone(snapshot.variablesSnapshot || {});
  const page = structuredClone(snapshot.page || {});
  const hasRevision = (snapshot.instanceVersions?.length || 0) > 0;
  const legalHtml = !hasRevision && snapshot.canonicalHtmlSnapshot
    ? String(snapshot.canonicalHtmlSnapshot)
    : renderTemplateToCanonicalHtml({ contentJson, variables: variablesSnapshot, page });
  const versionNumber = Number(snapshot.templateVersionNumber) || 1;
  const publishedAt = Number(snapshot.templatePublishedAt) || 0;
  const versionDate = publishedAt ? new Date(publishedAt).toLocaleDateString("ru-RU") : "";
  const versionLabel = `Версия ${versionNumber}.0${versionDate ? ` от ${versionDate}` : ""}`;
  const note = `<div data-template-version style="margin-top:12mm;text-align:right;color:#94a3b8;font:8pt Arial,sans-serif">${versionLabel}</div>`;
  const canonicalHtml = legalHtml.includes("</body>") ? legalHtml.replace("</body>", `${note}</body>`) : `${legalHtml}${note}`;
  return {
    title: String(snapshot.title || "Документ"),
    canonicalHtml,
    contentJson,
    variablesSnapshot,
    page,
    versionLabel,
    normalizedText: normalizeLegalText(legalHtml),
  };
}

export async function openPdfFromCanonical(exportDoc, openOrPrintHtml, options = {}) {
  if (!exportDoc?.canonicalHtml || typeof openOrPrintHtml !== "function") return { ok: false, reason: "pdf-adapter-unavailable" };
  await openOrPrintHtml(addBrowserPdfControls(exportDoc.canonicalHtml, exportDoc.title, options));
  return { ok: true, normalizedText: exportDoc.normalizedText };
}

export async function uploadGoogleDocFromCanonical(exportDoc, googleDeps = {}) {
  if (!exportDoc?.canonicalHtml || typeof googleDeps.uploadHtml !== "function") return { ok: false, reason: "gdoc-adapter-unavailable" };
  const value = await googleDeps.uploadHtml({ title: exportDoc.title, html: exportDoc.canonicalHtml });
  return { ok: true, value, normalizedText: exportDoc.normalizedText };
}

export function createBrowserGoogleUploader({ clientId, browserWindow, browserDocument, fetchFn } = {}) {
  const win = browserWindow || (typeof window !== "undefined" ? window : null);
  const doc = browserDocument || (typeof document !== "undefined" ? document : null);
  const request = fetchFn || (typeof fetch !== "undefined" ? fetch : null);
  return async ({ title, html }) => {
    if (!win || !doc || !request || !clientId) throw new Error("Google Docs недоступен");
    if (!win.google?.accounts?.oauth2) {
      await new Promise((resolve, reject) => {
        const script = doc.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Не удалось загрузить сервис Google"));
        doc.head.appendChild(script);
      });
    }
    const token = await new Promise((resolve, reject) => {
      const client = win.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: response => response.error ? reject(new Error(`Ошибка авторизации: ${response.error}`)) : resolve(response.access_token),
      });
      client.requestAccessToken({ prompt: "" });
    });
    const boundary = "titov_boundary_gdoc";
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" }),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
      `--${boundary}--`,
    ].join("\r\n");
    const response = await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) throw new Error(`Drive API ошибка ${response.status}: ${await response.text()}`);
    const value = await response.json();
    win.open(`https://docs.google.com/document/d/${value.id}/edit`, "_blank");
    return value;
  };
}

export function downloadBlobFile(blob, filename, { browserDocument, browserUrl } = {}) {
  const doc = browserDocument || (typeof document !== "undefined" ? document : null);
  const urlApi = browserUrl || (typeof URL !== "undefined" ? URL : null);
  if (!blob || !doc || !urlApi) return { ok: false, reason: "download-unavailable" };
  const url = urlApi.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = String(filename || "document.docx");
  doc.body.appendChild(anchor);
  anchor.click();
  doc.body.removeChild(anchor);
  setTimeout(() => urlApi.revokeObjectURL(url), 20000);
  return { ok: true };
}

const supportedNodes = new Set([
  "doc", "text", "paragraph", "heading", "hardBreak", "bulletList", "orderedList", "listItem",
  "blockquote", "horizontalRule", "protectedField", "dataTable", "pageBreak", "table", "tableRow",
  "tableHeader", "tableCell",
]);

const firstUnsupportedNode = contentJson => {
  let unsupported = null;
  const walk = node => {
    if (!node || typeof node !== "object" || unsupported) return;
    if (!supportedNodes.has(node.type)) { unsupported = node.type || "unknown"; return; }
    for (const child of Array.isArray(node.content) ? node.content : []) walk(child);
  };
  walk(contentJson);
  return unsupported;
};

const fieldText = (fieldId, variables) => {
  const value = variables?.[fieldId];
  if (value == null) return "";
  if (typeof value === "number") return fieldId.includes("total") || fieldId.includes("Amount") ? `${money(value)} ₸` : String(value);
  return typeof value === "object" ? "" : String(value);
};

const alignment = (D, value) => ({
  left: D.AlignmentType?.LEFT,
  center: D.AlignmentType?.CENTER,
  right: D.AlignmentType?.RIGHT,
  justify: D.AlignmentType?.JUSTIFIED,
}[value] || D.AlignmentType?.JUSTIFIED);

const textRun = (D, text, marks = []) => {
  const options = { text: String(text || ""), font: "Times New Roman", size: 22 };
  for (const mark of marks || []) {
    if (mark.type === "bold") options.bold = true;
    if (mark.type === "italic") options.italics = true;
    if (mark.type === "underline") options.underline = {};
    if (mark.type === "textStyle") {
      if (["Times New Roman", "Arial", "Verdana"].includes(mark.attrs?.fontFamily)) options.font = mark.attrs.fontFamily;
      if (/^(8|9|10|11|12|13|14|16|18)pt$/.test(mark.attrs?.fontSize || "")) options.size = Number.parseInt(mark.attrs.fontSize, 10) * 2;
    }
  }
  return new D.TextRun(options);
};

const inlineRuns = (D, node, variables) => {
  if (node.type === "text") return [textRun(D, node.text, node.marks)];
  if (node.type === "hardBreak") return [textRun(D, "\n")];
  if (node.type === "protectedField") return [textRun(D, fieldText(node.attrs?.fieldId, variables))];
  return (node.content || []).flatMap(child => inlineRuns(D, child, variables));
};

const tableCell = (D, children, options = {}) => new D.TableCell({
  children,
  columnSpan: options.columnSpan || 1,
  width: { size: options.width || 10, type: D.WidthType?.PERCENTAGE },
});

const paragraph = (D, node, variables, prefix = "") => new D.Paragraph({
  children: [textRun(D, prefix), ...(node.content || []).flatMap(child => inlineRuns(D, child, variables))],
  alignment: alignment(D, node.attrs?.textAlign),
  ...(node.type === "heading" && D.HeadingLevel ? { heading: D.HeadingLevel.HEADING_2 } : {}),
});

const worksTable = (D, value = {}) => {
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const header = new D.TableRow({ children: ["№", "Наименование работ", "Ед.", "Объём", "Цена за ед.", "Сумма"].map((label, index) => tableCell(D, [new D.Paragraph({ children: [textRun(D, label, [{ type: "bold" }])] })], { width: [5, 45, 8, 8, 17, 17][index] })) });
  const body = rows.map((row, index) => new D.TableRow({ children: [index + 1, row.name, row.unit, row.quantity, row.isVariablePrice ? `от ${money(row.priceFrom)} ₸` : `${money(row.price)} ₸`, row.isVariablePrice ? "уточняется" : `${money(row.sum)} ₸`].map((value, cellIndex) => tableCell(D, [new D.Paragraph({ children: [textRun(D, value)] })], { width: [5, 45, 8, 8, 17, 17][cellIndex] })) }));
  const total = new D.TableRow({ children: [tableCell(D, [new D.Paragraph({ children: [textRun(D, "ИТОГО:", [{ type: "bold" }])] })], { columnSpan: 5, width: 83 }), tableCell(D, [new D.Paragraph({ children: [textRun(D, `${money(value.total ?? value.subtotal)} ₸`, [{ type: "bold" }])] })], { width: 17 })] });
  return new D.Table({ rows: [header, ...body, total], width: { size: 100, type: D.WidthType?.PERCENTAGE } });
};

const genericTable = (D, node, variables) => new D.Table({
  rows: (node.content || []).map(row => new D.TableRow({
    children: (row.content || []).map(cell => tableCell(D, (cell.content || []).map(block => paragraph(D, block, variables)), { columnSpan: Number(cell.attrs?.colspan) || 1 })),
  })),
  width: { size: 100, type: D.WidthType?.PERCENTAGE },
});

const blockChildren = (D, node, variables) => {
  switch (node.type) {
    case "doc": return (node.content || []).flatMap(child => blockChildren(D, child, variables));
    case "paragraph":
    case "heading": return [paragraph(D, node, variables)];
    case "blockquote": return [new D.Paragraph({ children: inlineRuns(D, node, variables), indent: { left: 360 } })];
    case "horizontalRule": return [new D.Paragraph({ children: [textRun(D, "____________________________")] })];
    case "pageBreak": return [new D.Paragraph({ pageBreakBefore: true, children: [] })];
    case "dataTable": return [worksTable(D, variables?.[node.attrs?.fieldId])];
    case "table": return [genericTable(D, node, variables)];
    case "bulletList": return (node.content || []).flatMap(item => (item.content || []).map(block => paragraph(D, block, variables, "• ")));
    case "orderedList": return (node.content || []).flatMap((item, index) => (item.content || []).map(block => paragraph(D, block, variables, `${index + 1}. `)));
    default: return [];
  }
};

export async function buildDocxBlobFromCanonical(exportDoc, D) {
  const unsupported = firstUnsupportedNode(exportDoc?.contentJson);
  if (unsupported) return { ok: false, reason: `unsupported-node:${unsupported}` };
  if (!D?.Document || !D?.Packer?.toBlob) return { ok: false, reason: "docx-adapter-unavailable" };
  try {
    const children = blockChildren(D, exportDoc.contentJson, exportDoc.variablesSnapshot || {});
    if (exportDoc.versionLabel) {
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: exportDoc.versionLabel, font: "Arial", size: 16, color: "94A3B8" })],
        alignment: D.AlignmentType?.RIGHT,
        spacing: { before: 360 },
      }));
    }
    const document = new D.Document({ sections: [{ properties: {}, children }] });
    const blob = await D.Packer.toBlob(document);
    return { ok: true, blob, normalizedText: exportDoc.normalizedText };
  } catch (error) {
    return { ok: false, reason: error?.message || "docx-build-failed" };
  }
}
