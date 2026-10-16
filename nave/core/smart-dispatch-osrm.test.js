"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateScenario,createDemoRouteComparison}=require("./smart-dispatch-osrm");
const request={simulation:true,consentExternalRouting:true,category:"eco",scenario:"all"};
test("one OSRM table response ranks fictitious drivers by actual mocked-provider ETA",async()=>{
 let count=0,originUrl;
 const cmp=createDemoRouteComparison({fetchImpl:async(url,opts)=>{
  count++;originUrl=new URL(url);
  assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");
  return {ok:true,json:async()=>({
   code:"Ok",durations:[[540],[250],[420]],distances:[[1600],[2200],[2500]]
  })};
 }});
 const r=await cmp(request);
 assert.equal(count,1);
 assert.equal(originUrl.hostname,"router.project-osrm.org");
 assert.match(originUrl.pathname,/^\/table\/v1\/driving\//);
 assert.equal(originUrl.searchParams.get("sources"),"0;1;2");
 assert.equal(originUrl.searchParams.get("destinations"),"3");
 assert.equal(originUrl.searchParams.get("annotations"),"duration,distance");
 assert.equal(r.selected.driverId,"DEMO-BETA");
 assert.equal(r.selected.etaSeconds,250);
 assert.equal(r.eligibleCount,3);
 assert.equal(r.routeSource,"osrm-public-table");
 assert.equal(r.realRoadRoutingEnabled,true);
 assert.equal(r.realGpsUsed,false);
 assert.equal(r.passengerDataUsed,false);
 assert.equal(r.whatsappSendEnabled,false);
 assert.equal(r.commercialRidesEnabled,false);
 assert.equal(r.persistenceEnabled,false);
 assert.equal(r.paymentsEnabled,false);
 assert.ok(r.ranked[0].straightLineMeters>r.ranked[1].straightLineMeters,"fastest need not be geographically closest");
});
test("busy or category-incompatible pilots never enter route provider query",async()=>{
 let called=0;
 const cmp=createDemoRouteComparison({fetchImpl:async url=>{
  called++;const u=new URL(url);assert.equal(u.searchParams.get("sources"),"0;1");
  assert.equal(u.searchParams.get("destinations"),"2");
  return {ok:true,json:async()=>({code:"Ok",durations:[[380],[410]],distances:[[1700],[2500]]})};
 }});
 const busy=await cmp({...request,scenario:"busy"});
 assert.equal(called,1);
 assert.equal(busy.ranked.some(d=>d.driverId==="DEMO-BETA"),false);
 assert.equal(busy.excluded.busy,1);
 const exec=await cmp({...request,category:"executive"});
 assert.equal(called,2);
 assert.equal(exec.ranked.some(d=>d.driverId==="DEMO-ALFA"),false);
 assert.equal(exec.excluded.incompatible,1);
});
test("unavailable scenario does not call OSRM or invent a time",async()=>{
 let calls=0;
 const cmp=createDemoRouteComparison({fetchImpl:async()=>{calls++;throw Error("must not call")}});
 const r=await cmp({...request,scenario:"unavailable"});
 assert.equal(calls,0);
 assert.equal(r.selected,null);
 assert.equal(r.providerQueried,false);
 assert.equal(r.whatsappSendEnabled,false);
});
test("strict validation prevents unwanted coordinate and URL injection",()=>{
 for(const r of [
  {...request,consentExternalRouting:false},
  {...request,simulation:false},
  {...request,scenario:"commercial"},
  {...request,category:"private"},
  {...request,origin:{lat:-24,lng:-53}},
  {...request,host:"https://example.com"},
  {...request,consentExternalRouting:"true"},
  {...request,routeSource:"osrm"}
 ])assert.throws(()=>validateScenario(r),TypeError);
});
test("invalid OSRM matrix fails closed, no invented travel estimates",async()=>{
 for(const response of [
  {code:"NoTable"},
  {code:"Ok",durations:[[150]],distances:[[600]]},
  {code:"Ok",durations:[[200],[250],[300]],distances:[[700],[800],[900]],fallback_speed_cells:[[1,0]]},
  {code:"Ok",durations:[[200,100],[250],[300]],distances:[[700],[800],[900]]}
 ]){
  const cmp=createDemoRouteComparison({fetchImpl:async()=>({ok:true,json:async()=>response})});
  await assert.rejects(cmp(request),/osrm_table_unavailable/);
 }
});
test("OSRM missing route for one pilot is excluded, others remain eligible",async()=>{
 const cmp=createDemoRouteComparison({fetchImpl:async()=>({ok:true,json:async()=>({
  code:"Ok",durations:[[440],[null],[280]],distances:[[1900],[null],[1600]]
 })})});
 const result=await cmp(request);
 assert.equal(result.selected.driverId,"DEMO-GAMA");
 assert.equal(result.eligibleCount,2);
 assert.equal(result.excluded.noRoadEta,1);
});
test("provider failure makes no fabricated ETA",async()=>{
 const cmp=createDemoRouteComparison({fetchImpl:async()=>{throw Error("timeout")}});
 await assert.rejects(cmp(request),/osrm_table_unavailable/);
});
