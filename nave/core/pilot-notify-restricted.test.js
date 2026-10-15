"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),express=require("express"),http=require("node:http");
const {createRestrictedPilotRouter}=require("./pilot-notify-restricted");
async function check({enabled=true,auth=true,eligible=true,phone="+5545999999999",confirm="SIMULACAO_SEM_DESLOCAMENTO"}={}){
 const sent=[];
 const app=express();app.use(express.json());
 app.use("/api/v5",createRestrictedPilotRouter({
 enabled,pilotPhone:phone,url:"https://test.example",publishableKey:"test-pub",
 requireMaster:(req,res,next)=>auth?next():res.sendStatus(403),
 makeClient:()=>({rpc:async(name)=>{assert.equal(name,"nave_v5_pilot_test_status");return {data:eligible,error:null}}}),
 sendMessage:async(to,msg)=>sent.push({to,msg})
 }));
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{const r=await fetch("http://127.0.0.1:"+server.address().port+"/api/v5/pilot-notification-test",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer fake-test-token"},body:JSON.stringify({confirm})});return {status:r.status,sent};}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test("disabled feature blocks sending",async()=>{const r=await check({enabled:false});assert.equal(r.status,404);assert.equal(r.sent.length,0);});
test("authorization blocks sending",async()=>{const r=await check({auth:false});assert.equal(r.status,403);assert.equal(r.sent.length,0);});
test("ineligible RPC blocks sending",async()=>{const r=await check({eligible:false});assert.equal(r.status,409);assert.equal(r.sent.length,0);});
test("unconfigured phone blocks sending",async()=>{const r=await check({phone:""});assert.equal(r.status,503);assert.equal(r.sent.length,0);});
test("wrong confirmation blocks sending",async()=>{const r=await check({confirm:"no"});assert.equal(r.status,400);assert.equal(r.sent.length,0);});
test("eligible authenticated test sends warning only",async()=>{const r=await check();assert.equal(r.status,202);assert.equal(r.sent.length,1);assert.match(r.sent[0].msg,/NÃO ACEITE CORRIDA/);});
