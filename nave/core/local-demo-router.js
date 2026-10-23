"use strict";
// One fictional room per loopback server. Role labels are demo controls, not authentication.
const express = require("express");
const { simulateJourney } = require("./journey-lab");
function createLocalDemoRouter({ authenticated = false, requireUser } = {}) {
  if (authenticated && typeof requireUser !== "function") throw new Error("Authentication middleware required");
  const router = express.Router();
  const roomId = require("node:crypto").randomUUID();
  let version = 0, available = false, journey = null;
  let passengerId = null, driverId = null;
  const events = [];
  const terminal = () => !journey || ["completed", "cancelled", "no_driver"].includes(journey.phase);
  const snapshot = () => ({ roomId, version, available, journey, events, testOnly: true, storage: "process-memory", commercialRidesEnabled: false, whatsappSendEnabled: false, paymentsEnabled: false });
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) || !/^(127\.0\.0\.1|localhost)(:[0-9]+)?$/.test(req.get("host") || "")) return res.sendStatus(403);
    if (req.get("origin") && req.get("origin") !== "http://" + req.get("host")) return res.sendStatus(403);
    next();
  });
  if (authenticated) {
    router.use(requireUser);
    router.use((req, res, next) => {
      const actor = req.labActor;
      if (!actor || !["passenger", "driver", "observer"].includes(actor.role)) return res.sendStatus(403);
      // Admin observers cannot mutate, even with forged roles, versions or other methods.
      if (actor.role === "observer" && !["GET", "HEAD"].includes(req.method)) return res.sendStatus(403);
      // Check ownership before returning any snapshot, including conflict responses.
      if ((actor.role === "passenger" && passengerId && passengerId !== actor.id) ||
          (actor.role === "driver" && driverId && driverId !== actor.id)) return res.sendStatus(403);
      next();
    });
  }
  router.get("/", (_req, res) => res.json(snapshot()));
  router.post("/", express.json({ limit: "2kb" }), (req, res) => {
    const b = req.body;
    if (!req.is("application/json") || !b || Array.isArray(b) || Object.keys(b).some(k => !["roomId", "role", "action", "version", "category", "available"].includes(k)) || !["passenger", "driver"].includes(b.role) || !Number.isSafeInteger(b.version)) return res.sendStatus(400);
    if (authenticated && b.role !== req.labActor.role) return res.sendStatus(403);
    if (b.roomId !== roomId || b.version !== version) return res.status(409).json({ error: "stale_version", snapshot: snapshot() });
    try {
      if (b.action === "availability" && b.role === "driver") {
        if (typeof b.available !== "boolean" || !terminal()) return res.sendStatus(409);
        available = b.available;
        if (authenticated) driverId = req.labActor.id;
      } else if (b.action === "start" && b.role === "passenger") {
        if (!available || journey) return res.sendStatus(409);
        journey = simulateJourney({ action: "start", category: b.category, scenario: "normal" });
        if (authenticated) passengerId = req.labActor.id;
      } else if (b.action === "reset" && b.role === "passenger") {
        if (!terminal()) return res.sendStatus(409);
        journey = null;
        if (authenticated) { passengerId = null; events.length = 0; }
      } else {
        if (!journey || terminal()) return res.sendStatus(409);
        const permitted = b.role === "passenger" ? ["cancel"] : ["accept", "decline", "arrive", "board", "complete"];
        if (!permitted.includes(b.action)) return res.sendStatus(403);
        if (b.action === "decline" && journey.phase !== "offer_pending") return res.sendStatus(409);
        // In this single-driver demo, decline ends the request. No identity handoff.
        journey = simulateJourney({ action: b.action === "decline" ? "cancel" : b.action, state: journey.state });
        if (b.action === "decline") journey = { ...journey, message: "Motorista fictício recusou. Solicitação encerrada nesta demonstração, sem redistribuição." };
      }
      version += 1;
      events.push({ sequence: version, at: new Date().toISOString(), role: b.role, action: b.action, phase: journey?.phase || "idle", available });
      if (events.length > 100) events.shift();
      return res.json(snapshot());
    } catch (_) { return res.status(400).json({ error: "invalid_demo_action" }); }
  });
  return router;
}
module.exports = { createLocalDemoRouter };
