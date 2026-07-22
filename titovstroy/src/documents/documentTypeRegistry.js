const defineType = input => Object.freeze({
  source: "legacy-import",
  supportedExports: ["pdf", "gdoc", "docx"],
  usageContexts: ["objects"],
  ...input,
  requiredFieldIds: Object.freeze([...(input.requiredFieldIds || [])]),
  supportedExports: Object.freeze([...(input.supportedExports || ["pdf", "gdoc", "docx"])]),
  usageContexts: Object.freeze([...(input.usageContexts || ["objects"])]),
});

export const DOCUMENT_TYPE_REGISTRY = Object.freeze([
  defineType({
    id: "repair_fiz", templateId: "repair-fiz-legacy", name: "Договор ремонта",
    category: "contracts", requiredFieldIds: ["contract.number", "contract.dateLong", "client.name", "client.iin", "object.address", "estimate.worksTable", "company.name", "company.bin"],
  }),
  defineType({
    id: "annex", templateId: "legacy-repair-annex", name: "Дополнительное соглашение к договору ремонта",
    category: "annexes", requiredFieldIds: ["contract.mainNumber", "contract.appendixNumber", "client.name", "object.address", "estimate.worksTable", "company.name"],
  }),
  defineType({
    id: "design", templateId: "legacy-design-contract", name: "Соглашение о разработке дизайн-проекта",
    category: "design", requiredFieldIds: ["contract.number", "contract.dateFull", "client.name", "object.address", "company.name"],
  }),
  defineType({
    id: "design_add", templateId: "legacy-design-addendum", name: "Дополнительное соглашение к дизайн-проекту",
    category: "design", requiredFieldIds: ["contract.number", "contract.mainNumber", "client.name", "object.address", "company.name"],
  }),
  defineType({
    id: "reservation", templateId: "legacy-reservation-agreement", name: "Соглашение о резервировании",
    category: "agreements", requiredFieldIds: ["contract.number", "contract.dateFull", "client.name", "object.address", "company.name"],
  }),
  defineType({
    id: "podryad", templateId: "legacy-subcontract", name: "Договор подряда",
    category: "subcontracts", requiredFieldIds: ["contract.number", "contract.cityDateLine", "contractor.name", "contractor.iin", "object.address", "estimate.worksTable", "company.name", "company.bin"],
  }),
  defineType({
    id: "podryad_annex", templateId: "legacy-subcontract-annex", name: "Приложение к договору подряда",
    category: "subcontracts", requiredFieldIds: ["contract.mainNumber", "contract.appendixNumber", "contractor.name", "object.address", "estimate.worksTable", "company.name"],
  }),
  defineType({
    id: "avr_r1", templateId: "legacy-avr-r1", name: "Акт выполненных работ (форма Р-1)",
    category: "acts", supportedExports: ["pdf", "gdoc", "docx"], usageContexts: ["objects", "reports"],
    requiredFieldIds: ["avr.number", "avr.dateLong", "client.name", "estimate.completedWorksTable", "avr.total", "company.name"],
  }),
]);

const TYPE_BY_ID = new Map(DOCUMENT_TYPE_REGISTRY.map(item => [item.id, item]));

export const documentTypeById = type => TYPE_BY_ID.get(String(type || "")) || null;
export const legacyDocumentTypes = () => DOCUMENT_TYPE_REGISTRY.map(item => ({ ...item }));
