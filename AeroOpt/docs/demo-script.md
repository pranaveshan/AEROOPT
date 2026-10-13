# Five-minute demo script (current honest version)

**0:00–0:40 — Mission page.** Open `/mission`. Point out the schedule graphic is generated from API assignments and every record is synthetic. If no schedule exists yet, proceed to the console and solve a baseline first.

**0:40–1:30 — Baseline.** Open `/console`, select deterministic greedy baseline, and run a solve. Inspect status, independent validation, duration, and the work queue. Do not invent a CP-SAT comparison when OR-Tools is unavailable.

**1:30–2:15 — Disruption.** Use the API docs to POST a fictional `aircraft_grounded` disruption for `AC-101`, then rerun the baseline and inspect changed/unassigned work. The current UI does not yet have a complete before/after diff view.

**2:15–3:00 — Stability.** Change the stability slider and rerun to show the request setting. State honestly that the stability penalty is not fully encoded in the current CP-SAT model and the UI setting is not proof of stability behavior.

**3:00–3:40 — Diagnostics.** Open `/api/v1/eligibility/TK-302` to inspect resource-pair rejection reasons. Verified counterfactual analysis is not implemented; do not stage a fake result.

**3:40–4:20 — Stress test.** Show `benchmarks/run_benchmarks.py` and explain benchmark execution is pending package installation; do not claim statistical results.

**4:20–5:00 — Audit and approval.** Open `/audit`, run chain verification, and approve a validated feasible greedy proposal. Explain the audit-chain threat boundary and the missing scenario/replay features.
