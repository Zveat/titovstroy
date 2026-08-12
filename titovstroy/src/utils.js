// Чистые бизнес-функции без побочных эффектов (не тянут Firebase/React) — вынесены
// сюда специально, чтобы их можно было тестировать (vitest) без инициализации всего
// приложения. Это НЕ полный рефакторинг монолита App.jsx (тот — отдельная большая
// задача), только те функции, что уже были самодостаточны (module-level, без замыканий
// на состояние компонента) и стоят прямого юнит-теста.

// Нормализация номера договора для сопоставления: убираем пробелы, № и # — чтобы
// «№0919#153» и «0919#153» считались одним и тем же номером. Используется по всему
// приложению для связки договоров/финпроектов/операций между собой. 
export const normCN = (s) => String(s||"").trim().toLowerCase().replace(/[\s№#]/g,"");

const normalizedSearchText = (value) => String(value ?? "")
  .toLocaleLowerCase("ru-RU")
  .replace(/[ё]/g, "е")
  .replace(/[^a-zа-яәіңғүұқөһ0-9]+/gi, " ")
  .trim();

// Поиск не создаёт новую связь между сущностями: object/contract сюда передаются только после
// точного сопоставления по objectId или номеру договора. Функция лишь расширяет видимые поля.
export function financeProjectMatchesSearch(project, query, context = {}) {
  const needle = normalizedSearchText(query);
  if (!needle) return true;
  const { object, contract } = context;
  const fields = [
    project?.id, project?.contractNo, project?.description, project?.comment, project?.name,
    object?.id, object?.clientName, object?.name, object?.address, object?.clientPhone, object?.phone,
    contract?.id, contract?.number, contract?.mainNumber, contract?.customer,
    contract?.customerName, contract?.address, contract?.objectAddress,
  ];
  const haystack = normalizedSearchText(fields.filter(Boolean).join(" "));
  if (haystack.includes(needle)) return true;
  const compactNeedle = needle.replace(/\s+/g, "");
  return compactNeedle.length >= 3 && haystack.replace(/\s+/g, "").includes(compactNeedle);
}

export function applyWorkPricingOverride(work = {}, override) {
  const base = { ...work, tiers: Array.isArray(work?.tiers) ? work.tiers.map(t => ({ ...t })) : [] };
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const result = { ...base };
  for (const key of ["fixedPrice", "cost", "margin", "priceFrom"]) {
    if (override[key] !== undefined) result[key] = override[key];
  }
  if (override.tiers !== undefined) {
    result.tiers = Array.isArray(override.tiers) ? override.tiers.map(t => ({ ...t })) : [];
  }
  return result;
}

export function createEstimatePricingSnapshot(work = {}) {
  return {
    fixedPrice: work.fixedPrice ?? null,
    tiers: Array.isArray(work.tiers) ? work.tiers.map(t => ({ ...t })) : [],
    cost: work.cost ?? null,
    margin: work.margin ?? null,
    priceFrom: work.priceFrom ?? null,
  };
}

// Снимок в строке имеет приоритет над текущим прайсом. Legacy-строки без снимка продолжают
// использовать переданную цену; при следующем сохранении сметы App закрепляет её в строке.
export function resolveEstimateRowWork(work = {}, row = {}) {
  const snapshot = row?.pricingSnapshot;
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? applyWorkPricingOverride(work, snapshot)
    : applyWorkPricingOverride(work, null);
}

// ЕДИНОЕ правило «какая строка сметы относится к работе каталога».
//
// Одна и та же работа может лежать в rows ДВАЖДЫ: под кодом (WALL-007) и под
// названием («Ошкуривание стен») — раньше строки писались по названию, сейчас
// по коду. Редактор и итог сметы берут пару как rows[код] || rows[название],
// поэтому очистка объёма создаёт ПУСТУЮ запись под кодом, а старая запись под
// названием остаётся в данных со старым объёмом — её просто больше никто не
// показывает.
//
// Всё, что вместо этого перебирало rows напрямую (договор из сметы, акт
// выполненных работ, этапы производства), брало забытую запись и возвращало
// удалённые работы. На смете «Таисия» договор выходил на 4 980 744 ₸ вместо
// 3 101 192 ₸: девять удалённых работ воскресали, а одна свободная позиция,
// наоборот, терялась — её нет в каталоге, и её молча выбрасывали.
//
// Возвращает строки В ПОРЯДКЕ КАТАЛОГА: {key, row, work, qty}. Позиции без
// работы в каталоге (свободные, восстановленные из актов) идут в конце с
// синтезированной работой — ровно так же, как их показывает сама смета.
export const ESTIMATE_EXTRA_CAT = "Восстановлено из актов";
export function resolveEstimateRows(rows = {}, catalog = [], { extraCat = ESTIMATE_EXTRA_CAT } = {}) {
  const src = rows && typeof rows === "object" ? rows : {};
  const out = [];
  const used = new Set();
  for (const work of Array.isArray(catalog) ? catalog : []) {
    if (!work) continue;
    // Именно || , а не проверка на undefined: так выбирает строку сам редактор
    // сметы и её итог. Любое расхождение здесь снова разведёт суммы.
    const codeRow = work.code != null ? src[work.code] : undefined;
    const nameRow = work.name != null ? src[work.name] : undefined;
    const row = codeRow || nameRow;
    if (!row) continue;
    const key = codeRow ? work.code : work.name;
    if (used.has(key)) continue;
    // Забытый близнец той же работы помечается использованным, иначе ниже он
    // уехал бы в «позиции без каталога» и работа задвоилась.
    if (work.code != null) used.add(work.code);
    if (work.name != null) used.add(work.name);
    const qty = Number(row.qty || 0);
    if (!(qty > 0)) continue;
    out.push({ key, row, work, qty });
  }
  for (const [key, row] of Object.entries(src)) {
    if (used.has(key)) continue;
    const qty = Number(row?.qty || 0);
    if (!(qty > 0)) continue;
    out.push({
      key, row, qty,
      work: { code: key, name: row.manualName || key, unit: row.manualUnit || "",
        cat: extraCat, sub: "Позиции", tiers: [], cost: 0, fixedPrice: Number(row.manualPrice) || 0 },
    });
  }
  return out;
}

export function sealLegacyEstimateRows(sourceRows = {}, catalog = []) {
  const byKey = new Map();
  for (const work of catalog || []) {
    if (work?.code) byKey.set(work.code, work);
    if (work?.name) byKey.set(work.name, work);
  }
  let changed = false;
  const sealed = { ...(sourceRows || {}) };
  for (const [key, row] of Object.entries(sourceRows || {})) {
    if (!row || Number(row.qty || 0) <= 0 || row.pricingSnapshot) continue;
    const work = byKey.get(key);
    if (!work) continue;
    sealed[key] = { ...row, pricingSnapshot: createEstimatePricingSnapshot(work) };
    changed = true;
  }
  return changed ? sealed : sourceRows;
}

// Returns every estimate belonging to an object, including legacy additional estimates
// linked only through parentId. The source array is never mutated.
export function estimatesForObject(estimates = [], objectId) {
  const list = (estimates || []).filter(e => e && !e.deletedAt);
  if (!objectId) return [];
  const selected = new Set(list.filter(e => e.objectId === objectId && e.id).map(e => e.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of list) {
      if (!e?.id || selected.has(e.id) || !e.parentId || !selected.has(e.parentId)) continue;
      if (e.objectId && e.objectId !== objectId) continue;
      selected.add(e.id);
      changed = true;
    }
  }
  return list.filter(e => e.objectId === objectId || (e.id && selected.has(e.id)));
}

export function isDashboardActiveObject(object) {
  return !!object && !object.deletedAt && (object.status === "work" || object.status === "signed");
}

// ── СТАТУС ОБЪЕКТА ДЛЯ ЛЮБОЙ ЛОГИКИ ────────────────────────────────────────
// Карточка производства ПЕРЕВЕШИВАЕТ поле объекта — ровно так же, как это видно на
// экране: кнопки статуса в карточке, чипы в списке и аналитика считают по нему.
// Читать сырое object.status в проверках нельзя: расхождение в интерфейсе не видно
// НИКАК (кнопка «В работе» подсвечена, а в поле лежит «archive» от миграции), и
// починить его кликом невозможно — объект и так выглядит правильно. Ловили на боевой:
// два объекта в работе без прораба не попадали в «Что горит», а расхождение было у 19.
// Расхождение возникает не только от миграции: если статус сменили из модуля
// производства, поле объекта остаётся прежним.
export const PROD_STATUS_TO_OBJECT = { active: "work", paused: "paused", done: "done", cancel: "cancel" };
export function objectStatusOf(object, production) {
  return PROD_STATUS_TO_OBJECT[production?.prodStatus] || object?.status || "new";
}

export function findFinanceProjectForObject(object, contracts = [], finProjects = []) {
  if (!object) return null;
  const direct = finProjects.find(fp => fp?.objectId === object.id);
  if (direct) return direct;

  const numbers = new Set();
  for (const key of ["contractNo", "contractNumber", "agreementNo", "number"]) {
    const value = normCN(object[key]);
    if (value) numbers.add(value);
  }
  for (const c of contracts) {
    if (!c || c.deletedAt || c.objectId !== object.id || c.type === "podryad" || c.type === "podryad_annex") continue;
    const number = normCN(c.number);
    const mainNumber = normCN(c.mainNumber);
    if (number) numbers.add(number);
    if (mainNumber) numbers.add(mainNumber);
  }
  const byNumber = finProjects.find(fp => fp?.contractNo && numbers.has(normCN(fp.contractNo)));
  if (byNumber) return byNumber;

  // Имя, адрес и телефон не являются ключами связи. Старые записи разрешено
  // сопоставлять только по точному номеру договора; новые всегда несут objectId.
  return null;
}

export function isStaleApprovalObject(object, now = Date.now(), days = 14) {
  if (!object || object.deletedAt || object.status !== "approval") return false;
  const lastMovement = Number(object.updatedAt || object.createdAt || 0);
  return lastMovement > 0 && (now - lastMovement) >= days * 24 * 60 * 60 * 1000;
}

const FINANCE_STATUS_META = {
  new:      { key:"new",      label:"Новый",              color:"#64748b", bg:"#f3f4f6" },
  approval: { key:"approval", label:"Согласование сметы", color:"#d97706", bg:"rgba(217,119,6,.12)" },
  signed:   { key:"signed",   label:"Договор подписан",   color:"#059669", bg:"rgba(5,150,105,.1)" },
  refuse:   { key:"refuse",   label:"Потерян",            color:"#dc2626", bg:"rgba(220,38,38,.1)" },
  work:     { key:"work",     label:"В работе",           color:"#2563eb", bg:"#eff6ff" },
  paused:   { key:"paused",   label:"Приостановлен",      color:"#d97706", bg:"rgba(217,119,6,.1)" },
  done:     { key:"done",     label:"Выполнен",           color:"#059669", bg:"#ecfdf5" },
  cancel:   { key:"cancel",   label:"Расторгнут",         color:"#dc2626", bg:"rgba(220,38,38,.12)" },
  archive:  { key:"archive",  label:"Архив",              color:"#64748b", bg:"rgba(107,114,128,.12)" },
};
const FINANCE_STATUS_ALIASES = {
  "": "new",
  "новый": "new",
  "новая": "new",
  "согласование": "approval",
  "согласование сметы": "approval",
  "договор подписан": "signed",
  "активен": "work",
  "active": "work",
  "progress": "work",
  "в работе": "work",
  "приостановлен": "paused",
  "выполнен": "done",
  "отменен": "cancel",
  "отменён": "cancel",
  "расторгнут": "cancel",
  "отказ": "refuse",
  "потерян": "refuse",
  "архив": "archive",
};

// Старые финпроекты хранят русские статусы, связанные объекты — системные ключи.
// Нормализация нужна только для отображения/расчётов: данные в базе не меняются.
export function financeStatusMeta(value) {
  const raw = String(value || "").trim().toLowerCase();
  const key = FINANCE_STATUS_ALIASES[raw] || raw || "new";
  return FINANCE_STATUS_META[key] || {
    key,
    label: String(value || "Новый"),
    color: "#64748b",
    bg: "#f1f5f9",
  };
}

export function isActiveFinanceStatus(value) {
  return !["done", "cancel", "refuse", "archive"].includes(financeStatusMeta(value).key);
}

const OBJECT_EDIT_FIELDS = Object.freeze([
  "clientName","clientPhone","clientType","clientIin","clientDoc","clientDirector",
  "clientDirectorShort","clientEmail","clientBank","clientBik","clientAccount",
  "address","objType","area","note",
]);

// Возвращает только действительно изменённые и разрешённые поля карточки объекта.
// Обычный focus/blur, просмотр read-only карточки и изменение запрещённого поля
// не должны создавать запись в Firebase и ложную dirty-метку.
export function buildAuthorizedObjectPatch(saved, draft, { canEdit = false, canAssign = false } = {}) {
  if (!saved || !draft || saved.id !== draft.id) return {};
  const patch = {};
  if (canEdit) {
    for (const key of OBJECT_EDIT_FIELDS) {
      if (!Object.is(saved[key] ?? "", draft[key] ?? "")) patch[key] = draft[key] ?? "";
    }
  }
  if (canAssign && !Object.is(saved.manager ?? "", draft.manager ?? "")) {
    patch.manager = draft.manager ?? "";
  }
  return patch;
}

export const ROLE_DEFINITIONS = Object.freeze([
  { key:"admin", label:"Администратор", icon:"👑" },
  { key:"manager", label:"Руководитель", icon:"🧑‍💼" },
  { key:"sales_head", label:"Руководитель отдела продаж", icon:"📈" },
  { key:"foreman", label:"Прораб", icon:"🔨" },
  { key:"user", label:"Замерщик", icon:"👤" },
  { key:"viewer", label:"Наблюдатель", icon:"👁" },
]);

const FULL_ADMIN_ACCESS = Object.freeze({
  dashboard:"all", objects:"all", calendar:"all", estimates:"all", production:"all",
  documents:"all", analytics:"all", masters:"all", mastersManage:"all", finance:"edit",
  payroll:"edit", admin:"full",
  objectCreate:"all", objectEdit:"all", objectDelete:"all", objectStatus:"all",
  objectAssign:"all", objectExport:"all", calendarEdit:"all",
  estimateCreate:"all", estimateEdit:"all", estimateDelete:"all", estimateStatus:"all",
  estimatePublish:"all", estimateExport:"all",
  productionEdit:"all", productionStages:"all", productionQuality:"all",
  productionClientAccess:"all",
  documentCreate:"all", documentEdit:"all", documentDelete:"all", documentExport:"all",
  docRepair:"all", docDesign:"all", docPodryad:"all", docAvr:"all",
  templateView:"all", templateEdit:"all", templatePublish:"all", templateRollback:"all",
  templateArchive:"all", documentInstanceEdit:"all",
  analyticsExport:"all",
  financeCreate:"all", financeEdit:"all", financeDelete:"all", financeExport:"all",
  financeDirectories:"all",
  adminUsers:"all", adminRoles:"all", adminClients:"all", adminContractors:"all",
  adminCatalog:"all", adminPrices:"all", adminBackups:"all", adminRestore:"all",
  adminAudit:"all", adminDbCheck:"all",
  financialDetails:true, objectFinanceSummary:true, showLocked:false,
  analyticsSales:true, analyticsBacklog:true, analyticsProduction:true,
  analyticsFinance:true, analyticsQuality:true,
});

// Блоки аналитики — отдельные галочки видимости. Позволяют показать роли,
// например, воронку и производство, но скрыть финансовый блок.
const ANALYTICS_BLOCK_KEYS = [
  "analyticsSales", "analyticsBacklog", "analyticsProduction", "analyticsFinance", "analyticsQuality",
];

const NO_TEMPLATE_ACCESS = Object.freeze({
  templateView:"none", templateEdit:"none", templatePublish:"none", templateRollback:"none",
  templateArchive:"none", documentInstanceEdit:"none",
});

// Централизованные пресеты ролей. Сохранённая в базе матрица накладывается поверх
// них, поэтому новые права получают безопасные значения без миграции данных.
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  admin: FULL_ADMIN_ACCESS,
  manager: {
    ...NO_TEMPLATE_ACCESS,
    dashboard:"all", objects:"all", calendar:"all", estimates:"all", production:"all",
    documents:"all", analytics:"all", masters:"all", mastersManage:"none",
    finance:"view", payroll:"none", admin:"none", financialDetails:true, objectFinanceSummary:true,
    objectCreate:"none", objectEdit:"none", objectDelete:"none", objectStatus:"none",
    objectAssign:"none", objectExport:"all", calendarEdit:"none",
    estimateCreate:"all", estimateEdit:"all", estimateDelete:"all", estimateStatus:"all",
    estimatePublish:"all", estimateExport:"all",
    productionEdit:"all", productionStages:"all", productionQuality:"all", productionClientAccess:"all",
    documentCreate:"all", documentEdit:"all", documentDelete:"all", documentExport:"all",
    analyticsExport:"all",
    financeCreate:"none", financeEdit:"none", financeDelete:"none", financeExport:"all",
    financeDirectories:"none",
    adminUsers:"none", adminRoles:"none", adminClients:"none", adminContractors:"none",
    adminCatalog:"none", adminPrices:"none", adminBackups:"none", adminRestore:"none",
    adminAudit:"none", adminDbCheck:"none",
    analyticsSales:true, analyticsBacklog:true, analyticsProduction:true, analyticsFinance:true, analyticsQuality:true,
    showLocked:false,
  },
  sales_head: {
    ...NO_TEMPLATE_ACCESS,
    dashboard:"all", objects:"all", calendar:"all", estimates:"all", production:"all",
    documents:"all", analytics:"all", masters:"all", mastersManage:"none",
    finance:"none", payroll:"none", admin:"none", financialDetails:false, objectFinanceSummary:false,
    objectCreate:"none", objectEdit:"none", objectDelete:"none", objectStatus:"none",
    objectAssign:"none", objectExport:"all", calendarEdit:"none",
    estimateCreate:"none", estimateEdit:"none", estimateDelete:"none", estimateStatus:"none",
    estimatePublish:"none", estimateExport:"all",
    productionEdit:"none", productionStages:"none", productionQuality:"none", productionClientAccess:"none",
    documentCreate:"none", documentEdit:"none", documentDelete:"none", documentExport:"all",
    analyticsExport:"all",
    financeCreate:"none", financeEdit:"none", financeDelete:"none", financeExport:"none",
    financeDirectories:"none",
    adminUsers:"none", adminRoles:"none", adminClients:"none", adminContractors:"none",
    adminCatalog:"none", adminPrices:"none", adminBackups:"none", adminRestore:"none",
    adminAudit:"none", adminDbCheck:"none",
    analyticsSales:true, analyticsBacklog:true, analyticsProduction:true, analyticsFinance:false, analyticsQuality:true,
    showLocked:true,
  },
  foreman: {
    ...NO_TEMPLATE_ACCESS,
    dashboard:"own", objects:"all", calendar:"all", estimates:"none", production:"all",
    documents:"none", analytics:"none", masters:"all", mastersManage:"none",
    finance:"none", payroll:"none", admin:"none", financialDetails:true, objectFinanceSummary:false,
    objectCreate:"none", objectEdit:"none", objectDelete:"none", objectStatus:"none",
    objectAssign:"none", objectExport:"none", calendarEdit:"own",
    estimateCreate:"none", estimateEdit:"none", estimateDelete:"none", estimateStatus:"none",
    estimatePublish:"none", estimateExport:"none",
    productionEdit:"all", productionStages:"all", productionQuality:"all", productionClientAccess:"all",
    documentCreate:"none", documentEdit:"none", documentDelete:"none", documentExport:"none",
    analyticsExport:"none",
    financeCreate:"none", financeEdit:"none", financeDelete:"none", financeExport:"none",
    financeDirectories:"none",
    adminUsers:"none", adminRoles:"none", adminClients:"none", adminContractors:"none",
    adminCatalog:"none", adminPrices:"none", adminBackups:"none", adminRestore:"none",
    adminAudit:"none", adminDbCheck:"none",
    analyticsSales:false, analyticsBacklog:true, analyticsProduction:true, analyticsFinance:false, analyticsQuality:true,
    showLocked:false,
  },
  user: {
    ...NO_TEMPLATE_ACCESS,
    dashboard:"own", objects:"own", calendar:"own", estimates:"own", production:"own",
    documents:"own", analytics:"own", masters:"all", mastersManage:"none",
    finance:"none", payroll:"none", admin:"none", financialDetails:false, objectFinanceSummary:false,
    objectCreate:"all", objectEdit:"own", objectDelete:"own", objectStatus:"own",
    objectAssign:"none", objectExport:"own", calendarEdit:"own",
    estimateCreate:"all", estimateEdit:"own", estimateDelete:"own", estimateStatus:"own",
    estimatePublish:"own", estimateExport:"own",
    productionEdit:"own", productionStages:"own", productionQuality:"own", productionClientAccess:"none",
    documentCreate:"all", documentEdit:"own", documentDelete:"own", documentExport:"own",
    analyticsExport:"own",
    financeCreate:"none", financeEdit:"none", financeDelete:"none", financeExport:"none",
    financeDirectories:"none",
    adminUsers:"none", adminRoles:"none", adminClients:"none", adminContractors:"none",
    adminCatalog:"none", adminPrices:"none", adminBackups:"none", adminRestore:"none",
    adminAudit:"none", adminDbCheck:"none",
    analyticsSales:true, analyticsBacklog:false, analyticsProduction:true, analyticsFinance:false, analyticsQuality:true,
    showLocked:true,
  },
  viewer: {
    ...NO_TEMPLATE_ACCESS,
    dashboard:"none", objects:"all", calendar:"none", estimates:"none", production:"none",
    documents:"none", analytics:"none", masters:"all", mastersManage:"none",
    finance:"none", payroll:"none", admin:"none", financialDetails:false, objectFinanceSummary:false,
    objectCreate:"none", objectEdit:"none", objectDelete:"none", objectStatus:"none",
    objectAssign:"none", objectExport:"none", calendarEdit:"none",
    estimateCreate:"none", estimateEdit:"none", estimateDelete:"none", estimateStatus:"none",
    estimatePublish:"none", estimateExport:"none",
    productionEdit:"none", productionStages:"none", productionQuality:"none", productionClientAccess:"none",
    documentCreate:"none", documentEdit:"none", documentDelete:"none", documentExport:"none",
    analyticsExport:"none",
    financeCreate:"none", financeEdit:"none", financeDelete:"none", financeExport:"none",
    financeDirectories:"none",
    adminUsers:"none", adminRoles:"none", adminClients:"none", adminContractors:"none",
    adminCatalog:"none", adminPrices:"none", adminBackups:"none", adminRestore:"none",
    adminAudit:"none", adminDbCheck:"none",
    analyticsSales:true, analyticsBacklog:false, analyticsProduction:false, analyticsFinance:false, analyticsQuality:false,
    showLocked:false,
  },
});

const SCOPE_VALUES = new Set(["none", "own", "all"]);
const SCOPE_KEYS = [
  "dashboard","objects","calendar","estimates","production","documents","analytics","masters","mastersManage",
  "objectCreate","objectEdit","objectDelete","objectStatus","objectAssign","objectExport",
  "calendarEdit",
  "estimateCreate","estimateEdit","estimateDelete","estimateStatus","estimatePublish","estimateExport",
  "productionEdit","productionStages","productionQuality","productionClientAccess",
  "documentCreate","documentEdit","documentDelete","documentExport","analyticsExport",
  "templateView","templateEdit","templatePublish","templateRollback","templateArchive","documentInstanceEdit",
  "financeCreate","financeEdit","financeDelete","financeExport","financeDirectories",
  "adminUsers","adminRoles","adminClients","adminContractors","adminCatalog","adminPrices",
  "adminBackups","adminRestore","adminAudit","adminDbCheck",
];

const LEGACY_DERIVED_KEYS = Object.freeze({
  estimates:"objects",
  production:"objects",
  objectCreate:"objectEdit",
  objectDelete:"objectEdit",
  objectStatus:"objectEdit",
  objectAssign:"objectEdit",
  objectExport:"objects",
  calendarEdit:"calendar",
  estimateCreate:"estimateEdit",
  estimateDelete:"estimateEdit",
  estimateStatus:"estimateEdit",
  estimatePublish:"estimateEdit",
  estimateExport:"estimates",
  productionStages:"productionEdit",
  productionQuality:"productionEdit",
  productionClientAccess:"productionEdit",
  documentCreate:"documentEdit",
  documentDelete:"documentEdit",
  documentExport:"documents",
  analyticsExport:"analytics",
});

// Права на отдельные категории документов. По умолчанию наследуют общий доступ к
// разделу «Документы», поэтому старые матрицы работают без миграции; администратор
// может ужесточить точечно (напр. скрыть подряд у руководителя отдела продаж).
const DOC_CATEGORY_KEYS = ["docRepair","docDesign","docPodryad","docAvr"];
const FINANCE_ACTION_KEYS = ["financeCreate","financeEdit","financeDelete","financeExport","financeDirectories"];
const ADMIN_ACTION_KEYS = [
  "adminUsers","adminRoles","adminClients","adminContractors","adminCatalog","adminPrices",
  "adminBackups","adminRestore","adminAudit","adminDbCheck",
];

export function normalizeRolePermissions(saved = {}) {
  const src = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  const result = {};
  for (const role of ROLE_DEFINITIONS) {
    const base = DEFAULT_ROLE_PERMISSIONS[role.key];
    const patch = src[role.key] && typeof src[role.key] === "object" ? src[role.key] : {};
    const merged = { ...base, ...patch };
    // Старые матрицы знали только права уровня раздела и одно право "изменение".
    // Новые действия наследуем из старого поля лишь когда в сохранённой матрице
    // собственного значения ещё нет. Бизнес-данные при этом не затрагиваются.
    for (const [key, legacyKey] of Object.entries(LEGACY_DERIVED_KEYS)) {
      if (!(key in patch) && legacyKey in patch && SCOPE_VALUES.has(patch[legacyKey])) {
        merged[key] = patch[legacyKey];
      }
    }
    if (!("productionEdit" in patch) && SCOPE_VALUES.has(patch.production)) {
      merged.productionEdit = patch.production;
    }
    for (const key of FINANCE_ACTION_KEYS) {
      if (!(key in patch) && "finance" in patch) {
        merged[key] = patch.finance === "edit" ? "all" : "none";
      }
    }
    for (const key of ADMIN_ACTION_KEYS) {
      if (!(key in patch) && "admin" in patch) {
        merged[key] = patch.admin === "full" ? "all" : "none";
      }
    }
    for (const key of SCOPE_KEYS) {
      if (!SCOPE_VALUES.has(merged[key])) merged[key] = base[key];
    }
    // Категории документов по умолчанию = общий доступ к разделу «Документы».
    // Явно сохранённое значение категории уважается; иначе наследуем `documents`.
    const docScope = SCOPE_VALUES.has(merged.documents) ? merged.documents : base.documents;
    for (const key of DOC_CATEGORY_KEYS) {
      merged[key] = SCOPE_VALUES.has(merged[key]) ? merged[key] : docScope;
    }
    if (!["none","view","edit"].includes(merged.finance)) merged.finance = base.finance;
    // ФОТ — отдельное право, из finance НЕ наследуется. Зарплаты всех сотрудников
    // видеть должен не каждый, у кого открыты финансы: старые сохранённые матрицы
    // получают значение из пресета роли, то есть «нет доступа» всем, кроме админа.
    if (!["none","view","edit"].includes(merged.payroll)) merged.payroll = base.payroll;
    if (!["none","full"].includes(merged.admin)) merged.admin = base.admin;
    merged.financialDetails = merged.financialDetails === true;
    merged.objectFinanceSummary = merged.objectFinanceSummary === true;
    merged.showLocked = merged.showLocked === true;
    // Блоки аналитики: в старых сохранённых матрицах этих ключей нет. Берём значение
    // из пресета роли, а не гасим в false — иначе после обновления у всех пропала бы
    // вся аналитика, хотя право «Аналитика: просмотр» осталось.
    for (const key of ANALYTICS_BLOCK_KEYS) {
      merged[key] = (key in patch ? patch[key] : base[key]) === true;
    }
    result[role.key] = merged;
  }
  // Главного администратора нельзя случайно лишить доступа к матрице и данным.
  result.admin = { ...FULL_ADMIN_ACCESS };
  return result;
}

export function permissionsForRole(matrix, role) {
  const normalized = normalizeRolePermissions(matrix);
  return normalized[role] || normalized.viewer;
}

export function accessAllows(access, ownerMatches = false) {
  return access === "all" || (access === "own" && ownerMatches);
}

// Каждый тип документа относится к одной из настраиваемых категорий видимости.
// Приложения/доп.соглашения наследуют категорию своего родителя.
export const DOC_PERMISSION_BY_TYPE = Object.freeze({
  repair_fiz:"docRepair", annex:"docRepair", reservation:"docRepair",
  design:"docDesign", design_add:"docDesign",
  podryad:"docPodryad", podryad_annex:"docPodryad",
  avr:"docAvr",
});

export function documentPermissionKey(type) {
  return DOC_PERMISSION_BY_TYPE[type] || "docRepair";
}

// Видит ли роль документ данного типа. Верхнее право `documents` пускает в раздел,
// а это — фильтр внутри по категории (ремонт/дизайн/подряд/АВР) с учётом «свои/все».
export function docTypeAllows(permissions, type, ownerMatches = false) {
  if (!permissions || typeof permissions !== "object") return false;
  return accessAllows(permissions[documentPermissionKey(type)], ownerMatches);
}

// Дашборд замерщика строится только по его объектам/сметам. Финансовые операции,
// себестоимость и маржа сюда намеренно не попадают.
export function buildEstimatorDashboard({ objects = [], estimates = [], productions = [], user = null, now = Date.now() } = {}) {
  const uid = user?.id;
  const name = String(user?.name || "").trim();
  const liveObjects = objects.filter(o => o && !o.deletedAt);
  const ownEstimateObjectIds = new Set(
    estimates
      .filter(e => e && !e.deletedAt && ((uid && e.createdById === uid) || (name && e.createdBy === name)))
      .map(e => e.objectId)
      .filter(Boolean),
  );
  const ownObjects = liveObjects.filter(o =>
    (uid && o.createdById === uid)
    || (name && (o.manager === name || o.createdBy === name))
    || ownEstimateObjectIds.has(o.id),
  );
  const ownObjectIds = new Set(ownObjects.map(o => o.id));
  const ownEstimates = estimates.filter(e =>
    e && !e.deletedAt && (
      ownObjectIds.has(e.objectId)
      || (uid && e.createdById === uid)
      || (name && e.createdBy === name)
    ),
  );
  const prodByObject = new Map(productions.filter(Boolean).map(p => [p.objectId, p]));
  const statusOf = o => objectStatusOf(o, prodByObject.get(o.id));
  const statusCounts = {};
  for (const o of ownObjects) {
    const status = statusOf(o);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  const terminal = new Set(["done", "cancel", "archive", "refuse"]);
  const nowDate = new Date(now);
  const inCurrentMonth = value => {
    const d = new Date(Number(value) || 0);
    return d.getFullYear() === nowDate.getFullYear() && d.getMonth() === nowDate.getMonth();
  };
  const objectEstimateTotal = objectId => ownEstimates
    .filter(e => e.objectId === objectId)
    .reduce((sum, e) => sum + (Number(e.total) || 0), 0);
  const monthObjects = ownObjects.filter(o =>
    o.createdBy !== "migration"
    && inCurrentMonth(o.createdAt),
  );
  const monthEstimateTotal = monthObjects.reduce((sum, o) => sum + objectEstimateTotal(o.id), 0);
  const approvalObjects = ownObjects.filter(o => statusOf(o) === "approval");
  const pipelineTotal = approvalObjects.reduce((sum, o) => sum + objectEstimateTotal(o.id), 0);
  return {
    ownObjects,
    ownEstimates,
    statusCounts,
    objectCount: ownObjects.length,
    activeCount: ownObjects.filter(o => !terminal.has(statusOf(o))).length,
    approvalCount: statusCounts.approval || 0,
    signedCount: ["signed", "work", "paused", "done"].reduce((sum, key) => sum + (statusCounts[key] || 0), 0),
    estimateCount: ownEstimates.length,
    estimateTotal: ownEstimates.reduce((sum, e) => sum + (Number(e.total) || 0), 0),
    monthObjectCount: monthObjects.length,
    monthEstimateTotal,
    pipelineTotal,
    recentObjects: [...ownObjects]
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
      .slice(0, 6),
    statusOf,
  };
}

// Финансовый проект хранит деньги и ссылку objectId. Описательные поля всегда
// вычисляются из объекта, производства, договора и актов, чтобы их нельзя было
// независимо изменить в двух разделах.
// Сумма позиций договора БЕЗ скидки. Это не та сумма, которую платит клиент, —
// для денег всегда contractNetTotal.
export function contractWorksGross(contract) {
  return (contract?.works || []).reduce(
    (sum, work) => sum + lineTotal(work?.quantity, work?.price),
    0,
  );
}
// Скидка живёт отдельным полем договора (contract.discount, %) и применяется в
// редакторе договора и в печатной форме. Финансы её раньше не применяли, поэтому
// бюджет проекта, долг и прогресс оплаты были завышены на сумму скидки
// (ловили на договоре №1034: 1 430 012 вместо 1 258 411 при скидке 12%).
// Формула повторяет печатную форму: total − round(total * discount / 100).
export function contractNetTotal(contract) {
  const gross = contractWorksGross(contract);
  const discount = Math.min(100, Math.max(0, Number(contract?.discount) || 0));
  if (!discount) return gross;
  return gross - Math.round(gross * discount / 100);
}

// ЕДИНАЯ цена позиции для клиента. Всё приложение обязано считать её только так,
// иначе одна и та же работа стоит по-разному в смете, КП, договоре и акте: раньше
// редактор округлял base*скидка, документы — round(base*наценка)*скидка, а клиентская
// смета round(round(base*наценка))*скидка. Округление ОДНО и в самом конце.
export function clientUnitPrice(basePrice, { markupPercent = 0, discountPercent = 0 } = {}) {
  const p = Number(basePrice) || 0;
  if (!p) return p;
  const m = Math.max(0, Number(markupPercent) || 0);
  const d = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  return Math.round(p * (1 + m / 100) * (1 - d / 100));
}
// Обратный ход для поля ввода: менеджер видит и вводит КЛИЕНТСКУЮ цену, а хранится
// прайсовая — иначе изменить процент скидки/наценки было бы уже нечем.
export function basePriceFromClient(clientPrice, { markupPercent = 0, discountPercent = 0 } = {}) {
  const p = Number(clientPrice) || 0;
  const m = Math.max(0, Number(markupPercent) || 0);
  const d = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const k = (1 + m / 100) * (1 - d / 100);
  if (!p || !k) return p;
  return Math.round(p / k);
}
// Сумма строки — тоже одно правило: целые тенге, копеек в документах не бывает.
// Объём бывает дробным (5,5 м²), поэтому без округления сумма строки утекала в копейки.
export function lineTotal(qty, unitPrice) {
  const q = Number(qty) || 0;
  const p = Number(unitPrice) || 0;
  if (q <= 0 || !p) return 0;
  return Math.round(q * p);
}

export function resolveFinanceProjectBudget({ project = {}, object = null, estimates = [], contractTotal = 0 } = {}) {
  const linkedEstimates = object?.id
    ? estimatesForObject((estimates || []).filter(e => e && !e.deletedAt), object.id)
    : [];
  const estimateTotal = linkedEstimates.reduce((sum, estimate) => sum + (Number(estimate.total) || 0), 0);
  // contracts-v2 is an irreversible opt-in for future objects. Keep it if either
  // side of an already-linked pair has received the marker during synchronization.
  const calcMode = object?.financeCalcMode === "contracts-v2" || project?.financeCalcMode === "contracts-v2"
    ? "contracts-v2"
    : "estimates-v1";
  const safeContractTotal = Math.max(0, Number(contractTotal) || 0);
  if (calcMode === "contracts-v2") {
    return { budget: safeContractTotal, source: "contracts-v2", estimateCount: linkedEstimates.length, calcMode };
  }
  if (estimateTotal > 0) return { budget: estimateTotal, source: "estimates", estimateCount: linkedEstimates.length, calcMode };

  if (safeContractTotal > 0) return { budget: safeContractTotal, source: "contracts", estimateCount: linkedEstimates.length, calcMode };

  return { budget: Number(project?.budget) || 0, source: "legacy", estimateCount: linkedEstimates.length, calcMode };
}

export function hasInvalidFinanceProjectDate(value, now = Date.now()) {
  if (value == null || value === "") return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date.getUTCFullYear() > new Date(now).getUTCFullYear() + 1;
}

export function sortProductionStages(stages = []) {
  return (Array.isArray(stages) ? stages : [])
    .map((stage, index) => ({ stage, index }))
    .sort((a, b) => {
      const ao = a.stage?.order == null ? 1e9 + a.index : Number(a.stage.order);
      const bo = b.stage?.order == null ? 1e9 + b.index : Number(b.stage.order);
      return ao - bo || a.index - b.index;
    })
    .map(item => item.stage);
}

export function sumPaidProductionStages(stages = []) {
  return (Array.isArray(stages) ? stages : []).reduce((total, stage) => {
    if (stage?.paid !== true) return total;
    const amount = Number(stage.priceClient);
    return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

export function resolveProgressBudget(entryBudget, stages = []) {
  const savedBudget = Number(entryBudget);
  if (Number.isFinite(savedBudget) && savedBudget > 0) return savedBudget;
  return (Array.isArray(stages) ? stages : []).reduce((total, stage) => {
    const amount = Number(stage?.priceClient);
    return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

export function startPublicProgressAutoRefresh(load, {
  doc = typeof document !== "undefined" ? document : null,
  intervalMs = 10000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (typeof load !== "function") return () => {};
  const refresh = () => {
    if (doc?.hidden) return;
    Promise.resolve(load({ isRefresh: true })).catch(() => {});
  };
  const timer = setIntervalFn(refresh, intervalMs);
  const onVisibilityChange = () => {
    if (!doc?.hidden) refresh();
  };
  doc?.addEventListener?.("visibilitychange", onVisibilityChange);
  return () => {
    clearIntervalFn(timer);
    doc?.removeEventListener?.("visibilitychange", onVisibilityChange);
  };
}

export function moveProductionStage(stages = [], stageId, targetIndex) {
  const sorted = sortProductionStages(stages).filter(Boolean);
  const moving = sorted.find(stage => stage.id === stageId);
  if (!moving) return sorted;
  const category = moving.cat || "Прочее";
  const sameCategory = sorted.filter(stage => (stage.cat || "Прочее") === category);
  const from = sameCategory.findIndex(stage => stage.id === stageId);
  if (from < 0 || sameCategory.length < 2) return sorted.map((stage, order) => ({ ...stage, order }));
  const to = Math.max(0, Math.min(sameCategory.length - 1, Number(targetIndex) || 0));
  const reorderedCategory = [...sameCategory];
  const [item] = reorderedCategory.splice(from, 1);
  reorderedCategory.splice(to, 0, item);
  let categoryIndex = 0;
  return sorted
    .map(stage => (stage.cat || "Прочее") === category ? reorderedCategory[categoryIndex++] : stage)
    .map((stage, order) => ({ ...stage, order }));
}

export function buildFinanceProjectView({ project = {}, object = null, production = null, contract = null, estimates = [], contractTotal = 0, reports = [], status = null } = {}) {
  const linked = !!object;
  const clientType = object?.clientType === "юр" ? "Юр лицо" : object ? "Физ лицо" : (project.client || "—");
  const legacyStatus = financeStatusMeta(linked ? (object.status || "new") : (project.rawStatus || project.status || ""));
  const statusKey = status?.key || legacyStatus.key;
  const statusLabel = status?.label || legacyStatus.label;
  const hasAvr = linked
    ? reports.some(r => r && r.objectId === object.id && r.type === "avr")
    : project.avr === "да";
  const contractSigned = linked
    ? !!(contract && contract.contractStatus === "signed")
    : project.contractSigned === "да";
  const budgetView = resolveFinanceProjectBudget({ project, object, estimates, contractTotal });
  return {
    linked,
    object,
    production,
    contract,
    objectId: object?.id || project.objectId || "",
    customerName: object?.clientName || (linked ? "Без клиента" : project.description || project.client || "Проект без объекта"),
    customerPhone: object?.clientPhone || "",
    customerType: clientType,
    address: object?.address || "",
    area: object?.area || "",
    category: object?.objType || (linked ? "—" : project.category || "—"),
    manager: object?.manager || production?.responsible || "",
    contractNo: contract?.number || project.contractNo || "",
    statusKey,
    statusLabel,
    statusColor: status?.color || legacyStatus.color,
    statusBg: status?.bg || legacyStatus.bg,
    saleDate: production?.saleDate || "",
    startDate: production?.startDate || "",
    planEndDate: production?.planEndDate || "",
    factEndDate: production?.factEndDate || "",
    contractSigned,
    hasAvr,
    budget: budgetView.budget,
    budgetSource: budgetView.source,
    estimateCount: budgetView.estimateCount,
  };
}

export const CATALOG_DEFAULTS = Object.freeze({ renames:{}, catRenames:{}, subRenames:{}, hiddenCodes:[], hiddenSubs:[], hiddenCats:[], custom:[], suggestionRules:null });
// Дефолты + текущее состояние + патч, одним местом.
export const withCatalogOverrides = (cur, patch = {}) => ({ ...CATALOG_DEFAULTS, ...(cur||{}), ...patch });

const roundSuggestionQty = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.round(n * 100) / 100;
};

// Правила хранят только стабильные коды работ. Названия, цены и единицы всегда берутся
// из актуального прайса, поэтому удалённая/скрытая позиция физически не попадёт в подсказки.
export function normalizeEstimateSuggestionRules(rawRules, catalog = []) {
  if (!Array.isArray(rawRules)) return [];
  const byCode = new Map((catalog || []).filter(w => w?.code).map(w => [String(w.code), w]));
  const seen = new Set();
  const result = [];
  for (const raw of rawRules) {
    if (!raw || typeof raw !== "object") continue;
    const sourceCode = String(raw.sourceCode || "").trim();
    const targetCode = String(raw.targetCode || "").trim();
    const pairKey = `${sourceCode}>${targetCode}`;
    if (!sourceCode || !targetCode || sourceCode === targetCode || seen.has(pairKey)) continue;
    if (!byCode.has(sourceCode) || !byCode.has(targetCode)) continue;
    const multiplierRaw = raw.multiplier;
    const multiplier = multiplierRaw === null || multiplierRaw === ""
      ? null
      : Number(multiplierRaw);
    if (multiplier !== null && (!Number.isFinite(multiplier) || multiplier <= 0)) continue;
    seen.add(pairKey);
    result.push({
      id: String(raw.id || pairKey),
      sourceCode,
      targetCode,
      multiplier,
      reason: String(raw.reason || "Связанная работа").trim() || "Связанная работа",
      defaultSelected: raw.defaultSelected !== false,
    });
  }
  return result;
}

// Базовый набор сопутствующих работ (согласован с владельцем). Правило активируется только
// если ОБЕ работы реально есть в текущем прайсе (add проверяет коды), поэтому удалённая/
// переименованная позиция просто выпадет. multiplier: 1 — количество подставляется (тот же
// объём); null — вводится вручную (разные единицы / необязательная проверка). defaultSelected
// (последний аргумент) — стоит ли галочка по умолчанию. Администратор может заменить весь набор
// своими правилами в «Админка → Каталог».
export function createDefaultEstimateSuggestionRules(catalog = []) {
  const codes = new Set((catalog || []).map(w => String(w?.code || "")).filter(Boolean));
  const rules = [];
  const add = (sourceCode, targetCode, multiplier, reason, defaultSelected = true) => {
    if (codes.has(sourceCode) && codes.has(targetCode)) {
      rules.push({ sourceCode, targetCode, multiplier, reason, defaultSelected });
    }
  };

  // — Полы: стяжка / наливной пол —
  for (const sourceCode of ["FLOOR-004", "FLOOR-005", "FLOOR-006"]) {
    add(sourceCode, "PREP-007", 1, "Перед стяжкой обычно грунтуют основание", true);
    add(sourceCode, "FLOOR-002", 1, "Проверьте, требуется ли армирование стяжки", false);
    add(sourceCode, "FLOOR-003", null, "Проверьте монтаж маяков и укажите погонные метры", false);
  }
  add("FLOOR-008", "PREP-007", 1, "Перед наливным полом обычно грунтуют основание", true);
  // Стяжка «под керамзит» ⇄ засыпка керамзита (в обе стороны)
  add("FLOOR-004", "FLOOR-007", 1, "Эта стяжка идёт по керамзиту — нужна засыпка", true);
  add("FLOOR-007", "FLOOR-004", 1, "Под керамзит сверху заливают стяжку", true);

  // — Радиаторы: монтаж ⇄ демонтаж —
  add("SN-008", "DEM-026", 1, "Ставите новый радиатор — старый нужно демонтировать", true);
  add("SN-009", "DEM-026", 1, "Ставите новый радиатор — старый нужно демонтировать", true);
  add("DEM-026", "SN-008", 1, "После демонтажа радиатора обычно ставят новый", true);
  add("DEM-026", "SN-009", 1, "Вариант монтажа радиатора с заменой труб/подводки", false);

  // — Плитка: затирка швов (тот же объём) —
  add("TL-001", "TL-005", 1, "После укладки плитки затирают швы — тот же объём", true);
  add("TL-002", "TL-005", 1, "После укладки плитки затирают швы — тот же объём", true);
  add("FLR-007", "TL-005", 1, "После укладки плитки на пол затирают швы", true);
  add("FLR-006", "TL-005", 1, "После укладки керамогранита затирают швы", true);
  add("TL-006", "TL-005", 1, "После монтажа фартука затирают швы", true);
  add("TL-007", "TL-005", null, "Затирка швов бордюров — объём вручную (разные единицы)", false);
  // Плитка: раскладка под 45° и гидроизоляция (необязательно, объём вручную)
  add("TL-001", "TL-003", null, "Уточните, есть ли запил/раскладка под 45°", false);
  add("TL-002", "TL-003", null, "Уточните, есть ли запил/раскладка под 45°", false);
  add("TL-002", "FLOOR-001", null, "Проверьте гидроизоляцию пола (санузел)", false);
  add("TL-001", "GID-003", null, "Проверьте гидроизоляцию стен под ванной/душем", false);
  add("FLR-006", "FLOOR-001", null, "Проверьте гидроизоляцию пола (санузел)", false);
  add("FLR-007", "FLOOR-001", null, "Проверьте гидроизоляцию пола (санузел)", false);

  // — Стены: штукатурка → грунтовка / маяки / армирование —
  add("WALL-003", "WALL-001", 1, "Перед штукатуркой грунтуют основание стен", true);
  add("WALL-003", "WALL-002", 1, "Если штукатурите по маякам", false);
  add("WALL-003", "WALL-005", 1, "Проверьте, нужно ли армирование сеткой", false);
  add("WALL-004", "WALL-001", 1, "Перед штукатуркой грунтуют основание стен", true);
  add("WALL-004", "WALL-002", 1, "Толстый слой обычно кладут по маякам", true);
  add("WALL-004", "WALL-005", 1, "Толстый слой армируют сеткой", true);
  // Стены: шпаклёвка → ошкуривание
  add("WALL-006", "WALL-007", 1, "После шпаклёвки стены ошкуривают — тот же объём", true);

  // — Покраска / декор стен: грунтовка основания —
  add("PA-003", "PA-001", 1, "Перед покраской стены грунтуют — тот же объём", true);
  add("PA-002", "PA-001", 1, "Перед покраской стены грунтуют — тот же объём", true);
  add("DEC-001", "WALL-001", 1, "Под декоративную штукатурку грунтуют основание", false);
  add("DEC-002", "WALL-001", 1, "Под микробетон грунтуют основание", false);
  add("DEC-003", "WALL-001", 1, "Под венецианку грунтуют основание", false);
  add("DEC-004", "WALL-001", 1, "Под акцентные стены грунтуют основание", false);
  // Откосы под окна/двери → окраска откосов
  add("WALL-009", "PA-004", 1, "Откосы под окна/двери потом красят", false);

  // — Потолок: покраска / шпаклёвка → грунтовка, ошкуривание —
  add("CEIL-001", "PREP-008", 1, "Перед покраской потолок грунтуют", true);
  add("CEIL-001", "PREP-003", 1, "Проверьте, нужна ли шпаклёвка потолка", false);
  add("PREP-003", "PREP-008", 1, "Перед шпаклёвкой потолок грунтуют", true);
  add("PREP-003", "PREP-006", 1, "После шпаклёвки потолок ошкуривают", true);

  // — Обои: подготовка стен —
  add("OB-001", "PREP-002", 1, "Под обои стены подготавливают — тот же объём", true);

  // — Двери: наличники / доборы, замена старой —
  add("DR-001", "DR-004", 1, "К двери устанавливают наличники", true);
  add("DR-002", "DR-004", 1, "К двери устанавливают наличники", true);
  add("DR-001", "DR-003", 1, "Проверьте, нужны ли доборы к двери", false);
  add("DR-002", "DR-003", 1, "Проверьте, нужны ли доборы к двери", false);
  add("DEM-016", "DR-001", 1, "Сняли старую дверь — ставят новую", false);
  add("DEM-017", "DR-001", 1, "Сняли старую дверь — ставят новую", false);

  // — Напольные покрытия: подложка —
  add("FLR-002", "FLRA-001", 1, "Под ламинат укладывают подложку — тот же объём", true);
  add("FLR-003", "FLRA-001", 1, "Под кварц-винил укладывают подложку", true);
  add("FLR-004", "FLRA-001", 1, "Под паркетную доску укладывают подложку", true);
  add("FLR-005", "FLRA-001", 1, "Под инженерную доску укладывают подложку", true);

  return normalizeEstimateSuggestionRules(rules, catalog);
}

export function resolveEstimateSuggestionRules(catalogSettings, catalog = []) {
  const configured = catalogSettings?.suggestionRules;
  return configured === null || configured === undefined
    ? createDefaultEstimateSuggestionRules(catalog)
    : normalizeEstimateSuggestionRules(configured, catalog);
}

// Функция только читает rows/catalog и возвращает рекомендации. Исходная смета не мутируется.
export function buildEstimateSuggestions(rows = {}, catalog = [], rules = []) {
  const byCode = new Map((catalog || []).filter(w => w?.code).map(w => [String(w.code), w]));
  const normalizedRules = normalizeEstimateSuggestionRules(rules, catalog);
  const resultByTarget = new Map();
  for (const rule of normalizedRules) {
    const source = byCode.get(rule.sourceCode);
    const target = byCode.get(rule.targetCode);
    if (!source || !target) continue;
    const sourceRow = rows?.[source.code] || rows?.[source.name] || {};
    const sourceQty = Number(sourceRow?.qty || 0);
    if (!Number.isFinite(sourceQty) || sourceQty <= 0) continue;
    const targetRow = rows?.[target.code] || rows?.[target.name] || {};
    if (Number(targetRow?.qty || 0) > 0) continue;
    const qty = rule.multiplier === null ? "" : roundSuggestionQty(sourceQty * rule.multiplier);
    const suggestion = {
      id: rule.id,
      sourceCode: source.code,
      sourceName: source.name,
      targetCode: target.code,
      targetName: target.name,
      targetUnit: target.unit || "",
      reason: rule.reason,
      qty,
      defaultSelected: rule.defaultSelected && qty !== "",
    };
    const previous = resultByTarget.get(target.code);
    if (!previous || Number(suggestion.qty || 0) > Number(previous.qty || 0)) {
      resultByTarget.set(target.code, suggestion);
    }
  }
  return [...resultByTarget.values()];
}

// Группировка строк по (cat, sub) — категория › подкатегория, с сохранением порядка появления.
export function groupData(works) {
  const g = {};
  for (const w of works) {
    if (!g[w.cat]) g[w.cat] = {};
    if (!g[w.cat][w.sub]) g[w.cat][w.sub] = [];
    g[w.cat][w.sub].push(w);
  }
  return g;
}

// Сумма прописью на казахском тенге — используется в легальном тексте договоров.
export function tengeInWords(num){
  num = Math.round(Math.abs(Number(num)||0));
  if(num===0) return "Ноль тенге";
  const ones=["","один","два","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
  const onesF=["","одна","две","три","четыре","пять","шесть","семь","восемь","девять","десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
  const tens=["","","двадцать","тридцать","сорок","пятьдесят","шестьдесят","семьдесят","восемьдесят","девяносто"];
  const hund=["","сто","двести","триста","четыреста","пятьсот","шестьсот","семьсот","восемьсот","девятьсот"];
  const triplet=(n,fem)=>{ const s=[]; const h=Math.floor(n/100), t=Math.floor((n%100)/10), o=n%10;
    if(h) s.push(hund[h]);
    if(t>=2){ s.push(tens[t]); if(o) s.push((fem?onesF:ones)[o]); }
    else { const v=t*10+o; if(v) s.push((fem?onesF:ones)[v]); }
    return s.join(" "); };
  const plural=(n,f)=>{ const a=n%10, b=n%100; if(a===1&&b!==11)return f[0]; if(a>=2&&a<=4&&(b<10||b>=20))return f[1]; return f[2]; };
  const res=[];
  const mlrd=Math.floor(num/1e9)%1000, mln=Math.floor(num/1e6)%1000, ths=Math.floor(num/1e3)%1000, rest=num%1000;
  if(mlrd){ res.push(triplet(mlrd,false), plural(mlrd,["миллиард","миллиарда","миллиардов"])); }
  if(mln){ res.push(triplet(mln,false), plural(mln,["миллион","миллиона","миллионов"])); }
  if(ths){ res.push(triplet(ths,true), plural(ths,["тысяча","тысячи","тысяч"])); }
  if(rest){ res.push(triplet(rest,false)); }
  res.push("тенге");
  const str=res.join(" ").replace(/\s+/g," ").trim();
  return str.charAt(0).toUpperCase()+str.slice(1);
}

export const DEFAULT_FIN_META = {
  accounts: [
    { id:"acc0", name:"Наличные",    opening:0, accType:"cash" },
    { id:"acc1", name:"KASPI Pay",   opening:0, accType:"bank" },
    { id:"acc2", name:"Учет займов", opening:0, accType:"bank" },
    { id:"acc3", name:"Лч Звеат",    opening:0, accType:"card" },
  ],
  balanceItems: {
    inventory:0, collateral:0, loansGivenShort:0, transfersInTransit:0,
    faTechnika:0, faMebel:0, faInventar:0, faOborud:0, faTransport:0,
    loansGivenLong:0, financialInvest:0, intangibles:0,
    payablesMoney:0, payablesNonMoney:0, paymentsThirdParty:0, loansTakenShort:0,
    creditsLong:0, loansTakenLong:0,
    foundersContribution:0, otherCapital:0,
  },
  income: [
    { cat:"Основные доходы", subs:["Оплата по договору (вторичка)","Оплата по договору (новостройки)","Оплата по договору  (коммерция)","Частичные работы, услуги"] },
    { cat:"Дополнительные доходы", subs:["Доп. работы по ходу ремонта","Закупка материалов (наценка)"] },
    { cat:"Скрытые/косвенные доходы", subs:["Кэшбэк и бонусы от поставщиков","Бонусы от субподрядчиков (наш %)","Услуги по доставке/подъёму"] },
    { cat:"Финансирование (не выручка)", subs:["Полученный заём (до 1 года)","Полученный заём (от 1 года)","Полученный кредит (от 1 года)","Вклад учредителя"] },
    { cat:"Возврат займов и активов", subs:["Возврат займа выданного (кратк.)","Возврат займа выданного (долг.)","Возврат залогового платежа","Продажа / реализация запасов","Возврат фин. вложений"] },
  ],
  expense: [
    { cat:"Прямые расходы (COGS / себестоимость)", subs:["Зарплаты рабочих / подрядчиков","Аренда инструмента, спецтехника","Вывоз мусора, уборка","Логистика, доставка"] },
    { cat:"Косвенные расходы (OPEX / операционные)", subs:["Аренда офиса","ФОТ Директор по производству","ФОТ Управляющий партнер","ФОТ Прораб","Софт (IT, CRM)","Рекрутинг","Телефония, связь","Маркетинг бюджет контекст","Маркетинг бюджет таргет"] },
    { cat:"Финансовые расходы", subs:["КПН, ИПН","НДС 16%","Налог за сотрудников","Дивиденды учредителям"] },
    { cat:"Финансовая деятельность (не расход)", subs:["Возврат займа (до 1 года)","Возврат займа (от 1 года)","Погашение кредита (от 1 года)","Возврат вклада учредителю"] },
    { cat:"Инвестиции (покупка активов)", subs:["Покупка: Техника","Покупка: Мебель","Покупка: Инвентарь","Покупка: Оборудование","Покупка: Транспорт"] },
    { cat:"Выданные займы и прочие активы", subs:["Выдан займ (до 1 года)","Выдан займ (от 1 года)","Залоговый платёж","Закуп запасов / материалов","Финансовые вложения (долг.)","НМА (нематериальные активы)"] },
  ],
};

// Дополняет сохранённые категории/подкатегории Финансов дефолтными (не удаляет пользовательские).
export function mergeFinMeta(saved) {
  const m = { ...saved };
  ["income","expense"].forEach(key => {
    const cur = Array.isArray(m[key]) ? [...m[key]] : [];
    (DEFAULT_FIN_META[key]||[]).forEach(defCat => {
      const ex = cur.find(c => c.cat === defCat.cat);
      if (!ex) { cur.push({ cat: defCat.cat, subs: [...(defCat.subs||[])] }); }
      else { const subs = Array.isArray(ex.subs) ? [...ex.subs] : []; (defCat.subs||[]).forEach(s => { if (!subs.includes(s)) subs.push(s); }); ex.subs = subs; }
    });
    m[key] = cur;
  });
  return m;
}

// ── ДЕТЕКТОР ПРОБЛЕМ: «Что горит сегодня» + «Проверка базы» ──
// Одна чистая функция без побочных эффектов: получает все списки, возвращает массив проблем.
// Используется двумя экранами (дашборд admin/manager/прораб — операционные; Админка → Проверка
// базы — целостность данных). Read-only: НИЧЕГО не пишет, только считает. Не бросает исключений
// на неполных данных. Каждая проблема:
//   { id, group, sev, scope, dismissable, title, detail, nav }
//   scope: "today" — операционные (что разрулить сегодня, скрываемые «до завтра»);
//          "check" — целостность данных (перед мержем/релизом, не скрываемые).
//   sev:   "red" | "yellow".
//   nav:   как открыть — { object:id, tab? } | { screen, tab? } — интерпретирует UI.
const _dayStartTs = (d) => { const x = new Date(d); if (isNaN(x.getTime())) return 0; x.setHours(0,0,0,0); return x.getTime(); };
const _fmtT = (n) => (Math.round(Number(n)||0)).toLocaleString("ru-RU");
const _objLabel = (o) => (o && (o.clientName || o.address || o.objType)) || "объект без названия";

export function computeIssues(data = {}, opts = {}) {
  const objects = (data.objects||[]).filter(o => o && !o.deletedAt);
  const productions = data.productions || [];
  const finProjects = data.finProjects || [];
  const financeTx = (data.financeTx||[]).filter(t => t && !t.deletedAt && t.included !== false);
  const contracts = (data.contracts||[]).filter(c => c && !c.deletedAt);
  const estimates = data.estimates || [];
  const clients = data.clients || [];
  const now = opts.now || Date.now();
  const today = _dayStartTs(now);
  const out = [];

  const prodByObj = {}; for (const p of productions) if (p && p.objectId != null) prodByObj[p.objectId] = p;
  const objById = {};   for (const o of objects) objById[o.id] = o;

  // Оплаты по нормализованному номеру договора
  const incByCN = {};
  for (const t of financeTx) { const cn = normCN(t.contractNo); if (!cn) continue; if (t.type==="income") incByCN[cn] = (incByCN[cn]||0) + (Number(t.amount)||0); }

  // Связка финпроект ↔ объект: objectId, номера основного/доп. договоров,
  // затем только однозначное совпадение по полному имени или телефону.
  const finProjForObject = (o) => findFinanceProjectForObject(o, contracts, finProjects);
  // Статус берём ЕДИНЫЙ (производство перевешивает поле объекта) — как на экране.
  // По сырому object.status проверки молча пропускали живые объекты.
  const st = (o) => objectStatusOf(o, prodByObj[o?.id]);
  const objIsActive = (o) => !["done","cancel","archive","refuse"].includes(st(o));

  for (const project of finProjects) {
    if (!project || !hasInvalidFinanceProjectDate(project.createdAt, now)) continue;
    const projectId = project.id || normCN(project.contractNo) || "unknown";
    out.push({ id:`finproject-date:${projectId}`, group:"Данные", sev:"red", scope:"check", dismissable:false,
      title:"Некорректная дата финпроекта",
      detail:`${project.name || project.clientName || project.contractNo || "Финансовый проект"} · ${project.createdAt}`,
      nav:{ screen:"finance", tab:"projects" } });
  }

  // ─────────── TODAY: операционные (что разрулить сегодня) ───────────
  // 1. Просроченные этапы производства
  for (const o of objects) {
    if (!objIsActive(o)) continue;
    const p = prodByObj[o.id]; if (!p) continue;
    for (const s of (p.stages||[])) {
      if ((s.status||"todo") === "done" || !s.planEnd) continue;
      const d = _dayStartTs(s.planEnd); if (!d || d >= today) continue;
      const days = Math.round((today - d)/864e5);
      out.push({ id:`overdue-stage:${o.id}:${s.id||s.name}`, group:"Производство", sev:"red", scope:"today", dismissable:true,
        title:`Просрочен этап: ${s.name||"без названия"}`,
        detail:`${_objLabel(o)} · ${s.responsible?("ответств. "+s.responsible+" · "):""}просрочка ${days} дн`,
        nav:{ object:o.id, tab:"stages" } });
    }
  }
  // 2. Объект в работе/подписан без назначенного прораба
  for (const o of objects) {
    if (!["signed","work","paused"].includes(st(o))) continue;
    const p = prodByObj[o.id];
    if ((p && (p.responsible||"").trim())) continue;
    out.push({ id:`no-foreman:${o.id}`, group:"Производство", sev:"yellow", scope:"today", dismissable:true,
      title:"Не назначен прораб", detail:`${_objLabel(o)} · статус «${st(o)==="signed"?"договор подписан":st(o)==="paused"?"приостановлен":"в работе"}»`,
      nav:{ object:o.id, tab:"info" } });
  }
  // 3. Договор подписан, но нет финпроекта (важно: не скрываемая — это дыра в данных)
  for (const o of objects) {
    if (!["signed","work"].includes(st(o))) continue;
    if (finProjForObject(o)) continue;
    out.push({ id:`signed-nofin:${o.id}`, group:"Финансы", sev:"red", scope:"today", dismissable:false,
      title:"Договор подписан, но нет финпроекта", detail:_objLabel(o),
      nav:{ object:o.id, tab:"finance" } });
  }
  // Дебиторка не является срочной ошибкой и показывается в Финансах, а не в «Что горит».
  // 5. Замечания клиента (новые/необработанные из клиентского кабинета)
  for (const o of objects) {
    const p = prodByObj[o.id]; if (!p) continue;
    for (const d of (p.defects||[])) {
      if (!d || d.source!=="client" || d.done || d.dashboardDismissedAt) continue;
      const itemId = d.id || "";
      out.push({ id:`client-remark:${o.id}:${itemId||d.clientRemarkId||d.ts}`, group:"Клиенты", sev:"red", scope:"today", dismissable:Boolean(itemId),
        title:"Замечание клиента", detail:`${_objLabel(o)}: «${String(d.text||"").slice(0,80)}»`,
        dismissAction:itemId ? { type:"client-remark", objectId:o.id, itemId } : null,
        dismissLabel:"Убрать с главной",
        nav:{ object:o.id, tab:"defects" } });
    }
  }
  // 6. Близко к сдаче, но есть незакрытые этапы
  for (const o of objects) {
    if (st(o)!=="work") continue;
    const p = prodByObj[o.id]; if (!p || !p.planEndDate || p.factEndDate) continue;
    const d = _dayStartTs(p.planEndDate); if (!d) continue;
    const left = Math.round((d - today)/864e5);
    if (left < 0 || left > 7) continue;
    const openStages = (p.stages||[]).filter(s => (s.status||"todo")!=="done").length;
    if (openStages===0) continue;
    out.push({ id:`near-handover:${o.id}`, group:"Производство", sev:"yellow", scope:"today", dismissable:true,
      title:`Скоро сдача (${left===0?"сегодня":("через "+left+" дн")})`,
      detail:`${_objLabel(o)} · ${openStages} незакрытых этапов`,
      nav:{ object:o.id, tab:"info" } });
  }

  // ─────────── CHECK: целостность данных (перед мержем/релизом) ───────────
  // 7. Дубли номеров договоров (кроме приложений — у них номер родителя)
  const cnGroups = {};
  for (const c of contracts) { if (c.type==="annex"||c.type==="podryad_annex") continue; const cn=normCN(c.number); if (!cn) continue; (cnGroups[cn]||(cnGroups[cn]={n:0,sample:c})).n++; }
  for (const cn of Object.keys(cnGroups)) { const g=cnGroups[cn]; if (g.n>1) out.push({ id:`dup-cn:${cn}`, group:"Данные", sev:"red", scope:"check", dismissable:false,
    title:`Дубль номера договора №${g.sample.number}`, detail:`${g.n} договоров с одинаковым номером — финансы/оплаты могут сойтись не на тот`, nav:{ screen:"contracts" } }); }
  // 8. Сметы без objectId
  for (const e of estimates) { if (!e || e.objectId) continue; out.push({ id:`est-noobj:${e.id}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
    title:"Смета не привязана к объекту", detail:`Смета на ${_fmtT(e.total||0)} ₸ — не попадёт в объект/этапы`, nav:{ screen:"objects" } }); }
  // 9. Финпроект без объекта (нет objectId и не находится по номеру договора)
  for (const fp of finProjects) {
    if (fp.objectId && objById[fp.objectId]) continue;
    const linkedByCN = fp.contractNo && contracts.some(c => c.objectId && objById[c.objectId] && normCN(c.number)===normCN(fp.contractNo));
    if (linkedByCN) continue;
    out.push({ id:`fp-noobj:${fp.id||normCN(fp.contractNo)}`, group:"Финансы", sev:"yellow", scope:"check", dismissable:false,
      title:"Финпроект без объекта", detail:`${fp.description||("№"+(fp.contractNo||"?"))} — не связан ни с одним объектом`, nav:{ screen:"finance", tab:"projects" } });
  }
  // 11. Пустые production-карточки (нет этапов, дат, ответственного) у неактивных объектов
  for (const p of productions) {
    if (String(p.objectId).startsWith("fp:")) continue;
    const o = objById[p.objectId]; if (!o) continue;
    const empty = !(p.stages||[]).length && !p.startDate && !p.planEndDate && !(p.responsible||"").trim();
    if (empty && !["work","done"].includes(st(o))) out.push({ id:`empty-prod:${p.objectId}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
      title:"Пустая производственная карточка", detail:`${_objLabel(o)} — карточка есть, но не заполнена`, nav:{ object:o.id, tab:"info" } });
  }
  // 12. Production-запись без объекта (объект удалён/не существует)
  for (const p of productions) {
    if (String(p.objectId).startsWith("fp:")) continue;
    if (objById[p.objectId]) continue;
    out.push({ id:`prod-noobj:${p.objectId}`, group:"Данные", sev:"red", scope:"check", dismissable:false,
      title:"Производство без объекта", detail:`Карточка производства ссылается на несуществующий объект (${p.objectId})`, nav:{ screen:"objects" } });
  }
  // 13. Договор подряда без рабочего (битая ссылка на подрядчика)
  for (const c of contracts) {
    if (c.type!=="podryad" && c.type!=="podryad_annex") continue;
    if (c.workerId) continue;
    out.push({ id:`pod-noworker:${c.id}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
      title:`Договор подряда без рабочего`, detail:`№${c.number||"?"} — не указан подрядчик (workerId)`, nav:{ screen:"contracts" } });
  }
  // 14. Расхождение бюджета финпроекта и суммы смет объекта (>20%)
  for (const o of objects) {
    const fp = finProjForObject(o); if (!fp) continue;
    const budget = Number(fp.budget)||0; if (budget<=0) continue;
    const estSum = estimatesForObject(estimates, o.id).reduce((s,e)=>s+(Number(e.total)||0),0);
    if (estSum<=0) continue;
    const diff = Math.abs(budget-estSum);
    if (diff > budget*0.2) out.push({ id:`budget-mismatch:${o.id}`, group:"Финансы", sev:"yellow", scope:"check", dismissable:false,
      title:"Бюджет ≠ сумма смет", detail:`${_objLabel(o)}: бюджет ${_fmtT(budget)} ₸, сметы ${_fmtT(estSum)} ₸ (разница ${_fmtT(diff)} ₸)`, nav:{ object:o.id, tab:"finance" } });
  }
  // 15. Платежи с номером договора, которому не соответствует ни проект, ни договор
  const knownCN = new Set();
  for (const fp of finProjects) if (fp.contractNo) knownCN.add(normCN(fp.contractNo));
  for (const c of contracts) if (c.number) knownCN.add(normCN(c.number));
  const orphanPay = {};
  for (const t of financeTx) { const cn=normCN(t.contractNo); if (!cn || knownCN.has(cn)) continue; (orphanPay[cn]||(orphanPay[cn]={n:0,sum:0,sample:t})).n++; orphanPay[cn].sum+=(Number(t.amount)||0); }
  for (const cn of Object.keys(orphanPay)) { const g=orphanPay[cn]; out.push({ id:`pay-orphan:${cn}`, group:"Финансы", sev:"yellow", scope:"check", dismissable:false,
    title:`Платежи без проекта/договора (№${g.sample.contractNo})`, detail:`${g.n} операций на ${_fmtT(g.sum)} ₸ — номер договора не найден`, nav:{ screen:"finance", tab:"ops" } }); }
  // 16. Клиенты без имени или телефона
  for (const c of clients) { if ((c.name||"").trim() && (c.phone||"").trim()) continue; out.push({ id:`client-incomplete:${c.id}`, group:"Клиенты", sev:"yellow", scope:"check", dismissable:false,
    title:"Клиент без имени или телефона", detail:`${c.name||"(без имени)"}${c.phone?"":" · нет телефона"}`, nav:{ screen:"admin", tab:"clients" } }); }
  // 17. Публичная ссылка клиента без срока действия
  for (const o of objects) { if (o.progressShared && o.progressToken && !o.progressExpiresAt) out.push({ id:`link-noexp:${o.id}`, group:"Данные", sev:"yellow", scope:"check", dismissable:false,
    title:"Публичная ссылка без срока действия", detail:`${_objLabel(o)} — доступ клиента открыт бессрочно (нет 60-дневного лимита)`, nav:{ object:o.id, tab:"info" } }); }
  // 18-бис. ГАРАНТИЯ. Договор обещает устранить дефект за 3 рабочих дня, а сданный
  // объект до сих пор просто исчезал из системы. Считаем срок от факт-даты сдачи —
  // ничего не храним и не мигрируем.
  for (const o of objects) {
    const p = prodByObj[o.id];
    if (!p) continue;
    const w = warrantyState(p, { now });
    if (w.status === "none") continue;
    const claims = summarizeWarrantyClaims(p.warrantyClaims, { now });
    // Просроченное обращение — красное и не скрывается: это прямое нарушение договора.
    for (const c of claims.overdueList) {
      out.push({ id:`warranty-sla:${o.id}:${c.id}`, group:"Гарантия", sev:"red", scope:"today", dismissable:false,
        title:"Гарантийное обращение просрочено",
        detail:`${_objLabel(o)} · «${String(c.text||"без описания").slice(0,60)}» — обещали 3 рабочих дня`,
        nav:{ object:o.id, tab:"handover" } });
    }
    // Открытые в срок — тоже показываем, но мягко.
    const inTime = claims.open - claims.overdue;
    if (inTime > 0) out.push({ id:`warranty-open:${o.id}`, group:"Гарантия", sev:"yellow", scope:"today", dismissable:true,
      title:`Гарантийных обращений в работе: ${inTime}`, detail:_objLabel(o), nav:{ object:o.id, tab:"handover" } });
    // Гарантия заканчивается — это не проблема, а повод позвонить клиенту.
    if (w.status === "active" && w.daysLeft <= 30) out.push({ id:`warranty-ends:${o.id}`, group:"Гарантия", sev:"yellow", scope:"today", dismissable:true,
      title:`Гарантия заканчивается через ${w.daysLeft} дн`,
      detail:`${_objLabel(o)} · до ${new Date(w.until).toLocaleDateString("ru-RU", { timeZone: "UTC" })}`,
      nav:{ object:o.id, tab:"handover" } });
  }
  // 18. Работы закончились, а кабинет клиента открыт. Расторгли договор или убрали объект
  // в архив — а клиент до конца 60 дней продолжает видеть этапы, прогресс и историю оплат.
  // Само по себе это не чинится: срок ссылки на статус объекта никак не завязан.
  for (const o of objects) {
    if (!o.progressShared || !o.progressToken) continue;
    if (o.progressExpiresAt && Date.now() > o.progressExpiresAt) continue;  // уже протухла
    const s = st(o);
    if (!["cancel", "refuse", "archive"].includes(s)) continue;
    const why = s === "cancel" ? "договор расторгнут" : s === "refuse" ? "клиент отказался" : "объект в архиве";
    out.push({ id:`share-after-end:${o.id}`, group:"Клиенты", sev:"red", scope:"today", dismissable:true,
      title:"Кабинет клиента открыт после закрытия объекта",
      detail:`${_objLabel(o)} — ${why}, а клиент всё ещё видит этапы и оплаты`,
      nav:{ object:o.id, tab:"info" } });
  }

  return out;
}

// ── КАЛЕНДАРЬ ПРОИЗВОДСТВА: плоский список этапов для таймлайна ──
// Разворачивает все этапы всех объектов в единый список для календаря/гантта.
// Read-only, чистая, тестируемая. Берёт плановые даты (fallback на фактические).
// Каждый элемент: { objId, objLabel, stageId, name, cat, responsible, status,
//   start(ms), end(ms), overdue }. Этапы без дат пропускаются (нечего размещать).
export function buildCalendarStages(objects = [], productions = [], opts = {}) {
  const now = opts.now || Date.now();
  const today = _dayStartTs(now);
  const objById = {}; for (const o of (objects||[])) if (o && !o.deletedAt) objById[o.id] = o;
  const out = [];
  for (const p of (productions||[])) {
    if (!p || String(p.objectId).startsWith("fp:")) continue;
    const o = objById[p.objectId]; if (!o) continue;
    // Статус единый: карточка производства перевешивает поле объекта (как на экране).
    if (["archive","refuse","cancel"].includes(objectStatusOf(o, p))) continue;
    for (const s of (p.stages||[])) {
      if (!s) continue;
      const startRaw = s.planStart || s.factStart || s.planEnd || s.factEnd;
      const endRaw   = s.planEnd || s.factEnd || s.planStart || s.factStart;
      const start = _dayStartTs(startRaw), end = _dayStartTs(endRaw);
      if (!start && !end) continue; // нет дат — не размещаем
      const st = start || end, en = Math.max(start, end) || start;
      const status = s.status || "todo";
      out.push({
        objId: o.id, objLabel: _objLabel(o), stageId: s.id || s.name,
        name: s.manualName || s.name || "Этап", cat: s.cat || "Работы",
        responsible: (s.responsible || p.responsible || "").trim(),
        status, start: st, end: en,
        overdue: status !== "done" && en > 0 && en < today,
      });
    }
  }
  return out.sort((a,b) => a.start - b.start);
}

// Загрузка прораба/бригады: для каждого ответственного — максимум одновременно идущих
// (не завершённых) этапов в любой день окна. overloaded, если пик ≥ порога (по умолчанию 3).
// Показывает узкие места: один прораб назначен на слишком много объектов одновременно.
export function foremanLoad(calStages = [], opts = {}) {
  const threshold = opts.threshold || 3;
  const DAY = 864e5;
  const byResp = {};
  for (const s of calStages) {
    if (s.status === "done") continue;
    const r = s.responsible || "— без прораба —";
    (byResp[r] || (byResp[r] = [])).push(s);
  }
  const res = {};
  for (const r of Object.keys(byResp)) {
    const arr = byResp[r];
    let peak = 0;
    // Перебираем дни от min start до max end, считаем пересечения
    let minD = Infinity, maxD = -Infinity;
    for (const s of arr) { if (s.start && s.start<minD) minD=s.start; if (s.end && s.end>maxD) maxD=s.end; }
    if (!isFinite(minD) || !isFinite(maxD)) { res[r] = { count: arr.length, peak: arr.length, overloaded: arr.length>=threshold }; continue; }
    for (let d = minD; d <= maxD; d += DAY) {
      let c = 0;
      for (const s of arr) { if (s.start <= d && d <= s.end) c++; }
      if (c > peak) peak = c;
    }
    res[r] = { count: arr.length, peak, overloaded: peak >= threshold };
  }
  return res;
}

// ── Классификация облачного чтения для ПОЛНОГО БЭКАПА ──
// Бэкап читает только из Firebase (getCloudResult). Здесь — чистая классификация ответа:
//  found + валидный JSON-массив → ok (данные);
//  empty → ok (раздела реально нет — это не ошибка);
//  found, но битый JSON или не массив → НЕ ok (порча данных — это ошибка раздела, не «пусто»);
//  unavailable / found без value → НЕ ok (база не ответила — файл нельзя звать полным).
export function classifyCloudArr(r) {
  if (!r) return { list: [], ok: false };
  if (r.status === "empty") return { list: [], ok: true };
  if (r.status === "found" && r.value != null) {
    try { const p = JSON.parse(r.value); return Array.isArray(p) ? { list: p, ok: true } : { list: [], ok: false }; }
    catch { return { list: [], ok: false }; }
  }
  return { list: [], ok: false };
}
// То же для НЕ-массивов (настройки/каталог/цены). Валидным считаем ТОЛЬКО обычный объект —
// массив/число/строка вместо настроек = порча, а не корректное значение (иначе восстановление
// могло бы записать мусор в каталог/цены/настройки).
export function classifyCloudObj(r) {
  if (!r) return { value: null, ok: false };
  if (r.status === "empty") return { value: null, ok: true };
  if (r.status === "found" && r.value != null) {
    try {
      const p = JSON.parse(r.value);
      if (p === null) return { value: null, ok: true }; // литеральный null = «настроек нет» (так пишется очищенный раздел), не порча
      const isPlainObj = typeof p === "object" && !Array.isArray(p);
      return isPlainObj ? { value: p, ok: true } : { value: null, ok: false };
    } catch { return { value: null, ok: false }; }
  }
  return { value: null, ok: false };
}

// Firebase RTDB SDK при потере сети может вернуть ЛОКАЛЬНЫЙ кеш, причём runTransaction способен
// временно положить туда "[]". Поэтому ни empty, ни found от SDK нельзя использовать там, где
// требуется АВТОРИТЕТНОЕ состояние сервера (конфликты, полный бэкап, восстановление).
// Подтверждённым считается только прямой успешный REST-ответ Firebase.
export function resolveVerifiedCloudRead(restResult) {
  if (restResult && restResult.ok) {
    return {
      status: restResult.value === null ? "empty" : "found",
      value: restResult.value ?? null,
      source: "firebase",
    };
  }
  return { status: "unavailable", value: null, source: "firebase" };
}
// Решение по ПРЕД-БЭКАПУ раздела перед восстановлением (чистая логика для тестов).
// Возвращает { action:"skip"|"proceed", backups }:
//  - текущее значение раздела недоступно (unavailable) → skip (не знаем, что затираем);
//  - список пред-бэкапов (bkey) недоступен/битый/не массив → skip (не сможем безопасно откатить);
//  - иначе proceed с массивом бэкапов (пустой, если раздела-бэкапов ещё нет).
export function preBackupDecision(curResult, bkeyResult) {
  if (!curResult || curResult.status === "unavailable") return { action: "skip", backups: [] };
  // раздела ещё нет в облаке (empty) — бэкапить нечего, но перезапись безопасна
  if (curResult.status === "empty" || !curResult.value) return { action: "proceed", backups: [] };
  // есть текущее значение → нужен валидный список пред-бэкапов, иначе не рискуем
  if (!bkeyResult || bkeyResult.status === "unavailable") return { action: "skip", backups: [] };
  if (bkeyResult.status === "empty" || !bkeyResult.value) return { action: "proceed", backups: [] };
  try {
    const arr = JSON.parse(bkeyResult.value);
    if (!Array.isArray(arr)) return { action: "skip", backups: [] };
    return { action: "proceed", backups: arr };
  } catch { return { action: "skip", backups: [] }; }
}

// Безопасное объединение журнала аудита при восстановлении: добавляем записи из бэкапа,
// которых нет в текущем (по сигнатуре), НИЧЕГО не удаляем, сортируем по времени.
// Возвращает { merged: [...], added: N }. Чистая функция — покрыта тестами.
export function mergeAuditEntries(current = [], backup = []) {
  const sig = e => [e?.ts, e?.userId, e?.entity, e?.entityId, e?.field, e?.action].join("|");
  const out = Array.isArray(current) ? [...current] : [];
  const seen = new Set(out.map(sig));
  let added = 0;
  for (const e of (Array.isArray(backup) ? backup : [])) {
    const s = sig(e);
    if (!seen.has(s)) { out.push(e); seen.add(s); added++; }
  }
  out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return { merged: out, added };
}

// Валидация СТРУКТУРЫ файла бэкапа ДО первой записи в Firebase. Валидный JSON может иметь
// неверную форму (массив вместо цен, строка вместо каталога, кривые публичные ноды) ИЛИ
// битые элементы внутри списков (null/строки/числа, объекты без id) — без этой проверки
// восстановление записало бы мусор в раздел. При любой ошибке возвращает { ok:false, error }
// и восстановление должно быть ПОЛНОСТЬЮ отменено.
// arraySpecs — [{ key, idKey }] : какие разделы — списки и по какому полю у них идентификатор
// (для большинства "id", для производства — "objectId").
export function validateBackupSchema(snap, arraySpecs = []) {
  const isPlain = v => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isPlain(snap)) return { ok: false, error: "файл не является объектом бэкапа" };
  if (snap._type !== "titovstroy-backup") return { ok: false, error: "это не файл бэкапа TitovStroy" };
  const d = snap.data;
  if (!isPlain(d)) return { ok: false, error: "data не является объектом" };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  for (const spec of arraySpecs) {
    const key = spec.key, idKey = spec.idKey === false ? null : (spec.idKey || "id");
    if (!has(d, key)) continue;
    const arr = d[key];
    if (!Array.isArray(arr)) return { ok: false, error: `раздел «${key}» должен быть массивом` };
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!isPlain(it)) return { ok: false, error: `раздел «${key}»: элемент #${i} не является объектом (null/строка/число не допускаются)` };
      if (idKey && (it[idKey] == null || it[idKey] === "")) return { ok: false, error: `раздел «${key}»: элемент #${i} без «${idKey}»` };
      const itemError = typeof spec.itemValidator === "function" ? spec.itemValidator(it, i) : null;
      if (itemError) return { ok: false, error: `раздел «${key}»: ${itemError}` };
    }
  }
  for (const k of ["financeMeta", "catalog", "prices", "rolePermissions"]) {
    if (has(d, k) && !(d[k] === null || isPlain(d[k]))) return { ok: false, error: `«${k}» должен быть объектом или пустым` };
  }
  if (has(d, "publicNodes")) {
    const pn = d.publicNodes;
    if (!isPlain(pn)) return { ok: false, error: "publicNodes должен быть объектом" };
    for (const sub of ["kp", "progress", "docs"]) {
      if (has(pn, sub)) {
        if (!isPlain(pn[sub])) return { ok: false, error: `publicNodes.${sub} должен быть объектом` };
        for (const val of Object.values(pn[sub])) if (!isPlain(val)) return { ok: false, error: `значение в publicNodes.${sub} должно быть объектом` };
      }
    }
  }
  if (has(d, "audit")) {
    const a = d.audit;
    if (!isPlain(a)) return { ok: false, error: "audit должен быть объектом" };
    if (has(a, "index")) {
      if (!Array.isArray(a.index)) return { ok: false, error: "audit.index должен быть массивом" };
      for (const ym of a.index) if (typeof ym !== "string" || !/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: `audit.index: неверный месяц «${ym}»` };
    }
    // Запись журнала: объект хотя бы с ts и (action или entity). Мусор в списках отсекаем.
    const badEntry = (list, label) => {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!isPlain(e)) return `${label}: запись #${i} не объект`;
        if (e.ts == null || (e.action == null && e.entity == null)) return `${label}: запись #${i} без ts/action/entity`;
      }
      return null;
    };
    if (has(a, "legacy")) { if (!Array.isArray(a.legacy)) return { ok: false, error: "audit.legacy должен быть массивом" }; const er = badEntry(a.legacy, "audit.legacy"); if (er) return { ok: false, error: er }; }
    if (has(a, "months")) {
      if (!isPlain(a.months)) return { ok: false, error: "audit.months должен быть объектом" };
      for (const [ym, entries] of Object.entries(a.months)) {
        if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: `неверный ключ месяца журнала: ${ym}` };
        if (!Array.isArray(entries)) return { ok: false, error: `audit.months[${ym}] должен быть массивом` };
        const er = badEntry(entries, `audit.months[${ym}]`); if (er) return { ok: false, error: er };
      }
    }
  }
  return { ok: true };
}

// Можно ли использовать файл для МАССОВОГО «Восстановить всё». Неполный бэкап (какой-то раздел
// не прочитался из Firebase и лежит в файле ПУСТЫМ) при массовом restore затёр бы рабочий раздел
// пустотой — поэтому такие файлы для «Восстановить всё» запрещены (годятся лишь для ручного
// точечного разбора). Требуем подтверждённую полноту: verifiedFromFirebase===true И пустой _incomplete.
export function isBackupRestorable(snap) {
  if (!snap || typeof snap !== "object") return { ok: false, reason: "файл не распознан" };
  if (snap.verifiedFromFirebase !== true) return { ok: false, reason: "полнота файла не подтверждена (verifiedFromFirebase ≠ true) — возможно, часть разделов не читалась из Firebase" };
  if (Array.isArray(snap._incomplete) && snap._incomplete.length) return { ok: false, reason: "файл помечен как НЕПОЛНЫЙ: " + snap._incomplete.join(", ") };
  return { ok: true };
}

// ── ВЛАДЕНИЕ DIRTY-ЗАПИСЯМИ (несинхронизированные локальные правки) ──
// Маркер __dirty хранит владельца: { ts, uid, tab }. Раньше это был просто timestamp — при
// выходе «с потерей» нельзя было отличить свою правку от правки ДРУГОЙ ВКЛАДКИ, а снятая метка
// оставляла само значение в localStorage/_mem, и следующий пользователь получал чужую смету
// (свежая локальная копия выигрывает в getResult). Теперь: выход трогает ТОЛЬКО свои записи
// (uid+tab) и удаляет их ПОЛНОСТЬЮ (значение + __wts + __dirty + _mem).
export function makeDirtyMarker(uid, tab) {
  return JSON.stringify({ ts: Date.now(), uid: uid == null ? null : uid, tab: tab || "" });
}
// Своя ли dirty-запись — СТРОГО по маркеру {uid, tab}. Legacy-маркер (голый timestamp старых
// версий) — владелец НЕИЗВЕСТЕН → НЕ своя: его нельзя ни авто-отправить под первым вошедшим,
// ни удалить по чужому «выйти с потерей». Legacy остаётся в карантине до ручной выгрузки.
export function isOwnDirtyMarker(raw, uid, tab) {
  if (!raw) return false;
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m !== "object") return false; // legacy: число-timestamp — владелец неизвестен
    if (m.tab !== tab) return false;               // правка другой вкладки — не наша
    return m.uid == null || m.uid === uid;         // без uid (запись до логина) — вкладка решает
  } catch { return false; } // legacy: не-JSON — владелец неизвестен
}
// Список БАЗОВЫХ ключей dirty-записей, принадлежащих (uid, tab). store — localStorage-совместимый.
export function listOwnedDirty(store, uid, tab, dirtySuffix = "__dirty") {
  const out = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k || !k.endsWith(dirtySuffix)) continue;
      if (isOwnDirtyMarker(store.getItem(k), uid, tab)) out.push(k.slice(0, -dirtySuffix.length));
    }
  } catch { /* хранилище недоступно — нечего перечислять */ }
  return out;
}
// После аварийного закрытия вкладки её structured dirty-маркеры остаются с прежним tab.
// Новая вкладка может принять их ТОЛЬКО после получения эксклюзивного editor-lock и только для
// ТОГО ЖЕ uid. Чужой uid, uid:null и legacy не трогаются.
export function adoptUserDirty(store, uid, newTab, dirtySuffix = "__dirty", adoptedAt = Date.now()) {
  const adopted = [];
  if (uid == null || !newTab) return adopted;
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || !key.endsWith(dirtySuffix)) continue;
      let marker;
      try { marker = JSON.parse(store.getItem(key)); } catch { continue; }
      if (!marker || typeof marker !== "object" || marker.uid !== uid || !marker.tab || marker.tab === newTab) continue;
      store.setItem(key, JSON.stringify({ ...marker, tab: newTab, adoptedAt }));
      adopted.push(key.slice(0, -dirtySuffix.length));
    }
  } catch {
    return adopted;
  }
  return adopted;
}
// ПОДТВЕРЖДЁННАЯ потеря при выходе: удалить свои dirty-записи ЦЕЛИКОМ — метку, значение,
// таймстемп записи (__wts) и копию в памяти (mem). Чужие вкладки/пользователи не затрагиваются.
// Возвращает список удалённых базовых ключей.
export function discardOwnedDirty(store, uid, tab, mem, suffixes = { dirty: "__dirty", ts: "__wts" }) {
  const owned = listOwnedDirty(store, uid, tab, suffixes.dirty);
  for (const base of owned) {
    try {
      store.removeItem(base + suffixes.dirty);
      store.removeItem(base);
      store.removeItem(base + suffixes.ts);
    } catch { /* удаляем сколько можем */ }
    if (mem) delete mem[base];
  }
  return owned;
}

// Удаляет локальное зеркало после подтвержденной записи в облако. localStorage нужен как
// durable-буфер только ПОКА запись не подтверждена; хранить там вечную полную копию каждого
// рабочего списка нельзя — несколько больших разделов и истории бэкапов быстро выбивают квоту.
// Чужой dirty-маркер блокирует очистку: его содержимое принадлежит другой вкладке/пользователю.
export function clearSyncedLocalMirror(store, mem, base, canClearDirty, suffixes = { dirty: "__dirty", ts: "__wts" }) {
  let marker = null;
  try { marker = store.getItem(base + suffixes.dirty); } catch { return false; }
  if (marker && !(canClearDirty && canClearDirty(marker))) return false;
  try {
    store.removeItem(base);
    store.removeItem(base + suffixes.ts);
    if (marker) store.removeItem(base + suffixes.dirty);
  } catch { return false; }
  if (mem) delete mem[base];
  return true;
}

// Одноразовая/периодическая уборка старых зеркал, оставленных предыдущими версиями.
// Рабочий ключ удаляем только при наличии __wts и отсутствии dirty. Технические *-backups
// всегда можно убрать локально: их каноническая история находится в Firebase, это не черновики.
// Durable production-draft/retry и служебные настройки без __wts функция не затрагивает.
export function compactLocalStorageMirrors(store, mem, suffixes = { dirty: "__dirty", ts: "__wts" }) {
  const keys = [];
  try { for (let i = 0; i < store.length; i++) keys.push(store.key(i)); } catch { return { removed: [], preservedDirty: [] }; }
  const bases = new Set();
  for (const key of keys) {
    if (!key) continue;
    if (key.endsWith(suffixes.ts)) bases.add(key.slice(0, -suffixes.ts.length));
    if (/^titovstroy-.*-backups$/.test(key)) bases.add(key);
  }
  const removed = [], preservedDirty = [];
  for (const base of bases) {
    const technicalBackup = /^titovstroy-.*-backups$/.test(base);
    let marker = null;
    try { marker = store.getItem(base + suffixes.dirty); } catch { continue; }
    if (marker && !technicalBackup) { preservedDirty.push(base); continue; }
    try {
      store.removeItem(base);
      store.removeItem(base + suffixes.ts);
      if (technicalBackup) store.removeItem(base + suffixes.dirty);
      if (mem) delete mem[base];
      removed.push(base);
    } catch { /* следующий вход попробует снова */ }
  }
  return { removed, preservedDirty };
}

// Legacy-маркер (голый timestamp/не-JSON из версий до владения) — владелец НЕИЗВЕСТЕН.
export function isLegacyDirtyMarker(raw) {
  if (!raw) return false;
  try { const m = JSON.parse(raw); return !(m && typeof m === "object"); } catch { return true; }
}
// Ключи к АВТООТПРАВКЕ (flushDirty/«Повторить сейчас»): ТОЛЬКО свои (uid+tab) и НЕ legacy.
// Legacy — в карантине: неизвестно чью правку нельзя автоматически отправлять под первым
// вошедшим пользователем (владелец удалит её явно через «выход с потерей» или разберёт вручную).
export function listFlushableDirty(store, uid, tab, dirtySuffix = "__dirty") {
  return listOwnedDirty(store, uid, tab, dirtySuffix)
    .filter(base => !isLegacyDirtyMarker(store.getItem(base + dirtySuffix)));
}
// Для UI ошибки показываем только ЗАВЕРШИВШИЕСЯ неудачей записи. storage.set сначала
// сохраняет durable-копию и ставит dirty-маркер, затем ждёт Firebase/REST. Пока запрос
// действительно выполняется, такой marker означает "в процессе", а не "облако упало".
// Иначе минутный heartbeat присутствия давал мигающий аварийный баннер при нормальной сети.
export function visibleDirtyKeys(keys, inFlight) {
  const list = Array.isArray(keys) ? keys : [];
  const has = inFlight && typeof inFlight.has === "function"
    ? key => inFlight.has(key)
    : () => false;
  return list.filter(key => !has(key));
}

// Единые предустановки перехода из финансового дашборда в список операций.
// Важно держать их вне JSX: цифра на карточке и открытый по ней список должны
// строиться по одной и той же классификации.
export function matchesFinanceOperationsPreset(tx, preset) {
  if (!preset) return true;
  const type = tx?.type || "";
  const category = tx?.category || "";
  const subcategory = tx?.subcategory || "";
  const revenue = type === "income"
    && !tx?.isAdvance
    && category !== "Финансирование (не выручка)"
    && category !== "Возврат займов и активов";
  const pnlExpense = type === "expense"
    && subcategory !== "Дивиденды учредителям"
    && category !== "Финансовая деятельность (не расход)"
    && category !== "Выданные займы и прочие активы";

  if (preset === "revenue") return revenue;
  if (preset === "cogs") return type === "expense" && category === "Прямые расходы (COGS / себестоимость)";
  if (preset === "gross") return revenue || (type === "expense" && category === "Прямые расходы (COGS / себестоимость)");
  if (preset === "pnl-expense") return pnlExpense;
  if (preset === "net-profit") return revenue || pnlExpense;
  if (preset === "dividends") return type === "expense" && subcategory === "Дивиденды учредителям";
  if (preset === "cash-in") return type === "income";
  if (preset === "cash-out") return type === "expense";
  if (preset === "cash-flow") return type === "income" || type === "expense";
  return true;
}

export function summarizeFinanceOperations(list) {
  const result = { income:0, expense:0, transfer:0, net:0, counted:0, excluded:0 };
  for (const tx of Array.isArray(list) ? list : []) {
    if (!tx || tx.deletedAt) continue;
    if (tx.included === false) { result.excluded += 1; continue; }
    const amount = Number(tx.amount) || 0;
    result.counted += 1;
    if (tx.type === "income") result.income += amount;
    else if (tx.type === "expense") result.expense += amount;
    else if (tx.type === "transfer") result.transfer += amount;
  }
  result.net = result.income - result.expense;
  return result;
}
// Можно ли УСПЕШНОЙ облачной записи этой вкладки снять dirty-метку ключа: свою или
// отсутствующую — да. Legacy НЕ снимаем: обычное чтение намеренно не примешивает его локальную
// копию, поэтому новая облачная запись не доказывает, что неизвестная старая правка сохранена.
// Метку ДРУГОЙ вкладки/пользователя НЕ снимаем: её правка ещё НЕ в облаке — поздний успешный
// ответ одной вкладки не должен гасить несинхронизированность другой.
export function mayClearDirtyOnSuccess(raw, uid, tab) {
  return !raw || isOwnDirtyMarker(raw, uid, tab);
}

// ── LEASE-LOCK «ОДНА ВКЛАДКА РЕДАКТИРУЕТ» ──
// Общий localStorage[key] на раздел не позволяет двум вкладкам безопасно редактировать
// одновременно (вторая затирает черновик первой). Вместо переделки всего storage на per-tab
// черновики: редактирует ТОЛЬКО вкладка-владелец lease ({uid, tab, token, heartbeatAt} в
// localStorage), остальные — строго read-only. Heartbeat каждые 5с, протухание 30с.
export const EDIT_LEASE_KEY = "titovstroy-edit-lease";
export const LEASE_TTL_MS = 30000;
export const LEASE_HEARTBEAT_MS = 5000;
export function makeLease(uid, tab, now, token = "") {
  return JSON.stringify({ uid: uid == null ? null : uid, tab: tab || "", token: token || "", heartbeatAt: now });
}
export function parseLease(raw) {
  if (!raw) return null;
  try {
    const l = JSON.parse(raw);
    if (!l || typeof l !== "object" || !l.tab || !Number(l.heartbeatAt)) return null;
    return l;
  } catch { return null; }
}
export function leaseAlive(lease, now) {
  return !!(lease && Number(lease.heartbeatAt) > 0 && (now - Number(lease.heartbeatAt)) < LEASE_TTL_MS);
}
// Свободный lease означает только «можно ПОПРОБОВАТЬ захватить», но не право записи.
export function canAcquireLease(raw, now) {
  const l = parseLease(raw);
  return !l || !leaseAlive(l, now);
}
// Право записи есть ТОЛЬКО у владельца живого lease с тем же fencing-token.
export function ownsActiveLease(raw, uid, tab, token, now) {
  const l = parseLease(raw);
  return !!(l && leaseAlive(l, now) && l.uid === (uid == null ? null : uid) && l.tab === tab && l.token === token);
}
export function canWriteLease(raw, uid, tab, token, now) {
  const l = parseLease(raw);
  if (ownsActiveLease(raw, uid, tab, token, now)) return { ok: true, reason: "own" };
  return {
    ok: false,
    reason: l && leaseAlive(l, now) ? "read-only-tab" : "lease-required",
    holder: l ? { uid: l.uid, tab: l.tab } : null,
  };
}
// Разрешён ли ЯВНЫЙ перехват: только если lease отсутствует или ПРОТУХ (владелец действительно
// недоступен). Живой lease перехватывать нельзя — сначала закрыть ту вкладку (или дождаться TTL).
export function mayTakeoverLease(raw, now) {
  return canAcquireLease(raw, now);
}
export async function claimFallbackLease(store, uid, tab, token, opts = {}) {
  const now = opts.now || (() => Date.now());
  const wait = opts.wait || (ms => new Promise(r => setTimeout(r, ms)));
  const raw = store.getItem(EDIT_LEASE_KEY);
  if (!canAcquireLease(raw, now())) return false;
  store.setItem(EDIT_LEASE_KEY, makeLease(uid, tab, now(), token));
  await wait(opts.verifyDelayMs == null ? 100 : opts.verifyDelayMs);
  return ownsActiveLease(store.getItem(EDIT_LEASE_KEY), uid, tab, token, now());
}

// Можно ли ИСПОЛЬЗОВАТЬ локальную копию раздела при чтении (getResult): НЕЛЬЗЯ, если на ключе
// dirty-маркер ДРУГОГО пользователя/вкладки — иначе несохранённая смета пользователя A (аварийно
// закрывшего вкладку) читалась бы пользователем B, становилась базой его сохранений и уезжала в
// облако. Действует на ВСЕ локальные источники: свежий кеш 30с, dirty-ветку, старый фоллбек, _mem.
// Legacy-маркер (владелец неизвестен) тоже запрещает обычное чтение. Его можно только выгрузить
// отдельным recovery-файлом и разобрать вручную; автоматически примешивать неизвестные данные
// к сессии первого вошедшего пользователя нельзя.
export function mayUseLocalCopy(dirtyRaw, uid, tab) {
  if (!dirtyRaw) return true;
  if (isLegacyDirtyMarker(dirtyRaw)) return false;
  return isOwnDirtyMarker(dirtyRaw, uid, tab);
}

// ── РЕЕСТР НЕСОХРАНЁННОГО ────────────────────────────────────────────────────
// Раньше отказ записи списка (read-only-вкладка, раздел не догрузился, база не ответила,
// защита «пусто поверх», облако не подтвердило) возвращал undefined и нигде не всплывал —
// отсюда «внёс операцию, вышел, зашёл, а её нет». Тексты и слияние строк держим здесь,
// чтобы их можно было проверить тестами отдельно от гигантского App.jsx.
export const SAVE_FAIL_REASONS = {
  "read-only-tab":   "сервис редактируется в другой вкладке — эта только смотрит",
  "bad-list":        "внутренняя ошибка: список повреждён",
  "not-loaded":      "раздел ещё не догрузился из облака",
  "db-unavailable":  "база не ответила при чтении — запись отменена, чтобы не затереть чужое",
  "empty-over-data": "защита: попытка записать пустой список поверх заполненного",
  "cloud-failed":    "облако не подтвердило запись",
};
export const SAVE_FAIL_LABELS = {
  "titovstroy-objects":          "Объекты",
  "titovstroy-estimates":        "Сметы",
  "titovstroy-contracts":        "Договоры",
  "titovstroy-clients":          "Клиенты",
  "titovstroy-contragents":      "Реквизиты",
  "titovstroy-deals":            "Сделки",
  "titovstroy-reports":          "Акты",
  "titovstroy-workers":          "Подрядчики",
  "titovstroy-podryads":         "Договоры подряда",
  "titovstroy-finance-tx":       "Финансовые операции",
  "titovstroy-finance-projects": "Финансовые проекты",
};
export function saveFailReasonText(reason) {
  return SAVE_FAIL_REASONS[reason] || String(reason || "неизвестная ошибка");
}
export function saveFailLabel(key) {
  return SAVE_FAIL_LABELS[key] || String(key || "").replace(/^titovstroy-/, "");
}
export const saveFailId = (key, reason) => `${key}|${reason}`;
// Добавляет отказ в список. Одна строка на пару ключ+причина: повтор той же беды не плодит
// строки, а увеличивает счётчик — иначе при недоступной базе баннер за минуту раздувается
// до сотни одинаковых сообщений и в нём нельзя ничего разобрать.
export function mergeSaveFail(list, { key, reason, ts = Date.now() }) {
  const cur = Array.isArray(list) ? list : [];
  const id = saveFailId(key, reason);
  const i = cur.findIndex(f => f && f.id === id);
  const row = { id, key, reason, ts, count: (i >= 0 ? (cur[i].count || 0) : 0) + 1, label: saveFailLabel(key) };
  return i < 0 ? [...cur, row] : cur.map(f => (f && f.id === id ? row : f));
}
// Успешная запись раздела снимает ВСЕ его строки: причина могла смениться между попытками
// (сначала «база не ответила», потом «облако не подтвердило») — иначе висел бы хвост.
export function clearSaveFailsFor(list, key) {
  const cur = Array.isArray(list) ? list : [];
  return cur.filter(f => f && f.key !== key);
}
export function saveFailIdsFor(ids, key) {
  const prefix = key + "|";
  return (ids || []).filter(id => String(id).startsWith(prefix));
}

// ── ГРАФИК РАБОТ (Гант) ──────────────────────────────────────────────────────
// Раскладка вынесена из компонента, чтобы её можно было проверить тестами: раньше
// весь расчёт жил внутри JSX и врал молча (порядок строк — как в списке этапов, а не
// по времени; работы без дат просто исчезали с графика, и на объекте из 27 этапов
// было видно 9).
//
// Шаг сетки подбираем под длину проекта: ремонт на две недели и стройка на полгода
// не могут рисоваться одной линейкой. «auto» выбирает сам, но владелец может
// переключить вручную — иногда нужно рассмотреть неделю в деталях.
export const GANTT_SCALES = [
  { key: "day",   label: "Дни",    minPx: 26 },
  { key: "week",  label: "Недели", minPx: 12 },
  { key: "month", label: "Месяцы", minPx: 4  },
];
export function pickGanttScale(spanDays, wanted = "auto") {
  if (wanted && wanted !== "auto") return wanted;
  if (spanDays <= 45) return "day";
  if (spanDays <= 210) return "week";
  return "month";
}
const _gDay = (v) => { const t = new Date(v); return isNaN(t) ? null : Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
// Понедельник недели, в которую попадает дата (в РФ/КЗ неделя начинается с понедельника).
const _gMonday = (ms) => { const d = new Date(ms); const wd = (d.getUTCDay() + 6) % 7; return ms - wd * 864e5; };

// Готовит всё, что нужно графику: диапазон, шаг, подписи шкалы и строки с координатами.
// rows — этапы производства. Возвращает и те, что БЕЗ дат: их нельзя нарисовать, но
// молчать о них нельзя тем более.
export function buildGanttLayout(rows = [], opts = {}) {
  const now = opts.now || Date.now();
  const today = _gDay(now);
  const withDates = [], undated = [];
  for (const s of rows) {
    if (!s) continue;
    const pS = _gDay(s.planStart), pE = _gDay(s.planEnd), fS = _gDay(s.factStart), fE = _gDay(s.factEnd);
    if (pS || pE || fS || fE) withDates.push({ ...s, pS, pE: pE || pS, fS, fE });
    else undated.push(s);
  }
  if (!withDates.length) return { empty: true, undated, rows: [], ticks: [], scale: "day", pxPerDay: 0, width: 0, todayX: 0, from: null, to: null };

  const all = withDates.flatMap(s => [s.pS, s.pE, s.fS, s.fE].filter(Boolean));
  let from = Math.min(...all), to = Math.max(...all);
  // «Сегодня» показываем всегда: без этого линия текущего дня уезжает за край и
  // становится непонятно, опаздываем мы или нет.
  from = Math.min(from, today); to = Math.max(to, today);
  const spanDays = Math.max(1, Math.round((to - from) / 864e5) + 1);
  const scale = pickGanttScale(spanDays, opts.scale);
  const cfg = GANTT_SCALES.find(s => s.key === scale) || GANTT_SCALES[0];
  const usable = Math.max(320, (opts.viewWidth || 900));
  const pxPerDay = Math.max(cfg.minPx / (scale === "day" ? 1 : scale === "week" ? 7 : 30), usable / spanDays);
  const width = Math.round(spanDays * pxPerDay);
  const xOf = (ms) => Math.round(((ms - from) / 864e5) * pxPerDay);

  // Подписи шкалы. День — число, неделя — «дд.мм», месяц — «авг. 26».
  const ticks = [];
  if (scale === "day") {
    for (let t = from; t <= to; t += 864e5) {
      const d = new Date(t), wd = d.getUTCDay();
      ticks.push({ x: xOf(t), label: String(d.getUTCDate()), sub: t === from || d.getUTCDate() === 1
        ? d.toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" }) : "", weekend: wd === 0 || wd === 6, ms: t });
    }
  } else if (scale === "week") {
    for (let t = _gMonday(from); t <= to; t += 7 * 864e5) {
      const d = new Date(t);
      ticks.push({ x: xOf(t), label: `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        sub: d.getUTCDate() <= 7 ? d.toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" }) : "", weekend: false, ms: t });
    }
  } else {
    const c = new Date(from); let t = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 1);
    while (t <= to) {
      const d = new Date(t);
      ticks.push({ x: xOf(t), label: d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit", timeZone: "UTC" }), sub: "", weekend: false, ms: t });
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
  }

  // Ширина полосы — минимум один день, иначе однодневная работа исчезает в ноль.
  const barOf = (a, b) => { if (!a) return null; const e = b || a; return { left: xOf(a), width: Math.max(Math.round(pxPerDay), xOf(e) - xOf(a) + Math.round(pxPerDay)) }; };
  const out = withDates.map(s => {
    const plan = barOf(s.pS, s.pE);
    const fact = s.fS ? barOf(s.fS, s.fE || today) : null;
    const overdue = s.status !== "done" && s.pE && s.pE < today;
    // Насколько факт «съел» план — для заливки внутри плановой полосы.
    let progress = null;
    if (plan && s.fS) {
      const doneTo = s.status === "done" ? (s.fE || s.fS) : Math.min(today, s.fE || today);
      progress = Math.max(0, Math.min(1, (doneTo - s.pS) / Math.max(864e5, (s.pE || s.pS) - s.pS + 864e5)));
    }
    return { ...s, plan, fact, overdue, progress,
      lateDays: overdue ? Math.round((today - s.pE) / 864e5) : 0 };
  });
  return { empty: false, undated, rows: out, ticks, scale, pxPerDay, width,
           todayX: xOf(today), from, to, spanDays };
}
// Хронологический порядок внутри блока: сначала по началу (план, иначе факт), затем по
// окончанию. Раньше строки шли в порядке списка этапов, и демонтаж оказывался ниже стяжки.
export function sortGanttRows(rows = []) {
  const key = (s) => s.pS || s.fS || Number.MAX_SAFE_INTEGER;
  const end = (s) => s.pE || s.fE || key(s);
  return [...rows].sort((a, b) => key(a) - key(b) || end(a) - end(b));
}

// ── ГАРАНТИЯ ─────────────────────────────────────────────────────────────────
// Договор даёт 12 месяцев гарантии и 3 рабочих дня на устранение дефекта, но в системе
// сданный объект просто исчезал из работы: ни срока, ни обращений, ни затрат. На боевой
// базе это 21 объект, сданный меньше года назад, про которые система не знала ничего.
//
// Срок НЕ хранится — считается от факт-даты окончания. Поэтому он появляется сам по всем
// уже сданным объектам, без единой записи в боевые данные.
export const WARRANTY_DEFAULT_MONTHS = 12;
export function warrantyUntil(factEndDate, months = WARRANTY_DEFAULT_MONTHS) {
  const t = factEndDate ? new Date(factEndDate) : null;
  if (!t || isNaN(t)) return null;
  const m = Number(months);
  const use = isFinite(m) && m > 0 ? Math.round(m) : WARRANTY_DEFAULT_MONTHS;
  // Через UTC-компоненты: 30 января + 1 месяц не должно превращаться в 2 марта.
  const y = t.getUTCFullYear(), mo = t.getUTCMonth(), d = t.getUTCDate();
  const end = new Date(Date.UTC(y, mo + use, 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), Math.min(d, lastDay));
}
// Состояние гарантии объекта. status: none (не сдан / нет даты) | active | expired.
export function warrantyState(production, opts = {}) {
  const now = opts.now || Date.now();
  // Гарантия — только у СДАННЫХ. У расторгнутого объекта факт-дата окончания тоже стоит
  // (это день, когда прекратили работы), и без этой проверки он попадал в «на гарантии»:
  // на боевой так проходила Псарева с расторгнутым договором.
  if (production?.prodStatus && production.prodStatus !== "done") return { status: "none", until: null, daysLeft: null, months: WARRANTY_DEFAULT_MONTHS };
  const factEnd = production?.factEndDate || "";
  const months = production?.warrantyMonths || opts.months || WARRANTY_DEFAULT_MONTHS;
  const until = warrantyUntil(factEnd, months);
  if (!until) return { status: "none", until: null, daysLeft: null, months };
  const daysLeft = Math.ceil((until - now) / 864e5);
  return { status: daysLeft >= 0 ? "active" : "expired", until, daysLeft, months };
}
export const WARRANTY_CLAIM_STATUSES = [
  { key: "new",      label: "Новое",       color: "#dc2626" },
  { key: "inWork",   label: "В работе",    color: "#d97706" },
  { key: "done",     label: "Устранено",   color: "#059669" },
  { key: "rejected", label: "Отклонено",   color: "#64748b" },
];
export const isOpenWarrantyClaim = (c) => !!c && !["done", "rejected"].includes(c.status || "new");
// Сводка по обращениям: сколько открыто, сколько просрочено против обещанных 3 рабочих
// дней, сколько всего потратили на устранение.
export function summarizeWarrantyClaims(claims = [], opts = {}) {
  const now = opts.now || Date.now();
  const slaDays = opts.slaDays == null ? 3 : opts.slaDays;
  const live = (claims || []).filter(c => c && !c.deletedAt);
  const open = live.filter(isOpenWarrantyClaim);
  const overdue = open.filter(c => {
    const t = Number(c.ts) || 0;
    return t > 0 && workdaysBetween(t, now) > slaDays;
  });
  const cost = live.reduce((s, c) => s + (Number(c.cost) || 0), 0);
  return { total: live.length, open: open.length, overdue: overdue.length, cost, openList: open, overdueList: overdue };
}
// Рабочие дни между датами (суббота и воскресенье не считаются) — срок в договоре
// назван именно в рабочих днях.
export function workdaysBetween(fromMs, toMs) {
  if (!fromMs || !toMs || toMs <= fromMs) return 0;
  let n = 0;
  const a = new Date(fromMs); a.setUTCHours(0, 0, 0, 0);
  const b = new Date(toMs); b.setUTCHours(0, 0, 0, 0);
  for (let t = +a + 864e5; t <= +b; t += 864e5) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
