from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

APP_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = APP_DIR / "static"
WORKSPACE_DIR = Path(os.environ.get("PROCESS_WORKSPACE", "workspace/processes"))
GLOSSARY_SEED = APP_DIR / "knowledge" / "glossary_seed.yml"


def mount_static_assets(app: FastAPI, *, static_dir: Path = STATIC_DIR) -> None:
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
