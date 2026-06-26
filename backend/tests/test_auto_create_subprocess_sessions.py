import os
import shutil
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.auth import create_user
from app.schemas.legacy_api import BpmnXmlIn
from app.services import session_service as svc
from app.services.bpmn_navigation import find_subprocess_elements
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


class TestAutoCreateSubprocessSessions(unittest.TestCase):
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
        req = _DummyRequest(user, org_id)
        return svc.session_bpmn_save(
            sid,
            BpmnXmlIn(
                xml=xml,
                bpmn_meta={},
                source_action="test_save",
                import_note="",
            ),
            request=req,
        )

    def test_save_creates_two_child_sessions(self):
        owner, editor = self._setup_org_and_editor(
            "owner_autocreate_2@local", "editor_autocreate_2@local", "org_autocreate_2"
        )
        sid = self._create_session(str(owner["id"]), "org_autocreate_2", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        result = self._save_bpmn(sid, xml, editor, "org_autocreate_2")

        self.assertTrue(result.get("ok"))
        self.assertEqual(result["subprocess_creation"]["created_count"], 2)
        self.assertEqual(result["subprocess_creation"]["total_count"], 2)

        children = list_session_children("org_autocreate_2", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 2)
        ids = {c["element_id_in_parent"] for c in children}
        self.assertEqual(ids, {"sub_1", "sub_2"})
        for c in children:
            self.assertEqual(c["parent_session_id"], sid)
            self.assertTrue(c["bpmn_xml"])
            self.assertIn(c["element_id_in_parent"], c["bpmn_xml"])

    def test_save_does_not_create_duplicates(self):
        owner, editor = self._setup_org_and_editor(
            "owner_autocreate_dup@local", "editor_autocreate_dup@local", "org_autocreate_dup"
        )
        sid = self._create_session(str(owner["id"]), "org_autocreate_dup", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        self._save_bpmn(sid, xml, editor, "org_autocreate_dup")
        result2 = self._save_bpmn(sid, xml, editor, "org_autocreate_dup")

        self.assertEqual(result2["subprocess_creation"]["created_count"], 0)
        self.assertEqual(result2["subprocess_creation"]["total_count"], 2)
        children = list_session_children("org_autocreate_dup", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 2)

    def test_save_restores_soft_deleted_child(self):
        owner, editor = self._setup_org_and_editor(
            "owner_autocreate_restore@local", "editor_autocreate_restore@local", "org_autocreate_restore"
        )
        sid = self._create_session(str(owner["id"]), "org_autocreate_restore", project_id="proj_1", title="root")
        xml_with = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        xml_without = self._bpmn_with_subprocesses(["sub_2"])

        self._save_bpmn(sid, xml_with, editor, "org_autocreate_restore")
        result_delete = self._save_bpmn(sid, xml_without, editor, "org_autocreate_restore")
        self.assertEqual(result_delete["subprocess_creation"]["soft_deleted_count"], 1)
        self.assertEqual(len(list_session_children("org_autocreate_restore", "proj_1", sid, user_id=str(editor["id"]))), 1)

        result_restore = self._save_bpmn(sid, xml_with, editor, "org_autocreate_restore")
        self.assertEqual(result_restore["subprocess_creation"]["restored_count"], 1)
        self.assertEqual(result_restore["subprocess_creation"]["created_count"], 0)
        children = list_session_children("org_autocreate_restore", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 2)

    def test_soft_delete_keeps_data_in_db(self):
        owner, editor = self._setup_org_and_editor(
            "owner_autocreate_soft@local", "editor_autocreate_soft@local", "org_autocreate_soft"
        )
        sid = self._create_session(str(owner["id"]), "org_autocreate_soft", project_id="proj_1", title="root")
        xml_with = self._bpmn_with_subprocesses(["sub_1"])
        xml_without = self._bpmn_with_subprocesses([])
        self._save_bpmn(sid, xml_with, editor, "org_autocreate_soft")
        self._save_bpmn(sid, xml_without, editor, "org_autocreate_soft")

        # Load directly including soft-deleted
        child = self.st.load(
            self.st.find_by_parent_element(sid, "sub_1", org_id="org_autocreate_soft").id,
            org_id="org_autocreate_soft",
            is_admin=True,
        )
        self.assertTrue(getattr(child, "deleted_at", 0) > 0)
        self.assertTrue(child.bpmn_xml)

    def test_save_with_more_than_10_subprocess_uses_async(self):
        owner, editor = self._setup_org_and_editor(
            "owner_autocreate_async@local", "editor_autocreate_async@local", "org_autocreate_async"
        )
        sid = self._create_session(str(owner["id"]), "org_autocreate_async", project_id="proj_1", title="root")
        ids = [f"sub_{i}" for i in range(12)]
        xml = self._bpmn_with_subprocesses(ids)

        with patch("app.tasks.create_remaining_subprocess_sessions") as mock_task:
            result = self._save_bpmn(sid, xml, editor, "org_autocreate_async")

        self.assertEqual(result["subprocess_creation"]["created_count"], 10)
        self.assertTrue(result["subprocess_creation"]["async_pending"])
        self.assertEqual(mock_task.delay.call_count, 1)

    def test_nested_subprocess_not_created_automatically(self):
        owner, editor = self._setup_org_and_editor(
            "owner_autocreate_nested@local", "editor_autocreate_nested@local", "org_autocreate_nested"
        )
        sid = self._create_session(str(owner["id"]), "org_autocreate_nested", project_id="proj_1", title="root")
        xml = self._bpmn_with_subprocesses([], nested=[("outer", "inner")])
        result = self._save_bpmn(sid, xml, editor, "org_autocreate_nested")

        self.assertEqual(result["subprocess_creation"]["created_count"], 1)
        self.assertEqual(result["subprocess_creation"]["total_count"], 1)
        children = list_session_children("org_autocreate_nested", "proj_1", sid, user_id=str(editor["id"]))
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]["element_id_in_parent"], "outer")

    def test_children_count_excludes_deleted(self):
        owner, editor = self._setup_org_and_editor(
            "owner_autocreate_count@local", "editor_autocreate_count@local", "org_autocreate_count"
        )
        sid = self._create_session(str(owner["id"]), "org_autocreate_count", project_id="proj_1", title="root")
        xml_with = self._bpmn_with_subprocesses(["sub_1", "sub_2"])
        xml_without = self._bpmn_with_subprocesses(["sub_2"])
        self._save_bpmn(sid, xml_with, editor, "org_autocreate_count")
        self._save_bpmn(sid, xml_without, editor, "org_autocreate_count")

        rows = list_project_sessions_for_explorer(
            "org_autocreate_count", "proj_1", root_only=True, include_children_meta=True
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["children_count"], 1)


if __name__ == "__main__":
    unittest.main()
