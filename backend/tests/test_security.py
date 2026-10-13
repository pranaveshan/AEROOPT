import json
from fastapi.testclient import TestClient
from app.main import app
from app.services.auth import issue_token


def test_missing_invalid_expired_and_role_enforcement(monkeypatch):
    monkeypatch.setenv("AEROOPT_AUTH_TOKENS", json.dumps({"viewer-secret": "viewer", "planner-secret": "planner", "admin-secret": "admin"}))
    monkeypatch.setenv("AEROOPT_USERS", json.dumps({"admin": {"password": "admin-pass", "role": "admin"}}))
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("AEROOPT_AUTH_SECRET", "unit-test-secret")
    with TestClient(app) as client:
        assert client.get("/api/v1/dashboard").status_code == 401
        assert client.get("/api/v1/dashboard", headers={"Authorization": "Bearer nope"}).status_code == 401
        expired = issue_token("admin", "admin", ttl_seconds=-5)
        assert client.get("/api/v1/dashboard", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
        viewer = {"Authorization": "Bearer viewer-secret"}
        planner = {"Authorization": "Bearer planner-secret"}
        admin = {"Authorization": "Bearer admin-secret"}
        item = client.get("/api/v1/aircraft", headers=viewer).json()[0]
        assert client.delete(f"/api/v1/aircraft/{item['id']}", headers=viewer).status_code == 403
        assert client.delete(f"/api/v1/aircraft/{item['id']}", headers=planner).status_code == 403
        assert client.post("/api/v1/schedule/solve", json={"solver": "greedy"}, headers=viewer).status_code == 403
        assert client.post("/api/v1/scenarios", json={"name": "x"}, headers=planner).status_code == 201
        archived = client.delete(f"/api/v1/aircraft/{item['id']}", headers=admin)
        assert archived.status_code == 200
        assert client.post(f"/api/v1/aircraft/{item['id']}/restore", headers=planner).status_code == 403
        assert client.post(f"/api/v1/aircraft/{item['id']}/restore", headers=admin).status_code == 200


def test_login_issues_signed_token(monkeypatch):
    monkeypatch.setenv("AEROOPT_USERS", json.dumps({"planner": {"password": "secret", "role": "planner"}}))
    monkeypatch.setenv("AEROOPT_AUTH_SECRET", "unit-test-secret")
    monkeypatch.setenv("APP_ENV", "test")
    with TestClient(app) as client:
        denied = client.post("/api/v1/auth/login", json={"username": "planner", "password": "wrong"})
        assert denied.status_code == 401
        ok = client.post("/api/v1/auth/login", json={"username": "planner", "password": "secret"})
        assert ok.status_code == 200
        token = ok.json()["access_token"]
        assert client.post("/api/v1/schedule/solve", json={"solver": "greedy"}, headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_production_fails_closed_without_auth(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("AEROOPT_AUTH_TOKENS", raising=False)
    monkeypatch.delenv("AEROOPT_USERS", raising=False)
    with TestClient(app) as client:
        assert client.get("/api/v1/dashboard").status_code == 503
