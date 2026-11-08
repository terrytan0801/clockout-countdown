// Clock-out Countdown API (v9). All state lives in one Netlify Blobs store.
// Every record has its own key, so two people acting at once never overwrite each other.
//
//   person/<pid>               {id,name,h,m,color,monster,buzz,cave,at,salt,hash}
//   uname/<lower name>         pid                       (makes names unique)
//   sessions/<token>           {pid, at}
//   lock/<lower name>          {fails, until}            (wrong-PIN lockout)
//   cave/<cid>                 {id,name,owner,code,at}
//   code/<CODE>                cid
//   member/<cid>/<pid>         {at}
//   ot/<YYYY-MM-DD>/<pid>      {on, end}                 (end = seconds after midnight, SG time)
//   subs/<pid>                 [PushSubscription JSON]
//   zap/<from>/<to>            {at}
//   chat/<cid>/<ts>-<rand>     {pid,name,color,monster,text,at}
//   vapid                      {publicKey, privateKey}
//   meta/v9                    marks the v8 -> v9 migration as done
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { makeStats } from "./stats.mjs";
import {
  POWERS, READY, M, CHEERS_PER_DAY, NOTES_AT_ONCE, levelInfo, streakUpdate, backfill, isWorkday, weekdayOf, addDays,
  dayStartMs, monthOf, sgSeconds, getWeather, weatherAt, dailyOf, geocode,
} from "./powers.mjs";

export const ZAP_COOLDOWN_MS = 10 * 60 * 1000;
export const LOCK_AFTER = 5;
export const LOCK_MS = 10 * 60 * 1000;
export const COLORS = ["orange", "red", "pink", "violet", "indigo", "blue", "cyan", "teal", "green", "amber", "gold", "brown"];
export const MONSTER_COUNT = 10;
export const MAX_MEMBERS = 30;
export const CHAT_KEEP = 200;
const MAX_SUBS_PER_PERSON = 5;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export function sgDay(now = Date.now()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(now)).reduce((o, x) => ((o[x.type] = x.value), o), {});
  return `${p.year}-${p.month}-${p.day}`;
}

const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
const cleanText = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const validPin = (p) => typeof p === "string" && p.length >= 4 && p.length <= 32;
const nameKey = (name) => encodeURIComponent(name.toLowerCase());
const hashPin = (pin, salt) => scryptSync(pin, salt, 32).toString("hex");
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
const publicPerson = ({ id, name, h, m, color, monster }) => ({ id, name, h, m, color, monster });
const chatKeyTs = (key) => Number(key.split("/").pop().split("-")[0]);

export const makeHandler = (opts) => makeApp(opts).handle;
const fmt12 = (h, m) => `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;

export function makeApp({ store, webpush, now = () => Date.now(), adminKey = null, fetchFn = (...a) => globalThis.fetch(...a) }) {
  const stats = makeStats({ store, now, adminKey });
  const getJSON = async (key, fallback = null) => (await store.get(key, { type: "json" })) ?? fallback;
  const exists = async (key) => (await store.getMetadata(key)) !== null;
  const keys = async (prefix) => (await store.list({ prefix })).blobs.map((b) => b.key);
  const getPerson = (pid) => getJSON(`person/${pid}`);
  const putPerson = (p) => store.setJSON(`person/${p.id}`, p);

  /* ---------- one-time move of v8 data (single "people" list) into a cave ---------- */
  let migrated = false;
  async function migrate() {
    if (migrated) return;
    if (await exists("meta/v9")) { migrated = true; return; }
    const old = await getJSON("people");
    if (!old || !old.length) { await store.setJSON("meta/v9", { at: now(), moved: 0 }); migrated = true; return; }
    const claim = await store.setJSON("meta/v9-lock", { at: now() }, { onlyIfNew: true });
    if (claim && claim.modified === false) return; // another request is migrating right now
    const v8Colors = ["orange", "violet", "teal", "pink", "blue", "amber", "green"];
    const sorted = old.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const cid = "c-" + randomBytes(5).toString("hex");
    const code = newCode();
    await store.setJSON(`cave/${cid}`, { id: cid, name: "The Original Cave", owner: sorted[0].id, code, at: now() });
    await store.setJSON(`code/${code}`, cid);
    const day = sgDay(now());
    const oldOt = await getJSON(`ot/${day}`, {});
    await Promise.all(sorted.map(async (p, i) => {
      await putPerson({ id: p.id, name: p.name, h: p.h, m: p.m, color: v8Colors[i % v8Colors.length], monster: i % 4,
        buzz: true, cave: cid, at: p.at || now(), salt: p.salt, hash: p.hash });
      await store.setJSON(`uname/${nameKey(p.name)}`, p.id);
      await store.setJSON(`member/${cid}/${p.id}`, { at: p.at || now() });
      if (oldOt[p.id]) await store.setJSON(`ot/${day}/${p.id}`, oldOt[p.id]);
    }));
    await store.setJSON("meta/v9", { at: now(), moved: sorted.length, cave: cid });
    await Promise.all(["people", "zaps", `ot/${day}`, "meta/v9-lock"].map((k) => store.delete(k)));
    migrated = true;
  }

  async function vapidKeys() {
    let k = await getJSON("vapid");
    if (!k) {
      k = webpush.generateVAPIDKeys();
      const res = await store.setJSON("vapid", k, { onlyIfNew: true });
      if (res && res.modified === false) k = await getJSON("vapid", k);
    }
    return k;
  }

  async function newSession(pid) {
    const token = randomBytes(24).toString("hex");
    await store.setJSON(`sessions/${token}`, { pid, at: now() });
    return token;
  }

  async function auth(req) {
    const m = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.get("authorization") || "");
    if (!m) return null;
    const s = await getJSON(`sessions/${m[1]}`);
    if (!s) return null;
    const me = await getPerson(s.pid);
    return me ? { me, token: m[1] } : null;
  }

  // Members in the order they joined the cave (joinedAt comes from the member record).
  async function caveMembers(cid) {
    const mkeys = await keys(`member/${cid}/`);
    const rows = await Promise.all(mkeys.map(async (k) => {
      const pid = k.split("/")[2];
      const [p, mem, lv] = await Promise.all([getPerson(pid), getJSON(k), getJSON(`lvl/${pid}`)]);
      return p && p.cave === cid ? { ...p, joinedAt: mem?.at ?? p.at, level: levelInfo(lv).level } : null;
    }));
    return rows.filter(Boolean).sort((x, y) => x.joinedAt - y.joinedAt || (x.id < y.id ? -1 : 1));
  }

  async function chatLatest(cid) {
    const ks = await keys(`chat/${cid}/`);
    if (!ks.length) return null;
    const last = ks.reduce((a, b) => (chatKeyTs(b) > chatKeyTs(a) ? b : a));
    const msg = await getJSON(last);
    return msg ? { at: msg.at, pid: msg.pid } : null;
  }

  async function state(me) {
    const t = now();
    const day = sgDay(t);
    const lv = levelInfo(await getJSON(`lvl/${me.id}`));
    const power = POWERS[me.monster] || "jelly";
    const sameMonth = me.monsterChangedAt && monthOf(me.monsterChangedAt) === monthOf(t);
    const [yy, mm] = monthOf(t).split("-").map(Number);
    const base = {
      now: t, day, cooldownMs: ZAP_COOLDOWN_MS, colors: COLORS,
      me: {
        ...publicPerson(me), buzz: me.buzz !== false, fx: me.fx !== false, city: me.city || null,
        ...lv, power, ready: READY.has(power),
        canReroll: !sameMonth,
        nextReroll: sameMonth ? `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01` : null,
        cheersLeft: 0, notesLeft: 0, canPin: false, roared: false,
      },
      cave: null,
    };
    if (!me.cave) return base;
    const cave = await getJSON(`cave/${me.cave}`);
    if (!cave) return base;
    const members = await caveMembers(cave.id);
    const [ot, zaps, reach, latest] = await Promise.all([
      Promise.all(members.map((p) => getJSON(`ot/${day}/${p.id}`))),
      Promise.all(members.map((p) => (p.id === me.id ? null : getJSON(`zap/${me.id}/${p.id}`)))),
      Promise.all(members.map((p) => exists(`subs/${p.id}`))),
      chatLatest(cave.id),
    ]);
    const otMap = {}, zapMap = {};
    members.forEach((p, i) => {
      if (ot[i]) otMap[p.id] = ot[i];
      if (zaps[i] && t - zaps[i].at < ZAP_COOLDOWN_MS) zapMap[p.id] = zaps[i].at;
    });
    const ids = new Set(members.map((p) => p.id));
    const extra = await powersState(me, lv.level, power, cave, members, ids, day, t, base.me);
    return {
      ...base,
      cave: {
        id: cave.id, name: cave.name, owner: cave.owner, code: cave.code,
        members: members.map((p) => ({ ...publicPerson(p), level: p.level })),
        ot: otMap, zaps: zapMap,
        reachable: members.filter((_, i) => reach[i]).map((p) => p.id),
        chatLatest: latest,
        ...extra,
      },
    };
  }

  /* ---------- monster powers in the cave state ---------- */
  async function cheersToday(day) {
    return (await keys(`cheer/${day}/`)).map((k) => { const [, , to, rest] = k.split("/"); const [ts, from, l] = rest.split("_"); return { to, from, at: Number(ts), lv: Number(l) || 1 }; });
  }
  async function liveNotes(cid, t) {
    const rows = (await Promise.all((await keys(`note/${cid}/`)).map(async (k) => { const v = await getJSON(k); return v && { ...v, k }; }))).filter(Boolean);
    const dead = rows.filter((n) => n.expires <= t);
    await Promise.all(dead.map((n) => store.delete(n.k)));
    return rows.filter((n) => n.expires > t).sort((a, b) => (b.pinned - a.pinned) || (a.at - b.at)).map(({ k, ...n }) => n);
  }
  async function powersState(me, level, power, cave, members, ids, day, t, meOut) {
    const [cheers, notes, roarKeys] = await Promise.all([cheersToday(day), liveNotes(cave.id, t), keys(`roar/${day}/`)]);
    const roars = (await Promise.all(roarKeys.map((k) => getJSON(k)))).filter((r) => r && ids.has(r.pid)).sort((a, b) => a.at - b.at);
    const cheerMap = {};
    for (const c of cheers) if (ids.has(c.to)) (cheerMap[c.to] ||= []).push({ from: c.from, lv: c.lv });
    if (power === "mush" && level >= 1) meOut.cheersLeft = Math.max(0, CHEERS_PER_DAY[level] - cheers.filter((c) => c.from === me.id).length);
    if (power === "tako" && level >= 1) {
      const mine = notes.filter((n) => n.pid === me.id);
      meOut.notesLeft = Math.max(0, NOTES_AT_ONCE[level] - mine.length);
      meOut.canPin = level >= 3 && !mine.some((n) => n.pinned);
    }
    meOut.roared = roars.some((r) => r.pid === me.id);

    // Fluff: weather at each Fluff's clock-out time (whole cave sees it on their card)
    const weather = {};
    await Promise.all(members.filter((p) => p.monster === M.fluff && p.level >= 1 && p.city).map(async (p) => {
      try {
        const data = await getWeather({ store, fetchFn, now, lat: p.city.lat, lon: p.city.lon });
        weather[p.id] = { city: p.city.name, at: weatherAt(data, day, p.h), daily: p.level >= 3 ? dailyOf(data) : null };
      } catch (e) { console.error("weather", e.message); }
    }));

    const out = { cheers: cheerMap, notes, roars, weather };
    // Cyclo: only the Cyclo owner sees these
    if (power === "cyclo" && level >= 1) {
      const uses = await Promise.all(members.map((p) => getJSON(`use/${day}/${p.id}`)));
      out.online = members.filter((p, i) => uses[i] && t - uses[i].last < 3 * 60e3).map((p) => p.id);
      if (level >= 2) {
        const reads = await Promise.all(members.map((p) => getJSON(`read/${cave.id}/${p.id}`)));
        out.seen = Object.fromEntries(members.map((p, i) => [p.id, reads[i]?.at || 0]));
      }
      if (level >= 3) {
        const days = [];
        for (let d = addDays(day, -((weekdayOf(day) + 6) % 7)); d <= day; d = addDays(d, 1)) if (isWorkday(d)) days.push(d);
        let owl = null;
        await Promise.all(days.flatMap((d) => members.map(async (p) => {
          const o = await getJSON(`ot/${d}/${p.id}`);
          if (o && o.on && o.end != null && o.end > p.h * 3600 + p.m * 60 && (!owl || o.end > owl.end)) owl = { pid: p.id, end: o.end, day: d };
        })));
        out.nightOwl = owl;
      }
    }
    return out;
  }

  async function touchStreak(pid) {
    const today = sgDay(now());
    if (!isWorkday(today)) return;
    let rec = await getJSON(`lvl/${pid}`);
    if (rec && rec.lastDay === today) return;
    if (!rec) {
      const days = new Set((await keys("use/")).filter((k) => k.endsWith("/" + pid)).map((k) => k.split("/")[1]));
      days.delete(today);
      rec = backfill(days, today);
    }
    await store.setJSON(`lvl/${pid}`, streakUpdate(rec, today));
  }

  // Scheduled every 15 minutes: Fluff Lv2+ gets one rain alert 25-45 minutes before clock-out.
  async function rainAlerts() {
    const t = now(), today = sgDay(t), nowSec = sgSeconds(t);
    if (nowSec < 15 * 60) { // once a day, tidy up old power records
      const cut = addDays(today, -14);
      const old = (await Promise.all(["cheer/", "roar/", "rainalert/"].map(keys))).flat().filter((k) => k.split("/")[1] < cut);
      await Promise.all(old.map((k) => store.delete(k)));
    }
    if (!isWorkday(today)) return { checked: 0, sent: 0 };
    let checked = 0, sent = 0;
    const people = (await Promise.all((await keys("person/")).map((k) => getJSON(k)))).filter((p) => p && p.monster === M.fluff && p.city);
    for (const p of people) {
      const off = p.h * 3600 + p.m * 60;
      if (nowSec < off - 45 * 60 || nowSec >= off - 25 * 60) continue;
      if (levelInfo(await getJSON(`lvl/${p.id}`)).level < 2) continue;
      const ak = `rainalert/${today}/${p.id}`;
      if (await exists(ak)) continue;
      checked++;
      let w = null;
      try { w = weatherAt(await getWeather({ store, fetchFn, now, lat: p.city.lat, lon: p.city.lon }), today, p.h); } catch (e) { continue; }
      await store.setJSON(ak, { at: t, rain: w ? w.rain : null });
      if (w && w.rain >= 50) sent += await sendPush(p.id, {
        title: "Fluff says: bring an umbrella",
        body: `${w.rain}% chance of rain around ${fmt12(p.h, p.m)} in ${p.city.name}.`,
        tag: "rain", url: "/", buzz: p.buzz !== false,
      });
    }
    return { checked, sent };
  }

  async function sendPush(pid, payload) {
    const key = `subs/${pid}`;
    const subs = await getJSON(key, []);
    if (!subs.length) return 0;
    const { publicKey, privateKey } = await vapidKeys();
    const opts = { TTL: 600, urgency: "high", vapidDetails: { subject: "mailto:clockout@example.com", publicKey, privateKey } };
    let sent = 0;
    const keep = [];
    await Promise.all(subs.map(async (sub) => {
      try { await webpush.sendNotification(sub, JSON.stringify(payload), opts); sent++; keep.push(sub); }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) return; keep.push(sub); }
    }));
    if (keep.length !== subs.length) { if (keep.length) await store.setJSON(key, keep); else await store.delete(key); }
    return sent;
  }

  async function dropEndpointEverywhere(endpoint, exceptKey) {
    await Promise.all((await keys("subs/")).filter((k) => k !== exceptKey).map(async (k) => {
      const list = await getJSON(k, []);
      const next = list.filter((s) => s.endpoint !== endpoint);
      if (next.length !== list.length) { if (next.length) await store.setJSON(k, next); else await store.delete(k); }
    }));
  }

  async function claimCode(cid) {
    for (let i = 0; i < 8; i++) {
      const code = newCode();
      const r = await store.setJSON(`code/${code}`, cid, { onlyIfNew: true });
      if (!r || r.modified !== false) return code;
    }
    throw new Error("Could not create an invite code.");
  }

  // Take a person out of their cave. Hands the cave to the next member, or deletes it if empty.
  async function leaveCave(person) {
    const cid = person.cave;
    if (!cid) return;
    await store.delete(`member/${cid}/${person.id}`);
    await putPerson({ ...person, cave: null });
    const cave = await getJSON(`cave/${cid}`);
    if (!cave) return;
    const rest = (await caveMembers(cid)).filter((p) => p.id !== person.id);
    if (!rest.length) {
      await store.delete(`code/${cave.code}`);
      await store.delete(`cave/${cid}`);
      await Promise.all((await keys(`chat/${cid}/`)).map((k) => store.delete(k)));
    } else if (cave.owner === person.id) {
      await store.setJSON(`cave/${cid}`, { ...cave, owner: rest[0].id });
    }
  }

  async function joinCave(person, cid) {
    const count = (await keys(`member/${cid}/`)).length;
    if (count >= MAX_MEMBERS) return { error: "This cave is full.", status: 409 };
    await store.setJSON(`member/${cid}/${person.id}`, { at: now() });
    await putPerson({ ...person, cave: cid });
    return null;
  }

  async function handle(req) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
    const method = req.method.toUpperCase();
    let body = {};
    if (method === "POST") {
      try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { return json({ error: "Body must be JSON." }, 400); }
      if (!body || typeof body !== "object") return json({ error: "Body must be a JSON object." }, 400);
    }

    try {
      await migrate();

      /* ---------- admin (admin key, not a log-in) ---------- */
      if (route.startsWith("admin/")) {
        if (!stats.isAdmin(req)) return json({ error: "That admin key didn't work." }, 401);
        if (route === "admin/stats" && method === "GET") {
          const days = [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
          return json(await stats.report(days));
        }
        return json({ error: "Not found." }, 404);
      }

      /* ---------- signed out ---------- */
      if (route === "vapid" && method === "GET") return json({ publicKey: (await vapidKeys()).publicKey });

      if (route === "signup" && method === "POST") {
        const name = cleanName(body.name);
        if (!name) return json({ error: "Enter your name." }, 400);
        if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick your clock-out time." }, 400);
        if (!validPin(body.pin)) return json({ error: "Your passcode needs at least 4 characters." }, 400);
        const color = COLORS.includes(body.color) ? body.color : COLORS[randomInt(COLORS.length)];
        const id = "p-" + randomBytes(5).toString("hex");
        const claim = await store.setJSON(`uname/${nameKey(name)}`, id, { onlyIfNew: true });
        if (claim && claim.modified === false) return json({ error: `The name ${name} is taken. Try adding a letter or number.` }, 409);
        const salt = randomBytes(16).toString("hex");
        const person = { id, name, h: body.h, m: body.m, color, monster: randomInt(MONSTER_COUNT), buzz: true, cave: null, at: now(), salt, hash: hashPin(body.pin, salt) };
        await putPerson(person);
        await stats.log("signup", id);
        const token = await newSession(id);
        return json({ token, ...(await state(person)) });
      }

      if (route === "login" && method === "POST") {
        const name = cleanName(body.name);
        if (!name || typeof body.pin !== "string") return json({ error: "Enter your name and passcode." }, 400);
        const lk = `lock/${nameKey(name)}`;
        const lock = await getJSON(lk, { fails: 0, until: 0 });
        if (lock.until > now()) return json({ error: "Too many wrong passcodes. Try again later.", retryInMs: lock.until - now() }, 429);
        const pid = await getJSON(`uname/${nameKey(name)}`);
        const p = pid && (await getPerson(pid));
        const ok = p && validPin(body.pin) && timingSafeEqual(Buffer.from(hashPin(body.pin, p.salt), "hex"), Buffer.from(p.hash, "hex"));
        if (!ok) {
          const fails = (lock.until && lock.until <= now() ? 0 : lock.fails) + 1;
          await store.setJSON(lk, fails >= LOCK_AFTER ? { fails: 0, until: now() + LOCK_MS } : { fails, until: 0 });
          const left = LOCK_AFTER - fails;
          return json({ error: !p ? `No one called ${name} has joined yet. Tap Join instead.` :
            left > 0 ? `Wrong passcode. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong passcodes. Try again in 10 minutes." }, 401);
        }
        await store.delete(lk);
        await stats.log("login", p.id);
        const token = await newSession(p.id);
        return json({ token, ...(await state(p)) });
      }

      /* ---------- signed in ---------- */
      const a = await auth(req);
      if (!a) return json({ error: "Please log in again." }, 401);
      let { me } = a;

      if (route === "state" && method === "GET") return json(await state(me));

      if (route === "ping" && method === "POST") {
        await stats.ping(me.id, body.open === true);
        await touchStreak(me.id);
        return json({ ok: true });
      }

      if (route === "geo" && method === "GET") {
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 60);
        if (q.length < 2) return json({ results: [] });
        try { return json({ results: await geocode(fetchFn, q) }); }
        catch (e) { return json({ error: "Couldn't look up places right now. Try again in a moment." }, 502); }
      }

      if (route === "logout" && method === "POST") { await store.delete(`sessions/${a.token}`); return json({ ok: true }); }

      if (route === "me" && method === "POST") {
        switch (body.action) {
          case "time":
            if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick a valid clock-out time." }, 400);
            me = { ...me, h: body.h, m: body.m }; break;
          case "color":
            if (!COLORS.includes(body.color)) return json({ error: "Pick one of the colours." }, 400);
            me = { ...me, color: body.color }; break;
          case "fx":
            me = { ...me, fx: body.fx === true }; break;
          case "city": {
            if (body.clear) { me = { ...me, city: null }; break; }
            const name = cleanText(body.name, 60), lat = Number(body.lat), lon = Number(body.lon);
            if (!name || !(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return json({ error: "Pick a place from the list." }, 400);
            me = { ...me, city: { name, lat, lon } }; break;
          }
          case "reroll": {
            const t = now();
            if (me.monsterChangedAt && monthOf(me.monsterChangedAt) === monthOf(t)) return json({ error: "You've already rerolled this month." }, 409);
            let next = randomInt(MONSTER_COUNT - 1);
            if (next >= me.monster) next += 1; // never the same monster again
            me = { ...me, monster: next, monsterChangedAt: t }; break;
          }
          case "buzz":
            me = { ...me, buzz: body.buzz === true }; break;
          case "pin": {
            if (!validPin(body.pin)) return json({ error: "Your passcode needs at least 4 characters." }, 400);
            const salt = randomBytes(16).toString("hex");
            me = { ...me, salt, hash: hashPin(body.pin, salt) }; break;
          }
          case "delete":
            await leaveCave(me);
            await stats.forget(me.id);
            await store.delete(`lvl/${me.id}`);
            await Promise.all([`person/${me.id}`, `uname/${nameKey(me.name)}`, `subs/${me.id}`, `sessions/${a.token}`].map((k) => store.delete(k)));
            return json({ ok: true });
          default:
            return json({ error: "Unknown action." }, 400);
        }
        await putPerson(me);
        return json(await state(me));
      }

      if (route === "cave" && method === "POST") {
        const cave = me.cave ? await getJSON(`cave/${me.cave}`) : null;
        const isOwner = cave && cave.owner === me.id;
        switch (body.action) {
          case "create": {
            if (me.cave) return json({ error: "Leave your current cave first." }, 409);
            const name = cleanName(body.name) || `${me.name}'s Cave`;
            const cid = "c-" + randomBytes(5).toString("hex");
            const code = await claimCode(cid);
            await store.setJSON(`cave/${cid}`, { id: cid, name, owner: me.id, code, at: now() });
            const err = await joinCave(me, cid);
            if (err) return json({ error: err.error }, err.status);
            await stats.log("cave", me.id, cid, "create");
            me = { ...me, cave: cid };
            return json(await state(me));
          }
          case "peek": {
            const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
            const cid = code && (await getJSON(`code/${code}`));
            const target = cid && (await getJSON(`cave/${cid}`));
            if (!target) return json({ error: "That invite code doesn't match any cave." }, 404);
            return json({ id: target.id, name: target.name, members: (await keys(`member/${cid}/`)).length, same: target.id === me.cave });
          }
          case "join": {
            const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
            const cid = code && (await getJSON(`code/${code}`));
            const target = cid && (await getJSON(`cave/${cid}`));
            if (!target) return json({ error: "That invite code doesn't match any cave." }, 404);
            if (me.cave === cid) return json(await state(me));
            if (me.cave && body.switch !== true) return json({ error: "You're already in a cave.", needsSwitch: true, from: cave?.name }, 409);
            if (me.cave) { await stats.log("cave", me.id, me.cave, "leave"); await leaveCave(me); me = await getPerson(me.id); }
            const err = await joinCave(me, cid);
            if (err) return json({ error: err.error }, err.status);
            await stats.log("cave", me.id, cid, "join");
            me = { ...me, cave: cid };
            return json(await state(me));
          }
          case "leave":
            if (!me.cave) return json(await state(me));
            await stats.log("cave", me.id, me.cave, "leave");
            await leaveCave(me);
            me = { ...me, cave: null };
            return json(await state(me));
          case "rename": {
            if (!isOwner) return json({ error: "Only the cave owner can rename it." }, 403);
            const name = cleanName(body.name);
            if (!name) return json({ error: "Give the cave a name." }, 400);
            await store.setJSON(`cave/${cave.id}`, { ...cave, name });
            return json(await state(me));
          }
          case "newcode": {
            if (!isOwner) return json({ error: "Only the cave owner can change the invite code." }, 403);
            const code = await claimCode(cave.id);
            await store.setJSON(`cave/${cave.id}`, { ...cave, code });
            await store.delete(`code/${cave.code}`);
            return json(await state(me));
          }
          case "kick": {
            if (!isOwner) return json({ error: "Only the cave owner can remove people." }, 403);
            const pid = String(body.pid || "");
            if (pid === me.id) return json({ error: "Use Leave cave to leave." }, 400);
            const target = await getPerson(pid);
            if (!target || target.cave !== cave.id) return json({ error: "They're not in this cave." }, 404);
            await stats.log("cave", target.id, cave.id, "kick");
            await leaveCave(target);
            return json(await state(me));
          }
          default:
            return json({ error: "Unknown action." }, 400);
        }
      }

      if (route === "ot" && method === "POST") {
        const on = body.on === true;
        const end = body.end == null ? null : body.end;
        if (end !== null && !isInt(end, 0, 86399)) return json({ error: "Bad clock-out time." }, 400);
        const key = `ot/${sgDay(now())}/${me.id}`;
        if (on) await store.setJSON(key, { on: true, end }); else await store.delete(key);
        return json(await state(me));
      }

      if (route === "subscribe" && method === "POST") {
        const sub = body.subscription;
        if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth)
          return json({ error: "That isn't a valid push subscription." }, 400);
        const clean = { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? null, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } };
        const key = `subs/${me.id}`;
        await dropEndpointEverywhere(clean.endpoint, key); // one phone belongs to one person
        const mine = (await getJSON(key, [])).filter((s) => s.endpoint !== clean.endpoint);
        mine.push(clean);
        await store.setJSON(key, mine.slice(-MAX_SUBS_PER_PERSON));
        return json({ ok: true });
      }

      if (route === "unsubscribe" && method === "POST") {
        await dropEndpointEverywhere(String(body.endpoint || ""), null);
        return json({ ok: true });
      }

      if (route === "zap" && method === "POST") {
        const to = await getPerson(String(body.to || ""));
        if (!to || !me.cave || to.cave !== me.cave) return json({ error: "You can only zap people in your cave." }, 404);
        if (to.id === me.id) return json({ error: "You can't zap yourself." }, 400);
        const t = now();
        const zk = `zap/${me.id}/${to.id}`;
        const last = await getJSON(zk);
        if (last && t - last.at < ZAP_COOLDOWN_MS) return json({ error: "Cooling down.", retryInMs: ZAP_COOLDOWN_MS - (t - last.at) }, 429);
        await store.setJSON(zk, { at: t });
        const buzz = to.buzz !== false;
        const sent = await sendPush(to.id, {
          title: `⚡ Zap from ${me.name}!`,
          body: cleanText(body.message, 140) || `${me.name} zapped you.`,
          tag: `zap-${me.id}`, url: "/", buzz, from: me.name,
        });
        await stats.log("zap", me.id, to.id, sent < 1 ? "n" : buzz ? "b" : "q");
        return json({ ok: true, sent, at: t, buzz });
      }

      /* ---------- monster powers ---------- */
      if ((route === "cheer" || route === "note" || route === "roar") && method === "POST") {
        if (!me.cave) return json({ error: "Join a cave first." }, 409);
        const t = now(), day = sgDay(t);
        const level = levelInfo(await getJSON(`lvl/${me.id}`)).level;
        const power = POWERS[me.monster];
        const need = { cheer: "mush", note: "tako", roar: "dino" }[route];
        const takingNoteDown = route === "note" && body.action === "remove"; // writer or cave owner, any monster
        if (!takingNoteDown) {
          if (power !== need) return json({ error: "Your monster doesn't have that power." }, 403);
          if (level < 1) return json({ error: "Open the app 3 workdays in a row to unlock your power." }, 403);
        }

        if (route === "cheer") {
          const to = await getPerson(String(body.to || ""));
          if (!to || to.cave !== me.cave) return json({ error: "You can only cheer people in your cave." }, 404);
          if (to.id === me.id) return json({ error: "Cheer a friend, not yourself." }, 400);
          const used = (await cheersToday(day)).filter((c) => c.from === me.id).length;
          if (used >= CHEERS_PER_DAY[level]) return json({ error: "No cheers left today. More tomorrow!" }, 429);
          await store.setJSON(`cheer/${day}/${to.id}/${String(t).padStart(13, "0")}_${me.id}_${level}`, { from: me.id, at: t, lv: level });
          return json(await state(me));
        }

        if (route === "note") {
          const cave = await getJSON(`cave/${me.cave}`);
          if (body.action === "remove") {
            const id = String(body.id || "");
            const k = `note/${me.cave}/${id}`;
            const n = /^[0-9]{13}-[0-9a-f]{6}$/.test(id) ? await getJSON(k) : null;
            if (!n) return json({ error: "That note is already gone." }, 404);
            if (n.pid !== me.id && cave?.owner !== me.id) return json({ error: "Only the writer or the cave owner can take a note down." }, 403);
            await store.delete(k);
            return json(await state(me));
          }
          const text = cleanText(body.text, 80).replace(/\n+/g, " ");
          if (!text) return json({ error: "Write something on the note first." }, 400);
          const mine = (await liveNotes(me.cave, t)).filter((n) => n.pid === me.id);
          if (mine.length >= NOTES_AT_ONCE[level]) return json({ error: `You can have ${NOTES_AT_ONCE[level]} ${NOTES_AT_ONCE[level] === 1 ? "note" : "notes"} up at once. Take one down first.` }, 429);
          const pinned = body.pin === true;
          if (pinned && (level < 3 || mine.some((n) => n.pinned))) return json({ error: "Pinning unlocks at Lv3, one pinned note at a time." }, 403);
          const id = `${String(t).padStart(13, "0")}-${randomBytes(3).toString("hex")}`;
          const expires = pinned ? t + 7 * 864e5 : dayStartMs(addDays(day, 1));
          await store.setJSON(`note/${me.cave}/${id}`, { id, pid: me.id, text, at: t, pinned, expires });
          return json(await state(me));
        }

        if (route === "roar") {
          const rk = `roar/${day}/${me.id}`;
          if (await exists(rk)) return json({ error: "You've already roared today." }, 409);
          const o = await getJSON(`ot/${day}/${me.id}`);
          const offSec = me.h * 3600 + me.m * 60;
          if (isWorkday(day)) {
            if (o && o.on && o.end == null && sgSeconds(t) >= offSec) return json({ error: "Clock out first, then roar." }, 409);
            if (sgSeconds(t) < offSec && !(o && o.on && o.end != null)) return json({ error: `You can roar once you're off at ${fmt12(me.h, me.m)}.` }, 409);
          }
          const text = (level >= 2 && cleanText(body.text, 60).replace(/\n+/g, " ")) || "I'm out!";
          await store.setJSON(rk, { pid: me.id, text, at: t, sound: level >= 3 });
          const mates = (await caveMembers(me.cave)).filter((p) => p.id !== me.id && p.fx !== false);
          await Promise.all(mates.map((p) => sendPush(p.id, {
            title: `${me.name} roars!`, body: text, tag: `roar-${me.id}`, url: "/", buzz: p.buzz !== false, kind: "roar",
          })));
          return json(await state(me));
        }
      }

      if (route === "chat/read" && method === "POST") {
        if (!me.cave) return json({ ok: true });
        const at = Math.min(Number(body.at) || 0, now());
        const k = `read/${me.cave}/${me.id}`;
        const prev = await getJSON(k);
        if (at > (prev?.at || 0)) await store.setJSON(k, { at });
        return json({ ok: true });
      }

      if (route === "chat") {
        if (!me.cave) return json({ error: "Join a cave to chat." }, 409);
        const prefix = `chat/${me.cave}/`;
        if (method === "GET") {
          const after = Number(url.searchParams.get("after") || 0);
          let ks = (await keys(prefix)).sort((x, y) => chatKeyTs(x) - chatKeyTs(y));
          ks = after ? ks.filter((k) => chatKeyTs(k) > after) : ks.slice(-60);
          const msgs = (await Promise.all(ks.map((k) => getJSON(k)))).filter(Boolean);
          return json({ messages: msgs });
        }
        if (method === "POST") {
          const text = cleanText(body.text, 500);
          if (!text) return json({ error: "Type a message first." }, 400);
          const at = now();
          const id = `${String(at).padStart(13, "0")}-${randomBytes(3).toString("hex")}`;
          const msg = { id, pid: me.id, name: me.name, color: me.color, monster: me.monster, text, at };
          await store.setJSON(prefix + id, msg);
          await stats.log("msg", me.id, me.cave);
          const all = (await keys(prefix)).sort((x, y) => chatKeyTs(x) - chatKeyTs(y));
          if (all.length > CHAT_KEEP) await Promise.all(all.slice(0, all.length - CHAT_KEEP).map((k) => store.delete(k)));
          return json({ message: msg });
        }
      }

      return json({ error: "Not found." }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Something went wrong on the server. Try again in a moment." }, 500);
    }
  }

  return { handle, rainAlerts };
}
