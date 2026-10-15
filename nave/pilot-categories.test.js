"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {createDriverPilot}=require("./driver_pilot");

const labels={eco:"NAVE Eco",confort:"NAVE Confort",executive:"NAVE Executive",navegator:"NAVEGATOR"};

function setup({testOnly=true,rideCategory="confort",vehicle=true,online=true}={}){
 const sent=[],writes=[];
 const driverId="11111111-1111-4111-8111-111111111111";
 const offerId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const ride={id:"ride-1",quote_is_test_only:testOnly,status:"quoted",category_code:rideCategory,
   pickup_label:"Centro, Toledo",destination_label:"Lago, Toledo",fare_quote_cents:1500};
 const db={from(table){
   let inserted=false;
   const c={
     select(){
       if(table==="nave_wa_driver_offers"&&inserted)return Promise.resolve({data:[{id:offerId}],error:null});
       return c;
     },
     eq(){return c},not(){return c},order(){return c},
     limit(){
       if(table==="nave_wa_driver_test_channels")return Promise.resolve({data:online?[{driver_id:driverId,phone_e164:"+554598209506",last_inbound_at:new Date().toISOString()}]:[],error:null});
       if(table==="vehicles")return Promise.resolve({data:vehicle?[{make:"Teste",model:"Elétrico",powertrain:"electric"}]:[],error:null});
       return Promise.resolve({data:[],error:null});
     },
     single(){
       const value=table==="nave_wa_contacts"?{phone_e164:"+5545999912345"}:
         table==="nave_wa_ride_requests"?ride:
         table==="driver_profiles"?{driver_code:"NAVE-0001",status:"pending"}:null;
       return Promise.resolve({data:value,error:null});
     },
     insert(row){writes.push({table,row});inserted=true;return c},
     update(row){writes.push({table,row});return c}
   };return c;
 }};
 return {driver:createDriverPilot(db,async(to,msg)=>sent.push({to,msg})),sent,writes};
}
for (const [category,title] of Object.entries(labels)) {
 test("NAVE-0001 receives simulated "+title+" offer",async()=>{
   const t=setup({rideCategory:category});
   assert.equal(await t.driver.onQuote("ride-1","passenger-1",category),true);
   assert.equal(t.sent.length,1);
   assert.match(t.sent[0].msg.text,new RegExp("Categoria: "+title));
   assert.match(t.sent[0].msg.text,/NÃO SE DESLOQUE/);
   assert.equal(t.sent[0].msg.buttons.length,2);
   assert.equal(t.writes.length,1);
   assert.equal(t.writes[0].table,"nave_wa_driver_offers");
 });
}
test("no live/commercial ride offer",async()=>{
 const t=setup({testOnly:false,rideCategory:"eco"});
 assert.notEqual(await t.driver.onQuote("ride-1","passenger-1","eco"),true);
 assert.equal(t.sent.length,0);assert.equal(t.writes.length,0);
});
test("no offer for unsupported category",async()=>{
 const t=setup({rideCategory:"confort"});
 assert.notEqual(await t.driver.onQuote("ride-1","passenger-1","luxury"),true);
 assert.equal(t.sent.length,0);
});
test("no offer when vehicle not electric or pilot offline",async()=>{
 for(const setting of [{vehicle:false},{online:false}]){
  const t=setup({...setting,rideCategory:"eco"});
  assert.notEqual(await t.driver.onQuote("ride-1","passenger-1","eco"),true);
  assert.equal(t.sent.length,0);
 }
});
test("passenger flow routes all four simulated categories to offer handler",()=>{
 const flow=fs.readFileSync(path.join(__dirname,"flow.js"),"utf8");
 assert.match(flow,/typeof onTestQuote === "function" && Object\.hasOwn\(categoryRates,chosen\)/);
 assert.doesNotMatch(flow,/chosen === "confort"/);
});
