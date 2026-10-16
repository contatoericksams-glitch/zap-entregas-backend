"use strict";
// MACRO-QA V5 P01/P02/P03 — deterministic, isolated, no network except local HTTP.
const test=require("node:test");
const assert=require("node:assert/strict");
const http=require("node:http");
const express=require("express");
const {simulateJourney}=require("./journey-lab");
const {previewTestQuote,commissionForFare,CATEGORY_CODES}=require("./ride-contract");
const {createPreviewRouter}=require("./preview-router");
const CATS=["eco","confort","executive","navegator"];
const SCENARIOS=["normal","first_busy","no_route"];
const AT=Date.parse("2026-10-16T12:30:00Z");
const BASE_FARES={eco:1300,confort:1543,executive:2549,navegator:2842};
let assertions=0;
const check=(condition,label)=>{assert.ok(condition,label);assertions++};
const start=(category,scenario)=>simulateJourney({action:"start",category,scenario},AT);
const apply=(d,action)=>simulateJourney({action,state:d.state},AT);
function safe(d){
 for(const [k,value] of Object.entries({
  simulation:true,testOnly:true,commercialRidesEnabled:false,persistenceEnabled:false,
  whatsappSendEnabled:false,paymentsEnabled:false,realGpsUsed:false,externalRoutingEnabled:false,
  routeSource:"synthetic-fixture"
 }))check(d[k]===value,k+" must fail closed");
 check(Number.isInteger(d.fareCents)&&d.fareCents>0,"positive illustrative fare");
 check(d.fareCents===d.commissionCents+d.driverGrossCents,"cent-level commission reconciliation");
 check(!JSON.stringify(d).includes("NAVE-0001"),"no real pilot identifier in lab");
 check(!JSON.stringify(d).includes("+554"),"no mobile phone in lab");
}
test("P01 — all 4 categories x 3 dispatch scenarios; no external side effects",()=>{
 check(CATEGORY_CODES.length===4,"exact four electric categories");
 for(const cat of CATS){
  for(const scenario of SCENARIOS){
   const d=start(cat,scenario);safe(d);
   check(d.categoryCode===cat,"normalized category");
   check(d.fareCents===BASE_FARES[cat],"fare formula regression");
   const driver=scenario==="normal"?"DEMO-BETA":
    scenario==="first_busy"&&["eco","confort"].includes(cat)?"DEMO-ALFA":null;
   check(d.driverId===driver,cat+" "+scenario+" eligible driver");
   check(d.phase===(driver?"offer_pending":"no_driver"),"safe initial phase");
   check(Boolean(d.offerPreview)===Boolean(driver),"offer visible only to candidate");
  }
 }
});
test("P02 — every possible complete journey, all categories and eligible scenarios",()=>{
 for(const cat of CATS){
  for(const scenario of ["normal","first_busy"]){
   let d=start(cat,scenario);
   if(d.phase==="no_driver")continue;
   for(const [action,expected] of [
    ["accept","driver_to_pickup"],["arrive","at_pickup"],["board","in_trip"],
    ["complete","completed"]
   ]){
    d=apply(d,action);safe(d);
    check(d.phase===expected,cat+" "+scenario+" "+action);
   }
   check(d.offerPreview===null,"no offer after terminal state");
   for(const action of ["accept","decline","arrive","board","complete","cancel"]){
    assert.throws(()=>apply(d,action),{name:"TypeError"});assertions++;
   }
  }
 }
});
test("P03 — bulk refusals, redistribution, cancellations and invalid phase barriers",()=>{
 for(const cat of CATS){
  let d=start(cat,"normal");safe(d);
  const first=d.driverId;
  d=apply(d,"decline");safe(d);
  if(["eco","confort"].includes(cat)){
   check(first==="DEMO-BETA"&&d.driverId==="DEMO-ALFA","eligible second pilot");
   check(d.phase==="offer_pending","refusal redistributes");
   d=apply(d,"decline");safe(d);
  }
  check(d.phase==="no_driver"&&d.driverId===null,"exhaustion closes flow");
  assert.throws(()=>apply(d,"accept"),{name:"TypeError"});assertions++;
  for(const phase of [0,1,2]){
   let x=start(cat,"normal");
   for(const action of ["accept","arrive"].slice(0,phase))x=apply(x,action);
   x=apply(x,"cancel");safe(x);check(x.phase==="cancelled","cancel before boarding");
   assert.throws(()=>apply(x,"accept"),{name:"TypeError"});assertions++;
  }
 }
 for(const bad of [null,{},[],{action:"start",category:"eco",scenario:"normal",phone:"123"},
   {action:"start",category:"commercial",scenario:"normal"},
   {action:"start",category:"eco",scenario:"online"},
   {action:"start",category:"eco",scenario:"normal",state:{}},
   {action:"accept",state:{version:1,phase:"in_trip"}},
   {action:"cancel",state:{}}]){
   assert.throws(()=>simulateJourney(bad,AT));assertions++;
 }
});
test("P04 — independent category price algebra, rounding, aliases and bounds",()=>{
 const rates={eco:[350,165,20],confort:[440,195,22],executive:[640,310,48],navegator:[720,340,55]};
 const lengths=[100,500,2004,2690,4300,10000,25000,500000];
 const durations=[15,60,280,720,1800,3600,86400];
 for(const c of CATS)for(const distanceMeters of lengths)for(const durationSeconds of durations){
  const [base,km,minute]=rates[c];
  const expected=Math.round(base+distanceMeters*km/1000+durationSeconds*minute/60);
  const q=previewTestQuote({category:c,distanceMeters,durationSeconds});
  check(q.fareCents===expected,"quote invariant "+c+" "+distanceMeters+" "+durationSeconds);
  check(q.commissionCents===Math.floor((expected*1500+5000)/10000),"commission 15% rounding");
  check(q.driverGrossCents+q.commissionCents===q.fareCents,"85/15 gross reconciliation");
  check(q.commercialRideEnabled===false&&q.quoteIsTestOnly===true,"noncommercial quote only");
 }
 check(previewTestQuote({category:"comfort",distanceMeters:4300,durationSeconds:720}).categoryCode==="confort","compat alias");
 check(previewTestQuote({category:"navigator",distanceMeters:4300,durationSeconds:720}).categoryCode==="navegator","compat alias");
 for(const price of [-1,1.5,Infinity,100000001]){
  assert.throws(()=>commissionForFare(price));assertions++;
 }
});
test("P05 — local HTTP macro smoke, 12 starts and complete flows in isolated server",async()=>{
 const app=express();app.use("/api/v5",createPreviewRouter());
 const server=http.createServer(app);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+server.address().port+"/api/v5/journey-lab";
 async function call(payload){
  const res=await fetch(base,{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify(payload)});
  const data=await res.json();
  check(res.headers.get("cache-control")==="no-store","no-store HTTP");
  return {status:res.status,data};
 }
 try{
  for(const category of CATS)for(const scenario of SCENARIOS){
   let r=await call({action:"start",category,scenario});
   check(r.status===200,"HTTP start 200");safe(r.data);
   if(r.data.phase==="no_driver")continue;
   for(const action of ["accept","arrive","board","complete"]){
    r=await call({action,state:r.data.state});
    check(r.status===200,"HTTP transition");safe(r.data);
   }
   check(r.data.phase==="completed","HTTP completed");
  }
  const invalid=await call({action:"start",category:"eco",scenario:"normal",phone:"real"});
  check(invalid.status===400,"unexpected fields rejected");
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test("MACRO-QA P01–P05 coverage summary",()=>{
 // The full suite emits genuine assertion failures; this is only a sentinel counter.
 check(assertions>=1200,"minimum checks exercised "+assertions);
});
