// Runs the API handler against an in-memory store and a fake web-push. `npm test`
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { makeHandler, ZAP_COOLDOWN_MS, LOCK_MS, CHAT_KEEP } from "../netlify/lib/handler.mjs";
import { memStore } from "./mem-store.mjs";

const pushed = [];
const webpush = {
  generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
  async sendNotification(sub, payload) {
    if (sub.endpoint.includes("gone")) { const e = new Error("gone"); e.statusCode = 410; throw e; }
    pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  },
};
let clock = Date.UTC(2026, 10, 6, 8, 0, 0); // 4pm SG

function setup(store = memStore()) {
  const handle = makeHandler({ store, webpush, now: () => clock });
  const call = async (method, path, body, token) => {
    clock += 1; // real requests never land in the same millisecond
    const headers = token ? { authorization: "Bearer " + token } : {};
    const res = await handle(new Request("https://x.test/api/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, data: await res.json() };
  };
  return { store, call };
}
const sub = (e) => ({ endpoint: "https://push.test/" + e, keys: { p256dh: "k", auth: "a" } });

/* ---------------- accounts ---------------- */
let { store, call } = setup();
assert.equal((await call("GET", "state")).status, 401);
let r = await call("POST", "signup", { name: "Terry", h: 17, m: 0, pin: "1234", color: "orange" });
assert.equal(r.status, 200); const terry = r.data.token; const terryId = r.data.me.id;
assert.equal(r.data.me.color, "orange"); assert.ok(r.data.me.monster >= 0 && r.data.me.monster < 10);
assert.equal(r.data.cave, null); assert.equal(r.data.me.hash, undefined);
assert.equal((await call("POST", "signup", { name: "terry", h: 17, m: 0, pin: "9999" })).status, 409);
assert.equal((await call("POST", "signup", { name: "Lily", h: 18, m: 0, pin: "12" })).status, 400);
r = await call("POST", "signup", { name: "Sukee", h: 17, m: 30, pin: "secret pass", color: "violet" });
const sukee = r.data.token; const sukeeId = r.data.me.id;
r = await call("POST", "signup", { name: "Winnie", h: 18, m: 0, pin: "5555", color: "nope" });
const winnie = r.data.token; const winnieId = r.data.me.id; assert.ok(r.data.me.color !== "nope");

r = await call("POST", "login", { name: "SUKEE", pin: "secret pass" }); assert.equal(r.status, 200); assert.equal(r.data.me.id, sukeeId);
r = await call("POST", "login", { name: "Nobody", pin: "1111" }); assert.match(r.data.error, /Join/);
for (let i = 0; i < 5; i++) await call("POST", "login", { name: "Winnie", pin: "0000" });
assert.equal((await call("POST", "login", { name: "Winnie", pin: "5555" })).status, 429);
clock += LOCK_MS + 1;
assert.equal((await call("POST", "login", { name: "Winnie", pin: "5555" })).status, 200);

/* ---------------- caves ---------------- */
assert.equal((await call("POST", "chat", { text: "hi" }, terry)).status, 409, "no chat without a cave");
r = await call("POST", "cave", { action: "create", name: "Monster Cave" }, terry);
assert.equal(r.data.cave.name, "Monster Cave"); assert.equal(r.data.cave.owner, terryId);
const code = r.data.cave.code; assert.match(code, /^[A-Z2-9]{6}$/);
assert.equal((await call("POST", "cave", { action: "create", name: "Second" }, terry)).status, 409, "one cave only");

r = await call("POST", "cave", { action: "peek", code: code.toLowerCase() }, sukee);
assert.equal(r.data.name, "Monster Cave"); assert.equal(r.data.members, 1);
r = await call("POST", "cave", { action: "join", code }, sukee); assert.equal(r.data.cave.members.length, 2);
r = await call("POST", "cave", { action: "join", code: "ZZZZZZ" }, winnie); assert.equal(r.status, 404);

// Winnie makes her own cave, then switching needs confirmation
r = await call("POST", "cave", { action: "create", name: "" }, winnie); assert.equal(r.data.cave.name, "Winnie's Cave");
const winnieCave = r.data.cave.id; const winnieCode = r.data.cave.code;
r = await call("POST", "cave", { action: "join", code }, winnie); assert.equal(r.status, 409); assert.equal(r.data.needsSwitch, true);
r = await call("POST", "cave", { action: "join", code, switch: true }, winnie); assert.equal(r.data.cave.members.length, 3);
assert.equal(store._m.has(`cave/${winnieCave}`), false, "empty cave is deleted");
assert.equal(store._m.has(`code/${winnieCode}`), false);

// owner powers
assert.equal((await call("POST", "cave", { action: "rename", name: "Nope" }, sukee)).status, 403);
r = await call("POST", "cave", { action: "rename", name: "Clockout Cave" }, terry); assert.equal(r.data.cave.name, "Clockout Cave");
r = await call("POST", "cave", { action: "newcode" }, terry); const code2 = r.data.cave.code; assert.notEqual(code2, code);
assert.equal((await call("POST", "cave", { action: "peek", code }, sukee)).status, 404, "old code stops working");
assert.equal((await call("POST", "cave", { action: "kick", pid: sukeeId }, winnie)).status, 403);
r = await call("POST", "cave", { action: "kick", pid: winnieId }, terry); assert.equal(r.data.cave.members.length, 2);
r = await call("GET", "state", null, winnie); assert.equal(r.data.cave, null, "kicked person lands in the lobby");
r = await call("POST", "cave", { action: "join", code: code2 }, winnie); assert.equal(r.data.cave.members.length, 3);

/* ---------------- me ---------------- */
r = await call("POST", "me", { action: "color", color: "teal" }, sukee); assert.equal(r.data.me.color, "teal");
assert.equal((await call("POST", "me", { action: "color", color: "rainbow" }, sukee)).status, 400);
r = await call("POST", "me", { action: "time", h: 18, m: 15 }, sukee);
assert.equal(r.data.cave.members.find((p) => p.id === sukeeId).h, 18);
r = await call("POST", "me", { action: "buzz", buzz: false }, sukee); assert.equal(r.data.me.buzz, false);

/* ---------------- OT ---------------- */
r = await call("POST", "ot", { on: true, end: null }, sukee); assert.deepEqual(r.data.cave.ot[sukeeId], { on: true, end: null });
r = await call("GET", "state", null, terry); assert.deepEqual(r.data.cave.ot[sukeeId], { on: true, end: null });
r = await call("POST", "ot", { on: false }, sukee); assert.equal(r.data.cave.ot[sukeeId], undefined);

/* ---------------- zaps ---------------- */
await call("POST", "subscribe", { subscription: sub("sukee-phone") }, sukee);
await call("POST", "subscribe", { subscription: sub("gone1") }, sukee);
r = await call("GET", "state", null, terry); assert.deepEqual(r.data.cave.reachable, [sukeeId]);
r = await call("POST", "zap", { to: sukeeId, message: "88 mins to go" }, terry);
assert.equal(r.data.sent, 1); assert.equal(r.data.buzz, false);
assert.equal(pushed.at(-1).payload.buzz, false, "Sukee turned buzz off");
assert.equal(pushed.at(-1).payload.title, "⚡ Zap from Terry!");
assert.equal(JSON.parse(store._m.get(`subs/${sukeeId}`)).length, 1, "dead subscription pruned");
assert.equal((await call("POST", "zap", { to: sukeeId }, terry)).status, 429);
r = await call("GET", "state", null, terry); assert.ok(r.data.cave.zaps[sukeeId]);
await call("POST", "me", { action: "buzz", buzz: true }, sukee);
clock += ZAP_COOLDOWN_MS + 1;
r = await call("POST", "zap", { to: sukeeId }, terry); assert.equal(r.data.buzz, true);
assert.equal((await call("POST", "zap", { to: terryId }, terry)).status, 400);
// someone outside the cave can't be zapped
r = await call("POST", "signup", { name: "Lily", h: 18, m: 0, pin: "7777" }); const lily = r.data.token; const lilyId = r.data.me.id;
assert.equal((await call("POST", "zap", { to: lilyId }, terry)).status, 404);
assert.equal((await call("POST", "zap", { to: terryId }, lily)).status, 404);

/* ---------------- chat ---------------- */
r = await call("POST", "chat", { text: "  hello cave  " }, terry); assert.equal(r.data.message.text, "hello cave");
const t1 = r.data.message.at;
clock += 1000;
r = await call("POST", "chat", { text: "hi Terry" }, sukee); assert.equal(r.data.message.color, "teal");
r = await call("GET", "chat", null, winnie); assert.equal(r.data.messages.length, 2); assert.equal(r.data.messages[0].name, "Terry");
r = await call("GET", "chat?after=" + t1, null, winnie); assert.equal(r.data.messages.length, 1);
r = await call("GET", "state", null, terry); assert.equal(r.data.cave.chatLatest.pid, sukeeId);
assert.equal((await call("POST", "chat", { text: "   " }, terry)).status, 400);
assert.equal((await call("GET", "chat", null, lily)).status, 409);
for (let i = 0; i < CHAT_KEEP + 5; i++) { clock += 10; await call("POST", "chat", { text: "m" + i }, winnie); }
assert.equal([...store._m.keys()].filter((k) => k.startsWith("chat/")).length, CHAT_KEEP, "old messages trimmed");

/* ---------------- leaving ---------------- */
r = await call("POST", "cave", { action: "leave" }, terry); assert.equal(r.data.cave, null);
r = await call("GET", "state", null, sukee); assert.equal(r.data.cave.owner, sukeeId, "ownership passes on");
r = await call("POST", "me", { action: "delete" }, winnie); assert.equal(r.status, 200);
assert.equal((await call("GET", "state", null, winnie)).status, 401);
assert.equal((await call("POST", "signup", { name: "Winnie", h: 18, m: 0, pin: "1111" })).status, 200, "name is free again");

/* ---------------- v8 -> v9 migration ---------------- */
{
  const s = memStore();
  const salt = "aa";
  const hash = scryptSync("1234", salt, 32).toString("hex");
  const day = "2026-11-07";
  clock = Date.UTC(2026, 10, 7, 2, 0, 0);
  await s.setJSON("people", [
    { id: "p-1", name: "Terry", h: 17, m: 0, at: 1, salt, hash },
    { id: "p-2", name: "Sukee", h: 17, m: 30, at: 2, salt, hash },
  ]);
  await s.setJSON("sessions/" + "a".repeat(48), { pid: "p-2", at: 1 });
  await s.setJSON(`ot/${day}`, { "p-2": { on: true, end: null } });
  await s.setJSON("subs/p-2", [sub("x")]);
  const { call: c2 } = setup(s);
  r = await c2("GET", "state", null, "a".repeat(48));
  assert.equal(r.status, 200, "old session still works");
  assert.equal(r.data.cave.name, "The Original Cave"); assert.equal(r.data.cave.owner, "p-1");
  assert.equal(r.data.me.color, "violet"); assert.equal(r.data.me.monster, 1, "keeps the v8 monster");
  assert.deepEqual(r.data.cave.ot["p-2"], { on: true, end: null });
  assert.deepEqual(r.data.cave.reachable, ["p-2"]);
  assert.equal((await c2("POST", "login", { name: "terry", pin: "1234" })).status, 200, "old PIN still works");
  assert.equal(s._m.has("people"), false);
}

console.log("All API checks passed.");
