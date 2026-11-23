// Cave Exchange: the connection to Netlify Database (Neon), as the { tx(fn) } adapter netlify/lib/exchange expects.
// One pool per function instance (made on first use, never per request). Returns null when this deploy has no
// database (no NETLIFY_DB_URL), so the exchange simply stays switched off.
import pg from "pg";
import { getDatabase } from "@netlify/database";

// BIGINT (oid 20) as JS numbers: coins and shares stay far below 2^53.
const types = { getTypeParser: (oid, format) => (oid === 20 ? Number : pg.types.getTypeParser(oid, format)) };
let db;

export function cexDb() {
  if (db !== undefined) return db;
  let pool;
  try { pool = getDatabase().pool; } catch { return (db = null); } // no database on this deploy
  db = {
    // fn(q) runs inside one transaction; q(text, params) returns rows. Anything thrown rolls it all back.
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SET LOCAL search_path = cex");
        const out = await fn(async (text, values) => (await c.query({ text, values, types })).rows);
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
  return db;
}
