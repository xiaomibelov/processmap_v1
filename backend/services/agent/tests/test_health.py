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
    os.environ["BUILD_BRANCH"] = "fix/test"
    try:
        r = TestClient(app).get("/version")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["service"] == "agent"
        assert data["build_id"] == "test-build-id"
        assert data["build_branch"] == "fix/test"
        assert "build_time" in data
    finally:
        os.environ.pop("BUILD_ID", None)
        os.environ.pop("BUILD_BRANCH", None)
