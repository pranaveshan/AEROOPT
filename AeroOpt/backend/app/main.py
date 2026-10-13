from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json, uuid, hashlib
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session
from sqlalchemy import func
from .db import Base, engine, get_db
from .models import AircraftRow, PersonnelRow, TaskRow, AssignmentRow, SolverRunRow, AuditRow
from .seed import seed
from .optimization.types import Aircraft, Crew, Task, PlanningInput, Assignment
from .optimization.engine import solve_greedy, solve_cp_sat, validate_schedule, canonical_hash
from .services.audit import append_event, verify_chain

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with next(get_db()) as db: seed(db)
    yield
app=FastAPI(title="AeroOpt API",version="0.1.0",description="Synthetic human-in-the-loop aviation scheduling prototype",lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:5173","http://127.0.0.1:5173"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

def decode(s):
    try:return json.loads(s)
    except:return []

def serialize_aircraft(r): return {"id":r.id,"type":r.type,"capabilities":decode(r.capabilities),"home_facility":r.home_facility,"status":r.status,"available_from":r.available_from,"available_until":r.available_until,"max_flight_minutes":r.max_flight_minutes,"used_flight_minutes":r.used_flight_minutes,"turnaround_minutes":r.turnaround_minutes,"maintenance":decode(r.maintenance),"archived":r.archived}
def serialize_crew(r): return {"id":r.id,"role":r.role,"qualifications":decode(r.qualifications),"qualification_expiry":decode(r.qualification_expiry),"available_from":r.available_from,"available_until":r.available_until,"max_duty_minutes":r.max_duty_minutes,"used_duty_minutes":r.used_duty_minutes,"min_rest_minutes":r.min_rest_minutes,"archived":r.archived}
def serialize_task(r): return {"id":r.id,"title":r.title,"category":r.category,"priority":r.priority,"release":r.release,"earliest_start":r.earliest_start,"latest_finish":r.latest_finish,"duration":r.duration,"capabilities":decode(r.capabilities),"qualifications":decode(r.qualifications),"dependencies":decode(r.dependencies),"support_units":r.support_units,"status":r.status,"previous_aircraft_id":r.previous_aircraft_id,"archived":r.archived}
def to_planning(db, stability=0):
    ars=[r for r in db.query(AircraftRow).filter_by(archived=False).all()]; crs=[r for r in db.query(PersonnelRow).filter_by(archived=False).all()]; trs=[r for r in db.query(TaskRow).filter_by(archived=False).all()]
    aircraft=tuple(Aircraft(r.id,frozenset(decode(r.capabilities)),r.status=="serviceable",r.available_from,r.available_until,r.max_flight_minutes,r.used_flight_minutes,r.turnaround_minutes,tuple(tuple(x) for x in decode(r.maintenance))) for r in ars)
    crew=tuple(Crew(r.id,frozenset(decode(r.qualifications)),r.available_from,r.available_until,r.max_duty_minutes,r.used_duty_minutes,r.min_rest_minutes,tuple(decode(r.qualification_expiry).items())) for r in crs)
    saved_assignments=db.query(AssignmentRow).order_by(AssignmentRow.id.asc()).all()
    previous_aircraft={x.task_id:x.aircraft_id for x in saved_assignments}
    tasks=tuple(Task(r.id,r.category,r.priority,r.release,r.earliest_start,r.latest_finish,r.duration,frozenset(decode(r.capabilities)),frozenset(decode(r.qualifications)),r.status,tuple(decode(r.dependencies)),r.support_units,r.previous_aircraft_id or previous_aircraft.get(r.id)) for r in trs)
    return PlanningInput(aircraft,crew,tasks,support_capacity=2,weather_restrictions=((780,810),),horizon_minutes=1440,stability_weight=stability,seed=42)

def serialize_assignment(a):return {"task_id":a.task_id,"aircraft_id":a.aircraft_id,"crew_id":a.crew_id,"start":a.start,"finish":a.finish,"explanation":list(a.explanation)}
def result_dict(r):return {"status":r.status,"assignments":[serialize_assignment(a) for a in r.assignments],"unassigned":r.unassigned,"objective_components":r.objective_components,"objective":r.objective,"best_bound":r.best_bound,"wall_time_seconds":round(r.wall_time_seconds,6),"solver":r.solver,"input_hash":r.input_hash,"validation":r.validation}

class AircraftIn(BaseModel):
    id:str; type:str="Utility"; capabilities:list[str]=[]; home_facility:str="NORTH FIELD"; status:str="serviceable"; available_from:int=0; available_until:int=1440; max_flight_minutes:int=600; used_flight_minutes:int=0; turnaround_minutes:int=30; maintenance:list[list[int]]=[]; archived:bool=False
    @model_validator(mode="after")
    def windows(self):
        if self.available_from<0 or self.available_until<=self.available_from or self.max_flight_minutes<0 or self.used_flight_minutes<0 or self.turnaround_minutes<0: raise ValueError("Invalid availability or capacity values")
        if any(len(x)!=2 or x[0]<0 or x[1]<=x[0] for x in self.maintenance): raise ValueError("Maintenance intervals must be [start, finish) with finish > start")
        return self
class CrewIn(BaseModel):
    id:str; role:str="Operator"; qualifications:list[str]=[]; qualification_expiry:dict[str,int]={}; available_from:int=0; available_until:int=1440; max_duty_minutes:int=600; used_duty_minutes:int=0; min_rest_minutes:int=30; archived:bool=False
    @model_validator(mode="after")
    def valid(self):
        if self.available_from<0 or self.available_until<=self.available_from or min(self.max_duty_minutes,self.used_duty_minutes,self.min_rest_minutes)<0: raise ValueError("Invalid crew window or duty limits")
        return self
class TaskIn(BaseModel):
    id:str; title:str; category:str="Training and evaluation"; priority:int=3; release:int=0; earliest_start:int=0; latest_finish:int=1440; duration:int=60; capabilities:list[str]=[]; qualifications:list[str]=[]; dependencies:list[str]=[]; support_units:int=1; status:str="pending"; previous_aircraft_id:str|None=None; archived:bool=False
    @model_validator(mode="after")
    def valid(self):
        if not 1<=self.priority<=5 or min(self.release,self.earliest_start,self.duration,self.support_units)<0 or self.latest_finish<=max(self.release,self.earliest_start) or self.duration<=0: raise ValueError("Invalid task priority, duration, or time window")
        if self.earliest_start<self.release: raise ValueError("Earliest start cannot precede release")
        if self.earliest_start+self.duration>self.latest_finish: raise ValueError("Task cannot fit in its window")
        return self

@app.get("/api/v1/health")
def health():return {"status":"ok","synthetic_data":True}
@app.get("/api/v1/dashboard")
def dashboard(db:Session=Depends(get_db)):
    aircraft=db.query(AircraftRow).filter_by(archived=False).all(); crew=db.query(PersonnelRow).filter_by(archived=False).all(); tasks=db.query(TaskRow).filter_by(archived=False).all(); latest=db.query(SolverRunRow).order_by(SolverRunRow.created_at.desc()).first(); latest_assign=db.query(AssignmentRow).all()
    assigned={x.task_id for x in latest_assign}; pending=[t for t in tasks if t.status=="pending"]
    return {"synthetic":True,"schedule_version":latest_assign[-1].schedule_version if latest_assign else "SEED-0","aircraft":{"total":len(aircraft),"serviceable":sum(a.status=="serviceable" for a in aircraft),"grounded":sum(a.status!="serviceable" for a in aircraft)},"personnel":{"total":len(crew),"available":sum(c.available_until>0 for c in crew)},"tasks":{"total":len(tasks),"pending":len(pending),"scheduled":sum(t.status=="scheduled" for t in tasks),"unassigned":sum(t.status=="pending" and t.id not in assigned for t in tasks),"completed":sum(t.status=="completed" for t in tasks),"cancelled":sum(t.status=="cancelled" for t in tasks)},"completion_rate":round(100*sum(t.status=="completed" for t in tasks)/len(tasks),1) if tasks else 0,"completion_denominator":"completed tasks / all non-archived tasks","recent_run":{"id":latest.id,"status":latest.status,"solver":latest.solver,"duration_seconds":latest.duration_seconds} if latest else None,"latest_assignments":[{"task_id":x.task_id,"aircraft_id":x.aircraft_id,"crew_id":x.crew_id,"start":x.start,"finish":x.finish} for x in latest_assign]}

@app.get("/api/v1/aircraft")
def list_aircraft(include_archived:bool=False,db:Session=Depends(get_db)):
    q=db.query(AircraftRow); return [serialize_aircraft(x) for x in q.filter(AircraftRow.archived==include_archived).all()]
@app.post("/api/v1/aircraft",status_code=201)
def create_aircraft(payload:AircraftIn,db:Session=Depends(get_db)):
    if db.get(AircraftRow,payload.id): raise HTTPException(409,"Aircraft ID already exists")
    d=payload.model_dump(); d["capabilities"]=json.dumps(d["capabilities"]); d["maintenance"]=json.dumps(d["maintenance"]); row=AircraftRow(**d); db.add(row); append_event(db,"AIRCRAFT_CREATED",row.id,payload.model_dump()); db.commit(); return serialize_aircraft(row)
@app.put("/api/v1/aircraft/{item_id}")
def update_aircraft(item_id:str,payload:AircraftIn,db:Session=Depends(get_db)):
    row=db.get(AircraftRow,item_id)
    if not row: raise HTTPException(404,"Aircraft not found")
    before=serialize_aircraft(row); d=payload.model_dump(); d.pop("id")
    for k,v in d.items():setattr(row,k,json.dumps(v) if k in ("capabilities","maintenance") else v)
    append_event(db,"AIRCRAFT_UPDATED",item_id,{"before":before,"after":payload.model_dump()}); db.commit(); return serialize_aircraft(row)
@app.delete("/api/v1/aircraft/{item_id}")
def archive_aircraft(item_id:str,db:Session=Depends(get_db)):
    row=db.get(AircraftRow,item_id)
    if not row:raise HTTPException(404,"Aircraft not found")
    row.archived=True; append_event(db,"AIRCRAFT_ARCHIVED",item_id,{}); db.commit(); return {"archived":True,"id":item_id}
@app.post("/api/v1/aircraft/{item_id}/restore")
def restore_aircraft(item_id:str,db:Session=Depends(get_db)):
    row=db.get(AircraftRow,item_id)
    if not row:raise HTTPException(404,"Aircraft not found")
    row.archived=False; append_event(db,"AIRCRAFT_RESTORED",item_id,{}); db.commit(); return serialize_aircraft(row)

@app.get("/api/v1/personnel")
def list_personnel(include_archived:bool=False,db:Session=Depends(get_db)):return [serialize_crew(x) for x in db.query(PersonnelRow).filter(PersonnelRow.archived==include_archived).all()]
@app.post("/api/v1/personnel",status_code=201)
def create_personnel(payload:CrewIn,db:Session=Depends(get_db)):
    if db.get(PersonnelRow,payload.id):raise HTTPException(409,"Personnel ID already exists")
    d=payload.model_dump(); d["qualifications"]=json.dumps(d["qualifications"]); d["qualification_expiry"]=json.dumps(d["qualification_expiry"]); row=PersonnelRow(**d); db.add(row); append_event(db,"PERSONNEL_CREATED",row.id,payload.model_dump()); db.commit(); return serialize_crew(row)
@app.put("/api/v1/personnel/{item_id}")
def update_personnel(item_id:str,payload:CrewIn,db:Session=Depends(get_db)):
    row=db.get(PersonnelRow,item_id)
    if not row:raise HTTPException(404,"Personnel not found")
    before=serialize_crew(row); d=payload.model_dump(); d.pop("id")
    for k,v in d.items():setattr(row,k,json.dumps(v) if k in ("qualifications","qualification_expiry") else v)
    append_event(db,"PERSONNEL_UPDATED",item_id,{"before":before,"after":payload.model_dump()}); db.commit(); return serialize_crew(row)
@app.delete("/api/v1/personnel/{item_id}")
def archive_personnel(item_id:str,db:Session=Depends(get_db)):
    row=db.get(PersonnelRow,item_id)
    if not row:raise HTTPException(404,"Personnel not found")
    row.archived=True; append_event(db,"PERSONNEL_ARCHIVED",item_id,{}); db.commit(); return {"archived":True,"id":item_id}
@app.post("/api/v1/personnel/{item_id}/restore")
def restore_personnel(item_id:str,db:Session=Depends(get_db)):
    row=db.get(PersonnelRow,item_id)
    if not row:raise HTTPException(404,"Personnel not found")
    row.archived=False; append_event(db,"PERSONNEL_RESTORED",item_id,{}); db.commit(); return serialize_crew(row)

@app.get("/api/v1/tasks")
def list_tasks(include_archived:bool=False,db:Session=Depends(get_db)):return [serialize_task(x) for x in db.query(TaskRow).filter(TaskRow.archived==include_archived).all()]
def check_dependencies(db,payload):
    known={x.id for x in db.query(TaskRow).all()}
    missing=set(payload.dependencies)-known
    if missing:raise HTTPException(422,detail={"message":"Unknown dependencies","ids":sorted(missing)})
    graph={x.id:decode(x.dependencies) for x in db.query(TaskRow).all()}; graph[payload.id]=payload.dependencies
    def visit(n,path):
        if n in path: return True
        return any(visit(d,path|{n}) for d in graph.get(n,[]) if d in graph)
    if visit(payload.id,set()):raise HTTPException(422,"Task dependency cycle detected")
@app.post("/api/v1/tasks",status_code=201)
def create_task(payload:TaskIn,db:Session=Depends(get_db)):
    if db.get(TaskRow,payload.id):raise HTTPException(409,"Task ID already exists")
    check_dependencies(db,payload); d=payload.model_dump()
    for k in ("capabilities","qualifications","dependencies"):d[k]=json.dumps(d[k])
    row=TaskRow(**d); db.add(row); append_event(db,"TASK_CREATED",row.id,payload.model_dump()); db.commit(); return serialize_task(row)
@app.put("/api/v1/tasks/{item_id}")
def update_task(item_id:str,payload:TaskIn,db:Session=Depends(get_db)):
    row=db.get(TaskRow,item_id)
    if not row:raise HTTPException(404,"Task not found")
    check_dependencies(db,payload); before=serialize_task(row); d=payload.model_dump(); d.pop("id")
    for k,v in d.items():setattr(row,k,json.dumps(v) if k in ("capabilities","qualifications","dependencies") else v)
    append_event(db,"TASK_UPDATED",item_id,{"before":before,"after":payload.model_dump()}); db.commit(); return serialize_task(row)
@app.post("/api/v1/tasks/{item_id}/cancel")
def cancel_task(item_id:str,db:Session=Depends(get_db)):
    row=db.get(TaskRow,item_id)
    if not row:raise HTTPException(404,"Task not found")
    row.status="cancelled"; append_event(db,"TASK_CANCELLED",item_id,{}); db.commit(); return serialize_task(row)

class SolveRequest(BaseModel):solver:str="cp-sat"; time_limit_seconds:float=5; stability_weight:int=0
@app.post("/api/v1/schedule/solve")
def solve(req:SolveRequest,db:Session=Depends(get_db)):
    data=to_planning(db,req.stability_weight); result=solve_greedy(data) if req.solver=="greedy" else solve_cp_sat(data,req.time_limit_seconds)
    run_id=str(uuid.uuid4())[:8].upper(); output={"status":result.status,"assignments":[serialize_assignment(x) for x in result.assignments],"unassigned":result.unassigned,"objective_components":result.objective_components,"objective":result.objective,"best_bound":result.best_bound,"solver":result.solver,"validation":result.validation}
    output_hash=hashlib.sha256(json.dumps(output,sort_keys=True).encode()).hexdigest()
    row=SolverRunRow(id=run_id,solver=result.solver,status=result.status,duration_seconds=result.wall_time_seconds,input_hash=result.input_hash,output_hash=output_hash,result_json=json.dumps(output,sort_keys=True)); db.add(row); append_event(db,"SOLVER_RUN",run_id,{"solver":result.solver,"status":result.status,"input_hash":result.input_hash,"output_hash":output_hash}); db.commit()
    return {"run_id":run_id,**result_dict(result),"output_hash":output_hash,"approval_required":True}
@app.get("/api/v1/schedule")
def schedule(db:Session=Depends(get_db)):
    saved=db.query(AssignmentRow).order_by(AssignmentRow.start.asc()).all()
    if not saved:return {"schedule_version":"SEED-0","assignments":[],"status":"NOT_APPLIED"}
    version=saved[0].schedule_version
    run=db.get(SolverRunRow,version)
    return {"schedule_version":version,"status":"APPLIED","assignments":[{"task_id":x.task_id,"aircraft_id":x.aircraft_id,"crew_id":x.crew_id,"start":x.start,"finish":x.finish,"explanation":decode(x.explanation)} for x in saved],"unassigned":json.loads(run.result_json).get("unassigned",{}) if run else {}}
@app.post("/api/v1/schedule/apply")
def apply_schedule(payload:dict,db:Session=Depends(get_db)):
    run=db.get(SolverRunRow,payload.get("run_id"))
    if not run:raise HTTPException(404,"Run not found")
    if payload.get("approved") is not True:raise HTTPException(400,"Explicit human approval is required")
    data=json.loads(run.result_json)
    if data.get("status") not in ("OPTIMAL","FEASIBLE") or not data.get("validation",{}).get("valid"):raise HTTPException(409,"Only independently validated feasible schedules can be applied")
    # Revalidate against current state to prevent stale proposal application.
    planning=to_planning(db); items=[Assignment(a["task_id"],a["aircraft_id"],a["crew_id"],a["start"],a["finish"],tuple(a.get("explanation",[]))) for a in data["assignments"]]; validation=validate_schedule(planning,items)
    if not validation["valid"]:raise HTTPException(409,detail={"message":"Schedule no longer validates","validation":validation})
    db.query(AssignmentRow).delete();
    assigned_ids={a.task_id for a in items}
    for task_row in db.query(TaskRow).filter_by(archived=False).all():
        if task_row.status not in ("cancelled","completed"):
            task_row.status="scheduled" if task_row.id in assigned_ids else "pending"
    for a in items:db.add(AssignmentRow(schedule_version=run.id,task_id=a.task_id,aircraft_id=a.aircraft_id,crew_id=a.crew_id,start=a.start,finish=a.finish,explanation=json.dumps(a.explanation)))
    append_event(db,"SCHEDULE_APPROVED",run.id,{"output_hash":run.output_hash,"assignments":len(items)}); db.commit(); return {"applied":True,"run_id":run.id,"assignments":len(items),"validation":validation}
@app.post("/api/v1/schedule/validate")
def validate(payload:dict,db:Session=Depends(get_db)):
    data=to_planning(db); items=[Assignment(**{**a,"explanation":tuple(a.get("explanation",[]))}) for a in payload.get("assignments",[])]; return validate_schedule(data,items)
@app.get("/api/v1/runs")
def runs(db:Session=Depends(get_db)):
    return [{"id":r.id,"created_at":r.created_at.isoformat() if r.created_at else None,"solver":r.solver,"status":r.status,"duration_seconds":r.duration_seconds,"input_hash":r.input_hash,"output_hash":r.output_hash} for r in db.query(SolverRunRow).order_by(SolverRunRow.created_at.desc()).limit(50).all()]
@app.get("/api/v1/audit")
def audit(db:Session=Depends(get_db)):
    return [{"id":r.id,"created_at":r.created_at.isoformat() if r.created_at else None,"actor":r.actor,"action":r.action,"entity_id":r.entity_id,"payload":json.loads(r.payload),"previous_hash":r.previous_hash,"event_hash":r.event_hash} for r in db.query(AuditRow).order_by(AuditRow.id.desc()).limit(100).all()]
@app.get("/api/v1/audit/verify")
def audit_verify(db:Session=Depends(get_db)):return verify_chain(db)

@app.get("/api/v1/eligibility/{task_id}")
def eligibility(task_id:str,db:Session=Depends(get_db)):
    data=to_planning(db); t=next((t for t in data.tasks if t.id==task_id),None)
    if not t:raise HTTPException(404,"Task not found")
    out=[]
    from .optimization.engine import eligibility_reasons
    for a in data.aircraft:
        for c in data.crew:
            reasons=eligibility_reasons(t,a,c,data,max(t.release,t.earliest_start)); out.append({"aircraft_id":a.id,"crew_id":c.id,"eligible":not reasons,"rejection_reasons":reasons})
    return {"task_id":task_id,"combinations":out}

@app.post("/api/v1/disruptions")
def disruption(payload:dict,db:Session=Depends(get_db)):
    kind=payload.get("type"); item=payload.get("resource_id")
    if kind=="aircraft_grounded":
        row=db.get(AircraftRow,item)
        if not row:raise HTTPException(404,"Aircraft not found")
        before=serialize_aircraft(row); row.status="grounded"; append_event(db,"DISRUPTION_AIRCRAFT_GROUNDED",item,{"before":before})
    elif kind=="maintenance_extended":
        row=db.get(AircraftRow,item)
        if not row:raise HTTPException(404,"Aircraft not found")
        intervals=decode(row.maintenance); intervals.append([int(payload.get("start",600)),int(payload.get("finish",720))]); row.maintenance=json.dumps(intervals); append_event(db,"DISRUPTION_MAINTENANCE_EXTENDED",item,{"maintenance":intervals})
    elif kind=="crew_unavailable":
        row=db.get(PersonnelRow,item)
        if not row:raise HTTPException(404,"Personnel not found")
        row.available_until=min(row.available_until,int(payload.get("until",360))); append_event(db,"DISRUPTION_CREW_UNAVAILABLE",item,{"available_until":row.available_until})
    elif kind=="task_added":
        d=payload.get("task",{}); validated=TaskIn(**d)
        if db.get(TaskRow,validated.id):raise HTTPException(409,"Task ID already exists")
        dd=validated.model_dump()
        for k in ("capabilities","qualifications","dependencies"):dd[k]=json.dumps(dd[k])
        db.add(TaskRow(**dd)); append_event(db,"DISRUPTION_TASK_ADDED",validated.id,validated.model_dump())
    else:raise HTTPException(422,"Supported demo disruptions: aircraft_grounded, maintenance_extended, crew_unavailable, task_added")
    db.commit(); return {"applied_to_saved_data":True,"disruption":kind,"message":"Disruption persisted; run a new solve to inspect the proposal. Human approval is still required to apply assignments."}

@app.get("/api/v1/scenarios")
def scenarios():return {"implemented":False,"message":"Scenario fork/apply isolation is not yet implemented; no scenario mode is exposed as saved data."}
@app.get("/api/v1/analytics/benchmarks")
def benchmarks():return {"status":"NOT_EXECUTED","reason":"This environment has no package-network access; CP-SAT benchmark execution requires installing pinned dependencies.","synthetic":True}
