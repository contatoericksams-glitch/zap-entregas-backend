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
