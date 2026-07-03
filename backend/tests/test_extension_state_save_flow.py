import os
import tempfile
import unittest
from types import SimpleNamespace

from app.auth import create_access_token, create_user
from app.schemas.legacy_api import BpmnXmlIn
from app.services import session_service as svc
from app.storage import get_storage


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


BPMN_WITH_CAMUNDA_PROPERTY = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="owner" value="ops" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:startEvent>
    <bpmn:subProcess id="Sub_1" name="Subprocess A">
      <bpmn:startEvent id="Start_Sub_1" />
      <bpmn:endEvent id="End_Sub_1" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>"""


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

    def test_bpmn_save_extracts_camunda_property_into_meta(self):
        admin = create_user("admin_ext_save@local", "password", is_admin=True)
        sid = self.st.create(
            title="ext-save-test",
            user_id=str(admin["id"]),
        )

        save_out = svc.bpmn_save(
            sid,
            BpmnXmlIn(xml=BPMN_WITH_CAMUNDA_PROPERTY, source_action="manual_save"),
            request=None,
        )
        self.assertTrue(save_out.get("ok"), save_out)
        base_version = int(save_out.get("diagram_state_version") or 0)
        self.assertGreater(base_version, 0)

        sess = self.st.load(sid, is_admin=True)
        camunda_map = (sess.bpmn_meta or {}).get("camunda_extensions_by_element_id") or {}
        start_event = camunda_map.get("StartEvent_1") or {}
        properties = (start_event.get("properties") or {}).get("extensionProperties") or []
        self.assertEqual(len(properties), 1)
        self.assertEqual(properties[0].get("name"), "owner")
        self.assertEqual(properties[0].get("value"), "ops")


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

    def _headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_put_bpmn_xml_extracts_camunda_property(self):
        admin = create_user("admin_ext_http@local", "password", is_admin=True)
        token = create_access_token(str(admin["id"]))

        # Create session via HTTP
        r = self.client.post(
            "/api/sessions",
            json={"title": "ext-http-test"},
            headers=self._headers(token),
        )
        self.assertEqual(r.status_code, 200, r.text)
        sid = r.json()["id"]

        # Save BPMN via HTTP
        r = self.client.put(
            f"/api/sessions/{sid}/bpmn",
            json={
                "xml": BPMN_WITH_CAMUNDA_PROPERTY,
                "source_action": "property_update",
                "base_diagram_state_version": 0,
            },
            headers=self._headers(token),
        )
        self.assertEqual(r.status_code, 200, r.text)
        save_body = r.json()
        self.assertTrue(save_body.get("ok"), save_body)
        self.assertIsNone(save_body.get("bpmn_version_snapshot"))
        self.assertGreater(int(save_body.get("diagram_state_version") or 0), 0)

        sess = self.st.load(sid, is_admin=True)
        camunda_map = (sess.bpmn_meta or {}).get("camunda_extensions_by_element_id") or {}
        start_event = camunda_map.get("StartEvent_1") or {}
        properties = (start_event.get("properties") or {}).get("extensionProperties") or []
        self.assertEqual(len(properties), 1)
        self.assertEqual(properties[0].get("name"), "owner")


if __name__ == "__main__":
    unittest.main()
