import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from types import SimpleNamespace

from app.auth import create_access_token, create_user
from app.schemas.legacy_api import BpmnXmlIn
from app.services import session_service as svc
from app.services.bpmn_navigation import find_subprocess_elements, _local_tag, _shape_bounds
import app._legacy_main as _lm
from app.storage import (
    create_org_record,
    get_storage,
    list_project_sessions_for_explorer,
    list_session_children,
    upsert_org_membership,
    upsert_project_membership,
)


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class TestFindSubprocessElements(unittest.TestCase):
    def test_returns_top_level_subprocess_only(self):
        xml = '''<?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="ns">
          <process id="p">
            <subProcess id="sub_1" name="Prepare" />
            <subProcess id="sub_2" />
            <subProcess id="sub_nested" name="Nested">
              <subProcess id="sub_inner" name="Inner" />
            </subProcess>
          </process>
        </definitions>'''
        result = find_subprocess_elements(xml)
        ids = {e["id"] for e in result}
        self.assertEqual(ids, {"sub_1", "sub_2", "sub_nested"})
        by_id = {e["id"]: e for e in result}
        self.assertEqual(by_id["sub_1"]["name"], "Prepare")
        self.assertIsNone(by_id["sub_2"]["name"])
        self.assertEqual(by_id["sub_nested"]["name"], "Nested")

    def test_returns_empty_for_empty_xml(self):
        self.assertEqual(find_subprocess_elements(""), [])

    def test_returns_empty_for_invalid_xml(self):
        self.assertEqual(find_subprocess_elements("not xml"), [])


class TestSubprocessSessionCreation(unittest.TestCase):
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

        from app.db.config import get_db_runtime_config
        get_db_runtime_config.cache_clear()
        try:
            import app.storage as storage_module
            storage_module._SCHEMA_READY = False
            storage_module._SCHEMA_DB_FILE = ""
            storage_module._PG_POOL = None
        except Exception:
            pass

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

    def _create_session(self, owner_id, org_id, project_id=None, title="test"):
        return self.st.create(
            title=title,
            user_id=owner_id,
            org_id=org_id,
            project_id=project_id,
        )

    def _setup_org_and_editor(self, owner_email, editor_email, org_id, project_id="proj_1"):
        owner = self._make_user(owner_email)
        editor = self._make_user(editor_email)
        create_org_record("Auto Create Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, project_id, str(editor["id"]), "editor")
        return owner, editor

    def _bpmn_with_subprocesses(self, ids, nested=None):
        nested = nested or []
        subs = []
        for sid in ids:
            subs.append(f'<subProcess id="{sid}" name="Sub {sid}" />')
        for parent_id, child_id in nested:
            subs.append(
                f'<subProcess id="{parent_id}" name="Parent {parent_id}">'
                f'<subProcess id="{child_id}" name="Nested {child_id}" />'
                f'</subProcess>'
            )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="ns">'
            '<process id="p1">'
            '<startEvent id="start"/>'
            + "".join(subs)
            + '<endEvent id="end"/>'
            '</process>'
            '</definitions>'
        )

    def _bpmn_with_subprocess_task(self, sub_id, task_name, extra_ids=None):
        subs = [
            f'<subProcess id="{sub_id}" name="Sub {sub_id}">'
            f'<task id="{sub_id}_task" name="{task_name}" />'
            f'</subProcess>'
        ]
        for sid in extra_ids or []:
            subs.append(f'<subProcess id="{sid}" name="Sub {sid}" />')
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="ns">'
            '<process id="p1">'
            '<startEvent id="start"/>'
            + "".join(subs)
            + '<endEvent id="end"/>'
            '</process>'
            '</definitions>'
        )

    def _bpmn_with_subprocess_task_properties(
        self,
        sub_id,
        task_name,
        camunda_props=None,
        *,
        zeebe_props=None,
        preserved_extension="",
        extra_ids=None,
    ):
        camunda_rows = "".join(
            f'<camunda:property name="{name}" value="{value}" />'
            for name, value in (camunda_props or [])
        )
        zeebe_rows = "".join(
            f'<zeebe:property name="{name}" value="{value}" />'
            for name, value in (zeebe_props or [])
        )
        extension_parts = []
        if camunda_rows:
            extension_parts.append(f"<camunda:properties>{camunda_rows}</camunda:properties>")
        if zeebe_rows:
            extension_parts.append(f"<zeebe:properties>{zeebe_rows}</zeebe:properties>")
        if preserved_extension:
            extension_parts.append(preserved_extension)
        extension_xml = (
            f"<bpmn:extensionElements>{''.join(extension_parts)}</bpmn:extensionElements>"
            if extension_parts else ""
        )
        subs = [
            f'<bpmn:subProcess id="{sub_id}" name="Sub {sub_id}">'
            f'<bpmn:task id="{sub_id}_task" name="{task_name}">{extension_xml}</bpmn:task>'
            f'</bpmn:subProcess>'
        ]
        for sid in extra_ids or []:
            subs.append(
                f'<bpmn:subProcess id="{sid}" name="Sub {sid}">'
                f'<bpmn:task id="{sid}_task" name="Task {sid}" />'
                f'</bpmn:subProcess>'
            )
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
            'xmlns:camunda="http://camunda.org/schema/1.0/bpmn" '
            'xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" '
            'id="defs" targetNamespace="ns">'
            '<bpmn:process id="p1">'
            '<bpmn:startEvent id="start"/>'
            + "".join(subs)
            + '<bpmn:endEvent id="end"/>'
            '</bpmn:process>'
            '</bpmn:definitions>'
        )

    def _load_child(self, parent_id, element_id, org_id):
        row = self.st.find_by_parent_element(parent_id, element_id, org_id=org_id)
        self.assertIsNotNone(row)
        return self.st.load(row.id, org_id=org_id, is_admin=True)

    def _child_extension_state(self, parent_id, sub_id, org_id):
        child = self._load_child(parent_id, sub_id, org_id)
        task_id = f"{sub_id}_task"
        meta = child.bpmn_meta.get("camunda_extensions_by_element_id") or {}
        return child, meta.get(task_id) or {}

    def _extension_properties(self, state):
        props = (state.get("properties") or {}).get("extensionProperties") or []
        return [(row.get("name"), row.get("value")) for row in props]

    def _save_bpmn(self, sid, xml, user, org_id):
        # Use the legacy save directly so tests for create_subprocess_sessions
        # run in isolation from the hybrid auto-create-on-save behaviour.
        req = _DummyRequest(user, org_id)
        return _lm.session_bpmn_save(
            sid,
            BpmnXmlIn(
                xml=xml,
                bpmn_meta={},
                source_action="test_save",
                import_note="",
            ),
            request=req,
        )

    def _create_subprocesses(self, sid, user, org_id, load_all=False):
        req = _DummyRequest(user, org_id)
        return svc.create_subprocess_sessions(sid, request=req, load_all=load_all)

    def _count_subprocesses(self, sid, user, org_id):
        req = _DummyRequest(user, org_id)
        return svc.get_subprocesses_count(sid, request=req)

    def _headers(self, token, org_id=None):
        h = {"Authorization": f"Bearer {token}"}
        if org_id:
            h["X-Active-Org-Id"] = org_id
        return h

    def test_bpmn_save_does_not_auto_create_children(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_1@local", "editor_lazy_1@local", "org_lazy_1"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_1", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        result = self._save_bpmn(sid, xml, editor, "org_lazy_1")

        self.assertTrue(result.get("ok"))
        self.assertEqual(len(list_session_children("org_lazy_1", "proj_1", sid, user_id=str(editor["id"]))), 0)

    def test_create_subprocess_sessions_creates_children(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_2@local", "editor_lazy_2@local", "org_lazy_2"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_2", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        self._save_bpmn(sid, xml, editor, "org_lazy_2")

        result = self._create_subprocesses(sid, editor, "org_lazy_2")
        self.assertEqual(result["created"], 2)
        self.assertEqual(result["total"], 2)
        self.assertFalse(result["has_more"])

        children = list_session_children("org_lazy_2", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 2)
        ids = {c["element_id_in_parent"] for c in children}
        self.assertEqual(ids, {"sub_1", "sub_2"})
        for c in children:
            self.assertEqual(c["parent_session_id"], sid)
            self.assertTrue(c["bpmn_xml"])
            self.assertIn(c["element_id_in_parent"], c["bpmn_xml"])

    def test_create_subprocess_sessions_is_idempotent(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_dup@local", "editor_lazy_dup@local", "org_lazy_dup"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_dup", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        self._save_bpmn(sid, xml, editor, "org_lazy_dup")

        self._create_subprocesses(sid, editor, "org_lazy_dup")
        result2 = self._create_subprocesses(sid, editor, "org_lazy_dup")

        self.assertEqual(result2["created"], 0)
        self.assertEqual(result2["total"], 2)
        self.assertFalse(result2["has_more"])
        children = list_session_children("org_lazy_dup", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 2)

    def test_create_subprocess_sessions_batches_ten_and_reports_has_more(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_batch@local", "editor_lazy_batch@local", "org_lazy_batch"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_batch", project_id="proj_1", title="root")
        ids = [f"sub_{i}" for i in range(12)]
        xml = self._bpmn_with_subprocesses(ids)
        self._save_bpmn(sid, xml, editor, "org_lazy_batch")

        result = self._create_subprocesses(sid, editor, "org_lazy_batch")
        self.assertEqual(result["created"], 10)
        self.assertEqual(result["total"], 12)
        self.assertTrue(result["has_more"])
        self.assertEqual(len(list_session_children("org_lazy_batch", "proj_1", sid, user_id=str(editor["id"]))), 10)

    def test_create_subprocess_sessions_load_all_creates_remaining(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_all@local", "editor_lazy_all@local", "org_lazy_all"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_all", project_id="proj_1", title="root")
        ids = [f"sub_{i}" for i in range(12)]
        xml = self._bpmn_with_subprocesses(ids)
        self._save_bpmn(sid, xml, editor, "org_lazy_all")

        self._create_subprocesses(sid, editor, "org_lazy_all")
        result = self._create_subprocesses(sid, editor, "org_lazy_all", load_all=True)
        self.assertEqual(result["created"], 2)
        self.assertEqual(result["total"], 12)
        self.assertFalse(result["has_more"])
        self.assertEqual(len(list_session_children("org_lazy_all", "proj_1", sid, user_id=str(editor["id"]))), 12)

    def test_create_subprocess_sessions_restores_soft_deleted_child(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_restore@local", "editor_lazy_restore@local", "org_lazy_restore"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_restore", project_id="proj_1", title="root")
        xml_with = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        xml_without = self._bpmn_with_subprocesses(["sub_2"])
        self._save_bpmn(sid, xml_with, editor, "org_lazy_restore")
        self._create_subprocesses(sid, editor, "org_lazy_restore")

        parent = self.st.load(sid, org_id="org_lazy_restore", is_admin=True)
        svc.soft_delete_removed_subprocess_sessions(parent, ["sub_2"], request=_DummyRequest(editor, "org_lazy_restore"))
        self.assertEqual(len(list_session_children("org_lazy_restore", "proj_1", sid, user_id=str(editor["id"]))), 1)

        result = self._create_subprocesses(sid, editor, "org_lazy_restore")
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["total"], 2)
        children = list_session_children("org_lazy_restore", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 2)

    def test_soft_delete_keeps_data_in_db(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_soft@local", "editor_lazy_soft@local", "org_lazy_soft"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_soft", project_id="proj_1", title="root")
        xml_with = self._bpmn_with_subprocesses(["sub_1"])
        self._save_bpmn(sid, xml_with, editor, "org_lazy_soft")
        self._create_subprocesses(sid, editor, "org_lazy_soft")

        parent = self.st.load(sid, org_id="org_lazy_soft", is_admin=True)
        svc.soft_delete_removed_subprocess_sessions(parent, [], request=_DummyRequest(editor, "org_lazy_soft"))

        child = self.st.load(
            self.st.find_by_parent_element(sid, "sub_1", org_id="org_lazy_soft").id,
            org_id="org_lazy_soft",
            is_admin=True,
        )
        self.assertTrue(getattr(child, "deleted_at", 0) > 0)
        self.assertTrue(child.bpmn_xml)

    def test_get_subprocesses_count(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_count@local", "editor_lazy_count@local", "org_lazy_count"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_count", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([f"sub_{i}" for i in range(5)])
        self._save_bpmn(sid, xml, editor, "org_lazy_count")

        self.assertEqual(self._count_subprocesses(sid, editor, "org_lazy_count"), 5)

    def test_nested_subprocess_not_created_automatically(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_nested@local", "editor_lazy_nested@local", "org_lazy_nested"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_nested", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([], nested=[("outer", "inner")])
        self._save_bpmn(sid, xml, editor, "org_lazy_nested")

        result = self._create_subprocesses(sid, editor, "org_lazy_nested")
        self.assertEqual(result["created"], 1)
        self.assertEqual(result["total"], 1)
        children = list_session_children("org_lazy_nested", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["element_id_in_parent"], "outer")

    def test_children_count_excludes_deleted(self):
        owner, editor = self._setup_org_and_editor(
            "owner_lazy_meta@local", "editor_lazy_meta@local", "org_lazy_meta"
        )
        sid = self._create_session(str(owner["id"]), "org_lazy_meta", project_id="proj_1", title="root")
        xml_with = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        self._save_bpmn(sid, xml_with, editor, "org_lazy_meta")
        self._create_subprocesses(sid, editor, "org_lazy_meta")

        parent = self.st.load(sid, org_id="org_lazy_meta", is_admin=True)
        svc.soft_delete_removed_subprocess_sessions(parent, ["sub_2"], request=_DummyRequest(editor, "org_lazy_meta"))

        rows = list_project_sessions_for_explorer(
            "org_lazy_meta", "proj_1", root_only=True, include_children_meta=True
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["children_count"], 1)

    def test_endpoint_subprocesses_count_requires_auth(self):
        owner, _ = self._setup_org_and_editor(
            "owner_endpoint_count_auth@local", "editor_endpoint_count_auth@local", "org_endpoint_count_auth"
        )
        sid = self._create_session(str(owner["id"]), "org_endpoint_count_auth", project_id="proj_1", title="root")
        r = self.client.get(f"/api/sessions/{sid}/subprocesses-count")
        self.assertEqual(r.status_code, 401)

    def test_endpoint_subprocesses_count(self):
        owner, editor = self._setup_org_and_editor(
            "owner_endpoint_count@local", "editor_endpoint_count@local", "org_endpoint_count"
        )
        sid = self._create_session(str(owner["id"]), "org_endpoint_count", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([f"sub_{i}" for i in range(3)])
        self._save_bpmn(sid, xml, editor, "org_endpoint_count")

        token = create_access_token(str(editor["id"]))
        r = self.client.get(
            f"/api/sessions/{sid}/subprocesses-count",
            headers=self._headers(token, "org_endpoint_count"),
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"total": 3})

    def test_endpoint_create_subprocesses_batches_and_load_all(self):
        owner, editor = self._setup_org_and_editor(
            "owner_endpoint_create@local", "editor_endpoint_create@local", "org_endpoint_create"
        )
        sid = self._create_session(str(owner["id"]), "org_endpoint_create", project_id="proj_1", title="root")
        ids = [f"sub_{i}" for i in range(12)]
        xml = self._bpmn_with_subprocesses(ids)
        self._save_bpmn(sid, xml, editor, "org_endpoint_create")

        token = create_access_token(str(editor["id"]))
        r = self.client.post(
            f"/api/sessions/{sid}/create-subprocesses",
            headers=self._headers(token, "org_endpoint_create"),
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["created"], 10)
        self.assertEqual(body["total"], 12)
        self.assertTrue(body["has_more"])

        r2 = self.client.post(
            f"/api/sessions/{sid}/create-subprocesses?load_all=true",
            headers=self._headers(token, "org_endpoint_create"),
        )
        self.assertEqual(r2.status_code, 200)
        body2 = r2.json()
        self.assertEqual(body2["created"], 2)
        self.assertFalse(body2["has_more"])

    def test_endpoint_create_subprocesses_forbidden_for_viewer(self):
        owner = self._make_user("owner_endpoint_viewer@local")
        editor = self._make_user("editor_endpoint_viewer@local")
        viewer = self._make_user("viewer_endpoint_viewer@local")
        org_id = "org_endpoint_viewer"
        create_org_record("Viewer Org", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, "proj_1", str(editor["id"]), "editor")
        upsert_org_membership(org_id, str(viewer["id"]), "viewer")
        upsert_project_membership(org_id, "proj_1", str(viewer["id"]), "viewer")

        sid = self._create_session(str(owner["id"]), org_id, project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1"])
        self._save_bpmn(sid, xml, editor, org_id)

        token = create_access_token(str(viewer["id"]))
        r = self.client.post(
            f"/api/sessions/{sid}/create-subprocesses",
            headers=self._headers(token, org_id),
        )
        self.assertEqual(r.status_code, 403)

    def _hybrid_save_bpmn(self, sid, xml, user, org_id):
        req = _DummyRequest(user, org_id)
        return svc.bpmn_save(
            sid,
            BpmnXmlIn(
                xml=xml,
                source_action="test",
                bpmn_meta={},
            ),
            req,
        )

    def test_bpmn_save_hybrid_auto_creates_up_to_ten(self):
        owner, editor = self._setup_org_and_editor(
            "owner_hybrid_1@local", "editor_hybrid_1@local", "org_hybrid_1"
        )
        sid = self._create_session(str(owner["id"]), "org_hybrid_1", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([f"sub_{i}" for i in range(5)])
        result = self._hybrid_save_bpmn(sid, xml, editor, "org_hybrid_1")

        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("subprocesses_total"), 5)
        self.assertEqual(result.get("subprocesses_created"), 5)
        self.assertFalse(result.get("subprocesses_has_more"))
        children = list_session_children("org_hybrid_1", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 5)

    def test_bpmn_save_hybrid_creates_all_when_more_than_ten(self):
        owner, editor = self._setup_org_and_editor(
            "owner_hybrid_2@local", "editor_hybrid_2@local", "org_hybrid_2"
        )
        sid = self._create_session(str(owner["id"]), "org_hybrid_2", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([f"sub_{i}" for i in range(15)])
        result = self._hybrid_save_bpmn(sid, xml, editor, "org_hybrid_2")

        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("subprocesses_total"), 15)
        self.assertEqual(result.get("subprocesses_created"), 15)
        self.assertFalse(result.get("subprocesses_has_more"))
        children = list_session_children("org_hybrid_2", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 15)

        # Loading all after import is idempotent because bpmn_save already
        # materializes every subprocess.
        rest = self._create_subprocesses(sid, editor, "org_hybrid_2", load_all=True)
        self.assertEqual(rest["created"], 0)
        self.assertEqual(rest["total"], 15)
        self.assertFalse(rest["has_more"])
        children = list_session_children("org_hybrid_2", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 15)

    def test_bpmn_save_hybrid_no_button_when_ten_or_fewer(self):
        owner, editor = self._setup_org_and_editor(
            "owner_hybrid_3@local", "editor_hybrid_3@local", "org_hybrid_3"
        )
        sid = self._create_session(str(owner["id"]), "org_hybrid_3", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([f"sub_{i}" for i in range(10)])
        result = self._hybrid_save_bpmn(sid, xml, editor, "org_hybrid_3")

        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("subprocesses_total"), 10)
        self.assertEqual(result.get("subprocesses_created"), 10)
        self.assertFalse(result.get("subprocesses_has_more"))
        children = list_session_children("org_hybrid_3", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 10)

    def test_bpmn_save_refreshes_existing_child_xml(self):
        owner, editor = self._setup_org_and_editor(
            "owner_refresh_1@local", "editor_refresh_1@local", "org_refresh_1"
        )
        sid = self._create_session(str(owner["id"]), "org_refresh_1", project_id="proj_1", title="root")
        xml_a = self._bpmn_with_subprocess_task("sub_1", "Task A")
        result = self._hybrid_save_bpmn(sid, xml_a, editor, "org_refresh_1")
        self.assertTrue(result.get("ok"))
        children = list_session_children("org_refresh_1", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 1)
        self.assertIn("Task A", children[0]["bpmn_xml"])

        xml_b = self._bpmn_with_subprocess_task("sub_1", "Task B")
        result2 = self._hybrid_save_bpmn(sid, xml_b, editor, "org_refresh_1")
        self.assertTrue(result2.get("ok"))

        children2 = list_session_children("org_refresh_1", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children2), 1)
        self.assertEqual(children2[0]["id"], children[0]["id"])
        self.assertIn("Task B", children2[0]["bpmn_xml"])
        self.assertNotIn("Task A", children2[0]["bpmn_xml"])

    def test_bpmn_save_refreshes_restored_child_xml(self):
        owner, editor = self._setup_org_and_editor(
            "owner_refresh_2@local", "editor_refresh_2@local", "org_refresh_2"
        )
        sid = self._create_session(str(owner["id"]), "org_refresh_2", project_id="proj_1", title="root")
        xml_a = self._bpmn_with_subprocess_task("sub_1", "Task A", extra_ids=["sub_2"])
        result = self._hybrid_save_bpmn(sid, xml_a, editor, "org_refresh_2")
        self.assertTrue(result.get("ok"))
        self.assertEqual(len(list_session_children("org_refresh_2", "proj_1", sid, user_id=str(editor["id"]))), 2)

        parent = self.st.load(sid, org_id="org_refresh_2", is_admin=True)
        svc.soft_delete_removed_subprocess_sessions(parent, ["sub_2"], request=_DummyRequest(editor, "org_refresh_2"))
        self.assertEqual(len(list_session_children("org_refresh_2", "proj_1", sid, user_id=str(editor["id"]))), 1)

        xml_b = self._bpmn_with_subprocess_task("sub_1", "Task B", extra_ids=["sub_2"])
        result2 = self._hybrid_save_bpmn(sid, xml_b, editor, "org_refresh_2")
        self.assertTrue(result2.get("ok"))

        children2 = list_session_children("org_refresh_2", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children2), 2)
        child_row = self.st.find_by_parent_element(sid, "sub_1", org_id="org_refresh_2")
        child = self.st.load(child_row.id, org_id="org_refresh_2", is_admin=True)
        self.assertIn("Task B", child.bpmn_xml)
        self.assertNotIn("Task A", child.bpmn_xml)

    def test_bpmn_save_overwrites_existing_child_camunda_properties(self):
        owner, editor = self._setup_org_and_editor(
            "owner_props_1@local", "editor_props_1@local", "org_props_1"
        )
        sid = self._create_session(str(owner["id"]), "org_props_1", project_id="proj_1", title="root")
        xml_a = self._bpmn_with_subprocess_task_properties(
            "sub_1",
            "Task A",
            camunda_props=[("temperature", "old"), ("delete_me", "gone")],
        )
        self.assertTrue(self._hybrid_save_bpmn(sid, xml_a, editor, "org_props_1").get("ok"))

        xml_b = self._bpmn_with_subprocess_task_properties(
            "sub_1",
            "Task B",
            camunda_props=[("temperature", "new"), ("added", "yes")],
        )
        self.assertTrue(self._hybrid_save_bpmn(sid, xml_b, editor, "org_props_1").get("ok"))

        child, state = self._child_extension_state(sid, "sub_1", "org_props_1")
        self.assertIn('name="Task B"', child.bpmn_xml)
        self.assertNotIn('name="Task A"', child.bpmn_xml)
        self.assertEqual(
            self._extension_properties(state),
            [("temperature", "new"), ("added", "yes")],
        )

    def test_bpmn_save_overwrites_existing_child_zeebe_properties_and_preserved_extensions(self):
        owner, editor = self._setup_org_and_editor(
            "owner_props_2@local", "editor_props_2@local", "org_props_2"
        )
        sid = self._create_session(str(owner["id"]), "org_props_2", project_id="proj_1", title="root")
        xml_a = self._bpmn_with_subprocess_task_properties(
            "sub_1",
            "Task A",
            zeebe_props=[("priority", "low"), ("delete_me", "gone")],
            preserved_extension='<camunda:inputOutput><camunda:inputParameter name="mode">old</camunda:inputParameter></camunda:inputOutput>',
        )
        self.assertTrue(self._hybrid_save_bpmn(sid, xml_a, editor, "org_props_2").get("ok"))

        xml_b = self._bpmn_with_subprocess_task_properties(
            "sub_1",
            "Task A",
            zeebe_props=[("priority", "high"), ("added", "yes")],
            preserved_extension='<camunda:inputOutput><camunda:inputParameter name="mode">new</camunda:inputParameter></camunda:inputOutput>',
        )
        self.assertTrue(self._hybrid_save_bpmn(sid, xml_b, editor, "org_props_2").get("ok"))

        _child, state = self._child_extension_state(sid, "sub_1", "org_props_2")
        self.assertEqual(
            self._extension_properties(state),
            [("priority", "high"), ("added", "yes")],
        )
        preserved = "\n".join(state.get("preservedExtensionElements") or [])
        self.assertIn("camunda:inputOutput", preserved)
        self.assertIn("new", preserved)
        self.assertNotIn("old", preserved)

    def test_bpmn_save_refreshes_properties_beyond_first_ten_subprocesses(self):
        owner, editor = self._setup_org_and_editor(
            "owner_props_3@local", "editor_props_3@local", "org_props_3"
        )
        sid = self._create_session(str(owner["id"]), "org_props_3", project_id="proj_1", title="root")
        extra_ids = [f"sub_{i}" for i in range(1, 12)]
        xml_a = self._bpmn_with_subprocess_task_properties(
            "sub_12",
            "Task A",
            camunda_props=[("temperature", "old")],
            extra_ids=extra_ids,
        )
        result_a = self._hybrid_save_bpmn(sid, xml_a, editor, "org_props_3")
        self.assertTrue(result_a.get("ok"))
        self.assertFalse(result_a.get("subprocesses_has_more"))
        self.assertEqual(result_a.get("subprocesses_created"), 12)

        xml_b = self._bpmn_with_subprocess_task_properties(
            "sub_12",
            "Task B",
            camunda_props=[("temperature", "new")],
            extra_ids=extra_ids,
        )
        result_b = self._hybrid_save_bpmn(sid, xml_b, editor, "org_props_3")
        self.assertTrue(result_b.get("ok"))
        rest = self._create_subprocesses(sid, editor, "org_props_3", load_all=True)
        self.assertEqual(rest["created"], 0)
        self.assertEqual(rest["total"], 12)
        self.assertFalse(rest["has_more"])

        child, state = self._child_extension_state(sid, "sub_12", "org_props_3")
        self.assertIn('name="Task B"', child.bpmn_xml)
        self.assertEqual(self._extension_properties(state), [("temperature", "new")])

    def _bpmn_with_nested_subprocess_task(self, outer_id, inner_id, task_name):
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="ns">'
            '<process id="p1">'
            '<startEvent id="start"/>'
            f'<subProcess id="{outer_id}" name="Outer {outer_id}">'
            f'<subProcess id="{inner_id}" name="Inner {inner_id}">'
            f'<task id="{inner_id}_task" name="{task_name}" />'
            f'</subProcess>'
            f'</subProcess>'
            '<endEvent id="end"/>'
            '</process>'
            '</definitions>'
        )

    def test_bpmn_save_soft_deletes_removed_subprocess(self):
        owner, editor = self._setup_org_and_editor(
            "owner_sd_1@local", "editor_sd_1@local", "org_sd_1"
        )
        sid = self._create_session(str(owner["id"]), "org_sd_1", project_id="proj_1", title="root")
        xml_with = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        self.assertTrue(self._hybrid_save_bpmn(sid, xml_with, editor, "org_sd_1").get("ok"))
        self.assertEqual(len(list_session_children("org_sd_1", "proj_1", sid, user_id=str(editor["id"]))), 2)

        xml_without = self._bpmn_with_subprocesses(["sub_2"])
        result = self._hybrid_save_bpmn(sid, xml_without, editor, "org_sd_1")
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("subprocesses_soft_deleted"), 1)

        children = list_session_children("org_sd_1", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["element_id_in_parent"], "sub_2")

        # Data is kept in DB (soft delete only).
        removed_row = self.st.find_by_parent_element(sid, "sub_1", org_id="org_sd_1")
        self.assertIsNotNone(removed_row)
        removed = self.st.load(removed_row.id, org_id="org_sd_1", is_admin=True)
        self.assertTrue(getattr(removed, "deleted_at", 0) > 0)
        self.assertTrue(removed.bpmn_xml)

    def test_bpmn_save_keeps_children_when_nothing_removed(self):
        owner, editor = self._setup_org_and_editor(
            "owner_sd_2@local", "editor_sd_2@local", "org_sd_2"
        )
        sid = self._create_session(str(owner["id"]), "org_sd_2", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        self.assertTrue(self._hybrid_save_bpmn(sid, xml, editor, "org_sd_2").get("ok"))

        result = self._hybrid_save_bpmn(sid, xml, editor, "org_sd_2")
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("subprocesses_soft_deleted"), 0)
        children = list_session_children("org_sd_2", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 2)

    def _bpmn_with_callactivity(self, sub_ids, call_ids):
        parts = [f'<subProcess id="{s}" name="Sub {s}" />' for s in sub_ids]
        parts += [f'<callActivity id="{c}" name="Call {c}" calledElement="p_ext" />' for c in call_ids]
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="ns">'
            '<process id="p1">'
            '<startEvent id="start"/>'
            + "".join(parts)
            + '<endEvent id="end"/>'
            '</process>'
            '</definitions>'
        )

    def test_bpmn_save_keeps_callactivity_child_sessions(self):
        """Keep-list must cover callActivity children (they materialize lazily
        via navigate_to_subprocess), not only subProcess children."""
        owner, editor = self._setup_org_and_editor(
            "owner_ca_1@local", "editor_ca_1@local", "org_ca_1"
        )
        sid = self._create_session(str(owner["id"]), "org_ca_1", project_id="proj_1", title="root")
        xml = self._bpmn_with_callactivity(["sub_1"], ["call_1"])
        self.assertTrue(self._hybrid_save_bpmn(sid, xml, editor, "org_ca_1").get("ok"))

        # Simulate lazy child-session creation for the callActivity (navigate path).
        parent = self.st.load(sid, org_id="org_ca_1", is_admin=True)
        call_child = self.st.find_or_create_child_session(
            parent,
            "call_1",
            '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d2"><process id="p_ext"/></definitions>',
            [{"session_id": sid, "element_id": "call_1"}],
            "Call call_1",
            user_id=str(editor["id"]),
            org_id="org_ca_1",
            is_admin=False,
        )
        self.assertTrue(call_child.id)

        # Reimport the SAME file: the callActivity child must survive.
        result = self._hybrid_save_bpmn(sid, xml, editor, "org_ca_1")
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("subprocesses_soft_deleted"), 0)
        row = self.st.find_by_parent_element(sid, "call_1", org_id="org_ca_1")
        self.assertIsNotNone(row)
        reloaded = self.st.load(row.id, org_id="org_ca_1", is_admin=True)
        self.assertFalse(getattr(reloaded, "deleted_at", 0) > 0)

        # Removing the callActivity from the file DOES soft-delete its child.
        xml2 = self._bpmn_with_callactivity(["sub_1"], [])
        result2 = self._hybrid_save_bpmn(sid, xml2, editor, "org_ca_1")
        self.assertTrue(result2.get("ok"))
        self.assertEqual(result2.get("subprocesses_soft_deleted"), 1)
        reloaded2 = self.st.load(row.id, org_id="org_ca_1", is_admin=True)
        self.assertTrue(getattr(reloaded2, "deleted_at", 0) > 0)

    def test_bpmn_save_unparseable_xml_deletes_nothing(self):
        owner, editor = self._setup_org_and_editor(
            "owner_sd_3@local", "editor_sd_3@local", "org_sd_3"
        )
        sid = self._create_session(str(owner["id"]), "org_sd_3", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1"])
        self.assertTrue(self._hybrid_save_bpmn(sid, xml, editor, "org_sd_3").get("ok"))
        self.assertEqual(len(list_session_children("org_sd_3", "proj_1", sid, user_id=str(editor["id"]))), 1)

        garbage = "<<< this is not xml >>>"
        result = self._hybrid_save_bpmn(sid, garbage, editor, "org_sd_3")
        if result.get("ok"):
            # Legacy save accepted the payload: the safety gate must have
            # skipped the whole subprocess sync (no soft-delete possible).
            self.assertNotIn("subprocesses_soft_deleted", result)
        # Either way: nothing may be deleted when parsing failed.
        children = list_session_children("org_sd_3", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 1)

    def test_bpmn_save_sync_exception_sets_flag_and_deletes_nothing(self):
        import unittest.mock as mock

        owner, editor = self._setup_org_and_editor(
            "owner_sd_4@local", "editor_sd_4@local", "org_sd_4"
        )
        sid = self._create_session(str(owner["id"]), "org_sd_4", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1"])
        self.assertTrue(self._hybrid_save_bpmn(sid, xml, editor, "org_sd_4").get("ok"))
        self.assertEqual(len(list_session_children("org_sd_4", "proj_1", sid, user_id=str(editor["id"]))), 1)

        with mock.patch.object(svc, "auto_create_subprocess_sessions", side_effect=RuntimeError("boom")):
            result = self._hybrid_save_bpmn(sid, xml, editor, "org_sd_4")
        self.assertTrue(result.get("ok"))
        self.assertTrue(result.get("subprocesses_sync_failed"))
        self.assertGreaterEqual(result.get("subprocesses_sync_errors", 0), 1)
        # Exception path: NO deletion may happen.
        children = list_session_children("org_sd_4", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 1)

    def test_bpmn_save_creates_nested_subprocess_sessions(self):
        owner, editor = self._setup_org_and_editor(
            "owner_nested_1@local", "editor_nested_1@local", "org_nested_1"
        )
        sid = self._create_session(str(owner["id"]), "org_nested_1", project_id="proj_1", title="root")
        xml = self._bpmn_with_nested_subprocess_task("outer", "inner", "Inner Task A")
        result = self._hybrid_save_bpmn(sid, xml, editor, "org_nested_1")
        self.assertTrue(result.get("ok"))

        outer_row = self.st.find_by_parent_element(sid, "outer", org_id="org_nested_1")
        self.assertIsNotNone(outer_row)
        inner_row = self.st.find_by_parent_element(outer_row.id, "inner", org_id="org_nested_1")
        self.assertIsNotNone(inner_row)
        inner = self.st.load(inner_row.id, org_id="org_nested_1", is_admin=True)
        self.assertIn("Inner Task A", inner.bpmn_xml)

        # Reimport with a changed nested property: grandchild must be updated.
        xml_b = self._bpmn_with_nested_subprocess_task("outer", "inner", "Inner Task B")
        result_b = self._hybrid_save_bpmn(sid, xml_b, editor, "org_nested_1")
        self.assertTrue(result_b.get("ok"))

        inner_row_b = self.st.find_by_parent_element(outer_row.id, "inner", org_id="org_nested_1")
        self.assertIsNotNone(inner_row_b)
        self.assertEqual(inner_row_b.id, inner_row.id)
        inner_b = self.st.load(inner_row_b.id, org_id="org_nested_1", is_admin=True)
        self.assertIn("Inner Task B", inner_b.bpmn_xml)
        self.assertNotIn("Inner Task A", inner_b.bpmn_xml)

    def test_bpmn_save_soft_deletes_removed_nested_subprocess(self):
        owner, editor = self._setup_org_and_editor(
            "owner_nested_2@local", "editor_nested_2@local", "org_nested_2"
        )
        sid = self._create_session(str(owner["id"]), "org_nested_2", project_id="proj_1", title="root")
        xml = self._bpmn_with_nested_subprocess_task("outer", "inner", "Inner Task A")
        self.assertTrue(self._hybrid_save_bpmn(sid, xml, editor, "org_nested_2").get("ok"))
        outer_row = self.st.find_by_parent_element(sid, "outer", org_id="org_nested_2")
        self.assertIsNotNone(self.st.find_by_parent_element(outer_row.id, "inner", org_id="org_nested_2"))

        # Reimport with the nested subprocess removed from the file.
        xml_b = self._bpmn_with_subprocesses(["outer"])
        self.assertTrue(self._hybrid_save_bpmn(sid, xml_b, editor, "org_nested_2").get("ok"))
        inner_row = self.st.find_by_parent_element(outer_row.id, "inner", org_id="org_nested_2")
        self.assertIsNotNone(inner_row)
        inner = self.st.load(inner_row.id, org_id="org_nested_2", is_admin=True)
        self.assertTrue(getattr(inner, "deleted_at", 0) > 0)

    def test_refresh_child_skips_empty_xml(self):
        child = SimpleNamespace(
            bpmn_xml="<definitions/>",
            bpmn_meta={"camunda_extensions_by_element_id": {"Task_1": {"properties": {}}}},
            activity_count=3,
        )
        changed = svc._refresh_child_session_bpmn_from_xml(child, "")
        self.assertFalse(changed)
        self.assertEqual(child.bpmn_xml, "<definitions/>")
        self.assertEqual(
            child.bpmn_meta,
            {"camunda_extensions_by_element_id": {"Task_1": {"properties": {}}}},
        )
        self.assertEqual(child.activity_count, 3)

    def _bounds_from_xml(self, xml_text, element_id):
        root = ET.fromstring(xml_text)
        for shape in root.iter():
            if _local_tag(shape.tag) == "bpmnshape" and shape.attrib.get("bpmnElement") == element_id:
                return _shape_bounds(shape)
        return None

    def _count_child_bpmn_versions(self, child_id, org_id):
        return self.st.count_bpmn_versions(child_id, org_id=org_id)

    def _child_xml_with_manual_di(self, sub_id, task_name):
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
            'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
            'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
            'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
            'id="Definitions_child" targetNamespace="ns">'
            '<bpmn:process id="Process_child">'
            f'<bpmn:startEvent id="{sub_id}_start" />'
            f'<bpmn:task id="{sub_id}_task" name="{task_name}" />'
            f'<bpmn:sequenceFlow id="{sub_id}_flow" sourceRef="{sub_id}_start" targetRef="{sub_id}_task" />'
            '</bpmn:process>'
            '<bpmndi:BPMNDiagram id="BPMNDiagram_child">'
            '<bpmndi:BPMNPlane id="BPMNPlane_child" bpmnElement="Process_child">'
            f'<bpmndi:BPMNShape id="{sub_id}_start_di" bpmnElement="{sub_id}_start">'
            '<dc:Bounds x="242" y="212" width="36" height="36" />'
            '</bpmndi:BPMNShape>'
            f'<bpmndi:BPMNShape id="{sub_id}_task_di" bpmnElement="{sub_id}_task">'
            '<dc:Bounds x="330" y="190" width="100" height="80" />'
            '</bpmndi:BPMNShape>'
            f'<bpmndi:BPMNEdge id="{sub_id}_flow_di" bpmnElement="{sub_id}_flow" sourceElement="{sub_id}_start" targetElement="{sub_id}_task">'
            '<di:waypoint x="260" y="230" />'
            '<di:waypoint x="380" y="230" />'
            '</bpmndi:BPMNEdge>'
            '</bpmndi:BPMNPlane>'
            '</bpmndi:BPMNDiagram>'
            '</bpmn:definitions>'
        )

    def test_bpmn_save_creates_child_bpmn_version_snapshot_before_overwrite(self):
        owner, editor = self._setup_org_and_editor(
            "owner_snap_1@local", "editor_snap_1@local", "org_snap_1"
        )
        sid = self._create_session(str(owner["id"]), "org_snap_1", project_id="proj_1", title="root")
        xml_a = self._bpmn_with_subprocess_task("sub_1", "Task A")
        self._hybrid_save_bpmn(sid, xml_a, editor, "org_snap_1")

        child_row = self.st.find_by_parent_element(sid, "sub_1", org_id="org_snap_1")
        self.assertIsNotNone(child_row)
        child_id = str(child_row.id)
        initial_version_count = self._count_child_bpmn_versions(child_id, "org_snap_1")

        # Re-save parent with a semantic change inside the subprocess.
        xml_b = self._bpmn_with_subprocess_task("sub_1", "Task B")
        result = self._hybrid_save_bpmn(sid, xml_b, editor, "org_snap_1")
        self.assertTrue(result.get("ok"))

        versions = self.st.list_bpmn_versions(
            child_id, org_id="org_snap_1", include_technical=True, include_xml=True
        )
        sync_versions = [v for v in versions if v.get("source_action") == "subprocess_sync"]
        self.assertEqual(len(sync_versions), 1)
        self.assertIn("Task A", sync_versions[0].get("bpmn_xml", ""))
        self.assertEqual(
            self._count_child_bpmn_versions(child_id, "org_snap_1"),
            initial_version_count + 1,
        )

    def test_bpmn_save_preserves_child_di_during_sync(self):
        owner, editor = self._setup_org_and_editor(
            "owner_di_1@local", "editor_di_1@local", "org_di_1"
        )
        sid = self._create_session(str(owner["id"]), "org_di_1", project_id="proj_1", title="root")
        xml_a = self._bpmn_with_subprocess_task("sub_1", "Task A")
        self._hybrid_save_bpmn(sid, xml_a, editor, "org_di_1")

        child_row = self.st.find_by_parent_element(sid, "sub_1", org_id="org_di_1")
        self.assertIsNotNone(child_row)
        child_id = str(child_row.id)

        # Save a manual layout into the child session.
        manual_xml = self._child_xml_with_manual_di("sub_1", "Task A")
        req = _DummyRequest(editor, "org_di_1")
        svc.bpmn_save(
            child_id,
            BpmnXmlIn(xml=manual_xml, source_action="manual_save", bpmn_meta={}),
            req,
        )

        # Re-save parent with a semantic rename only.
        xml_b = self._bpmn_with_subprocess_task("sub_1", "Task B")
        result = self._hybrid_save_bpmn(sid, xml_b, editor, "org_di_1")
        self.assertTrue(result.get("ok"))

        child = self.st.load(child_id, org_id="org_di_1", is_admin=True)
        bounds = self._bounds_from_xml(child.bpmn_xml, "sub_1_task")
        self.assertIsNotNone(bounds)
        self.assertEqual(bounds["x"], "330")
        self.assertEqual(bounds["y"], "190")
        self.assertIn("Task B", child.bpmn_xml)

    def _bpmn_with_subprocess_two_tasks(self, sub_id, task_a_name, task_b_name):
        return (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="ns">'
            '<bpmn:process id="p1">'
            '<bpmn:startEvent id="start"/>'
            f'<bpmn:subProcess id="{sub_id}" name="Sub {sub_id}">'
            f'<bpmn:task id="{sub_id}_task" name="{task_a_name}" />'
            f'<bpmn:task id="{sub_id}_task2" name="{task_b_name}" />'
            f'<bpmn:sequenceFlow id="{sub_id}_flow" sourceRef="{sub_id}_task" targetRef="{sub_id}_task2" />'
            '</bpmn:subProcess>'
            '<bpmn:endEvent id="end"/>'
            '</bpmn:process>'
            '</bpmn:definitions>'
        )

    def test_bpmn_save_places_new_child_element_in_free_area(self):
        owner, editor = self._setup_org_and_editor(
            "owner_di_2@local", "editor_di_2@local", "org_di_2"
        )
        sid = self._create_session(str(owner["id"]), "org_di_2", project_id="proj_1", title="root")
        xml_a = self._bpmn_with_subprocess_task("sub_1", "Task A")
        self._hybrid_save_bpmn(sid, xml_a, editor, "org_di_2")

        child_row = self.st.find_by_parent_element(sid, "sub_1", org_id="org_di_2")
        self.assertIsNotNone(child_row)
        child_id = str(child_row.id)

        manual_xml = self._child_xml_with_manual_di("sub_1", "Task A")
        req = _DummyRequest(editor, "org_di_2")
        svc.bpmn_save(
            child_id,
            BpmnXmlIn(xml=manual_xml, source_action="manual_save", bpmn_meta={}),
            req,
        )

        # Re-save parent with an additional task inside the subprocess.
        xml_b = self._bpmn_with_subprocess_two_tasks("sub_1", "Task B", "Task C")
        result = self._hybrid_save_bpmn(sid, xml_b, editor, "org_di_2")
        self.assertTrue(result.get("ok"))

        child = self.st.load(child_id, org_id="org_di_2", is_admin=True)
        old_bounds = self._bounds_from_xml(child.bpmn_xml, "sub_1_task")
        new_bounds = self._bounds_from_xml(child.bpmn_xml, "sub_1_task2")
        self.assertIsNotNone(old_bounds)
        self.assertIsNotNone(new_bounds)
        # New shape must be placed to the right of the preserved one.
        self.assertGreater(float(new_bounds["x"]), float(old_bounds["x"]) + float(old_bounds["width"]))


if __name__ == "__main__":
    unittest.main()
