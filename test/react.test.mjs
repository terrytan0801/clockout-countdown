// v33: WhatsApp-style reactions on chat messages.
import assert from "node:assert/strict";
import { makeApp, REACTIONS, CHAT_KEEP } from "../netlify/lib/handler.mjs";
import { memStore } from "./mem-store.mjs";

const webpush = { generateVAPIDKeys: () => ({ publicKey: "P", privateKey: "Q" }), async sendNotification() {} };
let clock = Date.UTC(2026, 10, 11, 4, 0, 0);
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock, cache: {} });
const call = async (method, path, body, token) => {
  clock += 1;
  const res = await app.handle(new Request("https://x.test/api/" + path, { method, headers: token ? { authorization: "Bearer " + token } : {}, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const cost = async (fn) => { const b = { ...store._ops }; const r = await fn(); return { r, read: store._ops.read - b.read, list: store._ops.list - b.list }; };
const mk = async (name) => { const d = (await call("POST", "signup", { name, h: 18, m: 0, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const A = await mk("Ann"), B = await mk("Ben"), C = await mk("Cat"), O = await mk("Out");
const code = (await call("POST", "cave", { action: "create", name: "Cave" }, A.t)).data.cave.code;
for (const x of [B, C]) await call("POST", "cave", { action: "join", code }, x.t);
await call("POST", "cave", { action: "create", name: "Other" }, O.t);
const m1 = (await call("POST", "chat", { text: "lunch?" }, A.t)).data.message;
const m2 = (await call("POST", "chat", { text: "yes" }, B.t)).data.message;

// first load carries the reactions (none yet) and their version
let g = (await call("GET", "chat", null, C.t)).data;
assert.deepEqual(g.reactions, {}); assert.ok(g.rv);
let rv = g.rv;

// react, change, remove
let r = await call("POST", "chat/react", { id: m1.id, emoji: "👍" }, B.t);
assert.equal(r.status, 200); assert.deepEqual(r.data.reactions, { [m1.id]: { [B.id]: "👍" } });
await call("POST", "chat/react", { id: m1.id, emoji: "😂" }, C.t);
r = await call("POST", "chat/react", { id: m1.id, emoji: "❤️" }, B.t);
assert.deepEqual(r.data.reactions[m1.id], { [B.id]: "❤️", [C.id]: "😂" }, "one reaction per person: changing replaces it");
assert.equal([...store._m.keys()].filter((k) => k.startsWith(`react/`) && k.includes(`/${B.id}/`)).length, 1);
r = await call("POST", "chat/react", { id: m1.id, emoji: null }, C.t);
assert.deepEqual(r.data.reactions, { [m1.id]: { [B.id]: "❤️" } }, "none removes mine");
await call("POST", "chat/react", { id: m2.id, emoji: "🙏" }, A.t);

// everyone else picks the change up on their next poll, and an idle poll stays cheap
const last = m2;
g = (await call("GET", `chat?after=${last.at - 1}&last=${last.id}&rv=${rv}`, null, C.t)).data;
assert.deepEqual(g.messages, []);
assert.deepEqual(g.reactions, { [m1.id]: { [B.id]: "❤️" }, [m2.id]: { [A.id]: "🙏" } });
assert.notEqual(g.rv, rv); rv = g.rv;
const idle = await cost(() => call("GET", `chat?after=${last.at - 1}&last=${last.id}&rv=${rv}`, null, C.t));
assert.deepEqual(idle.r.data, { messages: [] });
assert.ok(idle.list === 0 && idle.read <= 3, `idle poll: ${idle.read} reads, ${idle.list} lists`);
// a new message alone doesn't resend reactions
const m3 = (await call("POST", "chat", { text: "ok" }, A.t)).data.message;
g = (await call("GET", `chat?after=${last.at - 1}&last=${last.id}&rv=${rv}`, null, C.t)).data;
assert.deepEqual(g.messages.map((m) => m.text), ["yes", "ok"]); assert.equal(g.reactions, undefined);

// replies (v40): a short copy of the message answered goes with the reply
const long = "x".repeat(300);
const ml = (await call("POST", "chat", { text: long }, B.t)).data.message;
const rep1 = (await call("POST", "chat", { text: "sure!", re: m1.id }, C.t)).data.message;
assert.deepEqual(rep1.re, { id: m1.id, pid: A.id, name: "Ann", color: m1.color, text: "lunch?" });
assert.equal((await call("POST", "chat", { text: "ok", re: ml.id }, A.t)).data.message.re.text.length, 120, "the copy is short");
assert.equal((await call("POST", "chat", { text: "hm", re: "1794390000000-abcdef" }, A.t)).status, 404);
assert.equal((await call("POST", "chat", { text: "hm", re: "../../vapid" }, A.t)).status, 404);
assert.equal((await call("POST", "chat", { text: "hm", re: m1.id }, O.t)).status, 404, "not a message in your cave");
assert.equal((await call("POST", "chat", { text: "plain" }, A.t)).data.message.re, undefined);
const got2 = (await call("GET", "chat", null, B.t)).data.messages.find((m) => m.id === rep1.id);
assert.equal(got2.re.id, m1.id, "replies come back with their quote");

// the rules
assert.equal((await call("POST", "chat/react", { id: m1.id, emoji: "🍕" }, A.t)).status, 400, "only the six");
assert.equal((await call("POST", "chat/react", { id: "1794390000000-abcdef", emoji: "👍" }, A.t)).status, 404);
assert.equal((await call("POST", "chat/react", { id: "../../vapid", emoji: "👍" }, A.t)).status, 404);
assert.equal((await call("POST", "chat/react", { id: m1.id, emoji: "👍" }, O.t)).status, 404, "other caves can't react");
assert.equal((await call("POST", "chat/react", { id: m1.id, emoji: "👍" })).status, 401);
assert.deepEqual(REACTIONS.length, 6);

// old messages take their reactions with them
await call("POST", "chat/react", { id: m3.id, emoji: "😮" }, B.t);
for (let i = 0; i < CHAT_KEEP; i++) { clock += 10; await call("POST", "chat", { text: "m" + i }, C.t); }
assert.equal([...store._m.keys()].filter((k) => k.startsWith("react/")).length, 0, "reactions on trimmed messages are gone");

// the cave's last person leaving clears it all
await call("POST", "chat/react", { id: (await call("GET", "chat", null, A.t)).data.messages.pop().id, emoji: "👍" }, A.t);
const cid = (await call("GET", "state", null, A.t)).data.cave.id;
for (const x of [A, B, C]) await call("POST", "cave", { action: "leave" }, x.t);
assert.equal([...store._m.keys()].some((k) => k.includes(cid) && /^(react|chatre|chat|chatlast)\//.test(k)), false);

console.log("All reaction checks passed.");
