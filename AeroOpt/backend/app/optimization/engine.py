"""Deterministic baseline and optional OR-Tools CP-SAT optimizer.

Time is integer minutes from a synthetic horizon origin. Intervals are half-open
[start, finish); adjacent tasks do not overlap. Usage limits apply to historical
usage plus task duration inside the planning horizon. This prototype supports
one crew member and one aircraft per task; multi-person crew is a documented gap.
"""
from __future__ import annotations
import hashlib, json, time
from dataclasses import asdict
from .types import PlanningInput, Task, Aircraft, Crew, Assignment, SolveResult

def canonical_hash(value) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), default=lambda o: asdict(o) if hasattr(o, "__dataclass_fields__") else sorted(o) if isinstance(o, frozenset) else str(o))
    return hashlib.sha256(raw.encode()).hexdigest()

def _overlap(a: int, b: int, c: int, d: int) -> bool:
    return a < d and c < b

def eligibility_reasons(task: Task, aircraft: Aircraft, crew: Crew, data: PlanningInput, start: int | None = None) -> list[str]:
    reasons=[]; s=task.earliest_start if start is None else start; e=s+task.duration
    if not aircraft.serviceable: reasons.append("AIRCRAFT_UNSERVICEABLE")
    if not task.capabilities.issubset(aircraft.capabilities): reasons.append("CAPABILITY_MISMATCH")
    if s < aircraft.available_from or e > aircraft.available_until: reasons.append("AIRCRAFT_UNAVAILABLE")
    if aircraft.used_flight_minutes + task.duration > aircraft.max_flight_minutes: reasons.append("CUMULATIVE_FLIGHT_LIMIT")
    if any(_overlap(s,e,a,b) for a,b in aircraft.maintenance): reasons.append("MAINTENANCE_OVERLAP")
    if not task.qualifications.issubset(crew.qualifications): reasons.append("QUALIFICATION_MISSING")
    expiry=dict(crew.qualification_expiry)
    if any(q in expiry and e > expiry[q] for q in task.qualifications): reasons.append("QUALIFICATION_EXPIRED")
    if s < crew.available_from or e > crew.available_until: reasons.append("CREW_UNAVAILABLE")
    if crew.used_duty_minutes + task.duration > crew.max_duty_minutes: reasons.append("DUTY_LIMIT_EXCEEDED")
    if e > task.latest_finish: reasons.append("DEADLINE_INFEASIBLE")
    if s < task.release or s < task.earliest_start: reasons.append("RELEASE_OR_WINDOW_VIOLATION")
    if any(_overlap(s,e,a,b) for a,b in data.weather_restrictions): reasons.append("WEATHER_RESTRICTION")
    if task.support_units > data.support_capacity: reasons.append("SUPPORT_CAPACITY_EXCEEDED")
    if e > data.horizon_minutes: reasons.append("OUTSIDE_PLANNING_HORIZON")
    return reasons

def validate_schedule(data: PlanningInput, assignments: list[Assignment]) -> dict:
    errors=[]; tasks={t.id:t for t in data.tasks}; aircraft={a.id:a for a in data.aircraft}; crew={c.id:c for c in data.crew}
    seen=set(); aircraft_intervals={k:[] for k in aircraft}; crew_intervals={k:[] for k in crew}; support=[]; finishes={}
    for x in assignments:
        t=tasks.get(x.task_id)
        if not t: errors.append(f"UNKNOWN_TASK:{x.task_id}"); continue
        if x.task_id in seen: errors.append(f"DUPLICATE_TASK:{x.task_id}")
        seen.add(x.task_id)
        if x.aircraft_id not in aircraft or x.crew_id not in crew: errors.append(f"UNKNOWN_RESOURCE:{x.task_id}"); continue
        if x.finish-x.start != t.duration: errors.append(f"DURATION_MISMATCH:{x.task_id}")
        reasons=eligibility_reasons(t, aircraft[x.aircraft_id], crew[x.crew_id], data, x.start)
        errors.extend(f"{r}:{x.task_id}" for r in reasons)
        for a,b,other in aircraft_intervals[x.aircraft_id]:
            if _overlap(x.start,x.finish,a,b) or (x.start >= b and x.start < b+aircraft[x.aircraft_id].turnaround_minutes): errors.append(f"AIRCRAFT_CONFLICT:{other}:{x.task_id}")
        for a,b,other in crew_intervals[x.crew_id]:
            if _overlap(x.start,x.finish,a,b) or (x.start >= b and x.start < b+crew[x.crew_id].min_rest_minutes): errors.append(f"CREW_CONFLICT:{other}:{x.task_id}")
        aircraft_intervals[x.aircraft_id].append((x.start,x.finish,x.task_id)); crew_intervals[x.crew_id].append((x.start,x.finish,x.task_id)); support.append((x.start,x.finish,t.support_units,x.task_id)); finishes[x.task_id]=x.finish
    for t in data.tasks:
        if t.id in seen:
            for dep in t.dependencies:
                if dep not in finishes: errors.append(f"DEPENDENCY_UNASSIGNED:{dep}:{t.id}")
                elif next((a.start for a in assignments if a.task_id==t.id), 0) < finishes.get(dep,0): errors.append(f"DEPENDENCY_ORDER:{dep}:{t.id}")
    # Evaluate support capacity at every event boundary (half-open intervals).
    points=sorted({v for s,e,u,_ in support for v in (s,e)})
    for p in points:
        used=sum(u for s,e,u,_ in support if s <= p < e)
        if used > data.support_capacity: errors.append(f"SUPPORT_OVERLOAD:{p}:{used}")
    return {"valid": not errors, "errors": sorted(set(errors)), "assigned_count":len(seen), "unassigned_count":len(data.tasks)-len(seen)}

def _explain(task, aircraft, crew):
    return (f"Aircraft {aircraft.id} satisfies capabilities", f"Crew {crew.id} satisfies qualifications", "Availability and interval checks passed", "Synthetic schedule; human approval required")

def solve_greedy(data: PlanningInput) -> SolveResult:
    started=time.perf_counter(); assigned=[]; reasons={}; a_used={a.id:[] for a in data.aircraft}; c_used={c.id:[] for c in data.crew}; support_events=[]; finish={}
    tasks=sorted(data.tasks, key=lambda t:(-t.priority,t.latest_finish,t.release,t.id))
    for t in tasks:
        if t.status not in ("pending","scheduled"): reasons[t.id]=["TASK_STATUS_NOT_SCHEDULABLE"]; continue
        missing=[d for d in t.dependencies if d not in finish]
        if missing: reasons[t.id]=[f"DEPENDENCY_UNAVAILABLE:{d}" for d in missing]; continue
        earliest=max(t.release,t.earliest_start,max((finish[d] for d in t.dependencies),default=0))
        candidates=[]
        for a in sorted(data.aircraft,key=lambda z:z.id):
            for c in sorted(data.crew,key=lambda z:z.id):
                starts={earliest}
                starts.update(e+max(a.turnaround_minutes,c.min_rest_minutes) for _,e,_ in a_used[a.id])
                starts.update(e+c.min_rest_minutes for _,e,_ in c_used[c.id])
                starts.update(e for _,e,_,_ in support_events)
                for s in sorted(x for x in starts if x>=earliest):
                    e=s+t.duration
                    if e>t.latest_finish: continue
                    if eligibility_reasons(t,a,c,data,s): continue
                    if any(_overlap(s,e,x,y) for x,y,_ in a_used[a.id]) or any(_overlap(s,e,x,y) for x,y,_ in c_used[c.id]): continue
                    if any(s < y+a.turnaround_minutes and s>=y for x,y,_ in a_used[a.id]): continue
                    if any(s < y+c.min_rest_minutes and s>=y for x,y,_ in c_used[c.id]): continue
                    if any(_overlap(s,e,x,y) and sum(u for x2,y2,u,_ in support_events if _overlap(max(s,x2),min(e,y2),x2,y2))+t.support_units>data.support_capacity for x,y,_,_ in support_events): continue
                    if t.support_units>data.support_capacity: continue
                    if any(_overlap(s,e,x,y) for x,y in data.weather_restrictions): continue
                    candidates.append((s + data.stability_weight*10*(1 if t.previous_aircraft_id and a.id!=t.previous_aircraft_id else 0), s, 0 if a.id==t.previous_aircraft_id else 1, a.id,c.id,a,c))
        if not candidates:
            possible=[]
            for a in data.aircraft:
                for c in data.crew:
                    possible.extend(eligibility_reasons(t,a,c,data,earliest))
            reasons[t.id]=sorted(set(possible)) or ["NO_NONCONFLICTING_RESOURCE_WINDOW"]
            continue
        _,s,_,_,_,a,c=min(candidates,key=lambda z:(z[0],z[1],z[2],z[3],z[4])); e=s+t.duration
        assigned.append(Assignment(t.id,a.id,c.id,s,e,_explain(t,a,c))); a_used[a.id].append((s,e,t.id)); c_used[c.id].append((s,e,t.id)); support_events.append((s,e,t.support_units,t.id)); finish[t.id]=e
    validation=validate_schedule(data,assigned)
    if not validation["valid"]: status="UNKNOWN"
    else: status="FEASIBLE"
    total_delay=sum(max(0,x.start-t.earliest_start) for x in assigned); weighted=sum(next(t.priority for t in data.tasks if t.id==x.task_id) for x in assigned)
    return SolveResult(status,assigned,reasons,{"assigned_priority_weight":weighted,"total_delay_minutes":total_delay,"unassigned_priority_weight":sum(t.priority for t in data.tasks if t.id not in finish),"assignment_changes":sum(1 for x in assigned if next(t for t in data.tasks if t.id==x.task_id).previous_aircraft_id and x.aircraft_id!=next(t for t in data.tasks if t.id==x.task_id).previous_aircraft_id)},None,None,time.perf_counter()-started,"deterministic-greedy-v1",canonical_hash(data),validation)

def solve_cp_sat(data: PlanningInput, time_limit_seconds: float=5.0) -> SolveResult:
    """CP-SAT interval assignment model. Requires optional OR-Tools dependency."""
    started=time.perf_counter()
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return SolveResult("UNKNOWN",unassigned={t.id:["ORTOOLS_NOT_INSTALLED"] for t in data.tasks},wall_time_seconds=time.perf_counter()-started,solver="cp-sat-unavailable",input_hash=canonical_hash(data),validation={"valid":False,"errors":["OR-Tools is not installed; CP-SAT was not executed"]})
    model=cp_model.CpModel(); tasks=[t for t in data.tasks if t.status in ("pending","scheduled")]; horizon=data.horizon_minutes
    x={}; starts={}; ends={}; intervals_by_aircraft={a.id:[] for a in data.aircraft}; intervals_by_crew={c.id:[] for c in data.crew}; unassigned={}
    for t in tasks:
        choices=[]
        for a in data.aircraft:
            for c in data.crew:
                if eligibility_reasons(t,a,c,data,max(t.release,t.earliest_start)): continue
                key=(t.id,a.id,c.id); lit=model.NewBoolVar("x_"+"_".join(key)); s=model.NewIntVar(max(t.release,t.earliest_start),min(horizon-t.duration,t.latest_finish-t.duration),"s_"+"_".join(key)); e=model.NewIntVar(0,horizon,"e_"+"_".join(key)); iv=model.NewOptionalIntervalVar(s,t.duration,e,lit,"iv_"+"_".join(key)); x[key]=lit; starts[key]=s; ends[key]=e; choices.append(lit); intervals_by_aircraft[a.id].append(iv); intervals_by_crew[c.id].append(iv)
        u=model.NewBoolVar("unassigned_"+t.id); unassigned[t.id]=u; model.Add(sum(choices)+u==1)
    for res,ivs in intervals_by_aircraft.items():
        if ivs: model.AddNoOverlap(ivs)
    for res,ivs in intervals_by_crew.items():
        if ivs: model.AddNoOverlap(ivs)
    # Dependencies constrain selected task starts after selected predecessor finishes.
    byid={t.id:t for t in tasks}
    for t in tasks:
        for dep in t.dependencies:
            if dep not in byid: continue
            for key,lit in x.items():
                if key[0]==t.id:
                    for pkey,plit in x.items():
                        if pkey[0]==dep: model.Add(starts[key]>=ends[pkey]).OnlyEnforceIf([lit,plit])
                    model.Add(lit<=1-unassigned[dep])
    # Support capacity: pairwise cumulative capacity is handled conservatively by
    # pairwise exclusion when combined demand exceeds capacity.
    keys=list(x)
    for i,k in enumerate(keys):
        ti=byid[k[0]]
        for j in range(i+1,len(keys)):
            kj=keys[j]; tj=byid[kj[0]]
            if ti.id==tj.id or ti.support_units+tj.support_units<=data.support_capacity: continue
            both=[x[k],x[kj]]
            model.Add(ends[k]<=starts[kj]).OnlyEnforceIf(both)
            model.Add(ends[kj]<=starts[k]).OnlyEnforceIf(both)
    # Hard weather exclusion by forbidding start times that overlap restriction.
    for key,lit in x.items():
        t=byid[key[0]]
        for ws,we in data.weather_restrictions:
            if t.duration>we-ws: model.Add(lit==0)
            else:
                # Forbid interval overlap by choosing before or after the restriction.
                before=model.NewBoolVar(f"before_{key[0]}_{key[1]}_{key[2]}_{ws}")
                model.Add(ends[key]<=ws).OnlyEnforceIf([lit,before])
                model.Add(starts[key]>=we).OnlyEnforceIf([lit,before.Not()])
    weighted_unassigned=sum(unassigned[t.id]*t.priority*10000 for t in tasks)
    delay_terms=[]; stability_terms=[]
    for key,lit in x.items():
        t=byid[key[0]]; delay=model.NewIntVar(0,horizon,"delay_"+"_".join(key)); model.Add(delay==starts[key]-max(t.release,t.earliest_start)).OnlyEnforceIf(lit); model.Add(delay==0).OnlyEnforceIf(lit.Not()); delay_terms.append(delay)
        if t.previous_aircraft_id and key[1] != t.previous_aircraft_id and data.stability_weight > 0:
            stability_terms.append(lit * (data.stability_weight * 10))
    model.Minimize(weighted_unassigned+sum(delay_terms)+sum(stability_terms))
    solver=cp_model.CpSolver(); solver.parameters.max_time_in_seconds=max(.1,time_limit_seconds); solver.parameters.num_search_workers=1; solver.parameters.random_seed=data.seed
    status_code=solver.Solve(model); status={cp_model.OPTIMAL:"OPTIMAL",cp_model.FEASIBLE:"FEASIBLE",cp_model.INFEASIBLE:"INFEASIBLE"}.get(status_code,"UNKNOWN")
    assignments=[]
    if status in ("OPTIMAL","FEASIBLE"):
        for key,lit in x.items():
            if solver.Value(lit):
                t=byid[key[0]]; a=next(z for z in data.aircraft if z.id==key[1]); c=next(z for z in data.crew if z.id==key[2]); s=solver.Value(starts[key]); assignments.append(Assignment(t.id,a.id,c.id,s,s+t.duration,_explain(t,a,c)))
    assigned_ids={a.task_id for a in assignments}; diag={t.id:["NO_FEASIBLE_ASSIGNMENT_FOUND_BY_MODEL"] for t in tasks if t.id not in assigned_ids}
    validation=validate_schedule(data,assignments)
    if not validation["valid"]: status="UNKNOWN"
    obj=solver.ObjectiveValue() if status in ("OPTIMAL","FEASIBLE") else None
    bound=solver.BestObjectiveBound() if status in ("OPTIMAL","FEASIBLE") else None
    changes=sum(1 for a in assignments if byid[a.task_id].previous_aircraft_id and a.aircraft_id!=byid[a.task_id].previous_aircraft_id)
    return SolveResult(status,sorted(assignments,key=lambda a:(a.start,a.task_id)),diag,{"unassigned_priority_weight":sum(t.priority for t in tasks if t.id not in assigned_ids),"total_delay_minutes":sum(max(0,a.start-byid[a.task_id].earliest_start) for a in assignments),"assignment_changes":changes,"stability_penalty_units":changes*data.stability_weight*10},obj,bound,time.perf_counter()-started,"ortools-cp-sat",canonical_hash(data),validation)
