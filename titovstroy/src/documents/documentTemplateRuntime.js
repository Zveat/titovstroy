import { createDocumentExportRouter } from "./documentExportRouter.js";
import { REPAIR_TEMPLATE_ENABLED } from "./documentTemplateKeys.js";
import { createDocumentTemplateService } from "./documentTemplateService.js";
import {
  buildDocxBlobFromCanonical,
  createBrowserGoogleUploader,
  downloadBlobFile,
  openPdfFromCanonical,
  uploadGoogleDocFromCanonical,
} from "./exportAdapters.js";

export function createDocumentTemplateRuntime({
  storage,
  actor,
  audit,
  legacyRepairRenderer,
  getData,
  legacyExports,
  openOrPrintHtml,
  googleClientId,
  confirmLegacy,
} = {}) {
  const service = createDocumentTemplateService({
    storage,
    actor,
    audit,
    legacyRepairRenderer,
  });
  const googleUploader = createBrowserGoogleUploader({ clientId: googleClientId });
  const router = createDocumentExportRouter({
    enabled: REPAIR_TEMPLATE_ENABLED,
    service,
    getData,
    exportLegacy: async (format, payload) => {
      const handler = legacyExports?.[format];
      if (typeof handler !== "function") return { ok: false, reason: `Неизвестный формат: ${format}` };
      await handler(payload);
      return { ok: true, route: "legacy" };
    },
    exportCanonical: async (snapshot, format, exportDoc) => {
      if (format === "pdf") return openPdfFromCanonical(exportDoc, html => openOrPrintHtml(html, 30000));
      if (format === "gdoc") return uploadGoogleDocFromCanonical(exportDoc, { uploadHtml: googleUploader });
      if (format === "docx") {
        const imported = await import("docx");
        const D = imported.Document ? imported : (imported.default?.Document ? imported.default : imported);
        const result = await buildDocxBlobFromCanonical(exportDoc, D);
        if (!result.ok) return result;
        const safeTitle = `${exportDoc.title}.docx`.replace(/[<>:"/\\|?*]/g, "_");
        return { ...result, ...downloadBlobFile(result.blob, safeTitle) };
      }
      return { ok: false, reason: `Неизвестный формат: ${format}` };
    },
    confirmLegacy,
  });

  return {
    enabled: REPAIR_TEMPLATE_ENABLED,
    service,
    exportContract: router.exportContract,
  };
}
