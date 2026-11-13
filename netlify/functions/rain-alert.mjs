import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeApp } from "../lib/handler.mjs";

// Fluff Lv2+ (or a weather station): one rain alert 25-45 minutes before clock-out when rain is 50%+ likely.
// v51: and once a day, holiday planner tips.
export default async () => {
  const store = getStore({ name: "clockout", consistency: "strong", region: "ap-southeast-1" });
  const app = makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null });
  console.log("rain alerts", JSON.stringify(await app.rainAlerts()));
  console.log("holiday tips", JSON.stringify(await app.holidayTips())); // v51: once a day around 10 am
};

export const config = { schedule: "*/15 * * * *" };
