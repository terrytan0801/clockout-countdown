# Cave Exchange (CEX): Stage A audit

Audit of the Clock-out Countdown codebase before designing Cave Exchange. Read from the source on `dev` at
`d3da427` (v79.0, the same code as production), 19 Nov 2026. No production code was changed for this audit.

The brief that asked for it was cut off in section 7 ("IPO Rules"), so the IPO rules and anything after them
(API, UI, testing, rollout) are not covered here yet.

---

## 1. Summary

- The app is one Netlify site: static files in `public/` (no build step) and three functions. All app data lives
  in **Netlify Blobs** as one record per key. There is no database.
- Monster coins are an **append-only key ledger in Blobs**: `led/<pid>/<id>/<amount>/<why>` plus a folded
  `coinbase/<pid>` total. The balance is computed on read. About 20 code paths credit or debit coins.
- Blobs gives strong per-key reads and writes, but **no multi-key transactions, and no compare-and-swap in the
  installed client** (`@netlify/blobs` 8.2.0 ignores `onlyIfNew`). Today's debits are check-then-write, so two
  requests at once can overspend.
- An order book, which has to move coins and shares between two players and several records together, can't be
  made safe on Blobs as used today. The brief's choice of a transactional database (PostgreSQL) is right for the
  exchange's money and shares.
- The hard part is the brief's own rule that two wallet systems must never both change the same funds. With coins
  in Blobs and the exchange in Postgres, phase 1 needs a **custody bridge**: coins are moved into an exchange
  account (one idempotent transfer) and spent only there. Section 9 has the options.
- Four things in the current code conflict with the brief's rules: ledger lines are deleted when folded and when an
  account is deleted, debits can race, and a few transfers are two separate writes. They are listed in section 8.
  None of them has to change for Stage A.

---

## 2. Stack and deployment

| Item | What's there |
|---|---|
| Runtime | Node 24 on Netlify Functions (`nodejs24.x`), ESM (`"type": "module"`), bundled by esbuild |
| Dependencies | `@netlify/blobs` ^8.1.0 (8.2.0 installed), `@netlify/functions` ^6.1.1, `web-push` ^3.6.7. No framework, no ORM, no database driver |
| Functions | `netlify/functions/api.mjs` (all of `/api/*`), `film-ring.mjs` (scheduled `*/5 * * * *`), `rain-alert.mjs` (scheduled `*/15 * * * *`: wages since v79, rain alerts, holiday tips) |
| Function region | `us-east-1` (Netlify default; choosing a region needs Netlify Pro, see the comment in `api.mjs`). Netlify plan: `nf_team_dev` |
| Static site | `public/` published as-is. `index.html` (~5,700 lines) is the whole client; art in `cave-home.js`, `village.js`, `monsters.js`, `monster-props.js`, `monsters.css`; `admin.html`; `sw.js` (service worker); `food-*.json` (FoodSpin data) |
| Environments | `main` deploys production (`splendid-gnome-120c81.netlify.app`). `dev` deploys `dev--splendid-gnome-120c81.netlify.app`, which uses its own store (`clockout-dev`). Production deploys cost Netlify credits; they happen only when Terry says so |
| Env vars | `ADMIN_KEY` (admin page). VAPID keys for push are generated once and kept in the store (`vapid`) |
| Headers / redirects | `netlify.toml`: no-cache on `sw.js`, manifest content types, `/admin` → `admin.html` |

---

## 3. API architecture

- **One function, one router.** `api.mjs` opens the stores and calls `makeApp(...).handle(req)` from
  `netlify/lib/handler.mjs` (~1,730 lines). `handle` strips `/api/` and matches `route` and `method` in a long
  `if` chain (`if (route === "zap" && method === "POST") { ... }`). There is no router library.
- **Bodies** are JSON for every POST except `clip` (multipart video). A bad body gives 400.
- **Responses** come from one helper, `json(body, status)`, with `cache-control: no-store`. Errors are
  `{ error: "<sentence for the user>" }` with a 4xx status. One `try/catch` around the whole router turns anything
  unexpected into 500 `{ error: "Something went wrong on the server…" }` and logs it.
- **Order of a request:** parse body → `migrate()` (old one-off data migrations) → `admin/*` routes (admin key) →
  public routes (`where`, `vapid`, `signup`, `login`, signed media links) → `auth()` → everything else.
- **Scheduled work** is exposed from `makeApp` as `rainAlerts`, `ringTick`, `holidayTips` and `payday`, called by
  the scheduled functions with the same store.
- **The v54 store move:** until `sys/moved` exists, every request returns 503 `{moving:true}` and phones retry.
  It's long done in production; new code should still not write before the check passes.
- **Change notices:** `ver/<cid>` changes when anything a cave's board shows changes, so phones can ask "still the
  same?" (`state?v=…`). `wv/<pid>` does the same for a person's coins. An exchange screen can use the same idea.

New routes for the exchange fit this pattern as one more block in `handle` that hands off to an
`exchange/index.mjs` module (`if (route.startsWith("cex/")) return exchange.handle(...)`), after `auth()`.

---

## 4. Authentication and authorization

- **Players** sign up with a unique name and a passcode of 4+ characters. The passcode is stored as
  `scrypt(pin, salt, 32)` in `person/<pid>` and compared with `timingSafeEqual`. Five wrong tries lock the name
  for 10 minutes (`lock/<name>`).
- **Sessions:** login returns a random 48-hex-character token, stored as `sessions/<token> {pid, at}`. The client
  sends `Authorization: Bearer <token>`. A warm function caches token → pid for a while (`SESSION_CACHE_MS`).
  Sessions don't expire on their own; logout deletes the key.
- **Identity:** `pid` like `p-1a34429745`, record `person/<pid>` with name, clock-out time, colour, monster,
  cave and region. Names are unique through `uname/<lower name>`.
- **Admin:** routes under `admin/` need the `x-admin-key` header. It is compared as SHA-256 with
  `timingSafeEqual` against `ADMIN_KEY` from Netlify (no default since v62; without it the admin page is shut).
  Admin routes today: `admin/stats`, `admin/reset-pin`. IPO approval would be a new admin route here.
- **Authorization** is by cave membership checks inside each route (`me.cave`), not roles. There are no roles
  besides "admin key" and "cave owner" (`cave/<cid>.owner`).
- **Dev-only routes** (`dev/ring`, `dev/coins` +5000) exist only on the dev deploy (`isDevDeploy`).

---

## 5. Data storage

### 5.1 Stores

`netlify/lib/stores.mjs` opens two Blobs stores with `consistency: "strong"`:

- `clockout` in `ap-southeast-1` (Singapore): videos and cover frames (`clip/`, `thumb/`), and the old copy of
  everything from before v54 (kept as a backup).
- `clockout-near` in the functions' region (`us-east-1`): every other record since v54.

`split()` routes each key by its prefix. The dev deploy uses `clockout-dev` / `clockout-dev-near`.

### 5.2 Key layout

Every record has its own key, so two people acting at once never overwrite each other's records. The full list is
at the top of `handler.mjs`. Many records carry their data in the key and an empty value ("everything in the key"),
so one listing reads a whole set. Ones that matter for the exchange:

| Key | Value | Notes |
|---|---|---|
| `person/<pid>` | `{id,name,h,m,…,cave,salt,hash}` | the player |
| `member/<cid>/<pid>` | `{at}` | cave membership |
| `led/<pid>/<id>/<amount>/<why>` | `0` | one coin ledger line; `id` = 13-digit ms time + 6 hex |
| `coinbase/<pid>` | `{bal, upto}` | folded total of ledger lines up to id `upto` |
| `wv/<pid>` | random | changes whenever coins change |
| `paid/<pid>/<day>/<what>` | `0` | "paid once" markers (wage, streak, clip, little jobs) |
| `work/<pid>/<day>` | `0` | opened on a workday, wage not yet paid |
| `don/<cid>/<building>/<id>/<pid>/<coins>` | `0` | a village donation |
| `bag/…`, `tank/…`, `hi/…`, `plot/…` | `0` | fish, aquariums, home items, farm plots |
| `ev/<kind>/<ts13>_<parts>` | `0` | stats event log, kept 90 days (`msg`, `zap`, `clip`, `fish`, …) |
| `lvl/<pid>` | `{streak, lastDay, …}` | streak and monster level |

### 5.3 What Blobs can and can't do here

- Strong consistency per key, read-after-write in one region.
- **No transactions across keys.** Each `set`/`delete` stands alone; `Promise.all` of several writes can half
  succeed.
- **No compare-and-swap in the installed client.** `claimKey` checks `exists` and then writes with `onlyIfNew`,
  which 8.2.0 ignores, so there's a small race window (the comment in `handler.mjs` says so). Newer
  `@netlify/blobs` versions support conditional writes (`onlyIfNew`, `onlyIfMatch` on an etag), which would give
  per-key optimistic locking. That still doesn't make several records change together.
- **Listing** is by prefix; large prefixes cost a full listing each time (see `evSince` for the time-sliced
  workaround).

---

## 6. Wallet and coin ledger

### 6.1 How it works (`handler.mjs`, around lines 370–400)

- `credit(pid, amount, why)` writes one key `led/<pid>/<id>/<amount>/<why>` (amount can be negative) and bumps
  `wv/<pid>`. Nothing else.
- `wallet(pid)` reads `coinbase/<pid>` and lists `led/<pid>/`, keeps lines with `id > upto`, and returns
  `{coins: base.bal + Σ amounts, log, base}`.
- **Folding** (in `settle`, on app open): when a person has more than 40 lines, all but the newest 10 (and none
  younger than a minute) are added into `coinbase/<pid>` and **those `led` keys are deleted**.
- **"Paid once"** uses `payOnce(pid, day, what)` = `claimKey("paid/<pid>/<day>/<what>")`.
- Amounts are integers (`Math.trunc`); wages with a percentage bonus are `Math.round`ed before writing. No
  floating-point amounts are stored.

### 6.2 Everything that changes coins

| Path | Direction | Why tag | Guard |
|---|---|---|---|
| Welcome (`welcome`) | + 100 once | `welcome` | `claimKey(paid/<pid>/welcome)` |
| Wage (`payWage`, from the app and from `payday` every 15 min) | + 250 (×2 public holiday) × active bonus, + coffee 10 | `pay.<day>` / `holiday.<day>` | `payOnce(…, "pay")` |
| 5-day streak (`touchStreak`) | + 50 | `streak.<n>` | `payOnce(…, "streak")` |
| Filming a ring | + 15 / + 5 late | `clip` / `cliplate` | `payOnce(…, "clip<r>")` |
| Little jobs: water, pet, vending machine | + 2 / 2 / 3 | `water` `pet` `vend` | `payOnce` |
| Tending someone's crop | + tip | `tend.<pid>` | `payOnce` |
| Zap | victim − 1–10 %, zapper + same | `zapby.<pid>` / `zap.<pid>` | 10-minute cooldown; **two separate writes** |
| Fish sale / crop sale | + price | `fishsale.<n>` / `cropsale.<n>` | items deleted first, then credited |
| Village donation | − amount | `build.<kind>` | balance read first (**check-then-write**) |
| Seeds | − price, refund if the plot was taken | `seed.<kind>` / `seedback.<kind>` | balance read first |
| Shop buy / sell | − price / + half | `buy.<kind>` / `sell.<kind>` | balance read first |
| Dev gift (dev deploy only) | + 5000 | `devgift` | none |

Coins are **read** by `state` (balance and recent log for the phone), `zap` (victim's balance), village, farm and
shop (before a debit), `ranks` (everyone's balance), and `settle` (folding).

### 6.3 What the client does

The phone never computes balances. It shows `me.coins` and `me.coinLog` from `state`, labels lines with
`whyText()`, and refreshes when `wv/<pid>` changes. Any coin change the exchange makes shows up in the wallet for
free if it goes through the same ledger or the same `state` reply.

---

## 7. Frontend

- Vanilla JS in one file, no build. Views: Board (lanes), Chat, Days, Home (rooms, village, bag, shop, Ranks,
  FoodSpin); bottom sheets for dialogs (`.sheet` + `.sheet-card`), closed by tapping outside.
- `api(path, body, method)` wraps `fetch` with the token, shows a spinner on the button pressed, retries 503
  `moving`, signs the player out on 401, and throws `Error(d.error)` for other failures; each caller shows it
  (usually with `toast`).
- Design tokens are CSS custom properties on `:root` (v55 "Strip Map": charcoal sign, Barlow fonts, square
  corners), with a dark-mode set. CSS class names are global and some short ones clash; new classes are prefixed.
  **Never name a class `.dev`**: the dev deploy puts `dev` on `<html>` (v67).
- PWA: `sw.js` keeps a per-version offline copy of the page and same-origin files, and receives push (zaps).
- A new Exchange screen can be a new sheet or view plus a separate `public/exchange/exchange.js`, loaded only
  when opened, without touching existing views. It still needs **one entry point** on an existing screen (see 8.6).

---

## 8. Conflicts and risks

### 8.1 Ledger lines are deleted today (conflicts with "immutable ledger", "never clear Coins Ledger records")
Folding deletes old `led` keys after adding them into `coinbase`. Account deletion (`me` → `delete`) deletes all of
the person's `led`, `paid`, `work`, `bag`… keys. The history is therefore not complete today. Leave both as they
are for Stage A. A real exchange ledger should never fold or delete; if the game ledger is ever migrated, the
folded totals become opening balances.

### 8.2 Debits can race (conflicts with "prevent double spending", "prevent negative balances")
Donations, seeds and shop purchases read the balance and then write a negative line. Two requests at the same
moment can both pass the check and push the balance below zero. With friends tapping by hand this is rare, but an
exchange with orders must not work this way.

### 8.3 Transfers are separate writes
A zap writes the victim's −N and the zapper's +N in one `Promise.all`; if one write fails, coins appear or vanish.
The exchange must do every transfer (coins and shares, both sides, fees) in one transaction.

### 8.4 Fold boundary and clock skew
Folding hides every line with `id <= upto`. Line ids come from each function instance's own clock. If two instances
disagree by more than the one-minute margin, a line written "in the past" after a fold would be hidden. Unlikely,
but it means the Blobs ledger can't be the reconciliation source of truth for an exchange.

### 8.5 Two wallet systems (the brief's own rules pull against each other)
The brief wants Postgres for exchange money **and** "never allow the old and new wallet systems to independently
modify the same player's funds". With game rewards still writing to Blobs, either (a) coins move between the two
through a custody bridge so each pool has one owner (section 9, option 2), or (b) every coin path in section 6.2
moves to Postgres before the exchange opens (option 3). (b) is a large migration touching every feature that pays
or charges coins.

### 8.6 UI rule vs. an entry point
"Do not change existing interfaces" vs. the exchange needing a way in. The least intrusive options: a new button
in the Home row next to Village, Bag, Shop and Ranks (the same way Ranks was added in v78), or a new station on the
village metro map. Either is a small addition to an existing screen; Terry should pick one.

### 8.7 New infrastructure
Postgres means a new service, connection settings, a second database for the dev deploy (it must never touch
production data), and new failure modes: if the database is down, the exchange is down, but the rest of the app must
keep working. Netlify's own Postgres (Netlify DB, on Neon) or an external Neon/Supabase project would work. Setting
one up needs an account and Terry's go-ahead. Connections from serverless functions should go through Neon's HTTP
driver or a pooler.

### 8.8 Latency
Functions run in `us-east-1`; players are in Singapore and Malaysia, so every request already crosses the Pacific
once (~200 ms). The database should sit next to the functions (`us-east-1`), not in Singapore, or each query adds
another round trip.

### 8.9 Scale and fairness
A cave has at most 30 members (`MAX_MEMBERS`) and usually a handful, and there are no NPC traders, so books
will be thin. Markets
may sit with no bid or no ask for long stretches; market orders need a rule for "nothing to match" (cancel the
rest, never fill at any price). Friends could pump one company between themselves; fine for a game, but worth a
price band or circuit breaker.

### 8.10 Scope of the brief
This is virtual, non-transferable game currency (monster coins can't be bought or cashed out). The exchange
should keep it that way; nothing in it should connect to real money.

---

## 9. Wallet integration options

| | 1. Exchange in Blobs | 2. Custody bridge (recommended for phase 1) | 3. Move all coins to Postgres first |
|---|---|---|---|
| Where coins live | Blobs ledger only | Game coins in Blobs; exchange coins in Postgres | Postgres only |
| Order matching safety | Not safe: no multi-key transactions | Safe: inside one Postgres transaction | Safe |
| Changes to existing features | None | None (only new deposit/withdraw routes) | Every coin path in 6.2, plus `state` and `ranks` |
| "One owner per pool" | Yes, but unsafe | Yes: a coin is either in the game wallet or in the exchange account, never both | Yes |
| Migration risk | None | Low: no existing data moves | High: needs the full migration plan and a cutover |
| Player experience | One balance | Two balances ("wallet" and "exchange cash"), moved by Deposit/Withdraw | One balance |

**Option 2 in detail.** Deposit: write the Blobs debit `led/<pid>/<id>/-N/cex.dep.<tid>` (guarded by
`claimKey("cexdep/<tid>")`), then insert the Postgres credit with `tid` as a unique idempotency key; a retry with the
same `tid` finishes the second half without repeating the first. Withdraw is the reverse, Postgres first (one
transaction that checks the balance), then the Blobs credit `cex.wd.<tid>`. A reconciliation job compares
Σ deposits − Σ withdrawals in both systems. The game's existing check-then-write race (8.2) still applies to the
deposit debit; it can be closed for that one path with a per-player lock key or by upgrading `@netlify/blobs` and
using `onlyIfMatch` on a per-player balance record.

Option 3 can follow later, using option 2's reconciliation as its shadow check. The `WALLET_MIGRATION_PLAN.md`
asked for in the brief should be written around that path.

---

## 10. Recommended architecture

- **Code:** `netlify/lib/exchange/` as in the brief (`index.mjs` router, `companies`, `ipo`, `orders`,
  `matching`, `ledger`, `portfolio`, `dividends`, `corporate-actions`, `market`, `validation`, `constants`),
  called from one new block in `handler.mjs` after `auth()` (`cex/*` routes). Admin IPO approval under `admin/cex/*`
  with the existing admin key. No changes to existing routes.
- **Data:** Postgres for wallets (exchange cash), holdings, orders, trades, ledgers, reservations, dividends,
  corporate actions, idempotency keys and audit logs; integers for coins and shares; matching inside one
  serializable (or row-locked) transaction per incoming order. Blobs only for public snapshots (last price, candles
  cache) and a `cexv/<company>` change notice like `ver/<cid>`.
- **Identity:** players referenced by the existing `pid` (`p-…`); the exchange never stores passcodes or sessions.
- **Money in/out:** option 2 (custody bridge) in phase 1.
- **Environments:** a separate Postgres database for the dev deploy, chosen by `isDevDeploy`, the way the Blobs
  store is.
- **Client:** a new view or sheet and `public/exchange/exchange.js`, loaded on demand, reusing the existing tokens
  and components. One entry point to be agreed (8.6).
- **Tests:** the existing style (plain Node scripts with `assert`, `memStore` for Blobs), plus tests against a real
  Postgres (a local or throwaway Neon branch) for matching, reservations, idempotency and reconciliation. Add them
  to `npm test` only once they can run without a production database.

---

## 11. Decisions needed from Terry before Stage B

1. The rest of the brief from "IPO Rules" on (it was cut off).
2. Postgres: Netlify DB (Neon) or another provider, and permission to create it (production and dev databases).
3. ~~Wallet integration: option 2 (custody bridge, two balances) for phase 1, or option 3 (move all coins first).~~
   **Decided 19 Nov 2026 by Terry: option 2, the custody bridge.** Game coins stay in the Blobs ledger; players
   deposit into and withdraw from an exchange cash account in Postgres, and each coin is in one place at a time.
4. Where the Exchange opens from (a Home-row button or a village metro station).
5. Whether the existing ledger folding and account-deletion behaviour (8.1) should change. This audit doesn't
   change them.
