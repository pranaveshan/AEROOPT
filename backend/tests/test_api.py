from fastapi.testclient import TestClient
import uuid
from app.main import app

def test_health_and_seeded_dashboard():
    with TestClient(app) as client:
        assert client.get('/api/v1/health').status_code==200
        response=client.get('/api/v1/dashboard')
        assert response.status_code==200
        assert response.json()['synthetic'] is True
        assert response.json()['aircraft']['total']>=3

def test_invalid_task_window_rejected():
    with TestClient(app) as client:
        payload={"id":"BAD-TASK","title":"bad","priority":3,"release":10,"earliest_start":10,"latest_finish":20,"duration":30,"capabilities":[],"qualifications":[],"dependencies":[],"support_units":1}
        assert client.post('/api/v1/tasks',json=payload).status_code==422

def test_greedy_solve_and_approval_gate():
    with TestClient(app) as client:
        run=client.post('/api/v1/schedule/solve',json={"solver":"greedy"})
        assert run.status_code==200
        body=run.json()
        assert body['validation']['valid'] is True
        assert client.post('/api/v1/schedule/apply',json={"run_id":body['run_id'],"approved":False}).status_code==400

def test_unknown_solver_is_rejected():
    with TestClient(app) as client:
        response = client.post('/api/v1/schedule/solve', json={"solver": "magic"})
        assert response.status_code == 422


def test_update_path_and_payload_ids_must_match():
    with TestClient(app) as client:
        payload = client.get('/api/v1/aircraft').json()[0]
        payload['id'] = 'DIFFERENT-ID'
        response = client.put('/api/v1/aircraft/AC-101', json=payload)
        assert response.status_code == 422

def test_approved_schedule_is_persisted_and_read_back():
    with TestClient(app) as client:
        run_response = client.post('/api/v1/schedule/solve', json={"solver": "greedy"})
        assert run_response.status_code == 200
        proposal = run_response.json()
        assert proposal["validation"]["valid"] is True
        assert proposal["status"] in ("FEASIBLE", "OPTIMAL")
        applied = client.post('/api/v1/schedule/apply', json={"run_id": proposal["run_id"], "approved": True})
        assert applied.status_code == 200, applied.text
        expected_count = applied.json()["assignments"]
    with TestClient(app) as restarted_client:
        saved = restarted_client.get('/api/v1/schedule')
        assert saved.status_code == 200
        assert saved.json()["status"] == "APPLIED"
        assert len(saved.json()["assignments"]) == expected_count


def test_created_aircraft_survives_new_client_lifespan():
    payload = {
        "id": f"TEST-PERSIST-{uuid.uuid4().hex[:8]}", "type": "Test", "capabilities": ["inspection"],
        "home_facility": "TEST FIELD", "status": "serviceable", "available_from": 0,
        "available_until": 1440, "max_flight_minutes": 120, "used_flight_minutes": 0,
        "turnaround_minutes": 10, "maintenance": [], "archived": False,
    }
    with TestClient(app) as client:
        response = client.post('/api/v1/aircraft', json=payload)
        assert response.status_code == 201, response.text
    with TestClient(app) as restarted_client:
        records = restarted_client.get('/api/v1/aircraft').json()
        assert any(item['id'] == payload['id'] for item in records)
        restarted_client.delete(f"/api/v1/aircraft/{payload['id']}")


def test_counterfactual_is_isolated_from_saved_resources():
    with TestClient(app) as client:
        before = client.get('/api/v1/aircraft').json()
        resource_id = before[0]['id']
        response = client.post('/api/v1/scenarios/counterfactual', json={
            'type': 'aircraft_grounded', 'resource_id': resource_id
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert body['isolated'] is True
        assert body['saved_data_changed'] is False
        assert body['result']['solver'] == 'deterministic-greedy-v1'
        after = client.get('/api/v1/aircraft').json()
        assert after == before

def test_aircraft_restore_endpoint():
    with TestClient(app) as client:
        records = client.get('/api/v1/aircraft').json()
        item = records[0]
        assert client.delete(f"/api/v1/aircraft/{item['id']}").status_code == 200
        assert all(x['id'] != item['id'] for x in client.get('/api/v1/aircraft').json())
        restored = client.post(f"/api/v1/aircraft/{item['id']}/restore")
        assert restored.status_code == 200
        assert restored.json()['archived'] is False


def test_counterfactual_includes_baseline_comparison_and_does_not_mutate_records():
    with TestClient(app) as client:
        before = client.get('/api/v1/aircraft').json()
        resource_id = before[0]['id']
        response = client.post('/api/v1/scenarios/counterfactual', json={
            'type': 'aircraft_grounded', 'resource_id': resource_id, 'solver': 'greedy'
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert body['baseline_result']['validation']['valid'] is True
        assert body['comparison']['baseline_assigned'] >= 0
        assert body['comparison']['scenario_assigned'] >= 0
        assert body['comparison']['assignment_delta'] == body['comparison']['scenario_assigned'] - body['comparison']['baseline_assigned']
        assert client.get('/api/v1/aircraft').json() == before


def test_access_control_requires_token_when_configured(monkeypatch):
    monkeypatch.setenv('AEROOPT_AUTH_TOKENS', '{"viewer-secret":"viewer","planner-secret":"planner","admin-secret":"admin"}')
    monkeypatch.setenv('APP_ENV', 'test')
    with TestClient(app) as client:
        assert client.get('/api/v1/dashboard').status_code == 401
        assert client.get('/api/v1/dashboard', headers={'Authorization':'Bearer viewer-secret'}).status_code == 200
        assert client.post('/api/v1/schedule/solve', json={'solver':'greedy'}, headers={'Authorization':'Bearer viewer-secret'}).status_code == 403
        assert client.post('/api/v1/schedule/solve', json={'solver':'greedy'}, headers={'Authorization':'Bearer planner-secret'}).status_code == 200
