"use strict";
// Automated preparation for P09, not human/device homologation. No hosted target allowed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), http = require("node:http"), crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { createAuthLabApp } = require("../core/auth-lab");
const { fixtureTotp } = require("./totp-fixture.cjs");

test("isolated Chromium contexts exercise real app logins, all categories, reconnection and competing accepts", { timeout: 240000 }, async () => {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  const status = JSON.parse(fs.readFileSync(process.env.NAVE_TEST_STATUS_FILE, "utf8"));
  const url = status.API_URL || status.api_url;
  assert.equal(url, "http://127.0.0.1:54321");
  const key = status.ANON_KEY || status.anon_key;
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, status.SERVICE_ROLE_KEY || status.service_role_key, options);
  const fixtures = {};
  for (const [name, metadata] of Object.entries({ passenger: { nave_lab_role: "passenger" }, driver: { nave_lab_role: "driver", nave_lab_driver_approved: true }, central: { nave_lab_role: "admin" }, outsider: { nave_lab_role: "passenger" } })) {
    const email = `browser-${name}-${crypto.randomUUID()}@example.invalid`, password = crypto.randomBytes(32).toString("hex");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: metadata });
    assert.equal(created.error, null, "Browser fixture creation failed");
    fixtures[name] = { email, password, id: created.data.user.id };
  }
  const mfaClient = createClient(url, key, options);
  assert.equal((await mfaClient.auth.signInWithPassword({ email: fixtures.central.email, password: fixtures.central.password })).error, null);
  const factor = await mfaClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "Browser-Central-fixture" });
  assert.equal(factor.error, null);
  const secret = factor.data.totp.secret;
  if (Date.now() % 30000 > 25000) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
  const enrollmentStep = Math.floor(Date.now() / 30000);
  assert.equal((await mfaClient.auth.mfa.challengeAndVerify({ factorId: factor.data.id, code: fixtureTotp(secret) })).error, null);
  if (Math.floor(Date.now() / 30000) === enrollmentStep) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));

  let clockOffset = 0;
  const server = http.createServer(createAuthLabApp({ url, publishableKey: key, clock: () => Date.now() + clockOffset }));
  let browser;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let externalRequests = 0, pageErrors = 0;
  let lastCentralLoginStep = null;
  const text = (page, id, value) => page.waitForFunction(({ id, value }) => document.getElementById(id)?.textContent === value, { id, value });
  const enabled = (page, id) => page.waitForFunction(id => { const el = document.getElementById(id); return el && !el.disabled && !el.hidden; }, id);
  const click = async (page, id) => { await enabled(page, id); await page.locator("#" + id).click(); };
  async function login(page, name, central = false) {
    if (central) {
      if (lastCentralLoginStep === Math.floor(Date.now() / 30000) || Date.now() % 30000 > 25000) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    }
    // Do not include generated passwords/TOTP or Playwright's fill call logs in errors.
    try {
      await page.getByLabel("Email de teste", { exact: true }).fill(fixtures[name].email);
      await page.getByLabel("Senha de teste", { exact: true }).fill(fixtures[name].password);
      if (central) await page.getByLabel("Código do autenticador de teste", { exact: true }).fill(fixtureTotp(secret));
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.locator(".auth-panel form").waitFor({ state: "hidden" });
      assert.equal(await page.getByLabel("Senha de teste", { exact: true }).inputValue(), "");
      if (central) assert.equal(await page.getByLabel("Código do autenticador de teste", { exact: true }).inputValue(), "");
      if (central) lastCentralLoginStep = Math.floor(Date.now() / 30000);
    } catch (_) { throw new Error("Browser fixture login or sensitive-field cleanup failed"); }
  }
  async function pageFor(file) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin !== base) { externalRequests++; return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on("pageerror", () => { pageErrors++; });
    await page.goto(base + "/" + file + "?auth=1");
    return { context, page };
  }
  try {
    browser = await chromium.launch({ headless: true });
    const passenger = await pageFor("passageiro.html"), driver = await pageFor("motorista.html"), central = await pageFor("central-local.html");
    assert.equal(await passenger.page.locator("#start").isEnabled(), false, "Cannot request before login");
    await login(passenger.page, "passenger"); await login(driver.page, "driver"); await login(central.page, "central", true);
    await text(central.page, "version", "Versão 0");
    const lostBodies = [];
    const loseFirstResponse = async route => {
      if (route.request().method() === "POST") {
        lostBodies.push(route.request().postData());
        if (lostBodies.length === 1) { await route.fetch(); await route.abort("failed"); return; }
      }
      await route.continue();
    };
    await driver.page.route(base + "/api/auth-lab/room", loseFirstResponse);
    await click(driver.page, "toggle"); await text(driver.page, "availability", "Disponível na demonstração");
    await text(central.page, "version", "Versão 1");
    assert.equal(lostBodies.length, 2); assert.equal(lostBodies[0], lostBodies[1]);
    await driver.page.unroute(base + "/api/auth-lab/room", loseFirstResponse);
    let version = 1;
    for (const category of ["eco", "confort", "executive", "navegator"]) {
      await passenger.page.locator(`input[name="category"][value="${category}"]`).check();
      if (category === "eco") {
        // The action commits, but the HTTP-success body arrives truncated. Hold reads
        // long enough to prove the page blocks commands before reconciliation.
        let releaseReads, posts = 0;
        const gate = new Promise(resolve => { releaseReads = resolve; });
        const truncateReply = async route => {
          if (route.request().method() === "POST") { posts++; await route.fetch(); await route.fulfill({ status: 200, contentType: "application/json", body: "{" }); return; }
          await gate; await route.continue();
        };
        await passenger.page.route(base + "/api/auth-lab/room", truncateReply);
        try {
          await click(passenger.page, "start"); version++;
          await passenger.page.waitForFunction(() => document.getElementById("error").textContent.includes("Resposta da ação não confirmada"));
          assert.equal(await passenger.page.locator("#start").isEnabled(), false);
          assert.equal(posts, 1, "Unreadable HTTP-success response is not retried as another command");
          await text(driver.page, "phase", "Uma nova oferta fictícia");
          await text(central.page, "version", "Versão " + version);
          assert.equal(await central.page.locator("#events li").count(), version);
          releaseReads();
          await text(passenger.page, "phase", "Aguardando aceite fictício");
          await enabled(passenger.page, "cancel");
          assert.equal(await passenger.page.locator("#error").textContent(), "");
          assert.equal(posts, 1, "Polling recovers the committed action without a duplicate POST");
        } finally { releaseReads(); await passenger.page.unroute(base + "/api/auth-lab/room", truncateReply); }
      } else { await click(passenger.page, "start"); version++; }
      await text(driver.page, "phase", "Uma nova oferta fictícia");
      await text(central.page, "version", "Versão " + version);
      if (category === "eco") {
        const outsider = await pageFor("passageiro.html");
        // An outside account signs in but cannot receive the occupied room snapshot.
        const denial = outsider.page.waitForResponse(r => r.url() === base + "/api/auth-lab/room" && r.status() === 403);
        try {
          await outsider.page.getByLabel("Email de teste", { exact: true }).fill(fixtures.outsider.email);
          await outsider.page.getByLabel("Senha de teste", { exact: true }).fill(fixtures.outsider.password);
          await outsider.page.getByRole("button", { name: "Entrar", exact: true }).click();
        } catch (_) { throw new Error("Outsider fixture form failed"); }
        await denial; await outsider.page.locator(".auth-panel form").waitFor({ state: "visible" });
        assert.equal(await outsider.page.locator("#start").isEnabled(), false);
        assert.equal(await outsider.page.locator("#phase").textContent(), "Tudo pronto para começar");
        await outsider.context.close();

        // Two independent browser sessions of the SAME approved driver compete on one version.
        const copy = await pageFor("motorista.html"); await login(copy.page, "driver");
        await text(copy.page, "phase", "Uma nova oferta fictícia");
        let arrivals = 0, release;
        const gate = new Promise(resolve => { release = resolve; });
        const together = async route => {
          if (route.request().method() === "POST") { arrivals++; if (arrivals === 2) release(); await gate; }
          await route.continue();
        };
        await driver.page.route(base + "/api/auth-lab/room", together);
        await copy.page.route(base + "/api/auth-lab/room", together);
        const [a, b] = await Promise.all([
          driver.page.waitForResponse(r => r.url() === base + "/api/auth-lab/room" && r.request().method() === "POST"),
          copy.page.waitForResponse(r => r.url() === base + "/api/auth-lab/room" && r.request().method() === "POST"),
          Promise.all([driver.page.locator("#accept").click(), copy.page.locator("#accept").click()]),
        ]);
        assert.deepEqual([a.status(), b.status()].sort(), [200, 409]);
        await driver.page.unroute(base + "/api/auth-lab/room", together);
        version++; await text(central.page, "version", "Versão " + version);
        assert.equal(await central.page.locator("#events li").count(), version);
        await copy.context.close();
      } else { await click(driver.page, "accept"); version++; }
      await text(passenger.page, "phase", "Sua NAVE está a caminho · teste");
      await text(driver.page, "phase", "A caminho do embarque · teste");
      if (category === "eco") {
        const historyBeforeReload = await central.page.locator("#events li").count();
        await passenger.page.reload();
        await passenger.page.locator(".auth-panel form").waitFor({ state: "visible" });
        assert.equal(await passenger.page.locator("#start").isEnabled(), false);
        assert.equal(await passenger.page.locator("#driver").isVisible(), false, "Reload must clear the previous identity and trip view");
        await login(passenger.page, "passenger");
        await text(passenger.page, "phase", "Sua NAVE está a caminho · teste");
        assert.equal(await passenger.page.locator("#start").isEnabled(), false, "Reauthentication resumes the existing journey instead of starting another");
        await text(central.page, "version", "Versão " + version);
        assert.equal(await central.page.locator("#events li").count(), historyBeforeReload);
        await passenger.context.setOffline(true);
        await passenger.page.waitForFunction(() => document.getElementById("error").textContent.includes("Conexão local indisponível"));
        assert.equal(await passenger.page.locator("#cancel").isEnabled(), false, "Offline passenger cannot cancel using stale state");
        await click(driver.page, "advance"); version++;
        await text(central.page, "version", "Versão " + version);
        await passenger.context.setOffline(false);
      } else { await click(driver.page, "advance"); version++; }
      await text(passenger.page, "phase", "Sua NAVE chegou · teste");
      if (category === "eco") assert.equal(await passenger.page.locator("#error").textContent(), "");
      await text(driver.page, "phase", "No ponto de embarque · teste");
      if (category === "eco") {
        await enabled(passenger.page, "cancel");
        await driver.context.setOffline(true);
        await driver.page.waitForFunction(() => document.getElementById("error").textContent.includes("Conexão local indisponível"));
        assert.equal(await driver.page.locator("#advance").isEnabled(), false, "Offline driver cannot board using stale state");
        await driver.context.setOffline(false);
        await enabled(driver.page, "advance");
        assert.equal(await driver.page.locator("#error").textContent(), "");
        const historyBeforeRevocation = await central.page.locator("#events li").count();
        const denied = driver.page.waitForResponse(r => r.url() === base + "/api/auth-lab/room" && r.status() === 403);
        assert.equal((await admin.auth.admin.updateUserById(fixtures.driver.id, { app_metadata: { nave_lab_role: "driver", nave_lab_driver_approved: false } })).error, null);
        await denied; await driver.page.locator(".auth-panel form").waitFor({ state: "visible" });
        assert.equal(await driver.page.locator("#trip").isVisible(), false);
        assert.equal(await driver.page.locator("#advance").isVisible(), false);
        await text(passenger.page, "phase", "Sua NAVE chegou · teste");
        await text(central.page, "version", "Versão " + version);
        assert.equal(await central.page.locator("#events li").count(), historyBeforeRevocation);
        assert.equal((await admin.auth.admin.updateUserById(fixtures.driver.id, { app_metadata: { nave_lab_role: "driver", nave_lab_driver_approved: true } })).error, null);
        await login(driver.page, "driver");
        await text(driver.page, "phase", "No ponto de embarque · teste");
      }
      await click(driver.page, "advance"); version++;
      await text(passenger.page, "phase", "Aproveite o caminho · teste");
      assert.equal(await passenger.page.locator("#cancel").isVisible(), false);
      await text(driver.page, "phase", "Percurso fictício em andamento");
      await click(driver.page, "advance"); version++;
      await text(passenger.page, "phase", "Simulação concluída"); await text(central.page, "phase", "Concluída");
      await text(central.page, "version", "Versão " + version);
      assert.equal(await passenger.page.locator("#fare").textContent(), await central.page.locator("#fare").textContent());
      assert.equal(await driver.page.locator("#gross").textContent(), await central.page.locator("#gross").textContent());
      await click(passenger.page, "reset"); version++;
      await text(driver.page, "phase", "Seu próximo percurso começa aqui"); await text(central.page, "version", "Versão " + version);
    }
    // Cancellation and refusal propagate to all three views, without late acceptance.
    await click(passenger.page, "start"); version++; await text(driver.page, "phase", "Uma nova oferta fictícia");
    await click(passenger.page, "cancel"); version++;
    await text(driver.page, "phase", "Solicitação fictícia encerrada"); await text(central.page, "phase", "Encerrada");
    assert.equal(await driver.page.locator("#accept").isVisible(), false);
    await click(passenger.page, "reset"); version++;
    await text(driver.page, "phase", "Seu próximo percurso começa aqui");
    await click(passenger.page, "start"); version++; await text(driver.page, "phase", "Uma nova oferta fictícia");
    await click(driver.page, "decline"); version++;
    await text(passenger.page, "phase", "Simulação cancelada"); await text(central.page, "version", "Versão " + version);
    await click(passenger.page, "reset"); version++;
    await text(driver.page, "phase", "Seu próximo percurso começa aqui");
    await click(passenger.page, "start"); version++; await text(driver.page, "phase", "Uma nova oferta fictícia");
    clockOffset += 120000; // Only the in-memory offer clock, never Auth/JWT or a hosted database.
    version++;
    await text(passenger.page, "phase", "Simulação cancelada"); await text(driver.page, "phase", "Solicitação fictícia encerrada");
    await text(central.page, "version", "Versão " + version);
    assert.equal(await driver.page.locator("#accept").isVisible(), false);
    assert.match(await central.page.locator("#events").textContent(), /Oferta de teste expirou/);
    assert.match(await central.page.locator("#events").textContent(), /Sistema de teste/);
    const deniedCentral = central.page.waitForResponse(r => r.url() === base + "/api/auth-lab/room" && r.status() === 403);
    assert.equal((await admin.auth.admin.updateUserById(fixtures.central.id, { app_metadata: { nave_lab_role: "disabled" } })).error, null);
    await deniedCentral; await central.page.locator(".auth-panel form").waitFor({ state: "visible" });
    assert.equal(await central.page.locator("#events li").count(), 0);
    assert.equal(await central.page.locator("#journey").isVisible(), false);
    assert.equal((await admin.auth.admin.updateUserById(fixtures.central.id, { app_metadata: { nave_lab_role: "admin" } })).error, null);
    await login(central.page, "central", true);
    await text(central.page, "version", "Versão " + version);
    assert.match(await central.page.locator("#events").textContent(), /Oferta de teste expirou/);
    await central.page.getByRole("button", { name: "Sair desta tela", exact: true }).click();
    await central.page.locator(".auth-panel form").waitFor({ state: "visible" });
    assert.equal(await central.page.locator("#events li").count(), 0, "Logout removes the observed history from the page");
    for (const view of [passenger.page, driver.page, central.page]) assert.deepEqual(await view.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    assert.equal(externalRequests, 0); assert.equal(pageErrors, 0);
    console.log("PASS: real Chromium contexts and form logins, Central MFA, four categories, one successful competing accept, offline recovery, cancellation, refusal, cross-account denial, and logout. Synthetic in-memory rides only; human/device P09 remains separate.");
    console.log("PASS: Chromium lost-response recovery reuses the exact request key/body after server commit; one event only. Injected offer-clock expiry removes acceptance and appears as a system event across all views.");
    console.log("PASS: passenger reload requires login and resumes the existing journey without events; driver approval withdrawal and Central admin-role withdrawal clear live trip/history views. Fixture reauthorization requires fresh form login and Central MFA; no extra journey events.");
    console.log("PASS: disconnected passenger and driver controls are disabled; validated polling resumes commands after reconnection, including same-version recovery, without journey events.");
    console.log("PASS: truncated HTTP-success response after committed request disables further commands; a valid read recovers the existing offer with one POST and one event only.");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
