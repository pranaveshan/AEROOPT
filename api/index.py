# Vercel serverless entrypoint: mounts the backend FastAPI app for /api/v1/*.
import os
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent

# The FastAPI package lives under backend/app/...
sys.path.insert(0, str(_ROOT / "backend"))

# Serverless filesystems are read-only except /tmp; point SQLite there before
# the app engine is created (db.py reads DATABASE_URL at import time).
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/aeroopt.db")

from app.main import app  # noqa: E402,F401
