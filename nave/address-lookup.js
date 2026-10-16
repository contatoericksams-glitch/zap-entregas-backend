"use strict";
// Public geocoding with a limited OSM Nominatim query and Photon backup.
// Only lookup of fictitious rides; no known-coordinate database or paid API.
// A public provider may return approximate positions. Always allow a WhatsApp map pin.
function createAddressLookup({getJson, insideTestArea, sleep = ms => new Promise(r=>setTimeout(r,ms)), clock=()=>Date.now()}) {
  if(typeof getJson!=="function"||typeof insideTestArea!=="function") throw new TypeError("Missing geocoding dependencies");
  const cache=new Map();
  let queue=Promise.resolve(),lastQueryAt=0;
  const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const bounds="-55.7,-24.4,-52.4,-26.5";
  const headers={
    "User-Agent":"NAVE-WhatsApp-Pilot/1.2 (contact: contato.ericksams@gmail.com)",
    "Accept-Language":"pt-BR",
  };
  function valid(lat,lng,name,requested) {
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||!insideTestArea(lat,lng))return false;
    // Never silently resolve a Toledo-specific request to some other city in the west of Paraná.
    if(/\btoledo\b/i.test(normalize(requested))&&!normalize(name).includes("toledo"))return false;
    return true;
  }
  function findNominatim(data,input) {
    if(!Array.isArray(data))return null;
    for(const item of data) {
      const lat=Number(item.lat),lng=Number(item.lon);
      if(valid(lat,lng,item.display_name,input))return {lat,lng,label:String(input).trim().slice(0,300)};
    }
    return null;
  }
  function findPhoton(data,input) {
    for(const item of (Array.isArray(data?.features)?data.features:[])) {
      const xy=item.geometry?.coordinates;
      if(!Array.isArray(xy)||xy.length<2)continue;
      const lng=Number(xy[0]),lat=Number(xy[1]);
      const p=item.properties||{};
      const context=[p.name,p.street,p.city,p.town,p.municipality,p.county,p.state].filter(Boolean).join(", ");
      if(valid(lat,lng,context,input))return {lat,lng,label:String(input).trim().slice(0,300)};
    }
    return null;
  }
  function lookup(input) {
    const key=normalize(input).trim();
    if(key.length<5)return Promise.resolve(null);
    if(cache.has(key))return Promise.resolve(cache.get(key));
    const task=queue.catch(()=>{}).then(async()=>{
      const remaining=Math.max(0,lastQueryAt+1150-clock());
      if(remaining)await sleep(remaining);
      lastQueryAt=clock();
      const q=/(?:parana|paraná|brasil|brazil|\bpr\b)/i.test(input)?input:input+", Paraná, Brasil";
      const n=new URL("https://nominatim.openstreetmap.org/search");
      n.searchParams.set("q",q);
      n.searchParams.set("format","json");
      n.searchParams.set("limit","3");
      n.searchParams.set("countrycodes","br");
      n.searchParams.set("viewbox",bounds);
      n.searchParams.set("bounded","1");
      try {
        const p=findNominatim(await getJson(n.toString(),headers,3000),input);
        if(p){if(cache.size>=100)cache.clear();cache.set(key,p);return p;}
      } catch(e) { /* Other public provider will be tried; never log the passenger's address. */ }
      const p=new URL("https://photon.komoot.io/api/");
      p.searchParams.set("q",q);
      p.searchParams.set("limit","5");
      p.searchParams.set("lang","pt");
      try {
        const v=findPhoton(await getJson(p.toString(),headers,3500),input);
        if(v){if(cache.size>=100)cache.clear();cache.set(key,v);}
        return v;
      } catch(e) {
        // Fail closed instead of assuming the city's center or inventing coordinates.
        throw new Error("geocoding_providers_unavailable");
      }
    });
    queue=task.catch(()=>{});
    return task;
  }
  return lookup;
}
module.exports={createAddressLookup};
