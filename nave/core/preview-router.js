"use strict";
// Isolated API V5: quotation preview only, never creates trips or dispatches drivers.
// Not mounted in nave/server.js. All route metrics are caller-supplied and unverified.
const express = require("express");
const { previewTestQuote, CATEGORY_CODES } = require("./ride-contract");
const { preparePilotOfferPreview } = require("./pilot-offer-preview");

function createPreviewRouter() {
  const router = express.Router();
  router.get("/status", (_req, res) => res.json({
    environment: "development", commercialRidesEnabled: false, persistenceEnabled: false,
    availableChannels: ["app", "web", "whatsapp"], channelIntegrationEnabled: false
  }));
  router.post("/quote-preview", express.json({ limit: "4kb" }), (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) return res.sendStatus(400);
      if (!["app","web","whatsapp"].includes(body.channel)) return res.status(400).json({ error: "invalid_channel" });
      const quote = previewTestQuote({
        category: body.category, distanceMeters: body.distanceMeters,
        durationSeconds: body.durationSeconds
      });
      return res.json({
        channel: body.channel, ...quote,
        notice: "Estimativa ficticia; distancia e duracao nao verificadas. Nenhuma corrida criada.",
        storage: "none", dispatch: "disabled", payment: "disabled"
      });
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError)
        return res.status(400).json({ error: "invalid_quote_input" });
      return res.sendStatus(503);
    }
  });
  // Safe local-only preview: never sends WhatsApp, stores rides, or calls Supabase.
  router.post("/pilot-offer-preview", express.json({ limit: "4kb" }), (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body))
        return res.status(400).json({ error: "invalid_request" });
      const preview = preparePilotOfferPreview(body);
      return res.status(200).json(preview);
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError)
        return res.status(400).json({ error: "invalid_pilot_preview" });
      return res.sendStatus(503);
    }
  });
  return router;
}
module.exports = { createPreviewRouter, CATEGORY_CODES };
