from app.optimization.types import Aircraft,Crew,Task,PlanningInput,Assignment
from app.optimization.engine import solve_greedy,validate_schedule,eligibility_reasons,canonical_hash


def test_greedy_schedules_longer_task_after_weather_window():
    """Regression: a task longer than the 30-minute restricted weather window
    must still be schedulable after the window when feasible."""
    data = PlanningInput(
        aircraft=(Aircraft("A", frozenset(), turnaround_minutes=0),),
        crew=(Crew("C", frozenset(), min_rest_minutes=0),),
        tasks=(Task("WX", "x", 5, 0, 770, 1000, 60),),
        support_capacity=2, horizon_minutes=1440,
        weather_restrictions=((780, 810),),
    )
    result = solve_greedy(data)
    assert result.validation["valid"] is True
    assert len(result.assignments) == 1
    assignment = result.assignments[0]
    assert assignment.finish - assignment.start == 60
    # Either fully before the window or fully after it (half-open intervals).
    assert assignment.finish <= 780 or assignment.start >= 810


def test_greedy_rejects_overlap_when_no_window_fits():
    """A task whose deadline forces overlap with the restricted window must
    stay unassigned with an explicit weather reason, not be placed illegally."""
    data = PlanningInput(
        aircraft=(Aircraft("A", frozenset(), turnaround_minutes=0),),
        crew=(Crew("C", frozenset(), min_rest_minutes=0),),
        tasks=(Task("WX-MID", "x", 5, 0, 760, 790, 40),),
        support_capacity=2, horizon_minutes=1440,
        weather_restrictions=((780, 810),),
    )
    result = solve_greedy(data)
    assert len(result.assignments) == 0
    assert "WX-MID" in result.unassigned
    assert "WEATHER_RESTRICTION" in result.unassigned["WX-MID"]

def small_data():
    return PlanningInput(
      aircraft=(Aircraft("A1",frozenset({"transport"}),turnaround_minutes=10),),
      crew=(Crew("C1",frozenset({"transport"}),min_rest_minutes=5),),
      tasks=(Task("T1","transport",5,0,0,120,30,frozenset({"transport"}),frozenset({"transport"})),Task("T2","transport",3,0,20,150,30,frozenset({"transport"}),frozenset({"transport"}))),
      support_capacity=1,horizon_minutes=180)

def test_greedy_returns_valid_schedule():
    data=small_data(); result=solve_greedy(data)
    assert result.status=="FEASIBLE"
    assert result.validation["valid"]
    assert len(result.assignments)==2

def test_aircraft_non_overlap_is_rejected():
    data=small_data(); items=[Assignment("T1","A1","C1",0,30),Assignment("T2","A1","C1",10,40)]
    report=validate_schedule(data,items)
    assert not report["valid"]
    assert any("AIRCRAFT_CONFLICT" in x for x in report["errors"])

def test_qualification_mismatch_reason():
    data=small_data(); task=data.tasks[0]; crew=Crew("C2",frozenset())
    assert "QUALIFICATION_MISSING" in eligibility_reasons(task,data.aircraft[0],crew,data,0)

def test_maintenance_overlap_reason():
    data=small_data(); a=Aircraft("A1",frozenset({"transport"}),maintenance=((0,50),))
    assert "MAINTENANCE_OVERLAP" in eligibility_reasons(data.tasks[0],a,data.crew[0],data,0)

def test_deadline_violation_rejected():
    data=small_data(); item=Assignment("T1","A1","C1",100,130)
    report=validate_schedule(data,[item])
    assert not report["valid"]

def test_canonical_hash_stable():
    data=small_data(); assert canonical_hash(data)==canonical_hash(data)

def test_dependencies_enforced_by_validator():
    data=PlanningInput(aircraft=(Aircraft("A",frozenset()),),crew=(Crew("C",frozenset()),),tasks=(Task("T1","x",1,0,0,100,20),Task("T2","x",1,0,0,100,20,dependencies=("T1",))),horizon_minutes=100)
    result=validate_schedule(data,[Assignment("T2","A","C",0,20)])
    assert not result["valid"]
    assert any("DEPENDENCY_UNASSIGNED" in e for e in result["errors"])

def test_greedy_schedules_dependencies_before_higher_priority_dependents():
    data = PlanningInput(
        aircraft=(Aircraft("A", frozenset(), turnaround_minutes=0),),
        crew=(Crew("C", frozenset(), min_rest_minutes=0),),
        tasks=(
            Task("DEPENDENT", "x", 5, 0, 0, 100, 20, dependencies=("PRE",)),
            Task("PRE", "x", 1, 0, 0, 100, 20),
        ),
        support_capacity=2, horizon_minutes=100,
    )
    result = solve_greedy(data)
    assert result.validation["valid"] is True
    by_id = {a.task_id: a for a in result.assignments}
    assert by_id["PRE"].finish <= by_id["DEPENDENT"].start


def test_validator_enforces_cumulative_resource_limits():
    data = PlanningInput(
        aircraft=(Aircraft("A", frozenset(), max_flight_minutes=50, turnaround_minutes=0),),
        crew=(Crew("C", frozenset(), max_duty_minutes=50, min_rest_minutes=0),),
        tasks=(Task("T1", "x", 1, 0, 0, 100, 30), Task("T2", "x", 1, 0, 0, 100, 30)),
        support_capacity=2, horizon_minutes=100,
    )
    report = validate_schedule(data, [Assignment("T1", "A", "C", 0, 30), Assignment("T2", "A", "C", 30, 60)])
    assert not report["valid"]
    assert any("CUMULATIVE_FLIGHT_LIMIT" in e for e in report["errors"])
    assert any("DUTY_LIMIT_EXCEEDED" in e for e in report["errors"])


def test_validator_turnaround_is_independent_of_input_order():
    data = PlanningInput(
        aircraft=(Aircraft("A", frozenset(), turnaround_minutes=10),),
        crew=(Crew("C", frozenset(), min_rest_minutes=10),),
        tasks=(Task("T1", "x", 1, 0, 0, 100, 20), Task("T2", "x", 1, 0, 0, 100, 20)),
        support_capacity=2, horizon_minutes=100,
    )
    report = validate_schedule(data, [Assignment("T2", "A", "C", 25, 45), Assignment("T1", "A", "C", 0, 20)])
    assert not report["valid"]
    assert any("TURNAROUND" in e or "REST_VIOLATION" in e for e in report["errors"])

def test_greedy_enforces_rest_gap_when_filling_before_existing_assignment():
    data = PlanningInput(
        aircraft=(Aircraft("A", frozenset(), turnaround_minutes=30),),
        crew=(Crew("C", frozenset(), min_rest_minutes=30),),
        tasks=(
            Task("LATE", "x", 5, 0, 60, 120, 20),
            Task("EARLY", "x", 1, 0, 20, 150, 20),
        ),
        support_capacity=2, horizon_minutes=180,
    )
    result = solve_greedy(data)
    assert result.validation["valid"] is True
    by_id = {a.task_id: a for a in result.assignments}
    assert by_id["EARLY"].start >= by_id["LATE"].finish + 30
