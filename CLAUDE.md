# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Yacht Dice (요트다이스) web game with an **optimal-EV helper engine**, online multiplayer, and a leaderboard. React 19 + Vite + TypeScript front end; Supabase (Postgres + Realtime) backend for multiplayer; a separate Electron tray app in `desktop/`. Code comments are in Korean.

## Commands

```bash
npm install
npm run dev            # vite dev server → http://localhost:5173 (PWA/service worker DISABLED here)
npm test               # vitest run — pure-logic tests (scoring, probability, solver sanity)
npm run test:watch     # vitest watch
npm run typecheck      # tsc --noEmit
npm run build          # prebuild regenerates V.bin, then tsc --noEmit + vite build → dist/
npm run preview        # serve the build; use this (not dev) to test PWA install / offline
npm run build:table    # ~10s, backward-induction precompute → public/V.bin (Node, via tsx)
npm run generate-pwa-assets   # regenerate public/ icons from public/icon.svg
```

Run a single test: `npx vitest run src/engine/probability.test.ts` (or `-t "<name pattern>"` for one case).

Desktop tray app (fully independent — its own `package.json`/`node_modules`, no link to the web build):
```bash
cd desktop && npm install && npm start    # run the Electron tray app
cd desktop && npm run dist                 # build installer → desktop/release/*.exe
```

## The helper engine (the core, non-obvious part)

The helper computes a **true whole-game optimal expected value** via a two-stage DP. Understanding the split between the two stages is essential before touching `src/core` or `src/engine`:

1. **Offline precompute** (`src/precompute/buildValueTable.ts`, Node-only): backward induction over all `2^12 × 64 = 262144` between-turn states (filled-category bitmask × capped upper subtotal 0..63). Writes the value function `V` to `public/V.bin` (~1 MB `Float32Array`). `V(s)` depends only on states with one more category filled, so it's solved in a single popcount-descending pass.

2. **Runtime within-turn DP** (`src/engine/withinTurnDP.ts`): per decision, a light DP over the 252 dice multisets and the keep subsets. **One recursion is reused three ways** — full-game value, per-category EV, and combo probabilities — by swapping only the 0-reroll *leaf* values (see `solveLayers`). The public entry point is `createAdvisor(V, rules).advise(card, dice, rerollsLeft)` in `src/engine/advisor.ts`; the UI calls nothing else.

### Invariants you must not break

- **`CATEGORY_IDS` order in `src/core/rules.ts` is the V.bin bit index (0..11).** Reordering it silently corrupts every cached value. The comment there says so — heed it.
- **The state packing in `src/core/stateIndex.ts` (`packState`, `UPPER_LEVELS`) is the byte layout of V.bin.** Precompute and runtime must agree exactly.
- **Changing any field of `RuleConfig` (`DEFAULT_RULES` in `rules.ts`) invalidates V.bin.** You must rerun `npm run build:table` or the helper's advice will be wrong but plausible. `prebuild` regenerates V.bin before every `npm run build`, but `npm run dev` uses the committed `public/V.bin` as-is.
- `src/core/dice.ts` holds the static multiset combinatorics (hand/keep enumeration, transition probabilities) shared by precompute and runtime — treat its index mappings as a frozen contract too.

`src/core/rules.ts` is the single source of truth for categories, scoring rules, and dice/roll counts — `core`, `engine`, `precompute`, and `ui` all import from it.

## Layering

```
src/core/      Pure game logic, UI-agnostic, the test target (rules, dice, scoring, gameState, stateIndex)
src/engine/    Pure helper engine, UI-agnostic (advisor, withinTurnDP, optimalLeaf, valueTable, probability, simulate)
src/store/     Zustand stores + React hooks — the only stateful glue between engine and UI
src/ui/        React components (presentational; pull state from stores)
src/lib/       Supabase client + leaderboard API
src/precompute/  Node-only V.bin builder
```

`core` and `engine` have **no React/DOM imports** and are unit-tested in a `node` vitest environment (`src/**/*.test.ts`).

### Stores (Zustand)
- `appStore.ts` — lightweight client routing via a `screen` enum (`home`/`solo`/`lobby`/`mpgame`/`leaderboard`); `main.tsx` switches on it. No react-router.
- `gameStore.ts` — solo game state, settings, theme, and the loaded `advisor`. Tracks `helperUsedThisGame` (gates leaderboard eligibility — helper-assisted scores are flagged). `loadTable()` lazy-loads V.bin.
- `multiplayerStore.ts` — read-only model of server state + thin RPC wrappers + Realtime subscription (see below).
- `useAdvice.ts` / `useBoard.ts` — hooks bridging stores to UI.

## Multiplayer (Supabase, server-authoritative)

The static front end (GitHub Pages) holds **no game authority**. All multiplayer mutations go through `SECURITY DEFINER` RPCs in `supabase/schema.sql`; clients cannot write tables directly (RLS blocks it), and dice are rolled by server RNG. `supabase/schema.sql` is the source of truth for the backend schema, RLS policies, and RPCs (`create_room`, `join_room`, `start_game`, `roll_dice`, `set_held`, `assign_category`, `leave_room`, `submit_score`, …).

- `multiplayerStore.ts` calls these via `supabase.rpc(...)` and mirrors `rooms`/`room_players` into local state through Realtime `postgres_changes`. It never writes tables itself.
- `src/lib/supabase.ts` manages an **anonymous** session (`ensureAnonSession`, idempotent). The anon key is public; security lives in RLS + RPCs. Never add the `service_role` key to client env.
- **Graceful degradation:** if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent, `isSupabaseConfigured` is false, solo play works fully, and multiplayer UI is disabled. Local config goes in `.env.local` (gitignored); the GitHub Pages build reads them from repo **Variables** (not Secrets) in `.github/workflows/deploy.yml`.
- Anonymous sign-ins must be enabled in the Supabase dashboard, else joining throws "Anonymous sign-ins are disabled". Korean user-facing error strings are mapped in `multiplayerStore.ts` (`ERROR_KO`).

## PWA / offline

`vite.config.ts` configures `vite-plugin-pwa`. The Workbox `globPatterns` **includes `bin`** so `V.bin` is precached — the app (and helper) work fully offline after first load. Service worker registration is centralized in `src/ui/PwaStatus.tsx` (`registerType: 'prompt'`, manual register); `InstallButton.tsx` handles `beforeinstallprompt`. The SW is off in `dev` — verify install/offline with `npm run build && npm run preview`.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` runs `npm run build` (which regenerates V.bin via `prebuild`) and publishes to GitHub Pages. `base: './'` in `vite.config.ts` keeps it working under a sub-path, so Vercel (build `npm run build`, output `dist`) works too without changes.

## Patch notes (changelog)

In-app patch notes live in `src/data/changelog.ts` — the single source of truth for user-facing release notes (a pure module, no React). `CHANGELOG[0]` is the newest entry and drives `LATEST_VERSION`. The header 📋 button opens `src/ui/PatchNotesModal.tsx` (master–detail: version list → per-version detail grouped by change type). `appStore.ts` tracks `seenVersion` in `localStorage['yd_seen_version']`; an entry is "NEW" when it's newer than `seenVersion` (`unseenCount`), and the modal auto-opens once for **returning** users after `LATEST_VERSION` rises — first-time visitors only get the latest flagged, no auto-popup. To ship notes, prepend one entry to `CHANGELOG`; that bump is what fires the NEW badge/auto-popup. The changelog version is deliberately **decoupled** from `package.json`.

## Contributing & releases

See `CONTRIBUTING.md`. Trunk-based: one issue → one `<type>/<issue>-<slug>` branch off `main` → PR (`Closes #n`) → **squash merge** (every `main` push auto-deploys). Deploy and *announce* are separate concerns: announce by prepending a `CHANGELOG` entry (bump the web-facing version, tag `web-vX.Y.Z`) once a batch of merges is worth a patch note. The web version lives in `changelog.ts`; the desktop tray versions independently in `desktop/package.json` (`tray-vX.Y.Z`).

## Sanity checks (in tests)

`probability.test.ts` cross-checks combo odds against known literature values; `solver.test.ts` verifies simulated optimal play converges to the table's predicted mean. For this default ruleset the **optimal expected average ≈ 191.8** (printed by `build:table` from the empty-card state). A large drift there signals a broken rule/index change.
