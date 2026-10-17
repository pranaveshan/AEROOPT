"""Database-backed user accounts.

Passwords are hashed with salted scrypt from the standard library and stored as
``scrypt$n$r$p$<salt b64>$<hash b64>``. Accounts created through registration
get the least-privileged role ("viewer"); the admin account is created only by
``seed_data.py``.
"""
from __future__ import annotations
import base64, hashlib, hmac, os, re, secrets, string, uuid
from sqlalchemy.orm import Session
from ..models import UserRow

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
DEFAULT_ROLE = "viewer"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${b64(salt)}${b64(digest)}"


def check_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest)
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(got, expected)
    except (ValueError, TypeError):
        return False


def password_problems(password: str) -> list[str]:
    problems = []
    if len(password) < 10: problems.append("at least 10 characters")
    if len(password) > 256: problems.append("at most 256 characters")
    if not re.search(r"[a-z]", password) or not re.search(r"[A-Z]", password): problems.append("upper- and lower-case letters")
    if not re.search(r"\d", password): problems.append("a number")
    if not re.search(r"[^A-Za-z0-9]", password): problems.append("a symbol")
    return problems


def normalise_username(username: str) -> str:
    return username.strip().lower()


def find_user(db: Session, username: str) -> UserRow | None:
    return db.query(UserRow).filter(UserRow.username == normalise_username(username)).first()


def verify_db_user(db: Session, username: str, password: str) -> UserRow | None:
    user = find_user(db, username)
    if user is None:
        # Spend comparable time on unknown users to avoid a username timing oracle.
        check_password(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        return None
    return user if check_password(password, user.password_hash) else None


def create_user(db: Session, username: str, email: str | None, password: str, role: str = DEFAULT_ROLE) -> UserRow:
    row = UserRow(id=f"USR-{uuid.uuid4().hex[:10].upper()}", username=normalise_username(username),
                  email=email.strip().lower() if email else None, password_hash=hash_password(password), role=role)
    db.add(row)
    return row


def any_db_users(db: Session) -> bool:
    return db.query(UserRow.id).first() is not None


def generate_password(length: int = 20) -> str:
    """Strong random password with at least one of each character class."""
    alphabet = string.ascii_letters + string.digits + "-_.!@#%^*"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if not password_problems(pw):
            return pw
