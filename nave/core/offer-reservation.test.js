"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto"), http = require("node:http"), express = require("express");
const { createLocalDemoRouter } = require("./local-demo-router");
async function lab(run) {
  let now = 1800000000000;
  const app = express(); app.use(createLocalDemoRouter({ authenticated: true, clock: () => now, requireUser(req, res, next) {
    const [role, id] = (req.get("authorization") || "").split(":");
    if (!id) return res.sendStatus(401); req.labActor = { role, id }; next();
  } }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  const call = async (actor, body) => {
    const r = await fetch(url, { method: body ? "POST" : "GET", headers: { Authorization: actor, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, replay: r.headers.get("Idempotency-Replayed"), data: await r.json().catch(() => null) };
  };
  const snapshot = (await call("passenger:p")).data;
  const action = (role, action, version, extra = {}) => ({ roomId: snapshot.roomId, role, action, version, requestKey: crypto.randomUUID(), ...extra });
  try { await run({ call, action, advance: ms => { now += ms; }, now: () => now }); } finally { await new Promise(resolve => server.close(resolve)); }
}
test("lost-response retry and concurrent identical requests create exactly one event", () => lab(async ({ call, action }) => {
  const request = action("driver", "availability", 0, { available: true });
  const replies = await Promise.all([call("driver:d", request), call("driver:d", request)]);
  assert.deepEqual(replies.map(r => r.status), [200, 200]);
  assert.equal(replies.filter(r => r.replay === "true").length, 1);
  assert.equal((await call("driver:d")).data.events.length, 1);
  assert.equal((await call("driver:d", { ...request, available: false })).status, 409);
  assert.equal((await call("driver:d", { ...request, requestKey: undefined })).status, 400);
  assert.equal((await call("driver:d", { ...request, requestKey: crypto.randomUUID() })).status, 409);
}));
test("deadline equality expires once, rejects late acceptance and replay cannot resurrect offer", () => lab(async ({ call, action, advance, now }) => {
  await call("driver:d", action("driver", "availability", 0, { available: true }));
  const start = action("passenger", "start", 1, { category: "eco" });
  assert.equal((await call("passenger:p", start)).data.offerExpiresAt, now() + 120000);
  advance(119999); assert.equal((await call("observer:a")).data.version, 2);
  advance(1);
  const late = await call("driver:d", action("driver", "accept", 2));
  assert.equal(late.status, 409); assert.equal(late.data.snapshot.journey.phase, "cancelled");
  const replay = await call("passenger:p", start);
  assert.equal(replay.replay, "true"); assert.equal(replay.data.journey.phase, "cancelled"); assert.equal(replay.data.offerExpiresAt, null);
  for (let i = 0; i < 3; i++) assert.equal((await call("observer:a")).data.version, 3);
  assert.equal(replay.data.events.filter(e => e.action === "expire").length, 1);
  assert.equal((await call("passenger:other", start)).status, 403);
}));
test("acceptance before deadline stops expiry; cache is bounded and expires safely", () => lab(async ({ call, action, advance }) => {
  await call("driver:d", action("driver", "availability", 0, { available: true }));
  await call("passenger:p", action("passenger", "start", 1, { category: "eco" }));
  await call("driver:d", action("driver", "accept", 2));
  advance(120000); const accepted = (await call("observer:a")).data;
  assert.equal(accepted.journey.phase, "driver_to_pickup"); assert.equal(accepted.offerExpiresAt, null); assert.equal(accepted.version, 3);
  await call("passenger:p", action("passenger", "cancel", 3));
  await call("passenger:p", action("passenger", "reset", 4));
  for (let version = 5; version < 512; version++) assert.equal((await call("driver:d", action("driver", "availability", version, { available: true }))).status, 200);
  assert.equal((await call("driver:d", action("driver", "availability", 512, { available: true }))).status, 429);
  advance(15 * 60 * 1000);
  assert.equal((await call("driver:d", action("driver", "availability", 512, { available: false }))).status, 200);
}));
