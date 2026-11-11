// In-memory stand-in for a Netlify Blobs store (only the calls the API uses).
// Like the installed @netlify/blobs 8.2.0, writes ignore onlyIfNew and return nothing,
// so the tests catch code that relies on it. memStore({ onlyIfNew: true }) acts like newer versions.
export function memStore({ onlyIfNew = false } = {}) {
  const m = new Map(), meta = new Map(), tags = new Map(), ops = { read: 0, list: 0, write: 0 };
  let n = 0;
  const tag = (k) => tags.set(k, "e" + (++n)); // a new etag on every write, like the real store
  const api = {
    async get(k, o) { ops.read++; if (!m.has(k)) return null; return o?.type === "json" ? JSON.parse(m.get(k)) : m.get(k); },
    async getMetadata(k) { ops.read++; return m.has(k) ? { etag: tags.get(k), metadata: meta.get(k) || {} } : null; },
    async getWithMetadata(k) { ops.read++; return m.has(k) ? { data: m.get(k), etag: tags.get(k), metadata: meta.get(k) || {} } : null; },
    async set(k, v, o) { if (onlyIfNew && o?.onlyIfNew && m.has(k)) return { modified: false }; ops.write++; m.set(k, v); tag(k); meta.set(k, o?.metadata || {}); return onlyIfNew ? { modified: true } : undefined; },
    async setJSON(k, v, o) { if (onlyIfNew && o?.onlyIfNew && m.has(k)) return { modified: false }; ops.write++; m.set(k, JSON.stringify(v)); tag(k); meta.delete(k); return onlyIfNew ? { modified: true } : undefined; },
    async delete(k) { ops.write++; m.delete(k); meta.delete(k); tags.delete(k); },
    async list({ prefix = "" } = {}) { ops.list++; return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key, etag: tags.get(key) })) }; },
    _m: m, _ops: ops,
  };
  return api;
}
