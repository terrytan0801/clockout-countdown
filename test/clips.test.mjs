// Cave Calendar: four random rings a day, clip uploads, playback access, the calendar, clean-up.
import assert from "node:assert/strict";
import { makeApp } from "../netlify/lib/handler.mjs";
import { ringSecs, ringTimes, currentRing, RING_COUNT, RING_FROM, RING_TO, RING_STEP, RING_GAP, RING_WINDOW_MS, CLIP_MAX_BYTES } from "../netlify/lib/clips.mjs";
import { memStore } from "./mem-store.mjs";

/* ---------- ring times (pure) ---------- */
const seen = new Set();
for (let i = 0; i < 400; i++) {
  const xs = ringSecs("c-" + i, `2026-11-${String((i % 28) + 1).padStart(2, "0")}`);
  assert.equal(xs.length, RING_COUNT);
  xs.forEach((x, j) => {
    assert.ok(x >= RING_FROM && x < RING_TO, "rings between 9 am and 10 pm"); assert.equal(x % RING_STEP, 0, "on a 5-minute mark");
    if (j) assert.ok(x - xs[j - 1] >= RING_GAP, "at least an hour apart");
  });
  seen.add(xs[1]);
}
assert.ok(seen.size > 15, "ring times are spread out");
assert.deepEqual(ringSecs("c-abc", "2026-11-09"), ringSecs("c-abc", "2026-11-09"), "the same for everyone in the cave");

/* ---------- app setup ---------- */
const pushed = [];
const webpush = {
  generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
  async sendNotification(sub, payload) { pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); },
};
let clock = Date.UTC(2026, 10, 9, 1, 0, 0); // Mon 9 Nov, 9:00 am SG (before any ring)
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock });
const call = async (method, path, body, token) => {
  clock += 1;
  const headers = token ? { authorization: "Bearer " + token } : {};
  const res = await app.handle(new Request("https://x.test/api/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  const type = res.headers.get("content-type") || "";
  return { status: res.status, type, data: type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
};
const upload = async (token, { size = 50_000, type = "video/mp4", dur = 3.2, thumb = true } = {}) => {
  clock += 1;
  const fd = new FormData();
  fd.append("video", new Blob([new Uint8Array(size).fill(7)], { type }), "clip");
  if (thumb) fd.append("thumb", new Blob([new Uint8Array(900).fill(3)], { type: "image/jpeg" }), "thumb.jpg");
  fd.append("dur", String(dur));
  const res = await app.handle(new Request("https://x.test/api/clip", { method: "POST", headers: { authorization: "Bearer " + token }, body: fd }));
  return { status: res.status, data: await res.json() };
};
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 17, m: 0, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const T = await mk("Terry"), K = await mk("Sukee"), W = await mk("Winnie"), O = await mk("Outsider");
const created = (await call("POST", "cave", { action: "create", name: "Cave" }, T.t)).data.cave;
for (const x of [K, W]) await call("POST", "cave", { action: "join", code: created.code }, x.t);
const other = (await call("POST", "cave", { action: "create", name: "Other" }, O.t)).data.cave;
for (const x of [T, K, W]) await call("POST", "subscribe", { subscription: { endpoint: "https://push.test/" + x.id, keys: { p256dh: "k", auth: "a" } } }, x.t);
const cid = created.id, day = "2026-11-09", rings = ringTimes(cid, day), ring = rings[0];

/* ---------- before the ring ---------- */
let st = (await call("GET", "state", null, T.t)).data;
assert.equal(st.cave.ring, null, "the ring time stays a surprise until it rings");
assert.deepEqual(st.cave.clipsToday, []);
assert.equal((await upload(T.t)).status, 409, "no filming before the ring");
pushed.length = 0;
assert.deepEqual(await app.ringTick(), { caves: 0, sent: 0 });

/* ---------- the ring ---------- */
clock = ring + 20e3;
const r1 = await app.ringTick();
assert.ok(r1.caves >= 1); assert.equal(pushed.filter((p) => p.payload.kind === "ring").length >= 3, true, "every member with zaps on gets the ring");
const rp = pushed.find((p) => p.endpoint.endsWith(T.id)).payload;
assert.match(rp.title, /Cave: film time/); assert.equal(rp.kind, "ring"); assert.equal(rp.url, "/?film=1");
pushed.length = 0;
assert.equal((await app.ringTick()).caves, 0, "rings once a day");
assert.equal(pushed.length, 0);

st = (await call("GET", "state", null, T.t)).data;
assert.deepEqual(st.cave.ring, { r: 0, at: ring, until: ring + RING_WINDOW_MS, closes: rings[1], of: RING_COUNT });
assert.equal(st.me.clip, null);

/* ---------- uploads ---------- */
assert.equal((await upload(T.t, { type: "image/png" })).status, 400, "only videos");
assert.equal((await upload(T.t, { size: CLIP_MAX_BYTES + 1 })).status, 413, "size cap");
assert.equal((await upload(T.t, { dur: 1 })).status, 400, "too short");
assert.equal((await upload(T.t, { dur: 7 })).status, 400, "too long");
let up = await upload(T.t, { dur: 3.1 });
assert.equal(up.status, 200, JSON.stringify(up.data));
assert.equal(up.data.me.clip.late, false);
assert.deepEqual(up.data.cave.clipsToday.map((c) => c.pid), [T.id]);
const first = up.data.me.clip.at;

// retake replaces the clip, one per person per day
clock += 60e3;
up = await upload(T.t, { size: 60_000 });
assert.equal(up.status, 200);
assert.equal(up.data.cave.clipsToday.length, 1);
assert.ok(up.data.me.clip.at > first);
assert.deepEqual([...store._m.keys()].filter((k) => k.startsWith(`myclip/${T.id}/`)), [`myclip/${T.id}/${cid}/${day}/${T.id}.0_60000`], "old index entry removed");

// late post (still the first ring: the second hasn't gone off)
clock = ring + RING_WINDOW_MS + 5 * 60e3;
assert.ok(clock < rings[1]);
up = await upload(K.t, { thumb: false, type: "video/webm;codecs=vp9,opus" });
assert.equal(up.status, 200); assert.equal(up.data.me.clip.late, true);

// the second ring: a new slot, the first ring's clips stay
clock = rings[1] + 60e3;
pushed.length = 0;
assert.equal((await app.ringTick()).caves >= 1, true);
assert.match(pushed[0].payload.tag, /-1$/);
st = (await call("GET", "state", null, T.t)).data;
assert.equal(st.cave.ring.r, 1); assert.equal(st.me.clip, null, "a new ring, nothing filmed for it yet");
up = await upload(T.t, { size: 40_000 });
assert.equal(up.data.me.clip.r, 1); assert.equal(up.data.me.clip.late, false);
assert.deepEqual(up.data.cave.clipsToday.map((c) => [c.pid, c.r]), [[T.id, 0], [K.id, 0], [T.id, 1]]);

/* ---------- playback ---------- */
const s0 = `${T.id}.0`, sk = `${K.id}.0`;
let g = await call("GET", `clip/${cid}/${day}/${s0}?v=1`, null, W.t);
assert.equal(g.status, 200); assert.equal(g.type, "video/mp4"); assert.equal(g.data.length, 60_000);
g = await call("GET", `thumb/${cid}/${day}/${s0}`, null, K.t);
assert.equal(g.status, 200); assert.equal(g.type, "image/jpeg");
g = await call("GET", `clip/${cid}/${day}/${sk}`, null, T.t);
assert.equal(g.type, "video/webm");
assert.equal((await call("GET", `thumb/${cid}/${day}/${sk}`, null, T.t)).status, 404, "no cover frame was sent");
assert.equal((await call("GET", `clip/${cid}/${day}/${s0}`, null, O.t)).status, 403, "other caves can't watch");
assert.equal((await call("GET", `clip/${cid}/${day}/${s0}`)).status, 401);
assert.equal((await call("GET", `clip/${other.id}/${day}/${O.id}`, null, T.t)).status, 403);

/* ---------- calendar ---------- */
let cal = (await call("GET", "days?month=2026-11", null, W.t)).data;
assert.equal(cal.month, "2026-11"); assert.equal(cal.today, day);
assert.deepEqual(Object.keys(cal.days), [day]);
assert.deepEqual(cal.days[day].rings, rings.slice(0, 2), "only rings that have gone off");
assert.deepEqual(cal.days[day].clips.map((c) => [c.name, c.r, c.late, c.thumb, c.slot]), [["Terry", 0, false, true, s0], ["Sukee", 0, true, false, sk], ["Terry", 1, false, true, `${T.id}.1`]]);
assert.deepEqual((await call("GET", "days?month=2026-10", null, W.t)).data.days, {});
assert.equal((await call("GET", "days", null, O.t)).data.days[day], undefined, "each cave has its own calendar");

// the next day: a new ring, the old day stays on the calendar
clock = ringTimes(cid, "2026-11-10")[0] - 60e3;
st = (await call("GET", "state", null, T.t)).data;
assert.equal(st.cave.ring, null); assert.equal(st.me.clip, null);
cal = (await call("GET", "days?month=2026-11", null, T.t)).data;
assert.equal(cal.days[day].clips.length, 3, "clips are kept");
assert.equal(cal.days[day].rings.length, RING_COUNT);

/* ---------- admin storage total ---------- */
const adminKey = "test-admin-key";
const admin = makeApp({ store, webpush, now: () => clock, adminKey });
const rep = await (await admin.handle(new Request("https://x.test/api/admin/stats", { headers: { "x-admin-key": adminKey } }))).json();
assert.deepEqual(rep.clips, { count: 3, bytes: 150_000 });

// a clip from v15 (one ring a day, no ring number in its key) still plays and counts as ring 0
await store.set(`clip/${cid}/2026-11-08/${W.id}`, new Uint8Array(10).buffer, { metadata: { type: "video/mp4" } });
await store.setJSON(`clipmeta/${cid}/2026-11-08/${W.id}`, { pid: W.id, name: "Winnie", color: "pink", monster: 1, at: Date.UTC(2026, 10, 8, 7), late: false, dur: 6, thumb: false });
await store.setJSON(`myclip/${W.id}/${cid}/2026-11-08_10`, 0);
cal = (await call("GET", "days?month=2026-11", null, T.t)).data;
assert.deepEqual(cal.days["2026-11-08"].clips.map((c) => [c.slot, c.r]), [[W.id, 0]]);
assert.equal((await call("GET", `clip/${cid}/2026-11-08/${W.id}`, null, T.t)).status, 200);

/* ---------- clean-up ---------- */
// deleting an account deletes that person's clips
await call("POST", "me", { action: "delete" }, K.t);
cal = (await call("GET", "days?month=2026-11", null, T.t)).data;
assert.deepEqual(cal.days[day].clips.map((c) => c.name), ["Terry", "Terry"]);
assert.equal([...store._m.keys()].some((k) => k.includes(K.id) && /^(clip|thumb|clipmeta|myclip)\//.test(k)), false);
// when the last person leaves, the cave's clips go with it
await call("POST", "cave", { action: "leave" }, W.t);
await call("POST", "cave", { action: "leave" }, T.t);
assert.equal([...store._m.keys()].some((k) => k.includes(cid) && /^(clip|thumb|clipmeta|myclip)\//.test(k)), false);

// The real Blobs library (8.2.0) ignores onlyIfNew: a ring must still go out only once.
{
  const loose = memStore(); // ignores onlyIfNew, like the real library
  const sent = [];
  const app2 = makeApp({ store: loose, webpush: { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification(sub, p) { sent.push(p); } }, now: () => clock });
  const call2 = async (method, path, body, token) => { clock += 1; const res = await app2.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined })); return (await res.json()); };
  const z = await call2("POST", "signup", { name: "Zed", h: 17, m: 0, pin: "1234" });
  const cz = (await call2("POST", "cave", { action: "create", name: "Z" }, z.token)).cave;
  await call2("POST", "subscribe", { subscription: { endpoint: "https://push.test/z", keys: { p256dh: "k", auth: "a" } } }, z.token);
  const at = ringTimes(cz.id, "2026-11-12")[0];
  for (const dt of [0, 5, 10, 15, 20, 25]) { clock = at + dt * 60e3 + 1000; await app2.ringTick(); }
  assert.equal(sent.length, 1, "one ring, one push, even when every 5-minute run sees it");
}

console.log("All Cave Calendar checks passed.");
