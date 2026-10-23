# Flappy Bird

An illustrated, single-player arcade game. Anonymous visitors can play instantly;
Freebuff users can put their best flight on the shared leaderboard. The game is
branded **Little wings** with locally bundled Fraunces and DM Sans fonts, a coral
bird, sculpted pipes, and a layered canvas landscape. No external image or font
requests are required.

## Run

```sh
bun install
bun run dev
```

Open the printed loopback URL. Space, arrow up, a pointer click or a touch flaps;
Escape or P pauses. Leaving the tab pauses automatically. Resume counts down
before restoring the exact simulation state. Sound is opt-in, and fullscreen is
shown only where supported. The layout fills the viewport without page scrolling;
only a long leaderboard scrolls inside its dialog.

```sh
bun run typecheck
bun test tests
bun run build
```

Use the repository's pinned Bun when working inside the monorepo. This project is
standalone, with its own lockfile; it does not import other repo packages.

## Optional Freebuff sign-in

Read `node_modules/@freebuff/auth/AGENTS.md`. Register a new project and use its
own client, never another template's registration. In Freebuff Sites, provision
auth with `sites_enable_auth`; deployment injects the existing public bindings
`FREEBUFF_CLIENT_ID`, `FREEBUFF_ISSUER`, and `APP_ORIGIN`. No auth secret is needed.
The SDK runs before the SPA and owns `/auth/freebuff/*`.

For standalone hosting, register with the creator's Freebuff CLI login:

```sh
bunx @freebuff/auth register --project your-flappy-bird --name "Little wings" \
  --environment production \
  --redirect-uri https://your-site.example/auth/freebuff/callback
```

Use a separate development client for loopback, following `.env.example`.
`APP_ORIGIN` must be the configured canonical origin, never an arbitrary request
host. Missing auth configuration leaves the game anonymous and hides sign-in;
it never creates a fake signed-in development identity. The Worker rejects
anonymous score writes regardless of client UI.

Signing in applies to subsequent flights. Anonymous scores remain a personal
best on that device; they are not retroactively uploaded. The public board
contains the top 20 personal bests and display names, never emails or account IDs.
A zero-score completed flight is valid. Ties retain their original achievement
order. A signed-in player's failed save exposes a retry action on the result.

## Storage and score verification

Provision Cloudflare D1 as `DB`. Local Vite/workerd creates a local database using
`wrangler.jsonc`; deployed bindings come from the platform. The standalone Worker
creates its small SQLite schema on first API use, like the existing templates.
This template never accesses the platform's Postgres or Convex databases.

- `leaderboard`: one best score per verified `user.sub`.
- `runs`: random course seed, owning user, start time, and consumption time.
- A signed-in flight obtains its seed from the Worker. It submits only the run ID,
  fixed-step duration, and flap ticks. The Worker replays the shared simulation;
  it does not trust a claimed score, user ID, or name.
- Runs expire after 30 minutes, allowing pauses. Old runs are cleaned in bounded
  batches. Rapid starts, oversized bodies, invalid flap timing, unfinished replays,
  and runs faster than wall-clock time are refused.
- The single-use update and best-score upsert run in one D1 transaction. Retries
  are idempotent, and a lower score cannot overwrite a higher score.
- Authenticated mutations require a same-origin request. Personalized responses
  are private and uncached. No credentials enter the browser's storage.

Replay verification is a casual-game integrity check, not bot prevention: a
skilled script can produce a valid flight. There are no prizes or monetary stakes.
Missing storage or a connection failure does not stop anonymous play. A signed-in
player whose run could not be registered gets a clearly identified practice flight.

## Customize

- `src/game/render.ts`: bird, pipes, sky, clouds, hills, terrain and particles.
  All artwork is code-native and resolution independent.
- `src/game/physics.ts`: deterministic 120 Hz physics, seed generator, collision
  geometry, course spacing and replay validation. Rendering and viewport size do
  not change collision coordinates or scoring. A flight is capped at six minutes.
- `src/main.ts`: UI states, controls, local best, auth status and leaderboard.
- `src/style.css`: typography, colors, layout, and responsive breakpoints.
- `src/game/sound.ts`: short synthesized sounds; no audio downloads.
- `src/worker/index.ts`: auth wrapper, API, D1 schema and score persistence.

Changing physics changes replay verification too, so let in-progress flights
finish before deploying a physics revision if preserving those scores matters.

## Build and deployment

`deploy.json` points to the built Worker and static assets for Freebuff Sites.
`wrangler.jsonc` contains only a local placeholder D1 binding; a standalone
Cloudflare preview should use a separate configuration with its own Worker name,
real preview D1 binding, canonical origin, and registered public auth settings.
Keep that preview identity outside the distributed template.

This template's entry in `templates/templates.json` is source only. Publishing the
R2 template catalogue is the production rollout and requires the owner's explicit
approval. A preview deployment does not publish or update that catalogue.

Tests cover the deterministic simulation, collision boundaries, replay validation,
anonymous access, account isolation, cross-origin refusal, rate limiting, expired
runs, duplicate submissions, and best-score preservation using real in-memory
SQLite behind the D1 interface. Live provider consent and sign-out still need a
registered client and an authenticated creator account to verify end to end.
