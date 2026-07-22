import { DOCUMENT_TYPE_REGISTRY, documentTypeById } from "./documentTypeRegistry.js";
import { importLegacyHtmlTemplate } from "./legacyTemplateImporter.js";

const WORKS_MARKER = "TS-DOCUMENT-WORKS-TABLE-94731";
const COMPLETED_WORKS_MARKER = "TS-DOCUMENT-COMPLETED-TABLE-94732";
const nbspNumber = value => Number(value).toLocaleString("ru-RU");

const CLIENT = Object.freeze({
  name: "Клиентмаркер Имямаркер Отчествомаркер",
  iin: "TS-IIN-991122334455",
  doc: "TS-DOC-883377",
  address: "TS-OBJECT-ADDRESS-741",
  phone: "TS-PHONE-77000000001",
  objectType: "TS-OBJECT-TYPE-REPAIR",
  type: "физ",
});

const COMPANY = Object.freeze({
  id: "TS-COMPANY-ID-951",
  name: "TS-COMPANY-NAME-951",
  bin: "TS-COMPANY-BIN-951",
  bank: "TS-COMPANY-BANK-951",
  bik: "TS-COMPANY-BIK-951",
  account: "TS-COMPANY-ACCOUNT-951",
  address: "TS-COMPANY-ADDRESS-951",
  phone: "TS-COMPANY-PHONE-951",
  email: "TS-COMPANY-EMAIL-951",
  director: "TS-COMPANY-DIRECTOR-951",
  directorFull: "TS-COMPANY-DIRECTOR-FULL-951",
});

const CONTRACTOR = Object.freeze({
  name: "TS-CONTRACTOR-NAME-751",
  iin: "TS-CONTRACTOR-IIN-751",
  doc: "TS-CONTRACTOR-DOC-751",
  docIssuer: "TS-CONTRACTOR-ISSUER-751",
  address: "TS-CONTRACTOR-ADDRESS-751",
  phone: "TS-CONTRACTOR-PHONE-751",
  email: "TS-CONTRACTOR-EMAIL-751",
});

const marker = (raw, fieldId, kind = "text") => Object.freeze({ raw: String(raw), fieldId, kind });
const commonPartyMarkers = () => [
  marker(CLIENT.name, "client.name"),
  marker("Клиентмаркер И.О.", "client.shortName"),
  marker(CLIENT.iin, "client.iin"),
  marker(CLIENT.doc, "client.document"),
  marker(CLIENT.address, "object.address"),
  marker(CLIENT.phone, "client.phone"),
  marker(CLIENT.objectType, "object.type"),
  marker(COMPANY.name, "company.name"),
  marker(COMPANY.bin, "company.bin"),
  marker(COMPANY.bank, "company.bank"),
  marker(COMPANY.bik, "company.bik"),
  marker(COMPANY.account, "company.account"),
  marker(COMPANY.address, "company.address"),
  marker(COMPANY.phone, "company.phone"),
  marker(COMPANY.email, "company.email"),
  marker(COMPANY.director, "company.director"),
];

const commonContractSeed = type => ({
  type,
  number: `TS-${type.toUpperCase()}-NUMBER-94731`,
  date: "2099-12-27",
  works: [{ category: "TS-WORK-CATEGORY", subcategory: "TS-WORK-SUBCATEGORY", name: WORKS_MARKER, unit: "м²", quantity: 1, price: 9876543 }],
  discount: 0,
});

const contractDefinition = (type, contract, extraMarkers = []) => Object.freeze({
  type,
  renderer: "contract",
  seed: Object.freeze({ contract: Object.freeze(contract), client: CLIENT, company: COMPANY }),
  markers: Object.freeze([
    marker(contract.number, "contract.number"),
    marker("27.12.2099", "contract.dateFull"),
    ...commonPartyMarkers(),
    ...extraMarkers,
  ]),
  requiredFieldIds: Object.freeze([...(documentTypeById(type)?.requiredFieldIds || [])]),
});

const repair = commonContractSeed("repair_fiz");
repair.advancePercent = 37;

const annex = {
  ...commonContractSeed("annex"),
  number: "TS-ANNEX-DOCUMENT-94731",
  mainNumber: "TS-MAIN-CONTRACT-94731",
  mainDate: "2099-11-26",
  annexDate: "2099-10-25",
  appendix: 94731,
};

const design = { ...commonContractSeed("design"), designAdvance: 98765 };
const designAdd = {
  ...commonContractSeed("design_add"),
  mainNumber: "TS-DESIGN-MAIN-94731",
  composition: { plan: true, layout: true, concept: true, vis3d: true, drawings: true, materials: true },
  area: "731.25",
  variantsLayout: "TS-LAYOUT-VARIANTS-731",
  corrLayout: "TS-LAYOUT-CORRECTIONS-732",
  corrVis: "TS-VIS-CORRECTIONS-733",
  priceType: "sqm",
  pricePerSqm: 12347,
  designAdvance: 23456,
  deadline: "TS-DEADLINE-DAYS-734",
};
const designTotal = Math.round(Number(designAdd.pricePerSqm) * Number(designAdd.area));

const reservation = {
  ...commonContractSeed("reservation"),
  reserveAmount: 87654,
  reserveStartDate: "2099-09-24",
};

const podryadModel = kind => ({
  kind,
  number: "TS-PODRYAD-NUMBER-94731",
  annexNo: kind === "annex" ? "TS-PODRYAD-ANNEX-94732" : "",
  mainNumber: "TS-PODRYAD-MAIN-94733",
  mainDate: "2099-11-26",
  date: "2099-12-27",
  city: "TS-CITY-KARAGANDA-94731",
  worker: CONTRACTOR,
  contragentId: COMPANY.id,
  __templateCompany: COMPANY,
  objectAddress: CLIENT.address,
  format: "table",
  showLinePrice: true,
  sections: [{ title: "TS-PODRYAD-SECTION", lumpSum: "", items: [{ name: WORKS_MARKER, qty: 1, unit: "м²", price: 9876543 }] }],
  manualTotal: "",
  avans: 76543,
  termDays: "TS-PODRYAD-TERM-94734",
  withStamp: false,
});

const podryadMarkers = model => [
  marker(model.number, "contract.number"),
  marker(`г. ${model.city} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "27" декабря 2099 г.`, "contract.cityDateLine"),
  marker(model.annexNo, "contract.appendixNumber"),
  marker(model.mainNumber, "contract.mainNumber"),
  marker("«26» 11.2099 г.", "contract.mainDateText"),
  marker(CONTRACTOR.name, "contractor.name"),
  marker(CONTRACTOR.iin, "contractor.iin"),
  marker(CONTRACTOR.doc, "contractor.document"),
  marker(CONTRACTOR.docIssuer, "contractor.documentIssuer"),
  marker(CONTRACTOR.address, "contractor.address"),
  marker(CONTRACTOR.phone, "contractor.phone"),
  marker(CONTRACTOR.email, "contractor.email"),
  marker(CLIENT.address, "object.address"),
  marker(`${nbspNumber(model.avans)} тг`, "contract.avansText"),
  marker(model.termDays, "contract.termDays"),
  marker(`${nbspNumber(9876543)} ₸`, "contract.total"),
  marker(WORKS_MARKER, "estimate.worksTable", "table"),
  marker(COMPANY.name, "company.name"),
  marker(COMPANY.bin, "company.bin"),
  marker(COMPANY.bank, "company.bank"),
  marker(COMPANY.bik, "company.bik"),
  marker(COMPANY.account, "company.account"),
  marker(COMPANY.address, "company.address"),
  marker(COMPANY.phone, "company.phone"),
  marker(COMPANY.email, "company.email"),
  marker(COMPANY.directorFull, "company.director"),
];

const avrModel = Object.freeze({
  actNo: "TS-AVR-NUMBER-94731",
  actDate: "2099-12-27",
  clientName: CLIENT.name,
  clientIin: CLIENT.iin,
  address: CLIENT.address,
  contractNo: "TS-AVR-CONTRACT-94731",
  contractDate: "2099-11-26",
  lines: [{ included: true, name: COMPLETED_WORKS_MARKER, unit: "м²", doneQty: 1, price: 9876543 }],
  withStamp: false,
});

export const LEGACY_TEMPLATE_DEFINITIONS = Object.freeze([
  contractDefinition("repair_fiz", repair, [
    marker("«27» декабря 2099", "contract.dateLong"),
    marker("37%", "contract.advancePercentText"),
    marker(`${nbspNumber(Math.round(9876543 * 0.37))} тенге`, "contract.advanceAmountText"),
    marker(`${nbspNumber(9876543)} ₸`, "contract.total"),
    marker(WORKS_MARKER, "estimate.worksTable", "table"),
  ]),
  contractDefinition("annex", annex, [
    marker(annex.mainNumber, "contract.mainNumber"),
    marker(String(annex.appendix), "contract.appendixNumber"),
    marker("«26» ноября 2099", "contract.mainDateLong"),
    marker("25.10.2099", "contract.annexDateFull"),
    marker(WORKS_MARKER, "estimate.worksTable", "table"),
  ]),
  contractDefinition("design", design, [
    marker(`${nbspNumber(design.designAdvance)} тенге`, "contract.designAdvanceText"),
  ]),
  contractDefinition("design_add", designAdd, [
    marker(designAdd.mainNumber, "contract.mainNumber"),
    marker("[X] Обмерочный план", "design.planLine"),
    marker("[X] Планировочное решение", "design.layoutLine"),
    marker("[X] Концепция интерьера", "design.conceptLine"),
    marker("[X] 3D визуализация", "design.vis3dLine"),
    marker("[X] Рабочие чертежи", "design.drawingsLine"),
    marker("[X] Ведомость отделочных материалов", "design.materialsLine"),
    marker(String(designAdd.area), "contract.areaText"),
    marker(designAdd.variantsLayout, "contract.variantsLayout"),
    marker(designAdd.corrLayout, "contract.corrLayout"),
    marker(designAdd.corrVis, "contract.corrVis"),
    marker("[ ] фиксированной суммой", "design.fixedPriceLine"),
    marker(`[X] из расчета ${designAdd.pricePerSqm} тенге за 1 кв.м.`, "design.sqmPriceLine"),
    marker(`${nbspNumber(designTotal)} тенге`, "contract.designTotalText"),
    marker(`${nbspNumber(designAdd.designAdvance)} тенге`, "contract.designAdvanceText"),
    marker(`${nbspNumber(designTotal - designAdd.designAdvance)} тенге`, "contract.designRemainderText"),
    marker(designAdd.deadline, "contract.deadlineText"),
  ]),
  contractDefinition("reservation", reservation, [
    marker(`${nbspNumber(reservation.reserveAmount)} тенге`, "contract.reserveAmountText"),
    marker("«24» сентября 2099 г.", "contract.reserveStartDateLong"),
  ]),
  Object.freeze({
    type: "podryad", renderer: "podryad", seed: Object.freeze({ model: Object.freeze(podryadModel("podryad")) }),
    markers: Object.freeze(podryadMarkers(podryadModel("podryad")).filter(item => item.raw)),
    requiredFieldIds: Object.freeze([...(documentTypeById("podryad")?.requiredFieldIds || [])]),
  }),
  Object.freeze({
    type: "podryad_annex", renderer: "podryad", seed: Object.freeze({ model: Object.freeze(podryadModel("annex")) }),
    markers: Object.freeze(podryadMarkers(podryadModel("annex")).filter(item => item.raw && item.fieldId !== "contract.number" && item.fieldId !== "contract.cityDateLine")),
    requiredFieldIds: Object.freeze([...(documentTypeById("podryad_annex")?.requiredFieldIds || [])]),
  }),
  Object.freeze({
    type: "avr_r1", renderer: "avr", seed: Object.freeze({ model: avrModel }),
    markers: Object.freeze([
      marker(avrModel.actNo, "avr.number"),
      marker("27 декабря 2099 г.", "avr.dateLong"),
      marker(CLIENT.name, "client.name"), marker(CLIENT.iin, "client.iin"), marker(CLIENT.address, "object.address"),
      marker(avrModel.contractNo, "contract.mainNumber"), marker("26.11.2099", "contract.dateFull"),
      marker(COMPLETED_WORKS_MARKER, "estimate.completedWorksTable", "table"),
      marker(`${nbspNumber(9876543)} ₸`, "avr.total"),
      marker("TitovStroy", "company.name"), marker("231040002769", "company.bin"), marker("+7 707 982 4915", "company.phone"),
    ]),
    requiredFieldIds: Object.freeze([...(documentTypeById("avr_r1")?.requiredFieldIds || [])]),
  }),
]);

const renderDefinition = (definition, renderers) => {
  if (definition.renderer === "contract") return renderers.contract?.(definition.seed.contract, definition.seed.client, definition.seed.company, false, "");
  if (definition.renderer === "podryad") return renderers.podryad?.(definition.seed.model);
  if (definition.renderer === "avr") return renderers.avr?.(definition.seed.model);
  return null;
};

const markersForDefinition = (definition, renderers) => {
  const markers = [...definition.markers];
  if (definition.type === "avr_r1") {
    const totalWords = renderers.moneyWords?.(9876543);
    if (!String(totalWords || "").trim()) return { ok: false, markers: [], reason: "Генератор суммы прописью не подключён" };
    markers.push(marker(totalWords, "avr.totalWords"));
  }
  return { ok: true, markers };
};

const previewVariablesFor = (definition, markers) => {
  const values = Object.fromEntries(markers.map(item => [item.fieldId, item.raw]));
  const total = 9876543;
  const table = {
    rows: [{ id: "preview-row", category: "Работы", subcategory: "", name: "Тестовая позиция для предпросмотра", unit: "м²", quantity: 1, price: total, sum: total }],
    subtotal: total,
    total,
    discountPercent: 0,
    discountAmount: 0,
    tableStyle: definition.type === "podryad" || definition.type === "podryad_annex" ? "subcontract" : "estimate",
  };
  if (values["estimate.worksTable"] != null) values["estimate.worksTable"] = table;
  if (values["estimate.completedWorksTable"] != null) values["estimate.completedWorksTable"] = { ...table, tableStyle: "completed" };
  if (values["contract.total"] != null) values["contract.total"] = total;
  if (values["avr.total"] != null) values["avr.total"] = total;
  return values;
};

export function createLegacyTemplateCatalogSeeds(renderers = {}) {
  const seeds = [];
  for (const definition of LEGACY_TEMPLATE_DEFINITIONS) {
    const type = documentTypeById(definition.type);
    if (!type) return { ok: false, seeds: [], reason: `Неизвестный тип документа: ${definition.type}` };
    const html = renderDefinition(definition, renderers);
    if (!String(html || "").trim()) return { ok: false, seeds: [], reason: `${type.name}: действующий генератор не подключён` };
    const markerResult = markersForDefinition(definition, renderers);
    if (!markerResult.ok) return { ok: false, seeds: [], reason: `${type.name}: ${markerResult.reason}` };
    const imported = importLegacyHtmlTemplate({ html, markers: markerResult.markers, requiredFieldIds: definition.requiredFieldIds });
    if (!imported.ok) return { ok: false, seeds: [], reason: `${type.name}: ${imported.reason}`, failedType: type.id, importReport: imported.importReport };
    const source = type.id === "repair_fiz" ? "legacy-repair" : "legacy-import";
    seeds.push({
      template: {
        id: type.templateId,
        type: type.id,
        name: type.name,
        category: type.category,
        source,
        supportedExports: type.supportedExports,
        usageContexts: type.usageContexts,
        requiredFieldIds: type.requiredFieldIds,
      },
      contentJson: imported.contentJson,
      metadata: {
        source,
        legacyFingerprint: imported.legacyFingerprint,
        legacyNormalizedText: imported.legacyNormalizedText,
        importReport: imported.importReport,
        previewVariables: previewVariablesFor(definition, markerResult.markers),
      },
    });
  }
  return { ok: true, seeds, importedTypes: DOCUMENT_TYPE_REGISTRY.map(type => type.id) };
}
