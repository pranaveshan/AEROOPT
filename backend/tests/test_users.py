import json, uuid
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.services import users as users_svc

STRONG = "Runway-27Left!"


def uname():
    return f"u{uuid.uuid4().hex[:10]}"


def test_hash_roundtrip_and_salt():
    a, b = users_svc.hash_password(STRONG), users_svc.hash_password(STRONG)
    assert a != b and a.startswith("scrypt$")
    assert users_svc.check_password(STRONG, a) and not users_svc.check_password("wrong", a)
    assert not users_svc.check_password(STRONG, "garbage")


def test_register_login_and_role(monkeypatch):
    monkeypatch.delenv("AEROOPT_USERS", raising=False)
    monkeypatch.delenv("AEROOPT_AUTH_TOKENS", raising=False)
    name = uname()
    with TestClient(app) as c:
        r = c.post("/api/v1/auth/register", json={"username": name.upper(), "email": f"{name}@example.org", "password": STRONG})
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["username"] == name and body["role"] == "viewer" and "password" not in json.dumps(body)
        ok = c.post("/api/v1/auth/login", json={"username": name, "password": STRONG})
        assert ok.status_code == 200 and ok.json()["role"] == "viewer" and ok.json()["username"] == name
        assert c.post("/api/v1/auth/login", json={"username": name, "password": "Wrong-pass-1!"}).status_code == 401
        assert c.post("/api/v1/auth/login", json={"username": "nobody-here", "password": STRONG}).status_code == 401
    with SessionLocal() as db:
        row = users_svc.find_user(db, name)
        assert row and row.password_hash != STRONG and row.password_hash.startswith("scrypt$")


def test_register_duplicates_and_validation(monkeypatch):
    monkeypatch.delenv("AEROOPT_USERS", raising=False)
    name = uname()
    with TestClient(app) as c:
        assert c.post("/api/v1/auth/register", json={"username": name, "email": f"{name}@example.org", "password": STRONG}).status_code == 201
        assert c.post("/api/v1/auth/register", json={"username": name, "email": f"x{name}@example.org", "password": STRONG}).status_code == 409
        assert c.post("/api/v1/auth/register", json={"username": uname(), "email": f"{name.upper()}@example.org", "password": STRONG}).status_code == 409
        for bad in ({"username": "a", "email": "a@b.org", "password": STRONG},
                    {"username": uname(), "email": "not-an-email", "password": STRONG},
                    {"username": uname(), "email": "ok@example.org", "password": "weakpassword"},
                    {"username": "bad name!", "email": "ok@example.org", "password": STRONG}):
            assert c.post("/api/v1/auth/register", json=bad).status_code == 422


def test_env_users_still_work_and_take_precedence(monkeypatch):
    monkeypatch.setenv("AEROOPT_USERS", json.dumps({"planner": {"password": "secret", "role": "planner"}}))
    monkeypatch.setenv("APP_ENV", "test")
    with TestClient(app) as c:
        r = c.post("/api/v1/auth/login", json={"username": "planner", "password": "secret"})
        assert r.status_code == 200 and r.json()["role"] == "planner"
        # env username cannot be registered in the DB
        assert c.post("/api/v1/auth/register", json={"username": "planner", "email": f"{uname()}@example.org", "password": STRONG}).status_code == 409
        # register is public even when auth is enforced
        assert c.post("/api/v1/auth/register", json={"username": uname(), "email": f"{uname()}@example.org", "password": STRONG}).status_code == 201


def test_registered_viewer_token_is_enforced_when_auth_configured(monkeypatch):
    monkeypatch.setenv("AEROOPT_USERS", json.dumps({"ops": {"password": "x", "role": "admin"}}))
    monkeypatch.setenv("APP_ENV", "test")
    name = uname()
    with TestClient(app) as c:
        c.post("/api/v1/auth/register", json={"username": name, "email": f"{name}@example.org", "password": STRONG})
        tok = c.post("/api/v1/auth/login", json={"username": name, "password": STRONG}).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        assert c.get("/api/v1/dashboard", headers=h).status_code == 200
        assert c.post("/api/v1/schedule/solve", json={"solver": "greedy"}, headers=h).status_code == 403


def test_seeded_admin_can_log_in(monkeypatch):
    monkeypatch.delenv("AEROOPT_USERS", raising=False)
    pw = users_svc.generate_password()
    assert not users_svc.password_problems(pw)
    with SessionLocal() as db:
        name = uname()
        users_svc.create_user(db, name, None, pw, role="admin"); db.commit()
    with TestClient(app) as c:
        r = c.post("/api/v1/auth/login", json={"username": name, "password": pw})
        assert r.status_code == 200 and r.json()["role"] == "admin"
