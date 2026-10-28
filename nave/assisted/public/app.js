"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const routeUI = window.NaveRouteMap;
  let state = null, busy = false, connected = false, reading = false, generation = 0, readFinished = Promise.resolve(), mfaFactor = null, centralMode = false;
  function clearMfa() { mfaFactor = null; $("mfa-setup").hidden = true; $("mfa-qr").removeAttribute("src"); $("mfa-secret").textContent = ""; $("mfa-verify").reset(); }
  const phases = { requested: "Aguardando a Central", offered: "Aguardando aceite", accepted: "Motorista a caminho", arrived: "Motorista no embarque", in_trip: "Em andamento", completed: "Concluída", cancelled: "Cancelada" };
  const terminal = r => ["completed", "cancelled"].includes(r.phase);
  function message(text) { $("message").textContent = text; }
  function disable() { document.querySelectorAll(".command").forEach(b => { b.disabled = busy || !connected; }); }
  function clear() { routeUI.clear(); clearMfa(); $("mfa-challenge").hidden = true; $("mfa-challenge-form").reset(); centralMode = false; $("central-login").open = false; $("central-security").hidden = true; state = null; connected = false; generation++; $("rides").replaceChildren(); $("drivers").replaceChildren(); $("identity").textContent = ""; $("account").hidden = true; $("auth").hidden = false; }
  function challengeMfa() { $("auth").hidden = true; $("account").hidden = true; $("mfa-challenge").hidden = false; message("Confirme seu autenticador para continuar. Se abriu um link de recuperação, você poderá alterar a senha depois dessa confirmação."); }
  async function request(path, body, retry = true) {
    const response = await fetch("/api/assisted/" + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (response.status === 401 && retry && !["login", "signup", "refresh", "recover"].includes(path)) {
      const refresh = await fetch("/api/assisted/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
      if (refresh.ok) return request(path, body, false);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(data?.error || "Não foi possível confirmar a ação."); error.status = response.status; throw error; }
    if (!data) throw new Error("Resposta incompleta. Atualize antes de continuar.");
    return data;
  }
  const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
  function button(label, action, ride, data = {}) {
    const b = text("button", label, "command"); b.type = "button";
    b.addEventListener("click", () => command(action, ride, data)); return b;
  }
  function render() {
    const m = state.member, active = state.rides.some(r => !terminal(r));
    $("auth").hidden = true; $("account").hidden = false;
    $("mfa-challenge").hidden = true;
    $("identity").textContent = m.name + " · " + ({ passenger: "Passageiro", driver: "Motorista", admin: "Central" }[m.role]);
    $("approval").hidden = m.role !== "driver" || m.approved;
    $("booking").hidden = m.role !== "passenger" || active;
    $("availability").hidden = m.role !== "driver" || !m.approved;
    $("availability-label").textContent = m.available ? "Disponível para receber ofertas da Central." : "Indisponível.";
    $("toggle-availability").textContent = m.available ? "Ficar indisponível" : "Ficar disponível";
    $("drivers-panel").hidden = m.role !== "admin";
    $("central-security").hidden = m.role !== "admin" && !centralMode;
    $("drivers").replaceChildren();
    for (const d of state.drivers) {
      const row = text("div", d.name + " · " + (!d.approved ? "Aguardando aprovação" : d.available ? "Disponível" : "Indisponível"), "driver-row");
      row.append(button(d.approved ? "Retirar aprovação" : "Aprovar motorista", "approve_driver", null, { driverId: d.id, approved: !d.approved })); $("drivers").append(row);
    }
    $("rides").replaceChildren();
    if (!state.rides.length) $("rides").append(text("p", "Nenhuma solicitação para mostrar."));
    for (const r of state.rides) {
      const card = document.createElement("article"); card.className = "ride"; card.dataset.rideId = r.id;
      card.append(text("p", phases[r.phase], "phase"), text("h3", r.category.toUpperCase()), text("p", "Embarque: " + r.pickup + "\nDestino: " + r.destination, "route"), text("p", "Passageiro: " + r.passenger_name + (r.driver_name ? " · Motorista: " + r.driver_name : "")), text("small", "Pedido " + r.id.slice(0, 8) + " · versão " + r.version));
      if (r.route_preview?.schemaVersion === 1) {
        card.append(text("p", routeUI.describe(r.route_preview)));
        card.append(text("p", routeUI.fareDescription(r.route_preview.fareEstimate), "fare-estimate"));
        const view = text("button", "Ver trajeto no mapa", "secondary"); view.type = "button";
        view.addEventListener("click", () => routeUI.view(r.route_preview)); card.append(view);
      }
      if (m.role === "admin" && r.phase === "requested") {
        const label = text("label", "Atribuir motorista"), select = document.createElement("select"); select.setAttribute("aria-label", "Motorista para " + r.id.slice(0, 8));
        const empty = text("option", "Selecione um motorista disponível"); empty.value = ""; select.append(empty);
        for (const d of state.drivers.filter(d => d.approved && d.available && !state.rides.some(other => other.driver_id === d.id && !terminal(other)))) { const option = text("option", d.name); option.value = d.id; select.append(option); }
        label.append(select); const b = text("button", "Enviar oferta", "command"); b.type = "button";
        b.addEventListener("click", () => { if (select.value) command("assign", r, { driverId: select.value }); else message("Selecione um motorista."); }); card.append(label, b);
      }
      if (m.role === "driver" && m.approved) {
        const actions = { offered: [["Aceitar", "accept"], ["Recusar", "decline"]], accepted: [["Cheguei ao embarque", "arrive"]], arrived: [["Confirmar embarque", "board"]], in_trip: [["Concluir atendimento de teste", "complete"]] }[r.phase] || [];
        for (const [label, action] of actions) card.append(button(label, action, r));
      }
      if (["passenger", "admin"].includes(m.role) && ["requested", "offered", "accepted", "arrived"].includes(r.phase)) card.append(button("Cancelar solicitação", "cancel", r));
      const details = document.createElement("details"); details.append(text("summary", "Histórico")); const list = document.createElement("ul");
      for (const e of state.events.filter(e => e.ride_id === r.id).sort((a, b) => a.version - b.version)) list.append(text("li", new Date(e.at).toLocaleString("pt-BR") + " · " + ({start:"Solicitada",assign:"Oferta enviada",expire:"Oferta expirou — retornou à Central",accept:"Aceita",decline:"Recusada — retornou à Central",arrive:"Chegada",board:"Embarque",complete:"Concluída",cancel:"Cancelada"}[e.action] || e.action)));
      details.append(list); card.append(details); $("rides").append(card);
    }
    disable();
  }
  async function refresh(force = false) {
    if (reading) { if (force) { await readFinished; return refresh(true); } return false; }
    if (busy && !force) return false;
    reading = true; const currentGeneration = generation;
    let finishRead; readFinished = new Promise(resolve => { finishRead = resolve; });
    try {
      const data = await request("snapshot");
      if (generation !== currentGeneration) return false;
      if (data.testOnly !== true || !data.member || !Array.isArray(data.rides) || !Array.isArray(data.events) || !Array.isArray(data.drivers)) throw new Error("Estado incompatível.");
      state = data; connected = true; $("connection").textContent = "Conectado · alterações salvas no banco do piloto."; render(); return true;
    } catch (error) {
      if (generation !== currentGeneration) return false;
      connected = false; $("connection").textContent = "Sem confirmação do servidor. Comandos bloqueados até reconectar."; disable();
      if ([401, 403].includes(error.status)) {
        clear();
        if (error.status === 403) {
          const securityGeneration = generation;
          try { const security = await request("mfa/status", undefined, false); if (securityGeneration === generation) { if (security.requiresMfa) challengeMfa(); else message(error.message); } }
          catch (_) { if (securityGeneration === generation) message(error.message); }
        }
      }
      return false;
    } finally { reading = false; finishRead(); }
  }
  async function command(action, ride = null, data = {}) {
    if (busy || !connected) return;
    busy = true; generation++; connected = false; disable();
    try {
      const result = await request("command", { action, rideId: ride?.id || null, version: ride?.version || 0, requestKey: crypto.randomUUID(), data });
      if (result.testOnly !== true) throw new Error("Resposta incompatível.");
      if (action === "start") routeUI.resetBooking();
      message("Ação salva. Atualizando a solicitação.");
    } catch (error) { message(error.message + " Confira o estado atualizado antes de agir novamente."); }
    finally { busy = false; await refresh(true); }
  }
  for (const id of ["login", "signup", "recover", "password"]) $(id).addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return; busy = true; generation++; disable();
    const form = event.currentTarget, b = form.querySelector("button"), values = Object.fromEntries(new FormData(form)); b.disabled = true;
    if (id === "signup") { values.driver = values.kind === "driver"; delete values.kind; }
    if (id === "login") { centralMode = $("central-login").open; if (!centralMode || !values.code) delete values.code; }
    form.querySelectorAll('input[type="password"],input[name="code"]').forEach(input => { input.value = ""; });
    try { const result = await request(id, values, false); message(result.message || (id === "recover" ? "Se houver uma conta elegível, você receberá um email. Abra-o neste navegador." : id === "password" ? "Senha atualizada." : "Entrada confirmada.")); }
    catch (error) { message(error.message); }
    finally { values.password = ""; values.code = ""; busy = false; b.disabled = false; await refresh(true); }
  });
  $("central-login").addEventListener("toggle", () => {
    const input = $("login").elements.code; input.disabled = !$("central-login").open;
    if (input.disabled) input.value = "";
  });
  $("mfa-challenge-form").addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    busy = true; generation++; const form = event.currentTarget, b = form.querySelector("button"), code = form.elements.code.value;
    form.reset(); b.disabled = true; let verified = false;
    try { await request("mfa/challenge", { code }, false); verified = true; message("Autenticador confirmado. Você pode continuar ou abrir Alterar minha senha."); }
    catch (error) { message(error.message); if (error.status === 401) clear(); }
    finally { busy = false; b.disabled = false; if (verified) await refresh(true); }
  });
  $("mfa-enroll").addEventListener("click", async () => {
    if (busy || !connected) return;
    busy = true; generation++; disable(); $("mfa-enroll").disabled = true; clearMfa();
    try {
      const result = await request("mfa/enroll", {}, false);
      if (typeof result.qr !== "string" || !result.qr.startsWith("data:image/svg+xml;") || typeof result.secret !== "string" || typeof result.factorId !== "string") throw new Error("Configuração incompleta.");
      mfaFactor = result.factorId; $("mfa-qr").src = result.qr; $("mfa-secret").textContent = result.secret; $("mfa-setup").hidden = false;
      message("Adicione esta conta ao seu autenticador e confirme o código de seis dígitos.");
    } catch (error) { message(error.message); }
    finally { busy = false; $("mfa-enroll").disabled = false; await refresh(true); }
  });
  $("mfa-verify").addEventListener("submit", async event => {
    event.preventDefault(); if (busy || !connected || !mfaFactor) return;
    busy = true; generation++; disable(); const b = event.currentTarget.querySelector("button"); b.disabled = true;
    const code = event.currentTarget.elements.code.value; event.currentTarget.reset();
    try { const result = await request("mfa/verify", { factorId: mfaFactor, code }, false); clearMfa(); message(result.message); }
    catch (error) { message(error.message); }
    finally { busy = false; b.disabled = false; await refresh(true); }
  });
  routeUI.bind({ request, message });
  $("booking").addEventListener("submit", event => { event.preventDefault(); const route = routeUI.booking(); if (route.error) return message(route.error); command("start", null, { ...Object.fromEntries(new FormData(event.currentTarget)), ...route }); });
  $("toggle-availability").addEventListener("click", () => command("availability", null, { available: !state.member.available }));
  $("refresh").addEventListener("click", () => refresh());
  const signOut = async () => { if (busy) return; busy = true; generation++; try { await request("logout", {}, false); message("Você saiu."); } catch (error) { message(error.message); } finally { busy = false; clear(); } };
  $("logout").addEventListener("click", signOut); $("mfa-back").addEventListener("click", signOut);
  const auth = new URLSearchParams(location.search).get("auth");
  if (auth) { history.replaceState(null, "", "/assistido/"); message(auth === "confirmed" ? "Email confirmado. Você pode continuar ou alterar sua senha." : "Link inválido ou expirado. Solicite outro no mesmo navegador."); }
  refresh(); const timer = setInterval(() => { if (state) refresh(); }, 3000); window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
})();
