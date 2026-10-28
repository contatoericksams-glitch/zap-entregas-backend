"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { estimateFares } = require("../assisted/fares");
test("assisted fares reuse test tariffs in integer BRL cents for all categories", () => {
  const route = { testOnly: true, distanceMeters: 5000, durationSeconds: 600 };
  const fares = estimateFares(route);
  assert.deepEqual(Object.keys(fares), ["eco", "confort", "executive", "navegator"]);
  assert.deepEqual(Object.values(fares).map(f => f.amountCents), [1375, 1635, 2670, 2970]);
  for (const fare of Object.values(fares)) {
    assert.equal(fare.currency, "BRL"); assert.equal(fare.testOnly, true); assert.equal(fare.commercialRideEnabled, false);
    assert.equal(fare.distanceMeters, 5000); assert.equal(fare.durationSeconds, 600); assert.equal(Number.isSafeInteger(fare.amountCents), true);
  }
  assert.equal(Object.hasOwn(route, "fareEstimate"), false, "Do not mutate a provider's cached route");
});
test("assisted fares never invent route evidence or bypass existing tariff bounds", () => {
  for (const r of [null, { testOnly: false, distanceMeters: 5000, durationSeconds: 600 }, { testOnly: true, distanceMeters: NaN, durationSeconds: 600 }]) assert.throws(() => estimateFares(r));
  assert.deepEqual(estimateFares({ testOnly: true, distanceMeters: 80, durationSeconds: 12 }), {});
  assert.throws(() => estimateFares({ testOnly: true, distanceMeters: 500001, durationSeconds: 600 }));
});
