// Cave Exchange: shared bits for every exchange module: errors, input checks, players, audit lines.
// Every function that touches the database takes q(text, params) -> rows, running inside the caller's transaction.

export class CexError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new CexError(status, message); };

// A whole number between min and max (coins, shares and prices are never fractions).
export function int(v, min, max, what) {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(400, `${what} must be a whole number from ${min} to ${max}.`);
  return v;
}
export function text(v, min, max, what) {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) fail(400, min ? `${what} must be ${min}–${max} characters.` : `${what} can be at most ${max} characters.`);
  return s;
}

// The exchange's copy of a game player (me = the game's person record). Created on first use, name kept current.
export async function ensurePlayer(q, me) {
  const [p] = await q(
    `INSERT INTO players (id, name, cave_id) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, cave_id = EXCLUDED.cave_id RETURNING frozen`,
    [me.id, String(me.name || "?").slice(0, 40), me.cave || null]);
  await q("INSERT INTO wallets (player_id) VALUES ($1) ON CONFLICT DO NOTHING", [me.id]);
  return p;
}
export async function activePlayer(q, me) {
  if ((await ensurePlayer(q, me)).frozen) fail(403, "Your exchange account is paused. Ask the admin.");
}

export const audit = (q, actorType, actorId, action, targetType, targetId, details = {}) =>
  q("INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)",
    [actorType, actorId, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(details)]);
