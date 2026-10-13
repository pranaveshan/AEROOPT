# AeroOpt — SIH26250 prototype

AeroOpt is a synthetic, human-in-the-loop scheduling prototype for non-combat aviation workflows: training, inspections, logistics, medical transfer, disaster relief, and recovery. It combines persistent fictional data, a deterministic greedy baseline, an OR-Tools CP-SAT model, independent schedule validation, proposed schedule review, and a hash-chained audit trail.

> **Safety and validity boundary:** All identifiers, tasks, people, facilities, capacities, and restrictions are fictional. This is a student prototype, not a production-ready or safety-validated aviation system. Do not use it to plan real flights or real operations. Combat planning and external operational integrations are out of scope.

## Status at a glance

| Area | Status |
|---|---|
| Landing page, responsive console, Gantt, accessible tables, JSON resource editors | Implemented; `npm run build` passes (1580 modules) and 3 Vitest tests pass on Windows/Python-3.14/Node-24 (2026-10-13) |
| Persistent SQLite data, idempotent synthetic seed, aircraft/personnel/task CRUD API | Implemented; fresh SQLite migration and persistence tests pass |
| Deterministic greedy baseline and independent validator | Implemented; **46 backend tests pass** on Windows (2026-10-13), including dependency ordering, cumulative resource limits, and the weather-window regression |
| OR-Tools CP-SAT model | **Installed and executed** (OR-Tools 9.15): 8-task seeded instance FEASIBLE with validated schedule; boilerplate O(n²) pairwise gap constraints replaced with padded NoOverlap; 20/40-task 5 s single-worker runs honestly time out (UNKNOWN) |
| Human approval endpoint | Implemented; revalidates proposal before applying; suppresses unapproved apply (HTTP 400, end-to-end verified) |
| Hash-chained audit endpoint | Implemented; automated tamper test provided |
| Scenario fork/isolation/apply/discard + in-memory counterfactuals | Implemented as persistent isolated snapshots with tests; end-to-end demo verifies `saved_data_changed: false` on discard |
| SSE telemetry, replay verification, SPOF/stress analytics | Implemented (`/schedule/solve/stream`, `/analytics/spof`, `/analytics/stress`, `/analytics/replay/{run_id}`, `/analytics/compare-solvers`) |
| Weather edge case (task longer than a 30-min restricted window) | Implemented with explicit regression tests for both solvers; greedy now considers candidate starts immediately after each restricted window ends |
| Initial Alembic migration | Fresh SQLite migration executed successfully with `DATABASE_URL` honored; Docker Compose runtime remains unverified |
| Dependency lockfiles | Backend `requirements.txt` pin `ortools==9.14` has no Python 3.14 wheel — install `ortools==9.15.6755` on Python 3.14 (or use Python ≤ 3.12); frontend `package-lock.json` works with `npm install` |
| Benchmarks | Executed 2026-10-13 on Windows with real CP-SAT; results in `benchmarks/results/` and `docs/benchmark-results.md` |

## Requirements source and assumptions

The publicly indexed SIH 2026 listing identifies SIH26250 as “Air Power - Dynamic Air Operations & Resource Optimisation” and associates it with the Ministry of Defence. The complete official statement was not independently retrieved or verified during this build. The application therefore maps to the supplied problem description, not a claim of full official compliance.

- Verified listing references: [SIH 2026 analytics listing](https://sih.mitrai.social/) and [SIH 2026 problem statement index](https://sih2026-ps-viewer.vercel.app/).
- Exact official statement URL / full description: unresolved.
- Synthetic assumptions: integer-minute horizon; half-open intervals `[start, finish)`; UTC timestamps for audit; support capacity 2; synthetic weather restriction `[780, 810)`; one aircraft and one crew member per task; approval required before applying a solver run.

## Repository layout

```text
AeroOpt/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI routes and persistence boundary
│   │   ├── db.py                   # SQLAlchemy engine/session
│   │   ├── models.py               # Relational persistence models
│   │   ├── seed.py                 # Idempotent fictional seed data
│   │   ├── domain/types.py         # Solver-only immutable data contracts
│   │   ├── optimization/engine.py  # Greedy, CP-SAT, validator, eligibility
│   │   └── services/audit.py       # Hash chain and integrity verification
│   ├── tests/
│   ├── requirements.txt
│   └── pyproject.toml
├── frontend/                       # React + TypeScript + Vite console
├── docs/                            # Architecture, model, traceability, demo
├── benchmarks/                      # Synthetic benchmark runner
└── scripts/                         # Setup / verification helpers
```

## Quick start

Prerequisites: Python 3.11+ (3.14 works; install `ortools==9.15.6755`), Node.js 20+, npm. OR-Tools must be installable from the configured Python package index for CP-SAT mode.

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
# Apply the initial schema migration and seed synthetic data.
alembic upgrade head
python seed_data.py
# Start the API (startup also performs an idempotent seed).
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive API documentation. The SQLite file is `backend/aeroopt.db` when launched from `backend/`. To use a different database, set `DATABASE_URL` before startup. PostgreSQL support is intended through SQLAlchemy but has not been verified here.

### 2. Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Optionally set `VITE_API_BASE_URL=http://localhost:8000/api/v1` in a local `.env` file (never commit actual secrets). The UI uses the API for metrics, data lists, solve requests, approval, and audit display.

### 3. Tests

```bash
cd backend
python -m pytest -q
cd ../frontend
npm test
npm run build
```

Backend verification executed: `python -m pytest -q` reports **46 passed** including CP-SAT tests and Python compilation passed. Frontend `npm test` reports 3 passed and `npm run build` completed cleanly (2026-10-13, Windows). See `docs/verification.md` for exact evidence and remaining gaps.

### 4. Synthetic data

The API lifespan creates tables and runs an idempotent seed on startup. It inserts fictional aircraft `AC-101`–`AC-104`, crew `CR-201`–`CR-204`, and tasks `TK-301`–`TK-307`. Re-running startup does not duplicate these IDs.

### 5. Run a baseline or optimizer

```bash
curl -X POST http://localhost:8000/api/v1/schedule/solve \
  -H 'Content-Type: application/json' \
  -d '{"solver":"greedy","time_limit_seconds":5,"stability_weight":0}'
```

For CP-SAT, use `"solver":"cp-sat"`. The response distinguishes `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, and `UNKNOWN`, and includes independent validation. A proposed run is not applied automatically. Approve a valid run with:

```bash
curl -X POST http://localhost:8000/api/v1/schedule/apply \
  -H 'Content-Type: application/json' \
  -d '{"run_id":"RUN_ID_FROM_RESPONSE","approved":true}'
```

### 6. Production frontend build

```bash
cd frontend
npm run build
```

### 7. Benchmarks

```bash
python benchmarks/run_benchmarks.py --sizes 8 20 40 --seed 42 --time-limit 5 --out benchmarks/results
```

The benchmark script stores raw synthetic input and result JSON under `benchmarks/results/`. Do not interpret a timeout as proof of infeasibility or report a proven optimum without solver status evidence. On a single-worker 5 s limit, the 8-task instance solves FEASIBLE; the 20/40-task instances end UNKNOWN (time limit), which is recorded honestly in `docs/benchmark-results.md`.

### Windows PowerShell quick start

Open two PowerShell terminals from the extracted `AeroOpt` directory.

**Terminal 1 — API**

```powershell
cd .\backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:DATABASE_URL = "sqlite:///./aeroopt.db"
alembic upgrade head
python seed_data.py
uvicorn app.main:app --reload --port 8000
```

If PowerShell blocks activation, use `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal, then activate again. Use a Python version supported by OR-Tools and installable wheels; the CP-SAT path requires OR-Tools to install successfully.

**Terminal 2 — frontend**

```powershell
cd .\frontend
npm install
$env:VITE_API_BASE_URL = "http://localhost:8000/api/v1"
npm run dev
```

Open `http://localhost:5173`. For tests, run `cd backend; python -m pytest -q` and `cd frontend; npm test; npm run build`. Frontend commands require a successful npm dependency installation. The backend defaults to SQLite and stores `backend/aeroopt.db` relative to the backend working directory.

### 8. Docker Compose

```bash
docker compose up --build
```

The API is exposed at `http://localhost:8000` and the frontend at `http://localhost:8080`. Docker was not available in the build environment, so the Compose build and health check have not been executed here.

## API overview

- `GET /api/v1/health`
- `GET /api/v1/dashboard`
- `GET/POST /api/v1/aircraft`, `PUT/DELETE /api/v1/aircraft/{id}`, `POST /api/v1/aircraft/{id}/restore`
- `GET/POST /api/v1/personnel`, `PUT/DELETE /api/v1/personnel/{id}`, `POST /api/v1/personnel/{id}/restore`
- `GET/POST /api/v1/tasks`, `PUT /api/v1/tasks/{id}`, `POST /api/v1/tasks/{id}/cancel`
- `GET /api/v1/schedule`, `POST /api/v1/schedule/solve`, `POST /api/v1/schedule/validate`, `POST /api/v1/schedule/apply`
- `GET /api/v1/eligibility/{task_id}`
- `POST /api/v1/disruptions`
- `GET /api/v1/runs`
- `GET /api/v1/audit`, `GET /api/v1/audit/verify`

Scenario, telemetry, counterfactual, single-point-of-failure, stress-test, and replay APIs remain future work.

## GitHub upload

Extract `AeroOpt.zip`, open a terminal in the extracted `AeroOpt` directory, then:

```bash
git init
git add .
git commit -m "Build AeroOpt SIH26250 prototype"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

If this directory already belongs to a Git repository, **omit `git init`**. Check `git remote -v` first; if `origin` is already configured, update it only if needed using `git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git`. No remote was configured and no push was performed during this build.

## Known limitations

See [`docs/audit-2026-10-12.md`](docs/audit-2026-10-12.md), [`docs/known-limitations.md`](docs/known-limitations.md), [`docs/optimization-model.md`](docs/optimization-model.md), and [`docs/verification.md`](docs/verification.md). The key limitations are unverified CP-SAT execution, frontend dependency install/build and browser QA, archived-record restore UI, advanced analyses, and Docker/PostgreSQL runtime verification.
