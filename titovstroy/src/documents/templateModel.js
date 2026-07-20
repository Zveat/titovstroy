export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_STATUSES = Object.freeze(["draft", "published", "archived"]);

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export function emptyTemplateStore() {
  return { schemaVersion: TEMPLATE_SCHEMA_VERSION, templates: [] };
}

export function normalizeTemplateStore(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.templates)) {
    return emptyTemplateStore();
  }
  const templates = value.templates.filter(item => item && typeof item === "object" && !Array.isArray(item) && item.id);
  return { schemaVersion: TEMPLATE_SCHEMA_VERSION, templates: clone(templates) };
}

function actorFields(actor, prefix) {
  return {
    [`${prefix}By`]: actor?.name || "",
    [`${prefix}ById`]: actor?.id || "",
  };
}

function resultWithTemplate(store, template) {
  return { ok: true, store, value: template };
}

function updateTemplate(storeValue, templateId, updater) {
  const store = normalizeTemplateStore(storeValue);
  const index = store.templates.findIndex(template => template.id === templateId);
  if (index < 0) return { ok: false, store, reason: "Шаблон не найден" };
  const current = clone(store.templates[index]);
  const outcome = updater(current);
  if (!outcome?.ok) return { ok: false, store, reason: outcome?.reason || "Изменение отклонено" };
  store.templates[index] = outcome.value;
  return resultWithTemplate(store, outcome.value);
}

export function createTemplate(storeValue, input, actor, now = Date.now()) {
  const store = normalizeTemplateStore(storeValue);
  const id = String(input?.id || "").trim();
  if (!id) return { ok: false, store, reason: "Не указан ID шаблона" };
  if (store.templates.some(template => template.id === id)) return { ok: false, store, reason: "Шаблон с таким ID уже существует" };
  const template = {
    id,
    type: String(input?.type || "custom"),
    name: String(input?.name || "Новый шаблон"),
    category: String(input?.category || "custom"),
    status: "draft",
    source: String(input?.source || "custom"),
    activeVersionId: null,
    supportedExports: Array.isArray(input?.supportedExports) ? [...input.supportedExports] : ["pdf", "gdoc", "docx"],
    usageContexts: Array.isArray(input?.usageContexts) ? [...input.usageContexts] : [],
    draft: null,
    versions: [],
    createdAt: now,
    ...actorFields(actor, "created"),
    updatedAt: now,
    ...actorFields(actor, "updated"),
  };
  store.templates.push(template);
  return resultWithTemplate(store, template);
}

export function walkTemplate(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  if (Array.isArray(node.content)) node.content.forEach(child => walkTemplate(child, visitor));
}

export function validateTemplateContent(contentJson, requiredFieldIds = []) {
  if (!contentJson || contentJson.type !== "doc" || !Array.isArray(contentJson.content)) {
    return { ok: false, errors: ["contentJson должен быть документом TipTap"] };
  }
  const found = new Set();
  walkTemplate(contentJson, node => {
    if (node.type === "protectedField" || node.type === "dataTable") {
      if (node.attrs?.fieldId) found.add(node.attrs.fieldId);
    }
  });
  const missing = requiredFieldIds.filter(fieldId => !found.has(fieldId));
  return missing.length
    ? { ok: false, errors: missing.map(fieldId => `Нет обязательного поля: ${fieldId}`) }
    : { ok: true, errors: [] };
}

export function saveTemplateDraft(storeValue, templateId, contentJson, actor, now = Date.now(), metadata = {}) {
  const validation = validateTemplateContent(contentJson);
  if (!validation.ok) return { ok: false, store: normalizeTemplateStore(storeValue), reason: validation.errors.join("; ") };
  return updateTemplate(storeValue, templateId, template => {
    template.draft = {
      contentJson: clone(contentJson),
      savedAt: now,
      savedBy: actor?.name || "",
      savedById: actor?.id || "",
      ...clone(metadata),
    };
    if (template.status !== "archived") template.status = template.activeVersionId ? "published" : "draft";
    template.updatedAt = now;
    Object.assign(template, actorFields(actor, "updated"));
    return { ok: true, value: template };
  });
}

export function versionId(templateId, versionNumber) {
  return `${templateId}:v${versionNumber}`;
}

export function publishTemplateDraft(storeValue, templateId, publication, actor, now = Date.now()) {
  return updateTemplate(storeValue, templateId, template => {
    const contentJson = publication?.contentJson || template.draft?.contentJson;
    if (!template.draft || !contentJson) return { ok: false, reason: "Нет сохранённого черновика" };
    const validation = validateTemplateContent(contentJson, publication?.requiredFieldIds || []);
    if (!validation.ok) return { ok: false, reason: validation.errors.join("; ") };
    if (template.source === "legacy-repair") {
      if (publication?.parityReport?.ok !== true) return { ok: false, reason: "Юридический текст не сравнен с действующим документом" };
      if (publication?.manualLegalReview !== true) return { ok: false, reason: "Не подтверждена ручная проверка юридического текста" };
    }
    const checks = publication?.exportChecks || {};
    if (!["pdf", "gdoc", "docx"].every(format => checks[format] === true)) {
      return { ok: false, reason: "Не пройдена проверка всех экспортов" };
    }
    const versionNumber = template.versions.length + 1;
    const previousVersionId = template.activeVersionId || null;
    const version = {
      id: versionId(template.id, versionNumber),
      templateId: template.id,
      versionNumber,
      contentJson: clone(contentJson),
      normalizedText: String(publication?.normalizedText || ""),
      fieldIds: [...new Set(publication?.fieldIds || [])],
      page: clone(publication?.page || {}),
      checksum: String(publication?.checksum || ""),
      publishedAt: now,
      publishedBy: actor?.name || "",
      publishedById: actor?.id || "",
      previousVersionId,
      parityReport: clone(publication?.parityReport || null),
      exportChecks: clone(checks),
    };
    template.versions = [...template.versions, version];
    template.activeVersionId = version.id;
    template.draft = null;
    template.status = "published";
    template.updatedAt = now;
    Object.assign(template, actorFields(actor, "updated"));
    return { ok: true, value: template };
  });
}

export function activateTemplateVersion(storeValue, templateId, targetVersionId, actor, now = Date.now()) {
  return updateTemplate(storeValue, templateId, template => {
    if (!template.versions.some(version => version.id === targetVersionId)) return { ok: false, reason: "Версия не найдена" };
    template.activeVersionId = targetVersionId;
    template.status = "published";
    template.updatedAt = now;
    Object.assign(template, actorFields(actor, "updated"));
    return { ok: true, value: template };
  });
}

export function archiveTemplate(storeValue, templateId, actor, now = Date.now()) {
  return updateTemplate(storeValue, templateId, template => {
    template.status = "archived";
    template.updatedAt = now;
    Object.assign(template, actorFields(actor, "updated"));
    return { ok: true, value: template };
  });
}

export function getActiveTemplateVersion(storeValue, type) {
  const store = normalizeTemplateStore(storeValue);
  const template = store.templates.find(item => item.type === type && item.status !== "archived" && item.activeVersionId);
  if (!template) return null;
  const version = template.versions.find(item => item.id === template.activeVersionId);
  return version ? clone(version) : null;
}

export function copyTemplate(storeValue, sourceTemplateId, input, actor, now = Date.now()) {
  const store = normalizeTemplateStore(storeValue);
  const source = store.templates.find(template => template.id === sourceTemplateId);
  if (!source) return { ok: false, store, reason: "Исходный шаблон не найден" };
  const active = source.versions.find(version => version.id === source.activeVersionId);
  const sourceContent = active?.contentJson || source.draft?.contentJson;
  if (!sourceContent) return { ok: false, store, reason: "В исходном шаблоне нет содержимого" };
  const created = createTemplate(store, {
    id: input?.id,
    name: input?.name || `${source.name} — копия`,
    type: input?.type || source.type,
    category: input?.category || source.category,
    supportedExports: source.supportedExports,
    usageContexts: source.usageContexts,
    source: "copy",
  }, actor, now);
  if (!created.ok) return created;
  return saveTemplateDraft(created.store, created.value.id, sourceContent, actor, now, { copiedFromTemplateId: source.id });
}

export function filterTemplates(templates, filters = {}) {
  const query = String(filters.query || "").trim().toLocaleLowerCase("ru");
  const category = String(filters.category || "all");
  const status = String(filters.status || "all");
  return (Array.isArray(templates) ? templates : []).filter(template => {
    if (!template || typeof template !== "object") return false;
    if (category !== "all" && template.category !== category) return false;
    if (status !== "all" && template.status !== status) return false;
    if (!query) return true;
    return [template.name, template.type, template.category]
      .some(value => String(value || "").toLocaleLowerCase("ru").includes(query));
  });
}

const permissionAllows = value => value === "all" || value === "own";

export function buildTemplateActions(template, permissions = {}) {
  if (!template || !permissionAllows(permissions.templateView)) return [];
  const actions = ["open"];
  if (permissionAllows(permissions.templateEdit)) actions.push("copy");
  if (template.status !== "archived" && permissionAllows(permissions.templateArchive)) actions.push("archive");
  if ((template.versions?.length || 0) > 0 && permissionAllows(permissions.templateRollback)) actions.push("history");
  return actions;
}
