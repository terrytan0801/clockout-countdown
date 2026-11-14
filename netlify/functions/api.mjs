import { getStore } from "@netlify/blobs";
import { purgeCache } from "@netlify/functions";
import webpush from "web-push";
import { makeApp, isDevDeploy } from "../lib/handler.mjs";
import { openStores, moveStep } from "../lib/stores.mjs";

// What a warm server remembers between requests (sessions, keys), kept apart for the real site and the test site.
const caches = { live: {}, dev: {} };

// Fetch a new clip's link once through the CDN, so it's kept there before the cave opens it.
const warm = async (url) => { const r = await fetch(url); await r.arrayBuffer(); };

export default async (req, context) => {
  // The test site (dev--<site>.netlify.app) has its own store, so testing never touches the real caves.
  const dev = isDevDeploy(req, context);
  // v54: records next to the functions, videos still in Singapore (see stores.mjs).
  const { store, near, far } = openStores(getStore, { dev });
  const cache = caches[dev ? "dev" : "live"];
  // The first requests after v54 move the records across; until that's done, phones wait and retry.
  if (!cache.moved) {
    const m = await moveStep({ near, far, cache });
    if (!m.done) {
      console.log("moving", JSON.stringify(m));
      return Response.json({ error: "Moving your cave to a faster server. One moment…", moving: true, retryMs: m.busy ? 2500 : 600 }, { status: 503, headers: { "cache-control": "no-store", "retry-after": "2" } });
    }
  }
  return makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null, dev, cache, region: process.env.AWS_REGION || null, purge: (tags) => purgeCache({ tags }), warm }).handle(req, context);
};

// No region here: choosing the functions' region needs Netlify Pro, and on other plans the deploy fails.
export const config = { path: "/api/*" };
