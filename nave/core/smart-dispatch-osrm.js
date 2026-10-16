"use strict";
// V5 comparison by OSRM TABLE: actual routing estimates for FIXED, FICTIONAL pilots.
// No GPS collected, no passenger data, no persisted trip, no WhatsApp, no payments.
// Public OSRM demo is best-effort and not traffic-aware; it can return no route.
const {rankSimulatedDrivers}=require("./smart-dispatch-preview");
const {distanceMeters}=require("./nearest-pilot-preview");
const {normalizeCategory}=require("./ride-contract");
const PICKUP=Object.freeze({lat:-24.7300,lng:-53.7440});
const DRIVER_POINTS=Object.freeze([
 {id:"DEMO-ALFA",location:Object.freeze({lat:-24.7266,lng:-53.7460}),categories:Object.freeze(["eco","confort"])},
 {id:"DEMO-BETA",location:Object.freeze({lat:-24.7380,lng:-53.7490}),categories:Object.freeze(["eco","confort","executive","navegator"])},
 {id:"DEMO-GAMA",location:Object.freeze({lat:-24.7337,lng:-53.7340}),categories:Object.freeze(["eco","confort","executive","navegator"])},
 {id:"DEMO-DELTA",location:Object.freeze({lat:-24.7440,lng:-53.7440}),categories:Object.freeze(["eco","confort","executive","navegator"])}
]);
const SCENARIOS=Object.freeze(["all","busy","unavailable"]);
function validateScenario(body){
 if(!body||typeof body!=="object"||Array.isArray(body)||
   Object.keys(body).some(k=>!["simulation","consentExternalRouting","scenario","category"].includes(k))||
   body.simulation!==true||body.consentExternalRouting!==true||
   !SCENARIOS.includes(body.scenario)||!normalizeCategory(body.category))
  throw new TypeError("Explicit simulation, third-party consent, category and scenario required");
 return {scenario:body.scenario,category:normalizeCategory(body.category)};
}
function createDemoCandidates(scenario,now){
 const fresh=new Date(now-1000).toISOString();
 return DRIVER_POINTS.map(p=>({
   id:p.id,location:{...p.location},categories:[...p.categories],
   online:p.id!=="DEMO-DELTA",verified:true,electricVehicle:true,
   testOnly:true,testEnabled:true,locationSource:"simulated",
   activeOffer:scenario==="busy"&&p.id==="DEMO-BETA",
   positionUpdatedAt:p.id==="DEMO-DELTA"?new Date(now-360000).toISOString():fresh,
   mockRoadRoute:null
 }));
}
function eligibleForRouting(p,category,now){
 if(p.online!==true||p.verified!==true||p.electricVehicle!==true||
    p.testOnly!==true||p.testEnabled!==true||p.activeOffer===true||
    p.locationSource!=="simulated"||!p.categories.includes(category))return false;
 const age=now-Date.parse(p.positionUpdatedAt);
 if(!Number.isFinite(age)||age< -30000||age>120000)return false;
 return distanceMeters(p.location,PICKUP)<=15000;
}
function buildTableUrl(drivers){
 const coords=[...drivers.map(d=>d.location),PICKUP]
  .map(p=>p.lng+","+p.lat).join(";");
 const url=new URL("https://router.project-osrm.org/table/v1/driving/"+coords);
 url.searchParams.set("sources",drivers.map((_,i)=>i).join(";"));
 url.searchParams.set("destinations",String(drivers.length));
 url.searchParams.set("annotations","duration,distance");
 return url.toString();
}
function parseTable(data,drivers){
 if(!data||data.code!=="Ok"||!Array.isArray(data.durations)||
    !Array.isArray(data.distances)||
    data.durations.length!==drivers.length||data.distances.length!==drivers.length||
    (Array.isArray(data.fallback_speed_cells)&&data.fallback_speed_cells.length>0))
  throw Error("OSRM table result invalid");
 return drivers.map((d,i)=>{
  const duration=data.durations[i],distance=data.distances[i];
  if(!Array.isArray(duration)||duration.length!==1||
     !Array.isArray(distance)||distance.length!==1)
   throw Error("OSRM dimensions invalid");
  const t=duration[0],m=distance[0],straight=distanceMeters(d.location,PICKUP);
  if(!Number.isFinite(t)||!Number.isFinite(m)||t<20||t>7200||
     m<Math.max(50,straight*.65)||m>50000)return null;
  return {etaSeconds:Math.round(t),roadDistanceMeters:Math.round(m)};
 });
}
function createDemoRouteComparison({fetchImpl=fetch,timeoutMs=7500,now=()=>Date.now()}={}){
 if(typeof fetchImpl!=="function"||typeof now!=="function"||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>12000)
   throw TypeError("Invalid comparison dependency");
 return async function compare(body){
  const {scenario,category}=validateScenario(body);
  const stamp=now();
  const candidates=createDemoCandidates(scenario,stamp);
  const eligible=scenario==="unavailable"?[]:candidates.filter(c=>eligibleForRouting(c,category,stamp));
  // The unavailable scenario intentionally tests fail-closed logic without any external query.
  if(scenario==="unavailable"){
   const summary=rankSimulatedDrivers({simulation:true,routeSource:"synthetic",pickup:PICKUP,category,candidates},stamp);
   return Object.freeze({...summary,scenario,routeSource:"no-provider-demo",
     selectionMethod:"no-safe-eta",realRoadRoutingEnabled:false,
     providerQueried:false,providerName:null,
     note:"Sem roteamento nesta simulação. Nenhum motorista é selecionado."});
  }
  if(eligible.length<1){
   const summary=rankSimulatedDrivers({simulation:true,routeSource:"synthetic",pickup:PICKUP,category,candidates},stamp);
   return Object.freeze({...summary,scenario,routeSource:"osrm-public-table",
     realRoadRoutingEnabled:false,providerQueried:false,
     notice:"Nenhum candidato elegível: nenhuma consulta foi enviada ao provedor."});
  }
  let table;
  try{
   const response=await fetchImpl(buildTableUrl(eligible),{
     method:"GET",redirect:"error",
     headers:{"Accept":"application/json","User-Agent":"NAVE-V5-Synthetic-Dispatch/1.0 (testing only)"},
     signal:AbortSignal.timeout(timeoutMs)
   });
   if(!response.ok)throw Error("Provider unavailable");
   table=parseTable(await response.json(),eligible);
  }catch(_){throw Error("osrm_table_unavailable")}
  const routes=new Map(eligible.map((d,i)=>[d.id,table[i]]));
  for(const d of candidates)d.mockRoadRoute=routes.get(d.id)||null;
  // Reuse the existing deterministic eligibility checks and ETA sorting;
  // the "mock" property is a private adapter for the pure ranking helper.
  const summary=rankSimulatedDrivers({
   simulation:true,routeSource:"synthetic",pickup:PICKUP,category,candidates
  },stamp);
  return Object.freeze({...summary,scenario,routeSource:"osrm-public-table",
   selectionMethod:"lowest-osrm-road-eta",realRoadRoutingEnabled:true,
   providerQueried:true,providerName:"OSRM public demonstration server",
   trafficAware:false,realGpsUsed:false,passengerDataUsed:false,
   notice:"Os pilotos e os pontos de embarque são fictícios. Os tempos foram calculados pelo OSRM público, sem trânsito em tempo real. Não há corridas nem ofertas."});
 };
}
module.exports={PICKUP,DRIVER_POINTS,validateScenario,createDemoCandidates,eligibleForRouting,buildTableUrl,parseTable,createDemoRouteComparison};
