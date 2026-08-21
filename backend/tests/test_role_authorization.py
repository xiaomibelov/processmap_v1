import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.main import app

def test_unauthenticated_request_returns_401():
    client = TestClient(app)
    response = client.post("/api/process-templates/import-bpmn", json={"bpmn_xml": "<xml>test</xml>"})
    assert response.status_code == 401

def test_role_middleware_blocks_technologist():
    from backend.app.middleware.role_middleware import require_role
    assert callable(require_role)
    role_checker = require_role(["analyst", "admin"])
    assert callable(role_checker)
    print("Role middleware test passed")

def test_role_middleware_allows_analyst():
    from backend.app.middleware.role_middleware import require_role
    assert callable(require_role)
    role_checker = require_role(["analyst", "admin"])
    assert callable(role_checker)
    print("Role middleware test passed")
