# Handoff — Brinks Schedule

**Date:** 2026-08-31
**Status:** Active development, not yet deployed. Breaking DB changes allowed.
**Stack:** SvelteKit + Svelte 5, Vite 6, Tailwind 3, bits-ui, @internationalized/date, better-sqlite3 (local) / D1 (Cloudflare), Leaflet, adapter-cloudflare.

## What this is
Schedule / dispatch for techs + sales + admin. Core flows: weekly availability → slot generation → job booking → calendar/route/map → job detail status/completion. Roles: `tech` (own data only), `sales` (book/search), `admin` (Clients + Admin only).

## Recent foundation work (Aug 2026)

### 1. Scheduling atomicity & correctness
- **DB helpers:** `SLOT_HORIZON_DAYS=30`, `isJobWithinAvailability` (full containment `starts <= job < ends` + not blocked), `hasNonCancelledOverlap` (`sent`+`signed` block, `cancelled` does not).
- **Atomic writes:** `createJob` = single `INSERT ... SELECT WHERE EXISTS (availability) AND NOT EXISTS (overlap)`; `updateJob` and `__setJobStatusConditional` use correlated `EXISTS/NOT EXISTS` against `jobs.tech_id/jobs.starts_at/jobs.ends_at` plus `status = ?` optimistic predicate. Only logs `job_events` on `changes > 0`. Prevents double-booking race on D1 and better-sqlite3 without a process lock.
- **Tests:** `tests/scheduling.test.js`, `scheduling.atomic.test.js`, `scheduling.stale-status.test.js` use isolated `__setTestDbPath` temp DB.

### 2. Availability redesign — weekly pattern + time off
- **Tables:** `availability_templates (tech_id,dow,start_min,end_min,kind 'available'|'unavailable')` + `availability_unavailable (tech_id,starts_at,ends_at,reason)` for ad-hoc blocks. `availability_blocks` kept as ad-hoc *extra* availability. Both D1 `SCHEMA` and local `getLocal()` create them; `ALTER TABLE ADD COLUMN kind` for existing DBs.
- **Slot generation (`getAvailableSlots`):** DST-safe midnight iteration (`cur.setDate(cur.getDate()+1)`), expands *available* templates + extra blocks, builds `blocked = unavailableTemplates (expanded) + ad hoc unavailable + jobs±buffer`, deduplicates exact `starts-ends`.
- **Weekly pattern UI (`/availability`):** Per-day `enabledMap` toggle, list of timeframes as display rows (`fmtClock` → `09:00 AM — 05:00 PM` + `Available`/`Unavailable` pill). Draft selector below list: two `time` inputs + `Available`/`Unavailable` toggle + `+ Add`. `Add` pushes draft (alternating kind, starting at previous `end`) as a list item with `Remove` only — no double selector. Bottom `Save pattern` → `?/savePatterns` (validates `start<end`, kind, no overlap per dow). Mobile fix: pill `text-xs` matches buttons, time `whitespace-nowrap`, `flex-col sm:flex-row`.
- **Time off:** `+ Block time` sheet/dialog (mobile `swipeSheet`, desktop dialog) with `Date`/`Start`/`End`/`Reason`, safe-area bottom padding.

### 3. Roles & page policy
- Central `src/lib/server/routePolicy.ts` (`isDeprecated`, `isAdminBlocked`, `getRedirect`) + `src/hooks.server.ts`. `isDeprecated(/income|/stats)` → tech/sales `/` , admin `/clients` , unauth `/login`. Admin allowlist: only `/admin/*`, `/clients/*`, `/export/*`, `/logout`, framework/static. Tech blocked from `/api/geocode`, `/clients` list, cross-tech jobs.
- `today`/`calendar`/`route`/`map`/`jobs/[id]`/`export` all scope by `techId`; `jobs/[id]` 403 via `src/lib/server/jobAccess.ts` before data fetch. `dashboardView.ts` helper for `Today` heading. Export is admin-only; admin Clients shows `Export CSV`.

### 4. UI system
- Tokens in `src/app.css` (`--bg/--row/--ink/--dim/--line/--blue` etc.), `group`/`input-group`/`field`/`pill`/`empty`/`job-row`. Dark `data-theme` toggle, `backdrop-filter` materials, spring animations (`cubic-bezier(0.32,0.72,0,1)` — `damping 1.0/0.8, response 0.3-0.4`). Reduced-motion/transparency respected.
- **Admin:** `New user` and `Edit user` are sheets on mobile (`swipeSheet` handle, `admin-new/edit-content` `translateY` spring, `overlay` fade) / dialogs on desktop (`scale 0.96→1`). Single edit form (`display_name,username,role,password` + one `Save` → `?/edit`). List has `Edit` → sheet.
- **More menu (mobile):** `Popover` (was `<details>`), overflow only (`sales: Map+Clients`, `tech/admin: Theme+Sign out`).
- **iOS zoom guard:** `@media (max-width:767px) input/textarea/select {font-size:16px !important}`.
- Top highlight `::before` is now `data-theme="light"` only (removed `prefers-color-scheme: light` block that bled into dark).
- Bottom safe-area: sheets use `padding-bottom: max(16/20px, env(safe-area-inset-bottom))`, `.mobile-nav` and `.page` do `max(6px, env(...))` / `88px`.

## Project layout
- `src/routes/+layout.svelte` — top `Schedule` bar + `desktop-nav`/`mobile-nav`/`more-menu` Popover.
- `src/routes/availability/` — pattern + time off (above).
- `src/routes/book/` — sales booking, `getAvailableSlots` horizon `SLOT_HORIZON_DAYS` via local `Date.setDate`.
- `src/routes/calendar/` — weekly grid agenda, now tokenized (`var(--blue/--row)` etc.).
- `src/routes/admin/` — as above.
- `src/lib/server/db.ts` — D1/better-sqlite3 dual driver, `__setTestDbPath` seam, `availabilitySqlExists` fragment.
- `src/lib/actions/swipeSheet.ts` — 1:1 pointer tracking, velocity, 80px/600px/s threshold, rubber-band, sheet/dialog spring.

## How to run
```sh
npm install
npm run dev      # vite dev, local better-sqlite3 at ./data/schedule.db
npm run build    # vite build + adapter-cloudflare
npm run check    # svelte-check
npx vitest run --exclude tests/e2e   # 6 suites ~45 tests (e2e needs @playwright/test)
```

Env: `PII_KEY` or `JWT_SECRET` for `encryptField` (dev fallback `dev-only-secret`), geocoder optional via `env.GEOCODER`.

## Gotchas
- `availability_templates.kind` defaults `available`; existing rows without column get backfilled.
- `isJobWithinAvailability` requires same local date for start/end — midnight-spanning jobs are rejected (no slots generate there).
- `availabilitySqlExists` interpolates numeric `tech_id/starts/ends` as strings in SQL fragment — values are `Number()` from server, not raw user strings, but keep them numeric.
- `__setTestDbPath` resets `_local` and `_schemaReady` — tests must call `listUsers()` after setting path to init schema.

## Next sensible steps
- Add recurring `unavailable` pattern tests (already covered for available).
- Consider native `<select>` for role where `bits-ui` portal caused overlap (admin New user now uses native).
- If ad-hoc *extra* availability is not needed, drop `availability_blocks` UI and keep it DB-only.
