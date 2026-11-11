// v32: phones ask "still the same?" instead of re-reading the cave, and the test site keeps its own data.
import assert from "node:assert/strict";
import { makeApp, isDevDeploy } from "../netlify/lib/handler.mjs";
import { ringTimes } from "../netlify/lib/clips.mjs";
import { memStore } from "./mem-store.mjs";

const pushes = [];
const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification(sub, p) { pushes.push(JSON.parse(p)); } };
let clock = Date.UTC(2026, 10, 10, 1, 0, 0); // Tue 10 Nov 2026, 9 am SG: before the first ring
const store = memStore();
const cache = {};
const mkApp = (extra = {}) => makeApp({ store, webpush, now: () => clock, cache, ...extra });
const app = mkApp();
const callOn = (a) => async (method, path, body, token) => {
  clock += 1;
  const res = await a.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const call = callOn(app);
const cost = async (fn) => { const b = { ...store._ops }; const r = await fn(); return { r, read: store._ops.read - b.read, list: store._ops.list - b.list, write: store._ops.write - b.write }; };
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 18, m: 0, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const setMonster = (who, monster) => { const k = `person/${who.id}`; store._m.set(k, JSON.stringify({ ...JSON.parse(store._m.get(k)), monster, region: "none" })); };
const A = await mk("Ann"), B = await mk("Ben"), C = await mk("Cat"), D = await mk("Dan"), E = await mk("Eve");
for (const x of [A, B, C, D, E]) setMonster(x, 0);
const code = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave.code;
for (const x of [B, C, D, E]) await call("POST", "cave", { action: "join", code }, x.t);

/* ---------- "still the same?" ---------- */
let full = await cost(() => call("GET", "state", null, A.t));
let v = full.r.data.v;
assert.ok(v, "the state carries a version");
let same = await cost(() => call("GET", "state?v=" + encodeURIComponent(v), null, A.t));
assert.deepEqual(same.r.data, { same: true, now: clock, v });
assert.ok(same.read <= 2 && same.list === 0, `unchanged costs ${same.read} reads (was ${full.read} reads and ${full.list} lists)`);
assert.ok(full.read + full.list > 5 * (same.read + same.list));
// every kind of change the board shows gives the others a new version
const changes = [
  ["overtime", () => call("POST", "ot", { on: true, end: null }, B.t)],
  ["clock-out time", () => call("POST", "me", { action: "time", h: 17, m: 30 }, B.t)],
  ["day off", () => call("POST", "me", { action: "dayoff", on: true }, B.t)],
  ["chat message", () => call("POST", "chat", { text: "hi" }, B.t)],
  ["rename", () => call("POST", "cave", { action: "rename", name: "Den" }, A.t)],
  ["notifications on", () => call("POST", "subscribe", { subscription: { endpoint: "https://push.test/b", keys: { p256dh: "k", auth: "a" } } }, B.t)],
  ["someone leaves", () => call("POST", "cave", { action: "leave" }, E.t)],
  ["first open of the day (level)", () => call("POST", "ping", { open: true }, C.t)],
];
for (const [what, fn] of changes) {
  const r = await fn(); assert.ok(r.status < 300, what);
  const s = (await call("GET", "state?v=" + encodeURIComponent(v), null, D.t)).data;
  assert.ok(!s.same && s.v && s.v !== v, `${what} is a new version`);
  v = s.v;
  assert.equal((await call("GET", "state?v=" + encodeURIComponent(v), null, D.t)).data.same, true, `${what}: then the same again`);
}
assert.equal((await call("GET", "state", null, D.t)).data.cave.name, "Den");
// a second ping the same day changes nothing
await call("POST", "ping", {}, C.t);
assert.equal((await call("GET", "state?v=" + encodeURIComponent(v), null, D.t)).data.same, true);
const p2 = await cost(() => call("POST", "ping", {}, C.t));
assert.ok(p2.list === 0 && p2.read <= 3, "a ping after the first of the day is cheap");
// time alone changes it too: a ring going off, and at least every 10 minutes
clock = ringTimes(full.r.data.cave.id, "2026-11-10")[0] + 1000;
let s2 = (await call("GET", "state?v=" + encodeURIComponent(v), null, D.t)).data;
assert.ok(!s2.same && s2.cave.ring && s2.cave.ring.r === 0, "the ring shows up without anyone writing");
v = s2.v; clock += 11 * 60e3;
assert.ok(!(await call("GET", "state?v=" + encodeURIComponent(v), null, D.t)).data.same);
// Cyclo sees who is online, so it always gets the full state
setMonster(D, 4); // cyclo
const dState = (await call("GET", "state", null, D.t)).data;
if (dState.me.power === "cyclo") assert.ok(!(await call("GET", "state?v=" + encodeURIComponent(dState.v), null, D.t)).data.same);
setMonster(D, 0);
// someone who was removed gets the truth, not "same"
v = (await call("GET", "state", null, C.t)).data.v;
await call("POST", "cave", { action: "kick", pid: C.id }, A.t);
const kicked = (await call("GET", "state?v=" + encodeURIComponent(v), null, C.t)).data;
assert.ok(!kicked.same && kicked.cave === null);

/* ---------- chat ---------- */
const first = (await call("GET", "chat", null, A.t)).data.messages;
const lastMsg = first[first.length - 1];
const idle = await cost(() => call("GET", `chat?after=${lastMsg.at - 1}&last=${lastMsg.id}`, null, A.t));
assert.deepEqual(idle.r.data.messages, []);
assert.ok(idle.list === 0 && idle.read <= 2, "nothing new: no listing");
await call("POST", "chat", { text: "new one" }, B.t);
const got = (await call("GET", `chat?after=${lastMsg.at - 1}&last=${lastMsg.id}`, null, A.t)).data.messages;
assert.deepEqual(got.map((m) => m.text), ["hi", "new one"]);
// a cave from before v32 has no chatlast record: it is found once and remembered
store._m.delete(`chatlast/${full.r.data.cave.id}`);
assert.equal((await call("GET", "state", null, A.t)).data.cave.chatLatest.pid, B.id);
assert.ok(store._m.has(`chatlast/${full.r.data.cave.id}`));

/* ---------- zap ---------- */
pushes.length = 0;
const z = await cost(() => call("POST", "zap", { to: B.id }, A.t));
assert.equal(z.r.data.sent, 1); assert.equal(pushes.length, 1);
assert.equal(z.list, 0);
assert.equal((await call("POST", "zap", { to: B.id }, A.t)).status, 429);
assert.equal((await call("POST", "zap", { to: "../../vapid" }, A.t)).status, 404);

/* ---------- notifications: re-sending the same subscription does nothing ---------- */
const again = await cost(() => call("POST", "subscribe", { subscription: { endpoint: "https://push.test/b", keys: { p256dh: "k", auth: "a" } } }, B.t));
assert.ok(again.list === 0 && again.write === 0, "no scan of everyone's phones, nothing written");
// the same phone logging in as someone else still moves over
await call("POST", "subscribe", { subscription: { endpoint: "https://push.test/b", keys: { p256dh: "k", auth: "a" } } }, A.t);
assert.equal(store._m.has(`subs/${B.id}`), false); assert.ok(store._m.has(`subs/${A.id}`));

/* ---------- sessions remembered for a minute, but logging out is immediate ---------- */
const lo = await mk("Lou");
const r1 = await cost(() => call("GET", "state", null, lo.t));
const r2 = await cost(() => call("GET", "state", null, lo.t));
assert.ok(r2.read <= r1.read);
await call("POST", "logout", null, lo.t);
assert.equal((await call("GET", "state", null, lo.t)).status, 401);

/* ---------- the ring job reads nothing at night ---------- */
clock = Date.UTC(2026, 10, 10, 18, 0, 0); // 2 am SG
const night = await cost(() => app.ringTick());
assert.deepEqual(night.r, { caves: 0, sent: 0 }); assert.equal(night.read + night.list, 0);

/* ---------- which site is the test site ---------- */
const req = (u) => new Request(u);
assert.equal(isDevDeploy(req("https://splendid-gnome-120c81.netlify.app/api/state"), { deploy: { context: "production" } }), false);
assert.equal(isDevDeploy(req("https://splendid-gnome-120c81.netlify.app/api/state"), {}), false);
assert.equal(isDevDeploy(req("https://splendid-gnome-120c81.netlify.app/api/state"), { deploy: { context: "branch-deploy" } }), false, "the real address is never the test site");
assert.equal(isDevDeploy(req("https://main--splendid-gnome-120c81.netlify.app/api/state"), {}), false);
assert.equal(isDevDeploy(req("https://6af2bb85cb71d85b037c7b2f--splendid-gnome-120c81.netlify.app/api/state"), { deploy: { context: "production" } }), false, "a permalink of a live deploy");
assert.equal(isDevDeploy(req("https://dev--splendid-gnome-120c81.netlify.app/api/state"), { deploy: { context: "branch-deploy" } }), true);
assert.equal(isDevDeploy(req("https://dev--splendid-gnome-120c81.netlify.app/api/state"), undefined), true);

/* ---------- test site: film any time, ring on demand; the real site has neither ---------- */
clock = Date.UTC(2026, 10, 11, 1, 0, 0); // 9 am SG next day, before the first ring
assert.equal((await call("GET", "state", null, A.t)).data.cave.ring, null);
assert.equal((await call("POST", "dev/ring", null, A.t)).status, 404);
assert.equal((await call("GET", "state", null, A.t)).data.dev, undefined);
const devCall = callOn(mkApp({ dev: true, cache: {} }));
const ds = (await devCall("GET", "state", null, A.t)).data;
assert.equal(ds.dev, true); assert.equal(ds.cave.ring.r, 0);
pushes.length = 0;
assert.equal((await devCall("POST", "dev/ring", null, A.t)).data.sent, 1);
assert.equal(pushes[0].kind, "ring");
assert.deepEqual((await devCall("GET", "where")).data, { region: null, dev: true });

console.log("All v32 speed checks passed.");
