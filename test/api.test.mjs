// Runs the API handler against an in-memory store and a fake web-push. `npm test`
import assert from "node:assert/strict";
import { makeHandler, ZAP_COOLDOWN_MS, LOCK_MS } from "../netlify/lib/handler.mjs";

function memStore() {
  const m = new Map();
  return {
    async get(k, o) { if (!m.has(k)) return null; return o?.type === "json" ? JSON.parse(m.get(k)) : m.get(k); },
    async setJSON(k, v, o) { if (o?.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    _m: m,
  };
}
const pushed = [];
const webpush = {
  generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
  async sendNotification(sub, payload) {
    if (sub.endpoint.includes("gone")) { const e = new Error("gone"); e.statusCode = 410; throw e; }
    pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  },
};
let clock = Date.UTC(2026, 10, 6, 8, 0, 0); // 4pm SG
const store = memStore();
const handle = makeHandler({ store, webpush, now: () => clock });
const call = async (method, path, body, token) => {
  const headers = token ? { authorization: "Bearer " + token } : {};
  const res = await handle(new Request("https://x.test/api/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const sub = (e) => ({ endpoint: "https://push.test/" + e, keys: { p256dh: "k", auth: "a" } });

// signed-out access is refused
assert.equal((await call("GET", "state")).status, 401);
assert.equal((await call("GET", "vapid")).data.publicKey, "PUB");

// join
let r = await call("POST", "signup", { name: "Terry", h: 17, m: 0, pin: "1234" });
assert.equal(r.status, 200); assert.ok(r.data.token); const terry = r.data.token; const terryId = r.data.me;
assert.equal(r.data.people[0].hash, undefined, "PIN hash must not leak");
r = await call("POST", "signup", { name: "terry", h: 17, m: 0, pin: "9999" }); assert.equal(r.status, 409);
r = await call("POST", "signup", { name: "Sukee", h: 17, m: 30, pin: "12" }); assert.equal(r.status, 400);
r = await call("POST", "signup", { name: "Sukee", h: 17, m: 30, pin: "5555" }); const sukee = r.data.token; const sukeeId = r.data.me;
assert.equal(r.data.people.length, 2);

// login + lockout
r = await call("POST", "login", { name: "sukee", pin: "5555" }); assert.equal(r.status, 200); assert.equal(r.data.me, sukeeId);
r = await call("POST", "login", { name: "Nobody", pin: "1111" }); assert.equal(r.status, 401); assert.match(r.data.error, /Join/);
for (let i = 0; i < 4; i++) { r = await call("POST", "login", { name: "Sukee", pin: "0000" }); assert.equal(r.status, 401); }
r = await call("POST", "login", { name: "Sukee", pin: "0000" }); assert.match(r.data.error, /Too many/);
r = await call("POST", "login", { name: "Sukee", pin: "5555" }); assert.equal(r.status, 429, "locked even with right PIN");
clock += LOCK_MS + 1000;
r = await call("POST", "login", { name: "Sukee", pin: "5555" }); assert.equal(r.status, 200);

// OT only ever applies to the caller
r = await call("POST", "ot", { pid: terryId, on: true, end: null }, sukee);
assert.deepEqual(r.data.ot[sukeeId], { on: true, end: null }); assert.equal(r.data.ot[terryId], undefined);
r = await call("POST", "ot", { on: false }, sukee); assert.equal(r.data.ot[sukeeId], undefined);

// change own time
r = await call("POST", "me", { action: "time", h: 18, m: 15 }, sukee);
assert.equal(r.data.people.find((p) => p.id === sukeeId).h, 18);

// push + zap
await call("POST", "subscribe", { subscription: sub("phone1") }, sukee);
await call("POST", "subscribe", { subscription: sub("gone1") }, sukee);
r = await call("GET", "state", null, terry); assert.deepEqual(r.data.reachable, [sukeeId]);
r = await call("POST", "zap", { to: sukeeId, message: "88 mins to go" }, terry);
assert.equal(r.data.sent, 1); assert.equal(pushed[0].payload.title, "⚡ Zap from Terry!");
assert.equal(JSON.parse(store._m.get(`subs/${sukeeId}`)).length, 1, "dead subscription pruned");
r = await call("POST", "zap", { to: sukeeId }, terry); assert.equal(r.status, 429);
r = await call("GET", "state", null, terry); assert.ok(r.data.zaps[sukeeId]);
r = await call("POST", "zap", { to: terryId }, sukee); assert.equal(r.data.sent, 0);
r = await call("POST", "zap", { to: terryId }, terry); assert.equal(r.status, 400);
clock += ZAP_COOLDOWN_MS + 1;
r = await call("POST", "zap", { to: sukeeId }, terry); assert.equal(r.status, 200);

// the same phone switching to Terry leaves Sukee
await call("POST", "subscribe", { subscription: sub("phone1") }, terry);
r = await call("GET", "state", null, terry); assert.deepEqual(r.data.reachable, [terryId]);

// change PIN, log out, leave
assert.equal((await call("POST", "me", { action: "pin", pin: "4321" }, terry)).status, 200);
assert.equal((await call("POST", "login", { name: "Terry", pin: "1234" })).status, 401);
const terry2 = (await call("POST", "login", { name: "Terry", pin: "4321" })).data.token;
await call("POST", "logout", null, terry2);
assert.equal((await call("GET", "state", null, terry2)).status, 401);
r = await call("POST", "me", { action: "leave" }, sukee); assert.equal(r.status, 200);
r = await call("GET", "state", null, terry); assert.equal(r.data.people.length, 1);
assert.equal((await call("GET", "state", null, sukee)).status, 401);

console.log("All API checks passed.");
