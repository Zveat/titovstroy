import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetGoogleAuth, beginGoogleAuth, googleAccessToken } from "./googleAuth.js";

// РАДИ ЧЕГО ЭТО ВСЁ. Браузер даёт открыть окно Google только в тот же миг, когда
// человек нажал. Пока доступ просили ПОСЛЕ подготовки документа, окно гасло молча и
// «Google Doc» на телефоне не делал ничего. Здесь проверяется ровно порядок: спросили
// в нажатии — и тот же ответ подхватил загрузчик, когда документ стал готов.

function fakeGoogle() {
  const calls = [];
  let answer = null;
  const oauth2 = {
    initTokenClient: (config) => {
      calls.push(config);
      return { requestAccessToken: () => { answer = config.callback; } };
    },
  };
  globalThis.window = { google: { accounts: { oauth2 } } };
  return {
    calls,
    reply: (response) => answer(response),
    asked: () => calls.length,
  };
}

// Поддельный документ: нужен, чтобы разыграть уход в окно Google и возврат из него.
function fakeDoc() {
  const listeners = new Set();
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: (type, fn) => { if (type === "visibilitychange") listeners.add(fn); },
    removeEventListener: (type, fn) => { listeners.delete(fn); },
  };
  const go = (state) => { globalThis.document.visibilityState = state; listeners.forEach(fn => fn()); };
  return { away: () => go("hidden"), back: () => go("visible"), watching: () => listeners.size };
}

afterEach(() => { _resetGoogleAuth(); delete globalThis.window; delete globalThis.document; });

describe("вход в Google", () => {
  it("спрашивает доступ сразу в нажатии, а не после подготовки документа", () => {
    const google = fakeGoogle();
    beginGoogleAuth();
    // Никаких await между нажатием и запросом — иначе разрешение успевает сгореть.
    expect(google.asked()).toBe(1);
    expect(google.calls[0].scope).toBe("https://www.googleapis.com/auth/drive.file");
  });

  it("готовый документ забирает уже обещанный доступ, не спрашивая второй раз", async () => {
    const google = fakeGoogle();
    beginGoogleAuth();
    const waiting = googleAccessToken();
    google.reply({ access_token: "ключ-1" });
    await expect(waiting).resolves.toBe("ключ-1");
    expect(google.asked()).toBe(1);
  });

  it("следующий документ спрашивает доступ заново", async () => {
    const google = fakeGoogle();
    beginGoogleAuth();
    const first = googleAccessToken();
    google.reply({ access_token: "ключ-1" });
    await first;

    const second = googleAccessToken();          // begin никто не звал
    await Promise.resolve();                     // спросит сам, но уже следующим шагом
    expect(google.asked()).toBe(2);
    google.reply({ access_token: "ключ-2" });
    await expect(second).resolves.toBe("ключ-2");
  });

  it("отказ Google доходит словами, а не тишиной", async () => {
    const google = fakeGoogle();
    beginGoogleAuth();
    const waiting = googleAccessToken();
    google.reply({ error: "access_denied" });
    await expect(waiting).rejects.toThrow(/access_denied/);
  });

  it("молчание Google заканчивается ошибкой, а не вечным ожиданием", async () => {
    vi.useFakeTimers();
    try {
      fakeGoogle();
      beginGoogleAuth();
      const waiting = googleAccessToken();
      const caught = waiting.catch(error => error.message);
      await vi.advanceTimersByTimeAsync(91000);   // окно так и не ответило
      expect(await caught).toMatch(/не ответил/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("тихий ключ приезжает без всякого окна — так это и работало раньше", async () => {
    const google = fakeGoogle();
    const doc = fakeDoc();
    beginGoogleAuth();
    const waiting = googleAccessToken();
    google.reply({ access_token: "ключ" });                 // окно не открывалось вовсе
    await expect(waiting).resolves.toBe("ключ");
    expect(doc.watching()).toBe(0);                          // за видимостью больше не следим
  });

  it("вернулись из окна Google без ответа — объясняем, а не ждём полторы минуты", async () => {
    vi.useFakeTimers();
    try {
      fakeGoogle();
      const doc = fakeDoc();
      beginGoogleAuth();
      const caught = googleAccessToken().catch(error => error.message);
      doc.away();                                            // ушли в окно Google
      doc.back();                                            // оно закрылось ни с чем
      await vi.advanceTimersByTimeAsync(2000);
      expect(await caught).toMatch(/подтвердить доступ заново/);
    } finally { vi.useRealTimers(); }
  });

  it("ответ, пришедший сразу после возврата, побеждает — ложной тревоги нет", async () => {
    vi.useFakeTimers();
    try {
      const google = fakeGoogle();
      const doc = fakeDoc();
      beginGoogleAuth();
      const waiting = googleAccessToken();
      doc.away();
      doc.back();
      await vi.advanceTimersByTimeAsync(300);                // ответ обогнал паузу
      google.reply({ access_token: "ключ-после-окна" });
      await vi.advanceTimersByTimeAsync(3000);
      await expect(waiting).resolves.toBe("ключ-после-окна");
    } finally { vi.useRealTimers(); }
  });

  it("уход в фон без возврата ничего не ломает — человек просто свернул приложение", async () => {
    vi.useFakeTimers();
    try {
      const google = fakeGoogle();
      const doc = fakeDoc();
      beginGoogleAuth();
      const waiting = googleAccessToken();
      doc.away();
      await vi.advanceTimersByTimeAsync(5000);
      google.reply({ access_token: "ключ" });
      await expect(waiting).resolves.toBe("ключ");
    } finally { vi.useRealTimers(); }
  });
});
