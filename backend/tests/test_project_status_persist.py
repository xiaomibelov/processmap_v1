"""PATCH /api/projects/{id}: поле `status` должно персиститься с валидацией.

Контракт фронта (frontend/src/features/explorer/explorerStatusCatalog.js):
mapCatalogStatusToProjectApi шлёт в PATCH /api/projects/{id} значения
active / on_hold / done / archived (каталогный «Готово» → API-значение "done").
Отображение (mapProjectStatusToCatalog) читает passport.status и дополнительно
принимает alias'ы completed ("done") и archive ("archived").
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ProjectStatusPersistTest(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app.auth import create_user
        from app.models import CreateProjectIn, UpdateProjectIn
        from app._legacy_main import create_project, get_project, patch_project
        from app.routers.explorer import get_explorer_page
        from app.storage import (
            get_default_org_id,
            get_storage,
            list_audit_log,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.CreateProjectIn = CreateProjectIn
        self.UpdateProjectIn = UpdateProjectIn
        self.create_project = create_project
        self.get_project = get_project
        self.patch_project = patch_project
        self.get_explorer_page = get_explorer_page
        self.list_audit_log = list_audit_log
        self.upsert_org_membership = upsert_org_membership

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        self.admin = create_user(
            "project_status_admin@local",
            "admin",
            is_admin=False,
            full_name="Админ Статусов",
        )
        self.admin_id = str(self.admin.get("id") or "")
        self.upsert_org_membership(self.org_id, self.admin_id, "org_admin")

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

    def _req(self, user: dict):
        return _DummyRequest(user, active_org_id=self.org_id)

    def _create_project(self, title: str = "Проект со статусом") -> str:
        project = self.create_project(
            self.CreateProjectIn(title=title),
            self._req(self.admin),
        )
        return str(project.get("id") or "")

    def _project_status(self, project_id: str) -> str:
        loaded = self.get_project(project_id, self._req(self.admin))
        passport = loaded.get("passport") or {}
        return str(passport.get("status") or "")

    # ─── Контракт пользователя: PATCH status → GET показывает новое значение ───

    def test_patch_status_persists_and_returns_new_value(self):
        pid = self._create_project()
        updated = self.patch_project(
            pid,
            self.UpdateProjectIn(status="on_hold"),
            self._req(self.admin),
        )
        self.assertEqual(str((updated.get("passport") or {}).get("status") or ""), "on_hold")
        # Перезагрузка из storage (аналог reload страницы): значение не должно откатываться.
        self.assertEqual(self._project_status(pid), "on_hold")

    def test_patch_status_accepts_all_frontend_api_values(self):
        # Значения, которые реально шлёт mapCatalogStatusToProjectApi.
        for value in ("active", "on_hold", "done", "archived"):
            pid = self._create_project(title=f"Проект {value}")
            self.patch_project(pid, self.UpdateProjectIn(status=value), self._req(self.admin))
            self.assertEqual(self._project_status(pid), value)

    def test_patch_status_aliases_are_normalized_to_canonical(self):
        # Отображение (mapProjectStatusToCatalog) принимает completed/archive как
        # эквиваленты done/archived — PATCH нормализует их к каноническим значениям.
        pid = self._create_project()
        self.patch_project(pid, self.UpdateProjectIn(status="completed"), self._req(self.admin))
        self.assertEqual(self._project_status(pid), "done")

        self.patch_project(pid, self.UpdateProjectIn(status="archive"), self._req(self.admin))
        self.assertEqual(self._project_status(pid), "archived")

    def test_patch_status_value_visible_in_explorer_page(self):
        pid = self._create_project()
        self.patch_project(pid, self.UpdateProjectIn(status="done"), self._req(self.admin))
        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id="")
        item = next((row for row in page.items if row.get("id") == pid), None)
        self.assertIsNotNone(item)
        self.assertEqual(str(item.get("status") or ""), "done")

    def test_patch_status_invalid_value_raises_400(self):
        pid = self._create_project()
        with self.assertRaises(HTTPException) as err:
            self.patch_project(
                pid,
                self.UpdateProjectIn(status="in_progress"),
                self._req(self.admin),
            )
        self.assertEqual(err.exception.status_code, 400)
        self.assertIn("status", str(err.exception.detail or ""))
        # Невалидное значение не должно ничего менять.
        self.assertEqual(self._project_status(pid), "")

    def test_patch_status_audit_log_contains_old_and_new_status(self):
        pid = self._create_project()
        self.patch_project(pid, self.UpdateProjectIn(status="on_hold"), self._req(self.admin))

        rows = self.list_audit_log(self.org_id, limit=100)
        entry = next(
            (
                row
                for row in rows
                if str(row.get("action") or "") == "project.update"
                and str(row.get("entity_id") or "") == pid
            ),
            None,
        )
        self.assertIsNotNone(entry)
        meta = entry.get("meta") or {}
        self.assertEqual(str(meta.get("status_from") or ""), "active")
        self.assertEqual(str(meta.get("status_to") or ""), "on_hold")
        # Существующее поле meta не ломается.
        self.assertIn("title", meta)

    def test_patch_without_status_keeps_previous_status(self):
        pid = self._create_project()
        self.patch_project(pid, self.UpdateProjectIn(status="on_hold"), self._req(self.admin))
        self.patch_project(pid, self.UpdateProjectIn(title="Новое название"), self._req(self.admin))
        self.assertEqual(self._project_status(pid), "on_hold")


if __name__ == "__main__":
    unittest.main()
