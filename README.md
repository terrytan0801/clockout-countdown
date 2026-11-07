# Clock-out Countdown · v9.0

A phone app (PWA) where friends live together in a **cave** and count down to clock-out.

- **Caves.** Start a cave, then send its invite link or 6-letter code to friends. You live in one cave at a time. The owner can rename the cave, make a new code (the old link stops working) and remove people. If the owner leaves, the next member takes over. An empty cave is deleted.
- **Countdown.** Each person sees **Time − XX mins** to their own clock-out (Singapore / Malaysia time). **+ OT** when staying late, then **Clock out** when leaving.
- **Monsters.** Ten monsters (Jelly, Cyclo, Noodle, Spike, Bun, Tako, Mush, Chomp, Fluff, Dino). You get one when you join and keep it. It types at a laptop while you work, wilts on overtime and dances when you're off.
- **Colours.** Pick your colour from 12 when you join, and change it any time in your account.
- **⚡ Zap.** Buzz a cave-mate's phone with a push notification, once every 10 minutes per person. Each person decides with **Let friends buzz my phone** whether zaps vibrate or arrive quietly.
- **Cave chat.** Messages show the sender's monster (in its current mood) and colour. No push for chat; a red dot shows unread messages.
- **Accounts.** Join with a unique name, clock-out time, colour and a passcode (4+ characters). 5 wrong passcodes lock that name for 10 minutes.

## About vibration

Web apps can't force a custom vibration on someone else's phone.

- **Android:** with the app open, a zap vibrates in a long pattern. With the app closed, the notification vibrates the way the phone's notification settings say (on by default).
- **iPhone:** web apps can't control vibration. A zap vibrates once like any notification, following the phone's sound and vibration settings.
- With **Let friends buzz my phone** off, zaps arrive as silent notifications.

## Deploy on Netlify

The site is connected to this repo, so every push to `main` redeploys. For a fresh setup: **Add new project → Import an existing project → GitHub →** `terrytan0801/clockout-countdown` **→ Deploy**. No environment variables are needed. All data is kept in Netlify Blobs (store `clockout`, Singapore region), and push keys are generated automatically.

Data from v8 (one shared board) is moved automatically into a cave called **The Original Cave**. Everyone keeps their name, passcode, monster and login.

## Installing on a phone

- **iPhone (iOS 16.4+):** open the link in Safari → **Share** → **Add to Home Screen**. Open **Clock-out** from the home screen, join, then tap **Turn on zaps**. Zaps only work from the home-screen app on iPhone.
- **Android:** open the link in Chrome → **Install app** (or menu → **Add to Home screen**), join, tap **Turn on zaps**.

## Project layout

```
public/index.html           the app
public/monsters.js|.css     the 10 monsters and their moods
public/sw.js                service worker: shows zaps, keeps the app installable
public/manifest.webmanifest, public/icons/
netlify/functions/api.mjs   /api/* endpoint (Netlify Function)
netlify/lib/handler.mjs     API: accounts, caves, chat, overtime, zaps, v8 migration
test/api.test.mjs           npm test: API checks against an in-memory store
test/dev-server.mjs         local preview with a fake store: node test/dev-server.mjs
```
