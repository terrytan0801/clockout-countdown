import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeApp } from "../lib/handler.mjs";

// Fluff Lv2+: one rain alert 25-45 minutes before clock-out when rain is 50%+ likely.
export default async () => {
  const store = getStore({ name: "clockout", consistency: "strong", region: "ap-southeast-1" });
  const result = await makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null }).rainAlerts();
  console.log("rain alerts", JSON.stringify(result));
};

export const config = { schedule: "*/15 * * * *", region: "sin" };
