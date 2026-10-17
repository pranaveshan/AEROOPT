"""Bearer-token authentication with optional expiry-signed sessions.

Static tokens from AEROOPT_AUTH_TOKENS remain valid for local tests. Signed
tokens from POST /api/v1/auth/login expire. Production must set APP_ENV=production
and configure users or tokens; the API then fails closed when auth is missing.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, time

ROLES = {"viewer": 0, "planner": 1, "admin": 2}


def _secret() -> bytes:
    secret = os.getenv("AEROOPT_AUTH_SECRET", "").strip()
    if secret:
        return secret.encode()
    return b"aeroopt-dev-only-change-me"


def load_static_tokens() -> dict[str, str]:
    raw = os.getenv("AEROOPT_AUTH_TOKENS", "").strip()
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict) or not data:
        raise ValueError("Token map must be a non-empty JSON object")
    return {str(k): str(v) for k, v in data.items()}


def load_users() -> dict[str, dict]:
    raw = os.getenv("AEROOPT_USERS", "").strip()
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("AEROOPT_USERS must be a JSON object")
    return data


def auth_configured() -> bool:
    try:
        return bool(load_static_tokens() or load_users())
    except (ValueError, TypeError, json.JSONDecodeError):
        return False


def issue_token(subject: str, role: str, ttl_seconds: int = 3600) -> str:
    if role not in ROLES:
        raise ValueError("Unknown role")
    payload = json.dumps({"sub": subject, "role": role, "exp": int(time.time()) + int(ttl_seconds)}, separators=(",", ":"))
    raw = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def _decode_signed(token: str) -> dict | None:
    if "." not in token:
        return None
    raw, sig = token.rsplit(".", 1)
    expected = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    pad = "=" * ((4 - len(raw) % 4) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw + pad))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return {"expired": True}
    if payload.get("role") not in ROLES:
        return None
    return payload


def authenticate_bearer(header_value: str) -> tuple[str | None, str | None]:
    """Return (role, error) where error is 'missing', 'invalid', or 'expired'."""
    supplied = ""
    if header_value.lower().startswith("bearer "):
        supplied = header_value[7:].strip()
    if not supplied:
        return None, "missing"
    signed = _decode_signed(supplied)
    if signed:
        if signed.get("expired"):
            return None, "expired"
        return str(signed["role"]), None
    try:
        tokens = load_static_tokens()
    except (ValueError, TypeError, json.JSONDecodeError):
        return None, "invalid"
    for candidate, role in tokens.items():
        if hmac.compare_digest(str(candidate), supplied) and role in ROLES:
            return str(role), None
    return None, "invalid"


def verify_password(username: str, password: str) -> str | None:
    users = load_users()
    record = users.get(username)
    if not isinstance(record, dict):
        return None
    stored = str(record.get("password") or "")
    hashed = str(record.get("password_hash") or "")
    if hashed:
        digest = hashlib.sha256(password.encode()).hexdigest()
        if not hmac.compare_digest(digest, hashed):
            return None
    elif stored:
        if not hmac.compare_digest(stored, password):
            return None
    else:
        return None
    role = str(record.get("role") or "")
    return role if role in ROLES else None


def required_role(path: str, method: str) -> str:
    method = method.upper()
    is_write = method not in ("GET", "HEAD", "OPTIONS")
    if path in ("/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/health"):
        return "public"
    admin_prefixes = ("/api/v1/aircraft", "/api/v1/personnel", "/api/v1/tasks")
    planner_prefixes = (
        "/api/v1/schedule/solve",
        "/api/v1/schedule/apply",
        "/api/v1/schedule/validate",
        "/api/v1/disruptions",
        "/api/v1/scenarios",
        "/api/v1/analytics",
    )
    if is_write and any(path.startswith(p) for p in admin_prefixes):
        return "admin"
    if is_write and any(path.startswith(p) for p in planner_prefixes):
        return "planner"
    if is_write:
        return "planner"
    return "viewer"


def authorized(role: str, required: str) -> bool:
    if required == "public":
        return True
    return ROLES.get(role, -1) >= ROLES.get(required, 99)
