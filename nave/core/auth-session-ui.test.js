"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../public/auth-session.js"), "utf8");
function ui(response) {
  const nodes = [], calls = []; let ready = 0, reload = 0;
  const document = { createElement(tag) { const node = { tag, children: [], events: {}, value: "", append(...items) { this.children.push(...items); }, after() {}, setAttribute() {}, addEventListener(type, fn) { this.events[type] = fn; } }; nodes.push(node); return node; }, querySelector: () => ({ after() {} }) };
  const context = vm.createContext({ document, AbortSignal, location: { reload() { reload++; } }, fetch: async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return response; } });
  vm.runInContext(source + ";globalThis.session = NaveLabSession", context);
  context.session.mount("passenger", async () => ready++);
  const inputs = nodes.filter(n => n.tag === "input"), form = nodes.find(n => n.tag === "form");
  return { nodes, calls, context, inputs, async submit() { inputs[0].value = "test@example.invalid"; inputs[1].value = "fixture-password"; await form.events.submit({ preventDefault() {} }); }, ready: () => ready, reload: () => reload };
}
test("login UI holds token only in memory, clears password, and exits without cached identity", async () => {
  const page = ui({ ok: true, json: async () => ({ testOnly: true, role: "passenger", accessToken: "fixture-token" }) });
  assert.equal(Object.keys(page.context.session.headers()).length, 0);
  await page.submit(); assert.equal(page.ready(), 1);
  assert.equal(page.context.session.headers().Authorization, "Bearer fixture-token");
  assert.equal(page.inputs[1].value, "");
  assert.deepEqual(Object.keys(page.calls[0].body).sort(), ["email", "password"]);
  page.nodes.find(n => n.textContent === "Sair desta tela").events.click();
  assert.equal(Object.keys(page.context.session.headers()).length, 0); assert.equal(page.reload(), 1);
});
test("login UI rejects a valid account for the other role and unavailable lab", async () => {
  for (const response of [{ ok: true, json: async () => ({ testOnly: true, role: "driver", accessToken: "other-role" }) }, { ok: false, status: 404 }]) {
    const page = ui(response); await page.submit();
    assert.equal(page.ready(), 0); assert.equal(Object.keys(page.context.session.headers()).length, 0);
    assert.equal(page.inputs[1].value, "");
    assert.ok(page.nodes.find(n => n.tag === "p" && /não corresponde|indisponível/.test(n.textContent)));
  }
});
