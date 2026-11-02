# Game Dev Club automation

Weekly **Game Dev Club** for PakGameDev: play one game, discuss design on Discord, announce everywhere else.

Public board: [pakgamedev.com/club](https://pakgamedev.com/club)

## Cadence (PKT)

| When | What |
|------|------|
| **Mon ~7:00 AM** | Pick highest-voted queued game → `current/game`, open Discord forum thread, announce, generate covers + outreach package, Bluesky + LinkedIn Page posts |
| **Mon morning (manual)** | Reddit IMAGE post via Greasemonkey; paste IG / TikTok / YouTube from `outreach/weekly.md` |
| **Sun 11:00 PM** | Archive `current/game` → `past/`, retag Discord thread as done |

Between Sunday archive and Monday pick the club page shows “Next game is being chosen.”

**Play window:** Monday morning through Sunday 11pm PKT. Discussion lives in that week’s Discord forum thread.

## Discussions (single home)

- **Deep discussion:** Discord forum only (role ping + weekly thread).
- **Discovery:** club page, Discord announce, Reddit, Bluesky, and a one-paste package for Instagram / LinkedIn / TikTok / YouTube.
- Public posts always deep-link to the club page and the current Discord thread. Do not run a second parallel discussion venue.

## How games enter the queue

1. Curators add Steam/Itch pages via Greasemonkey “Add to Game Club” → `gameclub://` → `gameclub.sh` → `newsteamgame.rb` / `newitchgame.rb`.
2. Members may **casually suggest** games in normal Discord chat. There is **no** nominations channel or public submit form; curators add suggestions when they fit.
3. Each queue doc starts with `votes: 0`. Visitors upvote on the club page (one vote per Firebase anonymous UID per game).
4. Monday selection picks the **highest `votes`** (random among ties), writes `current/game`, deletes the queue doc.

## Firestore layout

Project: `pakgamedev-com`  
Base: `artifacts/{APP_ID}/public/data/`

| Path | Role |
|------|------|
| `games/{doc_id}` | Queue (`votes`, images, url, …) |
| `games/{doc_id}/votes/{uid}` | Per-UID upvote markers |
| `current/game` | Now playing (+ `discord_thread_url`, `discord_thread_id`) |
| `past/{doc_id}` | Archive after Sunday |

### Client write rules (Firebase console)

Anonymous auth must be allowed to create/delete own vote docs and update `votes` on queue games. See [`firestore.rules.example`](firestore.rules.example) and deploy those rules before upvotes work on the club page.

## Outreach artifacts (written Monday)

| File | Use |
|------|-----|
| `outreach/weekly-cover.png` | 1080×1080 share cover (blurred bg, stacked Let's/Play/Analyze/Discuss, framed cover + PLAY) |
| `reddit-auto-post/post.json` | Title/body/cover URLs for Reddit Greasemonkey |
| `outreach/weekly.md` | Captions + links for IG / TikTok / YouTube (paste); LinkedIn paste fallback |
| `outreach/bluesky.json` | Short Bluesky post payload |
| `outreach/linkedin.json` | LinkedIn Page caption + cover metadata |

Cover generation: `scripts/build_weekly_cover.py` (Pillow). Runs inside the Monday Actions job.

Bluesky posts automatically when `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD` secrets are set.

LinkedIn Organization Page posts automatically when LinkedIn secrets are set (see below). Instagram / TikTok / YouTube stay paste-from-`weekly.md`.

### LinkedIn (Organization Page)

Posts the weekly cover + long caption as the **Page** (not a personal profile).

1. Create a [LinkedIn developer app](https://www.linkedin.com/developers/apps) under the PakGameDev Page admin account.
2. Request **Community Management API** (or equivalent product that grants `w_organization_social`).
3. Auth → add redirect URL `http://localhost:8765/callback`.
4. Mint tokens locally:

```bash
LINKEDIN_CLIENT_ID=… LINKEDIN_CLIENT_SECRET=… node scripts/linkedin-oauth-setup.js
```

5. Add GitHub Actions secrets:

| Secret | Required | Notes |
|--------|----------|-------|
| `LINKEDIN_ORGANIZATION_ID` | yes | Numeric id from `linkedin.com/company/NNNNNNN/admin/` |
| `LINKEDIN_CLIENT_ID` | for refresh | App client id |
| `LINKEDIN_CLIENT_SECRET` | for refresh | App client secret |
| `LINKEDIN_REFRESH_TOKEN` | preferred | From the helper (when LinkedIn returns one) |
| `LINKEDIN_ACCESS_TOKEN` | fallback | Used if refresh is unavailable |

6. Test: Actions → **Test Club Outreach Channels** → channel `linkedin`.

### Reddit (no Devvit)

Reddit does not allow publishing Devvit apps from Pakistan, so Reddit is **manual but one-click**:

1. Install [`greasemonkey/reddit-game-club-post-button.js`](greasemonkey/reddit-game-club-post-button.js).
2. After Monday’s commit is live on GitHub Pages, open  
   `https://www.reddit.com/r/PakGameDev/submit?type=IMAGE`
3. Click **Weekly Game Post** — fills title, body, and the generated cover image.
4. Submit. Body CTAs point to Discord + the club board.

The old `reddit-auto-post/pak-game-dev-app` Devvit project is unused leftover; do not rely on it.

## Local curator setup

1. Place `service.json` (Firebase service account) in this repo root (gitignored).
2. Register OS protocol `gameclub://` to run `gameclub.sh`.
3. Install Greasemonkey scripts under `greasemonkey/`.
4. Optional cover preview: `pip install Pillow && python3 scripts/build_weekly_cover.py --name "Game" --image-url "https://…"`

## Gym workflows

`word.yml`, `image.yml`, `trivia.yml`, and `news.yml` are separate Discord design-gym reminders, not part of the weekly game club loop.
