"""Documented advanced analyses over synthetic planning data only."""
from __future__ import annotations
from dataclasses import replace
from ..optimization.types import PlanningInput
from ..optimization.engine import solve_greedy, solve_cp_sat, canonical_hash


def _solve(data: PlanningInput, solver: str, time_limit: float):
    return solve_greedy(data) if solver == "greedy" else solve_cp_sat(data, time_limit)


def single_point_of_failure(data: PlanningInput, solver: str = "greedy", time_limit: float = 5.0) -> dict:
    baseline = _solve(data, solver, time_limit)
    base_ids = {a.task_id for a in baseline.assignments}
    aircraft_failures = []
    for aircraft in data.aircraft:
        branched = replace(data, aircraft=tuple(replace(a, serviceable=False) if a.id == aircraft.id else a for a in data.aircraft))
        result = _solve(branched, solver, time_limit)
        lost = sorted(base_ids - {a.task_id for a in result.assignments})
        aircraft_failures.append({"resource_id": aircraft.id, "kind": "aircraft", "tasks_lost": lost, "critical": bool(lost)})
    crew_failures = []
    for crew in data.crew:
        branched = replace(data, crew=tuple(replace(c, available_until=0) if c.id == crew.id else c for c in data.crew))
        result = _solve(branched, solver, time_limit)
        lost = sorted(base_ids - {a.task_id for a in result.assignments})
        crew_failures.append({"resource_id": crew.id, "kind": "personnel", "tasks_lost": lost, "critical": bool(lost)})
    return {
        "baseline_assigned": len(base_ids),
        "baseline_status": baseline.status,
        "aircraft": aircraft_failures,
        "personnel": crew_failures,
        "critical_aircraft": [x["resource_id"] for x in aircraft_failures if x["critical"]],
        "critical_personnel": [x["resource_id"] for x in crew_failures if x["critical"]],
    }


def stress_test(data: PlanningInput, solver: str = "greedy", time_limit: float = 5.0) -> dict:
    """Deterministic disruption set (seeded). Not a statistical Monte Carlo of real ops."""
    baseline = _solve(data, solver, time_limit)
    cases = []
    if data.aircraft:
        grounded = replace(data, aircraft=tuple(replace(a, serviceable=False) if a.id == data.aircraft[0].id else a for a in data.aircraft))
        cases.append(("ground_first_aircraft", grounded))
    if data.crew:
        short = replace(data, crew=tuple(replace(c, available_until=min(c.available_until, 120)) if c.id == data.crew[0].id else c for c in data.crew))
        cases.append(("shorten_first_crew_window", short))
    if data.aircraft:
        maint = replace(data, aircraft=tuple(replace(a, maintenance=(*a.maintenance, (0, 240))) if a.id == data.aircraft[0].id else a for a in data.aircraft))
        cases.append(("early_maintenance", maint))
    weather = replace(data, weather_restrictions=(*data.weather_restrictions, (0, 180)))
    cases.append(("expanded_weather", weather))
    results = []
    for name, branched in cases:
        result = _solve(branched, solver, time_limit)
        results.append({
            "name": name,
            "status": result.status,
            "assigned": len(result.assignments),
            "unassigned": result.unassigned,
            "validation": result.validation,
        })
    return {"baseline_assigned": len(baseline.assignments), "baseline_status": baseline.status, "cases": results}


def replay_run(data: PlanningInput, previous_input_hash: str, solver: str, time_limit: float) -> dict:
    result = _solve(data, solver, time_limit)
    current = canonical_hash(data)
    return {
        "reproducible_input": current == previous_input_hash,
        "current_input_hash": current,
        "previous_input_hash": previous_input_hash,
        "status": result.status,
        "solver": result.solver,
        "validation": result.validation,
        "assigned": len(result.assignments),
    }


def compare_strategies(data: PlanningInput, time_limit: float = 5.0) -> dict:
    greedy = solve_greedy(data)
    cpsat = solve_cp_sat(data, time_limit)
    return {
        "greedy": {"status": greedy.status, "solver": greedy.solver, "assigned": len(greedy.assignments), "validation": greedy.validation, "objective_components": greedy.objective_components, "unassigned": greedy.unassigned},
        "cp_sat": {"status": cpsat.status, "solver": cpsat.solver, "assigned": len(cpsat.assignments), "validation": cpsat.validation, "objective": cpsat.objective, "objective_components": cpsat.objective_components, "unassigned": cpsat.unassigned},
    }
