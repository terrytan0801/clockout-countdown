// v42: the cave's home, decorated together.
import assert from "node:assert/strict";
import { makeApp, HOME_KINDS, HOME_MAX } from "../netlify/lib/handler.mjs";
import { memStore } from "./mem-store.mjs";

const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification() {} };
let clock = Date.UTC(2026, 10, 12, 7, 0, 0);
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock, cache: {} });
const call = async (method, path, body, token) => {
  clock += 1;
  const res = await app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const cost = async (fn) => { const b = { ...store._ops }; const r = await fn(); return { r, read: store._ops.read - b.read, list: store._ops.list - b.list }; };
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 18, m: 0, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const A = await mk("Ann"), B = await mk("Ben"), O = await mk("Out"), L = await mk("Lone");
const code = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave.code;
await call("POST", "cave", { action: "join", code }, B.t);
await call("POST", "cave", { action: "create", name: "Other" }, O.t);

assert.equal((await call("GET", "home", null, L.t)).status, 409, "no cave, no home");
let h = (await call("GET", "home", null, A.t)).data;
assert.deepEqual(h.items, []); assert.ok(h.rv);

// add, and everyone in the cave sees it
h = (await call("POST", "home", { action: "add", kind: "sofa", x: 300, y: 820 }, A.t)).data;
assert.equal(h.items.length, 1);
const sofa = h.items[0];
assert.deepEqual({ ...sofa, id: undefined }, { id: undefined, kind: "sofa", x: 300, y: 820, flip: false, by: A.id });
const hb = (await call("GET", "home", null, B.t)).data;
assert.deepEqual(hb.items, h.items);
assert.deepEqual((await call("GET", "home", null, O.t)).data.items, [], "other caves have their own home");

// "still the same?" costs one read and no listing
const same = await cost(() => call("GET", "home?rv=" + hb.rv, null, B.t));
assert.deepEqual(same.r.data, { same: true, rv: hb.rv }); assert.equal(same.list, 0);

// move, flip, and someone else can move it too
h = (await call("POST", "home", { action: "move", id: sofa.id, x: 512.4, y: 1200 }, B.t)).data;
assert.deepEqual([h.items[0].x, h.items[0].y, h.items[0].by], [512, 1000, A.id], "rounded and kept inside; still Ann's sofa");
h = (await call("POST", "home", { action: "flip", id: sofa.id }, B.t)).data;
assert.equal(h.items[0].flip, true);
assert.equal([...store._m.keys()].filter((k) => k.startsWith("hi/")).length, 1, "moving doesn't leave copies behind");
assert.notEqual(h.rv, hb.rv);

// the rules
assert.equal((await call("POST", "home", { action: "add", kind: "spaceship", x: 1, y: 1 }, A.t)).status, 400);
assert.equal((await call("POST", "home", { action: "add", kind: "rug" }, A.t)).status, 400);
assert.equal((await call("POST", "home", { action: "move", id: "nope", x: 1, y: 1 }, A.t)).status, 404);
assert.equal((await call("POST", "home", { action: "remove", id: sofa.id }, O.t)).status, 404, "not from another cave");
assert.equal((await call("POST", "home", { action: "dance", id: sofa.id }, A.t)).status, 400);
assert.equal((await call("GET", "home")).status, 401);
for (let i = 1; i < HOME_MAX; i++) await call("POST", "home", { action: "add", kind: HOME_KINDS[i % HOME_KINDS.length], x: i, y: i }, A.t);
assert.equal((await call("POST", "home", { action: "add", kind: "cat", x: 5, y: 5 }, A.t)).status, 409, "full");

// remove
h = (await call("POST", "home", { action: "remove", id: sofa.id }, A.t)).data;
assert.equal(h.items.length, HOME_MAX - 1); assert.ok(!h.items.some((i) => i.id === sofa.id));

// the last one out takes the home with them
const cid = (await call("GET", "state", null, A.t)).data.cave.id;
for (const x of [A, B]) await call("POST", "cave", { action: "leave" }, x.t);
assert.equal([...store._m.keys()].some((k) => k.includes(cid) && /^(hi|homerev)\//.test(k)), false);
console.log("All cave home checks passed.");
