"use strict";
// Pure V5 dispatch simulation: no DB, tracking, WhatsApp or paid provider.
// Inputs MUST be synthetic. Real driver GPS requires consent, server verification and a secure store.
const {normalizeCategory}=require("./ride-contract");
const EARTH_RADIUS_M=6371000;
const MAX_AGE_MS=180000;
const MAX_FUTURE_MS=30000;
const DEFAULT_RADIUS_M=15000;
function coordinate(value){
  return value && typeof value==="object" && !Array.isArray(value) &&
    typeof value.lat==="number" && typeof value.lng==="number" &&
    Number.isFinite(value.lat)&&Number.isFinite(value.lng) &&
    value.lat>=-90&&value.lat<=90&&value.lng>=-180&&value.lng<=180;
}
function distanceMeters(a,b){
  if(!coordinate(a)||!coordinate(b))throw new TypeError("Invalid geographic coordinate");
  const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
  return Math.round(2*EARTH_RADIUS_M*Math.asin(Math.min(1,Math.sqrt(h))));
}
function previewNearestPilot({pickup,category,candidates,simulation,maxRadiusMeters=DEFAULT_RADIUS_M}={}, now=Date.now()){
  if(simulation!==true)throw new TypeError("Simulation flag required");
  if(!coordinate(pickup))throw new TypeError("Valid pickup coordinate required");
  const code=normalizeCategory(category);
  if(!code)throw new TypeError("Invalid category");
  if(!Array.isArray(candidates)||candidates.length>25)throw new TypeError("Invalid simulated pilots");
  if(!Number.isFinite(now)||!Number.isSafeInteger(now))throw new TypeError("Invalid timestamp");
  if(!Number.isSafeInteger(maxRadiusMeters)||maxRadiusMeters<100||maxRadiusMeters>30000)
    throw new TypeError("Invalid search radius");
  const ids=new Set(),eligible=[];
  for(const c of candidates){
    if(!c||typeof c!=="object"||Array.isArray(c)||typeof c.id!=="string"||
       !/^DEMO-[A-Z0-9_-]{1,18}$/i.test(c.id)||ids.has(c.id))
      throw new TypeError("Only unique fictional DEMO pilot IDs allowed");
    ids.add(c.id);
    // Presence, verification and supported categories fail closed.
    if(c.testOnly!==true||c.testEnabled!==true||c.online!==true||
       c.verified!==true||c.electricVehicle!==true||c.activeOffer===true||
       !Array.isArray(c.categories)||!c.categories.includes(code)||
       !coordinate(c.location)||c.locationSource!=="simulated")continue;
    const timestamp=Date.parse(c.positionUpdatedAt);
    if(typeof c.positionUpdatedAt!=="string"||!Number.isFinite(timestamp)||
       now-timestamp>MAX_AGE_MS||timestamp-now>MAX_FUTURE_MS)continue;
    const meters=distanceMeters(pickup,c.location);
    if(meters<=maxRadiusMeters)eligible.push({id:c.id,distanceMeters:meters});
  }
  eligible.sort((a,b)=>a.distanceMeters-b.distanceMeters||a.id.localeCompare(b.id));
  const winner=eligible[0]||null;
  return Object.freeze({
    testOnly:true,simulation:true,categoryCode:code,
    selectionMethod:"straight-line-distance",
    locationAccuracy:"unverified-synthetic-points",
    routeEtaAvailable:false,liveGpsEnabled:false,
    writesEnabled:false,whatsappSendEnabled:false,commercialRidesEnabled:false,
    candidatesReceived:candidates.length,eligibleCount:eligible.length,
    selected:winner?Object.freeze({...winner}):null,
    note:"Resultado fictício por distância em linha reta; não é GPS real, rota ou tempo de chegada."
  });
}
module.exports={distanceMeters,previewNearestPilot};
