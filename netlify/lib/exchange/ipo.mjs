// Cave Exchange: the IPO. The founder starts it once the admin has approved the company: shares are issued (founder
// shares to the founder, public shares to the company's treasury) and for 24 hours players buy public shares from the
// treasury at the IPO price, first come, first served (Terry, 19 Nov 2026). The company is LISTED when the public
// shares are sold out or the 24 hours are up; unsold shares stay in the treasury. No fee on IPO buys.
import { randomUUID } from "node:crypto";
import { fail, int, activePlayer, audit } from "./base.mjs";
import { find, view, LIMITS } from "./companies.mjs";
import { bumpCandles } from "./market.mjs";

export const IPO_HOURS = 24;

export async function start(q, me, id, nowMs) {
  const c = await find(q, id, true);
  if (c.founder_id !== me.id) fail(403, "Only the founder can start the IPO.");
  if (c.status === "IPO" || c.status === "LISTED") return { company: view(c) }; // already started (a retry)
  if (c.status !== "APPROVED") fail(409, "The admin has to approve the company first.");
  await activePlayer(q, me);
  const txn = randomUUID(), treasury = String(c.id);
  const [n] = await q(`UPDATE companies SET status = 'IPO', issued_shares = founder_shares + public_shares,
    ipo_ends_at = to_timestamp($2::float8 / 1000) WHERE id = $1 RETURNING *`, [c.id, nowMs + IPO_HOURS * 3600e3]);
  const issue = [["TREASURY", treasury, c.public_shares]];
  if (c.founder_shares > 0) issue.unshift(["PLAYER", c.founder_id, c.founder_shares]);
  for (const [type, holder, qty] of issue) {
    await q("INSERT INTO share_holdings (company_id, holder_type, holder_id, qty) VALUES ($1, $2, $3, $4)", [c.id, type, holder, qty]);
    await q(`INSERT INTO share_ledger (txn_id, company_id, holder_type, holder_id, qty, qty_after, kind, ref_type, ref_id)
      VALUES ($1, $2, $3, $4, $5, $5, 'ipo_issue', 'company', $6)`, [txn, c.id, type, holder, qty, treasury]);
  }
  await audit(q, "PLAYER", me.id, "ipo.start", "company", c.id, { txn, founderShares: c.founder_shares, publicShares: c.public_shares, endsAt: n.ipo_ends_at });
  return { company: view(n) };
}

// One purchase from the treasury, in the caller's transaction. Locks: company, buyer's wallet, then holdings.
export async function buy(q, me, id, b, nowMs) {
  await activePlayer(q, me);
  const want = int(b.qty, 1, LIMITS.maxShares, "Quantity");
  const c = await find(q, id, true);
  if (c.status !== "IPO" || nowMs >= new Date(c.ipo_ends_at).getTime()) fail(409, "This IPO isn't open.");
  const cost = want * c.ipo_price, txn = randomUUID(), treasury = String(c.id);
  const [w] = await q("SELECT balance - reserved AS available FROM wallets WHERE player_id = $1 FOR UPDATE", [me.id]);
  const [t] = await q("SELECT qty FROM share_holdings WHERE company_id = $1 AND holder_type = 'TREASURY' AND holder_id = $2 FOR UPDATE", [c.id, treasury]);
  if (t.qty < want) fail(422, t.qty ? `Only ${t.qty} shares are left.` : "The IPO is sold out.");
  if (w.available < cost) fail(422, `That costs ${cost} coins; you have ${w.available} available in the exchange.`);

  const [cash] = await q("UPDATE wallets SET balance = balance - $2, updated_at = now() WHERE player_id = $1 RETURNING balance, reserved", [me.id, cost]);
  const [acct] = await q("UPDATE company_accounts SET balance = balance + $2, updated_at = now() WHERE company_id = $1 RETURNING balance", [c.id, cost]);
  const [left] = await q("UPDATE share_holdings SET qty = qty - $3, updated_at = now() WHERE company_id = $1 AND holder_type = 'TREASURY' AND holder_id = $2 RETURNING qty", [c.id, treasury, want]);
  const [mine] = await q(`INSERT INTO share_holdings (company_id, holder_type, holder_id, qty) VALUES ($1, 'PLAYER', $2, $3)
    ON CONFLICT (company_id, holder_type, holder_id) DO UPDATE SET qty = share_holdings.qty + EXCLUDED.qty, updated_at = now()
    RETURNING qty, reserved`, [c.id, me.id, want]);
  const [trade] = await q(`INSERT INTO trades (company_id, buyer_id, seller_type, seller_id, price, qty, txn_id)
    VALUES ($1, $2, 'TREASURY', $3, $4, $5, $6) RETURNING id, price, qty, value, created_at`, [c.id, me.id, treasury, c.ipo_price, want, txn]);
  await q(`INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, balance_after, kind, ref_type, ref_id) VALUES
    ($1, 'PLAYER', $2, $3, $4, 'ipo_buy', 'trade', $7), ($1, 'COMPANY', $5, $6, $8, 'ipo_proceeds', 'trade', $7)`,
    [txn, me.id, -cost, cash.balance, treasury, cost, String(trade.id), acct.balance]);
  await q(`INSERT INTO share_ledger (txn_id, company_id, holder_type, holder_id, qty, qty_after, kind, ref_type, ref_id) VALUES
    ($1, $2, 'TREASURY', $3, $4, $5, 'ipo_buy', 'trade', $8), ($1, $2, 'PLAYER', $6, $7, $9, 'ipo_buy', 'trade', $8)`,
    [txn, c.id, treasury, -want, left.qty, me.id, want, String(trade.id), mine.qty]);
  await bumpCandles(q, c.id, c.ipo_price, want);
  if (left.qty === 0) await q("UPDATE companies SET status = 'LISTED', listed_at = now() WHERE id = $1", [c.id]); // sold out
  await audit(q, "PLAYER", me.id, "ipo.buy", "company", c.id, { txn, qty: want, cost });
  return {
    trade: { id: trade.id, price: trade.price, qty: trade.qty, value: trade.value, at: trade.created_at },
    cash: { balance: cash.balance, reserved: cash.reserved, available: cash.balance - cash.reserved },
    holding: { qty: mine.qty, reserved: mine.reserved }, left: left.qty,
  };
}

// IPOs whose 24 hours are up become LISTED. Run before IPO buys and lists, and by the exchange's scheduled job.
export async function closeDue(q, nowMs) {
  const done = await q(`UPDATE companies SET status = 'LISTED', listed_at = now()
    WHERE status = 'IPO' AND ipo_ends_at <= to_timestamp($1::float8 / 1000) RETURNING id`, [nowMs]);
  for (const { id } of done) await audit(q, "SYSTEM", "clock", "ipo.close", "company", id);
  return done.length;
}
