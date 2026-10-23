"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const http = require("node:http");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { createChannelLinkService } = require("../core/channel-link");
const { createChannelLinkSupabaseAdapters } = require("../core/channel-link-supabase");
const { createChannelLinkRouter } = require("../core/channel-link-router");

test("real ephemeral Supabase Auth sessions and Data API keep OTP ownership separate", { timeout: 120000 }, async () => {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "This test only runs in the isolated GitHub runner");
  const status = JSON.parse(fs.readFileSync(process.env.NAVE_TEST_STATUS_FILE, "utf8"));
  const url = status.API_URL || status.api_url;
  assert.equal(url, "http://127.0.0.1:54321", "Hosted databases are forbidden in this test");
  const publicKey = status.ANON_KEY || status.anon_key;
  const serverKey = status.SERVICE_ROLE_KEY || status.service_role_key;
  assert.ok(publicKey && serverKey, "Ephemeral runner keys required");
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, serverKey, options);
  const sessions = [];
  for (const label of ["passenger", "second-user"]) {
    const email = `${label}-${crypto.randomUUID()}@example.invalid`;
    const password = crypto.randomBytes(32).toString("hex");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null, "Fixture user creation failed");
    const client = createClient(url, publicKey, options);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, "Fixture sign-in failed");
    sessions.push({ client, userId: signedIn.data.user.id, token: signedIn.data.session.access_token });
  }
  assert.notEqual(sessions[0].userId, sessions[1].userId);
  assert.notEqual(sessions[0].token, sessions[1].token);
  const phoneE164 = "+15551234567";
  const contactId = crypto.randomUUID();
  const inserted = await admin.from("nave_wa_contacts").insert({ id: contactId, phone_e164: phoneE164, is_driver: false });
  assert.equal(inserted.error, null, "Fixture contact insert failed");
  const deliveries = [];
  const adapters = createChannelLinkSupabaseAdapters({ supabase: admin, deliverCode: async value => deliveries.push(value) });
  const service = createChannelLinkService({ ...adapters, enabled: true, secret: crypto.randomBytes(32).toString("hex") });
  const app = express(); app.use(express.json());
  app.use("/api", createChannelLinkRouter({ enabled: true, url, publishableKey: publicKey, channelLink: service }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const post = async (route, token, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/channel-link/${route}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: token ? "Bearer " + token : "" }, body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  try {
    assert.equal((await post("start", "", { phoneE164 })).status, 401);
    assert.equal((await post("start", "invalid-test-token", { phoneE164 })).status, 401);
    assert.equal((await post("start", sessions[0].token, { phoneE164, userId: sessions[1].userId })).status, 400);
    const started = await post("start", sessions[0].token, { phoneE164 });
    assert.equal(started.status, 202);
    assert.equal("code" in started.data, false);
    assert.equal(deliveries.length, 1, "Delivery must stay inside the injected memory stub");
    const confirmation = { challengeId: started.data.challengeId, code: deliveries[0].code };
    const other = await post("confirm", sessions[1].token, confirmation);
    assert.equal(other.status, 200); assert.equal(other.data.linked, false);
    const confirmed = await post("confirm", sessions[0].token, confirmation);
    assert.equal(confirmed.status, 200); assert.equal(confirmed.data.linked, true);
    assert.equal((await post("confirm", sessions[0].token, confirmation)).data.linked, false, "OTP replay must fail");
    const links = await admin.from("nave_channel_links").select("user_id,contact_id");
    assert.equal(links.error, null); assert.deepEqual(links.data, [{ user_id: sessions[0].userId, contact_id: contactId }]);
    const anonymous = createClient(url, publicKey, options);
    for (const client of [anonymous, sessions[0].client, sessions[1].client]) {
      assert.ok((await client.from("nave_channel_links").select("*")).error, "Client table access must be denied");
      const rpc = await client.rpc("nave_channel_link_confirm_challenge", {
        p_challenge_id: started.data.challengeId, p_user_id: sessions[0].userId,
        p_code_digest: "a".repeat(64), p_now: new Date().toISOString(),
      });
      assert.ok(rpc.error, "Clients cannot call privileged OTP RPCs directly");
    }
    console.log("PASS: two real Auth sessions, HTTP identity binding, RPC through Data API, cross-user denial, OTP replay denial, and client grants. No Meta or hosted project used.");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
