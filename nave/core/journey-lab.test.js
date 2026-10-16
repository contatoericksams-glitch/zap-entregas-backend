"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express"),http=require("node:http");
const {simulateJourney}=require("./journey-lab");
const {createPreviewRouter}=require("./preview-router");
const now=Date.parse("2026-10-16T12:30:00Z");
function start(category="eco",scenario="normal"){return simulateJourney({action:"start",category,scenario},now)}
function next(d,action){return simulateJourney({action,state:d.state},now)}
test("end-to-end synthetic journey from passenger quote to full completion",()=>{
 for(const category of ["eco","confort","executive","navegator"]){
  let d=start(category);
  assert.equal(d.phase,"offer_pending");
  assert.equal(d.driverId,"DEMO-BETA");
  assert.match(d.offerPreview,/NÃO SE DESLOQUE/);
  assert.ok(d.fareCents>0);
  assert.equal(d.fareCents,d.driverGrossCents+d.commissionCents);
  for(const [action,phase] of [
   ["accept","driver_to_pickup"],["arrive","at_pickup"],
   ["board","in_trip"],["complete","completed"]
  ]){
   d=next(d,action);assert.equal(d.phase,phase);
   assert.equal(d.simulation,true);
   assert.equal(d.whatsappSendEnabled,false);
   assert.equal(d.persistenceEnabled,false);
   assert.equal(d.realGpsUsed,false);
   assert.equal(d.paymentsEnabled,false);
   assert.equal(d.commercialRidesEnabled,false);
  }
  assert.equal(d.offerPreview,null);
 }
});
test("refusal reoffers only to compatible eligible fictional pilot",()=>{
 let d=start("eco");
 d=next(d,"decline");assert.equal(d.phase,"offer_pending");
 assert.equal(d.driverId,"DEMO-ALFA");assert.deepEqual(d.state.declined,["DEMO-BETA"]);
 d=next(d,"decline");assert.equal(d.phase,"no_driver");assert.equal(d.driverId,null);
 assert.equal(d.etaToPickupSeconds,null);
});
test("executive has no compatible replacement after refusal",()=>{
 let d=start("executive");assert.equal(d.driverId,"DEMO-BETA");
 d=next(d,"decline");assert.equal(d.phase,"no_driver");
});
test("busy and no-route dispatch failures fail closed",()=>{
 assert.equal(start("eco","first_busy").driverId,"DEMO-ALFA");
 assert.equal(start("navegator","first_busy").phase,"no_driver");
 const d=start("eco","no_route");assert.equal(d.phase,"no_driver");
 assert.equal(d.driverId,null);assert.equal(d.offerPreview,null);
 assert.throws(()=>next(d,"accept"),TypeError);
});
test("simulated cancel allowed before boarding and forbidden thereafter",()=>{
 let d=start();
 d=next(d,"accept");d=next(d,"arrive");
 const c=next(d,"cancel");assert.equal(c.phase,"cancelled");
 assert.throws(()=>next(c,"accept"),TypeError);
 d=next(d,"board");assert.throws(()=>next(d,"cancel"),TypeError);
});
test("strict action order, real pilot IDs, and non-simulation payload are rejected",()=>{
 const d=start();
 for(const action of ["complete","board","arrive","fly"])
  assert.throws(()=>next(d,action),TypeError);
 assert.throws(()=>simulateJourney({action:"start",category:"eco",scenario:"normal",phone:"5545"},now),TypeError);
 assert.throws(()=>simulateJourney({action:"start",category:"eco",scenario:"normal",state:d.state},now),TypeError);
 assert.throws(()=>simulateJourney({action:"accept",state:{...d.state,driverId:"NAVE-0001"}},now),TypeError);
 assert.throws(()=>simulateJourney({action:"accept",state:{...d.state,step:9}},now),TypeError);
 assert.throws(()=>simulateJourney({action:"accept",state:{...d.state,categoryCode:"commercial"}},now),TypeError);
 assert.throws(()=>simulateJourney({action:"accept",state:{...d.state,phase:"completed"}},now),TypeError);
});
async function request(body){
 const app=express();app.use("/api/v5",createPreviewRouter());
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const r=await fetch("http://127.0.0.1:"+server.address().port+"/api/v5/journey-lab",{
   method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  return {status:r.status,headers:r.headers,data:await r.json()};
 }finally{await new Promise(resolve=>server.close(resolve))}
}
test("HTTP journey lab sequences work with no real dispatch",async()=>{
 let r=await request({action:"start",category:"confort",scenario:"normal"});
 assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"no-store");
 assert.equal(r.data.phase,"offer_pending");
 const a=await request({action:"accept",state:r.data.state});
 assert.equal(a.status,200);assert.equal(a.data.phase,"driver_to_pickup");
 assert.equal(a.data.whatsappSendEnabled,false);
 assert.equal((await request({action:"board",state:r.data.state})).status,400);
});
test("public lab only exposes fictional UI with no GPS, Supabase or Meta communication",()=>{
 const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
 const page=fs.readFileSync(path.join(__dirname,"../public/jornada-integrada.html"),"utf8");
 const match=page.match(/<script>([\s\S]*?)<\/script>/);assert.ok(match);
 assert.doesNotThrow(()=>new vm.Script(match[1]));
 assert.match(page,/todos os passageiros|Todos os passageiros/);
 assert.match(page,/\/api\/v5\/journey-lab/);
 assert.doesNotMatch(page,/meta\.facebook|navigator\.geolocation|service_role|supabase\.co/i);
});
