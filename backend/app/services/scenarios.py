"""Isolated scenario snapshots. Mutations stay off live operational tables until apply."""
from __future__ import annotations
import copy, json, uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..models import AircraftRow, PersonnelRow, TaskRow, AssignmentRow, ScenarioRow
from ..optimization.types import Aircraft, Crew, Task, PlanningInput, Assignment
from ..optimization.engine import canonical_hash

LIVE_STATUSES = ("draft", "solved")


def _decode(value):
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []


def snapshot_from_db(db: Session) -> dict:
    aircraft = [serialize_aircraft(r) for r in db.query(AircraftRow).filter_by(archived=False).all()]
    personnel = [serialize_crew(r) for r in db.query(PersonnelRow).filter_by(archived=False).all()]
    tasks = [serialize_task(r) for r in db.query(TaskRow).filter_by(archived=False).all()]
    assignments = [
        {"task_id": x.task_id, "aircraft_id": x.aircraft_id, "crew_id": x.crew_id, "start": x.start, "finish": x.finish, "explanation": _decode(x.explanation)}
        for x in db.query(AssignmentRow).order_by(AssignmentRow.start.asc()).all()
    ]
    return {
        "aircraft": aircraft,
        "personnel": personnel,
        "tasks": tasks,
        "assignments": assignments,
        "support_capacity": 2,
        "weather_restrictions": [[780, 810]],
        "horizon_minutes": 1440,
    }


def serialize_aircraft(r) -> dict:
    if isinstance(r, dict):
        return r
    return {"id": r.id, "type": r.type, "capabilities": _decode(r.capabilities), "home_facility": r.home_facility, "status": r.status, "available_from": r.available_from, "available_until": r.available_until, "max_flight_minutes": r.max_flight_minutes, "used_flight_minutes": r.used_flight_minutes, "turnaround_minutes": r.turnaround_minutes, "maintenance": _decode(r.maintenance), "archived": r.archived}


def serialize_crew(r) -> dict:
    if isinstance(r, dict):
        return r
    return {"id": r.id, "role": r.role, "qualifications": _decode(r.qualifications), "qualification_expiry": _decode(r.qualification_expiry), "available_from": r.available_from, "available_until": r.available_until, "max_duty_minutes": r.max_duty_minutes, "used_duty_minutes": r.used_duty_minutes, "min_rest_minutes": r.min_rest_minutes, "archived": r.archived}


def serialize_task(r) -> dict:
    if isinstance(r, dict):
        return r
    return {"id": r.id, "title": r.title, "category": r.category, "priority": r.priority, "release": r.release, "earliest_start": r.earliest_start, "latest_finish": r.latest_finish, "duration": r.duration, "capabilities": _decode(r.capabilities), "qualifications": _decode(r.qualifications), "dependencies": _decode(r.dependencies), "support_units": r.support_units, "status": r.status, "previous_aircraft_id": r.previous_aircraft_id, "archived": r.archived}


def planning_from_snapshot(snap: dict, stability: int = 0) -> PlanningInput:
    aircraft = tuple(
        Aircraft(a["id"], frozenset(a.get("capabilities") or []), a.get("status") == "serviceable", int(a.get("available_from", 0)), int(a.get("available_until", 1440)), int(a.get("max_flight_minutes", 600)), int(a.get("used_flight_minutes", 0)), int(a.get("turnaround_minutes", 30)), tuple(tuple(x) for x in (a.get("maintenance") or [])))
        for a in snap.get("aircraft") or [] if not a.get("archived")
    )
    crew = tuple(
        Crew(c["id"], frozenset(c.get("qualifications") or []), int(c.get("available_from", 0)), int(c.get("available_until", 1440)), int(c.get("max_duty_minutes", 600)), int(c.get("used_duty_minutes", 0)), int(c.get("min_rest_minutes", 30)), tuple((c.get("qualification_expiry") or {}).items()))
        for c in snap.get("personnel") or [] if not c.get("archived")
    )
    previous = {x["task_id"]: x["aircraft_id"] for x in snap.get("assignments") or []}
    tasks = tuple(
        Task(t["id"], t.get("category", "x"), int(t.get("priority", 3)), int(t.get("release", 0)), int(t.get("earliest_start", 0)), int(t.get("latest_finish", 1440)), int(t.get("duration", 60)), frozenset(t.get("capabilities") or []), frozenset(t.get("qualifications") or []), t.get("status", "pending"), tuple(t.get("dependencies") or []), int(t.get("support_units", 1)), t.get("previous_aircraft_id") or previous.get(t["id"]))
        for t in snap.get("tasks") or [] if not t.get("archived")
    )
    weather = tuple(tuple(x) for x in snap.get("weather_restrictions") or [])
    return PlanningInput(aircraft, crew, tasks, int(snap.get("support_capacity", 2)), weather, int(snap.get("horizon_minutes", 1440)), stability, 42)


def mutate_snapshot(snap: dict, change: dict) -> dict:
    data = copy.deepcopy(snap)
    kind = change.get("type") or change.get("op")
    rid = change.get("resource_id") or change.get("id")
    if kind == "aircraft_grounded":
        _patch_list(data["aircraft"], rid, {"status": "grounded"})
    elif kind == "crew_unavailable":
        until = int(change.get("until", 0))
        _patch_list(data["personnel"], rid, {"available_until": until})
    elif kind == "maintenance_extended":
        start, finish = int(change.get("start", 600)), int(change.get("finish", 720))
        item = _find(data["aircraft"], rid)
        item["maintenance"] = list(item.get("maintenance") or []) + [[start, finish]]
    elif kind == "update_aircraft":
        _patch_list(data["aircraft"], rid, change.get("changes") or {})
    elif kind == "update_personnel":
        _patch_list(data["personnel"], rid, change.get("changes") or {})
    elif kind == "update_task":
        _patch_list(data["tasks"], rid, change.get("changes") or {})
    elif kind == "add_task":
        data.setdefault("tasks", []).append(change["task"])
    else:
        raise ValueError("Unsupported scenario change")
    return data


def _find(items: list, item_id: str) -> dict:
    for item in items:
        if item.get("id") == item_id:
            return item
    raise KeyError(item_id)


def _patch_list(items: list, item_id: str, changes: dict) -> None:
    item = _find(items, item_id)
    item.update(changes)


def create_scenario(db: Session, name: str) -> ScenarioRow:
    snap = snapshot_from_db(db)
    row = ScenarioRow(
        id=str(uuid.uuid4())[:8].upper(),
        name=name.strip() or "Untitled scenario",
        status="draft",
        version=1,
        snapshot_json=json.dumps(snap),
        result_json=None,
        baseline_hash=canonical_hash(planning_from_snapshot(snap)),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    return row


def public_scenario(row: ScenarioRow) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "status": row.status,
        "version": row.version,
        "baseline_hash": row.baseline_hash,
        "snapshot": json.loads(row.snapshot_json),
        "result": json.loads(row.result_json) if row.result_json else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "isolated": True,
    }


def compare_results(baseline, scenario) -> dict:
    base_tasks = {a.task_id: a for a in baseline.assignments}
    scen_tasks = {a.task_id: a for a in scenario.assignments}
    changed = []
    for tid, assignment in scen_tasks.items():
        prev = base_tasks.get(tid)
        if not prev:
            changed.append({"task_id": tid, "change": "added", "to": {"aircraft_id": assignment.aircraft_id, "crew_id": assignment.crew_id, "start": assignment.start}})
        elif (prev.aircraft_id, prev.crew_id, prev.start) != (assignment.aircraft_id, assignment.crew_id, assignment.start):
            changed.append({"task_id": tid, "change": "reassigned", "from": {"aircraft_id": prev.aircraft_id, "crew_id": prev.crew_id, "start": prev.start}, "to": {"aircraft_id": assignment.aircraft_id, "crew_id": assignment.crew_id, "start": assignment.start}})
    lost = sorted(set(base_tasks) - set(scen_tasks))
    return {
        "baseline_assigned": len(base_tasks),
        "scenario_assigned": len(scen_tasks),
        "assignment_delta": len(scen_tasks) - len(base_tasks),
        "tasks_lost": lost,
        "tasks_recovered_or_added": sorted(set(scen_tasks) - set(base_tasks)),
        "assignment_changes": changed,
        "baseline_delay": baseline.objective_components.get("total_delay_minutes"),
        "scenario_delay": scenario.objective_components.get("total_delay_minutes"),
        "baseline_unassigned": baseline.unassigned,
        "scenario_unassigned": scenario.unassigned,
        "baseline_status": baseline.status,
        "scenario_status": scenario.status,
        "baseline_solver": baseline.solver,
        "scenario_solver": scenario.solver,
    }


def apply_snapshot_to_db(db: Session, snap: dict, assignments: list[Assignment], run_id: str) -> None:
    """Overwrite live operational rows inside the caller's transaction."""
    live_aircraft = {r.id: r for r in db.query(AircraftRow).all()}
    for item in snap.get("aircraft") or []:
        row = live_aircraft.get(item["id"])
        payload = {
            "type": item.get("type", "Utility"),
            "capabilities": json.dumps(item.get("capabilities") or []),
            "home_facility": item.get("home_facility", "NORTH FIELD"),
            "status": item.get("status", "serviceable"),
            "available_from": item.get("available_from", 0),
            "available_until": item.get("available_until", 1440),
            "max_flight_minutes": item.get("max_flight_minutes", 600),
            "used_flight_minutes": item.get("used_flight_minutes", 0),
            "turnaround_minutes": item.get("turnaround_minutes", 30),
            "maintenance": json.dumps(item.get("maintenance") or []),
            "archived": bool(item.get("archived", False)),
        }
        if row:
            for key, value in payload.items():
                setattr(row, key, value)
        else:
            db.add(AircraftRow(id=item["id"], **payload))
    live_crew = {r.id: r for r in db.query(PersonnelRow).all()}
    for item in snap.get("personnel") or []:
        row = live_crew.get(item["id"])
        payload = {
            "role": item.get("role", "Operator"),
            "qualifications": json.dumps(item.get("qualifications") or []),
            "qualification_expiry": json.dumps(item.get("qualification_expiry") or {}),
            "available_from": item.get("available_from", 0),
            "available_until": item.get("available_until", 1440),
            "max_duty_minutes": item.get("max_duty_minutes", 600),
            "used_duty_minutes": item.get("used_duty_minutes", 0),
            "min_rest_minutes": item.get("min_rest_minutes", 30),
            "archived": bool(item.get("archived", False)),
        }
        if row:
            for key, value in payload.items():
                setattr(row, key, value)
        else:
            db.add(PersonnelRow(id=item["id"], **payload))
    live_tasks = {r.id: r for r in db.query(TaskRow).all()}
    for item in snap.get("tasks") or []:
        row = live_tasks.get(item["id"])
        payload = {
            "title": item.get("title", item["id"]),
            "category": item.get("category", "Training and evaluation"),
            "priority": item.get("priority", 3),
            "release": item.get("release", 0),
            "earliest_start": item.get("earliest_start", 0),
            "latest_finish": item.get("latest_finish", 1440),
            "duration": item.get("duration", 60),
            "capabilities": json.dumps(item.get("capabilities") or []),
            "qualifications": json.dumps(item.get("qualifications") or []),
            "dependencies": json.dumps(item.get("dependencies") or []),
            "support_units": item.get("support_units", 1),
            "status": item.get("status", "pending"),
            "previous_aircraft_id": item.get("previous_aircraft_id"),
            "archived": bool(item.get("archived", False)),
        }
        if row:
            for key, value in payload.items():
                setattr(row, key, value)
        else:
            db.add(TaskRow(id=item["id"], **payload))
    db.query(AssignmentRow).delete()
    assigned = {a.task_id for a in assignments}
    for task_row in db.query(TaskRow).filter_by(archived=False).all():
        if task_row.status not in ("cancelled", "completed"):
            task_row.status = "scheduled" if task_row.id in assigned else "pending"
    for a in assignments:
        db.add(AssignmentRow(schedule_version=run_id, task_id=a.task_id, aircraft_id=a.aircraft_id, crew_id=a.crew_id, start=a.start, finish=a.finish, explanation=json.dumps(list(a.explanation))))
