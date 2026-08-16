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
