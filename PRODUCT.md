# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Terry and a small circle of friends, most of them working office jobs in Singapore (some with ties to
Malaysia). They open the app on their phones during the workday, in short glances of a few seconds to a
minute or two: check the countdown, see who is still at work, zap a friend, reply to a line of chat.
Confirmed by Terry on 17 Nov 2026.

## Product Purpose

Waiting for clock-out together. Each person sets a clock-out time; the app shows how long everyone in a
cave (a group of friends) still has, who is on overtime and who has already left, and lets them nudge each
other. Success is a friend glancing at the app and knowing at once where everybody stands.

## Positioning

The countdown is shared. A solo timer could show your own minutes; this shows the whole cave of friends
waiting side by side, each as their own monster. Monsters, coins, fishing and the village are extras that
sit behind that.

## Operating Context

- An installed PWA on phones, opened many times a day in short visits at the office.
- Zaps are push notifications sent between friends.
- A daily vlog ring asks the cave to film a short clip; clips fill a cave calendar.
- Rain alerts and holiday tips arrive from scheduled jobs.
- All times are Singapore time (UTC+8).

## Capabilities and Constraints

- Caves (groups), statuses Working / Overtime / Off, zaps, chat and pinned notes, reactions.
- Monsters with levels, monster coins, a shop, fishing, a shared village (weather station, farm, harbor,
  cinema, holiday planner), a News feed, an admin page.
- One client file, `public/index.html`, vanilla JS with no build step; art in separate JS and CSS files.
- UI text is English.
- Every user-visible build bumps the version in four places and adds a News entry (see CLAUDE.md).
- `dev` is the working branch; production deploys only when Terry says so.
- For a redesign, Terry allows everything visual to change (monster looks, scene art, layout, where
  features sit) as long as no function or data is lost.

## Brand Commitments

- Name: Clock-out Countdown. Groups are called caves; nudges are zaps.
- Each person is a monster in one of 12 colours they pick when joining.

## Evidence on Hand

- Demo data for local runs: `SEED=1 DEV=1 node test/dev-server.mjs 8888`.
- README.md holds the version history, one paragraph per version.
- No user research, testimonials or usage numbers on hand; do not invent any.

## Product Principles

1. The cave comes first: every friend's standing is readable in one glance.
2. Built for glances at work: the answer is on screen before any tap.
3. Games and extras never stand between a person and the countdown.
4. Nothing a friend already has (coins, clips, village progress) is lost by a change.
