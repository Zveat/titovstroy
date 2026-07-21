export const DOCUMENT_TEMPLATES_KEY = "titovstroy-document-templates-v1";
export const DOCUMENT_TEMPLATES_BACKUPS_KEY = "titovstroy-document-templates-v1-backups";
export const DOCUMENT_SNAPSHOTS_KEY = "titovstroy-document-snapshots-v1";
export const DOCUMENT_SNAPSHOTS_BACKUPS_KEY = "titovstroy-document-snapshots-v1-backups";

export const REPAIR_TEMPLATE_ENABLED = import.meta.env.VITE_DOCUMENT_TEMPLATES_REPAIR_ON === "1";

export const createDocumentTemplateFeaturePolicy = (enabled = REPAIR_TEMPLATE_ENABLED) => {
  const active = enabled === true;
  return {
    enabled: active,
    showAdmin: active,
    includeBackups: active,
    allowInstances: active,
  };
};
