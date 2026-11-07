// Local preview: serves public/ and runs the API against an in-memory store (no real push).
// node test/dev-server.mjs [port]      SHIFT_MS=<ms> shifts the server clock for testing
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { makeHandler } from "../netlify/lib/handler.mjs";
import { memStore } from "./mem-store.mjs";

const webpush = {
  generateVAPIDKeys: () => ({ publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", privateKey: "x" }),
  async sendNotification(sub, payload) { console.log("[push]", sub.endpoint, payload); },
};
const handle = makeHandler({ store: memStore(), webpush, now: () => Date.now() + Number(process.env.SHIFT_MS || 0) });
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const root = new URL("../public/", import.meta.url).pathname;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text()); return;
  }
  const p = normalize(join(root, url.pathname === "/" ? "index.html" : url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try { const b = await readFile(p); res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(Number(process.argv[2] || 8888), () => console.log("http://localhost:" + (process.argv[2] || 8888)));
