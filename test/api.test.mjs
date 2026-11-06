// Runs the API handler against an in-memory store and a fake web-push. `npm test`
import assert from "node:assert/strict";
import { makeHandler, ZAP_COOLDOWN_MS } from "../netlify/lib/handler.mjs";

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
const call = async (method, path, body) => {
  const res = await handle(new Request("https://x.test/api/" + path, { method, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const sub = (e) => ({ endpoint: "https://push.test/" + e, keys: { p256dh: "k", auth: "a" } });

let r = await call("GET", "state");
assert.equal(r.status, 200); assert.equal(r.data.day, "2026-11-06"); assert.equal(r.data.base.length, 3);

r = await call("GET", "vapid"); assert.equal(r.data.publicKey, "PUB");

r = await call("POST", "friends", { action: "add", name: "Qitai", h: 18, m: 30 });
assert.equal(r.status, 200); assert.equal(r.data.friends.length, 1);
const qid = r.data.friends[0].id;
r = await call("POST", "friends", { action: "add", name: "qitai", h: 18, m: 30 }); assert.equal(r.status, 409);
r = await call("POST", "friends", { action: "add", name: "Bad", h: 25, m: 0 }); assert.equal(r.status, 400);

r = await call("POST", "ot", { pid: "base-sukee", on: true, end: null });
assert.deepEqual(r.data.ot["base-sukee"], { on: true, end: null });
r = await call("POST", "ot", { pid: "base-sukee", on: true, end: 66600 });
assert.equal(r.data.ot["base-sukee"].end, 66600);
r = await call("POST", "ot", { pid: "base-sukee", on: false }); assert.equal(r.data.ot["base-sukee"], undefined);
r = await call("POST", "ot", { pid: "nobody", on: true }); assert.equal(r.status, 404);

r = await call("POST", "subscribe", { pid: "base-sukee", subscription: sub("phone1") }); assert.equal(r.status, 200);
r = await call("POST", "subscribe", { pid: "base-sukee", subscription: sub("gone1") }); assert.equal(r.status, 200);
r = await call("GET", "state"); assert.deepEqual(r.data.reachable, ["base-sukee"]);

r = await call("POST", "zap", { from: "base-terry", to: "base-sukee", message: "88 mins to go" });
assert.equal(r.status, 200); assert.equal(r.data.sent, 1);
assert.equal(pushed[0].payload.title, "⚡ Zap from Terry!"); assert.equal(pushed[0].payload.body, "88 mins to go");
// dead subscription got pruned
assert.equal(JSON.parse(store._m.get("subs/base-sukee")).length, 1);

r = await call("POST", "zap", { from: "base-terry", to: "base-sukee" }); assert.equal(r.status, 429); assert.ok(r.data.retryInMs > 0);
r = await call("POST", "zap", { from: "base-shunyi", to: "base-sukee" }); assert.equal(r.status, 200); // different pair is fine
r = await call("GET", "state"); assert.ok(r.data.zaps["base-terry>base-sukee"]);
clock += ZAP_COOLDOWN_MS + 1000;
r = await call("POST", "zap", { from: "base-terry", to: "base-sukee" }); assert.equal(r.status, 200);
r = await call("POST", "zap", { from: "base-terry", to: "base-terry" }); assert.equal(r.status, 400);
r = await call("POST", "zap", { from: "base-terry", to: qid }); assert.equal(r.data.sent, 0); // not subscribed

// moving a phone to another person removes it from the first
r = await call("POST", "subscribe", { pid: qid, subscription: sub("phone1") });
r = await call("GET", "state"); assert.deepEqual(r.data.reachable, [`${qid}`].map((x) => x));

r = await call("POST", "friends", { action: "remove", id: qid }); assert.equal(r.data.friends.length, 0);
assert.equal(store._m.has(`subs/${qid}`), false);

r = await call("GET", "nope"); assert.equal(r.status, 404);
console.log("All API checks passed.");
