import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeApp } from "../lib/handler.mjs";

// Cave Calendar: once a day, at each cave's random time, everyone's phone rings to film 5 seconds.
export default async () => {
  const store = getStore({ name: "clockout", consistency: "strong", region: "ap-southeast-1" });
  const result = await makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null }).ringTick();
  console.log("film ring", JSON.stringify(result));
};

export const config = { schedule: "*/5 * * * *" };
