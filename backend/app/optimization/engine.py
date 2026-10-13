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


def _resource_conflict(start: int, finish: int, intervals: list[tuple[int, int, str]], gap: int) -> bool:
    """Check overlap and required gap on either side of existing intervals."""
    for other_start, other_finish, _ in intervals:
        if _overlap(start, finish, other_start, other_finish):
            return True
        if finish <= other_start and other_start - finish < gap:
            return True
        if other_finish <= start and start - other_finish < gap:
            return True
    return False


def _support_fits(start: int, finish: int, demand: int, events, capacity: int) -> bool:
    points = {start}
    points.update(s for s, e, _, _ in events if start < s < finish)
    points.update(e for s, e, _, _ in events if start < e < finish)
    return all(sum(units for s, e, units, _ in events if s <= p < e) + demand <= capacity for p in points)

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
    """Independently validate assignments, including cumulative limits and resource rest."""
    errors=[]; tasks={t.id:t for t in data.tasks}; aircraft={a.id:a for a in data.aircraft}; crew={c.id:c for c in data.crew}
    seen=set(); by_aircraft={k:[] for k in aircraft}; by_crew={k:[] for k in crew}; support=[]; finishes={}
    aircraft_minutes={k:v.used_flight_minutes for k,v in aircraft.items()}
    crew_minutes={k:v.used_duty_minutes for k,v in crew.items()}
    for x in assignments:
        t=tasks.get(x.task_id)
        if not t: errors.append(f"UNKNOWN_TASK:{x.task_id}"); continue
        if x.task_id in seen: errors.append(f"DUPLICATE_TASK:{x.task_id}")
        seen.add(x.task_id)
        if t.status not in ("pending", "scheduled"):
            errors.append(f"TASK_STATUS_NOT_SCHEDULABLE:{x.task_id}")
        if x.finish <= x.start or x.finish-x.start != t.duration:
            errors.append(f"DURATION_MISMATCH:{x.task_id}")
        if x.aircraft_id not in aircraft or x.crew_id not in crew:
            errors.append(f"UNKNOWN_RESOURCE:{x.task_id}"); continue
        reasons=eligibility_reasons(t, aircraft[x.aircraft_id], crew[x.crew_id], data, x.start)
        errors.extend(f"{r}:{x.task_id}" for r in reasons)
        by_aircraft[x.aircraft_id].append((x.start,x.finish,x.task_id))
        by_crew[x.crew_id].append((x.start,x.finish,x.task_id))
        aircraft_minutes[x.aircraft_id] += t.duration
        crew_minutes[x.crew_id] += t.duration
        support.append((x.start,x.finish,t.support_units,x.task_id)); finishes[x.task_id]=x.finish
    for rid, intervals in by_aircraft.items():
        intervals.sort()
        for previous,current in zip(intervals, intervals[1:]):
            if _overlap(previous[0],previous[1],current[0],current[1]):
                errors.append(f"AIRCRAFT_CONFLICT:{previous[2]}:{current[2]}")
            elif current[0] < previous[1] + aircraft[rid].turnaround_minutes:
                errors.append(f"AIRCRAFT_TURNAROUND:{previous[2]}:{current[2]}")
        if aircraft_minutes[rid] > aircraft[rid].max_flight_minutes:
            errors.append(f"CUMULATIVE_FLIGHT_LIMIT:{rid}")
    for rid, intervals in by_crew.items():
        intervals.sort()
        for previous,current in zip(intervals, intervals[1:]):
            if _overlap(previous[0],previous[1],current[0],current[1]):
                errors.append(f"CREW_CONFLICT:{previous[2]}:{current[2]}")
            elif current[0] < previous[1] + crew[rid].min_rest_minutes:
                errors.append(f"CREW_REST_VIOLATION:{previous[2]}:{current[2]}")
        if crew_minutes[rid] > crew[rid].max_duty_minutes:
            errors.append(f"DUTY_LIMIT_EXCEEDED:{rid}")
    completed={t.id for t in data.tasks if t.status=="completed"}
    for t in data.tasks:
        if t.id in seen:
            for dep in t.dependencies:
                if dep in completed: continue
                if dep not in finishes: errors.append(f"DEPENDENCY_UNASSIGNED:{dep}:{t.id}")
                elif next((a.start for a in assignments if a.task_id==t.id), 0) < finishes.get(dep,0): errors.append(f"DEPENDENCY_ORDER:{dep}:{t.id}")
    points=sorted({v for s,e,u,_ in support for v in (s,e)})
    for p in points:
        used=sum(u for s,e,u,_ in support if s <= p < e)
        if used > data.support_capacity: errors.append(f"SUPPORT_OVERLOAD:{p}:{used}")
    return {"valid": not errors, "errors": sorted(set(errors)), "assigned_count":len(seen), "unassigned_count":len(data.tasks)-len(seen)}

def _explain(task, aircraft, crew):
    return (f"Aircraft {aircraft.id} satisfies capabilities", f"Crew {crew.id} satisfies qualifications", "Availability and interval checks passed", "Synthetic schedule; human approval required")

def solve_greedy(data: PlanningInput) -> SolveResult:
    started=time.perf_counter(); assigned=[]; reasons={}; a_used={a.id:[] for a in data.aircraft}; c_used={c.id:[] for c in data.crew}; support_events=[]; finish={}
    all_tasks={t.id:t for t in data.tasks}
    completed={t.id for t in data.tasks if t.status=="completed"}
    remaining={t.id:t for t in data.tasks if t.status in ("pending","scheduled")}
    for t in data.tasks:
        if t.status not in ("pending","scheduled"): reasons[t.id]=["TASK_STATUS_NOT_SCHEDULABLE"]
    while remaining:
        ready=[t for t in remaining.values() if all(d in finish or d in completed for d in t.dependencies)]
        if not ready:
            for t in remaining.values():
                missing=[d for d in t.dependencies if d not in finish and d not in completed]
                reasons[t.id]=[f"DEPENDENCY_UNAVAILABLE:{d}" for d in missing] or ["DEPENDENCY_CYCLE_OR_UNRESOLVED"]
            break
        t=min(ready,key=lambda z:(-z.priority,z.latest_finish,z.release,z.id))
        del remaining[t.id]
        earliest=max(t.release,t.earliest_start,max((finish[d] for d in t.dependencies if d in finish),default=0))
        candidates=[]
        for a in sorted(data.aircraft,key=lambda z:z.id):
            for c in sorted(data.crew,key=lambda z:z.id):
                starts={earliest}
                starts.update(e+max(a.turnaround_minutes,c.min_rest_minutes) for _,e,_ in a_used[a.id])
                starts.update(e+c.min_rest_minutes for _,e,_ in c_used[c.id])
                starts.update(e for _,e,_,_ in support_events)
                # Tasks longer than a restricted weather window must still be
                # schedulable immediately after the window ends when feasible.
                starts.update(we for _,we in data.weather_restrictions)
                for s in sorted(x for x in starts if x>=earliest):
                    e=s+t.duration
                    if e>t.latest_finish: continue
                    if eligibility_reasons(t,a,c,data,s): continue
                    if a.used_flight_minutes + sum(y-x for x,y,_ in a_used[a.id]) + t.duration > a.max_flight_minutes: continue
                    if c.used_duty_minutes + sum(y-x for x,y,_ in c_used[c.id]) + t.duration > c.max_duty_minutes: continue
                    if _resource_conflict(s,e,a_used[a.id],a.turnaround_minutes) or _resource_conflict(s,e,c_used[c.id],c.min_rest_minutes): continue
                    if not _support_fits(s,e,t.support_units,support_events,data.support_capacity): continue
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

def static_pair_reasons(task: Task, aircraft: Aircraft, crew: Crew, data: PlanningInput) -> list[str]:
    """Time-independent pair rejection. Time windows are encoded in the CP-SAT model."""
    reasons=[]
    if not aircraft.serviceable: reasons.append("AIRCRAFT_UNSERVICEABLE")
    if not task.capabilities.issubset(aircraft.capabilities): reasons.append("CAPABILITY_MISMATCH")
    if not task.qualifications.issubset(crew.qualifications): reasons.append("QUALIFICATION_MISSING")
    if task.support_units > data.support_capacity: reasons.append("SUPPORT_CAPACITY_EXCEEDED")
    return reasons


def _invalid_planning(data: PlanningInput) -> list[str]:
    errors=[]
    if data.horizon_minutes <= 0: errors.append("INVALID_HORIZON")
    if data.support_capacity < 0: errors.append("INVALID_SUPPORT_CAPACITY")
    if data.stability_weight < 0: errors.append("INVALID_STABILITY_WEIGHT")
    ids=set()
    for t in data.tasks:
        if t.id in ids: errors.append(f"DUPLICATE_TASK_ID:{t.id}")
        ids.add(t.id)
        if t.duration <= 0 or t.latest_finish <= t.earliest_start or t.earliest_start < t.release:
            errors.append(f"INVALID_TASK_WINDOW:{t.id}")
    return errors


def _unassigned_diagnostics(data: PlanningInput, tasks: list[Task]) -> dict[str, list[str]]:
    diag={}
    for t in tasks:
        reasons=[]
        for a in data.aircraft:
            for c in data.crew:
                reasons.extend(eligibility_reasons(t,a,c,data,max(t.release,t.earliest_start)))
                reasons.extend(static_pair_reasons(t,a,c,data))
        diag[t.id]=sorted(set(reasons)) or ["NO_FEASIBLE_ASSIGNMENT_FOUND_BY_MODEL"]
    return diag


def _forbid_interval_overlap(model, lit, start, end, forbidden_start, forbidden_finish, name: str):
    width = forbidden_finish - forbidden_start
    if width <= 0:
        return
    before = model.NewBoolVar(name)
    model.Add(end <= forbidden_start).OnlyEnforceIf([lit, before])
    model.Add(start >= forbidden_finish).OnlyEnforceIf([lit, before.Not()])


def _ordering_with_gap(model, lit_i, start_i, end_i, lit_j, start_j, end_j, gap: int, name: str):
    """Legacy pairwise clause; kept unused for reference. Production model uses
    padded intervals inside a single NoOverlap, which is O(n) instead of O(n^2)."""
    first = model.NewBoolVar(name)
    model.Add(start_j >= end_i + gap).OnlyEnforceIf([lit_i, lit_j, first])
    model.Add(start_i >= end_j + gap).OnlyEnforceIf([lit_i, lit_j, first.Not()])


def solve_cp_sat(data: PlanningInput, time_limit_seconds: float=5.0) -> SolveResult:
    """Real OR-Tools CP-SAT interval assignment model. Never labels greedy as CP-SAT."""
    started=time.perf_counter()
    invalid=_invalid_planning(data)
    if invalid:
        return SolveResult("MODEL_INVALID",[], {t.id:["INVALID_INPUT"] for t in data.tasks}, {}, None, None, time.perf_counter()-started, "ortools-cp-sat", canonical_hash(data), {"valid":False,"errors":invalid,"assigned_count":0,"unassigned_count":len(data.tasks)})
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return SolveResult("UNKNOWN",[],{t.id:["ORTOOLS_NOT_INSTALLED"] for t in data.tasks},{},None,None,time.perf_counter()-started,"cp-sat-unavailable",canonical_hash(data),{"valid":False,"errors":["OR-Tools is not installed; CP-SAT was not executed"],"assigned_count":0,"unassigned_count":len(data.tasks)})
    tasks=[t for t in data.tasks if t.status in ("pending","scheduled")]
    skipped={t.id:["TASK_STATUS_NOT_SCHEDULABLE"] for t in data.tasks if t.status not in ("pending","scheduled")}
    if not tasks:
        validation=validate_schedule(data,[])
        return SolveResult("OPTIMAL",[],skipped,{"assigned_priority_weight":0,"total_delay_minutes":0,"unassigned_priority_weight":0,"assignment_changes":0},0,0,time.perf_counter()-started,"ortools-cp-sat",canonical_hash(data),validation)

    model=cp_model.CpModel(); horizon=data.horizon_minutes
    x={}; starts={}; ends={}; intervals={}; interval_list=[]
    intervals_by_aircraft={a.id:[] for a in data.aircraft}
    intervals_by_crew={c.id:[] for c in data.crew}
    unassigned={}; byid={t.id:t for t in tasks}
    aircraft_lits={a.id:[] for a in data.aircraft}
    crew_lits={c.id:[] for c in data.crew}

    for t in tasks:
        choices=[]
        lb0=max(t.release,t.earliest_start)
        ub0=min(horizon-t.duration,t.latest_finish-t.duration)
        for a in data.aircraft:
            for c in data.crew:
                if static_pair_reasons(t,a,c,data):
                    continue
                lb=max(lb0,a.available_from,c.available_from)
                ub=min(ub0,a.available_until-t.duration,c.available_until-t.duration)
                expiry=dict(c.qualification_expiry)
                if any(q in expiry and lb+t.duration > expiry[q] for q in t.qualifications):
                    continue
                if ub < lb:
                    continue
                key=(t.id,a.id,c.id)
                lit=model.NewBoolVar("x_"+"_".join(key))
                s=model.NewIntVar(lb,ub,"s_"+"_".join(key))
                e=model.NewIntVar(lb+t.duration,ub+t.duration,"e_"+"_".join(key))
                model.Add(e==s+t.duration)
                iv=model.NewOptionalIntervalVar(s,t.duration,e,lit,"iv_"+"_".join(key))
                x[key]=lit; starts[key]=s; ends[key]=e; intervals[key]=iv
                choices.append(lit); interval_list.append((iv,t.support_units,lit,key))
                aircraft_lits[a.id].append((lit,t.duration))
                crew_lits[c.id].append((lit,t.duration))
                for q in t.qualifications:
                    if q in expiry:
                        model.Add(e <= expiry[q]).OnlyEnforceIf(lit)
                for ms,me in a.maintenance:
                    _forbid_interval_overlap(model,lit,s,e,ms,me,f"mnt_{'_'.join(key)}_{ms}")
                for ws,we in data.weather_restrictions:
                    _forbid_interval_overlap(model,lit,s,e,ws,we,f"wx_{'_'.join(key)}_{ws}")
                gap=a.turnaround_minutes
                pad_name=f"ivp_{a.id}_{t.id}_{c.id}"
                padded_a=model.NewOptionalIntervalVar(s,t.duration+gap,s+t.duration+gap,lit,pad_name) if gap>0 else iv
                intervals_by_aircraft[a.id].append((key,lit,s,e,padded_a))
                crested=model.NewOptionalIntervalVar(s,t.duration+c.min_rest_minutes,s+t.duration+c.min_rest_minutes,lit,f"ivr_{c.id}_{t.id}_{a.id}") if c.min_rest_minutes>0 else iv
                intervals_by_crew[c.id].append((key,lit,s,e,crested))
        u=model.NewBoolVar("unassigned_"+t.id); unassigned[t.id]=u
        if data.require_complete_coverage:
            if choices:
                model.Add(sum(choices)==1)
                model.Add(u==0)
            else:
                model.Add(u==1)
                model.Add(u==0)
        else:
            model.Add(sum(choices)+u==1)

    for a in data.aircraft:
        items=intervals_by_aircraft[a.id]
        if items:
            # Padded intervals keep the real task plus the mandatory turnaround
            # after it; one NoOverlap over padded intervals enforces both
            # non-overlap and the required gap without pairwise booleans.
            model.AddNoOverlap([padded for *_rest, padded in items])
        used=a.used_flight_minutes
        if aircraft_lits[a.id]:
            model.Add(used + sum(dur * lit for lit,dur in aircraft_lits[a.id]) <= a.max_flight_minutes)
    for c in data.crew:
        items=intervals_by_crew[c.id]
        if items:
            model.AddNoOverlap([padded for *_rest, padded in items])
        used=c.used_duty_minutes
        if crew_lits[c.id]:
            model.Add(used + sum(dur * lit for lit,dur in crew_lits[c.id]) <= c.max_duty_minutes)

    completed={t.id for t in data.tasks if t.status=="completed"}
    for t in tasks:
        for dep in t.dependencies:
            if dep in completed:
                continue
            if dep not in byid:
                model.Add(unassigned[t.id]==1)
                continue
            for key,lit in x.items():
                if key[0]!=t.id:
                    continue
                model.Add(lit + unassigned[dep] <= 1)
                for pkey,plit in x.items():
                    if pkey[0]==dep:
                        model.Add(starts[key] >= ends[pkey]).OnlyEnforceIf([lit,plit])

    if interval_list and data.support_capacity >= 0:
        model.AddCumulative([iv for iv,_,_,_ in interval_list],[max(0,d) for _,d,_,_ in interval_list],data.support_capacity)

    weighted_unassigned=sum(unassigned[t.id]*t.priority*10000 for t in tasks)
    delay_terms=[]; stability_terms=[]
    for key,lit in x.items():
        t=byid[key[0]]
        delay=model.NewIntVar(0,horizon,"delay_"+"_".join(key))
        model.Add(delay==starts[key]-max(t.release,t.earliest_start)).OnlyEnforceIf(lit)
        model.Add(delay==0).OnlyEnforceIf(lit.Not())
        delay_terms.append(delay)
        if t.previous_aircraft_id and key[1] != t.previous_aircraft_id and data.stability_weight > 0:
            stability_terms.append(lit * (data.stability_weight * 10))
    model.Minimize(weighted_unassigned + sum(delay_terms) + sum(stability_terms))

    solver=cp_model.CpSolver()
    solver.parameters.max_time_in_seconds=max(0.1,float(time_limit_seconds))
    solver.parameters.num_search_workers=1
    solver.parameters.random_seed=data.seed
    status_code=solver.Solve(model)
    status_map={
        cp_model.OPTIMAL:"OPTIMAL",
        cp_model.FEASIBLE:"FEASIBLE",
        cp_model.INFEASIBLE:"INFEASIBLE",
        cp_model.MODEL_INVALID:"MODEL_INVALID",
        cp_model.UNKNOWN:"UNKNOWN",
    }
    status=status_map.get(status_code,"UNKNOWN")
    assignments=[]
    if status in ("OPTIMAL","FEASIBLE"):
        for key,lit in x.items():
            if solver.BooleanValue(lit):
                t=byid[key[0]]; a=next(z for z in data.aircraft if z.id==key[1]); c=next(z for z in data.crew if z.id==key[2])
                s=int(solver.Value(starts[key]))
                assignments.append(Assignment(t.id,a.id,c.id,s,s+t.duration,_explain(t,a,c)))
    else:
        assignments=[]
    assigned_ids={a.task_id for a in assignments}
    diag={**skipped,**_unassigned_diagnostics(data,[t for t in tasks if t.id not in assigned_ids])}
    validation=validate_schedule(data,assignments)
    if status in ("OPTIMAL","FEASIBLE") and not validation["valid"]:
        status="UNKNOWN"
        assignments=[]
        validation=validate_schedule(data,[])
        diag=_unassigned_diagnostics(data,tasks)
        diag.update(skipped)
        diag["_validation"]=validation["errors"]
    success=status in ("OPTIMAL","FEASIBLE")
    obj=solver.ObjectiveValue() if success else None
    bound=solver.BestObjectiveBound() if success else None
    changes=sum(1 for a in assignments if byid[a.task_id].previous_aircraft_id and a.aircraft_id!=byid[a.task_id].previous_aircraft_id)
    components={"unassigned_priority_weight":sum(t.priority for t in tasks if t.id not in assigned_ids),"total_delay_minutes":sum(max(0,a.start-byid[a.task_id].earliest_start) for a in assignments),"assignment_changes":changes,"stability_penalty_units":changes*data.stability_weight*10,"assigned_priority_weight":sum(byid[a.task_id].priority for a in assignments)}
    return SolveResult(status,sorted(assignments,key=lambda a:(a.start,a.task_id)),diag,components,obj,bound,time.perf_counter()-started,"ortools-cp-sat",canonical_hash(data),validation)
