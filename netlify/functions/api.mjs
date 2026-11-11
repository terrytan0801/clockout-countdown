import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeApp, isDevDeploy } from "../lib/handler.mjs";

// What a warm server remembers between requests (sessions, keys), kept apart for the real site and the test site.
const caches = { live: {}, dev: {} };

export default async (req, context) => {
  // The test site (dev--<site>.netlify.app) has its own store, so testing never touches the real caves.
  const dev = isDevDeploy(req, context);
  // Site-wide store, pinned to Singapore. The region must be passed on every getStore call.
  const store = getStore({ name: dev ? "clockout-dev" : "clockout", consistency: "strong", region: "ap-southeast-1" });
  return makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null, dev, cache: caches[dev ? "dev" : "live"], region: process.env.AWS_REGION || null }).handle(req, context);
};

// Run next to the data (Singapore) so each read doesn't cross the Pacific. Ignored on plans without region selection.
export const config = { path: "/api/*", region: "sin" };
