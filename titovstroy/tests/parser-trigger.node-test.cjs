const test = require("node:test");
const assert = require("node:assert/strict");

const { createParserTriggerHandler } = require("../api/trigger-parser.js");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(overrides = {}) {
  return {
    method: "POST",
    headers: {
      origin: "https://www.titovstroy.kz",
      authorization: "Bearer firebase-id-token",
    },
    body: { source: "olx", runNow: 1_784_730_000_000 },
    ...overrides,
  };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("rejects requests from a foreign origin before contacting services", async () => {
  let calls = 0;
  const handler = createParserTriggerHandler({
    githubToken: "secret",
    fetchImpl: async () => { calls += 1; throw new Error("must not run"); },
  });
  const res = responseRecorder();

  await handler(request({ headers: { origin: "https://evil.example", authorization: "Bearer firebase-id-token" } }), res);

  assert.equal(res.statusCode, 403);
  assert.equal(calls, 0);
});

test("requires a valid Firebase identity token", async () => {
  const calls = [];
  const handler = createParserTriggerHandler({
    githubToken: "secret",
    now: () => 1_784_730_001_000,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return jsonResponse(401, { error: { message: "INVALID_ID_TOKEN" } });
    },
  });
  const res = responseRecorder();

  await handler(request(), res);

  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /accounts:lookup/);
});

test("does not dispatch when the matching Firebase request is not pending", async () => {
  const calls = [];
  const handler = createParserTriggerHandler({
    githubToken: "secret",
    now: () => 11,
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("accounts:lookup")) return jsonResponse(200, { users: [{ localId: "anon-1" }] });
      if (String(url).includes("firebaseio.com")) return jsonResponse(200, JSON.stringify({ runNow: 10, lastRunNow: 10 }));
      throw new Error("GitHub must not be called");
    },
  });
  const res = responseRecorder();

  await handler(request({ body: { source: "olx", runNow: 10 } }), res);

  assert.equal(res.statusCode, 409);
  assert.equal(calls.some(url => url.includes("api.github.com")), false);
});

test("dispatches the fixed parser workflow for a verified pending request", async () => {
  const calls = [];
  const runNow = 1_784_730_000_000;
  const handler = createParserTriggerHandler({
    githubToken: "github-secret",
    now: () => runNow + 1_000,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("accounts:lookup")) return jsonResponse(200, { users: [{ localId: "anon-1" }] });
      if (String(url).includes("firebaseio.com")) return jsonResponse(200, JSON.stringify({ runNow, lastRunNow: 0 }));
      if (options.method === "GET") return jsonResponse(200, { workflow_runs: [] });
      if (options.method === "POST") return jsonResponse(204, null);
      throw new Error("unexpected request");
    },
  });
  const res = responseRecorder();

  await handler(request({ body: { source: "olx", runNow } }), res);

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.ok, true);
  const dispatch = calls.find(call => call.options.method === "POST" && call.url.includes("api.github.com"));
  assert.ok(dispatch);
  assert.match(dispatch.url, /Zveat\/titovstroy\/actions\/workflows\/naimi-parser\.yml\/dispatches$/);
  assert.deepEqual(JSON.parse(dispatch.options.body), { ref: "main" });
  assert.equal(dispatch.options.headers.Authorization, "Bearer github-secret");
});

test("deduplicates a workflow run created after the same request", async () => {
  const calls = [];
  const runNow = 1_784_730_000_000;
  const handler = createParserTriggerHandler({
    githubToken: "github-secret",
    now: () => runNow + 20_000,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("accounts:lookup")) return jsonResponse(200, { users: [{ localId: "anon-1" }] });
      if (String(url).includes("firebaseio.com")) return jsonResponse(200, JSON.stringify({ runNow, lastRunNow: 0 }));
      if (options.method === "GET") return jsonResponse(200, {
        workflow_runs: [{ id: 123, status: "queued", created_at: new Date(runNow + 5_000).toISOString() }],
      });
      throw new Error("duplicate dispatch must not run");
    },
  });
  const res = responseRecorder();

  await handler(request({ body: { source: "naimi", runNow } }), res);

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.alreadyRunning, true);
  assert.equal(calls.some(call => call.options.method === "POST" && call.url.includes("api.github.com")), false);
});

test("reports missing server configuration without exposing details", async () => {
  const handler = createParserTriggerHandler({ githubToken: "", fetchImpl: async () => { throw new Error("must not run"); } });
  const res = responseRecorder();

  await handler(request(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "trigger_not_configured");
  assert.equal(JSON.stringify(res.body).includes("token"), false);
});
