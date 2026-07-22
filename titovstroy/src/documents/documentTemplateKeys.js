export const DOCUMENT_TEMPLATES_KEY = "titovstroy-document-templates-v1";
export const DOCUMENT_TEMPLATES_BACKUPS_KEY = "titovstroy-document-templates-v1-backups";
export const DOCUMENT_SNAPSHOTS_KEY = "titovstroy-document-snapshots-v1";
export const DOCUMENT_SNAPSHOTS_BACKUPS_KEY = "titovstroy-document-snapshots-v1-backups";

// Центр шаблонов можно безопасно использовать независимо от нового генератора:
// редактор пишет только в собственные ноды и не меняет уже созданные документы.
export const DOCUMENT_TEMPLATE_CENTER_ENABLED = import.meta.env.VITE_DOCUMENT_TEMPLATE_CENTER_ON !== "0";

// Переключение печати/Word/Google Docs на новый шаблон остаётся отдельным
// явным пилотом. Без этого флага действующие генераторы работают как раньше.
export const REPAIR_TEMPLATE_EXPORT_ENABLED = import.meta.env.VITE_DOCUMENT_TEMPLATES_REPAIR_ON === "1";

export const createDocumentTemplateFeaturePolicy = (
  centerEnabled = DOCUMENT_TEMPLATE_CENTER_ENABLED,
  exportEnabled = REPAIR_TEMPLATE_EXPORT_ENABLED,
) => {
  const active = centerEnabled === true;
  return {
    enabled: active,
    showAdmin: active,
    includeBackups: active,
    allowInstances: active && exportEnabled === true,
  };
};
