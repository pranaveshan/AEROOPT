# Verification record

## Run executed 2026-10-13 (Windows 11, Python 3.14.6, Node 24)

| Check | Result | Evidence |
|---|---|---|
| Backend dependency install (incl. OR-Tools) | Passed | `pip install ortools==9.15.6755 fastapi uvicorn ...`; `from ortools.sat.python import cp_model` imports OK. Pinned `ortools==9.14` in `requirements.txt` has no Python 3.14 wheel; use 9.15 or Python ≤3.12. |
| Backend test suite | Passed | `python -m pytest -q`: **46 passed** (baseline was 42 before this session's changes). |
| Weather edge-case regression | Passed | New tests: greedy and CP-SAT schedule a 60-minute task fully outside a 30-minute restricted window `[780,810)`; impossible overlap stays unassigned with `WEATHER_RESTRICTION`. |
| CP-SAT model performance fix | Passed | Replaced pairwise turn-around/rest booleans (O(n²) bools, 287 s wall at 40 tasks) with padded one-sided gap intervals in a single `AddNoOverlap`. Engine+CP-SAT tests: 25 passed. |
| Synthetic benchmark 8/20/40 | Executed | Real CP-SAT available. 8-task: FEASIBLE obj 122 (6.49 s incl. build). 20/40: UNKNOWN (time limit honored) — timeout, not proof of infeasibility. See `docs/benchmark-results.md`. |
| End-to-end demo flow | Passed | `demo_end_to_end.py` against live uvicorn on a fresh SQLite DB: 9 steps green — health, dashboard, disruption, greedy FEASIBLE 7/7, unapproved apply 400, approved apply 200, persistence read-back, isolated scenario fork/mutate/solve/discard (`saved_data_changed: False`), audit chain verify valid (7 events). |
| Frontend install | Passed | `npm install` (audit-scripts gated by npm policy warning only). |
| Frontend production build | Passed | `npm run build`: 1580 modules, built in 4.67 s. |
| Frontend unit tests | Passed | `npm test` (Vitest): 3 passed. |
| Docker Compose / PostgreSQL | Not run | No Docker daemon in this environment; unexecuted, not a pass. |

# Prior verification (executed 2026-10-12, original archive environment)

Verification date: 2026-10-12. Commands below were run against the uploaded `AeroOpt` archive extracted into a clean working directory.

| Check | Result | Evidence / limitation |
|---|---|---|
| Archive extraction and source inventory | Passed | ZIP contains frontend, backend, migrations, tests, docs, and benchmark artifacts. |
| Backend test suite | Passed | `python -m pytest -q`: **19 passed** after scheduler and API regression tests were added. |
| Python compilation | Passed | `python -m compileall -q backend/app backend/tests backend/migrations`. |
| Fresh SQLite Alembic migration | Passed | `DATABASE_URL=sqlite:////tmp/aeroopt_migration_test.db alembic upgrade head`; inspector reported aircraft, personnel, tasks, assignments, solver_runs, audit_events, and alembic_version. |
| Persistence across API client lifespans | Passed | Automated test creates an aircraft, opens a new TestClient lifespan, and confirms the record remains in SQLite. |
| Schedule solve, approval, and read-back | Passed | Automated test runs greedy solve, checks independent validation, approves it, then confirms saved schedule is returned by a new client lifespan. |
| Frontend dependency installation | Not verified | `npm install --no-audit --no-fund` timed out; no `node_modules` or npm lockfile was present in the archive. |
| Frontend unit tests / production build | Not run | Global `tsc -b --pretty false` was attempted and failed because React, Vite/Vitest types, and other npm dependencies are absent. A Vitest API-helper test file was added. |
| CP-SAT | Not run | `ortools` is not installed in the execution environment. API explicitly returns `UNKNOWN` if it is unavailable. |
| Greedy synthetic benchmark smoke test | Passed | `python benchmarks/run_benchmarks.py --sizes 8 --seed 42 --time-limit 1`: greedy assigned 8/8 tasks and independent validation passed; CP-SAT reported `UNKNOWN` because OR-Tools is missing. |
| Docker Compose / browser QA / PostgreSQL | Not run | Docker and browser-based test tooling were not available in this run. |

Do not interpret unexecuted checks as passing. The application uses synthetic data only and is not certified for real-world operations.
\n\n## Follow-up implementation verification (2026-10-12)\n\n- Backend API suite: **21 passed** after adding counterfactual isolation and aircraft restore coverage.\n- Frontend dependency installation was retried but timed out in this environment; production build and Vitest remain unverified.\n- OR-Tools is not installed in this runtime, so CP-SAT execution remains unverified. The solver implementation and pinned dependency declaration remain in the repository.\n- Implemented UI restore controls for archived aircraft/personnel and an isolated in-memory counterfactual scenario workflow for aircraft grounding, maintenance extension, and personnel unavailability.\n- Production-grade authentication/authorization and durable scenario fork/apply/discard remain out of scope and are explicitly documented as limitations.\n
## Follow-up implementation pass

- Backend regression suite: `python -m pytest -q` — 23 passed.
- Counterfactual analysis now returns a baseline solve and assignment delta (assigned counts, lost tasks, and recovered/added tasks), and the Scenario Lab displays the comparison. It supports selecting greedy or CP-SAT; CP-SAT execution still depends on the pinned OR-Tools package being installed.
- Added optional bearer-token role enforcement: `viewer` can read, `planner` can run/apply schedules and counterfactuals, and `admin` can mutate aircraft/personnel/tasks. Configure `AEROOPT_AUTH_TOKENS` as a JSON object of token-to-role mappings. With `APP_ENV=production`, missing token configuration fails closed with HTTP 503. This is an initial deployment control, not a complete identity-management system (no login, token expiry/rotation service, or SSO).
- Frontend requests accept `VITE_API_TOKEN` for deployments using the bearer-token mode. Never commit production secrets into frontend builds; a browser-embedded token is visible to users and should only be used for controlled internal demos. For production, prefer a server-side identity/session integration.
- Frontend dependency installation timed out in this environment; `npm run build` could not be verified because `node_modules` is absent. Vitest likewise remains unverified.
