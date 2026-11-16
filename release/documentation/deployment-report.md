# AeroOpt — deployment report

## Production

| Item | Value |
| --- | --- |
| Platform | Freebuff Sites (Cloudflare Workers + D1) |
| Production URL | https://is.gd/AeroOpt |
| Preview URL | https://site-65d80233d3134302966c9109a65d2807.freebuff.page |
| Published | yes (production), latest deployment succeeded 2026-11-16 |
| Worker build | `dist/aeroopt/index.js` (ES module) + `dist/client` assets |
| Database | D1 binding `DB`, isolated per environment, 14 tables + indexes, seeded on first request |
| Secrets | none required; no secret environment variables are used by this build |

## Build identity

- Vite 8 production build, ~451 kB main chunk (144 kB gzip), route-level code splitting.
- Compatibility date 2026-09-29 (from `deploy.json` and `wrangler.jsonc`).
- Commit deployed: see the commit created in this release pass (`Release AeroOpt aviation operations platform`). The deployed artifact was built from that working tree.

## Verification performed against the live URL

API

```
GET  /api/health              200 {"ok":true,"service":"aeroopt"}
GET  /api/overview (anon)     401 Authentication required
POST /api/auth/signin         200 + Set-Cookie aeroopt_session (HttpOnly, SameSite=Lax, Secure)
GET  /api/overview            200 metrics + attention queue
GET  /api/tasks               200 items
GET  /api/aircraft            200 items
GET  /api/crew                200 items
GET  /api/maintenance         200 items
GET  /api/schedule            200 committed v1, 12 assignments, 0 conflicts, 2 unassigned
GET  /api/analytics           200 range + series
GET  /api/security            200 stats
GET  /api/audit               200 items
GET  /api/users               200 items
POST /api/optimize/run        201 proposal created (feasible/partial, score recorded, version incremented)
POST /api/tasks               201 created, persisted and read-back confirmed
POST /api/tasks (viewer)      403 Your role does not permit this action
POST /api/tasks (foreign Origin) 403 Cross-site request rejected
```

Browser (headless Chrome, live URL, 1440×900 @2x)

- Landing page renders, navigation works, sign-in through the real form succeeds and lands on `/console`.
- `/console/tasks` while signed out redirects to `/signin` (protected routes are enforced by the API and the router).
- Console pages visited: overview, tasks, aircraft, schedule, decision engine (ran a real optimization), security centre.
- 0 console errors, 0 failed requests across the whole pass.
- 390 px: 0 px horizontal overflow on overview, tasks, schedule. 820 px: 0 px on aircraft.

## Deployment issues found and fixed during this release

1. **PBKDF2 iteration ceiling.** WebCrypto in Workers rejects PBKDF2 above 100,000 iterations. The application hashed at 150,000, so every request that triggered database bootstrap returned 500 in production while working locally. Fixed by hashing at 100,000, storing the iteration count with each hash, and keeping a fallback for legacy records. Local databases created before this change must be reseeded (delete `.wrangler/state`).
2. **Bootstrap failures were reported as generic 500s.** `/api/*` now returns 503 with a clear message and logs the bootstrap error, instead of masking a database problem as a request error.

## Vercel

Vercel was requested but is **not** used for this build, and no Vercel URL exists.

- The Vercel CLI is installed on this machine (v63.1.2) but is not authenticated; `vercel whoami` produces no account.
- More fundamentally, the API cannot run on Vercel as-is: it is a Hono Worker whose database access is the D1 `DB` binding, and whose hashing uses Workers' WebCrypto. Vercel Functions cannot bind D1, and the frontend alone would have no API and no session cookie.
- A Vercel deployment would require porting the API to a Node-compatible host and replacing D1 with a hosted SQL database, then pointing the client's same-origin `/api` path at it through a proxy or custom domain. That is an architectural change, not a configuration change, and it was not performed.

## Screenshot and asset generation

- `scripts/release-capture.mjs` drives headless Chrome against the live URL, signs in through the UI, hides scrollbars, waits for fonts and network idle, and writes the seven 2880×1800 captures plus a verification report.
- `scripts/release-carousel.mjs` renders the seven 1080×1350 carousel slides from those captures and exports `aeropt-linkedin-carousel.pdf`.

## Backend / database

- Hosting: Cloudflare Workers, same deployment as the client (single origin, no CORS surface).
- Health: `GET /api/health` → 200.
- Database: D1, healthy; bootstrap created schema v1 and seeded 8 aircraft, 10 crew, 15 tasks, 4 maintenance records and committed schedule v1.
- Persistence confirmed in production: a task created through the API was read back; an optimization run produced schedule v2 and a pending approval.
- No migrations pending. Schema changes are additive and guarded by `meta.schema_version`.
