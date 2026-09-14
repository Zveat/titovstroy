// ПРОВОДКА: запись в журнал → просьба запустить рассылку.
//
// Кусочки проверены по отдельности (instantNotify.test.js, triggerNotify.test.js),
// а здесь — единственное живое соединение между ними: строчка в logChange. Без
// этого теста «быстрые уведомления» могли бы тихо отвалиться от любой правки
// журнала, и заметил бы это только владелец, снова через сутки.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saved = [];
let notified = [];

vi.mock("../appConfig.js", () => ({ IS_DEV_ENV: false }));

// Облака в тесте нет: storage без Firebase идёт по запасному пути «прочитал —
// дописал — записал», ровно как в браузере при недоступном SDK.
vi.mock("./storage.js", () => ({
  _TIMEOUT: Symbol("timeout"), _TS_SUFFIX: "__ts",
  _beginEditorWrite: () => ({ fail: false, session: 1 }),
  _endEditorWrite: () => {},
  _fbAuthReady: Promise.resolve(), _fbDb: null,
  _fbKey: (k) => String(k).replace(/[^a-zA-Z0-9_]/g, "_"),
  _foreignDirty: () => false, _mayApplyEditorResult: () => true, _mem: {},
  _race: (p) => p,
  _restToken: async () => "tok",
  storage: {
    get: async (k) => (k.includes("index") ? { value: "[]" } : null),
    set: async (k, v) => { saved.push([k, v]); },
  },
}));

vi.mock("../notify/instantNotify.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createInstantNotifier: () => ({
      note: (entry) => { const ok = real.isNotifiableEntry(entry); if (ok) notified.push(entry); return ok; },
      cancel: () => {}, pending: () => false,
    }),
  };
});

const OWNER = { id: "u1", name: "Сергей Штанько" };

beforeEach(() => { saved.length = 0; notified = []; globalThis.window = globalThis.window || {}; });
afterEach(() => { vi.clearAllMocks(); });

describe("журнал будит рассылку", () => {
  it("смена статуса объекта — и записана, и отправлена в рассылку", async () => {
    const { logChange } = await import("./audit.js");
    await logChange(OWNER, { entity: "object", entityId: "o1", objectId: "o1",
      label: "Вера", field: "статус", action: "изменил", old: "Новый", new: "Потерян" });

    expect(saved.some(([k]) => /titovstroy-audit-\d{4}-\d{2}/.test(k))).toBe(true);
    expect(notified).toHaveLength(1);
    expect(notified[0].new).toBe("Потерян");
  });

  it("правка телефона пишется в журнал, но рассылку не будит", async () => {
    const { logChange } = await import("./audit.js");
    await logChange(OWNER, { entity: "object", entityId: "o1", objectId: "o1",
      label: "Вера", field: "телефон", action: "изменил", old: "+7700", new: "+7701" });

    expect(saved.some(([k]) => /titovstroy-audit-\d{4}-\d{2}/.test(k))).toBe(true);
    expect(notified).toHaveLength(0);
  });

  it("у отправленного в рассылку та же отметка времени, что и у записи журнала", async () => {
    const { logChange } = await import("./audit.js");
    const ts = 1_789_400_000_000;
    await logChange(OWNER, { ts, entity: "object", entityId: "o1", objectId: "o1",
      label: "Вера", field: "статус", action: "изменил", old: "Новый", new: "Договор подписан" });

    const written = JSON.parse(saved.find(([k]) => /titovstroy-audit-\d{4}-\d{2}/.test(k))[1]);
    expect(written[0].ts).toBe(ts);
    expect(notified[0].ts).toBe(ts);
  });
});
