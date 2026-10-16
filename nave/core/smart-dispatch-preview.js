"use strict";
// V5 Smart Dispatch — deterministic, synthetic-only road-ETA ranking.
// The candidate times are test fixtures, NOT live OSRM results or real traffic.
// No driver GPS or DB, payments, offer dispatch, or WhatsApp messages are accessed.
const {normalizeCategory}=require("./ride-contract");
const {distanceMeters}=require("./nearest-pilot-preview");
const CATEGORIES=Object.freeze(["eco","confort","executive","navegator"]);
const TIME_WINDOW_MS=120000,MAX_FUTURE_MS=30000,MAX_RADIUS_M=15000;
const validCoords=p=>Boolean(p&&typeof p==="object"&&!Array.isArray(p)&&
 typeof p.lat==="number"&&typeof p.lng==="number"&&
 Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&
 p.lat>=-26.5&&p.lat<=-24.4&&p.lng>=-55.7&&p.lng<=-52.4);
function rankSimulatedDrivers(input,now=Date.now()){
 if(!input||typeof input!=="object"||Array.isArray(input)||
    input.simulation!==true||input.routeSource!=="synthetic")
  throw new TypeError("Explicit synthetic simulation required");
 if(!Number.isSafeInteger(now)||!validCoords(input.pickup))throw new TypeError("Invalid time or pickup");
 const category=normalizeCategory(input.category);
 if(!category)throw new TypeError("Unsupported category");
 if(!Array.isArray(input.candidates)||input.candidates.length>10)
  throw new TypeError("1-10 fictitious candidates required");
 const ids=new Set(),ranked=[],skipped={offline:0,unverified:0,incompatible:0,staleGps:0,busy:0,outOfRange:0,noRoadEta:0};
 for(const d of input.candidates){
  if(!d||typeof d!=="object"||Array.isArray(d)||typeof d.id!=="string"||
    !/^DEMO-[A-Z0-9_-]{1,18}$/i.test(d.id)||ids.has(d.id))
   throw new TypeError("Only unique DEMO driver IDs allowed");
  ids.add(d.id);
  if(d.online!==true){skipped.offline++;continue}
  if(d.testOnly!==true||d.testEnabled!==true||d.verified!==true||
      d.electricVehicle!==true||d.locationSource!=="simulated"){skipped.unverified++;continue}
  if(!Array.isArray(d.categories)||!d.categories.every(c=>CATEGORIES.includes(c))||
      !d.categories.includes(category)){skipped.incompatible++;continue}
  if(d.activeOffer===true){skipped.busy++;continue}
  const t=typeof d.positionUpdatedAt==="string"?Date.parse(d.positionUpdatedAt):NaN;
  if(!Number.isFinite(t)||t>now+MAX_FUTURE_MS||t<now-TIME_WINDOW_MS||!validCoords(d.location)){
   skipped.staleGps++;continue
  }
  const straightLineMeters=distanceMeters(d.location,input.pickup);
  if(straightLineMeters>MAX_RADIUS_M){skipped.outOfRange++;continue}
  // Only externally supplied test fixture ETA values, never from a real navigation provider.
  const route=d.mockRoadRoute;
  if(!route||!Number.isSafeInteger(route.etaSeconds)||
      route.etaSeconds<20||route.etaSeconds>7200||
      !Number.isSafeInteger(route.roadDistanceMeters)||
      route.roadDistanceMeters<Math.max(50,Math.round(straightLineMeters*.65))||
      route.roadDistanceMeters>50000){skipped.noRoadEta++;continue}
  ranked.push(Object.freeze({driverId:d.id,
    etaSeconds:route.etaSeconds,roadDistanceMeters:route.roadDistanceMeters,
    straightLineMeters}));
 }
 ranked.sort((a,b)=>a.etaSeconds-b.etaSeconds||
   a.roadDistanceMeters-b.roadDistanceMeters||
   a.straightLineMeters-b.straightLineMeters||
   a.driverId.localeCompare(b.driverId));
 return Object.freeze({
  simulation:true,testOnly:true,categoryCode:category,
  routeSource:"synthetic",selectionMethod:"lowest-mock-road-eta",
  liveGpsEnabled:false,realRoadRoutingEnabled:false,trafficAware:false,
  integrationReady:false,offersCreated:0,
  persistenceEnabled:false,commercialRidesEnabled:false,
  whatsappSendEnabled:false,paymentsEnabled:false,
  eligibleCount:ranked.length,candidatesReceived:input.candidates.length,
  selected:ranked[0]||null,ranked,excluded:skipped,
  notice:"Comparacao educacional com tempos viarios ficticios, nao GPS real nem ETA verificado. Nenhuma oferta enviada."
 });
}
module.exports={rankSimulatedDrivers};
