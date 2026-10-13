# API contracts

All endpoints are under `/api/v1`; request/response schemas are visible in FastAPI OpenAPI at `/docs` when the server is running.

- Solver request: `{"solver":"greedy|cp-sat","time_limit_seconds":5,"stability_weight":0}`.
- Solver response: status, assignments, unassigned diagnostics, objective components, best bound where available, wall-clock duration, input hash, validation result, run ID, output hash, and approval-required flag.
- Approval request: `{"run_id":"...","approved":true}`. Server rejects missing runs, absent approval, non-feasible statuses, invalid schedules, or schedules that no longer validate.
- Disruption examples: `{"type":"aircraft_grounded","resource_id":"AC-101"}`, `{"type":"maintenance_extended","resource_id":"AC-102","start":600,"finish":720}`, `{"type":"crew_unavailable","resource_id":"CR-201","until":360}`.

Current disruption endpoint persists supported changes to saved data before a new solve; scenario-isolated disruptions are not implemented. Use synthetic data only.
