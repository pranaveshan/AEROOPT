# AeroOpt v1.0.0 — release notes

First public release of the AeroOpt aviation operations platform. Deployed, verified and captured.

## Highlights

- **Full operations console**: overview with readiness dial and attention queue, task register, 24-hour schedule timeline, aircraft and crew registers, maintenance, decision engine, evaluation/approvals, security centre, user management, audit log, settings.
- **Constraint engine**: aircraft status, maintenance overlap, capability sets, payload, crew status/availability/qualifications, certification expiry, double-booking, turnaround gaps, duty limits and dependency ordering — evaluated server-side per assignment.
- **Optimization with explanation**: four orderings × preserve/rebuild, weighted scoring, per-task reasoning, feasibility reporting, and an approval gate before a proposal becomes operational.
- **Security**: PBKDF2-SHA256 (100k iterations, platform maximum in Workers) with per-record iteration counts, SHA-256 hashed opaque sessions, HttpOnly SameSite cookies, server-enforced RBAC across six roles, same-origin enforcement on writes, rate-limited sign-in, audit and security event trails.
- **Design system and motion**: tokenised motion (`src/lib/motion.tsx`), shared-layout indicators, staggered registers, curved airframe entrance, reduced-motion support and a persisted reduced-effects setting.
- **Self-bootstrapping database**: idempotent, versioned D1 schema plus synthetic demonstration dataset seeded relative to "now".

## Fixes in this release pass

- Password hashing no longer exceeds the Workers PBKDF2 ceiling (100,000 iterations), which previously caused a 500 on every request that triggered database bootstrap in production.
- Database bootstrap failures now return 503 with a clear message and are logged, instead of surfacing as a generic request error.
- Timeline bars choose a label that fits the rendered bar width, so short assignments no longer show truncated identifiers.
- Task identifiers no longer wrap in the register.

## Verification

- `tsc --noEmit`: clean.
- `vitest run`: 50/50 passing (engine + API against real SQLite).
- `vite build`: success.
- Live deployment: health, auth, RBAC (403 for viewer writes), CSRF (403 for foreign origin), persistence, optimization, and all console routes verified in a real browser at 1440 px, 820 px and 390 px with zero console errors and zero failed requests.

## Known limitations

- No MFA; no mail provider (password recovery surfaces a token in demonstration mode only); no external aviation feed; synthetic data.
- Greedy constrained planner, not an exact solver.
- Generic CSS-3D airframe, not type-accurate geometry.
- UTC only.
- No licence granted for reuse.

## Upgrade notes

If you have a local database from an earlier development build, delete `.wrangler/state` so passwords are re-seeded with the new hash format. Sessions are invalidated on any password change regardless.
