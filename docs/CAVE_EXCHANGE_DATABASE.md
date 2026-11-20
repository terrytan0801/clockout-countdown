# Cave Exchange (CEX): database (Stage B1)

The schema is `db/migrations/0001_cex_schema.sql`: plain PostgreSQL 14+, everything inside a `cex` schema, so it
runs the same on Netlify DB, Neon or Supabase. It does not touch the game's Netlify Blobs; coins reach it only
through the custody bridge (decided 19 Nov 2026, see `CAVE_EXCHANGE_AUDIT.md` section 9).

It hasn't been run against a hosted database yet. `db/test/schema.test.mjs` runs it on an in-memory PostgreSQL
(PGlite 0.5.15) and checks that the database itself refuses unbalanced entries, negative balances, over-reservation,
changes to the ledgers, shares from nowhere, extra shares, a second IPO, skipped company steps, self-trades,
malformed orders and fees over the cap, and that the reconciliation views
are empty when things add up and catch drift when they don't:

```bash
npm i --no-save @electric-sql/pglite@0.5.15
node db/test/schema.test.mjs
node db/test/exchange-ipo.test.mjs
node db/test/exchange-trading.test.mjs
node db/test/exchange-wallet.test.mjs
```

`exchange-ipo.test.mjs` runs the company and IPO code (`netlify/lib/exchange/`) through its routes on the same
in-memory database (`db/test/pglite.mjs` sets it up).

It isn't part of `npm test` yet because PGlite isn't a project dependency. Production and dev each get their own
database; which provider is still to be decided.

## Money rules

- Coins and share counts are `BIGINT` whole numbers. There are no floats and no fractions anywhere.
- A price is whole coins per share (tick size 1 coin), so a trade's value `price * qty` is a whole number.
- Ledgers are append-only. Triggers refuse `UPDATE`, `DELETE` and `TRUNCATE` on `coin_ledger`, `share_ledger`,
  `trades` and `audit_logs`; a mistake is corrected with a new, reversing entry.
- Coins are double-entry. At `COMMIT`, the entries of each `txn_id` must sum to zero (a deferred constraint
  trigger), so a transaction that would create or lose coins is rolled back as a whole.
- Share moves balance too. At `COMMIT`, a transaction's share entries per company must sum to zero unless it
  issues, cancels or splits shares.
- Shares can't be made up. At `COMMIT`, each company's `issued_shares` must equal the sum of its share ledger, so
  the number only changes together with `ipo_issue`, `issue`, `cancel` or `split` entries. Only the IPO and
  admin-approved corporate actions write those, and `ipo_issue` can appear once per company and holder type.
- A company's status only moves forward: PENDING → APPROVED or REJECTED, APPROVED → IPO or REJECTED, IPO → LISTED,
  LISTED ⇄ SUSPENDED, LISTED or SUSPENDED → DELISTED or BANKRUPT. An IPO can't be rewound and run again.
- Nothing goes negative: `CHECK` constraints keep wallet balances, company cash, holdings and reservations at zero
  or above, and reserved amounts within what's held.

## Tables

| # | Table | Holds | Notes |
|---|---|---|---|
| 1 | `players` | A reference to the game's `person/<pid>` | `id` is the game's `p-…` id; created on first use; no passcodes or sessions; `frozen` lets an admin stop trading |
| 2 | `wallets` | Exchange cash per player | `balance` (incl. reserved), `reserved` for open buy orders; `reserved <= balance`, both `>= 0` |
| 3 | `coin_ledger` | Every coin movement | Append-only, double-entry by `txn_id`. Accounts: `PLAYER`, `COMPANY`, `BRIDGE` (the game wallet's side of the bridge), `FEES` |
| 4 | `companies` | Player companies | Unique `symbol` (2–5 capitals/digits) and case-insensitive unique `name`; share counts; `ipo_price`; `status` (PENDING, APPROVED, IPO, LISTED, SUSPENDED, DELISTED, BANKRUPT, REJECTED); `submitted_at` is empty while the founder is still editing; `ipo_ends_at` 24 h after the IPO starts |
| 5 | `share_holdings` | Shares held | Per company and holder; holder is a `PLAYER` or the company's `TREASURY`; `reserved` for open sell orders |
| 6 | `share_ledger` | Every share movement | Append-only; balanced per transaction and company except issuance, cancellation and splits |
| 7 | `orders` | Buy and sell orders | `LIMIT` (has a price) or `MARKET` (no price); `seq` gives time priority; one `idempotency_key` per player; `expires_at` (limit orders), status `EXPIRED`; `filled_value` and `fees_paid` (fees are charged on the running total); partial indexes hold each side's book in price-time order |
| 8 | `trades` | Fills | Append-only; `value` computed; `buy_order_id`/`sell_order_id` NULL for an IPO allotment from the treasury; a player can't trade with themselves |
| 9 | `reservations` | What an open order holds | One per order; coins for a buy, shares for a sell; `remaining` shrinks as it fills; must be 0 once not `ACTIVE` |
| 10 | `company_accounts` | Company cash | IPO proceeds land here, dividends are paid from here |
| 11 | `dividends` | Declared dividends | Whole coins per share, a record time, the payout `txn_id` |
| 12 | `corporate_actions` | Splits, issues, buybacks, suspensions, delistings, bankruptcy, renames | `params` as JSON; requested and approved by whom |
| 13 | `candles` | Price history | Per company, span (`1m`, `1h`, `1d`) and bucket start; OHLC whole coins; volume |
| 14 | `idempotency_keys` | Answers to requests already handled | Keyed by player and client key; a retry gets the first answer |
| 15 | `audit_logs` | Who did what | Append-only; players, admin and system jobs |
| 16 | `bridge_transfers` | Deposits and withdrawals | Not in the brief's list; needed for the custody bridge (below) |
| 17 | `settings` | One row: fees (0.25% each side), minimum fee (1), minimum order value (10), order lifetime (168 h), orders per minute (20) | Changed by the admin without a deploy; fees capped at 5% |
| 18 | `watchlist` | Companies a player follows | Player and company |

Market data (last price and time, previous close, day open, high, low and volume, market value) isn't stored
separately: it comes from `trades` and `candles`, so it's always based on real trades. See `CAVE_EXCHANGE_SPEC.md`.

## The custody bridge in the schema

A deposit moves coins from the game wallet (Blobs) into the exchange:

1. Create a `bridge_transfers` row `PENDING` with a new `id` (UUID).
2. Write the game ledger line `led/<pid>/<id13>/-N/cex.dep.<id>` after claiming `cexdep/<id>` in Blobs (once only).
   Mark the row `GAME_DONE` with the key.
3. In one transaction: credit the player's wallet, write the two `coin_ledger` entries (`PLAYER +N`,
   `BRIDGE −N`) and mark the row `COMPLETED`.

A withdrawal goes the other way: one transaction debits the wallet (checking the spendable balance), writes the
entries (`PLAYER −N`, `BRIDGE +N`) and marks the row `GAME_DONE`; then the game line
`led/<pid>/<id13>/+N/cex.wd.<id>` is written and the row becomes `COMPLETED`.

A transfer stuck in `PENDING` or `GAME_DONE` is finished (or failed) by a scheduled job, keyed by its `id`, so
retries never move coins twice. Coins are therefore in exactly one system at a time.

## Concurrency

- Every money operation runs in one transaction.
- Matching locks one company's book at a time with `pg_advisory_xact_lock(company_id)`, so orders for the same
  company are matched one after another while different companies run in parallel.
- Rows that change balances are locked with `SELECT … FOR UPDATE` in a fixed order (wallets by player id, then
  holdings by company and holder) to avoid deadlocks.
- The `CHECK` constraints are the last line of defence: if code ever tried to overspend, the database refuses
  and the whole transaction rolls back.

## Reconciliation

Each `recon_*` view lists only the rows that **don't** add up, so an empty result means all is well:

| View | Checks |
|---|---|
| `recon_shares` | Issued shares = player holdings + treasury, per company |
| `recon_holdings` | Each holding = its share ledger |
| `recon_wallets` | Each wallet = its coin ledger |
| `recon_company_accounts` | Each company's cash = its coin ledger |
| `recon_reservations` | Reserved coins and shares = what active reservations still hold |
| `recon_bridge` | Coins inside the exchange (from the `BRIDGE` account) = completed deposits − withdrawals |

A scheduled check (Stage B7) will run them and also match `bridge_transfers` against the game's `cex.dep.*` and
`cex.wd.*` ledger lines in Blobs.

## Running it

- Apply once per database: `psql "$DATABASE_URL" -f db/migrations/0001_cex_schema.sql`. It runs in one
  transaction and records itself in `cex.schema_migrations`.
- It only creates objects; it never drops, truncates or rewrites anything. Later changes come as new numbered
  migrations.
- The dev deploy uses its own database (chosen the way the Blobs store is, by `isDevDeploy`); production data is
  never used for testing.
