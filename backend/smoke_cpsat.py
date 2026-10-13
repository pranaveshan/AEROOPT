"""Prove a real OR-Tools CP-SAT model can be created and solved."""
from app.optimization.types import Aircraft, Crew, Task, PlanningInput
from app.optimization.engine import solve_cp_sat

def main() -> int:
    try:
        from ortools.sat.python import cp_model  # noqa: F401
    except ImportError:
        print("FAIL solver=cp-sat-unavailable status=UNKNOWN reason=ORTOOLS_NOT_INSTALLED")
        return 1
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"t"}), turnaround_minutes=5),),
        crew=(Crew("C1", frozenset({"t"}), min_rest_minutes=5),),
        tasks=(Task("T1", "t", 5, 0, 0, 120, 30, frozenset({"t"}), frozenset({"t"})),),
        support_capacity=1,
        horizon_minutes=180,
    )
    result = solve_cp_sat(data, time_limit_seconds=5)
    print(
        f"solver={result.solver} status={result.status} "
        f"objective={result.objective} assigned={len(result.assignments)} "
        f"valid={result.validation.get('valid')} errors={result.validation.get('errors')}"
    )
    if result.solver != "ortools-cp-sat":
        return 1
    if result.status not in ("OPTIMAL", "FEASIBLE"):
        return 1
    if not result.validation.get("valid"):
        return 1
    if len(result.assignments) != 1:
        return 1
    print("CP-SAT smoke test passed")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
