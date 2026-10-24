"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { fork } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");
test("real Auth room survives controlled process restarts without losing ownership or receipts", { timeout: 120000 }, async () => {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const status = JSON.parse(fs.readFileSync(process.env.NAVE_TEST_STATUS_FILE, "utf8"));
  const url = status.API_URL || status.api_url; assert.equal(url, "http://127.0.0.1:54321");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, status.SERVICE_ROLE_KEY || status.service_role_key, options), tokens = {};
  for (const role of ["passenger", "driver", "outsider"]) {
    const email = `checkpoint-${crypto.randomUUID()}@example.invalid`, password = crypto.randomBytes(32).toString("hex");
    assert.equal((await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { nave_lab_role: role === "outsider" ? "passenger" : role, nave_lab_driver_approved: role === "driver" } })).error, null);
    const signed = await createClient(url, status.ANON_KEY || status.anon_key, options).auth.signInWithPassword({ email, password });
    assert.equal(signed.error, null); tokens[role] = signed.data.session.access_token;
  }
  let child, base;
  const start = async () => {
    child = fork(path.join(__dirname, "auth-lab-process.cjs"), [], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Lab startup timeout")), 15000);
      child.once("error", () => { clearTimeout(timer); reject(new Error("Lab startup failed")); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Lab exited before ready")); });
      child.once("message", message => { clearTimeout(timer); message.ready ? resolve(message.ready) : reject(new Error("Lab checkpoint refused")); });
    });
    base = "http://127.0.0.1:" + port;
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("Controlled stop timeout")); }, 15000);
      child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Controlled stop failed")); });
      child.send({ type: "stop" });
    });
  };
  const call = async (role, body) => {
    const response = await fetch(base + "/api/auth-lab/room", { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + tokens[role], "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, replay: response.headers.get("Idempotency-Replayed"), data: await response.json().catch(() => null) };
  };
  try {
    await start();
    const { roomId } = (await call("passenger")).data;
    const action = (role, action, version, extra = {}) => ({ roomId, role, action, version, requestKey: crypto.randomUUID(), ...extra });
    await call("driver", action("driver", "availability", 0, { available: true }));
    const request = action("passenger", "start", 1, { category: "eco" });
    const before = (await call("passenger", request)).data;
    assert.equal(before.storage, "runner-checkpoint"); assert.equal(before.version, 2);
    const firstPid = child.pid; await stop(); await start(); assert.notEqual(child.pid, firstPid);
    assert.deepEqual((await call("passenger")).data, before);
    const replay = await call("passenger", request); assert.equal(replay.replay, "true"); assert.deepEqual(replay.data, before);
    assert.equal((await call("outsider")).status, 403);
    const accept = action("driver", "accept", 2); assert.equal((await call("driver", accept)).status, 200);
    await stop(); await start();
    const accepted = await call("driver", accept); assert.equal(accepted.replay, "true"); assert.equal(accepted.data.version, 3);
    assert.equal(accepted.data.journey.phase, "driver_to_pickup"); assert.equal(accepted.data.offerExpiresAt, null);
    for (const [index, step] of ["arrive", "board", "complete"].entries()) assert.equal((await call("driver", action("driver", step, 3 + index))).status, 200);
    await stop(); await start();
    const completed = (await call("passenger")).data; assert.equal(completed.journey.phase, "completed"); assert.equal(completed.version, 6); assert.equal(completed.events.length, 6);
    assert.equal((await call("outsider")).status, 403);
    const file = path.join(process.env.RUNNER_TEMP, "nave-room-checkpoint/room.json"), persisted = fs.readFileSync(file, "utf8");
    for (const token of Object.values(tokens)) assert.equal(persisted.includes(token), false);
    assert.equal(/access_token|refresh_token|password|service_role_key/.test(persisted), false);
    console.log("PASS: separate process IDs, controlled restarts preserve room, participants, deadline, accepted/completed journey and idempotent receipts. Real Auth still blocks outsider. Runner-only file contains no tokens/passwords; no hosted tables changed.");
  } finally { await stop(); }
});
