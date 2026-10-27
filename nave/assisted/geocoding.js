"use strict";
const { inArea } = require("../core/road-eta-preview");
const ENDPOINT = "https://photon.komoot.io/api/";
function createGeocoding({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  let last = -Infinity, busy = false;
  return async body => {
    if (!body || body.consentExternalSearch !== true || body.testOnly !== true || typeof body.query !== "string") throw new Error("invalid_search");
    const query = body.query.trim().replace(/\s+/g, " ");
    if (query.length < 5 || query.length > 240 || /[\u0000-\u001f]/.test(query)) throw new Error("invalid_search");
    // Single free test instance. No queue, autocomplete flood, or address cache.
    if (busy || now() - last < 1500) throw new Error("search_cooldown");
    busy = true; last = now();
    try {
      const url = new URL(ENDPOINT);
      // The public demo rejects lang=pt with HTTP 400. Use original local names.
      url.search = new URLSearchParams({ q: query, limit: "5", lang: "default", bbox: "-55.7,-26.5,-52.4,-24.4", lat: "-24.724", lon: "-53.744" }).toString();
      const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(7000), headers: { Accept: "application/json", "User-Agent": "NAVE-Assistido-Testes/1.0 (+https://nave-assistido-homologacao.onrender.com/assistido/)" } });
      if (!response.ok) throw new Error("search_unavailable");
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 131072) throw new Error("search_response_too_large"); chunks.push(chunk); }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(data.features)) throw new Error("invalid_search_response");
      const results = [];
      for (const f of data.features.slice(0, 20)) {
        const coords = f?.geometry?.coordinates, p = f?.properties;
        if (f?.geometry?.type !== "Point" || !Array.isArray(coords) || coords.length !== 2 || !inArea({ lat: coords[1], lng: coords[0] }) || !p || (p.countrycode && p.countrycode.toUpperCase() !== "BR")) continue;
        const parts = [p.name, [p.street, p.housenumber].filter(v => typeof v === "string").join(", "), p.district, p.city, p.state].filter(v => typeof v === "string" && v.trim());
        const label = [...new Set(parts)].join(" · ").slice(0, 240);
        if (label.length >= 3) results.push({ label, point: { lat: coords[1], lng: coords[0] } });
        if (results.length === 5) break;
      }
      return { results, provider: "Photon · OpenStreetMap", approximate: true };
    } finally { busy = false; }
  };
}
module.exports = { createGeocoding, ENDPOINT };
