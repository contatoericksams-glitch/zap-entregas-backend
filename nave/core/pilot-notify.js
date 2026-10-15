"use strict";
// Explicitly opt-in WhatsApp TEST notification route. No ride/offer creation.
// Guard MUST be server-verified admin + MFA; only one allowlisted pilot.
const express = require("express");
function createPilotNotificationRouter({ requireMaster, db, sendMessage, enabled = false, now = () => Date.now() }) {
  if (typeof requireMaster !== "function" || !db || typeof sendMessage !== "function")
    throw new TypeError("Missing security dependencies");
  const router = express.Router();
  let lastSent = 0;
  router.post("/pilot-notification-test", express.json({limit:"2kb"}), requireMaster, async (req,res) => {
    if (!enabled) return res.status(404).json({error:"test_disabled"});
    if (req.body?.confirm !== "SIMULACAO_SEM_DESLOCAMENTO") return res.status(400).json({error:"confirmation_required"});
    if (now()-lastSent < 300000) return res.status(429).json({error:"test_cooldown"});
    try {
      const {data:channels,error} = await db.from("nave_wa_driver_test_channels")
        .select("driver_id,phone_e164,test_enabled,verified_at,last_inbound_at,availability_state,is_test_only")
        .eq("test_enabled",true).eq("availability_state","online")
        .eq("is_test_only",true).not("verified_at","is",null).limit(5);
      if(error) return res.sendStatus(503);
      let eligible = [];
      for (const p of channels || []) {
        if (!p.last_inbound_at || now()-new Date(p.last_inbound_at).getTime() > 23*3600000) continue;
        const {data:profile,error:profileError}=await db.from("driver_profiles")
          .select("driver_code").eq("user_id",p.driver_id).single();
        if(profileError) return res.sendStatus(503);
        if(profile?.driver_code === "NAVE-0001" && /^\+[1-9][0-9]{7,14}$/.test(p.phone_e164)) eligible.push(p);
      }
      if(eligible.length !== 1) return res.status(409).json({error:"eligible_pilot_not_unique_or_offline"});
      // Reserve local cooldown before outbound call. Process restarts require independent rate limiting.
      lastSent = now();
      await sendMessage(eligible[0].phone_e164.slice(1),
        "🧪 NAVE — TESTE DE NOTIFICAÇÃO DO APLICATIVO\n\n" +
        "Esta é uma simulação técnica de comunicação App → WhatsApp. " +
        "NÃO ACEITE CORRIDA, NÃO SE DESLOQUE. Nenhum passageiro foi chamado, " +
        "nenhuma viagem foi criada e não há cobrança.");
      return res.status(202).json({testOnly:true,sent:true,rideCreated:false});
    } catch (_) { return res.status(503).json({error:"test_unavailable"}); }
  });
  return router;
}
module.exports={createPilotNotificationRouter};
