"use strict";
// Runs the SAME five browser QA packages over the fixed STAGING stateless API.
// No real driver, passenger, GPS, WhatsApp, DB session or money is accessed.
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const {performance}=require("node:perf_hooks");
const BASE="https://nave-v5-homologacao.onrender.com";
const LAB="/api/v5/journey-lab";
const MAX_REQUESTS=110;
const page=fs.readFileSync(path.join(__dirname,"../public/pacotes-qa.html"),"utf8");
const match=page.match(/<script>([\s\S]*?)<\/script>/);
if(!match)throw new Error("MACRO-QA page has no inline test harness");
let calls=0;
const fields=new Map();
function node(id){
 if(!fields.has(id))fields.set(id,{textContent:"",disabled:false,className:"",onclick:null});
 return fields.get(id);
}
async function onlyStagedLab(input,options){
 assert.equal(input,LAB,"Blocked non-laboratory endpoint");
 assert.equal(options?.method,"POST");
 assert.equal(options?.credentials,"omit");
 assert.equal(options?.cache,"no-store");
 assert.equal(options?.headers?.["content-type"],"application/json");
 const data=JSON.parse(options.body);
 assert.equal(typeof data.action,"string");
 assert.ok(["start","accept","decline","arrive","board","complete","cancel"].includes(data.action));
 assert.ok(++calls<=MAX_REQUESTS,"Out-of-bounds QA traffic");
 return fetch(BASE+LAB,{...options,redirect:"error"});
}
async function preflight(){
 for(const [resource,keys] of [
  ["/healthz",["commercialRidesEnabled","integrationReady"]],
  ["/api/v5/status",["commercialRidesEnabled","persistenceEnabled","channelIntegrationEnabled"]],
  ["/api/v5/pilot-readiness",["commercialRidesEnabled","optIn","notificationReady"]]
 ]){
  const response=await fetch(BASE+resource,{method:"GET",cache:"no-store",redirect:"error",
   signal:AbortSignal.timeout(12000)});
  assert.equal(response.status,200,"Staging "+resource+" unavailable");
  const data=await response.json();
  for(const key of keys)assert.equal(data[key],false,"Unsafe staging flag "+resource+" "+key);
 }
}
async function main(){
 await preflight();
 const sandbox={document:{getElementById:node},fetch:onlyStagedLab,
  AbortController,performance,setTimeout,clearTimeout,console};
 const context=vm.createContext(sandbox);
 await vm.runInContext(match[1]+"\nrun();",context,{timeout:1000});
 const packResults=[1,2,3,4,5].map(i=>({
  pack:"P0"+i,status:node("r"+i).textContent,
 }));
 const summary={
  status:packResults.every(x=>x.status==="APROVADO")&&Number(node("fails").textContent)===0?"APROVADO":"FALHOU",
  passes:Number(node("passes").textContent),
  fails:Number(node("fails").textContent),
  requests:calls,
  completed:node("completed").textContent,
  packs:packResults,
  environment:"nave-v5-homologacao",
  api:"fictional-stateless-only",
  sideEffects:"none"
 };
 console.log("MACRO-QA-RESULT "+JSON.stringify(summary));
 console.log("MACRO-QA-DETAIL\n"+node("log").textContent);
 const output=process.env.GITHUB_STEP_SUMMARY;
 if(output){
  const report=[
   "## NAVE V5 — Macro-QA executado na homologação",
   "","| Pacote | Resultado |","|---|---|",
   ...packResults.map(x=>"| "+x.pack+" | "+x.status+" |"),
   "","**"+summary.passes+" verificações aprovadas**, **"+summary.fails+
    " falhas**, **"+calls+" requisições**.","",
   "**Ambiente:** somente API fictícia de staging, sem WhatsApp, GPS, viagens, pagamentos ou persistência.",""
  ].join("\n");
  fs.appendFileSync(output,report);
 }
 assert.equal(summary.status,"APROVADO","At least one QA pack failed");
 assert.equal(summary.completed,"5/5");
 assert.ok(summary.passes>=800,"Expected hundreds of live checks");
 assert.ok(summary.requests>=80&&summary.requests<=MAX_REQUESTS);
}
main().catch(e=>{console.error("MACRO-QA-FAIL",e.stack||e);process.exitCode=1});
