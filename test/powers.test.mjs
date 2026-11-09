// Monster powers: streaks/levels, reroll, Mush cheers, Tako notes, Dino roars, Cyclo, Fluff weather + rain alerts.
import assert from "node:assert/strict";
import { makeApp } from "../netlify/lib/handler.mjs";
import { streakUpdate, backfill, levelFor, isWorkday, workdaysBetween, M } from "../netlify/lib/powers.mjs";
import { memStore } from "./mem-store.mjs";

/* ---------------- streak rules (pure) ---------------- */
assert.equal(isWorkday("2026-11-09"), true);  // Monday
assert.equal(isWorkday("2026-11-07"), false); // Saturday
assert.equal(workdaysBetween("2026-11-06", "2026-11-09"), 0, "a weekend isn't a missed workday");
let r = null;
for (const d of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) r = streakUpdate(r, d);
assert.equal(r.streak, 5); assert.equal(levelFor(r.streak), 1);
assert.equal(streakUpdate(r, "2026-11-07"), r, "weekend opens change nothing");
r = streakUpdate(r, "2026-11-09"); assert.equal(r.streak, 6, "Friday -> Monday keeps the streak");
r = streakUpdate(r, "2026-11-10"); assert.equal(r.streak, 7); assert.equal(levelFor(r.streak), 2);
r = streakUpdate(r, "2026-11-11"); r = streakUpdate(r, "2026-11-12"); assert.equal(r.streak, 9);
r = streakUpdate(r, "2026-11-16"); // missed Fri 13
assert.equal(r.streak, 4, "a miss drops one level (Lv2 -> Lv1), not to zero"); assert.equal(levelFor(r.streak), 1);
assert.equal(streakUpdate({ streak: 15, lastDay: "2026-11-02", best: 15 }, "2026-11-05").streak, 8, "Lv3 -> Lv2");
assert.equal(streakUpdate({ streak: 2, lastDay: "2026-11-02" }, "2026-11-05").streak, 1);
assert.equal(r.best, 9);
assert.deepEqual(backfill(new Set(["2026-11-05", "2026-11-06"]), "2026-11-09"), { streak: 2, lastDay: "2026-11-06", best: 2 });
assert.equal(backfill(new Set(["2026-11-05"]), "2026-11-09"), null, "Friday missing breaks the backfill");

/* ---------------- app setup ---------------- */
const pushed = [];
const webpush = {
  generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
  async sendNotification(sub, payload) { pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); },
};
let rain = 70, fetches = 0;
async function fetchFn(u) {
  fetches++;
  if (u.includes("geocoding")) return { ok: true, json: async () => ({ results: [{ name: "Kuala Lumpur", admin1: "Kuala Lumpur", country: "Malaysia", latitude: 3.14, longitude: 101.69 }] }) };
  const days = ["2026-11-09", "2026-11-10", "2026-11-11"], time = [], t2 = [], pp = [], wc = [];
  for (const d of days) for (let h = 0; h < 24; h++) { time.push(`${d}T${String(h).padStart(2, "0")}:00`); t2.push(30); pp.push(h >= 17 && h <= 18 ? rain : 10); wc.push(h >= 17 && h <= 18 ? 61 : 1); }
  return { ok: true, json: async () => ({ hourly: { time, temperature_2m: t2, precipitation_probability: pp, weather_code: wc },
    daily: { time: days, weather_code: [61, 3, 0], temperature_2m_max: [33, 32, 31], temperature_2m_min: [25, 25, 24], precipitation_probability_max: [80, 30, 5] } }) };
}
let clock = Date.UTC(2026, 10, 9, 2, 0, 0); // Mon 9 Nov, 10:00 am SG
const store = memStore();
const app = makeApp({ store, webpush, now: () => clock, fetchFn });
const call = async (method, path, body, token) => {
  clock += 1;
  const headers = token ? { authorization: "Bearer " + token } : {};
  const res = await app.handle(new Request("https://x.test/api/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
};
const person = async (id) => JSON.parse(store._m.get(`person/${id}`));
const setMonster = async (id, key) => { const p = await person(id); p.monster = M[key]; await store.setJSON(`person/${id}`, p); };
const STREAK = [0, 3, 7, 14];
const setLevel = async (id, lv) => store.setJSON(`lvl/${id}`, { streak: STREAK[lv], lastDay: "2026-11-09", best: STREAK[lv] });

const mk = async (name, h, m) => { const d = (await call("POST", "signup", { name, h, m, pin: "1234" })).data; return { t: d.token, id: d.me.id }; };
const T = await mk("Terry", 17, 0), K = await mk("Sukee", 17, 30), W = await mk("Winnie", 16, 30), O = await mk("Outsider", 18, 0);
const code = (await call("POST", "cave", { action: "create", name: "Cave" }, T.t)).data.cave.code;
for (const x of [K, W]) await call("POST", "cave", { action: "join", code }, x.t);
for (const x of [T, K, W]) await call("POST", "subscribe", { subscription: { endpoint: "https://push.test/" + x.id, keys: { p256dh: "k", auth: "a" } } }, x.t);
// These checks run on Mon 9 Nov 2026, which is a public holiday (Deepavali observed); holidays are tested in holidays.test.mjs.
for (const x of [T, K, W, O]) await call("POST", "me", { action: "region", region: "none" }, x.t);

/* ---------------- streak via check-ins ---------------- */
await call("POST", "ping", { open: true }, W.t);
assert.deepEqual(JSON.parse(store._m.get(`lvl/${W.id}`)), { streak: 1, lastDay: "2026-11-09", best: 1 });
await call("POST", "ping", {}, W.t);
assert.equal(JSON.parse(store._m.get(`lvl/${W.id}`)).streak, 1, "same day doesn't count twice");
let s = (await call("GET", "state", null, W.t)).data;
assert.equal(s.me.level, 0); assert.equal(s.me.next, 3);

/* ---------------- reroll ---------------- */
const before = (await person(W.id)).monster;
s = (await call("POST", "me", { action: "reroll" }, W.t)).data;
assert.notEqual(s.me.monster, before, "reroll never gives the same monster");
assert.equal(s.me.canReroll, false); assert.equal(s.me.nextReroll, "2026-12-01");
assert.equal((await call("POST", "me", { action: "reroll" }, W.t)).status, 409);
assert.equal(s.me.streak, 1, "level is kept after a reroll");

/* ---------------- Mush: Spore Cheer ---------------- */
await setMonster(K.id, "mush");
assert.equal((await call("POST", "cheer", { to: T.id }, K.t)).status, 403, "Lv0 is locked");
await setLevel(K.id, 1);
s = (await call("GET", "state", null, K.t)).data; assert.equal(s.me.cheersLeft, 1);
assert.equal((await call("POST", "cheer", { to: K.id }, K.t)).status, 400, "no self-cheer");
assert.equal((await call("POST", "cheer", { to: O.id }, K.t)).status, 404, "outside the cave");
s = (await call("POST", "cheer", { to: T.id }, K.t)).data; assert.equal(s.me.cheersLeft, 0);
assert.equal((await call("POST", "cheer", { to: W.id }, K.t)).status, 429);
s = (await call("GET", "state", null, T.t)).data; assert.deepEqual(s.cave.cheers[T.id], [{ from: K.id, lv: 1 }]);
assert.equal((await call("POST", "cheer", { to: K.id }, T.t)).status, 403, "Terry isn't Mush");

/* ---------------- Tako: Ink Notes ---------------- */
await setMonster(W.id, "tako"); await setLevel(W.id, 3);
s = (await call("POST", "note", { action: "add", text: "Lunch at 1?" }, W.t)).data;
assert.equal(s.cave.notes.length, 1); assert.equal(s.me.notesLeft, 2); assert.equal(s.me.canPin, true);
s = (await call("POST", "note", { action: "add", text: "Team dinner Friday", pin: true }, W.t)).data;
assert.equal(s.cave.notes[0].pinned, true, "pinned notes come first"); assert.equal(s.me.canPin, false);
assert.equal((await call("POST", "note", { action: "add", text: "x", pin: true }, W.t)).status, 403, "one pinned note at a time");
await call("POST", "note", { action: "add", text: "3rd" }, W.t);
assert.equal((await call("POST", "note", { action: "add", text: "4th" }, W.t)).status, 429);
const lunch = s.cave.notes.find((n) => n.text === "Lunch at 1?");
assert.equal((await call("POST", "note", { action: "remove", id: lunch.id }, K.t)).status, 403, "others can't take it down");
s = (await call("POST", "note", { action: "remove", id: lunch.id }, T.t)).data; // cave owner can
assert.equal(s.cave.notes.length, 2);
clock += 864e5; // next day: normal notes expire, pinned stays
s = (await call("GET", "state", null, T.t)).data;
assert.deepEqual(s.cave.notes.map((n) => n.text), ["Team dinner Friday"]);
clock -= 864e5;

/* ---------------- Dino: Roar ---------------- */
await setMonster(T.id, "dino"); await setLevel(T.id, 3);
assert.equal((await call("POST", "roar", {}, T.t)).status, 409, "not off yet at 10 am");
clock = Date.UTC(2026, 10, 9, 9, 5, 0); // 5:05 pm SG
await call("POST", "me", { action: "fx", fx: false }, W.t); // Winnie turned friends' effects off
pushed.length = 0;
s = (await call("POST", "roar", { text: "Freedom!!" }, T.t)).data;
assert.equal(s.cave.roars[0].text, "Freedom!!"); assert.equal(s.cave.roars[0].sound, true); assert.equal(s.me.roared, true);
assert.deepEqual(pushed.map((p) => p.endpoint), ["https://push.test/" + K.id], "Winnie opted out of effects");
assert.equal(pushed[0].payload.title, "Terry roars!");
assert.equal((await call("POST", "roar", {}, T.t)).status, 409, "once a day");

/* ---------------- Cyclo: All-Seeing Eye ---------------- */
await setMonster(K.id, "cyclo"); await setLevel(K.id, 3);
await call("POST", "ping", { open: true }, T.t);
await call("POST", "chat", { text: "hi" }, T.t);
await call("POST", "chat/read", { at: clock }, T.t);
await call("POST", "ot", { on: true, end: 70000 }, W.t); // Winnie left at 7:26 pm
s = (await call("GET", "state", null, K.t)).data;
assert.ok(s.cave.online.includes(T.id)); assert.ok(s.cave.seen[T.id] > 0); assert.equal(s.cave.nightOwl.pid, W.id);
assert.equal(s.cave.nightOwl.end, 70000);
s = (await call("GET", "state", null, T.t)).data;
assert.equal(s.cave.online, undefined, "only Cyclo owners see who's online");
await setLevel(K.id, 1);
s = (await call("GET", "state", null, K.t)).data;
assert.equal(s.cave.seen, undefined, "read receipts need Lv2"); assert.ok(Array.isArray(s.cave.online));

/* ---------------- Fluff: Weather Eye + rain alert ---------------- */
await setMonster(K.id, "fluff"); await setLevel(K.id, 3);
assert.equal((await call("GET", "geo?q=kuala", null, K.t)).data.results[0].name, "Kuala Lumpur");
s = (await call("POST", "me", { action: "city", name: "Kuala Lumpur", lat: 3.14, lon: 101.69 }, K.t)).data;
assert.equal(s.me.city.name, "Kuala Lumpur");
assert.equal(s.cave.weather[K.id].at.rain, 70); assert.equal(s.cave.weather[K.id].at.kind, "rain");
assert.equal(s.cave.weather[K.id].daily.length, 3, "Lv3 gets the 3-day forecast");
const f0 = fetches; await call("GET", "state", null, T.t);
assert.equal(fetches, f0, "forecast is cached");
assert.equal((await call("POST", "me", { action: "city", name: "x", lat: 999, lon: 0 }, K.t)).status, 400);
// Sukee clocks out 5:30 pm; alert window is 4:45-5:05 pm
await setLevel(K.id, 2);
pushed.length = 0;
clock = Date.UTC(2026, 10, 9, 8, 50, 0); // 4:50 pm
let res = await app.rainAlerts();
assert.deepEqual(res, { checked: 1, sent: 1 });
assert.equal(pushed[0].payload.title, "Fluff says: bring an umbrella"); assert.match(pushed[0].payload.body, /70% chance of rain around 5:30 pm in Kuala Lumpur/);
assert.deepEqual(await app.rainAlerts(), { checked: 0, sent: 0 }, "one alert a day");
clock = Date.UTC(2026, 10, 9, 8, 10, 0); // 4:10 pm: too early
await store.delete(`rainalert/2026-11-09/${K.id}`);
assert.deepEqual(await app.rainAlerts(), { checked: 0, sent: 0 });
await setLevel(K.id, 1);
clock = Date.UTC(2026, 10, 9, 8, 50, 0);
assert.deepEqual(await app.rainAlerts(), { checked: 0, sent: 0 }, "rain alerts need Lv2");

console.log("All power checks passed.");
