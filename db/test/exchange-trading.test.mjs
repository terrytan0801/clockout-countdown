// Cave Exchange B5: orders and matching, through the exchange's routes, on an in-memory PostgreSQL (PGlite).
//   node db/test/exchange-trading.test.mjs      (see pglite.mjs for the one-off install)
import assert from "node:assert/strict";
import { freshDb } from "./pglite.mjs";
import { makeExchange } from "../../netlify/lib/exchange/index.mjs";

const { db, q } = await freshDb();
let t = Date.parse("2026-11-20T02:00:00Z");
const cex = makeExchange({ db, now: () => t });
const P = (id, name) => ({ id: `p-${id.repeat(6)}`, name, cave: "c-1" });
const ann = P("a", "Ann"), ben = P("b", "Ben"), cat = P("c", "Cat"), dan = P("d", "Dan"), eve = P("e", "Eve"), fay = P("f", "Fay");
let k = 0;
const key = () => `key-${String(++k).padStart(8, "0")}`;
const call = (me, route, method = "GET", body, query) => cex.handle(me, route, method, body, query);
const ok = async (p, what) => { const r = await p; assert.equal(r.status, 200, `${what}: ${JSON.stringify(r.body)}`); return r.body; };
const err = async (p, status, re, what) => { const r = await p; assert.equal(r.status, status, `${what}: ${JSON.stringify(r.body)}`); assert.match(r.body.error, re, what); };
const order = (me, body) => call(me, "order/place", "POST", { symbol: "ANN", key: key(), ...body });
const cash = async (me) => (await q("SELECT balance, reserved FROM wallets WHERE player_id = $1", [me.id]))[0];
const shares = async (me) => (await q("SELECT qty, reserved FROM share_holdings WHERE holder_type = 'PLAYER' AND holder_id = $1", [me.id]))[0] || { qty: 0, reserved: 0 };
const recon = async (what) => {
  for (const v of ["recon_shares", "recon_holdings", "recon_wallets", "recon_company_accounts", "recon_reservations", "recon_bridge"]) {
    assert.deepEqual(await q(`SELECT * FROM ${v}`), [], `${what}: ${v} is empty`);
  }
  const [f] = await q(`SELECT (SELECT coalesce(sum(amount), 0) FROM coin_ledger WHERE account_type = 'FEES') AS ledger,
    (SELECT coalesce(sum(fee_buyer + fee_seller), 0) FROM trades) AS trades`);
  assert.equal(f.ledger, f.trades, `${what}: the fees account = fees on trades`);
};
let dn = 0;
async function deposit(me, amt) { // books what a completed bridge deposit books (the bridge code is a later step)
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

/* ---------- a listed company: Ann founded ANN (5000 shares); Ben and Cat bought the 1000 public shares at 10 ---------- */
for (const p of [ben, cat, dan, fay]) await deposit(p, 20000);
await ok(call(ann, "company/create", "POST", { name: "Ann Co", symbol: "ANN", industry: "Food", authorizedShares: 10000, founderShares: 5000, publicShares: 1000, ipoPrice: 10, key: key() }), "create");
await ok(call(ann, "company/ANN/submit", "POST"), "submit");
await ok(cex.admin("company/approve", "POST", { id: "ANN", approve: true }), "approve");
await err(order(ann, { side: "SELL", type: "LIMIT", qty: 10, price: 10 }), 409, /isn't trading/, "no trading before listing");
await ok(call(ann, "company/ANN/ipo", "POST"), "IPO");
for (const p of [ben, cat]) await ok(call(p, "company/ANN/ipo/buy", "POST", { qty: 500, key: key() }), "IPO buy");
await recon("listed");

/* ---------- input checks ---------- */
await err(order(dan, { side: "BUY", type: "LIMIT", qty: 1, price: 5 }), 400, /smallest order is worth 10/, "minimum order value");
await err(order(dan, { side: "BUY", type: "MARKET", qty: 5, price: 5 }), 400, /no price/, "a market order has no price");
await err(order(dan, { side: "BUY", type: "LIMIT", qty: 5 }), 400, /Price/, "a limit order needs a price");
await err(order(dan, { side: "BUY", type: "LIMIT", qty: 1.5, price: 10 }), 400, /whole number/, "whole shares only");
await err(order(dan, { side: "HOLD", type: "LIMIT", qty: 5, price: 10 }), 400, /BUY or SELL/, "side");
await err(order(dan, { symbol: "NOPE", side: "BUY", type: "LIMIT", qty: 5, price: 10 }), 404, /No such company/, "unknown symbol");

/* ---------- 8. limit sell rests, holding its shares ---------- */
const a11 = await ok(order(ann, { side: "SELL", type: "LIMIT", qty: 100, price: 11 }), "Ann asks 100 @ 11");
const a12 = await ok(order(ann, { side: "SELL", type: "LIMIT", qty: 100, price: 12 }), "Ann asks 100 @ 12");
assert.deepEqual([a11.order.status, a12.order.status, a11.fills.length], ["OPEN", "OPEN", 0], "nothing to match yet");
assert.deepEqual(await shares(ann), { qty: 5000, reserved: 200 }, "sell orders hold their shares");

/* ---------- 7. limit buy rests below the asks, holding coins + fee ---------- */
const d9 = await ok(order(dan, { side: "BUY", type: "LIMIT", qty: 50, price: 9 }), "Dan bids 50 @ 9");
assert.equal(d9.order.status, "OPEN");
assert.deepEqual(await cash(dan), { balance: 20000, reserved: 452 }, "holds 450 + fee 2 (0.25% rounded up)");
const bookNow = await ok(call(eve, "stock/ANN/orderbook"), "order book");
assert.deepEqual(bookNow, { symbol: "ANN", bids: [{ price: 9, qty: 50, orders: 1 }], asks: [{ price: 11, qty: 100, orders: 1 }, { price: 12, qty: 100, orders: 1 }] });

/* ---------- 9. a crossing limit buy: best price first, partial fill of the second ask, change given back ---------- */
const b12 = await ok(order(ben, { side: "BUY", type: "LIMIT", qty: 150, price: 12 }), "Ben bids 150 @ 12");
assert.deepEqual(b12.fills, [{ price: 11, qty: 100, fee: 3 }, { price: 12, qty: 50, fee: 2 }], "100 @ 11 first, then 50 @ 12");
assert.deepEqual([b12.order.status, b12.order.avgPrice, b12.order.fees], ["FILLED", 11, 5], "fee 5 = 0.25% of 1700, rounded up, on the whole order");
assert.deepEqual(await cash(ben), { balance: 20000 - 5000 - 1705, reserved: 0 }, "paid 1705; the unused 100 of the 1805 held came back");
assert.deepEqual(await cash(ann), { balance: 1097 + 598, reserved: 0 }, "Ann got 1100 - 3 and 600 - 2");
const annOrders = (await ok(call(ann, "order/my"), "Ann's orders")).items;
assert.deepEqual(annOrders.map((o) => [o.price, o.status, o.filledQty]), [[12, "PARTIAL", 50], [11, "FILLED", 100]], "partial fills update remaining quantities");
assert.deepEqual(await shares(ann), { qty: 4850, reserved: 50 });
await recon("after a crossing limit buy");

/* ---------- 5. market buy: oldest first at the same price ---------- */
await ok(order(cat, { side: "SELL", type: "LIMIT", qty: 30, price: 12 }), "Cat asks 30 @ 12 (after Ann's 12)");
const dm = await ok(order(dan, { side: "BUY", type: "MARKET", qty: 60 }), "Dan market-buys 60");
assert.deepEqual(dm.fills.map((f) => [f.price, f.qty]), [[12, 50], [12, 10]], "Ann's older 50 first, then 10 of Cat's");
const sellers = await q("SELECT seller_id FROM trades WHERE buy_order_id = $1 ORDER BY id", [dm.order.id]);
assert.deepEqual(sellers.map((s) => s.seller_id), [ann.id, cat.id], "price-time priority");
assert.equal(dm.order.status, "FILLED");

/* ---------- 6. market sell hits the best bid ---------- */
const cm = await ok(order(cat, { side: "SELL", type: "MARKET", qty: 20 }), "Cat market-sells 20");
assert.deepEqual([cm.order.status, cm.fills], ["FILLED", [{ price: 9, qty: 20, fee: 1 }]]);
assert.equal((await ok(call(dan, "order/my", "GET", undefined, { open: "1" }), "Dan's open orders")).items[0].filledQty, 20, "Dan's bid is partly filled");

/* ---------- a market order with not enough on the other side cancels the rest ---------- */
const dm2 = await ok(order(dan, { side: "BUY", type: "MARKET", qty: 1000 }), "Dan market-buys 1000");
assert.deepEqual([dm2.order.status, dm2.order.filledQty, dm2.order.reason], ["CANCELLED", 20, "Nothing more to match right now."], "fills what's there, cancels the rest");
const bm = await ok(order(ben, { side: "SELL", type: "MARKET", qty: 10 }), "Ben market-sells 10 into Dan's bid");
assert.equal(bm.order.status, "FILLED");
await recon("after market orders");

/* ---------- 10. cancelling gives back what the order held ---------- */
const open = (await ok(call(dan, "order/my", "GET", undefined, { open: "1" }), "open")).items[0];
await err(call(ben, "order/cancel", "POST", { orderId: open.id }), 404, /No such order/, "only the owner cancels");
const cx = await ok(call(dan, "order/cancel", "POST", { orderId: open.id }), "Dan cancels");
assert.deepEqual([cx.order.status, cx.cash.reserved], ["CANCELLED", 0], "reservation released");
assert.deepEqual((await ok(call(dan, "order/cancel", "POST", { orderId: open.id }), "cancel twice")).order.status, "CANCELLED", "cancelling twice is harmless");
const bm2 = await ok(order(ben, { side: "SELL", type: "MARKET", qty: 10 }), "Ben market-sells with no bids");
assert.deepEqual([bm2.order.status, bm2.order.reason, bm2.holding.reserved], ["CANCELLED", "No one is buying right now.", 0], "nothing to match: cancelled, shares free again");
await recon("after cancelling");

/* ---------- 11, 12. not enough coins, not enough shares, no short selling ---------- */
await err(order(dan, { side: "BUY", type: "LIMIT", qty: 100000, price: 100 }), 422, /needs 10025000 coins/, "insufficient funds");
const danHas = (await shares(dan)).qty;
await err(order(dan, { side: "SELL", type: "LIMIT", qty: danHas + 1, price: 20 }), 422, new RegExp(`You have ${danHas} ANN shares`), "insufficient shares");
await err(order(eve, { side: "SELL", type: "MARKET", qty: 1 }), 422, /You have 0 ANN shares/, "no short selling");
await ok(order(dan, { side: "SELL", type: "LIMIT", qty: danHas, price: 30 }), "Dan offers all he has");
await err(order(dan, { side: "SELL", type: "LIMIT", qty: 1, price: 30 }), 422, /You have 0 ANN shares free/, "reserved shares can't be sold twice");

/* ---------- 13. self-trading ---------- */
await ok(order(ben, { side: "SELL", type: "LIMIT", qty: 10, price: 15 }), "Ben asks 10 @ 15");
const self = await ok(order(ben, { side: "BUY", type: "LIMIT", qty: 10, price: 15 }), "Ben bids into his own ask");
assert.deepEqual([self.order.status, self.order.filledQty, self.order.reason, self.cash.reserved], ["CANCELLED", 0, "It would trade with your own order.", 0], "cancel newest");
assert.equal((await q("SELECT count(*)::int AS n FROM trades WHERE buyer_id = seller_id"))[0].n, 0, "no self-trades");

/* ---------- 14. duplicate requests ---------- */
const kd = key();
const once1 = await ok(call(fay, "order/place", "POST", { symbol: "ANN", side: "BUY", type: "LIMIT", qty: 5, price: 8, key: kd }), "Fay bids");
const once2 = await ok(call(fay, "order/place", "POST", { symbol: "ANN", side: "BUY", type: "LIMIT", qty: 5, price: 8, key: kd }), "Fay's retry");
assert.deepEqual(once2, once1, "a retried order gets the first answer");
assert.equal((await q("SELECT count(*)::int AS n FROM orders WHERE player_id = $1", [fay.id]))[0].n, 1, "and places nothing more");

/* ---------- rate limit ---------- */
await q("UPDATE settings SET max_orders_per_minute = 3");
await ok(order(fay, { side: "BUY", type: "LIMIT", qty: 5, price: 8 }), "2nd");
await ok(order(fay, { side: "BUY", type: "LIMIT", qty: 5, price: 8 }), "3rd");
await err(order(fay, { side: "BUY", type: "LIMIT", qty: 5, price: 8 }), 429, /a lot of orders/, "too many orders a minute");
await q("UPDATE settings SET max_orders_per_minute = 20");

/* ---------- 17. a failure halfway rolls the whole order back ---------- */
await q(`CREATE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.qty = 7 THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$`);
await q("CREATE TRIGGER boom BEFORE INSERT ON trades FOR EACH ROW EXECUTE FUNCTION boom()");
const before = [await cash(fay), await shares(fay), await cash(ben), await shares(ben), (await q("SELECT count(*)::int AS n FROM orders"))[0].n];
await assert.rejects(order(fay, { side: "BUY", type: "MARKET", qty: 7 }), /boom/, "the trade insert fails");
assert.deepEqual([await cash(fay), await shares(fay), await cash(ben), await shares(ben), (await q("SELECT count(*)::int AS n FROM orders"))[0].n], before, "nothing moved, no order left behind");
await q("DROP TRIGGER boom ON trades");
await recon("after a rollback");

/* ---------- 15, 16. many players at once ---------- */
await deposit(eve, 50000);
const rush = await Promise.all([
  order(fay, { side: "BUY", type: "MARKET", qty: 4 }), order(eve, { side: "BUY", type: "MARKET", qty: 4 }),
  order(cat, { side: "SELL", type: "LIMIT", qty: 25, price: 14 }), order(eve, { side: "BUY", type: "LIMIT", qty: 30, price: 14 }),
  order(ann, { side: "SELL", type: "MARKET", qty: 5 }), order(fay, { side: "BUY", type: "LIMIT", qty: 5, price: 15 }),
  order(cat, { side: "BUY", type: "LIMIT", qty: 10, price: 13 }), order(ben, { side: "SELL", type: "MARKET", qty: 3 }),
]);
assert.ok(rush.every((r) => r.status === 200), JSON.stringify(rush.filter((r) => r.status !== 200).map((r) => r.body)));
await recon("after simultaneous orders");
const [{ crossed }] = await q(`SELECT (SELECT max(limit_price) FROM orders WHERE side = 'BUY' AND status IN ('OPEN','PARTIAL'))
  >= (SELECT min(limit_price) FROM orders WHERE side = 'SELL' AND status IN ('OPEN','PARTIAL')) AS crossed`);
assert.notEqual(crossed, true, "the book is never left crossed");

/* ---------- expiry ---------- */
t += 8 * 24 * 3600e3;
const jobs = await cex.jobs();
assert.ok(jobs.expired > 0, "old limit orders expire");
assert.equal((await q("SELECT count(*)::int AS n FROM orders WHERE status IN ('OPEN', 'PARTIAL')"))[0].n, 0);
assert.deepEqual((await q("SELECT sum(reserved)::int AS r FROM wallets"))[0].r, 0, "every coin reservation released");
assert.deepEqual((await q("SELECT sum(reserved)::int AS r FROM share_holdings"))[0].r, 0, "every share reservation released");
await recon("after expiry");

/* ---------- trades list and candles ---------- */
const tl = await ok(call(eve, "trades/ANN", "GET", undefined, { limit: "3" }), "trades");
assert.equal(tl.items.length, 3);
assert.ok(tl.next, "paged");
const [{ v }] = await q("SELECT sum(qty)::int AS v FROM trades");
const [{ cv }] = await q("SELECT sum(volume)::int AS cv FROM candles WHERE span = '1m'");
assert.equal(cv, v, "candle volume = traded volume");
const [{ issued, held }] = await q("SELECT issued_shares AS issued, (SELECT sum(qty)::bigint FROM share_holdings) AS held FROM companies");
assert.equal(issued, held, "issued shares = player holdings + treasury");

console.log("All Cave Exchange trading checks passed.");
