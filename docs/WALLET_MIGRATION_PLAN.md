# Wallet: custody bridge and migration plan (Stages B2 and B3)

Part 1 is the wallet service for phase 1, the custody bridge Terry chose on 19 Nov 2026. Part 2 is its safety
review. Part 3 is the plan for a later move of all coins into PostgreSQL (one authoritative balance), which the
brief asks for but which is **not** being done now. Nothing here has been run; no production data moves without
Terry's explicit go-ahead.

How the game wallet works today is in `CAVE_EXCHANGE_AUDIT.md` section 6. In short: `credit(pid, amount, why)`
writes one Blobs key `led/<pid>/<13-digit ms>-<6 hex>/<amount>/<why>`; `wallet(pid)` adds `coinbase/<pid>.bal`
and every line with an id above `coinbase.upto`; `settle` folds old lines into `coinbase` and deletes them (never
the newest 10, never one younger than a minute).

---

## Part 1: the wallet service (B2)

### 1.1 Two pools, one owner each

| Pool | Where | Who writes it |
|---|---|---|
| Game wallet | Blobs ledger (`led/`, `coinbase/`) | the game, as today, plus two bridge line kinds: `cex.dep.<id>` (−) and `cex.wd.<id>` (+) |
| Exchange cash | PostgreSQL `cex.wallets` + `cex.coin_ledger` | only the exchange |

A coin moves between pools only through a `bridge_transfers` row. The two systems never change the same pool,
which keeps the brief's rule "never allow the old and new wallet systems to independently modify the same
player's funds".

### 1.2 Module

`netlify/lib/exchange/wallet.mjs`, made with the game's own `credit` and `wallet` functions passed in from
`makeApp` (so it reuses them, adds no second way of writing the Blobs ledger, and the tests can use `memStore`):

- `gameBalance(pid)`: `wallet(pid).coins`
- `cash(pid)`: `{ balance, reserved, available }` from `cex.wallets`
- `deposit(pid, amount, key)` and `toWallet(pid, amount, key)`: below
- `recover()`: finishes or fails stuck transfers (run by the exchange's scheduled job every 5 minutes)

The transfer `id` is a UUID derived from the player and the request key (UUID v5), so a retry of the same request
finds the same transfer.

### 1.3 Deposit (game wallet → exchange cash)

1. **Postgres:** insert `bridge_transfers (id, pid, DEPOSIT, amount, PENDING)` with `game_key` set to the
   Blobs key it is about to write: `led/<pid>/<now13>-<6 hex of id>/-<amount>/cex.dep.<id>`. If the row already
   exists (a retry), carry on from its state.
2. **Blobs:** check `wallet(pid).coins >= amount`; if not, mark FAILED and answer 422.
3. **Blobs:** write the `game_key` line and bump `wv/<pid>` (exactly what `credit` does, with the id fixed in
   advance).
4. **Blobs:** read the balance again. If it went below zero (a shop purchase or donation landed at the same
   moment), write a refund line `+amount` with why `cex.depback.<id>`, mark FAILED, answer 422. The ledger never
   goes negative for long and no coins are lost or made.
5. **Postgres, one transaction:** `UPDATE bridge_transfers SET state = 'COMPLETED' WHERE id = … AND state IN
   ('PENDING')`; credit `wallets.balance`; coin ledger `PLAYER +amount` and `BRIDGE −amount`. If the UPDATE hits no
   row, another request finished it: do nothing.

### 1.4 Move to wallet (exchange cash → game wallet)

1. **Postgres, one transaction:** lock the wallet row, check `balance − reserved >= amount`, debit it, coin ledger
   `PLAYER −amount` and `BRIDGE +amount`, insert the transfer as `GAME_DONE` with its `game_key`
   (`led/<pid>/<now13>-<6 hex>/<amount>/cex.wd.<id>`). Not enough: 422, nothing written.
2. **Blobs:** write the `game_key` line and bump `wv/<pid>`.
3. **Postgres:** mark the transfer `COMPLETED`.

`GAME_DONE` here means "the exchange side is done, the game line is next" (the state names follow the order the
two sides are written).

### 1.5 Recovery (`recover()`, every 5 minutes)

For each transfer still `PENDING` (deposit) or `GAME_DONE` (move to wallet) and older than 2 minutes:

| Game line `game_key` | `coinbase.upto` vs. the key's id | Meaning | Action |
|---|---|---|---|
| exists | | the game side happened | deposit: run step 1.3.5; move to wallet: mark COMPLETED |
| missing | upto < id | never written (a folded line always leaves upto ≥ its id) | deposit: mark FAILED; move to wallet: write a fresh line (new id, now) and mark COMPLETED |
| missing | upto ≥ id | written and then folded away, or never written and then overtaken by a fold: can't tell | leave it, flag it `error = 'review'`, show it on the admin reconciliation page |

A refund line `cex.depback.<id>` present means the deposit failed at step 4: mark FAILED.

The last row needs a crash in the few milliseconds between writing the line and updating Postgres, and then the
player opening the app with more than 40 lines before recovery runs. The admin resolves it by comparing the
player's game balance history; it never resolves itself in a way that could create or lose coins.

### 1.6 What the player sees

- Wallet (game coins) and Exchange cash (available, reserved) shown separately, with Deposit and Move to wallet.
- Bridge lines appear in the game's coin log; `whyText()` gets two labels: "Into the exchange" and "From the
  exchange". That is the only change to existing client code here, and it's text in the existing log.

---

## Part 2: safety review (B3)

| Risk | What stops it |
|---|---|
| A retried deposit takes coins twice | The transfer id comes from the request key; step 1 finds the existing row; step 5 only completes a PENDING row; the game line key is fixed in advance, so writing it twice writes the same key |
| Two deposits or a deposit and a shop purchase at once overspend the game wallet | Re-check after writing (step 4) with a refund line. The existing race in shop, seeds and donations (audit 8.2) is unchanged and outside the exchange |
| Coins made from nothing in the exchange | Double-entry at COMMIT; `recon_bridge` checks the `BRIDGE` account against completed transfers; the scheduled check matches each transfer to its game line |
| Function crashes halfway | Recovery (1.5); every state is safe to resume |
| Postgres down | Deposit fails at step 1 before the game is touched; move to wallet fails at step 1 before anything is written |
| Blobs down | Deposit fails at step 2 or 3, recovery marks it FAILED; move to wallet: the line is written by recovery once Blobs is back |
| Replay of an old request | Same key → same answer; a captured token is as dangerous as today (sessions are bearer tokens), and the bridge only moves a player's own coins between their own pools |
| Huge amounts | `amount` 1 to 1,000,000; **DEFAULT** at most 20 transfers per player per day |
| Fold hides a late line | Lines are written with the current time at the moment of writing, never back-dated; the ambiguous case goes to review (1.5) |
| Account deletion strands exchange cash | **Decision for Terry** (spec section 13.5) |
| Folding deletes `cex.*` lines from Blobs | Postgres keeps the full transfer record and the game key; the audit doesn't depend on the Blobs lines surviving |
| Admin key leak | As today: only in Netlify's `ADMIN_KEY`; the exchange adds no new secret except the database URL, also only in Netlify's environment |

Reconciliation (run by the scheduled job, shown on the admin page):

- All `recon_*` views empty.
- `Σ COMPLETED deposits − Σ COMPLETED/GAME_DONE moves to wallet` = coins inside the exchange = −(BRIDGE account).
- Every transfer COMPLETED in Postgres has its game line, or is older than the player's fold point (then it's
  counted in `coinbase`, which can't be checked line by line: this is why Postgres is the record of truth for
  transfers).
- No transfer stuck for more than 10 minutes.

---

## Part 3: moving all coins to PostgreSQL later (not now)

This is the brief's "unified Wallet Service" with one authoritative balance (audit option 3). It touches every
coin path in the game (audit 6.2), so it only happens after the exchange is live and stable, and only with
Terry's explicit go-ahead at each production step.

### 3.1 Current balance extraction

A read-only script lists every `person/` and, for each, `coinbase/<pid>` and all `led/<pid>/` lines, and writes
a snapshot file: pid, folded total, upto, each line, and the computed balance. Nothing is written to Blobs.

### 3.2 Ledger verification

For each player: the snapshot balance equals what `state` shows; flag negative balances (the 8.2 race), lines
with bad amounts, lines below `upto` (hidden by a fold), and players whose records are gone. Terry decides what
to do with each flag before going on.

### 3.3 Data import

Into a new `cex` migration: a `GAME` account type and, per player, one opening entry `PLAYER +balance` /
`GENESIS −balance` (kind `opening`, referring to the snapshot), plus each unfolded line as its own entry so recent
history stays visible. Run on the dev database first, then on a copy of production data, never on production
until 3.5.

### 3.4 Shadow verification

For a period (**DEFAULT** two weeks) `credit()` keeps writing Blobs as the only real write and also writes a
**copy** to Postgres marked `shadow`. A nightly check compares each player's Blobs balance with the shadow
balance and reports every difference. The shadow copy decides nothing, so the two systems are not both
"modifying" funds. Go on only after a run of clean nights.

### 3.5 Cutover

1. Announce a short pause (the app already has the v54 "moving" pause: the API answers 503 `{moving:true}` and
   phones retry).
2. Take the final snapshot and import the difference since the last shadow check.
3. Verify every balance matches.
4. Flip one switch (a Blobs flag such as `sys/wallet-pg`) so `credit()` and `wallet()` use Postgres.
5. End the pause. The bridge is retired: exchange cash and game coins become one balance.

### 3.6 Rollback

Before step 4: just end the pause; nothing changed. After step 4: flip the switch back, and write every Postgres
entry made since the cutover into Blobs as ordinary `led` lines (kind `pg.<id>`), so no coin earned or spent in
between is lost. Blobs data is never deleted during the migration, so the old state is always there.

### 3.7 Reconciliation

The same per-player comparison as 3.4, run after cutover for a while, plus the `recon_*` views.

### 3.8 Recovery

- Postgres: the provider's point-in-time restore (Neon keeps history), plus the snapshot files.
- Blobs: untouched by the migration, so it is its own backup.
- A player who reports a wrong balance is checked against the snapshot, the shadow log and the ledger; fixes are
  new correcting entries, never edits.

### 3.9 Not decided

Whether to do Part 3 at all, and when. The folding and account-deletion behaviour (audit 8.1) would have to stop
deleting lines once Postgres is the record; that is a change to existing behaviour and needs Terry's approval.
