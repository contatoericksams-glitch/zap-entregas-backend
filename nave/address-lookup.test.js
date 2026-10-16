"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createAddressLookup}=require("./address-lookup");
const inArea=(lat,lng)=>lat>=-26.5&&lat<=-24.4&&lng>=-55.7&&lng<=-52.4;
const toledoPoint={lat:"-24.722",lon:"-53.741",display_name:"Avenida Maripá, Toledo, Paraná, Brasil"};
const photonPoint={type:"Feature",geometry:{coordinates:[-53.744,-24.72]},properties:{name:"Rodoviária",city:"Toledo",state:"Paraná"}};
test("resolves address by primary Nominatim result",async()=>{
 let calls=0;
 const lookup=createAddressLookup({insideTestArea:inArea,getJson:async(url)=>{calls++;assert.match(url,/nominatim/);return [toledoPoint]},sleep:async()=>{}});
 const a=await lookup("Av. Maripá, 434 Toledo");
 assert.deepEqual([a.lat,a.lng],[-24.722,-53.741]);
 assert.equal((await lookup("Av. Maripá, 434 Toledo")).lat,a.lat);
 assert.equal(calls,1,"successful result cached");
});
test("fails over to Photon without losing original address",async()=>{
 const requested="Rodoviária Toledo";
 const urls=[];
 const lookup=createAddressLookup({insideTestArea:inArea,getJson:async url=>{
  urls.push(url);
  if(url.includes("nominatim"))throw Error("provider 503");
  return {features:[photonPoint]};
 },sleep:async()=>{}});
 const p=await lookup(requested);
 assert.deepEqual([p.lat,p.lng,p.label],[-24.72,-53.744,requested]);
 assert.equal(urls.length,2);
});
test("fallback also runs if Nominatim finds no matches",async()=>{
 const lookup=createAddressLookup({insideTestArea:inArea,getJson:async url=>url.includes("nominatim")?[]:{features:[photonPoint]},sleep:async()=>{}});
 assert.equal((await lookup("Rodoviária Toledo")).lat,-24.72);
});
test("rejects a point from another city when caller requests Toledo",async()=>{
 const lookup=createAddressLookup({insideTestArea:inArea,getJson:async url=>url.includes("nominatim")?[{lat:"-24.95",lon:"-53.45",display_name:"Rua Maripá, Cascavel, Paraná"}]:{features:[{type:"Feature",geometry:{coordinates:[-53.45,-24.95]},properties:{city:"Cascavel",street:"Maripá"}}]},sleep:async()=>{}});
 assert.equal(await lookup("Rua Maripá Toledo"),null);
});
test("rejects returned coordinates outside of west Paraná",async()=>{
 const lookup=createAddressLookup({insideTestArea:inArea,getJson:async url=>url.includes("nominatim")?[{lat:"-23.55",lon:"-46.63",display_name:"Toledo, São Paulo"}]:{features:[]},sleep:async()=>{}});
 assert.equal(await lookup("Rua Central Toledo"),null);
});
test("both geocoders down: no fabricated location",async()=>{
 const lookup=createAddressLookup({insideTestArea:inArea,getJson:async()=>{throw Error("timeout")},sleep:async()=>{}});
 await assert.rejects(lookup("Rodoviária Toledo"),/geocoding_providers_unavailable/);
});
test("destination with WhatsApp map pin does not require geocoding",()=>{
 const src=require("node:fs").readFileSync(require("node:path").join(__dirname,"flow.js"),"utf8");
 assert.match(src,/if \(loc\) return loc/);
 assert.match(src,/message\.location\?\.name/);
 assert.match(src,/createAddressLookup\(\{getJson, insideTestArea\}\)/);
 assert.match(src,/Não envie sua localização atual como destino/);
});
