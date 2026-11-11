// v35: everyone's own start time (for the progress bar) and an optional lunch break.
import assert from "node:assert/strict";
import { makeApp } from "../netlify/lib/handler.mjs";
import { memStore } from "./mem-store.mjs";

const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification() {} };
let clock = Date.UTC(2026, 10, 11, 1, 0, 0);
const app = makeApp({ store: memStore(), webpush, now: () => clock, cache: {} });
const call = async (method, path, body, token) => {
  clock += 1;
  const res = await app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const d = (await call("POST", "signup", { name: "Ann", h: 18, m: 0, pin: "1234" })).data;
const t = d.token;
assert.equal(d.me.sh, 9); assert.equal(d.me.sm, 0); assert.equal(d.me.lunch, null, "9 am start and no lunch until set");
await call("POST", "cave", { action: "create", name: "Cave" }, t);

let st = (await call("POST", "me", { action: "time", h: 17, m: 30, sh: 8, sm: 30 }, t)).data;
assert.deepEqual([st.me.sh, st.me.sm, st.me.h, st.me.m], [8, 30, 17, 30]);
assert.deepEqual([st.cave.members[0].sh, st.cave.members[0].sm], [8, 30], "the cave sees it");
st = (await call("POST", "me", { action: "time", h: 18, m: 0 }, t)).data;
assert.deepEqual([st.me.sh, st.me.sm, st.me.h], [8, 30, 18], "older phones only send clock-out; the start stays");
assert.equal((await call("POST", "me", { action: "time", h: 9, m: 0, sh: 10, sm: 0 }, t)).status, 400, "start after clock-out");
assert.equal((await call("POST", "me", { action: "time", h: 18, m: 0, sh: 25, sm: 0 }, t)).status, 400);

st = (await call("POST", "me", { action: "lunch", h: 12, m: 30, dur: 45 }, t)).data;
assert.deepEqual(st.me.lunch, { h: 12, m: 30, dur: 45 });
assert.deepEqual(st.cave.members[0].lunch, { h: 12, m: 30, dur: 45 });
assert.equal((await call("POST", "me", { action: "lunch", h: 12, m: 30, dur: 20 }, t)).status, 400);
assert.equal((await call("POST", "me", { action: "lunch", h: 12 }, t)).status, 400);
st = (await call("POST", "me", { action: "lunch", off: true }, t)).data;
assert.equal(st.me.lunch, null);
console.log("All work-hours checks passed.");
