// v45: fishing. Casts, what's on the line, the bag, Mr. Fishfish, and the aquariums.
import assert from "node:assert/strict";
import { makeApp, FISH, FISHING, SHOP, fishPrice, fishmonger } from "../netlify/lib/handler.mjs";
import { memStore } from "./mem-store.mjs";

const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification() {} };
const SG = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 8, m, 0);
let clock = SG(10, 9);
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock, cache: {} });
const call = async (method, path, body, token) => {
  clock += 1;
  const r = await app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }));
  return { status: r.status, data: await r.json() };
};
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 18, m: 0, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const st = async (who) => (await call("GET", "state", null, who.t)).data;
const give = (who, n) => store._m.set(`led/${who.id}/${String(clock).padStart(13, "0")}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}/${n}/test`, "0");
const putInBag = (who, kind, size) => { const id = "f" + Math.random().toString(36).slice(2, 10); store._m.set(`bag/${who.id}/${id}/${kind}/${size}`, "0"); return id; };
const A = await mk("Ann"), B = await mk("Ben"), L = await mk("Lone");
const cave = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave;
await call("POST", "cave", { action: "join", code: cave.code }, B.t);

/* ---------- prices and visits ---------- */
assert.equal(Object.values(FISH).reduce((n, f) => n + f.w, 0), 100, "the chances add up to 100");
assert.equal(fishPrice("koi", 25), Math.round(16 * 0.7)); assert.equal(fishPrice("koi", 60), Math.round(16 * 1.3));
assert.equal(fishPrice("koi", 60, "koi"), Math.round(16 * 1.3 * 2), "double for the fish he's after");
assert.equal(fishPrice("boot", 25), 1); assert.equal(fishPrice("mermaid", 10), 0);
let v = fishmonger(SG(10, 9));
assert.deepEqual([v.from, v.until], [SG(10, 12), SG(10, 14)], "at 9 am the next visit is lunch");
assert.equal(fishmonger(SG(10, 13)).from, SG(10, 12), "he's here at 1 pm");
assert.deepEqual([fishmonger(SG(10, 15)).from, fishmonger(SG(10, 15)).until], [SG(10, 19), SG(10, 22)]);
assert.equal(fishmonger(SG(10, 23)).from, SG(11, 12), "after 10 pm: tomorrow's lunch");
assert.ok(FISH[v.wants] && v.wants !== "boot" && v.wants !== "golden");
assert.equal(fishmonger(SG(10, 9)).wants, fishmonger(SG(10, 20)).wants, "the same wish all day");

/* ---------- casting and landing ---------- */
let s = await st(A);
assert.equal(s.me.casts, undefined, "no daily cast limit"); assert.deepEqual(s.me.bag, []);
assert.equal(s.fishfish.from, SG(10, 12));
assert.equal((await call("POST", "fish/cast", null, L.t)).status, 409, "no cave, no pond");
assert.equal((await call("POST", "fish/land", { ok: true }, A.t)).status, 409, "nothing on the line");
const vBefore = s.v;
let c = (await call("POST", "fish/cast", null, A.t)).data;
assert.ok(FISH[c.kind] && c.size >= FISH[c.kind].cm[0] && c.size <= FISH[c.kind].cm[1]);
assert.equal(c.hard, FISH[c.kind].hard);
let l = (await call("POST", "fish/land", { ok: true }, A.t)).data;
assert.equal(l.kept, true); assert.deepEqual([l.fish.kind, l.fish.size], [c.kind, c.size], "what was hooked is what lands");
assert.equal((await call("POST", "fish/land", { ok: true }, A.t)).status, 409, "one fish per cast");
s = await st(A);
assert.deepEqual(s.me.bag, [l.fish]);
assert.notEqual(s.v, vBefore, "the phone sees the new fish");
// the one that got away
await call("POST", "fish/cast", null, A.t);
assert.equal((await call("POST", "fish/land", { ok: false }, A.t)).data.kept, false);
s = await st(A);
assert.equal(s.me.bag.length, 1);
// no limit: keep casting the same day
for (let i = 0; i < 5; i++) { assert.equal((await call("POST", "fish/cast", null, A.t)).status, 200, "cast " + (i + 3)); await call("POST", "fish/land", { ok: false }, A.t); }
// a new cast replaces a line left in the water: only the newest fish can be landed
const c1 = (await call("POST", "fish/cast", null, A.t)).data, c2 = (await call("POST", "fish/cast", null, A.t)).data;
const l2 = (await call("POST", "fish/land", { ok: true }, A.t)).data;
assert.deepEqual([l2.fish.kind, l2.fish.size], [c2.kind, c2.size]); void c1;
assert.equal((await call("POST", "fish/land", { ok: true }, A.t)).status, 409);
for (const k of [...store._m.keys()]) if (k.startsWith(`bag/${A.id}/`) && !k.includes(l.fish.id)) store._m.delete(k);
clock = SG(11, 9);
// a line left for more than 10 minutes has nothing on it
await call("POST", "fish/cast", null, A.t); clock += 11 * 60e3;
assert.equal((await call("POST", "fish/land", { ok: true }, A.t)).status, 409);
// the catch follows the chances; a lucky cat means no boots and more rare fish
const tally = async (who, n) => { const seen = {}; for (let i = 0; i < n; i++) { clock += 864e5; for (let j = 0; j < 2; j++) { const k = (await call("POST", "fish/cast", null, who.t)).data.kind; seen[k] = (seen[k] || 0) + 1; await call("POST", "fish/land", { ok: false }, who.t); } } return seen; };
const plain = await tally(A, 150);
assert.ok(plain.tadpole > plain.catfish && (plain.boot || 0) > 0, JSON.stringify(plain));
give(B, 1000); await call("POST", "home", { action: "add", kind: "luckycat", x: 100, y: 900 }, B.t);
const lucky = await tally(B, 150);
assert.equal(lucky.boot, undefined, "no boots with a lucky cat");
const rare = (t) => FISHING.rare.reduce((n, k) => n + (t[k] || 0), 0);
assert.ok(rare(lucky) > rare(plain), `rare fish: ${rare(lucky)} with the cat, ${rare(plain)} without`);
// a full bag
for (let i = 0; i < FISHING.bag; i++) putInBag(B, "tadpole", 5);
clock += 864e5;
assert.equal((await call("POST", "fish/cast", null, B.t)).status, 409, "a full bag");

/* ---------- Mr. Fishfish ---------- */
for (const k of [...store._m.keys()]) if (k.startsWith(`bag/${A.id}/`)) store._m.delete(k);
const day0 = Math.floor((clock + 8 * 3600e3) / 864e5) * 864e5 - 8 * 3600e3; // this Singapore midnight
clock = day0 + 9 * 3600e3;
const koi = putInBag(A, "koi", 60), tad = putInBag(A, "tadpole", 3), boot = putInBag(A, "boot", 25);
assert.equal((await call("POST", "fish/sell", { ids: [koi] }, A.t)).status, 409, "he isn't here at 9 am");
clock = day0 + 12.5 * 3600e3;
const wants = fishmonger(clock).wants;
const a0 = (await st(A)).me.coins;
let r = (await call("POST", "fish/sell", { ids: [koi, "nope"] }, A.t)).data;
assert.deepEqual(r, { sold: 1, won: fishPrice("koi", 60, wants) });
s = await st(A);
assert.equal(s.me.coins, a0 + r.won); assert.equal(s.me.bag.length, 2);
assert.ok(s.me.coinLog.some((e) => e.why === "fishsale.1"));
r = (await call("POST", "fish/sell", null, A.t)).data; // everything
assert.deepEqual(r, { sold: 2, won: fishPrice("tadpole", 3, wants) + 1 });
assert.equal((await call("POST", "fish/sell", null, A.t)).status, 400, "an empty bag");
clock = day0 + 15 * 3600e3; putInBag(A, "carp", 30);
assert.equal((await call("POST", "fish/sell", null, A.t)).status, 409, "gone again in the afternoon");

/* ---------- aquariums ---------- */
const carp = (await st(A)).me.bag[0];
assert.equal((await call("POST", "fish/tank", { id: carp.id, on: true }, A.t)).status, 409, "no aquarium in the home yet");
give(A, 2000);
const home = (await call("POST", "home", { action: "add", kind: "aquarium", x: 500, y: 900 }, A.t)).data;
const aq = home.items.find((i) => i.kind === "aquarium");
assert.equal((await call("POST", "fish/tank", { id: carp.id, on: true }, A.t)).status, 200);
let h = (await call("GET", "home", null, B.t)).data;
assert.deepEqual(h.tank, [{ id: carp.id, kind: "carp", size: 30, by: A.id }], "everyone sees it swimming");
assert.deepEqual((await st(A)).me.bag, []);
assert.equal((await call("POST", "fish/tank", { id: carp.id, on: false }, B.t)).status, 403, "only its owner takes it out");
assert.equal((await call("POST", "fish/tank", { id: putInBag(A, "boot", 25), on: true }, A.t)).status, 400, "no boots");
// an aquarium holds 3; a big tank adds 8
for (let i = 0; i < 2; i++) assert.equal((await call("POST", "fish/tank", { id: putInBag(A, "koi", 40), on: true }, A.t)).status, 200);
r = await call("POST", "fish/tank", { id: putInBag(A, "koi", 41), on: true }, A.t);
assert.equal(r.status, 409); assert.match(r.data.error, /full \(3 fish\)/);
assert.equal(SHOP.bigtank > SHOP.aquarium, true);
await call("POST", "home", { action: "add", kind: "bigtank", x: 700, y: 900 }, A.t);
assert.equal((await call("POST", "fish/tank", { id: (await st(A)).me.bag.find((f) => f.size === 41).id, on: true }, A.t)).status, 200);
// can't sell an aquarium the fish need
const big = (await call("GET", "home", null, A.t)).data.items.find((i) => i.kind === "bigtank");
r = await call("POST", "home", { action: "remove", id: big.id }, A.t);
assert.equal(r.status, 409); assert.match(r.data.error, /fish living in it/);
assert.equal((await call("POST", "home", { action: "remove", id: aq.id }, A.t)).status, 200, "the small one can go: the big tank has room for all 4");
// back to the bag
assert.equal((await call("POST", "fish/tank", { id: carp.id, on: false }, A.t)).status, 200);
assert.ok((await st(A)).me.bag.some((f) => f.id === carp.id));
assert.equal((await call("GET", "home", null, A.t)).data.tank.length, 3);

/* ---------- leaving and deleting ---------- */
const cid = cave.id;
await call("POST", "me", { action: "delete" }, A.t);
assert.equal([...store._m.keys()].some((k) => k.startsWith(`bag/${A.id}/`) || k === `cast/${A.id}`), false);
await call("POST", "cave", { action: "leave" }, B.t);
assert.equal([...store._m.keys()].some((k) => k.startsWith(`tank/${cid}/`)), false, "the cave's aquariums go with the cave");
console.log("All fishing checks passed.");
