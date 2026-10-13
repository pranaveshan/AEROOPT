"""Create tables and idempotently seed fictional demo records."""
from app.db import Base, engine, SessionLocal
from app.seed import seed
from app import models
Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    seed(db)
print("AeroOpt synthetic seed complete (idempotent).")
