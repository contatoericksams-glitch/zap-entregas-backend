"use strict";
// V5 staging only. Uses user's MFA token for a BOOLEAN Supabase RPC; no service_role.
const express=require("express");
const {createClient}=require("@supabase/supabase-js");
const PHONE=/^\+[1-9][0-9]{7,14}$/;
function createRestrictedPilotRouter({requireMaster,url,publishableKey,pilotPhone,sendMessage,enabled=false,makeClient=createClient,now=()=>Date.now()}){
 if(typeof requireMaster!=="function"||!url||!publishableKey||typeof sendMessage!=="function")throw Error("Pilot sender configuration invalid");
 const router=express.Router();let lastSent=0;
 router.post("/pilot-notification-test",requireMaster,async(req,res)=>{
  res.set("Cache-Control","no-store");
  if(!enabled)return res.status(404).json({error:"test_disabled"});
  if(req.body?.confirm!=="SIMULACAO_SEM_DESLOCAMENTO")return res.status(400).json({error:"confirmation_required"});
  if(!PHONE.test(pilotPhone||""))return res.status(503).json({error:"test_pilot_not_configured"});
  if(now()-lastSent<300000)return res.status(429).json({error:"test_cooldown"});
  const token=(req.get("authorization")||"").replace(/^Bearer /,"");
  try{
   const db=makeClient(url,publishableKey,{
    global:{headers:{Authorization:"Bearer "+token}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
   });
   const {data,error}=await db.rpc("nave_v5_pilot_test_status");
   if(error)return res.sendStatus(503);
   if(data!==true)return res.status(409).json({error:"pilot_not_eligible"});
   lastSent=now();
   await sendMessage(pilotPhone.slice(1),
    "🧪 NAVE — TESTE DE NOTIFICAÇÃO DO APLICATIVO\n\n"+
    "Esta é uma simulação técnica de comunicação App → WhatsApp. "+
    "NÃO ACEITE CORRIDA, NÃO SE DESLOQUE. Nenhum passageiro foi chamado, "+
    "nenhuma viagem foi criada e não há cobrança.");
   return res.status(202).json({testOnly:true,sent:true,rideCreated:false});
  }catch(_){return res.status(503).json({error:"test_unavailable"});}
 });
 return router;
}
module.exports={createRestrictedPilotRouter};
