"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createRouting, PUBLIC_ENDPOINT } = require("../assisted/routing");
const body = { pickup: { lat: -24.724, lng: -53.744 }, destination: { lat: -24.73, lng: -53.735 }, testOnly: true, consentExternalRouting: true };
const valid = () => ({ code: "Ok", routes: [{ distance: 1800, duration: 240, geometry: { type: "LineString", coordinates: [[-53.744, -24.724], [-53.74, -24.727], [-53.735, -24.73]] } }] });
test("assisted route requires explicit consent and local points before contacting a provider", async () => {
  let calls = 0; const plan = createRouting({ fetchImpl: async () => { calls++; return Response.json(valid()); } });
  for (const request of [{ ...body, consentExternalRouting: false }, { ...body, testOnly: false }, { ...body, pickup: { lat: 0, lng: 0 } }, { ...body, destination: body.pickup }]) await assert.rejects(plan(request));
  assert.equal(calls, 0);
  assert.throws(() => createRouting({ endpoint: "https://untrusted.invalid/" }), /invalid_routing_provider/);
  assert.throws(() => createRouting({ endpoint: "http://192.168.1.1/", allowFixture: true }), /invalid_routing_provider/);
});
test("assisted route uses fixed provider, validates geometry, caches repeats and limits aggregate traffic", async () => {
  let time = 1700000000000, calls = 0;
  const plan = createRouting({ now: () => time, fetchImpl: async (url, options) => {
    calls++; assert.ok(url.href.startsWith(PUBLIC_ENDPOINT)); assert.equal(options.redirect, "error"); assert.match(options.headers["User-Agent"], /NAVE-Assistido/); return Response.json(valid());
  } });
  const route = await plan(body); assert.equal(route.distanceMeters, 1800); assert.equal(route.trafficAware, false); assert.deepEqual(route.points.pickup, body.pickup);
  assert.deepEqual(await plan(body), route); assert.equal(calls, 1);
  await assert.rejects(plan({ ...body, destination: { lat: -24.731, lng: -53.734 } }), /routing_cooldown/);
  time += 300001; await plan(body); assert.equal(calls, 2);
});
test("assisted routing never substitutes a fake route when provider fails or returns unsafe points", async () => {
  const failed = createRouting({ fetchImpl: async () => { throw new Error("provider down"); } });
  await assert.rejects(failed(body));
  for (const bad of [{ code: "NoRoute", routes: [] }, { code: "Ok", routes: [{ ...valid().routes[0], distance: -1 }] }, { code: "Ok", routes: [{ ...valid().routes[0], geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } }] }]) {
    await assert.rejects(createRouting({ fetchImpl: async () => Response.json(bad) })(body));
  }
});
