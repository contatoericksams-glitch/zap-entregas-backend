"use strict";
window.NaveRouteMap = (() => {
  let request, message, bookingMap, viewerMap, config, pickup, destination, routeToken, preview, line, markers = [], generation = 0, calculating = false, selectedView = null, viewGeneration = 0;
  const $ = id => document.getElementById(id);
  let pendingKind = null, searchGeneration = 0, locating = false;
  const confirmed = { pickup: false, destination: false };
  const local = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -26.5 && p.lat <= -24.4 && p.lng >= -55.7 && p.lng <= -52.4;
  const address = kind => $("booking").elements[kind];
  function clearResults() { searchGeneration++; $("pickup-results").replaceChildren(); $("destination-results").replaceChildren(); }
  async function openBooking() {
    if (!$("map-consent").checked) throw new Error("Abra Localizar e confirmar os pontos no mapa e autorize a busca e o mapa.");
    const current = generation; await settings();
    if (current !== generation || !$("map-consent").checked) return false;
    $("route-picker").open = true; $("map-stage").hidden = false;
    bookingMap ||= mapAt("booking-map");
    bookingMap.off("click").on("click", event => choose(event.latlng)); bookingMap.invalidateSize(); return true;
  }
  async function settings() {
    config ||= await request("map-config");
    if (!config.enabled || config.tiles !== "https://tile.openstreetmap.org/{z}/{x}/{y}.png" || !window.L) throw new Error("Mapa temporariamente indisponível. Você ainda pode informar os endereços.");
    return config;
  }
  function mapAt(id) {
    const map = L.map(id, { minZoom: 11, maxZoom: 18, maxBounds: [[-26.5, -55.7], [-24.4, -52.4]], scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(config.center, 14);
    L.tileLayer(config.tiles, { maxZoom: 18, updateWhenIdle: true, keepBuffer: 1, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
    return map;
  }
  function pointLabel(p) { return p ? p.lat.toFixed(5) + ", " + p.lng.toFixed(5) : "Ainda não marcado"; }
  function invalidate() { generation++; locating = false; $("use-location").disabled = false; calculating = false; $("calculate-route").disabled = false; routeToken = null; preview = null; if (line && bookingMap) bookingMap.removeLayer(line); line = null; $("route-summary").textContent = "Calcule a rota após confirmar os dois pontos."; }
  function drawPoints() {
    for (const marker of markers) bookingMap.removeLayer(marker);
    markers = [];
    for (const [p, title, color] of [[pickup, "Embarque", "#087455"], [destination, "Destino", "#bc5714"]]) if (p) {
      const marker = L.circleMarker([p.lat, p.lng], { radius: 9, color, fillOpacity: .9 }).addTo(bookingMap);
      marker.bindTooltip(document.createTextNode(title), { permanent: true, direction: "top" }); markers.push(marker);
    }
    $("pickup-point").textContent = pointLabel(pickup); $("destination-point").textContent = pointLabel(destination);
  }
  function choose(latlng, confirm = false) {
    if (!local(latlng)) return message("Escolha um ponto dentro da região de teste do oeste do Paraná.");
    invalidate(); const point = { lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) };
    const kind = $("point-kind").value;
    if (kind === "pickup") pickup = point; else destination = point;
    confirmed[kind] = confirm; pendingKind = confirm ? null : kind;
    $("point-status").textContent = confirm ? "Ponto confirmado." : "Confira o pino, ajuste tocando no mapa e toque em Confirmar este ponto.";
    if (confirm && kind === "pickup") $("point-kind").value = "destination";
    drawPoints();
  }
  function resetBooking() {
    clearResults(); pendingKind = null; confirmed.pickup = false; confirmed.destination = false; locating = false; $("use-location").disabled = false; $("point-status").textContent = ""; $("address-status").textContent = "";
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
    for (const kind of ["pickup", "destination"]) {
      address(kind).addEventListener("input", () => {
        clearResults(); invalidate(); confirmed[kind] = false;
        if (kind === "pickup") pickup = null; else destination = null;
        if (pendingKind === kind) pendingKind = null;
        if (bookingMap) drawPoints();
      });
      $("search-" + kind).addEventListener("click", async () => {
        clearResults(); const current = searchGeneration, query = address(kind).value.trim();
        if (!$("map-consent").checked) { $("route-picker").open = true; return message("Autorize a busca de endereço e o mapa antes de buscar."); }
        if (query.length < 5) return message("Digite rua, número e cidade, com pelo menos cinco caracteres.");
        const button = $("search-" + kind); button.disabled = true; $("address-status").textContent = "Buscando endereço…";
        try {
          const result = await request("geocode", { query, consentExternalSearch: true, testOnly: true });
          if (current !== searchGeneration || !$("map-consent").checked) return;
          if (!Array.isArray(result.results)) throw new Error("Resposta de busca incompleta.");
          $("address-status").textContent = result.results.length ? "Escolha uma sugestão e confirme o ponto no mapa. Dados Photon · OpenStreetMap." : "Nenhum endereço encontrado. Inclua a cidade ou marque o ponto manualmente.";
          for (const item of result.results) {
            if (!local(item.point) || typeof item.label !== "string") continue;
            const option = document.createElement("button"); option.type = "button"; option.className = "secondary"; option.textContent = item.label;
            option.addEventListener("click", async () => {
              try {
                if (current !== searchGeneration || !await openBooking() || current !== searchGeneration) return;
                address(kind).value = item.label; $("point-kind").value = kind; choose(item.point); bookingMap.setView([item.point.lat, item.point.lng], 17);
                clearResults(); message("Endereço localizado. Confira e confirme o pino antes de calcular a rota.");
              } catch (error) { message(error.message); }
            }); $(kind + "-results").append(option);
          }
        } catch (error) { if (current === searchGeneration) { $("address-status").textContent = error.message; } }
        finally { button.disabled = false; }
      });
    }
    $("confirm-point").addEventListener("click", () => {
      if (!pendingKind) return message("Escolha primeiro um ponto ou uma sugestão.");
      confirmed[pendingKind] = true; $("point-status").textContent = (pendingKind === "pickup" ? "Embarque" : "Destino") + " confirmado.";
      if (pendingKind === "pickup") $("point-kind").value = "destination";
      pendingKind = null;
    });
    $("use-location").addEventListener("click", async () => {
      if (locating) return;
      if (!navigator.geolocation) return message("Localização indisponível neste navegador. Busque o endereço ou marque o mapa.");
      try { if (!await openBooking()) return; } catch (error) { return message(error.message); }
      locating = true; $("use-location").disabled = true; const current = generation;
      message("Aguardando a permissão e a localização do celular…");
      navigator.geolocation.getCurrentPosition(position => {
        if (current !== generation) return;
        locating = false; $("use-location").disabled = false;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude }, accuracy = position.coords.accuracy;
        if (!local(point)) return message("Sua localização está fora da região de testes. Informe um endereço na região.");
        if (!Number.isFinite(accuracy) || accuracy > 500) return message("Localização pouco precisa. Tente novamente ou marque o ponto manualmente.");
        $("point-kind").value = "pickup"; choose(point); bookingMap.setView([point.lat, point.lng], 17);
        if (!address("pickup").value.trim()) address("pickup").value = "Minha localização — conferir entrada";
        clearResults(); message("Localização aproximada, precisão de " + Math.ceil(accuracy) + " metros. Ajuste o pino para a entrada e confirme o ponto.");
      }, error => { if (current !== generation) return; locating = false; $("use-location").disabled = false; message(error.code === 1 ? "Permissão de localização negada. Você pode buscar o endereço ou marcar o mapa." : "Não foi possível obter a localização. Busque o endereço ou marque o mapa."); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
    $("open-map").addEventListener("click", async () => {
      if (!$("map-consent").checked) return message("Autorize o mapa e o envio dos pontos de teste para calcular o percurso.");
      $("open-map").disabled = true;
      try { await openBooking(); }
      catch (error) { message(error.message); }
      finally { $("open-map").disabled = false; }
    });
    $("pick-center").addEventListener("click", () => { if (bookingMap) choose(bookingMap.getCenter(), true); });
    $("remove-route").addEventListener("click", () => { resetBooking(); message("Pontos removidos. Você pode continuar apenas com os endereços digitados."); });
    $("map-consent").addEventListener("change", () => { if (!$("map-consent").checked) resetBooking(); });
    $("calculate-route").addEventListener("click", async () => {
      if (calculating) return;
      if (!pickup || !destination || !confirmed.pickup || !confirmed.destination || !$("map-consent").checked) return message("Confirme os pontos de embarque e destino no mapa antes de calcular.");
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
