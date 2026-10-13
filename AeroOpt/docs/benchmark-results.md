# Synthetic benchmark results (executed 2026-10-12)

Command:

```bash
python3 benchmarks/run_benchmarks.py --sizes 8 20 40 --seed 42 --time-limit 1 --out benchmarks/results
```

The script was executed in the current container. Raw inputs/configuration hashes and measured outputs are in `benchmarks/results/benchmark-*-seed-42.json` and `summary-seed-42.json`.

| Tasks | Engine | Status | Assigned | Unassigned | Wall time (seconds) | Independent validation |
|---:|---|---|---:|---:|---:|---|
| 8 | Greedy | FEASIBLE | 8 | 0 | 0.001836 | Valid |
| 20 | Greedy | FEASIBLE | 20 | 0 | 0.042280 | Valid |
| 40 | Greedy | FEASIBLE | 40 | 0 | 0.321588 | Valid |
| 8 | CP-SAT | UNKNOWN | 0 | 8 | 0.000095 | Not valid / not run |
| 20 | CP-SAT | UNKNOWN | 0 | 20 | 0.000156 | Not valid / not run |
| 40 | CP-SAT | UNKNOWN | 0 | 40 | 0.000161 | Not valid / not run |

**Interpretation:** CP-SAT was not executed because OR-Tools is not installed; its UNKNOWN status is a dependency-availability result, not evidence that any instance is infeasible. Greedy timing is measured for this container and these small synthetic instances only. These values are not general performance claims and do not establish that greedy is better than CP-SAT.
