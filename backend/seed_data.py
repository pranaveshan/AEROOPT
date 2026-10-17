"""Create tables and idempotently seed fictional demo records plus one admin account.

The admin password is generated once (or taken from AEROOPT_ADMIN_PASSWORD), printed,
and written to ADMIN_CREDENTIALS.txt next to this file. That file is git-ignored.
Re-running never changes an existing admin.
"""
import os
from pathlib import Path
from app.db import Base, engine, SessionLocal
from app.seed import seed
from app import models  # noqa: F401
from app.services import users as users_svc
from app.services.audit import append_event

CREDENTIALS = Path(__file__).with_name("ADMIN_CREDENTIALS.txt")

Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    seed(db)
    if users_svc.find_user(db, "admin"):
        print("Admin account already exists; password unchanged"
              + (f" (see {CREDENTIALS.name})." if CREDENTIALS.exists() else "."))
    else:
        password = os.getenv("AEROOPT_ADMIN_PASSWORD") or users_svc.generate_password()
        problems = users_svc.password_problems(password)
        if problems:
            raise SystemExit("AEROOPT_ADMIN_PASSWORD is too weak: needs " + ", ".join(problems))
        row = users_svc.create_user(db, "admin", None, password, role="admin")
        db.flush()
        append_event(db, "USER_SEEDED", row.id, {"username": "admin", "role": "admin"}, actor="seed")
        db.commit()
        CREDENTIALS.write_text(f"AeroOpt admin account (keep private)\nusername: admin\npassword: {password}\n", encoding="utf-8")
        print(f"Created admin account.\n  username: admin\n  password: {password}\n  saved to: {CREDENTIALS}")
print("AeroOpt synthetic seed complete (idempotent).")
