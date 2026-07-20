const field = definition => Object.freeze(definition);

export const AUTOFIELD_DEFINITIONS = Object.freeze([
  field({ id: "client.name", group: "Клиент", label: "ФИО / наименование клиента", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "client.shortName", group: "Клиент", label: "ФИО клиента, кратко", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "client.iin", group: "Клиент", label: "ИИН / БИН клиента", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "client.document", group: "Клиент", label: "Документ клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.phone", group: "Клиент", label: "Телефон клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.address", group: "Клиент", label: "Адрес клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.director", group: "Клиент", label: "Директор клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.directorShort", group: "Клиент", label: "Директор клиента, кратко", kind: "text", requiredFor: [] }),
  field({ id: "client.bank", group: "Клиент", label: "Банк клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.bik", group: "Клиент", label: "БИК клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.account", group: "Клиент", label: "Счёт клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.email", group: "Клиент", label: "Email клиента", kind: "text", requiredFor: [] }),
  field({ id: "client.type", group: "Клиент", label: "Тип клиента", kind: "text", requiredFor: [] }),
  field({ id: "object.id", group: "Объект", label: "ID объекта", kind: "text", requiredFor: [] }),
  field({ id: "object.address", group: "Объект", label: "Адрес объекта", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "object.type", group: "Объект", label: "Тип объекта", kind: "text", requiredFor: [] }),
  field({ id: "object.area", group: "Объект", label: "Площадь объекта", kind: "number", requiredFor: [] }),
  field({ id: "contract.number", group: "Договор", label: "Номер договора", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "contract.date", group: "Договор", label: "Дата договора", kind: "date", requiredFor: [] }),
  field({ id: "contract.dateFull", group: "Договор", label: "Дата договора, цифрами", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "contract.dateLong", group: "Договор", label: "Дата договора, прописью", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "contract.total", group: "Договор", label: "Сумма договора", kind: "money", requiredFor: ["repair_fiz"] }),
  field({ id: "contract.discount", group: "Договор", label: "Скидка, %", kind: "number", requiredFor: [] }),
  field({ id: "contract.advancePercent", group: "Договор", label: "Предоплата, %", kind: "number", requiredFor: [] }),
  field({ id: "contract.advanceAmount", group: "Договор", label: "Сумма предоплаты", kind: "money", requiredFor: [] }),
  field({ id: "contract.advancePercentText", group: "Договор", label: "Предоплата с символом %", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "contract.advanceAmountText", group: "Договор", label: "Предоплата в тенге", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "estimate.worksTable", group: "Смета", label: "Таблица работ", kind: "table", requiredFor: ["repair_fiz"] }),
  field({ id: "company.name", group: "Компания", label: "Наименование подрядчика", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "company.bin", group: "Компания", label: "БИН подрядчика", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "company.bank", group: "Компания", label: "Банк подрядчика", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "company.bik", group: "Компания", label: "БИК подрядчика", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "company.account", group: "Компания", label: "Счёт подрядчика", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "company.director", group: "Компания", label: "Директор подрядчика", kind: "text", requiredFor: ["repair_fiz"] }),
  field({ id: "company.address", group: "Компания", label: "Адрес подрядчика", kind: "text", requiredFor: [] }),
  field({ id: "company.phone", group: "Компания", label: "Телефон подрядчика", kind: "text", requiredFor: [] }),
  field({ id: "company.email", group: "Компания", label: "Email подрядчика", kind: "text", requiredFor: [] }),
]);

const FIELD_BY_ID = new Map(AUTOFIELD_DEFINITIONS.map(definition => [definition.id, definition]));

export function requiredFieldIdsForType(type) {
  return AUTOFIELD_DEFINITIONS
    .filter(definition => definition.requiredFor.includes(type))
    .map(definition => definition.id);
}

const numericTime = value => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const recordTime = record => (
  numericTime(record?.updatedAt)
  || numericTime(record?.createdAt)
  || numericTime(record?.date)
);

const newest = records => [...records].sort((left, right) => recordTime(right) - recordTime(left))[0] || null;

const exactOne = (records, predicate, label) => {
  const matches = (Array.isArray(records) ? records : []).filter(item => item && !item.deletedAt && predicate(item));
  if (matches.length === 1) return { ok: true, value: matches[0] };
  if (matches.length === 0) return { ok: false, reason: `${label} не найден по точному ID`, candidates: [] };
  return { ok: false, reason: `${label}: найдено несколько записей с одним ID`, candidates: matches.map(item => item.id) };
};

export function buildRepairPreviewContext({ objectId, objects, contracts, estimates, clients, contragents } = {}) {
  if (!objectId) return { ok: false, reason: "Не указан objectId", candidates: [] };

  const objectResult = exactOne(objects, item => item.id === objectId, "Объект");
  if (!objectResult.ok) return objectResult;
  const object = objectResult.value;

  const linkedContracts = (Array.isArray(contracts) ? contracts : []).filter(item => (
    item && !item.deletedAt && item.objectId === objectId && (item.type || "repair_fiz") === "repair_fiz"
  ));
  const contract = newest(linkedContracts);
  if (!contract) return { ok: false, reason: "Договор ремонта не найден по objectId", candidates: [] };

  const linkedEstimates = (Array.isArray(estimates) ? estimates : []).filter(item => (
    item && !item.deletedAt && item.objectId === objectId && (!item.parentId || item.parentId === item.id)
  ));
  const estimate = newest(linkedEstimates);
  if (!estimate) return { ok: false, reason: "Корневая смета не найдена по objectId", candidates: [] };

  const clientId = contract.clientId || object.clientId;
  if (!clientId) return { ok: false, reason: "В договоре и объекте не указан clientId; сопоставление клиента по имени запрещено", candidates: [] };
  const clientResult = exactOne(clients, item => item.id === clientId, "Клиент");
  if (!clientResult.ok) return clientResult;

  const contragentId = contract.contragentId;
  if (!contragentId) return { ok: false, reason: "В договоре не указан contragentId; сопоставление компании по имени запрещено", candidates: [] };
  const contragentResult = exactOne(contragents, item => item.id === contragentId, "Компания");
  if (!contragentResult.ok) return contragentResult;

  return {
    ok: true,
    object,
    contract,
    estimate,
    client: clientResult.value,
    contragent: contragentResult.value,
    warnings: contract.clientId && object.clientId && contract.clientId !== object.clientId
      ? ["clientId договора отличается от clientId объекта; использован клиент договора"]
      : [],
  };
}

const finiteNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatDateParts = value => {
  const date = new Date(`${value || ""}T00:00:00`);
  if (!value || Number.isNaN(date.getTime())) return { full: String(value || ""), long: String(value || "") };
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const day = String(date.getDate()).padStart(2, "0");
  return { full: date.toLocaleDateString("ru-RU"), long: `«${day}» ${months[date.getMonth()]} ${date.getFullYear()}` };
};

const shortClientName = client => {
  if (client?.clientType === "yur" || client?.type === "юр") return String(client?.name || "");
  const parts = String(client?.name || "").trim().split(/\s+/).filter(Boolean);
  return `${parts[0] || ""}${parts[1] ? ` ${parts[1][0]}.` : ""}${parts[2] ? `${parts[2][0]}.` : ""}`;
};

const normalizeWorks = works => {
  if (Array.isArray(works)) return works;
  if (!works || typeof works !== "object") return [];
  return Object.entries(works).map(([name, row]) => ({ name, ...(row && typeof row === "object" ? row : {}) }));
};

export function formatRepairWorksTable(works, discount = 0) {
  const rows = normalizeWorks(works).map((work, index) => {
    const quantity = finiteNumber(work.quantity ?? work.qty);
    const price = finiteNumber(work.price ?? work.manualPrice);
    const priceFrom = finiteNumber(work.priceFrom);
    const isVariablePrice = priceFrom > 0;
    return {
      id: work.id || `row-${index + 1}`,
      category: String(work.category || "Работы"),
      subcategory: String(work.subcategory || ""),
      name: String(work.name || ""),
      unit: String(work.unit || work.manualUnit || "м²"),
      quantity,
      price,
      priceFrom,
      isVariablePrice,
      sum: isVariablePrice ? 0 : quantity * price,
    };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.sum, 0);
  const rawDiscount = finiteNumber(discount);
  const discountPercent = Math.min(100, Math.max(0, rawDiscount));
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  return {
    rows,
    subtotal,
    discountPercent,
    discountAmount,
    total: subtotal - discountAmount,
    hasVariablePrices: rows.some(row => row.isVariablePrice),
  };
}

const emptyValue = value => (
  value == null
  || (typeof value === "string" && value.trim() === "")
  || (value && typeof value === "object" && Array.isArray(value.rows) && value.rows.length === 0)
);

export function resolveRepairContractVariables(context = {}) {
  const { object = {}, contract = {}, estimate = {}, client = {}, contragent = {} } = context;
  const sourceWorks = Array.isArray(contract.works) && contract.works.length
    ? contract.works
    : (estimate.works || estimate.rows || []);
  const discount = contract.discount ?? estimate.discount ?? 0;
  const worksTable = formatRepairWorksTable(sourceWorks, discount);
  const advancePercent = finiteNumber(contract.advancePercent ?? 30);
  const contractDate = formatDateParts(contract.date || contract.contractDate);
  const contractTotal = worksTable.subtotal;
  const values = {
    "client.name": String(client.name || ""),
    "client.shortName": shortClientName(client),
    "client.iin": String(client.iin || client.bin || ""),
    "client.document": String(client.doc || client.document || ""),
    "client.phone": String(client.phone || ""),
    "client.address": String(client.address || ""),
    "client.director": String(client.director || ""),
    "client.directorShort": String(client.directorShort || ""),
    "client.bank": String(client.bank || ""),
    "client.bik": String(client.bik || ""),
    "client.account": String(client.account || ""),
    "client.email": String(client.email || ""),
    "client.type": String(client.clientType || client.type || ""),
    "object.id": String(object.id || ""),
    // The active legacy renderer currently receives these values through the
    // client argument. Keep that precedence for byte-for-byte parity, while
    // allowing new records to use the canonical object fields.
    "object.address": String(client.address || object.address || contract.objectAddress || ""),
    "object.type": String(client.objectType || object.objType || object.type || ""),
    "object.area": finiteNumber(object.area),
    "contract.number": String(contract.number || contract.contractNumber || ""),
    "contract.date": String(contract.date || contract.contractDate || ""),
    "contract.dateFull": contractDate.full,
    "contract.dateLong": contractDate.long,
    "contract.total": contractTotal,
    "contract.discount": worksTable.discountPercent,
    "contract.advancePercent": advancePercent,
    "contract.advanceAmount": Math.round(contractTotal * advancePercent / 100),
    "contract.advancePercentText": `${advancePercent}%`,
    "contract.advanceAmountText": `${Math.round(contractTotal * advancePercent / 100).toLocaleString("ru-RU")} тенге`,
    "estimate.worksTable": worksTable,
    "company.name": String(contragent.name || ""),
    "company.bin": String(contragent.bin || ""),
    "company.bank": String(contragent.bank || ""),
    "company.bik": String(contragent.bik || ""),
    "company.account": String(contragent.account || ""),
    "company.director": String(contragent.director || ""),
    "company.address": String(contragent.address || ""),
    "company.phone": String(contragent.phone || ""),
    "company.email": String(contragent.email || ""),
  };

  const missing = requiredFieldIdsForType("repair_fiz")
    .filter(fieldId => emptyValue(values[fieldId]))
    .map(fieldId => ({ fieldId, label: FIELD_BY_ID.get(fieldId)?.label || fieldId }));
  const warnings = [...(Array.isArray(context.warnings) ? context.warnings : [])];
  if (worksTable.hasVariablePrices) warnings.push("В смете есть работы с уточняемой ценой; они не включены в фиксированную сумму");
  if (finiteNumber(discount) !== worksTable.discountPercent) warnings.push("Скидка приведена к диапазону от 0 до 100% ");
  return { ok: missing.length === 0, values, missing, warnings };
}

export function validateResolvedVariables(result) {
  if (!result || typeof result !== "object") return { ok: false, errors: ["Результат автозаполнения отсутствует"] };
  const unknown = Object.keys(result.values || {}).filter(fieldId => !FIELD_BY_ID.has(fieldId));
  const errors = [
    ...(Array.isArray(result.missing) ? result.missing.map(item => `Не заполнено обязательное поле: ${item.label || item.fieldId}`) : []),
    ...unknown.map(fieldId => `Неизвестное автополе: ${fieldId}`),
  ];
  return { ok: result.ok === true && errors.length === 0, errors };
}
