"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { simulateJourney } = require("./journey-lab");
const source = fs.readFileSync(path.join(__dirname, "../public/motorista.js"), "utf8");
function page({ unsafe = false, fail = false } = {}) {
  const elements = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, disabled: false, value: "eco", textContent: "", events: {}, classList: { toggle() {} }, addEventListener(name, fn) { this.events[name] = fn; } });
    return elements.get(id);
  };
  vm.runInNewContext(source, { document: { getElementById: element, querySelectorAll: () => [0, 1, 2, 3].map(n => element("step" + n)) }, Intl, AbortSignal, fetch: async (url, options) => {
    calls.push(url); const data = simulateJourney(JSON.parse(options.body));
    return { ok: !fail, json: async () => unsafe ? { ...data, paymentsEnabled: true } : data };
  } });
  return { element, calls, click: async id => { assert.equal(element(id).disabled, false, id); await element(id).events.click(); } };
}
test("driver must opt into local availability before receiving a fictional offer", async () => {
  const ui = page();
  assert.equal(ui.element("generate").disabled, true);
  assert.equal(ui.calls.length, 0);
  await ui.click("toggle"); await ui.click("generate");
  assert.equal(ui.element("toggle").disabled, true);
  assert.equal(ui.element("phase").textContent, "Uma nova oferta fictícia");
  assert.match(ui.element("gross").textContent, /11,05/);
  assert.match(ui.element("commission").textContent, /1,95/);
  await ui.click("accept"); await ui.click("advance"); await ui.click("advance"); await ui.click("advance");
  assert.equal(ui.element("phase").textContent, "Demonstração concluída");
  assert.equal(ui.element("advance").hidden, true);
  await ui.click("reset"); await ui.click("toggle");
  assert.equal(ui.element("generate").disabled, true);
  assert.ok(ui.calls.every(url => url === "/api/v5/journey-lab"));
});
test("declining does not let the same driver act on another driver's redistributed offer", async () => {
  const ui = page(); await ui.click("toggle"); await ui.click("generate");
  const pilot = ui.element("pilot").textContent;
  await ui.click("decline");
  assert.equal(ui.element("phase").textContent, "Oferta recusada nesta tela");
  assert.equal(ui.element("pilot").textContent, pilot);
  assert.equal(ui.element("accept").hidden, true);
  assert.equal(ui.element("advance").hidden, true);
  assert.equal(ui.element("reset").hidden, false);
});
test("unsafe or unavailable responses never display a driver offer", async () => {
  for (const options of [{ unsafe: true }, { fail: true }]) {
    const ui = page(options); await ui.click("toggle"); await ui.click("generate");
    assert.equal(ui.element("trip").hidden, true);
    assert.equal(ui.element("accept").hidden, true);
    assert.notEqual(ui.element("error").textContent, "");
    assert.equal(ui.element("generate").disabled, false);
  }
});
