"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), http = require("node:http"), express = require("express"), crypto = require("node:crypto");
const { LabCheckpoint } = require("./lab-checkpoint");
const { createLocalDemoRouter } = require("./local-demo-router");
function directory(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nave-checkpoint-test-"));
  return Promise.resolve().then(() => run(root)).finally(() => {
    for (const name of ["writer.lock", "room.json", "room.tmp"]) { try { fs.unlinkSync(path.join(root, name)); } catch (e) { if (e.code !== "ENOENT") throw e; } }
    fs.rmdirSync(root); // Nonrecursive: never deletes unexpected files.
  });
}
test("checkpoint excludes second writer, atomically replaces state, and rejects malformed JSON", () => directory(root => {
  const first = new LabCheckpoint(root);
  try {
    assert.equal(first.load(), null); assert.throws(() => new LabCheckpoint(root));
    first.save({ fixture: 1 }); first.save({ fixture: 2 }); assert.deepEqual(first.load(), { fixture: 2 });
    assert.equal(fs.existsSync(path.join(root, "room.tmp")), false);
    assert.throws(() => first.save({ large: "x".repeat(262144) }));
    assert.deepEqual(first.load(), { fixture: 2 });
  } finally { first.close(); }
  const second = new LabCheckpoint(root);
  try {
    assert.deepEqual(second.load(), { fixture: 2 });
    for (const corrupt of ["broken", "null", "[]", "false"]) { fs.writeFileSync(path.join(root, "room.json"), corrupt); assert.throws(() => second.load()); }
  }
  finally { second.close(); }
}));
test("controlled restart preserves ownership, version, expiry and duplicate receipts", () => directory(async root => {
  let now = Date.now(), store, server;
  const open = async () => {
    store = new LabCheckpoint(root);
    const app = express(); app.use(createLocalDemoRouter({ authenticated: true, checkpoint: store, clock: () => now, requireUser(req, _res, next) { const [role, id] = req.get("authorization").split(":"); req.labActor = { role, id }; next(); } }));
    server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  };
  const close = async () => { await new Promise(resolve => server.close(resolve)); store.close(); };
  const call = async (role, body, id = role) => {
    const res = await fetch("http://127.0.0.1:" + server.address().port, { method: body ? "POST" : "GET", headers: { Authorization: role + ":" + id, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, replay: res.headers.get("Idempotency-Replayed"), data: await res.json().catch(() => null) };
  };
  await open();
  try {
    const { roomId } = (await call("passenger")).data;
    const action = (role, action, version, extra = {}) => ({ roomId, role, action, version, requestKey: crypto.randomUUID(), ...extra });
    assert.equal((await call("driver", action("driver", "availability", 0, { available: true, category: "x".repeat(600) }))).status, 400);
    await call("driver", action("driver", "availability", 0, { available: true }));
    const start = action("passenger", "start", 1, { category: "eco" });
    const before = (await call("passenger", start)).data;
    await close(); await open();
    assert.deepEqual((await call("passenger")).data, before);
    assert.equal((await call("passenger", start)).replay, "true");
    assert.equal((await call("passenger", undefined, "outside")).status, 403);
    await close(); now += 120000; await open();
    assert.equal((await call("driver", action("driver", "accept", 2))).status, 409);
    const expired = (await call("passenger")).data; assert.equal(expired.journey.phase, "cancelled");
    await close(); await open();
    assert.deepEqual((await call("passenger")).data, expired); assert.equal((await call("passenger", start)).data.version, 3);
    assert.equal(JSON.stringify(store.load()).includes("access_token"), false);
  } finally { await close(); }
}));
test("checkpoint write failure returns 503 and blocks uncommitted reads/replays", async () => {
  let fail = false;
  const checkpoint = { load: () => null, save() { if (fail) throw new Error("Injected disk failure"); } };
  const app = express(); app.use(createLocalDemoRouter({ authenticated: true, checkpoint, requireUser(req, _res, next) { req.labActor = { role: "driver", id: "d" }; next(); } }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    const { roomId } = await (await fetch(url)).json(); fail = true;
    const body = { roomId, version: 0, role: "driver", action: "availability", available: true, requestKey: crypto.randomUUID() };
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 503);
    assert.equal((await fetch(url)).status, 503);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("incompatible checkpoint schema fails startup instead of silently resetting the room", () => {
  const checkpoint = { load: () => ({ schema: 999 }), save() { throw new Error("Must not overwrite invalid state"); } };
  assert.throws(() => createLocalDemoRouter({ authenticated: true, requireUser() {}, checkpoint }), /Invalid lab checkpoint/);
  const { createAuthLabApp } = require("./auth-lab");
  assert.throws(() => createAuthLabApp({ url: "http://127.0.0.1:54321", publishableKey: "fixture", checkpointDirectory: "/outside-runner-checkpoint" }), /restricted/);
});
