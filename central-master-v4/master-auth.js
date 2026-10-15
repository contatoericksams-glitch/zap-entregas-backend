"use strict";
// V5 isolated auth middleware. Not mounted in the WhatsApp service.
const { createClient } = require("@supabase/supabase-js");

function createMasterAuth(url, publishableKey, makeClient = createClient) {
  if (!url || !publishableKey) throw new Error("Missing Supabase configuration");
  return async function requireMaster(req, res, next) {
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.get("authorization") || "");
    if (!match) return res.status(401).json({ error: "Login required" });
    const token = match[1];
    try {
      // New client per request, never use service_role or persist browser sessions.
      const client = makeClient(url, publishableKey, {
        global: { headers: { Authorization: "Bearer " + token } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const { data: userData, error: userError } = await client.auth.getUser(token);
      if (userError || !userData?.user) return res.sendStatus(401);
      const { data: assurance, error: assuranceError } =
        await client.auth.mfa.getAuthenticatorAssuranceLevel(token);
      if (assuranceError) return res.sendStatus(503);
      if (assurance?.currentLevel !== "aal2" || assurance?.nextLevel !== "aal2")
        return res.status(403).json({ error: "MFA required" });
      const { data: isAdmin, error: roleError } = await client.rpc("nave_is_admin");
      if (roleError) return res.sendStatus(503);
      if (isAdmin !== true) return res.sendStatus(403);
      req.masterUserId = userData.user.id;
      return next();
    } catch (_) {
      return res.sendStatus(503);
    }
  };
}
module.exports = { createMasterAuth };
