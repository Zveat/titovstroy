import { resolveRepairContractVariables } from "./autofields.js";
import { compareCanonicalDocuments, renderTemplateToCanonicalHtml } from "./templateRender.js";

const WORKS_MARKER = "⟦TS:estimate.worksTable⟧";

const SEED_INPUT = Object.freeze({
  contract: {
    type: "repair_fiz",
    number: "TS-CONTRACT-94731",
    date: "2099-12-27",
    advancePercent: 37,
    discount: 0,
    works: [{ category: "TS-WORK-CATEGORY", subcategory: "TS-WORK-SUBCATEGORY", name: WORKS_MARKER, unit: "м²", quantity: 1, price: 9876543 }],
  },
  client: {
    name: "Клиентмаркер Имямаркер Отчествомаркер",
    iin: "TS-IIN-991122334455",
    doc: "TS-DOC-883377",
    address: "TS-OBJECT-ADDRESS-741",
    phone: "TS-PHONE-77000000001",
    objectType: "TS-OBJECT-TYPE-REPAIR",
    type: "физ",
  },
  company: {
    name: "TS-COMPANY-NAME-951",
    bin: "TS-COMPANY-BIN-951",
    bank: "TS-COMPANY-BANK-951",
    bik: "TS-COMPANY-BIK-951",
    account: "TS-COMPANY-ACCOUNT-951",
    address: "TS-COMPANY-ADDRESS-951",
    phone: "TS-COMPANY-PHONE-951",
    email: "TS-COMPANY-EMAIL-951",
    director: "TS-COMPANY-DIRECTOR-951",
  },
});

const MARKERS = Object.freeze([
  [WORKS_MARKER, "estimate.worksTable", "table"],
  ["Клиентмаркер Имямаркер Отчествомаркер", "client.name", "text"],
  ["Клиентмаркер И.О.", "client.shortName", "text"],
  ["TS-IIN-991122334455", "client.iin", "text"],
  ["TS-DOC-883377", "client.document", "text"],
  ["TS-OBJECT-ADDRESS-741", "object.address", "text"],
  ["TS-PHONE-77000000001", "client.phone", "text"],
  ["TS-OBJECT-TYPE-REPAIR", "object.type", "text"],
  ["TS-CONTRACT-94731", "contract.number", "text"],
  ["27.12.2099", "contract.dateFull", "text"],
  ["«27» декабря 2099", "contract.dateLong", "text"],
  ["37%", "contract.advancePercentText", "text"],
  ["3 654 321 тенге", "contract.advanceAmountText", "text"],
  ["9 876 543 ₸", "contract.total", "text"],
  ["TS-COMPANY-NAME-951", "company.name", "text"],
  ["TS-COMPANY-BIN-951", "company.bin", "text"],
  ["TS-COMPANY-BANK-951", "company.bank", "text"],
  ["TS-COMPANY-BIK-951", "company.bik", "text"],
  ["TS-COMPANY-ACCOUNT-951", "company.account", "text"],
  ["TS-COMPANY-ADDRESS-951", "company.address", "text"],
  ["TS-COMPANY-PHONE-951", "company.phone", "text"],
  ["TS-COMPANY-EMAIL-951", "company.email", "text"],
  ["TS-COMPANY-DIRECTOR-951", "company.director", "text"],
]);

const decodeHtml = value => String(value || "")
  .replace(/&nbsp;/gi, "\u00a0").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const parseAttrs = source => {
  const attrs = {};
  for (const match of String(source || "").matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
};

function parseHtml(html) {
  const body = String(html || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? String(html || "");
  const root = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  const voidTags = new Set(["br", "hr", "img", "meta", "link", "input"]);
  for (const token of body.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith("<!--") || token.startsWith("<!")) continue;
    if (!token.startsWith("<")) { stack.at(-1).children.push({ text: decodeHtml(token) }); continue; }
    const closing = token.match(/^<\s*\/\s*([\w-]+)/);
    if (closing) {
      const tag = closing[1].toLowerCase();
      while (stack.length > 1) { const node = stack.pop(); if (node.tag === tag) break; }
      continue;
    }
    const opening = token.match(/^<\s*([\w-]+)([\s\S]*?)\/?\s*>$/);
    if (!opening) continue;
    const node = { tag: opening[1].toLowerCase(), attrs: parseAttrs(opening[2]), children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(node.tag) && !token.endsWith("/>")) stack.push(node);
  }
  return root;
}

const textOf = node => node?.text ?? (node?.children || []).map(textOf).join("");
const classes = node => new Set(String(node?.attrs?.class || "").split(/\s+/).filter(Boolean));
const markerCounts = html => Object.fromEntries(MARKERS.map(([raw, fieldId]) => [fieldId, String(html).split(raw).length - 1]));

const markerNodes = (text, marks = []) => {
  const records = MARKERS.filter(([, , kind]) => kind !== "table").sort((a, b) => b[0].length - a[0].length);
  const output = [];
  let rest = String(text || "");
  while (rest) {
    let found = null;
    for (const record of records) {
      const index = rest.indexOf(record[0]);
      if (index >= 0 && (!found || index < found.index || (index === found.index && record[0].length > found.record[0].length))) found = { index, record };
    }
    if (!found) { if (rest) output.push({ type: "text", text: rest, ...(marks.length ? { marks } : {}) }); break; }
    if (found.index > 0) output.push({ type: "text", text: rest.slice(0, found.index), ...(marks.length ? { marks } : {}) });
    output.push({ type: "protectedField", attrs: { fieldId: found.record[1] } });
    rest = rest.slice(found.index + found.record[0].length);
  }
  return output;
};

const markFor = node => {
  const cls = classes(node);
  if (node.tag === "b" || node.tag === "strong" || cls.has("b") || cls.has("s") || cls.has("t")) return { type: "bold" };
  if (node.tag === "i" || node.tag === "em") return { type: "italic" };
  if (node.tag === "u") return { type: "underline" };
  return null;
};

function inlineNodes(node, marks = []) {
  if (node?.text != null) return markerNodes(node.text, marks);
  if (node?.tag === "br") return [{ type: "hardBreak" }];
  if (node?.tag === "img" || node?.tag === "button") return [];
  const mark = markFor(node);
  const nextMarks = mark ? [...marks, mark] : marks;
  return (node?.children || []).flatMap(child => inlineNodes(child, nextMarks));
}

const alignAttrs = node => {
  const cls = classes(node);
  const style = String(node?.attrs?.style || "");
  const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
  const textAlign = match?.[1]?.toLowerCase() || (cls.has("c") || cls.has("city-line") || cls.has("t") ? "center" : cls.has("tr") ? "right" : null);
  return textAlign ? { textAlign } : undefined;
};

const descendants = (node, tag) => {
  const found = [];
  const walk = current => { if (current?.tag === tag) found.push(current); else for (const child of current?.children || []) walk(child); };
  walk(node);
  return found;
};

const tableNode = node => {
  if (textOf(node).includes(WORKS_MARKER)) return { type: "dataTable", attrs: { fieldId: "estimate.worksTable" } };
  return {
    type: "table",
    content: descendants(node, "tr").map(row => ({
      type: "tableRow",
      content: (row.children || []).filter(cell => cell.tag === "td" || cell.tag === "th").map(cell => ({
        type: cell.tag === "th" ? "tableHeader" : "tableCell",
        attrs: { colspan: Number(cell.attrs.colspan) || 1, rowspan: Number(cell.attrs.rowspan) || 1, colwidth: null },
        content: [{ type: "paragraph", content: inlineNodes(cell).filter(item => item.type !== "hardBreak" || true) }],
      })),
    })).filter(row => row.content.length),
  };
};

function blockNodes(node) {
  if (!node || node.text != null) return [];
  if (classes(node).has("np")) return [];
  if (node.tag === "p") return [{ type: "paragraph", ...(alignAttrs(node) ? { attrs: alignAttrs(node) } : {}), content: inlineNodes(node) }];
  if (/^h[1-6]$/.test(node.tag)) return [{ type: "heading", attrs: { level: Number(node.tag[1]), ...(alignAttrs(node) || {}) }, content: inlineNodes(node) }];
  if (node.tag === "table") return [tableNode(node)];
  if (node.tag === "hr") return [{ type: "horizontalRule" }];
  if (node.tag === "ul" || node.tag === "ol") return [{ type: node.tag === "ul" ? "bulletList" : "orderedList", content: (node.children || []).filter(child => child.tag === "li").map(child => ({ type: "listItem", content: [{ type: "paragraph", content: inlineNodes(child) }] })) }];
  const pageBreak = node.tag === "div" && /page-break-before\s*:\s*always/i.test(String(node.attrs.style || "")) ? [{ type: "pageBreak" }] : [];
  const children = [];
  const source = node.children || [];
  for (let index = 0; index < source.length; index += 1) {
    const child = source[index];
    if (child?.tag === "table" && textOf(child).includes(WORKS_MARKER)) {
      children.push(tableNode(child));
      while (index + 1 < source.length) {
        const next = source[index + 1];
        const nextText = textOf(next).replace(/\s+/g, " ").trim();
        if (next?.text != null && !nextText) {
          index += 1;
          continue;
        }
        const generatedSummary = (next?.tag === "table" && nextText.includes("Сводка по разделам"))
          || (next?.tag === "p" && /^(Скидка\s|ИТОГО(?:\s|:))/u.test(nextText));
        if (!generatedSummary) break;
        index += 1;
      }
      continue;
    }
    children.push(...blockNodes(child));
  }
  return [...pageBreak, ...children];
}

export function createRepairLegacySeed({ buildLegacyHtml, requiredFieldIds } = {}) {
  if (typeof buildLegacyHtml !== "function") return { ok: false, reason: "Действующий генератор не подключён" };
  const legacyHtml = buildLegacyHtml(SEED_INPUT.contract, SEED_INPUT.client, SEED_INPUT.company, false, "");
  const counts = markerCounts(legacyHtml);
  const required = Array.isArray(requiredFieldIds)
    ? requiredFieldIds
    : [...new Set(MARKERS.map(([, fieldId]) => fieldId))];
  const missing = required.filter(fieldId => !counts[fieldId]);
  if (missing.length) return { ok: false, reason: `Действующий генератор не вернул маркер: ${missing.join(", ")}`, importReport: { ok: false, counts, missing } };
  const rawContent = parseHtml(legacyHtml).children.flatMap(blockNodes).filter(Boolean);
  let afterDataTable = false;
  const content = rawContent.filter(node => {
    if (node?.type === "dataTable") {
      afterDataTable = true;
      return true;
    }
    if (!afterDataTable || node?.type !== "paragraph") {
      afterDataTable = false;
      return true;
    }
    const value = (node.content || []).map(item => item.text || "").join("").replace(/\s+/g, " ").trim();
    const generatedSummary = /^(Скидка\s|ИТОГО(?:\s|:))/u.test(value);
    if (!generatedSummary) afterDataTable = false;
    return !generatedSummary;
  });
  const contentJson = { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
  return {
    ok: true,
    source: "legacy-repair",
    contentJson,
    legacyNormalizedText: String(legacyHtml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    legacyFingerprint: `legacy-${String(legacyHtml).length}-${Object.values(counts).reduce((sum, count) => sum + count, 0)}`,
    fieldIds: [...new Set(MARKERS.filter(([, fieldId]) => counts[fieldId] > 0).map(([, fieldId]) => fieldId))],
    importReport: { ok: true, counts, missing: [] },
  };
}

export function createRepairParityReport({ buildLegacyHtml, contentJson, context } = {}) {
  if (typeof buildLegacyHtml !== "function") return { ok: false, reason: "Действующий генератор не подключён" };
  const resolved = resolveRepairContractVariables(context);
  if (!resolved.ok) return { ok: false, reason: "Не заполнены обязательные автополя", missing: resolved.missing };
  const legacyHtml = buildLegacyHtml(context.contract, context.client, context.contragent, false, "");
  const candidateHtml = renderTemplateToCanonicalHtml({ contentJson, variables: resolved.values });
  return compareCanonicalDocuments(legacyHtml, candidateHtml);
}
