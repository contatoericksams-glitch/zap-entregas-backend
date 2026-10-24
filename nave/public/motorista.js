"use strict";
(() => {
  const el = id => document.getElementById(id);
  const shared = typeof NaveLocalSync !== "undefined" && NaveLocalSync.enabled;
  const money = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  let available = false, busy = false, journey = null, declined = false, pilot = null, sharedReady = false;
  const next = { driver_to_pickup: ["arrive", "Simular chegada ao embarque"], at_pickup: ["board", "Confirmar embarque fictício"], in_trip: ["complete", "Finalizar simulação"] };
  const titles = { offer_pending: "Uma nova oferta fictícia", driver_to_pickup: "A caminho do embarque · teste", at_pickup: "No ponto de embarque · teste", in_trip: "Percurso fictício em andamento", completed: "Demonstração concluída", cancelled: "Solicitação fictícia encerrada", no_driver: "Sem piloto fictício elegível" };
  function render() {
    const active = journey && !declined && !["completed", "no_driver", "cancelled"].includes(journey.phase);
    el("availability").textContent = available ? "Disponível na demonstração" : "Pausado na demonstração";
    el("toggle").textContent = available ? "Pausar demonstração" : "Ficar disponível na demonstração";
    el("toggle").disabled = busy || Boolean(active) || (shared && !sharedReady);
    el("generate").disabled = busy || !available || Boolean(journey);
    el("category").disabled = shared || busy || Boolean(journey);
    el("phase").textContent = declined ? "Oferta recusada nesta tela" : journey ? titles[journey.phase] || "Demonstração encerrada" : "Seu próximo percurso começa aqui";
    el("message").textContent = declined ? "Esta oferta foi recusada. Qualquer redistribuição do laboratório é para outro motorista fictício; inicie uma nova demonstração para continuar." : journey ? journey.message : "Ative a disponibilidade de teste e gere uma oferta fictícia.";
    if (shared && !journey) el("message").textContent = available ? "Aguardando uma solicitação na tela do passageiro desta sala local." : "Ative a disponibilidade para receber a solicitação fictícia da outra tela.";
    el("pilot").textContent = pilot || "SEM OFERTA";
    el("trip").hidden = !journey;
    if (journey) {
      el("gross").textContent = money(journey.driverGrossCents);
      el("fare").textContent = money(journey.fareCents);
      el("commission").textContent = money(journey.commissionCents);
      el("eta").textContent = declined ? "Oferta encerrada" : journey.phase === "at_pickup" ? "No embarque · teste" : ["in_trip", "completed"].includes(journey.phase) ? "Etapa concluída" : journey.etaToPickupSeconds ? Math.ceil(journey.etaToPickupSeconds / 60) + " min fictícios" : "—";
    }
    el("accept").hidden = el("decline").hidden = !active || journey.phase !== "offer_pending";
    const action = active && next[journey.phase];
    el("advance").hidden = !action;
    el("advance").textContent = action ? action[1] : "Avançar demonstração";
    el("reset").hidden = shared || !journey || Boolean(active);
    ["accept", "decline", "advance", "reset"].forEach(id => { el(id).disabled = busy || (shared && !sharedReady); });
    const step = !journey || declined ? -1 : journey.phase === "offer_pending" ? 0 : journey.phase === "driver_to_pickup" ? 1 : ["at_pickup", "in_trip"].includes(journey.phase) ? 2 : journey.phase === "completed" ? 3 : -1;
    document.querySelectorAll("#steps li").forEach((item, index) => item.classList.toggle("active", index <= step));
  }
  async function act(action) {
    if (busy || !available || (declined && action !== "start")) return;
    busy = true; el("error").textContent = ""; render();
    try {
      if (shared) { await NaveLocalSync.mutate(action); return; }
      const body = action === "start" ? { action, category: el("category").value, scenario: "normal" } : { action, state: journey.state };
      const response = await fetch("/api/v5/journey-lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Não foi possível atualizar a demonstração. Tente novamente.");
      const data = await response.json();
      if (data.testOnly !== true || data.simulation !== true || data.commercialRidesEnabled !== false || data.persistenceEnabled !== false || data.whatsappSendEnabled !== false || data.paymentsEnabled !== false || !Number.isSafeInteger(data.driverGrossCents) || !Number.isSafeInteger(data.commissionCents) || data.fareCents !== data.driverGrossCents + data.commissionCents) throw new Error("A resposta não corresponde a uma simulação segura.");
      if (action === "start") { pilot = data.driverId; declined = false; }
      if (action === "decline") declined = true;
      journey = data;
    } catch (error) { el("error").textContent = error.name === "TimeoutError" ? "A demonstração demorou a responder. Tente novamente." : error.message; }
    finally { busy = false; render(); }
  }
  el("toggle").addEventListener("click", async () => {
    if (!shared) { available = !available; render(); return; }
    busy = true; el("error").textContent = ""; render();
    try { await NaveLocalSync.mutate("availability", { available: !available }); }
    catch (e) { el("error").textContent = e.message; }
    finally { busy = false; render(); }
  });
  el("generate").addEventListener("click", () => act("start"));
  el("accept").addEventListener("click", () => act("accept"));
  el("decline").addEventListener("click", () => act("decline"));
  el("advance").addEventListener("click", () => { if (journey && next[journey.phase]) return act(next[journey.phase][0]); });
  el("reset").addEventListener("click", () => { journey = null; pilot = null; declined = false; el("error").textContent = ""; render(); });
  if (shared) {
    el("generate").closest("section").hidden = true;
    el("toggle").previousElementSibling.textContent = "Disponibilidade compartilhada com a prévia do passageiro nesta máquina. Não coloca um motorista real online.";
    document.querySelector(".progress p:last-child").textContent = "Esta sala é sincronizada apenas nesta máquina. Recusar encerra o pedido fictício; uma nova solicitação começa na tela do passageiro.";
    NaveLocalSync.connect("driver", snapshot => { available = snapshot.available; journey = snapshot.journey; pilot = journey?.driverId || null; declined = false; render(); }, connected => { sharedReady = connected; render(); });
  }
  render();
})();
