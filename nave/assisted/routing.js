"use strict";
const { inArea } = require("../core/road-eta-preview");
const { distanceMeters } = require("../core/nearest-pilot-preview");
const PUBLIC_ENDPOINT = "https://routing.openstreetmap.de/routed-car/route/v1/driving/";
function validatePoints(body) {
  if (!body || body.testOnly !== true || body.consentExternalRouting !== true || !inArea(body.pickup) || !inArea(body.destination)) throw new Error("invalid_points_or_consent");
  const straight = distanceMeters(body.pickup, body.destination);
  if (straight < 50 || straight > 25000) throw new Error("invalid_local_distance");
  return straight;
}
function createRouting({ fetchImpl = fetch, now = () => Date.now(), endpoint = PUBLIC_ENDPOINT, allowFixture = false } = {}) {
  const target = new URL(endpoint);
  if (endpoint !== PUBLIC_ENDPOINT && !(allowFixture && target.protocol === "http:" && target.hostname === "127.0.0.1" && !target.username && !target.password)) throw new Error("invalid_routing_provider");
  let last = -Infinity, busy = false;
  const cache = new Map();
  return async body => {
    const straight = validatePoints(body), current = now();
    const points = { pickup: { lat: body.pickup.lat, lng: body.pickup.lng }, destination: { lat: body.destination.lat, lng: body.destination.lng } };
    const key = JSON.stringify(points);
    for (const [k, v] of cache) if (v.until <= current) cache.delete(k);
    if (cache.has(key)) return cache.get(key).route;
    // One process/instance only: never queue bursts against the public provider.
    if (busy || current - last < 1100) throw new Error("routing_cooldown");
    busy = true; last = current;
    try {
      const coords = `${points.pickup.lng},${points.pickup.lat};${points.destination.lng},${points.destination.lat}`;
      const url = new URL(coords, endpoint);
      url.search = "overview=simplified&geometries=geojson&steps=false&alternatives=false";
      const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(7000), headers: { Accept: "application/json", "User-Agent": "NAVE-Assistido-Testes/1.0 (+https://nave-assistido-homologacao.onrender.com/assistido/)" } });
      if (!response.ok) throw new Error("provider_unavailable");
      let raw = "", bytes = 0;
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 262144) throw new Error("provider_response_too_large"); raw += Buffer.from(chunk).toString("utf8"); }
      const data = JSON.parse(raw), route = data?.routes?.[0], line = route?.geometry?.coordinates;
      if (data.code !== "Ok" || !route || !Number.isFinite(route.distance) || route.distance < straight * .7 || route.distance > 70000 || !Number.isFinite(route.duration) || route.duration < 10 || route.duration > 14400 || route.geometry.type !== "LineString" || !Array.isArray(line) || line.length < 2 || line.length > 5000 || line.some(p => !Array.isArray(p) || p.length !== 2 || !inArea({ lat: p[1], lng: p[0] }))) throw new Error("invalid_provider_route");
      for (const [p, snap] of [[points.pickup, line[0]], [points.destination, line.at(-1)]]) if (distanceMeters(p, { lat: snap[1], lng: snap[0] }) > 500) throw new Error("points_too_far_from_road");
      const result = { schemaVersion: 1, testOnly: true, points, distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration), geometry: { type: "LineString", coordinates: line }, provider: "OSRM/FOSSGIS · OpenStreetMap", trafficAware: false, calculatedAt: new Date(current).toISOString() };
      if (cache.size >= 50) cache.delete(cache.keys().next().value);
      const entry = { until: current + 300000, route: result };
      cache.set(key, entry); setTimeout(() => { if (cache.get(key) === entry) cache.delete(key); }, 300000).unref();
      return result;
    } finally { busy = false; }
  };
}
module.exports = { createRouting, validatePoints, PUBLIC_ENDPOINT };
