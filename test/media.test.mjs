// v34: clips and thumbnails through signed links that Netlify's CDN and the phone can keep.
import assert from "node:assert/strict";
import { makeApp } from "../netlify/lib/handler.mjs";
import { ringTimes } from "../netlify/lib/clips.mjs";
import { memStore } from "./mem-store.mjs";

const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification() {} };
let clock = Date.UTC(2026, 10, 11, 1, 0, 0);
const store = memStore(), purged = [];
const app = makeApp({ store, webpush, now: () => clock, cache: {}, purge: async (tags) => { purged.push(...tags); } });
const raw = async (method, path, body, token) => {
  clock += 1;
  return app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }));
};
const call = async (...a) => { const r = await raw(...a); return { status: r.status, data: await r.json() }; };
const upload = async (token, size = 50_000) => {
  clock += 1;
  const fd = new FormData();
  fd.append("video", new Blob([new Uint8Array(size).fill(7)], { type: "video/mp4" }), "clip");
  fd.append("thumb", new Blob([new Uint8Array(900).fill(3)], { type: "image/jpeg" }), "t.jpg");
  fd.append("dur", "3");
  return (await app.handle(new Request("https://x.test/api/clip", { method: "POST", headers: { authorization: "Bearer " + token }, body: fd }))).status;
};
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 18, m: 0, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const A = await mk("Ann"), B = await mk("Ben");
const cave = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave;
await call("POST", "cave", { action: "join", code: cave.code }, B.t);
const day = "2026-11-11";
clock = ringTimes(cave.id, day)[0] + 1000;
assert.equal(await upload(A.t), 200);

const cal = (await call("GET", "days?month=2026-11", null, B.t)).data;
const c = cal.days[day].clips[0];
assert.match(c.src, /^\/api\/m\/clip\/c-[0-9a-f]+\/2026-11-11\/p-[0-9a-f]+\.0\/\d+\/[\w-]{22}$/);
assert.match(c.tsrc, /^\/api\/m\/thumb\//);

// no log-in needed, and the CDN may keep it
let r = await raw("GET", c.src.slice(5));
assert.equal(r.status, 200);
assert.equal(r.headers.get("content-type"), "video/mp4");
assert.match(r.headers.get("netlify-cdn-cache-control"), /public, durable, max-age=31536000, immutable/);
assert.match(r.headers.get("cache-control"), /public, max-age=31536000, immutable/);
assert.ok(r.headers.get("netlify-cache-tag"));
assert.equal((await r.arrayBuffer()).byteLength, 50_000);
r = await raw("GET", c.tsrc.slice(5));
assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/jpeg");

// a changed link doesn't work: other signature, other clip, other time, clip link used for the thumb
const parts = c.src.slice(5).split("/");
const bad = (i, v) => { const p = [...parts]; p[i] = v; return p.join("/"); };
assert.equal((await raw("GET", bad(6, "A".repeat(22)))).status, 403);
assert.equal((await raw("GET", bad(5, String(Number(parts[5]) + 1)))).status, 403);
assert.equal((await raw("GET", bad(4, `${B.id}.0`))).status, 403);
assert.equal((await raw("GET", bad(1, "thumb"))).status, 403);
assert.notEqual((await raw("GET", c.src.slice(5).replace(/\/[\w-]{22}$/, "/short"))).status, 200);
// the signature survives a server restart (it is stored), and links stay the same
const app2 = makeApp({ store, webpush, now: () => clock, cache: {} });
assert.equal((await app2.handle(new Request("https://x.test" + c.src))).status, 200);

// a retake gets a new link, and the old one is taken out of the CDN
purged.length = 0;
assert.equal(await upload(A.t, 40_000), 200);
assert.equal(purged.length, 1);
const c2 = (await call("GET", "days?month=2026-11", null, B.t)).data.days[day].clips[0];
assert.notEqual(c2.src, c.src);
assert.equal((await raw("GET", c.src.slice(5))).status, 404, "the old clip is gone");
assert.equal((await (await raw("GET", c2.src.slice(5))).arrayBuffer()).byteLength, 40_000);
// deleting the account purges too
purged.length = 0;
await call("POST", "me", { action: "delete" }, A.t);
assert.ok(purged.length >= 1);
assert.equal((await raw("GET", c2.src.slice(5))).status, 404);
// the old logged-in route still works for phones on older versions
assert.equal((await call("GET", "state", null, B.t)).status, 200);

console.log("All clip link checks passed.");
