// Cave Calendar (v15): once a day each cave's phones ring at a random time, and everyone films 5-7 seconds.
// The ring time is worked out from the cave id and the date, so it needs no storage and is the same for everyone.
import { dayStartMs } from "./powers.mjs";

export const RING_FROM = 10 * 3600;          // 10:00 am, Singapore time
export const RING_TO = 21 * 3600;            // last ring before 9:00 pm
export const RING_STEP = 5 * 60;             // rings land on 5-minute marks (the ring job runs every 5 minutes)
export const RING_WINDOW_MS = 10 * 60e3;     // 10 minutes to post on time; later posts are marked Late
export const CLIP_MIN_S = 4.5, CLIP_MAX_S = 8; // the app records 5-7 s; a little slack for timing
export const CLIP_MAX_BYTES = 3_000_000;     // keeps the upload under the function's request limit
export const THUMB_MAX_BYTES = 200_000;
export const CLIP_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

// FNV-1a, so the ring time is spread evenly and can't be guessed from the date alone.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
export function ringSec(cid, day) {
  const slots = Math.floor((RING_TO - RING_FROM) / RING_STEP);
  return RING_FROM + (hash(`${cid}|${day}|ring`) % slots) * RING_STEP;
}
export const ringAt = (cid, day) => dayStartMs(day) + ringSec(cid, day) * 1000;
