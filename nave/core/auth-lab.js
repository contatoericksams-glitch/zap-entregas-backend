"use strict";
// Isolated loopback lab only. Never mounted by server.js or the ordinary preview.
const express = require("express");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { createLocalDemoRouter } = require("./local-demo-router");
const { createPreviewRouter } = require("./preview-router");
const { LabCheckpoint } = require("./lab-checkpoint");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function roleFor(user) {
  // user_metadata is user-editable and must never grant privileges.
  const meta = user?.app_metadata;
  if (meta?.nave_lab_role === "admin") return "observer";
  if (meta?.nave_lab_role === "passenger") return "passenger";
  if (meta?.nave_lab_role === "driver" && meta.nave_lab_driver_approved === true) return "driver";
  return null;
}

function createAuthLabApp({ url, publishableKey, makeClient = createClient, clock = Date.now, checkpointDirectory } = {}) {
  if (url !== "http://127.0.0.1:54321" || !publishableKey) throw new Error("Only ephemeral loopback Supabase is allowed");
  const app = express();
  app.disable("x-powered-by");
  const attempts = [];
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'");
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) || !/^127\.0\.0\.1(:[0-9]+)?$/.test(req.get("host") || "")) return res.sendStatus(403);
    if (req.get("origin") && req.get("origin") !== "http://" + req.get("host")) return res.sendStatus(403);
    next();
  });
  const requireUser = async (req, res, next) => {
    const token = /^Bearer ([^\s]+)$/.exec(req.get("authorization") || "")?.[1];
    if (!token || token.length > 8192) return res.sendStatus(401);
    try {
      const client = makeClient(url, publishableKey, options);
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user?.id) return res.sendStatus(401);
      const role = roleFor(data.user);
      if (!role) return res.sendStatus(403);
      if (role === "observer") {
        const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel(token);
        if (assurance.error) return res.sendStatus(503);
        if (assurance.data?.currentLevel !== "aal2" || assurance.data?.nextLevel !== "aal2") return res.sendStatus(403);
      }
      req.labActor = { id: data.user.id, role };
      next();
    } catch (_) { res.sendStatus(503); }
  };
  app.post("/api/auth-lab/login", express.json({ limit: "2kb" }), async (req, res) => {
    const body = req.body;
    if (!req.is("application/json") || !body || Array.isArray(body) || Object.keys(body).some(k => !["email", "password", "code"].includes(k)) || typeof body.email !== "string" || body.email.length > 254 || !/^[^@\s]+@example\.invalid$/.test(body.email) || typeof body.password !== "string" || body.password.length > 256 || (body.code !== undefined && (typeof body.code !== "string" || !/^[0-9]{6}$/.test(body.code)))) return res.sendStatus(400);
    const now = Date.now();
    while (attempts.length && attempts[0] <= now - 60000) attempts.shift();
    if (attempts.length >= 12) { res.set("Retry-After", "60"); return res.sendStatus(429); }
    attempts.push(now);
    try {
      const client = makeClient(url, publishableKey, options);
      const { data, error } = await client.auth.signInWithPassword({ email: body.email, password: body.password });
      if (error || !data?.session?.access_token) return res.sendStatus(401);
      const role = roleFor(data.user);
      if (!role) return res.sendStatus(403);
      let accessToken = data.session.access_token;
      if (role === "observer") {
        if (!body.code) return res.sendStatus(403);
        const factors = await client.auth.mfa.listFactors();
        const factor = factors.data?.totp?.find(item => item.status === "verified");
        if (factors.error || !factor) return res.sendStatus(403);
        const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: body.code });
        if (verified.error || !verified.data?.access_token) return res.sendStatus(403);
        accessToken = verified.data.access_token;
        const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
        if (assurance.error || assurance.data?.currentLevel !== "aal2" || assurance.data?.nextLevel !== "aal2") return res.sendStatus(403);
      }
      // No refresh token, password, email or server key is returned or persisted.
      res.json({ accessToken, role, testOnly: true });
    } catch (_) { res.sendStatus(503); }
  });
  app.get("/api/auth-lab/session", requireUser, (req, res) => res.json({ role: req.labActor.role, testOnly: true }));
  let checkpoint;
  if (checkpointDirectory !== undefined) {
    if (process.env.GITHUB_ACTIONS !== "true" || !process.env.RUNNER_TEMP || path.resolve(checkpointDirectory) !== path.resolve(process.env.RUNNER_TEMP, "nave-room-checkpoint")) throw new Error("Checkpoint is restricted to the ephemeral runner directory");
    checkpoint = new LabCheckpoint(checkpointDirectory);
  }
  try { app.use("/api/auth-lab/room", createLocalDemoRouter({ authenticated: true, requireUser, clock, checkpoint })); }
  catch (error) { if (checkpoint) checkpoint.close(); throw error; }
  app.locals.closeLab = () => { if (checkpoint) checkpoint.close(); };
  app.use("/api/v5", createPreviewRouter());
  app.use(express.static(path.join(__dirname, "../public"), { index: false }));
  return app;
}
module.exports = { createAuthLabApp, roleFor };
