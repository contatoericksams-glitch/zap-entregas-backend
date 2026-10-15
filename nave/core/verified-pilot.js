"use strict";
// NAVE V5: staging-only authorization gate. No DB writes, Meta sends or dispatch.
const { preparePilotOfferPreview } = require("./pilot-offer-preview");
function createVerifiedPilotPreview({ verifyAccessToken, resolveRoute }) {
  if (typeof verifyAccessToken !== "function" || typeof resolveRoute !== "function")
    throw new TypeError("Server-side verifiers required");
  return async function prepare(request) {
    if (!request || typeof request !== "object") throw new TypeError("Invalid request");
    const identity = await verifyAccessToken(request.accessToken);
    if (!identity || typeof identity.userId !== "string" || identity.userId.length < 8)
      throw new Error("Unauthenticated");
    if (request.category !== "confort") throw new TypeError("Only Confort pilot supported");
    const { pickupLabel, destinationLabel } = request;
    if (![pickupLabel,destinationLabel].every(v => typeof v === "string" && v.trim().length > 2 && v.length <= 160))
      throw new TypeError("Invalid locations");
    // Distance and time are derived by trusted backend callback, never client input.
    const route = await resolveRoute({ pickupLabel, destinationLabel });
    if (!route || typeof route !== "object") throw new Error("Routing unavailable");
    const preview = preparePilotOfferPreview({
      channel: "app", category: "confort", pickupLabel, destinationLabel,
      distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds
    });
    return Object.freeze({
      ...preview, passengerUserId: identity.userId, identityVerified: true,
      simulated: true, persistEnabled: false, driverDispatchEnabled: false,
      whatsappSendEnabled: false
    });
  };
}
module.exports = { createVerifiedPilotPreview };
