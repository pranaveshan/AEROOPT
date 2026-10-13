from fastapi.testclient import TestClient
from app.main import app


def test_named_scenario_isolation_solve_discard():
    with TestClient(app) as client:
        before_ac = client.get("/api/v1/aircraft").json()
        created = client.post("/api/v1/scenarios", json={"name": "Ground first aircraft"})
        assert created.status_code == 201, created.text
        scenario = created.json()
        resource_id = before_ac[0]["id"]
        mutated = client.patch(f"/api/v1/scenarios/{scenario['id']}", json={"type": "aircraft_grounded", "resource_id": resource_id, "version": scenario["version"]})
        assert mutated.status_code == 200, mutated.text
        assert client.get("/api/v1/aircraft").json() == before_ac
        solved = client.post(f"/api/v1/scenarios/{scenario['id']}/solve", json={"solver": "greedy"})
        assert solved.status_code == 200, solved.text
        body = solved.json()
        assert body["saved_data_changed"] is False
        assert body["result"]["comparison"]["baseline_assigned"] >= 0
        discarded = client.post(f"/api/v1/scenarios/{scenario['id']}/discard")
        assert discarded.status_code == 200
        assert discarded.json()["live_snapshot_unchanged"] is True
        assert client.get("/api/v1/aircraft").json() == before_ac


def test_invalid_scenario_change_rejected():
    with TestClient(app) as client:
        created = client.post("/api/v1/scenarios", json={"name": "Bad change"}).json()
        response = client.patch(f"/api/v1/scenarios/{created['id']}", json={"type": "not-a-real-op", "resource_id": "x"})
        assert response.status_code == 422


def test_scenario_apply_requires_approval_and_persists():
    with TestClient(app) as client:
        created = client.post("/api/v1/scenarios", json={"name": "Applyable"}).json()
        solved = client.post(f"/api/v1/scenarios/{created['id']}/solve", json={"solver": "greedy"}).json()
        denied = client.post(f"/api/v1/scenarios/{created['id']}/apply", json={"approved": False, "version": solved["version"]})
        assert denied.status_code == 400
        conflict = client.post(f"/api/v1/scenarios/{created['id']}/apply", json={"approved": True, "version": 0})
        assert conflict.status_code == 409
        applied = client.post(f"/api/v1/scenarios/{created['id']}/apply", json={"approved": True, "version": solved["version"]})
        assert applied.status_code == 200, applied.text
        saved = client.get("/api/v1/schedule").json()
        assert saved["status"] == "APPLIED"
        listed = client.get("/api/v1/scenarios").json()
        match = next(s for s in listed["scenarios"] if s["id"] == created["id"])
        assert match["status"] == "applied"


def test_restore_stale_record_conflict():
    with TestClient(app) as client:
        item = client.get("/api/v1/aircraft").json()[0]
        assert client.post(f"/api/v1/aircraft/{item['id']}/restore").status_code == 409
