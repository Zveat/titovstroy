import { AUTOFIELD_DEFINITIONS, resolveDocumentVariables } from "./autofields.js";
import { buildCanonicalExport } from "./exportAdapters.js";
import { isTemplateEligible } from "./documentSnapshots.js";
import { documentTypeById } from "./documentTypeRegistry.js";
import { getActiveTemplateVersion } from "./templateModel.js";
import { renderTemplateToCanonicalHtml } from "./templateRender.js";

const timeOf = value => {
  const numeric = Number(value?.updatedAt || value?.createdAt || value?.id || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};
const newest = list => [...list].sort((a, b) => timeOf(b) - timeOf(a))[0] || null;
const exactOne = (list, predicate) => {
  const matches = (Array.isArray(list) ? list : []).filter(item => item && !item.deletedAt && predicate(item));
  return matches.length === 1 ? matches[0] : null;
};

const buildContractContext = ({ contract, client, contragent, data }) => {
  const type = contract.type || "repair_fiz";
  const isPodryad = type === "podryad" || type === "podryad_annex";
  if (!isPodryad && (!client?.id || (contract.clientId && client.id !== contract.clientId))) {
    return { ok: false, reason: "Клиент договора не подтверждён по точному ID" };
  }
  if (!contragent?.id || (contract.contragentId && contragent.id !== contract.contragentId)) {
    return { ok: false, reason: "Компания договора не подтверждена по точному ID" };
  }
  // Reservation agreements created in "Other documents" intentionally have no
  // object card. Their legacy form stores the address on the contract/client,
  // so keep that supported without weakening exact objectId checks elsewhere.
  const standaloneReservation = type === "reservation" && !contract.objectId;
  const object = standaloneReservation
    ? { id: "", address: contract.objectAddress || contract.estAddress || client?.address || "", type: contract.objectType || "" }
    : exactOne(data.objects, item => item.id === contract.objectId);
  if (!object) return { ok: false, reason: "Объект договора не найден по точному ID" };
  const estimates = (Array.isArray(data.estimates) ? data.estimates : []).filter(item => item && !item.deletedAt && item.objectId === contract.objectId && (!item.parentId || item.parentId === item.id));
  const estimate = newest(estimates) || {};
  if (!isPodryad && !estimate.id && !(Array.isArray(contract.works) && contract.works.length) && ["repair_fiz", "annex"].includes(type)) {
    return { ok: false, reason: "Смета договора не найдена по objectId" };
  }
  const contractor = isPodryad ? exactOne(data.workers, item => item.id === contract.workerId) || contract.worker || null : null;
  if (isPodryad && !contractor) return { ok: false, reason: "Подрядчик договора не найден по точному ID" };
  return { ok: true, object, contract, estimate, client: client || {}, contragent, contractor };
};

const titleForContract = (contract, client, contractor) => {
  const type = documentTypeById(contract.type || "repair_fiz");
  const number = contract.number || contract.mainNumber || String(contract.id || "").slice(-4) || "б-н";
  const party = contractor?.name || client?.name || "";
  return `${type?.name || "Документ"} №${number}${party ? ` ${party}` : ""}`.replace(/[<>:"/\\|?*]/g, "_");
};
const titleForReport = report => `АВР №${report.actNo || "б-н"}${report.clientName ? ` ${report.clientName}` : ""}`.replace(/[<>:"/\\|?*]/g, "_");

const sampleTable = Object.freeze({
  rows: [{ id: "sample-row", category: "Работы", subcategory: "", name: "Пример позиции", unit: "м²", quantity: 1, price: 100000, sum: 100000 }],
  subtotal: 100000,
  total: 100000,
  discountPercent: 0,
  discountAmount: 0,
});

const sampleValue = definition => {
  if (definition.kind === "table") return { ...sampleTable, rows: sampleTable.rows.map(row => ({ ...row })) };
  if (definition.kind === "money") return 100000;
  if (definition.kind === "number") return 1;
  if (definition.kind === "date") return "дд.мм.гггг";
  return `[${definition.label}]`;
};

const sampleVariablesFor = version => ({
  ...Object.fromEntries(AUTOFIELD_DEFINITIONS.map(definition => [definition.id, sampleValue(definition)])),
  ...(version?.previewVariables || {}),
  "contract.number": "ОБРАЗЕЦ",
  "contract.mainNumber": "ОБРАЗЕЦ",
});

const withSampleMark = html => {
  const mark = `<div data-document-sample style="position:fixed;inset:0;z-index:9999;pointer-events:none;display:flex;align-items:center;justify-content:center"><div style="transform:rotate(-24deg);text-align:center;color:rgba(220,38,38,.13);font:800 34pt Arial,sans-serif;line-height:1.2;letter-spacing:1px">ОБРАЗЕЦ<br><span style="font-size:15pt">НЕ ДЛЯ ПОДПИСАНИЯ</span></div></div>`;
  const notice = `<div data-document-sample-notice style="margin:0 0 7mm;padding:2.5mm 4mm;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;text-align:center;font:700 9pt Arial,sans-serif">ОБРАЗЕЦ · НЕ ДЛЯ ПОДПИСАНИЯ</div>`;
  const body = String(html || "");
  return /<body[^>]*>/i.test(body) ? body.replace(/<body([^>]*)>/i, `<body$1>${mark}${notice}`) : `${mark}${notice}${body}`;
};

export function createDocumentExportRouter({ enabled = false, service, getData = () => ({}), exportLegacy, exportCanonical, confirmLegacy } = {}) {
  const legacy = (format, payload) => exportLegacy(format, payload);
  const safeLegacy = async (reason, format, payload) => {
    console.warn("document template fallback:", reason);
    if (typeof confirmLegacy === "function") {
      const accepted = await confirmLegacy(reason, { format, payload });
      if (!accepted) return { ok: false, canUseLegacy: true, reason, route: "template-blocked" };
    }
    return legacy(format, payload);
  };

  const exportFromTemplate = async ({ format, payload, source, sourceEntity, type, context, buildContext, title }) => {
    if (!enabled || !documentTypeById(type)) return legacy(format, payload);
    if (!service?.loadTemplates || !service?.getSnapshot || !service?.createSnapshot) return safeLegacy("Сервис шаблонов недоступен", format, payload);
    const documentId = `${sourceEntity}:${source.id}`;
    try {
      const existing = await service.getSnapshot(documentId);
      if (existing?.snapshot) {
        const exportDoc = buildCanonicalExport(existing.snapshot);
        exportDoc.documentType = type;
        if (format === "pdf" && (payload?.withStamp ?? source?.withStamp)) exportDoc.pdfStampFile = payload?.contragent?.stampFile || context?.contragent?.stampFile || "stamp.jpg";
        return exportCanonical(existing.snapshot, format, exportDoc);
      }
      if (existing?.status === "unavailable" || existing?.status === "corrupt") return safeLegacy("Снимок недоступен", format, payload);

      const loaded = await service.loadTemplates();
      if (loaded?.status !== "found") return safeLegacy("Опубликованные шаблоны недоступны", format, payload);
      const version = getActiveTemplateVersion(loaded.store, type);
      if (!version || !isTemplateEligible(source, version)) return legacy(format, payload);
      const actualContext = typeof buildContext === "function" ? buildContext() : context;
      if (actualContext?.ok === false) return safeLegacy(actualContext.reason, format, payload);
      const resolved = resolveDocumentVariables(actualContext, type);
      if (!resolved.ok) return safeLegacy(`Не заполнены автополя: ${resolved.missing.map(item => item.label || item.fieldId).join(", ")}`, format, payload);
      const canonicalHtml = renderTemplateToCanonicalHtml({ contentJson: version.contentJson, variables: resolved.values, page: version.page });
      const created = await service.createSnapshot({
        ...(sourceEntity === "report" ? { report: source } : { contract: source }),
        version, variables: resolved.values, canonicalHtml,
        title: typeof title === "function" ? title(actualContext) : title,
      });
      if (!created?.ok || !created?.committed) return safeLegacy(created?.reason || "Снимок не подтверждён облаком", format, payload);
      const snapshot = created.snapshots?.find(item => item?.documentId === documentId) || (await service.getSnapshot(documentId))?.snapshot;
      if (!snapshot) return safeLegacy("Облако не вернуло снимок", format, payload);
      const exportDoc = buildCanonicalExport(snapshot);
      exportDoc.documentType = type;
      if (format === "pdf" && (payload?.withStamp ?? source?.withStamp)) exportDoc.pdfStampFile = payload?.contragent?.stampFile || actualContext?.contragent?.stampFile || context?.contragent?.stampFile || "stamp.jpg";
      return exportCanonical(snapshot, format, exportDoc);
    } catch (error) {
      return safeLegacy(error?.message || "Ошибка генератора шаблонов", format, payload);
    }
  };

  return {
    async exportContractSample(format, payload = {}) {
      const type = payload.type || payload.contract?.type || "repair_fiz";
      const definition = documentTypeById(type);
      if (format !== "pdf") return { ok: false, reason: "Образец доступен только в PDF" };
      if (!enabled || !definition || !service?.loadTemplates) return { ok: false, reason: "Опубликованный шаблон недоступен" };
      try {
        const loaded = await service.loadTemplates();
        if (loaded?.status !== "found") return { ok: false, reason: "Опубликованные шаблоны недоступны" };
        const version = getActiveTemplateVersion(loaded.store, type);
        if (!version) return { ok: false, reason: "Сначала опубликуйте шаблон этого документа" };
        const variables = sampleVariablesFor(version);
        const canonicalHtml = renderTemplateToCanonicalHtml({ contentJson: version.contentJson, variables, page: version.page });
        const snapshot = {
          documentId: `sample:${type}`,
          title: `ОБРАЗЕЦ — ${definition.name}`,
          contentSnapshot: version.contentJson,
          variablesSnapshot: variables,
          canonicalHtmlSnapshot: canonicalHtml,
          page: version.page,
          templateVersionNumber: version.versionNumber,
          templatePublishedAt: version.publishedAt,
          instanceVersions: [],
        };
        const exportDoc = buildCanonicalExport(snapshot);
        const result = await exportCanonical(snapshot, format, { ...exportDoc, canonicalHtml: withSampleMark(exportDoc.canonicalHtml) });
        return result?.ok === false ? result : { ...result, ok: true, route: "template-sample", sample: true };
      } catch (error) {
        return { ok: false, reason: error?.message || "Не удалось создать образец" };
      }
    },
    async exportContract(format, payload = {}) {
      const { contract, client, contragent } = payload;
      if (!contract) return { ok: false, reason: "Договор не указан" };
      const data = getData() || {};
      return exportFromTemplate({
        format, payload, source: contract, sourceEntity: "contract", type: contract.type || "repair_fiz",
        buildContext: () => buildContractContext({ contract, client, contragent, data }),
        title: context => titleForContract(contract, client, context?.contractor),
      });
    },
    async exportReport(format, payload = {}) {
      const report = payload.report;
      if (!report) return { ok: false, reason: "Акт не указан" };
      const data = getData() || {};
      const object = exactOne(data.objects, item => item.id === report.objectId) || {};
      const contragent = payload.contragent || (data.contragents || [])[0] || {};
      return exportFromTemplate({
        format, payload, source: report, sourceEntity: "report", type: "avr_r1",
        context: { report, object, client: payload.client || {}, contragent, moneyWords: data.moneyWords },
        title: titleForReport(report),
      });
    },
  };
}
