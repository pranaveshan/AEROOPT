# Known limitations

1. The complete official SIH26250 brief has not been verified against an official source; confirm requirements with the official portal/team SPOC.
2. The app is a synthetic prototype for non-combat aviation workflows only and is not flight-planning or safety-certified software.
3. OR-Tools is declared but was not installed in this environment; CP-SAT execution and benchmarks are therefore unverified. The CP-SAT formulation still needs a full adversarial constraint audit before it should be treated as a production-grade optimizer.
4. Scenario support currently provides ephemeral, in-memory counterfactual re-solving for grounded aircraft, extended maintenance, and unavailable personnel. Durable scenario forks, atomic apply/discard, single-point-of-failure analysis, seeded stress distributions, SSE telemetry/cancellation, and replay verification remain unimplemented.
5. Aircraft, personnel, and task screens now expose JSON-based create/edit workflows; aircraft/personnel can be archived and tasks cancelled. Archived aircraft and personnel can be viewed and restored from their respective UI pages. These editors submit full API records rather than field-by-field forms.
6. The browser build and frontend tests are configured; their execution must be verified in a network-enabled environment if dependency installation times out.
7. Docker Compose and PostgreSQL deployment were not executed/verified in this environment.
8. Collection-valued fields are stored as JSON text rather than normalized relational tables. This is acceptable for a local prototype but limits querying and concurrent updates.
9. The greedy baseline is a deterministic heuristic, not a global optimizer. It reports a feasible schedule only when the independent validator accepts it; an unassigned task is not itself proof of mathematical infeasibility.
10. The audit chain is tamper-evident but not protected against a privileged actor who can rewrite the entire database and recalculate every hash.
11. The seed schedule is explicitly hand-authored synthetic fixture data, not a solver result or live operational schedule. No live airline, weather, or air-traffic feeds are connected.
\n12. Authentication and authorization are not production-grade. The API must be deployed behind a properly configured identity provider, role-based authorization, TLS, secret management, and operational monitoring before use beyond a local synthetic demo.\n
## Current verification caveats

- Frontend build and Vitest have not been executed successfully in this environment because npm dependency installation timed out.
- OR-Tools is pinned in `backend/requirements.txt` but is not installed in the current runtime. CP-SAT requests return an explicit unavailable/UNKNOWN result until dependencies are installed; only greedy scheduling was exercised in tests.
- Scenario branches are isolated and compared to a baseline but remain ephemeral: create/save/list/compare historical named scenarios and explicit apply/discard lifecycle are not implemented.
- The bearer-token RBAC middleware is an initial control layer. Production identity management, token expiry/rotation, SSO, user provisioning, and external security review remain necessary before real operational use.
