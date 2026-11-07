// Usage stats for the admin page. Message text is never recorded.
//
//   use/<YYYY-MM-DD>/<pid>          {opens, seconds, first, last}   (one per person per day, written only by that person)
//   ev/<kind>/<ts>_<a>_<b>_<c>      empty value; the key itself holds the event, so listing is enough
//       ev/signup/<ts>_<pid>
//       ev/login/<ts>_<pid>
//       ev/zap/<ts>_<from>_<to>_<b|q|n>      b = phone buzzed, q = arrived quietly, n = they haven't turned on zaps
//       ev/msg/<ts>_<pid>_<cid>
//       ev/cave/<ts>_<pid>_<cid>_<create|join|leave|kick>
// Everything older than KEEP_DAYS is deleted when the admin page loads.
import { createHash, timingSafeEqual } from "node:crypto";

export const KEEP_DAYS = 90;
const OPEN_GAP_MS = 5 * 60 * 1000;   // back after 5+ minutes away counts as a new open
const PING_GAP_MS = 3 * 60 * 1000;   // pings further apart than this don't count as time in the app
const PING_MAX_MS = 90 * 1000;       // one ping adds at most 90 seconds
// SHA-256 of the admin key. The key itself is not in the code. Set ADMIN_KEY in Netlify to replace it.
const DEFAULT_ADMIN_HASH = "fae948c3b5537be2a54be28239df35b7ebbb2956cbe629eb119c6f1d482a6f99";

const sha = (s) => createHash("sha256").update(String(s)).digest();
const ts13 = (t) => String(t).padStart(13, "0");

export function sgDayOf(ms) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(ms)).reduce((o, x) => ((o[x.type] = x.value), o), {});
  return `${p.year}-${p.month}-${p.day}`;
}

export function makeStats({ store, now, adminKey }) {
  const getJSON = async (k, fb = null) => (await store.get(k, { type: "json" })) ?? fb;
  const keys = async (prefix) => (await store.list({ prefix })).blobs.map((b) => b.key);
  const expected = adminKey ? sha(adminKey) : Buffer.from(DEFAULT_ADMIN_HASH, "hex");

  function isAdmin(req) {
    const given = req.headers.get("x-admin-key");
    return !!given && timingSafeEqual(sha(given.trim()), expected);
  }

  // Never let stats break the app.
  async function log(kind, ...parts) {
    try { await store.setJSON(`ev/${kind}/${ts13(now())}_${parts.join("_")}`, 0); } catch (e) { console.error("stats", e); }
  }

  async function ping(pid, open) {
    const t = now();
    const k = `use/${sgDayOf(t)}/${pid}`;
    const u = await getJSON(k, { opens: 0, seconds: 0, first: t, last: 0 });
    const gap = u.last ? t - u.last : Infinity;
    if (gap <= PING_GAP_MS) u.seconds += Math.round(Math.min(gap, PING_MAX_MS) / 1000);
    if (u.opens === 0 || (open && gap > OPEN_GAP_MS)) u.opens += 1;
    u.last = t;
    await store.setJSON(k, u);
    return u;
  }

  // Remove everything stats knows about a person (used when they delete their account).
  async function forget(pid) {
    const [use, ev] = await Promise.all([keys("use/"), keys("ev/")]);
    const doomed = use.filter((k) => k.endsWith("/" + pid)).concat(ev.filter((k) => k.split("/")[2].split("_").includes(pid)));
    await Promise.all(doomed.map((k) => store.delete(k)));
  }

  function parseEvent(key) {
    const [, kind, rest] = key.split("/");
    const [t, ...p] = rest.split("_");
    return { kind, at: Number(t), p };
  }

  async function report(days) {
    const t = now();
    const today = sgDayOf(t);
    const dayList = [];
    for (let i = days - 1; i >= 0; i--) dayList.push(sgDayOf(t - i * 864e5));
    const inRange = new Set(dayList);
    const keepFrom = t - KEEP_DAYS * 864e5;
    const keepDay = sgDayOf(keepFrom);

    const [personKeys, caveKeys, useKeys, evKeys] = await Promise.all([keys("person/"), keys("cave/"), keys("use/"), keys("ev/")]);

    // prune old stats
    const oldUse = useKeys.filter((k) => k.split("/")[1] < keepDay);
    const events = [];
    const oldEv = [];
    for (const k of evKeys) {
      const e = parseEvent(k);
      if (!Number.isFinite(e.at) || e.at < keepFrom) oldEv.push(k); // drop unreadable or expired events
      else events.push(e);
    }
    await Promise.all(oldUse.concat(oldEv).map((k) => store.delete(k)));

    const people = (await Promise.all(personKeys.map((k) => getJSON(k)))).filter(Boolean);
    const caves = (await Promise.all(caveKeys.map((k) => getJSON(k)))).filter(Boolean);
    const caveName = Object.fromEntries(caves.map((c) => [c.id, c.name]));

    // usage rows: everything in range, plus each person's latest day (for "last opened")
    const liveUse = useKeys.filter((k) => /^use\/\d{4}-\d{2}-\d{2}\//.test(k) && k.split("/")[1] >= keepDay).map((k) => { const [, day, pid] = k.split("/"); return { k, day, pid }; });
    const latestKey = {};
    for (const u of liveUse) if (!latestKey[u.pid] || u.day > latestKey[u.pid].day) latestKey[u.pid] = u;
    const want = new Map();
    for (const u of liveUse) if (inRange.has(u.day)) want.set(u.k, u);
    for (const u of Object.values(latestKey)) want.set(u.k, u);
    const rows = await Promise.all([...want.values()].map(async (u) => ({ ...u, v: await getJSON(u.k) })));

    const byPid = {};
    const blank = () => ({ opens: 0, seconds: 0, todaySeconds: 0, opensToday: 0, lastSeen: null, activeDays: 0, perDay: {},
      zapsSent: 0, zapsReceived: 0, sentTo: {}, receivedFrom: {}, messages: 0, logins: 0 });
    const P = (pid) => (byPid[pid] ||= blank());

    const daily = Object.fromEntries(dayList.map((d) => [d, { day: d, active: 0, seconds: 0, opens: 0, zaps: 0, messages: 0, signups: 0 }]));
    for (const r of rows) {
      if (!r.v) continue;
      const s = P(r.pid);
      if (!s.lastSeen || r.v.last > s.lastSeen) s.lastSeen = r.v.last;
      if (!inRange.has(r.day)) continue;
      s.opens += r.v.opens; s.seconds += r.v.seconds; s.activeDays += 1; s.perDay[r.day] = { seconds: r.v.seconds, opens: r.v.opens };
      if (r.day === today) { s.todaySeconds = r.v.seconds; s.opensToday = r.v.opens; }
      daily[r.day].active += 1; daily[r.day].seconds += r.v.seconds; daily[r.day].opens += r.v.opens;
    }

    const rangeStart = t - days * 864e5;
    const recent = [];
    for (const e of events) {
      const day = sgDayOf(e.at);
      const inside = inRange.has(day) && e.at >= rangeStart - 864e5;
      if (e.kind === "zap") {
        const [from, to, r] = e.p;
        if (inside) {
          P(from).zapsSent++; P(to).zapsReceived++;
          P(from).sentTo[to] = (P(from).sentTo[to] || 0) + 1;
          P(to).receivedFrom[from] = (P(to).receivedFrom[from] || 0) + 1;
          daily[day].zaps++;
        }
        recent.push({ kind: "zap", at: e.at, from, to, result: r });
      } else if (e.kind === "msg") {
        if (inside) { P(e.p[0]).messages++; daily[day].messages++; }
        recent.push({ kind: "msg", at: e.at, pid: e.p[0], cave: e.p[1] });
      } else if (e.kind === "signup") {
        if (inside) daily[day].signups++;
        recent.push({ kind: "signup", at: e.at, pid: e.p[0] });
      } else if (e.kind === "login") {
        if (inside) P(e.p[0]).logins++;
        recent.push({ kind: "login", at: e.at, pid: e.p[0] });
      } else if (e.kind === "cave") {
        recent.push({ kind: "cave", at: e.at, pid: e.p[0], cave: e.p[1], action: e.p[2] });
      }
    }
    recent.sort((a, b) => b.at - a.at);

    const peopleOut = people.map((p) => ({
      id: p.id, name: p.name, color: p.color, monster: p.monster, h: p.h, m: p.m, buzz: p.buzz !== false,
      cave: p.cave, caveName: p.cave ? caveName[p.cave] || null : null, joinedAt: p.at,
      ...(byPid[p.id] || blank()),
    }));
    const activeSince = (ms) => peopleOut.filter((p) => p.lastSeen && p.lastSeen >= ms).length;
    const dayStart = Date.parse(today + "T00:00:00+08:00");

    return {
      now: t, days, today, dayList,
      totals: {
        people: people.length,
        caves: caves.length,
        activeToday: activeSince(dayStart),
        active7: activeSince(t - 7 * 864e5),
        seconds: peopleOut.reduce((a, p) => a + p.seconds, 0),
        zaps: Object.values(daily).reduce((a, d) => a + d.zaps, 0),
        messages: Object.values(daily).reduce((a, d) => a + d.messages, 0),
        signups: Object.values(daily).reduce((a, d) => a + d.signups, 0),
      },
      daily: dayList.map((d) => daily[d]),
      people: peopleOut,
      caves: caves.map((c) => ({ id: c.id, name: c.name, owner: c.owner, at: c.at, members: people.filter((p) => p.cave === c.id).length })),
      // deleted accounts show as "Former member" on the admin page
      recent: recent.slice(0, 300),
    };
  }

  return { isAdmin, log, ping, forget, report };
}
