// Made-up demo data for the local preview server only (SEED=1 node test/dev-server.mjs).
// Everyone's passcode is 1234. One person per live power, at different levels.
import { scryptSync } from "node:crypto";
import { sgDayOf } from "../netlify/lib/stats.mjs";
import { M, sgSeconds } from "../netlify/lib/powers.mjs";

export async function seed(store, now = Date.now()) {
  const salt = "seed", hash = scryptSync("1234", salt, 32).toString("hex");
  const today = sgDayOf(now), nowSec = sgSeconds(now);
  const cave = { id: "c-demo", name: "Monster Cave", owner: "p-terry", code: "DEMO23", at: now - 40 * 864e5 };
  await store.setJSON("meta/v9", { at: now });
  await store.setJSON(`cave/${cave.id}`, cave); await store.setJSON(`code/${cave.code}`, cave.id);
  // Lily clocks out at the start of the next minute, so the Jelly party can be watched live.
  const lilyOff = Math.floor(nowSec / 60) + 1;
  const ppl = [
    // id, name, colour, monster, h, m, activity, streak
    ["p-terry", "Terry", "orange", M.dino, 17, 0, 1.0, 14],
    ["p-sukee", "Sukee", "violet", M.cyclo, 17, 30, 0.9, 14],
    ["p-shunyi", "Shunyi", "teal", M.fluff, 18, 0, 0.7, 14],
    ["p-winnie", "Winnie", "pink", M.tako, 16, 30, 0.5, 14],
    ["p-lily", "Lily", "gold", M.jelly, Math.floor(lilyOff / 60) % 24, lilyOff % 60, 0.25, 14],
    ["p-qitai", "Qitai", "blue", M.mush, 18, 30, 0.6, 7],
  ];
  let seedN = 7; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  for (const [id, name, color, monster, h, m, act, streak] of ppl) {
    await store.setJSON(`person/${id}`, { id, name, h, m, color, monster, buzz: id !== "p-lily", cave: cave.id, at: now - 35 * 864e5 + rnd() * 5 * 864e5, salt, hash,
      ...(id === "p-shunyi" ? { city: { name: "Kuala Lumpur", lat: 3.14, lon: 101.69 } } : {}) });
    await store.setJSON(`uname/${name.toLowerCase()}`, id);
    await store.setJSON(`member/${cave.id}/${id}`, { at: now - 30 * 864e5 + ppl.findIndex((x) => x[0] === id) * 1000 });
    await store.setJSON(`lvl/${id}`, { streak, lastDay: today, best: streak });
    await store.setJSON(`ev/signup/${String(Math.floor(now - 33 * 864e5 + rnd() * 864e5)).padStart(13, "0")}_${id}`, 0);
    for (let d = 29; d >= 1; d--) {
      const day = new Date(now - d * 864e5); const dow = new Date(day.getTime() + 8 * 3600e3).getUTCDay();
      if (rnd() > act * (dow === 0 || dow === 6 ? 0.4 : 1)) continue;
      const last = now - d * 864e5 - rnd() * 6 * 3600e3;
      await store.setJSON(`use/${sgDayOf(last)}/${id}`, { opens: 1 + (rnd() * 6 | 0), seconds: (60 + rnd() * 1800) | 0, first: last - 3600e3, last });
    }
  }
  // today: Terry and Qitai are in the app right now; Shunyi was here an hour ago
  for (const [id, ago] of [["p-terry", 30e3], ["p-qitai", 60e3], ["p-shunyi", 3600e3]])
    await store.setJSON(`use/${today}/${id}`, { opens: 2, seconds: 900, first: now - 4 * 3600e3, last: now - ago });
  // Winnie stayed late on Monday this week (night owl)
  const mon = new Date(Date.parse(today + "T12:00:00Z") - ((new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  await store.setJSON(`ot/${mon}/p-winnie`, { on: true, end: 20 * 3600 + 12 * 60 });
  // Qitai (Mush Lv2) cheered Shunyi twice today; Tako notes from Winnie
  await store.setJSON(`cheer/${today}/p-shunyi/${String(now - 600e3).padStart(13, "0")}_p-qitai_2`, { from: "p-qitai", at: now - 600e3, lv: 2 });
  await store.setJSON(`cheer/${today}/p-shunyi/${String(now - 500e3).padStart(13, "0")}_p-qitai_2`, { from: "p-qitai", at: now - 500e3, lv: 2 });
  const note = async (text, pinned, ago) => {
    const at = now - ago, id = `${String(at).padStart(13, "0")}-${(ago % 0xffffff).toString(16).padStart(6, "0")}`;
    await store.setJSON(`note/${cave.id}/${id}`, { id, pid: "p-winnie", text, at, pinned, expires: pinned ? at + 7 * 864e5 : Date.parse(today + "T00:00:00+08:00") + 864e5 });
  };
  await note("Team dinner Friday, 7 pm at the mamak", true, 7200e3);
  await note("Who's buying bubble tea later?", false, 1800e3);
  // a few chat messages so "Seen by" has something to show
  for (const [pid, name, color, monster, text, ago] of [["p-qitai", "Qitai", "blue", M.mush, "Anyone else still stuck here?", 900e3], ["p-terry", "Terry", "orange", M.dino, "Leaving at 5 sharp", 300e3]]) {
    const at = now - ago, id = `${String(at).padStart(13, "0")}-aaaaaa`;
    await store.setJSON(`chat/${cave.id}/${id}`, { id, pid, name, color, monster, text, at });
  }
  for (const pid of ["p-terry", "p-qitai", "p-winnie"]) await store.setJSON(`read/${cave.id}/${pid}`, { at: now });
  console.log("seeded demo data; Lily clocks out at", `${Math.floor(lilyOff / 60) % 24}:${String(lilyOff % 60).padStart(2, "0")}`);
}

// A fake forecast: rain around 5-6 pm.
export async function fakeFetch(u) {
  if (u.includes("geocoding")) return { ok: true, json: async () => ({ results: [
    { name: "Kuala Lumpur", admin1: "Kuala Lumpur", country: "Malaysia", latitude: 3.14, longitude: 101.69 },
    { name: "Johor Bahru", admin1: "Johor", country: "Malaysia", latitude: 1.49, longitude: 103.74 }] }) };
  const start = new Date(Date.now() + Number(process.env.SHIFT_MS || 0) + 8 * 3600e3).toISOString().slice(0, 10);
  const days = [0, 1, 2].map((i) => new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10));
  const time = [], t2 = [], pp = [], wc = [];
  for (const d of days) for (let h = 0; h < 24; h++) { time.push(`${d}T${String(h).padStart(2, "0")}:00`); t2.push(h > 11 && h < 17 ? 32 : 27); pp.push(h >= 17 && h <= 19 ? 70 : 15); wc.push(h >= 17 && h <= 19 ? 95 : 2); }
  return { ok: true, json: async () => ({ hourly: { time, temperature_2m: t2, precipitation_probability: pp, weather_code: wc },
    daily: { time: days, weather_code: [95, 3, 0], temperature_2m_max: [33, 32, 31], temperature_2m_min: [25, 25, 24], precipitation_probability_max: [80, 30, 5] } }) };
}
