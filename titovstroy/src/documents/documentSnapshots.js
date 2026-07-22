const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

const numericTime = value => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

export function documentCreatedAt(contract = {}) {
  return numericTime(contract.createdAt)
    || numericTime(contract.id)
    || numericTime(contract.date)
    || 0;
}

export function isTemplateEligible(contract, version) {
  const createdAt = documentCreatedAt(contract);
  const publishedAt = numericTime(version?.publishedAt);
  return createdAt > 0 && publishedAt > 0 && createdAt >= publishedAt;
}

const protectedSignature = contentJson => {
  const signature = [];
  const walk = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "protectedField" || node.type === "dataTable") {
      signature.push(`${node.type}:${String(node.attrs?.fieldId || "")}`);
    }
    for (const child of Array.isArray(node.content) ? node.content : []) walk(child);
  };
  walk(contentJson);
  return signature;
};

export function createDocumentSnapshot({ contract, report, source, version, variables, canonicalHtml, title, actor, now = Date.now() } = {}) {
  const entity = source || contract || report;
  const sourceEntity = report && !source ? "report" : "contract";
  if (!entity?.id) throw new Error("Не указан ID документа");
  if (!version?.id || !version?.contentJson) throw new Error("Не указана опубликованная версия шаблона");
  if (!isTemplateEligible(entity, version)) throw new Error("Документ создан раньше публикации шаблона");
  const documentId = `${sourceEntity}:${entity.id}`;
  return {
    documentId,
    sourceEntity,
    sourceEntityId: String(entity.id),
    objectId: String(entity.objectId || ""),
    documentType: String(sourceEntity === "report" ? "avr_r1" : (entity.type || "repair_fiz")),
    title: String(title || `Документ №${entity.number || entity.actNo || ""}`),
    templateId: String(version.templateId || ""),
    templateVersionId: String(version.id),
    templatePublishedAt: numericTime(version.publishedAt),
    sourceCreatedAt: documentCreatedAt(entity),
    templateVersionNumber: Number(version.versionNumber) || 1,
    contentSnapshot: clone(version.contentJson),
    variablesSnapshot: clone(variables || {}),
    canonicalHtmlSnapshot: String(canonicalHtml || ""),
    page: clone(version.page || {}),
    instanceVersions: [],
    createdAt: numericTime(now),
    createdBy: String(actor?.name || ""),
    createdById: String(actor?.id || ""),
  };
}

export function snapshotContent(snapshot) {
  const revisions = Array.isArray(snapshot?.instanceVersions) ? snapshot.instanceVersions : [];
  return clone(revisions.at(-1)?.contentJson || snapshot?.contentSnapshot || null);
}

export function appendDocumentRevision(snapshot, contentJson, actor, now = Date.now()) {
  if (!snapshot?.documentId || !snapshot?.contentSnapshot) throw new Error("Снимок документа повреждён");
  if (!contentJson || contentJson.type !== "doc" || !Array.isArray(contentJson.content)) throw new Error("Содержимое экземпляра повреждено");
  const expected = protectedSignature(snapshot.contentSnapshot);
  const actual = protectedSignature(contentJson);
  if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
    throw new Error("Защищённые поля экземпляра были изменены");
  }
  const next = clone(snapshot);
  const revisionNumber = next.instanceVersions.length + 1;
  next.instanceVersions.push({
    id: `${next.documentId}:r${revisionNumber}`,
    revisionNumber,
    contentJson: clone(contentJson),
    savedAt: numericTime(now),
    savedBy: String(actor?.name || ""),
    savedById: String(actor?.id || ""),
  });
  next.updatedAt = numericTime(now);
  next.updatedBy = String(actor?.name || "");
  next.updatedById = String(actor?.id || "");
  return next;
}

export function getSnapshotForDocument(snapshots, documentId) {
  const matches = (Array.isArray(snapshots) ? snapshots : []).filter(snapshot => snapshot?.documentId === documentId);
  return matches.length === 1 ? clone(matches[0]) : null;
}
