"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createGeocoding, ENDPOINT } = require("../assisted/geocoding");
const body = { query: "Rua de teste, cidade", consentExternalSearch: true, testOnly: true };
const feature = (coords = [-53.744, -24.724]) => ({ geometry: { type: "Point", coordinates: coords }, properties: { street: "Rua de teste", housenumber: "10", city: "Cidade", countrycode: "BR" } });
test("address search requires consent, valid query and fixed provider", async () => {
  let calls = 0;
  const search = createGeocoding({ fetchImpl: async url => { calls++; assert.equal(url.origin + url.pathname, ENDPOINT); assert.equal(url.searchParams.get("q"), body.query); assert.equal(url.searchParams.get("limit"), "5"); assert.equal(url.searchParams.get("lang"), "default", "Public Photon rejects unsupported pt; preserve local place names"); return Response.json({ features: [feature()] }); } });
  for (const input of [{ ...body, consentExternalSearch: false }, { ...body, testOnly: false }, { ...body, query: "ab" }, { ...body, query: "x".repeat(241) }]) await assert.rejects(search(input), /invalid_search/);
  assert.equal(calls, 0); assert.equal((await search(body)).results[0].label, "Rua de teste, 10 · Cidade");
  await assert.rejects(search(body), /search_cooldown/); assert.equal(calls, 1);
});
test("address search rejects unsafe results and fails without invented points", async () => {
  const search = createGeocoding({ fetchImpl: async () => Response.json({ features: [feature([0, 0]), feature(), { ...feature(), properties: { countrycode: "US", name: "Other" } }] }) });
  assert.equal((await search(body)).results.length, 1);
  await assert.rejects(createGeocoding({ fetchImpl: async () => Response.json({}, { status: 503 }) })(body));
  await assert.rejects(createGeocoding({ fetchImpl: async () => Response.json({ bad: true }) })(body));
  await assert.rejects(createGeocoding({ fetchImpl: async () => new Response("x".repeat(131073)) })(body), /too_large/);
});
