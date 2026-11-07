// Made-up demo data for the local preview server only (SEED=1 node test/dev-server.mjs).
import { scryptSync } from "node:crypto";
import { sgDayOf } from "../netlify/lib/stats.mjs";

export async function seed(store) {
  const salt = "seed", hash = scryptSync("1234", salt, 32).toString("hex");
  const now = Date.now();
  const cave = { id: "c-demo", name: "Monster Cave", owner: "p-terry", code: "DEMO23", at: now - 40 * 864e5 };
  await store.setJSON("meta/v9", { at: now });
  await store.setJSON(`cave/${cave.id}`, cave); await store.setJSON(`code/${cave.code}`, cave.id);
  const ppl = [
    ["p-terry", "Terry", "orange", 0, 17, 0, 1.0], ["p-sukee", "Sukee", "violet", 2, 17, 30, 0.9], ["p-shunyi", "Shunyi", "teal", 5, 18, 0, 0.7],
    ["p-winnie", "Winnie", "pink", 8, 16, 30, 0.5], ["p-lily", "Lily", "gold", 7, 18, 30, 0.25],
  ];
  let seedN = 7; const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  for (const [id, name, color, monster, h, m, act] of ppl) {
    await store.setJSON(`person/${id}`, { id, name, h, m, color, monster, buzz: id !== "p-lily", cave: cave.id, at: now - 35 * 864e5 + rnd() * 5 * 864e5, salt, hash });
    await store.setJSON(`uname/${name.toLowerCase()}`, id);
    await store.setJSON(`member/${cave.id}/${id}`, { at: now - 30 * 864e5 });
    await store.setJSON(`ev/signup/${String(Math.floor(now - 33 * 864e5 + rnd() * 864e5)).padStart(13, "0")}_${id}`, 0);
    for (let d = 29; d >= 0; d--) {
      const day = new Date(now - d * 864e5); const dow = new Date(day.getTime() + 8 * 3600e3).getUTCDay();
      if (rnd() > act * (dow === 0 || dow === 6 ? 0.4 : 1)) continue;
      const last = now - d * 864e5 - (d === 0 ? rnd() * 3 * 3600e3 : rnd() * 6 * 3600e3);
      await store.setJSON(`use/${sgDayOf(last)}/${id}`, { opens: 1 + (rnd() * 6 | 0), seconds: (60 + rnd() * 1800) | 0, first: last - 3600e3, last });
      for (let z = 0; z < (rnd() * 3 | 0); z++) {
        const to = ppl[(rnd() * ppl.length) | 0][0]; if (to === id) continue;
        const r = ["b", "b", "b", "q", "n"][(rnd() * 5) | 0];
        await store.setJSON(`ev/zap/${String(Math.floor(last - rnd() * 3600e3)).padStart(13, "0")}_${id}_${to}_${r}`, 0);
      }
      for (let k = 0; k < (rnd() * 4 | 0); k++) await store.setJSON(`ev/msg/${String(Math.floor(last - rnd() * 3600e3)).padStart(13, "0")}_${id}_${cave.id}`, 0);
    }
  }
  console.log("seeded demo data");
}
