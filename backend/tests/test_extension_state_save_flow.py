import os
import tempfile
import unittest
from types import SimpleNamespace

from app.auth import create_access_token, create_user
from app.schemas.legacy_api import BpmnXmlIn
from app.services import session_service as svc
from app.storage import (
    create_org_record,
    get_storage,
    upsert_org_membership,
    upsert_project_membership,
)


BPMN_WITH_SUBPROCESS = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:subProcess id="Sub_1" name="Subprocess A">
      <bpmn:startEvent id="Start_Sub_1" />
      <bpmn:endEvent id="End_Sub_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>"""


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class _BaseTestCase(unittest.TestCase):
    def _clear_env_caches(self):
        try:
            from app.db.config import get_db_runtime_config
            get_db_runtime_config.cache_clear()
        except Exception:
            pass
        try:
            import app.storage as storage_module
            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass


class TestExtensionStateSaveFlow(_BaseTestCase):
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

    def _setup_org(self, owner_email, editor_email, org_id):
        owner = self._make_user(owner_email)
        editor = self._make_user(editor_email)
        create_org_record("Extension State Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        return owner, editor

    def test_bpmn_save_then_extension_meta_patch_succeeds(self):
        owner, editor = self._setup_org(
            "owner_ext_save@local", "editor_ext_save@local", "org_ext_save"
        )
        sid = self.st.create(
            title="ext-save-test",
            user_id=str(owner["id"]),
            org_id="org_ext_save",
            project_id="proj_1",
        )
        req = _DummyRequest(editor, "org_ext_save")

        save_out = svc.bpmn_save(
            sid,
            BpmnXmlIn(xml=BPMN_WITH_SUBPROCESS, source_action="manual_save"),
            request=req,
        )
        self.assertTrue(save_out.get("ok"), save_out)
        base_version = int(save_out.get("diagram_state_version") or 0)
        self.assertGreater(base_version, 0)

        next_meta = {
            "version": 1,
            "flow_meta": {},
            "node_path_meta": {},
            "robot_meta_by_element_id": {},
            "camunda_extensions_by_element_id": {
                "StartEvent_1": {
                    "properties": [
                        {"key": "owner", "value": "ops"},
                    ],
                },
            },
            "presentation_by_element_id": {},
            "hybrid_layer_by_element_id": {},
            "execution_plans": [],
        }
        patch_out = svc.patch_session_meta(
            sid,
            type("SessionMetaPatchIn", (), {
                "bpmn_meta_json": next_meta,
                "bpmn_meta": None,
                "base_diagram_state_version": base_version,
                "base_bpmn_xml_version": None,
            })(),
            request=req,
        )
        self.assertTrue(patch_out.get("ok"), patch_out)
        self.assertGreater(int(patch_out.get("diagram_state_version") or 0), base_version)


class TestExtensionStateSaveHttpFlow(_BaseTestCase):
    def setUp(self):
        self._orig_process_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self._orig_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self._orig_db_path = os.environ.get("PROCESS_DB_PATH")
        self._orig_db_backend = os.environ.get("FPC_DB_BACKEND")
        self._orig_database_url = os.environ.get("DATABASE_URL")
        self._temp_dir = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = os.path.join(self._temp_dir.name, "projects")
        os.environ["PROCESS_DB_PATH"] = os.path.join(self._temp_dir.name, "processmap.sqlite3")
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")
        self._clear_env_caches()

        from app.startup.app_factory import create_app
        self.app = create_app()
        self.client = __import__("fastapi.testclient", fromlist=["TestClient"]).TestClient(self.app)
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
        if self._orig_db_path is not None:
            os.environ["PROCESS_DB_PATH"] = self._orig_db_path
        else:
            os.environ.pop("PROCESS_DB_PATH", None)
        if self._orig_db_backend is not None:
            os.environ["FPC_DB_BACKEND"] = self._orig_db_backend
        else:
            os.environ.pop("FPC_DB_BACKEND", None)
        if self._orig_database_url is not None:
            os.environ["DATABASE_URL"] = self._orig_database_url

    def _make_user(self, email, is_admin=False):
        return create_user(email, "password", is_admin=is_admin)

    def _headers(self, token, org_id=None):
        h = {"Authorization": f"Bearer {token}"}
        if org_id:
            h["X-Active-Org-Id"] = org_id
        return h

    def test_patch_session_meta_via_http_after_bpmn_save(self):
        owner = self._make_user("owner_ext_http@local")
        editor = self._make_user("editor_ext_http@local")
        org_id = "org_ext_http"
        create_org_record("Extension State HTTP Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")

        token = create_access_token(str(editor["id"]))

        # Create session via HTTP
        r = self.client.post(
            "/api/sessions",
            json={"title": "ext-http-test", "project_id": "proj_1"},
            headers=self._headers(token, org_id),
        )
        self.assertEqual(r.status_code, 200, r.text)
        sid = r.json()["id"]

        # Save BPMN via HTTP
        r = self.client.put(
            f"/api/sessions/{sid}/bpmn",
            json={
                "xml": BPMN_WITH_SUBPROCESS,
                "source_action": "manual_save",
                "base_diagram_state_version": 0,
            },
            headers=self._headers(token, org_id),
        )
        self.assertEqual(r.status_code, 200, r.text)
        save_body = r.json()
        self.assertTrue(save_body.get("ok"), save_body)
        base_version = int(save_body.get("diagram_state_version") or 0)
        self.assertGreater(base_version, 0)

        # Patch extension-state meta via HTTP
        r = self.client.patch(
            f"/api/sessions/{sid}/meta",
            json={
                "bpmn_meta_json": {
                    "version": 1,
                    "flow_meta": {},
                    "node_path_meta": {},
                    "robot_meta_by_element_id": {},
                    "camunda_extensions_by_element_id": {
                        "StartEvent_1": {
                            "properties": [
                                {"key": "owner", "value": "ops"},
                            ],
                        },
                    },
                    "presentation_by_element_id": {},
                    "hybrid_layer_by_element_id": {},
                    "execution_plans": [],
                },
                "base_diagram_state_version": base_version,
            },
            headers=self._headers(token, org_id),
        )
        self.assertEqual(r.status_code, 200, r.text)
        patch_body = r.json()
        self.assertTrue(patch_body.get("ok"), patch_body)
        self.assertGreater(int(patch_body.get("diagram_state_version") or 0), base_version)


if __name__ == "__main__":
    unittest.main()
