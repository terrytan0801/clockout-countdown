// Builds public/food-sg.json: every named restaurant, fast-food place and food court in Singapore, from
// OpenStreetMap (© OpenStreetMap contributors, ODbL). FoodSpin filters it on the phone, so it doesn't wait on
// the busy public Overpass servers. Run now and then to refresh: node scripts/food-data.mjs
import fs from "node:fs";

const BBOX = [1.15, 103.59, 1.48, 104.1]; // south, west, north, east
const SERVERS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
// The whole island in one query times out on the public servers, so it goes in a 4x4 grid of small queries.
const N = 4, wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function tile(s, w, n, e) {
  const q = `[out:json][timeout:90];nwr["amenity"~"^(restaurant|fast_food|food_court)$"]["name"](${s},${w},${n},${e});out center tags;`;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const u of SERVERS) {
      const t = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
      try {
        const r = await fetch(u, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ClockoutCountdown/1.0 (FoodSpin data build)" }, body: "data=" + encodeURIComponent(q) });
        if (r.ok) { const d = await r.json(); console.log(`  ${u.split("/")[2]} ${Date.now() - t}ms ${d.elements.length}`); return d.elements; }
        console.log(`  ${u.split("/")[2]} ${r.status} ${Date.now() - t}ms`);
      } catch (err) { console.log(`  ${u.split("/")[2]} ${err.name}`); } finally { clearTimeout(timer); }
      await wait(3000);
    }
    await wait(15000);
  }
  throw new Error(`tile ${s},${w} failed`);
}
const elements = [], [S0, W0, N0, E0] = BBOX, dy = (N0 - S0) / N, dx = (E0 - W0) / N;
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const s = +(S0 + i * dy).toFixed(4), w = +(W0 + j * dx).toFixed(4);
  console.log(`tile ${i * N + j + 1}/${N * N}`);
  elements.push(...(await tile(s, w, +(s + dy).toFixed(4), +(w + dx).toFixed(4))));
}

const T = { restaurant: "r", fast_food: "f", food_court: "c" }, seen = new Set(), out = [];
for (const e of elements) {
  const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, name = String(t["name:en"] || t.name || "").trim().slice(0, 60);
  if (!name || lat == null) continue;
  const key = name.toLowerCase() + "|" + lat.toFixed(3) + "|" + lon.toFixed(3); // same name far apart = different branches
  if (seen.has(key)) continue;
  seen.add(key);
  out.push([name, +lat.toFixed(5), +lon.toFixed(5), T[t.amenity], String(t.cuisine || "").split(/[;,]/)[0].trim().slice(0, 24)]);
}
console.assert(out.length > 1000, "suspiciously few places: " + out.length);
fs.writeFileSync("public/food-sg.json", JSON.stringify({ at: new Date().toISOString().slice(0, 10), bbox: BBOX, src: "© OpenStreetMap contributors (ODbL)", p: out }));
console.log("places", out.length, "bytes", fs.statSync("public/food-sg.json").size);
