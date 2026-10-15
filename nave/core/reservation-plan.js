"use strict";
// V5 dry-run only. Identity MUST be resolved from verified server context before persistence.
const crypto = require("node:crypto");
const { normalizeOrigin } = require("./channel-compat");
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function prepareTestReservation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid request");
  const identity = normalizeOrigin(input);
  if (!UUID.test(identity.identityId)) throw new TypeError("Identity must be UUID");
  if (typeof input.idempotencyKey !== "string" || !KEY.test(input.idempotencyKey))
    throw new TypeError("Invalid idempotency key");
  const p = input.preview;
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new TypeError("Missing preview");
  for (const k of ["categoryCode","distanceMeters","durationSeconds","fareCents"]) {
    if (p[k] === undefined) throw new TypeError("Incomplete preview");
  }
  if (!["eco","confort","executive","navegator"].includes(p.categoryCode) ||
      !Number.isSafeInteger(p.distanceMeters) || p.distanceMeters < 100 ||
      !Number.isSafeInteger(p.durationSeconds) || p.durationSeconds < 15 ||
      !Number.isSafeInteger(p.fareCents) || p.fareCents < 1 ||
      p.quoteIsTestOnly !== true || p.commercialRideEnabled !== false)
    throw new TypeError("Invalid test preview");
  const scope = [identity.channel, identity.identityKind, identity.identityId.toLowerCase()];
  return Object.freeze({
    sourceChannel: identity.channel, identityKind: identity.identityKind,
    identityId: identity.identityId.toLowerCase(),
    keyDigest: sha([...scope, input.idempotencyKey]),
    requestFingerprint: sha([scope, p.categoryCode, p.distanceMeters, p.durationSeconds, p.fareCents]),
    quoteIsTestOnly: true, commercialEnabled: false, writeAllowed: false, destinationTable: null
  });
}
function compareExisting(existingFingerprint, incomingFingerprint) {
  if (!/^[a-f0-9]{64}$/.test(existingFingerprint) || !/^[a-f0-9]{64}$/.test(incomingFingerprint))
    throw new TypeError("Invalid fingerprint");
  return existingFingerprint === incomingFingerprint ? "replay" : "conflict";
}
module.exports = { prepareTestReservation, compareExisting };
