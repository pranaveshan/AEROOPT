# Known limitations

1. The complete official SIH26250 brief could not be verified from an official source during this build; confirm requirements with the official portal/team SPOC.
2. The app is a synthetic prototype for non-combat aviation workflows only and is not flight-planning or safety-certified software.
3. OR-Tools installation failed because the package index was unreachable. CP-SAT has not been executed or benchmarked in this environment.
4. The CP-SAT model and validator are incomplete; see `optimization-model.md`. Do not claim all requested hard constraints are enforced.
5. Scenario fork/isolation, atomic apply/discard, counterfactual re-solving, single-point-of-failure analysis, seeded stress testing, SSE telemetry/cancellation, and replay verification are not implemented.
6. Full browser visual QA and frontend build have not been completed due dependency availability limits.
7. Alembic migration files, PostgreSQL deployment verification, Docker Compose, lockfiles, and clean-room install verification are not complete.
8. UI forms for editing aircraft, personnel, and tasks are incomplete. The backend exposes core CRUD routes.
9. The current baseline is a heuristic; its conflict and cumulative resource accounting needs further property-based and adversarial tests.
10. The audit chain is tamper-evident but not protected against an actor who can rewrite the entire database and recalculate every hash.
