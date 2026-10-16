"use strict";
// Staging-only route ETA endpoint. Requires real Supabase admin account + AAL2 MFA.
// Request body is not logged, saved, attached to a trip or sent to Meta.
const express=require("express");
const {createRoadEtaPreview}=require("./road-eta-preview");
function createRoadEtaRouter({requireMaster,routePreview=createRoadEtaPreview(),now=()=>Date.now()}={}){
 if(typeof requireMaster!=="function"||typeof routePreview!=="function")throw TypeError("Missing secure routing dependencies");
 const router=express.Router();
 const lastByUser=new Map(),busy=new Set();
 router.post("/road-eta-preview",requireMaster,express.json({limit:"2kb"}),async(req,res)=>{
  res.set("Cache-Control","no-store");
  const user=req.masterUserId;
  if(!user || typeof user!=="string")return res.sendStatus(403);
  if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))
   return res.status(400).json({error:"invalid_simulation"});
  // Reject bad or non-consented requests before rate limits and any outbound call.
  const {validateRoadRequest}=require("./road-eta-preview");
  try{validateRoadRequest(req.body)}
  catch(e){return res.status(400).json({error:"invalid_route_or_consent"});}
  if(busy.has(user) || now()-(lastByUser.get(user)||0)<12000)
   return res.status(429).json({error:"routing_cooldown"});
  busy.add(user);lastByUser.set(user,now());
  try{
   const route=await routePreview(req.body);
   return res.status(200).json(route);
  }catch(_){return res.status(503).json({error:"route_temporarily_unavailable",fallback:"straight_line_only"});}
  finally{busy.delete(user);}
 });
 return router;
}
module.exports={createRoadEtaRouter};
