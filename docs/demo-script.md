# Five-minute demo script (verified 2026-10-13)

Every claim below was executed against a live API (`backend/demo_end_to_end.py`, fresh SQLite DB, real output recorded in the session transcript). All data is synthetic.

**0:00–0:40 — Landing page.** Open `/mission`. The schedule graphic is generated from real API assignments; every record is synthetic.

**0:40–1:30 — Dashboard + baseline.** Open `/console`. Dashboard counts come from the seeded DB (4 aircraft, 4 crew, 7 tasks). Select the deterministic greedy baseline and run a solve. Status, independent validation, wall time, and unassigned reasons are shown from the real run (seed case: FEASIBLE, 7/7 assigned, ~4 ms).

**1:30–2:15 — Disruption.** POST an `aircraft_grounded` disruption for `AC-101`, roll the resource Unavailable slider in `/scenarios` or rerun the baseline and inspect changed/unassigned work (API: `POST /api/v1/disruptions`).

**2:15–3:00 — Stability.** Change the stability slider and rerun; the request payload changes, and CP-SAT applies an explicit previous-aircraft-change penalty when `stability_weight > 0`.

**3:00–3:40 — Human approval gate.** Run the greedy solve, then `POST /api/v1/schedule/apply` with `approved: false` (returns 400) and again with `approved: true` (200). Refresh the page: the applied schedule persists.

**3:40–4:20 — Isolated scenario.** In `/scenarios`, create a scenario, mutate the snapshot (e.g. set `AC-101` serviceable again), solve it, and inspect the diff (assignment delta, tasks lost/recovered). Discard it: saved data is untouched (`saved_data_changed: false`, verified).

**4:20–5:00 — Audit and integrity.** Open `/audit`, run chain verification (`GET /api/v1/audit/verify` returns `valid: true`, events checked), and explain the threat boundary: the chain detects edits or missing rows but not a full-chain rewrite by a privileged actor.

**Developer one-command flow:** `cd backend && python demo_end_to_end.py http://127.0.0.1:8123` with uvicorn on port 8123 and a fresh `DATABASE_URL`.
