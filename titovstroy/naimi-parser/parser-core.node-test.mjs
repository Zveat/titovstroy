import test from "node:test";
import assert from "node:assert/strict";

import {
  OLX_REPAIR_CATEGORIES,
  applyPhoneAttempt,
  expandOlxCategoryIds,
  mergeFreshSnapshot,
  parseStoredJson,
  selectPhoneTargets,
} from "./parser-core.mjs";

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
