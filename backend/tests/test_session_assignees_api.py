"""HTTP contract tests for session assignees endpoints."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class SessionAssigneesApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_access_token, create_user
        from app.routers.explorer import CreateFolderBody, CreateProjectBody, create_folder, create_project_in_folder
        from app.main import app
        from app.storage import get_default_org_id, get_storage, list_org_workspaces, upsert_org_membership

        self.client = TestClient(app, raise_server_exceptions=False)
        self.create_access_token = create_access_token
        self.org_id = get_default_org_id()

        admin = create_user("assignees_api_admin@local", "admin", is_admin=False, full_name="Админ")
        assignee_a = create_user("assignees_api_a@local", "a", is_admin=False, full_name="Исполнитель А")
        assignee_b = create_user("assignees_api_b@local", "b", is_admin=False, full_name="Исполнитель Б")
        self.admin_id = str(admin.get("id") or "")
        self.assignee_a_id = str(assignee_a.get("id") or "")
        self.assignee_b_id = str(assignee_b.get("id") or "")
        for uid in [self.admin_id, self.assignee_a_id, self.assignee_b_id]:
            upsert_org_membership(self.org_id, uid, "org_admin" if uid == self.admin_id else "editor")

        workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        folder = create_folder(workspace_id, CreateFolderBody(name="Раздел"), self._request(admin))
        project = create_project_in_folder(
            str(folder.get("id") or ""),
            CreateProjectBody(name="Проект"),
            self._request(admin),
            workspace_id=workspace_id,
        )
        self.project_id = str(project.get("id") or "")
        self.session_id = get_storage().create(
            "Схема",
            roles=["cook"],
            project_id=self.project_id,
            org_id=self.org_id,
            is_admin=True,
        )
        self.token = create_access_token(self.admin_id)

    def tearDown(self):
        if self.old_sessions_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_sessions_dir
        if self.old_projects_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = self.old_projects_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _request(self, user: dict):
        from types import SimpleNamespace

        return SimpleNamespace(state=SimpleNamespace(auth_user=user, active_org_id=self.org_id), headers={})

    def _auth(self):
        return {"Authorization": f"Bearer {self.token}", "X-Org-Id": self.org_id}

    def test_get_and_put_session_assignees_accept_multiple_users(self):
        put_resp = self.client.put(
            f"/api/sessions/{self.session_id}/assignees",
            headers=self._auth(),
            json={"user_ids": [self.assignee_a_id, self.assignee_b_id]},
        )
        self.assertEqual(put_resp.status_code, 200, put_resp.text)
        self.assertEqual(set(put_resp.json()["user_ids"]), {self.assignee_a_id, self.assignee_b_id})

        get_resp = self.client.get(f"/api/sessions/{self.session_id}/assignees", headers=self._auth())
        self.assertEqual(get_resp.status_code, 200, get_resp.text)
        payload = get_resp.json()
        self.assertIsInstance(payload, list)
        self.assertEqual({row["user_id"] for row in payload}, {self.assignee_a_id, self.assignee_b_id})


if __name__ == "__main__":
    unittest.main()
