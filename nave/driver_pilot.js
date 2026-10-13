"use strict";

// NAVE: distribuição EXCLUSIVAMENTE SIMULADA para piloto opt-in.
// Nunca chama motoristas aprovados para prestação de serviço nem inicia corridas comerciais.
const EIGHT = /^[0-9a-f]{8}$/i;
const TEST_CATEGORY = "confort";
const TEST_OFFER_MILLIS = 180000;
const WHATSAPP_TEST_WINDOW_MILLIS = 23 * 60 * 60 * 1000;

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
      .select("driver_id,phone_e164,test_enabled,verified_at,last_inbound_at")
      .eq("phone_e164", phone).maybeSingle();
    return dataOrThrow(r, "lookup");
  }
  async function handleDriverMessage(phone, contactId, message) {
    if (message.type !== "text") return null;
    const text = tidy(message.text?.body);
    if (!/^(ATIVAR PILOTO|PAUSAR PILOTO|STATUS PILOTO|ACEITAR(?:\s+[0-9A-F]{8})?|RECUSAR(?:\s+[0-9A-F]{8})?)$/.test(text)) return null;
    const channel = await findByPhone(phone);
    if (!channel) return null; // Só número pré-cadastrado como piloto.
    const now = new Date().toISOString();
    if (text === "ATIVAR PILOTO") {
      dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
        .update({ test_enabled: true, verified_at: now, last_inbound_at: now, updated_at: now })
        .eq("driver_id", channel.driver_id), "opt_in");
      dataOrThrow(await supabase.from("nave_wa_contacts")
        .update({ is_driver: true, updated_at: now }).eq("id", contactId), "set_driver_contact");
      return "⚡ *NAVE PILOTO — TESTES ATIVADOS*\n\nSeu WhatsApp está confirmado para receber ofertas SIMULADAS da categoria *NAVE Confort*.\n\n✅ Nenhum passageiro real será transportado.\n✅ Nenhuma cobrança será realizada.\n✅ Seu cadastro documental continua pendente.\n\nPara pausar, envie *PAUSAR PILOTO*.\nPara consultar, envie *STATUS PILOTO*.\n\nMantenha esta conversa ativa: mensagens de teste fora da janela do WhatsApp exigirão templates aprovados.";
    }
    if (text === "PAUSAR PILOTO") {
      dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
        .update({test_enabled:false,last_inbound_at:now,updated_at:now})
        .eq("driver_id",channel.driver_id), "pause");
      return "NAVE ⚡ Notificações de testes pausadas. Para reativar, envie *ATIVAR PILOTO*.";
    }
    // Outros comandos renovam a janela de atendimento se vierem do motorista.
    dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
      .update({last_inbound_at:now,updated_at:now}).eq("driver_id",channel.driver_id), "last_inbound");
    if (text === "STATUS PILOTO") {
      const d = dataOrThrow(await supabase.from("driver_profiles")
        .select("driver_code,status").eq("user_id",channel.driver_id).single(), "driver_status");
      return "⚡ *CENTRAL NAVE — PILOTO*\n\n" + d.driver_code +
        "\nStatus documental: " + (d.status==="pending" ? "PENDENTE" : d.status) +
        "\nOfertas SIMULADAS: " + (channel.test_enabled ? "ATIVADAS" : "PAUSADAS") +
        "\n\nPara mudar: *ATIVAR PILOTO* ou *PAUSAR PILOTO*.";
    }
    if (!channel.test_enabled || !channel.verified_at) return "NAVE ⚡ Primeiro envie *ATIVAR PILOTO* para confirmar o teste.";
    const [action, suffix] = text.split(/\s+/);
    if (!EIGHT.test(suffix || "")) return "NAVE ⚡ Envie o comando completo, por exemplo: *ACEITAR A1B2C3D4*, usando o código recebido na oferta.";
    const results = dataOrThrow(await supabase.from("nave_wa_driver_offers")
      .select("id,ride_request_id,expires_at,status")
      .eq("driver_id", channel.driver_id).eq("status","pending")
      .order("offered_at", { ascending:false }).limit(20), "offers");
    const offer=results.find(o=>o.id.slice(0,8).toUpperCase()===suffix);
    if (!offer) return "NAVE ⚡ Oferta de teste não encontrada ou já respondida.";
    if (Date.now() > new Date(offer.expires_at).getTime()) {
      await supabase.from("nave_wa_driver_offers").update({status:"expired",responded_at:now}).eq("id",offer.id).eq("status","pending");
      return "NAVE ⚡ Esta oferta de teste expirou. Aguarde outra simulação.";
    }
    const ride = dataOrThrow(await supabase.from("nave_wa_ride_requests")
      .select("id,status,quote_is_test_only,passenger_contact_id,category_code")
      .eq("id",offer.ride_request_id).single(), "request");
    if (ride.quote_is_test_only!==true || ride.category_code!==TEST_CATEGORY || ride.status!=="quoted") return "NAVE ⚡ Oferta indisponível. Nenhuma corrida real foi iniciada.";
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
      cancellation_free_until:new Date(acceptedAt.getTime()+2*60*1000).toISOString(),
      updated_at:now,
    }).eq("id",ride.id).eq("quote_is_test_only",true).eq("status","quoted"),"test_ride_accept");
    try {
      const passenger = dataOrThrow(await supabase.from("nave_wa_contacts")
        .select("phone_e164").eq("id",ride.passenger_contact_id).single(),"passenger");
      const digits=passenger.phone_e164.replace("+","");
      const msg="🧪 *NAVE — ACEITE SIMULADO*\n\nO piloto de teste *NAVE-0001* aceitou sua viagem fictícia na categoria Confort (Geely EX2 Pro).\n\nJanela de cancelamento ilustrativa: 2 minutos após o aceite.\n\n⚠️ Este é apenas um teste. Nenhum motorista está se deslocando e não há cobrança.\n\nVAI SAIR? VAI DE NAVE. ⚡";
      await sendWhatsAppMessage(digits,msg);
    } catch(e) { console.error("Pilot passenger demo notification failed:",e.message); }
    return "✅ *ACEITE DE TESTE REGISTRADO!*\n\nCódigo: " + suffix +
      "\nA NAVE tentou avisar o passageiro na conversa de teste.\n\n⚠️ Não se desloque: nenhuma corrida real foi criada e não há cobrança.";
  }
  async function onQuote(requestId, passengerContactId, categoryCode) {
    if (categoryCode!==TEST_CATEGORY) return;
    const drivers=dataOrThrow(await supabase.from("nave_wa_driver_test_channels")
      .select("driver_id,phone_e164,last_inbound_at").eq("test_enabled",true)
      .eq("is_test_only",true).not("verified_at","is",null).limit(5),"active_pilots");
    const passenger=dataOrThrow(await supabase.from("nave_wa_contacts")
      .select("phone_e164").eq("id",passengerContactId).single(),"passenger_contact");
    const ride=dataOrThrow(await supabase.from("nave_wa_ride_requests")
      .select("id,quote_is_test_only,status,category_code,pickup_label,destination_label,fare_quote_cents")
      .eq("id",requestId).single(),"ride_quote");
    if (ride.quote_is_test_only!==true || ride.status!=="quoted" || ride.category_code!==TEST_CATEGORY) return;
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
      const msg="🧪 *NAVE — OFERTA DE CORRIDA SIMULADA*\n\n"+
        "Piloto: "+profile.driver_code+"\nCategoria: NAVE Confort\n"+
        "📍 Embarque: "+ride.pickup_label+"\n🏁 Destino: "+ride.destination_label+
        "\n💰 Tarifa ILUSTRATIVA: "+brl(ride.fare_quote_cents)+
        "\n\nPara aceitar, responda:\n*ACEITAR "+suffix+"*\n"+
        "Para recusar:\n*RECUSAR "+suffix+"*\n"+
        "\nOferta de teste expira em 3 minutos.\n⚠️ NÃO SE DESLOQUE. Sem passageiro real nem cobrança.";
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
