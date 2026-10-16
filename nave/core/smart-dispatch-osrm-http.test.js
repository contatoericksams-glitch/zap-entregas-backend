"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),express=require("express"),http=require("node:http");
const {createSmartDispatchOsrmRouter}=require("./smart-dispatch-osrm-router");
const payload={simulation:true,consentExternalRouting:true,category:"eco",scenario:"all"};
function admin(req,res,next){
 if(req.get("authorization")!=="Bearer valid-admin-mfa")return res.sendStatus(401);
 req.masterUserId="admin-test-only";next();
}
async function withRouter(router,cb){
 const app=express();app.use("/api/v5",router);const server=http.createServer(app);
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 try{return await cb("http://127.0.0.1:"+server.address().port+"/api/v5/smart-dispatch-osrm")}
 finally{await new Promise(r=>server.close(r))}
}
const submit=(url,body,token="Bearer valid-admin-mfa")=>fetch(url,{method:"POST",
 headers:{"content-type":"application/json",authorization:token},body:JSON.stringify(body)});
test("authentication, consent, rate limit enforced before provider call",async()=>{
 let calls=0;
 const router=createSmartDispatchOsrmRouter({requireMaster:admin,now:()=>100000,
  compare:async()=>{calls++;return {testOnly:true,selected:{driverId:"DEMO-ALFA"}}}});
 await withRouter(router,async url=>{
  assert.equal((await submit(url,payload,"")).status,401);
  assert.equal((await submit(url,{...payload,consentExternalRouting:false})).status,400);
  assert.equal((await submit(url,{...payload,origin:{lat:-24,lng:-53}})).status,400);
  assert.equal(calls,0);
  const good=await submit(url,payload);
  assert.equal(good.status,200);assert.equal(good.headers.get("cache-control"),"no-store");
  assert.equal((await good.json()).selected.driverId,"DEMO-ALFA");
  assert.equal((await submit(url,payload)).status,429);
  assert.equal(calls,1);
 });
});
test("provider error returns neutral 503 without fabricated ETA",async()=>{
 const router=createSmartDispatchOsrmRouter({requireMaster:admin,now:()=>100000,
 compare:async()=>{throw Error("provider timeout")}});
 await withRouter(router,async url=>{
  const res=await submit(url,payload);
  assert.equal(res.status,503);
  const d=await res.json();
  assert.equal(d.error,"public_demo_route_unavailable");
  assert.equal(d.selected,undefined);
  assert.equal(d.etaSeconds,undefined);
 });
});
test("frontend clearly labels synthetic coordinates, MFA and separate consent",()=>{
 const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
 const html=fs.readFileSync(path.join(__dirname,"../public/smart-dispatch-rotas.html"),"utf8");
 assert.match(html,/ROTEAMENTO REAL · PONTOS FICTÍCIOS/);
 assert.match(html,/id="providerConsent"/);
 assert.match(html,/id="simulate" type="button" disabled/);
 assert.match(html,/id="mfa" hidden/);
 assert.match(html,/nave_is_admin/);
 assert.match(html,/assurance\.data\?\.currentLevel!=="aal2"/);
 assert.match(html,/\/api\/v5\/smart-dispatch-osrm/);
 assert.match(html,/consentExternalRouting:true/);
 assert.doesNotMatch(html,/navigator\.geolocation/);
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(script);
 assert.doesNotThrow(()=>new vm.Script(script[1].replace(/^\s*import\s+\{createClient\}\s+from\s+[^\n]*\n/,"")));
});
