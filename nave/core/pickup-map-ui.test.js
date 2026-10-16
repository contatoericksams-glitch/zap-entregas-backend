"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"../public/gps-piloto.html"),"utf8");
test("the secure pilot GPS page has syntactically valid JavaScript",()=>{
 const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert.ok(match,"module script must exist");
 const script=match[1].replace(/^import \{createClient\} from [^\n]*\n/,"");
 assert.doesNotMatch(script,/^import /m,"all module imports must be stripped for parser");
 assert.doesNotThrow(()=>new vm.Script(script,{filename:"gps-piloto.js"}));
});
test("pickup must come from a distinct user-selected location",()=>{
 assert.match(html,/map\.on\("click",ev=>choosePickup\(ev\.latlng\.lat,ev\.latlng\.lng/);
 assert.match(html,/p_pickup_lat:pickup\.lat,p_pickup_lng:pickup\.lng/);
 assert.doesNotMatch(html,/p_pickup_lat:latest\.coords\.latitude/);
 assert.match(html,/!pickup\)\{status\("Selecione primeiro um embarque fictício/);
});
test("location is never drawn as driver GPS or used to center the public tile map",()=>{
 assert.match(html,/setView\(\[-24\.72,-53\.74\],13\)/);
 assert.match(html,/https:\/\/\{s\}\.tile\.openstreetmap\.org/);
 assert.match(html,/Seu GPS não é desenhado no mapa/);
 assert.doesNotMatch(html,/L\.marker\(\[latest\.coords\.latitude/);
});
test("opt-in, authentication, stop and selected destination enforce noncommercial mode",()=>{
 assert.match(html,/if\(!\$\("consent"\)\.checked\)/);
 assert.match(html,/nave_is_admin/);
 assert.match(html,/l\.currentLevel!=="aal2"/);
 assert.match(html,/nave_v5_nearest_pilot_demo/);
 assert.match(html,/data\?\.whatsappSendEnabled===false/);
 assert.match(html,/const pendingWrite=writeInFlight;clearWatch\(\)/);
 assert.match(html,/await pendingWrite/);
 assert.match(html,/nave_v5_stop_pilot_gps/);
 assert.match(html,/document\.hidden&&sharing/);
});
