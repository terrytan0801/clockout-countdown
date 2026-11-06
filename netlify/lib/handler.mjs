// Clock-out Countdown API. All state lives in one Netlify Blobs store.
// Keys:
//   people             -> [{id,name,h,m,at,salt,hash}]   (salt/hash never leave the server)
//   sessions/<token>   -> {pid, at}
//   lock/<name>        -> {fails, until}                 (wrong-PIN lockout)
//   ot/<YYYY-MM-DD>    -> {pid: {on, end}}               (end = seconds after midnight, SG time)
//   subs/<pid>         -> [PushSubscription JSON]
//   zaps               -> {"from>to": ms timestamp}
//   vapid              -> {publicKey, privateKey}        (generated on first use)
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const ZAP_COOLDOWN_MS = 10 * 60 * 1000;
export const LOCK_AFTER = 5;
export const LOCK_MS = 10 * 60 * 1000;
const MAX_PEOPLE = 30;
const MAX_SUBS_PER_PERSON = 5;

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
const cleanText = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const validPin = (p) => typeof p === "string" && /^\d{4,6}$/.test(p);
const lockKey = (name) => "lock/" + encodeURIComponent(name.toLowerCase());
const hashPin = (pin, salt) => scryptSync(pin, salt, 32).toString("hex");
const publicPerson = ({ id, name, h, m, at }) => ({ id, name, h, m, at });

export function makeHandler({ store, webpush, now = () => Date.now() }) {
  const getJSON = async (key, fallback) => (await store.get(key, { type: "json" })) ?? fallback;
  const peopleList = () => getJSON("people", []);

  async function vapidKeys() {
    let keys = await getJSON("vapid", null);
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      const res = await store.setJSON("vapid", keys, { onlyIfNew: true });
      if (res && res.modified === false) keys = await getJSON("vapid", keys);
    }
    return keys;
  }

  async function newSession(pid) {
    const token = randomBytes(24).toString("hex");
    await store.setJSON(`sessions/${token}`, { pid, at: now() });
    return token;
  }

  async function auth(req) {
    const m = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.get("authorization") || "");
    if (!m) return null;
    const s = await getJSON(`sessions/${m[1]}`, null);
    if (!s) return null;
    const people = await peopleList();
    const me = people.find((p) => p.id === s.pid);
    return me ? { me, token: m[1], people } : null;
  }

  async function state(meId) {
    const t = now();
    const day = sgDay(t);
    const [people, ot, zaps, subsList] = await Promise.all([
      peopleList(), getJSON(`ot/${day}`, {}), getJSON("zaps", {}), store.list({ prefix: "subs/" }),
    ]);
    const myZaps = {};
    for (const [k, ts] of Object.entries(zaps)) if (k.startsWith(meId + ">") && t - ts < ZAP_COOLDOWN_MS) myZaps[k.split(">")[1]] = ts;
    return {
      now: t, day, me: meId,
      people: people.map(publicPerson), ot, zaps: myZaps,
      reachable: subsList.blobs.map((b) => b.key.slice(5)),
      cooldownMs: ZAP_COOLDOWN_MS,
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
    const { blobs } = await store.list({ prefix: "subs/" });
    await Promise.all(blobs.filter((b) => b.key !== exceptKey).map(async (b) => {
      const list = await getJSON(b.key, []);
      const next = list.filter((s) => s.endpoint !== endpoint);
      if (next.length !== list.length) { if (next.length) await store.setJSON(b.key, next); else await store.delete(b.key); }
    }));
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
      /* ---------- public ---------- */
      if (route === "vapid" && method === "GET") return json({ publicKey: (await vapidKeys()).publicKey });

      if (route === "signup" && method === "POST") {
        const name = cleanName(body.name);
        if (!name) return json({ error: "Enter your name." }, 400);
        if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick your clock-out time." }, 400);
        if (!validPin(body.pin)) return json({ error: "Your PIN needs 4 to 6 digits." }, 400);
        const people = await peopleList();
        if (people.some((p) => p.name.toLowerCase() === name.toLowerCase()))
          return json({ error: `${name} has already joined. Log in instead.` }, 409);
        if (people.length >= MAX_PEOPLE) return json({ error: "The board is full." }, 409);
        const salt = randomBytes(16).toString("hex");
        const person = { id: "p-" + randomBytes(5).toString("hex"), name, h: body.h, m: body.m, at: now(), salt, hash: hashPin(body.pin, salt) };
        people.push(person);
        await store.setJSON("people", people);
        const token = await newSession(person.id);
        return json({ token, ...(await state(person.id)) });
      }

      if (route === "login" && method === "POST") {
        const name = cleanName(body.name);
        if (!name || typeof body.pin !== "string") return json({ error: "Enter your name and PIN." }, 400);
        const lk = lockKey(name);
        const lock = await getJSON(lk, { fails: 0, until: 0 });
        if (lock.until > now()) return json({ error: "Too many wrong PINs. Try again later.", retryInMs: lock.until - now() }, 429);
        const people = await peopleList();
        const p = people.find((x) => x.name.toLowerCase() === name.toLowerCase());
        const ok = p && validPin(body.pin) && timingSafeEqual(Buffer.from(hashPin(body.pin, p.salt), "hex"), Buffer.from(p.hash, "hex"));
        if (!ok) {
          const fails = (lock.until && lock.until <= now() ? 0 : lock.fails) + 1;
          await store.setJSON(lk, fails >= LOCK_AFTER ? { fails: 0, until: now() + LOCK_MS } : { fails, until: 0 });
          const left = LOCK_AFTER - fails;
          return json({ error: !p ? `No one called ${name} has joined yet. Tap Join instead.` :
            left > 0 ? `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong PINs. Try again in 10 minutes." }, 401);
        }
        await store.delete(lk);
        const token = await newSession(p.id);
        return json({ token, ...(await state(p.id)) });
      }

      /* ---------- signed in ---------- */
      const a = await auth(req);
      if (!a) return json({ error: "Please log in again." }, 401);
      const { me } = a;

      if (route === "state" && method === "GET") return json(await state(me.id));

      if (route === "logout" && method === "POST") { await store.delete(`sessions/${a.token}`); return json({ ok: true }); }

      if (route === "me" && method === "POST") {
        const people = a.people;
        const i = people.findIndex((p) => p.id === me.id);
        if (body.action === "time") {
          if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick a valid clock-out time." }, 400);
          people[i] = { ...people[i], h: body.h, m: body.m };
          await store.setJSON("people", people);
          return json(await state(me.id));
        }
        if (body.action === "pin") {
          if (!validPin(body.pin)) return json({ error: "Your PIN needs 4 to 6 digits." }, 400);
          const salt = randomBytes(16).toString("hex");
          people[i] = { ...people[i], salt, hash: hashPin(body.pin, salt) };
          await store.setJSON("people", people);
          return json({ ok: true });
        }
        if (body.action === "leave") {
          await store.setJSON("people", people.filter((p) => p.id !== me.id));
          await store.delete(`subs/${me.id}`);
          await store.delete(`sessions/${a.token}`);
          return json({ ok: true });
        }
        return json({ error: "Unknown action." }, 400);
      }

      if (route === "ot" && method === "POST") {
        const on = body.on === true;
        const end = body.end == null ? null : body.end;
        if (end !== null && !isInt(end, 0, 86399)) return json({ error: "Bad clock-out time." }, 400);
        const key = `ot/${sgDay(now())}`;
        const ot = await getJSON(key, {});
        if (on) ot[me.id] = { on: true, end }; else delete ot[me.id];
        await store.setJSON(key, ot);
        return json(await state(me.id));
      }

      if (route === "subscribe" && method === "POST") {
        const sub = body.subscription;
        if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth)
          return json({ error: "That isn't a valid push subscription." }, 400);
        const clean = { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? null, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } };
        const key = `subs/${me.id}`;
        await dropEndpointEverywhere(clean.endpoint, key); // a phone belongs to one person
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
        const to = a.people.find((p) => p.id === String(body.to || ""));
        if (!to) return json({ error: "That friend isn't on the board." }, 404);
        if (to.id === me.id) return json({ error: "You can't zap yourself." }, 400);
        const t = now();
        const zaps = await getJSON("zaps", {});
        const pair = `${me.id}>${to.id}`;
        if (zaps[pair] && t - zaps[pair] < ZAP_COOLDOWN_MS)
          return json({ error: "Cooling down.", retryInMs: ZAP_COOLDOWN_MS - (t - zaps[pair]) }, 429);
        for (const [k, ts] of Object.entries(zaps)) if (t - ts > ZAP_COOLDOWN_MS) delete zaps[k];
        zaps[pair] = t;
        await store.setJSON("zaps", zaps);
        const sent = await sendPush(to.id, {
          title: `⚡ Zap from ${me.name}!`,
          body: cleanText(body.message, 140) || `${me.name} zapped you.`,
          tag: `zap-${me.id}`, url: "/",
        });
        return json({ ok: true, sent, at: t });
      }

      return json({ error: "Not found." }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Something went wrong on the server. Try again in a moment." }, 500);
    }
  };
}
