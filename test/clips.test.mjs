// Cave Calendar (v15): the daily random ring, clip uploads, playback access, the calendar, clean-up.
import assert from "node:assert/strict";
import { makeApp } from "../netlify/lib/handler.mjs";
import { ringSec, ringAt, RING_FROM, RING_TO, RING_STEP, RING_WINDOW_MS, CLIP_MAX_BYTES } from "../netlify/lib/clips.mjs";
import { memStore } from "./mem-store.mjs";

/* ---------- ring time (pure) ---------- */
const seen = new Set();
for (let i = 0; i < 400; i++) {
  const s = ringSec("c-abc", `2026-11-${String((i % 28) + 1).padStart(2, "0")}`) + 0 * i;
  const s2 = ringSec("c-" + i, "2026-11-09");
  for (const x of [s, s2]) { assert.ok(x >= RING_FROM && x < RING_TO, "ring between 10 am and 9 pm"); assert.equal(x % RING_STEP, 0, "on a 5-minute mark"); }
  seen.add(s2);
}
assert.ok(seen.size > 60, "ring times are spread across the day");
assert.equal(ringSec("c-abc", "2026-11-09"), ringSec("c-abc", "2026-11-09"), "the same for everyone in the cave");

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
const upload = async (token, { size = 50_000, type = "video/mp4", dur = 5.6, thumb = true } = {}) => {
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
const cid = created.id, day = "2026-11-09", ring = ringAt(cid, day);

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
assert.deepEqual(st.cave.ring, { at: ring, until: ring + RING_WINDOW_MS });
assert.equal(st.me.clip, null);

/* ---------- uploads ---------- */
assert.equal((await upload(T.t, { type: "image/png" })).status, 400, "only videos");
assert.equal((await upload(T.t, { size: CLIP_MAX_BYTES + 1 })).status, 413, "size cap");
assert.equal((await upload(T.t, { dur: 2 })).status, 400, "too short");
assert.equal((await upload(T.t, { dur: 12 })).status, 400, "too long");
let up = await upload(T.t);
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
assert.deepEqual([...store._m.keys()].filter((k) => k.startsWith(`myclip/${T.id}/`)), [`myclip/${T.id}/${cid}/${day}_60000`], "old index entry removed");

// late post
clock = ring + RING_WINDOW_MS + 5 * 60e3;
up = await upload(K.t, { thumb: false, type: "video/webm;codecs=vp9,opus" });
assert.equal(up.status, 200); assert.equal(up.data.me.clip.late, true);

/* ---------- playback ---------- */
let g = await call("GET", `clip/${cid}/${day}/${T.id}?v=1`, null, W.t);
assert.equal(g.status, 200); assert.equal(g.type, "video/mp4"); assert.equal(g.data.length, 60_000);
g = await call("GET", `thumb/${cid}/${day}/${T.id}`, null, K.t);
assert.equal(g.status, 200); assert.equal(g.type, "image/jpeg");
g = await call("GET", `clip/${cid}/${day}/${K.id}`, null, T.t);
assert.equal(g.type, "video/webm");
assert.equal((await call("GET", `thumb/${cid}/${day}/${K.id}`, null, T.t)).status, 404, "no cover frame was sent");
assert.equal((await call("GET", `clip/${cid}/${day}/${T.id}`, null, O.t)).status, 403, "other caves can't watch");
assert.equal((await call("GET", `clip/${cid}/${day}/${T.id}`)).status, 401);
assert.equal((await call("GET", `clip/${other.id}/${day}/${O.id}`, null, T.t)).status, 403);

/* ---------- calendar ---------- */
let cal = (await call("GET", "days?month=2026-11", null, W.t)).data;
assert.equal(cal.month, "2026-11"); assert.equal(cal.today, day);
assert.deepEqual(Object.keys(cal.days), [day]);
assert.equal(cal.days[day].ring, ring);
assert.deepEqual(cal.days[day].clips.map((c) => [c.name, c.late, c.thumb]), [["Terry", false, true], ["Sukee", true, false]]);
assert.deepEqual((await call("GET", "days?month=2026-10", null, W.t)).data.days, {});
assert.equal((await call("GET", "days", null, O.t)).data.days[day], undefined, "each cave has its own calendar");

// the next day: a new ring, the old day stays on the calendar
clock = ringAt(cid, "2026-11-10") - 60e3;
st = (await call("GET", "state", null, T.t)).data;
assert.equal(st.cave.ring, null); assert.equal(st.me.clip, null);
cal = (await call("GET", "days?month=2026-11", null, T.t)).data;
assert.equal(cal.days[day].clips.length, 2, "clips are kept");

/* ---------- admin storage total ---------- */
const adminKey = "test-admin-key";
const admin = makeApp({ store, webpush, now: () => clock, adminKey });
const rep = await (await admin.handle(new Request("https://x.test/api/admin/stats", { headers: { "x-admin-key": adminKey } }))).json();
assert.deepEqual(rep.clips, { count: 2, bytes: 110_000 });

/* ---------- clean-up ---------- */
// deleting an account deletes that person's clips
await call("POST", "me", { action: "delete" }, K.t);
cal = (await call("GET", "days?month=2026-11", null, T.t)).data;
assert.deepEqual(cal.days[day].clips.map((c) => c.name), ["Terry"]);
assert.equal([...store._m.keys()].some((k) => k.includes(K.id) && /^(clip|thumb|clipmeta|myclip)\//.test(k)), false);
// when the last person leaves, the cave's clips go with it
await call("POST", "cave", { action: "leave" }, W.t);
await call("POST", "cave", { action: "leave" }, T.t);
assert.equal([...store._m.keys()].some((k) => k.includes(cid) && /^(clip|thumb|clipmeta|myclip)\//.test(k)), false);

console.log("All Cave Calendar checks passed.");
