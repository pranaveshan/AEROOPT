"""End-to-end demo flow. Requires a running API server; every number shown is real.

Usage: python demo_end_to_end.py http://127.0.0.1:8123
"""
from __future__ import annotations
import json, sys
import httpx

base = sys.argv[1].rstrip("/")
c = httpx.Client(base_url=base + "/api/v1", timeout=120)
step = 0

def banner(text):
    global step
    step += 1
    print(f"\n=== Step {step}: {text} ===")

banner("Health check")
print(c.get("health").json())

banner("Dashboard (synthetic seed)")
dash = c.get("dashboard").json()
print(json.dumps({k: dash[k] for k in ("aircraft", "personnel", "tasks", "completion_rate")}, indent=2))

banner("Introduce a saved disruption: ground AC-101")
print(c.post("disruptions", json={"type": "aircraft_grounded", "resource_id": "AC-101"}).json()["message"])

banner("Greedy baseline solve on disrupted state")
run = c.post("schedule/solve", json={"solver": "greedy", "time_limit_seconds": 5, "stability_weight": 0}).json()
print({"run_id": run["run_id"], "status": run["status"], "validation": run["validation"]["valid"], "assigned": len(run["assignments"]), "wall": round(run["wall_time_seconds"], 4)})
print("unassigned reasons:", json.dumps(run["unassigned"], indent=2))

banner("Approval gate: apply without approval must fail")
print("HTTP", c.post("schedule/apply", json={"run_id": run["run_id"], "approved": False}).status_code, "(expected 400)")

banner("Apply approved schedule")
applied = c.post("schedule/apply", json={"run_id": run["run_id"], "approved": True})
print("HTTP", applied.status_code, applied.json() if applied.status_code == 200 else applied.text)

banner("Persistence check: schedule read back")
saved = c.get("schedule").json()
print({"version": saved["schedule_version"], "status": saved["status"], "assignments": len(saved["assignments"])})

banner("Isolated scenario: fork, mutate, solve, compare, discard")
scen = c.post("scenarios", json={"name": "Restore AC-101 what-if"}).json()
changed = c.post(f"scenarios/{scen['id']}/change", json={"type": "aircraft_ungrounded"}) if False else None
# The scenario API mutates snapshots via PATCH; supported ops include update_aircraft.
mut = c.patch(f"scenarios/{scen['id']}", json={"type": "update_aircraft", "resource_id": "AC-101", "changes": {"status": "serviceable"}, "version": scen["version"]})
print("mutate HTTP", mut.status_code)
solved = c.post(f"scenarios/{scen['id']}/solve", json={"solver": "greedy"}).json()
print("scenario status:", solved["result"]["status"], "| comparison:", {k: solved["result"]["comparison"][k] for k in ("baseline_assigned", "scenario_assigned", "tasks_lost")})
print("saved_data_changed:", solved["saved_data_changed"])
disc = c.post(f"scenarios/{scen['id']}/discard").json()
print("discard:", disc)

banner("Audit trail: tail and integrity verification")
events = c.get("audit").json()
print("last 6 events:", [(e["action"], e["entity_id"]) for e in events[:6]])
print("verify:", c.get("audit/verify").json())
