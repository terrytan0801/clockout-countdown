// Clock-out Countdown service worker: receives zaps (push) and keeps the app installable.
const VERSION = "v32.0";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// The app's own files (page, styles, monsters, icons) are fetched from the network and a copy is kept.
// If the network is down, or the page takes more than 4 seconds, the kept copy is used, so the app still opens.
// Nothing under /api is ever kept here.
const SHELL = "shell-v1";
const keep = async (req, res) => { if (res && res.ok && res.type === "basic") (await caches.open(SHELL)).put(req, res.clone()); return res; };
const offlineNote = () => new Response(
  "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:system-ui;padding:24px'>You're offline. Open Clock-out again when you're back online.</body>",
  { headers: { "content-type": "text/html; charset=utf-8" } });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/") || url.pathname.startsWith("/admin")) return;
  const nav = req.mode === "navigate";
  const key = nav ? "/" : req; // every way into the app is the same page
  e.respondWith((async () => {
    const cached = () => caches.match(key, { ignoreSearch: nav });
    const net = fetch(req).then((res) => keep(key, res));
    try {
      if (!nav) return await net;
      const slow = new Promise((ok) => setTimeout(ok, 4000, null));
      const first = await Promise.race([net, slow]);
      if (first) return first;
      return (await cached()) || (await net);
    } catch (err) {
      return (await cached()) || (nav ? offlineNote() : Response.error());
    }
  })());
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || "⚡ Zap!";
  // buzz is the receiver's own "Let friends buzz my phone" setting.
  const buzz = d.buzz !== false;
  const opts = {
    body: d.body || "Someone zapped you.",
    tag: d.tag || "zap",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: d.url || "/" },
    silent: !buzz,
  };
  if (buzz) { opts.renotify = true; opts.vibrate = [300, 100, 300, 100, 600]; }
  e.waitUntil((async () => {
    await self.registration.showNotification(title, opts);
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: d.kind === "roar" || d.kind === "ring" ? d.kind : "zap", title, body: opts.body, buzz }));
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if ("focus" in w) return w.focus();
    return self.clients.openWindow(url);
  })());
});
