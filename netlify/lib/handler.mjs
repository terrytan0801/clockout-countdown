// Clock-out Countdown API (v9). All state lives in one Netlify Blobs store.
// Every record has its own key, so two people acting at once never overwrite each other.
//
//   person/<pid>               {id,name,h,m,sh,sm,lunch,color,monster,buzz,cave,at,salt,hash}
//                              sh:sm = start of work (v35, 9:00 if not set); lunch = {h,m,dur} or null
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
//   clip/<cid>/<day>/<slot>     video bytes (metadata: {type})          Cave Calendar; slot = <pid>.<ring 0-3>
//   thumb/<cid>/<day>/<slot>    JPEG cover frame                        (v15 clips have slot = <pid>, ring 0)
//   clipmeta/<cid>/<day>/<slot> {pid,r,name,color,monster,at,late,dur,type,size,thumb}
//   myclip/<pid>/<cid>/<day>/<slot>_<bytes>   index for account deletion and the admin storage total
//   ringsent/<cid>/<day>.<r>    that ring's push went out
//   dayoff/<day>/<pid>          someone took the day off (v24)
//   leave/<pid>/<day>           the same, listed per person (for streaks)
//   ver/<cid>                   changes whenever anything the cave's board shows changes (v32): phones ask
//                               "still the same?" and skip the full read when it is
//   chatlast/<cid>              {at,pid,id} of the newest chat message, so nobody lists the chat to find it
//   daysum/<cid>/<day>          {sig, clips} one record per calendar day, rebuilt when the clips' etags change
//   react/<cid>/<msgid>/<pid>/<emoji as hex>   0   a chat reaction (v33); everything is in the key, so one listing
//                               gives all of a cave's reactions, and each person only ever writes their own keys
//   chatre/<cid>                {rv} changes whenever someone reacts, so phones know to fetch reactions again
//   mediakey                    secret for signing clip links (v34)
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { makeStats } from "./stats.mjs";
import {
  POWERS, READY, M, CHEERS_PER_DAY, NOTES_AT_ONCE, levelInfo, streakUpdate, backfill, isWorkday, weekdayOf, addDays,
  dayStartMs, monthOf, sgSeconds, getWeather, weatherAt, dailyOf, geocode,
} from "./powers.mjs";
import { REGIONS, regionOf, holidayOf } from "./holidays.mjs";
import { ringTimes, currentRing, slotKey, parseSlot, RING_COUNT, RING_FROM, RING_TO, CLIP_MIN_S, CLIP_MAX_S, CLIP_MAX_BYTES, THUMB_MAX_BYTES, CLIP_TYPES } from "./clips.mjs";

export const ZAP_COOLDOWN_MS = 10 * 60 * 1000;
export const LOCK_AFTER = 5;
export const LOCK_MS = 10 * 60 * 1000;
export const COLORS = ["orange", "red", "pink", "violet", "indigo", "blue", "cyan", "teal", "green", "amber", "gold", "brown"];
export const MONSTER_COUNT = 10;
export const MAX_MEMBERS = 30;
export const CHAT_KEEP = 200;
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]; // WhatsApp's quick six
const emojiHex = (e) => [...e].map((c) => c.codePointAt(0).toString(16)).join("-");
const hexEmoji = (h) => { try { return String.fromCodePoint(...h.split("-").map((x) => parseInt(x, 16))); } catch { return null; } };
const SESSION_CACHE_MS = 60e3;  // a warm server remembers who a token belongs to for a minute
const VER_BUCKET_MS = 10 * 60e3; // phones do a full read at least this often (weather, expiring notes)
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
export const LUNCH_LENGTHS = [30, 45, 60, 90];
const publicPerson = ({ id, name, h, m, sh = 9, sm = 0, lunch = null, color, monster }) => ({ id, name, h, m, sh, sm, lunch, color, monster });
const chatKeyTs = (key) => Number(key.split("/").pop().split("-")[0]);

export const makeHandler = (opts) => makeApp(opts).handle;
// A branch deploy (dev--<site>.netlify.app) keeps its own data, so testing never touches the real caves.
export function isDevDeploy(req, context) {
  const host = new URL(req.url).hostname;
  return /^(?!main--)[a-z0-9-]+--/.test(host) && context?.deploy?.context !== "production";
}
const fmt12 = (h, m) => `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;

// cache: things a warm server may remember between requests (pass the same object each time).
// purge(tags): empties Netlify's CDN of those cache tags (a removed clip must not stay in the CDN).
// warm(url): fetches a link once so Netlify's CDN keeps it before anyone asks for it.
export function makeApp({ store, webpush, now = () => Date.now(), adminKey = null, fetchFn = (...a) => globalThis.fetch(...a), dev = false, region = null, cache = {}, purge = async () => {}, warm = async () => {} }) {
  const stats = makeStats({ store, now, adminKey });
  cache.sessions ||= new Map(); cache.streak ||= new Map();
  // Work the reply doesn't depend on (stats, tidying up). With waitUntil it runs after the reply has gone.
  const later = (ctx, p) => {
    const q = Promise.resolve(p).catch((e) => console.error("later", e));
    if (ctx && typeof ctx.waitUntil === "function") { ctx.waitUntil(q); return null; }
    return q;
  };
  const bump = async (cid) => { if (cid) await store.setJSON(`ver/${cid}`, now().toString(36) + randomBytes(2).toString("hex")); };
  // The ring that counts right now. On the test site you can film before the first ring.
  const ringOf = (cid, day, t) => currentRing(cid, day, t) || (dev ? { r: 0, at: dayStartMs(day), until: dayStartMs(day), closes: ringTimes(cid, day)[0] } : null);
  const verToken = (ver, cid, day, t) => { const r = ringOf(cid, day, t); return `${ver || "0"}.${day}.${r ? r.r : "-"}.${Math.floor(t / VER_BUCKET_MS)}`; };
  const getJSON = async (key, fallback = null) => (await store.get(key, { type: "json" })) ?? fallback;
  const exists = async (key) => (await store.getMetadata(key)) !== null;
  // Write a key only if nobody has it yet; true if we got it. The installed @netlify/blobs (8.2.0) ignores
  // onlyIfNew, so look first (newer versions also honour onlyIfNew, which closes the small gap in between).
  const claimKey = async (key, value) => {
    if (await exists(key)) return false;
    const r = await store.setJSON(key, value, { onlyIfNew: true });
    return !(r && r.modified === false);
  };
  const keys = async (prefix) => (await store.list({ prefix })).blobs.map((b) => b.key);
  const getPerson = (pid) => getJSON(`person/${pid}`);
  const putPerson = (p) => store.setJSON(`person/${p.id}`, p);

  /* ---------- one-time move of v8 data (single "people" list) into a cave ---------- */
  async function migrate() {
    if (cache.migrated) return;
    if (await exists("meta/v9")) { cache.migrated = true; return; }
    const old = await getJSON("people");
    if (!old || !old.length) { await store.setJSON("meta/v9", { at: now(), moved: 0 }); cache.migrated = true; return; }
    if (!(await claimKey("meta/v9-lock", { at: now() }))) return; // another request is migrating right now
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
    cache.migrated = true;
  }

  async function vapidKeys() {
    if (cache.vapid) return cache.vapid;
    let k = await getJSON("vapid");
    if (!k) {
      k = webpush.generateVAPIDKeys();
      if (!(await claimKey("vapid", k))) k = await getJSON("vapid", k);
    }
    return (cache.vapid = k);
  }

  /* ---------- signed clip links (v34) ----------
     A clip's link carries a signature, so it can be fetched without logging in and kept by Netlify's CDN.
     The first person to watch a clip pulls it across from the store; everyone after that gets the CDN's copy,
     from the edge nearest them, and the phone keeps its own copy too. Links are only handed to the cave. */
  // One lookup per warm server, shared by every link in a reply (so they never disagree).
  function mediaKey() {
    cache.mediaKey ||= (async () => {
      let k = await getJSON("mediakey");
      if (!k) {
        k = randomBytes(32).toString("hex");
        await claimKey("mediakey", k);
        k = await getJSON("mediakey", k); // whoever wrote last, everyone uses what's stored
      }
      return k;
    })();
    cache.mediaKey.catch(() => { cache.mediaKey = null; });
    return cache.mediaKey;
  }
  const mediaSig = (key, kind, cid, day, slot, at) => createHmac("sha256", key).update(`${kind}|${cid}|${day}|${slot}|${at}`).digest("base64url").slice(0, 22);
  const mediaTag = (cid, day, slot) => `clip-${cid}-${day}-${slot}`.replace(/[^\w-]/g, "_");
  async function mediaLinks(cid, day, c) {
    const key = await mediaKey();
    const link = (kind) => `/api/m/${kind}/${cid}/${day}/${c.slot}/${c.at}/${mediaSig(key, kind, cid, day, c.slot, c.at)}`;
    return { src: link("clip"), ...(c.thumb ? { tsrc: link("thumb") } : {}) };
  }

  async function newSession(pid) {
    const token = randomBytes(24).toString("hex");
    await store.setJSON(`sessions/${token}`, { pid, at: now() });
    return token;
  }

  async function auth(req) {
    const m = /^Bearer ([0-9a-f]{48})$/.exec(req.headers.get("authorization") || "");
    if (!m) return null;
    const hit = cache.sessions.get(m[1]);
    let pid = hit && hit.until > now() ? hit.pid : null;
    if (!pid) {
      const s = await getJSON(`sessions/${m[1]}`);
      if (!s) return null;
      pid = s.pid;
      if (cache.sessions.size > 5000) cache.sessions.clear();
      cache.sessions.set(m[1], { pid, until: now() + SESSION_CACHE_MS });
    }
    const me = await getPerson(pid);
    if (!me) cache.sessions.delete(m[1]);
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

  // The newest chat message, from its own small record (written on every post).
  async function chatLast(cid) {
    let l = await getJSON(`chatlast/${cid}`);
    if (!l) { // caves from before v32: look once, then remember
      const ks = await keys(`chat/${cid}/`);
      const last = ks.length ? ks.reduce((a, b) => (chatKeyTs(b) > chatKeyTs(a) ? b : a)) : null;
      const msg = last && (await getJSON(last));
      l = msg ? { at: msg.at, pid: msg.pid, id: msg.id || last.split("/").pop() } : { at: 0, pid: null, id: null };
      await store.setJSON(`chatlast/${cid}`, l);
    }
    return l;
  }
  // All reactions in a cave: { msgid: { pid: emoji } }, from one listing.
  async function reactionsOf(cid) {
    const out = {};
    for (const k of await keys(`react/${cid}/`)) {
      const [, , mid, pid, hex] = k.split("/");
      const e = hexEmoji(hex);
      if (e) (out[mid] ||= {})[pid] = e;
    }
    return out;
  }
  const chatRv = async (cid) => (await getJSON(`chatre/${cid}`))?.rv || "0";
  async function chatLatest(cid) {
    const l = await chatLast(cid);
    return l.at ? { at: l.at, pid: l.pid } : null;
  }

  async function state(me) {
    const t = now();
    const day = sgDay(t);
    const lv = levelInfo(await getJSON(`lvl/${me.id}`));
    const power = POWERS[me.monster] || "jelly";
    const sameMonth = me.monsterChangedAt && monthOf(me.monsterChangedAt) === monthOf(t);
    const [yy, mm] = monthOf(t).split("-").map(Number);
    const base = {
      now: t, day, cooldownMs: ZAP_COOLDOWN_MS, colors: COLORS, ...(dev ? { dev: true } : {}),
      me: {
        ...publicPerson(me), buzz: me.buzz !== false, fx: me.fx !== false, city: me.city || null,
        region: regionOf(me), off: holidayOf(regionOf(me), day) ? { kind: "holiday", name: holidayOf(regionOf(me), day) } : null,
        ...lv, power, ready: READY.has(power),
        canReroll: !sameMonth,
        nextReroll: sameMonth ? `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01` : null,
        cheersLeft: 0, notesLeft: 0, canPin: false, roared: false,
      },
      cave: null,
    };
    if (!me.cave) return base;
    // Everything that only needs the cave id starts at once; the per-member reads follow in one more round.
    const cid = me.cave, ring = ringOf(cid, day, t);
    const P = {
      cave: getJSON(`cave/${cid}`), ver: getJSON(`ver/${cid}`), members: caveMembers(cid), leave: keys(`dayoff/${day}/`),
      latest: chatLatest(cid), clips: ring ? clipsOf(cid, day) : Promise.resolve([]),
      pow: Promise.all([cheersToday(day), liveNotes(cid, t), keys(`roar/${day}/`).then((ks) => Promise.all(ks.map((k) => getJSON(k))))]),
    };
    Object.values(P).forEach((q) => q.catch(() => {}));
    const [cave, ver] = await Promise.all([P.cave, P.ver]);
    if (!cave) return base;
    const members = await P.members;
    const leaveToday = new Set((await P.leave).map((k) => k.split("/")[2]));
    const offOf = (p) => (leaveToday.has(p.id) ? { kind: "leave", name: "Day off" } : (holidayOf(regionOf(p), day) ? { kind: "holiday", name: holidayOf(regionOf(p), day) } : null));
    base.me.off = offOf(me);
    const ids = new Set(members.map((p) => p.id));
    const [ot, zaps, reach, latest, extra, today] = await Promise.all([
      Promise.all(members.map((p) => getJSON(`ot/${day}/${p.id}`))),
      Promise.all(members.map((p) => (p.id === me.id ? null : getJSON(`zap/${me.id}/${p.id}`)))),
      Promise.all(members.map((p) => exists(`subs/${p.id}`))),
      P.latest,
      powersState(me, lv.level, power, cave, members, ids, day, t, base.me, P.pow),
      P.clips,
    ]);
    const otMap = {}, zapMap = {};
    members.forEach((p, i) => {
      if (ot[i]) otMap[p.id] = ot[i];
      if (zaps[i] && t - zaps[i].at < ZAP_COOLDOWN_MS) zapMap[p.id] = zaps[i].at;
    });
    const mine = ring && today.find((c) => c.pid === me.id && c.r === ring.r);
    base.me.clip = mine ? { at: mine.at, late: mine.late, r: mine.r } : null;
    return {
      ...base, v: verToken(ver, cid, day, t),
      cave: {
        id: cave.id, name: cave.name, owner: cave.owner, code: cave.code,
        members: members.map((p) => ({ ...publicPerson(p), level: p.level, off: offOf(p) })),
        ot: otMap, zaps: zapMap,
        reachable: members.filter((_, i) => reach[i]).map((p) => p.id),
        chatLatest: latest,
        ring: ring ? { ...ring, of: RING_COUNT } : null,
        clipsToday: today.map((c) => ({ pid: c.pid, at: c.at, late: c.late, r: c.r })),
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
  async function powersState(me, level, power, cave, members, ids, day, t, meOut, pre) {
    const [cheers, notes, allRoars] = await pre;
    const roars = allRoars.filter((r) => r && ids.has(r.pid)).sort((a, b) => a.at - b.at);
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

  /* ---------- Cave Calendar clips ---------- */
  // Clip metadata under a prefix, each with its slot (the last key segment) and ring number.
  async function metasUnder(prefix) {
    const ks = await keys(prefix);
    return (await Promise.all(ks.map(async (k) => {
      const m = await getJSON(k), seg = k.split("/").pop();
      return m && { ...m, slot: seg, r: m.r ?? parseSlot(seg).r, day: k.split("/")[2] };
    }))).filter(Boolean);
  }
  // A month of clips for the calendar: one read per day, not one per clip. Each day's record carries the etags
  // of the clips it was built from, so a new clip, a retake or a deletion makes that day rebuild itself.
  async function monthClips(cid, month, ctx) {
    const [metaList, sumKeys] = await Promise.all([store.list({ prefix: `clipmeta/${cid}/${month}` }), keys(`daysum/${cid}/${month}`)]);
    const byDay = {};
    for (const b of metaList.blobs) (byDay[b.key.split("/")[2]] ||= []).push(b);
    const have = new Set(sumKeys.map((k) => k.split("/")[2]));
    const out = (await Promise.all(Object.entries(byDay).map(async ([day, blobs]) => {
      const sig = blobs.map((b) => `${b.key.split("/").pop()}:${b.etag}`).sort().join("|");
      const sum = have.has(day) ? await getJSON(`daysum/${cid}/${day}`) : null;
      if (sum && sum.sig === sig) return sum.clips;
      const clips = (await Promise.all(blobs.map(async (b) => {
        const m = await getJSON(b.key), seg = b.key.split("/").pop();
        return m && { ...m, slot: seg, r: m.r ?? parseSlot(seg).r, day };
      }))).filter(Boolean);
      await store.setJSON(`daysum/${cid}/${day}`, { sig, clips });
      return clips;
    }))).flat();
    const gone = sumKeys.filter((k) => !byDay[k.split("/")[2]]);
    if (gone.length) await later(ctx, Promise.all(gone.map((k) => store.delete(k))));
    return out;
  }
  const clipsOf = async (cid, day) => (await metasUnder(`clipmeta/${cid}/${day}/`)).sort((a, b) => a.r - b.r || a.at - b.at);
  async function dropClip(cid, day, slot, pid) {
    const idx = await keys(`myclip/${pid}/${cid}/${day}/${slot}_`);
    if (slot === pid) idx.push(...(await keys(`myclip/${pid}/${cid}/${day}_`))); // v15 index
    await Promise.all([`clip/${cid}/${day}/${slot}`, `thumb/${cid}/${day}/${slot}`, `clipmeta/${cid}/${day}/${slot}`, ...idx].map((k) => store.delete(k)));
    try { await purge([mediaTag(cid, day, slot)]); } catch (e) { console.error("purge", e.message); }
  }
  async function dropCaveClips(cid) {
    const metas = await keys(`clipmeta/${cid}/`);
    await Promise.all(metas.map((k) => { const [, , day, slot] = k.split("/"); return dropClip(cid, day, slot, parseSlot(slot).pid); }));
    await Promise.all((await keys(`daysum/${cid}/`)).map((k) => store.delete(k)));
  }
  async function dropPersonClips(pid) {
    const idx = await keys(`myclip/${pid}/`);
    await Promise.all(idx.map((k) => {
      const parts = k.split("/");
      return parts.length === 5 ? dropClip(parts[2], parts[3], parts[4].split("_")[0], pid) : dropClip(parts[2], parts[3].split("_")[0], pid, pid);
    }));
  }

  // Scheduled every 5 minutes: ring each cave's phones at its random times (RING_COUNT a day).
  async function ringCave(cave, day, r) {
    let sent = 0;
    await Promise.all((await caveMembers(cave.id)).map(async (p) => {
      sent += await sendPush(p.id, {
        title: `⏰ ${cave.name}: film time!`,
        body: "Film 3 seconds of what you're doing right now. You have 10 minutes.",
        tag: `ring-${day}-${r}`, url: "/?film=1", buzz: p.buzz !== false, kind: "ring",
      });
    }));
    return sent;
  }
  async function ringTick() {
    const t = now(), day = sgDay(t), sec = sgSeconds(t);
    if (sec < RING_FROM || sec > RING_TO + 35 * 60) return { caves: 0, sent: 0 }; // no rings at night: nothing to read
    let caves = 0, sent = 0;
    const all = await Promise.all((await keys("cave/")).map((k) => getJSON(k)));
    await Promise.all(all.map(async (cave) => {
      if (!cave) return;
      const r = ringTimes(cave.id, day).findIndex((at) => t >= at && t < at + 30 * 60e3); // a late job doesn't ring hours later
      if (r < 0) return;
      // Claimed once per ring, so the 5-minute runs after it don't ring again.
      if (!(await claimKey(`ringsent/${cave.id}/${day}.${r}`, { at: t }))) return;
      caves++;
      sent += await ringCave(cave, day, r);
      await bump(cave.id);
    }));
    return { caves, sent };
  }

  // A person's days off: their public holidays plus days they marked off. Off days count like weekends.
  async function offFn(p) {
    const region = regionOf(p), leave = new Set((await keys(`leave/${p.id}/`)).map((k) => k.split("/")[2]));
    return (day) => leave.has(day) || !!holidayOf(region, day);
  }
  async function touchStreak(p) {
    const today = sgDay(now()), pid = p.id;
    if (!isWorkday(today) || cache.streak.get(pid) === today) return;
    let rec = await getJSON(`lvl/${pid}`);
    if (rec && rec.lastDay === today) { cache.streak.set(pid, today); return; } // the usual case: one read, once
    const off = await offFn(p);
    if (!isWorkday(today, off)) return;
    if (!rec) {
      const days = new Set((await keys("use/")).filter((k) => k.endsWith("/" + pid)).map((k) => k.split("/")[1]));
      days.delete(today);
      rec = backfill(days, today, off);
    }
    await store.setJSON(`lvl/${pid}`, streakUpdate(rec, today, off));
    await bump(p.cave); // the cave sees levels
    cache.streak.set(pid, today);
  }

  // Scheduled every 15 minutes: Fluff Lv2+ gets one rain alert 25-45 minutes before clock-out.
  async function rainAlerts() {
    const t = now(), today = sgDay(t), nowSec = sgSeconds(t);
    if (nowSec < 15 * 60) { // once a day, tidy up old power records
      const cut = addDays(today, -14);
      const old = (await Promise.all(["cheer/", "roar/", "rainalert/", "ringsent/", "dayoff/"].map(keys))).flat().filter((k) => k.split("/")[1] < cut);
      old.push(...(await keys("leave/")).filter((k) => k.split("/")[2] < addDays(today, -60)));
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
      if (!isWorkday(today, await offFn(p))) continue; // nobody needs a rain alert on their day off
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
    const [subs, { publicKey, privateKey }] = await Promise.all([getJSON(key, []), vapidKeys()]);
    if (!subs.length) return 0;
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
      if (await claimKey(`code/${code}`, cid)) return code;
    }
    throw new Error("Could not create an invite code.");
  }

  // Take a person out of their cave. Hands the cave to the next member, or deletes it if empty.
  // Returns the cave id if the cave is still there (so the others can be told), or null.
  async function leaveCave(person) {
    const cid = person.cave;
    if (!cid) return null;
    await store.delete(`member/${cid}/${person.id}`);
    await putPerson({ ...person, cave: null });
    const cave = await getJSON(`cave/${cid}`);
    if (!cave) return null;
    const rest = (await caveMembers(cid)).filter((p) => p.id !== person.id);
    if (!rest.length) {
      await store.delete(`code/${cave.code}`);
      await store.delete(`cave/${cid}`);
      await Promise.all([...(await keys(`chat/${cid}/`)), ...(await keys(`react/${cid}/`)), `chatlast/${cid}`, `chatre/${cid}`, `ver/${cid}`].map((k) => store.delete(k)));
      await dropCaveClips(cid);
      return null;
    }
    if (cave.owner === person.id) await store.setJSON(`cave/${cid}`, { ...cave, owner: rest[0].id });
    return cid;
  }

  async function joinCave(person, cid) {
    const count = (await keys(`member/${cid}/`)).length;
    if (count >= MAX_MEMBERS) return { error: "This cave is full.", status: 409 };
    await store.setJSON(`member/${cid}/${person.id}`, { at: now() });
    await putPerson({ ...person, cave: cid });
    return null;
  }

  async function handle(req, ctx) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
    const method = req.method.toUpperCase();
    let body = {};
    if (method === "POST" && route !== "clip") {
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
          const idx = await keys("myclip/");
          return json({ ...(await stats.report(days)), clips: { count: idx.length, bytes: idx.reduce((n, k) => n + (Number(k.split("_").pop()) || 0), 0) } });
        }
        return json({ error: "Not found." }, 404);
      }

      /* ---------- signed out ---------- */
      if (route === "where" && method === "GET") return json({ region, dev });
      if (route === "vapid" && method === "GET") return json({ publicKey: (await vapidKeys()).publicKey });

      if (route === "signup" && method === "POST") {
        const name = cleanName(body.name);
        if (!name) return json({ error: "Enter your name." }, 400);
        if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick your clock-out time." }, 400);
        if (!validPin(body.pin)) return json({ error: "Your passcode needs at least 4 characters." }, 400);
        const color = COLORS.includes(body.color) ? body.color : COLORS[randomInt(COLORS.length)];
        const id = "p-" + randomBytes(5).toString("hex");
        if (!(await claimKey(`uname/${nameKey(name)}`, id))) return json({ error: `The name ${name} is taken. Try adding a letter or number.` }, 409);
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

      // Signed clip links: no log-in, cacheable for a year (a retake has a new time, so a new link).
      const sm = /^m\/(clip|thumb)\/([\w-]+)\/(\d{4}-\d{2}-\d{2})\/([\w.-]+)\/(\d{1,15})\/([\w-]{22})$/.exec(route);
      if (sm && method === "GET") {
        const [, kind, cid, day, slot, at, sig] = sm;
        const want = mediaSig(await mediaKey(), kind, cid, day, slot, at);
        if (!timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return json({ error: "That link doesn't work." }, 403);
        // the link is for one take: after a retake (same key, new time) the old link stops working
        const [r, meta] = await Promise.all([store.getWithMetadata(`${kind}/${cid}/${day}/${slot}`, { type: "arrayBuffer" }), getJSON(`clipmeta/${cid}/${day}/${slot}`)]);
        if (!r || !r.data || !meta || String(meta.at) !== at) return json({ error: "That clip is gone." }, 404);
        return new Response(r.data, { headers: {
          "content-type": (r.metadata && r.metadata.type) || (kind === "clip" ? "video/mp4" : "image/jpeg"),
          "cache-control": "public, max-age=31536000, immutable",
          "netlify-cdn-cache-control": "public, durable, max-age=31536000, immutable",
          "netlify-cache-tag": mediaTag(cid, day, slot),
        } });
      }

      /* ---------- signed in ---------- */
      const a = await auth(req);
      if (!a) return json({ error: "Please log in again." }, 401);
      let { me } = a;
      // After a change: mark the caves it touched as changed, then send the new state.
      const fresh = async (who, ...cids) => {
        await Promise.all([...new Set([who.cave, ...cids])].filter(Boolean).map(bump));
        return json(await state(who));
      };

      if (route === "state" && method === "GET") {
        // "Still the same?" costs one read. Cyclo watches who is online, which changes all the time, so it always reads.
        const have = url.searchParams.get("v");
        if (have && me.cave && POWERS[me.monster] !== "cyclo") {
          const t = now(), v = verToken(await getJSON(`ver/${me.cave}`), me.cave, sgDay(t), t);
          if (v === have) return json({ same: true, now: t, v });
        }
        return json(await state(me));
      }

      if (route === "ping" && method === "POST") {
        await Promise.all([stats.ping(me.id, body.open === true), touchStreak(me)]);
        return json({ ok: true });
      }

      /* ---------- Cave Calendar ---------- */
      if (route === "clip" && method === "POST") {
        if (!me.cave) return json({ error: "Join a cave first." }, 409);
        const t = now(), day = sgDay(t), ring = ringOf(me.cave, day, t);
        if (!ring) return json({ error: "Your cave's phones haven't rung yet today. Wait for the ring!" }, 409);
        let fd;
        try { fd = await req.formData(); } catch { return json({ error: "That upload didn't come through. Try again." }, 400); }
        const video = fd.get("video"), thumb = fd.get("thumb"), dur = Number(fd.get("dur"));
        if (!video || typeof video === "string" || !video.size) return json({ error: "No video came through. Try again." }, 400);
        const type = String(video.type || "").split(";")[0].toLowerCase();
        if (!CLIP_TYPES.includes(type)) return json({ error: "That isn't a video this app can keep." }, 400);
        if (video.size > CLIP_MAX_BYTES) return json({ error: "That clip is too big. Film it in the app so it stays small." }, 413);
        if (!(dur >= CLIP_MIN_S && dur <= CLIP_MAX_S)) return json({ error: "Clips are 2 to 4 seconds." }, 400);
        const hasThumb = thumb && typeof thumb !== "string" && thumb.size && thumb.size <= THUMB_MAX_BYTES && /^image\/(jpeg|webp|png)$/.test(thumb.type);
        const slot = slotKey(me.id, ring.r);
        await dropClip(me.cave, day, slot, me.id); // a retake replaces the earlier clip for this ring
        await store.set(`clip/${me.cave}/${day}/${slot}`, await video.arrayBuffer(), { metadata: { type } });
        if (hasThumb) await store.set(`thumb/${me.cave}/${day}/${slot}`, await thumb.arrayBuffer(), { metadata: { type: thumb.type } });
        await store.setJSON(`clipmeta/${me.cave}/${day}/${slot}`, {
          pid: me.id, r: ring.r, name: me.name, color: me.color, monster: me.monster, at: t, late: t > ring.until,
          dur: Math.round(dur * 10) / 10, type, size: video.size, thumb: !!hasThumb,
        });
        await store.setJSON(`myclip/${me.id}/${me.cave}/${day}/${slot}_${video.size}`, 0);
        // Put the new clip in the CDN now (after the reply), so the cave's first look at it is already fast.
        const links = await mediaLinks(me.cave, day, { slot, at: t, thumb: hasThumb });
        const origin = new URL(req.url).origin;
        await later(ctx, Promise.all([stats.log("clip", me.id, me.cave), ...Object.values(links).map((l) => warm(origin + l))]));
        return fresh(me);
      }
      const media = /^(clip|thumb)\/([\w-]+)\/(\d{4}-\d{2}-\d{2})\/([\w.-]+)$/.exec(route);
      if (media && method === "GET") {
        const [, kind, cid, day, slot] = media;
        if (cid !== me.cave) return json({ error: "That clip belongs to another cave." }, 403);
        const r = await store.getWithMetadata(`${kind}/${cid}/${day}/${slot}`, { type: "arrayBuffer" });
        if (!r || !r.data) return json({ error: "That clip is gone." }, 404);
        return new Response(r.data, { headers: {
          "content-type": (r.metadata && r.metadata.type) || (kind === "clip" ? "video/mp4" : "image/jpeg"),
          "cache-control": "private, max-age=31536000, immutable", // the app adds ?v=<posted at>, so a retake gets a new URL
        } });
      }
      if (route === "days" && method === "GET") {
        if (!me.cave) return json({ error: "Join a cave first." }, 409);
        const t = now(), today = sgDay(t);
        const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : today.slice(0, 7);
        const metas = await monthClips(me.cave, month, ctx);
        const pids = [...new Set(metas.map((c) => c.pid))];
        const live = Object.fromEntries((await Promise.all(pids.map(getPerson))).filter(Boolean).map((p) => [p.id, p]));
        const days = {};
        metas.forEach((c) => {
          const d = c.day, p = live[c.pid];
          (days[d] ||= { rings: ringTimes(me.cave, d).filter((at) => at <= t), clips: [] }).clips.push({
            pid: c.pid, slot: c.slot, r: c.r, name: p ? p.name : c.name, color: p ? p.color : c.color, monster: p ? p.monster : c.monster,
            at: c.at, late: c.late, dur: c.dur, thumb: c.thumb,
          });
        });
        await Promise.all(Object.entries(days).map(([d, info]) => Promise.all(info.clips.map(async (c) => Object.assign(c, await mediaLinks(me.cave, d, c))))));
        Object.values(days).forEach((d) => d.clips.sort((a, b) => a.r - b.r || a.at - b.at));
        return json({ month, today, days });
      }

      if (route === "geo" && method === "GET") {
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 60);
        if (q.length < 2) return json({ results: [] });
        try { return json({ results: await geocode(fetchFn, q) }); }
        catch (e) { return json({ error: "Couldn't look up places right now. Try again in a moment." }, 502); }
      }

      if (route === "logout" && method === "POST") { cache.sessions.delete(a.token); await store.delete(`sessions/${a.token}`); return json({ ok: true }); }

      // Test site only: ring my cave's phones now.
      if (route === "dev/ring" && method === "POST" && dev) {
        const cave = me.cave && (await getJSON(`cave/${me.cave}`));
        if (!cave) return json({ error: "Join a cave first." }, 409);
        const t = now(), day = sgDay(t);
        return json({ sent: await ringCave(cave, day, ringOf(cave.id, day, t).r) });
      }

      if (route === "me" && method === "POST") {
        switch (body.action) {
          case "time": {
            if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59)) return json({ error: "Pick a valid clock-out time." }, 400);
            const hasStart = body.sh !== undefined || body.sm !== undefined;
            if (hasStart && (!isInt(body.sh, 0, 23) || !isInt(body.sm, 0, 59))) return json({ error: "Pick a valid start time." }, 400);
            if (hasStart && body.sh * 60 + body.sm >= body.h * 60 + body.m) return json({ error: "Your start time needs to be before your clock-out time." }, 400);
            me = { ...me, h: body.h, m: body.m, ...(hasStart ? { sh: body.sh, sm: body.sm } : {}) }; break;
          }
          case "lunch":
            if (body.off === true) { me = { ...me, lunch: null }; break; }
            if (!isInt(body.h, 0, 23) || !isInt(body.m, 0, 59) || !LUNCH_LENGTHS.includes(body.dur)) return json({ error: "Pick a lunch time and how long it is." }, 400);
            me = { ...me, lunch: { h: body.h, m: body.m, dur: body.dur } }; break;
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
          case "region":
            if (!Object.hasOwn(REGIONS, body.region)) return json({ error: "Pick a holiday list." }, 400);
            me = { ...me, region: body.region }; break;
          case "dayoff": { // today only
            const day = sgDay(now());
            if (body.on === true) { await store.setJSON(`dayoff/${day}/${me.id}`, { at: now() }); await store.setJSON(`leave/${me.id}/${day}`, 0); }
            else { await store.delete(`dayoff/${day}/${me.id}`); await store.delete(`leave/${me.id}/${day}`); }
            return fresh(me);
          }
          case "pin": {
            if (!validPin(body.pin)) return json({ error: "Your passcode needs at least 4 characters." }, 400);
            const salt = randomBytes(16).toString("hex");
            me = { ...me, salt, hash: hashPin(body.pin, salt) }; break;
          }
          case "delete":
            cache.sessions.delete(a.token);
            await bump(await leaveCave(me));
            await dropPersonClips(me.id);
            await stats.forget(me.id);
            await store.delete(`lvl/${me.id}`);
            await Promise.all((await keys(`leave/${me.id}/`)).flatMap((k) => [store.delete(k), store.delete(`dayoff/${k.split("/")[2]}/${me.id}`)]));
            const ownsName = (await getJSON(`uname/${nameKey(me.name)}`)) === me.id;
            await Promise.all([`person/${me.id}`, ...(ownsName ? [`uname/${nameKey(me.name)}`] : []), `subs/${me.id}`, `sessions/${a.token}`].map((k) => store.delete(k)));
            return json({ ok: true });
          default:
            return json({ error: "Unknown action." }, 400);
        }
        await putPerson(me);
        return fresh(me);
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
            return fresh(me);
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
            if (me.cave === cid) return fresh(me);
            if (me.cave && body.switch !== true) return json({ error: "You're already in a cave.", needsSwitch: true, from: cave?.name }, 409);
            let was = null;
            if (me.cave) { await stats.log("cave", me.id, me.cave, "leave"); was = await leaveCave(me); me = await getPerson(me.id); }
            const err = await joinCave(me, cid);
            if (err) { await bump(was); return json({ error: err.error }, err.status); }
            await stats.log("cave", me.id, cid, "join");
            me = { ...me, cave: cid };
            return fresh(me, was);
          }
          case "leave": {
            if (!me.cave) return json(await state(me));
            await stats.log("cave", me.id, me.cave, "leave");
            const left = await leaveCave(me);
            me = { ...me, cave: null };
            return fresh(me, left);
          }
          case "rename": {
            if (!isOwner) return json({ error: "Only the cave owner can rename it." }, 403);
            const name = cleanName(body.name);
            if (!name) return json({ error: "Give the cave a name." }, 400);
            await store.setJSON(`cave/${cave.id}`, { ...cave, name });
            return fresh(me);
          }
          case "newcode": {
            if (!isOwner) return json({ error: "Only the cave owner can change the invite code." }, 403);
            const code = await claimCode(cave.id);
            await store.setJSON(`cave/${cave.id}`, { ...cave, code });
            await store.delete(`code/${cave.code}`);
            return fresh(me);
          }
          case "kick": {
            if (!isOwner) return json({ error: "Only the cave owner can remove people." }, 403);
            const pid = String(body.pid || "");
            if (pid === me.id) return json({ error: "Use Leave cave to leave." }, 400);
            const target = await getPerson(pid);
            if (!target || target.cave !== cave.id) return json({ error: "They're not in this cave." }, 404);
            await stats.log("cave", target.id, cave.id, "kick");
            await leaveCave(target);
            return fresh(me);
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
        return fresh(me);
      }

      if (route === "subscribe" && method === "POST") {
        const sub = body.subscription;
        if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth)
          return json({ error: "That isn't a valid push subscription." }, 400);
        const clean = { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? null, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } };
        const key = `subs/${me.id}`;
        const had = await getJSON(key, []);
        // Already mine and unchanged (the app re-sends it now and then): nothing to do, nobody else's list to check.
        if (had.some((s) => s.endpoint === clean.endpoint && s.keys?.p256dh === clean.keys.p256dh && s.keys?.auth === clean.keys.auth)) return json({ ok: true });
        await dropEndpointEverywhere(clean.endpoint, key); // one phone belongs to one person
        const mine = had.filter((s) => s.endpoint !== clean.endpoint);
        mine.push(clean);
        await store.setJSON(key, mine.slice(-MAX_SUBS_PER_PERSON));
        await bump(me.cave); // the cave sees who can be zapped
        return json({ ok: true });
      }

      if (route === "unsubscribe" && method === "POST") {
        await dropEndpointEverywhere(String(body.endpoint || ""), null);
        await bump(me.cave);
        return json({ ok: true });
      }

      if (route === "zap" && method === "POST") {
        const toId = /^[\w-]{1,40}$/.test(String(body.to || "")) ? body.to : null; // ids from v8 have other shapes; just no slashes
        const t = now();
        const zk = `zap/${me.id}/${toId}`;
        // who they are and my cooldown: read together, then the buzz goes out while the cooldown is saved
        const [to, last] = toId ? await Promise.all([getPerson(toId), getJSON(zk)]) : [null, null];
        if (!to || !me.cave || to.cave !== me.cave) return json({ error: "You can only zap people in your cave." }, 404);
        if (to.id === me.id) return json({ error: "You can't zap yourself." }, 400);
        if (last && t - last.at < ZAP_COOLDOWN_MS) return json({ error: "Cooling down.", retryInMs: ZAP_COOLDOWN_MS - (t - last.at) }, 429);
        const buzz = to.buzz !== false;
        const [, sent] = await Promise.all([store.setJSON(zk, { at: t }), sendPush(to.id, {
          title: `⚡ Zap from ${me.name}!`,
          body: cleanText(body.message, 140) || `${me.name} zapped you.`,
          tag: `zap-${me.id}`, url: "/", buzz, from: me.name,
        })]);
        await later(ctx, stats.log("zap", me.id, to.id, sent < 1 ? "n" : buzz ? "b" : "q"));
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
          return fresh(me);
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
            return fresh(me);
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
          return fresh(me);
        }

        if (route === "roar") {
          const rk = `roar/${day}/${me.id}`;
          if (await exists(rk)) return json({ error: "You've already roared today." }, 409);
          const o = await getJSON(`ot/${day}/${me.id}`);
          const offSec = me.h * 3600 + me.m * 60;
          if (isWorkday(day, await offFn(me))) {
            if (o && o.on && o.end == null && sgSeconds(t) >= offSec) return json({ error: "Clock out first, then roar." }, 409);
            if (sgSeconds(t) < offSec && !(o && o.on && o.end != null)) return json({ error: `You can roar once you're off at ${fmt12(me.h, me.m)}.` }, 409);
          }
          const text = (level >= 2 && cleanText(body.text, 60).replace(/\n+/g, " ")) || "I'm out!";
          await store.setJSON(rk, { pid: me.id, text, at: t, sound: level >= 3 });
          const mates = (await caveMembers(me.cave)).filter((p) => p.id !== me.id && p.fx !== false);
          await Promise.all(mates.map((p) => sendPush(p.id, {
            title: `${me.name} roars!`, body: text, tag: `roar-${me.id}`, url: "/", buzz: p.buzz !== false, kind: "roar",
          })));
          return fresh(me);
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

      // React to a message (WhatsApp style): one reaction per person per message; the same emoji again, or none, removes it.
      if (route === "chat/react" && method === "POST") {
        if (!me.cave) return json({ error: "Join a cave to chat." }, 409);
        const id = String(body.id || "");
        const emoji = body.emoji == null ? null : String(body.emoji);
        if (!/^[0-9]{13}-[0-9a-f]{6}$/.test(id)) return json({ error: "That message is gone." }, 404);
        if (emoji !== null && !REACTIONS.includes(emoji)) return json({ error: "Pick one of the reactions." }, 400);
        const [msg, mine] = await Promise.all([exists(`chat/${me.cave}/${id}`), keys(`react/${me.cave}/${id}/${me.id}/`)]);
        if (!msg) return json({ error: "That message is gone." }, 404);
        const want = emoji && `react/${me.cave}/${id}/${me.id}/${emojiHex(emoji)}`;
        const same = want && mine.length === 1 && mine[0] === want;
        if (!same) {
          await Promise.all(mine.map((k) => store.delete(k)));
          if (want) await store.setJSON(want, 0);
        }
        const rv = now().toString(36) + randomBytes(2).toString("hex");
        await store.setJSON(`chatre/${me.cave}`, { rv });
        const all = await reactionsOf(me.cave);
        return json({ id, reactions: all, rv }); // the whole cave's, so the phone can take this rv as its own
      }

      if (route === "chat") {
        if (!me.cave) return json({ error: "Join a cave to chat." }, 409);
        const prefix = `chat/${me.cave}/`;
        if (method === "GET") {
          const after = Number(url.searchParams.get("after") || 0), lastSeen = url.searchParams.get("last"), rvSeen = url.searchParams.get("rv");
          // "Anything new?" is two small reads when the phone already has the newest message and reactions.
          // phones from before v33 don't send rv and don't show reactions: they only get them with a first load
          const wantRv = rvSeen !== null || !after;
          const [last, rv] = await Promise.all([after && lastSeen ? chatLast(me.cave) : null, wantRv ? chatRv(me.cave) : null]);
          const newMsgs = !(after && lastSeen && last.id === lastSeen);
          const newReacts = wantRv && rvSeen !== rv;
          if (!newMsgs && !newReacts) return json({ messages: [] });
          const [msgs, reactions] = await Promise.all([
            newMsgs ? (async () => {
              let ks = (await keys(prefix)).sort((x, y) => chatKeyTs(x) - chatKeyTs(y));
              ks = after ? ks.filter((k) => chatKeyTs(k) > after) : ks.slice(-60);
              return (await Promise.all(ks.map((k) => getJSON(k)))).filter(Boolean);
            })() : [],
            newReacts ? reactionsOf(me.cave) : null,
          ]);
          return json({ messages: msgs, ...(reactions ? { reactions, rv } : {}) });
        }
        if (method === "POST") {
          const text = cleanText(body.text, 500);
          if (!text) return json({ error: "Type a message first." }, 400);
          // A reply (v40) carries a short copy of the message it answers, so it shows even after that one is gone.
          let re;
          if (body.re != null) {
            const rid = String(body.re);
            const orig = /^[0-9]{13}-[0-9a-f]{6}$/.test(rid) ? await getJSON(prefix + rid) : null;
            if (!orig) return json({ error: "The message you're replying to is gone." }, 404);
            re = { id: orig.id, pid: orig.pid, name: orig.name, color: orig.color, text: orig.text.slice(0, 120) };
          }
          const at = now();
          const id = `${String(at).padStart(13, "0")}-${randomBytes(3).toString("hex")}`;
          const msg = { id, pid: me.id, name: me.name, color: me.color, monster: me.monster, text, at, ...(re ? { re } : {}) };
          await Promise.all([store.setJSON(prefix + id, msg), store.setJSON(`chatlast/${me.cave}`, { at, pid: me.id, id })]);
          await bump(me.cave); // boards show the unread dot
          await later(ctx, Promise.all([stats.log("msg", me.id, me.cave), (async () => {
            const all = (await keys(prefix)).sort((x, y) => chatKeyTs(x) - chatKeyTs(y));
            if (all.length <= CHAT_KEEP) return;
            const gone = all.slice(0, all.length - CHAT_KEEP);
            const goneIds = new Set(gone.map((k) => k.split("/").pop()));
            const reacts = (await keys(`react/${me.cave}/`)).filter((k) => goneIds.has(k.split("/")[2]));
            await Promise.all([...gone, ...reacts].map((k) => store.delete(k)));
          })()]));
          return json({ message: msg });
        }
      }

      return json({ error: "Not found." }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Something went wrong on the server. Try again in a moment." }, 500);
    }
  }

  return { handle, rainAlerts, ringTick };
}
