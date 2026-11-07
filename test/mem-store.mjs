// In-memory stand-in for a Netlify Blobs store (only the calls the API uses).
export function memStore() {
  const m = new Map();
  return {
    async get(k, o) { if (!m.has(k)) return null; return o?.type === "json" ? JSON.parse(m.get(k)) : m.get(k); },
    async getMetadata(k) { return m.has(k) ? { etag: "x", metadata: {} } : null; },
    async setJSON(k, v, o) { if (o?.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key, etag: "x" })) }; },
    _m: m,
  };
}
