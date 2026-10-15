"use strict";
// NAVE Core V5 — regras puras, sem chamadas de rede, pagamentos ou despacho.
// Prévia de tarifas exclusivamente para testes. Nenhuma API comercial é exposta.
const CATEGORY_CODES = Object.freeze(["eco", "confort", "executive", "navegator"]);
const TEST_RATES_CENTS = Object.freeze({
  eco: Object.freeze({ base: 350, perKm: 165, perMinute: 20 }),
  confort: Object.freeze({ base: 440, perKm: 195, perMinute: 22 }),
  executive: Object.freeze({ base: 640, perKm: 310, perMinute: 48 }),
  navegator: Object.freeze({ base: 720, perKm: 340, perMinute: 55 }),
});
const COMMISSION_BASIS_POINTS = 1500;
const COMMERCIAL_RIDES_ENABLED = false;

function normalizeCategory(code) {
  if (typeof code !== "string") return null;
  const key = code.trim().toLowerCase();
  // Compatibility with existing WhatsApp DB codes.
  const normalized = key === "comfort" ? "confort" : key === "navigator" ? "navegator" : key;
  return CATEGORY_CODES.includes(normalized) ? normalized : null;
}

function commissionForFare(fareCents) {
  if (!Number.isSafeInteger(fareCents) || fareCents < 0 || fareCents > 100000000)
    throw new RangeError("Invalid fare in cents");
  const commissionCents = Math.floor((fareCents * COMMISSION_BASIS_POINTS + 5000) / 10000);
  return Object.freeze({ fareCents, commissionCents, driverGrossCents: fareCents - commissionCents });
}

function previewTestQuote({ category, distanceMeters, durationSeconds } = {}) {
  const code = normalizeCategory(category);
  if (!code) throw new RangeError("Unknown NAVE category");
  if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 100 || distanceMeters > 500000)
    throw new RangeError("Invalid route distance");
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 15 || durationSeconds > 86400)
    throw new RangeError("Invalid route duration");
  const rates = TEST_RATES_CENTS[code];
  const fareCents = Math.round(rates.base + distanceMeters * rates.perKm / 1000 + durationSeconds * rates.perMinute / 60);
  return Object.freeze({
    categoryCode: code, distanceMeters, durationSeconds, ...commissionForFare(fareCents),
    quoteIsTestOnly: true, commercialRideEnabled: COMMERCIAL_RIDES_ENABLED,
    pricingMode: "fixed-distance-time",
  });
}
module.exports = { CATEGORY_CODES, COMMISSION_BASIS_POINTS, COMMERCIAL_RIDES_ENABLED, normalizeCategory, commissionForFare, previewTestQuote };
