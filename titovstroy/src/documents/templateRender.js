import { AUTOFIELD_DEFINITIONS } from "./autofields.js";

export const DEFAULT_PAGE = Object.freeze({
  size: "A4",
  marginTopMm: 20,
  marginRightMm: 15,
  marginBottomMm: 20,
  marginLeftMm: 30,
  fontFamily: "Times New Roman",
  fontSizePt: 11,
});

const FIELD_BY_ID = new Map(AUTOFIELD_DEFINITIONS.map(definition => [definition.id, definition]));
const FONT_FAMILIES = new Set(["Times New Roman", "Arial", "Verdana"]);
const TEXT_SIZES = new Set(["8pt", "9pt", "10pt", "11pt", "12pt", "13pt", "14pt", "16pt", "18pt"]);
const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const safeNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const safePage = page => ({
  size: page?.size === "A4" ? "A4" : DEFAULT_PAGE.size,
  marginTopMm: safeNumber(page?.marginTopMm, DEFAULT_PAGE.marginTopMm, 0, 50),
  marginRightMm: safeNumber(page?.marginRightMm, DEFAULT_PAGE.marginRightMm, 0, 50),
  marginBottomMm: safeNumber(page?.marginBottomMm, DEFAULT_PAGE.marginBottomMm, 0, 50),
  marginLeftMm: safeNumber(page?.marginLeftMm, DEFAULT_PAGE.marginLeftMm, 0, 50),
  fontFamily: FONT_FAMILIES.has(page?.fontFamily) ? page.fontFamily : DEFAULT_PAGE.fontFamily,
  fontSizePt: safeNumber(page?.fontSizePt, DEFAULT_PAGE.fontSizePt, 8, 18),
});

const moneyHtml = value => Math.round(Number(value) || 0).toLocaleString("ru-RU").replace(/\s/g, "&nbsp;");

const renderScalar = (fieldId, value) => {
  const definition = FIELD_BY_ID.get(fieldId);
  if (!definition) throw new Error(`Неизвестное автополе: ${fieldId}`);
  if (definition.kind === "money") return `${moneyHtml(value)}&nbsp;₸`;
  if (definition.kind === "number") return escapeHtml(Number(value) || 0);
  return escapeHtml(value);
};

const renderWorksTable = (fieldId, value) => {
  const definition = FIELD_BY_ID.get(fieldId);
  if (!definition || definition.kind !== "table") throw new Error(`Неизвестное табличное автополе: ${fieldId}`);
  const rows = Array.isArray(value?.rows) ? value.rows : [];
  if (fieldId === "estimate.completedWorksTable" || value?.tableStyle === "completed") {
    const body = rows.map((row, index) => `<tr><td class="tc">${index + 1}</td><td>${escapeHtml(row.name)}</td><td class="tc">${escapeHtml(row.unit)}</td><td class="tc">${escapeHtml(row.quantity)}</td><td class="tr">${moneyHtml(row.price)}</td><td class="tr">${moneyHtml(row.sum)}</td></tr>`).join("");
    return `<table data-field-id="${escapeHtml(fieldId)}"><thead><tr><th>№</th><th>Наименование работ (услуг)</th><th>Ед. изм.</th><th>Кол-во</th><th>Цена, ₸</th><th>Стоимость, ₸</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="5" class="tr b">ИТОГО:</td><td class="tr b">${moneyHtml(value?.total)}&nbsp;₸</td></tr></tfoot></table>`;
  }
  if (value?.tableStyle === "subcontract") {
    const body = rows.map((row, index) => `<tr><td class="tc">${index + 1}</td><td>${escapeHtml(row.name)}</td><td class="tc">${escapeHtml(row.quantity)}</td><td class="tc">${escapeHtml(row.unit)}</td><td class="tr">${moneyHtml(row.price)}</td><td class="tr">${moneyHtml(row.sum)}</td></tr>`).join("");
    return `<table data-field-id="${escapeHtml(fieldId)}"><thead><tr><th>№</th><th>Наименование работ</th><th>Объём</th><th>Ед.</th><th>Цена, ₸</th><th>Сумма, ₸</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  const categories = [];
  const byCategory = new Map();
  for (const row of rows) {
    const category = String(row.category || "Работы");
    if (!byCategory.has(category)) {
      byCategory.set(category, { rows: [], total: 0 });
      categories.push(category);
    }
    const group = byCategory.get(category);
    group.rows.push(row);
    group.total += row.isVariablePrice ? 0 : Number(row.sum) || 0;
  }
  let number = 0;
  let body = "";
  for (const category of categories) {
    const group = byCategory.get(category);
    body += `<tr><td colspan="6">${escapeHtml(category)} — ${moneyHtml(group.total)}&nbsp;₸</td></tr>`;
    let subcategory = "";
    group.rows.forEach((row) => {
      if (row.subcategory && row.subcategory !== subcategory) {
        subcategory = row.subcategory;
        body += `<tr><td colspan="6">${escapeHtml(subcategory)}</td></tr>`;
      }
      number += 1;
      body += `<tr><td class="tc">${number}</td><td>${escapeHtml(row.name)}</td><td class="tc">${escapeHtml(row.unit)}</td><td class="tc">${escapeHtml(row.quantity)}</td><td class="tr">${row.isVariablePrice ? `от&nbsp;${moneyHtml(row.priceFrom)}&nbsp;₸` : `${moneyHtml(row.price)}&nbsp;₸`}</td><td class="tr b">${row.isVariablePrice ? "уточняется" : `${moneyHtml(row.sum)}&nbsp;₸`}</td></tr>`;
    });
    body += `<tr><td colspan="5" class="tr">Итого по разделу «${escapeHtml(category)}»:</td><td class="tr b">${moneyHtml(group.total)}&nbsp;₸</td></tr>`;
  }
  let output = `<table data-field-id="${escapeHtml(fieldId)}"><thead><tr><th>№</th><th>Наименование работ</th><th>Ед.</th><th>Объём</th><th>Цена за ед.</th><th>Сумма</th></tr></thead><tbody>${body}</tbody></table>`;
  const discount = Number(value?.discountPercent) || 0;
  const contractTotal = Number(value?.subtotal) || 0;
  const discountedTotal = contractTotal - (Number(value?.discountAmount) || 0);
  if (categories.length > 1) {
    const summary = categories.map(category => `<tr><td>${escapeHtml(category)}</td><td class="tr b">${moneyHtml(byCategory.get(category).total)}&nbsp;₸</td></tr>`).join("");
    const discountRows = discount > 0
      ? `<tr><td>Скидка ${escapeHtml(discount)}%</td><td class="tr">− ${moneyHtml(value?.discountAmount)}&nbsp;₸</td></tr><tr><td class="b">ИТОГО со скидкой:</td><td class="tr b">${moneyHtml(discountedTotal)}&nbsp;₸</td></tr>`
      : `<tr><td class="b">ИТОГО:</td><td class="tr b">${moneyHtml(contractTotal)}&nbsp;₸</td></tr>`;
    output += `<table><tbody><tr><td colspan="2" class="b">Сводка по разделам</td></tr>${summary}${discountRows}</tbody></table>`;
  } else if (discount > 0) {
    output += `<p class="tr">Скидка ${escapeHtml(discount)}%: − ${moneyHtml(value?.discountAmount)}&nbsp;₸</p><p class="tr b">ИТОГО со скидкой: ${moneyHtml(discountedTotal)}&nbsp;₸</p>`;
  } else {
    output += `<p class="tr b">ИТОГО: ${moneyHtml(contractTotal)}&nbsp;₸</p>`;
  }
  return output;
};

const renderMarks = (html, marks) => {
  let output = html;
  for (const mark of Array.isArray(marks) ? marks : []) {
    if (mark?.type === "bold") output = `<strong>${output}</strong>`;
    else if (mark?.type === "italic") output = `<em>${output}</em>`;
    else if (mark?.type === "underline") output = `<u>${output}</u>`;
    else if (mark?.type === "textStyle") {
      const styles = [];
      if (FONT_FAMILIES.has(mark.attrs?.fontFamily)) styles.push(`font-family:${mark.attrs.fontFamily}`);
      if (TEXT_SIZES.has(mark.attrs?.fontSize)) styles.push(`font-size:${mark.attrs.fontSize}`);
      if (styles.length) output = `<span style="${styles.join(";")}">${output}</span>`;
    }
  }
  return output;
};

const renderChildren = (node, variables) => (Array.isArray(node?.content) ? node.content : [])
  .map(child => renderNode(child, variables))
  .join("");

const alignmentStyle = node => ALIGNMENTS.has(node?.attrs?.textAlign)
  ? ` style="text-align:${node.attrs.textAlign}"`
  : "";

function renderNode(node, variables) {
  if (!node || typeof node !== "object") throw new Error("Повреждённый узел шаблона");
  switch (node.type) {
    case "doc": return renderChildren(node, variables);
    case "text": return renderMarks(escapeHtml(node.text || ""), node.marks);
    case "paragraph": return `<p${alignmentStyle(node)}>${renderChildren(node, variables)}</p>`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      return `<h${level}${alignmentStyle(node)}>${renderChildren(node, variables)}</h${level}>`;
    }
    case "hardBreak": return "<br>";
    case "bulletList": return `<ul>${renderChildren(node, variables)}</ul>`;
    case "orderedList": return `<ol>${renderChildren(node, variables)}</ol>`;
    case "listItem": return `<li>${renderChildren(node, variables)}</li>`;
    case "blockquote": return `<blockquote>${renderChildren(node, variables)}</blockquote>`;
    case "horizontalRule": return "<hr>";
    case "protectedField": return `<span data-field-id="${escapeHtml(node.attrs?.fieldId)}">${renderScalar(node.attrs?.fieldId, variables[node.attrs?.fieldId])}</span>`;
    case "dataTable": return renderWorksTable(node.attrs?.fieldId, variables[node.attrs?.fieldId]);
    case "pageBreak": return '<div class="page-break"></div>';
    case "table": return `<table><tbody>${renderChildren(node, variables)}</tbody></table>`;
    case "tableRow": return `<tr>${renderChildren(node, variables)}</tr>`;
    case "tableHeader": {
      const colspan = Math.min(20, Math.max(1, Number(node.attrs?.colspan) || 1));
      const rowspan = Math.min(100, Math.max(1, Number(node.attrs?.rowspan) || 1));
      return `<th colspan="${colspan}" rowspan="${rowspan}">${renderChildren(node, variables)}</th>`;
    }
    case "tableCell": {
      const colspan = Math.min(20, Math.max(1, Number(node.attrs?.colspan) || 1));
      const rowspan = Math.min(100, Math.max(1, Number(node.attrs?.rowspan) || 1));
      return `<td colspan="${colspan}" rowspan="${rowspan}">${renderChildren(node, variables)}</td>`;
    }
    default: throw new Error(`Неподдерживаемый узел шаблона: ${node.type}`);
  }
}

export function extractTemplateFieldIds(contentJson) {
  const found = [];
  const seen = new Set();
  const walk = node => {
    if (!node || typeof node !== "object") return;
    if ((node.type === "protectedField" || node.type === "dataTable") && !seen.has(node.attrs?.fieldId)) {
      seen.add(node.attrs?.fieldId);
      found.push(node.attrs?.fieldId);
    }
    for (const child of Array.isArray(node.content) ? node.content : []) walk(child);
  };
  walk(contentJson);
  return found;
}

export function renderTemplateToCanonicalHtml({ contentJson, variables = {}, page = DEFAULT_PAGE } = {}) {
  const documentPage = safePage(page);
  const content = renderNode(contentJson, variables || {});
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:${documentPage.size};margin:0}
    *{box-sizing:border-box}body{margin:0;padding:${documentPage.marginTopMm}mm ${documentPage.marginRightMm}mm ${documentPage.marginBottomMm}mm ${documentPage.marginLeftMm}mm;font-family:${documentPage.fontFamily};font-size:${documentPage.fontSizePt}pt;line-height:1.5;color:#000}
    p{margin:3pt 0;text-align:justify}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:8pt 0;font-size:8pt}th,td{border:1px solid #000;padding:2pt 4pt;overflow-wrap:anywhere}th{background:#e5e7eb;text-align:center}.tc{text-align:center}.tr{text-align:right}.b{font-weight:bold}.page-break{break-before:page;page-break-before:always}
  </style></head><body>${content}</body></html>`;
}

const decodeEntities = value => String(value || "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const normalizedPlain = html => decodeEntities(String(html || "")
  .replace(/<br\s*\/?\s*>/gi, " ")
  .replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ")
  .trim();

export function normalizeLegalText(html) {
  return normalizedPlain(html);
}

const extractTagTexts = (html, tag) => {
  const expression = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...String(html || "").matchAll(expression)].map(match => normalizedPlain(match[1]));
};

const withoutTables = html => String(html || "").replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, "");

const extractTableStructures = html => extractTagTexts(html, "table").map(tableText => tableText);

const equalArrays = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

const firstArrayDifference = (kind, left, right) => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return { kind, index, legacy: left[index] ?? null, candidate: right[index] ?? null };
  }
  return null;
};

export function compareCanonicalDocuments(legacyHtml, templateHtml) {
  const legacyText = normalizeLegalText(legacyHtml);
  const candidateText = normalizeLegalText(templateHtml);
  // TipTap requires paragraphs inside table cells while the legacy HTML does
  // not. Table contents are compared separately, so paragraph order is
  // compared only outside tables.
  const legacyParagraphs = extractTagTexts(withoutTables(legacyHtml), "p");
  const candidateParagraphs = extractTagTexts(withoutTables(templateHtml), "p");
  const legacyTables = extractTableStructures(legacyHtml);
  const candidateTables = extractTableStructures(templateHtml);
  const textEqual = legacyText === candidateText;
  const paragraphsEqual = equalArrays(legacyParagraphs, candidateParagraphs);
  const tablesEqual = equalArrays(legacyTables, candidateTables);
  const firstDifference = !textEqual
    ? { kind: "text", index: 0, legacy: legacyText, candidate: candidateText }
    : (!paragraphsEqual
      ? firstArrayDifference("paragraph", legacyParagraphs, candidateParagraphs)
      : firstArrayDifference("table", legacyTables, candidateTables));
  return {
    ok: textEqual && paragraphsEqual && tablesEqual,
    textEqual,
    paragraphsEqual,
    tablesEqual,
    legacyText,
    candidateText,
    firstDifference,
  };
}
