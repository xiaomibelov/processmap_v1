"""AGENT-SVC: health endpoint."""
from __future__ import annotations

import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app


def test_health_ok():
    r = TestClient(app).get("/health")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"


def test_version_returns_build_metadata():
    os.environ["BUILD_ID"] = "test-build-id"
    os.environ["BUILD_TIME"] = "2026-08-27T12:00:00Z"
    os.environ["BUILD_BRANCH"] = "fix/test"
    os.environ["BUILD_ENV"] = "test"
    try:
        r = TestClient(app).get("/version")
        assert r.status_code == 200, r.text
        data = r.json()
        # Format must mirror backend/app/routers/version.py for consistency.
        assert data["commit"] == "test-build-id"
        assert data["sha"] == "test-build-id"
        assert data["buildTime"] == "2026-08-27T12:00:00Z"
        assert data["builtAt"] == "2026-08-27T12:00:00Z"
        assert data["branch"] == "fix/test"
        assert data["env"] == "test"
        assert "containerId" in data
    finally:
        os.environ.pop("BUILD_ID", None)
        os.environ.pop("BUILD_TIME", None)
        os.environ.pop("BUILD_BRANCH", None)
        os.environ.pop("BUILD_ENV", None)
