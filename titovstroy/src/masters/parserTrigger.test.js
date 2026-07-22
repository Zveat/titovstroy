import { describe, expect, it, vi } from "vitest";
import { triggerParserRun } from "./parserTrigger.js";

describe("triggerParserRun", () => {
  it("sends the Firebase token and parser request to the server gateway", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, dispatched: true }),
    }));

    const result = await triggerParserRun({
      source: "olx",
      runNow: 123,
      getToken: async () => "firebase-token",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, dispatched: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/trigger-parser", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer firebase-token" }),
      body: JSON.stringify({ source: "olx", runNow: 123 }),
    }));
  });

  it("returns a queue fallback when the direct gateway is unavailable", async () => {
    const result = await triggerParserRun({
      source: "naimi",
      runNow: 456,
      getToken: async () => "firebase-token",
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ code: "trigger_not_configured" }) }),
    });

    expect(result.ok).toBe(false);
    expect(result.queued).toBe(true);
    expect(result.code).toBe("trigger_not_configured");
  });

  it("does not call the gateway without Firebase authentication", async () => {
    const fetchImpl = vi.fn();
    const result = await triggerParserRun({
      source: "naimi",
      runNow: 789,
      getToken: async () => null,
      fetchImpl,
    });

    expect(result).toEqual({ ok: false, queued: true, code: "firebase_auth_unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
