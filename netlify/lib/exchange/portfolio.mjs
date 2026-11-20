// Cave Exchange: a player's cash, holdings, history, dividends and watchlist. Values use last trade prices.
import { fail } from "./base.mjs";
import { cash } from "./wallet.mjs";
import { find } from "./companies.mjs";

export async function holdings(q, me) {
  const rows = await q(`SELECT c.symbol, c.name, h.qty, h.reserved, lt.price AS last_price,
      (SELECT sum(t.value + t.fee_buyer)::bigint FROM trades t WHERE t.company_id = c.id AND t.buyer_id = $1) AS bought_value,
      (SELECT sum(t.qty)::bigint FROM trades t WHERE t.company_id = c.id AND t.buyer_id = $1) AS bought_qty
    FROM share_holdings h JOIN companies c ON c.id = h.company_id
    LEFT JOIN LATERAL (SELECT price FROM trades t WHERE t.company_id = c.id ORDER BY t.id DESC LIMIT 1) lt ON true
    WHERE h.holder_type = 'PLAYER' AND h.holder_id = $1 AND h.qty > 0 ORDER BY c.symbol`, [me.id]);
  return { items: rows.map((r) => ({ symbol: r.symbol, name: r.name, qty: r.qty, reserved: r.reserved, lastPrice: r.last_price ?? null,
    value: r.last_price == null ? null : r.last_price * r.qty, avgCost: r.bought_qty ? Math.round(r.bought_value / r.bought_qty) : null })) };
}

export async function portfolio(q, me) {
  const [c, h] = [await cash(q, me.id), await holdings(q, me)];
  const holdingsValue = h.items.reduce((n, i) => n + (i.value || 0), 0);
  return { cash: c, holdings: h.items, holdingsValue, value: c.balance + holdingsValue };
}

const page = ({ before, limit } = {}) => [Number(before) || Number.MAX_SAFE_INTEGER, Math.min(Math.max(Number(limit) || 20, 1), 50)];

export async function history(q, me, query) {
  const [cur, lim] = page(query);
  const rows = await q(`SELECT l.id, l.amount, l.balance_after, l.kind, l.ref_type, l.ref_id, l.created_at, c.symbol, t.price, t.qty
    FROM coin_ledger l LEFT JOIN trades t ON l.ref_type = 'trade' AND t.id::text = l.ref_id LEFT JOIN companies c ON c.id = t.company_id
    WHERE l.account_type = 'PLAYER' AND l.account_id = $1 AND l.id < $2 ORDER BY l.id DESC LIMIT $3`, [me.id, cur, lim]);
  return { items: rows.map((r) => ({ id: r.id, amount: r.amount, balanceAfter: r.balance_after, kind: r.kind, symbol: r.symbol ?? null,
    price: r.price ?? null, qty: r.qty ?? null, at: r.created_at })), next: rows.length === lim ? rows[rows.length - 1].id : null };
}

export async function dividends(q, me, query) {
  const [cur, lim] = page(query);
  const rows = await q(`SELECT l.id, l.amount, l.created_at, c.symbol, d.per_share FROM coin_ledger l
    JOIN dividends d ON d.txn_id = l.txn_id JOIN companies c ON c.id = d.company_id
    WHERE l.account_type = 'PLAYER' AND l.account_id = $1 AND l.kind = 'dividend_in' AND l.id < $2 ORDER BY l.id DESC LIMIT $3`, [me.id, cur, lim]);
  return { items: rows.map((r) => ({ id: r.id, symbol: r.symbol, perShare: r.per_share, qty: r.amount / r.per_share, amount: r.amount, at: r.created_at })),
    next: rows.length === lim ? rows[rows.length - 1].id : null };
}

export async function watch(q, me, b) {
  if (typeof b.on !== "boolean") fail(400, "Say on: true or false.");
  const c = await find(q, b.symbol);
  if (b.on) await q("INSERT INTO watchlist (player_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [me.id, c.id]);
  else await q("DELETE FROM watchlist WHERE player_id = $1 AND company_id = $2", [me.id, c.id]);
  return { ok: true };
}
export const watching = async (q, me) => ({ items: (await q("SELECT c.symbol FROM watchlist w JOIN companies c ON c.id = w.company_id WHERE w.player_id = $1 ORDER BY c.symbol", [me.id])).map((r) => r.symbol) });
