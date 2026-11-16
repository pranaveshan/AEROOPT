# First comment (post as author, after publishing)

A few implementation details for anyone who wants them:

- The planner is deterministic and greedy, not a solver. It orders tasks dependency-first, scans candidate start slots, and picks the earliest feasible aircraft/crew pairing. Unassigned tasks keep the dominant blocking constraint.
- Optimisation evaluates four orderings × (preserve existing assignments / rebuild), then scores: assigned share, utilisation share, preserved share, minus violations.
- Feasibility means "passes the configured rules" — it is not an airworthiness or regulatory clearance. That distinction is stated in the UI.
- Everything runs on one Worker: `/api/*` first, built client behind it. D1 bootstraps its own schema and demo dataset on first request.
- The demo dataset is synthetic and labelled as such everywhere it appears. No external aviation feed is connected.

Happy to talk through the constraint engine or how the approval flow keeps the committed schedule immutable once superseded.
