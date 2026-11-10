// Cave Calendar: twice a day each cave's phones ring at random times, and everyone films 2-4 seconds.
// The ring times are worked out from the cave id and the date, so they need no storage and match for everyone.
import { dayStartMs } from "./powers.mjs";

export const RING_COUNT = 2;                 // rings a day (was 4 in v16-v25: too many notifications)
export const RING_FROM = 10 * 3600;          // 10:00 am, Singapore time
export const RING_TO = 22 * 3600;            // 10:00 pm
export const RING_GAP = 3 * 3600;            // at least three hours between the two rings
export const RING_STEP = 5 * 60;             // rings land on 5-minute marks (the ring job runs every 5 minutes)
export const RING_WINDOW_MS = 10 * 60e3;     // 10 minutes to post on time; later posts (until the next ring) are Late
export const CLIP_MIN_S = 1.5, CLIP_MAX_S = 5; // the app records 2-4 s; a little slack for timing
export const CLIP_MAX_BYTES = 3_000_000;     // keeps the upload under the function's request limit
export const THUMB_MAX_BYTES = 200_000;
export const CLIP_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

// FNV-1a, so the ring times are spread evenly and can't be guessed from the date alone.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
// The day is cut into RING_COUNT equal parts; each part rings once, early enough to keep an hour's gap to the next.
export function ringSecs(cid, day) {
  const part = (RING_TO - RING_FROM) / RING_COUNT;
  const slots = Math.floor((part - RING_GAP) / RING_STEP) + 1;
  return Array.from({ length: RING_COUNT }, (_, i) => {
    const start = Math.ceil((RING_FROM + i * part) / RING_STEP) * RING_STEP;
    return start + (hash(`${cid}|${day}|ring${i}`) % slots) * RING_STEP;
  });
}
export const ringTimes = (cid, day) => ringSecs(cid, day).map((s) => dayStartMs(day) + s * 1000);
// The latest ring that has gone off at time t: { r, at, until, next } or null before the first ring.
export function currentRing(cid, day, t) {
  const times = ringTimes(cid, day);
  let r = -1;
  times.forEach((at, i) => { if (t >= at) r = i; });
  if (r < 0) return null;
  return { r, at: times[r], until: times[r] + RING_WINDOW_MS, closes: times[r + 1] ?? dayStartMs(day) + 864e5 };
}
// Keys: one clip per person per ring. Clips from v15 (one ring a day) have no ring number and count as ring 0.
export const slotKey = (pid, r) => `${pid}.${r}`;
export function parseSlot(seg) {
  const [pid, r] = seg.split(".");
  return { pid, r: Number(r) || 0 };
}
