import {
  DOCUMENT_SNAPSHOTS_BACKUPS_KEY,
  DOCUMENT_SNAPSHOTS_KEY,
  DOCUMENT_TEMPLATES_BACKUPS_KEY,
  DOCUMENT_TEMPLATES_KEY,
} from "./documentTemplateKeys.js";

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isTipTapDocument = value => isPlainObject(value) && value.type === "doc" && Array.isArray(value.content);

export const DOCUMENT_TEMPLATE_BACKUP_SECTIONS = Object.freeze([
  Object.freeze({ k: "documentTemplates", label: "Шаблоны документов", key: DOCUMENT_TEMPLATES_KEY, bkey: DOCUMENT_TEMPLATES_BACKUPS_KEY, managedRestore: true }),
  Object.freeze({ k: "documentSnapshots", label: "Снимки документов", key: DOCUMENT_SNAPSHOTS_KEY, bkey: DOCUMENT_SNAPSHOTS_BACKUPS_KEY, managedRestore: true }),
]);

const validateTemplate = (template, index) => {
  if (!isPlainObject(template)) return `шаблон #${index} не является объектом`;
  if (!template.id || !template.type) return `шаблон #${index} без id/type`;
  if (!Array.isArray(template.versions)) return `шаблон «${template.id}»: versions должен быть массивом`;
  if (!['draft', 'published', 'archived'].includes(template.status)) return `шаблон «${template.id}»: неверный status`;
  if (template.draft != null) {
    if (!isPlainObject(template.draft) || !isTipTapDocument(template.draft.contentJson)) return `шаблон «${template.id}»: повреждён draft.contentJson`;
  }
  const ids = new Set();
  for (let versionIndex = 0; versionIndex < template.versions.length; versionIndex += 1) {
    const version = template.versions[versionIndex];
    if (!isPlainObject(version)) return `шаблон «${template.id}»: версия #${versionIndex} не объект`;
    if (!version.id || version.templateId !== template.id || !Number.isInteger(version.versionNumber) || version.versionNumber < 1) {
      return `шаблон «${template.id}»: версия #${versionIndex} без неизменяемых id/templateId/versionNumber`;
    }
    if (ids.has(version.id)) return `шаблон «${template.id}»: дублируется версия «${version.id}»`;
    ids.add(version.id);
    if (!isTipTapDocument(version.contentJson)) return `шаблон «${template.id}»: версия «${version.id}» без TipTap-документа`;
    if (version.publishedAt == null) return `шаблон «${template.id}»: версия «${version.id}» без publishedAt`;
  }
  if (template.activeVersionId != null && !ids.has(template.activeVersionId)) return `шаблон «${template.id}»: activeVersionId не найден в versions`;
  return null;
};

export function validateTemplateBackupItem(item) {
  if (!isPlainObject(item) || item.schemaVersion !== 1 || !Array.isArray(item.templates)) {
    return "хранилище шаблонов должно иметь schemaVersion=1 и массив templates";
  }
  for (let index = 0; index < item.templates.length; index += 1) {
    const error = validateTemplate(item.templates[index], index);
    if (error) return error;
  }
  return null;
}

export function validateSnapshotBackupItem(item, index = 0) {
  if (!isPlainObject(item)) return `снимок #${index} не является объектом`;
  if (!item.documentId || !item.objectId || !item.templateVersionId) return `снимок #${index} без documentId/objectId/templateVersionId`;
  if (item.schemaVersion !== 1) return `снимок «${item.documentId}» имеет неизвестную schemaVersion`;
  if (!isTipTapDocument(item.contentSnapshot)) return `снимок «${item.documentId}» без contentSnapshot`;
  if (item.createdAt == null) return `снимок «${item.documentId}» без createdAt`;
  return null;
}

export function documentTemplateBackupSpecs() {
  return [
    { key: "documentTemplates", idKey: false, itemValidator: validateTemplateBackupItem },
    { key: "documentSnapshots", idKey: "documentId", itemValidator: validateSnapshotBackupItem },
  ];
}

export async function restoreDocumentTemplateSections({ data, has, restoreKey } = {}) {
  const restored = [];
  for (const section of DOCUMENT_TEMPLATE_BACKUP_SECTIONS) {
    if (!has(section.k)) continue;
    await restoreKey(section.key, section.bkey, data[section.k], section.label);
    restored.push(section.k);
  }
  return restored;
}
