"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("./ride-contract");

test("all four categories exist", () => assert.deepEqual(core.CATEGORY_CODES, ["eco","confort","executive","navegator"]));
test("compatibility aliases retain existing DB categories", () => {
  assert.equal(core.normalizeCategory("Comfort"), "confort");
  assert.equal(core.normalizeCategory("Navegator"), "navegator");
  assert.equal(core.normalizeCategory("navigator"), "navegator");
});
test("preview uses base + distance + time, never surge", () => {
  const q = core.previewTestQuote({ category:"eco", distanceMeters:10000, durationSeconds:600 });
  assert.equal(q.fareCents, 2200);
  assert.equal(q.pricingMode, "fixed-distance-time");
  assert.equal(q.quoteIsTestOnly, true);
  assert.equal(q.commercialRideEnabled, false);
});
test("15 percent platform commission and 85 percent before expenses", () => {
  assert.deepEqual(core.commissionForFare(10000), { fareCents:10000, commissionCents:1500, driverGrossCents:8500 });
});
test("rounding sum must exactly match gross fare", () => {
  const r = core.commissionForFare(101);
  assert.equal(r.commissionCents + r.driverGrossCents, r.fareCents);
});
test("negative and unsafe amounts rejected", () => {
  assert.throws(() => core.commissionForFare(-1), RangeError);
  assert.throws(() => core.commissionForFare(Number.MAX_SAFE_INTEGER), RangeError);
});
test("unknown category and invalid routes rejected", () => {
  assert.throws(() => core.previewTestQuote({ category:"diesel",distanceMeters:1000,durationSeconds:60 }), RangeError);
  assert.throws(() => core.previewTestQuote({ category:"eco",distanceMeters:0,durationSeconds:60 }), RangeError);
});
test("no commercial operations exposed", () => assert.equal(core.COMMERCIAL_RIDES_ENABLED, false));
