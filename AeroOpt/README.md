# AeroOpt — SIH26250 prototype

AeroOpt is a synthetic, human-in-the-loop scheduling prototype for non-combat aviation workflows: training, inspections, logistics, medical transfer, disaster relief, and recovery. It combines persistent fictional data, a deterministic greedy baseline, an OR-Tools CP-SAT model, independent schedule validation, proposed schedule review, and a hash-chained audit trail.

> **Safety and validity boundary:** All identifiers, tasks, people, facilities, capacities, and restrictions are fictional. This is a student prototype, not a production-ready or safety-validated aviation system. Do not use it to plan real flights or real operations. Combat planning and external operational integrations are out of scope.

## Status at a glance

| Area | Status |
|---|---|
| Landing page, responsive console, Gantt and accessible table | Implemented; browser inspection/build still needs dependency installation |
| Persistent SQLite data, idempotent synthetic seed, aircraft/personnel/task CRUD API | Implemented in code; migration/clean-install verification pending |
| Deterministic greedy baseline and independent validator | Implemented; automated tests provided |
| OR-Tools CP-SAT model | Implemented in code; **not executed in this environment** because package network access was unavailable |
| Human approval endpoint | Implemented; revalidates proposal before applying |
| Hash-chained audit endpoint | Implemented; automated tamper test provided |
| Scenario fork/isolation/apply/discard | Not implemented; UI explicitly labels this |
| Counterfactuals, failure analysis, stress testing, SSE telemetry, replay verification | Not implemented |
| Initial Alembic migration and Docker Compose configuration | Implemented in code; runtime unverified |
| Dependency lockfiles | Not complete; npm lock generation was blocked by unavailable package network |
| Benchmarks | Greedy executed for 8/20/40 synthetic tasks; CP-SAT not executed because OR-Tools was unavailable |

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

Prerequisites: Python 3.11+, Node.js 20+, npm. OR-Tools must be installable from the configured Python package index for CP-SAT mode. The environment used to create this archive did not have network access to the package index, so CP-SAT could not be installed or run here.

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

Tests have been authored but only test commands actually run in the build environment should be treated as executed results. See `docs/verification.md` for current status.

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
python benchmarks/run_benchmarks.py --sizes 8 20 40 --seed 42 --time-limit 5
```

The benchmark script stores raw synthetic input and result JSON under `benchmarks/results/`. Do not interpret a timeout as proof of infeasibility or report a proven optimum without solver status evidence.

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

See [`docs/known-limitations.md`](docs/known-limitations.md), [`docs/optimization-model.md`](docs/optimization-model.md), and [`docs/verification.md`](docs/verification.md). The key limitation is that a code implementation is not equivalent to validated operational behavior: CP-SAT execution, full database migration coverage, frontend clean install/build, browser QA, advanced analyses, and Docker runtime remain unverified or incomplete.
