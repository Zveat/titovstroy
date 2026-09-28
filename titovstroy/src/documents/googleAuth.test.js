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

afterEach(() => { _resetGoogleAuth(); delete globalThis.window; });

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
});
