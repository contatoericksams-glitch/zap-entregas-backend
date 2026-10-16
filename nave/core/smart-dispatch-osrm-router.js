"use strict";
// Staging-only admin+MFA. Fixed, synthetic coordinates; no real-driver GPS or ride data.
const express=require("express");
const {createDemoRouteComparison,validateScenario}=require("./smart-dispatch-osrm");
function createSmartDispatchOsrmRouter({requireMaster,compare=createDemoRouteComparison(),now=()=>Date.now()}={}){
 if(typeof requireMaster!=="function"||typeof compare!=="function")throw TypeError("Missing authorization or comparator");
 const router=express.Router(),last=new Map(),busy=new Set();
 let globalLast=0;
 router.post("/smart-dispatch-osrm",requireMaster,express.json({limit:"1kb"}),async(req,res)=>{
  res.set("Cache-Control","no-store");
  const id=req.masterUserId;
  if(typeof id!=="string"||!id)return res.sendStatus(403);
  try{validateScenario(req.body)}catch(_){return res.status(400).json({error:"invalid_simulation_or_consent"})}
  const instant=now();
  if(busy.has(id)||instant-(last.get(id)||0)<45000||
     instant-globalLast<15000)return res.status(429).json({error:"demo_cooldown"});
  if(last.size>100)last.clear();
  busy.add(id);last.set(id,instant);globalLast=instant;
  try{
   const data=await compare(req.body);
   return res.status(200).json(data);
  }catch(_){return res.status(503).json({
    error:"public_demo_route_unavailable",
    message:"OSRM indisponível; nenhuma previsão ou motorista foi inventado."
  })}
  finally{busy.delete(id)}
 });
 return router;
}
module.exports={createSmartDispatchOsrmRouter};
