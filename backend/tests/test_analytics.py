from fastapi.testclient import TestClient
from app.main import app


def test_spof_stress_and_compare_are_isolated():
    with TestClient(app) as client:
        before = client.get("/api/v1/aircraft").json()
        spof = client.post("/api/v1/analytics/spof", json={"solver": "greedy"})
        assert spof.status_code == 200, spof.text
        assert "critical_aircraft" in spof.json()
        stress = client.post("/api/v1/analytics/stress", json={"solver": "greedy"})
        assert stress.status_code == 200
        assert len(stress.json()["cases"]) >= 1
        compared = client.post("/api/v1/analytics/compare-solvers", json={"time_limit_seconds": 3})
        assert compared.status_code == 200
        body = compared.json()
        assert body["greedy"]["solver"] == "deterministic-greedy-v1"
        assert body["cp_sat"]["solver"] in ("ortools-cp-sat", "cp-sat-unavailable")
        assert client.get("/api/v1/aircraft").json() == before


def test_cpsat_api_solver_selection():
    with TestClient(app) as client:
        run = client.post("/api/v1/schedule/solve", json={"solver": "cp-sat", "time_limit_seconds": 5})
        assert run.status_code == 200, run.text
        body = run.json()
        assert body["solver"] in ("ortools-cp-sat", "cp-sat-unavailable")
        if body["solver"] == "ortools-cp-sat" and body["status"] in ("OPTIMAL", "FEASIBLE"):
            assert body["validation"]["valid"] is True
            assert client.post("/api/v1/schedule/apply", json={"run_id": body["run_id"], "approved": True}).status_code == 200
        else:
            assert body["status"] in ("UNKNOWN", "INFEASIBLE", "MODEL_INVALID")
            assert client.post("/api/v1/schedule/apply", json={"run_id": body["run_id"], "approved": True}).status_code == 409
