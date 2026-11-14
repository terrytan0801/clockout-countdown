import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeApp } from "../lib/handler.mjs";
import { openStores, moveStep } from "../lib/stores.mjs";

// Fluff Lv2+ (or a weather station): one rain alert 25-45 minutes before clock-out when rain is 50%+ likely.
// v51: and once a day, holiday planner tips.
export default async () => {
  const { store, near, far } = openStores(getStore); // v54: records next to the functions
  if (!(await moveStep({ near, far, peek: true })).done) return console.log("skipped: the store is still moving"); // the app's own requests do the move
  const app = makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null });
  console.log("rain alerts", JSON.stringify(await app.rainAlerts()));
  console.log("holiday tips", JSON.stringify(await app.holidayTips())); // v51: once a day around 10 am
};

export const config = { schedule: "*/15 * * * *" };
