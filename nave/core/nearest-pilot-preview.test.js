"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {previewNearestPilot,distanceMeters}=require("./nearest-pilot-preview");
const now=Date.parse("2026-10-15T21:00:00Z");
const pickup={lat:-24.73,lng:-53.74};
function driver(id,overrides={}){
 return {id,location:{lat:-24.731,lng:-53.741},positionUpdatedAt:new Date(now-5000).toISOString(),
  locationSource:"simulated",testOnly:true,testEnabled:true,online:true,verified:true,
  electricVehicle:true,activeOffer:false,categories:["eco","confort","executive","navegator"],...overrides};
}
const preview=(category,candidates,maxRadiusMeters)=>previewNearestPilot({
 simulation:true,pickup,category,candidates,...(maxRadiusMeters?{maxRadiusMeters}:{})
},now);
test("selects geographically closest fictional pilot",()=>{
 const a=preview("eco",[driver("DEMO-FAR",{location:{lat:-24.76,lng:-53.77}}),driver("DEMO-NEAR")]);
 assert.equal(a.selected.id,"DEMO-NEAR");
 assert.equal(a.eligibleCount,2);
 assert.equal(a.routeEtaAvailable,false);
 assert.equal(a.whatsappSendEnabled,false);
 assert.equal(a.commercialRidesEnabled,false);
});
test("all four electric categories supported",()=>{
 for(const c of ["eco","confort","executive","navegator"]){
  const a=preview(c,[driver("DEMO-ONE")]);
  assert.equal(a.selected.id,"DEMO-ONE");
  assert.equal(a.categoryCode,c);
 }
});
test("only candidates with compatible category participate",()=>{
 const a=preview("executive",[driver("DEMO-ECO",{categories:["eco"]}),driver("DEMO-EXEC")]);
 assert.equal(a.selected.id,"DEMO-EXEC");
});
test("excludes offline, unverified, commercial, disabled, and fossil vehicles",()=>{
 for(const flag of ["online","verified","testOnly","testEnabled","electricVehicle"]){
  const a=preview("eco",[driver("DEMO-UNSAFE",{[flag]:false})]);
  assert.equal(a.selected,null,flag);
 }
});
test("excludes stale, invalid and future GPS, or untrusted location source",()=>{
 for(const update of [{positionUpdatedAt:new Date(now-180001).toISOString()},
                     {positionUpdatedAt:new Date(now+30001).toISOString()},
                     {positionUpdatedAt:"broken"},
                     {location:{lat:120,lng:2}},
                     {locationSource:"whatsapp"}]){
  assert.equal(preview("eco",[driver("DEMO-ONE",update)]).selected,null);
 }
});
test("excludes driver with another pending offer",()=>{
 assert.equal(preview("confort",[driver("DEMO-BUSY",{activeOffer:true})]).selected,null);
});
test("radius filter refuses distant drivers",()=>{
 assert.equal(preview("eco",[driver("DEMO-FAR",{location:{lat:-25.1,lng:-53.6}})]).selected,null);
});
test("rejects real IDs, duplicates and oversized input",()=>{
 assert.throws(()=>preview("eco",[driver("NAVE-0001")]),TypeError);
 assert.throws(()=>preview("eco",[driver("DEMO-ONE"),driver("DEMO-ONE")]),TypeError);
 assert.throws(()=>preview("eco",Array.from({length:26},(_,i)=>driver("DEMO-"+i))),TypeError);
});
test("rejects missing explicit simulation and invalid pickup",()=>{
 assert.throws(()=>previewNearestPilot({pickup,category:"eco",candidates:[driver("DEMO-ONE")]},now),TypeError);
 assert.throws(()=>previewNearestPilot({simulation:true,pickup:{lat:"-24",lng:-53},category:"eco",candidates:[]},now),TypeError);
});
test("distance calculation is symmetric and zero for same point",()=>{
 const nearby={lat:-24.731,lng:-53.742};
 assert.equal(distanceMeters(pickup,pickup),0);
 assert.equal(distanceMeters(pickup,nearby),distanceMeters(nearby,pickup));
 assert.ok(distanceMeters(pickup,nearby)>100);
});
