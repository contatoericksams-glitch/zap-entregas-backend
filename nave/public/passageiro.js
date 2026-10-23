"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const prices = new Map();
  const shared = typeof NaveLocalSync !== "undefined" && NaveLocalSync.enabled;
  let sharedReady = false, sharedAvailable = false;
  let journey = null, busy = false;
  const next = { offer_pending: ["accept", "Simular aceite do motorista"], driver_to_pickup: ["arrive", "Simular chegada ao embarque"], at_pickup: ["board", "Simular embarque"], in_trip: ["complete", "Simular conclusão"] };
  const titles = { offer_pending: "Aguardando aceite fictício", driver_to_pickup: "Sua NAVE está a caminho · teste", at_pickup: "Sua NAVE chegou · teste", in_trip: "Aproveite o caminho · teste", completed: "Simulação concluída", cancelled: "Simulação cancelada", no_driver: "Nenhum motorista fictício disponível" };
  const category = () => document.querySelector('input[name="category"]:checked').value;
  async function api(path, body) {
    const response = await fetch("/api/v5/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Não foi possível carregar a demonstração. Tente novamente.");
    return response.json();
  }
  function render() {
    const active = journey && !["completed", "cancelled", "no_driver"].includes(journey.phase);
    byId("start").disabled = busy || Boolean(journey) || !prices.has(category()) || (shared && (!sharedReady || !sharedAvailable));
    document.querySelectorAll('input[name="category"]').forEach(input => { input.disabled = busy || Boolean(journey); });
    byId("fare").textContent = journey ? money(journey.fareCents) : prices.has(category()) ? money(prices.get(category())) : "—";
    byId("phase").textContent = journey ? titles[journey.phase] : "Tudo pronto para começar";
    byId("message").textContent = journey ? journey.message : "Escolha uma categoria e conheça o fluxo de uma viagem fictícia.";
    if (shared && !journey) byId("message").textContent = sharedAvailable ? "Motorista fictício disponível. Inicie uma solicitação para a outra tela receber a oferta." : "Aguardando o motorista ativar a disponibilidade na outra tela.";
    byId("cancel").hidden = !journey || !["offer_pending", "driver_to_pickup", "at_pickup"].includes(journey.phase);
    byId("cancel").disabled = busy;
    byId("reset").hidden = !journey;
    byId("reset").disabled = busy || (shared && Boolean(active));
    byId("driver").hidden = !active;
    byId("driver-name").textContent = "Motorista de demonstração · " + (journey?.driverId || "");
    byId("eta").textContent = journey?.phase === "at_pickup" ? "Aguardando embarque fictício" : journey?.phase === "in_trip" ? "Percurso fictício em andamento · 4,3 km" : journey?.etaToPickupSeconds ? Math.ceil(journey.etaToPickupSeconds / 60) + " min fictícios até o embarque" : "Percurso fictício · 4,3 km";
    const action = journey && next[journey.phase];
    byId("advance").disabled = busy || !action;
    byId("advance").textContent = action ? action[1] : "Aguardando nova solicitação";
    const step = !journey ? -1 : journey.phase === "offer_pending" ? 0 : journey.phase === "driver_to_pickup" ? 1 : ["at_pickup", "in_trip"].includes(journey.phase) ? 2 : journey.phase === "completed" ? 3 : -1;
    document.querySelectorAll("#steps li").forEach((item, index) => item.classList.toggle("active", index <= step));
  }
  async function act(action) {
    if (busy) return;
    busy = true; byId("error").textContent = ""; render();
    try {
      if (shared) { await NaveLocalSync.mutate(action, action === "start" ? { category: category() } : {}); return; }
      const data = await api("journey-lab", action === "start" ? { action, category: category(), scenario: "normal" } : { action, state: journey.state });
      if (data.testOnly !== true || data.simulation !== true || data.commercialRidesEnabled !== false || data.whatsappSendEnabled !== false || data.persistenceEnabled !== false || data.paymentsEnabled !== false) throw new Error("A demonstração não está disponível neste ambiente.");
      journey = data;
    } catch (error) { byId("error").textContent = error.name === "TimeoutError" ? "A demonstração demorou a responder. Tente novamente." : error.message; }
    finally { busy = false; render(); }
  }
  byId("start").addEventListener("click", () => act("start"));
  byId("cancel").addEventListener("click", () => act("cancel"));
  byId("advance").addEventListener("click", () => { if (journey && next[journey.phase]) act(next[journey.phase][0]); });
  byId("reset").addEventListener("click", () => { if (shared) return act("reset"); journey = null; byId("error").textContent = ""; render(); });
  if (shared) {
    byId("advance").closest("details").hidden = true;
    NaveLocalSync.connect("passenger", snapshot => {
      journey = snapshot.journey; sharedReady = true; sharedAvailable = snapshot.available;
      if (journey) document.querySelectorAll('input[name="category"]').forEach(input => { input.checked = input.value === journey.categoryCode; });
      render();
      if (!journey) byId("message").textContent = sharedAvailable ? "Motorista fictício disponível. Inicie uma solicitação para a outra tela receber a oferta." : "Aguardando o motorista ativar a disponibilidade na outra tela.";
    });
  }
  document.querySelectorAll('input[name="category"]').forEach(input => input.addEventListener("change", render));
  Promise.all(["eco", "confort", "executive", "navegator"].map(async code => {
    const quote = await api("quote-preview", { channel: "app", category: code, distanceMeters: 4300, durationSeconds: 720 });
    if (quote.quoteIsTestOnly !== true || quote.commercialRideEnabled !== false || !Number.isSafeInteger(quote.fareCents)) throw new Error("Cotação de teste indisponível.");
    prices.set(code, quote.fareCents); byId("price-" + code).textContent = money(quote.fareCents);
  })).catch(() => { prices.clear(); byId("error").textContent = "Não foi possível carregar as cotações de teste. Recarregue a página."; }).finally(render);
  render();
})();
