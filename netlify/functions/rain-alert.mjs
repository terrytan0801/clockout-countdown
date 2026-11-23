import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeApp } from "../lib/handler.mjs";
import { openStores, moveStep } from "../lib/stores.mjs";
import { cexDb } from "../lib/cexdb.mjs";

// Fluff Lv2+ (or a weather station): one rain alert 25-45 minutes before clock-out when rain is 50%+ likely.
// v51: and once a day, holiday planner tips. v79: and everyone's wage at their clock-out time.
export default async () => {
  const { store, near, far } = openStores(getStore); // v54: records next to the functions
  if (!(await moveStep({ near, far, peek: true })).done) return console.log("skipped: the store is still moving"); // the app's own requests do the move
  // Scheduled functions only run on the real site, so the exchange's daily jobs only run once CEX_LIVE=1 is set.
  const app = makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null, cexDb: process.env.CEX_LIVE === "1" ? cexDb() : null });
  console.log("payday", JSON.stringify(await app.payday())); // v79: wages at clock-out, without opening the app
  console.log("rain alerts", JSON.stringify(await app.rainAlerts()));
  console.log("holiday tips", JSON.stringify(await app.holidayTips())); // v51: once a day around 10 am
};

export const config = { schedule: "*/15 * * * *" };
