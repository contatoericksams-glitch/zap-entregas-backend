"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
for (const storage of ["process-memory", "runner-checkpoint"]) test("authenticated client retries uncertain delivery with identical body/key: " + storage, async () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/local-sync.js"), "utf8"), posts = [];
  const snapshot = { roomId: "fixture-room", version: 0, testOnly: true, storage, commercialRidesEnabled: false, whatsappSendEnabled: false, paymentsEnabled: false };
  const node = () => ({ textContent: "", after() {}, append() {} });
  let connect, uuidCalls = 0;
  const context = vm.createContext({ URLSearchParams, AbortSignal, location: { search: "?auth=1", reload() {} }, document: { createElement: node, querySelector: node, querySelectorAll: () => [], getElementById: node }, window: { addEventListener() {} }, setInterval() { return 1; }, clearInterval() {}, crypto: { randomUUID() { uuidCalls++; return "fixture-request-key"; } }, NaveLabSession: { headers: () => ({ Authorization: "Bearer fixture" }), clear() {}, mount(_role, start) { connect = start(); } }, fetch: async (_url, options) => {
    if (options.method === "POST") { posts.push(options.body); if (posts.length === 1) { snapshot.version = 1; throw new Error("Response lost after server commit"); } }
    return { ok: true, json: async () => ({ ...snapshot }) };
  } });
  vm.runInContext(source + ";globalThis.sync = NaveLocalSync", context);
  await context.sync.connect("passenger", () => {}); await connect;
  const result = await context.sync.mutate("start", { category: "eco" });
  assert.equal(result.version, 1); assert.equal(posts.length, 2); assert.equal(posts[0], posts[1]); assert.equal(uuidCalls, 1);
});

for (const authenticated of [false, true]) test("disconnected client blocks commands until a validated snapshot returns: " + authenticated, async () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/local-sync.js"), "utf8");
  const snapshot = { roomId: "fixture-room", version: 0, testOnly: true, storage: "process-memory", commercialRidesEnabled: false, whatsappSendEnabled: false, paymentsEnabled: false };
  const node = () => ({ textContent: "", after() {}, append() {} });
  let connect, poll, offline = false, unsafe = false, posts = 0, rendered = 0;
  const connectionStates = [];
  const context = vm.createContext({ URLSearchParams, AbortSignal, location: { search: authenticated ? "?auth=1" : "?shared=1", reload() {} }, document: { createElement: node, querySelector: node, querySelectorAll: () => [], getElementById: node }, window: { addEventListener() {} }, setInterval(fn) { poll = fn; return 1; }, clearInterval() {}, crypto: { randomUUID: () => "fixture-request-key" }, NaveLabSession: { headers: () => ({ Authorization: "Bearer fixture" }), clear() {}, mount(_role, start) { connect = start(); } }, fetch: async (_url, options) => {
    if (options.method === "POST") posts++;
    if (offline) throw new Error("Offline");
    return { ok: true, json: async () => ({ ...snapshot, testOnly: !unsafe }) };
  } });
  vm.runInContext(source + ";globalThis.sync = NaveLocalSync", context);
  await context.sync.connect("passenger", () => rendered++, value => connectionStates.push(value)); await connect;
  assert.deepEqual(connectionStates, [false, true]);
  offline = true; await poll();
  await assert.rejects(context.sync.mutate("start"), /Aguarde a conexão/);
  assert.equal(posts, 0, "Do not send commands using the cached offline snapshot");
  offline = false; unsafe = true; await poll();
  await assert.rejects(context.sync.mutate("start"), /Aguarde a conexão/);
  unsafe = false; await poll();
  assert.equal(rendered, 1, "Same-version recovery does not create another journey update");
  assert.deepEqual(connectionStates, [false, true, false, true]);
  offline = true;
  await assert.rejects(context.sync.mutate("start"), /Conexão local indisponível/);
  assert.equal(posts, authenticated ? 2 : 1);
  await assert.rejects(context.sync.mutate("start"), /Aguarde a conexão/);
  assert.equal(posts, authenticated ? 2 : 1, "An uncertain send blocks further commands until the next successful read");
  offline = false; await poll(); await context.sync.mutate("start");
  assert.equal(posts, authenticated ? 3 : 2);
});
