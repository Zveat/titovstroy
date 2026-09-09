import test from "node:test";
import assert from "node:assert/strict";

import {
  OLX_REPAIR_CATEGORIES,
  applyPhoneAttempt,
  applyPhoneResults,
  decodePhoneResults,
  encodePhoneResults,
  overlayPhoneResults,
  shardRows,
  assertWritableSize,
  buildPhoneQueue,
  lastAttemptAt,
  phoneQueueKey,
  queueRowFromTarget,
  queueRowToTarget,
  expandOlxCategoryIds,
  mergeFreshSnapshot,
  parseStoredJson,
  selectPhoneTargets,
} from "./parsercore.mjs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-22T12:00:00.000Z");

test("OLX parent category expands to the complete current repair catalogue", () => {
  assert.equal(OLX_REPAIR_CATEGORIES.length, 20);
  assert.deepEqual(
    expandOlxCategoryIds(["188"]),
    OLX_REPAIR_CATEGORIES.map((item) => item.id),
  );
  assert.ok(OLX_REPAIR_CATEGORIES.some((item) => item.id === "829"));
  assert.ok(OLX_REPAIR_CATEGORIES.some((item) => item.id === "1572"));
});

test("OLX parent selection resolves to the exact repair catalogue without old foreign categories", () => {
  const ids = expandOlxCategoryIds(["188", "822", "1564", "188"]);
  assert.equal(ids.filter((id) => id === "822").length, 1);
  assert.equal(ids.includes("1564"), false);
  assert.equal(ids.includes("188"), false);
});

test("phone queue processes never-checked masters before old retries, regardless of score", () => {
  const selected = selectPhoneTargets([
    { extId: "top", score: 100, phoneCheckedAt: new Date(NOW - 40 * DAY).toISOString(), phoneStatus: "unavailable" },
    { extId: "new-low", score: 1, phoneCheckedAt: null },
    { extId: "new-high", score: 80, phoneCheckedAt: null },
  ], { limit: 2, now: NOW });

  assert.deepEqual(selected.map((item) => item.extId), ["new-high", "new-low"]);
});

test("phone queue eventually retries the oldest due records and skips recent unavailable results", () => {
  const selected = selectPhoneTargets([
    { extId: "recent", phoneCheckedAt: new Date(NOW - DAY).toISOString(), phoneStatus: "unavailable" },
    { extId: "old-2", phoneCheckedAt: new Date(NOW - 8 * DAY).toISOString(), phoneStatus: "unavailable" },
    { extId: "old-1", phoneCheckedAt: new Date(NOW - 20 * DAY).toISOString(), phoneStatus: "unavailable" },
    { extId: "retry", phoneCheckedAt: new Date(NOW - DAY).toISOString(), phoneStatus: "retry" },
  ], { limit: 10, now: NOW, unavailableRetryMs: 7 * DAY, retryDelayMs: 6 * 60 * 60 * 1000 });

  assert.deepEqual(selected.map((item) => item.extId), ["old-1", "old-2", "retry"]);
});

test("phone queue respects zero limit", () => {
  assert.deepEqual(selectPhoneTargets([{ extId: "1" }], { limit: 0, now: NOW }), []);
});

test("limited phone batches eventually visit every never-checked master", () => {
  let masters = Array.from({ length: 25 }, (_, index) => ({
    extId: String(index + 1),
    score: 1000 - index,
  }));
  const visited = new Set();

  for (let run = 0; run < 4; run++) {
    const batch = selectPhoneTargets(masters, { limit: 7, now: NOW });
    for (const master of batch) visited.add(master.extId);
    const selectedIds = new Set(batch.map((master) => master.extId));
    masters = masters.map((master) => selectedIds.has(master.extId)
      ? applyPhoneAttempt(master, { status: "unavailable" }, NOW)
      : master);
  }

  assert.equal(visited.size, 25);
});

test("phone attempt stores explicit found, unavailable and retry states", () => {
  const found = applyPhoneAttempt({ phoneAttempts: 2 }, { status: "found", phone: "+7 701 111 22 33" }, NOW);
  assert.equal(found.phone, "77011112233");
  assert.equal(found.phoneStatus, "found");
  assert.equal(found.phoneAttempts, 3);

  const unavailable = applyPhoneAttempt({}, { status: "unavailable" }, NOW);
  assert.equal(unavailable.phoneStatus, "unavailable");

  const retry = applyPhoneAttempt({}, { status: "retry", error: "HTTP 429" }, NOW);
  assert.equal(retry.phoneStatus, "retry");
  assert.equal(retry.phoneError, "HTTP 429");
});

test("fresh snapshot refreshes live fields while preserving collected phone history", () => {
  const existing = [{
    source: "olx", extId: "7", phone: "77010000000", phoneStatus: "found",
    services: ["Старое"], adsCount: 99, collectedAt: "2026-01-01T00:00:00.000Z",
  }];
  const fresh = [{ source: "olx", extId: "7", phone: "", services: ["Электрика"], adsCount: 2 }];
  const merged = mergeFreshSnapshot(existing, fresh, { now: NOW, complete: true });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].phone, "77010000000");
  assert.equal(merged[0].phoneStatus, "found");
  assert.deepEqual(merged[0].services, ["Электрика"]);
  assert.equal(merged[0].adsCount, 2);
  assert.equal(merged[0].active, true);
});

test("complete crawl keeps unseen history but marks it inactive", () => {
  const merged = mergeFreshSnapshot(
    [{ source: "olx", extId: "old", phone: "7701", active: true }],
    [{ source: "olx", extId: "new" }],
    { now: NOW, complete: true },
  );
  assert.equal(merged.find((item) => item.extId === "old").active, false);
  assert.equal(merged.find((item) => item.extId === "new").active, true);
});

test("partial crawl never marks previously collected masters inactive", () => {
  const merged = mergeFreshSnapshot(
    [{ source: "naimi", extId: "old", active: true }],
    [],
    { now: NOW, complete: false },
  );
  assert.equal(merged[0].active, true);
});

test("Firebase JSON parsing distinguishes empty nodes from corrupt data", () => {
  assert.deepEqual(parseStoredJson(null, { key: "cfg", empty: {} }), {});
  assert.deepEqual(parseStoredJson('{"ok":true}', { key: "cfg", empty: {} }), { ok: true });
  assert.throws(() => parseStoredJson("{bad", { key: "masters", empty: {} }), /masters/);
  assert.throws(() => parseStoredJson(42, { key: "masters", empty: {} }), /masters/);
});

// ── очередь добора номеров ────────────────────────────────────────────────────
// Смысл очереди — не читать всю базу мастеров ради порции телефонов. Проверяем, что в неё
// попадают ровно кандидаты, что поля переживают путь «база → очередь → отметка → результат»
// и что внесение результатов не затирает уже добытые номера.

const master = (over = {}) => ({
  source: "olx", extId: "u1", offerId: "111", hasPhoneFlag: true, phone: "", active: true, ...over,
});

test("в очередь попадают только те, кому реально нужен номер", () => {
  const queue = buildPhoneQueue([
    master({ extId: "need" }),
    master({ extId: "hasPhone", phone: "77771234567" }),
    master({ extId: "inactive", active: false }),
    master({ extId: "noFlag", hasPhoneFlag: false }),
    master({ extId: "noOffer", offerId: null, phoneOfferId: null }),
    null,
  ]);
  assert.deepEqual(queue.map((r) => r.k), ["olx:need"]);
});

test("очередь несёт поля, по которым выбирается следующий кандидат", () => {
  const [row] = buildPhoneQueue([master({
    phoneCheckedAt: "2026-08-01T00:00:00.000Z", phoneStatus: "retry", phoneAttempts: 2, score: 7, reviews: 13,
  })]);
  assert.equal(row.c, "2026-08-01T00:00:00.000Z");
  assert.equal(row.s, "retry");
  assert.equal(row.a, 2);
  assert.equal(row.p, 7);
  assert.equal(row.r, 13);
  // Пустые поля не пишем: очередь должна оставаться компактной.
  const [lean] = buildPhoneQueue([master({ extId: "lean" })]);
  assert.deepEqual(Object.keys(lean).sort(), ["k", "o"]);
});

test("строка очереди понятна выбору кандидатов и отметке попытки", () => {
  const [row] = buildPhoneQueue([master({ phoneOfferId: "222" })]);
  const target = queueRowToTarget(row);
  assert.equal(target.phoneOfferId, "222");
  const [picked] = selectPhoneTargets([target], { limit: 5 });
  assert.equal(picked, target);
  const after = applyPhoneAttempt(target, { status: "found", phone: "+7 777 123-45-67" });
  assert.equal(after.phone, "77771234567");
  assert.equal(after.phoneAttempts, 1);
  // Обратно в очередь — состояние попытки не теряется.
  const back = queueRowFromTarget({ ...after, key: row.k });
  assert.equal(back.a, 1);
  assert.equal(back.s, "found");
});

test("результаты вносятся в базу по ключу source:extId", () => {
  const items = [master({ extId: "a" }), master({ extId: "b" })];
  const { items: next, applied } = applyPhoneResults(items, {
    "olx:a": { phone: "77010000001", phoneStatus: "found" },
  });
  assert.equal(applied, 1);
  assert.equal(next[0].phone, "77010000001");
  assert.equal(next[1].phone, "");
});

test("уже добытый номер пустым результатом НЕ затирается", () => {
  const items = [master({ extId: "a", phone: "77010000001" })];
  const { items: next, applied } = applyPhoneResults(items, {
    "olx:a": { phone: "", phoneStatus: "unavailable" },
  });
  assert.equal(applied, 0);
  assert.equal(next[0].phone, "77010000001");
});

test("мусор вместо результатов ничего не ломает и ничего не меняет", () => {
  const items = [master({ extId: "a" })];
  for (const junk of [null, undefined, "строка", [], 42]) {
    const { items: next, applied } = applyPhoneResults(items, junk);
    assert.equal(applied, 0);
    assert.deepEqual(next, items);
  }
});

test("ключ записи совпадает с тем, по которому склеивается снимок", () => {
  assert.equal(phoneQueueKey({ source: "olx", extId: "u9" }), "olx:u9");
  assert.equal(phoneQueueKey(null), ":");
});

// ── ЗАЗОР СЧИТАЕТСЯ ОТ ПОПЫТКИ, А НЕ ОТ УСПЕХА ───────────────────────────────
// Ради этого всё и делалось: упавший прогон не должен повторяться каждые полчаса.
test("зазор считается от последней попытки, даже если она не удалась", () => {
  const t = Date.parse("2026-09-09T06:00:00.000Z");
  assert.equal(lastAttemptAt({ lastRunAt: t }), t, "успех считается попыткой");
  assert.equal(lastAttemptAt({ lastTryAt: t }), t, "неудачная попытка тоже считается");
  assert.equal(lastAttemptAt({ lastRunAt: t - DAY, lastTryAt: t }), t, "берём позднейшее");
  assert.equal(lastAttemptAt({ lastRunAt: t, lastTryAt: t - DAY }), t, "и в обратном порядке");
});

test("без отметок зазор считается с нуля — первый прогон не блокируется", () => {
  assert.equal(lastAttemptAt({}), 0);
  assert.equal(lastAttemptAt(null), 0);
  assert.equal(lastAttemptAt({ lastRunAt: "мусор", lastTryAt: null }), 0);
});

// ── ПРЕДЕЛ ЗНАЧЕНИЯ FIREBASE ─────────────────────────────────────────────────
test("список в пределах лимита пишется как раньше", () => {
  const json = JSON.stringify({ items: [{ extId: "a" }] });
  assert.equal(assertWritableSize("узел", json), Buffer.byteLength(json, "utf8"));
});

test("переросший список не пишется, а объясняет почему", () => {
  const items = [
    { extId: "a", active: true, phone: "77010000000" },
    { extId: "b", active: false, phone: "" },
    { extId: "c", active: false, phone: "77020000000" },
  ];
  assert.throws(
    () => assertWritableSize("titovstroy_masters_olx", "x".repeat(120), { limit: 100, items }),
    (e) => {
      assert.match(e.message, /titovstroy_masters_olx/);
      assert.match(e.message, /не помещается в базу/);
      assert.match(e.message, /Записей 3: активных 1, пропавших 2, с телефоном 2/);
      assert.match(e.message, /Ничего не записано/);
      return true;
    },
  );
});

test("размер считается в байтах, а не в символах — кириллица весит вдвое", () => {
  const json = JSON.stringify({ n: "яяяяяяяяяя" });   // 10 букв = 20 байт
  assert.equal(Buffer.byteLength(json, "utf8"), json.length + 10);
  assert.throws(() => assertWritableSize("узел", json, { limit: json.length }));
  assert.doesNotThrow(() => assertWritableSize("узел", json, { limit: json.length + 10 }));
});

// ── СБОР НОМЕРОВ В НЕСКОЛЬКО ПОТОКОВ ────────────────────────────────────────
// Смысл: у OLX нет аккаунтов, лимит держится на IP, а каждое задание GitHub — свой IP.
// Значит три задания дают втрое больше номеров. Проверяем, что они не мешают друг другу.

test("куски очереди не пересекаются и ничего не теряют", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ k: "olx:" + i, o: String(i) }));
  const parts = [0, 1, 2].map((i) => shardRows(rows, i, 3));
  assert.deepEqual(parts.map((p) => p.length), [4, 3, 3]);
  const all = parts.flat().map((r) => r.k).sort();
  assert.equal(new Set(all).size, 10, "ни один кандидат не достался двоим");
  assert.deepEqual(all.sort(), rows.map((r) => r.k).sort(), "ни один не потерялся");
});

test("без деления очередь возвращается целиком", () => {
  const rows = [{ k: "a" }, { k: "b" }];
  assert.deepEqual(shardRows(rows, -1, 1), rows);
  assert.deepEqual(shardRows(rows, 0, 1), rows);
  // Мусор в настройках не должен молча отрезать половину очереди.
  assert.deepEqual(shardRows(rows, 5, 3), rows);
  assert.deepEqual(shardRows(rows, 0, NaN), rows);
});

test("собранное пишется по узлам — три задания не затирают друг друга", () => {
  const a = encodePhoneResults({ "olx:1": { phone: "7701", phoneStatus: "found" } });
  const b = encodePhoneResults({ "olx:2": { phone: "7702", phoneStatus: "found" } });
  // Разные имена узлов → update() каждого задания трогает только своё.
  assert.deepEqual(Object.keys(a), ["olx-003a1"]);
  assert.deepEqual(Object.keys(b), ["olx-003a2"]);
  const merged = decodePhoneResults({ ...a, ...b });
  assert.equal(merged["olx:1"].phone, "7701");
  assert.equal(merged["olx:2"].phone, "7702");
});

test("старый вид результатов — одна строка на всех — тоже читается", () => {
  const old = { "olx:1": { phone: "7701" } };            // как лежало до разделения
  assert.deepEqual(decodePhoneResults(old), old);
  assert.deepEqual(decodePhoneResults(null), {});
  assert.deepEqual(decodePhoneResults({ x: "{сломано" }), {});
});

test("добытый номер выбывает из очереди, недобытому переносится состояние попытки", () => {
  const rows = [{ k: "olx:1", o: "1" }, { k: "olx:2", o: "2" }, { k: "olx:3", o: "3" }];
  const next = overlayPhoneResults(rows, {
    "olx:1": { phone: "77010000000", phoneStatus: "found" },
    "olx:2": { phone: "", phoneStatus: "unavailable", phoneCheckedAt: "2026-09-09T07:00:00.000Z", phoneAttempts: 2 },
  });
  assert.deepEqual(next.map((r) => r.k), ["olx:2", "olx:3"], "первый выбыл — номер есть");
  assert.equal(next[0].s, "unavailable");
  assert.equal(next[0].a, 2);
  assert.equal(next[0].c, "2026-09-09T07:00:00.000Z");
  assert.deepEqual(next[1], rows[2], "до третьего не дошли — строка как была");
});

test("состояние попытки доходит до выбора кандидатов — повторно его сегодня не возьмут", () => {
  const now = Date.parse("2026-09-09T08:00:00.000Z");
  const rows = overlayPhoneResults(
    [{ k: "olx:1", o: "1" }, { k: "olx:2", o: "2" }],
    { "olx:1": { phone: "", phoneStatus: "unavailable", phoneCheckedAt: "2026-09-09T07:00:00.000Z" } },
  );
  const picked = selectPhoneTargets(rows.map(queueRowToTarget), { limit: 10, now });
  assert.deepEqual(picked.map((t) => t.key), ["olx:2"], "проверенного час назад пропускаем");
});
