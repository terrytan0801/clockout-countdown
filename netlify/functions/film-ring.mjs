import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { makeApp } from "../lib/handler.mjs";
import { openStores, moveStep } from "../lib/stores.mjs";

// Cave Calendar: twice a day, at each cave's random times, everyone's phone rings to film 2-4 seconds.
export default async () => {
  const { store, near, far } = openStores(getStore); // v54: records next to the functions
  if (!(await moveStep({ near, far, peek: true })).done) return console.log("skipped: the store is still moving"); // the app's own requests do the move
  const result = await makeApp({ store, webpush, adminKey: process.env.ADMIN_KEY || null }).ringTick();
  console.log("film ring", JSON.stringify(result));
};

export const config = { schedule: "*/5 * * * *" };
