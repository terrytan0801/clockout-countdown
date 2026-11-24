// Cave Exchange (v82): the Exchange screen. Loaded only when the Exchange station is opened (index.html loads this file
// and exchange.css on demand), so the rest of the app never pays for it. Uses the app's own api(), S, renderCoins().
// Every number comes from the server; the phone only sends what the player chose.
(() => {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString());
  const key = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const until = (iso) => { const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
    return m <= 0 ? "IPO ending" : m < 60 ? `IPO ends in ${m} min` : `IPO ends in ${Math.round(m / 60)} h`; };
  const chg = (c) => {
    if (c.change == null) return { text: c.lastPrice == null ? "no trades" : "first day", cls: "cx-flat" };
    const pct = c.prevClose ? ` (${((c.change / c.prevClose) * 100).toFixed(1)}%)` : "";
    return { text: `${c.change > 0 ? "+" : ""}${c.change}${pct}`, cls: c.change > 0 ? "cx-up" : c.change < 0 ? "cx-down" : "cx-flat" };
  };
  const feeOf = (value, bps, min) => (bps && value ? Math.max(min, Math.ceil((value * bps) / 10000)) : 0);
  const btn = (cls, text, fn) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", fn); return b; };

  let root, body, cashLine, tab = "market", sym = null, filter = "all", search = "", fees = null, msgTimer;
  const TABS = [["market", "Market"], ["portfolio", "Portfolio"], ["company", "My company"], ["history", "History"]];

  function build() {
    root = el("div", "cx"); root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Cave Exchange");
    const top = el("div", "cx-top"), bar = el("div", "cx-bar"), h = el("h2");
    h.append(el("small", "", "Village network"), "Cave Exchange");
    bar.append(h, btn("cx-x", "Back", close));
    cashLine = el("p", "cx-cash");
    const tabs = el("div", "cx-tabs"); tabs.setAttribute("role", "tablist");
    TABS.forEach(([k, label]) => {
      const b = btn("", label, () => { tab = k; sym = null; render(); });
      b.setAttribute("role", "tab"); b.dataset.k = k; tabs.appendChild(b);
    });
    top.append(bar, cashLine, tabs);
    body = el("div", "cx-body");
    root.append(top, body);
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    document.body.appendChild(root);
  }
  function open() { if (!root) build(); root.hidden = false; tab = "market"; sym = null; render(); root.querySelector(".cx-x").focus(); }
  function close() { if (root) root.hidden = true; }

  function msg(text, err) {
    const old = body.querySelector(".cx-msg"); if (old) old.remove();
    const m = el("div", "cx-msg" + (err ? " err" : ""), text); m.setAttribute("role", err ? "alert" : "status");
    body.prepend(m); clearTimeout(msgTimer); msgTimer = setTimeout(() => m.remove(), 5000);
  }
  const fail = (e) => msg(e.message || "Something went wrong. Try again.", true);
  async function load(...paths) { return Promise.all(paths.map((p) => api("exchange/" + p))); }
  // Runs one action with its button busy; refreshes the screen after.
  async function act(button, fn, done) {
    button.disabled = true;
    try { const r = await fn(); if (done) done(r); await render(true); } catch (e) { fail(e); } finally { button.disabled = false; }
  }

  async function render(keepMsg) {
    root.querySelectorAll(".cx-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.k === tab)));
    const keep = keepMsg && body.querySelector(".cx-msg");
    body.replaceChildren(el("p", "cx-empty", "Loading…"));
    try {
      const [w] = await load("wallet");
      cashLine.replaceChildren();
      [["Wallet", w.wallet], ["Exchange cash", w.cash.available], ["Held for orders", w.cash.reserved]].forEach(([l, v]) => {
        const s = el("span", "", l + " "); s.appendChild(el("b", "", fmt(v))); cashLine.appendChild(s);
      });
      const out = sym ? await stockView(sym) : await ({ market: marketView, portfolio: portfolioView, company: companyView, history: historyView })[tab](w);
      body.replaceChildren(...out);
      if (keep) body.prepend(keep);
    } catch (e) {
      const box = el("div", "cx-box");
      box.append(el("h3", "", e.data && e.data.cexDown ? "The exchange is closed" : "Couldn't load this"), el("p", "cx-muted", e.message));
      box.appendChild(btn("cx-go ghost", "Try again", () => render()));
      body.replaceChildren(box);
    }
  }

  /* ---------- market ---------- */
  async function marketView() {
    const [m, wl] = await load("market", "watchlist");
    fees = m.fees;
    const watch = new Set(wl.items);
    const s = el("input", "cx-search"); s.type = "search"; s.placeholder = "Search companies"; s.value = search; s.setAttribute("aria-label", "Search companies by name or symbol");
    const chips = el("div", "cx-chips");
    const list = el("div", "cx-list");
    const draw = () => {
      const t = search.trim().toLowerCase();
      const items = m.items.filter((c) => (filter === "all" || watch.has(c.symbol)) && (!t || c.symbol.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)));
      list.replaceChildren();
      if (!items.length) { list.appendChild(el("p", "cx-empty", m.items.length ? (filter === "watch" ? "Star a company to watch it here." : "Nothing matches that.") : "No companies yet. Start one in My company!")); return; }
      items.forEach((c) => {
        const r = btn("cx-row", "", () => { sym = c.symbol; render(); }), top = el("span", "cx-sym", c.symbol);
        if (c.status === "IPO") top.appendChild(el("span", "cx-tag", "IPO"));
        if (c.status === "SUSPENDED") top.appendChild(el("span", "cx-tag sus", "Paused"));
        const d = chg(c);
        r.append(top, el("span", "cx-px", fmt(c.lastPrice ?? c.ipoPrice)), el("span", "cx-name", c.name),
          el("span", "cx-chg " + (c.status === "IPO" ? "cx-flat" : d.cls), c.status === "IPO" ? until(c.ipoEndsAt) : d.text));
        r.setAttribute("aria-label", `${c.symbol}, ${c.name}, ${fmt(c.lastPrice ?? c.ipoPrice)} coins, ${c.status === "IPO" ? "in its IPO" : d.text}`);
        list.appendChild(r);
      });
    };
    [["all", "All"], ["watch", "★ Watchlist"]].forEach(([k, l]) => {
      const c = btn("cx-chip", l, () => { filter = k; chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === c))); draw(); });
      c.setAttribute("aria-pressed", String(filter === k)); chips.appendChild(c);
    });
    s.addEventListener("input", () => { search = s.value; draw(); });
    draw();
    return [s, chips, list, el("p", "cx-muted", `Prices are the last real trade. Updated ${new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`)];
  }

  /* ---------- one stock ---------- */
  // Candlesticks (v86): the last 40 periods; body from open to close (green up, red down), wick from low to high,
  // volume bars underneath. Tap a candle for its numbers.
  function chartSvg(all, span) {
    if (!all.length) return el("p", "cx-empty", "No trades in this view yet.");
    const ks = all.slice(-40), W = 600, PH = 230, VH = 44, R = 54, slot = (W - R) / Math.max(ks.length, 14), bw = Math.max(4, slot * 0.62);
    let lo = Math.min(...ks.map((k) => k.l)), hi = Math.max(...ks.map((k) => k.h));
    if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const vmax = Math.max(...ks.map((k) => k.v)) || 1, x0 = W - R - ks.length * slot;
    const y = (v) => 8 + ((hi - v) / (hi - lo)) * (PH - 16);
    const when = (t) => new Date(t).toLocaleString([], span === "1d" ? { day: "numeric", month: "short" } : { hour: "numeric", minute: "2-digit" });
    let svg = `<line x1="0" x2="${W - R}" y1="${PH}" y2="${PH}" stroke="var(--line)"/>`;
    [hi - pad, (hi + lo) / 2, lo + pad].forEach((v) => {
      svg += `<line x1="0" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 5"/>` +
        `<text x="${W - R + 6}" y="${(y(v) + 5).toFixed(1)}" font-size="15" fill="var(--muted)" font-family="var(--f-mono)">${Math.round(v)}</text>`;
    });
    ks.forEach((k, i) => {
      const cx = x0 + slot * (i + 0.5), up = k.c >= k.o, col = up ? "var(--c-teal)" : "var(--c-red)";
      const top = y(Math.max(k.o, k.c)), h = Math.max(2.5, Math.abs(y(k.o) - y(k.c))), vh = (k.v / vmax) * VH;
      svg += `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(k.h).toFixed(1)}" y2="${y(k.l).toFixed(1)}" stroke="${col}" stroke-width="2"/>` +
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${col}"/>` +
        `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(PH + 8 + VH - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, vh).toFixed(1)}" fill="${col}" opacity=".45"/>` +
        `<rect class="cx-hit" data-i="${i}" x="${(cx - slot / 2).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${PH + VH + 8}" fill="transparent"/>`;
    });
    svg += `<text x="${(x0 + 2).toFixed(1)}" y="${PH + VH + 26}" font-size="14" fill="var(--muted)" font-family="var(--f-mono)">${when(ks[0].t)}</text>` +
      `<text x="${W - R}" y="${PH + VH + 26}" font-size="14" fill="var(--muted)" font-family="var(--f-mono)" text-anchor="end">${when(ks[ks.length - 1].t)}</text>`;
    const wrap = el("div", "cx-chart"), info = el("p", "cx-muted", "Tap a candle to see its open, high, low and close.");
    const last = ks[ks.length - 1];
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${PH + VH + 32}" role="img" aria-label="${ks.length} periods, from ${ks[0].o} to ${last.c} coins, high ${Math.max(...ks.map((k) => k.h))}, low ${Math.min(...ks.map((k) => k.l))}">${svg}</svg>`;
    wrap.querySelector("svg").addEventListener("click", (e) => {
      const r = e.target.closest(".cx-hit"); if (!r) return;
      const k = ks[Number(r.dataset.i)];
      info.textContent = `${when(k.t)} · Open ${fmt(k.o)} · High ${fmt(k.h)} · Low ${fmt(k.l)} · Close ${fmt(k.c)} · ${fmt(k.v)} shares`;
    });
    wrap.appendChild(info);
    return wrap;
  }
  async function stockView(s) {
    if (!fees) fees = (await load("market"))[0].fees;
    const [c, book, trades] = await load(`stock/${s}`, `stock/${s}/orderbook`, `trades/${s}?limit=10`);
    const out = [];
    const back = btn("cx-back", "← All companies", () => { sym = null; render(); });
    const head = el("div", "cx-box"), hrow = el("div", "cx-head"), left = el("div");
    const h = el("h3", "", `${c.symbol} · ${c.name}`);
    left.append(h, el("p", "cx-muted", `${c.industry} · founded by ${c.founder.name}`));
    const star = btn("cx-star", c.watching ? "★" : "☆", () => act(star, () => api("exchange/watchlist", { symbol: c.symbol, on: !c.watching })));
    star.setAttribute("aria-label", c.watching ? "Stop watching" : "Watch this company"); star.setAttribute("aria-pressed", String(c.watching));
    hrow.append(left, star);
    const d = chg(c), price = el("div");
    price.append(el("span", "cx-big", fmt(c.lastPrice ?? c.ipoPrice)), " ", el("span", d.cls, c.status === "IPO" ? "IPO price" : d.text));
    head.append(hrow, price, el("p", "cx-muted", c.lastTradeAt ? `Last trade ${ago(c.lastTradeAt)}` : "No trades yet"));
    if (c.description) head.appendChild(el("p", "cx-muted", c.description));
    const stats = el("div", "cx-stats");
    [["Prev close", c.prevClose], ["Open", c.open], ["High", c.high], ["Low", c.low], ["Volume", c.volume], ["Market value", c.marketValue], ["You hold", c.myHolding.qty]]
      .forEach(([l, v]) => { const b = el("div"); b.append(el("span", "", l), el("b", "", fmt(v))); stats.appendChild(b); });
    head.appendChild(stats);
    out.push(back, head);

    // chart
    const cbox = el("div", "cx-box"), spans = el("div", "cx-chips"), area = el("div");
    cbox.append(el("h3", "", "Price"), spans, area);
    const drawChart = async (span) => {
      spans.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.s === span)));
      try { area.replaceChildren(chartSvg((await api(`exchange/stock/${s}/chart?span=${span}`)).candles, span)); } catch (e) { area.replaceChildren(el("p", "cx-empty", e.message)); }
    };
    [["1m", "Minutes"], ["1h", "Hours"], ["1d", "Days"]].forEach(([k, l]) => { const b = btn("cx-chip", l, () => drawChart(k)); b.dataset.s = k; spans.appendChild(b); });
    drawChart("1h");
    out.push(cbox);

    if (c.status === "IPO") out.push(ipoBox(c));
    else if (c.status === "LISTED") out.push(orderBox(c, book));
    else out.push(Object.assign(el("div", "cx-box"), { textContent: "Trading in this company is paused." }));

    // order book
    const bbox = el("div", "cx-box"), grid = el("div", "cx-book");
    const table = (title, rows, cls) => {
      const t = el("table"), cap = el("caption", "cx-muted", title); cap.style.textAlign = "left"; t.appendChild(cap);
      const hr = el("tr"); hr.append(el("th", "", "Price"), el("th", "", "Shares")); t.appendChild(hr);
      if (!rows.length) { const r = el("tr"), td = el("td", "cx-muted", "None"); td.colSpan = 2; r.appendChild(td); t.appendChild(r); }
      rows.forEach((o) => { const r = el("tr"); r.append(el("td", cls, fmt(o.price)), el("td", "", fmt(o.qty))); t.appendChild(r); });
      return t;
    };
    grid.append(table("Buyers (bids)", book.bids, "cx-up"), table("Sellers (asks)", book.asks, "cx-down"));
    bbox.append(el("h3", "", "Order book"), grid);
    out.push(bbox);

    const tbox = el("div", "cx-box");
    tbox.appendChild(el("h3", "", "Recent trades"));
    if (!trades.items.length) tbox.appendChild(el("p", "cx-empty", "No trades yet."));
    trades.items.forEach((t) => { const l = el("div", "cx-line"); l.append(el("span", "", `${fmt(t.qty)} shares · ${ago(t.at)}`), el("b", "", `${fmt(t.price)}`)); tbox.appendChild(l); });
    out.push(tbox);
    return out;
  }

  function ipoBox(c) {
    const box = el("div", "cx-box"), f = el("div", "cx-form");
    box.append(el("h3", "", "Buy in the IPO"), el("p", "cx-muted", `${fmt(c.ipoPrice)} coins a share, first come, first served, until ${new Date(c.ipoEndsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}. No fee.`));
    const lab = el("label", "cx-field", "Shares"), qty = el("input"); qty.type = "number"; qty.min = "1"; qty.inputMode = "numeric"; lab.appendChild(qty);
    const est = el("p", "cx-muted", "");
    const go = btn("cx-go buy", "Buy", () => {
      const n = Math.floor(Number(qty.value));
      if (!(n > 0)) { msg("How many shares?", true); return; }
      act(go, () => api(`exchange/company/${c.symbol}/ipo/buy`, { qty: n, key: key() }), (r) => msg(`You bought ${fmt(r.trade.qty)} ${c.symbol} for ${fmt(r.trade.value)} coins.`));
    });
    qty.addEventListener("input", () => { const n = Math.floor(Number(qty.value)) || 0; est.textContent = n ? `Costs ${fmt(n * c.ipoPrice)} coins.` : ""; });
    f.append(lab, est, go); box.appendChild(f);
    return box;
  }

  function orderBox(c, book) {
    let side = "BUY", type = "LIMIT";
    const box = el("div", "cx-box"), f = el("div", "cx-form");
    const sides = el("div", "cx-seg buy"), types = el("div", "cx-seg");
    const qtyL = el("label", "cx-field", "Shares"), qty = el("input"); qty.type = "number"; qty.min = "1"; qty.inputMode = "numeric"; qtyL.appendChild(qty);
    const pxL = el("label", "cx-field", "Price per share"), px = el("input"); px.type = "number"; px.min = "1"; px.inputMode = "numeric"; pxL.appendChild(px);
    const two = el("div", "cx-two"); two.append(qtyL, pxL);
    const est = el("p", "cx-muted", ""), go = el("button", "cx-go buy"); go.type = "button";
    const best = () => (side === "BUY" ? book.asks[0] : book.bids[0]);
    const update = () => {
      sides.className = "cx-seg " + (side === "BUY" ? "buy" : "sell");
      sides.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === side)));
      types.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === type)));
      pxL.hidden = type === "MARKET";
      go.className = "cx-go " + (side === "BUY" ? "buy" : "sell");
      const n = Math.floor(Number(qty.value)) || 0, p = type === "LIMIT" ? Math.floor(Number(px.value)) || 0 : best() ? best().price : 0;
      const value = n * p, fee = feeOf(value, side === "BUY" ? fees.buyerBps : fees.sellerBps, fees.minFee);
      go.textContent = `${side === "BUY" ? "Buy" : "Sell"} ${n ? fmt(n) + " " : ""}${c.symbol}`;
      est.textContent = !n ? (type === "MARKET" ? "A market order fills now at the best prices in the book; what can't fill is cancelled." : "A limit order waits in the book until someone matches your price (up to 7 days).")
        : !p ? (type === "MARKET" ? `No one is ${side === "BUY" ? "selling" : "buying"} right now.` : "Set a price.")
        : `${type === "MARKET" ? "About " : ""}${fmt(value)} coins ${side === "BUY" ? "+" : "−"} fee ${fmt(fee)} = ${fmt(side === "BUY" ? value + fee : value - fee)}${side === "BUY" ? " to pay" : " to you"}.`
          + (type === "LIMIT" && value < fees.minOrderValue ? ` The smallest order is ${fmt(fees.minOrderValue)} coins.` : "");
    };
    [["BUY", "Buy"], ["SELL", "Sell"]].forEach(([v, l]) => { const b = btn("", l, () => { side = v; update(); }); b.dataset.v = v; sides.appendChild(b); });
    [["LIMIT", "Limit"], ["MARKET", "Market"]].forEach(([v, l]) => { const b = btn("", l, () => { type = v; update(); }); b.dataset.v = v; types.appendChild(b); });
    qty.addEventListener("input", update); px.addEventListener("input", update);
    if (book.asks[0]) px.value = book.asks[0].price;
    go.addEventListener("click", () => {
      const n = Math.floor(Number(qty.value)), p = Math.floor(Number(px.value));
      if (!(n > 0)) { msg("How many shares?", true); return; }
      if (type === "LIMIT" && !(p > 0)) { msg("Set a price.", true); return; }
      act(go, () => api("exchange/order/place", { symbol: c.symbol, side, type, qty: n, ...(type === "LIMIT" ? { price: p } : {}), key: key() }), (r) => {
        const o = r.order, verb = side === "BUY" ? "Bought" : "Sold";
        msg(o.status === "FILLED" ? `${verb} ${fmt(o.filledQty)} ${c.symbol} at ${fmt(o.avgPrice)} on average.`
          : o.status === "CANCELLED" ? `${o.filledQty ? `${verb} ${fmt(o.filledQty)}; ` : ""}${o.reason || "the rest was cancelled."}`
          : `${o.filledQty ? `${verb} ${fmt(o.filledQty)} so far. ` : ""}Your order is in the book.`, o.status === "CANCELLED" && !o.filledQty);
      });
    });
    update();
    f.append(sides, types, two, est, go);
    box.append(el("h3", "", "Trade"), f, el("p", "cx-muted", `You hold ${fmt(c.myHolding.qty)} ${c.symbol}${c.myHolding.reserved ? ` (${fmt(c.myHolding.reserved)} in sell orders)` : ""}. Fees ${fees.buyerBps / 100}% a side, at least ${fees.minFee}.`));
    return box;
  }

  /* ---------- portfolio ---------- */
  async function portfolioView(w) {
    const [p, open] = await load("portfolio", "order/my?open=1");
    const out = [];
    const sum = el("div", "cx-box");
    sum.append(el("h3", "", "Your money"));
    [["Wallet (game coins)", w.wallet], ["Exchange cash available", p.cash.available], ["Held for buy orders", p.cash.reserved], ["Shares worth", p.holdingsValue], ["Exchange total", p.value]]
      .forEach(([l, v]) => { const r = el("div", "cx-line"); r.append(el("span", "", l), el("b", "", fmt(v))); sum.appendChild(r); });
    out.push(sum);

    const mv = el("div", "cx-box"), f = el("div", "cx-form"), lab = el("label", "cx-field", "Coins"), amt = el("input");
    amt.type = "number"; amt.min = "1"; amt.inputMode = "numeric"; lab.appendChild(amt);
    const two = el("div", "cx-two");
    const move = (path, done) => (b) => {
      const n = Math.floor(Number(amt.value));
      if (!(n > 0)) { msg("How many coins?", true); return; }
      act(b, () => api("exchange/wallet/" + path, { amount: n, key: key() }), (r) => { if (typeof S !== "undefined" && S && S.me) { S.me.coins = r.wallet; if (typeof renderCoins === "function") renderCoins(); } msg(done(n)); });
    };
    const dep = btn("cx-go", "Deposit", () => move("deposit", (n) => `${fmt(n)} coins moved into the exchange.`)(dep));
    const wd = btn("cx-go ghost", "Move to wallet", () => move("to-wallet", (n) => `${fmt(n)} coins moved back to your wallet.`)(wd));
    two.append(dep, wd);
    f.append(lab, two);
    mv.append(el("h3", "", "Move coins"), el("p", "cx-muted", "Coins you trade with live in the exchange. Deposit from your wallet; move them back any time. They're the same monster coins."), f);
    out.push(mv);

    const hb = el("div", "cx-box");
    hb.appendChild(el("h3", "", "Your shares"));
    if (!p.holdings.length) hb.appendChild(el("p", "cx-empty", "No shares yet. Find a company in Market."));
    p.holdings.forEach((h) => {
      const r = btn("cx-row", "", () => { tab = "market"; sym = h.symbol; render(); });
      r.append(el("span", "cx-sym", h.symbol), el("span", "cx-px", fmt(h.value)), el("span", "cx-name", `${fmt(h.qty)} shares${h.avgCost ? ` · paid ${fmt(h.avgCost)} avg` : ""}`),
        el("span", "cx-chg cx-flat", h.lastPrice == null ? "" : `${fmt(h.lastPrice)} each`));
      hb.appendChild(r);
    });
    out.push(hb);

    const ob = el("div", "cx-box");
    ob.appendChild(el("h3", "", "Open orders"));
    if (!open.items.length) ob.appendChild(el("p", "cx-empty", "No open orders."));
    open.items.forEach((o) => {
      const l = el("div", "cx-line"), t = el("span", "", `${o.side === "BUY" ? "Buy" : "Sell"} ${fmt(o.qty - o.filledQty)} ${o.symbol} at ${fmt(o.price)}`);
      const x = btn("cx-go ghost", "Cancel", () => act(x, () => api("exchange/order/cancel", { orderId: o.id }), () => msg("Order cancelled; what it held is free again.")));
      l.append(t, x); ob.appendChild(l);
    });
    out.push(ob);
    return out;
  }

  /* ---------- my company ---------- */
  function companyForm(c, done) {
    const box = el("div", "cx-box"), f = el("div", "cx-form");
    const fld = (label, name, type = "text", extra = {}) => {
      const l = el("label", "cx-field", label), i = el(type === "area" ? "textarea" : "input");
      if (type !== "area") i.type = type; if (type === "number") i.inputMode = "numeric";
      Object.assign(i, extra); i.name = name; l.appendChild(i); return [l, i];
    };
    const [nameL, name] = fld("Company name", "name", "text", { maxLength: 40, value: c ? c.name : "" });
    const [symL, symI] = fld("Symbol (2–5 letters)", "symbol", "text", { maxLength: 5, value: c ? c.symbol : "", autocapitalize: "characters" });
    const [indL, ind] = fld("Industry", "industry", "text", { maxLength: 30, value: c ? c.industry : "" });
    const [desL, des] = fld("What it does", "description", "area", { maxLength: 500, value: c ? c.description : "", rows: 2 });
    const [authL, auth] = fld("Authorized shares", "authorizedShares", "number", { value: c ? c.authorizedShares : 10000 });
    const [fouL, fou] = fld("Your shares", "founderShares", "number", { value: c ? c.founderShares : 4000 });
    const [pubL, pub] = fld("Shares for sale in the IPO", "publicShares", "number", { value: c ? c.publicShares : 1000 });
    const [priL, pri] = fld("IPO price per share", "ipoPrice", "number", { value: c ? c.ipoPrice : 10 });
    const r1 = el("div", "cx-two"), r2 = el("div", "cx-two"), r3 = el("div", "cx-two");
    r1.append(nameL, symL); r2.append(authL, fouL); r3.append(pubL, priL);
    const go = btn("cx-go", c ? "Save changes" : "Create company", () => {
      const v = { name: name.value, symbol: symI.value, industry: ind.value, description: des.value,
        authorizedShares: Math.floor(Number(auth.value)), founderShares: Math.floor(Number(fou.value)), publicShares: Math.floor(Number(pub.value)), ipoPrice: Math.floor(Number(pri.value)) };
      act(go, () => (c ? api(`exchange/company/${c.id}/edit`, v) : api("exchange/company/create", { ...v, key: key() })), () => { msg(c ? "Saved." : "Company created. Send it for approval when it's ready."); if (done) done(); });
    });
    f.append(r1, indL, desL, r2, r3, go);
    box.append(el("h3", "", c ? "Edit your company" : "Start a company"),
      el("p", "cx-muted", "You get your shares for free; the IPO sells the public shares at the IPO price for 24 hours, and the coins go to your company. The admin approves every company first."), f);
    return box;
  }
  async function companyView() {
    const [{ company: c }] = await load("company/mine");
    if (!c || ["REJECTED", "DELISTED", "BANKRUPT"].includes(c.status)) {
      const out = [];
      if (c) out.push(el("p", "cx-msg err", c.status === "REJECTED" ? `${c.name} wasn't approved. You can start another.` : `${c.name} is ${c.status.toLowerCase()}.`));
      out.push(companyForm(null));
      return out;
    }
    const box = el("div", "cx-box");
    box.append(el("h3", "", `${c.symbol} · ${c.name}`), el("p", "cx-muted", `${c.industry}${c.description ? " · " + c.description : ""}`));
    [["Status", { PENDING: c.submitted ? "Waiting for the admin" : "Draft", APPROVED: "Approved", IPO: "IPO open", LISTED: "Listed", SUSPENDED: "Paused" }[c.status] || c.status],
      ["Your shares", fmt(c.founderShares)], ["Public shares", fmt(c.publicShares)], ["IPO price", fmt(c.ipoPrice)], ["Company cash", fmt(c.cash)],
      ...(c.status === "IPO" || c.status === "LISTED" ? [["Unsold (treasury)", fmt(c.treasuryShares)]] : [])]
      .forEach(([l, v]) => { const r = el("div", "cx-line"); r.append(el("span", "", l), el("b", "", v)); box.appendChild(r); });
    const out = [box];
    if (c.status === "PENDING" && !c.submitted) {
      const send = btn("cx-go", "Send for approval", () => act(send, () => api(`exchange/company/${c.id}/submit`, {}), () => msg("Sent. The admin will have a look.")));
      box.appendChild(send);
      out.push(companyForm(c));
    }
    if (c.status === "APPROVED") {
      const go = btn("cx-go buy", "Start the IPO", () => act(go, () => api(`exchange/company/${c.id}/ipo`, {}), () => msg("Your IPO is open for 24 hours.")));
      box.append(el("p", "cx-muted", "Starting the IPO issues the shares: yours to you, the public ones for sale at the IPO price for 24 hours."), go);
    }
    if (c.status === "IPO" || c.status === "LISTED") box.appendChild(btn("cx-go ghost", "See it in the market", () => { tab = "market"; sym = c.symbol; render(); }));
    return out;
  }

  /* ---------- history ---------- */
  const KIND = { deposit: "Deposit from wallet", withdraw: "Moved to wallet", ipo_buy: "IPO buy", trade_buy: "Bought", trade_sell: "Sold", dividend_in: "Dividend" };
  async function historyView() {
    const [h, dv] = await load("portfolio/history", "portfolio/dividends");
    const box = el("div", "cx-box");
    box.appendChild(el("h3", "", "Exchange history"));
    const add = (items) => items.forEach((i) => {
      const l = el("div", "cx-line"), t = el("span", "", `${KIND[i.kind] || i.kind}${i.symbol ? ` ${fmt(i.qty)} ${i.symbol} at ${fmt(i.price)}` : ""} · ${ago(i.at)}`);
      l.append(t, el("b", i.amount > 0 ? "cx-up" : "", `${i.amount > 0 ? "+" : ""}${fmt(i.amount)}`)); box.insertBefore(l, more);
    });
    const more = btn("cx-go ghost cx-more", "Show more", async () => {
      more.disabled = true;
      try { const n = await api(`exchange/portfolio/history?before=${next}`); add(n.items); next = n.next; more.hidden = !next; } catch (e) { fail(e); } finally { more.disabled = false; }
    });
    let next = h.next;
    box.appendChild(more); more.hidden = !next;
    if (!h.items.length) box.insertBefore(el("p", "cx-empty", "Nothing yet. Deposit some coins to start."), more);
    add(h.items);
    const db = el("div", "cx-box");
    db.appendChild(el("h3", "", "Dividends"));
    if (!dv.items.length) db.appendChild(el("p", "cx-empty", "No dividends yet. Companies can pay them from their cash later."));
    dv.items.forEach((d) => { const l = el("div", "cx-line"); l.append(el("span", "", `${d.symbol}: ${fmt(d.perShare)} a share on ${fmt(d.qty)}`), el("b", "cx-up", `+${fmt(d.amount)}`)); db.appendChild(l); });
    return [box, db];
  }

  window.CEX = { open, close };
})();
