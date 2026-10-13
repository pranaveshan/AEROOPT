# Data schema summary

The current SQLite schema uses SQLAlchemy tables:

- `aircraft`: synthetic ID, type, capabilities JSON, home facility, status, availability, cumulative flight usage/limit, turnaround, maintenance windows, archive flag.
- `personnel`: synthetic ID, role, qualification list and expiry map, availability, duty usage/limit, minimum rest, archive flag.
- `tasks`: synthetic ID, title/category/priority, release and operating window, duration, capability/qualification requirements, dependencies, support units, status, previous aircraft, archive flag.
- `assignments`: schedule version, task/resource IDs, start/finish, explanation JSON.
- `solver_runs`: run ID, solver/status/duration, input/output hashes, canonical result JSON.
- `audit_events`: sequential ID, UTC timestamp, actor, action, entity, payload envelope, previous hash, event hash.

Units: time values are minutes from horizon origin; capacities are integer units; priority is 1–5. Interval semantics are half-open `[start, finish)`. The current prototype stores several normalized collections as JSON text for implementation speed, so the schema is not yet fully normalized to separate capability, qualification, maintenance, and availability tables. This is an explicit gap against the master specification.
