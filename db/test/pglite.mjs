// A fresh in-memory PostgreSQL (PGlite) with the Cave Exchange migrations applied, and the { tx } adapter the
// exchange modules expect. For tests only.
//   npm i --no-save @electric-sql/pglite@0.5.15      (or point PGLITE_TOOL at a folder that has it in node_modules)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(process.env.PGLITE_TOOL ? path.join(process.env.PGLITE_TOOL, "x.js") : import.meta.url);
const { PGlite } = await import(pathToFileURL(require.resolve("@electric-sql/pglite")).href);

export async function freshDb() {
  const pg = new PGlite({ parsers: { 20: Number } }); // BIGINT as JS numbers (all amounts stay far below 2^53)
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await pg.exec(fs.readFileSync(new URL(f, dir), "utf8"));
  const db = {
    tx: (fn) => pg.transaction(async (t) => {
      await t.query("SET LOCAL search_path = cex");
      return fn(async (text, params) => (await t.query(text, params)).rows);
    }),
  };
  return { pg, db, q: (text, params) => db.tx((q) => q(text, params)) };
}
