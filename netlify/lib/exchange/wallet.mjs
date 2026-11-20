// Cave Exchange: the custody bridge between the game wallet (Blobs ledger) and exchange cash (Postgres).
// Design and safety review: docs/WALLET_MIGRATION_PLAN.md parts 1 and 2. A coin is in one place at a time:
// a deposit writes the game line led/<pid>/<id>/-N/cex.dep.<transfer> and then credits exchange cash; moving coins
// back debits exchange cash and then writes led/<pid>/<id>/N/cex.wd.<transfer>.
//
// game = { coins(pid), writeLine(key), hasLine(key), upto(pid), credit(pid, amount, why) }, from handler.mjs.
import { createHash, randomBytes } from "node:crypto";
import { fail, int, activePlayer, audit } from "./base.mjs";

export const MAX_TRANSFER = 1_000_000, TRANSFERS_A_DAY = 20;

// The transfer id comes from the player and their request key, so a retry finds the same transfer.
const transferId = (pid, key) => {
  const h = createHash("sha256").update(`cex-bridge|${pid}|${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const lineKey = (pid, nowMs, id, amount, why) => `led/${pid}/${String(nowMs).padStart(13, "0")}-${randomBytes(3).toString("hex")}/${amount}/${why}.${id}`;
const lineId = (key) => key.split("/")[2];

export async function cash(q, pid) {
  const [w] = await q("SELECT balance, reserved FROM wallets WHERE player_id = $1", [pid]);
  return w ? { balance: w.balance, reserved: w.reserved, available: w.balance - w.reserved } : { balance: 0, reserved: 0, available: 0 };
}
const view = (t) => ({ id: t.id, direction: t.direction, amount: t.amount, state: t.state, at: t.created_at });

async function checkLimits(q, me, amount, nowMs) {
  await activePlayer(q, me);
  int(amount, 1, MAX_TRANSFER, "Amount");
  const [{ n }] = await q("SELECT count(*)::int AS n FROM bridge_transfers WHERE player_id = $1 AND created_at > to_timestamp($2::float8 / 1000)", [me.id, nowMs - 864e5]);
  if (n >= TRANSFERS_A_DAY) fail(429, `That's ${TRANSFERS_A_DAY} moves in a day. Try again tomorrow.`);
}

// Completes a deposit whose game line is written: credit exchange cash, once.
async function creditDeposit(tx, t) {
  return tx(async (q) => {
    const [row] = await q("UPDATE bridge_transfers SET state = 'COMPLETED', updated_at = now() WHERE id = $1 AND state = 'PENDING' RETURNING *", [t.id]);
    if (!row) return;
    const [w] = await q("UPDATE wallets SET balance = balance + $2, updated_at = now() WHERE player_id = $1 RETURNING balance", [t.player_id, t.amount]);
    await q(`INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, balance_after, kind, ref_type, ref_id) VALUES
      ($1, 'PLAYER', $2, $3, $4, 'deposit', 'bridge', $6), ($1, 'BRIDGE', 'bridge', $5, NULL, 'deposit', 'bridge', $6)`, [t.id, t.player_id, t.amount, w.balance, -t.amount, t.id]);
    await audit(q, "PLAYER", t.player_id, "bridge.deposit", "transfer", t.id, { amount: t.amount });
  });
}

export async function deposit(tx, game, me, b, nowMs) {
  if (typeof b.key !== "string" || !/^[\w-]{8,80}$/.test(b.key)) fail(400, "This request needs a key (a fresh UUID per action).");
  const id = transferId(me.id, b.key);
  // 1. Record the transfer, with the exact game line it will write, before touching the game wallet.
  const t = await tx(async (q) => {
    const [old] = await q("SELECT * FROM bridge_transfers WHERE id = $1", [id]);
    if (old) return old;
    await checkLimits(q, me, b.amount, nowMs);
    const [row] = await q(`INSERT INTO bridge_transfers (id, player_id, direction, amount, game_key) VALUES ($1, $2, 'DEPOSIT', $3, $4) RETURNING *`,
      [id, me.id, b.amount, lineKey(me.id, nowMs, id, -b.amount, "cex.dep")]);
    return row;
  });
  if (t.direction !== "DEPOSIT" || t.amount !== b.amount) fail(409, "That request was already used for something else.");
  if (t.state === "PENDING") {
    // 2-4. Take the coins out of the game wallet, then make sure that didn't leave it below zero.
    if (!(await game.hasLine(t.game_key))) {
      const have = await game.coins(me.id);
      if (have < t.amount) {
        await tx((q) => q("UPDATE bridge_transfers SET state = 'FAILED', error = 'not enough coins', updated_at = now() WHERE id = $1 AND state = 'PENDING'", [id]));
        fail(422, `You have ${have} coins in your wallet.`);
      }
      await game.writeLine(t.game_key);
      if ((await game.coins(me.id)) < 0) { // something else spent the same coins at the same moment
        await game.credit(me.id, t.amount, `cex.depback.${id}`);
        await tx((q) => q("UPDATE bridge_transfers SET state = 'FAILED', error = 'spent at the same time', updated_at = now() WHERE id = $1", [id]));
        fail(422, "Those coins were just spent on something else.");
      }
    }
    // 5. Credit exchange cash (once, even if two retries get here together).
    await creditDeposit(tx, t);
  }
  const [now] = await tx((q) => q("SELECT * FROM bridge_transfers WHERE id = $1", [id]));
  if (now.state === "FAILED") fail(422, "That move didn't go through; no coins moved.");
  return { transfer: view(now), cash: await tx((q) => cash(q, me.id)), wallet: await game.coins(me.id) };
}

export async function toWallet(tx, game, me, b, nowMs) {
  if (typeof b.key !== "string" || !/^[\w-]{8,80}$/.test(b.key)) fail(400, "This request needs a key (a fresh UUID per action).");
  const id = transferId(me.id, b.key);
  // 1. One transaction: take the coins out of exchange cash and record the game line still to write.
  const t = await tx(async (q) => {
    const [old] = await q("SELECT * FROM bridge_transfers WHERE id = $1", [id]);
    if (old) return old;
    await checkLimits(q, me, b.amount, nowMs);
    const [w] = await q("SELECT balance, reserved FROM wallets WHERE player_id = $1 FOR UPDATE", [me.id]);
    if (w.balance - w.reserved < b.amount) fail(422, `You have ${w.balance - w.reserved} coins available in the exchange.`);
    const [row] = await q(`INSERT INTO bridge_transfers (id, player_id, direction, amount, state, game_key) VALUES ($1, $2, 'WITHDRAW', $3, 'GAME_DONE', $4) RETURNING *`,
      [id, me.id, b.amount, lineKey(me.id, nowMs, id, b.amount, "cex.wd")]);
    const [nw] = await q("UPDATE wallets SET balance = balance - $2, updated_at = now() WHERE player_id = $1 RETURNING balance", [me.id, b.amount]);
    await q(`INSERT INTO coin_ledger (txn_id, account_type, account_id, amount, balance_after, kind, ref_type, ref_id) VALUES
      ($1, 'PLAYER', $2, $3, $4, 'withdraw', 'bridge', $6), ($1, 'BRIDGE', 'bridge', $5, NULL, 'withdraw', 'bridge', $6)`, [id, me.id, -b.amount, nw.balance, b.amount, id]);
    await audit(q, "PLAYER", me.id, "bridge.to_wallet", "transfer", id, { amount: b.amount });
    return row;
  });
  if (t.direction !== "WITHDRAW" || t.amount !== b.amount) fail(409, "That request was already used for something else.");
  // 2-3. Write the game line, then mark it done.
  if (t.state === "GAME_DONE") {
    await game.writeLine(t.game_key);
    await tx((q) => q("UPDATE bridge_transfers SET state = 'COMPLETED', updated_at = now() WHERE id = $1 AND state = 'GAME_DONE'", [id]));
  }
  const [now] = await tx((q) => q("SELECT * FROM bridge_transfers WHERE id = $1", [id]));
  return { transfer: view(now), cash: await tx((q) => cash(q, me.id)), wallet: await game.coins(me.id) };
}

export async function overview(q, game, me) {
  const rows = await q("SELECT * FROM bridge_transfers WHERE player_id = $1 ORDER BY created_at DESC LIMIT 10", [me.id]);
  return { wallet: await game.coins(me.id), cash: await cash(q, me.id), transfers: rows.map(view) };
}

// Finishes or fails transfers left halfway (a crash between the two sides). See the plan's section 1.5.
export async function recover(tx, game, nowMs) {
  const stuck = await tx((q) => q(`SELECT * FROM bridge_transfers WHERE state IN ('PENDING', 'GAME_DONE') AND error IS DISTINCT FROM 'review'
    AND updated_at < to_timestamp($1::float8 / 1000) ORDER BY created_at LIMIT 50`, [nowMs - 120e3]));
  let done = 0;
  for (const t of stuck) {
    const written = await game.hasLine(t.game_key);
    const folded = !written && (await game.upto(t.player_id)) >= lineId(t.game_key);
    if (folded) { await tx((q) => q("UPDATE bridge_transfers SET error = 'review', updated_at = now() WHERE id = $1", [t.id])); continue; }
    if (t.direction === "DEPOSIT") {
      if (written) await creditDeposit(tx, t);
      else await tx((q) => q("UPDATE bridge_transfers SET state = 'FAILED', error = 'never written', updated_at = now() WHERE id = $1 AND state = 'PENDING'", [t.id]));
    } else {
      if (!written) await game.writeLine(t.game_key);
      await tx((q) => q("UPDATE bridge_transfers SET state = 'COMPLETED', updated_at = now() WHERE id = $1 AND state = 'GAME_DONE'", [t.id]));
    }
    done++;
  }
  return done;
}
