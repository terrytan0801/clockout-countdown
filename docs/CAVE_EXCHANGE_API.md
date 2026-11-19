# Cave Exchange (CEX): API

The routes the exchange adds. None of the existing routes change. They use the brief's paths and the existing
router: `handler.mjs` strips `/api/` and, for `exchange/*` (after `auth()`) and `admin/exchange/*` (after the
admin key check), hands the request to `netlify/lib/exchange/index.mjs`. Behaviour is in `CAVE_EXCHANGE_SPEC.md`.

## Conventions (same as the rest of the API)

- Players: `Authorization: Bearer <token>` from login. No token or a bad one: 401 (the phone signs out, as today).
- Admin: `x-admin-key` header, checked the existing way. Wrong or missing: 403.
- Bodies are JSON. Responses are JSON with `cache-control: no-store`. Errors are `{ "error": "<sentence>" }`
  with a 4xx status; unexpected failures are 500 with the usual message.
- Coins, shares and prices are whole numbers (JSON integers). Anything else is 400.
- Times are ISO 8601 UTC strings.
- **Idempotency:** every POST marked *key* needs `"key": "<uuid>"` in the body, made fresh by the phone for
  each action and reused on retries. A repeat with the same key gets the first answer (same status and body). The
  same key with a different body is 409 "That request was already used for something else."
- **Paging:** lists take `?before=<id>&limit=<n>` (limit up to 50, default 20) and return `{ items, next }`,
  where `next` is the `before` for the next page or `null`.
- Exchange down (database unreachable): 503 `{ "error": "The exchange is closed for a moment. Try again soon.", "cexDown": true }`.
  The rest of the app is unaffected.

Common errors: 400 bad input, 401 not signed in, 403 not yours / frozen / admin only, 404 no such company or
order, 409 conflict (duplicate symbol or name, key reused, wrong company status), 422 not enough coins or shares,
429 too many orders this minute.

---

## Wallet (custody bridge)

Not in the brief's list; needed for the custody bridge.

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/exchange/wallet` | | `{ wallet, cash: { balance, reserved, available }, transfers: [latest 10] }` (`wallet` = game coins) |
| `POST /api/exchange/wallet/deposit` *key* | `{ amount }` | `{ transfer: { id, state }, cash }`; 422 if the game wallet is short |
| `POST /api/exchange/wallet/to-wallet` *key* | `{ amount }` | `{ transfer, cash }`; 422 if available cash is short |

`amount`: whole coins, 1 to 1,000,000. The transfer id is derived from the key, so a retry finishes the same
transfer instead of starting another.

## Companies

| Method and path | Body / query | Returns | Who |
|---|---|---|---|
| `POST /api/exchange/company/create` *key* | `{ name, symbol, industry, description, authorizedShares, founderShares, publicShares, ipoPrice }` | `{ company }` (PENDING, not submitted) | any player, one live company each |
| `POST /api/exchange/company/:id/edit` | same fields | `{ company }` | founder, before submitting |
| `GET /api/exchange/company/list` | `?status=LISTED` (default) or `IPO`, `?q=` search by name or symbol | `{ items: [{ id, symbol, name, industry, status, lastPrice, lastTradeAt, change, marketValue }] }` | anyone |
| `GET /api/exchange/company/:id` | | `{ company, founder: { id, name }, stats }` | anyone (PENDING ones only to the founder) |
| `POST /api/exchange/company/:id/submit` | | `{ company }` (submitted, waiting for approval) | founder |
| `POST /api/exchange/company/:id/ipo` *key* | | `{ company }` (now IPO; shares issued) | founder, APPROVED only |
| `POST /api/exchange/company/:id/ipo/buy` *key* | `{ qty }` | `{ trade, cash, holding }` | any player while IPO is open |
| `GET /api/exchange/company/:id/financials` | `?period=day|week|month` | `{ cash, ipoProceeds, dividendsPaid, revenue, expenses, profit, lines }` from the coin ledger | anyone |
| `POST /api/exchange/company/:id/dividend` *key* | `{ perShare }` | `{ dividend }` | founder, LISTED, cash must cover it |

`:id` is the company id or its symbol.

## Trading

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /api/exchange/market` | | `{ items: [listed companies as in company/list], at }` (cached 60 s) |
| `GET /api/exchange/stock/:symbol` | | `{ company, lastPrice, lastTradeAt, prevClose, open, high, low, volume, marketValue, myHolding, myOpenOrders }` |
| `GET /api/exchange/stock/:symbol/chart` | `?span=1m|1h|1d&from=&to=` (at most 500 candles) | `{ span, candles: [{ t, o, h, l, c, v }] }` |
| `GET /api/exchange/stock/:symbol/orderbook` | | `{ bids: [{ price, qty, orders }], asks: [...] }`, top 10 prices per side; no player names |
| `GET /api/exchange/trades/:symbol` | paging | `{ items: [{ id, price, qty, at }], next }` |
| `POST /api/exchange/order/place` *key* | `{ symbol, side: "BUY"|"SELL", type: "LIMIT"|"MARKET", qty, price? }` | `{ order: { id, status, qty, filledQty, avgPrice, reason? }, fills: [{ price, qty, fee }], cash, holding }` |
| `POST /api/exchange/order/cancel` | `{ orderId }` | `{ order, cash, holding }` (cancelling twice is fine) |
| `GET /api/exchange/order/my` | `?open=1`, paging | `{ items: [orders], next }` |

`price` is required for LIMIT and refused for MARKET. A market order that finds nothing returns 200 with status
`CANCELLED` and `reason: "No one is selling right now."` (or buying).

## Portfolio

| Method and path | Returns |
|---|---|
| `GET /api/exchange/portfolio` | `{ cash: { balance, reserved, available }, value, holdingsValue, dayChange }` |
| `GET /api/exchange/portfolio/holdings` | `{ items: [{ symbol, name, qty, reserved, lastPrice, value, avgCost }] }` |
| `GET /api/exchange/portfolio/history` | paging; `{ items: [coin ledger lines with trade or transfer details], next }` |
| `GET /api/exchange/portfolio/dividends` | paging; `{ items: [{ symbol, perShare, qty, amount, at }], next }` |
| `GET /api/exchange/watchlist` | `{ items: [companies as in company/list] }` |
| `POST /api/exchange/watchlist` | body `{ symbol, on: true|false }`; `{ ok: true }` |

`value` uses last prices; `avgCost` is worked out from the player's own buys.

## Admin

All need `x-admin-key`.

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /api/admin/exchange/companies` | `?status=PENDING` | `{ items: [companies with founder names] }` |
| `POST /api/admin/exchange/company/approve` | `{ id, approve: true|false, note? }` | `{ company }` (APPROVED or REJECTED) |
| `POST /api/admin/exchange/company/suspend` | `{ id, suspend: true|false, note }` | `{ company }` (SUSPENDED or LISTED again) |
| `POST /api/admin/exchange/player/freeze` | `{ pid, frozen: true|false, note }` | `{ player }` |
| `GET /api/admin/exchange/settings` / `POST` | `{ feeBuyerBps?, feeSellerBps?, minFee?, minOrderValue?, orderTtlHours?, maxOrdersPerMinute? }` | `{ settings }` |
| `GET /api/admin/exchange/audit` | `?target=company:<id>|player:<pid>`, paging | `{ items: [audit lines], next }` |
| `GET /api/admin/exchange/reconciliation` | | `{ ok, views: { recon_shares: [...], … }, bridge: { stuck: [...], gameMismatch: [...] }, at }` |

Everything an admin does is written to the audit log with the action and note.

## Not in the brief's list, added here

`wallet`, `wallet/deposit`, `wallet/to-wallet`, `company/:id/edit`, `company/:id/ipo/buy`,
`company/:id/dividend`, `watchlist`, `admin/exchange/player/freeze` and `admin/exchange/settings`. The bridge
needs the wallet routes, the IPO needs a way to buy, and the screens and settings need the rest.
