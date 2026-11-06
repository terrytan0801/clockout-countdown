// Clock-out Countdown API. All state lives in one Netlify Blobs store.
// Keys:
//   friends            -> [{id,name,h,m,at}]
//   ot/<YYYY-MM-DD>    -> {pid: {on, end}}           (end = seconds after midnight, SG time)
//   subs/<pid>         -> [PushSubscription JSON]
//   zaps               -> {"from>to": ms timestamp}
//   vapid              -> {publicKey, privateKey}    (generated on first use)

export const BASE = [
  { id: "base-terry", name: "Terry", h: 17, m: 0 },
  { id: "base-sukee", name: "Sukee", h: 17, m: 30 },
  { id: "base-shunyi", name: "Shunyi", h: 18, m: 0 },
];
export const ZAP_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_FRIENDS = 30;
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

const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20);
const cleanText = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function makeHandler({ store, webpush, now = () => Date.now() }) {
  const getJSON = async (key, fallback) => (await store.get(key, { type: "json" })) ?? fallback;
  const friendsList = () => getJSON("friends", []);
  const people = async () => [...BASE, ...(await friendsList())];

  async function vapidKeys() {
    let keys = await getJSON("vapid", null);
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      // Only the first writer wins, so two cold starts can't end up with different keys.
      const res = await store.setJSON("vapid", keys, { onlyIfNew: true });
      if (res && res.modified === false) keys = await getJSON("vapid", keys);
    }
    return keys;
  }

  async function state() {
    const t = now();
    const day = sgDay(t);
    const [friends, ot, zaps, subsList] = await Promise.all([
      friendsList(),
      getJSON(`ot/${day}`, {}),
      getJSON("zaps", {}),
      store.list({ prefix: "subs/" }),
    ]);
    const recentZaps = {};
    for (const [k, ts] of Object.entries(zaps)) if (t - ts < ZAP_COOLDOWN_MS) recentZaps[k] = ts;
    const reachable = subsList.blobs.map((b) => b.key.slice(5));
    return { now: t, day, base: BASE, friends, ot, zaps: recentZaps, reachable, cooldownMs: ZAP_COOLDOWN_MS };
  }

  async function sendPush(pid, payload) {
    const key = `subs/${pid}`;
    const subs = await getJSON(key, []);
    if (!subs.length) return 0;
    const { publicKey, privateKey } = await vapidKeys();
    const opts = {
      TTL: 600,
      urgency: "high",
      vapidDetails: { subject: "mailto:clockout@example.com", publicKey, privateKey },
    };
    let sent = 0;
    const keep = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), opts);
        sent++; keep.push(sub);
      } catch (e) {
        // 404/410 = subscription is gone (app uninstalled or permission revoked)
        if (e && (e.statusCode === 404 || e.statusCode === 410)) return;
        keep.push(sub);
      }
    }));
    if (keep.length !== subs.length) {
      if (keep.length) await store.setJSON(key, keep); else await store.delete(key);
    }
    return sent;
  }

  return async function handle(req) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
    const method = req.method.toUpperCase();
    let body = {};
    if (method === "POST") {
      try { body = await req.json(); } catch { return json({ error: "Body must be JSON." }, 400); }
      if (!body || typeof body !== "object") return json({ error: "Body must be a JSON object." }, 400);
    }

    try {
      if (route === "state" && method === "GET") return json(await state());

      if (route === "vapid" && method === "GET") return json({ publicKey: (await vapidKeys()).publicKey });

      if (route === "friends" && method === "POST") {
        const friends = await friendsList();
        if (body.action === "add") {
          const name = cleanName(body.name);
          if (!name) return json({ error: "Enter a name." }, 400);
          if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick a valid clock-out time." }, 400);
          const all = [...BASE, ...friends];
          if (all.some((p) => p.name.toLowerCase() === name.toLowerCase())) return json({ error: `${name} is already on the board.` }, 409);
          if (friends.length >= MAX_FRIENDS) return json({ error: "The board is full. Remove someone first." }, 409);
          friends.push({ id: "f-" + Math.random().toString(36).slice(2, 10), name, h: body.h, m: body.m, at: now() });
          await store.setJSON("friends", friends);
          return json(await state());
        }
        if (body.action === "remove") {
          const id = String(body.id || "");
          if (!friends.some((f) => f.id === id)) return json({ error: "That friend isn't on the board." }, 404);
          await store.setJSON("friends", friends.filter((f) => f.id !== id));
          await store.delete(`subs/${id}`);
          return json(await state());
        }
        return json({ error: "Unknown action." }, 400);
      }

      if (route === "ot" && method === "POST") {
        const pid = String(body.pid || "");
        if (!(await people()).some((p) => p.id === pid)) return json({ error: "Unknown person." }, 404);
        const on = body.on === true;
        const end = body.end == null ? null : body.end;
        if (end !== null && !isInt(end, 0, 86399)) return json({ error: "Bad clock-out time." }, 400);
        const key = `ot/${sgDay(now())}`;
        const ot = await getJSON(key, {});
        if (on) ot[pid] = { on: true, end }; else delete ot[pid];
        await store.setJSON(key, ot);
        return json(await state());
      }

      if (route === "subscribe" && method === "POST") {
        const pid = String(body.pid || "");
        const sub = body.subscription;
        if (!(await people()).some((p) => p.id === pid)) return json({ error: "Unknown person." }, 404);
        if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth)
          return json({ error: "That isn't a valid push subscription." }, 400);
        const clean = { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? null, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } };
        // A phone belongs to one person: drop this endpoint from anyone else first.
        const { blobs } = await store.list({ prefix: "subs/" });
        await Promise.all(blobs.filter((b) => b.key !== `subs/${pid}`).map(async (b) => {
          const list = await getJSON(b.key, []);
          const next = list.filter((s) => s.endpoint !== clean.endpoint);
          if (next.length !== list.length) { if (next.length) await store.setJSON(b.key, next); else await store.delete(b.key); }
        }));
        const mine = (await getJSON(`subs/${pid}`, [])).filter((s) => s.endpoint !== clean.endpoint);
        mine.push(clean);
        await store.setJSON(`subs/${pid}`, mine.slice(-MAX_SUBS_PER_PERSON));
        return json({ ok: true });
      }

      if (route === "unsubscribe" && method === "POST") {
        const endpoint = String(body.endpoint || "");
        const { blobs } = await store.list({ prefix: "subs/" });
        await Promise.all(blobs.map(async (b) => {
          const list = await getJSON(b.key, []);
          const next = list.filter((s) => s.endpoint !== endpoint);
          if (next.length !== list.length) { if (next.length) await store.setJSON(b.key, next); else await store.delete(b.key); }
        }));
        return json({ ok: true });
      }

      if (route === "zap" && method === "POST") {
        const all = await people();
        const from = all.find((p) => p.id === String(body.from || ""));
        const to = all.find((p) => p.id === String(body.to || ""));
        if (!from || !to) return json({ error: "Unknown person." }, 404);
        if (from.id === to.id) return json({ error: "You can't zap yourself." }, 400);
        const t = now();
        const zaps = await getJSON("zaps", {});
        const pair = `${from.id}>${to.id}`;
        if (zaps[pair] && t - zaps[pair] < ZAP_COOLDOWN_MS)
          return json({ error: "Cooling down.", retryInMs: ZAP_COOLDOWN_MS - (t - zaps[pair]) }, 429);
        for (const [k, ts] of Object.entries(zaps)) if (t - ts > ZAP_COOLDOWN_MS) delete zaps[k];
        zaps[pair] = t;
        await store.setJSON("zaps", zaps);
        const sent = await sendPush(to.id, {
          title: `⚡ Zap from ${from.name}!`,
          body: cleanText(body.message, 140) || `${from.name} zapped you.`,
          tag: `zap-${from.id}`,
          url: "/",
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
