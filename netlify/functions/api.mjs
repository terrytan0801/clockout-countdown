import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeHandler } from "../lib/handler.mjs";

export default async (req) => {
  // Site-wide store, pinned to Singapore. The region must be passed on every getStore call.
  const store = getStore({ name: "clockout", consistency: "strong", region: "ap-southeast-1" });
  return makeHandler({ store, webpush, adminKey: process.env.ADMIN_KEY || null })(req);
};

export const config = { path: "/api/*" };
