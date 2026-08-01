import { describe, it, expect } from "vitest";
import { monthOptions, runSave } from "./payrollUi.js";

describe("выбор месяца для начислений", () => {
  const now = new Date(Date.UTC(2026, 7, 1));   // 1 августа 2026

  it("в первый заход можно начислить за прошлый месяц, а не только за текущий", () => {
    // Раньше список строился только из уже существующих начислений: в пустой базе
    // оставался один текущий месяц, и закрыть июль было нечем.
    const m = monthOptions([], now);
    expect(m[0]).toBe("2026-08");
    expect(m).toContain("2026-07");
    expect(m).toHaveLength(12);
  });

  it("свежие месяцы сверху, история не обрезается", () => {
    const m = monthOptions(["2025-03"], now);
    expect(m[0]).toBe("2026-08");
    expect(m[m.length - 1]).toBe("2025-03");
    expect(m).toContain("2025-12");     // дыр между месяцами нет
  });

  it("месяц в будущем не появляется", () => {
    expect(monthOptions(["2027-01"], now)).not.toContain("2026-09");
  });
});

describe("проверка результата сохранения", () => {
  it("успех — только когда сейвер вернул список", async () => {
    expect((await runSave(async () => [1, 2], [])).ok).toBe(true);
  });

  it("заблокированная запись — это НЕ успех, даже если вернулось undefined", async () => {
    // saveListProtected при блокировке возвращает undefined, а не false: форма,
    // проверявшая только false, закрывалась и теряла введённое.
    const r = await runSave(async () => undefined, []);
    expect(r.ok).toBe(false);
  });

  it("причина отказа переводится на человеческий", async () => {
    const r = await runSave(async (_l, opts) => { opts.onBlocked("not-loaded"); return undefined; }, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("догрузился");
  });

  it("исключение внутри сейвера не роняет экран", async () => {
    const r = await runSave(async () => { throw new Error("бум"); }, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("отсутствующий обработчик — тоже отказ, а не молчание", async () => {
    expect((await runSave(undefined, [])).ok).toBe(false);
  });
});
