import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


def _status_of(value) -> int:
    status = int(getattr(value, "status_code", 200) or 200)
    return status


class TemplatesApiTest(unittest.TestCase):
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
        from app.main import (
            TemplateCreateIn,
            TemplatePatchIn,
            create_template_endpoint,
            delete_template_endpoint,
            list_templates_endpoint,
            patch_template_endpoint,
        )
        from app.storage import create_org_record, get_default_org_id, get_storage

        self.create_user = create_user
        self.TemplateCreateIn = TemplateCreateIn
        self.TemplatePatchIn = TemplatePatchIn
        self.create_template_endpoint = create_template_endpoint
        self.delete_template_endpoint = delete_template_endpoint
        self.list_templates_endpoint = list_templates_endpoint
        self.patch_template_endpoint = patch_template_endpoint
        self.create_org_record = create_org_record
        self.get_default_org_id = get_default_org_id

        _ = get_storage()

        self.admin = create_user("tpl_admin@local", "admin", is_admin=True)
        self.pm = create_user("tpl_pm@local", "pm", is_admin=False)
        self.viewer = create_user("tpl_viewer@local", "viewer", is_admin=False)
        self.other = create_user("tpl_other@local", "other", is_admin=False)

        self.default_org_id = get_default_org_id()
        self.org_b = create_org_record("Templates Org B", created_by=str(self.admin.get("id") or ""))

        self._insert_membership(self.default_org_id, str(self.admin.get("id") or ""), "org_admin")
        self._insert_membership(self.default_org_id, str(self.pm.get("id") or ""), "project_manager")
        self._insert_membership(self.default_org_id, str(self.viewer.get("id") or ""), "viewer")
        self._insert_membership(self.default_org_id, str(self.other.get("id") or ""), "editor")
        self._insert_membership(str(self.org_b.get("id") or ""), str(self.admin.get("id") or ""), "org_admin")

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

    def _db_path(self) -> Path:
        return Path(self.tmp_sessions.name) / "processmap.sqlite3"

    def _insert_membership(self, org_id: str, user_id: str, role: str):
        with sqlite3.connect(str(self._db_path())) as con:
            con.execute(
                """
                INSERT OR IGNORE INTO org_memberships (org_id, user_id, role, created_at)
                VALUES (?, ?, ?, strftime('%s','now'))
                """,
                [org_id, user_id, role],
            )
            con.execute(
                """
                UPDATE org_memberships
                   SET role = ?
                 WHERE org_id = ? AND user_id = ?
                """,
                [role, org_id, user_id],
            )
            con.commit()

    def _mk_req(self, user: dict, org_id: str):
        return _DummyRequest(user, active_org_id=org_id)

    def _base_payload(self):
        return {"bpmn_element_ids": ["Task_1", "Task_2"], "bpmn_fingerprint": "fp_123"}

    def test_create_personal_template_and_list_only_owner(self):
        req_pm = self._mk_req(self.pm, self.default_org_id)
        created = self.create_template_endpoint(
            self.TemplateCreateIn(
                scope="personal",
                name="My personal",
                payload=self._base_payload(),
            ),
            req_pm,
        )
        self.assertEqual(_status_of(created), 200)
        self.assertEqual(str(created.get("scope") or ""), "personal")
        self.assertEqual(str(created.get("owner_user_id") or ""), str(self.pm.get("id") or ""))

        own_rows = self.list_templates_endpoint(req_pm, scope="personal", q="", limit=50, offset=0)
        self.assertEqual(_status_of(own_rows), 200)
        own_items = own_rows.get("items") if isinstance(own_rows, dict) else []
        self.assertEqual(len(own_items), 1)

        req_other = self._mk_req(self.other, self.default_org_id)
        other_rows = self.list_templates_endpoint(req_other, scope="personal", q="", limit=50, offset=0)
        self.assertEqual(_status_of(other_rows), 200)
        other_items = other_rows.get("items") if isinstance(other_rows, dict) else []
        self.assertEqual(len(other_items), 0)

    def test_org_template_create_forbidden_for_viewer_and_allowed_for_project_manager(self):
        req_viewer = self._mk_req(self.viewer, self.default_org_id)
        denied = self.create_template_endpoint(
            self.TemplateCreateIn(
                scope="org",
                org_id=self.default_org_id,
                name="Shared denied",
                payload=self._base_payload(),
            ),
            req_viewer,
        )
        self.assertEqual(_status_of(denied), 403)

        req_pm = self._mk_req(self.pm, self.default_org_id)
        created = self.create_template_endpoint(
            self.TemplateCreateIn(
                scope="org",
                org_id=self.default_org_id,
                name="Shared by PM",
                payload=self._base_payload(),
            ),
            req_pm,
        )
        self.assertEqual(_status_of(created), 200)
        self.assertEqual(str(created.get("scope") or ""), "org")
        self.assertEqual(str(created.get("org_id") or ""), self.default_org_id)

    def test_org_template_list_scoped_by_org_membership(self):
        req_pm = self._mk_req(self.pm, self.default_org_id)
        created = self.create_template_endpoint(
            self.TemplateCreateIn(
                scope="org",
                org_id=self.default_org_id,
                name="Scoped list",
                payload=self._base_payload(),
            ),
            req_pm,
        )
        self.assertEqual(_status_of(created), 200)

        req_other = self._mk_req(self.other, self.default_org_id)
        listed_default = self.list_templates_endpoint(
            req_other,
            scope="org",
            org_id=self.default_org_id,
            q="",
            limit=50,
            offset=0,
        )
        self.assertEqual(_status_of(listed_default), 200)
        self.assertGreaterEqual(len(listed_default.get("items") or []), 1)

        listed_other_org = self.list_templates_endpoint(
            req_other,
            scope="org",
            org_id=str(self.org_b.get("id") or ""),
            q="",
            limit=50,
            offset=0,
        )
        self.assertEqual(_status_of(listed_other_org), 404)

    def test_org_template_delete_permissions_owner_or_org_admin(self):
        req_pm = self._mk_req(self.pm, self.default_org_id)
        created = self.create_template_endpoint(
            self.TemplateCreateIn(
                scope="org",
                org_id=self.default_org_id,
                name="Delete me",
                payload=self._base_payload(),
            ),
            req_pm,
        )
        self.assertEqual(_status_of(created), 200)
        template_id = str(created.get("id") or "")
        self.assertTrue(template_id)

        req_viewer = self._mk_req(self.viewer, self.default_org_id)
        denied = self.delete_template_endpoint(template_id, req_viewer)
        self.assertEqual(_status_of(denied), 403)

        req_admin = self._mk_req(self.admin, self.default_org_id)
        ok = self.delete_template_endpoint(template_id, req_admin)
        self.assertEqual(_status_of(ok), 204)

        missing = self.delete_template_endpoint(template_id, req_admin)
        self.assertEqual(_status_of(missing), 404)

    def test_patch_template_name_description(self):
        req_pm = self._mk_req(self.pm, self.default_org_id)
        created = self.create_template_endpoint(
            self.TemplateCreateIn(
                scope="personal",
                name="Old Name",
                description="Old Description",
                payload=self._base_payload(),
            ),
            req_pm,
        )
        template_id = str(created.get("id") or "")
        updated = self.patch_template_endpoint(
            template_id,
            self.TemplatePatchIn(name="New Name", description="New Description"),
            req_pm,
        )
        self.assertEqual(_status_of(updated), 200)
        self.assertEqual(str(updated.get("name") or ""), "New Name")
        self.assertEqual(str(updated.get("description") or ""), "New Description")


if __name__ == "__main__":
    unittest.main()
