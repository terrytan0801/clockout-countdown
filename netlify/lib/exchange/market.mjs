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
