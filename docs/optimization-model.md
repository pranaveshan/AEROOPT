# Optimization model and algorithm rationale

## Time and intervals

All time values are integer minutes from a synthetic planning-horizon origin. Intervals are half-open `[start, finish)`, so an assignment finishing at minute 90 does not overlap one starting at minute 90. The default horizon is 1,440 minutes. Synthetic weather restrictions occupy `[780, 810)`. The prototype does not convert these horizon-relative values into local wall-clock time.

## Greedy baseline

Tasks are ordered by descending priority, then latest finish, release, and task ID. Candidate aircraft and crew are visited in lexical ID order. The baseline chooses the earliest feasible start, then prefers a task's previous aircraft if tied, then aircraft ID and crew ID. Dependencies must already be scheduled. If no candidate passes the prefilter and local conflict checks, the task remains unassigned with available rejection reasons. The baseline is deterministic for identical canonical inputs.

## CP-SAT model

The optional OR-Tools implementation creates a Boolean assignment choice for each prefiltered task-aircraft-crew tuple, plus an unassigned Boolean per task. Optional intervals are constrained by `NoOverlap` per aircraft and crew. The objective minimizes priority-weighted unassigned work (priority multiplied by 10,000), plus delay in minutes, plus a configurable stability penalty of `stability_weight × 10` objective units for each changed previous aircraft assignment. The stability weight is an integer setting; this scaling is deliberately explicit and is not calibrated to real operating cost. The returned objective and bound are populated only when OR-Tools reports a feasible/optimal result. Solver status is preserved. A timeout is not treated as infeasibility.

## Important limitations

The CP-SAT implementation is a prototype, not a complete formulation of every item in the master prompt. The current model does not yet encode aircraft turnaround/rest as interval-expanded NoOverlap, cumulative maintenance across multiple selected tasks, full cumulative support-resource capacity for arbitrary demand, all qualification expiry edge cases, or complete task-status transitions. The independent validator also needs further strengthening around aggregate usage and weather/resource edge cases. Stability weight is implemented as a small, explicit previous-aircraft change penalty in both solver formulations, but this is not yet a full minimal-disruption model over all assignment dimensions. These are known gaps and the model must not be described as enforcing every requested hard constraint until they are fixed and tested.

## Eligibility and validation

Eligibility reasons are machine-readable and explain local pair rejection. They do not prove global infeasibility. The independent validator checks task uniqueness, resource references, interval conflicts, basic eligibility, support capacity at event boundaries, and dependencies. Validation failures downgrade a solver result to `UNKNOWN` at the current API boundary. Further constraint parity work is required before claiming full correctness.
