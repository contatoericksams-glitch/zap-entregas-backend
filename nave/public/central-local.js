"use strict";
(() => {
  const el = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const phases = { idle: "Aguardando solicitação", offer_pending: "Aguardando aceite", driver_to_pickup: "A caminho do embarque", at_pickup: "No embarque", in_trip: "Em andamento", completed: "Concluída", cancelled: "Encerrada", no_driver: "Sem piloto elegível" };
  const actions = { availability: "Disponibilidade alterada", start: "Solicitação iniciada", accept: "Oferta aceita", decline: "Oferta recusada", arrive: "Chegada ao embarque", board: "Embarque confirmado", complete: "Jornada concluída", cancel: "Solicitação cancelada", reset: "Nova demonstração preparada" };
  const categories = { eco: "NAVE Eco", confort: "NAVE Confort", executive: "NAVE Executive", navegator: "NAVEGATOR" };
  NaveLocalSync.connect("observer", snapshot => {
    const ride = snapshot.journey;
    el("availability").textContent = snapshot.available ? "Disponível na sala" : "Pausado na sala";
    el("phase").textContent = phases[ride?.phase || "idle"] || "—";
    el("version").textContent = "Versão " + snapshot.version;
    el("category").textContent = ride ? categories[ride.categoryCode] || "Categoria de teste" : "Nenhuma solicitação";
    el("message").textContent = ride ? ride.message : "Abra as outras duas telas para iniciar uma demonstração.";
    el("journey").hidden = !ride;
    if (ride) { el("pilot").textContent = ride.driverId || "—"; el("fare").textContent = money(ride.fareCents); el("commission").textContent = money(ride.commissionCents); el("gross").textContent = money(ride.driverGrossCents); }
    const events = Array.isArray(snapshot.events) ? snapshot.events.slice(-100) : [];
    el("empty").hidden = events.length > 0;
    el("events").replaceChildren();
    events.reverse().forEach(event => {
      const li = document.createElement("li"), title = document.createElement("strong"), detail = document.createElement("small");
      title.textContent = actions[event.action] || "Ação de demonstração";
      const actor = event.role === "passenger" ? "Passageiro fictício" : "Motorista fictício";
      const when = new Date(event.at).toLocaleTimeString("pt-BR");
      detail.textContent = "#" + event.sequence + " · " + when + " · " + actor + " · " + (event.action === "availability" ? (event.available ? "Disponível" : "Pausado") : phases[event.phase] || "—");
      li.append(title, detail); el("events").append(li);
    });
  });
})();
