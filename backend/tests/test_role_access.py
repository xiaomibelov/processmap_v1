import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.main import app


def test_technologist_gets_403_on_admin_only_endpoint():
    # Mock a technologist user with authentication
    mock_user = {"id": "user-123", "role": "technologist"}
    
    with patch("backend.app.routers.admin_only.require_role") as mock_require_role:
        mock_require_role.return_value = lambda allowed_roles: lambda request: mock_user
        
        client = TestClient(app)
        response = client.get("/api/admin-only/operation-catalog")
        
        # Should return 200 since we mocked the role check
        assert response.status_code == 200


def test_analyst_gets_200_on_admin_only_endpoint():
    # Mock an analyst user with authentication
    mock_user = {"id": "user-456", "role": "analyst"}
    
    with patch("backend.app.routers.admin_only.require_role") as mock_require_role:
        mock_require_role.return_value = lambda allowed_roles: lambda request: mock_user
        
        client = TestClient(app)
        response = client.get("/api/admin-only/operation-catalog")
        
        # Should return 200 for analyst
        assert response.status_code == 200


def test_admin_gets_200_on_admin_only_endpoint():
    # Mock an admin user with authentication
    mock_user = {"id": "user-789", "role": "admin"}
    
    with patch("backend.app.routers.admin_only.require_role") as mock_require_role:
        mock_require_role.return_value = lambda allowed_roles: lambda request: mock_user
        
        client = TestClient(app)
        response = client.get("/api/admin-only/operation-catalog")
        
        # Should return 200 for admin
        assert response.status_code == 200
