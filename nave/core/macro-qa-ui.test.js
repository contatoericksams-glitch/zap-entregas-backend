"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const page=fs.readFileSync(path.join(__dirname,"../public/pacotes-qa.html"),"utf8");
test("Macro-QA single-click dashboard compiles and exposes exactly five suites",()=>{
 const js=page.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(js,"client-side test runner");
 assert.doesNotThrow(()=>new vm.Script(js[1]));
 assert.match(page,/Executar os 5 pacotes/);
 assert.match(page,/P01/);assert.match(page,/P02/);assert.match(page,/P03/);
 assert.match(page,/P04/);assert.match(page,/P05/);
 assert.match(js[1],/const packs=\[/);
 assert.match(js[1],/for\(let i=0;i<packs\.length;i\+\+\)/);
});
test("Macro-QA client touches only a stateless local simulation route",()=>{
 assert.match(page,/\/api\/v5\/journey-lab/);
 assert.match(page,/d\?\.whatsappSendEnabled===false/);
 assert.match(page,/d\?\.commercialRidesEnabled===false/);
 assert.match(page,/d\?\.persistenceEnabled===false/);
 assert.match(page,/d\?\.paymentsEnabled===false/);
 assert.match(page,/d\?\.realGpsUsed===false/);
 assert.match(page,/d\?\.externalRoutingEnabled===false/);
 assert.doesNotMatch(page,/navigator\.geolocation|graph\.facebook|api\/v5\/pilot-notification-test|client\.rpc\(/i);
});
test("Macro-QA dashboard does not claim automatic PMC completion",()=>{
 assert.match(page,/percentual só aumenta quando os critérios de módulos forem comprovados/);
 assert.match(page,/nenhum critério de operação final foi automaticamente homologado/);
 assert.match(page,/duas telas/i);
});
