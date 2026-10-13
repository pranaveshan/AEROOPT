"""Idempotent deterministic seed of fictional data only."""
import json
from sqlalchemy.orm import Session
from .models import AircraftRow, PersonnelRow, TaskRow, AssignmentRow

def seed(db: Session):
    aircraft=[
      dict(id="AC-101",type="Utility",capabilities=["transport","inspection","relief"],home_facility="NORTH FIELD",status="serviceable",available_from=0,available_until=1440,max_flight_minutes=480,used_flight_minutes=60,turnaround_minutes=30,maintenance=[]),
      dict(id="AC-102",type="Transport",capabilities=["transport","medical","relief"],home_facility="NORTH FIELD",status="serviceable",available_from=0,available_until=1200,max_flight_minutes=420,used_flight_minutes=120,turnaround_minutes=45,maintenance=[[600,660]]),
      dict(id="AC-103",type="Light utility",capabilities=["inspection","training","relief"],home_facility="EAST FIELD",status="serviceable",available_from=60,available_until=1440,max_flight_minutes=360,used_flight_minutes=30,turnaround_minutes=25,maintenance=[]),
      dict(id="AC-104",type="Utility",capabilities=["transport","training"],home_facility="EAST FIELD",status="serviceable",available_from=0,available_until=1440,max_flight_minutes=360,used_flight_minutes=0,turnaround_minutes=30,maintenance=[]),
    ]
    crew=[
      dict(id="CR-201",role="Flight operator",qualifications=["basic-flight","transport"],qualification_expiry={},available_from=0,available_until=900,max_duty_minutes=480,used_duty_minutes=30,min_rest_minutes=30),
      dict(id="CR-202",role="Medical crew",qualifications=["basic-flight","medical"],qualification_expiry={"medical":1300},available_from=0,available_until=1200,max_duty_minutes=480,used_duty_minutes=60,min_rest_minutes=45),
      dict(id="CR-203",role="Inspection crew",qualifications=["basic-flight","inspection"],qualification_expiry={},available_from=60,available_until=1440,max_duty_minutes=420,used_duty_minutes=0,min_rest_minutes=30),
      dict(id="CR-204",role="Relief crew",qualifications=["basic-flight","transport","relief"],qualification_expiry={},available_from=0,available_until=1440,max_duty_minutes=480,used_duty_minutes=20,min_rest_minutes=30),
    ]
    tasks=[
      dict(id="TK-301",title="Regional supply transfer",category="Logistics and transport",priority=5,release=0,earliest_start=30,latest_finish=300,duration=90,capabilities=["transport"],qualifications=["transport"],dependencies=[],support_units=1,status="pending"),
      dict(id="TK-302",title="Community medical transfer",category="Medical evacuation",priority=5,release=0,earliest_start=60,latest_finish=360,duration=75,capabilities=["medical"],qualifications=["medical"],dependencies=[],support_units=1,status="pending"),
      dict(id="TK-303",title="Facility safety inspection",category="Inspections and maintenance",priority=4,release=0,earliest_start=120,latest_finish=480,duration=60,capabilities=["inspection"],qualifications=["inspection"],dependencies=[],support_units=1,status="pending"),
      dict(id="TK-304",title="Relief supply delivery",category="Disaster relief",priority=5,release=60,earliest_start=180,latest_finish=540,duration=120,capabilities=["relief"],qualifications=["relief"],dependencies=["TK-301"],support_units=1,status="pending"),
      dict(id="TK-305",title="Crew proficiency session",category="Training and evaluation",priority=2,release=0,earliest_start=360,latest_finish=720,duration=60,capabilities=["training"],qualifications=["basic-flight"],dependencies=[],support_units=1,status="pending"),
      dict(id="TK-306",title="Cold-chain delivery",category="Logistics and transport",priority=3,release=0,earliest_start=240,latest_finish=600,duration=75,capabilities=["transport"],qualifications=["transport"],dependencies=[],support_units=2,status="pending"),
      dict(id="TK-307",title="Preventive inspection flight",category="Inspections and maintenance",priority=3,release=0,earliest_start=420,latest_finish=720,duration=60,capabilities=["inspection"],qualifications=["inspection"],dependencies=[],support_units=1,status="pending"),
    ]
    for d in aircraft:
        if not db.get(AircraftRow,d["id"]):
            db.add(AircraftRow(**{**d,"capabilities":json.dumps(d["capabilities"]),"maintenance":json.dumps(d["maintenance"])}))
    for d in crew:
        if not db.get(PersonnelRow,d["id"]):
            db.add(PersonnelRow(**{**d,"qualifications":json.dumps(d["qualifications"]),"qualification_expiry":json.dumps(d["qualification_expiry"])}))
    for d in tasks:
        if not db.get(TaskRow,d["id"]):
            db.add(TaskRow(**{**d,"capabilities":json.dumps(d["capabilities"]),"qualifications":json.dumps(d["qualifications"]),"dependencies":json.dumps(d["dependencies"])}))
    db.commit()
    # Deterministic, hand-authored seed schedule is a fictional baseline fixture.
    # It is not a solver claim; all assignments use synthetic IDs and windows.
    if db.query(AssignmentRow).count() == 0:
        initial = [
            ("TK-301", "AC-101", "CR-201", 30, 120),
            ("TK-302", "AC-102", "CR-202", 60, 135),
            ("TK-303", "AC-103", "CR-203", 120, 180),
            ("TK-304", "AC-102", "CR-204", 180, 300),
            ("TK-306", "AC-104", "CR-201", 360, 435),
            ("TK-307", "AC-103", "CR-203", 480, 540),
            ("TK-305", "AC-104", "CR-201", 540, 600),
        ]
        for task_id, aircraft_id, crew_id, start, finish in initial:
            db.add(AssignmentRow(schedule_version="SEED-0", task_id=task_id, aircraft_id=aircraft_id, crew_id=crew_id, start=start, finish=finish, explanation=json.dumps(["Deterministic synthetic seed schedule", "Not a solver result", "Human review required for future changes"])))
            task_row=db.get(TaskRow,task_id)
            if task_row: task_row.status="scheduled"
        db.commit()
