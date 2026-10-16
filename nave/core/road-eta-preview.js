"use strict";
// Simulation-only ETA by public OSRM. Third-party routing receives both requested
// coordinates ONLY after a separate explicit opt-in. Never store, dispatch or bill.
const { distanceMeters } = require("./nearest-pilot-preview");
const { normalizeCategory } = require("./ride-contract");
const REGION = Object.freeze({minLat:-26.5,maxLat:-24.4,minLng:-55.7,maxLng:-52.4});
function inArea(p) {
 return p && typeof p==="object" && !Array.isArray(p) &&
  typeof p.lat==="number" && typeof p.lng==="number" &&
  Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  p.lat>=REGION.minLat && p.lat<=REGION.maxLat && p.lng>=REGION.minLng && p.lng<=REGION.maxLng;
}
function validateRoadRequest(body) {
 if(!body || typeof body!=="object" || Array.isArray(body) ||
    body.simulation!==true || body.consentExternalRouting!==true)
   throw new TypeError("Separate external routing consent and simulation required");
 if(!normalizeCategory(body.category)||!inArea(body.origin)||!inArea(body.pickup))
   throw new TypeError("Invalid test category or coordinates");
 const straight=distanceMeters(body.origin,body.pickup);
 if(straight<50||straight>25000)throw new RangeError("Only distinct local pickup points 50-25000m apart");
 return {origin:body.origin,pickup:body.pickup,straight,category:normalizeCategory(body.category)};
}
function createRoadEtaPreview({fetchImpl=fetch,timeoutMs=7000,now=()=>Date.now()}={}) {
 if(typeof fetchImpl!=="function"||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
  throw new TypeError("Invalid routing dependency");
 return async function roadEtaPreview(body) {
  const {origin,pickup,straight,category}=validateRoadRequest(body);
  const start=now();
  // Host is fixed: caller can never supply a URL, hostname, path or token.
  const url=new URL("https://router.project-osrm.org/route/v1/driving/"+
    origin.lng+","+origin.lat+";"+pickup.lng+","+pickup.lat);
  url.searchParams.set("overview","false");
  url.searchParams.set("steps","false");
  url.searchParams.set("alternatives","false");
  let response, data;
  try {
   response=await fetchImpl(url.toString(),{
    method:"GET",
    headers:{"Accept":"application/json","User-Agent":"NAVE-V5-Route-ETA-Demo/1.0 (testing-only)"},
    signal:AbortSignal.timeout(timeoutMs),
    redirect:"error"
   });
   if(!response.ok)throw new Error("Provider unavailable");
   data=await response.json();
  }catch(_) {
   throw new Error("road_provider_unavailable");
  }
  const first=data?.routes?.[0];
  if(data?.code!=="Ok" || !first || !Number.isFinite(first.distance) ||
     !Number.isFinite(first.duration) || first.distance<straight*.65 ||
     first.distance>70000 || first.duration<10 || first.duration>9000 ||
     now()-start>15000)throw new Error("no_valid_road_route");
  return Object.freeze({
   testOnly:true,commercialRidesEnabled:false,dispatchEnabled:false,
   persistenceEnabled:false,whatsappSendEnabled:false,externalRoutingConsent:true,
   categoryCode:category,routeProvider:"OSRM public demonstration server",
   distanceMethod:"road-routing",travelMode:"driving",
   roadDistanceMeters:Math.round(first.distance),
   etaSeconds:Math.round(first.duration),
   straightLineMeters:straight,
   trafficAware:false,liveRoadClosureAware:false,
   routeConfidence:"public-demo-unverified",
   notice:"Rota estimada sem trânsito em tempo real. Serviço externo recebeu os dois pontos após consentimento. Nenhuma viagem criada."
  });
 };
}
module.exports={inArea,validateRoadRequest,createRoadEtaPreview};
