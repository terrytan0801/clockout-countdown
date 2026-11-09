// Public holidays and days off: shown as off, never break a streak, no rain alerts.
import assert from "node:assert/strict";
import { makeApp } from "../netlify/lib/handler.mjs";
import { holidayOf, regionOf } from "../netlify/lib/holidays.mjs";
import { streakUpdate, backfill } from "../netlify/lib/powers.mjs";
import { memStore } from "./mem-store.mjs";

/* ---------- tables and streak maths ---------- */
assert.equal(holidayOf("sg", "2026-11-09"), "Deepavali (observed)");
assert.equal(holidayOf("my", "2026-11-09"), "Deepavali (replacement)");
assert.equal(holidayOf("none", "2026-11-09"), null);
assert.equal(holidayOf("sg", "2026-11-10"), null);
assert.equal(holidayOf("my", "2026-08-31"), "Merdeka Day"); assert.equal(holidayOf("sg", "2026-08-31"), null);
assert.equal(regionOf({}), "sg", "Singapore by default"); assert.equal(regionOf({ region: "my" }), "my"); assert.equal(regionOf({ region: "xx" }), "sg");
const sgOff = (d) => !!holidayOf("sg", d);
// Fri 6 Nov counted, Mon 9 Nov is a holiday, Tue 10 Nov keeps the streak going
assert.deepEqual(streakUpdate({ streak: 5, lastDay: "2026-11-06", best: 5 }, "2026-11-10", sgOff), { streak: 6, lastDay: "2026-11-10", best: 6 });
assert.equal(streakUpdate({ streak: 8, lastDay: "2026-11-06", best: 8 }, "2026-11-10").streak, 4, "without the holiday it would drop a level");
const r = { streak: 5, lastDay: "2026-11-06", best: 5 };
assert.equal(streakUpdate(r, "2026-11-09", sgOff), r, "opening the app on a holiday changes nothing");
assert.deepEqual(backfill(new Set(["2026-11-05", "2026-11-06"]), "2026-11-10", sgOff), { streak: 2, lastDay: "2026-11-06", best: 2 });

/* ---------- the app ---------- */
const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification() {} };
let clock = Date.UTC(2026, 10, 9, 2, 0, 0); // Mon 9 Nov 2026, 10 am SG: Deepavali observed
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock });
const call = async (method, path, body, token) => {
  clock += 1;
  const res = await app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 18, m: 0, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const A = await mk("Ann"), B = await mk("Ben"), C = await mk("Cat");
const code = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave.code;
for (const x of [B, C]) await call("POST", "cave", { action: "join", code }, x.t);

let st = (await call("GET", "state", null, A.t)).data;
assert.equal(st.me.region, "sg");
assert.deepEqual(st.me.off, { kind: "holiday", name: "Deepavali (observed)" });
assert.ok(st.cave.members.every((m) => m.off && m.off.kind === "holiday"), "everyone in Singapore is off today");

assert.equal((await call("POST", "me", { action: "region", region: "mars" }, C.t)).status, 400);
st = (await call("POST", "me", { action: "region", region: "none" }, C.t)).data;
assert.equal(st.me.region, "none"); assert.equal(st.me.off, null);
assert.equal(st.cave.members.find((m) => m.id === C.id).off, null, "Cat has no holiday list, so she works today");

// a holiday doesn't start or count a streak
await call("POST", "ping", { open: true }, A.t);
assert.equal(store._m.get(`lvl/${A.id}`), undefined);
await call("POST", "ping", { open: true }, C.t);
assert.equal(JSON.parse(store._m.get(`lvl/${C.id}`)).streak, 1);

// taking the day off (today only)
st = (await call("POST", "me", { action: "dayoff", on: true }, C.t)).data;
assert.deepEqual(st.cave.members.find((m) => m.id === C.id).off, { kind: "leave", name: "Day off" });
st = (await call("POST", "me", { action: "dayoff", on: false }, C.t)).data;
assert.equal(st.cave.members.find((m) => m.id === C.id).off, null);

// Tue: Ann's first workday after the holiday; Cat takes Wed off and keeps her streak on Thu
clock = Date.UTC(2026, 10, 10, 2, 0, 0);
st = (await call("GET", "state", null, A.t)).data;
assert.equal(st.me.off, null);
await call("POST", "ping", { open: true }, C.t);
assert.equal(JSON.parse(store._m.get(`lvl/${C.id}`)).streak, 2);
clock = Date.UTC(2026, 10, 11, 2, 0, 0);
await call("POST", "me", { action: "dayoff", on: true }, C.t);
await call("POST", "ping", { open: true }, C.t);
assert.equal(JSON.parse(store._m.get(`lvl/${C.id}`)).streak, 2, "a day off isn't counted");
clock = Date.UTC(2026, 10, 12, 2, 0, 0);
await call("POST", "ping", { open: true }, C.t);
assert.equal(JSON.parse(store._m.get(`lvl/${C.id}`)).streak, 3, "and doesn't break the streak");

// deleting the account removes the day-off records
await call("POST", "me", { action: "delete" }, C.t);
assert.equal([...store._m.keys()].some((k) => k.includes(C.id) && /^(dayoff|leave)\//.test(k)), false);

console.log("All holiday checks passed.");
