"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const http=require("node:http");
const express=require("express");
const {createPilotNotificationRouter}=require("./pilot-notify");
async function invoke({enabled=true,auth=true,online=true,confirm="SIMULACAO_SEM_DESLOCAMENTO"}={}) {
 const messages=[];
 const db={from(table){return {
  select(){return this},eq(k,v){if(k==="availability_state"&&v==="online")this.onlyOnline=true;return this},
  not(){return this},limit(){return Promise.resolve({data:online?[{driver_id:"test-id",phone_e164:"+5545999999999",test_enabled:true,verified_at:"yes",last_inbound_at:new Date().toISOString(),availability_state:"online"}]:[],error:null})},
  single(){return Promise.resolve({data:{driver_code:"NAVE-0001"},error:null})}
 }}};
 const middleware=(req,res,next)=>auth?next():res.sendStatus(403);
 const app=express();app.use("/api/v5",createPilotNotificationRouter({enabled,requireMaster:middleware,db,sendMessage:async(phone,msg)=>messages.push({phone,msg})}));
 const server=http.createServer(app);await new Promise(r=>server.listen(0,"127.0.0.1",r));
 try {const res=await fetch("http://127.0.0.1:"+server.address().port+"/api/v5/pilot-notification-test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm})});return {status:res.status,messages};}
 finally{await new Promise(r=>server.close(r));}
}
test("disabled route never sends",async()=>{const x=await invoke({enabled:false});assert.equal(x.status,404);assert.equal(x.messages.length,0)});
test("non-admin never sends",async()=>{const x=await invoke({auth:false});assert.equal(x.status,403);assert.equal(x.messages.length,0)});
test("offline pilot never sends",async()=>{const x=await invoke({online:false});assert.equal(x.status,409);assert.equal(x.messages.length,0)});
test("explicit confirmation required",async()=>{const x=await invoke({confirm:"no"});assert.equal(x.status,400);assert.equal(x.messages.length,0)});
test("authorized test sends warning only",async()=>{const x=await invoke();assert.equal(x.status,202);assert.equal(x.messages.length,1);assert.match(x.messages[0].msg,/NÃO ACEITE CORRIDA/)});
