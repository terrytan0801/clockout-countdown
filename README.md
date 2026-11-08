# Clock-out Countdown · v21.0

A phone app (PWA) where friends live together in a **cave** and count down to clock-out.

- **Caves.** Start a cave, then send its invite link or 6-letter code to friends. You live in one cave at a time. The owner can rename the cave, make a new code (the old link stops working) and remove people. If the owner leaves, the next member takes over. An empty cave is deleted.
- **Countdown.** Each person sees **Time − XX mins** to their own clock-out (Singapore / Malaysia time). **+ OT** when staying late, then **Clock out** when leaving.
- **Monsters.** Ten monsters (Jelly, Cyclo, Noodle, Spike, Bun, Tako, Mush, Chomp, Fluff, Dino). You get one when you join and keep it. It types at a laptop while you work, wilts on overtime and dances when you're off.
- **Colours.** Pick your colour from 12 when you join, and change it any time in your account.
- **⚡ Zap.** Buzz a cave-mate's phone with a push notification, once every 10 minutes per person. Each person decides with **Let friends buzz my phone** whether zaps vibrate or arrive quietly.
- **Cave chat.** Messages show the sender's monster (in its current mood) and colour. No push for chat; a red dot shows unread messages.
- **Loading screen.** The app stays on a loading screen until your login is checked. Each visit plays a different monster scene (tag, a meeting, the night shift, a race to the exit). Signed out, the log-in card sits on top of the scene and you only go in after logging in.
- **Accounts.** Join with a unique name, clock-out time, colour and a passcode (4+ characters). 5 wrong passcodes lock that name for 10 minutes.

## News

The **News** button sits next to Screenshot at the top. While there's something you haven't read, your own monster hops inside it and a red dot shows. Tap it for a short comic (a few swipeable panels) about the newest feature; you can open it again any time. New entries go at the top of the `NEWS` list in `public/index.html`.

On phones, the account, Cave, Screenshot and News buttons sit in one row.

## Cave Calendar (Days)

Inspired by Setlog. **Four times a day**, at random times between 9 am and 10 pm (Singapore time, at least an hour apart), every phone in the cave rings at the same moment, weekends too. Everyone films **2–4 seconds** of what they're doing, right in the app.

- Posting within **10 minutes** of a ring is on time. Until the next ring it still counts, marked **Late**. One clip per person per ring; a retake replaces it.
- The camera shows the phone camera's full view (no cropping, widest zoom), so what you see is what gets filmed.
- **Filters and tone.** Under the camera: 8 filters (Normal, Vivid, Warm, Cool, Film, Retro, Mono, Dreamy), zoom (1×, 2×, 3× or pinch, also while filming) and a sliders panel for brightness, contrast, saturation and warmth. They're applied with WebGL as you film, so they're part of the clip. Each phone remembers its last look.
- The **Days** tab is a month calendar. Days with clips show a cover frame and how many clips there are. Tap a day to see who filmed each ring and play it.
- A day plays **split screen**: for each ring, everyone's clips play side by side at once, under the ring time, then the next ring. Clips are shown whole, never cropped.
- **Make video** records exactly that as one vertical (9:16) video: a title card with the cave name, date and everyone's monsters, then each ring's split screen with the original sound and no music. It's made on the phone, so keep the screen open until it's done. Then **Share to Instagram…** opens the share menu, or **Save video** keeps a copy.
- Clips are kept. Only people in the cave can watch them. Deleting an account deletes that person's clips, and a cave's clips go when the last person leaves. The admin page shows how many clips are stored and how much space they use.
- Clips are recorded small (well under 1 MB) so uploads stay under the function's request limit. Rings are sent by a scheduled function every 5 minutes (`netlify/functions/film-ring.mjs`); the ring times are worked out from the cave and the date, so nothing extra is stored. Clips from v15 (one ring a day) count as ring 1.

## Monster powers

Every monster has a power that levels up with a streak of **workdays** (Mon–Fri) on which you open the app: **Lv1 at 3, Lv2 at 7, Lv3 at 14**. Weekends never break a streak. Missing a workday drops you **one level**, not back to zero. People who already used the app get credit for their recent streak. You can **reroll** your monster at random once a calendar month and keep your level.

| Monster | Power | Lv1 | Lv2 | Lv3 |
|---|---|---|---|---|
| Jelly | Jiggle Party | your clock-out makes the cave's board jiggle | plus confetti | plus a rainbow trail on your card |
| Cyclo | All-Seeing Eye | see who's in the app now | see who read the chat | see who left last this week |
| Tako | Ink Notes | 1 note on the cave board | 2 notes | 3 notes, pin one for a week |
| Mush | Spore Cheer | 1 cheer a day, mushrooms on their card | 3 a day | 5 a day, bigger mushrooms |
| Fluff | Weather Eye | weather at your clock-out time (set your city) | rain alert push 25–45 min before you leave | 3-day forecast |
| Dino | Roar | roar to the cave when you leave (push + banner) | write your own roar | roar with sound |
| Noodle, Spike, Bun, Chomp | coming soon | | | |

**Calm mode** in the account sheet makes the monsters stand still on that phone only, for older phones or to save battery. To keep things smooth, the board only redraws the parts whose data changed, monsters pause while they are off screen, and the app stops checking for updates while it's in the background.

**Show friends' effects** in the account sheet turns off Jelly parties and Dino roars, both the banners and the push. Notes come down at midnight, and pinned notes after 7 days. Weather comes from Open-Meteo (free, no key). The rain alert runs from a scheduled Netlify function every 15 minutes (`netlify/functions/rain-alert.mjs`).

## Admin page

The admin page has its own logo (the Staff Badge: an ADMIN ID badge with Jelly as the photo) and its own favicon, so its tab is easy to tell apart from the app.

Open `/admin` on the site (for example `https://splendid-gnome-120c81.netlify.app/admin`) and enter the admin key. It shows:

- people, active today and this week, total time in the app, zaps and messages
- a daily active people chart (7, 30 or 90 days)
- a table of everyone: last opened, opens, time in app, zaps sent and received, messages, joined date. Tap a person for their daily time chart, who they zapped, who zapped them and their recent activity
- the latest zaps (buzzed, quiet, or no phone yet) and all caves

How it's measured: the app sends a small check-in when it opens and once a minute while it's on screen. Coming back after 5+ minutes away counts as a new open. What messages say is never recorded, only how many were sent. Stats are kept for 90 days, and deleting an account deletes that person's stats. New users see a short notice about this on the Join card.

The admin key isn't stored in the code, only its SHA-256 hash. To change the key, add an environment variable `ADMIN_KEY` in Netlify (Project configuration → Environment variables, scope: Functions) and redeploy.

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
netlify/lib/stats.mjs       usage stats and the admin report
netlify/lib/powers.mjs      streaks, levels, weather helpers for the monster powers
netlify/functions/rain-alert.mjs  scheduled every 15 min: Fluff rain alerts
netlify/functions/film-ring.mjs   scheduled every 5 min: the Cave Calendar rings
netlify/lib/clips.mjs       ring times and clip limits for the Cave Calendar
public/admin.html           admin page (/admin)
test/api.test.mjs, test/powers.test.mjs, test/clips.test.mjs   npm test: API, power and calendar checks against an in-memory store
test/dev-server.mjs         local preview with a fake store: node test/dev-server.mjs (SEED=1 adds demo data; SEED_CLIPS=<folder> adds calendar clips)
```
