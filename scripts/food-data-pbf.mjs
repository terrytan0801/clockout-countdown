// Builds public/food-<region>.json (restaurants, fast food, food courts, cafes and bakeries) from a Geofabrik extract instead of the public Overpass servers (which are often
// too busy to answer). Same output as scripts/food-data.mjs. © OpenStreetMap contributors, ODbL.
//   1. download https://download.geofabrik.de/asia/malaysia-singapore-brunei-latest.osm.pbf (about 250 MB)
//   2. npm i --no-save osm-pbf-parser@2.3.0   (or point PBF_TOOL at a folder that has it in node_modules)
//   3. node scripts/food-data-pbf.mjs <file.osm.pbf> [region ...]
// Places drawn as buildings (many hawker centres) are ways: a second pass fetches their corners to find the middle.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(process.env.PBF_TOOL ? path.join(process.env.PBF_TOOL, "x.js") : import.meta.url);
const parser = require("osm-pbf-parser");

// must match FS_REGIONS in public/index.html and REGIONS in scripts/food-data.mjs
const REGIONS = { sg: [1.15, 103.59, 1.48, 104.1], jb: [1.38, 103.55, 1.66, 103.98], kl: [2.85, 101.35, 3.35, 101.85] };
const [file, ...want] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) { console.error("usage: node scripts/food-data-pbf.mjs <file.osm.pbf> [region ...]"); process.exit(1); }
const ids = want.length ? want : Object.keys(REGIONS);
const T = { restaurant: "r", fast_food: "f", food_court: "c", cafe: "k" }; // plus shop=bakery as "b"
const kind = (t) => (t.shop === "bakery" ? "b" : T[t.amenity]);
const inAny = (lat, lon) => ids.some((k) => { const b = REGIONS[k]; return lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3]; });

function pass(onItem) {
  return new Promise((ok, bad) => {
    const p = parser();
    p.on("data", (items) => { for (const it of items) onItem(it); });
    p.on("end", ok); p.on("error", bad);
    fs.createReadStream(file).on("error", bad).pipe(p);
  });
}

const places = [], ways = []; // ways: [tags, refs]
await pass((it) => {
  const t = it.tags;
  if (!t || !kind(t) || !(t["name:en"] || t.name)) return;
  if (it.type === "node") { if (inAny(it.lat, it.lon)) places.push([t, it.lat, it.lon]); }
  else if (it.type === "way" && it.refs && it.refs.length) ways.push([t, it.refs]);
});
console.log("pass 1:", places.length, "nodes,", ways.length, "ways");

const need = new Map();
for (const [, refs] of ways) for (const r of refs) need.set(r, null);
await pass((it) => { if (it.type === "node" && need.has(it.id)) need.set(it.id, [it.lat, it.lon]); });
for (const [t, refs] of ways) {
  const pts = refs.map((r) => need.get(r)).filter(Boolean);
  if (!pts.length) continue;
  const lat = pts.reduce((a, p) => a + p[0], 0) / pts.length, lon = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  if (inAny(lat, lon)) places.push([t, lat, lon]);
}
console.log("pass 2: with buildings", places.length);

for (const id of ids) {
  const b = REGIONS[id], seen = new Set(), out = [];
  for (const [t, lat, lon] of places) {
    if (lat < b[0] || lat > b[2] || lon < b[1] || lon > b[3]) continue;
    const name = String(t["name:en"] || t.name).trim().slice(0, 60), key = name.toLowerCase() + "|" + lat.toFixed(3) + "|" + lon.toFixed(3);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push([name, +lat.toFixed(5), +lon.toFixed(5), kind(t), String(t.cuisine || "").split(/[;,]/)[0].trim().slice(0, 24)]);
  }
  if (out.length < 300) throw new Error(`${id}: suspiciously few places (${out.length})`);
  const f = `public/food-${id}.json`;
  fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString().slice(0, 10), bbox: b, src: "© OpenStreetMap contributors (ODbL)", p: out }));
  console.log(`${id}: ${out.length} places, ${fs.statSync(f).size} bytes`);
}
