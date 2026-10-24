"use strict";

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

function createChannelLinkRouter({
  enabled = false,
  url,
  publishableKey,
  channelLink,
  makeClient = createClient,
} = {}) {
  const router = express.Router();
  if (!enabled) {
    router.use((_req, res) => res.sendStatus(404));
    return router;
  }
  if (!url || !publishableKey || !channelLink || typeof makeClient !== "function") {
    throw new TypeError("Channel-link staging configuration required");
  }

  async function requireUser(req, res, next) {
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.get("authorization") || "");
    if (!match) return res.sendStatus(401);
    try {
      // Verify the token with Supabase Auth; never trust a client-supplied user ID.
      const authClient = makeClient(url, publishableKey, {
        global: { headers: { Authorization: "Bearer " + match[1] } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await authClient.auth.getUser(match[1]);
      if (error || !data?.user?.id) return res.sendStatus(401);
      req.channelLinkUserId = data.user.id;
      return next();
    } catch (_) {
      return res.sendStatus(503);
    }
  }

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    next();
  });

  router.post("/channel-link/start", requireUser, async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        Object.keys(req.body).some(key => key !== "phoneE164") ||
        typeof req.body.phoneE164 !== "string") {
      return res.status(400).json({ error: "invalid_request" });
    }
    try {
      const result = await channelLink.start({
        userId: req.channelLinkUserId,
        phoneE164: req.body.phoneE164,
      });
      if (!result.accepted) {
        if (result.reason === "invalid_request") return res.status(400).json({ error: "invalid_request" });
        return res.sendStatus(503);
      }
      return res.status(202).json({
        accepted: true,
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
      });
    } catch (_) {
      return res.sendStatus(503);
    }
  });

  router.post("/channel-link/confirm", requireUser, async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
        Object.keys(req.body).some(key => key !== "challengeId" && key !== "code") ||
        typeof req.body.challengeId !== "string" || typeof req.body.code !== "string") {
      return res.status(400).json({ error: "invalid_request" });
    }
    try {
      const result = await channelLink.confirm({
        userId: req.channelLinkUserId,
        challengeId: req.body.challengeId,
        code: req.body.code,
      });
      // Keep code, expiry, and existing-link failures indistinguishable.
      return res.status(200).json({ linked: result.linked === true });
    } catch (_) {
      return res.sendStatus(503);
    }
  });

  return router;
}

module.exports = { createChannelLinkRouter };
