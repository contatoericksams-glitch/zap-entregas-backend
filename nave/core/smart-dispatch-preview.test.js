"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {rankSimulatedDrivers:rank}=require("./smart-dispatch-preview");
const now=Date.parse("2026-10-15T21:00:00.000Z");
const pickup={lat:-24.7300,lng:-53.7440};
const all=["eco","confort","executive","navegator"];
function make(id,overrides={}){
 return {id,testOnly:true,testEnabled:true,verified:true,electricVehicle:true,
 online:true,activeOffer:false,locationSource:"simulated",
 positionUpdatedAt:new Date(now-5000).toISOString(),
 categories:all,location:{lat:-24.731,lng:-53.743},
 mockRoadRoute:{roadDistanceMeters:450,etaSeconds:410},...overrides};
}
const run=(candidates,category="eco")=>rank({simulation:true,routeSource:"synthetic",pickup,category,candidates},now);
test("fastest road-ETA pilot can beat closest in straight line",()=>{
 const a=make("DEMO-NEAR",{location:{lat:-24.7303,lng:-53.7441},mockRoadRoute:{roadDistanceMeters:3100,etaSeconds:570}});
 const b=make("DEMO-FAST",{location:{lat:-24.738,lng:-53.748},mockRoadRoute:{roadDistanceMeters:1600,etaSeconds:290}});
 const data=run([a,b]);
 assert.ok(data.ranked[0].straightLineMeters>data.ranked[1].straightLineMeters);
 assert.equal(data.selected.driverId,"DEMO-FAST");
 assert.equal(data.selectionMethod,"lowest-mock-road-eta");
 assert.equal(data.trafficAware,false);
 assert.equal(data.realRoadRoutingEnabled,false);
 assert.equal(data.whatsappSendEnabled,false);
 assert.equal(data.commercialRidesEnabled,false);
 assert.equal(data.paymentsEnabled,false);
});
test("four category codes are supported only with matching eligibility",()=>{
 for(const code of all){
  const data=run([make("DEMO-PILOT",{categories:[code]})],code);
  assert.equal(data.selected.driverId,"DEMO-PILOT");
 }
 assert.equal(run([make("DEMO-ECO",{categories:["eco"]})],"navegator").selected,null);
});
test("online, verified, test only and electric are hard eligibility gates",()=>{
 for(const f of ["online","verified","testOnly","testEnabled","electricVehicle"]){
  const d=run([make("DEMO-A",{[f]:false})]);
  assert.equal(d.selected,null,f);
  assert.equal(d.eligibleCount,0);
 }
});
test("busy driver does not enter ranked list",()=>{
 assert.equal(run([make("DEMO-A",{activeOffer:true})]).excluded.busy,1);
});
test("expired or future GPS positions cannot be ranked",()=>{
 for(const stamp of [new Date(now-120001).toISOString(),new Date(now+30001).toISOString(),"invalid"]){
  assert.equal(run([make("DEMO-A",{positionUpdatedAt:stamp})]).excluded.staleGps,1);
 }
 assert.equal(run([make("DEMO-A",{locationSource:"gps-real"})]).eligibleCount,0);
});
test("no road ETA and invalid route evidence never fall back to straight line",()=>{
 const candidates=[make("DEMO-ONE",{mockRoadRoute:null}),make("DEMO-TWO",{mockRoadRoute:{roadDistanceMeters:4,etaSeconds:4}})];
 const data=run(candidates);
 assert.equal(data.selected,null);
 assert.equal(data.excluded.noRoadEta,2);
});
test("stable tie breaker prefers shorter road route, then straight distance, then ID",()=>{
 const same={mockRoadRoute:{roadDistanceMeters:1000,etaSeconds:200}};
 assert.equal(run([make("DEMO-Z",same),make("DEMO-A",same)]).selected.driverId,"DEMO-A");
 assert.equal(run([make("DEMO-Z",{mockRoadRoute:{roadDistanceMeters:700,etaSeconds:200}}),make("DEMO-A",same)]).selected.driverId,"DEMO-Z");
});
test("refuse real driver IDs, duplicates, >10 entries, missing opt-in or route source",()=>{
 assert.throws(()=>run([make("NAVE-0001")]),TypeError);
 assert.throws(()=>run([make("DEMO-ONE"),make("DEMO-ONE")]),TypeError);
 assert.throws(()=>run(Array.from({length:11},(_,i)=>make("DEMO-"+i))),TypeError);
 assert.throws(()=>rank({simulation:false,routeSource:"synthetic",category:"eco",pickup,candidates:[]},now),TypeError);
 assert.throws(()=>rank({simulation:true,routeSource:"osrm",category:"eco",pickup,candidates:[]},now),TypeError);
});
test("reject coordinates outside local region and invalid ETA values",()=>{
 assert.throws(()=>rank({simulation:true,routeSource:"synthetic",category:"eco",pickup:{lat:40,lng:-74},candidates:[]},now),TypeError);
 assert.equal(run([make("DEMO-A",{location:{lat:0,lng:0}})]).eligibleCount,0);
 const r=run([make("DEMO-A",{mockRoadRoute:{roadDistanceMeters:500,etaSeconds:NaN}})]);
 assert.equal(r.selected,null);
});
test("all flags remain noncommercial even with no driver available",()=>{
 const result=run([]);
 assert.equal(result.selected,null);
 assert.equal(result.offersCreated,0);
 assert.equal(result.persistenceEnabled,false);
 assert.equal(result.whatsappSendEnabled,false);
 assert.equal(result.commercialRidesEnabled,false);
});
