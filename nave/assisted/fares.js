"use strict";
const { CATEGORY_CODES, previewTestQuote } = require("../core/ride-contract");
function estimateFares(route) {
  if (route?.testOnly !== true || !Number.isSafeInteger(route.distanceMeters) || !Number.isSafeInteger(route.durationSeconds)) throw new Error("invalid_fare_route");
  // Preserve the existing test tariff contract, including its lower bounds.
  if (route.distanceMeters < 100 || route.durationSeconds < 15) return {};
  return Object.fromEntries(CATEGORY_CODES.map(category => {
    const quote = previewTestQuote({ category, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });
    return [category, { schemaVersion: 1, currency: "BRL", amountCents: quote.fareCents, category, distanceMeters: quote.distanceMeters, durationSeconds: quote.durationSeconds, rulesVersion: "nave-test-v1", pricingMode: quote.pricingMode, testOnly: true, commercialRideEnabled: false }];
  }));
}
module.exports = { estimateFares };
