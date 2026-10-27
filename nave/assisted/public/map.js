"use strict";
window.NaveRouteMap = (() => {
  let request, message, bookingMap, viewerMap, config, pickup, destination, routeToken, preview, line, markers = [], generation = 0, calculating = false, selectedView = null, viewGeneration = 0;
  const $ = id => document.getElementById(id);
  async function settings() {
    config ||= await request("map-config");
    if (!config.enabled || config.tiles !== "https://tile.openstreetmap.org/{z}/{x}/{y}.png" || !window.L) throw new Error("Mapa temporariamente indisponível. Você ainda pode informar os endereços.");
    return config;
  }
  function mapAt(id) {
    const map = L.map(id, { minZoom: 11, maxZoom: 18, maxBounds: [[-26.5, -55.7], [-24.4, -52.4]], scrollWheelZoom: false }).setView(config.center, 14);
    L.tileLayer(config.tiles, { maxZoom: 18, updateWhenIdle: true, keepBuffer: 1, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
    return map;
  }
  function pointLabel(p) { return p ? p.lat.toFixed(5) + ", " + p.lng.toFixed(5) : "Ainda não marcado"; }
  function invalidate() { generation++; calculating = false; $("calculate-route").disabled = false; routeToken = null; preview = null; if (line && bookingMap) bookingMap.removeLayer(line); line = null; $("route-summary").textContent = "Calcule a rota após confirmar os dois pontos."; }
  function drawPoints() {
    for (const marker of markers) bookingMap.removeLayer(marker);
    markers = [];
    for (const [p, title, color] of [[pickup, "Embarque", "#087455"], [destination, "Destino", "#bc5714"]]) if (p) {
      const marker = L.circleMarker([p.lat, p.lng], { radius: 9, color, fillOpacity: .9 }).addTo(bookingMap);
      marker.bindTooltip(document.createTextNode(title), { permanent: true, direction: "top" }); markers.push(marker);
    }
    $("pickup-point").textContent = pointLabel(pickup); $("destination-point").textContent = pointLabel(destination);
  }
  function choose(latlng) {
    invalidate(); const point = { lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) };
    if ($("point-kind").value === "pickup") { pickup = point; $("point-kind").value = "destination"; } else destination = point;
    drawPoints();
  }
  function resetBooking() {
    invalidate(); calculating = false; pickup = null; destination = null; markers = [];
    if (bookingMap) bookingMap.remove(); bookingMap = null;
    $("map-stage").hidden = true; $("map-consent").checked = false; $("open-map").disabled = false; $("calculate-route").disabled = false;
    $("point-kind").value = "pickup"; $("pickup-point").textContent = "Ainda não marcado"; $("destination-point").textContent = "Ainda não marcado";
  }
  const describe = route => `${(route.distanceMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km pelas ruas · aproximadamente ${Math.ceil(route.durationSeconds / 60)} min de percurso, sem trânsito. Não é previsão de chegada do motorista.`;
  async function view(route) {
    selectedView = route; const current = ++viewGeneration;
    $("saved-route-view").hidden = false; $("saved-route-description").textContent = describe(route);
    if (!$("view-map-consent").checked) { message("Para abrir o mapa do trajeto, autorize o carregamento das imagens do OpenStreetMap nessa seção."); return; }
    try {
      await settings(); if (current !== viewGeneration || !$("view-map-consent").checked) return;
      if (viewerMap) viewerMap.remove(); viewerMap = mapAt("saved-route-map");
      const path = L.geoJSON(route.geometry, { style: { color: "#087455", weight: 5 } }).addTo(viewerMap);
      for (const [p, color] of [[route.points.pickup, "#087455"], [route.points.destination, "#bc5714"]]) L.circleMarker([p.lat, p.lng], { radius: 8, color, fillOpacity: .9 }).addTo(viewerMap);
      viewerMap.fitBounds(path.getBounds(), { padding: [25, 25], maxZoom: 16 });
    } catch (error) { message(error.message); }
  }
  function bind(deps) {
    request = deps.request; message = deps.message;
    $("open-map").addEventListener("click", async () => {
      if (!$("map-consent").checked) return message("Autorize o mapa e o envio dos pontos de teste para calcular o percurso.");
      $("open-map").disabled = true;
      const current = generation;
      try { await settings(); if (current !== generation || !$("map-consent").checked) return; $("map-stage").hidden = false; bookingMap ||= mapAt("booking-map"); bookingMap.off("click").on("click", event => choose(event.latlng)); bookingMap.invalidateSize(); }
      catch (error) { message(error.message); }
      finally { $("open-map").disabled = false; }
    });
    $("pick-center").addEventListener("click", () => { if (bookingMap) choose(bookingMap.getCenter()); });
    $("remove-route").addEventListener("click", () => { resetBooking(); message("Pontos removidos. Você pode continuar apenas com os endereços digitados."); });
    $("map-consent").addEventListener("change", () => { if (!$("map-consent").checked) resetBooking(); });
    $("calculate-route").addEventListener("click", async () => {
      if (calculating) return;
      if (!pickup || !destination || !$("map-consent").checked) return message("Marque embarque e destino e confirme a autorização.");
      calculating = true; $("calculate-route").disabled = true; const current = generation;
      try {
        const result = await request("route-preview", { pickup, destination, consentExternalRouting: true, testOnly: true });
        if (current !== generation) return;
        if (!result.routeToken || result.route?.testOnly !== true || result.route.geometry?.type !== "LineString") throw new Error("Rota incompleta. Calcule novamente.");
        routeToken = result.routeToken; preview = result.route;
        if (line) bookingMap.removeLayer(line);
        line = L.geoJSON(preview.geometry, { style: { color: "#087455", weight: 5 } }).addTo(bookingMap);
        bookingMap.fitBounds(line.getBounds(), { padding: [25, 25], maxZoom: 16 }); $("route-summary").textContent = describe(preview);
        message("Rota de teste calculada. Confira os pontos e os endereços antes de solicitar. A prévia vale por cinco minutos.");
      } catch (error) { if (current === generation) { routeToken = null; preview = null; message(error.message); } }
      finally { if (current === generation) { calculating = false; $("calculate-route").disabled = false; } }
    });
    $("view-map-consent").addEventListener("change", () => { if ($("view-map-consent").checked && selectedView) view(selectedView); else { viewGeneration++; if (viewerMap) viewerMap.remove(); viewerMap = null; } });
    $("close-route-view").addEventListener("click", () => { viewGeneration++; selectedView = null; if (viewerMap) viewerMap.remove(); viewerMap = null; $("saved-route-view").hidden = true; });
  }
  return Object.freeze({ bind, describe, view, resetBooking,
    booking() { return calculating || ((pickup || destination) && !routeToken) ? { error: "Calcule a rota dos pontos escolhidos ou remova os pontos para continuar apenas com os endereços." } : routeToken ? { routeToken } : {}; },
    clear() { resetBooking(); viewGeneration++; selectedView = null; if (viewerMap) viewerMap.remove(); viewerMap = null; $("saved-route-view").hidden = true; $("view-map-consent").checked = false; config = null; }
  });
})();
