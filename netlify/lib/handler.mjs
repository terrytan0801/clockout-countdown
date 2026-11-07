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

export function makeHandler({ store, webpush, now = () => Date.now() }) {
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
      const [p, mem] = await Promise.all([getPerson(k.split("/")[2]), getJSON(k)]);
      return p && p.cave === cid ? { ...p, joinedAt: mem?.at ?? p.at } : null;
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
    const base = {
      now: t, day, cooldownMs: ZAP_COOLDOWN_MS, colors: COLORS,
      me: { ...publicPerson(me), buzz: me.buzz !== false },
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
    return {
      ...base,
      cave: {
        id: cave.id, name: cave.name, owner: cave.owner, code: cave.code,
        members: members.map(publicPerson),
        ot: otMap, zaps: zapMap,
        reachable: members.filter((_, i) => reach[i]).map((p) => p.id),
        chatLatest: latest,
      },
    };
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

  return async function handle(req) {
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
        const token = await newSession(p.id);
        return json({ token, ...(await state(p)) });
      }

      /* ---------- signed in ---------- */
      const a = await auth(req);
      if (!a) return json({ error: "Please log in again." }, 401);
      let { me } = a;

      if (route === "state" && method === "GET") return json(await state(me));

      if (route === "logout" && method === "POST") { await store.delete(`sessions/${a.token}`); return json({ ok: true }); }

      if (route === "me" && method === "POST") {
        switch (body.action) {
          case "time":
            if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick a valid clock-out time." }, 400);
            me = { ...me, h: body.h, m: body.m }; break;
          case "color":
            if (!COLORS.includes(body.color)) return json({ error: "Pick one of the colours." }, 400);
            me = { ...me, color: body.color }; break;
          case "buzz":
            me = { ...me, buzz: body.buzz === true }; break;
          case "pin": {
            if (!validPin(body.pin)) return json({ error: "Your passcode needs at least 4 characters." }, 400);
            const salt = randomBytes(16).toString("hex");
            me = { ...me, salt, hash: hashPin(body.pin, salt) }; break;
          }
          case "delete":
            await leaveCave(me);
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
            if (me.cave) { await leaveCave(me); me = await getPerson(me.id); }
            const err = await joinCave(me, cid);
            if (err) return json({ error: err.error }, err.status);
            me = { ...me, cave: cid };
            return json(await state(me));
          }
          case "leave":
            if (!me.cave) return json(await state(me));
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
        return json({ ok: true, sent, at: t, buzz });
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
  };
}
