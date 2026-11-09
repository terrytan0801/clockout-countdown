// Monster powers (v13): workday streaks -> levels, and the helpers the six live powers need.
//
//   lvl/<pid>                       {streak, lastDay, best}       written only on that person's own check-ins
//   cheer/<day>/<to>/<ts>-<from>    {from, at, lv}                Mush: Spore Cheer
//   note/<cid>/<ts>-<rand>          {id, pid, text, at, pinned, expires}   Tako: Ink Notes
//   roar/<day>/<pid>                {pid, text, at, sound}        Dino: Roar
//   read/<cid>/<pid>                {at}                          chat read marker (shown to Cyclo Lv2)
//   wx/<lat>,<lon>                  {at, data}                    Fluff: cached forecast (30 min)
//   rainalert/<day>/<pid>           {at}                          Fluff Lv2: one rain alert a day

export const POWERS = ["jelly", "cyclo", "noodle", "spike", "bun", "tako", "mush", "chomp", "fluff", "dino"];
export const READY = new Set(["jelly", "cyclo", "tako", "mush", "fluff", "dino"]);
export const M = Object.fromEntries(POWERS.map((k, i) => [k, i]));
export const THRESH = [0, 3, 7, 14];                 // workday streak needed for Lv0..Lv3
export const levelFor = (s) => (s >= 14 ? 3 : s >= 7 ? 2 : s >= 3 ? 1 : 0);
export const CHEERS_PER_DAY = [0, 1, 3, 5];
export const NOTES_AT_ONCE = [0, 1, 2, 3];
const DAY = 864e5;

export function sgDay(ms) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(ms)).reduce((o, x) => ((o[x.type] = x.value), o), {});
  return `${p.year}-${p.month}-${p.day}`;
}
export const sgSeconds = (ms) => Math.floor(((ms + 8 * 3600e3) % DAY + DAY) % DAY / 1000);
const toUTC = (day) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day, n) => fromUTC(toUTC(day) + n * DAY);
export const weekdayOf = (day) => new Date(toUTC(day)).getUTCDay(); // 0 Sun .. 6 Sat
// off(day) -> true for someone's public holidays and days off; those count like weekends.
export const isWorkday = (day, off) => { const w = weekdayOf(day); return w >= 1 && w <= 5 && !(off && off(day)); };
export function prevWorkday(day, off) { let d = addDays(day, -1); for (let i = 0; i < 60 && !isWorkday(d, off); i++) d = addDays(d, -1); return d; }
export function workdaysBetween(a, b, off) { // strictly between a and b
  let n = 0; for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (isWorkday(d, off)) n++; return n;
}
export const dayStartMs = (day) => Date.parse(day + "T00:00:00+08:00");
export const monthOf = (ms) => sgDay(ms).slice(0, 7);

// Count this workday. Missing one or more workdays drops one level (never to zero in one go).
export function streakUpdate(rec, today, off) {
  if (!isWorkday(today, off)) return rec;
  if (rec && rec.lastDay === today) return rec;
  let streak;
  if (!rec || !rec.lastDay) streak = 1;
  else if (workdaysBetween(rec.lastDay, today, off) === 0) streak = rec.streak + 1;
  else streak = THRESH[Math.max(0, levelFor(rec.streak) - 1)] + 1;
  return { streak, lastDay: today, best: Math.max(rec?.best || 0, streak) };
}

// First time we see someone: give credit for the workdays they already opened the app in a row.
export function backfill(openDays, today, off) {
  let n = 0, d = prevWorkday(today, off);
  while (openDays.has(d)) { n++; d = prevWorkday(d, off); }
  return n ? { streak: n, lastDay: prevWorkday(today, off), best: n } : null;
}

export function levelInfo(rec) {
  const streak = rec?.streak || 0, level = levelFor(streak);
  return { level, streak, best: rec?.best || streak, next: level < 3 ? THRESH[level + 1] : null };
}

/* ---------- weather (Open-Meteo, free, no key) ---------- */
const WX = [
  [[0], "Clear", "sun"], [[1, 2], "Partly cloudy", "cloud"], [[3], "Cloudy", "cloud"], [[45, 48], "Foggy", "fog"],
  [[51, 53, 55, 56, 57], "Drizzle", "rain"], [[61, 63, 65, 66, 67], "Rain", "rain"], [[71, 73, 75, 77, 85, 86], "Snow", "cloud"],
  [[80, 81, 82], "Showers", "rain"], [[95, 96, 99], "Thunderstorm", "storm"],
];
export function wxLabel(code) {
  for (const [codes, label, kind] of WX) if (codes.includes(code)) return { label, kind };
  return { label: "Cloudy", kind: "cloud" };
}

export async function getWeather({ store, fetchFn, now, lat, lon }) {
  const key = `wx/${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = await store.get(key, { type: "json" });
  if (cached && now() - cached.at < 30 * 60e3) return cached.data;
  const u = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&hourly=temperature_2m,precipitation_probability,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Asia%2FSingapore&forecast_days=3";
  const r = await fetchFn(u);
  if (!r.ok) throw new Error("weather " + r.status);
  const data = await r.json();
  await store.setJSON(key, { at: now(), data });
  return data;
}
export function weatherAt(data, day, hour) {
  const i = data?.hourly?.time?.indexOf(`${day}T${String(hour).padStart(2, "0")}:00`);
  if (i == null || i < 0) return null;
  const code = data.hourly.weather_code[i];
  return { temp: Math.round(data.hourly.temperature_2m[i]), rain: data.hourly.precipitation_probability[i] ?? 0, code, ...wxLabel(code) };
}
export function dailyOf(data) {
  const d = data?.daily; if (!d?.time) return [];
  return d.time.map((day, i) => ({ day, max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]),
    rain: d.precipitation_probability_max[i] ?? 0, code: d.weather_code[i], ...wxLabel(d.weather_code[i]) }));
}
export async function geocode(fetchFn, q) {
  const r = await fetchFn("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" + encodeURIComponent(q));
  if (!r.ok) throw new Error("geocode " + r.status);
  const d = await r.json();
  return (d.results || []).map((x) => ({ name: x.name, admin1: x.admin1 || "", country: x.country || "", lat: x.latitude, lon: x.longitude }));
}
