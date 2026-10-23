"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express"), http = require("node:http");
const { createLocalDemoRouter } = require("./local-demo-router");
async function room(run) {
  const app = express(); app.use("/api/local-demo", createLocalDemoRouter());
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port + "/api/local-demo";
  const roomId = (await (await fetch(url)).json()).roomId;
  const call = async (body, headers = {}) => {
    const res = await fetch(url, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify({ roomId, ...body }) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try { await run(call); } finally { await new Promise(resolve => server.close(resolve)); }
}
test("local room shares a complete passenger/driver journey with version checks", () => room(async call => {
  assert.equal((await call()).data.journey, null);
  assert.equal((await call({ role: "passenger", action: "start", category: "eco", version: 0 })).status, 409);
  await call({ role: "driver", action: "availability", available: true, version: 0 });
  const started = await call({ role: "passenger", action: "start", category: "eco", version: 1 });
  assert.equal(started.data.journey.phase, "offer_pending");
  assert.equal((await call({ role: "driver", action: "board", version: 2 })).status, 400);
  assert.equal((await call({ role: "passenger", action: "accept", version: 2 })).status, 403);
  assert.equal((await call({ role: "passenger", action: "reset", version: 2 })).status, 409);
  for (const [i, action] of ["accept", "arrive", "board", "complete"].entries()) {
    assert.equal((await call({ role: "driver", action, version: 2 + i })).status, 200);
    if (action === "board") assert.equal((await call({ role: "passenger", action: "cancel", version: 5 })).status, 400);
  }
  const done = (await call()).data;
  assert.equal(done.journey.phase, "completed"); assert.equal(done.version, 6);
  assert.equal(done.journey.fareCents, done.journey.driverGrossCents + done.journey.commissionCents);
  assert.equal((await call({ role: "passenger", action: "reset", version: 6 })).data.journey, null);
  const events = (await call()).data.events;
  assert.deepEqual(events.map(event => event.action), ["availability", "start", "accept", "arrive", "board", "complete", "reset"]);
  assert.deepEqual(events.map(event => event.sequence), [1, 2, 3, 4, 5, 6, 7]);
}));
test("concurrent duplicate accepts advance once and return the authoritative snapshot", () => room(async call => {
  await call({ role: "driver", action: "availability", available: true, version: 0 });
  await call({ role: "passenger", action: "start", category: "confort", version: 1 });
  const responses = await Promise.all([call({ role: "driver", action: "accept", version: 2 }), call({ role: "driver", action: "accept", version: 2 })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(responses.find(r => r.status === 409).data.snapshot.journey.phase, "driver_to_pickup");
  assert.equal((await call()).data.events.filter(event => event.action === "accept").length, 1);
}));
test("decline and passenger cancellation reach both views and forbid later acceptance", () => room(async call => {
  await call({ role: "driver", action: "availability", available: true, version: 0 });
  await call({ role: "passenger", action: "start", category: "eco", version: 1 });
  const result = await call({ role: "driver", action: "decline", version: 2 });
  assert.equal(result.data.journey.phase, "cancelled");
  assert.equal((await call({ role: "driver", action: "accept", version: 3 })).status, 409);
  await call({ role: "passenger", action: "reset", version: 3 });
  await call({ role: "passenger", action: "start", category: "eco", version: 4 });
  assert.equal((await call({ role: "passenger", action: "cancel", version: 5 })).data.journey.phase, "cancelled");
}));
test("local demo refuses cross-origin writes and injected client state", () => room(async call => {
  assert.equal((await call({ role: "driver", action: "availability", available: true, version: 0 }, { origin: "https://unrelated.example" })).status, 403);
  assert.equal((await call({ role: "driver", action: "availability", available: true, version: 0, state: {} })).status, 400);
  assert.equal((await call()).data.version, 0);
  const staleRoom = await call({ roomId: "old-server-room", role: "driver", action: "availability", available: true, version: 0 });
  assert.equal(staleRoom.status, 409); assert.equal(staleRoom.data.snapshot.available, false);
}));
test("a fresh server room starts empty without persisted state or commercial flags", () => room(async call => {
  const { data } = await call(); assert.equal(data.version, 0); assert.equal(data.available, false); assert.equal(data.journey, null);
  assert.equal(data.storage, "process-memory"); assert.equal(data.paymentsEnabled, false); assert.equal(data.whatsappSendEnabled, false); assert.equal(data.commercialRidesEnabled, false);
  assert.deepEqual(data.events, []);
}));
test("observer cannot mutate the local room and reads do not create history events", () => room(async call => {
  assert.equal((await call({ role: "observer", action: "availability", available: true, version: 0 })).status, 400);
  for (let i = 0; i < 3; i++) assert.deepEqual((await call()).data.events, []);
}));
test("local history keeps only the latest 100 accepted actions without user data", () => room(async call => {
  for (let i = 0; i < 105; i++) assert.equal((await call({ role: "driver", action: "availability", available: i % 2 === 0, version: i })).status, 200);
  const { events } = (await call()).data;
  assert.equal(events.length, 100); assert.equal(events[0].sequence, 6); assert.equal(events[99].sequence, 105);
  assert.deepEqual(Object.keys(events[0]).sort(), ["action", "at", "available", "phase", "role", "sequence"]);
}));
