// In-memory stand-in for a Netlify Blobs store (only the calls the API uses).
// Like the installed @netlify/blobs 8.2.0, writes ignore onlyIfNew and return nothing,
// so the tests catch code that relies on it. memStore({ onlyIfNew: true }) acts like newer versions.
export function memStore({ onlyIfNew = false } = {}) {
  const m = new Map(), meta = new Map();
  return {
    async get(k, o) { if (!m.has(k)) return null; return o?.type === "json" ? JSON.parse(m.get(k)) : m.get(k); },
    async getMetadata(k) { return m.has(k) ? { etag: "x", metadata: meta.get(k) || {} } : null; },
    async getWithMetadata(k) { return m.has(k) ? { data: m.get(k), etag: "x", metadata: meta.get(k) || {} } : null; },
    async set(k, v, o) { if (onlyIfNew && o?.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, v); meta.set(k, o?.metadata || {}); return onlyIfNew ? { modified: true } : undefined; },
    async setJSON(k, v, o) { if (onlyIfNew && o?.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); meta.delete(k); return onlyIfNew ? { modified: true } : undefined; },
    async delete(k) { m.delete(k); meta.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key, etag: "x" })) }; },
    _m: m,
  };
}
