"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),http=require("node:http"),express=require("express");
const {createPreviewRouter}=require("./preview-router");
const fixture={simulation:true,category:"eco",pickup:{lat:-24.73,lng:-53.74},candidates:[{
 id:"DEMO-ONE",location:{lat:-24.731,lng:-53.741},positionUpdatedAt:new Date().toISOString(),
 locationSource:"simulated",testOnly:true,testEnabled:true,online:true,verified:true,
 electricVehicle:true,categories:["eco","confort","executive","navegator"],activeOffer:false
}]};
async function request(body){
 const app=express();app.use("/api/v5",createPreviewRouter());
 const server=http.createServer(app);
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{
  const r=await fetch("http://127.0.0.1:"+server.address().port+"/api/v5/nearest-pilot-preview",
   {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  return {code:r.status,headers:r.headers,body:await r.json()};
 }finally{await new Promise(ok=>server.close(ok));}
}
test("synthetic API picks closest without dispatch",async()=>{
 const r=await request(fixture);
 assert.equal(r.code,200);
 assert.equal(r.body.selected.id,"DEMO-ONE");
 assert.equal(r.body.whatsappSendEnabled,false);
 assert.equal(r.body.liveGpsEnabled,false);
 assert.equal(r.body.commercialRidesEnabled,false);
 assert.equal(r.headers.get("cache-control"),"no-store");
});
test("API refuses non-synthetic IDs and non-simulation requests",async()=>{
 const real=structuredClone(fixture);
 real.candidates[0].id="NAVE-0001";
 assert.equal((await request(real)).code,400);
 const commercial=structuredClone(fixture);
 commercial.simulation=false;
 assert.equal((await request(commercial)).code,400);
});
