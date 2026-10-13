from app.optimization.types import Aircraft,Crew,Task,PlanningInput,Assignment
from app.optimization.engine import solve_greedy,validate_schedule,eligibility_reasons,canonical_hash

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
