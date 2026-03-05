import json
import os
import tempfile
import unittest
from types import SimpleNamespace


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str = "", headers: dict | None = None):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = headers or {}


def _read_response(out):
    if hasattr(out, "status_code"):
        payload = {}
        try:
            payload = json.loads((out.body or b"{}").decode("utf-8"))
        except Exception:
            payload = {}
        return int(getattr(out, "status_code", 0) or 0), payload
    return 200, out if isinstance(out, dict) else {}


class TemplatesRbacTest(unittest.TestCase):
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
            create_template_endpoint,
            delete_template_endpoint,
            list_templates_endpoint,
        )
        from app.storage import (
            get_default_org_id,
            pop_storage_request_scope,
            push_storage_request_scope,
            upsert_org_membership,
        )

        self.create_user = create_user
        self.TemplateCreateIn = TemplateCreateIn
        self.create_template_endpoint = create_template_endpoint
        self.delete_template_endpoint = delete_template_endpoint
        self.list_templates_endpoint = list_templates_endpoint
        self.get_default_org_id = get_default_org_id
        self.push_scope = push_storage_request_scope
        self.pop_scope = pop_storage_request_scope
        self.upsert_org_membership = upsert_org_membership

        self.admin = create_user("tpl_admin@local", "admin", is_admin=False)
        self.manager = create_user("tpl_manager@local", "manager", is_admin=False)
        self.member = create_user("tpl_member@local", "member", is_admin=False)
        self.org_id = get_default_org_id()

        self.upsert_org_membership(self.org_id, str(self.admin.get("id") or ""), "org_admin")
        self.upsert_org_membership(self.org_id, str(self.manager.get("id") or ""), "project_manager")
        self.upsert_org_membership(self.org_id, str(self.member.get("id") or ""), "viewer")

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

    def _scope(self, user: dict):
        uid = str(user.get("id") or "")
        is_admin = bool(user.get("is_admin", False))
        return self.push_scope(uid, is_admin, self.org_id)

    def test_member_cannot_create_org_template(self):
        req = _DummyRequest(self.member, active_org_id=self.org_id)
        token = self._scope(self.member)
        try:
            out = self.create_template_endpoint(
                self.TemplateCreateIn(
                    scope="org",
                    org_id=self.org_id,
                    name="Shared Template",
                    payload={"bpmn_element_ids": ["Task_1"]},
                ),
                req,
            )
        finally:
            self.pop_scope(token)
        status, body = _read_response(out)
        self.assertEqual(status, 403)
        self.assertEqual(str(((body.get("error") or {}).get("code") or "")), "forbidden")

    def test_admin_can_create_org_template_and_member_can_list(self):
        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        token_admin = self._scope(self.admin)
        try:
            created = self.create_template_endpoint(
                self.TemplateCreateIn(
                    scope="org",
                    org_id=self.org_id,
                    name="Org Shared",
                    payload={"bpmn_element_ids": ["Task_1", "Task_2"]},
                ),
                req_admin,
            )
        finally:
            self.pop_scope(token_admin)
        status_created, body_created = _read_response(created)
        self.assertEqual(status_created, 200)
        item = body_created.get("item") or {}
        self.assertTrue(item.get("id"))

        req_member = _DummyRequest(self.member, active_org_id=self.org_id)
        token_member = self._scope(self.member)
        try:
            listed = self.list_templates_endpoint(req_member, scope="org", org_id=self.org_id, limit=50)
        finally:
            self.pop_scope(token_member)
        status_list, body_list = _read_response(listed)
        self.assertEqual(status_list, 200)
        items = body_list.get("items") or []
        self.assertTrue(any(str(row.get("id") or "") == str(item.get("id") or "") for row in items))
        listed_item = next((row for row in items if str(row.get("id") or "") == str(item.get("id") or "")), {})
        self.assertEqual(bool(listed_item.get("can_edit")), False)
        self.assertEqual(bool(listed_item.get("can_delete")), False)

    def test_manager_can_create_and_delete_org_template(self):
        req_manager = _DummyRequest(self.manager, active_org_id=self.org_id)
        token_manager = self._scope(self.manager)
        try:
            created = self.create_template_endpoint(
                self.TemplateCreateIn(
                    scope="org",
                    org_id=self.org_id,
                    name="Manager Template",
                    payload={"bpmn_element_ids": ["Task_1"]},
                ),
                req_manager,
            )
        finally:
            self.pop_scope(token_manager)
        _, body_created = _read_response(created)
        tid = str((body_created.get("item") or {}).get("id") or "")
        self.assertTrue(tid)

        token_delete = self._scope(self.manager)
        try:
            deleted = self.delete_template_endpoint(tid, req_manager)
        finally:
            self.pop_scope(token_delete)
        status_delete, _ = _read_response(deleted)
        self.assertEqual(status_delete, 204)

    def test_member_cannot_delete_foreign_org_template(self):
        req_admin = _DummyRequest(self.admin, active_org_id=self.org_id)
        token_admin = self._scope(self.admin)
        try:
            created = self.create_template_endpoint(
                self.TemplateCreateIn(
                    scope="org",
                    org_id=self.org_id,
                    name="Admin Template",
                    payload={"bpmn_element_ids": ["Task_1"]},
                ),
                req_admin,
            )
        finally:
            self.pop_scope(token_admin)
        _, body_created = _read_response(created)
        tid = str((body_created.get("item") or {}).get("id") or "")
        self.assertTrue(tid)

        req_member = _DummyRequest(self.member, active_org_id=self.org_id)
        token_member = self._scope(self.member)
        try:
            deleted = self.delete_template_endpoint(tid, req_member)
        finally:
            self.pop_scope(token_member)
        status_delete, body_delete = _read_response(deleted)
        self.assertEqual(status_delete, 403)
        self.assertEqual(str(((body_delete.get("error") or {}).get("code") or "")), "forbidden")


if __name__ == "__main__":
    unittest.main()
