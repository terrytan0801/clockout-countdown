# Cave Exchange (CEX): specification

How the exchange behaves, written from the brief (all of it, received 19 Nov 2026) and fitted to the code as it
is (see `CAVE_EXCHANGE_AUDIT.md`). The tables are in `CAVE_EXCHANGE_DATABASE.md`, the routes in
`CAVE_EXCHANGE_API.md`, and the wallet bridge in `WALLET_MIGRATION_PLAN.md`.

Items marked **DEFAULT** are a choice made here so the design is complete; Terry can change them. Items marked
**DECISION** need Terry before the phase that uses them (section 13).

---

## 1. What it is

A player-driven stock market inside Clock-out Countdown. Players create companies, an admin approves them, the
companies sell shares in an IPO, and players trade those shares with each other in an order book. Everything is
priced in monster coins. There are no NPC companies or traders, no margin, no short selling, and nothing that
connects to real money.

Trading is open 24/7.

## 2. Rules the exchange keeps

- Existing features, screens, monsters and data are untouched. The exchange adds new routes, a new screen and its
  own database; the only change to an existing screen is one entry point (**DECISION**: Home row button or metro
  station).
- Coins come into the exchange only through the custody bridge (deposit) and leave only through it (move back to
  the wallet). A coin is in the game wallet or in the exchange, never both. The game wallet is never written by the
  exchange except for the bridge's own ledger lines.
- Coins and shares are whole numbers. Prices are whole coins per share.
- Every money move is one PostgreSQL transaction: all of it happens or none of it does.
- Ledgers are append-only; corrections are new entries.
- Nothing creates coins. Fees leave circulation (they sit in the `FEES` account). Dividends come out of company
  cash.
- Prices come only from real trades. No random prices, no made-up volume.

## 3. Players

- A player is the game's `person/<pid>`, signed in the usual way (`Authorization: Bearer <token>`). The exchange
  creates a `players` row the first time someone opens it, with their current name and cave.
- An admin can freeze a player (`frozen`): they can still look and cancel orders, but not place orders, deposit or
  create companies.

## 4. Companies and the IPO

### 4.1 Creating a company

A player fills in name, symbol, industry, description, authorized shares, founder shares, public shares and IPO
price. The server checks:

| Field | Rule |
|---|---|
| Symbol | 2–5 characters, capital letters and digits, starting with a letter; unique (also case-insensitively, since it's stored in capitals) |
| Name | 2–40 characters; unique ignoring case |
| Industry | 2–30 characters |
| Description | up to 500 characters |
| Shares | whole numbers; public ≥ 1; founder ≥ 0; founder + public ≤ authorized; **DEFAULT** authorized ≤ 1,000,000 |
| IPO price | whole coins, **DEFAULT** 1–10,000 |
| Founder | the signed-in player; **DEFAULT** one company per founder that isn't REJECTED, DELISTED or BANKRUPT |

The company starts as PENDING with `submitted_at` empty. The founder can edit it until they submit it; after
that it waits for the admin.

### 4.2 Approval

The admin sees submitted companies on the admin page (opened with the existing admin key) and approves or
rejects them. Approval records who and when. Nothing is issued yet.

### 4.3 The IPO

The founder starts the IPO of an APPROVED company. In one transaction:

1. The company moves APPROVED → IPO (the database refuses any other step, so this can't happen twice).
2. Shares are issued: `founder_shares` to the founder and `public_shares` to the company treasury, each as one
   `ipo_issue` entry in the share ledger (the database allows one per company and holder type).
   `issued_shares` becomes founder + public.
3. An audit line records it.

During the IPO, players buy public shares from the treasury at the IPO price (**DECISION**, default below):

- **DEFAULT: first come, first served**, at the IPO price, for 24 hours or until the treasury's public shares are
  sold. Each purchase is one transaction: the buyer's coins go to the company's cash account, the shares go from
  the treasury to the buyer, and a trade is recorded with no order ids (an IPO allotment). No fee on IPO buys.
  The alternative is a subscription period followed by a pro-rata share-out, which is fairer when demand is
  high but takes longer to build.
- When the IPO ends, the company moves IPO → LISTED and trading opens. Unsold shares stay in the treasury. They
  can only reach the market later through an admin-approved corporate action.
- The founder may buy in their own IPO (the coins go to their company's cash, which they can't take out except
  as dividends paid to every shareholder).

Shares can never be added outside the IPO and approved corporate actions: at COMMIT the database checks that
`issued_shares` equals the share ledger, and the reconciliation checks that issued shares = player holdings +
treasury.

## 5. Trading engine

### 5.1 Orders

| | Limit | Market |
|---|---|---|
| Buy | Fills at the limit price or lower; the rest rests in the book | Fills against the best asks now; any rest is cancelled |
| Sell | Fills at the limit price or higher; the rest rests in the book | Fills against the best bids now; any rest is cancelled |

- Quantity is a whole number of shares, ≥ 1. A limit order's value (price × qty) must be at least
  `settings.min_order_value` (**DEFAULT** 10 coins).
- Limit orders expire after `settings.order_ttl_hours` (**DEFAULT** 7 days). Expiry releases what they hold.
- Every order carries a client key (`idempotency_key`, a UUID made by the phone). Sending the same order again
  returns the first answer; the database refuses a second order with the same key from the same player.
- Orders only for LISTED companies; a SUSPENDED company's book is frozen (cancel only).
- No short selling: you can only sell shares you hold and haven't reserved.

### 5.2 Reservations

- A limit buy reserves `qty × limit_price + buyer fee on that value` coins (`wallets.reserved`).
- A limit sell reserves `qty` shares (`share_holdings.reserved`).
- As the order fills, the reservation shrinks. A buy that fills below its limit releases the difference. When the
  order ends (filled, cancelled, expired), whatever is left is released.
- A market order doesn't rest, so it holds nothing: it is filled inside the same transaction, checking the
  buyer's available coins (balance − reserved) before each fill.
- Available coins and reserved coins are shown separately everywhere.

### 5.3 Matching (price-time priority)

For each new order, in one transaction:

1. Take the company's book lock (`pg_advisory_xact_lock(company_id)`). Orders for the same company are matched
   one at a time; different companies run side by side.
2. Lock the incoming player's wallet or holding row (`SELECT … FOR UPDATE`), check what they have, insert the
   order and its reservation.
3. Walk the opposite side of the book: best price first, then lowest `seq` (oldest). Expired orders met on the
   way are expired and released, not matched.
4. **Self-trade:** if the next resting order belongs to the same player, the incoming order's remainder is
   cancelled with the reason "would trade with your own order" (cancel newest). Nobody trades with themselves,
   and the book is never left crossed.
5. Each fill is at the **resting order's price** (the price that was waiting in the book), for
   `min(remaining of both)`. For each fill, in the same transaction:
   - buyer wallet − (value + buyer fee); seller wallet + (value − seller fee); `FEES` + both fees
   - buyer holding + qty; seller holding − qty (and its reservation − qty)
   - both orders' `filled_qty` and status; both reservations
   - one `trades` row (with its own `txn_id`)
   - coin ledger entries (buyer, seller, fees: they sum to zero) and share ledger entries (they sum to zero)
   - the 1-minute, 1-hour and 1-day candles
6. Stop when the incoming order is filled, the book has nothing at an acceptable price, or (market buy) the
   buyer can't afford the next fill. A limit remainder rests; a market remainder is cancelled.
7. Write an audit line and commit. If anything fails, the whole transaction rolls back and nothing moved. The
   CHECK constraints and the COMMIT-time checks (balanced coins, balanced shares, supply) are the last guard.

Rows are always locked in the same order (wallets by player id, then holdings by company and holder) so two
transactions can't deadlock each other.

### 5.4 Fees

- Each side pays `ceil(value × bps / 10000)`, at least `settings.min_fee`, where bps is
  `settings.fee_buyer_bps` / `fee_seller_bps` (**DEFAULT** 25 = 0.25% each, minimum 1 coin). A side with 0 bps
  pays nothing.
- Fees go to the `FEES` account and stay there: they take coins out of circulation (a coin sink), which helps
  against pumping volume between friends.
- The admin can change fees and limits on the admin page; each change is audited. The database caps fees at 5%.

### 5.5 Cancelling

The owner (or the admin) cancels an OPEN or PARTIAL order: under the book lock, the order becomes CANCELLED and its
reservation is released, in one transaction. Cancelling twice is harmless.

### 5.6 Limits against abuse

- Orders per player per minute: `settings.max_orders_per_minute` (**DEFAULT** 20), counted from `orders`.
- Self-trades are impossible (engine and a database CHECK).
- Wash trading between friends can't be fully stopped in a game with no identity checks. Fees make it cost
  something, and the admin's audit view lists pairs of players who trade a company back and forth.

## 6. Market data

All of it comes from `trades` and `candles`:

| Figure | From |
|---|---|
| Last price, last trade time | the latest trade (an IPO allotment counts) |
| Day open, high, low, volume | today's `1d` candle |
| Previous close | the close of the latest `1d` candle before today |
| Market value | `issued_shares × last price` |
| Charts | `candles` for `1m`, `1h`, `1d` |

- A day runs from midnight to midnight Singapore time (UTC+8), the same day the game uses (`sgDayOf`).
- With no trades, the last price stays and its time is shown ("last trade 3 days ago"). Candles only exist for
  periods with trades; the chart draws gaps as flat lines at the previous close.
- Candles are written inside each trade's transaction, so they always match the trades.

## 7. Companies after listing (phase 5)

- **Company cash** (`company_accounts`): IPO proceeds in; dividends out. No one can withdraw it to themselves.
- **Revenue, expenses, profit:** reports are sums of the company's coin ledger entries by kind and period, so
  every number traces to a transaction. Owners can't type in profits. **DECISION:** where company revenue comes
  from. Today a company has no way to earn coins after its IPO; options include a share of village or shop
  activity tied to its industry, or players paying companies for in-game services. Until that's decided,
  companies only hold IPO cash.
- **Debt:** no lending in the first version, so no debt.
- **Dividends:** the founder declares a whole-coin amount per share. It is paid at once, in one transaction, to
  every player holding shares at that moment (the treasury gets nothing), and only if company cash covers
  `per share × player-held shares`.
- **Buybacks, new shares, splits, suspension, delisting, bankruptcy:** requested by the founder (or the admin)
  as `corporate_actions` and carried out only after admin approval. Later phase.

## 8. Wallet (custody bridge)

Players see two balances: **Wallet** (game coins, as today) and **Exchange cash** (available and reserved). They
move coins between them with **Deposit** and **Move to wallet**. The brief's "no cash withdrawal" means no real
money; moving coins back to the game wallet is how they leave the exchange, so the screen never calls it
"withdraw cash". Details, safety and the later single-wallet migration: `WALLET_MIGRATION_PLAN.md`.

## 9. Security

- Every exchange route runs after the game's own `auth()`; admin routes use the existing `x-admin-key` check.
- The server takes nothing about money from the phone: balances, prices of fills, fees and totals are all worked
  out on the server. The phone sends only what the player chose (side, type, qty, limit price, amount).
- Inputs are checked for type, range and whole numbers before any database work; symbols and text are length-
  and pattern-checked (the database repeats the important ones as CHECKs).
- Ownership: only the founder edits, submits, starts the IPO of, or declares dividends for their company; only
  the owner cancels an order.
- Every POST that moves money needs a client key; replays get the first answer (`idempotency_keys`). The same
  key with a different body is refused (409).
- Audit lines for every money move, approval, setting change and freeze.
- No secrets in the client. The database URL lives only in Netlify's environment.

## 10. Performance

- The exchange loads only when opened (`public/exchange/exchange.js` fetched on demand). Opening the app costs
  nothing new.
- The database driver is imported only by exchange routes, so the rest of the API doesn't wait for it, and if the
  database is down only the exchange shows an error.
- Lists are paginated (trades, history, audit; 50 per page by `id` cursor). The book shows the top 10 prices per
  side, grouped by price.
- The market overview (all listed companies with last price and day change) is cached for 60 seconds per
  function instance.
- No polling. The screen refreshes when opened, when the player pulls to refresh, and after their own actions.
- The database sits in `us-east-1`, next to the functions.

## 11. Screens

A new screen, built with the existing sheets, buttons, colours and fonts (charcoal and green, Barlow), with its
own `cx-` CSS classes and no change to global CSS. Sections: Market, Search, Stock (details, chart, order book,
buy/sell), Portfolio, Watchlist, My company, History, Dividends. Every section has loading, empty, success and
error states. Mock data only on a local test server, never on a deploy.

## 12. Phases

Following the brief's phases (Terry's B1–B8 in brackets):

| Phase | Contents | Status |
|---|---|---|
| 0 Audit and architecture | Audit, spec, database, API, wallet plan | Docs done (this set) |
| 1 Infrastructure [B1–B3] | Schema, wallet service design, wallet security and migration plan | Schema done and tested on PGlite; bridge designed |
| 2 Company and IPO [B4] | Create, validate, approve, IPO, allotment | Next |
| 3 Trading engine [B5] | Orders, matching, partial fills, reservations, cancel, fees | |
| 4 Portfolio and UI [B6] | The Exchange screen | |
| 5 Company management | Reports, dividends, corporate actions | |
| 6 Security and deployment [B7–B8] | Concurrency, security, load and regression tests; dev database, then production with Terry's go-ahead | |

## 13. Decisions for Terry

1. **Database provider**, and permission to create it (one for production, one for the dev deploy). Netlify DB
   (Neon) is the closest fit. Needed before code runs on a deploy (phase 2 can be built and tested locally first).
2. **Entry point:** a Home row button or a village metro station.
3. **IPO allotment:** first come, first served for 24 h (default) or subscription then pro-rata.
4. **Company revenue:** where a company's coins come from after its IPO (phase 5).
5. **Deleting an account that still has exchange cash or shares.** Today deleting an account removes its game
   records; exchange cash would be stranded. Options: refuse deletion until the exchange is emptied (a small
   check added to the existing delete route), or move exchange cash back first and give shares to the treasury.
6. **Ranks:** whether the "richest" board counts exchange cash and shares, or stays game-wallet only (today's
   behaviour; the default).
