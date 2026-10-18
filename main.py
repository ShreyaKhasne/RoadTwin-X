from pathlib import Path
import os
import sys

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

if os.getenv("VERCEL") == "1":
    os.environ.setdefault("ROADTWIN_DATABASE_URL", "sqlite:////tmp/roadtwin.db")

from app.main import app

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.frontend("/", directory=FRONTEND_DIST, fallback="index.html")
