import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class ExplorerContextFolderFieldsTest(unittest.TestCase):
    """Аддитивные поля context.folder (nav-headers part A): status/updated_at.

    Контракт: legacy-поля id/name неизменны; status ← workspace_folders.context_status,
    updated_at ← workspace_folders.updated_at. Поля присутствуют и на cache-hit
    (второй запрос той же страницы).
    """

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
        from app.routers.explorer import (
            CreateFolderBody,
            RenameFolderBody,
            create_folder,
            get_explorer_page,
            rename_folder,
        )
        from app.storage import (
            get_default_org_id,
            get_storage,
            list_org_workspaces,
            upsert_org_membership,
        )

        self.CreateFolderBody = CreateFolderBody
        self.RenameFolderBody = RenameFolderBody
        self.create_folder = create_folder
        self.get_explorer_page = get_explorer_page
        self.rename_folder = rename_folder
        self.upsert_org_membership = upsert_org_membership

        _ = get_storage()
        self.org_id = get_default_org_id()
        self.admin = create_user("explorer_ctx_admin@local", "admin", is_admin=False)
        self.admin_id = str(self.admin.get("id") or "")
        self.upsert_org_membership(self.org_id, self.admin_id, "org_admin")
        self.workspace_id = str(list_org_workspaces(self.org_id)[0].get("id") or "")
        self.folder = self.create_folder(
            self.workspace_id,
            self.CreateFolderBody(name="Раздел контекста"),
            self._req(self.admin),
        )
        self.folder_id = str(self.folder.get("id") or "")

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

    def _context_folder(self):
        page = self.get_explorer_page(
            self._req(self.admin), workspace_id=self.workspace_id, folder_id=self.folder_id,
        )
        return page.context.folder

    def test_context_folder_exposes_status_and_updated_at_additively(self):
        folder = self._context_folder()
        self.assertEqual(folder.id, self.folder_id)
        self.assertEqual(folder.name, "Раздел контекста")
        self.assertEqual(folder.status, "none")
        self.assertGreater(folder.updated_at, 0)

    def test_context_folder_status_follows_context_status(self):
        self.rename_folder(
            self.folder_id,
            self.RenameFolderBody(context_status="as_is"),
            self._req(self.admin),
            workspace_id=self.workspace_id,
        )
        folder = self._context_folder()
        self.assertEqual(folder.status, "as_is")

    def test_context_folder_fields_survive_breadcrumb_cache_hit(self):
        first = self._context_folder()
        second = self._context_folder()  # cache hit path
        self.assertEqual(second.id, first.id)
        self.assertEqual(second.status, first.status)
        self.assertEqual(second.updated_at, first.updated_at)

    def test_root_context_has_no_folder(self):
        page = self.get_explorer_page(self._req(self.admin), workspace_id=self.workspace_id, folder_id="")
        self.assertIsNone(page.context.folder)


if __name__ == "__main__":
    unittest.main()
