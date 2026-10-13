"use strict";

// Fluxo de testes; nenhum despacho nem cobrança é possível neste módulo.
const categoryRates = Object.freeze({
  eco: { base: 3.5, km: 1.65, min: 0.2 },
  confort: { base: 4.4, km: 1.95, min: 0.22 },
  executive: { base: 6.4, km: 3.1, min: 0.48 },
  navegator: { base: 7.2, km: 3.4, min: 0.55 },
});
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const geoCache = new Map();
let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;
const locks = new Map();
const welcome = "Olá! ⚡ Bem-vindo à NAVE. VAI SAIR? VAI DE NAVE.\n\nEstamos em TESTES, sem corridas reais.\nResponda *1* para simular uma corrida 100% elétrica.\nDigite *PARAR* para não receber comunicados.";

function clean(text) {
  return String(text || "").trim().slice(0, 300);
}
function simple(text) {
  return clean(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function errorCheck(result, action) {
  if (result.error) throw new Error(action + ": " + (result.error.code || "database"));
  return result.data;
}
function locationFrom(message) {
  if (message.type !== "location") return null;
  const lat = Number(message.location?.latitude);
  const lng = Number(message.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng, label: "Localização enviada pelo WhatsApp" };
}
function insideTestArea(lat, lng) {
  return lat >= -26.5 && lat <= -24.4 && lng >= -55.7 && lng <= -52.4;
}
async function getJson(url, headers, ms) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!response.ok) throw new Error("External route provider unavailable: " + response.status);
  return response.json();
}
function lookupAddress(input) {
  const key = simple(input);
  if (!key || key.length < 5) return Promise.resolve(null);
  if (geoCache.has(key)) return Promise.resolve(geoCache.get(key));
  const task = geocodeQueue.catch(() => {}).then(async () => {
    const delay = Math.max(0, lastGeocodeAt + 1150 - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastGeocodeAt = Date.now();
    const q = /(?:parana|paraná|brasil|brazil|\bpr\b)/i.test(input) ? input : input + ", Paraná, Brasil";
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("viewbox", "-55.7,-24.4,-52.4,-26.5");
    url.searchParams.set("bounded", "1");
    const results = await getJson(url.toString(), {
      "User-Agent": "NAVE-WhatsApp-Pilot/1.1 (contact: contato.ericksams@gmail.com)",
      "Accept-Language": "pt-BR",
    }, 6500);
    const first = results?.[0];
    if (!first) return null;
    const lat = Number(first.lat), lng = Number(first.lon);
    if (!insideTestArea(lat, lng)) return null;
    const point = { lat, lng, label: clean(input) };
    if (geoCache.size > 100) geoCache.clear();
    geoCache.set(key, point);
    return point;
  });
  geocodeQueue = task.catch(() => {});
  return task;
}
async function pointFor(message) {
  const loc = locationFrom(message);
  if (loc) return loc;
  if (message.type !== "text") return null;
  const label = clean(message.text?.body);
  if (label.length < 5) return null;
  return lookupAddress(label);
}
async function getRoute(a, b) {
  const url = "https://router.project-osrm.org/route/v1/driving/" +
    a.lng + "," + a.lat + ";" + b.lng + "," + b.lat +
    "?overview=false&steps=false";
  const route = await getJson(url, { "User-Agent": "NAVE-WhatsApp-Pilot/1.1" }, 8000);
  const first = route?.routes?.[0];
  if (route.code !== "Ok" || !first || !Number.isFinite(first.distance) || !Number.isFinite(first.duration)) {
    throw new Error("No OSRM route");
  }
  const distance = Math.round(first.distance);
  const duration = Math.round(first.duration);
  if (distance < 100 || distance > 500000 || duration < 15 || duration > 86400) throw new Error("Route out of test range");
  return { distance, duration };
}
function estimate(category, route) {
  const rate = categoryRates[category];
  if (!rate) return null;
  const km = route.distance / 1000;
  const mins = route.duration / 60;
  return Math.round(100 * (rate.base + km * rate.km + mins * rate.min));
}
function categoryCode(text) {
  const s = simple(text);
  if (s === "1" || s === "eco" || s === "nave eco") return "eco";
  if (s === "2" || s === "confort" || s === "nave confort") return "confort";
  if (s === "3" || s === "executive" || s === "nave executive") return "executive";
  if (s === "4" || s === "navegator") return "navegator";
  return null;
}
function createPassengerFlow(supabase, onTestQuote) {
  async function updateState(contactId, step, requestId) {
    errorCheck(await supabase.from("nave_wa_conversation_states").upsert({
      contact_id: contactId, request_id: requestId || null, step,
      updated_at: new Date().toISOString(),
    }, { onConflict: "contact_id" }), "save_flow");
  }
  async function getState(contactId) {
    const r = await supabase.from("nave_wa_conversation_states")
      .select("step,request_id,updated_at").eq("contact_id", contactId).maybeSingle();
    errorCheck(r, "load_flow");
    return r.data;
  }
  async function reset(contactId, state, reason) {
    if (state?.request_id) {
      errorCheck(await supabase.from("nave_wa_ride_requests")
        .update({ status: "cancelled", cancellation_reason: reason, updated_at: new Date().toISOString() })
        .eq("id", state.request_id).eq("status", "draft"), "cancel_test_request");
    }
    await updateState(contactId, "idle", null);
  }
  async function start(contactId, state) {
    if (state?.step && state.step !== "idle") await reset(contactId, state, "Reinício do teste pelo passageiro");
    const record = errorCheck(await supabase.from("nave_wa_ride_requests")
      .insert({ passenger_contact_id: contactId, status: "draft", quote_is_test_only: true })
      .select("id").single(), "create_test_request");
    await updateState(contactId, "awaiting_pickup", record.id);
    return "NAVE ⚡ Vamos simular sua corrida!\n\n*1/3 — Embarque*\nEnvie sua *localização pelo WhatsApp* (clipe 📎 → Localização) ou digite o endereço completo com cidade.\n\nÁrea de teste: Oeste do Paraná.\nDigite *CANCELAR* a qualquer momento.";
  }
  async function loadRequest(state, contactId) {
    if (!state?.request_id) return null;
    const r = await supabase.from("nave_wa_ride_requests").select("*")
      .eq("id", state.request_id).eq("passenger_contact_id", contactId).eq("status", "draft").maybeSingle();
    errorCheck(r, "get_request");
    return r.data;
  }
  async function handle(contactId, message) {
    const text = message.type === "text" ? clean(message.text?.body) : "";
    const cmd = simple(text);
    let state = await getState(contactId);
    if (state?.updated_at && Date.now() - new Date(state.updated_at).getTime() > 24 * 3600000) {
      await reset(contactId, state, "Teste expirado após 24 horas");
      state = null;
    }
    if (cmd === "parar" || cmd === "sair") {
      await reset(contactId, state, "Opt-out da conversa");
      errorCheck(await supabase.from("nave_wa_contacts").update({ outbound_opt_in_at: null }).eq("id", contactId), "opt_out");
      return "NAVE ⚡ Entendido. Não enviaremos mensagens promocionais. Para conversar novamente, envie OI.";
    }
    if (cmd === "cancelar" || cmd === "menu" || cmd === "reiniciar") {
      if (cmd === "cancelar") {
        // Permitir cancelamento da simulação mesmo depois da etapa de escolha,
        // quando o estado da conversa já voltou para idle.
        const last = await supabase.from("nave_wa_ride_requests")
          .select("id,status,accepted_at,cancellation_free_until")
          .eq("passenger_contact_id",contactId)
          .eq("quote_is_test_only",true)
          .in("status",["quoted","accepted"])
          .order("created_at",{ascending:false}).limit(1);
        errorCheck(last,"lookup_last_test_ride");
        const request=last.data?.[0];
        if(request){
          const cancellation = await supabase.from("nave_wa_ride_requests")
            .update({
              status:"cancelled",
              cancellation_reason:"Cancelada pelo passageiro em ambiente de testes",
              updated_at:new Date().toISOString(),
            })
            .eq("id",request.id).eq("passenger_contact_id",contactId)
            .in("status",["quoted","accepted"])
            .eq("quote_is_test_only",true).select("id");
          errorCheck(cancellation,"cancel_test_ride");
          if(cancellation.data?.length){
            errorCheck(await supabase.from("nave_wa_driver_offers")
              .update({status:"cancelled",responded_at:new Date().toISOString()})
              .eq("ride_request_id",request.id).eq("status","pending"),"cancel_pending_test_offers");
            await reset(contactId,state,"Cancelamento de teste");
            const withinWindow=request.accepted_at && request.cancellation_free_until &&
              Date.now() <= new Date(request.cancellation_free_until).getTime();
            return "✅ *Simulação cancelada!*\n\n" +
              (withinWindow ? "Cancelamento dentro da tolerância de *20 segundos*.\n" : "") +
              "Nenhuma corrida comercial existiu, ninguém precisa se deslocar e *não há cobrança*.\n\n" +
              "Envie *1* para simular outra viagem.";
          }
        }
      }
      await reset(contactId, state, "Cancelamento voluntário do teste");
      return "NAVE ⚡ Teste encerrado sem cobrança e sem chamar motorista.\n\nEnvie *1* para começar outro teste.";
    }
    if ((!state || state.step === "idle") && (cmd === "1" || cmd === "corrida" || cmd.includes("quero uma corrida") || cmd === "solicitar corrida")) {
      return start(contactId, state);
    }
    if (state?.step === "awaiting_pickup" || state?.step === "awaiting_destination") {
      const req = await loadRequest(state, contactId);
      if (!req) {
        await updateState(contactId, "idle", null);
        return "NAVE ⚡ Sua simulação expirou. Envie *1* para começar novamente.";
      }
      let point;
      try { point = await pointFor(message); }
      catch (_) { return "NAVE ⚡ O serviço de endereços está temporariamente indisponível. Tente novamente mais tarde ou envie *CANCELAR*."; }
      if (!point || !insideTestArea(point.lat, point.lng)) {
        return "NAVE ⚡ Não consegui identificar esse local no Oeste do Paraná. Envie a localização pelo WhatsApp ou um endereço mais completo, incluindo a cidade.";
      }
      if (state.step === "awaiting_pickup") {
        errorCheck(await supabase.from("nave_wa_ride_requests").update({
          pickup_label: point.label, pickup_lat: point.lat, pickup_lng: point.lng,
          updated_at: new Date().toISOString(),
        }).eq("id", req.id), "save_pickup");
        await updateState(contactId, "awaiting_destination", req.id);
        return "📍 Embarque anotado: " + point.label + "\n\n*2/3 — Destino*\nAgora envie a localização do destino ou digite o endereço com a cidade.\n\n*TESTE*, sem corrida real.";
      }
      if (!req.pickup_lat || !req.pickup_lng) {
        await updateState(contactId, "awaiting_pickup", req.id);
        return "NAVE ⚡ Precisamos confirmar seu embarque. Envie a localização ou o endereço completo.";
      }
      let route;
      try {
        route = await getRoute({ lat: Number(req.pickup_lat), lng: Number(req.pickup_lng) }, point);
      } catch (_) {
        return "NAVE ⚡ Encontrei o destino, mas o cálculo da rota de demonstração está indisponível. Tente novamente ou digite *CANCELAR*. Nenhuma corrida foi solicitada.";
      }
      errorCheck(await supabase.from("nave_wa_ride_requests").update({
        destination_label: point.label, destination_lat: point.lat, destination_lng: point.lng,
        route_distance_m: route.distance, route_duration_s: route.duration,
        updated_at: new Date().toISOString(),
      }).eq("id", req.id), "save_route");
      await updateState(contactId, "awaiting_category", req.id);
      const c = errorCheck(await supabase.from("nave_ride_categories")
        .select("code,title,electric_only,booking_enabled").eq("electric_only",true)
        .eq("visible_in_preview", true).order("display_order"), "get_categories");
      const rows = (c || []).filter(x => categoryRates[x.code] && x.booking_enabled === false);
      if (rows.length !== 4) return "NAVE ⚡ Catálogo de categorias indisponível temporariamente. Digite CANCELAR e tente novamente.";
      const prices = rows.map((cat, i) =>
        String(i + 1) + " — " + cat.title + ": *" + brl.format(estimate(cat.code,route)/100) + "*"
      ).join("\n");
      return "⚡ *NAVE — SIMULAÇÃO DE TARIFA*\n\n📍 Embarque: " + req.pickup_label +
        "\n🏁 Destino: " + point.label +
        "\n📏 " + (route.distance/1000).toFixed(1).replace(".",",") + " km · ⏱️ " +
        Math.max(1,Math.round(route.duration/60)) + " min (sem trânsito)\n\n" +
        prices + "\n\n*3/3 — Responda 1, 2, 3 ou 4* para escolher sua categoria.\n\n" +
        "⚠️ Valores apenas ilustrativos. Nenhum motorista será chamado nem haverá cobrança.";
    }
    if (state?.step === "awaiting_category") {
      const req = await loadRequest(state, contactId);
      if (!req || !req.route_distance_m || !req.route_duration_s) {
        await updateState(contactId, "idle", null);
        return "NAVE ⚡ Sua simulação expirou. Envie *1* para recomeçar.";
      }
      const chosen = categoryCode(text);
      if (!chosen) return "NAVE ⚡ Escolha uma categoria enviando *1* Eco, *2* Confort, *3* Executive ou *4* NAVEGATOR. Para encerrar, envie CANCELAR.";
      const category = errorCheck(await supabase.from("nave_ride_categories")
        .select("title,electric_only,booking_enabled").eq("code", chosen).single(),"category");
      if (!category.electric_only || category.booking_enabled) return "NAVE ⚡ Categoria temporariamente indisponível para demonstração.";
      const cents = estimate(chosen,{distance:req.route_distance_m,duration:req.route_duration_s});
      errorCheck(await supabase.from("nave_wa_ride_requests").update({
        category_code: chosen, fare_quote_cents:cents, status:"quoted", quote_is_test_only:true,
        updated_at: new Date().toISOString(),
      }).eq("id",req.id).eq("status","draft"),"save_quote");
      await updateState(contactId, "idle", null);
      let simulatedOfferSent = false;
      if (typeof onTestQuote === "function" && chosen === "confort") {
        try {
          simulatedOfferSent = await onTestQuote(req.id, contactId, chosen);
        } catch (err) {
          console.error("Pilot demonstration offer skipped:", err.message);
        }
      }
      return "✅ *Demonstração concluída!*\n\nCategoria: *" + category.title +
        "*\nPreço ilustrativo: *" + brl.format(cents/100) +
        "*\n\n⚠️ " + (simulatedOfferSent
          ? "Uma oferta FICTÍCIA foi enviada ao piloto de teste. Ninguém deve se deslocar. Não há cobrança."
          : "Nenhuma corrida REAL foi solicitada, nenhum motorista foi acionado e não há cobrança.") +
        "\n\nVAI SAIR? VAI DE NAVE. ⚡\nEnvie *1* para simular outra viagem.";
    }
    if (message.type === "location") return "NAVE ⚡ Recebi uma localização. Para iniciar uma simulação de corrida, envie *1*.";
    return welcome;
  }
  return function handleOne(contactId, message) {
    // Serializa mensagens do mesmo remetente nesta instância do Node.
    const previous = locks.get(contactId) || Promise.resolve();
    const task = previous.catch(()=>{}).then(() => handle(contactId,message));
    locks.set(contactId,task);
    task.finally(() => { if(locks.get(contactId)===task)locks.delete(contactId); }).catch(()=>{});
    return task;
  };
}
module.exports = { createPassengerFlow };
