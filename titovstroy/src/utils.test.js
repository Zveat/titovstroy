import { describe, it, expect } from "vitest";
import { normCN, CATALOG_DEFAULTS, withCatalogOverrides, groupData, tengeInWords, DEFAULT_FIN_META, mergeFinMeta, computeIssues, buildCalendarStages, foremanLoad, classifyCloudArr, classifyCloudObj, preBackupDecision, mergeAuditEntries, validateBackupSchema, isBackupRestorable } from "./utils.js";

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
  const good = () => ({ _type: "titovstroy-backup", data: { objects: [{ id: "o1" }], contracts: [{ id: 1 }], productions: [{ objectId: "o1" }], users: [{ id: "u1" }], financeMeta: { a: 1 }, prices: null, publicNodes: { kp: { e1: { v: 1 } }, progress: {}, docs: {} }, audit: { index: ["2026-07"], months: { "2026-07": [{ ts: 1, action: "изменил" }] }, legacy: [] } } });
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

  it("долг клиента считается как бюджет минус оплаты по договору", () => {
    const issues = computeIssues({
      objects:[{ id:"o1", status:"work", clientName:"Клиент" }],
      finProjects:[{ id:"fp1", objectId:"o1", contractNo:"1012", budget:1000000 }],
      financeTx:[{ id:"t1", type:"income", amount:400000, contractNo:"1012" }],
    }, { now });
    const debt = find(issues, "debt:fp1");
    expect(debt.length).toBe(1);
    expect(debt[0].title).toContain("600"); // 1 000 000 − 400 000 = 600 000
  });

  it("исключённые/удалённые операции не уменьшают долг", () => {
    const issues = computeIssues({
      finProjects:[{ id:"fp1", contractNo:"1012", budget:1000, rawStatus:"активен" }],
      financeTx:[
        { id:"t1", type:"income", amount:1000, contractNo:"1012", included:false },
        { id:"t2", type:"income", amount:500, contractNo:"1012", deletedAt: now },
      ],
    }, { now });
    const debt = find(issues, "debt:fp1");
    expect(debt.length).toBe(1); // долг остался 1000, обе операции не в счёт
  });

  it("замечание клиента (source=client, не done) → проблема; закрытое — нет", () => {
    const issues = computeIssues({
      objects:[{ id:"o1", status:"work" }],
      productions:[{ objectId:"o1", defects:[
        { id:"d1", text:"Скол на плитке", source:"client", done:false },
        { id:"d2", text:"Своё внутреннее", source:"client", done:true },
        { id:"d3", text:"Не от клиента", source:"internal", done:false },
      ] }],
    }, { now });
    expect(find(issues, "client-remark:o1").length).toBe(1);
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
