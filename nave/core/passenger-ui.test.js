"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { previewTestQuote } = require("./ride-contract");
const { simulateJourney } = require("./journey-lab");
const script = fs.readFileSync(path.join(__dirname, "../public/passageiro.js"), "utf8");
async function page({ unsafe = false, unavailable = false } = {}) {
  const elements = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: "", hidden: false, disabled: false, events: {}, classList: { toggle() {} }, addEventListener(event, fn) { this.events[event] = fn; } });
    return elements.get(id);
  };
  const radios = ["eco", "confort", "executive", "navegator"].map(code => Object.assign(element(code), { value: code }));
  const document = { getElementById: element, querySelector: () => radios[0], querySelectorAll: selector => selector === "#steps li" ? [0, 1, 2, 3].map(n => element("step" + n)) : radios };
  vm.runInNewContext(script, { document, Intl, Map, AbortSignal, fetch: async (url, options) => {
    const input = JSON.parse(options.body); calls.push({ url, input });
    if (unavailable) return { ok: false };
    const data = url.endsWith("quote-preview") ? previewTestQuote(input) : simulateJourney(input);
    return { ok: true, json: async () => unsafe && url.endsWith("journey-lab") ? { ...data, commercialRidesEnabled: true } : data };
  } });
  await new Promise(resolve => setImmediate(resolve));
  return { element, calls, click: async id => { assert.equal(element(id).disabled, false, id); await element(id).events.click(); await new Promise(resolve => setImmediate(resolve)); } };
}
test("passenger interface completes the synthetic journey and removes cancel after boarding", async () => {
  const ui = await page();
  assert.match(ui.element("fare").textContent, /13,00/);
  await ui.click("start");
  assert.equal(ui.element("phase").textContent, "Aguardando aceite fictício");
  await ui.click("advance"); await ui.click("advance");
  assert.equal(ui.element("eta").textContent, "Aguardando embarque fictício");
  await ui.click("advance");
  assert.equal(ui.element("cancel").hidden, true);
  await ui.click("advance");
  assert.equal(ui.element("phase").textContent, "Simulação concluída");
  assert.equal(ui.element("advance").disabled, true);
  await ui.click("reset");
  assert.equal(ui.element("start").disabled, false);
  assert.ok(ui.calls.every(call => call.url.startsWith("/api/v5/")));
});
test("passenger interface supports cancellation and refuses unsafe journey flags", async () => {
  const ui = await page(); await ui.click("start"); await ui.click("cancel");
  assert.equal(ui.element("phase").textContent, "Simulação cancelada");
  const blocked = await page({ unsafe: true }); await blocked.click("start");
  assert.equal(blocked.element("phase").textContent, "Tudo pronto para começar");
  assert.match(blocked.element("error").textContent, /não está disponível/);
});
test("passenger interface keeps requests disabled if test quotations are unavailable", async () => {
  const ui = await page({ unavailable: true });
  assert.equal(ui.element("start").disabled, true);
  assert.match(ui.element("error").textContent, /cotações de teste/);
});
