"use strict";

// NAVE: distribuição EXCLUSIVAMENTE SIMULADA para piloto opt-in.
// Nunca chama motoristas aprovados para prestação de serviço nem inicia corridas comerciais.
const EIGHT = /^[0-9a-f]{8}$/i;
const TEST_CATEGORIES = Object.freeze({
  eco: "NAVE Eco",
  confort: "NAVE Confort",
  executive: "NAVE Executive",
  navegator: "NAVEGATOR",
});
// Only fictitious offers. This does not certify a physical vehicle for all ride categories.
const TEST_OFFER_MILLIS = 180000;
const WHATSAPP_TEST_WINDOW_MILLIS = 23 * 60 * 60 * 1000;
const BUTTON_ONLINE = "nave_pilot_online_v1";
const BUTTON_OFFLINE = "nave_pilot_offline_v1";
const BUTTON_STATUS = "nave_pilot_status_v1";
function availabilityMenu(channel, preface="") {
  const state = channel.availability_state === "online" ? "🟢 ONLINE" : "⚪ OFFLINE";
  return {
    kind: "pilot_availability_menu",
    text: (preface ? preface + "\n\n" : "") +
      "⚡ *CENTRAL NAVE — PILOTO NAVE-0001*\n" +
      "Disponibilidade: *" + state + "*\n\n" +
      "Toque em uma opção abaixo para alterar seu status.\n" +
      "Somente testes fictícios: sem corridas comerciais nem deslocamentos.\n" +
      "Se os botões não aparecerem, digite *ONLINE*, *OFFLINE* ou *STATUS PILOTO*.",
    buttons: [
      { id: BUTTON_ONLINE, title: "Ficar online" },
      { id: BUTTON_OFFLINE, title: "Ficar offline" },
      { id: BUTTON_STATUS, title: "Meu status" },
    ],
  };
}

function tidy(value) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
function dataOrThrow(result, name) {
  if (result.error) throw new Error("Pilot " + name + ": " + (result.error.code || "database"));
  return result.data;
}
function brl(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
}
function createDriverPilot(supabase, sendWhatsAppMessage) {
  async function findByPhone(phone) {
    const r = await supabase.from("nave_wa_driver_test_channels")
      .select("driver_id,phone_e164,test_enabled,verified_at,last_inbound_at,availability_state")
      .eq("phone_e164", phone).maybeSingle();
    return dataOrThrow(r, "lookup");
  }
  async function handleDriverMessage(phone, contactId, message) {
    const buttonId = message.type === "interactive" && message.interactive?.type === "button_reply"
      ? message.interactive.button_reply?.id : null;
    // Os botões de oferta carregam o ID integral; o motorista não precisa copiar códigos.
    const offerButtonMatch = typeof buttonId === "string"
      ? /^(nave_offer_accept|nave_offer_decline):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(buttonId)
      : null;
    const text = buttonId === BUTTON_ONLINE ? "ONLINE"
      : buttonId === BUTTON_OFFLINE ? "OFFLINE"
      : buttonId === BUTTON_STATUS ? "STATUS PILOTO"
      : offerButtonMatch ? ((offerButtonMatch[1] === "nave_offer_accept" ? "ACEITAR " : "RECUSAR ") +
        offerButtonMatch[2].slice(0,8).toUpperCase())
      : message.type === "text" ? tidy(message.text?.body) : "";
    if (!/^(ATIVAR PILOTO|PAUSAR PILOTO|STATUS PILOTO|MENU PILOTO|ONLINE|OFFLINE|ACEITAR(?:\s+[0-9A-F]{8})?|RECUSAR(?:\s+[0-9A-F]{8})?)$/.test(text)) return null;
    const channel = await findByPhone(phone);
    if (!channel) return null; // Só número pré-cadastrado como piloto.
    const now = new Date().toISOString();
    if (text === "ATIVAR PILOTO") {
      dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
        .update({ test_enabled: true, verified_at: now, availability_state: "offline", availability_changed_at: now, last_inbound_at: now, updated_at: now })
        .eq("driver_id", channel.driver_id), "opt_in");
      dataOrThrow(await supabase.from("nave_wa_contacts")
        .update({ is_driver: true, updated_at: now }).eq("id", contactId), "set_driver_contact");
      return availabilityMenu({...channel, availability_state:"offline"}, 
        "✅ WhatsApp confirmado! Os testes foram ativados, mas você começa *OFFLINE* por segurança.");
    }
    if (text === "PAUSAR PILOTO") {
      dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
        .update({test_enabled:false,availability_state:"offline",availability_changed_at:now,last_inbound_at:now,updated_at:now})
        .eq("driver_id",channel.driver_id), "pause");
      return "NAVE ⚡ Notificações de testes pausadas. Para reativar, envie *ATIVAR PILOTO*.";
    }
    // Outros comandos renovam a janela de atendimento se vierem do motorista.
    dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
      .update({last_inbound_at:now,updated_at:now}).eq("driver_id",channel.driver_id), "last_inbound");
    if (text === "ONLINE" || text === "OFFLINE") {
      if (!channel.test_enabled || !channel.verified_at) {
        return "NAVE ⚡ Primeiro envie *ATIVAR PILOTO* para confirmar o número e habilitar os testes.";
      }
      const availability_state = text === "ONLINE" ? "online" : "offline";
      dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
        .update({availability_state,availability_changed_at:now,updated_at:now})
        .eq("driver_id",channel.driver_id).eq("test_enabled",true), "update_availability");
      if (availability_state === "offline") {
        dataOrThrow(await supabase.from("nave_wa_driver_offers")
          .update({status:"cancelled",responded_at:now})
          .eq("driver_id",channel.driver_id).eq("status","pending"), "cancel_pending_when_offline");
      }
      return availabilityMenu({...channel,availability_state},
        availability_state === "online"
          ? "✅ Você está *ONLINE* para ofertas *SIMULADAS* de Eco, Confort, Executive e NAVEGATOR."
          : "✅ Você está *OFFLINE*. Não receberá novas ofertas de teste.");
    }
    if (text === "STATUS PILOTO" || text === "MENU PILOTO") {
      const d = dataOrThrow(await supabase.from("driver_profiles")
        .select("driver_code,status").eq("user_id",channel.driver_id).single(), "driver_status");
      return availabilityMenu(channel, "Motorista: " + d.driver_code +
        "\nCadastro documental: " + (d.status === "pending" ? "PENDENTE" : d.status) +
        "\nPiloto de testes: " + (channel.test_enabled ? "ATIVO" : "PAUSADO"));
    }
    if (!channel.test_enabled || !channel.verified_at || channel.availability_state !== "online")
      return "NAVE ⚡ Você precisa estar *ONLINE* para aceitar uma oferta fictícia. Envie *STATUS PILOTO* para abrir os botões.";
    const [action, suffix] = text.split(/\s+/);
    if (!EIGHT.test(suffix || "")) return "NAVE ⚡ Envie o comando completo, por exemplo: *ACEITAR A1B2C3D4*, usando o código recebido na oferta.";
    const results = dataOrThrow(await supabase.from("nave_wa_driver_offers")
      .select("id,ride_request_id,expires_at,status")
      .eq("driver_id", channel.driver_id).eq("status","pending")
      .order("offered_at", { ascending:false }).limit(20), "offers");
    const offer=results.find(o=>offerButtonMatch
      ? o.id.toLowerCase()===offerButtonMatch[2].toLowerCase()
      : o.id.slice(0,8).toUpperCase()===suffix);
    if (!offer) return "NAVE ⚡ Oferta de teste não encontrada ou já respondida.";
    if (Date.now() > new Date(offer.expires_at).getTime()) {
      await supabase.from("nave_wa_driver_offers").update({status:"expired",responded_at:now}).eq("id",offer.id).eq("status","pending");
      return "NAVE ⚡ Esta oferta de teste expirou. Aguarde outra simulação.";
    }
    const ride = dataOrThrow(await supabase.from("nave_wa_ride_requests")
      .select("id,status,quote_is_test_only,passenger_contact_id,category_code")
      .eq("id",offer.ride_request_id).single(), "request");
    if (ride.quote_is_test_only!==true || !Object.hasOwn(TEST_CATEGORIES,ride.category_code) || ride.status!=="quoted") return "NAVE ⚡ Oferta indisponível. Nenhuma corrida real foi iniciada.";
    if (action==="RECUSAR") {
      dataOrThrow(await supabase.from("nave_wa_driver_offers")
        .update({status:"declined",responded_at:now})
        .eq("id",offer.id).eq("driver_id",channel.driver_id).eq("status","pending"),"decline");
      return "NAVE ⚡ Oferta *SIMULADA* recusada. Nenhuma corrida foi criada.";
    }
    if (action!=="ACEITAR") return null;
    const accepted = dataOrThrow(await supabase.from("nave_wa_driver_offers")
      .update({status:"accepted",responded_at:now})
      .eq("id",offer.id).eq("driver_id",channel.driver_id)
      .eq("status","pending").gt("expires_at",now).select("id"),"accept");
    if(!accepted || accepted.length!==1) return "NAVE ⚡ Oferta já respondida ou expirada.";
    const acceptedAt=new Date();
    dataOrThrow(await supabase.from("nave_wa_ride_requests").update({
      status:"accepted",accepted_driver_id:channel.driver_id,
      accepted_at:acceptedAt.toISOString(),
      cancellation_free_until:new Date(acceptedAt.getTime()+20*1000).toISOString(),
      updated_at:now,
    }).eq("id",ride.id).eq("quote_is_test_only",true).eq("status","quoted"),"test_ride_accept");
    let passengerNotified = false;
    try {
      const passenger = dataOrThrow(await supabase.from("nave_wa_contacts")
        .select("phone_e164").eq("id",ride.passenger_contact_id).single(),"passenger");
      const digits=passenger.phone_e164.replace("+","");
      // Dados reais do cadastro. Nada de inventar nota, foto ou corridas.
      const profile = dataOrThrow(await supabase.from("driver_profiles")
        .select("driver_code,created_at,status").eq("user_id",channel.driver_id).single(),"public_pilot_profile");
      const info = dataOrThrow(await supabase.from("user_profiles")
        .select("display_name").eq("user_id",channel.driver_id).maybeSingle(),"driver_display_name");
      const vehicles = dataOrThrow(await supabase.from("vehicles")
        .select("make,model,model_year,status,powertrain")
        .eq("driver_id",channel.driver_id).eq("powertrain","electric").limit(1),"driver_test_car");
      // Contagem apenas de corridas reais concluídas; simuladas não entram.
      const countResult = await supabase.from("rides")
        .select("id",{count:"exact",head:true})
        .eq("driver_id",channel.driver_id).eq("status","completed");
      dataOrThrow(countResult,"count_completed_rides");
      const publicName = info?.display_name?.trim()
        ? info.display_name.trim().slice(0,70) : "Motorista " + profile.driver_code;
      const car = vehicles?.[0];
      const carLabel = car ? car.make+" "+car.model+(car.model_year?" ("+car.model_year+")":"") : "Aguardando cadastro";
      const joined = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})
        : "a confirmar";
      const msg="🧪 *NAVE — ACEITE SIMULADO*\n\n" +
        "✅ O piloto aceitou a sua simulação.\n\n" +
        "👤 *Motorista:* " + publicName + "\n" +
        "🎖️ *Patente:* Piloto (nível inicial)\n" +
        "⭐ *Nota:* Ainda sem avaliações\n" +
        "🚗 *Corridas concluídas na NAVE:* " + (countResult.count ?? 0) + "\n" +
        "📅 *Cadastro desde:* " + joined + "\n" +
        "🚙 *Carro:* " + carLabel + "\n" +
        "📷 *Foto:* Ainda não cadastrada\n" +
        "🗂️ *Homologação:* Pendente; dados somente para testes\n\n" +
        "⏱️ *Cancelamento:* Envie CANCELAR. A tolerância de 20 segundos após o aceite " +
        "é uma regra planejada para corridas reais; nesta simulação não existe taxa.\n\n" +
        "⚠️ *NÃO É UMA CORRIDA REAL.* O piloto não está se deslocando e não haverá cobrança.\n\n" +
        "VAI SAIR? VAI DE NAVE. ⚡";
      await sendWhatsAppMessage(digits,msg);
      passengerNotified = true;
    } catch(e) { console.error("Pilot passenger demo notification failed:",e.message); }
    return "✅ *ACEITE SIMULADO REGISTRADO!*\n\n" +
      (passengerNotified
        ? "O passageiro recebeu a mensagem de teste: *Sua NAVE está a caminho!*"
        : "A confirmação do passageiro não pôde ser enviada. Nossa Central poderá verificar.") +
      "\n\n⚠️ NÃO SE DESLOQUE. Nenhuma corrida real foi criada e não há cobrança.";
  }
  async function onQuote(requestId, passengerContactId, categoryCode) {
    if (!Object.hasOwn(TEST_CATEGORIES,categoryCode)) return false;
    const drivers=dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
      .select("driver_id,phone_e164,last_inbound_at").eq("test_enabled",true)
      .eq("availability_state","online").eq("is_test_only",true).not("verified_at","is",null).limit(5),"active_pilots");
    const passenger=dataOrThrow(await supabase.from("nave_wa_contacts")
      .select("phone_e164").eq("id",passengerContactId).single(),"passenger_contact");
    const ride=dataOrThrow(await supabase.from("nave_wa_ride_requests")
      .select("id,quote_is_test_only,status,category_code,pickup_label,destination_label,fare_quote_cents")
      .eq("id",requestId).single(),"ride_quote");
    if (ride.quote_is_test_only!==true || ride.status!=="quoted" || ride.category_code!==categoryCode) return false;
    for(const driver of drivers) {
      if (driver.phone_e164===passenger.phone_e164) continue; // Não mandar a própria oferta.
      if (!driver.last_inbound_at || Date.now()-new Date(driver.last_inbound_at).getTime()>WHATSAPP_TEST_WINDOW_MILLIS) continue;
      const profile=dataOrThrow(await supabase.from("driver_profiles")
        .select("driver_code,status").eq("user_id",driver.driver_id).single(),"pilot_profile");
      // Piloto sem homologação: elegível SOMENTE a teste; não dispara serviço real.
      if(profile.driver_code!=="NAVE-0001") continue;
      const car=dataOrThrow(await supabase.from("vehicles")
        .select("make,model,powertrain").eq("driver_id",driver.driver_id)
        .eq("powertrain","electric").limit(1),"test_vehicle");
      if (!car?.length) continue;
      const offers=dataOrThrow(await supabase.from("nave_wa_driver_offers")
        .insert({
          ride_request_id:requestId,driver_id:driver.driver_id,status:"pending",
          expires_at:new Date(Date.now()+TEST_OFFER_MILLIS).toISOString(),
        }).select("id"),"create_offer");
      if (!offers || offers.length!==1) return;
      const offerId=offers[0].id;
      const suffix=offerId.slice(0,8).toUpperCase();
      const offerText="🧪 *NAVE — OFERTA DE CORRIDA SIMULADA*\n\n"+
        "Piloto: "+profile.driver_code+"\nCategoria: NAVE Confort\n"+
        "📍 Embarque: "+ride.pickup_label+"\n🏁 Destino: "+ride.destination_label+
        "\n💰 Tarifa ILUSTRATIVA: "+brl(ride.fare_quote_cents)+
        "\n\n*Toque em ACEITAR ou RECUSAR abaixo.*\n" +
        "Esta oferta expira em 3 minutos.\n" +
        "⚠️ NÃO SE DESLOQUE. Sem passageiro real nem cobrança.\n\n" +
        "Se os botões não aparecerem, envie:\n" +
        "*ACEITAR "+suffix+"* ou *RECUSAR "+suffix+"*.";
      const msg = {
        kind: "pilot_offer_card",
        text: offerText,
        buttons: [
          {id:"nave_offer_accept:"+offerId,title:"Aceitar corrida"},
          {id:"nave_offer_decline:"+offerId,title:"Recusar corrida"},
        ],
      };
      try {
        await sendWhatsAppMessage(driver.phone_e164.slice(1),msg);
        return true; // Única oferta de teste enviada ao piloto.
      } catch(e) {
        await supabase.from("nave_wa_driver_offers").update({status:"cancelled"})
          .eq("id",offerId).eq("status","pending");
        console.error("Pilot mock offer sending failed:",e.message);
        return false;
      }
    }
    return false;
  }
  return {handleDriverMessage,onQuote};
}
module.exports={createDriverPilot};
