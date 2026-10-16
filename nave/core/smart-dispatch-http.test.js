"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),http=require("node:http"),express=require("express");
const {createPreviewRouter}=require("./preview-router");
const now=new Date().toISOString();
const fixture={
 simulation:true,routeSource:"synthetic",category:"eco",pickup:{lat:-24.73,lng:-53.744},
 candidates:[{
  id:"DEMO-ALFA",testOnly:true,testEnabled:true,online:true,verified:true,
  electricVehicle:true,activeOffer:false,locationSource:"simulated",
  positionUpdatedAt:now,categories:["eco","confort"],
  location:{lat:-24.7303,lng:-53.7441},
  mockRoadRoute:{roadDistanceMeters:3100,etaSeconds:550}
 },{
  id:"DEMO-BETA",testOnly:true,testEnabled:true,online:true,verified:true,
  electricVehicle:true,activeOffer:false,locationSource:"simulated",
  positionUpdatedAt:now,categories:["eco","confort","executive","navegator"],
  location:{lat:-24.738,lng:-53.748},
  mockRoadRoute:{roadDistanceMeters:1600,etaSeconds:280}
 }]
};
async function request(body){
 const app=express();app.use("/api/v5",createPreviewRouter());
 const srv=http.createServer(app);
 await new Promise(done=>srv.listen(0,"127.0.0.1",done));
 try{
  const response=await fetch("http://127.0.0.1:"+srv.address().port+"/api/v5/smart-dispatch-preview",{
   method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
  });
  return {status:response.status,cache:response.headers.get("cache-control"),data:await response.json()};
 }finally{await new Promise(done=>srv.close(done));}
}
test("HTTP selects fastest eligible pilot with no dispatch or storage",async()=>{
 const result=await request(fixture);
 assert.equal(result.status,200);
 assert.equal(result.cache,"no-store");
 assert.equal(result.data.selected.driverId,"DEMO-BETA");
 assert.equal(result.data.routeSource,"synthetic");
 assert.equal(result.data.whatsappSendEnabled,false);
 assert.equal(result.data.persistenceEnabled,false);
 assert.equal(result.data.paymentsEnabled,false);
});
test("HTTP rejects claimed real driver ID or fake live OSRM source",async()=>{
 const real=structuredClone(fixture);real.candidates[0].id="NAVE-0001";
 assert.equal((await request(real)).status,400);
 const external=structuredClone(fixture);external.routeSource="OSRM";
 assert.equal((await request(external)).status,400);
});
test("HTML presents transparent simulation wording and category selection",()=>{
 const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
 const html=fs.readFileSync(path.join(__dirname,"../public/smart-dispatch.html"),"utf8");
 assert.match(html,/exclusivamente <strong>tempos, motoristas e trajetos fictícios<\/strong>/);
 assert.match(html,/data-cat="executive"/);
 assert.match(html,/data-cat="navegator"/);
 assert.match(html,/id="scenario"/);
 assert.match(html,/id="calculate"/);
 assert.match(html,/routeSource:"synthetic"/);
 assert.match(html,/whatsappSendEnabled!==false/);
 assert.match(html,/id="drivers"/);
 const script=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(script);
 assert.doesNotThrow(()=>new vm.Script(script[1]));
});
