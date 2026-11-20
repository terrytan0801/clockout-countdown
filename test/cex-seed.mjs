// Demo exchange data for the local preview only (CEX=1 with SEED=1): two listed companies with a few trades and an
// order book, made through the real API routes. Never used on a deploy.
export async function seedExchange(handle, store) {
  const call = async (path, body, token, admin) => {
    const r = await handle(new Request("http://localhost/api/" + path, { method: body ? "POST" : "GET",
      headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(admin ? { "x-admin-key": "demo-admin" } : {}) },
      body: body ? JSON.stringify(body) : undefined }));
    const d = await r.json();
    if (r.status !== 200) throw new Error(`${path}: ${d.error}`);
    return d;
  };
  let n = 0;
  const key = () => `seed-${String(++n).padStart(6, "0")}`;
  const who = {};
  for (const name of ["Terry", "Sukee", "Qitai", "Winnie", "Shunyi"]) {
    who[name] = (await call("login", { name, pin: "1234" })).token;
    const pid = "p-" + name.toLowerCase();
    await store.set(`led/${pid}/0000000000002-bbbbbb/20000/test`, "0"); // game coins to deposit
    await call("exchange/wallet/deposit", { amount: 8000, key: key() }, who[name]);
  }
  const make = async (founder, f) => {
    await call("exchange/company/create", { ...f, key: key() }, who[founder]);
    await call(`exchange/company/${f.symbol}/submit`, {}, who[founder]);
    await call("admin/exchange/company/approve", { id: f.symbol, approve: true }, null, true);
    await call(`exchange/company/${f.symbol}/ipo`, {}, who[founder]);
  };
  await make("Sukee", { name: "Sukee Bubble Tea", symbol: "BOBA", industry: "Food & drink", description: "Brown sugar boba for the 6 pm slump.", authorizedShares: 10000, founderShares: 4000, publicShares: 1000, ipoPrice: 10 });
  await make("Qitai", { name: "Mushroom Movers", symbol: "MUSH", industry: "Transport", description: "We carry your stuff home after work.", authorizedShares: 5000, founderShares: 2000, publicShares: 3000, ipoPrice: 4 });
  for (const [name, qty] of [["Terry", 300], ["Winnie", 400], ["Shunyi", 300]]) await call("exchange/company/BOBA/ipo/buy", { qty, key: key() }, who[name]);
  await call("exchange/company/MUSH/ipo/buy", { qty: 400, key: key() }, who.Terry); // MUSH stays in its IPO
  const order = (name, o) => call("exchange/order/place", { symbol: "BOBA", key: key(), ...o }, who[name]);
  await order("Sukee", { side: "SELL", type: "LIMIT", qty: 200, price: 12 });
  await order("Winnie", { side: "SELL", type: "LIMIT", qty: 100, price: 13 });
  await order("Terry", { side: "BUY", type: "LIMIT", qty: 80, price: 12 });
  await order("Shunyi", { side: "BUY", type: "LIMIT", qty: 50, price: 11 });
  await order("Qitai", { side: "BUY", type: "LIMIT", qty: 60, price: 10 });
  await order("Sukee", { side: "SELL", type: "LIMIT", qty: 150, price: 14 });
}
