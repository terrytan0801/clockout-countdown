// v54: where the data lives.
// The functions run in Netlify's default region (US East, choosing another needs Pro) but until v53 every
// record lived in Singapore, so each read or write crossed the Pacific (about half a second each) and a tap
// that touched the store a few times in a row took 2-5 seconds. From v54 the records live next to the
// functions. Videos and cover frames (clip/, thumb/) stay in Singapore: they are big, rarely read, and the
// CDN keeps them after the first look.
//
// The first request after the update moves everything else across, a chunk at a time. Until that's done
// every request gets 503 {moving:true} (the phone waits and tries again), so nothing is written to the old
// store while it's being copied. The old copy is left in place as a backup.

export const FAR = "ap-southeast-1"; // where the data was until v53
const BLOB_REGIONS = ["us-east-1", "us-east-2", "eu-central-1", "ap-southeast-1", "ap-southeast-2"];
// The blob region closest to where this function runs.
export function nearRegion(aws = "") {
  if (BLOB_REGIONS.includes(aws)) return aws;
  if (aws.startsWith("us-") || aws.startsWith("ca-") || aws.startsWith("sa-")) return "us-east-1";
  if (aws.startsWith("eu-") || aws.startsWith("me-") || aws.startsWith("af-")) return "eu-central-1";
  if (aws.startsWith("ap-")) return "ap-southeast-1";
  return "us-east-1";
}

export const isMedia = (k) => /^(clip|thumb)\//.test(k || "");

// One store-shaped object: media keys go to the old store, everything else to the near one.
export function split(near, far) {
  if (near === far) return far;
  const pick = (k) => (isMedia(k) ? far : near);
  return {
    get: (k, o) => pick(k).get(k, o),
    getMetadata: (k, o) => pick(k).getMetadata(k, o),
    getWithMetadata: (k, o) => pick(k).getWithMetadata(k, o),
    set: (k, v, o) => pick(k).set(k, v, o),
    setJSON: (k, v, o) => pick(k).setJSON(k, v, o),
    delete: (k) => pick(k).delete(k),
    // every listing in the app is under one top-level folder, so the prefix says which store has it
    list: (o = {}) => (isMedia(o.prefix) ? far : near).list(o),
  };
}

// Opens the app's store for this deploy: { store, near, far, moving }.
export function openStores(getStore, { dev = false, aws = process.env.AWS_REGION || "" } = {}) {
  const name = dev ? "clockout-dev" : "clockout";
  const far = getStore({ name, consistency: "strong", region: FAR });
  const region = nearRegion(aws);
  if (region === FAR) return { store: far, near: far, far, region };
  const near = getStore({ name: `${name}-near`, consistency: "strong", region });
  return { store: split(near, far), near, far, region };
}

const DONE = "sys/moved", LIST = "sys/movelist", CUR = "sys/movecur", LOCK = "sys/moving";

// Every key in the old store except the media, found folder by folder (in parallel, so it's quick).
async function allKeys(far) {
  const top = await far.list({ directories: true });
  const keys = top.blobs.map((b) => b.key);
  const dirs = (top.directories || []).filter((d) => !isMedia(d + "/"));
  const lists = await Promise.all(dirs.map((d) => far.list({ prefix: d + "/" })));
  for (const l of lists) keys.push(...l.blobs.map((b) => b.key));
  return [...new Set(keys)].filter((k) => !isMedia(k) && !k.startsWith("sys/")).sort();
}

// Is the move done? If not, do some of it (about budgetMs of work) and say how far it got.
// Safe to run in several places at once: copying a key twice copies the same thing.
export async function moveStep({ near, far, cache = {}, now = () => Date.now(), budgetMs = 5000, batch = 48, peek = false }) {
  if (near === far || cache.moved) return { done: true };
  if (await near.get(DONE)) { cache.moved = true; return { done: true }; }
  if (peek) return { done: false };
  const t0 = now();
  const lock = await near.get(LOCK, { type: "json" });
  if (lock && lock.until > t0) return { done: false, busy: true }; // someone else is copying right now
  await near.setJSON(LOCK, { until: t0 + budgetMs + 4000 });
  let list = await near.get(LIST, { type: "json" });
  if (!Array.isArray(list)) { list = await allKeys(far); await near.setJSON(LIST, list); }
  const cur = (await near.get(CUR, { type: "json" })) || { i: 0 };
  let i = cur.i, copied = 0;
  while (i < list.length && now() - t0 < budgetMs) {
    const part = list.slice(i, i + batch);
    await Promise.all(part.map(async (k) => {
      const r = await far.getWithMetadata(k, { type: "arrayBuffer" });
      if (r && r.data != null) await near.set(k, r.data, Object.keys(r.metadata || {}).length ? { metadata: r.metadata } : undefined);
    }));
    i += part.length; copied += part.length;
    await near.setJSON(CUR, { i });
  }
  if (i >= list.length) {
    await near.setJSON(DONE, { at: now(), keys: list.length });
    await near.delete(LOCK);
    cache.moved = true;
    return { done: true, copied, total: list.length };
  }
  await near.delete(LOCK);
  return { done: false, copied, at: i, total: list.length };
}
