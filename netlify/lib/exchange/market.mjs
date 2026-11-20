// Cave Exchange: market data. Candles are written inside each trade's transaction, from the trade itself, so
// charts only ever show real trades. Buckets: 1 minute, 1 hour, and 1 day from midnight Singapore time (UTC+8).
export const bumpCandles = (q, companyId, price, qty) => q(
  `INSERT INTO candles (company_id, span, bucket_start, open, high, low, close, volume, trade_count)
   SELECT $1, s.span, to_timestamp(floor((extract(epoch FROM now()) + s.off) / s.len) * s.len - s.off), $2, $2, $2, $2, $3, 1
   FROM (VALUES ('1m', 60, 0), ('1h', 3600, 0), ('1d', 86400, 28800)) AS s(span, len, off)
   ON CONFLICT (company_id, span, bucket_start) DO UPDATE SET
     high = greatest(candles.high, EXCLUDED.high), low = least(candles.low, EXCLUDED.low), close = EXCLUDED.close,
     volume = candles.volume + EXCLUDED.volume, trade_count = candles.trade_count + 1`,
  [companyId, price, qty]);

// Start of today (midnight Singapore time) as a JS ms time.
export const sgDayStart = (nowMs) => (Math.floor((nowMs / 1000 + 28800) / 86400) * 86400 - 28800) * 1000;

// Per company: last trade, today's 1d candle and the close of the day before. Prices only from real trades.
const STATS = `
  LEFT JOIN LATERAL (SELECT price, created_at FROM trades t WHERE t.company_id = c.id ORDER BY t.id DESC LIMIT 1) lt ON true
  LEFT JOIN candles d ON d.company_id = c.id AND d.span = '1d' AND d.bucket_start = to_timestamp($1::float8 / 1000)
  LEFT JOIN LATERAL (SELECT close FROM candles p WHERE p.company_id = c.id AND p.span = '1d' AND p.bucket_start < to_timestamp($1::float8 / 1000)
    ORDER BY p.bucket_start DESC LIMIT 1) pc ON true`;
const COLS = "c.*, lt.price AS last_price, lt.created_at AS last_at, d.open AS d_open, d.high AS d_high, d.low AS d_low, d.volume AS d_vol, pc.close AS prev_close";
export const statsView = (c) => {
  const prev = c.prev_close ?? null, last = c.last_price ?? null;
  return {
    id: c.id, symbol: c.symbol, name: c.name, industry: c.industry, status: c.status, issuedShares: c.issued_shares, ipoPrice: c.ipo_price,
    ipoEndsAt: c.ipo_ends_at, lastPrice: last, lastTradeAt: c.last_at ?? null, prevClose: prev,
    change: last != null && prev != null ? last - prev : null, open: c.d_open ?? null, high: c.d_high ?? null, low: c.d_low ?? null,
    volume: c.d_vol ?? 0, marketValue: last == null ? null : last * c.issued_shares,
  };
};

// Listed companies and open IPOs.
export async function overview(q, nowMs) {
  const rows = await q(`SELECT ${COLS} FROM companies c ${STATS} WHERE c.status IN ('LISTED', 'IPO', 'SUSPENDED') ORDER BY c.status = 'IPO' DESC, c.symbol LIMIT 200`, [sgDayStart(nowMs)]);
  const [st] = await q("SELECT fee_buyer_bps, fee_seller_bps, min_fee, min_order_value FROM settings");
  return { items: rows.map(statsView), at: new Date(nowMs).toISOString(),
    fees: { buyerBps: st.fee_buyer_bps, sellerBps: st.fee_seller_bps, minFee: st.min_fee, minOrderValue: st.min_order_value } };
}

export async function stock(q, me, symbol, nowMs) {
  const s = String(symbol || "").toUpperCase();
  const [c] = await q(`SELECT ${COLS} FROM companies c ${STATS} WHERE c.symbol = $2 AND c.status NOT IN ('PENDING', 'REJECTED')`, [sgDayStart(nowMs), s]);
  if (!c) return null;
  const [h] = await q("SELECT qty, reserved FROM share_holdings WHERE company_id = $1 AND holder_type = 'PLAYER' AND holder_id = $2", [c.id, me.id]);
  const [w] = await q("SELECT 1 FROM watchlist WHERE player_id = $1 AND company_id = $2", [me.id, c.id]);
  const [f] = await q("SELECT name FROM players WHERE id = $1", [c.founder_id]);
  return { ...statsView(c), description: c.description, founder: { id: c.founder_id, name: f ? f.name : "?" },
    myHolding: h ? { qty: h.qty, reserved: h.reserved } : { qty: 0, reserved: 0 }, watching: !!w };
}

export async function chart(q, symbol, { span = "1h" } = {}) {
  const sp = ["1m", "1h", "1d"].includes(span) ? span : "1h";
  const rows = await q(`SELECT k.bucket_start AS t, open AS o, high AS h, low AS l, close AS c, volume AS v FROM candles k
    JOIN companies c ON c.id = k.company_id WHERE c.symbol = upper($1) AND k.span = $2 ORDER BY k.bucket_start DESC LIMIT 500`, [String(symbol || ""), sp]);
  return { span: sp, candles: rows.reverse() };
}
