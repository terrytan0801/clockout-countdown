# Clock-out Countdown · v39.0

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

The **News** button sits next to Screenshot at the top. It shows one comic page per update (only updates that have a comic), newest first: version, date and time (Singapore), a title, and the comic panels with short captions. Swipe left for older updates and right for newer ones, or use the arrows. While there's an update you haven't opened, your own monster hops inside the button and a red dot shows. New entries go at the top of the `NEWS` list in `public/index.html` (entries without `panels` are kept as history but not shown).

On phones, the account, Cave, Screenshot and News buttons sit in one row.

## Public holidays and days off

Each person picks a holiday list in their account: **Singapore** (the default), **Malaysia (Kuala Lumpur)** or **None**. On a public holiday the card says **Holiday!** with the holiday's name instead of counting down, the OT button is hidden, and the day counts like a weekend: it never breaks a streak and there's no rain alert. **Taking today off** in the account does the same for one day (Day off). Holiday dates live in `netlify/lib/holidays.mjs` (Singapore 2026–2027 from the Ministry of Manpower, Malaysia 2026); add new years there when they're announced.

## Cave Calendar (Days)

Inspired by Setlog. **Twice a day**, at random times (one between 10 am and 1 pm, one between 4 pm and 7 pm, Singapore time), every phone in the cave rings at the same moment, weekends too. Everyone films **2–4 seconds** of what they're doing, right in the app.

- Posting within **10 minutes** of a ring is on time. Until the next ring it still counts, marked **Late**. One clip per person per ring; a retake replaces it.
- The camera shows the phone camera's full view (no cropping, widest zoom), so what you see is what gets filmed.
- **Filters and tone.** Under the camera: 8 filters (Normal, Vivid, Warm, Cool, Film, Retro, Mono, Dreamy), zoom (1×, 2×, 3× or pinch, also while filming) and a sliders panel for brightness, contrast, saturation and warmth. They're applied with WebGL as you film, so they're part of the clip. Each phone remembers its last look.
- **Sound on/off.** The microphone button at the top of the camera films a silent clip: with sound off the microphone isn't opened and the clip has no audio at all. Each phone remembers the choice.
- The **Days** tab is a month calendar. Days with clips show a cover frame and how many clips there are. Tap a day to see who filmed each ring and play it.
- A day plays **split screen**: for each ring, everyone's clips play side by side at once, under the ring time, then the next ring. Clips are shown whole, never cropped.
- **Make video** records exactly that as one vertical (9:16) video: a title card with the cave name, date and everyone's monsters, then each ring's split screen with the original sound and no music. It's made on the phone, so keep the screen open until it's done. Then **Share to Instagram…** opens the share menu, or **Save video** keeps a copy.
- **Lofi music.** Days play with an original lofi track, **Sunny Desk** (88 BPM, bright jazzy chords, a marimba melody that comes in after the beat, a short break in longer videos, no vinyl crackle). It's made on the phone with Web Audio, so there's no music file to license, and it fits the length of the day's video. Make video keeps it. Everyone's own sound plays on top, a little quieter. The **Lofi music** switch in the day sheet turns it off.
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

**Sleep.** After 30 seconds without a touch the screen goes black with "Sleeping… tap to wake", and the countdown, updates, chat and monster animations stop until it is tapped (a zap or the film ring wakes it too). It stays awake while the camera is open or the day video is playing or being made. When the app goes to the background, the day video and its music stop and the camera and microphone are let go; the camera comes back on its own when you return.

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

## Speed and saving reads (v32)

- **"Still the same?"** Each cave has a version (`ver/<cid>`) that changes whenever something its board shows changes. Phones send the version they have (`/api/state?v=…`); if it matches, the server answers `{same:true}` after one small read instead of re-reading the whole cave. The version also changes by itself each day, at each ring and every 10 minutes.
- **Chat** keeps the newest message's id in `chatlast/<cid>`, so "anything new?" doesn't list the chat.
- **Calendar** keeps one record per day (`daysum/<cid>/<day>`). It rebuilds itself when a clip is added, retaken or deleted (it compares the clips' etags).
- **Zap and chat show at once** on the phone and are sent in the background; they are undone with a message if the server can't be reached.
- **Saved board.** The last board a phone saw today is kept on the phone, so the app opens straight away and still opens offline (marked "Offline · retrying"). The service worker keeps a copy of the app's own files for that; nothing under `/api` is kept.
- A warm server remembers sessions for a minute and the push keys for as long as it lives. Logging out is still immediate.
- The functions run in Netlify's default region (US East); the data is in Singapore. Choosing the functions' region needs Netlify Pro (setting it in code makes the deploy fail on other plans). `GET /api/where` shows the region in use.

## Chat reactions (v33)

Hold a message (or right-click on a computer) to react with 👍 ❤️ 😂 😮 😢 🙏, or copy it. One reaction per person per message, as on WhatsApp: picking another replaces it, picking yours again removes it. Tap the little pill under a message to see who reacted. Each reaction is its own key, `react/<cid>/<msgid>/<pid>/<emoji hex>`, so one listing gives a whole cave's reactions and two people reacting at once never overwrite each other; `chatre/<cid>` changes on every reaction so phones only fetch them when something changed.

## Clip loading (v34)

Clips and covers are fetched through signed links (`/api/m/<clip|thumb>/<cid>/<day>/<slot>/<at>/<sig>`, HMAC with the stored `mediakey`). They need no log-in, so:

- Netlify's CDN keeps each one (`Netlify-CDN-Cache-Control: public, durable, max-age=31536000, immutable`): the first viewer pulls it across from the store, later viewers get it from the CDN;
- the phone keeps them too (service worker cache `media-v1`, newest 300), so a day you've watched plays at once, even offline;
- a retake has a new time in its link, the old link stops working, and the removed clip is purged from the CDN by its cache tag (`purgeCache` from `@netlify/functions`); deleting an account purges its clips the same way.

Links are only handed to members of the cave (in `/api/days`). Since v38 the server also fetches a new clip's links once right after the upload (in the background), so the CDN has them before the cave's first look.

Opening and playing a day (v38): the day opens at once from the calendar already on screen (new clips are checked for behind it); the clips are fetched and their sound decoded as soon as the day opens; each ring is made ready while the one before it plays, and a clip that hasn't arrived after 4 seconds is left out of its ring instead of holding it up. At most 40 clips stay in memory (covers and the open day's clips are always kept); the phone's own cache keeps the rest. The Days tab's background fetch of today's clips goes two at a time. The Days tab also fetches today's clips in the background so Play starts straight away. Clips are recorded at 1.2 Mbps (was 1.6), about a quarter smaller.

## Work hours and lunch (v35)

Each person sets when they **start work** as well as when they clock out (account sheet; 9 am until set). The bar fills from their own start time, and before it the card says "Not in yet · Starts at …" instead of sitting at 0%. An optional **lunch break** (start time and 30 min to 1½ hours) turns their card to "Lunch" and their monster eats a steaming bowl of noodles; if the film ring goes off during your lunch, the ring bar asks you to show your lunch.

## Waiting on a save (v37)

Every button shrinks a little the moment it's pressed. When a save takes longer than 0.3 seconds, a card pops up with your own monster busy at its laptop and papers flying out, saying what it's doing (Saving…, Joining…, Logging you in…). It stays at least half a second once shown, so it never flickers, and the pressed button can't be pressed again meanwhile. Zap, chat Send and reactions don't use it: they already show their result at once.

## Chat speed (v39)

- **Asks more often while people are talking.** With the chat open, the phone asks for new messages every 1.5 seconds while someone has written in the last minute (or you're typing), every 3 seconds after a quiet minute, and every 6 seconds after five quiet minutes. An "anything new?" costs two small reads; Sleep stops it altogether.
- **Kept on the phone.** The last 60 messages and their reactions are kept on the phone (`clockout.chat`, for the same person and cave), so after a restart the chat shows at once and only newer messages are fetched.

## Test site (dev branch)

Work goes to the `dev` branch first. With Netlify branch deploys turned on for `dev`, it is served at `https://dev--<site>.netlify.app`, which doesn't use deploy credits. The test site:

- keeps its own data (store `clockout-dev`), so nothing done there touches the real caves; sign up again there;
- installs as its own app, "Clockout DEV", with a red DEV band on the icon and a red DEV pill on screen;
- lets you film at any time, and **Ring now** sends the film-time notification to your test cave;
- doesn't run the scheduled jobs (rings, rain alerts), because Netlify only runs those on the live site.

Merging `dev` into `main` is what updates the live app (one deploy, 15 credits).
