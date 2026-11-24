# Clock-out Countdown · v86.0

A phone app (PWA) where friends live together in a **cave** and count down to clock-out.

- **Caves.** Start a cave, then send its invite link or 6-letter code to friends. You live in one cave at a time. The owner can rename the cave, make a new code (the old link stops working) and remove people. If the owner leaves, the next member takes over. An empty cave is deleted.
- **Countdown.** Each person sees **Time − XX mins** to their own clock-out (Singapore / Malaysia time). **+ OT** when staying late, then **Clock out** when leaving.
- **Home.** The cave's home is shown one room at a time (Bedroom, Study, Living room, Kitchen, Yard, then Whole home): arrows on the picture or a sideways swipe move between rooms, a name plate says how many are there, and dots underneath show which rooms have someone in. It opens on the busiest room.
- **FoodSpin.** A wheel that picks dinner, opened from the little wheel above the stove in the kitchen at home: places to eat within 2 km of you, narrowed by budget and kind, (from OpenStreetMap; in Singapore, Johor Bahru and the Klang Valley from lists built into the app), eight at a time, a tap to open the pick in Google Maps, and a button to share it in the cave chat.
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
| Fluff | Cloud Shield (v50) + Weather Eye | zaps take 20% less of your coins; weather at your clock-out time (set your city) | 40% less; rain alert push 25–45 min before you leave | first grab each day blocked; 3-day forecast |
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

The admin key lives only in the Netlify environment variable `ADMIN_KEY` (Project configuration → Environment variables, scope: Functions; set it for production and branch deploys) and takes effect on the next deploy. Without it the admin page stays shut. Before v62 there was a built-in key, but its plain text had been committed to a test file in this public repo, so it no longer works.

The person sheet in the admin page can give someone who forgot their passcode a new one (or a random 6-digit one) and lifts any wrong-passcode lock; only a hash of each passcode is kept, so old ones can't be shown.

## About vibration

Web apps can't force a custom vibration on someone else's phone.

- **Android:** with the app open, a zap vibrates in a long pattern. With the app closed, the notification vibrates the way the phone's notification settings say (on by default).
- **iPhone:** web apps can't control vibration. A zap vibrates once like any notification, following the phone's sound and vibration settings.
- With **Let friends buzz my phone** off, zaps arrive as silent notifications.

## Deploy on Netlify

The site is connected to this repo, so every push to `main` redeploys. For a fresh setup: **Add new project → Import an existing project → GitHub →** `terrytan0801/clockout-countdown` **→ Deploy**. No environment variables are needed. All data is kept in Netlify Blobs (v54: records in store `clockout-near` next to the functions, videos in store `clockout` in Singapore; see `netlify/lib/stores.mjs`), and push keys are generated automatically.

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
- The functions run in Netlify's default region (US East). Until v53 the data was in Singapore, so every read or write crossed the Pacific; from v54 the records live next to the functions and only videos stay in Singapore. Choosing the functions' region needs Netlify Pro (setting it in code makes the deploy fail on other plans). `GET /api/where` shows the region in use.

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

## Replies and monsters' day (v40)

- **Reply** to a chat message: hold it and tap Reply, or swipe it to the right (WhatsApp style). The reply carries a short copy of the message it answers (`re: {id,pid,name,color,text}`, first 120 characters), shown as a quote; tap the quote to jump to the original.
- **Monsters' day (v40, more of it in v41).** Before your start time the monster is asleep **in its own bed** (each person has their own blanket: sky, stripes, dots, stars, hearts or checks) in one of four poses picked per person per day: sitting up breathing, lying flat, nodding off, or snoring a bubble. On days off it sleeps until 10 am, and everyone sleeps from 11:30 pm. **Lunch** and **dinner** (7:30-8:30 pm for everyone who's off) are a different food each meal: noodles, pizza, burger, donut, ice cream, sushi, cake, drumstick, eyeball soup, cotton candy or a cactus. For 20 minutes after clocking out it dances; after that, and on days off, it changes every hour between reading (a novel, comic, spellbook, newspaper, treasure map or a tiny book), gaming, basketball, guitar, painting, bubbles, fishing, gardening, juggling, skating, meditating, cooking and dancing. The props live in `public/monster-props.js` and are laid over (or behind) the monster in the same 100x100 box, so they fit every monster. The card's tag says what they're doing.

## Calendar speed (v41)

The Days tab shows the calendar straight away from what the phone already has (months seen this session stay in memory; this month is kept on the phone for next time), then checks with the server behind it, and only redraws if something changed. It doesn't ask the server at all if it checked in the last minute and today's clips match the board.

## The cave's home (v42)

The **Home** button next to Board / Chat / Days opens the cave's home: a cutaway of the cave with a bedroom, study, living room, kitchen and a yard outside (sky by day, moon at night). Everyone's monster goes to the room for what it's doing: asleep in bed; eating or cooking in the kitchen; reading, painting or meditating in the study; fishing, gardening, basketball, skating or bubbles in the yard; everything else in the living room. Whoever is at work is on the **At work** board by the door, with how long until they're home. Tap a monster to see who it is and what it's doing.

**Decorate** lets anyone in the cave put things in the home (20 kinds: sofa, rug, plant, lamp, TV, poster, beanbag, arcade, fireplace, aquarium, fairy lights, clock, trophy, disco ball, piano, cat, shelf, fridge, hammock, telescope; up to 60), drag them about, flip or remove them. Everyone sees the same home. Each decoration is one key, `hi/<cid>/<id>/<kind>/<x>/<y>/<flip>/<pid>`, so one listing draws the home and two people moving things at once never overwrite each other; `homerev/<cid>` changes on every edit (since v43 the phone picks a new thing's id, so it can be dragged straight away, and changes are sent one after another behind the scenes; the server makes each change with one listing and one round of writes) so phones only fetch when something changed (they check every 8 seconds while Home is open). The art is in `public/cave-home.js`.

## Monster coins (v44)

Everyone has a wallet of monster coins (the coin button next to Home opens it, with the last 10 lines and how to earn).

| How | Coins |
|---|---|
| Welcome gift, once (when you first open the app, or when you're first zapped, whichever comes first; v48) | +100 |
| Each workday you open the app, paid from your clock-out time (a day you only opened before clocking out is paid the next time you open). Weekends, public holidays and days off pay nothing; overtime pays nothing extra | +50 |
| Every 5 workdays in a row | +50 |
| Filming a ring on time / late (first take only) | +15 / +5 |
| Every zap (v48; before, only the first zap of someone each day) | 1-10% of their coins, taken from them |
| Selling fish from the pond to Mr. Fishfish (see Fishing, v45) | 1 to 390 a fish |
| Water a plant, pet the cat, use the vending machine, once a day each | +2, +2, +3 |

**The shop.** Everything in the home is bought with coins (33 things, 30 to 600 coins); selling gives half back. Anyone can move or flip a thing, only its buyer can sell it; things left by someone who moved out can be cleared by anyone, and things placed before v44 stay and can be removed by their owner for nothing. Some things do something while they're in the home: **coffee machine** (+10 on your wage), **safe** (zaps only reach half your coins), **lucky cat** (no boots on the line, rare fish twice as likely), **aquarium** and **big fish tank** (hold 3 and 8 fish), **vending machine** (+3 a day for everyone), **crystal ball** (a daily fortune), **jukebox** (plays lofi), plant and cat (+2 a day).

All the numbers are in `COINS` and `SHOP` at the top of `netlify/lib/handler.mjs`. Each wallet is a ledger of lines (`led/<pid>/<id>/<amount>/<why>`), so the balance is a sum and two payments at once can't lose coins; old lines are folded into `coinbase/<pid>`. Once-only payments are claimed under `paid/<pid>/<day>/<what>`.

## The village (v50)

**Village** (next to Bag on the Home screen) opens a map: the cave in the middle and four lots around it. Each building is paid for by the whole cave together: anyone chips in any amount (`village/donate`), and once it's fully paid for it takes a day to build (a minute on the test site), then it's open for everyone in the cave. Donations are listed on the building, biggest first.

| Building | Coins | What it does |
|---|---|---|
| Weather station | 2,000 | Everyone who sets a city gets the weather: at their clock-out time on their card, a rain alert 25-45 min before they leave, and a 3-day forecast (Fluff's old Weather Eye, for everyone) |
| Farm | 3,000 | 6 plots. Seeds: radish 10 (4 h), tomato 25 (1 day), pumpkin 60 (3 days), monster flower 150 (7 days). A crop not watered for 24 hours before it's ripe dies; anyone can water anyone's (+2 coins once a day per crop for helping) and clear dead ones. Only the planter picks; a pick is 1-3 stars (70/25/5%), worth 1x/1.5x/2.5x: radish 22, tomato 60, pumpkin 170, monster flower 520 for 1 star. Crops go in the bag and sell to **Mr. Veggie**, in the yard 8-10 am and 5-7 pm, double for his crop of the day |
| Harbor | 4,000 | Fishing at sea: squid, tuna, swordfish, anglerfish and whale shark (sea only), plus sharks, puffers, golden fish and legendary fish a little likelier than in the pond (still under 0.1% each); chances in `SEA`. Mr. Fishfish lives at the harbor and buys fish all day |
| Cinema | 5,000 | This week's (or last week's) clips played back to back on the phone: a title card, each day as in the Days player, then credits with everyone's clip count |

**Holiday planner (v51, 2,500 coins).** Uses each person's holiday list (Singapore or Malaysia) to find long breaks over the next year (`netlify/lib/planner.mjs`): for each run of public holidays it offers the plain long weekend (3+ days, no leave), the best 1-day bridge (4+ days), and a longer break for 2-4 days of leave when that's at least 2.5 days off per day of leave and 3+ days longer. *I'll take it* books those leave days (`leave/<pid>/<day>` and `dayoff/<day>/<pid>`, so the app treats them as days off: no countdown, no wage, streak kept) and the cave sees who's taking which break. Around 10 am each day, people in a cave with a planner get a push for a break whose first leave day is 3 weeks away (`holidayTips`, run with the rain alerts). Malaysia's 2027 holidays still need adding to `holidays.mjs`.

**v52.** A building starts going up with its first coin: the lot shows a building site whose brick walls rise with the share of the price raised (`VILLAGE.site`), then a last day of finishing touches once it's fully paid. A building's card opens in the middle of the screen over a dimmed backdrop (tap outside or ✕ to close). The cave in the middle of the map is a Home button. Landing a fish now flashes, shakes, splashes and the fish leaps out, then the card shows its rarity (junk, common to super rare by how hard it is, legendary) in that tier's colours, the size counting up, NEW! the first time this phone lands that kind (`clockout.dex`), and confetti for rare and up.

**v53.** Fishing fills the screen: a tall pond or sea scene (`CAVE_HOME.pond`, `VILLAGE.sea` in a 300x400 portrait) covers the stage, a shadow lurks under the float, nibbles tease, and the bite flashes a "!" bubble, ripples, darkens the edges and buzzes "HOOK IT!", then "HOOKED!" before the splash. Village lots are redrawn only when they change (no jumping when tapped) and the building card opens at a fixed spot near the top; map labels are two lines ("35% paid" / "opens soon") and Home is a yellow pill above the cave. The holiday planner starts with a month grid (best break per month, dots where you or friends are off) and then lists that month's breaks. News entries are merged into fewer, bigger updates.

**v54.** Speed. Netlify's request logs showed taps taking 1.5 to 5 seconds (state 2.7 s, zap 4.5 s, even ping 3 s at the median) because the functions run in US East while every record lived in Singapore, so each store read or write crossed the Pacific. The records now live in a store next to the functions (`clockout-near`, region picked from `AWS_REGION` by `nearRegion`); videos and cover frames (`clip/`, `thumb/`) stay in Singapore, behind the CDN. The first requests after the update copy everything else across in 5-second chunks (`moveStep`: lists the old store folder by folder, copies 48 keys at a time, keeps its place in `sys/movecur`, marks `sys/moved` at the end); until it's done every request answers 503 `{moving:true}`, so nothing is written to the old store mid-copy, and the phone shows "Moving your cave to a faster server" and retries. The scheduled jobs wait for the move. The old store is left untouched as a backup. `test/move.test.mjs` covers the move and the app on the split store.

**v55.** A new look: the cave as a train map. The header is a charcoal station sign with your own time left in large type. Each friend's lane is a strip map in their monster colour: stations for start, lunch and clock-out, the walked part greyed, and a lit dot for now that pulses softly (still under Calm mode and reduced motion). Overtime turns the line red and dashed; when someone is off, the dot sits on the last station. Type moves from Bungee and JetBrains Mono to Barlow and Barlow Semi Condensed (signage lettering, tabular figures), corners go square, and the palette is a neutral grey ground with charcoal ink so the twelve monster colours carry the colour. The local dev server now serves pages on Windows too.

**v56.** The train-map look reaches the village and the games. Village buildings are stations: charcoal name plates with a roundel (amber while being paid for, green once open), and Home is the interchange with two roundels. A building card opens under a charcoal sign band with a short slide up (no motion under reduced motion), and its savings bar is a line with start and terminus stations. The shop, bag, farm, cinema tabs and fishing buttons take the square sign corners and uppercase labels. Monster and fishing animations are unchanged. The v55 News entry covers both versions.

**v57.** The home is shown one room at a time. A tab row (Bedroom, Study, Living room, Kitchen, Yard, Whole home) crops the same house scene to the chosen room with a short camera move, so monsters and decorations are drawn bigger; each tab counts the monsters in that room, it opens on the busiest one, and the at-work board only shows in Whole home. Decorating still works in every room. The village map is replaced by the Village Line, a vertical train line: Home is the interchange at the top, then the Lake, Weather, Farm, Harbor, Cinema and Holidays, each with a picture, its state and a savings bar. Fishing moved out of the yard to the Lake station, which has its own card (a big lake picture, Go fishing, and Sell fish when Mr. Fishfish is around); the pond and Mr. Fishfish buttons are gone from the yard, and the texts that pointed to the yard now point to the Lake. The News entry for v55 covers v55 to v57.

**v58.** A Village Line station nobody has paid into yet shows its finished building as a blueprint (white linework on a blue grid, from the same building art), in the line and on its card with a Plan tag, instead of the same empty lot for every station. Once the first coin comes in it shows the building site as before. The v55 News entry now covers v55 to v58.

**v59.** The village becomes a small metro network instead of one line. Three lines run out from Home, the big interchange: the Water Line (blue) to the Lake and the Harbor, the Garden Line (green) to the Farm and the Weather station, and the Fun Line (purple) to the Cinema and Holidays. The Circle Line (orange) loops round Home through the Lake, the Farm and the Cinema, which makes them interchanges. Stations are white circles in their line's colour, interchanges are ringed in black, places not built yet have a grey ring and dotted track, and labels sit on the map with a halo, showing how much is paid or whether Mr. Fishfish is at the Lake. A legend names the four lines. Tapping a station opens its card as before. The line colours and the drawing style follow the look of Singapore's MRT map; the names and layout are the village's own.

**v60.** The Lake is redrawn in layers (`CAVE_HOME.pond(phase)`): far mountains, hills and a mixed treeline with a little cabin across the water, their reflection in the lake, a glitter path under the sun or moon, two ducks, lily pads, reeds, rocks, and a dock with a rope rail, a lantern and a bucket. It has three times of day: day, a golden hour from 5 to 7 pm (clock-out time; the sun sets behind the hills and the lantern and cabin window light up) and night (moon, stars, fireflies). The glints, ducks, fireflies and a dragonfly move gently, and stop under Calm mode or reduced motion. The layout the fishing game measures against (horizon at y 117, water to y 330, the dock) is unchanged, each time of day has its own gradient ids, and the game now zooms open from the middle of the screen instead of the old yard corner. The v55 News entry covers v55 to v60.

**v61.** The station sign only stands tall on the Board. On Chat, Days and Home (`body[data-view]`, set in `setView`) it folds into a slim strip: the cave name and your time left side by side, with the account, cave and News buttons under them; the eyebrow and the Now clock are hidden there (the Offline notice still shows). On a phone this gives chat and the home about 120px more room. The v55 News entry covers v55 to v61.

**v62.** Fix for the v54 move. The real store names folders with a trailing slash (`person/`), unlike the local emulator and the docs, so `allKeys` asked for `person//`, found nothing, and the first request after v61 went live marked an almost empty copy as done: no 503, every session and login gone (the old store in Singapore was never touched). `allKeys` now strips the slash, and before writing `sys/moved` the move lists both stores in full (no folders) and checks that every record in the old store is in the new one; anything missing is added to the list and copied on the next request, and `sys/moved` records the count it checked. The fake store in the tests now names folders with a slash too. To redo the move on the live site after this goes up, delete `sys/moved`, `sys/movelist` and `sys/movecur` from `clockout-near` (not `clockout`), and the `lock/` keys left by the failed logins.

**v63.** Passcode reset, and a new admin key. Only a scrypt hash of each passcode is kept, so a forgotten one can't be read back; the person sheet in the admin page now sets a new one (`POST /api/admin/reset-pin {pid, pin?}`: an empty pin gives a random 6-digit one), lifts that name's wrong-passcode lock, keeps phones already logged in, and logs `ev/pinreset` (shown in the activity). The built-in admin key is gone: its plain text had been committed to `test/api.test.mjs` in this public repo since v17, and the live site had no `ADMIN_KEY`, so anyone could open the admin page. The key now comes only from `ADMIN_KEY` in Netlify; without it the admin page stays shut. Tests use `test-admin-key`, and the seeded dev server uses `demo-admin`.

**v64.** No change to the app: a redeploy so a new `ADMIN_KEY` set in Netlify takes effect (environment variables are read at deploy time). Netlify can't show a secret variable's value once saved, so a forgotten admin key is replaced, not recovered.

**v65.** After a few catches the app could reload and show a page from v48 or earlier. Two causes. The service worker kept one offline copy of the page for every version (`shell-v1`) and wrote it without waiting, so an iPhone, which stops service workers quickly, often never finished the write; a reload that fell back to the copy (network slow for 4 seconds or failing) showed whatever old page was last written in full. Now each version saves its own complete set (page, styles, monsters, home and village art) into `shell-<version>` while it installs, waits for every later write (`waitUntil`), and deletes older sets when it takes over, so the copy is never older than the app. The reload itself is most likely the iPhone dropping a page that uses too much graphics memory: while the full-screen pond is open, the page behind it is now hidden with its animations paused, and the splash drops, plume and leaping fish are removed once their animation ends (before, about 30 stayed on the page after every catch).

**v66.** Every village station has a small picture card beside it (the house for Home, the lake, each building) with a tag: OPEN in green, SOON once paid for, or the percentage paid. A place being paid for is a blueprint that develops into colour from the bottom up as coins come in (`devArt`: the same building drawn twice, the colour copy clipped to the paid share, with a thin white developing line), on the map and as the big picture on its card; this replaces the old building-site art there. Open stations are filled green, all stations use the interchange ring, and two lines join the map: the Red Line arcs over the top from the Harbor to the Weather station, and the White Line (white with a dark casing) runs round the right from the Weather station to Holidays, so every end station is an interchange. Track to places not open yet stays dotted. v55 to v65 are live, so v66 has its own News entry.

**v67.** Fix for v66 on the dev site. The blueprint picture used the class `dev`, but the dev deploy puts `dev` on `<html>` (for the red DEV pill), so the rule `.dev svg{width:100%;height:100%}` matched every icon on the page and the coin, Home and ring icons grew to fill their boxes. The blueprint classes are now `bpv`, `bpv-plan` and `bpv-col`. Also removed a half rule left over from v59 that swallowed the rule after it. Production never had v66, so there is no News entry.

**v68.** The home, furnished room by room. The house scene (`CAVE_HOME.scene`) keeps its 400x300 layout, walls and floors, so decorations people placed and the monster spots stay where they were, but each room is now drawn to fill a phone screen: striped wallpaper, a picture, a bed and a bedside lamp in the bedroom; a pin board, a desk with a screen and a desk lamp in the study; a big curtained window, a hanging light and panelling in the living room; a counter with a sink, cupboards and a jar shelf in the kitchen (replacing the small table); a picket fence and a mailbox in the yard. Nothing the shop sells is drawn in. Lamps and screens glow at night. The room names moved off the drawing onto a plate on the picture, with arrows at the sides, dots underneath (the room tabs, green where someone is) and a sideways swipe, which is off while decorating so dragging furniture still works. Monster spots now fill each room from the middle out. The home heading that repeated the cave name is gone, leaving the who's-home line and the Village, Bag and Shop buttons.

**v69.** FoodSpin. A FoodSpin button sits next to Village, Bag and Shop, and on your own lane from an hour before clock-out. It asks the phone for its location (once, to a 5-minute-old reading at most), then asks OpenStreetMap's Overpass service (overpass-api.de, falling back to overpass.kumi.systems) for named restaurants, fast food and food courts within 2 km, straight from the phone; nothing goes through our server and the location isn't stored. Duplicates by name are dropped, and ten places at random go on an SVG wheel (Other places deals another ten). A spin turns the wheel 5 turns plus the pick (4.2 s, with a timer in case the transition never ends; instant under reduced motion), then shows the place, its kind and cuisine, the distance and a walking time at 80 m a minute, a Directions link to Google Maps (walking, by coordinates) and Share in chat, which opens the chat with a message ready to send. Place names are set as text, never as markup. Results are only for you. The room frame is isolated so its plate and arrows no longer sit above sheets.

**v70.** FoodSpin, faster and nicer. The public Overpass servers were taking 20 to 60 seconds or failing (504s and 429s), so Singapore's places are built into the app: `scripts/food-data.mjs` downloads every named restaurant, fast-food place and food court in Singapore's bounding box from OpenStreetMap in a 4x4 grid of small queries (the whole island in one query times out) and writes `public/food-sg.json` (6,772 places on 18 Nov 2026; 325 KB, about 104 KB over the wire). The phone fetches it the first time FoodSpin opens (the service worker then keeps it with the page) and filters by distance on the phone, in about a tenth of a second, so in Singapore the location never leaves the phone. It's only used when your whole 2 km circle is inside the file (about 2 km from its edges), so near Johor or Batam it asks live. Live searches go to one server at a time with a 20 s limit each and are kept on the phone for a day per 100 m spot. The wheel has eight slices with names on up to two lines, a rim of bulbs that blink while it spins, a bigger red pointer that ticks, your monster in the middle, and the losing slices dim when it stops (with a short buzz where phones allow). On the dev site and local runs a Test location picker (Singapore areas, Johor Bahru, Kuala Lumpur) replaces the phone's location. Rerun `node scripts/food-data.mjs` to refresh the list.

**v71.** FoodSpin lists for Johor Bahru and the Klang Valley too. The public Overpass servers were too busy to download them (hours of timeouts), so `scripts/food-data-pbf.mjs` builds every region from Geofabrik's Malaysia-Singapore-Brunei extract instead: two passes over the .osm.pbf with `osm-pbf-parser` (not a project dependency; install it with `--no-save` or point `PBF_TOOL` at a folder that has it), the second finding the middle of places drawn as buildings, such as many hawker centres. It takes about 30 seconds. On 18 Nov 2026: `food-sg.json` 6,895 places (109 KB gzipped), `food-jb.json` 2,488 (40 KB), `food-kl.json` 7,521 (121 KB). `scripts/food-data.mjs` (Overpass, by tiles) still works when the servers are quiet; both take regions as arguments and share one table of boxes with `FS_REGIONS` in the page. The phone loads only the file for the region it's in, used when the whole 2 km circle fits inside that region's box; anywhere else it searches live as before. The dev-site test picker gained Johor Bahru city, Iskandar Puteri, KLCC, Mid Valley, Petaling Jaya and Penang (no file, to try the live search).

**v72.** FoodSpin opens the pick itself in Google Maps instead of starting a walking route: the place's name and the Open in Google Maps button both link to `google.com/maps/search/<name>/@<lat>,<lon>,18z`, a search for the name with the map on that spot, so Google shows the nearest match and Directions is one tap away there. (A search for the name plus coordinates in the query listed look-alike names across the island; coordinates alone drop a pin without the place's details.)

**v73.** Fix: from the second FoodSpin spin on, the pick lit up and the result showed about 0.3 s into the spin. The losing slices fade back to full colour when a new spin starts, and that fade's `transitionend` bubbled up to the wheel and was taken for the end of the spin. Now only the wheel's own `transform` transition ends a spin (the 4.6 s timer stays as the fallback).

**v74.** FoodSpin gets choices and a new home. The lists now include cafés (`amenity=cafe`) and bakeries (`shop=bakery`), coded `k` and `b` (Singapore 9,182 places, 143 KB gzipped; Johor Bahru 3,209; Klang Valley 9,593), and the live search asks for them too. A budget row (Any, $ Cheap, $$ Restaurant) and kind chips (Chinese, Malay, Indian, Japanese & Korean, Western, Rice, Noodles, Bread & cakes, Coffee & tea, Fast food, Hawker; several at once means any of them) narrow the wheel, with a count of how many nearby places match. Kinds come from the OpenStreetMap type and cuisine plus words in the name (mee, nasi, kopi, 面, 饭 and so on); budget is a guess from the type, since OpenStreetMap has almost no prices: hawker centres, food courts, fast food, cafés and bakeries are $, other restaurants $$. With no kind picked the wheel only holds places for a meal (no cafés or bakeries unless they're kopitiams). The choices are remembered on the phone. The FoodSpin button next to Village, Bag and Shop is gone: a little wheel with a bobbing Dinner? tag sits on the kitchen counter (hidden while decorating) and opens it; the button on your own lane before clock-out stays.

**v75.** FoodSpin's live search (outside Singapore, Johor Bahru and the Klang Valley) asks Photon first, komoot's free OpenStreetMap search (`photon.komoot.io/reverse` with `osm_tag` filters for restaurants, fast food, food courts, cafés and bakeries; it allows calls from any site). It answers in about a second but returns only the nearest 50 per call, so FoodSpin asks from five spots at once (here and 1.2 km north, south, east and west) and keeps what's within 2 km: in central Penang about 200 places. Photon gives no cuisine, so kinds there come from names. Overpass stays as the fallback if Photon doesn't answer within 10 s. Photon's terms ask for fair use (heavy use gets throttled); results are kept on the phone for a day per 100 m spot.

**v76.** FoodSpin's choices move behind one Filter button. The sheet shows the button ("Filter · 2" when two choices are set, filled in) and how many nearby places match; tapping it swaps the wheel for a panel with the budget row, the kind chips and, on the dev site, the test location, then Show places deals the wheel again and Clear all resets the choices. While the panel is open, each tap only updates the count. FoodSpin always opens on the wheel.

**v77.** FoodSpin fixes. The wheel spun 5 turns in 4.2 s with a sharp start, about 40 degrees a frame at first against 45-degree slices, so it seemed to jump or run backwards; it now turns 3 times over 5 s with a gentler curve (at most about 13 degrees a frame), and the pointer ticks more softly. The test-location picker is gone (FoodSpin always uses where you are); the Filter panel gains How far? (500 m, 1 km, 2 km), counted in the Filter badge and remembered with the other choices, and the count line says "N places within 1 km". The little wheel moved from the kitchen counter, where it covered the name tags of monsters cooking there, to a small new shelf above the stove.

**v78.** A pay rise, an active bonus and Ranks. `COINS.day` goes from 50 to 250 a workday; shop and village prices stay as they were. The wage gets an active bonus from the last 7 days in the cave (`activeBonus`): 1 point per chat message (up to 20), 2 per zap sent (up to 10), 5 per vlog clip (up to 6); 10 points +5%, 25 +10%, 45 +20% (`COINS.active`). It reads the admin stats log (`ev/msg`, `ev/zap`, `ev/clip`, kept 90 days) through `evSince`, which lists only the ~28-hour key slices that cover the time asked for. Landed fish are now logged too (`ev/fish/<ts>_<pid>_<cid>_<kind>_<size>`), so fishing ranks start from v78. `GET /api/ranks` returns the cave's boards, worked out at most once a minute per cave: richest, longest streak and village builder (all time); most fish, biggest catch, most overtime (from `ot/<day>/<pid>` against each clock-out), most zaps, chattiest and most vlogs (this week from Monday, SG time); legendary fish (last 90 days); plus your own points. A Ranks button next to Village, Bag and Shop opens them, top 5 per board and your own row if you're further down. The coin test's running totals are now written in terms of `COINS.day`, and it checks a +5% wage after 10 chat messages and the ranks reply.

**v79.** Wages arrive by themselves. `payday()` runs with the rain alerts every 15 minutes: on a weekday it pays everyone whose clock-out time has passed and who hasn't been paid today, without them opening the app. On a public holiday in their region (`holidayOf`) the wage is doubled and logged as `holiday.<day>` ("Public holiday pay (x2)" in the wallet); weekends and personal days off pay nothing. The app's own payment on opening and the clock share `payWage`, which pays a day once (`paid/<pid>/<day>/pay`) with the coffee machine and the active bonus, so the two never both pay. The 5-day streak bonus still needs the app opened. Tested with a person who never opens the app, Christmas Day, a weekend, a day off, and the app and the clock on the same evening.

**v80.** Giving to a village building asks first. The +10/+50/+100/+500 buttons only fill in the amount, and Give needs a second tap ("Tap again to give 500") within 5 seconds, the same tap-twice pattern as deleting an account or leaving a cave; changing the amount starts over. A friend's +500 tap had gone straight to a building, so the clock's `payday()` run sends Shunyi 300 coins back once (`fix/v80-shunyi`, why `sorry.v80`, "Sorry gift" in the wallet) and posts an apology in her cave as a note from the app: chat messages with `sys: true` are shown centred with no sender (`sysChat`). Older phones show such a note as a message from "Clock-out".

**v81.** Annual leave: 10 days a calendar year (`ANNUAL_LEAVE`), each paying double. A day off once they're used up pays nothing; each paid one is recorded as `al/<pid>/<year>/<day>`, so the count survives the 60-day tidy-up of `leave/` records. The account sheet shows the days left this year (10, less days already paid and weekday days off still planned, not counting public holidays), from `me.leave` in the state reply. `payWage` now works out the kind of day itself, so the app on opening and the clock's `payday()` agree: a public holiday in the person's region pays x2 (`holiday.<day>`), their own day off (`leave/<pid>/<day>`, set on the card or by the holiday planner) pays x2 (`leave.<day>`, "Day off pay (x2)" in the wallet), any other weekday pays once (`pay.<day>`); weekends still pay nothing. The coffee machine and the active bonus apply as before. Tested with a day off on a Monday.

**v82.** Cave Exchange, built but switched off. `makeApp` takes `cexDb` (a PostgreSQL connection); without one, as on both deploys today, `/api/exchange/*` and `/api/admin/exchange/*` answer 503 and nothing new shows. With one, the state reply carries `cex: true`, the village metro map gets an Exchange station on a brown Market Line, and tapping it loads `public/exchange/exchange.js` and `exchange.css` (only then) for a full-screen view: Market (search, watchlist), a stock page (price, day stats, chart, order book, trading with a fee estimate, recent trades, IPO buying), Portfolio (wallet and exchange cash, Deposit and Move to wallet over the custody bridge in `netlify/lib/exchange/wallet.mjs`, shares, open orders), My company (create, send for approval, start the IPO) and History. The admin page lists companies waiting for approval. Try it locally: `CEX=1 SEED=1 DEV=1 node test/dev-server.mjs` (needs `@electric-sql/pglite`), which seeds two companies through the real routes. Design and rules: `docs/CAVE_EXCHANGE_*.md`.

**v83.** The village cinema shows a one-minute cartoon instead of the week's clips (those stay in Days). `public/cartoons.js` and `cartoons.css` load the first time the cinema opens: a small stage engine (scenes for the office, pantry, MRT, bedroom and a hawker stall; monsters drawn with `monEl` and moved, re-moodied and given cartoon effects such as shake, shiver, freeze, faint, pyjamas; speech bubbles; captions; emoji props) and eight scripted episodes in English with some Singlish: The Last Curry Puff, 5:59 PM, Aircon Wars, The Chope, Reply All, Eat What?, The Printer and Monday, 45–57 seconds each. The episode changes every Monday (Singapore days, cycling through the eight). The cast is the viewer, two cave-mates picked anew each week (Kopi, Milo and Teh fill in for small caves) and Eugene, the boss: drawn as his own huge horned villain (not one of the app's monsters), about one and a half times everyone's size, who roars and shakes the screen whenever he walks in. Sound effects and a little loop are made with Web Audio, so nothing is downloaded. Checked by running all eight episodes fast-forwarded with no errors.

**v84.** Comments on the cartoon. Under the cinema screen, the cave's comments on this week's cartoon (`GET`/`POST /api/cartoon/comments`, up to 200 characters, stored as `ctc/<cid>/<monday>/<id>` with the episode title), so every week starts a fresh wall; deleting a cave deletes its comments. The admin page lists the latest 300 comments from every cave with name, cave, episode and time (`admin/cartoon-comments`).

**v85.** Village buildings open the moment they're paid for (`BUILD_MS` is 0; it was a day). Buildings paid for before v85 that were still waiting open at once: `builtOf` reads each `built/<cid>/<kind>/<openAt>` key as no later than now, so no stored record changes.

**v86.** Village buildings redrawn. The weather station, farm, harbor, cinema and holiday planner in `village.js` now have outlines, a darker side wall, a ground pad and more detail. A building being paid for is a faded outline on sky that fills with colour from the ground up (`.bpv`), instead of the dark blue blueprint. The building card shows it on a little stage (sky and grass, night at night) with a status chip (Not started, Building · 45%, Open) and a crane while it's going up; the progress is a big percentage over a striped bar; givers are monster chips, the biggest with a crown. The Exchange's chart (dev only) is candlesticks with volume bars; tap a candle for its numbers.

**Fluff's Cloud Shield (v50).** Fluff's power is now Cloud Shield (it keeps the weather too): zaps take 20% less of a Fluff's coins at Lv1, 40% less at Lv2, and at Lv3 the first grab of each day is blocked entirely.

Keys: `don/<cid>/<building>/<id>/<pid>/<coins>`, `built/<cid>/<building>/<openAt>`, `plot/<cid>/<n>/<id>/<crop>/<pid>/<plantedAt>`, `pw/<cid>/<cropId>/<at>/<pid>`; crops share the bag with fish (`bag/<pid>/<id>/<crop>/<stars>`). The test site also has a **+5000** coins button. Tests: `test/village.test.mjs`.

**Zap speed (v49).** A zap reads everything it needs in one go (who, cooldown, welcome, safe, their coins, their phones), saves in one go and answers; the buzz is sent after the answer (in the background). With the functions in the US and the data in Singapore that's about 3 trips instead of about 8: roughly 0.7 s instead of 3 s or more before the phone shows the coins taken. `sent` in the answer is now the number of phones on file rather than the number the buzz reached.

## Fishing, the bag and the shop (v45)

**Fishing.** Tapping **Go fishing** at the Lake (a station on the village's Water Line; before v57 it was a pond in the yard) opens a full-screen game seen from behind your monster (full screen since v46, so a finger can't land on the page behind it). There's no daily limit; each cast goes: cast, wait for the bite, tap **Hook!** within the window (too early or too late and it's gone), then hold and release anywhere on the screen to keep the fish inside the green band until the bar fills. Bigger fish dart more and have a narrower band. The server picks the fish when the line is cast (`fish/cast`) and the phone reports whether it was landed (`fish/land`), so a catch can't be invented, only a lost fish claimed as won.

| Fish | Size | Worth | Odds |
|---|---|---|---|
| Old boot | - | 1 | 12% |
| Tadpole | 3-8 cm | about 4 | 30% |
| Carp | 20-45 cm | about 9 | 24% |
| Koi | 25-60 cm | about 16 | 14% |
| Pufferfish | 15-35 cm | about 24 | 9% |
| Catfish | 50-110 cm | about 35 | 6% |
| Shark | 90-160 cm | about 70 | 3% |
| Golden fish | 20-40 cm | about 150 | 2% |
| **Legendary (v47):** Rainbow dragonfish | 60-120 cm | about 400 | 0.05% |
| Ghost fish | 30-70 cm | about 500 | 0.04% |
| Coelacanth | 100-200 cm | about 700 | 0.03% |
| Baby kraken | 40-90 cm | about 900 | 0.02% |
| Cosmic fish | 50-100 cm | about 1,500 | 0.01% |

Together the legendary fish come up about once in 670 casts; a lucky cat doesn't change their odds, and Mr. Fishfish never asks for one as his fish of the day. A fish's worth grows with its size (0.7 to 1.3 times the figure above).

**The bag** (button next to Shop) holds up to 24 fish. From it a fish can be sold or moved into an aquarium.

**Mr. Fishfish** comes to the Lake from 12 to 2 pm and 7 to 10 pm every day, and only then can fish be sold. Each day he wants one kind of fish and pays double for it.

**Aquariums.** An aquarium holds 3 fish and a big fish tank 8, shared by the cave; the fish swim in it, still belong to whoever put them in, and can be taken back out. An aquarium can't be sold while it's needed for the fish in it.

**The shop** shows every item as a same-sized tile, with one detail card on top for the tile you tapped (what it does, the price, Buy), and filters for things that do something and things you can afford.

The numbers are in `FISH` and `FISHING` in `netlify/lib/handler.mjs`. Keys: `bag/<pid>/<id>/<kind>/<size>`, `tank/<cid>/<id>/<kind>/<size>/<pid>`, `cast/<pid>` (the fish on the line).

## Test site (dev branch)

Work goes to the `dev` branch first. With Netlify branch deploys turned on for `dev`, it is served at `https://dev--<site>.netlify.app`, which doesn't use deploy credits. The test site:

- keeps its own data (store `clockout-dev`), so nothing done there touches the real caves; sign up again there;
- installs as its own app, "Clockout DEV", with a red DEV band on the icon and a red DEV pill on screen;
- lets you film at any time, and **Ring now** sends the film-time notification to your test cave;
- doesn't run the scheduled jobs (rings, rain alerts), because Netlify only runs those on the live site.

Merging `dev` into `main` is what updates the live app (one deploy, 15 credits).
