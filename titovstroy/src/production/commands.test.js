import { describe, it, expect, beforeEach } from "vitest";
import { applyProductionCommand, syncEstimateStages, _stageKey, diffProductionToCommands, buildFlushBatch, normalizeProductionIds, rebaseLocalProduction, createTxnApplier, accountProductionFailure, isBlockedWhileEnding, awaitQueueSettled } from "./commands.js";
import { flushPendingProduction, stopProductionSession, hasPendingProduction, productionDraftsAreDurable, startProductionSession, __prodQueueTesting } from "./ProductionModule.jsx";
import { countAllProductionRecovery, listProductionDrafts, listProductionRetries, productionDraftKey, saveProductionDraft, saveProductionRetry, removeProductionDraft, removeProductionRetry } from "./drafts.js";

const card = (over = {}) => ({ objectId: "o1", prodStatus: "active", stages: [], journal: [], defects: [], updatedAt: 1, ...over });

const fakeStore = () => {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(i) { return Array.from(data.keys())[i] ?? null; },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
  };
};

describe("applyProductionCommand — результат {list, ok, changed, reason}", () => {
  // 1. статус не стирает этапы
  it("set-status меняет только статус, этапы целы", () => {
    const r = applyProductionCommand([card({ stages: [{ id: "s1", status: "progress" }] })], { type: "set-status", objectId: "o1", status: "done", ts: 5 });
    expect(r.ok).toBe(true); expect(r.changed).toBe(true);
    expect(r.list[0].prodStatus).toBe("done");
    expect(r.list[0].stages).toEqual([{ id: "s1", status: "progress" }]);
  });
  // 2. этап не сбрасывает статус
  it("patch-item(stages) не трогает prodStatus", () => {
    const r = applyProductionCommand([card({ prodStatus: "paused", stages: [{ id: "s1", status: "todo" }] })], { type: "patch-item", objectId: "o1", field: "stages", itemId: "s1", patch: { status: "done" }, ts: 6 });
    expect(r.ok).toBe(true);
    expect(r.list[0].prodStatus).toBe("paused");
    expect(r.list[0].stages[0].status).toBe("done");
  });

  // Блокер 4: команда для ОТСУТСТВУЮЩЕЙ карточки — ошибка, а не тихий успех
  it("patch-card / set-status / patch-item по несуществующей карточке → ok:false (no-card)", () => {
    expect(applyProductionCommand([], { type: "patch-card", objectId: "x", patch: { note: "y" } }).ok).toBe(false);
    expect(applyProductionCommand([], { type: "set-status", objectId: "x", status: "done" }).ok).toBe(false);
    expect(applyProductionCommand([], { type: "patch-item", objectId: "x", field: "stages", itemId: "s1", patch: {} }).ok).toBe(false);
  });
  it("patch-item несуществующего элемента → ok:false (no-item), не тихий успех", () => {
    const r = applyProductionCommand([card({ stages: [{ id: "s1" }] })], { type: "patch-item", objectId: "o1", field: "stages", itemId: "НЕТ", patch: { x: 1 } });
    expect(r.ok).toBe(false); expect(r.reason).toBe("no-item");
  });

  // идемпотентность
  it("add-item дубль по id → ok:true, changed:false (не плодит)", () => {
    let list = [card()];
    const item = { id: "j1", text: "запись" };
    let r = applyProductionCommand(list, { type: "add-item", objectId: "o1", field: "journal", item, ts: 1 });
    expect(r.changed).toBe(true); list = r.list;
    r = applyProductionCommand(list, { type: "add-item", objectId: "o1", field: "journal", item, ts: 2 });
    expect(r.ok).toBe(true); expect(r.changed).toBe(false);
    expect(list[0].journal.filter(j => j.id === "j1").length).toBe(1);
  });
  it("remove-item отсутствующего → ok:true, changed:false", () => {
    const r = applyProductionCommand([card()], { type: "remove-item", objectId: "o1", field: "journal", itemId: "НЕТ" });
    expect(r.ok).toBe(true); expect(r.changed).toBe(false);
  });
  it("delete-production повторно → ok:true, changed:false", () => {
    let r = applyProductionCommand([card()], { type: "delete-production", objectId: "o1" });
    expect(r.list.length).toBe(0);
    r = applyProductionCommand(r.list, { type: "delete-production", objectId: "o1" });
    expect(r.ok).toBe(true); expect(r.changed).toBe(false);
  });
  it("create-if-missing не перезаписывает существующую", () => {
    const r = applyProductionCommand([card({ note: "важное" })], { type: "create-if-missing", objectId: "o1", record: { objectId: "o1", note: "" } });
    expect(r.list[0].note).toBe("важное"); expect(r.changed).toBe(false);
  });

  // Блокер 3: две записи журнала с разных «устройств» — обе сохраняются (granular add-item)
  it("две add-item в journal (разные id) — обе сохранены", () => {
    let list = [card()];
    list = applyProductionCommand(list, { type: "add-item", objectId: "o1", field: "journal", item: { id: "j1", text: "с устройства A" }, ts: 1 }).list;
    list = applyProductionCommand(list, { type: "add-item", objectId: "o1", field: "journal", item: { id: "j2", text: "с устройства B" }, ts: 2 }).list;
    expect(list[0].journal.map(j => j.id).sort()).toEqual(["j1", "j2"]);
  });

  // merge-client-remarks: дедуп по clientRemarkId внутри команды
  it("merge-client-remarks добавляет только новые (дедуп по clientRemarkId)", () => {
    const list = [card({ defects: [{ id: "cr_r1", clientRemarkId: "r1", text: "уже есть" }] })];
    const r = applyProductionCommand(list, { type: "merge-client-remarks", objectId: "o1", remarks: [{ id: "cr_r1", clientRemarkId: "r1", text: "дубль" }, { id: "cr_r2", clientRemarkId: "r2", text: "новое" }] });
    expect(r.changed).toBe(true);
    expect(r.list[0].defects.filter(d => d.clientRemarkId === "r1").length).toBe(1);
    expect(r.list[0].defects.some(d => d.clientRemarkId === "r2")).toBe(true);
  });
});

describe("batch — атомарный набор команд (одно пользовательское сохранение)", () => {
  it("применяет все под-команды; ensureRecord создаёт карточку, если её нет", () => {
    const base = card({ objectId: "o9", note: "" });
    const batch = { type: "batch", objectId: "o9", ensureRecord: base, commands: [
      { type: "patch-card", objectId: "o9", patch: { note: "тест" } },
      { type: "add-item", objectId: "o9", field: "journal", item: { id: "j1", text: "x" } },
    ], ts: 1 };
    const r = applyProductionCommand([], batch);
    expect(r.ok).toBe(true);
    expect(r.list[0].note).toBe("тест");
    expect(r.list[0].journal[0].id).toBe("j1");
  });
  it("любая невалидная под-команда откатывает ВЕСЬ batch (ok:false, список исходный)", () => {
    const before = [card({ objectId: "o1", note: "orig" })];
    const batch = { type: "batch", objectId: "o1", commands: [
      { type: "patch-card", objectId: "o1", patch: { note: "новое" } },
      { type: "patch-item", objectId: "o1", field: "stages", itemId: "НЕТ", patch: {} }, // невалидна
    ], ts: 1 };
    const r = applyProductionCommand(before, batch);
    expect(r.ok).toBe(false);
    expect(r.list).toEqual(before); // откат — note НЕ изменился
  });
});

describe("syncEstimateStages — ручной этап с именем как в смете НЕ трогается (блокер автосинка)", () => {
  it("ручная «Стяжка» без estimateKey: не адоптируется, не обновляется, не удаляется, дубль не добавляется", () => {
    const cardWith = { stages: [{ id: "m1", cat: "Черновые", name: "Стяжка", qty: 10, priceClient: 5, costPlan: 3 }] }; // ручной, нет fromEst/estimateKey
    const built = [{ id: "e1", estimateKey: "черновые|стяжка", cat: "Черновые", name: "Стяжка", qty: 40, priceClient: 100, costPlan: 60, unit: "м²" }];
    const r = syncEstimateStages(cardWith, built);
    const manual = r.stages.find(s => s.id === "m1");
    expect(manual.fromEst).toBeUndefined();      // НЕ усыновлён
    expect(manual.qty).toBe(10);                 // НЕ перезаписан цифрами сметы
    // имя занято ручным этапом → отдельный сметный НЕ добавляется (нет дубля по имени)
    expect(r.stages.filter(s => _stageKey(s) === "черновые|стяжка").length).toBe(1);
    expect(r.stages.some(s => s.id === "e1")).toBe(false);
  });
  it("после удаления позиции из сметы ручной этап остаётся, сметный (fromEst+estimateKey) уходит", () => {
    const cardWith = { stages: [
      { id: "m1", cat: "A", name: "Ручное" },
      { id: "e1", cat: "Черновые", name: "Стяжка", estimateKey: "черновые|стяжка", fromEst: true, qty: 40 },
    ] };
    const r = syncEstimateStages(cardWith, []); // смета опустела
    expect(r.stages.some(s => s.id === "m1")).toBe(true);  // ручной цел
    expect(r.stages.some(s => s.id === "e1")).toBe(false); // сметный убран
  });
  // Блокер 2: старый сметный этап (fromEst:true, но БЕЗ estimateKey) не дублируется и не «усыновляется»
  it("легаси fromEst без estimateKey: не дублируется рядом и не удаляется", () => {
    const cardWith = { stages: [{ id: "old1", cat: "Черновые", name: "Стяжка", fromEst: true, qty: 40 }] }; // легаси: fromEst без estimateKey
    const built = [{ id: "e1", estimateKey: "черновые|стяжка", cat: "Черновые", name: "Стяжка", qty: 45, priceClient: 100, costPlan: 60, unit: "м²" }];
    const r = syncEstimateStages(cardWith, built);
    expect(r.stages.filter(s => _stageKey(s) === "черновые|стяжка").length).toBe(1); // НЕ два
    const old = r.stages.find(s => s.id === "old1");
    expect(old).toBeTruthy();               // легаси сохранён
    expect(old.estimateKey).toBeUndefined(); // НЕ усыновлён (estimateKey не проставлен)
    expect(old.qty).toBe(40);               // цифры не перезаписаны
  });
  it("сметный этап обновляет цифры, сохраняет сроки/статус/ответственного", () => {
    const cardWith = { stages: [{ id: "e1", estimateKey: "a|b", fromEst: true, cat: "A", name: "B", qty: 1, priceClient: 1, costPlan: 1, planEnd: "2026-08-01", status: "progress", responsible: "П" }] };
    const built = [{ id: "e1b", estimateKey: "a|b", cat: "A", name: "B", qty: 5, priceClient: 9, costPlan: 4, unit: "м" }];
    const r = syncEstimateStages(cardWith, built);
    const s = r.stages.find(x => x.estimateKey === "a|b");
    expect(s.qty).toBe(5); expect(s.priceClient).toBe(9);
    expect(s.planEnd).toBe("2026-08-01"); expect(s.status).toBe("progress"); expect(s.responsible).toBe("П");
  });
});

describe("diffProductionToCommands — granular по всем массивам", () => {
  it("правка журнала → patch-item(journal), а не patch-card целым массивом", () => {
    const prev = { objectId: "o1", journal: [{ id: "j1", text: "a" }] };
    const next = { objectId: "o1", journal: [{ id: "j1", text: "b" }] };
    expect(diffProductionToCommands(prev, next, "o1", 1)).toEqual([{ type: "patch-item", objectId: "o1", field: "journal", itemId: "j1", patch: { text: "b" }, ts: 1 }]);
  });
  it("добавление дефекта → add-item(defects)", () => {
    const prev = { objectId: "o1", defects: [] };
    const next = { objectId: "o1", defects: [{ id: "d1", text: "скол" }] };
    expect(diffProductionToCommands(prev, next, "o1", 2)).toEqual([{ type: "add-item", objectId: "o1", field: "defects", item: { id: "d1", text: "скол" }, ts: 2 }]);
  });
  it("скалярное поле → patch-card только с ним", () => {
    const prev = { objectId: "o1", note: "", stages: [] };
    const next = { objectId: "o1", note: "x", stages: [] };
    expect(diffProductionToCommands(prev, next, "o1", 3)).toEqual([{ type: "patch-card", objectId: "o1", patch: { note: "x" }, ts: 3 }]);
  });
  it("элементы без id игнорируются (адресовать нельзя) — их нормализует normalizeProductionIds", () => {
    const prev = { objectId: "o1", stages: [{ name: "без id" }] };
    const next = { objectId: "o1", stages: [{ name: "без id" }, { id: "s2", name: "с id" }] };
    const cmds = diffProductionToCommands(prev, next, "o1", 4);
    expect(cmds).toEqual([{ type: "add-item", objectId: "o1", field: "stages", item: { id: "s2", name: "с id" }, ts: 4 }]);
  });
  it("buildFlushBatch собирает один batch БЕЗ ensureRecord (не воскрешает удалённую карточку); null если нечего", () => {
    const base = { objectId: "o1", note: "a", stages: [] };
    expect(buildFlushBatch(base, base, "o1", 1)).toBe(null);
    const b = buildFlushBatch(base, { ...base, note: "b" }, "o1", 1);
    expect(b.type).toBe("batch"); expect(b.ensureRecord).toBeUndefined();
    expect(b.commands).toEqual([{ type: "patch-card", objectId: "o1", patch: { note: "b" }, ts: 1 }]);
  });
  it("блокер 5: batch правок по УДАЛЁННОЙ карточке откатывается (no-card), карточка не воскресает", () => {
    const b = buildFlushBatch({ objectId: "o1", note: "a" }, { objectId: "o1", note: "b" }, "o1", 1);
    const r = applyProductionCommand([], b); // карточки нет (удалена другим устройством)
    expect(r.ok).toBe(false);
    expect(r.list).toEqual([]); // не создалась
  });
  it("круговой инвариант: применение команд диффа к prev даёт next", () => {
    const prev = { objectId: "o1", note: "a", stages: [{ id: "s1", status: "todo" }, { id: "s2" }], journal: [] };
    const next = { objectId: "o1", note: "b", stages: [{ id: "s1", status: "done" }, { id: "s3", name: "new" }], journal: [{ id: "j1", text: "x" }] };
    let list = [prev];
    for (const cmd of diffProductionToCommands(prev, next, "o1", 9)) list = applyProductionCommand(list, cmd).list;
    const got = list[0];
    expect(got.note).toBe("b");
    expect(got.stages.find(s => s.id === "s1").status).toBe("done");
    expect(got.stages.some(s => s.id === "s2")).toBe(false);
    expect(got.stages.some(s => s.id === "s3")).toBe(true);
    expect(got.journal.some(j => j.id === "j1")).toBe(true);
  });
});

describe("normalizeProductionIds — детерминированные id старым элементам без id / с дублями", () => {
  it("присваивает детерминированные content-id без id и дублям; уникальны", () => {
    const list = [{ objectId: "o1", stages: [{ name: "без id" }, { id: "dup" }, { id: "dup" }], journal: [{ id: "j1" }] }];
    const r = normalizeProductionIds(list);
    expect(r.changed).toBe(true);
    const ids = r.list[0].stages.map(s => s.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toMatch(/^auto:stages:/);
    expect(r.list[0].journal[0].id).toBe("j1"); // уже с id — не тронут
  });
  it("детерминизм: повтор на том же входе даёт тот же результат", () => {
    const list = [{ objectId: "o1", stages: [{ name: "x" }, { name: "y" }] }];
    expect(normalizeProductionIds(list).list).toEqual(normalizeProductionIds(list).list);
  });
  it("если все элементы уже с уникальными id — changed:false", () => {
    const list = [{ objectId: "o1", stages: [{ id: "s1" }, { id: "s2" }] }];
    expect(normalizeProductionIds(list).changed).toBe(false);
  });
  it("нормализация НЕ теряет содержимое элементов (свежая серверная правка переживает)", () => {
    const list = [{ objectId: "o1", stages: [{ name: "важное", qty: 42 }, { id: "s2", note: "серверное" }] }];
    const r = normalizeProductionIds(list);
    expect(r.list[0].stages[0].qty).toBe(42);
    expect(r.list[0].stages[0].name).toBe("важное");
    expect(r.list[0].stages[1].note).toBe("серверное");
  });
  it("команда normalize-ids применяется к списку (свежему внутри транзакции)", () => {
    const r = applyProductionCommand([{ objectId: "o1", stages: [{ name: "нет id" }] }], { type: "normalize-ids" });
    expect(r.ok).toBe(true); expect(r.changed).toBe(true);
    expect(r.list[0].stages[0].id).toMatch(/^auto:stages:/);
  });
  it("КОЛЛИЗИЯ: существующий content-id не даёт дубля при нормализации", () => {
    const candidate = normalizeProductionIds([{ objectId: "x", stages: [{ name: "b" }] }]).list[0].stages[0].id;
    const list = [{ objectId: "o1", stages: [{ id: candidate, name: "a" }, { name: "b" }] }];
    const r = normalizeProductionIds(list);
    const ids = r.list[0].stages.map(s => s.id);
    expect(new Set(ids).size).toBe(2); // все уникальны
    expect(ids[0]).toBe(candidate); // существующий id НЕ тронут
    expect(ids[1]).toBe(candidate + "_"); // детерминированный суффикс
    // детерминизм сохраняется и с суффиксами
    expect(normalizeProductionIds(list).list).toEqual(r.list);
  });
  it("КОЛЛИЗИЯ наоборот: кандидат занят более ранним элементом — уникальность сохраняется", () => {
    const candidate = normalizeProductionIds([{ objectId: "x", stages: [{ name: "x" }] }]).list[0].stages[0].id;
    const list = [{ objectId: "o1", stages: [{ name: "x" }, { id: candidate, name: "y" }] }];
    const r = normalizeProductionIds(list);
    const ids = r.list[0].stages.map(s => s.id);
    expect(new Set(ids).size).toBe(2);
  });
  it("дублирующий сохранённый id после перестановки не меняет адресацию элементов", () => {
    const first = [{ objectId: "o1", stages: [
      { id: "dup", name: "Стяжка" }, { id: "dup", name: "Штукатурка" }] }];
    const reversed = [{ objectId: "o1", stages: [
      { id: "dup", name: "Штукатурка" }, { id: "dup", name: "Стяжка" }] }];
    const a = normalizeProductionIds(first).list[0].stages;
    const b = normalizeProductionIds(reversed).list[0].stages;
    expect(a.find(s => s.name === "Стяжка").id).toBe(b.find(s => s.name === "Стяжка").id);
    expect(a.find(s => s.name === "Штукатурка").id).toBe(b.find(s => s.name === "Штукатурка").id);
    expect(a[0].id).not.toBe("dup");
    expect(a[1].id).not.toBe("dup");
  });
});

describe("legacy-элементы без id — нормализация только при явном сохранении", () => {
  const legacy = card({ stages: [{ name: "Стяжка", note: "" }, { name: "Штукатурка", note: "" }] });

  it("простое открытие (только локальные id) не создаёт команду и ничего не пишет", () => {
    const localView = normalizeProductionIds([legacy]).list[0];
    expect(buildFlushBatch(legacy, localView, "o1", 10)).toBeNull();
  });

  it("явная правка legacy-этапа: normalize-card-ids и patch-item проходят одним атомарным batch", () => {
    const local = normalizeProductionIds([legacy]).list[0];
    const firstId = local.stages[0].id;
    local.stages = local.stages.map((s, i) => i === 0 ? { ...s, note: "готово" } : s);
    const batch = buildFlushBatch(legacy, local, "o1", 11);
    expect(batch.commands.map(c => c.type)).toEqual(["normalize-card-ids", "patch-item"]);
    const result = applyProductionCommand([legacy], batch);
    expect(result.ok).toBe(true);
    expect(result.list[0].stages).toHaveLength(2);
    expect(result.list[0].stages[0].id).toBe(firstId);
    expect(result.list[0].stages[0].note).toBe("готово");
  });

  it("удаление legacy-элемента адресуется сохранённым локальным id и не сдвигает соседний", () => {
    const local = normalizeProductionIds([legacy]).list[0];
    const [firstId, secondId] = local.stages.map(s => s.id);
    local.stages = local.stages.filter(s => s.id !== firstId);
    const result = applyProductionCommand([legacy], buildFlushBatch(legacy, local, "o1", 12));
    expect(result.ok).toBe(true);
    expect(result.list[0].stages).toEqual([{ id: secondId, name: "Штукатурка", note: "" }]);
  });
});

describe("_stageKey", () => {
  it("cat|name в нижнем регистре, тримит части", () => {
    expect(_stageKey({ cat: "Черновые", name: " Стяжка " })).toBe("черновые|стяжка");
  });
});

// ── Сценарии аудитора rev3 → rev4 ──
describe("новая карточка: единый record для UI и создания (блокер 1)", () => {
  const draft = { objectId: "oNew", prodStatus: "new", stages: [], journal: [], defects: [],
    checklistLaunch: [{ id: "cl1", text: "ГПР", done: false }, { id: "cl2", text: "Смета", done: false }], checklistHandover: [] };
  it("быстрая правка чек-листа: batch с ensureRecord создаёт карточку и patch-item по ТЕМ ЖЕ id проходит", () => {
    // local = draft + пользователь отметил пункт cl1 (id из ТОГО ЖЕ draft, что уйдёт в ensureRecord)
    const local = { ...draft, checklistLaunch: [{ id: "cl1", text: "ГПР", done: true }, { id: "cl2", text: "Смета", done: false }] };
    const batch = buildFlushBatch(draft, local, "oNew", 111);
    batch.ensureRecord = draft; // как делает flush для ни разу не подтверждённой карточки
    const r = applyProductionCommand([], batch);
    expect(r.ok).toBe(true);
    const card = r.list.find(p => p.objectId === "oNew");
    expect(card).toBeTruthy();
    expect(card.checklistLaunch.find(i => i.id === "cl1").done).toBe(true); // правка НЕ потеряна
  });
  it("повтор создания идемпотентен: карточка уже появилась — не перезаписывается", () => {
    const existing = { objectId: "oNew", prodStatus: "active", stages: [{ id: "s1", name: "живой этап" }] };
    const r = applyProductionCommand([existing], { type: "create-if-missing", objectId: "oNew", record: draft });
    expect(r.ok).toBe(true); expect(r.changed).toBe(false);
    expect(r.list[0].prodStatus).toBe("active"); // существующая карточка нетронута
  });
});

describe("база из подтверждённого, не из props (блокер 2 — репро аудитора)", () => {
  it("дифф от ПОДТВЕРЖДЁННОЙ базы не отправляет заново чужую правку note", () => {
    // другое устройство сменило note B→D; подтверждённая база уже с D; пользователь менял ТОЛЬКО responsible
    const confirmedBase = { objectId: "o1", stages: [{ id: "s1", note: "D", responsible: "" }] };
    const local = { objectId: "o1", stages: [{ id: "s1", note: "D", responsible: "Аскар" }] };
    const batch = buildFlushBatch(confirmedBase, local, "o1", 5);
    const patches = batch.commands.filter(c => c.type === "patch-item");
    expect(patches).toHaveLength(1);
    expect(patches[0].patch).toEqual({ responsible: "Аскар" }); // note НЕ шлётся → D не затирается
  });
  it("АНТИпример (старое поведение): дифф от устаревшей базы затёр бы note=D — фиксируем, зачем нужна подтверждённая база", () => {
    const staleBase = { objectId: "o1", stages: [{ id: "s1", note: "B", responsible: "" }] };
    const local = { objectId: "o1", stages: [{ id: "s1", note: "B", responsible: "Аскар" }] };
    const server = [{ objectId: "o1", stages: [{ id: "s1", note: "D", responsible: "" }] }];
    const batch = buildFlushBatch(staleBase, local, "o1", 5);
    const r = applyProductionCommand(server, batch);
    expect(r.list[0].stages[0].note).toBe("D"); // с подтверждённой базой note не входит в дифф — D живёт
  });
});

describe("отмена правки после ошибки: batch null (пункт 4)", () => {
  it("пользователь вернул значение назад — buildFlushBatch даёт null (flush снимет changeId через resolve-change)", () => {
    const base = { objectId: "o1", prodStatus: "active", stages: [{ id: "s1", note: "X" }] };
    const local = { ...base, stages: [{ id: "s1", note: "X" }] }; // всё вернулось как было
    expect(buildFlushBatch(base, local, "o1", 7)).toBeNull();
  });
});

describe("createTxnApplier — перезапуск колбэка транзакции (блокер rev4 №1)", () => {
  it("null(холодный кеш) → реальные данные → успех: notOk прошлого прогона СБРОШЕН", () => {
    const applier = createTxnApplier({ type: "patch-card", objectId: "o1", patch: { brigade: "А" }, ts: 1 });
    // прогон 1: холодный кеш — mutateTransaction передал пустой список
    expect(applier.mutate([])).toBeUndefined();
    expect(applier.state.notOk).toBe("no-card");
    // прогон 2: SDK перезапустил колбэк с реальными данными сервера
    const second = applier.mutate([{ objectId: "o1", brigade: "" }]);
    expect(Array.isArray(second)).toBe(true);
    expect(second[0].brigade).toBe("А");
    expect(applier.state.notOk).toBeNull(); // ← репро аудитора: раньше залипал "no-card"
    expect(applier.state.notOkList).toBeNull();
  });
  it("обратный порядок: успех → повтор с конфликтом — notOk последнего прогона", () => {
    const applier = createTxnApplier({ type: "set-status", objectId: "o1", status: "active", ts: 1 });
    expect(Array.isArray(applier.mutate([{ objectId: "o1", prodStatus: "new" }]))).toBe(true);
    expect(applier.state.notOk).toBeNull();
    expect(applier.mutate([])).toBeUndefined(); // карточка исчезла к пере-прогону
    expect(applier.state.notOk).toBe("no-card");
  });
});

describe("жизненный цикл module-scope очереди (блокеры rev5 №1–2)", () => {
  const Q = __prodQueueTesting;
  const setPending = () => {
    Q.pending.set("o1", { base: { objectId: "o1", brigade: "" }, local: { objectId: "o1", brigade: "А" }, rev: 1, ensure: null });
    Q.revs.set("o1", 1);
  };
  beforeEach(() => { stopProductionSession(); }); // изоляция: чистое состояние + новая сессия

  it("сетевая ошибка: pending СОХРАНЯЕТСЯ; повтор после восстановления сети дожимает", async () => {
    Q.setCmd(async () => ({ committed: false })); // сеть недоступна
    setPending();
    await Q.flushObj("o1");
    expect(hasPendingProduction()).toBe(1); // правка НЕ потеряна при ошибке
    Q.setCmd(async () => ({ committed: true, list: [{ objectId: "o1", brigade: "А" }] })); // сеть вернулась
    await flushPendingProduction();
    expect(hasPendingProduction()).toBe(0);
    expect(Q.confirmed.get("o1")?.brigade).toBe("А"); // подтверждённая база заполнена
  });

  it("logout во время запроса: поздний ответ остановленной сессии НЕ воскрешает состояние", async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    Q.setCmd(async () => { await gate; return { committed: true, list: [{ objectId: "o1", brigade: "А" }] }; });
    setPending();
    const p = Q.flushObj("o1"); // запрос ушёл и висит
    stopProductionSession();    // logout: инкремент сессии + очистка
    release();                  // ответ пришёл ПОСЛЕ остановки
    await p;
    expect(Q.confirmed.size).toBe(0); // ответ чужой сессии ничего не записал (раньше заполнял confirmed)
    expect(hasPendingProduction()).toBe(0);
  });

  it("flushPendingProduction РЕАЛЬНО ждёт завершения записи, а не первой попытки", async () => {
    let release;
    Q.setCmd(() => new Promise(r => { release = () => r({ committed: true, list: [{ objectId: "o1", brigade: "А" }] }); }));
    setPending();
    let done = false;
    const p = flushPendingProduction().then(() => { done = true; });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); // микротаски
    expect(done).toBe(false); // запись ещё идёт — промис держится
    release();
    await p;
    expect(done).toBe(true);
    expect(hasPendingProduction()).toBe(0);
  });

  it("single-flight: повторный flush того же объекта возвращает ТОТ ЖЕ Promise", async () => {
    let release;
    Q.setCmd(() => new Promise(r => { release = () => r({ committed: true, list: [{ objectId: "o1", brigade: "А" }] }); }));
    setPending();
    const p1 = Q.flushObj("o1");
    const p2 = Q.flushObj("o1");
    expect(p1).toBe(p2); // ожидающие ждут ОДИН фактический flush, а не выходят сразу
    release();
    await p1;
  });

  it("stopProductionSession идемпотентен и оставляет очередь пустой", async () => {
    stopProductionSession();
    stopProductionSession();
    const results = await flushPendingProduction();
    expect(results).toEqual([]);
  });

  it("flushPendingProduction ждёт и resolve-change (отмена правки), не только запись", async () => {
    let release; let resolveChangeSeen = null;
    Q.setCmd((cmd) => new Promise(r => {
      resolveChangeSeen = cmd.type;
      release = () => r({ committed: true, list: [] });
    }));
    // base === local (правку откатили) и ensure нет → путь resolve-change
    const same = { objectId: "o1", brigade: "" };
    Q.pending.set("o1", { base: same, local: same, rev: 1, ensure: null });
    Q.revs.set("o1", 1);
    let done = false;
    const p = flushPendingProduction().then(() => { done = true; });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(resolveChangeSeen).toBe("resolve-change");
    expect(done).toBe(false); // ждём снятия баннера, а не выходим сразу
    release();
    await p;
    expect(done).toBe(true);
    expect(hasPendingProduction()).toBe(0);
  });
});

describe("App-очередь при завершении сессии (блокер rev7 №2)", () => {
  it("isBlockedWhileEnding: новые bg_ блокируются, повторы финального флеша и cm_/resolve-change — нет", () => {
    expect(isBlockedWhileEnding({ type: "set-status", changeId: "bg_status_o1" }, true)).toBe(true);
    expect(isBlockedWhileEnding({ type: "set-status", changeId: "bg_status_o1", __retryFlush: true }, true)).toBe(false);
    expect(isBlockedWhileEnding({ type: "batch", changeId: "cm_o1" }, true)).toBe(false);
    expect(isBlockedWhileEnding({ type: "resolve-change", changeId: "bg_sync_o1" }, true)).toBe(false);
    expect(isBlockedWhileEnding({ type: "set-status", changeId: "bg_status_o1" }, false)).toBe(false); // штатный режим
    expect(isBlockedWhileEnding({ type: "normalize-ids" }, true)).toBe(false); // без changeId не блокируем
  });
  it("awaitQueueSettled ждёт ЦИКЛОМ: задача, добавленная во время ожидания хвоста, тоже дожидается", async () => {
    let tail = Promise.resolve();
    const done = [];
    const enqueue = (name, ms) => {
      tail = tail.then(() => new Promise(r => setTimeout(() => { done.push(name); r(); }, ms)));
      return tail;
    };
    enqueue("a", 5);
    // пока ждём «a», в очередь прилетает «b» (репро аудитора: bg_ добавили во время дожима хвоста)
    setTimeout(() => enqueue("b", 5), 1);
    const settled = await awaitQueueSettled(() => tail);
    expect(settled).toBe(true);
    expect(done).toEqual(["a", "b"]); // одиночный await поймал бы только «a»
  });
  it("awaitQueueSettled: предохранитель от бесконечно растущей очереди", async () => {
    let tail = Promise.resolve();
    const grow = () => { tail = tail.then(() => new Promise(r => setTimeout(() => { grow(); r(); }, 1))); };
    grow();
    const settled = await awaitQueueSettled(() => tail, 3);
    expect(settled).toBe(false); // не зависаем навечно — сообщаем, что не устоялась
  });
});

describe("accountProductionFailure — учёт changeId при неудачах (блокер rev6 №2)", () => {
  const mk = () => ({ unsynced: new Set(), retry: new Map() });
  it("bg_: сетевая ошибка → в «ожидающие» и в очередь повтора", () => {
    const s = mk();
    const r = accountProductionFailure({ changeId: "bg_status_o1", conflict: false, command: { type: "set-status" } }, s);
    expect(s.unsynced.has("bg_status_o1")).toBe(true);
    expect(s.retry.has("bg_status_o1")).toBe(true);
    expect(r.cloudIssue).toBe(true);
  });
  it("РЕПРО аудитора: bg_ «сеть упала → команда стала неактуальна» — id снимается ПОЛНОСТЬЮ", () => {
    const s = mk();
    // 1) сетевая ошибка: id завис в обоих учётах
    accountProductionFailure({ changeId: "bg_sync_o1", conflict: false, command: { type: "sync-estimate-stages" } }, s);
    expect(s.unsynced.has("bg_sync_o1")).toBe(true);
    // 2) повтор упёрся в конфликт (карточку удалили): повторов больше не будет —
    //    id обязан уйти и из retry, И из unsynced (раньше баннер зависал навсегда)
    accountProductionFailure({ changeId: "bg_sync_o1", conflict: true, command: { type: "sync-estimate-stages" } }, s);
    expect(s.retry.has("bg_sync_o1")).toBe(false);
    expect(s.unsynced.has("bg_sync_o1")).toBe(false);
    expect(s.unsynced.size).toBe(0); // счётчик обнулится, баннер погаснет
  });
  it("cm_: конфликт остаётся в «ожидающих» (модуль перебазирует и повторит тем же id)", () => {
    const s = mk();
    accountProductionFailure({ changeId: "cm_o1", conflict: true, command: { type: "batch" } }, s);
    expect(s.unsynced.has("cm_o1")).toBe(true);
    expect(s.retry.size).toBe(0); // batch App не ретраит — модуль сам
  });
  it("без changeId: конфликт — не облачная проблема, сеть — облачная", () => {
    const s = mk();
    expect(accountProductionFailure({ changeId: null, conflict: true, command: {} }, s).cloudIssue).toBe(false);
    expect(accountProductionFailure({ changeId: null, conflict: false, command: {} }, s).cloudIssue).toBe(true);
    expect(s.unsynced.size).toBe(0);
  });
});

describe("rebaseLocalProduction — конфликтный batch не зацикливается и ничего не теряет", () => {
  const oldBase = { objectId: "o1", brigade: "", stages: [
    { id: "s1", name: "Стяжка", note: "" }, { id: "s2", name: "Штукатурка", note: "" }, { id: "s3", name: "Плитка", note: "" }] };
  it("правленный элемент удалён на сервере → БЕЗ колбэка восстанавливается (default restore)", () => {
    const local = { ...oldBase, stages: [
      { id: "s1", name: "Стяжка", note: "ПРАВКА" }, { id: "s2", name: "Штукатурка", note: "" }, { id: "s3", name: "Плитка", note: "" }] };
    const server = { objectId: "o1", brigade: "", stages: [{ id: "s2", name: "Штукатурка", note: "" }, { id: "s3", name: "Плитка", note: "" }] }; // s1 удалён удалённо
    const merged = rebaseLocalProduction(oldBase, local, server, "o1");
    expect(merged.stages.find(s => s.id === "s1")?.note).toBe("ПРАВКА"); // правка пользователя жива
  });
  it("onDeletedConflict='restore' — восстановить мою версию; 'drop' — принять чужое удаление", () => {
    const local = { ...oldBase, stages: [
      { id: "s1", name: "Стяжка", note: "ПРАВКА" }, { id: "s2", name: "Штукатурка", note: "" }, { id: "s3", name: "Плитка", note: "" }] };
    const server = { objectId: "o1", brigade: "", stages: [{ id: "s2", name: "Штукатурка", note: "" }, { id: "s3", name: "Плитка", note: "" }] };
    const seen = [];
    const restored = rebaseLocalProduction(oldBase, local, server, "o1", { onDeletedConflict: (f, it) => { seen.push([f, it.id]); return "restore"; } });
    expect(restored.stages.some(s => s.id === "s1")).toBe(true);
    expect(seen).toEqual([["stages", "s1"]]); // конфликт показан пользователю ровно один раз
    const dropped = rebaseLocalProduction(oldBase, local, server, "o1", { onDeletedConflict: () => "drop" });
    expect(dropped.stages.some(s => s.id === "s1")).toBe(false); // чужое удаление принято осознанно
  });
  it("удалённо ДОБАВЛЕННЫЕ элементы сохраняются, удалённые ПОЛЬЗОВАТЕЛЕМ — удаляются, скаляры переносятся", () => {
    const local = { ...oldBase, brigade: "Бригада А", stages: [
      { id: "s1", name: "Стяжка", note: "" }, { id: "s3", name: "Плитка", note: "" }] }; // пользователь удалил s2
    const server = { objectId: "o1", brigade: "", stages: [
      { id: "s1", name: "Стяжка", note: "" }, { id: "s2", name: "Штукатурка", note: "" }, { id: "s3", name: "Плитка", note: "" },
      { id: "s9", name: "Новый удалённый этап", note: "" }] }; // s9 добавлен с другого устройства
    const merged = rebaseLocalProduction(oldBase, local, server, "o1");
    expect(merged.brigade).toBe("Бригада А");
    expect(merged.stages.some(s => s.id === "s2")).toBe(false); // удаление пользователя применено
    expect(merged.stages.some(s => s.id === "s9")).toBe(true);  // чужое добавление НЕ потеряно
  });
  it("legacy без id: перестановка строк на сервере не направляет правку в соседний этап", () => {
    const base = { objectId: "o1", stages: [
      { name: "Стяжка", note: "" }, { name: "Штукатурка", note: "" }] };
    const local = normalizeProductionIds([base]).list[0];
    local.stages = local.stages.map(s => s.name === "Стяжка" ? { ...s, note: "ПРАВКА" } : s);
    const server = { objectId: "o1", stages: [
      { name: "Штукатурка", note: "" }, { name: "Стяжка", note: "" }] };
    const merged = rebaseLocalProduction(base, local, server, "o1");
    expect(merged.stages.find(s => s.name === "Стяжка").note).toBe("ПРАВКА");
    expect(merged.stages.find(s => s.name === "Штукатурка").note).toBe("");
  });
  it("legacy без id: удалённый правленный этап даёт явный restore/drop, а не правит соседа", () => {
    const base = { objectId: "o1", stages: [
      { name: "Стяжка", note: "" }, { name: "Штукатурка", note: "" }] };
    const local = normalizeProductionIds([base]).list[0];
    local.stages = local.stages.map(s => s.name === "Стяжка" ? { ...s, note: "ПРАВКА" } : s);
    const server = { objectId: "o1", stages: [{ name: "Штукатурка", note: "" }] };
    const conflicts = [];
    const dropped = rebaseLocalProduction(base, local, server, "o1", {
      onDeletedConflict: (field, item) => { conflicts.push([field, item.name]); return "drop"; },
    });
    expect(conflicts).toEqual([["stages", "Стяжка"]]);
    expect(dropped.stages).toHaveLength(1);
    expect(dropped.stages[0].name).toBe("Штукатурка");
    expect(dropped.stages[0].note).toBe("");
    const restored = rebaseLocalProduction(base, local, server, "o1", {
      onDeletedConflict: () => "restore",
    });
    expect(restored.stages.find(s => s.name === "Стяжка")?.note).toBe("ПРАВКА");
  });
});

describe("этап 2Б — durable-черновики производства после reload/crash", () => {
  const entry = (rev = 1, brigade = "А") => ({
    base: card({ brigade: "" }),
    local: card({ brigade }),
    rev,
    ensure: null,
  });

  beforeEach(() => { stopProductionSession(); });

  it("черновики изолированы по uid и битые записи не восстанавливаются", () => {
    const store = fakeStore();
    expect(saveProductionDraft(store, "userA", "o1", entry(1), 100)).toBe(true);
    expect(listProductionDrafts(store, "userA")).toHaveLength(1);
    expect(listProductionDrafts(store, "userB")).toEqual([]);
    store.setItem("titovstroy-production-draft-v2:broken", "{bad");
    expect(listProductionDrafts(store, "userA")).toHaveLength(1);
  });
  it("массовый restore видит исполнимые черновики и ретраи ВСЕХ пользователей", () => {
    const store = fakeStore();
    saveProductionDraft(store, "userA", "o1", entry(1), 100);
    saveProductionRetry(store, "userB", { type: "set-status", objectId: "o2", status: "done", changeId: "bg_status_o2" }, 101);
    store.setItem("titovstroy-production-draft-v2:broken", "{bad");
    const count = countAllProductionRecovery(store);
    expect(count).toEqual({ drafts: 1, retries: 1, total: 2 });
  });

  it("удаление по подтверждённой revision не стирает более новый ввод", () => {
    const store = fakeStore();
    saveProductionDraft(store, "u", "o1", entry(3, "новее"), 300);
    expect(removeProductionDraft(store, "u", "o1", 2)).toBe(false);
    expect(store.getItem(productionDraftKey("u", "o1"))).not.toBeNull();
    expect(removeProductionDraft(store, "u", "o1", 3)).toBe(true);
    expect(store.getItem(productionDraftKey("u", "o1"))).toBeNull();
  });

  it("crash/reload: pending поднимается, ошибка сети оставляет draft, успех удаляет", async () => {
    const store = fakeStore();
    startProductionSession("u", store);
    __prodQueueTesting.pending.set("o1", entry(1));
    __prodQueueTesting.revs.set("o1", 1);
    expect(__prodQueueTesting.persist("o1", entry(1))).toBe(true);
    expect(productionDraftsAreDurable()).toBe(true);

    stopProductionSession(); // имитируем перезагрузку: память исчезла, localStorage остался
    expect(hasPendingProduction()).toBe(0);
    expect(startProductionSession("u", store)).toBe(1);
    expect(hasPendingProduction()).toBe(1);

    __prodQueueTesting.setCmd(async () => ({ committed: false }));
    await flushPendingProduction();
    expect(hasPendingProduction()).toBe(1);
    expect(listProductionDrafts(store, "u")).toHaveLength(1);

    __prodQueueTesting.setCmd(async () => ({ committed: true, list: [card({ brigade: "А" })] }));
    await flushPendingProduction();
    expect(hasPendingProduction()).toBe(0);
    expect(listProductionDrafts(store, "u")).toEqual([]);
  });

  it("фоновые bg-команды переживают reload, обновляются по changeId и снимаются только явно", () => {
    const store = fakeStore();
    const first = { type: "set-status", objectId: "o1", status: "active", changeId: "bg_status_o1", __draftRevision: "r1" };
    const newer = { ...first, status: "done", __retryFlush: true, __draftRevision: "r2" };
    expect(saveProductionRetry(store, "u", first, 100)).toBe(true);
    expect(saveProductionRetry(store, "u", newer, 200)).toBe(true);
    const restored = listProductionRetries(store, "u");
    expect(restored).toHaveLength(1);
    expect(restored[0].status).toBe("done");
    expect(restored[0]).not.toHaveProperty("__retryFlush");
    expect(listProductionRetries(store, "other")).toEqual([]);
    // Поздний успех r1 не имеет права удалить более новую r2.
    expect(removeProductionRetry(store, "u", "bg_status_o1", "r1")).toBe(false);
    expect(listProductionRetries(store, "u")[0].status).toBe("done");
    expect(removeProductionRetry(store, "u", "bg_status_o1", "r2")).toBe(true);
    expect(listProductionRetries(store, "u")).toEqual([]);
  });

  it("удалённая карточка не воскрешается молча, но явный выбор восстанавливает durable-правку", async () => {
    const previousWindow = globalThis.window;
    let confirms = 0;
    globalThis.window = { confirm: () => { confirms++; return true; } };
    try {
      __prodQueueTesting.pending.set("o1", entry(1, "МОЯ ПРАВКА"));
      __prodQueueTesting.revs.set("o1", 1);
      let calls = 0;
      const seen = [];
      __prodQueueTesting.setCmd(async cmd => {
        calls++;
        seen.push(cmd.type);
        if (calls === 1) return { committed: false, conflict: true, list: [] };
        return { committed: true, list: [card({ brigade: "МОЯ ПРАВКА" })] };
      });
      await __prodQueueTesting.flushObj("o1");
      expect(confirms).toBe(1);
      expect(seen).toEqual(["batch", "create-if-missing"]);
      expect(hasPendingProduction()).toBe(0);
      expect(__prodQueueTesting.confirmed.get("o1")?.brigade).toBe("МОЯ ПРАВКА");
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  it("при выборе «принять удаление» локальный pending снимается без записи карточки", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { confirm: () => false };
    try {
      __prodQueueTesting.pending.set("o1", entry(1, "МОЯ ПРАВКА"));
      __prodQueueTesting.revs.set("o1", 1);
      const seen = [];
      __prodQueueTesting.setCmd(async cmd => {
        seen.push(cmd.type);
        if (cmd.type === "resolve-change") return { committed: true, list: [] };
        return { committed: false, conflict: true, list: [] };
      });
      await __prodQueueTesting.flushObj("o1");
      expect(seen).toEqual(["batch", "resolve-change"]);
      expect(hasPendingProduction()).toBe(0);
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
});
