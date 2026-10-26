"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawn } = require("node:child_process"), { once } = require("node:events");
const { createClient } = require("@supabase/supabase-js"), { chromium } = require("playwright");
const { fixtureTotp } = require("./totp-fixture.cjs");

test("integrated assisted pilot: accounts, durable requests, dispatch, recovery and three browser roles", { timeout: 300000 }, async () => {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const status = JSON.parse(fs.readFileSync(process.env.NAVE_TEST_STATUS_FILE, "utf8"));
  const url = status.API_URL || status.api_url; assert.equal(url, "http://127.0.0.1:54321");
  const key = status.ANON_KEY || status.anon_key, serviceKey = status.SERVICE_ROLE_KEY || status.service_role_key;
  const mail = status.MAILPIT_URL || status.INBUCKET_URL || "http://127.0.0.1:54324"; assert.equal(new URL(mail).hostname, "127.0.0.1");
  const origin = "http://127.0.0.1:4318", options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceKey, options), password = crypto.randomBytes(24).toString("hex");
  const roles = {}, jars = {}, clients = {};
  let child, browser;
  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, "../assisted/server.js")], { env: { ...process.env, NODE_ENV: "staging", PORT: "4318", NAVE_ASSISTED_ENABLED: "true", NAVE_ASSISTED_SUPABASE_URL: url, NAVE_ASSISTED_PUBLISHABLE_KEY: key, NAVE_ASSISTED_SERVICE_KEY: serviceKey, NAVE_ASSISTED_ORIGIN: origin }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Assisted server did not start")), 10000);
      child.stdout.on("data", data => { if (String(data).includes("staging ready")) { clearTimeout(timer); resolve(); } });
      child.stderr.on("data", () => {});
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Assisted server exited before readiness")); });
    });
  }
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; } }
  function remember(jar, response) {
    for (const cookie of response.headers.getSetCookie()) {
      const raw = cookie.split(";")[0], split = raw.indexOf("=");
      if (raw.slice(split + 1)) jar[raw.slice(0, split)] = raw.slice(split + 1); else delete jar[raw.slice(0, split)];
    }
  }
  async function call(role, endpoint, body, extra = {}) {
    const jar = jars[role] ||= {};
    const response = await fetch(origin + endpoint, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: Object.entries(jar).map(([k,v]) => k + "=" + v).join("; "), ...extra }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    remember(jar, response);
    return { status: response.status, data: await response.json().catch(() => null), response };
  }
  async function ok(role, endpoint, body) { const r = await call(role, endpoint, body); assert.ok(r.status >= 200 && r.status < 300, r.data?.error || "Unexpected API status " + r.status); return r.data; }
  const snap = role => ok(role, "/api/assisted/snapshot");
  const command = (action, ride, data = {}) => ({ action, rideId: ride?.id || null, version: ride?.version || 0, requestKey: crypto.randomUUID(), data });
  async function act(role, action, ride, data) { return ok(role, "/api/assisted/command", command(action, ride, data)); }
  async function mailLink(email, seen = new Set()) {
    for (let i = 0; i < 40; i++) {
      const list = await fetch(mail + "/api/v1/search?query=" + encodeURIComponent("to:" + email)).then(r => r.json());
      const item = list.messages?.find(m => !seen.has(m.ID));
      if (item) {
        seen.add(item.ID);
        const message = await fetch(mail + "/api/v1/message/" + item.ID).then(r => r.json());
        const link = (message.HTML || message.Text || "").match(/https?:[^\s"<>]+\/auth\/v1\/verify[^\s"<>]*/)?.[0]?.replace(/&amp;/g, "&");
        if (link) { assert.equal(new URL(link).hostname, "127.0.0.1"); return link; }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("Expected fixture confirmation/recovery email was not received");
  }
  async function confirm(role, link) {
    const auth = await fetch(link, { redirect: "manual" });
    const location = auth.headers.get("location"); assert.ok(location && location.startsWith(origin + "/assistido/confirm"), "Expected local PKCE callback");
    const result = await call(role, location.slice(origin.length));
    assert.equal(result.status, 302); assert.equal(result.response.headers.get("location"), "/assistido/?auth=confirmed");
  }
  try {
    const securityBefore = await admin.rpc("nave_assisted_fixture_security"); assert.equal(securityBefore.error, null);
    assert.deepEqual({ ...securityBefore.data, contact_rows: 0 }, { rls: true, anonymous_execute: false, authenticated_execute: false, direct_member_access: false, contact_rows: 0 });
    await start();
    assert.equal((await call("guest", "/api/assisted/snapshot")).status, 401);
    assert.equal((await call("guest", "/api/assisted/login", {}, { Origin: "https://untrusted.invalid" })).status, 403);
    for (const role of ["passenger", "driver", "other"]) {
      const email = `assisted-${crypto.randomUUID()}@example.invalid`, name = "Pessoa " + role;
      roles[role] = { email, name, seen: new Set() };
      assert.equal((await call(role, "/api/assisted/signup", { name, email, password, driver: role === "driver" })).status, 202);
      await confirm(role, await mailLink(email, roles[role].seen));
      const state = await snap(role); roles[role].id = state.member.id;
      assert.equal(state.member.role, role === "driver" ? "driver" : "passenger");
      assert.equal(state.member.approved, role !== "driver");
    }
    const cookieResponse = await call("passenger", "/api/assisted/login", { email: roles.passenger.email, password });
    assert.equal(cookieResponse.status, 200);
    assert.ok(cookieResponse.response.headers.getSetCookie().some(c => c.startsWith("nave_access=") && /HttpOnly/.test(c) && /SameSite=Strict/.test(c)));
    assert.equal(JSON.stringify(cookieResponse.data).includes("access_token"), false);
    const adminEmail = `assisted-admin-${crypto.randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true }); assert.equal(created.error, null);
    assert.equal((await admin.rpc("nave_assisted_enroll", { p_actor: created.data.user.id, p_name: "Central de teste", p_driver: false })).error, null);
    assert.equal((await admin.rpc("nave_assisted_fixture_admin", { p_actor: created.data.user.id })).error, null);
    const centralClient = createClient(url, key, options); assert.equal((await centralClient.auth.signInWithPassword({ email: adminEmail, password })).error, null);
    const enrolled = await centralClient.auth.mfa.enroll({ factorType: "totp" }); assert.equal(enrolled.error, null);
    const secret = enrolled.data.totp.secret;
    assert.equal((await centralClient.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: fixtureTotp(secret) })).error, null);
    await ok("central", "/api/assisted/login", { email: adminEmail, password });
    assert.equal((await call("central", "/api/assisted/snapshot")).status, 403);
    await ok("central", "/api/assisted/login", { email: adminEmail, password, code: fixtureTotp(secret) });
    assert.equal((await snap("central")).member.role, "admin");
    assert.equal((await call("driver", "/api/assisted/command", command("availability", null, { available: true }))).status, 403);
    assert.equal((await call("passenger", "/api/assisted/command", command("approve_driver", null, { driverId: roles.driver.id, approved: true }))).status, 403);
    await act("central", "approve_driver", null, { driverId: roles.driver.id, approved: true });
    await act("driver", "availability", null, { available: true });
    const createBody = command("start", null, { pickup: "Rua do Embarque, 10 — fixture", destination: "Rua do Destino, 20 — fixture", category: "eco" });
    const first = await ok("passenger", "/api/assisted/command", createBody);
    const replay = await ok("passenger", "/api/assisted/command", createBody); assert.equal(replay.rideId, first.rideId); assert.equal(replay.replayed, true);
    assert.equal((await call("passenger", "/api/assisted/command", { ...createBody, data: { ...createBody.data, category: "confort" } })).status, 409);
    const second = await act("other", "start", null, { pickup: "Segundo embarque de teste", destination: "Segundo destino de teste", category: "executive" });
    assert.notEqual(first.rideId, second.rideId); assert.equal((await snap("passenger")).rides.length, 1);
    assert.equal((await snap("other")).rides[0].id, second.rideId);
    let ride = (await snap("passenger")).rides[0];
    assert.equal((await call("other", "/api/assisted/command", command("cancel", ride))).status, 403);
    await act("central", "assign", ride, { driverId: roles.driver.id }); ride = (await snap("driver")).rides[0];
    const accepted = await Promise.all([call("driver", "/api/assisted/command", command("accept", ride)), call("driver", "/api/assisted/command", command("accept", ride))]);
    assert.deepEqual(accepted.map(r => r.status).sort(), [200, 409]);
    const beforeRestart = await snap("passenger"); const firstPid = child.pid;
    await stop(); await start(); assert.notEqual(child.pid, firstPid);
    assert.deepEqual((await snap("passenger")).rides, beforeRestart.rides, "Postgres state survives a separate server process");
    delete jars.passenger.nave_access; await ok("passenger", "/api/assisted/refresh", {}); assert.equal((await snap("passenger")).member.id, roles.passenger.id);
    for (const action of ["arrive", "board", "complete"]) {
      ride = (await snap("driver")).rides.find(r => r.id === first.rideId); await act("driver", action, ride);
      if (action === "board") assert.equal((await call("passenger", "/api/assisted/command", command("cancel", (await snap("passenger")).rides[0]))).status, 409);
    }
    assert.equal((await snap("passenger")).rides[0].phase, "completed");
    assert.equal((await snap("passenger")).events.filter(e => e.ride_id === first.rideId).length, 6);
    const otherRide = (await snap("other")).rides[0]; await act("other", "cancel", otherRide);
    // All remaining categories persist and can be cancelled before dispatch.
    for (const category of ["confort", "executive", "navegator"]) { await act("passenger", "start", null, { pickup: "Embarque de teste", destination: "Destino de teste", category }); await act("passenger", "cancel", (await snap("passenger")).rides.find(r => !["completed","cancelled"].includes(r.phase))); }
    await act("passenger", "start", null, { pickup: "Oferta com prazo", destination: "Destino de teste", category: "eco" });
    let expiring = (await snap("passenger")).rides.find(r => r.phase === "requested");
    await act("central", "assign", expiring, { driverId: roles.driver.id });
    expiring = (await snap("driver")).rides.find(r => r.id === expiring.id);
    assert.equal((await admin.rpc("nave_assisted_fixture_expire", { p_id: expiring.id })).error, null);
    assert.equal((await call("driver", "/api/assisted/command", command("accept", expiring))).status, 409);
    const afterExpiry = await snap("passenger");
    const expiredRide = afterExpiry.rides.find(r => r.id === expiring.id);
    assert.equal(expiredRide.phase, "requested"); assert.equal(expiredRide.driver_id, null);
    assert.equal(afterExpiry.events.filter(e => e.ride_id === expiring.id && e.action === "expire").length, 1);
    await act("passenger", "cancel", expiredRide);
    await act("central", "approve_driver", null, { driverId: roles.driver.id, approved: false });
    assert.equal((await snap("driver")).rides.length, 0);
    assert.equal((await call("driver", "/api/assisted/command", command("availability", null, { available: true }))).status, 403);
    await act("central", "approve_driver", null, { driverId: roles.driver.id, approved: true });
    await act("driver", "availability", null, { available: true });
    const anonymous = createClient(url, key, options);
    assert.notEqual((await anonymous.rpc("nave_assisted_snapshot", { p_actor: roles.passenger.id, p_aal2: true })).error, null);
    const userClient = createClient(url, key, options); await userClient.auth.signInWithPassword({ email: roles.passenger.email, password });
    assert.notEqual((await userClient.rpc("nave_assisted_command", { p_actor: roles.passenger.id, p_aal2: true, p_action: "start", p_id: null, p_version: 0, p_key: crypto.randomUUID(), p_data: {} })).error, null);
    // Role claims editable by a user do not create a Central membership.
    assert.equal((await userClient.auth.updateUser({ data: { nave_lab_role: "admin", role: "admin", approved: true } })).error, null);
    assert.equal((await snap("passenger")).member.role, "passenger");
    console.log("PASS: assisted API signup/PKCE confirmation, role isolation, driver approval, durable multiple requests, idempotency/concurrency, expiry and separate-process restart.");

    browser = await chromium.launch({ headless: true });
    const views = {};
    for (const role of ["passenger", "driver", "central"]) {
      const context = await browser.newContext({ viewport: { width: role === "central" ? 1280 : 390, height: 844 } });
      const page = await context.newPage(); await page.goto(origin + "/assistido/");
      page.on("pageerror", error => console.log("Assisted UI script error: " + error.message));
      await page.locator('#login input[name="email"]').fill(role === "central" ? adminEmail : roles[role].email);
      await page.locator('#login input[name="password"]').fill(password);
      if (role === "central") await page.locator('#login input[name="code"]').fill(fixtureTotp(secret));
      await page.locator("#login button").click(); await page.locator("#account").waitFor({ state: "visible" }); views[role] = { context, page };
    }
    const p = views.passenger.page, d = views.driver.page, c = views.central.page;
    await p.locator('#booking input[name="pickup"]').fill("Embarque livre pelo navegador");
    await p.locator('#booking input[name="destination"]').fill("Destino livre pelo navegador");
    await p.locator("#booking button").click();
    await p.waitForFunction(() => document.querySelector("#rides .phase")?.textContent === "Aguardando a Central").catch(async error => { console.log("Assisted booking status: " + await p.locator("#message").textContent()); console.log("Assisted phases: " + JSON.stringify(await p.locator("#rides .phase").allTextContents())); throw error; });
    const current = (await snap("passenger")).rides.find(r => r.phase === "requested");
    const card = c.locator('[data-ride-id="' + current.id + '"]');
    await card.locator("select").selectOption(roles.driver.id); await card.getByRole("button", { name: "Enviar oferta", exact: true }).click();
    await d.getByRole("button", { name: "Recusar", exact: true }).click();
    await p.waitForFunction(() => document.querySelector("#rides .phase")?.textContent === "Aguardando a Central");
    await card.locator("select").selectOption(roles.driver.id); await card.getByRole("button", { name: "Enviar oferta", exact: true }).click();
    await d.getByRole("button", { name: "Aceitar", exact: true }).click();
    await p.waitForFunction(() => document.querySelector("#rides .phase")?.textContent === "Motorista a caminho");
    await p.reload(); await p.locator("#account").waitFor({ state: "visible" });
    await p.waitForFunction(() => document.querySelector("#rides .phase")?.textContent === "Motorista a caminho");
    await views.passenger.context.setOffline(true);
    await p.waitForFunction(() => document.getElementById("connection").textContent.includes("Comandos bloqueados"));
    assert.equal(await p.getByRole("button", { name: "Cancelar solicitação", exact: true }).first().isEnabled(), false);
    await views.passenger.context.setOffline(false);
    for (const label of ["Cheguei ao embarque", "Confirmar embarque", "Concluir atendimento de teste"]) await d.getByRole("button", { name: label, exact: true }).click();
    await p.waitForFunction(() => document.querySelector("#rides .phase")?.textContent === "Concluída");
    await card.getByText("Concluída", { exact: true }).waitFor({ state: "visible" });
    assert.equal((await snap("passenger")).events.filter(e => e.ride_id === current.id).length, 8);
    for (const { page } of Object.values(views)) assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await p.locator("#logout").click(); await p.locator("#auth").waitFor({ state: "visible" }); assert.equal(await p.locator("#rides article").count(), 0);
    await browser.close(); browser = null;

    // Recovery email is captured locally, not delivered to an external address.
    await ok("passenger", "/api/assisted/logout", {});
    await ok("passenger", "/api/assisted/recover", { email: roles.passenger.email });
    await confirm("passenger", await mailLink(roles.passenger.email, roles.passenger.seen));
    const newPassword = crypto.randomBytes(24).toString("hex");
    await ok("passenger", "/api/assisted/password", { password: newPassword });
    await ok("passenger", "/api/assisted/logout", {});
    assert.equal((await call("passenger", "/api/assisted/snapshot")).status, 401);
    assert.equal((await call("passenger", "/api/assisted/login", { email: roles.passenger.email, password })).status, 401);
    await ok("passenger", "/api/assisted/login", { email: roles.passenger.email, password: newPassword });
    const securityAfter = await admin.rpc("nave_assisted_fixture_security"); assert.equal(securityAfter.error, null); assert.deepEqual(securityAfter.data, securityBefore.data);
    console.log("PASS: self-service signup, real PKCE confirmation/recovery via local email, HttpOnly session, refresh, password change and logout; driver approval and Central MFA; no client role escalation.");
    console.log("PASS: multiple persistent requests, all categories, same-key replay/conflict, ownership denial, transactional single acceptance, separate-process restart, ordered history and no cancellation after boarding.");
    console.log("PASS: three browser roles, manual assignment, decline/reassign, acceptance through completion, reload without new login, offline blocking/recovery, and no browser token storage. All data in disposable Postgres; existing contact rows unchanged.");
  } finally { if (browser) await browser.close(); await stop(); }
});
