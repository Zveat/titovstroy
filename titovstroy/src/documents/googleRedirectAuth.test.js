import { describe, expect, it, vi } from "vitest";
import {
  _pendingKey, buildAuthUrl, redirectUri, startGoogleRedirect, takeGoogleRedirectResult,
} from "./googleRedirectAuth.js";

// Зачем этот путь вообще: окно входа Google в приложении с иконки открывается
// встроенным Safari и ответить не может. Переход и возврат остаются внутри приложения.

const fakeStore = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    has: (k) => map.has(k),
  };
};

const fakeWin = (hash = "") => {
  const win = {
    location: { origin: "https://erp.titovstroy.kz", pathname: "/", search: "", hash, assign: vi.fn() },
    history: { replaceState: vi.fn() },
  };
  return win;
};

describe("возврат из Google вместо всплывающего окна", () => {
  it("адрес возврата — корень сайта, его и регистрируют в консоли Google", () => {
    expect(redirectUri("https://erp.titovstroy.kz")).toBe("https://erp.titovstroy.kz/");
    expect(redirectUri("https://erp.titovstroy.kz/")).toBe("https://erp.titovstroy.kz/");
  });

  it("ссылка просит ключ прямо в ответе — сервер и секрет для этого не нужны", () => {
    const url = new URL(buildAuthUrl({ origin: "https://erp.titovstroy.kz", state: "abc" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("redirect_uri")).toBe("https://erp.titovstroy.kz/");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(url.searchParams.get("state")).toBe("abc");
    // prompt не задаём: уже подтверждавшего Google вернёт молча.
    expect(url.searchParams.has("prompt")).toBe(false);
  });

  it("уходя, запоминаем ТОЛЬКО задуманное — ни договора, ни ключа", () => {
    const store = fakeStore();
    const win = fakeWin();
    expect(startGoogleRedirect({ kind: "contract", id: "1046" }, { store, win })).toBe(true);
    const saved = JSON.parse(store.getItem(_pendingKey));
    expect(saved.job).toEqual({ kind: "contract", id: "1046" });
    expect(JSON.stringify(saved)).not.toMatch(/Договор|html|token/i);
    expect(win.location.assign).toHaveBeenCalledWith(expect.stringContaining("accounts.google.com"));
  });

  it("вернулись с ключом — отдаём его вместе с задуманным и чистим хвост ссылки", () => {
    const store = fakeStore();
    const win = fakeWin();
    startGoogleRedirect({ kind: "contract", id: "1046" }, { store, win });
    const state = JSON.parse(store.getItem(_pendingKey)).state;

    win.location.hash = `#access_token=КЛЮЧ&state=${state}&token_type=Bearer`;
    const back = takeGoogleRedirectResult({ store, win });
    expect(back).toMatchObject({ ok: true, token: "КЛЮЧ", job: { id: "1046" } });
    // Ключ не должен остаться ни в адресной строке, ни в истории, ни в хранилище.
    expect(win.history.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(store.has(_pendingKey)).toBe(false);
  });

  it("чужой ответ не принимаем: подпись запроса должна совпасть", () => {
    const store = fakeStore();
    const win = fakeWin();
    startGoogleRedirect({ kind: "contract", id: "1046" }, { store, win });
    win.location.hash = "#access_token=ЧУЖОЙ&state=подделка";
    const back = takeGoogleRedirectResult({ store, win });
    expect(back.ok).toBe(false);
    expect(store.has(_pendingKey)).toBe(false);
  });

  it("протухшую заявку не доделываем", () => {
    const store = fakeStore({
      [_pendingKey]: JSON.stringify({ job: { id: "1" }, state: "s", at: Date.now() - 20 * 60 * 1000 }),
    });
    const win = fakeWin("#access_token=КЛЮЧ&state=s");
    expect(takeGoogleRedirectResult({ store, win }).ok).toBe(false);
  });

  it("отказ Google объясняется словами", () => {
    const store = fakeStore({ [_pendingKey]: JSON.stringify({ job: { id: "1" }, state: "s", at: Date.now() }) });
    expect(takeGoogleRedirectResult({ store, win: fakeWin("#error=access_denied&state=s") }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/не разрешён/) });
    const store2 = fakeStore({ [_pendingKey]: JSON.stringify({ job: { id: "1" }, state: "s", at: Date.now() }) });
    expect(takeGoogleRedirectResult({ store: store2, win: fakeWin("#error=redirect_uri_mismatch&state=s") }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/не зарегистрирован/) });
  });

  it("обычный запуск приложения ничего не трогает", () => {
    const store = fakeStore();
    const win = fakeWin("");
    expect(takeGoogleRedirectResult({ store, win })).toBe(null);
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });
});
