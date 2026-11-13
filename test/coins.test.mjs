// v44: monster coins. Wages, streak bonus, filming, zap loot, fishing, little jobs at home, and the shop.
import assert from "node:assert/strict";
import { makeApp, COINS, SHOP } from "../netlify/lib/handler.mjs";
import { ringTimes } from "../netlify/lib/clips.mjs";
import { memStore } from "./mem-store.mjs";

const pushes = [];
const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification(sub, p) { pushes.push(JSON.parse(p)); } };
const SG = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 8, m, 0); // November 2026, Singapore time
let clock = SG(10, 9); // Tue 10 Nov, 9 am
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock, cache: {} });
const raw = (method, path, body, token) => { clock += 1; return app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined })); };
const call = async (...a) => { const r = await raw(...a); return { status: r.status, data: await r.json() }; };
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 18, m: 0, pin: "1234" })).data; await call("POST", "me", { action: "region", region: "none" }, d.token); return { t: d.token, id: d.me.id }; };
const me = async (who) => (await call("GET", "state", null, who.t)).data.me;
const coins = async (who) => (await me(who)).coins;
const open = (who) => call("POST", "ping", { open: true }, who.t);
const give = (who, n) => store._m.set(`led/${who.id}/${String(clock).padStart(13, "0")}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}/${n}/test`, "0");

const A = await mk("Ann"), B = await mk("Ben"), C = await mk("Cat");
const cave = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave;
for (const x of [B, C]) await call("POST", "cave", { action: "join", code: cave.code }, x.t);
// Monsters are random at sign-up; a Fluff's Cloud Shield (v50) would change the zap numbers, so nobody here is a Fluff.
for (const x of [A, B, C]) { const p = JSON.parse(store._m.get(`person/${x.id}`)); p.monster = 0; store._m.set(`person/${x.id}`, JSON.stringify(p)); }

/* ---------- welcome coins, then wages ---------- */
assert.equal(await coins(A), 0, "nothing until the app has been opened");
await open(A);
assert.equal(await coins(A), COINS.welcome, "100 welcome coins, and no wage before clock-out");
await open(A); await open(A);
assert.equal(await coins(A), COINS.welcome, "the welcome comes once");
clock = SG(10, 18, 1); await open(A);
assert.equal(await coins(A), COINS.welcome + COINS.day, "paid at clock-out time");
clock = SG(10, 21); await open(A);
assert.equal(await coins(A), COINS.welcome + COINS.day, "one wage a day");
// a new server (nothing remembered) doesn't pay twice either
const app2 = makeApp({ store, webpush, now: () => clock, cache: {} });
await app2.handle(new Request("https://x.test/api/ping", { method: "POST", headers: { authorization: "Bearer " + A.t }, body: "{}" }));
assert.equal(await coins(A), COINS.welcome + COINS.day);
let log = (await me(A)).coinLog;
assert.deepEqual(log.map((e) => [e.amt, e.why]), [[100, "welcome"], [50, "pay.2026-11-10"]]);

// Wed: only opened in the morning, so that day is paid the next time the app is opened
clock = SG(11, 9); await open(A);
assert.equal(await coins(A), 150);
clock = SG(12, 8); await open(A);
assert.equal(await coins(A), 200, "yesterday's wage arrives");
// Thu and Fri worked; the weekend pays nothing; a day off pays nothing
clock = SG(12, 19); await open(A); assert.equal(await coins(A), 250);
clock = SG(13, 19); await open(A); assert.equal(await coins(A), 300);
clock = SG(14, 19); await open(A); clock = SG(15, 19); await open(A);
assert.equal(await coins(A), 300, "Saturday and Sunday: no wage");
// Mon is the 5th workday in a row: wage + streak bonus
clock = SG(16, 19); await open(A);
assert.equal(await coins(A), 300 + COINS.day + COINS.streak, "5 workdays in a row");
assert.ok((await me(A)).coinLog.some((e) => e.why === "streak.5"));
clock = SG(17, 9); await call("POST", "me", { action: "dayoff", on: true }, A.t);
clock = SG(17, 19); await open(A);
assert.equal(await coins(A), 400, "a day off isn't paid");
// overtime changes nothing: still one wage
clock = SG(18, 9); await call("POST", "ot", { on: true, end: null }, A.t); clock = SG(18, 23); await open(A);
assert.equal(await coins(A), 450);

/* ---------- filming ---------- */
const upload = async (who) => {
  clock += 1;
  const fd = new FormData();
  fd.append("video", new Blob([new Uint8Array(30_000).fill(7)], { type: "video/mp4" }), "clip"); fd.append("dur", "3");
  return (await app.handle(new Request("https://x.test/api/clip", { method: "POST", headers: { authorization: "Bearer " + who.t }, body: fd }))).status;
};
const rings = ringTimes(cave.id, "2026-11-19");
clock = rings[0] + 60e3; assert.equal(await upload(A), 200);
assert.equal(await coins(A), 450 + COINS.clip, "on time");
assert.equal(await upload(A), 200);
assert.equal(await coins(A), 450 + COINS.clip, "a retake isn't paid again");
clock = rings[1] + 30 * 60e3; assert.equal(await upload(A), 200);
assert.equal(await coins(A), 450 + COINS.clip + COINS.clipLate, "late");

/* ---------- zap loot ---------- */
await call("POST", "subscribe", { subscription: { endpoint: "https://push.test/a", keys: { p256dh: "k", auth: "a" } } }, A.t);
await open(B); // Ben: 100 welcome
give(B, 900);  // Ben now has 1000
const a0 = await coins(A), b0 = await coins(B);
assert.equal(b0, 1000 + ((await me(B)).coinLog.filter((e) => e.why.startsWith("pay.")).length * 50));
const vA = (await call("GET", "state", null, A.t)).data.v;
pushes.length = 0;
let z = (await call("POST", "zap", { to: A.id }, B.t)).data;
const pct = z.took / a0 * 100;
assert.ok(z.took >= Math.floor(a0 * 0.01) && z.took <= Math.floor(a0 * 0.10), `took ${z.took} of ${a0} (${pct.toFixed(1)}%)`);
assert.equal(await coins(A), a0 - z.took); assert.equal(await coins(B), b0 + z.took, "what one loses the other gets");
assert.match(pushes[0].body, new RegExp(`took ${z.took} of your monster coins`));
assert.equal((await call("GET", "state?v=" + encodeURIComponent(vA), null, A.t)).data.same, undefined, "Ann's phone sees the loss on its next check");
assert.ok((await me(A)).coinLog.some((e) => e.why === `zapby.${B.id}` && e.amt === -z.took));
clock += 11 * 60e3; // cooldown over
const a2 = await coins(A);
z = (await call("POST", "zap", { to: A.id }, B.t)).data;
assert.ok(z.took >= Math.floor(a2 * 0.01) && z.took <= Math.floor(a2 * 0.10) && z.took > 0, "v48: every zap takes coins, not just the first of the day");
assert.equal(await coins(A), a2 - z.took);
// with a safe at home, half of Ann's coins are out of reach
give(A, 100000);
await call("POST", "home", { action: "add", kind: "safe", x: 500, y: 900 }, A.t);
const a1 = await coins(A);
for (let i = 0; i < 12; i++) { // 12 zaps from Cat: never more than 10% of half
  clock += 11 * 60e3;
  const before = await coins(A), took = (await call("POST", "zap", { to: A.id }, C.t)).data.took;
  assert.ok(took <= Math.floor(Math.floor(before * COINS.safeKeeps) * 0.10) && took >= Math.floor(Math.floor(before * COINS.safeKeeps) * 0.01), `safe: took ${took} of ${before}`);
}
assert.ok(a1 > 0);
// someone who has never opened the app since coins came gets the 100 welcome coins when first zapped, so there's something to take
const Z = await mk("Zed"); await call("POST", "cave", { action: "join", code: cave.code }, Z.t);
assert.equal(store._m.has(`paid/${Z.id}/welcome`), false);
const zt = (await call("POST", "zap", { to: Z.id }, B.t)).data.took;
assert.ok(zt >= 1 && zt <= 10, `took ${zt} of Zed's 100 welcome coins`);
assert.equal(await coins(Z), 100 - zt);
await open(Z); assert.equal((await me(Z)).coinLog.filter((e) => e.why === "welcome").length, 1, "opening the app later doesn't pay the welcome twice");
// someone with nothing loses nothing
const Y = await mk("Yan"); await call("POST", "cave", { action: "join", code: cave.code }, Y.t);
store._m.set(`paid/${Y.id}/welcome`, "0"); // welcomed, and it's all spent
assert.equal((await call("POST", "zap", { to: Y.id }, B.t)).data.took, 0);

/* ---------- little jobs at home ---------- */
assert.equal((await call("POST", "coins/act", { what: "water" }, B.t)).status, 404, "no plant yet");
await call("POST", "home", { action: "add", kind: "plant", x: 50, y: 900 }, A.t);
const b2 = await coins(B);
assert.equal((await call("POST", "coins/act", { what: "water" }, B.t)).data.won, COINS.water);
assert.equal((await call("POST", "coins/act", { what: "water" }, B.t)).status, 409);
assert.equal(await coins(B), b2 + COINS.water);
assert.equal((await call("POST", "coins/act", { what: "dance" }, B.t)).status, 400);
assert.deepEqual((await me(B)).did, { water: true, pet: false, vend: false });
const D = await mk("Dee"); await call("POST", "cave", { action: "join", code: cave.code }, D.t);

/* ---------- the shop ---------- */
const E = await mk("Eve"); await call("POST", "cave", { action: "join", code: cave.code }, E.t); await open(E);
const e0 = await coins(E); // welcome coins (and a wage if it's after clock-out)
assert.ok(e0 >= 100 && e0 < SHOP.rocket);
assert.equal((await call("GET", "home", null, E.t)).data.prices.rocket, SHOP.rocket);
let r = await call("POST", "home", { action: "add", kind: "rocket", x: 1, y: 1 }, E.t);
assert.equal(r.status, 402); assert.match(r.data.error, new RegExp(`You need ${SHOP.rocket - e0} more monster coins`));
assert.equal(await coins(E), e0, "nothing taken");
r = await call("POST", "home", { action: "add", kind: "rug", x: 300, y: 950 }, E.t);
assert.equal(r.status, 200); assert.equal(await coins(E), e0 - SHOP.rug);
const rug = r.data.items.find((i) => i.kind === "rug" && i.by === E.id);
assert.equal(rug.paid, SHOP.rug);
// anyone may move it, only Eve may sell it, and she gets half back
assert.equal((await call("POST", "home", { action: "move", id: rug.id, x: 400, y: 950 }, B.t)).status, 200);
assert.equal((await call("POST", "home", { action: "remove", id: rug.id }, B.t)).status, 403);
assert.equal((await call("POST", "home", { action: "remove", id: rug.id }, E.t)).status, 200);
assert.equal(await coins(E), e0 - SHOP.rug + Math.floor(SHOP.rug * COINS.refund));
// something from before v44 (free, no price in its key) can be cleared by its owner for nothing
store._m.set(`hi/${cave.id}/oldthing1/sofa/100/900/0/${E.id}`, "0");
const e3 = await coins(E);
assert.equal((await call("POST", "home", { action: "remove", id: "oldthing1" }, E.t)).status, 200);
assert.equal(await coins(E), e3);
// things left by someone who moved out can be cleared by anyone
r = await call("POST", "home", { action: "add", kind: "poster", x: 10, y: 300 }, E.t);
const poster = r.data.items.find((i) => i.kind === "poster" && i.by === E.id);
await call("POST", "cave", { action: "leave" }, E.t);
const b3 = await coins(B);
assert.equal((await call("POST", "home", { action: "remove", id: poster.id }, B.t)).status, 200);
assert.equal(await coins(B), b3, "no refund for someone else's thing");
// coffee machine: +10 on wages
give(B, 500); await call("POST", "home", { action: "add", kind: "coffee", x: 600, y: 900 }, B.t);
clock = SG(30, 9) + 40 * 864e5; // some Monday-ish workday far ahead; find a weekday
while ([0, 6].includes(new Date(clock + 8 * 3600e3).getUTCDay())) clock += 864e5;
await open(B); const b4 = await coins(B);
clock += 10 * 3600e3; await open(B);
const paidDays = (await me(B)).coinLog.filter((e) => e.why.startsWith("pay.")).pop();
assert.equal(paidDays.amt, COINS.day + COINS.coffee, "wage with the coffee machine");
assert.ok(await coins(B) >= b4 + COINS.day + COINS.coffee);

/* ---------- a long ledger is folded, and the balance stays the same ---------- */
for (let i = 0; i < 60; i++) { clock += 1000; give(C, 1); }
const c0 = await coins(C);
clock += 864e5; while ([0, 6].includes(new Date(clock + 8 * 3600e3).getUTCDay())) clock += 864e5;
await open(C);
const linesAfter = [...store._m.keys()].filter((k) => k.startsWith(`led/${C.id}/`)).length;
assert.ok(linesAfter <= 14, `ledger folded to ${linesAfter} lines`);
assert.ok(store._m.has(`coinbase/${C.id}`));
const c1 = await coins(C), wages = (await me(C)).coinLog.filter((e) => (e.why.startsWith("pay.") || e.why === "welcome") && e.id > String(clock - 60e3)).reduce((n, e) => n + e.amt, 0);
assert.equal(c1, c0 + wages, "same balance after folding (plus the wages that opening the app paid)");
clock += 12 * 3600e3; await open(C);
assert.ok(await coins(C) >= c0);

/* ---------- deleting the account removes the coins ---------- */
await call("POST", "me", { action: "delete" }, C.t);
assert.equal([...store._m.keys()].some((k) => ["led", "coinbase", "wv", "paid", "work"].some((p) => k === `${p}/${C.id}` || k.startsWith(`${p}/${C.id}/`))), false);

console.log("All monster coin checks passed.");
