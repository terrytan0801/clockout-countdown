# Clock-out Countdown: notes for Claude Code

An off-work countdown PWA for Terry and friends (mostly working in Singapore): caves (groups), zaps (push
notifications), monsters, a daily vlog calendar, monster coins, fishing, and a shared village. Hosted on
Netlify (site `splendid-gnome-120c81`). README.md has the full history, one paragraph per version.

## How Terry works

- Talk to Terry in Chinese. The app's UI text is English.
- When something is unclear, ask a multiple-choice question. Don't make things up.
- "情况A 开始" means read-only: look, explain and suggest, but change or push nothing until "结束情况A".
- Every build bumps the version in four places: the footer `<span>vNN.0</span>` in `public/index.html`,
  `VERSION` in `public/sw.js`, `version` in `package.json`, and the title line of `README.md`. Add a README
  paragraph for the version.
- User-visible changes get a News entry (the `NEWS` array in `public/index.html`, newest first) with comic
  panels (`panelArt` cases). Keep News short: merge related updates into one entry.
- Work on the `dev` branch and push it. Merge `dev` into `main` (fast-forward) and push `main` only when Terry
  says "上线": each production deploy costs Netlify credits. `dev` deploys to `dev--splendid-gnome-120c81.netlify.app`
  with its own data (store `clockout-dev`).
- Never put the admin key in code, commits, chat or anywhere public. Since v62 it lives only in Netlify's `ADMIN_KEY`
  (no built-in key; the old one leaked through a test file). Tests use `test-admin-key`.

## Layout

- `public/index.html`: the whole client (vanilla JS, no build step). Art lives in `public/cave-home.js`
  (`CAVE_HOME`), `public/village.js` (`VILLAGE`), `public/monsters.js`, `public/monster-props.js`, `public/monsters.css`.
- `public/admin.html`: the admin page (opened with the admin key).
- `netlify/functions/api.mjs`: every `/api/*` route; it opens the stores and calls `makeApp` in `netlify/lib/handler.mjs`.
- `netlify/functions/film-ring.mjs`, `rain-alert.mjs`: scheduled jobs (daily vlog ring; rain alerts and holiday tips).
- `netlify/lib/stores.mjs`: where data lives (v54). Records sit next to the functions (store `clockout-near`);
  videos and cover frames (`clip/`, `thumb/`) stay in store `clockout` in Singapore. The first requests after
  v54 goes live copy the records across; until then the API answers 503 `{moving:true}` and the phone retries.
- `netlify/lib/`: `clips.mjs`, `holidays.mjs`, `planner.mjs`, `powers.mjs`, `stats.mjs`.
- The key layout of every record is listed at the top of `netlify/lib/handler.mjs`.

## Commands

- `npm test`: 13 test files; each prints "All … checks passed."
- Local server with demo data: `SEED=1 DEV=1 node test/dev-server.mjs 8888` (add `SEED_COINS=n` for coins).
  Demo users Terry, Sukee and others, PIN 1234; admin key `demo-admin` (seeded runs only).
- Phone screenshots: Playwright with `devices["iPhone 13"]`.

## Gotchas

- Global CSS class names clash (`.win`, `.bite` and others are already styled). Prefix new classes (`fz-`, `v`).
- Dev deploys speed up crops (60x) and finish buildings in a minute.
- Netlify Blobs here has no compare-and-swap, so one-time actions use "everything in the key" patterns
  (`claimKey`, `payOnce`).
- Malaysia's 2027 public holidays aren't in `netlify/lib/holidays.mjs` yet.

## Status (17 Nov 2026)

Production runs v64 (v62 fixed the v54 move, v63 added the admin passcode reset and dropped the built-in admin
key; v64 only redeploys so a new `ADMIN_KEY` takes effect). v61 had marked an almost empty copy as moved, so
to redo the move delete `sys/moved`, `sys/movelist`, `sys/movecur` and the failed-login `lock/` keys from store
`clockout-near` (never from `clockout`); the next request copies everything again (787 keys). Changing
`ADMIN_KEY` in Netlify only takes effect on the next deploy.
