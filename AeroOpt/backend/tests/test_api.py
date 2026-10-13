from fastapi.testclient import TestClient
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
