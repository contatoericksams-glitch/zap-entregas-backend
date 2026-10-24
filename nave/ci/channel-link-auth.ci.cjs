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
const { createAuthLabApp } = require("../core/auth-lab");
const { fixtureTotp } = require("./totp-fixture.cjs");

test("real Auth protects expiring offers and idempotent retries", { timeout: 120000 }, async () => {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const status = JSON.parse(fs.readFileSync(process.env.NAVE_TEST_STATUS_FILE, "utf8"));
  const url = status.API_URL || status.api_url; assert.equal(url, "http://127.0.0.1:54321");
  const key = status.ANON_KEY || status.anon_key;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, status.SERVICE_ROLE_KEY || status.service_role_key, options), tokens = {};
  for (const role of ["passenger", "driver"]) {
    const email = `reservation-${crypto.randomUUID()}@example.invalid`, password = crypto.randomBytes(32).toString("hex");
    assert.equal((await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { nave_lab_role: role, nave_lab_driver_approved: role === "driver" } })).error, null);
    const login = await createClient(url, key, options).auth.signInWithPassword({ email, password });
    assert.equal(login.error, null); tokens[role] = login.data.session.access_token;
  }
  let now = Date.now();
  const server = http.createServer(createAuthLabApp({ url, publishableKey: key, clock: () => now }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth-lab/room`;
  const call = async (role, body) => {
    const response = await fetch(base, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + tokens[role], "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, replay: response.headers.get("Idempotency-Replayed"), data: await response.json().catch(() => null) };
  };
  try {
    const { roomId } = (await call("passenger")).data;
    const action = (role, action, version, extra = {}) => ({ roomId, role, action, version, requestKey: crypto.randomUUID(), ...extra });
    await call("driver", action("driver", "availability", 0, { available: true }));
    const start = action("passenger", "start", 1, { category: "eco" });
    assert.equal((await call("passenger", start)).status, 200);
    const replay = await call("passenger", start); assert.equal(replay.status, 200); assert.equal(replay.replay, "true"); assert.equal(replay.data.events.length, 2);
    assert.equal((await call("passenger", { ...start, category: "confort" })).status, 409);
    now += 120000;
    const expired = await call("driver", action("driver", "accept", 2));
    assert.equal(expired.status, 409); assert.equal(expired.data.snapshot.journey.phase, "cancelled");
    const expiredReplay = await call("passenger", start);
    assert.equal(expiredReplay.replay, "true"); assert.equal(expiredReplay.data.journey.phase, "cancelled"); assert.equal(expiredReplay.data.events.filter(e => e.action === "expire").length, 1);
    await call("passenger", action("passenger", "reset", 3));
    await call("passenger", action("passenger", "start", 4, { category: "eco" }));
    const accept = action("driver", "accept", 5);
    const duplicates = await Promise.all([call("driver", accept), call("driver", accept)]);
    assert.deepEqual(duplicates.map(r => r.status), [200, 200]); assert.equal(duplicates.filter(r => r.replay === "true").length, 1);
    now += 120000;
    assert.equal((await call("passenger")).data.journey.phase, "driver_to_pickup");
    const competing = await Promise.all([call("driver", action("driver", "arrive", 6)), call("driver", action("driver", "arrive", 6))]);
    assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
    console.log("PASS: real Auth, same-key retry without duplicate events, conflicting key payload denied, exact-deadline expiry, late acceptance denied, replay cannot revive expiry, and distinct-key concurrency. Only the injected lab clock was advanced.");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

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

test("real app logins enforce approved driver and passenger ownership in the fictional journey", { timeout: 120000 }, async () => {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const status = JSON.parse(fs.readFileSync(process.env.NAVE_TEST_STATUS_FILE, "utf8"));
  const url = status.API_URL || status.api_url;
  assert.equal(url, "http://127.0.0.1:54321");
  const publicKey = status.ANON_KEY || status.anon_key;
  const admin = createClient(url, status.SERVICE_ROLE_KEY || status.service_role_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const server = http.createServer(createAuthLabApp({ url, publishableKey: publicKey }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (route, token, body) => {
    const r = await fetch(base + "/api/auth-lab/" + route, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(route === "room" ? { requestKey: crypto.randomUUID(), ...body } : body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const fixtures = {};
  try {
    for (const [label, meta] of Object.entries({ passenger: { nave_lab_role: "passenger" }, other: { nave_lab_role: "passenger" }, driver: { nave_lab_role: "driver", nave_lab_driver_approved: true }, pending: { nave_lab_role: "driver" }, forged: {} })) {
      const email = `${label}-${crypto.randomUUID()}@example.invalid`, password = crypto.randomBytes(32).toString("hex");
      const user = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: meta, user_metadata: { nave_lab_role: "driver", nave_lab_driver_approved: true } });
      assert.equal(user.error, null);
      const login = await call("login", null, { email, password });
      fixtures[label] = { id: user.data.user.id, token: login.data?.accessToken };
      if (["pending", "forged"].includes(label)) { assert.equal(login.status, 403); continue; }
      assert.equal(login.status, 200); assert.equal(login.data.role, meta.nave_lab_role);
      assert.equal("refresh_token" in login.data, false);
    }
    assert.notEqual(fixtures.passenger.token, fixtures.driver.token);
    const adminEmail = `central-${crypto.randomUUID()}@example.invalid`, adminPassword = crypto.randomBytes(32).toString("hex");
    const centralUser = await admin.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true, app_metadata: { nave_lab_role: "admin" } });
    assert.equal(centralUser.error, null);
    const centralClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const centralSignIn = await centralClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    assert.equal(centralSignIn.error, null);
    const aal1 = centralSignIn.data.session.access_token;
    assert.equal((await call("room", aal1)).status, 403, "Admin without MFA cannot read the room");
    assert.equal((await call("login", null, { email: adminEmail, password: adminPassword })).status, 403);
    const factor = await centralClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "Ephemeral-Central-fixture" });
    assert.equal(factor.error, null, "Ephemeral TOTP enrollment failed");
    const secret = factor.data.totp.secret;
    // Avoid boundary races while verifying the fixture's newly enrolled factor.
    if (Date.now() % 30000 > 25000) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    const enrollmentStep = Math.floor(Date.now() / 30000);
    const enrollment = await centralClient.auth.mfa.challengeAndVerify({ factorId: factor.data.id, code: fixtureTotp(secret) });
    assert.equal(enrollment.error, null, "Ephemeral TOTP verification failed");
    // A different time step prevents reusing the enrollment OTP at the app login endpoint.
    if (Math.floor(Date.now() / 30000) === enrollmentStep) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    const wrongCode = ((Number(fixtureTotp(secret)) + 1) % 1000000).toString().padStart(6, "0");
    assert.equal((await call("login", null, { email: adminEmail, password: adminPassword, code: wrongCode })).status, 403);
    const centralLogin = await call("login", null, { email: adminEmail, password: adminPassword, code: fixtureTotp(secret) });
    assert.equal(centralLogin.status, 200); assert.equal(centralLogin.data.role, "observer");
    const centralToken = centralLogin.data.accessToken;
    assert.equal((await call("room", centralToken)).status, 200);
    assert.equal((await call("room", aal1)).status, 403);
    assert.equal((await call("room")).status, 401);
    const room = (await call("room", fixtures.passenger.token)).data;
    const action = (label, role, action, version, extra = {}) => call("room", fixtures[label].token, { roomId: room.roomId, role, action, version, ...extra });
    assert.equal((await action("passenger", "driver", "availability", 0, { available: true })).status, 403);
    assert.equal((await action("driver", "driver", "availability", 0, { available: true })).status, 200);
    assert.equal((await action("passenger", "passenger", "start", 1, { category: "eco" })).status, 200);
    const centralSnapshot = (await call("room", centralToken)).data;
    assert.equal(centralSnapshot.journey.phase, "offer_pending"); assert.equal(centralSnapshot.version, 2);
    const deniedWrite = await call("room", centralToken, { roomId: room.roomId, role: "driver", action: "accept", version: 0 });
    assert.equal(deniedWrite.status, 403); assert.equal(deniedWrite.data, null);
    assert.deepEqual((await call("room", centralToken)).data, centralSnapshot, "Reading or denied writing cannot change state/history");
    assert.equal((await call("room", fixtures.other.token)).status, 403);
    assert.equal((await action("other", "passenger", "cancel", 0)).status, 403);
    for (const [i, step] of ["accept", "arrive", "board", "complete"].entries()) assert.equal((await action("driver", "driver", step, 2 + i)).status, 200);
    assert.equal((await call("room", fixtures.passenger.token)).data.journey.phase, "completed");
    assert.equal((await call("room", fixtures.driver.token)).data.version, 6);
    const observed = (await call("room", centralToken)).data;
    assert.equal(observed.journey.phase, "completed"); assert.equal(observed.events.length, 6);
    assert.equal((await admin.auth.admin.updateUserById(centralUser.data.user.id, { app_metadata: { nave_lab_role: "disabled" } })).error, null);
    assert.equal((await call("room", centralToken)).status, 403, "Removed admin role blocks the existing AAL2 token");
    assert.equal((await admin.auth.admin.updateUserById(fixtures.driver.id, { app_metadata: { nave_lab_role: "driver", nave_lab_driver_approved: false } })).error, null);
    assert.equal((await call("room", fixtures.driver.token)).status, 403, "Revoked approval must block the existing access token");
    for (const page of ["passageiro.html?auth=1", "motorista.html?auth=1", "central-local.html?auth=1"]) {
      const response = await fetch(base + "/" + page); assert.equal(response.status, 200);
      assert.match(await response.text(), /auth-session\.js/);
    }
    console.log("PASS: app login endpoints, approved driver, forged metadata denial, cross-account isolation, complete fictional journey, and approval revocation with existing JWT. No hosted project or Meta used.");
    console.log("PASS: Central admin requires real TOTP/AAL2, rejects missing/wrong factor, observes without mutations, refuses forged writes, and loses access when admin role is removed. No personal MFA or hosted project used.");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
