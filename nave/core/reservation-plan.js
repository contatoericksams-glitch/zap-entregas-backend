"use strict";
// V5 persistence planning only. Never writes to Supabase.
// Produces a deterministic, tenant-scoped reservation key without storing PII.
const crypto = require("node:crypto");
const { normalizeOrigin } = require("./channel-compat");
const VALID_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;
function prepareTestReservation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid request");
  const identity = normalizeOrigin(input);
  if (typeof input.idempotencyKey !== "string" || !VALID_KEY.test(input.idempotencyKey))
    throw new TypeError("Invalid idempotency key");
  const source = input.idempotencyKey;
  const stableKey = crypto.createHash("sha256")
    .update(JSON.stringify([identity.channel, identity.identityKind, identity.identityId, source]))
    .digest("hex");
  return Object.freeze({
    sourceChannel: identity.channel,
    identityKind: identity.identityKind,
    keyDigest: stableKey,
    quoteIsTestOnly: true,
    commercialEnabled: false,
    writeAllowed: false,
    destinationTable: null,
    warning: "Dry run only. No unique constraint for cross-channel request keys exists yet."
  });
}
module.exports = { prepareTestReservation };
