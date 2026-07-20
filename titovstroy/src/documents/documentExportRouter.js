import { resolveRepairContractVariables } from "./autofields.js";
import { buildCanonicalExport } from "./exportAdapters.js";
import { isTemplateEligible } from "./documentSnapshots.js";
import { getActiveTemplateVersion } from "./templateModel.js";
import { renderTemplateToCanonicalHtml } from "./templateRender.js";

const timeOf = value => {
  const numeric = Number(value?.updatedAt || value?.createdAt || value?.id || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const newest = list => [...list].sort((left, right) => timeOf(right) - timeOf(left))[0] || null;

const exactOne = (list, predicate) => {
  const matches = (Array.isArray(list) ? list : []).filter(item => item && !item.deletedAt && predicate(item));
  return matches.length === 1 ? matches[0] : null;
};

const buildContext = ({ contract, client, contragent, data }) => {
  const object = exactOne(data.objects, item => item.id === contract.objectId);
  if (!object) return { ok: false, reason: "Объект договора не найден по точному ID" };
  if (!client?.id || (contract.clientId && client.id !== contract.clientId)) return { ok: false, reason: "Клиент договора не подтверждён по точному ID" };
  if (!contragent?.id || (contract.contragentId && contragent.id !== contract.contragentId)) return { ok: false, reason: "Компания договора не подтверждена по точному ID" };
  const estimates = (Array.isArray(data.estimates) ? data.estimates : []).filter(item => item && !item.deletedAt && item.objectId === contract.objectId && (!item.parentId || item.parentId === item.id));
  const estimate = newest(estimates);
  if (!estimate && !(Array.isArray(contract.works) && contract.works.length)) return { ok: false, reason: "Смета договора не найдена по objectId" };
  return { ok: true, object, contract, estimate: estimate || {}, client, contragent };
};

const titleFor = (contract, client) => {
  const number = contract.number || String(contract.id || "").slice(-4) || "б-н";
  const date = contract.date ? ` от ${String(contract.date).split("-").reverse().join(".")}` : "";
  return `Договор ремонта №${number}${client?.name ? ` ${client.name}` : ""}${date}`.replace(/[<>:"/\\|?*]/g, "_");
};

export function createDocumentExportRouter({
  enabled = false,
  service,
  getData = () => ({}),
  exportLegacy,
  exportCanonical,
  confirmLegacy = () => false,
} = {}) {
  const legacy = (format, payload) => exportLegacy(format, payload);

  const failOrLegacy = async (reason, format, payload) => {
    const accepted = await Promise.resolve(confirmLegacy(reason));
    return accepted
      ? legacy(format, payload)
      : { ok: false, reason, canUseLegacy: true };
  };

  return {
    async exportContract(format, payload = {}) {
      const { contract, client, contragent } = payload;
      if (!contract) return { ok: false, reason: "Договор не указан" };
      if (!enabled || (contract.type || "repair_fiz") !== "repair_fiz") return legacy(format, payload);
      if (!service?.loadTemplates || !service?.getSnapshot || !service?.createSnapshot) {
        return failOrLegacy("Сервис шаблонов недоступен", format, payload);
      }

      const documentId = `contract:${contract.id}`;
      const existing = await service.getSnapshot(documentId);
      if (existing?.snapshot) {
        const exportDoc = buildCanonicalExport(existing.snapshot);
        return exportCanonical(existing.snapshot, format, exportDoc);
      }
      if (existing?.status === "unavailable" || existing?.status === "corrupt") {
        return failOrLegacy("Не удалось проверить снимок документа в облаке", format, payload);
      }

      const loaded = await service.loadTemplates();
      if (loaded?.status !== "found") return failOrLegacy("Опубликованный шаблон договора недоступен", format, payload);
      const version = getActiveTemplateVersion(loaded.store, "repair_fiz");
      if (!version) return failOrLegacy("Опубликованный шаблон договора не найден", format, payload);
      if (!isTemplateEligible(contract, version)) return legacy(format, payload);

      const context = buildContext({ contract, client, contragent, data: getData() || {} });
      if (!context.ok) return failOrLegacy(context.reason, format, payload);
      const resolved = resolveRepairContractVariables(context);
      if (!resolved.ok) {
        const missing = resolved.missing.map(item => item.label || item.fieldId).join(", ");
        return failOrLegacy(`Не заполнены обязательные данные: ${missing}`, format, payload);
      }
      let canonicalHtml;
      try {
        canonicalHtml = renderTemplateToCanonicalHtml({ contentJson: version.contentJson, variables: resolved.values, page: version.page });
      } catch (error) {
        return failOrLegacy(error?.message || "Не удалось сформировать документ", format, payload);
      }
      let created;
      try {
        created = await service.createSnapshot({
          contract,
          version,
          variables: resolved.values,
          canonicalHtml,
          title: titleFor(contract, client),
        });
      } catch (error) {
        return failOrLegacy(error?.message || "Снимок документа не сохранён в облаке", format, payload);
      }
      if (!created?.ok || !created?.committed) return failOrLegacy(created?.reason || "Снимок документа не сохранён в облаке", format, payload);
      const snapshot = created.snapshots?.find(item => item?.documentId === documentId)
        || (await service.getSnapshot(documentId))?.snapshot;
      if (!snapshot) return failOrLegacy("Облако не подтвердило созданный снимок документа", format, payload);
      const exportDoc = buildCanonicalExport(snapshot);
      return exportCanonical(snapshot, format, exportDoc);
    },
  };
}
