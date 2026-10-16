"use strict";
// Fully isolated V5 fictional ride state-machine: no network, IDs of real drivers,
// Supabase, WhatsApp, persistence, pricing for commercial use, or real GPS.
const {normalizeCategory,previewTestQuote}=require("./ride-contract");
const {rankSimulatedDrivers}=require("./smart-dispatch-preview");

const STATUSES=Object.freeze(["offer_pending","driver_to_pickup","at_pickup","in_trip",
 "completed","cancelled","no_driver"]);
const SCENARIOS=Object.freeze(["normal","first_busy","no_route"]);
const PICKUP=Object.freeze({lat:-24.73,lng:-53.744});
const ROUTE=Object.freeze({distanceMeters:4300,durationSeconds:720});
const FLAGS=Object.freeze({
 simulation:true,testOnly:true,commercialRidesEnabled:false,persistenceEnabled:false,
 whatsappSendEnabled:false,realGpsUsed:false,paymentsEnabled:false,
 externalRoutingEnabled:false,routeSource:"synthetic-fixture",
 notice:"LABORATÓRIO: distância, tempo e motoristas fictícios. Nenhuma viagem, cobrança ou mensagem real."
});
const CANDIDATES=Object.freeze([
 {id:"DEMO-ALFA",location:{lat:-24.727,lng:-53.746},categories:["eco","confort"],
  online:true,activeOffer:false,mockRoadRoute:{etaSeconds:540,roadDistanceMeters:2500}},
 {id:"DEMO-BETA",location:{lat:-24.737,lng:-53.751},categories:["eco","confort","executive","navegator"],
  online:true,activeOffer:false,mockRoadRoute:{etaSeconds:280,roadDistanceMeters:1900}},
 {id:"DEMO-GAMA",location:{lat:-24.731,lng:-53.742},categories:["eco","confort","executive","navegator"],
  online:false,activeOffer:false,mockRoadRoute:{etaSeconds:150,roadDistanceMeters:1100}}
]);
const ALLOWED_PHASES=new Set(STATUSES);
function candidateList(scenario,excluded,now){
 return CANDIDATES.map(d=>({
  ...d,location:{...d.location},categories:[...d.categories],
  testOnly:true,testEnabled:true,verified:true,electricVehicle:true,
  online:d.online,activeOffer:(scenario==="first_busy"&&d.id==="DEMO-BETA")||excluded.includes(d.id),
  locationSource:"simulated",positionUpdatedAt:new Date(now-5000).toISOString(),
  mockRoadRoute:scenario==="no_route"?null:{...d.mockRoadRoute}
 }));
}
function selectDriver(category,scenario,excluded,now){
 const summary=rankSimulatedDrivers({simulation:true,routeSource:"synthetic",pickup:PICKUP,
  category,candidates:candidateList(scenario,excluded,now)},now);
 return {selected:summary.selected,eligibleCount:summary.eligibleCount,
  excluded:summary.excluded,ranked:summary.ranked};
}
function validateEnvelope(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(
  k=>!["action","category","scenario","state"].includes(k)))throw new TypeError("Invalid simulation envelope");
 if(!["start","accept","decline","arrive","board","complete","cancel"].includes(input.action))
  throw new TypeError("Unknown simulation action");
 return input.action;
}
function validateState(raw,now){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    Object.keys(raw).some(k=>!["version","phase","categoryCode","scenario","declined","driverId","step"].includes(k))||
    raw.version!==1||!ALLOWED_PHASES.has(raw.phase)||
    !["eco","confort","executive","navegator"].includes(raw.categoryCode)||
    !SCENARIOS.includes(raw.scenario)||!Array.isArray(raw.declined)||
    raw.declined.length>2||raw.declined.some(id=>!["DEMO-ALFA","DEMO-BETA"].includes(id))||
    new Set(raw.declined).size!==raw.declined.length||
    !Number.isInteger(raw.step)||raw.step<1||raw.step>8 ||
    !(raw.driverId===null||raw.driverId==="DEMO-ALFA"||raw.driverId==="DEMO-BETA"))
  throw new TypeError("Invalid fictional journey state");
 const {selected}=selectDriver(raw.categoryCode,raw.scenario,raw.declined,now);
 if(["offer_pending","driver_to_pickup","at_pickup","in_trip","completed"].includes(raw.phase)&&
    (!selected||raw.driverId!==selected.driverId))throw new TypeError("Selected fictional driver mismatch");
 if(raw.phase==="no_driver"&&selected!==null)throw new TypeError("Invalid no-driver state");
 return {version:1,phase:raw.phase,categoryCode:raw.categoryCode,scenario:raw.scenario,
  declined:[...raw.declined],driverId:raw.driverId,step:raw.step};
}
function transition({state,action},now){
 const from=state.phase;
 const next={...state,declined:[...state.declined],step:state.step+1};
 if(next.step>8)throw new RangeError("Demo action limit");
 let message;
 switch(action){
  case "accept":
   if(from!=="offer_pending")throw new TypeError("Cannot accept at this phase");
   next.phase="driver_to_pickup";message="Motorista fictício aceitou e segue para o embarque.";break;
  case "decline":
   if(from!=="offer_pending")throw new TypeError("Cannot decline at this phase");
   next.declined.push(state.driverId);
   const nextSelection=selectDriver(state.categoryCode,state.scenario,next.declined,now).selected;
   next.driverId=nextSelection?.driverId||null;
   next.phase=nextSelection?"offer_pending":"no_driver";
   message=nextSelection?"Oferta recusada: NAVE escolheu o próximo piloto fictício elegível.":
    "Oferta recusada: nenhum outro piloto fictício elegível. Nenhuma oferta foi enviada.";
   break;
  case "arrive":
   if(from!=="driver_to_pickup")throw new TypeError("Cannot arrive before acceptance");
   next.phase="at_pickup";message="Motorista fictício chegou ao ponto de embarque.";break;
  case "board":
   if(from!=="at_pickup")throw new TypeError("Cannot board before arrival");
   next.phase="in_trip";message="Embarque simulado confirmado. Corrida fictícia em andamento.";break;
  case "complete":
   if(from!=="in_trip")throw new TypeError("Cannot complete before boarding");
   next.phase="completed";message="Jornada fictícia encerrada. Nenhuma cobrança foi processada.";break;
  case "cancel":
   if(!["offer_pending","driver_to_pickup","at_pickup"].includes(from))
    throw new TypeError("Cancel only before simulated boarding");
   next.phase="cancelled";message="Pedido fictício cancelado. Nenhum pagamento foi realizado.";break;
  default:throw new TypeError("Invalid state action");
 }
 return {state:next,message};
}
function simulateJourney(input,now=Date.now()){
 if(!Number.isSafeInteger(now))throw new TypeError("Invalid timestamp");
 const action=validateEnvelope(input);
 let state,message;
 if(action==="start"){
  if(input.state!==undefined||!SCENARIOS.includes(input.scenario)||normalizeCategory(input.category)===null)
   throw new TypeError("Invalid start parameters");
  const category=normalizeCategory(input.category);
  const result=selectDriver(category,input.scenario,[],now);
  state={version:1,phase:result.selected?"offer_pending":"no_driver",
   categoryCode:category,scenario:input.scenario,declined:[],
   driverId:result.selected?.driverId||null,step:1};
  message=result.selected?"Cotação fictícia calculada e oferta preparada na tela do piloto.":
   "Cotação fictícia calculada, mas não há motorista elegível. Sem despacho.";
 }else{
  if(input.category!==undefined||input.scenario!==undefined)throw new TypeError("Unexpected start fields");
  const existing=validateState(input.state,now);
  ({state,message}=transition({state:existing,action},now));
 }
 const quote=previewTestQuote({category:state.categoryCode,...ROUTE});
 const selection=selectDriver(state.categoryCode,state.scenario,state.declined,now);
 const driver=(["completed","cancelled"].includes(state.phase))?null:selection.selected;
 const safeState=Object.freeze({...state,declined:Object.freeze([...state.declined])});
 return Object.freeze({...FLAGS,phase:state.phase,state:safeState,
  categoryCode:state.categoryCode,
  pickupLabel:"Centro, Toledo — TESTE",destinationLabel:"Região do Lago, Toledo — TESTE",
  tripDistanceMeters:ROUTE.distanceMeters,tripDurationSeconds:ROUTE.durationSeconds,
  fareCents:quote.fareCents,commissionCents:quote.commissionCents,
  driverGrossCents:quote.driverGrossCents,
  driverId:state.driverId,
  etaToPickupSeconds:driver?.etaSeconds??null,
  routeToPickupMeters:driver?.roadDistanceMeters??null,
  otherEligibleCount:Math.max(0,selection.eligibleCount-(driver?1:0)),
  message,
  offerPreview:state.phase==="offer_pending"?("🧪 NAVE — OFERTA FICTÍCIA | "+state.driverId+
   " | Categoria: "+state.categoryCode+" | Embarque: Centro, Toledo | Destino: Região do Lago, Toledo"+
   " | Valor ilustrativo: R$ "+(quote.fareCents/100).toFixed(2).replace(".",",")+
   " | NÃO SE DESLOQUE. Nenhuma corrida criada.") : null});
}
module.exports={simulateJourney,STATUSES,SCENARIOS};
