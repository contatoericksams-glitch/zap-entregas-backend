"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),http=require("node:http"),express=require("express");
const {createRoadEtaRouter}=require("./road-eta-router");
const payload={simulation:true,consentExternalRouting:true,category:"confort",
 origin:{lat:-24.73,lng:-53.74},pickup:{lat:-24.748,lng:-53.745}};
const response={testOnly:true,commercialRidesEnabled:false,whatsappSendEnabled:false,
 persistenceEnabled:false,roadDistanceMeters:3000,etaSeconds:460,trafficAware:false};
async function withServer(router,cb){
 const app=express();app.use("/api/v5",router);
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{return await cb("http://127.0.0.1:"+server.address().port+"/api/v5/road-eta-preview")}
 finally{await new Promise(resolve=>server.close(resolve))}
}
function secureAuth(req,res,next){if(req.get("authorization")!=="Bearer valid-mfa")return res.sendStatus(401);
 req.masterUserId="test-admin-uuid";next();}
test("POST route ETA requires MFA guard before public provider is used",async()=>{
 let sent=0;
 const router=createRoadEtaRouter({requireMaster:secureAuth,routePreview:async()=>{sent++;return response}});
 await withServer(router,async url=>{
  const missing=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  assert.equal(missing.status,401);
  assert.equal(sent,0);
  const noConsent=await fetch(url,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer valid-mfa"},body:JSON.stringify({...payload,consentExternalRouting:false})});
  assert.equal(noConsent.status,400);assert.equal(sent,0);
  const allowed=await fetch(url,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer valid-mfa"},body:JSON.stringify(payload)});
  assert.equal(allowed.status,200);assert.equal(allowed.headers.get("cache-control"),"no-store");
  const result=await allowed.json();assert.equal(result.roadDistanceMeters,3000);assert.equal(result.commercialRidesEnabled,false);
  assert.equal(sent,1);
  const cooled=await fetch(url,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer valid-mfa"},body:JSON.stringify(payload)});
  assert.equal(cooled.status,429);assert.equal(sent,1);
 });
});
test("provider timeout maps to controlled 503, not fabricated journey",async()=>{
 const router=createRoadEtaRouter({requireMaster:secureAuth,routePreview:async()=>{throw Error("timeout")}});
 await withServer(router,async url=>{
  const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer valid-mfa"},body:JSON.stringify(payload)});
  assert.equal(res.status,503);
  const body=await res.json();
  assert.equal(body.fallback,"straight_line_only");
  assert.equal(body.etaSeconds,undefined);
 });
});
test("mobile page has independent third-party consent and only click sends route",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const page=fs.readFileSync(path.join(__dirname,"../public/gps-piloto.html"),"utf8");
 assert.match(page,/id="routingConsent"/);
 assert.match(page,/id="roadEta" disabled/);
 assert.match(page,/OSRM receberá sua localização atual e o ponto de embarque/);
 assert.match(page,/if\(!sharing\|\|!radarVerified\|\|!pickup/);
 assert.match(page,/fetch\("\/api\/v5\/road-eta-preview"/);
 assert.match(page,/consentExternalRouting:true/);
 assert.match(page,/b\.disabled=!sharing\|\|!radarVerified/);
});
