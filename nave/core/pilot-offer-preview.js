"use strict";
// Simulation-only request-to-offer adapter. No network, database or WhatsApp side effects.
// Generates a preview of the payload ONLY; does not dispatch.
const { previewTestQuote } = require("./ride-contract");
function preparePilotOfferPreview(input) {
  if (!input || input.channel !== "app" || input.category !== "confort")
    throw new TypeError("Only app Confort pilot preview allowed");
  const labels = [input.pickupLabel, input.destinationLabel];
  if (labels.some(s => typeof s !== "string" || !s.trim() || s.length > 160))
    throw new TypeError("Valid pickup and destination required");
  const quote = previewTestQuote({
    category: input.category, distanceMeters: input.distanceMeters,
    durationSeconds: input.durationSeconds
  });
  return Object.freeze({
    source: "app", categoryCode: "confort", testOnly: true, fareCents: quote.fareCents,
    pickupLabel: labels[0].trim(), destinationLabel: labels[1].trim(),
    driverDispatchEnabled: false, persistEnabled: false, whatsappSendEnabled: false,
    messagePreview: "NAVE - OFERTA FICTICIA | Embarque: " + labels[0].trim()
      + " | Destino: " + labels[1].trim() + " | Valor ilustrativo: R$ "
      + (quote.fareCents / 100).toFixed(2).replace(".", ",")
      + " | NAO SE DESLOQUE. Nenhuma corrida foi criada."
  });
}
module.exports = { preparePilotOfferPreview };
