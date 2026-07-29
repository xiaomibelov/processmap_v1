import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.main import app


def test_unauthenticated_request_returns_401():
    # Test that unauthenticated requests return 401
    client = TestClient(app)
    response = client.get("/api/operation-catalog")
    
    # Should return 401 for unauthenticated request
    assert response.status_code == 401


def test_health_endpoint_is_public():
    # Health endpoint should be accessible without authentication
    client = TestClient(app)
    response = client.get("/api/health/process-template")
    
    # Should return 200 (or 503 if database is not available)
    assert response.status_code in [200, 503]


def test_process_templates_endpoint_requires_auth():
    # Test that process templates endpoint requires authentication
    client = TestClient(app)
    response = client.get("/api/process-templates")
    
    # Should return 401 for unauthenticated request
    assert response.status_code == 401


def test_recipes_endpoint_requires_auth():
    # Test that recipes endpoint requires authentication
    client = TestClient(app)
    response = client.get("/api/recipes")
    
    # Should return 401 for unauthenticated request
    assert response.status_code == 401
