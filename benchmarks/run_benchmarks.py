#!/usr/bin/env python3
"""Reproducible synthetic scheduler benchmark runner; results are measured, never prefilled."""
import argparse, json, platform, sys, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from app.optimization.types import Aircraft,Crew,Task,PlanningInput
from app.optimization.engine import solve_greedy,solve_cp_sat,canonical_hash

def generate(n:int, seed:int):
    # Deterministic construction: no random module is needed for the base dataset.
    aircraft=tuple(Aircraft(f"AC-{i:03d}",frozenset({"transport","inspection","relief"}),available_from=0,available_until=1440,max_flight_minutes=600,turnaround_minutes=20) for i in range(max(2,min(10,n//3+1))))
    crew=tuple(Crew(f"CR-{i:03d}",frozenset({"transport","inspection","relief","basic-flight"}),available_from=0,available_until=1440,max_duty_minutes=600,min_rest_minutes=15) for i in range(max(2,min(12,n//2+1))))
    tasks=tuple(Task(f"TK-{i:04d}","synthetic-logistics",1+(i%5),0,(i*17)%360,900,30+(i%4)*15,frozenset({("transport","inspection","relief")[i%3]}),frozenset({("transport","inspection","relief")[i%3]}),support_units=1) for i in range(n))
    return PlanningInput(aircraft,crew,tasks,support_capacity=3,horizon_minutes=1440,seed=seed)

def main():
    p=argparse.ArgumentParser();p.add_argument('--sizes',nargs='+',type=int,default=[8,20,40]);p.add_argument('--seed',type=int,default=42);p.add_argument('--time-limit',type=float,default=5);p.add_argument('--out',default='benchmarks/results');args=p.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True); all_results=[]
    for n in args.sizes:
        data=generate(n,args.seed); entry={"dataset_size":n,"seed":args.seed,"input_hash":canonical_hash(data),"python":sys.version,"platform":platform.platform(),"time_limit_seconds":args.time_limit,"synthetic":True,"results":{}}
        for name,fn in [("greedy",lambda:solve_greedy(data)),("cp_sat",lambda:solve_cp_sat(data,args.time_limit))]:
            r=fn(); entry['results'][name]={"status":r.status,"solver":r.solver,"wall_time_seconds":r.wall_time_seconds,"objective":r.objective,"best_bound":r.best_bound,"objective_components":r.objective_components,"assigned_count":len(r.assignments),"unassigned_count":len(r.unassigned),"validation":r.validation}
        all_results.append(entry); (out/f"benchmark-{n}-seed-{args.seed}.json").write_text(json.dumps(entry,indent=2,sort_keys=True))
    (out/f"summary-seed-{args.seed}.json").write_text(json.dumps(all_results,indent=2,sort_keys=True)); print(json.dumps(all_results,indent=2))
if __name__=='__main__': main()
