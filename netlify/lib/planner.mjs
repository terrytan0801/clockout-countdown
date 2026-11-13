// v51: the holiday planner. Finds where a day or two of leave joins public holidays and weekends into a long break.
import { holidayTable } from "./holidays.mjs";

const addDays = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (day) => new Date(day + "T00:00:00Z").getUTCDay(); // 0 Sunday .. 6 Saturday

// Long breaks starting from `from` (a Singapore day) over the next `span` days.
// Each idea: {from, to, days, leave:[days to take off], holidays:[{day,name}]}, sorted by date.
export function longBreaks(region, from, span = 365, maxLeave = 4) {
  const table = holidayTable(region), until = addDays(from, span);
  const isOff = (d, leave) => weekday(d) === 0 || weekday(d) === 6 || !!table[d] || leave.has(d);
  const runOf = (d, leave) => { let s = d, e = d; while (isOff(addDays(s, -1), leave)) s = addDays(s, -1); while (isOff(addDays(e, 1), leave)) e = addDays(e, 1); return [s, e]; };
  const len = (s, e) => Math.round((Date.parse(e) - Date.parse(s)) / 864e5) + 1;
  const holidays = Object.keys(table).filter((d) => d >= from && d <= until).sort();
  const seen = new Set(), ideas = [];
  for (const h of holidays) {
    const base = runOf(h, new Set());
    const key = base.join();
    if (seen.has(key)) continue;
    seen.add(key);
    const best = new Map(); // leave count -> best {s, e, leave}
    const tryIt = (before, after) => {
      const leave = new Set();
      let [s, e] = base;
      for (let i = 0; i < before; i++) { const d = addDays(s, -1); leave.add(d); [s, e] = runOf(d, leave); }
      for (let i = 0; i < after; i++) { const d = addDays(e, 1); leave.add(d); [s, e] = runOf(d, leave); }
      const n = leave.size, cur = best.get(n);
      if (!cur || len(s, e) > len(cur.s, cur.e) || (len(s, e) === len(cur.s, cur.e) && s < cur.s)) best.set(n, { s, e, leave: [...leave].sort() });
    };
    for (let b = 0; b <= maxLeave; b++) for (let a = 0; a + b <= maxLeave; a++) tryIt(b, a);
    // Offer: the break with no leave (3+ days), the best 1-day bridge (4+ days), and the longest break for 2-4 days
    // of leave if it's worth it (2.5+ days off per day of leave, and 3+ days longer than the others).
    const pick = [];
    const n0 = best.get(0), n1 = best.get(1);
    if (n0 && len(n0.s, n0.e) >= 3) pick.push(n0);
    if (n1 && len(n1.s, n1.e) >= 4) pick.push(n1);
    const big = [2, 3, 4].map((n) => best.get(n)).filter((x) => x && len(x.s, x.e) / x.leave.length >= 2.5)
      .sort((p, q) => len(q.s, q.e) - len(p.s, p.e) || p.leave.length - q.leave.length)[0];
    if (big && (!pick.length || len(big.s, big.e) >= Math.max(...pick.map((x) => len(x.s, x.e))) + 3)) pick.push(big); // only if it's clearly longer
    for (const x of pick) {
      if (x.leave.some((d) => d < from)) continue;
      const id = `${x.s}|${x.e}|${x.leave.join(",")}`;
      if (ideas.some((i) => i.id === id)) continue;
      const hols = [];
      for (let d = x.s; d <= x.e; d = addDays(d, 1)) if (table[d]) hols.push({ day: d, name: table[d] });
      ideas.push({ id, from: x.s, to: x.e, days: len(x.s, x.e), leave: x.leave, holidays: hols });
    }
  }
  return ideas.filter((i) => i.to >= from).sort((p, q) => (p.from < q.from ? -1 : p.from > q.from ? 1 : p.leave.length - q.leave.length));
}
