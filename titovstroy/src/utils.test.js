import { describe, it, expect } from "vitest";
import { normCN, CATALOG_DEFAULTS, withCatalogOverrides, groupData, tengeInWords, DEFAULT_FIN_META, mergeFinMeta, computeIssues, buildCalendarStages, foremanLoad, classifyCloudArr, classifyCloudObj, preBackupDecision, mergeAuditEntries, validateBackupSchema, isBackupRestorable, visibleDirtyKeys, resolveVerifiedCloudRead } from "./utils.js";

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
