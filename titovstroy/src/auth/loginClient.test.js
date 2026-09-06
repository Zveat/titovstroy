import { describe, it, expect, vi } from "vitest";
import { requestServerLogin, lockoutMessage, LOGIN_ENDPOINT } from "./loginClient.js";

const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => { if (body === undefined) throw new Error("не json"); return body; },
});

describe("вход через сервер", () => {
  it("шлёт логин и пароль на свой endpoint", async () => {
    const fetchImpl = vi.fn(async () => reply(200, { ok: true, token: "t", user: { id: "u1" } }));
    await requestServerLogin("  Admin ", "secret", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(LOGIN_ENDPOINT, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ login: "Admin", password: "secret" });
  });

  it("успех отдаёт токен и пользователя", async () => {
    const fetchImpl = async () => reply(200, { ok: true, token: "tok", user: { id: "u1", role: "admin" } });
    expect(await requestServerLogin("admin", "secret", { fetchImpl }))
      .toEqual({ status: "ok", token: "tok", user: { id: "u1", role: "admin" } });
  });

  it("401 — это именно неверный пароль, а не сбой", async () => {
    const fetchImpl = async () => reply(401, { ok: false, code: "invalid_credentials" });
    expect(await requestServerLogin("admin", "нет", { fetchImpl })).toEqual({ status: "invalid" });
  });

  it("429 возвращает, сколько ждать", async () => {
    const fetchImpl = async () => reply(429, { ok: false, retryAfterMs: 240000 });
    expect(await requestServerLogin("admin", "нет", { fetchImpl })).toEqual({ status: "locked", retryAfterMs: 240000 });
  });

  // Ключевое для выкатки: пока функция не задеплоена или ключи не проставлены,
  // приложение обязано откатиться на прежний вход, а не запереть всех снаружи.
  it("не настроенный и не выложенный endpoint — «недоступно», а не «неверный пароль»", async () => {
    for (const response of [reply(503, { ok: false, code: "login_not_configured" }), reply(404, undefined),
      reply(403, { ok: false, code: "origin_not_allowed" }), reply(500, undefined)]) {
      const result = await requestServerLogin("admin", "secret", { fetchImpl: async () => response });
      expect(result.status).toBe("unavailable");
    }
  });

  it("оборванная сеть — тоже «недоступно»", async () => {
    const fetchImpl = async () => { throw new Error("offline"); };
    expect((await requestServerLogin("admin", "secret", { fetchImpl })).status).toBe("unavailable");
  });

  it("ответ 200 без токена дальше не пропускается", async () => {
    const fetchImpl = async () => reply(200, { ok: true, user: { id: "u1" } });
    expect((await requestServerLogin("admin", "secret", { fetchImpl })).status).toBe("unavailable");
  });

  it("срок блокировки показывается словами", () => {
    expect(lockoutMessage(240000)).toContain("4 мин");
    expect(lockoutMessage(30000)).toContain("через минуту");
  });
});
