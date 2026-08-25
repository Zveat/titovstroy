import { describe, it, expect } from "vitest";
import {
  BACKUP_KEEP, backupIndexKey, backupItemKey, normalizeIndex, pushIndex,
  mergeBackupViews, makeSnapshot, loadSnapshotData,
} from "./backups.js";

describe("резервные копии списков", () => {
  it("ключи считаются от ключа архива", () => {
    expect(backupIndexKey("titovstroy-estimates-backups")).toBe("titovstroy-estimates-backups-idx");
    expect(backupItemKey("titovstroy-estimates-backups", 1787000000000)).toBe("titovstroy-estimates-backups-1787000000000");
  });

  it("мусор из облака не роняет указатель", () => {
    expect(normalizeIndex(null)).toEqual([]);
    expect(normalizeIndex("сломано")).toEqual([]);
    expect(normalizeIndex({ ts: 1 })).toEqual([]);
    expect(normalizeIndex([{ ts: 0 }, { by: "нет ts" }, null])).toEqual([]);
  });

  it("указатель читается и строкой, и массивом, и сортируется свежими вперёд", () => {
    const raw = JSON.stringify([{ ts: 100, by: "А", count: 2 }, { ts: 300, by: "Б", count: 5 }]);
    expect(normalizeIndex(raw).map(x => x.ts)).toEqual([300, 100]);
  });

  it("новый снимок встаёт первым, лишние возвращаются на удаление", () => {
    let index = [];
    for (let i = 1; i <= 22; i += 1) index = pushIndex(index, { ts: i * 1000, by: "П", count: i }, 20).index;
    expect(index.length).toBe(20);
    expect(index[0].ts).toBe(22000);
    // Два самых старых вытеснены — их ключи надо стереть, иначе база растёт вечно.
    const step = pushIndex(index, { ts: 23000, by: "П", count: 23 }, 20);
    expect(step.index.length).toBe(20);
    expect(step.drop).toEqual([3000]);
  });

  it("повтор того же ts не плодит запись", () => {
    const first = pushIndex([], { ts: 500, by: "А", count: 1 }).index;
    const second = pushIndex(first, { ts: 500, by: "Б", count: 9 }).index;
    expect(second.length).toBe(1);
    expect(second[0]).toMatchObject({ ts: 500, by: "Б", count: 9 });
  });

  it("по умолчанию храним двадцать копий", () => {
    expect(BACKUP_KEEP).toBe(20);
  });

  // Главное требование владельца: ничего не должно теряться. Старые копии,
  // сделанные до перехода, обязаны остаться видимыми и восстановимыми.
  it("старые копии из общего массива остаются в списке рядом с новыми", () => {
    const legacy = [{ ts: 100, by: "Старый", count: 3, data: '[{"id":"a"}]' }];
    const index = [{ ts: 200, by: "Новый", count: 4 }];
    const rows = mergeBackupViews(legacy, index, "bk");
    expect(rows.map(r => r.ts)).toEqual([200, 100]);
    expect(rows[0]).toMatchObject({ by: "Новый", key: "bk-200" });
    expect(rows[0].data).toBeUndefined();
    expect(rows[1]).toMatchObject({ by: "Старый", data: '[{"id":"a"}]' });
  });

  it("при совпадении ts новый снимок побеждает старый", () => {
    const rows = mergeBackupViews([{ ts: 5, by: "старый", data: "x" }], [{ ts: 5, by: "новый" }], "bk");
    expect(rows.length).toBe(1);
    expect(rows[0].by).toBe("новый");
  });

  it("данные старого снимка берутся прямо из строки, без обращения к базе", async () => {
    let calls = 0;
    const data = await loadSnapshotData({ ts: 1, data: '[{"id":"a"}]' }, async () => { calls += 1; return null; });
    expect(data).toBe('[{"id":"a"}]');
    expect(calls).toBe(0);
  });

  it("данные нового снимка читаются одним ключом", async () => {
    const asked = [];
    const data = await loadSnapshotData({ ts: 2, key: "bk-2" }, async (k) => {
      asked.push(k);
      return JSON.stringify(makeSnapshot({ ts: 2, by: "П", count: 1, data: '[{"id":"b"}]' }));
    });
    expect(asked).toEqual(["bk-2"]);
    expect(data).toBe('[{"id":"b"}]');
  });

  it("недоступный или битый снимок отдаёт null, а не мусор", async () => {
    expect(await loadSnapshotData({ ts: 3, key: "bk-3" }, async () => null)).toBe(null);
    expect(await loadSnapshotData({ ts: 3, key: "bk-3" }, async () => "не json")).toBe(null);
    expect(await loadSnapshotData({ ts: 3, key: "bk-3" }, async () => JSON.stringify({ ts: 3 }))).toBe(null);
    expect(await loadSnapshotData(null, async () => "x")).toBe(null);
  });

  // Подпись и счётчики живут в оглавлении: по ним видно «ничего не изменилось» и
  // сколько чего в снимке, не читая сам снимок (а он весит сотни килобайт).
  it("подпись и счётчики переживают чтение оглавления", () => {
    const idx = pushIndex([], { ts: 10, by: "П", count: 4, sig: "1|2|3|4|999", counts: { o: 1, e: 2, c: 3, f: 4 } }).index;
    expect(idx[0].sig).toBe("1|2|3|4|999");
    expect(idx[0].counts).toEqual({ o: 1, e: 2, c: 3, f: 4 });
    const afterRead = normalizeIndex(JSON.stringify(idx));
    expect(afterRead[0].sig).toBe("1|2|3|4|999");
    expect(afterRead[0].counts).toEqual({ o: 1, e: 2, c: 3, f: 4 });
  });

  it("без подписи и счётчиков полей просто нет", () => {
    const idx = pushIndex([], { ts: 11, by: "П", count: 1 }).index;
    expect("sig" in idx[0]).toBe(false);
    expect("counts" in idx[0]).toBe(false);
  });

  it("снимок пишется в едином формате", () => {
    expect(makeSnapshot({ ts: 7, by: "П", count: 2, data: "[]" })).toEqual({ ts: 7, by: "П", count: 2, data: "[]" });
    expect(makeSnapshot()).toMatchObject({ by: "", count: 0, data: "" });
  });
});
