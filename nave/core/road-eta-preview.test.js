"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createRoadEtaPreview,validateRoadRequest}=require("./road-eta-preview");
const request={simulation:true,consentExternalRouting:true,category:"eco",
 origin:{lat:-24.73,lng:-53.74},pickup:{lat:-24.748,lng:-53.745}};
test("two real-world-coordinate-shaped points yield synthetic mock road distance and ETA",async()=>{
 let called=0;
 const fn=createRoadEtaPreview({fetchImpl:async(url,options)=>{
  called++;
  assert.ok(url.startsWith("https://router.project-osrm.org/route/v1/driving/"));
  assert.match(url,/overview=false/);assert.match(url,/steps=false/);
  assert.equal(options.redirect,"error");assert.equal(options.method,"GET");
  return {ok:true,json:async()=>({code:"Ok",routes:[{distance:3085.56,duration:497.5}]})};
 }});
 const data=await fn(request);
 assert.equal(called,1);
 assert.equal(data.roadDistanceMeters,3086);
 assert.equal(data.etaSeconds,498);
 assert.equal(data.trafficAware,false);
 assert.equal(data.persistenceEnabled,false);
 assert.equal(data.commercialRidesEnabled,false);
 assert.equal(data.whatsappSendEnabled,false);
 assert.equal(data.externalRoutingConsent,true);
 assert.equal(data.routeProvider,"OSRM public demonstration server");
 assert.ok(data.straightLineMeters>=1900&&data.straightLineMeters<=2200);
 assert.equal(data.origin,undefined,"no GPS echoed");
 assert.equal(data.pickup,undefined,"no coordinates echoed");
});
test("requires separate explicit OSRM consent and simulation flag",async()=>{
 let called=0;
 const fn=createRoadEtaPreview({fetchImpl:async()=>{called++;throw Error("Should never call")}});
 await assert.rejects(fn({...request,consentExternalRouting:false}),TypeError);
 await assert.rejects(fn({...request,simulation:false}),TypeError);
 await assert.rejects(fn({...request,category:"commercial"}),TypeError);
 assert.equal(called,0);
});
test("region bounding, degenerate inputs and long remote routes fail before provider",()=>{
 for(const req of [
  {...request,origin:{lat:-23.5,lng:-46.6}},
  {...request,pickup:{lat:-23.5,lng:-46.6}},
  {...request,pickup:{lat:-24.73,lng:-53.74}},
  {...request,pickup:{lat:-26.2,lng:-54.2}},
  {...request,origin:{lat:"-24.73",lng:-53.74}},
  {...request,pickup:{lat:Infinity,lng:-53.7}},
  {...request,origin:null},
  {...request,simulation:"true"},
  {...request,consentExternalRouting:"true"},
  {...request,pickup:[-24,-53]}
 ])assert.throws(()=>validateRoadRequest(req),{name:/TypeError|RangeError/});
});
test("public router failure returns no fabricated ETA",async()=>{
 for(const mocked of [
  {ok:false,status:503},
  {ok:true,json:async()=>({code:"NoRoute",routes:[]})},
  {ok:true,json:async()=>({code:"Ok",routes:[{distance:23,duration:6}]})},
  {ok:true,json:async()=>({code:"Ok",routes:[{distance:2000,duration:NaN}]})},
  {ok:true,json:async()=>({code:"Ok",routes:[{distance:80000,duration:500}]})}
 ]){
  const fn=createRoadEtaPreview({fetchImpl:async()=>mocked});
  await assert.rejects(fn(request),/road_provider_unavailable|no_valid_road_route/);
 }
});
test("OSRM network timeout returns controlled failure",async()=>{
 const fn=createRoadEtaPreview({fetchImpl:async()=>{throw new Error("Network timeout")}});
 await assert.rejects(fn(request),/road_provider_unavailable/);
});
