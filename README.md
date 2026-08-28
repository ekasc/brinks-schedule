# Brinks Schedule

Internal scheduling app for a Vancouver security-install business. 3 sales reps book installs, 2 technicians manage availability, customer PII (DOB, TELUS PIN, ID last-4, emergency contact, verbal password) is captured at the time of booking.

## Stack

- SvelteKit + adapter-node
- better-sqlite3
- bcryptjs (passwords) + jsonwebtoken (session cookie `bs_session`)
- Leaflet + OpenStreetMap (manual pin drop, no API key)

## Roles

- `admin` — full access, manage users
- `sales` — book jobs, see own bookings
- `tech` — see own jobs, post availability blocks

## Status vocabulary

- **contract status** (the field everyone can change): `sent` (default), `signed`, `cancelled`
- **install completion**: separate `completed_at` timestamp, set by the tech when the work is done

## Local development

```bash
npm install
DB_PATH=./data/schedule.db node scripts/seed.js
HOST=:: npm run dev -- --port 8766
```

`HOST=::` is required so the server binds on both IPv4 and IPv6 (cloudflared resolves localhost to IPv6).

## Production

```bash
npm run build
set -a; source .env; set +a; HOST=:: node build/index.js
```

`.env` requires:
- `JWT_SECRET` — any long random string
- `ORIGIN` — the URL the user types, e.g. `http://192.168.1.94:8766`
- `DB_PATH` — path to the sqlite file (default `./data/schedule.db`)

## Seed users

All default to `changeme`. Reset in `/admin` (min 6 chars).

| username | role |
|---|---|
| admin | admin |
| admin_esc | admin |
| ekas | sales |
| raman | sales |
| tech1 | tech |
| tech2 | tech |

## License

Proprietary.
