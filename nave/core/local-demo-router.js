"use strict";
// One fictional room per loopback server. Role labels are demo controls, not authentication.
const express = require("express");
const { simulateJourney } = require("./journey-lab");
function createLocalDemoRouter({ authenticated = false, requireUser, clock = Date.now, checkpoint } = {}) {
  if (authenticated && typeof requireUser !== "function") throw new Error("Authentication middleware required");
  if (checkpoint && !authenticated) throw new Error("Checkpoint requires authenticated lab");
  const router = express.Router();
  let roomId = require("node:crypto").randomUUID();
  let version = 0, available = false, journey = null;
  let passengerId = null, driverId = null;
  let offerExpiresAt = null;
  const receipts = new Map(), retentionMs = 15 * 60 * 1000;
  const events = [];
  let storageFailed = false;
  const serialize = () => ({ schema: 1, roomId, version, available, journey, passengerId, driverId, offerExpiresAt, events, receipts: [...receipts] });
  function restore(data) {
    const keys = ["schema", "roomId", "version", "available", "journey", "passengerId", "driverId", "offerExpiresAt", "events", "receipts"];
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!data || Object.keys(data).length !== keys.length || Object.keys(data).some(k => !keys.includes(k)) || data.schema !== 1 || !uuid.test(data.roomId) || !Number.isSafeInteger(data.version) || data.version < 0 || typeof data.available !== "boolean" || !Array.isArray(data.events) || data.events.length > 100 || !Array.isArray(data.receipts) || data.receipts.length > 512 || ![data.passengerId, data.driverId].every(id => id === null || typeof id === "string" && id.length > 0 && id.length <= 128) || !(data.offerExpiresAt === null || Number.isSafeInteger(data.offerExpiresAt))) throw new Error("Invalid lab checkpoint");
    if (data.journey !== null) {
      if (!data.passengerId || !data.driverId || !data.journey.state || data.journey.testOnly !== true || data.journey.commercialRidesEnabled !== false || data.journey.paymentsEnabled !== false || data.journey.whatsappSendEnabled !== false || !["offer_pending", "driver_to_pickup", "at_pickup", "in_trip", "completed", "cancelled", "no_driver"].includes(data.journey.phase)) throw new Error("Invalid checkpoint journey");
      if ((data.journey.phase === "offer_pending") !== (data.offerExpiresAt !== null)) throw new Error("Invalid checkpoint offer deadline");
      const j = data.journey;
      if (j.state.phase !== j.phase || j.state.categoryCode !== j.categoryCode || j.state.driverId !== j.driverId || j.simulation !== true || j.persistenceEnabled !== false || j.realGpsUsed !== false || j.externalRoutingEnabled !== false || ![j.fareCents, j.driverGrossCents, j.commissionCents].every(n => Number.isSafeInteger(n) && n >= 0) || j.fareCents !== j.driverGrossCents + j.commissionCents) throw new Error("Inconsistent checkpoint journey");
    } else if (data.offerExpiresAt !== null || data.passengerId !== null) throw new Error("Invalid empty checkpoint");
    for (let i = 0; i < data.events.length; i++) {
      const e = data.events[i];
      if (!e || !Number.isSafeInteger(e.sequence) || e.sequence < 1 || e.sequence > data.version || i && e.sequence <= data.events[i - 1].sequence || !["passenger", "driver", "system"].includes(e.role) || !["availability", "start", "reset", "cancel", "accept", "decline", "arrive", "board", "complete", "expire"].includes(e.action) || !Number.isFinite(Date.parse(e.at))) throw new Error("Invalid checkpoint history");
    }
    const restored = new Map();
    for (const entry of data.receipts) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || entry[0].length > 512 || !entry[1] || typeof entry[1].fingerprint !== "string" || entry[1].fingerprint.length > 512 || !Number.isSafeInteger(entry[1].expiresAt) || restored.has(entry[0])) throw new Error("Invalid checkpoint receipts");
      restored.set(entry[0], entry[1]);
    }
    ({ roomId, version, available, journey, passengerId, driverId, offerExpiresAt } = data);
    events.splice(0, events.length, ...data.events); receipts.clear();
    for (const [key, value] of restored) receipts.set(key, value);
  }
  function persist() {
    if (!checkpoint) return;
    try { checkpoint.save(serialize()); } catch (_) { storageFailed = true; throw new Error("Checkpoint unavailable"); }
  }
  if (checkpoint) { const loaded = checkpoint.load(); if (loaded) restore(loaded); else persist(); }
  const terminal = () => !journey || ["completed", "cancelled", "no_driver"].includes(journey.phase);
  const snapshot = () => ({ roomId, version, available, journey, events, ...(authenticated ? { offerExpiresAt } : {}), testOnly: true, storage: checkpoint ? "runner-checkpoint" : "process-memory", commercialRidesEnabled: false, whatsappSendEnabled: false, paymentsEnabled: false });
  function event(role, action, now) {
    version++;
    events.push({ sequence: version, at: new Date(now).toISOString(), role, action, phase: journey?.phase || "idle", available });
    if (events.length > 100) events.shift();
  }
  function expire(now) {
    if (authenticated && journey?.phase === "offer_pending" && offerExpiresAt !== null && now >= offerExpiresAt) {
      journey = { ...simulateJourney({ action: "cancel", state: journey.state }), message: "O prazo da oferta de teste terminou. Nenhum motorista foi acionado. Inicie uma nova demonstração." };
      offerExpiresAt = null;
      event("system", "expire", now);
      persist();
    }
  }
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (storageFailed) return res.sendStatus(503);
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
      try { expire(clock()); } catch (_) { return res.sendStatus(503); }
      next();
    });
  }
  router.get("/", (_req, res) => res.json(snapshot()));
  router.post("/", express.json({ limit: "2kb" }), (req, res) => {
    const b = req.body;
    if (!req.is("application/json") || !b || Array.isArray(b) || Object.keys(b).some(k => !["roomId", "role", "action", "version", "category", "available", ...(authenticated ? ["requestKey"] : [])].includes(k)) || !["passenger", "driver"].includes(b.role) || !Number.isSafeInteger(b.version)) return res.sendStatus(400);
    if (authenticated && b.role !== req.labActor.role) return res.sendStatus(403);
    let receiptKey, fingerprint;
    const now = clock();
    try { expire(now); } catch (_) { return res.sendStatus(503); }
    if (authenticated) {
      if (typeof b.requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.requestKey)) return res.sendStatus(400);
      for (const [key, record] of receipts) if (record.expiresAt <= now) receipts.delete(key);
      receiptKey = JSON.stringify([req.labActor.id, req.labActor.role, b.requestKey.toLowerCase()]);
      fingerprint = JSON.stringify([b.roomId, b.role, b.action, b.version, b.category, b.available]);
      const previous = receipts.get(receiptKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) return res.status(409).json({ error: "request_key_conflict" });
        res.set("Idempotency-Replayed", "true");
        return res.json(snapshot());
      }
      if (receipts.size >= 512) return res.status(429).json({ error: "idempotency_capacity" });
    }
    if (b.roomId !== roomId || b.version !== version) return res.status(409).json({ error: "stale_version", snapshot: snapshot() });
    try {
      if (b.action === "availability" && b.role === "driver") {
        if (typeof b.available !== "boolean" || !terminal()) return res.sendStatus(409);
        available = b.available;
        if (authenticated) driverId = req.labActor.id;
      } else if (b.action === "start" && b.role === "passenger") {
        if (!available || journey) return res.sendStatus(409);
        journey = simulateJourney({ action: "start", category: b.category, scenario: "normal" });
        if (authenticated) { passengerId = req.labActor.id; offerExpiresAt = now + 120000; }
      } else if (b.action === "reset" && b.role === "passenger") {
        if (!terminal()) return res.sendStatus(409);
        journey = null;
        offerExpiresAt = null;
        if (authenticated) { passengerId = null; events.length = 0; }
      } else {
        if (!journey || terminal()) return res.sendStatus(409);
        const permitted = b.role === "passenger" ? ["cancel"] : ["accept", "decline", "arrive", "board", "complete"];
        if (!permitted.includes(b.action)) return res.sendStatus(403);
        if (b.action === "decline" && journey.phase !== "offer_pending") return res.sendStatus(409);
        // In this single-driver demo, decline ends the request. No identity handoff.
        journey = simulateJourney({ action: b.action === "decline" ? "cancel" : b.action, state: journey.state });
        offerExpiresAt = null;
        if (b.action === "decline") journey = { ...journey, message: "Motorista fictício recusou. Solicitação encerrada nesta demonstração, sem redistribuição." };
      }
      event(b.role, b.action, now);
      if (authenticated) receipts.set(receiptKey, { fingerprint, expiresAt: now + retentionMs });
      persist(); // Acknowledge only after the checkpoint has been committed.
      return res.json(snapshot());
    } catch (_) { return storageFailed ? res.sendStatus(503) : res.status(400).json({ error: "invalid_demo_action" }); }
  });
  return router;
}
module.exports = { createLocalDemoRouter };
