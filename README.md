# Clock-out Countdown · v7.0

A phone app (PWA) for Terry, Sukee, Shunyi and friends:

- Live **Time − XX mins** countdown to everyone's clock-out (Singapore / Malaysia time).
- **+ OT** when someone stays late. The card counts **Time + XX mins** until they tap **Clock out**.
- **⚡ Zap** a friend to buzz their phone with a push notification. One zap per friend every 10 minutes.
- Each person has a monster in their colour: **typing at a laptop** while working, **exhausted** on overtime, **dancing** once they're off.
- Add or remove friends, take a screenshot of the board.

## Deploy on Netlify (one time)

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new project** → **Import an existing project** → **GitHub**.
2. Pick `terrytan0801/clockout-countdown`.
3. Leave the settings as they are (they come from `netlify.toml`) and click **Deploy**.
4. Optional: **Project configuration → Change project name** to get a nicer link, e.g. `clockout-terry.netlify.app`.

There are no environment variables or keys to set up. The push keys are generated automatically the first time someone turns on zaps, and all data is kept in Netlify Blobs (store `clockout`, Singapore region).

Every push to `main` redeploys automatically.

## Installing on a phone

- **iPhone (iOS 16.4+):** open the link in Safari → **Share** → **Add to Home Screen**. Open **Clock-out** from the home screen, pick your name, then tap **Turn on zaps**. Zaps only work from the home-screen app on iPhone.
- **Android:** open the link in Chrome → **Install app** (or menu → **Add to Home screen**), pick your name, tap **Turn on zaps**.

## Project layout

```
public/                  the app (index.html, service worker, manifest, icons)
netlify/functions/api.mjs  /api/* endpoint (Netlify Function)
netlify/lib/handler.mjs    API logic: friends, overtime, push subscriptions, zaps
test/api.test.mjs          npm test: API checks against an in-memory store
test/dev-server.mjs        local preview with a fake store: node test/dev-server.mjs
```
