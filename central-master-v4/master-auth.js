"use strict";
const { createClient } = require("@supabase/supabase-js");
function createMasterAuth(url, key) {
  if (!url || !key) throw new Error("Missing Supabase configuration");
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.get("authorization") || "");
    if (!match) return res.status(401).json({ error: "Login required" });
    const client = createClient(url, key, {
      global: { headers: { Authorization: "Bearer " + match[1] } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    try {
      const user = await client.auth.getUser(match[1]);
      if (user.error || !user.data.user) return res.sendStatus(401);
      const mfa = await client.auth.mfa.getAuthenticatorAssuranceLevel(match[1]);
      if (mfa.error || mfa.data?.currentLevel !== "aal2") return res.sendStatus(403);
      const admin = await client.rpc("nave_is_admin");
      if (admin.error) return res.sendStatus(503);
      if (admin.data !== true) return res.sendStatus(403);
      req.masterUserId = user.data.user.id;
      next();
    } catch (_) { return res.sendStatus(503); }
  };
}
module.exports = { createMasterAuth };
