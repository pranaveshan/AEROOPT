import pytest
from dataclasses import replace
from app.optimization.types import Aircraft, Crew, Task, PlanningInput, Assignment
from app.optimization.engine import solve_cp_sat, validate_schedule

ortools = pytest.importorskip("ortools.sat.python.cp_model")


def base(**kwargs):
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"t"}), turnaround_minutes=10, max_flight_minutes=400),),
        crew=(Crew("C1", frozenset({"t"}), min_rest_minutes=10, max_duty_minutes=400),),
        tasks=(
            Task("T1", "t", 5, 0, 0, 200, 30, frozenset({"t"}), frozenset({"t"})),
            Task("T2", "t", 3, 0, 0, 200, 30, frozenset({"t"}), frozenset({"t"})),
        ),
        support_capacity=2,
        horizon_minutes=240,
    )
    return replace(data, **kwargs) if kwargs else data


def test_cpsat_feasible_problem():
    result = solve_cp_sat(base(), 5)
    assert result.solver == "ortools-cp-sat"
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.validation["valid"] is True
    assert len(result.assignments) == 2
    assert validate_schedule(base(), result.assignments)["valid"] is True


def test_cpsat_infeasible_when_coverage_required():
    aircraft = (Aircraft("A1", frozenset({"t"}), turnaround_minutes=0, max_flight_minutes=40),)
    crew = (Crew("C1", frozenset({"t"}), min_rest_minutes=0, max_duty_minutes=40),)
    tasks = (
        Task("T1", "t", 5, 0, 0, 30, 30, frozenset({"t"}), frozenset({"t"})),
        Task("T2", "t", 5, 0, 0, 30, 30, frozenset({"t"}), frozenset({"t"})),
    )
    data = PlanningInput(aircraft, crew, tasks, support_capacity=2, horizon_minutes=30, require_complete_coverage=True)
    result = solve_cp_sat(data, 5)
    assert result.status == "INFEASIBLE"
    assert result.assignments == []
    assert result.status not in ("OPTIMAL", "FEASIBLE")


def test_cpsat_competing_aircraft():
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"t"}), turnaround_minutes=0, max_flight_minutes=400),),
        crew=(
            Crew("C1", frozenset({"t"}), min_rest_minutes=0, max_duty_minutes=400),
            Crew("C2", frozenset({"t"}), min_rest_minutes=0, max_duty_minutes=400),
        ),
        tasks=(
            Task("T1", "t", 5, 0, 0, 60, 40, frozenset({"t"}), frozenset({"t"})),
            Task("T2", "t", 5, 0, 0, 60, 40, frozenset({"t"}), frozenset({"t"})),
        ),
        support_capacity=2,
        horizon_minutes=80,
    )
    result = solve_cp_sat(data, 5)
    assert result.validation["valid"] is True
    starts = sorted((a.start, a.finish) for a in result.assignments)
    if len(result.assignments) == 2:
        assert starts[0][1] <= starts[1][0]


def test_cpsat_competing_person():
    data = PlanningInput(
        aircraft=(
            Aircraft("A1", frozenset({"t"}), turnaround_minutes=0),
            Aircraft("A2", frozenset({"t"}), turnaround_minutes=0),
        ),
        crew=(Crew("C1", frozenset({"t"}), min_rest_minutes=0, max_duty_minutes=400),),
        tasks=(
            Task("T1", "t", 5, 0, 0, 60, 40, frozenset({"t"}), frozenset({"t"})),
            Task("T2", "t", 5, 0, 0, 60, 40, frozenset({"t"}), frozenset({"t"})),
        ),
        support_capacity=2,
        horizon_minutes=80,
    )
    result = solve_cp_sat(data, 5)
    assert all(a.crew_id == "C1" for a in result.assignments)
    if len(result.assignments) == 2:
        ordered = sorted(result.assignments, key=lambda a: a.start)
        assert ordered[0].finish <= ordered[1].start


def test_cpsat_unqualified_personnel():
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"med"}), turnaround_minutes=0),),
        crew=(Crew("C1", frozenset({"other"}), min_rest_minutes=0),),
        tasks=(Task("T1", "med", 5, 0, 0, 100, 20, frozenset({"med"}), frozenset({"med"})),),
        support_capacity=1,
        horizon_minutes=100,
    )
    result = solve_cp_sat(data, 5)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.assignments == []
    assert "T1" in result.unassigned
    assert "QUALIFICATION_MISSING" in result.unassigned["T1"]


def test_cpsat_maintenance_blocks_aircraft():
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"t"}), maintenance=((0, 100),), turnaround_minutes=0),),
        crew=(Crew("C1", frozenset({"t"}), min_rest_minutes=0),),
        tasks=(Task("T1", "t", 5, 0, 0, 80, 30, frozenset({"t"}), frozenset({"t"})),),
        support_capacity=1,
        horizon_minutes=100,
    )
    result = solve_cp_sat(data, 5)
    assert result.assignments == []
    assert "MAINTENANCE_OVERLAP" in result.unassigned["T1"] or result.validation["valid"]


def test_cpsat_availability_conflict():
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"t"}), available_from=80, available_until=100, turnaround_minutes=0),),
        crew=(Crew("C1", frozenset({"t"}), available_from=0, available_until=50, min_rest_minutes=0),),
        tasks=(Task("T1", "t", 5, 0, 0, 70, 30, frozenset({"t"}), frozenset({"t"})),),
        support_capacity=1,
        horizon_minutes=100,
    )
    result = solve_cp_sat(data, 5)
    assert result.assignments == []


def test_cpsat_empty_and_invalid_input():
    empty = PlanningInput(aircraft=(), crew=(), tasks=(), horizon_minutes=60)
    result = solve_cp_sat(empty, 2)
    assert result.status == "OPTIMAL"
    assert result.validation["valid"] is True
    invalid = PlanningInput(aircraft=(), crew=(), tasks=(), horizon_minutes=-1)
    bad = solve_cp_sat(invalid, 2)
    assert bad.status == "MODEL_INVALID"
    assert bad.validation["valid"] is False


def test_cpsat_timeout_unknown_does_not_succeed():
    tasks = tuple(Task(f"T{i}", "t", 5, 0, 0, 500, 20, frozenset({"t"}), frozenset({"t"})) for i in range(8))
    aircraft = tuple(Aircraft(f"A{i}", frozenset({"t"}), turnaround_minutes=5) for i in range(4))
    crew = tuple(Crew(f"C{i}", frozenset({"t"}), min_rest_minutes=5) for i in range(4))
    data = PlanningInput(aircraft, crew, tasks, support_capacity=2, horizon_minutes=500)
    result = solve_cp_sat(data, 0.1)
    if result.status == "UNKNOWN":
        assert result.assignments == []
        assert result.status != "FEASIBLE"
    else:
        assert result.status in ("OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID")


def test_cpsat_schedules_longer_task_around_weather_window():
    """Regression: a 60-minute task and a 30-minute restricted weather window
    [780, 810): the task must be schedulable fully before or fully after the
    window when its deadline allows, and never overlap it."""
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"t"}), turnaround_minutes=0),),
        crew=(Crew("C1", frozenset({"t"}), min_rest_minutes=0),),
        tasks=(Task("T1", "t", 5, 0, 770, 1440, 60, frozenset({"t"}), frozenset({"t"})),),
        support_capacity=2,
        horizon_minutes=1440,
        weather_restrictions=((780, 810),),
    )
    result = solve_cp_sat(data, 5)
    assert result.status in ("OPTIMAL", "FEASIBLE"), result.unassigned
    assert result.validation["valid"] is True
    assert len(result.assignments) == 1
    assignment = result.assignments[0]
    assert assignment.finish <= 780 or assignment.start >= 810


def test_cpsat_weather_overlap_unassigned_with_reason():
    data = PlanningInput(
        aircraft=(Aircraft("A1", frozenset({"t"}), turnaround_minutes=0),),
        crew=(Crew("C1", frozenset({"t"}), min_rest_minutes=0),),
        tasks=(Task("T1", "t", 5, 0, 760, 790, 40, frozenset({"t"}), frozenset({"t"})),),
        support_capacity=2,
        horizon_minutes=1440,
        weather_restrictions=((780, 810),),
    )
    result = solve_cp_sat(data, 5)
    assert result.assignments == []
    assert "T1" in result.unassigned
    assert "WEATHER_RESTRICTION" in result.unassigned["T1"]


def test_cpsat_independent_validation_of_generated_schedule():
    data = base()
    result = solve_cp_sat(data, 5)
    report = validate_schedule(data, result.assignments)
    assert report["valid"] is True
    forged = result.assignments + [Assignment("T1", "A1", "C1", 0, 30)]
    assert validate_schedule(data, forged)["valid"] is False
