// Cave Exchange B4: companies and the IPO, through the exchange's own routes, on an in-memory PostgreSQL (PGlite).
//   node db/test/exchange-ipo.test.mjs      (see pglite.mjs for the one-off install)
import assert from "node:assert/strict";
import { freshDb } from "./pglite.mjs";
import { makeExchange } from "../../netlify/lib/exchange/index.mjs";

const { db, q } = await freshDb();
let t = Date.parse("2026-11-19T02:00:00Z");
const cex = makeExchange({ db, now: () => t });
const ann = { id: "p-aaaaaa", name: "Ann", cave: "c-1" }, ben = { id: "p-bbbbbb", name: "Ben", cave: "c-1" }, cat = { id: "p-cccccc", name: "Cat", cave: "c-1" };
let k = 0;
const key = () => `key-${String(++k).padStart(8, "0")}`;
const call = (me, route, method = "GET", body, query) => cex.handle(me, route, method, body, query);
const ok = async (p, what) => { const r = await p; assert.equal(r.status, 200, `${what}: ${JSON.stringify(r.body)}`); return r.body; };
const err = async (p, status, re, what) => { const r = await p; assert.equal(r.status, status, `${what}: ${JSON.stringify(r.body)}`); assert.match(r.body.error, re, what); };
const recon = async () => {
  const out = {};
  for (const v of ["recon_shares", "recon_holdings", "recon_wallets", "recon_company_accounts", "recon_reservations", "recon_bridge"]) {
    const r = await q(`SELECT * FROM ${v}`); if (r.length) out[v] = r;
  }
  return out;
};
// Exchange cash over the bridge (the bridge code is a later step; this books what a completed deposit books).
let dn = 0;
async function deposit(me, amt) {
  await db.tx(async (x) => {
    const id = `00000000-0000-4000-8000-${String(++dn).padStart(12, "0")}`;
    await x("INSERT INTO players (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [me.id, me.name]);
    await x("INSERT INTO wallets (player_id) VALUES ($1) ON CONFLICT DO NOTHING", [me.id]);
    await x("INSERT INTO bridge_transfers (id, player_id, direction, amount, state) VALUES ($1, $2, 'DEPOSIT', $3, 'COMPLETED')", [id, me.id, amt]);
    const [w] = await x("UPDATE wallets SET balance = balance + $2 WHERE player_id = $1 RETURNING balance", [me.id, amt]);
    await x(`INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, balance_after, kind) VALUES
      ($1, 'PLAYER', $2, $3, $4, 'deposit'), ($1, 'BRIDGE', 'bridge', -$3, NULL, 'deposit')`, [id, me.id, amt, w.balance]);
  });
}

const form = { name: "Ann's Snacks", symbol: "snak", industry: "Food", description: "Chips after work.", authorizedShares: 10000, founderShares: 6000, publicShares: 1000, ipoPrice: 5 };

/* ---------- 1. company creation ---------- */
const created = await ok(call(ann, "company/create", "POST", { ...form, key: key() }), "create");
assert.equal(created.company.symbol, "SNAK", "symbols are stored in capitals");
assert.equal(created.company.status, "PENDING");
assert.equal(created.company.issuedShares, 0, "nothing is issued before the IPO");
const sid = created.company.id;

/* ---------- validation ---------- */
await err(call(ben, "company/create", "POST", { ...form, symbol: "1AB", name: "Other", key: key() }), 400, /symbol/, "a symbol starts with a letter");
await err(call(ben, "company/create", "POST", { ...form, symbol: "BEN", name: "Other", founderShares: 9500, key: key() }), 400, /add up/, "founder + public within authorized");
await err(call(ben, "company/create", "POST", { ...form, symbol: "BEN", name: "Other", ipoPrice: 2.5, key: key() }), 400, /whole number/, "no fractional prices");
await err(call(ben, "company/create", "POST", { ...form, symbol: "BEN", name: "Other", publicShares: "100", key: key() }), 400, /whole number/, "numbers must be numbers");
await err(call(ben, "company/create", "POST", { ...form, symbol: "BEN", name: "Other" }), 400, /key/, "money/creation routes need a request key");

/* ---------- 2. duplicate symbols and names ---------- */
await err(call(ben, "company/create", "POST", { ...form, name: "Ben Co", key: key() }), 409, /symbol SNAK is taken/, "duplicate symbol");
await err(call(ben, "company/create", "POST", { ...form, symbol: "BEN", name: "ANN'S SNACKS", key: key() }), 409, /name already exists/, "duplicate name, any case");
await err(call(ann, "company/create", "POST", { ...form, symbol: "ANN2", name: "Ann Two", key: key() }), 409, /already have a company/, "one live company per founder");

/* ---------- duplicate requests ---------- */
const kb = key();
const ben1 = await ok(call(ben, "company/create", "POST", { ...form, symbol: "BEN", name: "Ben Co", key: kb }), "Ben creates");
const ben2 = await ok(call(ben, "company/create", "POST", { ...form, symbol: "BEN", name: "Ben Co", key: kb }), "Ben's retry");
assert.deepEqual(ben2, ben1, "a retry gets the first answer");
assert.equal((await q("SELECT count(*)::int AS n FROM companies WHERE founder_id = 'p-bbbbbb'"))[0].n, 1, "and creates nothing new");
await err(call(ben, "company/create", "POST", { ...form, symbol: "BEN2", name: "Ben Two", key: kb }), 409, /already used/, "same key, different request");

/* ---------- editing, submitting, visibility ---------- */
await ok(call(ann, `company/${sid}/edit`, "POST", { ...form, publicShares: 2000 }), "edit before submitting");
await err(call(ben, `company/SNAK/edit`, "POST", form), 403, /founder/, "only the founder edits");
await err(call(ben, "company/SNAK"), 404, /No such/, "a pending company is hidden from others");
assert.equal((await ok(call(ann, "company/SNAK"), "founder sees it")).company.publicShares, 2000);
await err(call(ann, `company/${sid}/ipo`, "POST"), 409, /approve/, "no IPO before approval");
await err(cex.admin("company/approve", "POST", { id: sid, approve: true }).then((r) => r), 409, /waiting for approval/, "the admin only sees submitted companies");
await ok(call(ann, "company/SNAK/submit", "POST"), "submit");
await ok(call(ann, "company/SNAK/submit", "POST"), "submitting twice is harmless");
await err(call(ann, `company/${sid}/edit`, "POST", form), 409, /already been sent/, "no edits after submitting");
const pending = await ok(cex.admin("companies", "GET", {}, {}), "admin list");
assert.deepEqual(pending.items.map((c) => [c.symbol, c.founderName]), [["SNAK", "Ann"]], "the admin sees submitted companies only");

/* ---------- 3. IPO approval ---------- */
await ok(cex.admin("company/approve", "POST", { id: "SNAK", approve: true, note: "looks fine" }), "approve");
await err(cex.admin("company/approve", "POST", { id: "SNAK", approve: true }), 409, /waiting/, "approve once");
await err(call(ben, "company/SNAK/ipo", "POST"), 403, /founder/, "only the founder starts the IPO");
const started = await ok(call(ann, "company/SNAK/ipo", "POST"), "start IPO");
assert.equal(started.company.status, "IPO");
assert.equal(started.company.issuedShares, 8000, "founder 6000 + public 2000 issued");
assert.deepEqual(await ok(call(ann, "company/SNAK/ipo", "POST"), "start again"), started, "starting again changes nothing");

/* ---------- 4. IPO share allocation ---------- */
const holdings = await q("SELECT holder_type, holder_id, qty FROM share_holdings WHERE company_id = $1 ORDER BY holder_type", [sid]);
assert.deepEqual(holdings, [{ holder_type: "PLAYER", holder_id: "p-aaaaaa", qty: 6000 }, { holder_type: "TREASURY", holder_id: String(sid), qty: 2000 }], "founder and treasury hold the issue");
assert.deepEqual(await recon(), {}, "issued = holdings = ledger");

await err(call(ben, "company/SNAK/ipo/buy", "POST", { qty: 100, key: key() }), 422, /costs 500.*have 0/, "insufficient funds");
await deposit(ben, 3000);
await deposit(cat, 12000);
const kbuy = key();
const b1 = await ok(call(ben, "company/SNAK/ipo/buy", "POST", { qty: 100, key: kbuy }), "Ben buys 100");
assert.deepEqual([b1.cash.available, b1.holding.qty, b1.left], [2500, 100, 1900], "coins out, shares in");
assert.deepEqual(await ok(call(ben, "company/SNAK/ipo/buy", "POST", { qty: 100, key: kbuy }), "replay"), b1, "a replayed buy gets the first answer");
assert.equal((await q("SELECT qty FROM share_holdings WHERE holder_id = 'p-bbbbbb'"))[0].qty, 100, "and buys nothing more");
await err(call(cat, "company/SNAK/ipo/buy", "POST", { qty: 2000, key: key() }), 422, /Only 1900/, "can't buy more than is left");
await err(call(cat, "company/SNAK/ipo/buy", "POST", { qty: 0, key: key() }), 400, /whole number/, "at least one share");
assert.equal((await q("SELECT balance FROM company_accounts WHERE company_id = $1", [sid]))[0].balance, 500, "the company got Ben's coins");
assert.deepEqual(await recon(), {}, "everything reconciles after a buy");

const last = await ok(call(cat, "company/SNAK/ipo/buy", "POST", { qty: 1900, key: key() }), "Cat buys the rest");
assert.equal(last.left, 0);
const listed = (await ok(call(cat, "company/SNAK"), "after sell-out")).company;
assert.deepEqual([listed.status, listed.lastPrice, listed.marketValue], ["LISTED", 5, 40000], "sold out: listed at the IPO price");
await err(call(ben, "company/SNAK/ipo/buy", "POST", { qty: 1, key: key() }), 409, /isn't open/, "no IPO buys once listed");
const [day] = await q("SELECT open, high, low, close, volume, trade_count FROM candles WHERE company_id = $1 AND span = '1d'", [sid]);
assert.deepEqual(day, { open: 5, high: 5, low: 5, close: 5, volume: 2000, trade_count: 2 }, "the day candle counts both IPO buys");
assert.deepEqual(await recon(), {}, "everything reconciles after sell-out");

/* ---------- an IPO that runs out of time ---------- */
await ok(call(ben, "company/BEN/submit", "POST"), "Ben submits");
await ok(cex.admin("company/approve", "POST", { id: "BEN", approve: true }), "approved");
await ok(call(ben, "company/BEN/ipo", "POST"), "Ben's IPO");
await ok(call(cat, "company/BEN/ipo/buy", "POST", { qty: 10, key: key() }), "Cat buys 10");
t += 25 * 3600e3;
await err(call(cat, "company/BEN/ipo/buy", "POST", { qty: 10, key: key() }), 409, /isn't open/, "after 24 hours the IPO is closed");
const listedNow = await ok(call(cat, "company/list"), "market list");
assert.deepEqual(listedNow.items.map((c) => [c.symbol, c.status]), [["BEN", "LISTED"], ["SNAK", "LISTED"]], "both listed; unsold shares stay in the treasury");
assert.equal((await q("SELECT qty FROM share_holdings WHERE company_id = $1 AND holder_type = 'TREASURY'", [ben1.company.id]))[0].qty, 990);
assert.equal((await ok(call(cat, "company/list", "GET", undefined, { q: "sna" }), "search")).items.length, 1, "search by name");

/* ---------- rejection and frozen players ---------- */
await ok(call(cat, "company/create", "POST", { ...form, symbol: "CAT", name: "Cat Co", key: key() }), "Cat creates");
await ok(call(cat, "company/CAT/submit", "POST"), "Cat submits");
assert.equal((await ok(cex.admin("company/approve", "POST", { id: "CAT", approve: false, note: "no" }), "reject")).company.status, "REJECTED");
await err(call(cat, "company/CAT/ipo", "POST"), 409, /approve/, "no IPO for a rejected company");
await q("UPDATE players SET frozen = true WHERE id = 'p-cccccc'");
await err(call(cat, "company/create", "POST", { ...form, symbol: "CAT2", name: "Cat Two", key: key() }), 403, /paused/, "a frozen player can't create companies");
await err(call(cat, "company/nope/x", "POST"), 404, /route/, "unknown routes");

/* ---------- audit ---------- */
const actions = (await q("SELECT action FROM audit_logs ORDER BY id")).map((r) => r.action);
for (const a of ["company.create", "company.submit", "company.approve", "ipo.start", "ipo.buy", "ipo.close", "company.reject"]) assert.ok(actions.includes(a), `audited: ${a}`);

console.log("All Cave Exchange IPO checks passed.");
