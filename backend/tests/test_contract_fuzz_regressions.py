"""Регрессионные тесты на баги, найденные contract-фаззингом (schemathesis).

Каждый тест — воспроизведение конкретной 500-ки, пойманной фаззером
(.planning/contours/test/contract-openapi/EXEC_REPORT.md):
- B1: GET /api/projects/{project_id} → 500 NameError (request_user_meta)
- B2: audit-helper org_service → 500 NameError (request_active_org_id)
- B3: GET /api/orgs/{org_id}/audit → 500 NameError (ORG_AUDIT_READ_ROLES)
- B4: GET /api/enterprise/workspace → 500 AttributeError (_lm.get_enterprise_workspace)
- B5: POST /api/sessions {"roles": true} → 500 TypeError вместо 422
- B6: GET /api/audit-log с ≥1 событием → 500 AttributeError (sqlite3.Row.get)
"""
from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.repositories import project_repo
from app.storage import (
    create_org_record,
    push_storage_request_scope,
    pop_storage_request_scope,
    upsert_org_membership,
    upsert_project_membership,
)


class ContractFuzzRegressionTest(unittest.TestCase):
    def setUp(self):
        self.owner = create_user("owner_contract_regression@local", "password", is_admin=False)
        self.uid = str(self.owner["id"])
        self.org_id = "org_contract_regression"
        create_org_record("Contract Regression Org", created_by=self.uid, org_id=self.org_id)
        upsert_org_membership(self.org_id, self.uid, "owner")
        upsert_project_membership(self.org_id, "proj_regression", self.uid, "owner")
        tokens = push_storage_request_scope(user_id=self.uid, is_admin=False, org_id=self.org_id)
        try:
            self.project_id = project_repo.create_project(
                "Regression Project", user_id=self.uid, org_id=self.org_id
            )
        finally:
            pop_storage_request_scope(tokens)
        self.headers = {"Authorization": f"Bearer {create_access_token(self.uid)}"}
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_b1_get_project_by_id_not_500(self):
        r = self.client.get(f"/api/projects/{self.project_id}", headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["id"], self.project_id)

    def test_b2_audit_helper_uses_imported_alias(self):
        # B2 — bare request_active_org_id в helper'е аудита: вызываем напрямую
        # (воспроизводится только при пустом org_id — fallback на active org).
        from app.services import org_service

        org_service._audit_log_safe(request=None, action="probe", entity_type="probe", entity_id="1",
                                    org_id="", status="ok")

    def test_b3_list_org_audit_not_500(self):
        r = self.client.get(f"/api/orgs/{self.org_id}/audit", headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)

    def test_b4_enterprise_workspace_not_500(self):
        r = self.client.get("/api/enterprise/workspace", headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)

    def test_b6_audit_log_with_events_not_500(self):
        # Создаём событие аудита (project.create), затем читаем журнал —
        # на sqlite падало AttributeError: 'sqlite3.Row' object has no attribute 'get'.
        r = self.client.post(
            f"/api/orgs/{self.org_id}/projects",
            headers=self.headers,
            json={"title": "B6 audit source"},
        )
        self.assertIn(r.status_code, (200, 201), r.text)
        r = self.client.get("/api/audit-log", headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertGreaterEqual(len(r.json()["items"]), 1)

    def test_b5_create_session_roles_bool_is_422_not_500(self):
        r = self.client.post(
            "/api/sessions",
            headers=self.headers,
            json={"title": "fuzz", "roles": True},
        )
        self.assertEqual(r.status_code, 422, r.text)

    def test_b5_create_session_roles_string_normalized(self):
        r = self.client.post(
            "/api/sessions",
            headers=self.headers,
            json={"title": "fuzz", "roles": "operator"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json().get("roles"), ["operator"])


if __name__ == "__main__":
    unittest.main()
