// v54: moving the records from Singapore to the functions' region (netlify/lib/stores.mjs).
import assert from "node:assert/strict";
import { memStore } from "./mem-store.mjs";
import { seed, fakeFetch } from "./seed.mjs";
import { makeHandler } from "../netlify/lib/handler.mjs";
import { nearRegion, split, moveStep, isMedia, openStores } from "../netlify/lib/stores.mjs";

/* ---------- which region ---------- */
assert.equal(nearRegion("us-east-1"), "us-east-1");
assert.equal(nearRegion("us-east-2"), "us-east-2");
assert.equal(nearRegion("us-west-2"), "us-east-1");
assert.equal(nearRegion("eu-west-1"), "eu-central-1");
assert.equal(nearRegion("ap-southeast-1"), "ap-southeast-1");
assert.equal(nearRegion(""), "us-east-1");
assert.ok(isMedia("clip/c/2026-11-14/p.0") && isMedia("thumb/x") && !isMedia("clipmeta/c/x") && !isMedia("myclip/p"));

// openStores: two stores unless the functions already run in Singapore
const opened = [];
const fakeGet = (o) => { opened.push(o); return memStore(); };
let o = openStores(fakeGet, { aws: "us-east-1" });
assert.deepEqual(opened.map((x) => [x.name, x.region]), [["clockout", "ap-southeast-1"], ["clockout-near", "us-east-1"]]);
assert.notEqual(o.near, o.far);
opened.length = 0; o = openStores(fakeGet, { dev: true, aws: "us-east-2" });
assert.deepEqual(opened.map((x) => [x.name, x.region]), [["clockout-dev", "ap-southeast-1"], ["clockout-dev-near", "us-east-2"]]);
opened.length = 0; o = openStores(fakeGet, { aws: "ap-southeast-1" });
assert.equal(opened.length, 1); assert.equal(o.store, o.far); assert.equal(o.near, o.far);
assert.ok(opened.every((x) => x.consistency === "strong"));

/* ---------- the move ---------- */
const far = memStore(), near = memStore();
await seed(far, Date.now());
await far.set("clip/c1/2026-11-14/p.0", "VIDEO", { metadata: { type: "video/mp4" } });
await far.set("thumb/c1/2026-11-14/p.0", "JPEG", { metadata: { type: "image/jpeg" } });
await far.set("odd/one", "x", { metadata: { type: "text/plain" } });
await far.setJSON("toplevel", { a: 1 });
const before = new Map(far._m);
const want = [...before.keys()].filter((k) => !isMedia(k)).sort();
assert.ok(want.length > 40, "the seed has plenty of records");

let clock = 0; const now = () => (clock += 100); // every look at the clock costs 100 ms, so the move takes several steps
const cache = {};
let steps = 0, r;
do {
  r = await moveStep({ near, far, cache, now, budgetMs: 250, batch: 7 });
  steps++;
  if (!r.done) { assert.ok(r.at > 0 && r.at < r.total); assert.equal(r.total, want.length); }
} while (!r.done && steps < 100);
assert.ok(r.done); assert.ok(steps > 2, `took ${steps} steps`);
assert.equal(cache.moved, true);
for (const k of want) assert.equal(near._m.get(k), before.get(k), `copied ${k}`);
assert.ok(!near._m.has("clip/c1/2026-11-14/p.0") && !near._m.has("thumb/c1/2026-11-14/p.0"), "videos stay where they are");
assert.deepEqual(near._meta?.get?.("odd/one") ?? (await near.getWithMetadata("odd/one")).metadata, { type: "text/plain" }, "metadata comes along");
assert.ok(near._m.has("sys/moved")); assert.ok(!near._m.has("sys/moving"));
assert.deepEqual([...far._m.keys()].sort(), [...before.keys()].sort(), "the old store is left as it was (a backup)");

// done is remembered: one read on a new server, none on a warm one
const c2 = {}; const ops0 = near._ops.read;
assert.ok((await moveStep({ near, far, cache: c2 })).done); assert.equal(near._ops.read - ops0, 1);
assert.ok((await moveStep({ near, far, cache: c2 })).done); assert.equal(near._ops.read - ops0, 1);

// someone else is copying: wait, don't copy too
{
  const f2 = memStore(), n2 = memStore();
  await f2.setJSON("person/a", { id: "a" });
  await n2.setJSON("sys/moving", { until: Date.now() + 5000 });
  const b = await moveStep({ near: n2, far: f2, cache: {} });
  assert.equal(b.done, false); assert.equal(b.busy, true); assert.ok(!n2._m.has("person/a"));
  assert.equal((await moveStep({ near: n2, far: f2, cache: {}, peek: true })).done, false, "the scheduled jobs only look");
  await n2.setJSON("sys/moving", { until: Date.now() - 1 }); // an old lock (that server timed out) doesn't block
  assert.ok((await moveStep({ near: n2, far: f2, cache: {} })).done); assert.ok(n2._m.has("person/a"));
}

/* ---------- the app on the split store ---------- */
const store = split(near, far);
const webpush = { generateVAPIDKeys: () => ({ publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", privateKey: "x" }), async sendNotification() {} };
const handle = makeHandler({ store, webpush, dev: true, cache: {}, fetchFn: fakeFetch });
const call = async (method, route, body, token) => {
  const res = await handle(new Request("http://x/api/" + route, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), { waitUntil: () => {} });
  return { status: res.status, data: await res.json() };
};
const farWrites = far._ops.write;
const li = await call("POST", "login", { name: "Terry", pin: "1234" });
assert.equal(li.status, 200, JSON.stringify(li.data)); assert.equal(li.data.me.name, "Terry");
const st = await call("GET", "state", null, li.data.token);
assert.equal(st.status, 200); assert.ok(st.data.cave.members.length > 1);
const other = st.data.cave.members.find((m) => m.id !== li.data.me.id);
assert.equal((await call("POST", "zap", { to: other.id }, li.data.token)).status, 200);
assert.equal(far._ops.write, farWrites, "nothing is written to the old store any more");
await store.set("clip/c9/d/s", "V"); assert.ok(far._m.has("clip/c9/d/s") && !near._m.has("clip/c9/d/s"), "new videos still go to Singapore");
assert.deepEqual((await store.list({ prefix: "clip/c1/" })).blobs.map((b) => b.key), ["clip/c1/2026-11-14/p.0"]);
assert.ok((await store.list({ prefix: "person/" })).blobs.length > 2);

console.log("All store move checks passed.");
