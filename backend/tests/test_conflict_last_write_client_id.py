"""fix/self-conflict-silent-rebase B1: writer-info (client_id) во ВСЕХ путях
диаграммной записи — включая session PATCH (interview autosave / meta).

Баг: patch_session вызывал _mark_diagram_truth_write БЕЗ client_id, поэтому
409-payload нёс server_last_write.client_id == "" и фронтенд-классификатор
видел ложный same_user_other_tab (модал «другой вашей вкладке» при одной
вкладке), а same_tab auto-resolve не срабатывал.
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

SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_A" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_A" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task A">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>
"""

# Отличающийся XML (другой id/name) — нужен, чтобы PUT не попадал под
# no-op guard (идентичный XML + base <= current = 200 без бампа версии).
SAMPLE_BPMN_XML_B = SAMPLE_BPMN_XML.replace(
    'id="Definitions_A"', 'id="Definitions_B"'
).replace('id="Process_A"', 'id="Process_B"').replace('name="Task A"', 'name="Task B"')


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str, client_id: str = ""):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}
        if client_id:
            self.headers["x-client-id"] = client_id
        self.query_params = {}
        self.scope = {"type": "http"}


class ConflictLastWriteClientIdTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app._legacy_main import (
            AnswerIn,
            BpmnXmlIn,
            CreateNodeIn,
            CreateSessionIn,
            NotesIn,
            UpdateSessionIn,
            add_node,
            answer,
            create_session,
            get_storage,
            patch_session,
            post_notes,
            session_bpmn_save,
        )
        from app.models import Node, Question
        from app.storage import get_default_org_id

        self.AnswerIn = AnswerIn
        self.BpmnXmlIn = BpmnXmlIn
        self.CreateNodeIn = CreateNodeIn
        self.CreateSessionIn = CreateSessionIn
        self.NotesIn = NotesIn
        self.UpdateSessionIn = UpdateSessionIn
        self.add_node = add_node
        self.answer = answer
        self.create_session = create_session
        self.get_storage = get_storage
        self.patch_session = patch_session
        self.post_notes = post_notes
        self.session_bpmn_save = session_bpmn_save
        self.Node = Node
        self.Question = Question
        self.default_org_id = get_default_org_id()

        created = self.create_session(self.CreateSessionIn(title="client-id test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        self.user = {
            "id": "cid_admin_user",
            "email": "cid_admin_user@test.local",
            "is_admin": True,
        }

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

    def _req(self, client_id: str = "") -> _DummyRequest:
        return _DummyRequest(self.user, active_org_id=self.default_org_id, client_id=client_id)

    def _seed_xml_version_1(self) -> None:
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, base_diagram_state_version=0),
            self._req("xml-client"),
        )
        self.assertEqual(out.get("ok"), True)

    def test_patch_session_diagram_write_records_client_id_in_last_write(self):
        self._seed_xml_version_1()
        req = self._req("meta-client-abc")
        out = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                interview={"answers": {"q1": "a1"}},
                base_diagram_state_version=1,
            ),
            req,
        )
        self.assertFalse(str(out.get("error") or ""), out)

        sess = self.get_storage().load(self.sid, is_admin=True)
        self.assertEqual(str(getattr(sess, "diagram_last_write_client_id", "") or ""), "meta-client-abc")
        self.assertEqual(
            list(getattr(sess, "diagram_last_write_changed_keys", []) or []),
            ["interview"],
        )

    def test_conflict_payload_after_meta_write_contains_client_id(self):
        self._seed_xml_version_1()
        meta_req = self._req("meta-client-abc")
        self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                interview={"answers": {"q1": "a1"}},
                base_diagram_state_version=1,
            ),
            meta_req,
        )

        # stale PUT (base=1) → 409; server_last_write должен атрибутировать
        # meta-client-abc, а не пустую строку.
        with self.assertRaises(HTTPException) as cm:
            self.session_bpmn_save(
                self.sid,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_B, base_diagram_state_version=1),
                self._req("xml-client"),
            )
        self.assertEqual(int(getattr(cm.exception, "status_code", 0) or 0), 409)
        detail = getattr(cm.exception, "detail", {}) or {}
        last_write = detail.get("server_last_write") or {}
        self.assertEqual(str(last_write.get("client_id") or ""), "meta-client-abc")
        self.assertEqual(list(last_write.get("changed_keys") or []), ["interview"])
        self.assertEqual(str(last_write.get("actor_user_id") or ""), "cid_admin_user")

    def test_bpmn_put_keeps_recording_client_id(self):
        self._seed_xml_version_1()
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_B, base_diagram_state_version=1),
            self._req("xml-client-2"),
        )
        self.assertEqual(out.get("ok"), True)
        sess = self.get_storage().load(self.sid, is_admin=True)
        self.assertEqual(str(getattr(sess, "diagram_last_write_client_id", "") or ""), "xml-client-2")

    def _last_write_client_id(self, sid: str) -> str:
        sess = self.get_storage().load(sid, is_admin=True)
        return str(getattr(sess, "diagram_last_write_client_id", "") or "")

    def test_graph_node_write_records_client_id(self):
        # Draft-модель сессия (без bpmn_xml): nodes/edges пишутся легально.
        created = self.create_session(self.CreateSessionIn(title="graph client-id"))
        sid = str(created.get("id") or "")
        req = self._req("graph-client-1")
        out = self.add_node(
            sid,
            self.CreateNodeIn(title="Шаг 1", type="step", base_diagram_state_version=0),
            req,
        )
        self.assertFalse(str(out.get("error") or ""), out)
        self.assertEqual(self._last_write_client_id(sid), "graph-client-1")

    def test_answer_write_records_client_id(self):
        created = self.create_session(self.CreateSessionIn(title="answers client-id"))
        sid = str(created.get("id") or "")
        st = self.get_storage()
        s = st.load(sid, is_admin=True)
        s.nodes = [
            self.Node(id="n_1", title="Step 1", parameters={}, equipment=[], disposition={}),
        ]
        s.questions = [
            self.Question(
                id="q_1",
                node_id="n_1",
                issue_type="MISSING",
                question="Какой параметр?",
                target={"field": "parameters.recipe_name", "mode": "set", "transform": "text"},
                status="open",
            ),
        ]
        st.save(s, is_admin=True)

        out = self.answer(
            sid,
            self.AnswerIn(question_id="q_1", answer="Тестовый ответ", base_diagram_state_version=0),
            self._req("answers-client-1"),
        )
        self.assertFalse(str(out.get("error") or ""), out)
        self.assertEqual(self._last_write_client_id(sid), "answers-client-1")

    def test_notes_write_records_client_id(self):
        created = self.create_session(self.CreateSessionIn(title="notes client-id"))
        sid = str(created.get("id") or "")
        out = self.post_notes(
            sid,
            self.NotesIn(notes="Первичные заметки", base_diagram_state_version=0),
            self._req("notes-client-1"),
        )
        self.assertFalse(str(out.get("error") or ""), out)
        self.assertEqual(self._last_write_client_id(sid), "notes-client-1")


if __name__ == "__main__":
    unittest.main()
