-- Cave Exchange (CEX), migration 0001: the schema.
-- Stage B1. Plain PostgreSQL (14+), so it runs on Netlify DB / Neon / Supabase alike. Run it once per database
-- (production and dev each have their own). It only creates objects inside the "cex" schema and touches nothing
-- else; it never reads or writes the game's Netlify Blobs.
--
-- Money rules:
--   * Coins and share quantities are BIGINT whole numbers. No floats, no NUMERIC fractions.
--   * A price is whole coins per share (tick size 1 coin). A trade's value is price * qty, a whole number.
--   * Ledgers are append-only (triggers refuse UPDATE and DELETE).
--   * Every coin movement is double-entry: the entries of one txn_id sum to zero (checked at COMMIT).
--   * Balances, holdings and reservations can never go below zero (CHECK constraints).
--
-- Coins enter and leave only through the custody bridge (cex.bridge_transfers): a deposit takes coins out of the
-- game wallet (Netlify Blobs ledger) and books them here against the system account 'bridge'; a withdrawal does the
-- reverse. So every coin is in exactly one of the two systems at a time.

BEGIN;

CREATE SCHEMA IF NOT EXISTS cex;
SET LOCAL search_path = cex;

-- ---------------------------------------------------------------- enums
CREATE TYPE company_status AS ENUM ('PENDING', 'APPROVED', 'IPO', 'LISTED', 'SUSPENDED', 'DELISTED', 'BANKRUPT', 'REJECTED');
CREATE TYPE order_side     AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type     AS ENUM ('LIMIT', 'MARKET');
CREATE TYPE order_status   AS ENUM ('OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED');
CREATE TYPE account_type   AS ENUM ('PLAYER', 'COMPANY', 'BRIDGE', 'FEES');
CREATE TYPE holder_type    AS ENUM ('PLAYER', 'TREASURY');
CREATE TYPE reserve_kind   AS ENUM ('COINS', 'SHARES');
CREATE TYPE reserve_status AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');
CREATE TYPE bridge_dir     AS ENUM ('DEPOSIT', 'WITHDRAW');
CREATE TYPE bridge_state   AS ENUM ('PENDING', 'GAME_DONE', 'COMPLETED', 'FAILED');

-- ---------------------------------------------------------------- 1. players
-- A reference to the game's person/<pid>. Created the first time someone uses the exchange; the game keeps
-- the real record (name, passcode, cave). The exchange never stores passcodes or sessions.
CREATE TABLE players (
  id          TEXT PRIMARY KEY CHECK (id ~ '^p-[0-9a-z]{3,32}$'),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  cave_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen      BOOLEAN NOT NULL DEFAULT false   -- an admin can stop someone trading without touching their records
);

-- ---------------------------------------------------------------- 2. wallets (exchange cash)
-- One per player. balance is spendable + reserved; reserved is what open buy orders hold.
CREATE TABLE wallets (
  player_id   TEXT PRIMARY KEY REFERENCES players(id),
  balance     BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved    BIGINT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reserved <= balance)
);

-- ---------------------------------------------------------------- 4. companies
CREATE TABLE companies (
  id                 BIGSERIAL PRIMARY KEY,
  symbol             TEXT NOT NULL UNIQUE CHECK (symbol ~ '^[A-Z][A-Z0-9]{1,4}$'),
  name               TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  industry           TEXT NOT NULL CHECK (length(industry) BETWEEN 2 AND 30),
  description        TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  founder_id         TEXT NOT NULL REFERENCES players(id),
  authorized_shares  BIGINT NOT NULL CHECK (authorized_shares > 0),
  issued_shares      BIGINT NOT NULL DEFAULT 0 CHECK (issued_shares >= 0),
  founder_shares     BIGINT NOT NULL CHECK (founder_shares >= 0),
  public_shares      BIGINT NOT NULL CHECK (public_shares > 0),
  ipo_price          BIGINT NOT NULL CHECK (ipo_price > 0),
  status             company_status NOT NULL DEFAULT 'PENDING',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at       TIMESTAMPTZ,          -- NULL while the founder is still editing; set by "submit for approval"
  approved_at        TIMESTAMPTZ,
  approved_by        TEXT,                 -- "admin" (the game's admin key holder)
  ipo_ends_at        TIMESTAMPTZ,          -- set when the IPO starts (24 h later); IPO buys are refused after it
  listed_at          TIMESTAMPTZ,
  CHECK (issued_shares <= authorized_shares),
  CHECK (founder_shares + public_shares <= authorized_shares)
);
CREATE UNIQUE INDEX companies_name_unique ON companies (lower(name));
CREATE INDEX companies_status ON companies (status);

-- ---------------------------------------------------------------- 10. company accounts (company cash)
-- IPO proceeds land here; dividends are paid from here.
CREATE TABLE company_accounts (
  company_id  BIGINT PRIMARY KEY REFERENCES companies(id),
  balance     BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- 5. share holdings
-- holder_type TREASURY means the company's own unsold or bought-back shares (holder_id = company id as text).
CREATE TABLE share_holdings (
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  holder_type  holder_type NOT NULL,
  holder_id    TEXT NOT NULL,
  qty          BIGINT NOT NULL DEFAULT 0 CHECK (qty >= 0),
  reserved     BIGINT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, holder_type, holder_id),
  CHECK (reserved <= qty)
);
CREATE INDEX share_holdings_holder ON share_holdings (holder_type, holder_id);

-- ---------------------------------------------------------------- 7. orders
-- seq gives time priority: lower seq first at the same price.
CREATE TABLE orders (
  id               BIGSERIAL PRIMARY KEY,
  seq              BIGSERIAL NOT NULL UNIQUE,
  company_id       BIGINT NOT NULL REFERENCES companies(id),
  player_id        TEXT NOT NULL REFERENCES players(id),
  side             order_side NOT NULL,
  type             order_type NOT NULL,
  limit_price      BIGINT CHECK (limit_price IS NULL OR limit_price > 0),
  qty              BIGINT NOT NULL CHECK (qty > 0),
  filled_qty       BIGINT NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
  filled_value     BIGINT NOT NULL DEFAULT 0 CHECK (filled_value >= 0),   -- sum of price * qty of its fills
  fees_paid        BIGINT NOT NULL DEFAULT 0 CHECK (fees_paid >= 0),      -- fees charged so far (fee is on the order's running total)
  status           order_status NOT NULL DEFAULT 'OPEN',
  reject_reason    TEXT,                         -- why it was rejected or cancelled early (self-trade, nothing to match)
  idempotency_key  TEXT,
  expires_at       TIMESTAMPTZ,                  -- limit orders: created_at + settings.order_ttl_hours; market orders never rest
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (filled_qty <= qty),
  CHECK ((type = 'LIMIT') = (limit_price IS NOT NULL)),          -- limit orders have a price, market orders don't
  CHECK (status <> 'FILLED' OR filled_qty = qty),
  UNIQUE (player_id, idempotency_key)
);
-- The book: open orders per company and side, best price first, then oldest.
CREATE INDEX orders_book_buy  ON orders (company_id, limit_price DESC, seq) WHERE side = 'BUY'  AND status IN ('OPEN', 'PARTIAL');
CREATE INDEX orders_book_sell ON orders (company_id, limit_price ASC,  seq) WHERE side = 'SELL' AND status IN ('OPEN', 'PARTIAL');
CREATE INDEX orders_player ON orders (player_id, created_at DESC);
CREATE INDEX orders_expiring ON orders (expires_at) WHERE status IN ('OPEN', 'PARTIAL');

-- ---------------------------------------------------------------- 8. trades
CREATE TABLE trades (
  id             BIGSERIAL PRIMARY KEY,
  company_id     BIGINT NOT NULL REFERENCES companies(id),
  buy_order_id   BIGINT REFERENCES orders(id),     -- NULL for an IPO allotment (bought from the treasury)
  sell_order_id  BIGINT REFERENCES orders(id),     -- NULL for an IPO allotment
  buyer_id       TEXT NOT NULL REFERENCES players(id),
  seller_type    holder_type NOT NULL,
  seller_id      TEXT NOT NULL,
  price          BIGINT NOT NULL CHECK (price > 0),
  qty            BIGINT NOT NULL CHECK (qty > 0),
  value          BIGINT GENERATED ALWAYS AS (price * qty) STORED,
  fee_buyer      BIGINT NOT NULL DEFAULT 0 CHECK (fee_buyer >= 0),
  fee_seller     BIGINT NOT NULL DEFAULT 0 CHECK (fee_seller >= 0),
  txn_id         UUID NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT (seller_type = 'PLAYER' AND seller_id = buyer_id))  -- nobody trades with themselves
);
CREATE INDEX trades_company_time ON trades (company_id, created_at DESC);
CREATE INDEX trades_buyer  ON trades (buyer_id, created_at DESC);
CREATE INDEX trades_seller ON trades (seller_type, seller_id, created_at DESC);

-- ---------------------------------------------------------------- 9. reservations
-- What an open order holds: coins for a buy, shares for a sell. remaining goes down as the order fills.
CREATE TABLE reservations (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL UNIQUE REFERENCES orders(id),
  kind        reserve_kind NOT NULL,
  player_id   TEXT NOT NULL REFERENCES players(id),
  company_id  BIGINT REFERENCES companies(id),
  amount      BIGINT NOT NULL CHECK (amount > 0),
  remaining   BIGINT NOT NULL CHECK (remaining >= 0),
  status      reserve_status NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (remaining <= amount),
  CHECK ((kind = 'SHARES') = (company_id IS NOT NULL)),
  CHECK (status = 'ACTIVE' OR remaining = 0)
);
CREATE INDEX reservations_active ON reservations (player_id, kind) WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------- 3. coin ledger (append-only, double-entry)
-- account_id: player id (PLAYER), company id as text (COMPANY), 'bridge' (BRIDGE: the game wallet's side of
-- deposits and withdrawals), 'fees' (FEES).
CREATE TABLE coin_ledger (
  id             BIGSERIAL PRIMARY KEY,
  txn_id         UUID NOT NULL,
  account_type   account_type NOT NULL,
  account_id     TEXT NOT NULL,
  amount         BIGINT NOT NULL CHECK (amount <> 0),
  balance_after  BIGINT,                           -- for PLAYER and COMPANY accounts; NULL for system accounts
  kind           TEXT NOT NULL CHECK (kind ~ '^[a-z_]{3,30}$'),  -- deposit, withdraw, trade_buy, trade_sell, fee, ipo_buy, ipo_proceeds, dividend_out, dividend_in
  ref_type       TEXT,                             -- 'trade', 'bridge', 'dividend', 'order'
  ref_id         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coin_ledger_txn ON coin_ledger (txn_id);
CREATE INDEX coin_ledger_account ON coin_ledger (account_type, account_id, id);

-- ---------------------------------------------------------------- 6. share ledger (append-only)
-- For moves (trades, IPO allotments) the entries of one txn_id and company sum to zero. Issuance and corporate
-- actions change issued_shares and carry kind 'issue' / 'cancel' / 'split'; those are checked against the
-- company's issued_shares by the reconciliation view instead.
CREATE TABLE share_ledger (
  id           BIGSERIAL PRIMARY KEY,
  txn_id       UUID NOT NULL,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  holder_type  holder_type NOT NULL,
  holder_id    TEXT NOT NULL,
  qty          BIGINT NOT NULL CHECK (qty <> 0),
  qty_after    BIGINT NOT NULL CHECK (qty_after >= 0),
  kind         TEXT NOT NULL CHECK (kind ~ '^[a-z_]{3,30}$'),   -- ipo_issue, issue, ipo_buy, trade_buy, trade_sell, split, cancel
  ref_type     TEXT,
  ref_id       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX share_ledger_txn ON share_ledger (txn_id);
CREATE INDEX share_ledger_holder ON share_ledger (company_id, holder_type, holder_id, id);
-- The IPO issues shares once: at most one 'ipo_issue' entry per company for the founder and one for the treasury.
CREATE UNIQUE INDEX share_ledger_ipo_once ON share_ledger (company_id, holder_type) WHERE kind = 'ipo_issue';

-- ---------------------------------------------------------------- 11. dividends
CREATE TABLE dividends (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL REFERENCES companies(id),
  per_share    BIGINT NOT NULL CHECK (per_share > 0),
  record_at    TIMESTAMPTZ NOT NULL,             -- holders at this moment are paid
  total        BIGINT CHECK (total IS NULL OR total >= 0),
  status       TEXT NOT NULL DEFAULT 'DECLARED' CHECK (status IN ('DECLARED', 'PAID', 'CANCELLED')),
  txn_id       UUID UNIQUE,
  declared_by  TEXT NOT NULL REFERENCES players(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at      TIMESTAMPTZ
);
CREATE INDEX dividends_company ON dividends (company_id, created_at DESC);

-- ---------------------------------------------------------------- 12. corporate actions
CREATE TABLE corporate_actions (
  id            BIGSERIAL PRIMARY KEY,
  company_id    BIGINT NOT NULL REFERENCES companies(id),
  kind          TEXT NOT NULL CHECK (kind IN ('SPLIT', 'REVERSE_SPLIT', 'ISSUE', 'BUYBACK', 'SUSPEND', 'RESUME', 'DELIST', 'BANKRUPT', 'RENAME')),
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'DONE', 'CANCELLED')),
  requested_by  TEXT NOT NULL,
  approved_by   TEXT,
  txn_id        UUID UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_at  TIMESTAMPTZ
);
CREATE INDEX corporate_actions_company ON corporate_actions (company_id, created_at DESC);

-- ---------------------------------------------------------------- 13. candles
CREATE TABLE candles (
  company_id    BIGINT NOT NULL REFERENCES companies(id),
  span          TEXT NOT NULL CHECK (span IN ('1m', '1h', '1d')),
  bucket_start  TIMESTAMPTZ NOT NULL,
  open          BIGINT NOT NULL CHECK (open > 0),
  high          BIGINT NOT NULL CHECK (high > 0),
  low           BIGINT NOT NULL CHECK (low > 0),
  close         BIGINT NOT NULL CHECK (close > 0),
  volume        BIGINT NOT NULL DEFAULT 0 CHECK (volume >= 0),
  trade_count   INTEGER NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
  PRIMARY KEY (company_id, span, bucket_start),
  CHECK (low <= open AND low <= close AND high >= open AND high >= close AND low <= high)
);

-- ---------------------------------------------------------------- 14. idempotency keys
-- A retried request with the same key gets the first answer back instead of running twice.
CREATE TABLE idempotency_keys (
  player_id     TEXT NOT NULL,
  key           TEXT NOT NULL CHECK (length(key) BETWEEN 8 AND 80),
  route         TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  response      JSONB,
  status_code   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, key)
);

-- ---------------------------------------------------------------- 15. audit log (append-only)
CREATE TABLE audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('PLAYER', 'ADMIN', 'SYSTEM')),
  actor_id     TEXT NOT NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_target ON audit_logs (target_type, target_id, created_at DESC);

-- ---------------------------------------------------------------- 16. custody bridge transfers
-- One row per deposit or withdrawal. id is generated by the server before either side is touched and is also
-- written into the game ledger line (led/<pid>/<id>/<amount>/cex.dep.<id> or cex.wd.<id>), so a retry can finish
-- a transfer without repeating it, and reconciliation can match both sides.
--   DEPOSIT:  PENDING -> GAME_DONE (game wallet debited) -> COMPLETED (exchange credited), or FAILED before GAME_DONE
--   WITHDRAW: PENDING -> COMPLETED is not allowed directly; the exchange debit and the move to GAME_DONE happen in
--             one transaction, then the game credit is written and the row becomes COMPLETED.
CREATE TABLE bridge_transfers (
  id          UUID PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id),
  direction   bridge_dir NOT NULL,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  state       bridge_state NOT NULL DEFAULT 'PENDING',
  game_key    TEXT,                               -- the led/... key written in Blobs
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bridge_transfers_open ON bridge_transfers (state, created_at) WHERE state IN ('PENDING', 'GAME_DONE');
CREATE INDEX bridge_transfers_player ON bridge_transfers (player_id, created_at DESC);

-- ---------------------------------------------------------------- 17. settings (one row)
-- Fees and limits the admin can change without a deploy; every change is written to audit_logs by the code.
-- Fee on a trade side = 0 if its bps is 0, else max(min_fee, ceil(value * bps / 10000)).
CREATE TABLE settings (
  id                     BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  fee_buyer_bps          INTEGER NOT NULL DEFAULT 25 CHECK (fee_buyer_bps BETWEEN 0 AND 500),    -- 25 = 0.25%
  fee_seller_bps         INTEGER NOT NULL DEFAULT 25 CHECK (fee_seller_bps BETWEEN 0 AND 500),
  min_fee                BIGINT NOT NULL DEFAULT 1 CHECK (min_fee >= 0),
  min_order_value        BIGINT NOT NULL DEFAULT 10 CHECK (min_order_value >= 1),                -- coins
  order_ttl_hours        INTEGER NOT NULL DEFAULT 168 CHECK (order_ttl_hours BETWEEN 1 AND 2160),
  max_orders_per_minute  INTEGER NOT NULL DEFAULT 20 CHECK (max_orders_per_minute >= 1),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             TEXT
);
INSERT INTO settings DEFAULT VALUES;

-- ---------------------------------------------------------------- 18. watchlist
CREATE TABLE watchlist (
  player_id   TEXT NOT NULL REFERENCES players(id),
  company_id  BIGINT NOT NULL REFERENCES companies(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, company_id)
);

-- ---------------------------------------------------------------- guards
-- Append-only tables: no UPDATE, no DELETE, no TRUNCATE.
CREATE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql SET search_path = cex AS $$
BEGIN
  RAISE EXCEPTION 'cex.%: records are append-only (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER coin_ledger_append_only  BEFORE UPDATE OR DELETE ON coin_ledger  FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER share_ledger_append_only BEFORE UPDATE OR DELETE ON share_ledger FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER trades_append_only       BEFORE UPDATE OR DELETE ON trades       FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER audit_logs_append_only   BEFORE UPDATE OR DELETE ON audit_logs   FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER coin_ledger_no_truncate  BEFORE TRUNCATE ON coin_ledger  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER share_ledger_no_truncate BEFORE TRUNCATE ON share_ledger FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER trades_no_truncate       BEFORE TRUNCATE ON trades       FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER audit_logs_no_truncate   BEFORE TRUNCATE ON audit_logs   FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

-- Double-entry: at COMMIT, the coin entries of each txn_id sum to zero.
CREATE FUNCTION coin_txn_balances() RETURNS trigger LANGUAGE plpgsql SET search_path = cex AS $$
DECLARE s BIGINT;
BEGIN
  SELECT sum(amount) INTO s FROM coin_ledger WHERE txn_id = NEW.txn_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'cex.coin_ledger: txn % does not balance (sum %)', NEW.txn_id, s USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER coin_ledger_balanced AFTER INSERT ON coin_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coin_txn_balances();

-- Share moves: at COMMIT, a txn's entries per company sum to zero unless the txn issues, cancels or splits shares.
CREATE FUNCTION share_txn_balances() RETURNS trigger LANGUAGE plpgsql SET search_path = cex AS $$
DECLARE s BIGINT; changes_supply BOOLEAN;
BEGIN
  SELECT sum(qty), bool_or(kind IN ('ipo_issue', 'issue', 'cancel', 'split')) INTO s, changes_supply
    FROM share_ledger WHERE txn_id = NEW.txn_id AND company_id = NEW.company_id;
  IF NOT changes_supply AND s <> 0 THEN
    RAISE EXCEPTION 'cex.share_ledger: txn % moves shares of company % out of nowhere (sum %)', NEW.txn_id, NEW.company_id, s
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER share_ledger_balanced AFTER INSERT ON share_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION share_txn_balances();

-- Supply: at COMMIT, a company's issued_shares must equal the sum of its share ledger. So issued_shares can only
-- change together with ledger entries that issue, cancel or split shares (which only the IPO and admin-approved
-- corporate actions write); nobody can just raise the number.
CREATE FUNCTION company_supply_matches() RETURNS trigger LANGUAGE plpgsql SET search_path = cex AS $$
DECLARE issued BIGINT; total BIGINT;
BEGIN
  SELECT c.issued_shares, coalesce((SELECT sum(qty) FROM share_ledger l WHERE l.company_id = c.id), 0)
    INTO issued, total FROM companies c WHERE c.id = NEW.company_id;
  IF issued <> total THEN
    RAISE EXCEPTION 'cex.companies: company % has % issued shares but % in its share ledger', NEW.company_id, issued, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION company_supply_matches_co() RETURNS trigger LANGUAGE plpgsql SET search_path = cex AS $$
DECLARE total BIGINT;
BEGIN
  SELECT coalesce(sum(qty), 0) INTO total FROM share_ledger WHERE company_id = NEW.id;
  IF NEW.issued_shares <> total THEN
    RAISE EXCEPTION 'cex.companies: company % has % issued shares but % in its share ledger', NEW.id, NEW.issued_shares, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER share_supply_matches AFTER INSERT ON share_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION company_supply_matches();
CREATE CONSTRAINT TRIGGER company_supply_matches AFTER UPDATE OF issued_shares ON companies
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION company_supply_matches_co();

-- Company status only moves forward along these steps, so an IPO can't run twice and a delisted company can't
-- come back by accident.
CREATE FUNCTION company_status_moves() RETURNS trigger LANGUAGE plpgsql SET search_path = cex AS $$
BEGIN
  IF NEW.status <> OLD.status AND (OLD.status::text || '>' || NEW.status::text) <> ALL (ARRAY[
      'PENDING>APPROVED', 'PENDING>REJECTED', 'APPROVED>IPO', 'APPROVED>REJECTED', 'IPO>LISTED',
      'LISTED>SUSPENDED', 'SUSPENDED>LISTED', 'LISTED>DELISTED', 'SUSPENDED>DELISTED',
      'LISTED>BANKRUPT', 'SUSPENDED>BANKRUPT']) THEN
    RAISE EXCEPTION 'cex.companies: company % can''t go from % to %', NEW.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER company_status_moves BEFORE UPDATE OF status ON companies
  FOR EACH ROW EXECUTE FUNCTION company_status_moves();

-- ---------------------------------------------------------------- reconciliation views
-- Each view lists only the rows that DON'T reconcile: an empty result means everything adds up.

-- Issued shares = holdings of players + treasury.
CREATE VIEW recon_shares AS
SELECT c.id AS company_id, c.symbol, c.issued_shares, coalesce(sum(h.qty), 0) AS held
FROM companies c LEFT JOIN share_holdings h ON h.company_id = c.id
GROUP BY c.id
HAVING c.issued_shares <> coalesce(sum(h.qty), 0);

-- Holdings = their share ledger.
CREATE VIEW recon_holdings AS
SELECT h.company_id, h.holder_type, h.holder_id, h.qty, coalesce(l.total, 0) AS ledger
FROM share_holdings h
LEFT JOIN (SELECT company_id, holder_type, holder_id, sum(qty) AS total FROM share_ledger GROUP BY 1, 2, 3) l
  USING (company_id, holder_type, holder_id)
WHERE h.qty <> coalesce(l.total, 0);

-- Player wallets = their coin ledger.
CREATE VIEW recon_wallets AS
SELECT w.player_id, w.balance, coalesce(l.total, 0) AS ledger
FROM wallets w
LEFT JOIN (SELECT account_id, sum(amount) AS total FROM coin_ledger WHERE account_type = 'PLAYER' GROUP BY 1) l
  ON l.account_id = w.player_id
WHERE w.balance <> coalesce(l.total, 0);

-- Company cash = its coin ledger.
CREATE VIEW recon_company_accounts AS
SELECT a.company_id, a.balance, coalesce(l.total, 0) AS ledger
FROM company_accounts a
LEFT JOIN (SELECT account_id, sum(amount) AS total FROM coin_ledger WHERE account_type = 'COMPANY' GROUP BY 1) l
  ON l.account_id = a.company_id::text
WHERE a.balance <> coalesce(l.total, 0);

-- Reserved coins and shares = what active reservations still hold.
CREATE VIEW recon_reservations AS
SELECT 'COINS'::text AS kind, w.player_id, NULL::bigint AS company_id, w.reserved, coalesce(r.total, 0) AS held
FROM wallets w
LEFT JOIN (SELECT player_id, sum(remaining) AS total FROM reservations WHERE status = 'ACTIVE' AND kind = 'COINS' GROUP BY 1) r
  USING (player_id)
WHERE w.reserved <> coalesce(r.total, 0)
UNION ALL
SELECT 'SHARES', h.holder_id, h.company_id, h.reserved, coalesce(r.total, 0)
FROM share_holdings h
LEFT JOIN (SELECT player_id, company_id, sum(remaining) AS total FROM reservations WHERE status = 'ACTIVE' AND kind = 'SHARES' GROUP BY 1, 2) r
  ON r.player_id = h.holder_id AND r.company_id = h.company_id
WHERE h.holder_type = 'PLAYER' AND h.reserved <> coalesce(r.total, 0);

-- All coins inside the exchange = what came in over the bridge. The BRIDGE account mirrors it with the
-- opposite sign, so (players + companies + fees) + bridge = 0, already guaranteed by double-entry. This view
-- checks the bridge account against the transfers table, which reconciliation also matches to the game ledger.
CREATE VIEW recon_bridge AS
SELECT ledger_in, transfers_in FROM (
  SELECT
    (SELECT coalesce(-sum(amount), 0) FROM coin_ledger WHERE account_type = 'BRIDGE') AS ledger_in,
    (SELECT coalesce(sum(CASE WHEN direction = 'DEPOSIT' AND state = 'COMPLETED' THEN amount
                              WHEN direction = 'WITHDRAW' AND state IN ('GAME_DONE', 'COMPLETED') THEN -amount
                              ELSE 0 END), 0) FROM bridge_transfers) AS transfers_in
) x WHERE ledger_in <> transfers_in;

CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO schema_migrations (version) VALUES ('0001_cex_schema');

COMMIT;
