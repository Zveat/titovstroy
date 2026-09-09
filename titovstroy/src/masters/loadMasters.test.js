import { describe, expect, it, vi } from "vitest";
import { loadMasters } from "./loadMasters.js";
import { encodeRecords } from "./mastersStore.mjs";

const BASE = "titovstroy-masters-olx";
const item = (over = {}) => ({ source: "olx", extId: "1", name: "Мастер", active: true, ...over });

// Хранилище-заглушка: отдаёт то, что ему положили, и запоминает, что у него спрашивали.
const store = ({ children = null, info = null, legacy = null } = {}) => {
  const asked = [];
  return {
    asked,
    getChildren: vi.fn(async (key) => {
      asked.push(key);
      return children ? { status: "found", value: children } : { status: "empty", value: null };
    }),
    getResult: vi.fn(async (key) => {
      asked.push(key);
      const value = key.endsWith("-info") ? info : legacy;
      return value ? { status: "found", value: JSON.stringify(value) } : { status: "empty", value: null };
    }),
  };
};

describe("чтение справочника", () => {
  it("собирает список из детей, а счётчики берёт из отдельного узла", async () => {
    const items = [item({ extId: "1" }), item({ extId: "2" })];
    const s = store({ children: encodeRecords(items), info: { count: 2, activeCount: 2, updatedAt: "2026-09-09T00:00:00.000Z" } });
    const out = await loadMasters(BASE, s);

    expect(out.format).toBe("records");
    expect(out.items).toHaveLength(2);
    expect(out.meta.activeCount).toBe(2);
    expect(s.asked).toContain("titovstroy-masters-olx-rec");
    expect(s.asked).toContain("titovstroy-masters-olx-info");
  });

  it("пока парсер не перевёл узел, читается старый формат", async () => {
    const s = store({ legacy: { updatedAt: "вчера", activeCount: 1, items: [item()] } });
    const out = await loadMasters(BASE, s);

    expect(out.format).toBe("legacy");
    expect(out.items).toHaveLength(1);
    expect(out.meta.activeCount).toBe(1);
  });

  it("если новый узел не прочитался, показываем старые данные, а не пустой экран", async () => {
    const s = store({ legacy: { items: [item()] } });
    s.getChildren = vi.fn(async () => ({ status: "unavailable", value: null }));
    const out = await loadMasters(BASE, s);

    expect(out.format).toBe("legacy");
    expect(out.items).toHaveLength(1);
  });

  it("старый узел мог быть просто массивом — это тоже читается", async () => {
    const s = store({ legacy: [item()] });
    const out = await loadMasters(BASE, s);
    expect(out.items).toHaveLength(1);
    expect(out.meta).toBe(null);
  });

  it("когда нет ни нового узла, ни старого — пустой список без ошибки", async () => {
    const out = await loadMasters(BASE, store());
    expect(out.items).toEqual([]);
    expect(out.meta).toBe(null);
  });

  it("битый счётчик не мешает показать список", async () => {
    const s = store({ children: encodeRecords([item()]) });
    s.getResult = vi.fn(async () => ({ status: "found", value: "{сломано" }));
    const out = await loadMasters(BASE, s);
    expect(out.items).toHaveLength(1);
    expect(out.meta).toBe(null);
  });

  it("повреждённые записи пропускаются, остальные показываются", async () => {
    const s = store({ children: { ...encodeRecords([item()]), broken: "{нет" } });
    const out = await loadMasters(BASE, s);
    expect(out.items).toHaveLength(1);
    expect(out.broken).toBe(1);
  });
});
