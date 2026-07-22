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

const bodyHtmlOf = html => String(html || "").match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? String(html || "");

function parseHtml(html) {
  const body = bodyHtmlOf(html);
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

const normalizeMarkers = markers => (Array.isArray(markers) ? markers : [])
  .filter(marker => marker && marker.raw != null && marker.fieldId)
  .map(marker => ({ rawHtml: String(marker.raw), raw: decodeHtml(marker.raw), fieldId: String(marker.fieldId), kind: marker.kind === "table" ? "table" : "text" }));

const markerNodes = (text, marks, markers) => {
  const records = markers.filter(marker => marker.kind !== "table").sort((a, b) => b.raw.length - a.raw.length);
  const output = [];
  let rest = String(text || "");
  while (rest) {
    let found = null;
    for (const record of records) {
      const index = rest.indexOf(record.raw);
      if (index >= 0 && (!found || index < found.index || (index === found.index && record.raw.length > found.record.raw.length))) found = { index, record };
    }
    if (!found) { output.push({ type: "text", text: rest, ...(marks.length ? { marks } : {}) }); break; }
    if (found.index > 0) output.push({ type: "text", text: rest.slice(0, found.index), ...(marks.length ? { marks } : {}) });
    output.push({ type: "protectedField", attrs: { fieldId: found.record.fieldId } });
    rest = rest.slice(found.index + found.record.raw.length);
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

function inlineNodes(node, markers, marks = []) {
  if (node?.text != null) return markerNodes(node.text, marks, markers);
  if (node?.tag === "br") return [{ type: "hardBreak" }];
  if (node?.tag === "img" || node?.tag === "button") return [];
  const mark = markFor(node);
  return (node?.children || []).flatMap(child => inlineNodes(child, markers, mark ? [...marks, mark] : marks));
}

const alignAttrs = node => {
  const cls = classes(node);
  const match = String(node?.attrs?.style || "").match(/text-align\s*:\s*(left|center|right|justify)/i);
  const textAlign = match?.[1]?.toLowerCase() || (cls.has("c") || cls.has("city-line") || cls.has("t") ? "center" : cls.has("tr") || cls.has("r") ? "right" : null);
  return textAlign ? { textAlign } : undefined;
};

const descendants = (node, tag) => {
  const found = [];
  const walk = current => { if (current?.tag === tag) found.push(current); else for (const child of current?.children || []) walk(child); };
  walk(node);
  return found;
};

const tableMarker = (node, markers) => markers.find(marker => marker.kind === "table" && textOf(node).includes(marker.raw));

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "div", "dl", "fieldset", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p",
  "section", "table", "ul",
]);

const isInlineContainer = node => (
  !node?.text
  && !["root", "table", "ul", "ol"].includes(node?.tag)
  && !(node.children || []).some(child => child?.tag && BLOCK_TAGS.has(child.tag))
  && textOf(node).trim().length > 0
);

const tableNode = (node, markers) => {
  const marker = tableMarker(node, markers);
  if (marker) return { type: "dataTable", attrs: { fieldId: marker.fieldId } };
  return {
    type: "table",
    content: descendants(node, "tr").map(row => ({
      type: "tableRow",
      content: (row.children || []).filter(cell => cell.tag === "td" || cell.tag === "th").map(cell => ({
        type: cell.tag === "th" ? "tableHeader" : "tableCell",
        attrs: { colspan: Number(cell.attrs.colspan) || 1, rowspan: Number(cell.attrs.rowspan) || 1, colwidth: null },
        content: [{ type: "paragraph", content: inlineNodes(cell, markers) }],
      })),
    })).filter(row => row.content.length),
  };
};

function blockNodes(node, markers) {
  if (!node || node.text != null || classes(node).has("np")) return [];
  if (node.tag === "p") return [{ type: "paragraph", ...(alignAttrs(node) ? { attrs: alignAttrs(node) } : {}), content: inlineNodes(node, markers) }];
  if (/^h[1-6]$/.test(node.tag)) return [{ type: "heading", attrs: { level: Number(node.tag[1]), ...(alignAttrs(node) || {}) }, content: inlineNodes(node, markers) }];
  if (node.tag === "table") return [tableNode(node, markers)];
  if (node.tag === "hr") return [{ type: "horizontalRule" }];
  if (node.tag === "ul" || node.tag === "ol") return [{
    type: node.tag === "ul" ? "bulletList" : "orderedList",
    content: (node.children || []).filter(child => child.tag === "li").map(child => ({ type: "listItem", content: [{ type: "paragraph", content: inlineNodes(child, markers) }] })),
  }];
  if (isInlineContainer(node)) {
    return [{ type: "paragraph", ...(alignAttrs(node) ? { attrs: alignAttrs(node) } : {}), content: inlineNodes(node, markers) }];
  }
  const pageBreak = node.tag === "div" && /page-break-before\s*:\s*always/i.test(String(node.attrs.style || "")) ? [{ type: "pageBreak" }] : [];
  const content = [];
  const children = node.children || [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child?.tag === "table" && tableMarker(child, markers)) {
      content.push(tableNode(child, markers));
      while (index + 1 < children.length) {
        const next = children[index + 1];
        const nextText = textOf(next).replace(/\s+/g, " ").trim();
        if (next?.text != null && !nextText) { index += 1; continue; }
        const generatedSummary = (next?.tag === "table" && nextText.includes("Сводка по разделам"))
          || (next?.tag === "p" && /^(Скидка\s|ИТОГО(?:\s|:))/u.test(nextText));
        if (!generatedSummary) break;
        index += 1;
      }
      continue;
    }
    content.push(...blockNodes(child, markers));
  }
  return [...pageBreak, ...content];
}

export function importLegacyHtmlTemplate({ html, markers, requiredFieldIds = [] } = {}) {
  const normalizedMarkers = normalizeMarkers(markers);
  if (!String(html || "").trim()) return { ok: false, reason: "Действующий генератор вернул пустой документ" };
  // The title, styles and print controls are transport chrome, not document
  // content. A value mentioned only there must not be required as an editable
  // protected field inside the legal body.
  const bodyHtml = bodyHtmlOf(html);
  const counts = Object.fromEntries(normalizedMarkers.map(marker => [marker.fieldId, bodyHtml.split(marker.rawHtml).length - 1]));
  const missing = [...new Set(requiredFieldIds)].filter(fieldId => !counts[fieldId]);
  if (missing.length) return { ok: false, reason: `Действующий генератор не вернул маркер: ${missing.join(", ")}`, importReport: { ok: false, counts, missing } };
  const content = blockNodes(parseHtml(html), normalizedMarkers).filter(Boolean);
  const contentJson = { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
  const inserted = new Set();
  const collect = node => {
    if (!node || typeof node !== "object") return;
    if ((node.type === "protectedField" || node.type === "dataTable") && node.attrs?.fieldId) inserted.add(node.attrs.fieldId);
    for (const child of node.content || []) collect(child);
  };
  collect(contentJson);
  // Every marker that is actually present in the legacy output must become a
  // protected node. Required fields additionally have to exist in the output.
  // This prevents a successful import that silently leaves a real client,
  // contract or company value as editable plain text.
  const observedFieldIds = normalizedMarkers
    .filter(marker => counts[marker.fieldId] > 0)
    .map(marker => marker.fieldId);
  const notInserted = [...new Set([...requiredFieldIds, ...observedFieldIds])]
    .filter(fieldId => !inserted.has(fieldId));
  if (notInserted.length) {
    return { ok: false, reason: `Не удалось защитить автополе: ${notInserted.join(", ")}`, importReport: { ok: false, counts, missing: notInserted } };
  }
  return {
    ok: true,
    contentJson,
    fieldIds: [...inserted],
    legacyNormalizedText: String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    legacyFingerprint: `legacy-${String(html).length}-${Object.values(counts).reduce((sum, count) => sum + count, 0)}`,
    importReport: { ok: true, counts, missing: [] },
  };
}
