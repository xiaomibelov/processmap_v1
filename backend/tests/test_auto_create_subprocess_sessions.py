import os
import tempfile
import unittest
from types import SimpleNamespace

from app.auth import create_access_token, create_user
from app.schemas.legacy_api import BpmnXmlIn
from app.services import session_service as svc
from app.services.bpmn_navigation import find_subprocess_elements
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

    def test_bpmn_save_hybrid_reports_has_more_when_more_than_ten(self):
        owner, editor = self._setup_org_and_editor(
            "owner_hybrid_2@local", "editor_hybrid_2@local", "org_hybrid_2"
        )
        sid = self._create_session(str(owner["id"]), "org_hybrid_2", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([f"sub_{i}" for i in range(15)])
        result = self._hybrid_save_bpmn(sid, xml, editor, "org_hybrid_2")

        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("subprocesses_total"), 15)
        self.assertEqual(result.get("subprocesses_created"), 10)
        self.assertTrue(result.get("subprocesses_has_more"))
        children = list_session_children("org_hybrid_2", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 10)

        # Load the rest
        rest = self._create_subprocesses(sid, editor, "org_hybrid_2", load_all=True)
        self.assertEqual(rest["created"], 5)
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


if __name__ == "__main__":
    unittest.main()
if __name__ == "__main__":
    unittest.main()
