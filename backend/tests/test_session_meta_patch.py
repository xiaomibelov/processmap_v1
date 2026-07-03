import os
import shutil
import tempfile
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.auth import create_user
from app.schemas.legacy_api import SessionMetaPatchIn
from app.services import session_service as svc
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class TestSessionMetaPatch(unittest.TestCase):
    def setUp(self):
        self._orig_process_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self._orig_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self._temp_dir = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "projects")
        os.makedirs(os.environ["PROCESS_STORAGE_DIR"], exist_ok=True)
        os.makedirs(os.environ["PROJECT_STORAGE_DIR"], exist_ok=True)
        self.st = get_storage()

    def tearDown(self):
        self._temp_dir.cleanup()
        if self._orig_process_storage_dir is not None:
            os.environ["PROCESS_STORAGE_DIR"] = self._orig_process_storage_dir
        else:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        if self._orig_project_storage_dir is not None:
            os.environ["PROJECT_STORAGE_DIR"] = self._orig_project_storage_dir
        else:
            os.environ.pop("PROJECT_STORAGE_DIR", None)

    def _make_user(self, email, is_admin=False):
        return create_user(email, "password", is_admin=is_admin)

    def _create_session(self, owner_id, org_id, project_id=None, title="test"):
        return self.st.create(
            title=title,
            user_id=owner_id,
            org_id=org_id,
            project_id=project_id,
        )

    def _setup_org_and_members(self, owner_email, editor_email, org_id):
        owner = self._make_user(owner_email)
        editor = self._make_user(editor_email)
        create_org_record("Meta Patch Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        return owner, editor

    def test_editor_meta_patch_increments_diagram_state_version(self):
        owner, editor = self._setup_org_and_members(
            "owner_meta_patch@local", "editor_meta_patch@local", "org_meta_patch"
        )
        sid = self._create_session(str(owner["id"]), "org_meta_patch", project_id="proj_1", title="meta-patch")
        req = _DummyRequest(editor, "org_meta_patch")

        before = self.st.load(sid, org_id="org_meta_patch", is_admin=True)
        base_version = int(getattr(before, "diagram_state_version", 0) or 0)

        inp = SessionMetaPatchIn(
            bpmn_meta_json={"custom_key": "custom_value"},
            base_diagram_state_version=base_version,
        )
        result = svc.meta_patch(sid, inp, request=req)

        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("id"), sid)
        self.assertEqual(result.get("diagram_state_version"), base_version + 1)

        after = self.st.load(sid, org_id="org_meta_patch", is_admin=True)
        self.assertEqual(int(after.diagram_state_version or 0), base_version + 1)
        self.assertEqual(after.bpmn_meta.get("custom_key"), "custom_value")

    def test_meta_patch_409_when_base_version_stale(self):
        owner, editor = self._setup_org_and_members(
            "owner_meta_patch_stale@local", "editor_meta_patch_stale@local", "org_meta_patch_stale"
        )
        sid = self._create_session(str(owner["id"]), "org_meta_patch_stale", project_id="proj_1", title="meta-patch-stale")
        req = _DummyRequest(editor, "org_meta_patch_stale")

        before = self.st.load(sid, org_id="org_meta_patch_stale", is_admin=True)
        base_version = int(getattr(before, "diagram_state_version", 0) or 0)

        # Bump the version externally via the meta patch itself.
        self.st.patch_session_meta(
            sid,
            {"seed": True},
            base_version,
            user_id=str(owner["id"]),
            org_id="org_meta_patch_stale",
            is_admin=True,
        )

        inp = SessionMetaPatchIn(
            bpmn_meta_json={"custom_key": "custom_value"},
            base_diagram_state_version=base_version,
        )
        with self.assertRaises(HTTPException) as cm:
            svc.meta_patch(sid, inp, request=req)
        self.assertEqual(cm.exception.status_code, 409)
        detail = cm.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail.get("code"), "DIAGRAM_STATE_CONFLICT")
        self.assertGreaterEqual(detail.get("server_current_version", 0), base_version + 1)

    def test_meta_patch_404_for_missing_session(self):
        editor = self._make_user("editor_meta_patch_missing@local")
        org_id = "org_meta_patch_missing"
        create_org_record("Missing Org", created_by=str(editor["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        req = _DummyRequest(editor, org_id)

        result = svc.meta_patch("nonexistent_session", SessionMetaPatchIn(
            bpmn_meta_json={"custom_key": "custom_value"},
            base_diagram_state_version=0,
        ), request=req)
        self.assertIn("error", result)

    def test_viewer_cannot_meta_patch(self):
        owner = self._make_user("owner_meta_patch_viewer@local")
        viewer = self._make_user("viewer_meta_patch_viewer@local")
        org_id = "org_meta_patch_viewer"
        create_org_record("Viewer Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(viewer["id"]), "viewer")
        upsert_project_membership(org_id, "proj_1", str(viewer["id"]), "viewer")
        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="meta-patch-viewer")
        req = _DummyRequest(viewer, org_id)

        with self.assertRaises(HTTPException) as cm:
            svc.meta_patch(sid, SessionMetaPatchIn(
                bpmn_meta_json={"custom_key": "custom_value"},
                base_diagram_state_version=0,
            ), request=req)
        self.assertEqual(cm.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
