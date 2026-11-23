// Cave Exchange schema checks (Stage B1). Runs the migration on an in-memory PostgreSQL (PGlite) and checks that
// the database itself refuses the things that must never happen. Nothing here touches a real database.
//   npm i --no-save @electric-sql/pglite@0.5.15      (or point PGLITE_TOOL at a folder that has it in node_modules)
//   node db/test/schema.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(process.env.PGLITE_TOOL ? path.join(process.env.PGLITE_TOOL, "x.js") : import.meta.url);
const { PGlite } = await import(pathToFileURL(require.resolve("@electric-sql/pglite")).href);
const db = new PGlite();
const sql = fs.readFileSync(new URL("../../netlify/database/migrations/20261123000000_cex_schema.sql", import.meta.url), "utf8");
await db.exec(sql);
await db.exec("SET search_path = cex");

const q = (text, params) => db.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0];
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
// Runs fn in a transaction; returns the error message if the database refused (at any point, COMMIT included).
async function refused(fn) {
  try { await db.transaction(fn); return null; } catch (e) { return e.message; }
}
const recon = async () => {
  const views = ["recon_shares", "recon_holdings", "recon_wallets", "recon_company_accounts", "recon_reservations", "recon_bridge"];
  const out = {};
  for (const v of views) { const r = (await q(`SELECT * FROM ${v}`)).rows; if (r.length) out[v] = r; }
  return out;
};


/* ---------- players and a deposit over the bridge ---------- */
await q("INSERT INTO players (id, name) VALUES ('p-aaaaaa', 'Ann'), ('p-bbbbbb', 'Ben')");
await q("INSERT INTO wallets (player_id) VALUES ('p-aaaaaa'), ('p-bbbbbb')");
for (const [pid, amt] of [["p-aaaaaa", 1000], ["p-bbbbbb", 500]]) {
  const t = uuid();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO bridge_transfers (id, player_id, direction, amount, state) VALUES ($1, $2, 'DEPOSIT', $3, 'COMPLETED')", [t, pid, amt]);
    await tx.query("UPDATE wallets SET balance = balance + $2 WHERE player_id = $1", [pid, amt]);
    await tx.query("INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, balance_after, kind, ref_type, ref_id) VALUES ($1, 'PLAYER', $2, $3, $3, 'deposit', 'bridge', $4), ($1, 'BRIDGE', 'bridge', -$3, NULL, 'deposit', 'bridge', $4)", [t, pid, amt, t]);
  });
}
assert.deepEqual(await recon(), {}, "a balanced deposit reconciles everywhere");

/* ---------- coins can't be made or lost ---------- */
assert.match(await refused(async (tx) => {
  await tx.query("INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, kind) VALUES ($1, 'PLAYER', 'p-aaaaaa', 5, 'deposit')", [uuid()]);
}), /does not balance/, "a one-sided entry is rolled back at COMMIT");
assert.match(await refused(async (tx) => { await tx.query("UPDATE wallets SET balance = -1 WHERE player_id = 'p-aaaaaa'"); }), /check/i, "no negative balance");
assert.match(await refused(async (tx) => { await tx.query("UPDATE wallets SET reserved = 2000 WHERE player_id = 'p-aaaaaa'"); }), /check/i, "can't reserve more than you have");
assert.match(await refused(async (tx) => { await tx.query("UPDATE coin_ledger SET amount = 999999"); }), /append-only/, "ledger lines can't be changed");
assert.match(await refused(async (tx) => { await tx.query("DELETE FROM coin_ledger"); }), /append-only/, "ledger lines can't be deleted");
assert.match(await refused(async (tx) => { await tx.query("TRUNCATE coin_ledger"); }), /append-only/, "the ledger can't be emptied");

/* ---------- a company and its shares ---------- */
const co = (await one(`INSERT INTO companies (symbol, name, industry, founder_id, authorized_shares, founder_shares, public_shares, ipo_price)
  VALUES ('ANNCO', 'Ann Co', 'Snacks', 'p-aaaaaa', 10000, 6000, 4000, 5) RETURNING id`)).id;
await q("INSERT INTO company_accounts (company_id) VALUES ($1)", [co]);
assert.match(await refused(async (tx) => { await tx.query("UPDATE companies SET status = 'LISTED' WHERE id = $1", [co]); }), /can't go from PENDING to LISTED/, "no listing without approval and an IPO");
await q("UPDATE companies SET status = 'APPROVED', approved_at = now(), approved_by = 'admin' WHERE id = $1", [co]);
await db.transaction(async (tx) => {
  const t = uuid();
  await tx.query("UPDATE companies SET status = 'IPO', issued_shares = 10000 WHERE id = $1", [co]);
  await tx.query("INSERT INTO share_holdings (company_id, holder_type, holder_id, qty) VALUES ($1, 'PLAYER', 'p-aaaaaa', 6000), ($1, 'TREASURY', $2, 4000)", [co, String(co)]);
  await tx.query("INSERT INTO share_ledger (txn_id, company_id, holder_type, holder_id, qty, qty_after, kind) VALUES ($1, $2, 'PLAYER', 'p-aaaaaa', 6000, 6000, 'ipo_issue'), ($1, $2, 'TREASURY', $3, 4000, 4000, 'ipo_issue')", [t, co, String(co)]);
});
assert.deepEqual(await recon(), {}, "issued = founder + treasury");

/* ---------- nobody can just make more shares ---------- */
assert.match(await refused(async (tx) => { await tx.query("UPDATE companies SET status = 'APPROVED' WHERE id = $1", [co]); }), /can't go from IPO to APPROVED/, "an IPO can't be rewound and run again");
assert.match(await refused(async (tx) => {
  await tx.query("UPDATE companies SET issued_shares = issued_shares - 1000 WHERE id = $1", [co]);
  await tx.query("UPDATE companies SET issued_shares = issued_shares + 1000 WHERE id = $1", [co]);
  await tx.query("UPDATE companies SET founder_shares = 0, issued_shares = 9000 WHERE id = $1", [co]);
}), /in its share ledger/, "issued shares can't change without ledger entries");
assert.match(await refused(async (tx) => {
  await tx.query("UPDATE companies SET authorized_shares = 20000, issued_shares = 11000 WHERE id = $1", [co]);
  await tx.query("UPDATE share_holdings SET qty = qty + 1000 WHERE company_id = $1 AND holder_type = 'TREASURY'", [co]);
  await tx.query("INSERT INTO share_ledger (txn_id, company_id, holder_type, holder_id, qty, qty_after, kind) VALUES ($1, $2, 'TREASURY', $3, 1000, 5000, 'ipo_issue')", [uuid(), co, String(co)]);
}), /duplicate key/, "the IPO issues shares only once");

// an IPO allotment: Ben buys 100 at 5 from the treasury; coins go to the company, shares to Ben
await db.transaction(async (tx) => {
  const t = uuid();
  await tx.query("UPDATE wallets SET balance = balance - 500 WHERE player_id = 'p-bbbbbb'");
  await tx.query("UPDATE company_accounts SET balance = balance + 500 WHERE company_id = $1", [co]);
  await tx.query("INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, balance_after, kind) VALUES ($1, 'PLAYER', 'p-bbbbbb', -500, 0, 'ipo_buy'), ($1, 'COMPANY', $2, 500, 500, 'ipo_proceeds')", [t, String(co)]);
  await tx.query("UPDATE share_holdings SET qty = qty - 100 WHERE company_id = $1 AND holder_type = 'TREASURY'", [co]);
  await tx.query("INSERT INTO share_holdings (company_id, holder_type, holder_id, qty) VALUES ($1, 'PLAYER', 'p-bbbbbb', 100)", [co]);
  await tx.query("INSERT INTO share_ledger (txn_id, company_id, holder_type, holder_id, qty, qty_after, kind) VALUES ($1, $2, 'TREASURY', $3, -100, 3900, 'ipo_buy'), ($1, $2, 'PLAYER', 'p-bbbbbb', 100, 100, 'ipo_buy')", [t, co, String(co)]);
  await tx.query("INSERT INTO trades (company_id, buyer_id, seller_type, seller_id, price, qty, txn_id) VALUES ($1, 'p-bbbbbb', 'TREASURY', $2, 5, 100, $3)", [co, String(co), t]);
});
assert.deepEqual(await recon(), {}, "an IPO allotment keeps every total in step");
assert.equal((await one("SELECT value FROM trades")).value, 500, "trade value = price * qty");

/* ---------- shares can't be made or lost by trading ---------- */
assert.match(await refused(async (tx) => {
  await tx.query("INSERT INTO share_ledger (txn_id, company_id, holder_type, holder_id, qty, qty_after, kind) VALUES ($1, $2, 'PLAYER', 'p-bbbbbb', 50, 150, 'trade_buy')", [uuid(), co]);
}), /out of nowhere/, "a one-sided share move is rolled back");
assert.match(await refused(async (tx) => { await tx.query("UPDATE share_holdings SET qty = -1 WHERE holder_id = 'p-bbbbbb'"); }), /check/i, "no negative holding");
assert.match(await refused(async (tx) => { await tx.query("UPDATE share_holdings SET reserved = 101 WHERE holder_id = 'p-bbbbbb'"); }), /check/i, "can't reserve more shares than held");

/* ---------- orders and trades ---------- */
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO orders (company_id, player_id, side, type, qty) VALUES ($1, 'p-aaaaaa', 'SELL', 'LIMIT', 10)", [co]); }), /check/i, "a limit order needs a price");
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO orders (company_id, player_id, side, type, limit_price, qty) VALUES ($1, 'p-aaaaaa', 'BUY', 'MARKET', 5, 10)", [co]); }), /check/i, "a market order has no price");
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO orders (company_id, player_id, side, type, limit_price, qty, status, filled_qty) VALUES ($1, 'p-aaaaaa', 'SELL', 'LIMIT', 6, 10, 'FILLED', 3)", [co]); }), /check/i, "FILLED means fully filled");
const o1 = (await one("INSERT INTO orders (company_id, player_id, side, type, limit_price, qty, idempotency_key) VALUES ($1, 'p-aaaaaa', 'SELL', 'LIMIT', 6, 10, 'key-00000001') RETURNING id", [co])).id;
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO orders (company_id, player_id, side, type, limit_price, qty, idempotency_key) VALUES ($1, 'p-aaaaaa', 'SELL', 'LIMIT', 6, 10, 'key-00000001')", [co]); }), /duplicate key/, "the same order key can't be used twice");
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO trades (company_id, buyer_id, seller_type, seller_id, price, qty, txn_id) VALUES ($1, 'p-aaaaaa', 'PLAYER', 'p-aaaaaa', 6, 1, $2)", [co, uuid()]); }), /check/i, "nobody trades with themselves");
assert.match(await refused(async (tx) => { await tx.query("UPDATE trades SET price = 1"); }), /append-only/, "trades can't be changed");

/* ---------- reservations ---------- */
await db.transaction(async (tx) => {
  await tx.query("INSERT INTO reservations (order_id, kind, player_id, company_id, amount, remaining) VALUES ($1, 'SHARES', 'p-aaaaaa', $2, 10, 10)", [o1, co]);
  await tx.query("UPDATE share_holdings SET reserved = 10 WHERE company_id = $1 AND holder_id = 'p-aaaaaa'", [co]);
});
assert.deepEqual(await recon(), {}, "reserved shares = active reservations");
assert.match(await refused(async (tx) => { await tx.query("UPDATE reservations SET status = 'RELEASED' WHERE order_id = $1", [o1]); }), /check/i, "a released reservation must hold nothing");

/* ---------- companies ---------- */
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO companies (symbol, name, industry, founder_id, authorized_shares, founder_shares, public_shares, ipo_price) VALUES ('bad', 'Lower Co', 'Snacks', 'p-aaaaaa', 100, 50, 50, 1)"); }), /check/i, "symbols are capitals");
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO companies (symbol, name, industry, founder_id, authorized_shares, founder_shares, public_shares, ipo_price) VALUES ('ANN2', 'ann co', 'Snacks', 'p-aaaaaa', 100, 50, 50, 1)"); }), /duplicate key/, "company names are unique, any case");
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO companies (symbol, name, industry, founder_id, authorized_shares, founder_shares, public_shares, ipo_price) VALUES ('BIG', 'Big Co', 'Snacks', 'p-aaaaaa', 100, 80, 50, 1)"); }), /check/i, "can't plan more shares than authorized");

/* ---------- settings ---------- */
const st = await one("SELECT * FROM settings");
assert.deepEqual([st.fee_buyer_bps, st.fee_seller_bps, Number(st.min_fee), Number(st.min_order_value)], [25, 25, 1, 10], "default fees 0.25% each side, min fee 1, min order 10");
assert.match(await refused(async (tx) => { await tx.query("INSERT INTO settings DEFAULT VALUES"); }), /duplicate key/, "there is one settings row");
assert.match(await refused(async (tx) => { await tx.query("UPDATE settings SET fee_buyer_bps = 1000"); }), /check/i, "fees are capped at 5%");

/* ---------- the reconciliation views catch drift ---------- */
await q("UPDATE wallets SET balance = balance + 1 WHERE player_id = 'p-aaaaaa'"); // a wallet changed without a ledger entry
assert.deepEqual(Object.keys(await recon()), ["recon_wallets"], "a wallet out of step with its ledger shows up");
await q("UPDATE wallets SET balance = balance - 1 WHERE player_id = 'p-aaaaaa'");
await q("UPDATE share_holdings SET qty = qty - 5 WHERE company_id = $1 AND holder_type = 'TREASURY'", [co]); // a holding changed without a ledger entry
assert.deepEqual(Object.keys(await recon()), ["recon_shares", "recon_holdings"], "holdings out of step with issued shares and the ledger show up");
await q("UPDATE share_holdings SET qty = qty + 5 WHERE company_id = $1 AND holder_type = 'TREASURY'", [co]);
assert.deepEqual(await recon(), {}, "back in step");

console.log("All Cave Exchange schema checks passed.");
