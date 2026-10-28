"use strict";
const express = require("express"), path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { createHash, randomUUID } = require("node:crypto");
const { createRouting } = require("./routing");
const { createGeocoding } = require("./geocoding");
const { estimateFares } = require("./fares");
const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "pkce" };
const publicError = (res, status, message) => res.status(status).json({ error: message });
function cookies(req) {
  const result = {};
  for (const part of (req.get("cookie") || "").split(";")) {
    const split = part.indexOf("=");
    if (split > 0) { try { result[part.slice(0, split).trim()] = decodeURIComponent(part.slice(split + 1)); } catch (_) {} }
  }
  return result;
}
function shape(body, keys) { return body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).every(k => keys.includes(k)); }
function createAssistedApp({ url, publishableKey, serviceKey, origin, makeClient = createClient, routePlanner = createRouting(), addressSearch = createGeocoding(), mapEnabled = true }) {
  const target = new URL(origin), database = new URL(url);
  const loopback = target.protocol === "http:" && target.hostname === "127.0.0.1";
  if ((!loopback && target.protocol !== "https:") || target.origin !== origin || target.username || target.password || (!url.startsWith("http://127.0.0.1:") && database.protocol !== "https:") || !publishableKey || !serviceKey || publishableKey === serviceKey) throw new Error("Invalid assisted environment");
  const app = express(), secure = !loopback;
  const routeQuotes = new Map();
  app.disable("x-powered-by");
  const cookieOptions = { httpOnly: true, secure, sameSite: "strict", path: "/" };
  const admin = makeClient(url, serviceKey, { auth: authOptions });
  const client = () => makeClient(url, publishableKey, { auth: authOptions });
  const clearSession = res => { for (const key of ["nave_access", "nave_refresh"]) res.clearCookie(key, cookieOptions); };
  const saveSession = (res, session) => {
    if (!session?.access_token || !session.refresh_token) throw new Error("Missing session");
    res.cookie("nave_access", session.access_token, { ...cookieOptions, maxAge: 3600000 });
    res.cookie("nave_refresh", session.refresh_token, { ...cookieOptions, maxAge: 7 * 86400000 });
  };
  function flowClient(req, res) {
    // Only the PKCE verifier is kept by this storage adapter. Session tokens use HttpOnly cookies above.
    const jar = cookies(req);
    const cookieName = key => "nave_pkce_" + createHash("sha256").update(key).digest("hex").slice(0, 16);
    const options = { ...authOptions, persistSession: true, storageKey: "nave-assisted", storage: {
      getItem(key) { return key.endsWith("-code-verifier") ? jar[cookieName(key)] || null : null; },
      setItem(key, value) { if (key.endsWith("-code-verifier")) { jar[cookieName(key)] = value; res.cookie(cookieName(key), value, { ...cookieOptions, sameSite: "lax", maxAge: 3600000 }); } },
      removeItem(key) { if (key.endsWith("-code-verifier")) { delete jar[cookieName(key)]; res.clearCookie(cookieName(key), { ...cookieOptions, sameSite: "lax" }); } }
    } };
    return makeClient(url, publishableKey, { auth: options });
  }
  app.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "strict-origin", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; frame-ancestors 'none'; form-action 'self'; base-uri 'none'" });
    if (req.get("host") !== target.host || (loopback && !["127.0.0.1", "::ffff:127.0.0.1", "::1"].includes(req.socket.remoteAddress))) return res.sendStatus(403);
    if (!["GET", "HEAD"].includes(req.method) && (req.get("origin") !== origin || !req.is("application/json"))) return res.sendStatus(403);
    next();
  });
  app.use(express.json({ limit: "8kb" }));
  const attempts = new Map();
  function throttle(req, res, next) {
    const now = Date.now();
    for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
    const key = createHash("sha256").update(req.socket.remoteAddress || "unknown").digest("hex");
    const item = attempts.get(key) || { count: 0, until: now + 60000 };
    if (item.count >= 20 || (!attempts.has(key) && attempts.size >= 2048)) { res.set("Retry-After", "60"); return publicError(res, 429, "Aguarde um minuto antes de tentar novamente."); }
    item.count++; attempts.set(key, item); next();
  }
  const identity = async (req, res, next) => {
    const token = cookies(req).nave_access;
    if (!token || token.length > 8192) return publicError(res, 401, "Entre para continuar.");
    try {
      const c = client(), { data, error } = await c.auth.getUser(token);
      if (error || !data?.user?.email_confirmed_at) return publicError(res, 401, "Entre para continuar.");
      const assurance = await c.auth.mfa.getAuthenticatorAssuranceLevel(token);
      if (assurance.error) return publicError(res, 503, "Não foi possível validar a sessão.");
      req.actor = { id: data.user.id, aal2: assurance.data.currentLevel === "aal2" && assurance.data.nextLevel === "aal2", requiresMfa: assurance.data.currentLevel !== "aal2" && assurance.data.nextLevel === "aal2" };
      req.accessToken = token; next();
    } catch (_) { publicError(res, 503, "Serviço indisponível. Tente novamente."); }
  };
  async function enroll(user) {
    if (!user?.email_confirmed_at) return;
    const raw = user.user_metadata?.display_name;
    const name = typeof raw === "string" && raw.trim().length >= 2 ? raw.trim().slice(0, 80) : "Participante";
    // This flag requests a PENDING driver profile only; it never grants approval or administrator access.
    const { error } = await admin.rpc("nave_assisted_enroll", { p_actor: user.id, p_name: name, p_driver: user.user_metadata?.request_driver === true });
    if (error) throw new Error("Enrollment unavailable");
  }
  app.post("/api/assisted/signup", throttle, async (req, res) => {
    const b = req.body;
    if (!shape(b, ["email", "password", "name", "driver"]) || typeof b.email !== "string" || b.email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email) || typeof b.password !== "string" || b.password.length < 12 || b.password.length > 128 || typeof b.name !== "string" || b.name.trim().length < 2 || b.name.length > 80 || typeof b.driver !== "boolean") return publicError(res, 400, "Confira nome, email e senha de pelo menos 12 caracteres.");
    try {
      const { data, error } = await flowClient(req, res).auth.signUp({ email: b.email.trim(), password: b.password, options: { emailRedirectTo: origin + "/assistido/confirm", data: { display_name: b.name.trim(), request_driver: b.driver } } });
      if (error) return publicError(res, 400, "Não foi possível concluir. Confira os dados ou recupere seu acesso.");
      if (data.session) { await enroll(data.user); saveSession(res, data.session); }
      res.status(202).json({ accepted: true, message: "Confira seu email para confirmar o cadastro. Se já tiver conta, entre ou recupere seu acesso." });
    } catch (_) { publicError(res, 503, "Cadastro temporariamente indisponível."); }
  });
  app.post("/api/assisted/login", throttle, async (req, res) => {
    const b = req.body;
    if (!shape(b, ["email", "password", "code"]) || typeof b.email !== "string" || b.email.length > 254 || typeof b.password !== "string" || b.password.length > 128 || (b.code !== undefined && !/^[0-9]{6}$/.test(b.code))) return publicError(res, 400, "Confira os dados de entrada.");
    try {
      clearSession(res);
      const c = client(); let { data, error } = await c.auth.signInWithPassword({ email: b.email.trim(), password: b.password });
      if (error || !data?.session) return publicError(res, 401, "Credenciais inválidas ou email ainda não confirmado.");
      if (b.code) {
        const factors = await c.auth.mfa.listFactors();
        const factor = factors.data?.totp?.find(f => f.status === "verified");
        if (factors.error || !factor) return publicError(res, 403, "Segundo fator inválido.");
        const verified = await c.auth.mfa.challengeAndVerify({ factorId: factor.id, code: b.code });
        if (verified.error) return publicError(res, 403, "Segundo fator inválido.");
        data = { ...data, session: verified.data };
      }
      await enroll(data.user);
      const assurance = await c.auth.mfa.getAuthenticatorAssuranceLevel(data.session.access_token);
      if (assurance.error) return publicError(res, 503, "Não foi possível conferir o segundo fator.");
      saveSession(res, data.session); res.json({ ok: true, requiresMfa: assurance.data.currentLevel !== "aal2" && assurance.data.nextLevel === "aal2" });
    } catch (_) { publicError(res, 503, "Entrada temporariamente indisponível."); }
  });
  async function accountClient(req, res) {
    const jar = cookies(req), c = client();
    const current = await c.auth.setSession({ access_token: req.accessToken, refresh_token: jar.nave_refresh || "" });
    if (current.error || current.data?.user?.id !== req.actor.id) return null;
    saveSession(res, current.data.session);
    return c;
  }
  app.get("/api/assisted/mfa/status", identity, (req, res) => res.json({ requiresMfa: req.actor.requiresMfa }));
  app.post("/api/assisted/mfa/challenge", throttle, identity, async (req, res) => {
    if (!shape(req.body, ["code"]) || typeof req.body.code !== "string" || !/^[0-9]{6}$/.test(req.body.code)) return res.sendStatus(400);
    try {
      const c = await accountClient(req, res);
      if (!c) return res.sendStatus(401);
      const factors = await c.auth.mfa.listFactors();
      const factor = factors.data?.totp?.find(f => f.status === "verified");
      if (factors.error || !factor) return publicError(res, 403, "Esta conta não possui um autenticador confirmado.");
      const result = await c.auth.mfa.challengeAndVerify({ factorId: factor.id, code: req.body.code });
      if (result.error) return publicError(res, 403, "Código inválido. Use o código atual do autenticador desta conta.");
      saveSession(res, result.data); res.json({ ok: true });
    } catch (_) { publicError(res, 503, "Não foi possível confirmar o autenticador."); }
  });
  app.post("/api/assisted/mfa/enroll", throttle, identity, async (req, res) => {
    if (!shape(req.body, []) || Object.keys(req.body).length) return res.sendStatus(400);
    try {
      const c = await accountClient(req, res);
      if (!c) return res.sendStatus(401);
      const factors = await c.auth.mfa.listFactors();
      if (factors.error) return publicError(res, 503, "Não foi possível consultar o autenticador.");
      // Never replace a verified factor or weaken the user's existing protection.
      if (factors.data.all.some(f => f.status === "verified")) return publicError(res, 409, "Esta conta já possui autenticador. Use seu código ao entrar.");
      // Restart only unfinished setup owned by the current authenticated user.
      for (const f of factors.data.all.filter(f => f.factor_type === "totp" && f.status === "unverified")) {
        const removed = await c.auth.mfa.unenroll({ factorId: f.id });
        if (removed.error) return publicError(res, 503, "Não foi possível reiniciar a configuração.");
      }
      const result = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: "NAVE Testes" });
      if (result.error || !result.data?.totp) return publicError(res, 503, "Não foi possível preparar o autenticador.");
      res.json({ factorId: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret });
    } catch (_) { publicError(res, 503, "Configuração temporariamente indisponível."); }
  });
  app.post("/api/assisted/mfa/verify", throttle, identity, async (req, res) => {
    const b = req.body;
    if (!shape(b, ["factorId", "code"]) || typeof b.factorId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.factorId) || typeof b.code !== "string" || !/^[0-9]{6}$/.test(b.code)) return res.sendStatus(400);
    try {
      const c = await accountClient(req, res);
      if (!c) return res.sendStatus(401);
      const factors = await c.auth.mfa.listFactors();
      if (factors.error || !factors.data.all.some(f => f.id === b.factorId && f.factor_type === "totp" && f.status === "unverified")) return publicError(res, 403, "Configuração inválida. Reinicie a configuração nesta conta.");
      const result = await c.auth.mfa.challengeAndVerify({ factorId: b.factorId, code: b.code });
      if (result.error) return publicError(res, 403, "Código inválido. Confira o código atual no autenticador.");
      saveSession(res, result.data);
      res.json({ ok: true, message: "Autenticador ativado. A liberação da Central depende do operador responsável." });
    } catch (_) { publicError(res, 503, "Não foi possível confirmar o autenticador."); }
  });
  app.post("/api/assisted/recover", throttle, async (req, res) => {
    if (!shape(req.body, ["email"]) || typeof req.body.email !== "string" || req.body.email.length > 254) return res.sendStatus(400);
    try { await flowClient(req, res).auth.resetPasswordForEmail(req.body.email.trim(), { redirectTo: origin + "/assistido/confirm" }); res.status(202).json({ accepted: true }); }
    catch (_) { publicError(res, 503, "Recuperação temporariamente indisponível."); }
  });
  app.get("/assistido/confirm", async (req, res) => {
    if (typeof req.query.code !== "string" || req.query.code.length > 2048) return res.redirect("/assistido/?auth=failed");
    try {
      const flowId = typeof req.query.sb_flow_id === "string" ? req.query.sb_flow_id : undefined;
      const { data, error } = await flowClient(req, res).auth.exchangeCodeForSession(req.query.code, flowId ? { flowId } : undefined);
      if (error || !data.session) return res.redirect("/assistido/?auth=failed");
      await enroll(data.user); saveSession(res, data.session); res.redirect("/assistido/?auth=confirmed");
    } catch (_) { res.redirect("/assistido/?auth=failed"); }
  });
  app.post("/api/assisted/refresh", throttle, async (req, res) => {
    try {
      const refresh_token = cookies(req).nave_refresh;
      if (!refresh_token || refresh_token.length > 8192) return res.sendStatus(401);
      const { data, error } = await client().auth.refreshSession({ refresh_token });
      if (error || !data.session) { clearSession(res); return res.sendStatus(401); }
      saveSession(res, data.session); res.json({ ok: true });
    } catch (_) { publicError(res, 503, "Não foi possível renovar sua sessão."); }
  });
  app.post("/api/assisted/logout", async (req, res) => {
    const token = cookies(req).nave_access;
    clearSession(res);
    try { if (token) { const { error } = await admin.auth.admin.signOut(token, "local"); if (error) return publicError(res, 503, "Saída local concluída; não foi possível confirmar a revogação no servidor."); } res.json({ ok: true }); }
    catch (_) { publicError(res, 503, "Saída local concluída; revogação indisponível."); }
  });
  app.post("/api/assisted/password", throttle, identity, async (req, res) => {
    if (!shape(req.body, ["password"]) || typeof req.body.password !== "string" || req.body.password.length < 12 || req.body.password.length > 128) return publicError(res, 400, "Use uma senha de 12 a 128 caracteres.");
    if (req.actor.requiresMfa) return publicError(res, 403, "Confirme seu autenticador antes de alterar a senha.");
    try {
      const c = client(), jar = cookies(req);
      const session = await c.auth.setSession({ access_token: jar.nave_access, refresh_token: jar.nave_refresh });
      if (session.error) return res.sendStatus(401);
      saveSession(res, session.data.session);
      const { error } = await c.auth.updateUser({ password: req.body.password });
      if (error) return publicError(res, 400, "Não foi possível atualizar a senha.");
      res.json({ ok: true });
    } catch (_) { publicError(res, 503, "Atualização temporariamente indisponível."); }
  });
  app.post("/api/assisted/geocode", throttle, identity, async (req, res) => {
    if (!mapEnabled) return publicError(res, 503, "Busca temporariamente indisponível.");
    if (!shape(req.body, ["query", "consentExternalSearch", "testOnly"])) return res.sendStatus(400);
    const member = await admin.rpc("nave_assisted_snapshot", { p_actor: req.actor.id, p_aal2: req.actor.aal2 });
    if (member.error || member.data?.member?.role !== "passenger") return res.sendStatus(403);
    try { res.json(await addressSearch(req.body)); }
    catch (error) { publicError(res, error.message === "invalid_search" ? 400 : error.message === "search_cooldown" ? 429 : 503, error.message === "invalid_search" ? "Digite de 5 a 240 caracteres e autorize a busca." : error.message === "search_cooldown" ? "Aguarde alguns segundos antes de buscar novamente." : "Busca indisponível. Você pode marcar o ponto manualmente no mapa."); }
  });
  app.get("/api/assisted/map-config", identity, (_req, res) => {
    res.json({ enabled: mapEnabled, tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", center: [-24.724, -53.744], provider: "OSRM/FOSSGIS" });
  });
  app.post("/api/assisted/route-preview", throttle, identity, async (req, res) => {
    if (!mapEnabled) return publicError(res, 503, "Mapa e rota temporariamente indisponíveis.");
    if (!shape(req.body, ["pickup", "destination", "testOnly", "consentExternalRouting"])) return res.sendStatus(400);
    const member = await admin.rpc("nave_assisted_snapshot", { p_actor: req.actor.id, p_aal2: req.actor.aal2 });
    if (member.error || member.data?.member?.role !== "passenger") return res.sendStatus(403);
    try {
      const route = await routePlanner(req.body), now = Date.now();
      for (const [key, value] of routeQuotes) if (value.until <= now) routeQuotes.delete(key);
      if (routeQuotes.size >= 500) return publicError(res, 503, "Aguarde antes de calcular outra rota.");
      const routeToken = randomUUID();
      const fares = estimateFares(route);
      routeQuotes.set(routeToken, { actor: req.actor.id, route, fares, until: now + 300000 });
      setTimeout(() => routeQuotes.delete(routeToken), 300000).unref();
      res.json({ routeToken, route, fares, expiresAt: new Date(now + 300000).toISOString(), validForSeconds: 300 });
    } catch (error) {
      const invalid = ["invalid_points_or_consent", "invalid_local_distance"].includes(error.message);
      const cooldown = error.message === "routing_cooldown";
      if (cooldown) res.set("Retry-After", "2");
      publicError(res, invalid ? 400 : cooldown ? 429 : 503, invalid ? "Confirme dois pontos locais, entre 50 metros e 25 km, e autorize o cálculo da rota." : cooldown ? "Aguarde dois segundos antes de calcular novamente." : "Não foi possível obter uma rota pelas ruas. Revise os pontos e tente novamente; nenhuma distância ou duração foi inventada.");
    }
  });
  app.get("/api/assisted/snapshot", identity, async (req, res) => {
    const { data, error } = await admin.rpc("nave_assisted_snapshot", { p_actor: req.actor.id, p_aal2: req.actor.aal2 });
    if (error) return publicError(res, error.message?.includes("forbidden") ? 403 : 503, "Acesso indisponível. Na Central, entre com segundo fator.");
    res.json(data);
  });
  app.post("/api/assisted/command", identity, async (req, res) => {
    const b = req.body;
    if (!shape(b, ["action", "rideId", "version", "requestKey", "data"]) || typeof b.action !== "string" || b.action.length > 30 || !Number.isSafeInteger(b.version) || b.version < 0 || !/^[0-9a-f-]{36}$/i.test(b.requestKey || "") || !(b.rideId === null || /^[0-9a-f-]{36}$/i.test(b.rideId || "")) || !shape(b.data, ["pickup", "destination", "category", "driverId", "approved", "available", "routeToken"])) return publicError(res, 400, "Comando inválido.");
    if (Object.hasOwn(b.data, "routeToken")) {
      const quote = routeQuotes.get(b.data.routeToken);
      if (b.action !== "start" || !quote || quote.actor !== req.actor.id || quote.until <= Date.now()) return publicError(res, 409, "A rota venceu ou não pertence a esta conta. Calcule novamente antes de solicitar.");
      if (!Object.hasOwn(quote.fares, b.data.category) && Object.keys(quote.fares).length) return publicError(res, 400, "Categoria inválida para a estimativa.");
      const fareEstimate = quote.fares[b.data.category];
      b.data = { ...b.data, routePreview: { ...quote.route, ...(fareEstimate ? { fareEstimate } : {}) } }; delete b.data.routeToken;
    }
    const { data, error } = await admin.rpc("nave_assisted_command", { p_actor: req.actor.id, p_aal2: req.actor.aal2, p_action: b.action, p_id: b.rideId, p_version: b.version, p_key: b.requestKey, p_data: b.data });
    if (error) {
      const status = error.message?.includes("forbidden") ? 403 : ["23505", "P0001", "22P02", "23514"].includes(error.code) ? 409 : 503;
      return publicError(res, status, status === 403 ? "Você não pode executar essa ação." : "Ação não confirmada. Atualize e confira a solicitação antes de continuar.");
    }
    res.json(data);
  });
  app.use("/assistido/vendor/leaflet", express.static(path.join(path.dirname(require.resolve("leaflet/package.json")), "dist"), { index: false }));
  app.use("/assistido", express.static(path.join(__dirname, "public"), { index: "index.html" }));
  app.use((error, _req, res, _next) => publicError(res, error.type === "entity.too.large" ? 413 : 400, "Requisição inválida."));
  return app;
}
module.exports = { createAssistedApp };
