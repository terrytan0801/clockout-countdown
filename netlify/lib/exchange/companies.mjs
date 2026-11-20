// Cave Exchange: companies. A player creates one (PENDING), may edit it until they submit it, and the admin approves
// or rejects it. Shares are only issued by the IPO (ipo.mjs). Rules: docs/CAVE_EXCHANGE_SPEC.md section 4.
import { fail, int, text, activePlayer, audit } from "./base.mjs";

export const LIMITS = { maxShares: 1_000_000, maxPrice: 10_000 };
const LIVE = "status NOT IN ('REJECTED', 'DELISTED', 'BANKRUPT')";

export const view = (c) => ({
  id: c.id, symbol: c.symbol, name: c.name, industry: c.industry, description: c.description, founderId: c.founder_id,
  authorizedShares: c.authorized_shares, issuedShares: c.issued_shares, founderShares: c.founder_shares,
  publicShares: c.public_shares, ipoPrice: c.ipo_price, status: c.status, submitted: !!c.submitted_at,
  createdAt: c.created_at, approvedAt: c.approved_at, ipoEndsAt: c.ipo_ends_at, listedAt: c.listed_at,
});

// A company by id or symbol, locked for the rest of the transaction when lock is set.
export async function find(q, idOrSymbol, lock = false) {
  const s = String(idOrSymbol || "");
  const [c] = await q(`SELECT * FROM companies WHERE ${/^\d{1,15}$/.test(s) ? "id = $1::bigint" : "symbol = upper($1)"}${lock ? " FOR UPDATE" : ""}`, [s]);
  return c || fail(404, "No such company.");
}

function fields(b) {
  const symbol = typeof b.symbol === "string" ? b.symbol.trim().toUpperCase() : "";
  if (!/^[A-Z][A-Z0-9]{1,4}$/.test(symbol)) fail(400, "A symbol is 2–5 letters or digits, starting with a letter.");
  const f = {
    symbol,
    name: text(b.name, 2, 40, "Name"),
    industry: text(b.industry, 2, 30, "Industry"),
    description: text(b.description ?? "", 0, 500, "Description"),
    authorized: int(b.authorizedShares, 1, LIMITS.maxShares, "Authorized shares"),
    founder: int(b.founderShares, 0, LIMITS.maxShares, "Founder shares"),
    pub: int(b.publicShares, 1, LIMITS.maxShares, "Public shares"),
    price: int(b.ipoPrice, 1, LIMITS.maxPrice, "IPO price"),
  };
  if (f.founder + f.pub > f.authorized) fail(400, "Founder and public shares can't add up to more than the authorized shares.");
  return f;
}
async function notTaken(q, f, exceptId = 0) {
  const [t] = await q("SELECT symbol = $1 AS sym FROM companies WHERE (symbol = $1 OR lower(name) = lower($2)) AND id <> $3 LIMIT 1",
    [f.symbol, f.name, exceptId]);
  if (t) fail(409, t.sym ? `The symbol ${f.symbol} is taken.` : "A company with that name already exists.");
}

export async function create(q, me, b) {
  await activePlayer(q, me);
  const f = fields(b);
  if ((await q(`SELECT 1 FROM companies WHERE founder_id = $1 AND ${LIVE}`, [me.id])).length) fail(409, "You already have a company.");
  await notTaken(q, f);
  const [c] = await q(
    `INSERT INTO companies (symbol, name, industry, description, founder_id, authorized_shares, founder_shares, public_shares, ipo_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [f.symbol, f.name, f.industry, f.description, me.id, f.authorized, f.founder, f.pub, f.price]);
  await q("INSERT INTO company_accounts (company_id) VALUES ($1)", [c.id]);
  await audit(q, "PLAYER", me.id, "company.create", "company", c.id, { symbol: c.symbol });
  return { company: view(c) };
}

async function mineToEdit(q, me, id) {
  const c = await find(q, id, true);
  if (c.founder_id !== me.id) fail(403, "Only the founder can change this company.");
  if (c.status !== "PENDING" || c.submitted_at) fail(409, "This company has already been sent for approval.");
  return c;
}

export async function edit(q, me, id, b) {
  await activePlayer(q, me);
  const c = await mineToEdit(q, me, id);
  const f = fields(b);
  await notTaken(q, f, c.id);
  const [n] = await q(
    `UPDATE companies SET symbol = $2, name = $3, industry = $4, description = $5, authorized_shares = $6, founder_shares = $7,
     public_shares = $8, ipo_price = $9 WHERE id = $1 RETURNING *`,
    [c.id, f.symbol, f.name, f.industry, f.description, f.authorized, f.founder, f.pub, f.price]);
  await audit(q, "PLAYER", me.id, "company.edit", "company", c.id);
  return { company: view(n) };
}

export async function submit(q, me, id) {
  const c = await find(q, id, true);
  if (c.founder_id === me.id && c.status === "PENDING" && c.submitted_at) return { company: view(c) }; // already sent
  await mineToEdit(q, me, id);
  const [n] = await q("UPDATE companies SET submitted_at = now() WHERE id = $1 RETURNING *", [c.id]);
  await audit(q, "PLAYER", me.id, "company.submit", "company", c.id);
  return { company: view(n) };
}

const LAST = `LEFT JOIN LATERAL (SELECT price, created_at FROM trades t WHERE t.company_id = c.id ORDER BY t.id DESC LIMIT 1) lt ON true`;
const withLast = (c) => ({ ...view(c), lastPrice: c.last_price ?? null, lastTradeAt: c.last_at ?? null,
  marketValue: c.last_price == null ? null : c.last_price * c.issued_shares });

export async function get(q, me, id) {
  const c = await find(q, id);
  // A company only becomes public once approved; before that only its founder sees it.
  if (["PENDING", "REJECTED"].includes(c.status) && c.founder_id !== me.id) fail(404, "No such company.");
  const [x] = await q(`SELECT c.*, lt.price AS last_price, lt.created_at AS last_at, p.name AS founder_name
    FROM companies c ${LAST} JOIN players p ON p.id = c.founder_id WHERE c.id = $1`, [c.id]);
  return { company: withLast(x), founder: { id: x.founder_id, name: x.founder_name } };
}

// Listed companies (or ones in their IPO), with their last trade. Optional search by name or symbol.
export async function list(q, { status = "LISTED", q: search = "" } = {}) {
  if (!["LISTED", "IPO"].includes(status)) fail(400, "Status must be LISTED or IPO.");
  const like = `%${String(search).slice(0, 40).replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await q(`SELECT c.*, lt.price AS last_price, lt.created_at AS last_at FROM companies c ${LAST}
    WHERE c.status = $1 AND (c.symbol ILIKE $2 OR c.name ILIKE $2) ORDER BY c.symbol LIMIT 100`, [status, like]);
  return { items: rows.map(withLast) };
}

/* ---------- admin ---------- */
export async function adminList(q, { status = "PENDING" } = {}) {
  const rows = await q(`SELECT c.*, p.name AS founder_name FROM companies c JOIN players p ON p.id = c.founder_id
    WHERE c.status = $1::company_status AND (c.status <> 'PENDING' OR c.submitted_at IS NOT NULL) ORDER BY c.id LIMIT 200`, [status]);
  return { items: rows.map((c) => ({ ...view(c), founderName: c.founder_name })) };
}

export async function approve(q, { id, approve: yes, note = "" }) {
  if (typeof yes !== "boolean") fail(400, "Say approve: true or false.");
  const c = await find(q, id, true);
  if (c.status !== "PENDING" || !c.submitted_at) fail(409, "Only companies waiting for approval can be approved or rejected.");
  const [n] = await q(`UPDATE companies SET status = $2, approved_at = CASE WHEN $3 THEN now() END, approved_by = CASE WHEN $3 THEN 'admin' END
    WHERE id = $1 RETURNING *`, [c.id, yes ? "APPROVED" : "REJECTED", yes]);
  await audit(q, "ADMIN", "admin", yes ? "company.approve" : "company.reject", "company", c.id, { note: String(note).slice(0, 300) });
  return { company: view(n) };
}

// The player's own company (the newest one they founded), whatever its status, or null.
export async function mine(q, me) {
  const [c] = await q("SELECT * FROM companies WHERE founder_id = $1 ORDER BY id DESC LIMIT 1", [me.id]);
  if (!c) return { company: null };
  const [a] = await q("SELECT balance FROM company_accounts WHERE company_id = $1", [c.id]);
  const [t] = await q("SELECT qty FROM share_holdings WHERE company_id = $1 AND holder_type = 'TREASURY'", [c.id]);
  return { company: { ...view(c), cash: a ? a.balance : 0, treasuryShares: t ? t.qty : 0 } };
}
