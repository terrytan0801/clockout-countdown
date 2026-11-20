// Cave Exchange: orders and the matching engine (price-time priority). Rules: docs/CAVE_EXCHANGE_SPEC.md section 5.
//
// Everything for one incoming order happens in the caller's transaction, under the company's book lock
// (pg_advisory_xact_lock), so orders for one company are matched one at a time. A fill is at the resting order's
// price. Fees are charged on each order's running total: after a fill the order has paid
// fee(total filled value) = 0 if bps is 0, else max(min_fee, ceil(value * bps / 10000)), so splitting an order into
// many fills never costs more than filling it at once, and a limit buy's reservation always covers it.
import { randomUUID } from "node:crypto";
import { fail, int, activePlayer, audit } from "./base.mjs";
import { find, LIMITS } from "./companies.mjs";
import { bumpCandles } from "./market.mjs";

export const MAX_PRICE = 1_000_000;
const OPEN = "status IN ('OPEN', 'PARTIAL')";
export const feeOn = (value, bps, min) => (bps && value ? Math.max(min, Math.ceil((value * bps) / 10000)) : 0);

export const orderView = (o) => ({
  id: o.id, companyId: o.company_id, side: o.side, type: o.type, price: o.limit_price, qty: o.qty, filledQty: o.filled_qty,
  avgPrice: o.filled_qty ? Math.round(o.filled_value / o.filled_qty) : null, fees: o.fees_paid, status: o.status,
  reason: o.reject_reason || null, expiresAt: o.expires_at, createdAt: o.created_at,
});
const cashOf = async (q, pid) => {
  const [w] = await q("SELECT balance, reserved FROM wallets WHERE player_id = $1", [pid]);
  return { balance: w.balance, reserved: w.reserved, available: w.balance - w.reserved };
};
const holdingOf = async (q, cid, pid) => {
  const [h] = await q("SELECT qty, reserved FROM share_holdings WHERE company_id = $1 AND holder_type = 'PLAYER' AND holder_id = $2", [cid, pid]);
  return h ? { qty: h.qty, reserved: h.reserved } : { qty: 0, reserved: 0 };
};

// Ends an order (FILLED, CANCELLED, EXPIRED) and gives back whatever its reservation still holds.
async function finish(q, o, status, reason = null) {
  const [r] = await q("SELECT * FROM reservations WHERE order_id = $1 FOR UPDATE", [o.id]);
  if (r && r.status === "ACTIVE") {
    if (r.remaining) {
      if (r.kind === "COINS") await q("UPDATE wallets SET reserved = reserved - $2, updated_at = now() WHERE player_id = $1", [r.player_id, r.remaining]);
      else await q("UPDATE share_holdings SET reserved = reserved - $3, updated_at = now() WHERE company_id = $1 AND holder_type = 'PLAYER' AND holder_id = $2", [r.company_id, r.player_id, r.remaining]);
    }
    await q("UPDATE reservations SET remaining = 0, status = $2, updated_at = now() WHERE id = $1", [r.id, status === "FILLED" ? "CONSUMED" : "RELEASED"]);
  }
  const [n] = await q("UPDATE orders SET status = $2, reject_reason = coalesce($3, reject_reason), updated_at = now() WHERE id = $1 RETURNING *", [o.id, status, reason]);
  return n;
}

// One fill between a buy order and a sell order: coins, fees, shares, both orders, both reservations, the trade,
// the ledgers and the candles, all in the caller's transaction.
async function fill(q, co, buy, sell, price, qty, set) {
  const value = price * qty, txn = randomUUID();
  const feeB = feeOn(buy.filled_value + value, set.fee_buyer_bps, set.min_fee) - buy.fees_paid;
  // a seller's fees never exceed what they've sold, so a sale can't push their balance below zero
  const feeS = Math.min(sell.filled_value + value, feeOn(sell.filled_value + value, set.fee_seller_bps, set.min_fee)) - sell.fees_paid;
  const pay = value + feeB, get = value - feeS;
  const [bw] = await q(`UPDATE wallets SET balance = balance - $2, reserved = reserved - $3, updated_at = now() WHERE player_id = $1 RETURNING balance`,
    [buy.player_id, pay, buy.type === "LIMIT" ? pay : 0]);
  if (buy.type === "LIMIT") await q("UPDATE reservations SET remaining = remaining - $2, updated_at = now() WHERE order_id = $1", [buy.id, pay]);
  const [sw] = await q("UPDATE wallets SET balance = balance + $2, updated_at = now() WHERE player_id = $1 RETURNING balance", [sell.player_id, get]);
  const [sh] = await q(`UPDATE share_holdings SET qty = qty - $3, reserved = reserved - $3, updated_at = now()
    WHERE company_id = $1 AND holder_type = 'PLAYER' AND holder_id = $2 RETURNING qty`, [co.id, sell.player_id, qty]);
  await q("UPDATE reservations SET remaining = remaining - $2, updated_at = now() WHERE order_id = $1", [sell.id, qty]);
  const [bh] = await q(`INSERT INTO share_holdings (company_id, holder_type, holder_id, qty) VALUES ($1, 'PLAYER', $2, $3)
    ON CONFLICT (company_id, holder_type, holder_id) DO UPDATE SET qty = share_holdings.qty + EXCLUDED.qty, updated_at = now() RETURNING qty`,
    [co.id, buy.player_id, qty]);
  const upd = (o, fee) => q(`UPDATE orders SET filled_qty = filled_qty + $2, filled_value = filled_value + $3, fees_paid = fees_paid + $4,
    status = CASE WHEN filled_qty + $2 = qty THEN 'FILLED'::order_status ELSE 'PARTIAL'::order_status END, updated_at = now()
    WHERE id = $1 RETURNING *`, [o.id, qty, value, fee]).then((r) => r[0]);
  const [nb, ns] = [await upd(buy, feeB), await upd(sell, feeS)];
  const [tr] = await q(`INSERT INTO trades (company_id, buy_order_id, sell_order_id, buyer_id, seller_type, seller_id, price, qty, fee_buyer, fee_seller, txn_id)
    VALUES ($1, $2, $3, $4, 'PLAYER', $5, $6, $7, $8, $9, $10) RETURNING id`, [co.id, buy.id, sell.id, buy.player_id, sell.player_id, price, qty, feeB, feeS, txn]);
  const ref = String(tr.id);
  const lines = [["PLAYER", buy.player_id, -pay, bw.balance, "trade_buy"], ["PLAYER", sell.player_id, get, sw.balance, "trade_sell"],
    ["FEES", "fees", feeB + feeS, null, "fee"]].filter((l) => l[2] !== 0); // the ledger has no zero lines
  for (const [type, id, amt, after, kind] of lines) {
    await q(`INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, balance_after, kind, ref_type, ref_id)
      VALUES ($1, $2, $3, $4, $5, $6, 'trade', $7)`, [txn, type, id, amt, after, kind, ref]);
  }
  await q(`INSERT INTO share_ledger (txn_id, company_id, holder_type, holder_id, qty, qty_after, kind, ref_type, ref_id) VALUES
    ($1, $2, 'PLAYER', $3, $4, $5, 'trade_sell', 'trade', $8), ($1, $2, 'PLAYER', $6, $7, $9, 'trade_buy', 'trade', $8)`,
    [txn, co.id, sell.player_id, -qty, sh.qty, buy.player_id, qty, ref, bh.qty]);
  await bumpCandles(q, co.id, price, qty);
  for (const o of [nb, ns]) if (o.status === "FILLED") await finish(q, o, "FILLED"); // a limit buy that filled cheaper gets the rest back
  return { buy: nb, sell: ns, fill: { tradeId: tr.id, price, qty, feeBuyer: feeB, feeSeller: feeS } };
}

export async function place(q, me, b, nowMs) {
  await activePlayer(q, me);
  const side = b.side, type = b.type;
  if (side !== "BUY" && side !== "SELL") fail(400, "Side must be BUY or SELL.");
  if (type !== "LIMIT" && type !== "MARKET") fail(400, "Type must be LIMIT or MARKET.");
  const qty = int(b.qty, 1, LIMITS.maxShares, "Quantity");
  if (type === "MARKET" && b.price != null) fail(400, "A market order has no price.");
  const price = type === "LIMIT" ? int(b.price, 1, MAX_PRICE, "Price") : null;
  const [set] = await q("SELECT * FROM settings");
  if (price !== null && price * qty < set.min_order_value) fail(400, `The smallest order is worth ${set.min_order_value} coins.`);
  const [{ n }] = await q("SELECT count(*)::int AS n FROM orders WHERE player_id = $1 AND created_at > to_timestamp($2::float8 / 1000)", [me.id, nowMs - 60e3]);
  if (n >= set.max_orders_per_minute) fail(429, "That's a lot of orders. Wait a minute and try again.");

  const co = await find(q, b.symbol);
  if (co.status !== "LISTED") fail(409, co.status === "SUSPENDED" ? "Trading in this company is paused." : "This company isn't trading.");
  await q("SELECT pg_advisory_xact_lock($1)", [co.id]);

  // Check and hold what the order needs.
  let hold = 0;
  if (side === "BUY") {
    const [w] = await q("SELECT balance - reserved AS available FROM wallets WHERE player_id = $1 FOR UPDATE", [me.id]);
    if (type === "LIMIT") {
      hold = price * qty + feeOn(price * qty, set.fee_buyer_bps, set.min_fee);
      if (w.available < hold) fail(422, `This order needs ${hold} coins with fees; you have ${w.available} available.`);
    } else if (w.available < 1) fail(422, "You have no coins available in the exchange.");
  } else {
    const [h] = await q("SELECT qty - reserved AS free FROM share_holdings WHERE company_id = $1 AND holder_type = 'PLAYER' AND holder_id = $2 FOR UPDATE", [co.id, me.id]);
    if (!h || h.free < qty) fail(422, `You have ${h ? h.free : 0} ${co.symbol} shares free to sell.`); // no short selling
    hold = qty;
  }
  let [o] = await q(`INSERT INTO orders (company_id, player_id, side, type, limit_price, qty, idempotency_key, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8::float8 / 1000)) RETURNING *`,
    [co.id, me.id, side, type, price, qty, b.key || null, type === "LIMIT" ? nowMs + set.order_ttl_hours * 3600e3 : null]);
  if (hold) {
    await q("INSERT INTO reservations (order_id, kind, player_id, company_id, amount, remaining) VALUES ($1, $2, $3, $4, $5, $5)",
      [o.id, side === "BUY" ? "COINS" : "SHARES", me.id, side === "BUY" ? null : co.id, hold]);
    if (side === "BUY") await q("UPDATE wallets SET reserved = reserved + $2 WHERE player_id = $1", [me.id, hold]);
    else await q("UPDATE share_holdings SET reserved = reserved + $3 WHERE company_id = $1 AND holder_type = 'PLAYER' AND holder_id = $2", [co.id, me.id, hold]);
  }

  // Match against the other side: best price first, then oldest.
  const fills = [];
  let reason = null;
  const other = side === "BUY" ? "SELL" : "BUY";
  while (o.filled_qty < o.qty) {
    const [r] = await q(`SELECT * FROM orders WHERE company_id = $1 AND side = $2 AND ${OPEN}
      ${price === null ? "" : side === "BUY" ? "AND limit_price <= $3" : "AND limit_price >= $3"}
      ORDER BY limit_price ${side === "BUY" ? "ASC" : "DESC"}, seq LIMIT 1 FOR UPDATE`, price === null ? [co.id, other] : [co.id, other, price]);
    if (!r) { if (type === "MARKET") reason = fills.length ? "Nothing more to match right now." : `No one is ${side === "BUY" ? "selling" : "buying"} right now.`; break; }
    if (r.expires_at && new Date(r.expires_at).getTime() <= nowMs) { await finish(q, r, "EXPIRED"); continue; }
    if (r.player_id === me.id) { reason = "It would trade with your own order."; break; } // cancel newest
    let n = Math.min(o.qty - o.filled_qty, r.qty - r.filled_qty), short = false;
    if (side === "BUY" && type === "MARKET") { // pay as you go: the largest fill the buyer can afford
      const { available } = await cashOf(q, me.id);
      const cost = (k) => r.limit_price * k + feeOn(o.filled_value + r.limit_price * k, set.fee_buyer_bps, set.min_fee) - o.fees_paid;
      let lo = 0, hi = n;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (cost(mid) <= available) lo = mid; else hi = mid - 1; }
      if (!lo) { reason = "Not enough coins for more."; break; }
      short = lo < n;
      n = lo;
    }
    const f = side === "BUY" ? await fill(q, co, o, r, r.limit_price, n, set) : await fill(q, co, r, o, r.limit_price, n, set);
    o = side === "BUY" ? f.buy : f.sell;
    fills.push({ price: f.fill.price, qty: f.fill.qty, fee: side === "BUY" ? f.fill.feeBuyer : f.fill.feeSeller });
    if (short) { reason = "Not enough coins for more."; break; }
  }
  // A market order never rests; a limit order stops early only to avoid trading with yourself.
  if (o.filled_qty < o.qty && (type === "MARKET" || reason)) o = await finish(q, o, "CANCELLED", reason);
  await audit(q, "PLAYER", me.id, "order.place", "order", o.id, { symbol: co.symbol, side, type, qty, price, filled: o.filled_qty, status: o.status });
  return { order: orderView(o), fills, cash: await cashOf(q, me.id), holding: await holdingOf(q, co.id, me.id) };
}

export async function cancel(q, me, b) {
  const id = int(b.orderId, 1, Number.MAX_SAFE_INTEGER, "Order id");
  const [peek] = await q("SELECT company_id, player_id FROM orders WHERE id = $1", [id]);
  if (!peek || peek.player_id !== me.id) fail(404, "No such order.");
  await q("SELECT pg_advisory_xact_lock($1)", [peek.company_id]);
  let [o] = await q("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [id]);
  if (o.status === "OPEN" || o.status === "PARTIAL") {
    o = await finish(q, o, "CANCELLED");
    await audit(q, "PLAYER", me.id, "order.cancel", "order", o.id);
  }
  return { order: orderView(o), cash: await cashOf(q, me.id), holding: await holdingOf(q, o.company_id, me.id) };
}

// Limit orders past their time. Run by the exchange's scheduled job; matching also expires the ones it meets.
export async function expireDue(q, nowMs) {
  const due = await q(`SELECT id, company_id FROM orders WHERE ${OPEN} AND expires_at <= to_timestamp($1::float8 / 1000) ORDER BY company_id, id LIMIT 500`, [nowMs]);
  for (const d of due) {
    await q("SELECT pg_advisory_xact_lock($1)", [d.company_id]);
    const [o] = await q(`SELECT * FROM orders WHERE id = $1 AND ${OPEN} FOR UPDATE`, [d.id]);
    if (o) await finish(q, o, "EXPIRED");
  }
  return due.length;
}

export async function mine(q, me, { open, before, limit } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50), cur = Number(before) || Number.MAX_SAFE_INTEGER;
  const rows = await q(`SELECT o.*, c.symbol FROM orders o JOIN companies c ON c.id = o.company_id
    WHERE o.player_id = $1 AND o.id < $2 ${open ? `AND o.${OPEN}` : ""} ORDER BY o.id DESC LIMIT $3`, [me.id, cur, lim]);
  return { items: rows.map((o) => ({ ...orderView(o), symbol: o.symbol })), next: rows.length === lim ? rows[rows.length - 1].id : null };
}

// Top 10 prices a side, quantities added up per price. No names.
export async function book(q, symbol, nowMs) {
  const co = await find(q, symbol);
  const side = (s, dir) => q(`SELECT limit_price AS price, sum(qty - filled_qty)::bigint AS qty, count(*)::int AS orders FROM orders
    WHERE company_id = $1 AND side = $2 AND ${OPEN} AND expires_at > to_timestamp($3::float8 / 1000)
    GROUP BY limit_price ORDER BY limit_price ${dir} LIMIT 10`, [co.id, s, nowMs]);
  return { symbol: co.symbol, bids: await side("BUY", "DESC"), asks: await side("SELL", "ASC") };
}

export async function trades(q, symbol, { before, limit } = {}) {
  const co = await find(q, symbol);
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50), cur = Number(before) || Number.MAX_SAFE_INTEGER;
  const rows = await q("SELECT id, price, qty, created_at FROM trades WHERE company_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3", [co.id, cur, lim]);
  return { items: rows.map((t) => ({ id: t.id, price: t.price, qty: t.qty, at: t.created_at })), next: rows.length === lim ? rows[rows.length - 1].id : null };
}
