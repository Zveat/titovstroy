import { describe, it, expect } from "vitest";
import * as utils from "./utils.js";
import { contractNoOfObject, normCN, CATALOG_DEFAULTS, withCatalogOverrides, groupData, tengeInWords, DEFAULT_FIN_META, mergeFinMeta, computeIssues, findFinanceProjectForObject, financeProjectMatchesSearch, applyWorkPricingOverride, createEstimatePricingSnapshot, resolveEstimateRowWork, sealLegacyEstimateRows, buildCalendarStages, foremanLoad, classifyCloudArr, classifyCloudObj, preBackupDecision, mergeAuditEntries, validateBackupSchema, isBackupRestorable, visibleDirtyKeys, resolveVerifiedCloudRead, isStaleApprovalObject, buildFinanceProjectView, resolveFinanceProjectBudget, sortProductionStages, moveProductionStage, financeStatusMeta, isActiveFinanceStatus, buildEstimatorDashboard, normalizeRolePermissions, permissionsForRole, accessAllows, docTypeAllows, documentPermissionKey, buildAuthorizedObjectPatch, matchesFinanceOperationsPreset, summarizeFinanceOperations, normalizeEstimateSuggestionRules, createDefaultEstimateSuggestionRules, resolveEstimateSuggestionRules, buildEstimateSuggestions } from "./utils.js";
import { documentTemplateBackupSpecs } from "./documents/documentTemplateBackup.js";

describe("поиск финансового проекта по связанному объекту", () => {
  const project = { id:"fp1", contractNo:"1019", description:"Ремонт квартиры", comment:"этап 1" };
  const object = { id:"o1", clientName:"Сергей", address:"Аманжолова 33-47", clientPhone:"+7 777 123 45 67" };
  const contract = { id:"c1", number:"№1019", customer:"Сергей Иванов" };

  it("находит один и тот же проект по имени, адресу, телефону и номеру договора", () => {
    expect(financeProjectMatchesSearch(project, "сергей", { object, contract })).toBe(true);
    expect(financeProjectMatchesSearch(project, "аманжолова", { object, contract })).toBe(true);
    expect(financeProjectMatchesSearch(project, "777123", { object, contract })).toBe(true);
    expect(financeProjectMatchesSearch(project, "1019", { object, contract })).toBe(true);
  });

  it("не подменяет связь похожим, но посторонним объектом", () => {
    expect(financeProjectMatchesSearch(project, "лариса", { object, contract })).toBe(false);
  });
});

describe("переходы с финансового дашборда в операции", () => {
  const revenue = { type:"income", amount:1000, category:"Оплата клиентов" };
  const advance = { type:"income", amount:300, isAdvance:true, category:"Оплата клиентов" };
  const financing = { type:"income", amount:5000, category:"Финансирование (не выручка)" };
  const cogs = { type:"expense", amount:400, category:"Прямые расходы (COGS / себестоимость)" };
  const opex = { type:"expense", amount:200, category:"Косвенные расходы (OPEX / операционные)" };
  const dividend = { type:"expense", amount:100, category:"Финансовые расходы", subcategory:"Дивиденды учредителям" };

  it("открывает выручку без авансов и финансирования", () => {
    expect(matchesFinanceOperationsPreset(revenue, "revenue")).toBe(true);
    expect(matchesFinanceOperationsPreset(advance, "revenue")).toBe(false);
    expect(matchesFinanceOperationsPreset(financing, "revenue")).toBe(false);
    expect(matchesFinanceOperationsPreset({ type:"income", category:"Возврат займов и активов" }, "revenue")).toBe(false);
  });

  it("для валовой прибыли показывает выручку и себестоимость, а для чистой — все P&L операции", () => {
    expect([revenue, advance, financing, cogs, opex, dividend].filter(t=>matchesFinanceOperationsPreset(t, "gross"))).toEqual([revenue, cogs]);
    expect([revenue, advance, financing, cogs, opex, dividend].filter(t=>matchesFinanceOperationsPreset(t, "net-profit"))).toEqual([revenue, cogs, opex]);
    expect(matchesFinanceOperationsPreset({ type:"expense", category:"Финансовая деятельность (не расход)" }, "net-profit")).toBe(false);
    expect(matchesFinanceOperationsPreset({ type:"expense", category:"Выданные займы и прочие активы" }, "net-profit")).toBe(false);
  });

  it("считает итоги только по учитываемым отфильтрованным операциям", () => {
    expect(summarizeFinanceOperations([
      revenue,
      cogs,
      { type:"transfer", amount:250 },
      { type:"income", amount:999, included:false },
    ])).toEqual({ income:1000, expense:400, transfer:250, net:600, counted:3, excluded:1 });
  });
});

describe("цена и себестоимость из прайса", () => {
  it("одновременно применяет новую цену и новую себестоимость", () => {
    const work = { code:"W-1", fixedPrice:1000, cost:600, margin:0.4, tiers:[] };
    expect(applyWorkPricingOverride(work, { fixedPrice:1400, cost:850 })).toMatchObject({
      fixedPrice:1400,
      cost:850,
    });
  });

  it("не обнуляет поля, которых нет в переопределении", () => {
    const work = { code:"W-1", fixedPrice:1000, cost:600, margin:0.4, tiers:[] };
    expect(applyWorkPricingOverride(work, { fixedPrice:1400 })).toMatchObject({
      fixedPrice:1400,
      cost:600,
      margin:0.4,
    });
  });

  it("снимок старой сметы не меняется после следующего обновления прайса", () => {
    const base = { code:"W-1", fixedPrice:1000, cost:600, tiers:[{ min:1, max:10, price:1000 }] };
    const atCreation = applyWorkPricingOverride(base, { fixedPrice:1400, cost:850, tiers:[{ min:1, max:10, price:1400 }] });
    const row = { qty:3, pricingSnapshot:createEstimatePricingSnapshot(atCreation) };
    const laterPrice = applyWorkPricingOverride(base, { fixedPrice:2000, cost:1200, tiers:[{ min:1, max:10, price:2000 }] });

    expect(resolveEstimateRowWork(laterPrice, row)).toMatchObject({ fixedPrice:1400, cost:850 });
    expect(resolveEstimateRowWork(laterPrice, row).tiers[0].price).toBe(1400);
  });

  it("legacy-строка без снимка использует переданную базовую цену", () => {
    const base = { code:"W-1", fixedPrice:1000, cost:600, tiers:[] };
    expect(resolveEstimateRowWork(base, { qty:2 })).toMatchObject({ fixedPrice:1000, cost:600 });
  });

  it("снимок копирует диапазоны цен и не меняется вместе с исходным прайсом", () => {
    const work = { fixedPrice:null, cost:500, tiers:[{ min:1, max:5, price:900 }] };
    const snapshot = createEstimatePricingSnapshot(work);
    work.tiers[0].price = 1700;
    expect(snapshot.tiers[0].price).toBe(900);
  });

  it("при сохранении старой заполненной сметы фиксирует базовую историческую цену", () => {
    const rows = { "W-1": { qty:2, complexity:"std" }, empty:{ qty:0 } };
    const sealed = sealLegacyEstimateRows(rows, [{ code:"W-1", fixedPrice:1000, cost:600, tiers:[] }]);
    expect(sealed["W-1"].pricingSnapshot).toMatchObject({ fixedPrice:1000, cost:600 });
    expect(sealed.empty.pricingSnapshot).toBeUndefined();
    expect(rows["W-1"].pricingSnapshot).toBeUndefined();
  });

  it("не переписывает уже сохранённый снимок старой сметы", () => {
    const rows = { "W-1": { qty:2, pricingSnapshot:{ fixedPrice:1400, cost:850, tiers:[] } } };
    const sealed = sealLegacyEstimateRows(rows, [{ code:"W-1", fixedPrice:2000, cost:1200, tiers:[] }]);
    expect(sealed).toBe(rows);
    expect(sealed["W-1"].pricingSnapshot).toMatchObject({ fixedPrice:1400, cost:850 });
  });
});

describe("матрица прав ролей", () => {
  it("руководитель продаж видит все объекты и общую аналитику без финансовых деталей", () => {
    const p = permissionsForRole({}, "sales_head");
    expect(p).toMatchObject({
      dashboard:"all",
      objects:"all",
      analytics:"all",
      finance:"none",
      financialDetails:false,
      objectFinanceSummary:false,
      objectEdit:"none",
      objectCreate:"none",
      objectDelete:"none",
      estimateExport:"all",
      analyticsExport:"all",
    });
  });

  it("замерщик видит только свои объекты и свою аналитику", () => {
    const p = permissionsForRole({}, "user");
    expect(p.objects).toBe("own");
    expect(p.analytics).toBe("own");
    expect(accessAllows(p.objects, true)).toBe(true);
    expect(accessAllows(p.objects, false)).toBe(false);
    expect(p.estimateEdit).toBe("own");
    expect(p.analyticsExport).toBe("own");
  });

  it("шаблоны по умолчанию доступны только администратору", () => {
    const admin = permissionsForRole({}, "admin");
    expect(admin).toMatchObject({
      templateView: "all",
      templateEdit: "all",
      templatePublish: "all",
      templateRollback: "all",
      templateArchive: "all",
      documentInstanceEdit: "all",
    });
    for (const role of ["manager", "sales_head", "foreman", "user", "viewer"]) {
      expect(permissionsForRole({}, role)).toMatchObject({
        templateView: "none",
        templateEdit: "none",
        templatePublish: "none",
        templateRollback: "none",
        templateArchive: "none",
        documentInstanceEdit: "none",
      });
    }
  });

  it("база мастеров видна по отдельному праву, а парсером по умолчанию управляет только администратор", () => {
    const admin = permissionsForRole({}, "admin");
    expect(admin).toMatchObject({ masters:"all", mastersManage:"all" });
    for (const role of ["manager", "sales_head", "foreman", "user", "viewer"]) {
      expect(permissionsForRole({}, role)).toMatchObject({ masters:"all", mastersManage:"none" });
    }
    const closed = permissionsForRole({ user:{ masters:"none" } }, "user");
    expect(closed.masters).toBe("none");
    expect(accessAllows(closed.masters, true)).toBe(false);
    const manager = permissionsForRole({ manager:{ mastersManage:"all" } }, "manager");
    expect(accessAllows(manager.mastersManage, true)).toBe(true);
  });

  it("сохранённые настройки накладываются на пресет, но администратора нельзя заблокировать", () => {
    const matrix = normalizeRolePermissions({
      sales_head:{ objectEdit:"all", analytics:"own" },
      admin:{ objects:"none", admin:"none", finance:"none" },
    });
    expect(matrix.sales_head.objectEdit).toBe("all");
    expect(matrix.sales_head.analytics).toBe("own");
    expect(matrix.sales_head.financialDetails).toBe(false);
    expect(matrix.manager.objectFinanceSummary).toBe(true);
    expect(matrix.foreman.objectFinanceSummary).toBe(false);
    expect(matrix.admin.objectFinanceSummary).toBe(true);
    expect(matrix.admin).toMatchObject({ objects:"all", admin:"full", finance:"edit" });
    expect(matrix.admin.adminRoles).toBe("all");
    expect(matrix.admin.adminRestore).toBe("all");
  });

  it("битые значения не проходят в рабочую матрицу", () => {
    const p = permissionsForRole({ user:{ objects:"чужое", finance:"owner" } }, "user");
    expect(p.objects).toBe("own");
    expect(p.finance).toBe("none");
    expect(p.objectDelete).toBe("own");
  });

  it("старая матрица автоматически раскладывается на детальные действия", () => {
    const p = permissionsForRole({
      user:{
        objects:"all",
        objectEdit:"own",
        estimateEdit:"none",
        productionEdit:"all",
        documentEdit:"own",
        finance:"edit",
        admin:"none",
      },
    }, "user");
    expect(p.estimates).toBe("all");
    expect(p.production).toBe("all");
    expect(p.objectStatus).toBe("own");
    expect(p.objectDelete).toBe("own");
    expect(p.estimateCreate).toBe("none");
    expect(p.productionStages).toBe("all");
    expect(p.documentCreate).toBe("own");
    expect(p.financeCreate).toBe("all");
    expect(p.financeDirectories).toBe("all");
    expect(p.adminUsers).toBe("none");
  });

  it("явное детальное право не перезаписывается старым общим правом", () => {
    const p = permissionsForRole({
      user:{ objectEdit:"all", objectDelete:"none", estimateEdit:"all", estimatePublish:"own" },
    }, "user");
    expect(p.objectDelete).toBe("none");
    expect(p.objectStatus).toBe("all");
    expect(p.estimatePublish).toBe("own");
    expect(p.estimateDelete).toBe("all");
  });

  it("категории документов по умолчанию наследуют общий доступ к разделу", () => {
    const sh = permissionsForRole({}, "sales_head"); // documents:"all"
    expect(sh.docRepair).toBe("all");
    expect(sh.docDesign).toBe("all");
    expect(sh.docPodryad).toBe("all");
    expect(sh.docAvr).toBe("all");
    const u = permissionsForRole({}, "user"); // documents:"own"
    expect(u.docPodryad).toBe("own");
    const f = permissionsForRole({}, "foreman"); // documents:"none"
    expect(f.docRepair).toBe("none");
    const a = permissionsForRole({}, "admin"); // всегда всё
    expect(a.docRepair).toBe("all");
    expect(a.docPodryad).toBe("all");
    expect(a.docAvr).toBe("all");
  });

  it("можно скрыть подряд у руководителя продаж, оставив остальные документы", () => {
    const p = permissionsForRole({ sales_head:{ docPodryad:"none" } }, "sales_head");
    expect(p.docPodryad).toBe("none");   // подряд скрыт
    expect(p.docRepair).toBe("all");     // ремонт остался (унаследован от documents)
    expect(p.docDesign).toBe("all");
    expect(p.docAvr).toBe("all");
    expect(docTypeAllows(p, "podryad")).toBe(false);
    expect(docTypeAllows(p, "podryad_annex")).toBe(false);
    expect(docTypeAllows(p, "repair_fiz")).toBe(true);
    expect(docTypeAllows(p, "avr")).toBe(true);
  });

  it("docTypeAllows относит типы к правильной категории и учитывает «свои/все»", () => {
    expect(documentPermissionKey("repair_fiz")).toBe("docRepair");
    expect(documentPermissionKey("annex")).toBe("docRepair");
    expect(documentPermissionKey("reservation")).toBe("docRepair");
    expect(documentPermissionKey("design")).toBe("docDesign");
    expect(documentPermissionKey("design_add")).toBe("docDesign");
    expect(documentPermissionKey("podryad")).toBe("docPodryad");
    expect(documentPermissionKey("podryad_annex")).toBe("docPodryad");
    expect(documentPermissionKey("avr")).toBe("docAvr");
    // «свои» — доступ только при совпадении владельца
    const u = permissionsForRole({}, "user"); // docRepair:"own"
    expect(docTypeAllows(u, "repair_fiz", true)).toBe(true);
    expect(docTypeAllows(u, "repair_fiz", false)).toBe(false);
    // защита от мусора
    expect(docTypeAllows(null, "repair_fiz", true)).toBe(false);
  });
});

describe("сохранение карточки объекта по реальным изменениям", () => {
  const saved = { id:"o1", clientName:"Анна", address:"Абая 1", manager:"Замерщик", note:"" };

  it("обычный blur без изменений не создаёт запись", () => {
    expect(buildAuthorizedObjectPatch(saved, { ...saved }, { canEdit:true, canAssign:true })).toEqual({});
  });

  it("режим просмотра не может сохранить даже изменённый локальный черновик", () => {
    expect(buildAuthorizedObjectPatch(saved, { ...saved, address:"Чужое изменение" })).toEqual({});
  });

  it("право назначения меняет только менеджера, но не остальные поля", () => {
    expect(buildAuthorizedObjectPatch(
      saved,
      { ...saved, manager:"Руководитель", address:"Новый адрес" },
      { canAssign:true },
    )).toEqual({ manager:"Руководитель" });
  });

  it("право редактирования сохраняет только фактически изменённые данные", () => {
    expect(buildAuthorizedObjectPatch(
      saved,
      { ...saved, address:"Бухар Жырау 10", note:"Позвонить" },
      { canEdit:true },
    )).toEqual({ address:"Бухар Жырау 10", note:"Позвонить" });
  });
});

describe("главная замерщика", () => {
  const user = { id:"u1", name:"Замерщик" };
  const objects = [
    { id:"o1", createdById:"u1", status:"approval", updatedAt:30 },
    { id:"o2", manager:"Замерщик", status:"signed", updatedAt:20 },
    { id:"o3", createdById:"u2", status:"new", updatedAt:40 },
    { id:"o4", createdById:"u1", status:"approval", deletedAt:1, updatedAt:50 },
  ];
  const estimates = [
    { id:"e1", objectId:"o1", createdBy:"Замерщик", total:100 },
    { id:"e2", objectId:"o2", createdById:"u2", total:200 },
    { id:"e3", objectId:"o3", createdById:"u2", total:999 },
  ];

  it("показывает только свои живые объекты и связанные с ними сметы", () => {
    const d = buildEstimatorDashboard({ objects, estimates, user });
    expect(d.ownObjects.map(o => o.id)).toEqual(["o1", "o2"]);
    expect(d.ownEstimates.map(e => e.id)).toEqual(["e1", "e2"]);
    expect(d.objectCount).toBe(2);
    expect(d.estimateCount).toBe(2);
    expect(d.estimateTotal).toBe(300);
  });

  it("учитывает единый производственный статус и сортирует недавние объекты", () => {
    const d = buildEstimatorDashboard({
      objects,
      estimates,
      productions:[{ objectId:"o1", prodStatus:"active" }],
      user,
    });
    expect(d.statusOf(objects[0])).toBe("work");
    expect(d.approvalCount).toBe(0);
    expect(d.signedCount).toBe(2);
    expect(d.recentObjects.map(o => o.id)).toEqual(["o1", "o2"]);
  });

  it("считает месячные показатели и пайплайн только по объектам замерщика", () => {
    const now = new Date("2026-07-18T12:00:00Z").getTime();
    const d = buildEstimatorDashboard({
      now,
      user,
      objects:[
        { id:"july-own", createdById:"u1", status:"approval", createdAt:new Date("2026-07-05T00:00:00Z").getTime() },
        { id:"june-own", createdById:"u1", status:"approval", createdAt:new Date("2026-06-30T00:00:00Z").getTime() },
        { id:"july-other", createdById:"u2", status:"approval", createdAt:new Date("2026-07-06T00:00:00Z").getTime() },
      ],
      estimates:[
        { id:"own-july-est", objectId:"july-own", total:150 },
        { id:"own-june-est", objectId:"june-own", total:250 },
        { id:"other-est", objectId:"july-other", total:999 },
      ],
    });
    expect(d.ownObjects.map(o => o.id)).toEqual(["july-own", "june-own"]);
    expect(d.monthObjectCount).toBe(1);
    expect(d.monthEstimateTotal).toBe(150);
    expect(d.pipelineTotal).toBe(400);
  });
});

describe("объекты без движения и единый источник данных финпроекта", () => {
  it("заменяет старый импортный бюджет суммой всех актуальных смет связанного объекта", () => {
    const result = resolveFinanceProjectBudget({
      project:{ budget:333, objectId:"o1" },
      object:{ id:"o1" },
      estimates:[
        { id:"e1", objectId:"o1", total:2_000_000 },
        { id:"e2", objectId:"o1", total:436_000 },
        { id:"other", objectId:"o2", total:9_999_999 },
      ],
      contractTotal:2_436_000,
    });
    expect(result).toEqual({ budget:2_436_000, source:"estimates", estimateCount:2 });
  });

  it("после удаления допсметы немедленно пересчитывает сумму, не сохраняя старый итог", () => {
    const base = { project:{ budget:2_436_000 }, object:{ id:"o1" }, contractTotal:2_000_000 };
    expect(resolveFinanceProjectBudget({ ...base, estimates:[{ id:"e1", objectId:"o1", total:2_000_000 }, { id:"e2", objectId:"o1", total:436_000 }] }).budget).toBe(2_436_000);
    expect(resolveFinanceProjectBudget({ ...base, estimates:[{ id:"e1", objectId:"o1", total:2_000_000 }, { id:"e2", objectId:"o1", total:436_000, deletedAt:1 }] }).budget).toBe(2_000_000);
  });

  it("учитывает старые дополнительные сметы, связанные через parentId", () => {
    expect(resolveFinanceProjectBudget({
      project:{ budget:333 },
      object:{ id:"o1" },
      estimates:[
        { id:"main", objectId:"o1", total:2_000_000 },
        { id:"extra", parentId:"main", total:436_000 },
      ],
    })).toMatchObject({ budget:2_436_000, estimateCount:2 });
  });

  it("использует договор без смет и legacy-сумму только без актуальных данных объекта", () => {
    expect(resolveFinanceProjectBudget({ project:{ budget:333 }, object:{ id:"o1" }, estimates:[], contractTotal:2_436_000 })).toMatchObject({ budget:2_436_000, source:"contracts" });
    expect(resolveFinanceProjectBudget({ project:{ budget:333 } })).toMatchObject({ budget:333, source:"legacy" });
  });

  it("не меняет схему расчёта существующих объектов без версии", () => {
    expect(resolveFinanceProjectBudget({
      project:{ budget:333 }, object:{ id:"o1" },
      estimates:[{ id:"e1", objectId:"o1", total:2_000_000 }], contractTotal:2_436_000,
    })).toMatchObject({ budget:2_000_000, source:"estimates" });
  });

  it("для новых objects contracts-v2 считает бюджет только по договорам", () => {
    expect(resolveFinanceProjectBudget({
      project:{ budget:333 }, object:{ id:"o1", financeCalcMode:"contracts-v2" },
      estimates:[{ id:"e1", objectId:"o1", total:9_999_999 }], contractTotal:2_436_000,
    })).toMatchObject({ budget:2_436_000, source:"contracts-v2", calcMode:"contracts-v2" });
  });

  it("для contracts-v2 без договора не подставляет смету или старый budget", () => {
    expect(resolveFinanceProjectBudget({
      project:{ budget:333 }, object:{ id:"o1", financeCalcMode:"contracts-v2" },
      estimates:[{ id:"e1", objectId:"o1", total:9_999_999 }], contractTotal:0,
    })).toMatchObject({ budget:0, source:"contracts-v2" });
  });

  it("считает зависшим только живой объект на согласовании без движения 14+ дней", () => {
    const now = new Date("2026-07-18T00:00:00Z").getTime();
    expect(isStaleApprovalObject({ status:"approval", updatedAt:now-14*86400000 }, now)).toBe(true);
    expect(isStaleApprovalObject({ status:"approval", updatedAt:now-13*86400000 }, now)).toBe(false);
    expect(isStaleApprovalObject({ status:"work", updatedAt:now-30*86400000 }, now)).toBe(false);
    expect(isStaleApprovalObject({ status:"approval", updatedAt:now-30*86400000, deletedAt:now }, now)).toBe(false);
  });

  it("берёт описательные поля финпроекта из объекта/производства/договора, не из дублей проекта", () => {
    const view = buildFinanceProjectView({
      project:{ objectId:"o1", contractNo:"СТАРЫЙ", client:"Юр лицо", category:"Старое", description:"Старое имя", createdAt:"2020-01-01" },
      object:{ id:"o1", clientName:"Айжан", clientPhone:"8701", clientType:"физ", address:"Новый адрес", objType:"Новостройка", manager:"Звеат", status:"work" },
      production:{ objectId:"o1", saleDate:"2026-01-10", startDate:"2026-02-01", planEndDate:"2026-05-01", factEndDate:"" },
      contract:{ objectId:"o1", number:"2026-15", contractStatus:"signed" },
      reports:[{ objectId:"o1", type:"avr" }],
      status:{ key:"work", label:"В работе", color:"#00f", bg:"#eef" },
    });
    expect(view).toMatchObject({
      linked:true, customerName:"Айжан", customerType:"Физ лицо", address:"Новый адрес",
      category:"Новостройка", contractNo:"2026-15", statusLabel:"В работе",
      saleDate:"2026-01-10", startDate:"2026-02-01", planEndDate:"2026-05-01",
      contractSigned:true, hasAvr:true,
    });
  });

  it("не маскирует непривязанный старый финпроект и сохраняет его legacy-информацию только для показа", () => {
    const view = buildFinanceProjectView({ project:{ description:"Старый проект", contractNo:"88", category:"Другое", rawStatus:"в работе" } });
    expect(view).toMatchObject({ linked:false, customerName:"Старый проект", contractNo:"88", category:"Другое", statusKey:"work", statusLabel:"В работе" });
  });

  it("объединяет старые и новые названия статусов в один фильтр", () => {
    expect(financeStatusMeta("в работе")).toMatchObject({ key:"work", label:"В работе" });
    expect(financeStatusMeta("активен")).toMatchObject({ key:"work", label:"В работе" });
    expect(financeStatusMeta("work")).toMatchObject({ key:"work", label:"В работе" });
    expect(isActiveFinanceStatus("в работе")).toBe(true);
    expect(isActiveFinanceStatus("выполнен")).toBe(false);
    expect(isActiveFinanceStatus("archive")).toBe(false);
  });
});

describe("порядок этапов производства", () => {
  const stages = [
    { id:"a", cat:"Черновые", order:2 },
    { id:"b", cat:"Черновые", order:0 },
    { id:"c", cat:"Чистовые", order:1 },
    { id:"d", cat:"Черновые", order:3 },
  ];

  it("сортирует одинаково для карточки и клиентского кабинета", () => {
    expect(sortProductionStages(stages).map(s => s.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("переносит этап сразу на выбранную позицию внутри раздела", () => {
    const moved = moveProductionStage(stages, "d", 0);
    expect(moved.filter(s => s.cat === "Черновые").map(s => s.id)).toEqual(["d", "b", "a"]);
    expect(sortProductionStages(moved).map(s => s.id)).toEqual(moved.map(s => s.id));
  });

  it("не меняет порядок других разделов", () => {
    const moved = moveProductionStage(stages, "a", 0);
    expect(moved.filter(s => s.cat === "Чистовые").map(s => s.id)).toEqual(["c"]);
  });
});

describe("isBackupRestorable — запрет массового восстановления из неполного файла", () => {
  it("полный подтверждённый файл — можно", () => {
    expect(isBackupRestorable({ verifiedFromFirebase: true }).ok).toBe(true);
  });
  it("verifiedFromFirebase !== true → нельзя (в т.ч. старый формат без поля)", () => {
    expect(isBackupRestorable({ verifiedFromFirebase: false }).ok).toBe(false);
    expect(isBackupRestorable({}).ok).toBe(false);
  });
  // ключевой сценарий: раздел не прочитался → пустой в файле + помечен в _incomplete →
  // массовый restore затёр бы рабочий раздел пустотой. Такой файл запрещён.
  it("непустой _incomplete → нельзя, даже если verifiedFromFirebase случайно true", () => {
    expect(isBackupRestorable({ verifiedFromFirebase: true, _incomplete: ["Объекты"] }).ok).toBe(false);
  });
  it("пустой _incomplete + verified → можно", () => {
    expect(isBackupRestorable({ verifiedFromFirebase: true, _incomplete: [] }).ok).toBe(true);
  });
});

describe("validateBackupSchema — проверка структуры и СОДЕРЖИМОГО файла ДО записи в Firebase", () => {
  const SPECS = [{ key: "objects" }, { key: "contracts" }, { key: "estimates" }, { key: "productions", idKey: "objectId" }, { key: "users" }];
  const good = () => ({ _type: "titovstroy-backup", data: { objects: [{ id: "o1" }], contracts: [{ id: 1 }], productions: [{ objectId: "o1" }], users: [{ id: "u1" }], financeMeta: { a: 1 }, prices: null, rolePermissions: { user: { objects: "own" } }, publicNodes: { kp: { e1: { v: 1 } }, progress: {}, docs: {} }, audit: { index: ["2026-07"], months: { "2026-07": [{ ts: 1, action: "изменил" }] }, legacy: [] } } });
  it("корректный файл проходит", () => {
    expect(validateBackupSchema(good(), SPECS).ok).toBe(true);
  });
  it("не тот _type → ошибка", () => {
    const s = good(); s._type = "чужое";
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("data не объект → ошибка", () => {
    expect(validateBackupSchema({ _type: "titovstroy-backup", data: [] }, SPECS).ok).toBe(false);
  });
  it("раздел-массив на деле объект → ошибка", () => {
    const s = good(); s.data.objects = { not: "array" };
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  // содержимое списков
  it("строка внутри списка → ошибка", () => {
    const s = good(); s.data.objects = ["сломанные данные"];
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("null и число внутри списка → ошибка", () => {
    const s = good(); s.data.users = [null, 123];
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("объект без id → ошибка", () => {
    const s = good(); s.data.objects = [{}];
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("производство без objectId → ошибка", () => {
    const s = good(); s.data.productions = [{}];
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("prices — массив вместо объекта → ошибка", () => {
    const s = good(); s.data.prices = [1, 2, 3];
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("catalog — строка вместо объекта → ошибка", () => {
    const s = good(); s.data.catalog = "строка";
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("матрица прав — массив вместо объекта → ошибка", () => {
    const s = good(); s.data.rolePermissions = [];
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("publicNodes.kp значение не объект → ошибка", () => {
    const s = good(); s.data.publicNodes.kp = { e1: "строка" };
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("audit.months с кривым ключом месяца → ошибка", () => {
    const s = good(); s.data.audit.months = { "июль": [{ ts: 1, action: "x" }] };
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("запись журнала без ts/action/entity → ошибка", () => {
    const s = good(); s.data.audit.months = { "2026-07": [{ detail: "нет ключей" }] };
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("audit.index с кривым месяцем → ошибка", () => {
    const s = good(); s.data.audit.index = ["2026-07", "мусор"];
    expect(validateBackupSchema(s, SPECS).ok).toBe(false);
  });
  it("отсутствующие необязательные разделы — это ОК (частичный бэкап)", () => {
    expect(validateBackupSchema({ _type: "titovstroy-backup", data: { objects: [{ id: "o1" }] } }, SPECS).ok).toBe(true);
  });

  const templateStore = templates => ({ schemaVersion: 1, templates });
  const validTemplate = () => ({
    id: "repair",
    type: "repair_fiz",
    status: "published",
    activeVersionId: "repair:v1",
    draft: null,
    versions: [{
      id: "repair:v1",
      templateId: "repair",
      versionNumber: 1,
      contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Текст" }] }] },
      publishedAt: 1,
    }],
  });
  const validSnapshot = () => ({
    documentId: "document-1",
    objectId: "object-1",
    templateVersionId: "repair:v1",
    schemaVersion: 1,
    contentSnapshot: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Текст" }] }] },
    createdAt: 1,
  });

  it("глубоко проверяет шаблоны и снимки документов", () => {
    const specs = [...SPECS, ...documentTemplateBackupSpecs()];
    const backup = good();
    backup.data.documentTemplates = [templateStore([validTemplate()])];
    backup.data.documentSnapshots = [validSnapshot()];
    expect(validateBackupSchema(backup, specs).ok).toBe(true);
  });

  it("отклоняет битые версии шаблонов до любой записи", () => {
    const specs = [...SPECS, ...documentTemplateBackupSpecs()];
    const backup = good();
    backup.data.documentTemplates = [templateStore([{ ...validTemplate(), versions: "broken" }])];
    expect(validateBackupSchema(backup, specs).ok).toBe(false);
  });

  it("отклоняет снимок без неизменяемого содержимого", () => {
    const specs = [...SPECS, ...documentTemplateBackupSpecs()];
    const backup = good();
    backup.data.documentSnapshots = [{ ...validSnapshot(), contentSnapshot: null }];
    expect(validateBackupSchema(backup, specs).ok).toBe(false);
  });
});

describe("mergeAuditEntries — безопасное объединение журнала при восстановлении", () => {
  const e = (ts, extra = {}) => ({ ts, userId: "1", entity: "object", entityId: "o1", field: "статус", action: "изменил", ...extra });
  it("добавляет из бэкапа только отсутствующие записи (без дублей)", () => {
    const cur = [e(3)];
    const backup = [e(1), e(2), e(3)]; // e(3) уже есть
    const { merged, added } = mergeAuditEntries(cur, backup);
    expect(added).toBe(2);
    expect(merged.map(x => x.ts)).toEqual([1, 2, 3]); // отсортировано по времени
  });
  it("НИЧЕГО не удаляет: записи, которых нет в бэкапе, остаются", () => {
    const cur = [e(5, { action: "новее-бэкапа" })];
    const { merged } = mergeAuditEntries(cur, [e(1)]);
    expect(merged.some(x => x.action === "новее-бэкапа")).toBe(true);
  });
  it("идемпотентно: повторное объединение не плодит дубли", () => {
    const backup = [e(1), e(2)];
    const first = mergeAuditEntries([], backup);
    const second = mergeAuditEntries(first.merged, backup);
    expect(second.added).toBe(0);
    expect(second.merged.length).toBe(2);
  });
  it("пустой/битый current не роняет — работает от []", () => {
    expect(mergeAuditEntries(null, [e(1)]).added).toBe(1);
    expect(mergeAuditEntries(undefined, undefined).merged).toEqual([]);
  });
});

describe("classifyCloudArr — подтверждённое чтение раздела для полного бэкапа", () => {
  it("found + валидный массив → ok с данными", () => {
    const r = classifyCloudArr({ status: "found", value: JSON.stringify([{ id: 1 }]) });
    expect(r).toEqual({ list: [{ id: 1 }], ok: true });
  });
  it("empty (раздела реально нет) → ok, пустой список — это НЕ ошибка", () => {
    expect(classifyCloudArr({ status: "empty", value: null })).toEqual({ list: [], ok: true });
  });
  // ТЗ-тест 6/7: Firebase недоступен при экспорте → раздел НЕ ok → файл нельзя звать полным.
  // getCloudResult НИКОГДА не читает localStorage, поэтому наличие локального кэша не «спасает» —
  // unavailable остаётся unavailable даже когда на устройстве есть старая копия.
  it("unavailable → НЕ ok (даже если локально что-то есть — сюда оно не попадает)", () => {
    expect(classifyCloudArr({ status: "unavailable", value: null }).ok).toBe(false);
  });
  // ТЗ-тест 8: битый JSON раздела — это ОШИБКА, а не «пустой раздел».
  it("found, но битый JSON → НЕ ok (порча, не пусто)", () => {
    expect(classifyCloudArr({ status: "found", value: "{не json" }).ok).toBe(false);
  });
  it("found, но не массив (объект вместо списка) → НЕ ok", () => {
    expect(classifyCloudArr({ status: "found", value: JSON.stringify({ a: 1 }) }).ok).toBe(false);
  });
  it("полнота файла = НЕТ провалившихся разделов", () => {
    const sections = [
      classifyCloudArr({ status: "found", value: "[]" }),
      classifyCloudArr({ status: "empty" }),
      classifyCloudArr({ status: "unavailable" }), // один провал
    ];
    const verifiedFromFirebase = sections.every(s => s.ok);
    expect(verifiedFromFirebase).toBe(false);
  });
});

describe("classifyCloudObj — чтение настроек/каталога/цен для бэкапа", () => {
  it("found + объект → ok", () => {
    expect(classifyCloudObj({ status: "found", value: JSON.stringify({ x: 1 }) })).toEqual({ value: { x: 1 }, ok: true });
  });
  it("empty → ok, value:null", () => {
    expect(classifyCloudObj({ status: "empty" })).toEqual({ value: null, ok: true });
  });
  it("unavailable → НЕ ok", () => {
    expect(classifyCloudObj({ status: "unavailable" }).ok).toBe(false);
  });
  it("битый JSON → НЕ ok", () => {
    expect(classifyCloudObj({ status: "found", value: "{oops" }).ok).toBe(false);
  });
  // Настройки/каталог/цены — ТОЛЬКО обычный объект. Массив/число/строка = порча, не «настройки».
  it("массив вместо настроек → НЕ ok", () => {
    expect(classifyCloudObj({ status: "found", value: "[1,2,3]" }).ok).toBe(false);
  });
  it("число/строка вместо настроек → НЕ ok", () => {
    expect(classifyCloudObj({ status: "found", value: "42" }).ok).toBe(false);
    expect(classifyCloudObj({ status: "found", value: "\"hi\"" }).ok).toBe(false);
  });
  it("литеральный null (очищенный раздел) → ok, value:null (не считается порчей)", () => {
    expect(classifyCloudObj({ status: "found", value: "null" })).toEqual({ value: null, ok: true });
  });
});

describe("resolveVerifiedCloudRead — пустой SDK-кеш не равен удалению в облаке", () => {
  it("офлайн: REST не ответил → unavailable, не empty", () => {
    expect(resolveVerifiedCloudRead(
      { ok: false },
    )).toEqual({ status: "unavailable", value: null, source: "firebase" });
  });
  it("пустоту подтверждает только успешный REST-ответ null", () => {
    expect(resolveVerifiedCloudRead(
      { ok: true, value: null },
    )).toEqual({ status: "empty", value: null, source: "firebase" });
  });
  it("REST возвращает существующие данные", () => {
    expect(resolveVerifiedCloudRead(
      { ok: true, value: "[{\"objectId\":\"o1\"}]" },
    )).toEqual({ status: "found", value: "[{\"objectId\":\"o1\"}]", source: "firebase" });
  });
  it("локальный SDK-кеш не может подменить провалившееся REST-чтение", () => {
    // Второй аргумент имитирует локальный SDK-кеш "[]": функция его принципиально игнорирует.
    expect(resolveVerifiedCloudRead({ ok: false }, { status: "found", value: "[]" }))
      .toEqual({ status: "unavailable", value: null, source: "firebase" });
  });
});

describe("preBackupDecision — безопасный пред-бэкап перед восстановлением раздела", () => {
  it("текущее значение недоступно → skip (не знаем, что затираем)", () => {
    expect(preBackupDecision({ status: "unavailable" }, { status: "empty" }).action).toBe("skip");
  });
  it("раздела ещё нет (empty) → proceed без бэкапа (перезаписывать нечего)", () => {
    const d = preBackupDecision({ status: "empty" }, { status: "empty" });
    expect(d.action).toBe("proceed");
    expect(d.backups).toEqual([]);
  });
  it("есть текущее, но список пред-бэкапов недоступен → skip (нельзя откатить)", () => {
    expect(preBackupDecision({ status: "found", value: "[]" }, { status: "unavailable" }).action).toBe("skip");
  });
  it("есть текущее, список пред-бэкапов битый/не массив → skip", () => {
    expect(preBackupDecision({ status: "found", value: "[]" }, { status: "found", value: "{oops" }).action).toBe("skip");
    expect(preBackupDecision({ status: "found", value: "[]" }, { status: "found", value: "{\"a\":1}" }).action).toBe("skip");
  });
  it("есть текущее, пред-бэкапов ещё нет (empty) → proceed с []", () => {
    const d = preBackupDecision({ status: "found", value: "[]" }, { status: "empty" });
    expect(d.action).toBe("proceed");
    expect(d.backups).toEqual([]);
  });
  it("есть текущее и валидная история бэкапов → proceed, история сохранена", () => {
    const hist = [{ ts: 1, data: "x" }];
    const d = preBackupDecision({ status: "found", value: "[1]" }, { status: "found", value: JSON.stringify(hist) });
    expect(d.action).toBe("proceed");
    expect(d.backups).toEqual(hist); // прежняя история НЕ теряется
  });
});

describe("normCN — нормализация номера договора", () => {
  it("убирает пробелы, № и #", () => {
    expect(normCN("№0919#153")).toBe(normCN("0919 153"));
  });
  it("не различает регистр и лишние пробелы по краям", () => {
    expect(normCN("  ABC-12  ")).toBe(normCN("abc-12"));
  });
  it("пустое/undefined значение даёт пустую строку, а не падает", () => {
    expect(normCN(undefined)).toBe("");
    expect(normCN(null)).toBe("");
    expect(normCN("")).toBe("");
  });
  it("разные номера остаются разными", () => {
    expect(normCN("1012")).not.toBe(normCN("1013"));
  });
});

describe("withCatalogOverrides — мердж дефолтов каталога", () => {
  it("даёт полный набор дефолтных полей на пустом cur", () => {
    const r = withCatalogOverrides(null);
    expect(r).toEqual(CATALOG_DEFAULTS);
  });
  it("сохраняет поля из cur, которых нет в патче", () => {
    const cur = { renames: { A: "Б" }, custom: [{ code: "X" }] };
    const r = withCatalogOverrides(cur, { catRenames: { "Старое": "Новое" } });
    expect(r.renames).toEqual({ A: "Б" });
    expect(r.custom).toEqual([{ code: "X" }]);
    expect(r.catRenames).toEqual({ "Старое": "Новое" });
  });
  it("патч перекрывает одноимённое поле из cur (последний побеждает)", () => {
    const cur = { custom: [{ code: "OLD" }] };
    const r = withCatalogOverrides(cur, { custom: [{ code: "NEW" }] });
    expect(r.custom).toEqual([{ code: "NEW" }]);
  });
  it("не мутирует CATALOG_DEFAULTS между вызовами", () => {
    withCatalogOverrides({}, { hiddenCats: ["X"] });
    expect(CATALOG_DEFAULTS.hiddenCats).toEqual([]);
  });
});

describe("умные подсказки сметы", () => {
  const catalog = [
    { code:"FLOOR-005", name:"Стяжка ц/п 5–8 см", unit:"м²" },
    { code:"PREP-007", name:"Грунтовка пола", unit:"м²" },
    { code:"FLOOR-002", name:"Армирование сеткой (пол)", unit:"м²" },
    { code:"FLOOR-003", name:"Монтаж маяков (пол)", unit:"м.п." },
  ];

  it("предлагает только существующие в текущем прайсе работы", () => {
    const rules = normalizeEstimateSuggestionRules([
      { sourceCode:"FLOOR-005", targetCode:"PREP-007", multiplier:1 },
      { sourceCode:"FLOOR-005", targetCode:"DELETED", multiplier:1 },
    ], catalog);
    expect(rules).toHaveLength(1);
    expect(rules[0].targetCode).toBe("PREP-007");
  });

  it("не предлагает уже добавленную позицию и не мутирует смету", () => {
    const rows = { "FLOOR-005":{ qty:45.7 }, "PREP-007":{ qty:45.7 } };
    const before = JSON.stringify(rows);
    const result = buildEstimateSuggestions(rows, catalog, [
      { sourceCode:"FLOOR-005", targetCode:"PREP-007", multiplier:1 },
    ]);
    expect(result).toEqual([]);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("рассчитывает количество, но ручную единицу оставляет пустой", () => {
    const result = buildEstimateSuggestions({ "FLOOR-005":{ qty:45.7 } }, catalog, [
      { sourceCode:"FLOOR-005", targetCode:"PREP-007", multiplier:1, defaultSelected:true },
      { sourceCode:"FLOOR-005", targetCode:"FLOOR-003", multiplier:null, defaultSelected:true },
    ]);
    expect(result.find(x=>x.targetCode==="PREP-007")).toMatchObject({ qty:45.7, defaultSelected:true });
    expect(result.find(x=>x.targetCode==="FLOOR-003")).toMatchObject({ qty:"", defaultSelected:false });
  });

  it("убирает дубли одной рекомендации от нескольких исходных работ", () => {
    const result = buildEstimateSuggestions({ A:{qty:10}, B:{qty:20} }, [
      {code:"A",name:"A"}, {code:"B",name:"B"}, {code:"T",name:"T"},
    ], [
      {sourceCode:"A",targetCode:"T",multiplier:1},
      {sourceCode:"B",targetCode:"T",multiplier:1},
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ targetCode:"T", qty:20 });
  });

  it("базовые правила появляются только для реально существующих кодов", () => {
    expect(createDefaultEstimateSuggestionRules(catalog).map(x=>x.targetCode).sort()).toEqual([
      "FLOOR-002", "FLOOR-003", "PREP-007",
    ]);
    expect(createDefaultEstimateSuggestionRules(catalog.filter(w=>w.code!=="PREP-007")).some(x=>x.targetCode==="PREP-007")).toBe(false);
  });

  it("пустой сохранённый список отключает подсказки, null включает базовые", () => {
    expect(resolveEstimateSuggestionRules({ suggestionRules:[] }, catalog)).toEqual([]);
    expect(resolveEstimateSuggestionRules({ suggestionRules:null }, catalog).length).toBeGreaterThan(0);
  });

  it("расширенный набор: сопутствующие работы появляются при наличии обоих кодов", () => {
    const richCatalog = [
      { code:"SN-008", name:"Монтаж радиатора отопления", unit:"шт" },
      { code:"DEM-026", name:"Демонтаж радиатора отопления", unit:"шт" },
      { code:"TL-002", name:"Укладка плитки на пол", unit:"м²" },
      { code:"TL-005", name:"Затирка швов", unit:"м²" },
      { code:"WALL-003", name:"Штукатурка стен (1–3 см)", unit:"м²" },
      { code:"WALL-001", name:"Грунтовка основания стен", unit:"м²" },
      { code:"FLOOR-004", name:"Стяжка ц/п до 80 мм (под керамзит)", unit:"м²" },
      { code:"FLOOR-007", name:"Засыпка керамзита до 100 мм", unit:"м²" },
    ];
    const pairs = new Set(
      createDefaultEstimateSuggestionRules(richCatalog).map(r => `${r.sourceCode}>${r.targetCode}`)
    );
    // монтаж радиатора ⇄ демонтаж (в обе стороны)
    expect(pairs.has("SN-008>DEM-026")).toBe(true);
    expect(pairs.has("DEM-026>SN-008")).toBe(true);
    // плитка → затирка (тот же объём), штукатурка → грунтовка
    expect(pairs.has("TL-002>TL-005")).toBe(true);
    expect(pairs.has("WALL-003>WALL-001")).toBe(true);
    // стяжка под керамзит ⇄ засыпка керамзита
    expect(pairs.has("FLOOR-004>FLOOR-007")).toBe(true);
    expect(pairs.has("FLOOR-007>FLOOR-004")).toBe(true);
    // код без пары в прайсе не даёт правил (нет цели SN-009)
    expect([...pairs].some(p => p.endsWith(">SN-009"))).toBe(false);
  });
});

describe("groupData — группировка по категории/подкатегории", () => {
  it("группирует работы по cat → sub, сохраняя порядок", () => {
    const works = [
      { cat: "Черновые", sub: "Демонтаж", name: "A" },
      { cat: "Черновые", sub: "Демонтаж", name: "B" },
      { cat: "Черновые", sub: "Стены", name: "C" },
      { cat: "Чистовые", sub: "Полы", name: "D" },
    ];
    const g = groupData(works);
    expect(Object.keys(g)).toEqual(["Черновые", "Чистовые"]);
    expect(g["Черновые"]["Демонтаж"].map(w => w.name)).toEqual(["A", "B"]);
    expect(g["Черновые"]["Стены"].map(w => w.name)).toEqual(["C"]);
    expect(g["Чистовые"]["Полы"].map(w => w.name)).toEqual(["D"]);
  });
  it("пустой список даёт пустой объект", () => {
    expect(groupData([])).toEqual({});
  });
});

describe("tengeInWords — сумма прописью (легальный текст договоров/актов)", () => {
  it("ноль", () => {
    expect(tengeInWords(0)).toBe("Ноль тенге");
  });
  it("простое двузначное число", () => {
    expect(tengeInWords(25)).toBe("Двадцать пять тенге");
  });
  it("тысячи в женском роде (одна/две тысячи)", () => {
    expect(tengeInWords(1000)).toBe("Одна тысяча тенге");
    expect(tengeInWords(2000)).toBe("Две тысячи тенге");
  });
  it("склонение тысяч (тысяча/тысячи/тысяч)", () => {
    expect(tengeInWords(5000)).toMatch(/тысяч тенге$/i);
    expect(tengeInWords(3000)).toMatch(/тысячи тенге$/i);
  });
  it("миллионы + тысячи + остаток вместе", () => {
    expect(tengeInWords(1901293)).toBe(
      "Один миллион девятьсот один тысяча двести девяносто три тенге".replace("один тысяча", "одна тысяча")
    );
  });
  it("округляет и берёт модуль (отрицательные/дробные не ломают)", () => {
    expect(tengeInWords(-100)).toBe(tengeInWords(100));
    expect(tengeInWords(99.6)).toBe(tengeInWords(100));
  });
  it("первая буква всегда заглавная", () => {
    expect(tengeInWords(123)[0]).toBe(tengeInWords(123)[0].toUpperCase());
  });
});

describe("mergeFinMeta — дозаполнение дефолтных категорий Финансов", () => {
  it("на пустом saved подставляет все дефолтные категории", () => {
    const r = mergeFinMeta({});
    expect(r.income.length).toBe(DEFAULT_FIN_META.income.length);
    expect(r.expense.length).toBe(DEFAULT_FIN_META.expense.length);
  });
  it("не удаляет пользовательскую категорию, которой нет в дефолтах", () => {
    const saved = { income: [{ cat: "Моя категория", subs: ["Своя"] }], expense: [] };
    const r = mergeFinMeta(saved);
    expect(r.income.some(c => c.cat === "Моя категория")).toBe(true);
    // дефолтные тоже должны быть дописаны
    expect(r.income.length).toBe(1 + DEFAULT_FIN_META.income.length);
  });
  it("дописывает недостающие подкатегории в существующую категорию, не теряя пользовательские", () => {
    const defCat = DEFAULT_FIN_META.income[0];
    const saved = { income: [{ cat: defCat.cat, subs: ["Своя подкатегория"] }], expense: [] };
    const r = mergeFinMeta(saved);
    const merged = r.income.find(c => c.cat === defCat.cat);
    expect(merged.subs).toContain("Своя подкатегория");
    for (const s of defCat.subs) expect(merged.subs).toContain(s);
  });
  it("не мутирует исходный saved", () => {
    const saved = { income: [{ cat: "X", subs: [] }], expense: [] };
    const before = JSON.stringify(saved);
    mergeFinMeta(saved);
    expect(JSON.stringify(saved)).toBe(before);
  });
});

describe("findFinanceProjectForObject — строгая связь по ID", () => {
  const object = { id:"obj-sergey", clientName:"Сергей", clientPhone:"87000000000" };
  const projects = [
    { id:"wrong", description:"Сергей, Металлистов", contractNo:"777", budget:310000 },
    { id:"right", contractNo:"1019", budget:3994954 },
  ];

  it("не выбирает чужой проект по совпавшему имени", () => {
    expect(findFinanceProjectForObject(object, [], projects)).toBeNull();
  });

  it("находит старый проект по точному номеру договора", () => {
    const contracts = [{ id:"c1", objectId:object.id, number:"№1019", type:"repair_fiz" }];
    expect(findFinanceProjectForObject(object, contracts, projects)?.id).toBe("right");
  });

  it("objectId имеет высший приоритет", () => {
    const linked = [{ id:"direct", objectId:object.id, contractNo:"other" }, ...projects];
    expect(findFinanceProjectForObject(object, [], linked)?.id).toBe("direct");
  });
});

describe("contractNoOfObject — по нему деньги цепляются к объекту", () => {
  const obj = { id: "o1" };
  const doc = { id: "c1", objectId: "o1", number: "№ 1013" };
  const proj = { id: "p1", objectId: "o1", contractNo: "0919#154" };

  it("своё поле объекта главнее договора и финпроекта", () => {
    const r = contractNoOfObject({ ...obj, contractNo: "ручной-1" }, [doc], [proj]);
    expect(r).toEqual({ number: "ручной-1", source: "object" });
  });

  it("нет своего — берём основной договор-документ", () => {
    expect(contractNoOfObject(obj, [doc], [proj])).toEqual({ number: "№ 1013", source: "contract" });
  });

  it("нет документа — берём финпроект (на боевой базе так у 23 объектов)", () => {
    expect(contractNoOfObject(obj, [], [proj])).toEqual({ number: "0919#154", source: "project" });
  });

  it("доп. соглашение и подряд номером объекта не считаются", () => {
    const annex = { id: "c2", objectId: "o1", number: "№ 2", type: "annex" };
    const podryad = { id: "c3", objectId: "o1", number: "№ 1012", type: "podryad" };
    expect(contractNoOfObject(obj, [annex, podryad], []).source).toBe("none");
    expect(contractNoOfObject(obj, [annex, podryad], [proj]).source).toBe("project");
  });

  it("удалённый договор не берётся", () => {
    expect(contractNoOfObject(obj, [{ ...doc, deletedAt: 1 }], []).source).toBe("none");
  });

  it("пусто везде — источник «none», а не пустая строка молча", () => {
    expect(contractNoOfObject(obj, [], [])).toEqual({ number: "", source: "none" });
    expect(contractNoOfObject(null, [], [])).toEqual({ number: "", source: "none" });
  });
});

describe("computeIssues — детектор «Что горит» / «Проверка базы»", () => {
  const DAY = 864e5;
  const now = new Date("2026-07-09T12:00:00Z").getTime();
  const find = (issues, prefix) => issues.filter(i => i.id.startsWith(prefix));

  it("пустые данные не падают и дают пустой список", () => {
    expect(computeIssues({}, { now })).toEqual([]);
    expect(computeIssues({ objects: null, productions: undefined }, { now })).toEqual([]);
  });

  it("удалённые объекты игнорируются", () => {
    const issues = computeIssues({ objects: [{ id:"o1", status:"work", deletedAt: now }] }, { now });
    expect(issues.length).toBe(0);
  });

  it("просроченный этап → red, scope today, привязан к объекту", () => {
    const issues = computeIssues({
      objects: [{ id:"o1", status:"work", clientName:"Алма" }],
      productions: [{ objectId:"o1", stages:[{ id:"s1", name:"Стяжка", status:"progress", planEnd: new Date(now-3*DAY).toISOString().slice(0,10) }] }],
    }, { now });
    const st = find(issues, "overdue-stage:o1");
    expect(st.length).toBe(1);
    expect(st[0].sev).toBe("red");
    expect(st[0].scope).toBe("today");
    expect(st[0].nav).toEqual({ object:"o1", tab:"stages" });
  });

  it("выполненный или будущий этап не считается просроченным", () => {
    const issues = computeIssues({
      objects: [{ id:"o1", status:"work" }],
      productions: [{ objectId:"o1", stages:[
        { id:"s1", name:"A", status:"done", planEnd: new Date(now-5*DAY).toISOString().slice(0,10) },
        { id:"s2", name:"B", status:"todo", planEnd: new Date(now+5*DAY).toISOString().slice(0,10) },
      ] }],
    }, { now });
    expect(find(issues, "overdue-stage").length).toBe(0);
  });

  it("объект «в работе» без прораба → жёлтая проблема", () => {
    const noResp = computeIssues({ objects:[{ id:"o1", status:"work" }], productions:[{ objectId:"o1", responsible:"" }] }, { now });
    expect(find(noResp, "no-foreman:o1").length).toBe(1);
    const withResp = computeIssues({ objects:[{ id:"o1", status:"work" }], productions:[{ objectId:"o1", responsible:"Пётр" }] }, { now });
    expect(find(withResp, "no-foreman").length).toBe(0);
  });

  it("подписан без финпроекта → red, не скрываемая; с финпроектом — нет проблемы", () => {
    const bad = computeIssues({ objects:[{ id:"o1", status:"signed", clientName:"Иван" }] }, { now });
    const s = find(bad, "signed-nofin:o1");
    expect(s.length).toBe(1);
    expect(s[0].dismissable).toBe(false);
    const ok = computeIssues({ objects:[{ id:"o1", status:"signed" }], finProjects:[{ id:"fp1", objectId:"o1", budget:1000 }] }, { now });
    expect(find(ok, "signed-nofin").length).toBe(0);
  });

  it("финпроект связывается с объектом по номеру договора (normCN, № игнорируется)", () => {
    const ok = computeIssues({
      objects:[{ id:"o1", status:"signed" }],
      contracts:[{ id:"c1", number:"1012", objectId:"o1" }],
      finProjects:[{ id:"fp1", contractNo:"№1012", budget:1000 }],
    }, { now });
    expect(find(ok, "signed-nofin").length).toBe(0); // связался, несмотря на «№»
  });

  it("дебиторка не попадает в оперативную панель «Что горит»", () => {
    const issues = computeIssues({
      objects:[{ id:"o1", status:"work", clientName:"Клиент" }],
      finProjects:[{ id:"fp1", objectId:"o1", contractNo:"1012", budget:1000000 }],
      financeTx:[{ id:"t1", type:"income", amount:400000, contractNo:"1012" }],
    }, { now });
    const debt = find(issues, "debt:fp1");
    expect(debt.length).toBe(0);
  });

  it("не создаёт предупреждение о дебиторке даже при исключённых операциях", () => {
    const issues = computeIssues({
      finProjects:[{ id:"fp1", contractNo:"1012", budget:1000, rawStatus:"активен" }],
      financeTx:[
        { id:"t1", type:"income", amount:1000, contractNo:"1012", included:false },
        { id:"t2", type:"income", amount:500, contractNo:"1012", deletedAt: now },
      ],
    }, { now });
    const debt = find(issues, "debt:fp1");
    expect(debt.length).toBe(0);
  });

  it("замечание клиента (source=client, не done) → проблема; закрытое — нет", () => {
    const issues = computeIssues({
      objects:[{ id:"o1", status:"work" }],
      productions:[{ objectId:"o1", defects:[
        { id:"d1", text:"Скол на плитке", source:"client", done:false },
        { id:"d2", text:"Своё внутреннее", source:"client", done:true },
        { id:"d3", text:"Не от клиента", source:"internal", done:false },
        { id:"d4", text:"Убрано администратором с главной", source:"client", done:false, dashboardDismissedAt:now - 1 },
      ] }],
    }, { now });
    const remarks = find(issues, "client-remark:o1");
    expect(remarks.length).toBe(1);
    expect(remarks[0].dismissAction).toEqual({ type:"client-remark", objectId:"o1", itemId:"d1" });
    expect(remarks[0].dismissLabel).toBe("Убрать с главной");
  });

  it("дубли номеров договоров → red в check", () => {
    const issues = computeIssues({ contracts:[
      { id:"c1", number:"1012", type:"repair_fiz" },
      { id:"c2", number:"№1012", type:"repair_fiz" },
    ] }, { now });
    const dup = issues.filter(i => i.id.startsWith("dup-cn"));
    expect(dup.length).toBe(1);
    expect(dup[0].sev).toBe("red");
    expect(dup[0].scope).toBe("check");
  });

  it("смета без objectId и клиент без телефона → предупреждения в check", () => {
    const issues = computeIssues({
      estimates:[{ id:"e1", total:50000 }],
      clients:[{ id:"cl1", name:"Иван", phone:"" }],
    }, { now });
    expect(issues.some(i => i.id==="est-noobj:e1")).toBe(true);
    expect(issues.some(i => i.id==="client-incomplete:cl1")).toBe(true);
  });

  it("публичная ссылка без срока → предупреждение; со сроком — нет", () => {
    const noExp = computeIssues({ objects:[{ id:"o1", status:"work", progressShared:true, progressToken:"t" }] }, { now });
    expect(noExp.some(i => i.id==="link-noexp:o1")).toBe(true);
    const withExp = computeIssues({ objects:[{ id:"o1", status:"work", progressShared:true, progressToken:"t", progressExpiresAt: now+DAY }] }, { now });
    expect(withExp.some(i => i.id.startsWith("link-noexp"))).toBe(false);
  });

  it("каждая проблема имеет обязательные поля и валидный scope/sev", () => {
    const issues = computeIssues({
      objects:[{ id:"o1", status:"signed" }],
      contracts:[{ id:"c1", number:"1012", type:"repair_fiz" }, { id:"c2", number:"1012", type:"repair_fiz" }],
    }, { now });
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(typeof i.id).toBe("string");
      expect(["Производство","Финансы","Клиенты","Данные"]).toContain(i.group);
      expect(["red","yellow"]).toContain(i.sev);
      expect(["today","check"]).toContain(i.scope);
      expect(typeof i.title).toBe("string");
      expect(i.nav).toBeTruthy();
    }
  });
});

describe("buildCalendarStages / foremanLoad — календарь производства", () => {
  const DAY = 864e5;
  const now = new Date("2026-07-09T12:00:00Z").getTime();
  const iso = (d) => new Date(d).toISOString().slice(0,10);

  it("разворачивает этапы объектов в плоский список с датами, сортирует по старту", () => {
    const cal = buildCalendarStages(
      [{ id:"o1", clientName:"Алма" }],
      [{ objectId:"o1", responsible:"Пётр", stages:[
        { id:"s2", name:"B", status:"todo", planStart: iso(now+5*DAY), planEnd: iso(now+8*DAY) },
        { id:"s1", name:"A", status:"progress", planStart: iso(now), planEnd: iso(now+2*DAY) },
      ] }], { now });
    expect(cal.map(s=>s.name)).toEqual(["A","B"]); // отсортировано по старту
    expect(cal[0].objLabel).toBe("Алма");
    expect(cal[0].responsible).toBe("Пётр");
  });

  it("этап без дат пропускается; ответственный берётся из этапа, иначе из карточки", () => {
    const cal = buildCalendarStages(
      [{ id:"o1" }],
      [{ objectId:"o1", responsible:"Бригадир", stages:[
        { id:"s1", name:"нет дат", status:"todo" },
        { id:"s2", name:"свой ответств", status:"todo", responsible:"Иван", planEnd: iso(now+DAY) },
      ] }], { now });
    expect(cal.length).toBe(1);
    expect(cal[0].responsible).toBe("Иван");
  });

  it("просрочка: незакрытый этап с концом в прошлом → overdue; done — нет", () => {
    const cal = buildCalendarStages(
      [{ id:"o1" }],
      [{ objectId:"o1", stages:[
        { id:"s1", name:"опоздал", status:"progress", planEnd: iso(now-3*DAY) },
        { id:"s2", name:"сделан", status:"done", planEnd: iso(now-3*DAY) },
      ] }], { now });
    const bad = cal.find(s=>s.stageId==="s1"), okDone = cal.find(s=>s.stageId==="s2");
    expect(bad.overdue).toBe(true);
    expect(okDone.overdue).toBe(false);
  });

  it("объекты в архиве/отказе/расторгнуты не попадают в календарь", () => {
    const cal = buildCalendarStages(
      [{ id:"o1", status:"archive" }, { id:"o2", status:"cancel" }],
      [{ objectId:"o1", stages:[{ id:"s1", planEnd: iso(now) }] }, { objectId:"o2", stages:[{ id:"s2", planEnd: iso(now) }] }], { now });
    expect(cal.length).toBe(0);
  });

  it("foremanLoad: перегруз, когда у прораба ≥ порога пересекающихся этапов в один день", () => {
    const stages = [
      { responsible:"Пётр", status:"todo", start: now, end: now+5*DAY },
      { responsible:"Пётр", status:"progress", start: now+1*DAY, end: now+4*DAY },
      { responsible:"Пётр", status:"todo", start: now+2*DAY, end: now+3*DAY },
      { responsible:"Иван", status:"todo", start: now, end: now+1*DAY },
    ];
    const load = foremanLoad(stages, { threshold: 3, now });
    expect(load["Пётр"].peak).toBe(3);       // три этапа пересекаются в середине
    expect(load["Пётр"].overloaded).toBe(true);
    expect(load["Иван"].overloaded).toBe(false);
  });

  it("foremanLoad игнорирует завершённые этапы", () => {
    const load = foremanLoad([
      { responsible:"Пётр", status:"done", start: now, end: now+5*DAY },
      { responsible:"Пётр", status:"done", start: now, end: now+5*DAY },
    ], { threshold: 2, now });
    expect(load["Пётр"]).toBeUndefined();
  });
});

// ── Владение dirty-записями (блокеры rev8-аудита №1–2) ──
import { makeDirtyMarker, isOwnDirtyMarker, listOwnedDirty, adoptUserDirty, discardOwnedDirty, listFlushableDirty, isLegacyDirtyMarker, mayClearDirtyOnSuccess } from "./utils.js";

const fakeLS = () => {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

describe("dirty-записи: владение и полное удаление при выходе с потерей", () => {
  it("СЦЕНАРИЙ АУДИТОРА: A сохраняет смету без сети → выходит с потерей → B получает облако, а не локальную смету A", () => {
    const ls = fakeLS(); const mem = {};
    // пользователь A: запись в облако упала → локальное значение + __wts + dirty-маркер + _mem
    ls.setItem("titovstroy-estimates", '[{"id":1,"name":"смета A (несохранённая)"}]');
    ls.setItem("titovstroy-estimates__wts", String(Date.now()));
    ls.setItem("titovstroy-estimates__dirty", makeDirtyMarker("userA", "tab1"));
    mem["titovstroy-estimates"] = '[{"id":1,"name":"смета A (несохранённая)"}]';
    // A подтвердил «выйти и ПОТЕРЯТЬ»
    const removed = discardOwnedDirty(ls, "userA", "tab1", mem);
    expect(removed).toEqual(["titovstroy-estimates"]);
    // B входит: НИ значения (свежая локальная копия выигрывала бы в getResult),
    // НИ __wts (окно 30с), НИ копии в памяти, НИ dirty-метки (авто-флеш) — только облако
    expect(ls.getItem("titovstroy-estimates")).toBeNull();
    expect(ls.getItem("titovstroy-estimates__wts")).toBeNull();
    expect(ls.getItem("titovstroy-estimates__dirty")).toBeNull();
    expect(mem["titovstroy-estimates"]).toBeUndefined();
  });
  it("ДВЕ ВКЛАДКИ: выход в первой не снимает dirty второй (и не удаляет её значение)", () => {
    const ls = fakeLS(); const mem = {};
    ls.setItem("titovstroy-estimates", "[правка вкладки 1]");
    ls.setItem("titovstroy-estimates__dirty", makeDirtyMarker("userA", "tab1"));
    ls.setItem("titovstroy-finance", "[правка вкладки 2]");
    ls.setItem("titovstroy-finance__dirty", makeDirtyMarker("userA", "tab2"));
    const removed = discardOwnedDirty(ls, "userA", "tab1", mem);
    expect(removed).toEqual(["titovstroy-estimates"]);
    // правка второй вкладки цела: и метка (она дожмёт/спросит сама), и значение
    expect(ls.getItem("titovstroy-finance__dirty")).not.toBeNull();
    expect(ls.getItem("titovstroy-finance")).toBe("[правка вкладки 2]");
  });
  it("ЧУЖОЙ ПОЛЬЗОВАТЕЛЬ в той же вкладке (теоретически): не трогаем", () => {
    const ls = fakeLS();
    ls.setItem("titovstroy-x__dirty", makeDirtyMarker("userB", "tab1"));
    expect(listOwnedDirty(ls, "userA", "tab1")).toEqual([]);
  });
  it("legacy-маркер (голый timestamp старых версий) — КАРАНТИН: не удаляется чужим «выйти с потерей»", () => {
    const ls = fakeLS();
    ls.setItem("titovstroy-old", "старая правка неизвестного владельца");
    ls.setItem("titovstroy-old__dirty", String(Date.now())); // формат до владения
    const removed = discardOwnedDirty(ls, "userA", "tab1", {});
    expect(removed).toEqual([]); // владелец неизвестен — по чужому подтверждению не удаляем
    expect(ls.getItem("titovstroy-old")).toBe("старая правка неизвестного владельца");
    expect(ls.getItem("titovstroy-old__dirty")).not.toBeNull();
  });
  it("isOwnDirtyMarker: свой uid+tab — да; чужая вкладка — нет; без uid — решает вкладка; пусто/legacy — нет", () => {
    expect(isOwnDirtyMarker(makeDirtyMarker("u1", "t1"), "u1", "t1")).toBe(true);
    expect(isOwnDirtyMarker(makeDirtyMarker("u1", "t2"), "u1", "t1")).toBe(false);
    expect(isOwnDirtyMarker(makeDirtyMarker(null, "t1"), "u1", "t1")).toBe(true);
    expect(isOwnDirtyMarker(null, "u1", "t1")).toBe(false);
    expect(isOwnDirtyMarker("not-json{", "u1", "t1")).toBe(false); // legacy — владелец неизвестен
    expect(isOwnDirtyMarker(String(Date.now()), "u1", "t1")).toBe(false); // legacy-timestamp
  });
});

describe("флеш и снятие меток по владельцу (блокеры rev9-аудита №1–2)", () => {
  it("СЦЕНАРИЙ АУДИТОРА: dirty пользователя B существует — A входит/выходит/жмёт «Повторить»: запись B не отправляется и не меняется", () => {
    const ls = fakeLS();
    ls.setItem("titovstroy-finance", "[правка B]");
    ls.setItem("titovstroy-finance__dirty", makeDirtyMarker("userB", "tabB"));
    // «Повторить»/авто-флеш сессии A: списка к отправке НЕТ
    expect(listFlushableDirty(ls, "userA", "tabA")).toEqual([]);
    // выход A «с потерей»: запись B цела — и метка, и значение
    const removed = discardOwnedDirty(ls, "userA", "tabA", {});
    expect(removed).toEqual([]);
    expect(ls.getItem("titovstroy-finance")).toBe("[правка B]");
    expect(ls.getItem("titovstroy-finance__dirty")).not.toBeNull();
  });
  it("СЦЕНАРИЙ АУДИТОРА: две вкладки правят ОДИН ключ titovstroy-estimates — успех первой не гасит метку второй", () => {
    const ls = fakeLS();
    // вкладка 1 упала в офлайн → её маркер; затем вкладка 2 перезаписала значение И маркер
    ls.setItem("titovstroy-estimates", "[версия вкладки 2]");
    ls.setItem("titovstroy-estimates__dirty", makeDirtyMarker("userA", "tab2"));
    // поздний УСПЕШНЫЙ ответ вкладки 1: чужой маркер снимать НЕЛЬЗЯ (правка вкладки 2 не в облаке)
    expect(mayClearDirtyOnSuccess(ls.getItem("titovstroy-estimates__dirty"), "userA", "tab1")).toBe(false);
    // вкладка 2 при этом дожмёт её сама: ключ в ЕЁ списке к отправке
    expect(listFlushableDirty(ls, "userA", "tab2")).toEqual(["titovstroy-estimates"]);
  });
  it("legacy остаётся в карантине и не снимается обычной успешной записью", () => {
    const ls = fakeLS();
    ls.setItem("titovstroy-old__dirty", String(Date.now()));
    expect(listFlushableDirty(ls, "userA", "tab1")).toEqual([]); // авто-отправки нет
    expect(isLegacyDirtyMarker(ls.getItem("titovstroy-old__dirty"))).toBe(true);
    // обычное чтение legacy-копию не использует, поэтому новая облачная запись не подтверждает
    // сохранность старой неизвестной правки и не имеет права снимать её метку
    expect(mayClearDirtyOnSuccess(ls.getItem("titovstroy-old__dirty"), "userA", "tab1")).toBe(false);
  });
  it("mayClearDirtyOnSuccess: своя/отсутствующая — снять; чужой uid — нет", () => {
    expect(mayClearDirtyOnSuccess(null, "u1", "t1")).toBe(true);
    expect(mayClearDirtyOnSuccess(makeDirtyMarker("u1", "t1"), "u1", "t1")).toBe(true);
    expect(mayClearDirtyOnSuccess(makeDirtyMarker("u2", "t1"), "u1", "t1")).toBe(false);
  });
  it("новый editor того же uid принимает dirty закрытой вкладки; чужие и legacy не трогает", () => {
    const ls = fakeLS();
    ls.setItem("same__dirty", makeDirtyMarker("u1", "old-tab"));
    ls.setItem("other__dirty", makeDirtyMarker("u2", "old-tab"));
    ls.setItem("legacy__dirty", String(Date.now()));
    const adopted = adoptUserDirty(ls, "u1", "new-tab", "__dirty", 123);
    expect(adopted).toEqual(["same"]);
    expect(isOwnDirtyMarker(ls.getItem("same__dirty"), "u1", "new-tab")).toBe(true);
    expect(isOwnDirtyMarker(ls.getItem("other__dirty"), "u1", "new-tab")).toBe(false);
    expect(isLegacyDirtyMarker(ls.getItem("legacy__dirty"))).toBe(true);
  });
});

describe("visibleDirtyKeys — баннер только после фактической ошибки записи", () => {
  it("не показывает выполняющуюся фоновую запись как недоступное облако", () => {
    const inFlight = new Map([["titovstroy-presence-u1", 1]]);
    expect(visibleDirtyKeys(["titovstroy-presence-u1"], inFlight)).toEqual([]);
  });
  it("после завершения неудачной записи dirty становится видимым", () => {
    const inFlight = new Map();
    expect(visibleDirtyKeys(["titovstroy-estimates"], inFlight)).toEqual(["titovstroy-estimates"]);
  });
});

// ── Lease-lock «одна вкладка редактирует» + владение при чтении (ТЗ rev11) ──
import { EDIT_LEASE_KEY, LEASE_TTL_MS, makeLease, parseLease, leaseAlive, canAcquireLease, ownsActiveLease, canWriteLease, mayTakeoverLease, mayUseLocalCopy, claimFallbackLease } from "./utils.js";

describe("lease-lock: одна вкладка редактирует (ТЗ rev11)", () => {
  const NOW = 1_700_000_000_000;
  it("право записи есть только у владельца живого lease с тем же fencing-token", () => {
    const lease = makeLease("userA", "tab1", NOW, "token-1");
    const st = canWriteLease(lease, "userA", "tab2", "token-2", NOW + 3000);
    expect(st.ok).toBe(false);
    expect(st.reason).toBe("read-only-tab");
    expect(canWriteLease(lease, "userA", "tab1", "wrong", NOW + 3000).ok).toBe(false);
    expect(canWriteLease(lease, "userA", "tab1", "token-1", NOW + 3000).ok).toBe(true);
    expect(ownsActiveLease(lease, "userA", "tab1", "token-1", NOW + 3000)).toBe(true);
  });
  it("свободный или протухший lease можно захватить, но до захвата писать нельзя", () => {
    const lease = makeLease("userA", "tab1", NOW, "token-1");
    expect(mayTakeoverLease(lease, NOW + LEASE_TTL_MS - 1000)).toBe(false); // жив — нельзя
    expect(mayTakeoverLease(lease, NOW + LEASE_TTL_MS + 1000)).toBe(true);  // протух — можно
    expect(mayTakeoverLease(null, NOW)).toBe(true);                        // отсутствует — можно
    expect(canAcquireLease(null, NOW)).toBe(true);
    expect(canWriteLease(null, "userB", "tab2", "token-2", NOW).ok).toBe(false);
    expect(canWriteLease(lease, "userB", "tab2", "token-2", NOW + LEASE_TTL_MS + 1000).ok).toBe(false);
    expect(canWriteLease(lease, "userB", "tab2", "token-2", NOW + LEASE_TTL_MS + 1000).reason).toBe("lease-required");
  });
  it("после смены fencing-token поздний ответ старой вкладки не имеет права применяться", () => {
    const t2lease = makeLease("userA", "tab2", NOW + LEASE_TTL_MS + 2000, "token-2");
    expect(canWriteLease(t2lease, "userA", "tab1", "token-1", NOW + LEASE_TTL_MS + 3000).ok).toBe(false);
  });
  it("битый lease fail-closed для записи, но допускает новую попытку захвата", () => {
    expect(canWriteLease("не json{", "u", "t", "token", NOW).ok).toBe(false);
    expect(canAcquireLease("не json{", NOW)).toBe(true);
    expect(parseLease("123")).toBe(null);
    expect(leaseAlive(null, NOW)).toBe(false);
  });
  it("fallback-захват общего store даёт ровно одного редактора", async () => {
    const ls = fakeLS();
    const now = () => NOW;
    const wait = () => Promise.resolve();
    const [a, b] = await Promise.all([
      claimFallbackLease(ls, "u", "tab-a", "token-a", { now, wait, verifyDelayMs: 0 }),
      claimFallbackLease(ls, "u", "tab-b", "token-b", { now, wait, verifyDelayMs: 0 }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const winner = parseLease(ls.getItem(EDIT_LEASE_KEY));
    expect(winner && ["token-a", "token-b"].includes(winner.token)).toBe(true);
  });
});

describe("mayUseLocalCopy — чтение локальной копии только владельцем (ТЗ rev11, тесты 1 и 7)", () => {
  it("тест 1 ТЗ: A аварийно закрыл вкладку с dirty-сметой → B её локальную копию НЕ читает (только облако)", () => {
    const markerA = makeDirtyMarker("userA", "tabA");
    // B (другой uid, другая вкладка): локальная копия A под запретом — все 4 источника getResult
    // (свежий кеш 30с, dirty-ветка, старый фоллбек, _mem) гейтятся этой функцией
    expect(mayUseLocalCopy(markerA, "userB", "tabB")).toBe(false);
    // и не отправляется: не в listFlushableDirty(B) и не в discardOwnedDirty(B)
    const ls = fakeLS();
    ls.setItem("titovstroy-estimates__dirty", markerA);
    expect(listFlushableDirty(ls, "userB", "tabB")).toEqual([]);
  });
  it("тест 7 ТЗ: локальное значение с чужим uid/tab не возвращается ни по одной ветке", () => {
    expect(mayUseLocalCopy(makeDirtyMarker("userA", "tab1"), "userA", "tab2")).toBe(false); // другая вкладка
    expect(mayUseLocalCopy(makeDirtyMarker("userA", "tab1"), "userB", "tab1")).toBe(false); // другой uid
    expect(mayUseLocalCopy(makeDirtyMarker("userA", "tab1"), "userA", "tab1")).toBe(true);  // своя
    expect(mayUseLocalCopy(null, "userA", "tab1")).toBe(true);                              // нет dirty — обычный кеш
    expect(mayUseLocalCopy(String(Date.now()), "userA", "tab1")).toBe(false);               // legacy: только ручная recovery-выгрузка
  });
});

describe("compactLocalStorageMirrors — освобождение места без потери черновиков", () => {
  it("удаляет подтвержденные зеркала и их timestamps", () => {
    const ls = fakeLS();
    const mem = { "titovstroy-estimates": "cached" };
    ls.setItem("titovstroy-estimates", "cached");
    ls.setItem("titovstroy-estimates__wts", "123");

    const result = utils.compactLocalStorageMirrors(ls, mem);

    expect(result.removed).toContain("titovstroy-estimates");
    expect(ls.getItem("titovstroy-estimates")).toBeNull();
    expect(ls.getItem("titovstroy-estimates__wts")).toBeNull();
    expect(mem["titovstroy-estimates"]).toBeUndefined();
  });

  it("сохраняет рабочее значение, если у него есть dirty-маркер", () => {
    const ls = fakeLS();
    const marker = makeDirtyMarker("u1", "tab1");
    ls.setItem("titovstroy-finance-tx", "unsynced");
    ls.setItem("titovstroy-finance-tx__wts", "123");
    ls.setItem("titovstroy-finance-tx__dirty", marker);

    const result = utils.compactLocalStorageMirrors(ls, {});

    expect(result.preservedDirty).toEqual(["titovstroy-finance-tx"]);
    expect(ls.getItem("titovstroy-finance-tx")).toBe("unsynced");
    expect(ls.getItem("titovstroy-finance-tx__dirty")).toBe(marker);
  });

  it("технические backup-ключи удаляет локально даже со старым dirty-маркером", () => {
    const ls = fakeLS();
    ls.setItem("titovstroy-workspace-backups", "huge-history");
    ls.setItem("titovstroy-workspace-backups__wts", "123");
    ls.setItem("titovstroy-workspace-backups__dirty", "legacy");
    ls.setItem("titovstroy-production-draft-v2:u1:o1", "real-draft");

    utils.compactLocalStorageMirrors(ls, {});

    expect(ls.getItem("titovstroy-workspace-backups")).toBeNull();
    expect(ls.getItem("titovstroy-workspace-backups__dirty")).toBeNull();
    expect(ls.getItem("titovstroy-production-draft-v2:u1:o1")).toBe("real-draft");
  });

  it("после подтвержденной облачной записи удаляет зеркало, но не чужой dirty", () => {
    const ls = fakeLS();
    const mem = { clean: "value", foreign: "other-value" };
    ls.setItem("clean", "value");
    ls.setItem("clean__wts", "123");
    ls.setItem("clean__dirty", makeDirtyMarker("u1", "tab1"));
    ls.setItem("foreign", "other-value");
    ls.setItem("foreign__wts", "123");
    ls.setItem("foreign__dirty", makeDirtyMarker("u2", "tab2"));

    expect(utils.clearSyncedLocalMirror(ls, mem, "clean", raw => mayClearDirtyOnSuccess(raw, "u1", "tab1"))).toBe(true);
    expect(utils.clearSyncedLocalMirror(ls, mem, "foreign", raw => mayClearDirtyOnSuccess(raw, "u1", "tab1"))).toBe(false);
    expect(ls.getItem("clean")).toBeNull();
    expect(ls.getItem("clean__dirty")).toBeNull();
    expect(ls.getItem("foreign")).toBe("other-value");
  });
});
