import { describe, it, expect, vi } from "vitest";
import {
  createQueue, memoryBackend, flushQueue, entryStatus,
  QUEUE_UPLOADING, QUEUE_QUEUED, QUEUE_FAILED,
} from "./queue.js";

const entry = (over = {}) => ({ id: "q1", objectId: "o1", stageId: "s1", kind: "during", ...over });

describe("очередь: хранение", () => {
  it("запись попадает в очередь со счётчиком попыток", async () => {
    const queue = createQueue(memoryBackend());
    const saved = await queue.add(entry());
    expect(saved.attempts).toBe(0);
    expect(await queue.all()).toHaveLength(1);
  });

  it("отдаёт только записи своего объекта и в порядке съёмки", async () => {
    const queue = createQueue(memoryBackend());
    await queue.add(entry({ id: "b", createdAt: 200 }));
    await queue.add(entry({ id: "a", createdAt: 100 }));
    await queue.add(entry({ id: "чужой", objectId: "o2", createdAt: 50 }));
    expect((await queue.forObject("o1")).map(item => item.id)).toEqual(["a", "b"]);
  });

  it("неудача увеличивает счётчик и запоминает причину, запись остаётся", async () => {
    const queue = createQueue(memoryBackend());
    const saved = await queue.add(entry());
    const failed = await queue.markFailed(saved, new Error("нет сети"));
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe("нет сети");
    expect(await queue.all()).toHaveLength(1);
  });
});

describe("очередь: статусы для интерфейса", () => {
  it("активная запись — «загружается»", () => {
    expect(entryStatus(entry(), "q1")).toBe(QUEUE_UPLOADING);
  });
  it("ждущая своей очереди — «в очереди»", () => {
    expect(entryStatus(entry(), null)).toBe(QUEUE_QUEUED);
    expect(entryStatus(entry({ attempts: 2, lastError: "" }), null)).toBe(QUEUE_QUEUED);
  });
  it("после провалившейся попытки — «не удалось»", () => {
    expect(entryStatus(entry({ attempts: 1, lastError: "нет сети" }), null)).toBe(QUEUE_FAILED);
  });
  it("но пока идёт новая попытка — снова «загружается»", () => {
    expect(entryStatus(entry({ attempts: 1, lastError: "нет сети" }), "q1")).toBe(QUEUE_UPLOADING);
  });
});

describe("очередь: повторная отправка", () => {
  it("успех убирает запись и отдаёт готовую запись для базы", async () => {
    const queue = createQueue(memoryBackend());
    await queue.add(entry());
    const onUploaded = vi.fn();
    const result = await flushQueue(queue, async (item) => ({ id: item.id, url: "https://x/1.jpg" }), { objectId: "o1", onUploaded });
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(await queue.all()).toHaveLength(0);
    expect(onUploaded).toHaveBeenCalledWith({ id: "q1", url: "https://x/1.jpg" }, expect.objectContaining({ id: "q1" }));
  });

  it("падение сети оставляет фото в очереди и НЕ пишет его в базу", async () => {
    const queue = createQueue(memoryBackend());
    await queue.add(entry());
    const onUploaded = vi.fn();
    const result = await flushQueue(queue, async () => { throw new Error("нет сети"); }, { objectId: "o1", onUploaded });
    expect(result).toMatchObject({ sent: 0, failed: 1 });
    expect(onUploaded).not.toHaveBeenCalled();
    const left = await queue.all();
    expect(left).toHaveLength(1);
    expect(left[0].attempts).toBe(1);
  });

  it("повтор после восстановления связи дожимает то же фото", async () => {
    const queue = createQueue(memoryBackend());
    await queue.add(entry());
    let online = false;
    const send = async (item) => { if (!online) throw new Error("нет сети"); return { id: item.id, url: "ok" }; };
    await flushQueue(queue, send, { objectId: "o1" });
    expect((await queue.all())[0].attempts).toBe(1);
    online = true;
    const second = await flushQueue(queue, send, { objectId: "o1" });
    expect(second.sent).toBe(1);
    expect(await queue.all()).toHaveLength(0);
  });

  it("одно упавшее фото не останавливает остальные", async () => {
    const queue = createQueue(memoryBackend());
    await queue.add(entry({ id: "a", createdAt: 1 }));
    await queue.add(entry({ id: "плохое", createdAt: 2 }));
    await queue.add(entry({ id: "c", createdAt: 3 }));
    const result = await flushQueue(queue, async (item) => {
      if (item.id === "плохое") throw new Error("файл битый");
      return { id: item.id, url: "ok" };
    }, { objectId: "o1" });
    expect(result).toMatchObject({ sent: 2, failed: 1 });
    expect((await queue.all()).map(item => item.id)).toEqual(["плохое"]);
  });

  it("сообщает интерфейсу, какая запись отправляется прямо сейчас", async () => {
    const queue = createQueue(memoryBackend());
    await queue.add(entry());
    const active = [];
    await flushQueue(queue, async (item) => { active.push("отправка:" + item.id); return { id: item.id }; }, {
      objectId: "o1",
      onActive: (id) => active.push("активна:" + String(id)),
    });
    expect(active).toEqual(["активна:q1", "отправка:q1", "активна:null"]);
  });

  it("очередь чужого объекта не трогается", async () => {
    const queue = createQueue(memoryBackend());
    await queue.add(entry({ id: "свой" }));
    await queue.add(entry({ id: "чужой", objectId: "o2" }));
    await flushQueue(queue, async (item) => ({ id: item.id }), { objectId: "o1" });
    expect((await queue.all()).map(item => item.id)).toEqual(["чужой"]);
  });
});
