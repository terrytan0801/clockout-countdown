// Builds public/food-<region>.json: every named restaurant, fast-food place and food court in a region, from
// OpenStreetMap (© OpenStreetMap contributors, ODbL). FoodSpin filters it on the phone, so it doesn't wait on
// the busy public Overpass servers. Run now and then to refresh:
//   node scripts/food-data.mjs            all regions
//   node scripts/food-data.mjs jb kl      just those
// The boxes here must match FS_REGIONS in public/index.html.
import fs from "node:fs";

const REGIONS = {
  sg: [1.15, 103.59, 1.48, 104.1], // Singapore (south, west, north, east)
  jb: [1.38, 103.55, 1.66, 103.98], // Johor Bahru, Iskandar Puteri, Pasir Gudang
  kl: [2.85, 101.35, 3.35, 101.85], // Kuala Lumpur and the Klang Valley
};
const SERVERS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
const TILE = 0.09; // degrees: a whole region in one query times out on the public servers, so it goes in small tiles
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function tile(s, w, n, e) {
  const q = `[out:json][timeout:90];(nwr["amenity"~"^(restaurant|fast_food|food_court|cafe)$"]["name"](${s},${w},${n},${e});nwr["shop"="bakery"]["name"](${s},${w},${n},${e}););out center tags;`;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const u of SERVERS) {
      const t = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 120000);
      try {
        const r = await fetch(u, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ClockoutCountdown/1.0 (FoodSpin data build)" }, body: "data=" + encodeURIComponent(q) });
        if (r.ok) { const d = await r.json(); console.log(`  ${u.split("/")[2]} ${Date.now() - t}ms ${d.elements.length}`); return d.elements; }
        console.log(`  ${u.split("/")[2]} ${r.status} ${Date.now() - t}ms`);
      } catch (err) { console.log(`  ${u.split("/")[2]} ${err.name}`); } finally { clearTimeout(timer); }
      await wait(3000);
    }
    await wait(20000);
  }
  throw new Error(`tile ${s},${w} failed`);
}

async function build(id) {
  const [S0, W0, N0, E0] = REGIONS[id], ny = Math.ceil((N0 - S0) / TILE), nx = Math.ceil((E0 - W0) / TILE), dy = (N0 - S0) / ny, dx = (E0 - W0) / nx;
  const elements = [];
  for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
    const s = +(S0 + i * dy).toFixed(4), w = +(W0 + j * dx).toFixed(4);
    console.log(`${id} tile ${i * nx + j + 1}/${nx * ny}`);
    elements.push(...(await tile(s, w, +(s + dy).toFixed(4), +(w + dx).toFixed(4))));
  }
  const T = { restaurant: "r", fast_food: "f", food_court: "c", cafe: "k" }, kind = (t) => (t.shop === "bakery" ? "b" : T[t.amenity]), seen = new Set(), out = [];
  for (const e of elements) {
    const t = e.tags || {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, name = String(t["name:en"] || t.name || "").trim().slice(0, 60);
    if (!name || lat == null || !kind(t)) continue;
    const key = name.toLowerCase() + "|" + lat.toFixed(3) + "|" + lon.toFixed(3); // same name far apart = different branches
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([name, +lat.toFixed(5), +lon.toFixed(5), kind(t), String(t.cuisine || "").split(/[;,]/)[0].trim().slice(0, 24)]);
  }
  if (out.length < 300) throw new Error(`${id}: suspiciously few places (${out.length})`);
  const file = `public/food-${id}.json`;
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString().slice(0, 10), bbox: REGIONS[id], src: "© OpenStreetMap contributors (ODbL)", p: out }));
  console.log(`${id}: ${out.length} places, ${fs.statSync(file).size} bytes`);
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(REGIONS);
for (const id of ids) {
  if (!REGIONS[id]) { console.error("unknown region", id); process.exit(1); }
  await build(id);
}
