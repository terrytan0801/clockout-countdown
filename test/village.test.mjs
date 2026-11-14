// v50: the village. Buildings paid for together (weather station, farm, harbor, cinema), the farm and Mr. Veggie,
// sea fishing at the harbor, weather for everyone, and Fluff's Cloud Shield.
import assert from "node:assert/strict";
import { makeApp, BUILDINGS, BUILD_MS, CROPS, FARM, SEA, FISH, FISHING, cropPrice, veggieman, fishmonger } from "../netlify/lib/handler.mjs";
import { M } from "../netlify/lib/powers.mjs";
import { memStore } from "./mem-store.mjs";

const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification(sub, p) { pushes.push(JSON.parse(p)); } };
const pushes = [];
async function fetchFn(u) {
  const days = ["2026-11-10", "2026-11-11", "2026-11-12"], time = [], t2 = [], pp = [], wc = [];
  for (const d of days) for (let h = 0; h < 24; h++) { time.push(`${d}T${String(h).padStart(2, "0")}:00`); t2.push(30); pp.push(h >= 17 && h <= 18 ? 80 : 10); wc.push(1); }
  return { ok: true, json: async () => ({ hourly: { time, temperature_2m: t2, precipitation_probability: pp, weather_code: wc },
    daily: { time: days, weather_code: [61, 3, 0], temperature_2m_max: [33, 32, 31], temperature_2m_min: [25, 25, 24], precipitation_probability_max: [80, 30, 5] } }) };
}
const SG = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 8, m, 0); // November 2026, Singapore time
let clock = SG(10, 9); // Tue 10 Nov, 9 am
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock, fetchFn, cache: {} });
const call = async (method, path, body, token) => { clock += 1; const r = await app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined })); return { status: r.status, data: await r.json() }; };
const mk = async (name, h = 18) => { const d = (await call("POST", "signup", { name, h, m: 0, pin: "1234" })).data; await call("POST", "me", { action: "region", region: "none" }, d.token); return { t: d.token, id: d.me.id }; };
const give = (who, n) => store._m.set(`led/${who.id}/${String(clock).padStart(13, "0")}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}/${n}/test`, "0");
const st = async (who) => (await call("GET", "state", null, who.t)).data;
const coins = async (who) => (await st(who)).me.coins;

const A = await mk("Ann", 17), B = await mk("Ben"), C = await mk("Cat");
const cave = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave;
for (const x of [B, C]) await call("POST", "cave", { action: "join", code: cave.code }, x.t);
for (const x of [A, B, C]) await call("POST", "ping", { open: true }, x.t);

/* ---------- donations ---------- */
assert.deepEqual(Object.keys(BUILDINGS), ["weather", "farm", "harbor", "cinema", "planner"]);
let v = (await call("GET", "village", null, A.t)).data.village;
assert.equal(v.weather.price, 2000); assert.equal(v.weather.raised, 0); assert.equal(v.weather.openAt, null);
assert.equal((await call("POST", "village/donate", { kind: "castle", amount: 5 }, A.t)).status, 400);
assert.equal((await call("POST", "village/donate", { kind: "weather", amount: 0 }, A.t)).status, 400);
const a0 = await coins(A);
assert.equal((await call("POST", "village/donate", { kind: "weather", amount: a0 + 1 }, A.t)).status, 402, "can't give more than you have");
give(A, 1500); give(B, 1000);
let r = await call("POST", "village/donate", { kind: "weather", amount: 1200 }, A.t);
assert.equal(r.status, 200); assert.equal(r.data.gave, 1200); assert.equal(r.data.village.weather.raised, 1200);
assert.equal(await coins(A), a0 + 1500 - 1200);
assert.ok((await st(A)).me.coinLog.some((e) => e.why === "build.weather" && e.amt === -1200));
r = await call("POST", "village/donate", { kind: "weather", amount: 999 }, B.t); // 800 left: only 800 is taken
assert.equal(r.data.gave, 800); assert.equal(r.data.village.weather.raised, 2000);
assert.deepEqual(r.data.village.weather.donors.map((d) => [d.pid, d.amt]), [[A.id, 1200], [B.id, 800]], "builders, biggest first");
assert.equal(r.data.village.weather.openAt, clock + BUILD_MS, "a day to build");
assert.equal((await call("POST", "village/donate", { kind: "weather", amount: 5 }, C.t)).status, 409, "already paid for");
let s = await st(C);
assert.ok(s.cave.built.weather > clock, "not open yet");

/* ---------- weather station: weather for everyone once open ---------- */
{ const p = JSON.parse(store._m.get(`person/${C.id}`)); p.monster = 0; store._m.set(`person/${C.id}`, JSON.stringify(p)); } // Cat is not a Fluff (monsters are random)
await call("POST", "me", { action: "city", name: "Singapore", lat: 1.3, lon: 103.8 }, C.t); // Cat is not a Fluff
s = await st(C);
assert.equal(s.cave.weather[C.id], undefined, "no weather before it opens");
clock += BUILD_MS;
s = await st(C);
assert.equal(s.cave.station, true);
assert.equal(s.cave.weather[C.id].city, "Singapore"); assert.ok(s.cave.weather[C.id].daily, "the 3-day forecast too");
// rain alert for a non-Fluff, 25-45 min before clock-out (Cat leaves at 6 pm)
await call("POST", "subscribe", { subscription: { endpoint: "https://push.test/c", keys: { p256dh: "k", auth: "a" } } }, C.t);
clock = SG(11, 17, 25); pushes.length = 0;
let ra = await app.rainAlerts();
assert.equal(ra.sent, 1); assert.equal(pushes[0].title, "Weather station: bring an umbrella");

/* ---------- Cloud Shield (Fluff) ---------- */
const fluff = async (who, lv) => { const p = JSON.parse(store._m.get(`person/${who.id}`)); p.monster = M.fluff; await store.setJSON(`person/${who.id}`, p); await store.setJSON(`lvl/${who.id}`, { streak: [0, 3, 7, 14][lv], lastDay: "2026-11-11", best: 14 }); };
give(C, 10000);
await fluff(C, 1);
let z = (await call("POST", "zap", { to: C.id }, A.t)).data;
assert.ok(z.shield > 0 && z.took > 0, "Lv1: part of the grab is kept");
assert.equal(z.shield, Math.ceil((z.took + z.shield) * 0.2));
await fluff(C, 3); clock += 11 * 60e3;
z = (await call("POST", "zap", { to: C.id }, A.t)).data;
assert.equal(z.took, 0); assert.ok(z.shield > 0, "Lv3: the first grab of the day is blocked");
assert.match(pushes.at(-1).body, /cloud shield blocked/);
clock += 11 * 60e3;
z = (await call("POST", "zap", { to: C.id }, A.t)).data;
assert.ok(z.took > 0 && z.shield === Math.ceil((z.took + z.shield) * 0.4), "then 40% is kept");

/* ---------- farm ---------- */
assert.equal((await call("GET", "farm", null, A.t)).status, 409, "no farm yet");
give(A, 5000);
await call("POST", "village/donate", { kind: "farm", amount: 3000 }, A.t);
assert.equal((await call("GET", "farm", null, A.t)).status, 409, "still being built");
clock += BUILD_MS;
let f = (await call("GET", "farm", null, A.t)).data;
assert.equal(f.plots.length, FARM.plots); assert.ok(f.plots.every((p) => !p.crop));
const ca = await coins(A);
r = await call("POST", "farm/plant", { plot: 0, kind: "tomato" }, A.t);
assert.equal(r.status, 200); assert.equal(r.data.plots[0].crop.kind, "tomato"); assert.equal(r.data.plots[0].crop.status, "growing");
assert.equal(await coins(A), ca - CROPS.tomato.seed);
assert.equal((await call("POST", "farm/plant", { plot: 0, kind: "radish" }, B.t)).status, 409, "taken");
assert.equal((await call("POST", "farm/plant", { plot: 9, kind: "radish" }, B.t)).status, 400);
assert.equal((await call("POST", "farm/harvest", { plot: 0 }, A.t)).status, 409, "not ripe");
// Ben waters Ann's tomato: +2 once a day
const cb = await coins(B);
r = await call("POST", "farm/water", { plot: 0 }, B.t);
assert.equal(r.data.tip, FARM.tip); assert.deepEqual(r.data.plots[0].crop.waterers, [B.id]);
clock += 2 * 60e3;
assert.equal((await call("POST", "farm/water", { plot: 0 }, B.t)).data.tip, 0, "one tip a day per crop");
assert.equal(await coins(B), cb + FARM.tip);
assert.equal((await call("POST", "farm/harvest", { plot: 0 }, B.t)).status, 403, "only the planter picks");
clock += 24 * 3600e3;
r = await call("POST", "farm/harvest", { plot: 0 }, A.t);
assert.equal(r.status, 200); assert.equal(r.data.crop.kind, "tomato"); assert.ok([1, 2, 3].includes(r.data.crop.size));
assert.equal(r.data.plots[0].crop, null);
s = await st(A);
const tom = s.me.bag.find((x) => x.kind === "tomato");
assert.ok(tom && tom.crop); assert.equal(tom.worth, cropPrice("tomato", tom.size, s.veggie.wants));
assert.equal(store._m.size > 0 && [...store._m.keys()].some((k) => k.startsWith(`pw/${cave.id}/`)), false, "water records go with the crop");
// a crop nobody waters for a day dies; anyone can clear it
await call("POST", "farm/plant", { plot: 1, kind: "pumpkin" }, A.t);
clock += 25 * 3600e3;
f = (await call("GET", "farm", null, B.t)).data;
assert.equal(f.plots[1].crop.status, "dead");
assert.equal((await call("POST", "farm/water", { plot: 1 }, B.t)).status, 409);
assert.equal((await call("POST", "farm/clear", { plot: 1 }, B.t)).status, 200);
// watered every day, a pumpkin makes it to day 3
await call("POST", "farm/plant", { plot: 1, kind: "pumpkin" }, A.t);
for (let d = 0; d < 3; d++) { clock += 20 * 3600e3; await call("POST", "farm/water", { plot: 1 }, C.t); }
clock += 13 * 3600e3;
assert.equal((await call("GET", "farm", null, A.t)).data.plots[1].crop.status, "ripe");
clock += 5 * 24 * 3600e3;
assert.equal((await call("GET", "farm", null, A.t)).data.plots[1].crop.status, "ripe", "ripe crops wait for you");
// Mr. Veggie: 8-10 am and 5-7 pm
clock = SG(20, 11);
assert.equal((await call("POST", "farm/sell", {}, A.t)).status, 409, "not here at 11 am");
clock = SG(20, 17, 30);
const cs = await coins(A), worth = (await st(A)).me.bag.filter((x) => x.crop).reduce((n, x) => n + x.worth, 0);
r = await call("POST", "farm/sell", {}, A.t);
assert.equal(r.data.won, worth); assert.equal(await coins(A), cs + worth);
assert.equal((await st(A)).me.bag.filter((x) => x.crop).length, 0);
assert.ok(veggieman(SG(20, 9)).from <= SG(20, 9)); assert.ok(Object.keys(CROPS).includes(veggieman(SG(20, 9)).wants));

/* ---------- harbor ---------- */
assert.equal((await call("POST", "fish/cast", { spot: "sea" }, A.t)).status, 409, "no harbor yet");
assert.equal(Object.values(SEA).reduce((n, w) => n + w, 0), 10000);
for (const k of FISHING.legend) assert.ok(SEA[k] / 10000 < 0.001, k + " still under 0.1% at sea");
for (const [k, f] of Object.entries(FISH)) if (f.sea) assert.equal(f.w, 0, k + " never bites in the pond");
assert.ok(!Object.values(FISH).some((f) => f.sea) || Object.keys(FISH).filter((k) => FISH[k].sea).every((k) => !Array.from({ length: 30 }, (_, d) => fishmonger(SG(1, 13) + d * 864e5).wants).includes(k)), "he never asks for sea fish");
give(A, 5000);
await call("POST", "village/donate", { kind: "harbor", amount: 4000 }, A.t);
clock += BUILD_MS; clock = SG(22, 15); // 3 pm: normally Mr. Fishfish isn't here
s = await st(A);
assert.equal(s.fishfish.allDay, true, "he's at the harbor all day");
const seen = new Set();
for (let i = 0; i < 300; i++) { const c = (await call("POST", "fish/cast", { spot: "sea" }, A.t)).data; seen.add(c.kind); await call("POST", "fish/land", { ok: false }, A.t); }
assert.ok(seen.has("squid") && seen.has("tuna"), [...seen].join(","));
assert.ok(!seen.has("tadpole") && !seen.has("carp"), "no pond fish at sea");
const c1 = (await call("POST", "fish/cast", { spot: "sea" }, A.t)).data;
await call("POST", "fish/land", { ok: true }, A.t);
r = await call("POST", "fish/sell", {}, A.t);
assert.equal(r.status, 200, "selling at 3 pm works with a harbor"); void c1;

/* ---------- cinema: just a building, the app plays the week's clips ---------- */
give(B, 6000);
r = await call("POST", "village/donate", { kind: "cinema", amount: 9999 }, B.t);
assert.equal(r.data.gave, 5000);
clock += BUILD_MS;
s = await st(B);
assert.deepEqual(Object.keys(s.cave.built).sort(), ["cinema", "farm", "harbor", "weather"]);
assert.ok(Object.values(s.cave.built).every((at) => at <= clock));

/* ---------- holiday planner (v51) ---------- */
clock = SG(23, 9);
await call("POST", "me", { action: "region", region: "sg" }, A.t); await call("POST", "me", { action: "region", region: "sg" }, B.t);
assert.equal((await call("GET", "planner", null, A.t)).status, 409, "not built yet");
give(A, 3000);
assert.equal((await call("POST", "village/donate", { kind: "planner", amount: 2500 }, A.t)).data.gave, 2500);
clock += BUILD_MS;
let pl = (await call("GET", "planner", null, A.t)).data;
assert.equal(pl.region, "sg");
const xmas = pl.ideas.find((i) => i.from === "2026-12-24" && i.to === "2026-12-27");
assert.ok(xmas, "take Thu 24 Dec off: Christmas becomes 4 days");
assert.deepEqual(xmas.leave, ["2026-12-24"]); assert.equal(xmas.days, 4); assert.equal(xmas.holidays[0].name, "Christmas Day");
assert.ok(pl.ideas.some((i) => i.from === "2026-12-25" && i.to === "2027-01-03" && i.leave.length === 4), "4 days of leave: 10 days over Christmas and New Year");
assert.ok(pl.ideas.some((i) => i.leave.length === 0 && i.from === "2026-12-25" && i.days === 3), "the plain long weekend");
assert.ok(pl.ideas.every((i) => i.leave.every((d) => d > "2026-11-23")), "only future leave");
// booking it marks the days off; friends see who's taking it
pl = (await call("POST", "planner/take", { id: xmas.id, on: true }, A.t)).data;
assert.deepEqual(pl.planned, ["2026-12-24"]);
assert.deepEqual(pl.ideas.find((i) => i.id === xmas.id).takers, [A.id]);
await call("POST", "planner/take", { id: xmas.id, on: true }, B.t);
assert.deepEqual((await call("GET", "planner", null, B.t)).data.ideas.find((i) => i.id === xmas.id).takers.sort(), [A.id, B.id].sort());
assert.equal((await call("POST", "planner/take", { id: "nope", on: true }, A.t)).status, 404);
clock = SG(24 + 30, 12); // Thu 24 Dec, noon: Ann's planned day off is a day off
s = await st(A);
assert.equal(s.me.off && s.me.off.kind, "leave");
assert.ok(s.cave.members.find((p) => p.id === B.id).off, "and the cave sees Ben's too");
clock = SG(25, 9); // back to November, after it opened
pl = (await call("POST", "planner/take", { id: xmas.id, on: false }, A.t)).data;
assert.deepEqual(pl.planned, []); assert.deepEqual(pl.ideas.find((i) => i.id === xmas.id).takers, [B.id]);
// a tip 3 weeks before the leave day, at 10 am, once
pushes.length = 0;
await call("POST", "subscribe", { subscription: { endpoint: "https://push.test/a", keys: { p256dh: "k", auth: "a" } } }, A.t);
clock = SG(3 + 30, 9, 30); assert.equal((await app.holidayTips()).sent, 0, "not before 10 am");
clock = SG(3 + 30, 10, 5); // Thu 3 Dec = 21 days before Thu 24 Dec
let tip = await app.holidayTips();
assert.ok(tip.sent >= 1); assert.match(pushes.find((x) => x.tag === "holiday").title, /4 days off for 1 day of leave/);
assert.match(pushes.find((x) => x.tag === "holiday").body, /Thu 24 Dec/);
assert.equal((await app.holidayTips()).sent, 0, "once a day");
clock = SG(23, 9);

/* ---------- the last one out takes the village with them ---------- */
for (const x of [A, B, C]) await call("POST", "cave", { action: "leave" }, x.t);
assert.deepEqual([...store._m.keys()].filter((k) => /^(don|built|builtlock|plot|pw)\//.test(k)), []);
console.log("All village checks passed.");
