// Clock-out Countdown service worker: receives zaps (push) and keeps the app installable.
const VERSION = "v19.0";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Network first. If the phone is offline, show a plain note instead of the browser's error page.
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(
    fetch(e.request).catch(
      () => new Response(
        "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:system-ui;padding:24px'>You're offline. Open Clock-out again when you're back online.</body>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      )
    )
  );
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
