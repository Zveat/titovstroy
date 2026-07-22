import { resolveDocumentVariables } from "./autofields.js";
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
  const object = exactOne(data.objects, item => item.id === contract.objectId);
  if (!object) return { ok: false, reason: "Объект договора не найден по точному ID" };
  const type = contract.type || "repair_fiz";
  const isPodryad = type === "podryad" || type === "podryad_annex";
  if (!isPodryad && (!client?.id || (contract.clientId && client.id !== contract.clientId))) {
    return { ok: false, reason: "Клиент договора не подтверждён по точному ID" };
  }
  if (!contragent?.id || (contract.contragentId && contragent.id !== contract.contragentId)) {
    return { ok: false, reason: "Компания договора не подтверждена по точному ID" };
  }
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

export function createDocumentExportRouter({ enabled = false, service, getData = () => ({}), exportLegacy, exportCanonical } = {}) {
  const legacy = (format, payload) => exportLegacy(format, payload);
  const safeLegacy = async (reason, format, payload) => {
    console.warn("document template fallback:", reason);
    return legacy(format, payload);
  };

  const exportFromTemplate = async ({ format, payload, source, sourceEntity, type, context, title }) => {
    if (!enabled || !documentTypeById(type)) return legacy(format, payload);
    if (!service?.loadTemplates || !service?.getSnapshot || !service?.createSnapshot) return safeLegacy("Сервис шаблонов недоступен", format, payload);
    const documentId = `${sourceEntity}:${source.id}`;
    try {
      const existing = await service.getSnapshot(documentId);
      if (existing?.snapshot) return exportCanonical(existing.snapshot, format, buildCanonicalExport(existing.snapshot));
      if (existing?.status === "unavailable" || existing?.status === "corrupt") return safeLegacy("Снимок недоступен", format, payload);

      const loaded = await service.loadTemplates();
      if (loaded?.status !== "found") return safeLegacy("Опубликованные шаблоны недоступны", format, payload);
      const version = getActiveTemplateVersion(loaded.store, type);
      if (!version || !isTemplateEligible(source, version)) return legacy(format, payload);
      const resolved = resolveDocumentVariables(context, type);
      if (!resolved.ok) return safeLegacy(`Не заполнены автополя: ${resolved.missing.map(item => item.label || item.fieldId).join(", ")}`, format, payload);
      const canonicalHtml = renderTemplateToCanonicalHtml({ contentJson: version.contentJson, variables: resolved.values, page: version.page });
      const created = await service.createSnapshot({
        ...(sourceEntity === "report" ? { report: source } : { contract: source }),
        version, variables: resolved.values, canonicalHtml, title,
      });
      if (!created?.ok || !created?.committed) return safeLegacy(created?.reason || "Снимок не подтверждён облаком", format, payload);
      const snapshot = created.snapshots?.find(item => item?.documentId === documentId) || (await service.getSnapshot(documentId))?.snapshot;
      if (!snapshot) return safeLegacy("Облако не вернуло снимок", format, payload);
      return exportCanonical(snapshot, format, buildCanonicalExport(snapshot));
    } catch (error) {
      return safeLegacy(error?.message || "Ошибка генератора шаблонов", format, payload);
    }
  };

  return {
    async exportContract(format, payload = {}) {
      const { contract, client, contragent } = payload;
      if (!contract) return { ok: false, reason: "Договор не указан" };
      const data = getData() || {};
      const context = buildContractContext({ contract, client, contragent, data });
      if (!context.ok) return safeLegacy(context.reason, format, payload);
      return exportFromTemplate({
        format, payload, source: contract, sourceEntity: "contract", type: contract.type || "repair_fiz", context,
        title: titleForContract(contract, client, context.contractor),
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
