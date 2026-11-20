// Cave Exchange: the custody bridge (deposit, move to wallet, recovery) against a fake game wallet, on PGlite.
//   node db/test/exchange-wallet.test.mjs      (see pglite.mjs for the one-off install)
import assert from "node:assert/strict";
import { freshDb } from "./pglite.mjs";
import { makeExchange } from "../../netlify/lib/exchange/index.mjs";

const { db, q } = await freshDb();
let t = Date.parse("2026-11-20T02:00:00Z");
// The game wallet: led/<pid>/<id>/<amount>/<why> lines, as in handler.mjs (no folding here).
const lines = new Map();
const game = {
  coins: async (pid) => [...lines.keys()].filter((k) => k.startsWith(`led/${pid}/`)).reduce((n, k) => n + Number(k.split("/")[3]), 0),
  writeLine: async (key) => { lines.set(key, 0); },
  hasLine: async (key) => lines.has(key),
  upto: async () => "",
  credit: async (pid, amt, why) => { lines.set(`led/${pid}/${String(t).padStart(13, "0")}-000000/${amt}/${why}`, 0); },
};
const cex = makeExchange({ db, now: () => t, game });
const ann = { id: "p-aaaaaa", name: "Ann" };
await game.credit(ann.id, 1000, "pay");
const call = (route, body) => cex.handle(ann, route, body ? "POST" : "GET", body);
const recon = async () => { for (const v of ["recon_wallets", "recon_bridge"]) assert.deepEqual(await q(`SELECT * FROM ${v}`), [], v); };

const d1 = await call("wallet/deposit", { amount: 300, key: "dep-00000001" });
assert.equal(d1.status, 200, JSON.stringify(d1.body));
assert.deepEqual([d1.body.wallet, d1.body.cash.available, d1.body.transfer.state], [700, 300, "COMPLETED"], "300 moved: game 700, exchange 300");
const again = await call("wallet/deposit", { amount: 300, key: "dep-00000001" });
assert.deepEqual([again.body.wallet, again.body.cash.available], [700, 300], "a retried deposit moves nothing more");
assert.equal((await call("wallet/deposit", { amount: 5000, key: "dep-00000002" })).status, 422, "can't deposit more than the game wallet has");
assert.equal(await game.coins(ann.id), 700, "a refused deposit takes nothing");
assert.equal((await call("wallet/deposit", { amount: 5000, key: "dep-00000002" })).status, 422, "a failed transfer's key stays failed");
assert.equal((await call("wallet/deposit", { amount: 30, key: "dep-00000001" })).status, 409, "same key, different amount");
await recon();

const w1 = await call("wallet/to-wallet", { amount: 100, key: "wd-00000001" });
assert.deepEqual([w1.body.wallet, w1.body.cash.available, w1.body.transfer.state], [800, 200, "COMPLETED"], "100 back to the game");
assert.deepEqual((await call("wallet/to-wallet", { amount: 100, key: "wd-00000001" })).body.wallet, 800, "a retried move pays once");
assert.equal((await call("wallet/to-wallet", { amount: 201, key: "wd-00000002" })).status, 422, "can't move more than exchange cash");
await recon();

// A deposit whose function stopped after writing the game line: recovery finishes it.
await q(`INSERT INTO bridge_transfers (id, player_id, direction, amount, game_key, updated_at)
  VALUES ('11111111-1111-4111-8111-111111111111', 'p-aaaaaa', 'DEPOSIT', 50, 'led/p-aaaaaa/1795000000000-abcdef/-50/cex.dep.x', now() - interval '5 minutes')`);
lines.set("led/p-aaaaaa/1795000000000-abcdef/-50/cex.dep.x", 0);
// and one that stopped before writing it: recovery fails it, nothing moved
await q(`INSERT INTO bridge_transfers (id, player_id, direction, amount, game_key, updated_at)
  VALUES ('22222222-2222-4222-8222-222222222222', 'p-aaaaaa', 'DEPOSIT', 70, 'led/p-aaaaaa/1795000000001-abcdef/-70/cex.dep.y', now() - interval '5 minutes')`);
t = Date.now(); // recovery compares with the database clock
const j = await cex.jobs();
assert.equal(j.recovered, 2, "both stuck transfers handled");
assert.deepEqual((await q("SELECT state FROM bridge_transfers WHERE id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222') ORDER BY id")).map((r) => r.state), ["COMPLETED", "FAILED"]);
assert.deepEqual([await game.coins(ann.id), (await call("wallet")).body.cash.available], [750, 250], "the finished one counts on both sides, the failed one on neither");
await recon();

console.log("All Cave Exchange wallet checks passed.");
