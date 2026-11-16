# AeroOpt — production checklist

Checked against the live deployment on 2026-11-16.

## Build and code health

- [x] `tsc --noEmit` clean
- [x] `vitest run` 50/50 passing
- [x] `vite build` succeeds; client assets and Worker module emitted
- [x] No broken imports or missing dependencies (build resolves every module)
- [x] No `console.log` debug statements in `src/` (only intentional server-side error logging)
- [x] No TODO/FIXME or placeholder copy in shipped source
- [x] No hardcoded local API URL; the client calls its own origin
- [x] No secrets, tokens or credentials in the repository or the build output

## Functional verification (live URL)

- [x] Landing page renders with branding, headline, 3D airframe and CTA
- [x] Sign-in through the form; session cookie set and honoured
- [x] `/console/*` redirects to `/signin` when signed out
- [x] Overview loads metrics, readiness dial, attention queue and timeline
- [x] Aircraft register loads; aircraft detail renders airframe viewer
- [x] Crew register loads
- [x] Maintenance records load and restrict the affected aircraft
- [x] Tasks: list, filters, create (persisted and read back), state transitions
- [x] Schedule: committed version, 12 assignments, 0 conflicts, 2 unassigned
- [x] Decision engine: ran a real optimization, proposal returned with score and feasibility
- [x] Approvals/evaluation surface the pending proposal
- [x] Security centre reports sessions and control coverage
- [x] Audit log records operational writes
- [x] User management lists accounts and roles

## Permissions and security

- [x] Anonymous API request → 401
- [x] Viewer write → 403 (server-enforced, not UI-only)
- [x] Foreign-Origin write → 403
- [x] Session cookie HttpOnly, SameSite=Lax, Secure on HTTPS
- [x] Security headers present (nosniff, referrer policy, frame denial, permissions policy)
- [x] API responses `no-store`
- [x] No secret exposed in client bundle or HTML

## Presentation and responsiveness

- [x] No horizontal overflow at 1440, 820 and 390 px on the audited routes
- [x] Light and dark themes both render
- [x] Reduced-motion preference respected (`prefers-reduced-motion` and in-app setting)
- [x] Zero browser console errors during the capture pass
- [x] Zero failed network requests during the capture pass
- [x] Seven production screenshots captured at 1440×900 @2x from the live URL

## Release assets

- [x] README with live link, screenshots, architecture, security and limitations
- [x] `.gitignore` covers `node_modules`, `dist`, `.wrangler`, `.env*`, `.vercel`, `.freebuff`
- [x] `.env.example` documents configuration without secrets
- [x] Release notes, deployment report, this checklist
- [x] LinkedIn carousel (7 slides + PDF) and launch copy prepared for review

## Outstanding (requires owner action)

- [ ] GitHub repository creation/auth and push (no GitHub credentials or CLI session on this machine)
- [ ] Vercel account connection (see deployment report: the API cannot run on Vercel without a port)
- [ ] Licence decision (none granted in this release)
- [ ] LinkedIn publication (explicit approval required; nothing has been published)
