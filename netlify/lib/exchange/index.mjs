// Cave Exchange: routes. handler.mjs will hand over /api/exchange/* (after auth(), with the signed-in person as me) and
// /api/admin/exchange/* (after the admin key check). Contracts: docs/CAVE_EXCHANGE_API.md.
//
// db is { tx(fn) }: tx runs fn(q) inside one transaction (BEGIN … COMMIT, rolled back if fn throws) with
// search_path = cex, where q(text, params) returns rows with BIGINT columns as JS numbers.
// Each handler returns { status, body }.
import { createHash } from "node:crypto";
import { CexError, fail } from "./base.mjs";
import * as companies from "./companies.mjs";
import * as ipo from "./ipo.mjs";
import * as orders from "./orders.mjs";

export function makeExchange({ db: raw, now = () => Date.now() }) {
  // Two transactions that lock the same wallets in a different order can deadlock; Postgres stops one of them,
  // and it simply runs again (it changed nothing).
  const db = {
    async tx(fn) {
      for (let i = 0; ; i++) {
        try { return await raw.tx(fn); } catch (e) { if (i < 2 && (e.code === "40P01" || e.code === "40001")) continue; throw e; }
      }
    },
  };
  // A POST that moves coins or creates something runs once per client key: a retry gets the first answer back.
  async function once(pid, route, body, fn) {
    const key = body.key;
    if (typeof key !== "string" || !/^[\w-]{8,80}$/.test(key)) fail(400, "This request needs a key (a fresh UUID per action).");
    const { key: _, ...rest } = body;
    const hash = createHash("sha256").update(route + JSON.stringify(rest)).digest("hex");
    const prior = async () => {
      const [r] = await db.tx((q) => q("SELECT request_hash, response, status_code FROM idempotency_keys WHERE player_id = $1 AND key = $2", [pid, key]));
      if (r && r.request_hash !== hash) fail(409, "That request was already used for something else.");
      return r && { status: r.status_code, body: r.response };
    };
    const seen = await prior();
    if (seen) return seen;
    try {
      return await db.tx(async (q) => {
        const out = JSON.stringify(await fn(q));
        await q("INSERT INTO idempotency_keys (player_id, key, route, request_hash, response, status_code) VALUES ($1, $2, $3, $4, $5, 200)",
          [pid, key, route, hash, out]);
        return { status: 200, body: JSON.parse(out) }; // exactly what a retry will get back
      });
    } catch (e) {
      if (e.code === "23505" && /idempotency_keys/.test(`${e.constraint || ""} ${e.message}`)) { const s = await prior(); if (s) return s; }
      throw e;
    }
  }
  const run = async (fn) => ({ status: 200, body: await db.tx(fn) });

  async function answer(fn) {
    try { return await fn(); } catch (e) {
      if (e instanceof CexError) return { status: e.status, body: { error: e.message } };
      if (e.code === "23505") return { status: 409, body: { error: "Someone just took that. Try another." } };
      throw e; // the API's own catch turns it into a 500
    }
  }

  // route is the part after "exchange/", e.g. "company/create" or "company/ANNCO/ipo/buy".
  function handle(me, route, method, body = {}, query = {}) {
    return answer(async () => {
      const [a, id, b, c] = route.split("/");
      if (a === "company") {
        if (id === "create" && method === "POST") return once(me.id, route, body, (q) => companies.create(q, me, body));
        if (id === "list" && method === "GET") {
          await db.tx((q) => ipo.closeDue(q, now()));
          return run((q) => companies.list(q, query));
        }
        if (id && !b && method === "GET") return run((q) => companies.get(q, me, id));
        if (id && b === "edit" && method === "POST") return run((q) => companies.edit(q, me, id, body));
        if (id && b === "submit" && method === "POST") return run((q) => companies.submit(q, me, id));
        if (id && b === "ipo" && !c && method === "POST") return run((q) => ipo.start(q, me, id, now()));
        if (id && b === "ipo" && c === "buy" && method === "POST") {
          await db.tx((q) => ipo.closeDue(q, now()));
          return once(me.id, route, body, (q) => ipo.buy(q, me, id, body, now()));
        }
      }
      if (a === "order") {
        if (id === "place" && method === "POST") return once(me.id, route, body, (q) => orders.place(q, me, body, now()));
        if (id === "cancel" && method === "POST") return run((q) => orders.cancel(q, me, body));
        if (id === "my" && method === "GET") return run((q) => orders.mine(q, me, query));
      }
      if (a === "stock" && id && b === "orderbook" && method === "GET") return run((q) => orders.book(q, id, now()));
      if (a === "trades" && id && method === "GET") return run((q) => orders.trades(q, id, query));
      fail(404, "No such exchange route.");
    });
  }

  // route is the part after "admin/exchange/". The caller has already checked the admin key.
  function admin(route, method, body = {}, query = {}) {
    return answer(async () => {
      if (route === "companies" && method === "GET") return run((q) => companies.adminList(q, query));
      if (route === "company/approve" && method === "POST") return run((q) => companies.approve(q, body));
      fail(404, "No such exchange route.");
    });
  }

  // For the exchange's scheduled job: close IPOs and expire limit orders whose time is up.
  const jobs = async () => ({ ipos: await db.tx((q) => ipo.closeDue(q, now())), expired: await db.tx((q) => orders.expireDue(q, now())) });
  return { handle, admin, jobs };
}
