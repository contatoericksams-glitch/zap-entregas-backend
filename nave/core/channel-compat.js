"use strict";
// NAVE Core V5: read-only identity/quote mapping. No persistence, dispatch or charging.
const { previewTestQuote, normalizeCategory } = require("./ride-contract");
const CHANNELS = Object.freeze(["whatsapp", "app", "web"]);
function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 128;
}
function normalizeOrigin({ channel, authUserId, contactId }) {
  if (!CHANNELS.includes(channel)) throw new RangeError("Unknown channel");
  if (channel === "whatsapp") {
    if (!nonempty(contactId) || authUserId != null) throw new TypeError("WhatsApp contact identity required");
    return Object.freeze({ channel, identityKind: "contact", identityId: contactId.trim() });
  }
  if (!nonempty(authUserId) || contactId != null) throw new TypeError("Authenticated user identity required");
  return Object.freeze({ channel, identityKind: "auth_user", identityId: authUserId.trim() });
}
function normalizePreview(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid preview");
  const origin = normalizeOrigin(input);
  const quote = previewTestQuote(input);
  return Object.freeze({
    ...origin, ...quote, state: "preview_only", persist: false,
    dispatchEnabled: false, paymentEnabled: false,
    sourceRecord: null, canonicalRideId: null
  });
}
function existingRecordReference({ channel, sourceId }) {
  if (!CHANNELS.includes(channel) || !nonempty(sourceId)) throw new TypeError("Invalid source reference");
  return Object.freeze({
    channel,
    sourceTable: channel === "whatsapp" ? "nave_wa_ride_requests" : "ride_quotes",
    sourceId: sourceId.trim(),
    migrationState: "not_migrated",
    canonicalRideId: null
  });
}
module.exports = { normalizeOrigin, normalizePreview, existingRecordReference, normalizeCategory };
