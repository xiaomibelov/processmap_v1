import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SAMPLE_BPMN_XML_A = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_A" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_A" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task A">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
"""

SAMPLE_BPMN_XML_B = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_B" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_B" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task B">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
"""


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}
        self.query_params = {}
        self.scope = {"type": "http"}


class DiagramCasGuardTests(unittest.TestCase):
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
            BpmnMetaPatchIn,
            BpmnRestoreIn,
            BpmnXmlIn,
            CreateEdgeIn,
            CreateNodeIn,
            CreateSessionIn,
            NodePatchIn,
            NotesIn,
            UpdateSessionIn,
            add_edge,
            add_node,
            answer,
            answer_v2,
            create_session,
            delete_edge,
            delete_node,
            get_storage,
            patch_session,
            patch_node,
            post_notes,
            session_bpmn_meta_patch,
            session_bpmn_restore,
            session_bpmn_save,
        )
        from app.models import Node, Question
        from app.storage import get_default_org_id

        self.AnswerIn = AnswerIn
        self.BpmnMetaPatchIn = BpmnMetaPatchIn
        self.BpmnRestoreIn = BpmnRestoreIn
        self.BpmnXmlIn = BpmnXmlIn
        self.CreateEdgeIn = CreateEdgeIn
        self.CreateNodeIn = CreateNodeIn
        self.CreateSessionIn = CreateSessionIn
        self.Node = Node
        self.NodePatchIn = NodePatchIn
        self.NotesIn = NotesIn
        self.Question = Question
        self.UpdateSessionIn = UpdateSessionIn
        self.add_edge = add_edge
        self.add_node = add_node
        self.answer = answer
        self.answer_v2 = answer_v2
        self.create_session = create_session
        self.delete_edge = delete_edge
        self.delete_node = delete_node
        self.get_storage = get_storage
        self.patch_session = patch_session
        self.patch_node = patch_node
        self.post_notes = post_notes
        self.session_bpmn_meta_patch = session_bpmn_meta_patch
        self.session_bpmn_restore = session_bpmn_restore
        self.session_bpmn_save = session_bpmn_save
        self.default_org_id = get_default_org_id()

        created = self.create_session(self.CreateSessionIn(title="CAS test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        self.req = _DummyRequest(
            {
                "id": "cas_admin_user",
                "email": "cas_admin_user@test.local",
                "is_admin": True,
            },
            active_org_id=self.default_org_id,
        )

    def _load_admin(self):
        return self.get_storage().load(self.sid, is_admin=True)

    def _seed_answer_fixture(self):
        st = self.get_storage()
        s = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(s)
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

    def test_fresh_bpmn_write_accepts_matching_base_version(self):
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=SAMPLE_BPMN_XML_A,
                base_diagram_state_version=0,
            ),
            self.req,
        )
        self.assertEqual(out.get("ok"), True)
        self.assertEqual(int(out.get("diagram_state_version") or 0), 1)

    def test_missing_base_version_rejected_for_diagram_write(self):
        with self.assertRaises(HTTPException) as cm:
            self.session_bpmn_save(
                self.sid,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_A),
                self.req,
            )
        self.assertEqual(int(getattr(cm.exception, "status_code", 0) or 0), 409)
        detail = getattr(cm.exception, "detail", {})
        self.assertEqual(str((detail or {}).get("code") or ""), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")
        self.assertEqual(str((detail or {}).get("session_id") or ""), self.sid)

    def test_stale_bpmn_write_rejected_with_conflict_payload_and_no_silent_overwrite(self):
        first = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=SAMPLE_BPMN_XML_A,
                base_diagram_state_version=0,
            ),
            self.req,
        )
        self.assertEqual(first.get("ok"), True)
        self.assertEqual(int(first.get("diagram_state_version") or 0), 1)

        with self.assertRaises(HTTPException) as stale:
            self.session_bpmn_save(
                self.sid,
                self.BpmnXmlIn(
                    xml=SAMPLE_BPMN_XML_B,
                    base_diagram_state_version=0,
                ),
                self.req,
            )
        self.assertEqual(int(getattr(stale.exception, "status_code", 0) or 0), 409)
        detail = getattr(stale.exception, "detail", {})
        self.assertEqual(str((detail or {}).get("code") or ""), "DIAGRAM_STATE_CONFLICT")
        self.assertEqual(int((detail or {}).get("client_base_version", -1)), 0)
        self.assertEqual(int((detail or {}).get("server_current_version", -1)), 1)
        self.assertEqual(str((detail or {}).get("session_id") or ""), self.sid)
        last_write = (detail or {}).get("server_last_write") or {}
        self.assertEqual(str(last_write.get("actor_user_id") or ""), "cas_admin_user")
        self.assertIn("bpmn_xml", list(last_write.get("changed_keys") or []))

        st = self.get_storage()
        reloaded = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(reloaded)
        self.assertEqual(str(getattr(reloaded, "bpmn_xml", "") or ""), SAMPLE_BPMN_XML_A)
        self.assertEqual(int(getattr(reloaded, "diagram_state_version", 0) or 0), 1)

    def test_patch_session_diagram_write_obeys_cas(self):
        self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=SAMPLE_BPMN_XML_A,
                base_diagram_state_version=0,
            ),
            self.req,
        )

        with self.assertRaises(HTTPException) as stale:
            self.patch_session(
                self.sid,
                self.UpdateSessionIn(
                    bpmn_meta={"flow_meta": {"Flow_1": {"tier": "P0"}}},
                    base_diagram_state_version=0,
                ),
                self.req,
            )
        self.assertEqual(int(getattr(stale.exception, "status_code", 0) or 0), 409)
        self.assertEqual(str((getattr(stale.exception, "detail", {}) or {}).get("code") or ""), "DIAGRAM_STATE_CONFLICT")

        fresh = self.patch_session(
            self.sid,
            self.UpdateSessionIn(
                bpmn_meta={"flow_meta": {"Flow_1": {"tier": "P0"}}},
                base_diagram_state_version=1,
            ),
            self.req,
        )
        self.assertEqual(int(fresh.get("diagram_state_version") or 0), 2)

    def test_multiple_diagram_write_paths_are_cas_guarded(self):
        save_a = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=SAMPLE_BPMN_XML_A,
                base_diagram_state_version=0,
                source_action="import_bpmn",
            ),
            self.req,
        )
        self.assertEqual(save_a.get("ok"), True)
        self.assertEqual(int(save_a.get("diagram_state_version") or 0), 1)

        save_b = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=SAMPLE_BPMN_XML_B,
                base_diagram_state_version=1,
                source_action="import_bpmn",
            ),
            self.req,
        )
        self.assertEqual(save_b.get("ok"), True)
        self.assertEqual(int(save_b.get("diagram_state_version") or 0), 2)
        snapshot = save_b.get("bpmn_version_snapshot") or {}
        self.assertTrue(str(snapshot.get("id") or "").strip())

        meta_ok = self.session_bpmn_meta_patch(
            self.sid,
            self.BpmnMetaPatchIn(
                flowId="Flow_1",
                tier="P0",
                base_diagram_state_version=2,
            ),
            self.req,
        )
        self.assertEqual(str((meta_ok.get("flow_meta") or {}).get("Flow_1", {}).get("tier") or ""), "P0")

        with self.assertRaises(HTTPException) as stale_restore:
            self.session_bpmn_restore(
                self.sid,
                str(snapshot.get("id") or ""),
                self.BpmnRestoreIn(base_diagram_state_version=2),
                self.req,
            )
        self.assertEqual(int(getattr(stale_restore.exception, "status_code", 0) or 0), 409)
        self.assertEqual(str((getattr(stale_restore.exception, "detail", {}) or {}).get("code") or ""), "DIAGRAM_STATE_CONFLICT")

    def test_legacy_notes_path_requires_base_and_updates_diagram_version(self):
        with patch(
            "app.ai.deepseek_client.extract_process",
            return_value={
                "nodes": [{"id": "n_from_notes", "title": "From notes", "type": "step"}],
                "edges": [],
                "roles": ["cook_1"],
            },
        ):
            out = self.post_notes(
                self.sid,
                self.NotesIn(notes="seed from notes", base_diagram_state_version=0),
                self.req,
            )
        self.assertEqual(str(out.get("notes") or ""), "seed from notes")
        self.assertEqual(int(out.get("diagram_state_version") or 0), 1)

        with patch(
            "app.ai.deepseek_client.extract_process",
            return_value={"nodes": [], "edges": [], "roles": []},
        ):
            with self.assertRaises(HTTPException) as stale:
                self.post_notes(
                    self.sid,
                    self.NotesIn(notes="stale write", base_diagram_state_version=0),
                    self.req,
                )
        self.assertEqual(int(getattr(stale.exception, "status_code", 0) or 0), 409)
        self.assertEqual(str((getattr(stale.exception, "detail", {}) or {}).get("code") or ""), "DIAGRAM_STATE_CONFLICT")

    def test_legacy_answer_paths_require_base_and_block_stale(self):
        self._seed_answer_fixture()
        ok = self.answer(
            self.sid,
            self.AnswerIn(
                question_id="q_1",
                answer="borsch",
                base_diagram_state_version=0,
            ),
            self.req,
        )
        self.assertEqual(int(ok.get("diagram_state_version") or 0), 1)

        with self.assertRaises(HTTPException) as stale:
            self.answer_v2(
                self.sid,
                self.AnswerIn(
                    question_id="q_1",
                    answer="stale",
                    base_diagram_state_version=0,
                ),
                self.req,
            )
        self.assertEqual(int(getattr(stale.exception, "status_code", 0) or 0), 409)
        self.assertEqual(str((getattr(stale.exception, "detail", {}) or {}).get("code") or ""), "DIAGRAM_STATE_CONFLICT")

    def test_legacy_nodes_paths_require_base_and_block_stale(self):
        created = self.add_node(
            self.sid,
            self.CreateNodeIn(id="n1", title="Node 1", type="step", base_diagram_state_version=0),
            self.req,
        )
        self.assertEqual(int(created.get("diagram_state_version") or 0), 1)

        patched = self.patch_node(
            self.sid,
            "n1",
            self.NodePatchIn(title="Node 1.1", base_diagram_state_version=1),
            self.req,
        )
        self.assertEqual(int(patched.get("diagram_state_version") or 0), 2)

        with self.assertRaises(HTTPException) as stale_delete:
            self.delete_node(
                self.sid,
                "n1",
                _DummyRequest(
                    {"id": "cas_admin_user", "email": "cas_admin_user@test.local", "is_admin": True},
                    active_org_id=self.default_org_id,
                ),
            )
        self.assertEqual(int(getattr(stale_delete.exception, "status_code", 0) or 0), 409)
        self.assertEqual(str((getattr(stale_delete.exception, "detail", {}) or {}).get("code") or ""), "DIAGRAM_STATE_BASE_VERSION_REQUIRED")

        req_fresh = _DummyRequest(
            {"id": "cas_admin_user", "email": "cas_admin_user@test.local", "is_admin": True},
            active_org_id=self.default_org_id,
        )
        req_fresh.headers["x-base-diagram-state-version"] = "2"
        deleted = self.delete_node(self.sid, "n1", req_fresh)
        self.assertEqual(int(deleted.get("diagram_state_version") or 0), 3)

    def test_legacy_edges_paths_require_base_and_no_silent_overwrite(self):
        st = self.get_storage()
        s = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(s)
        s.nodes = [
            self.Node(id="a", title="A", parameters={}, equipment=[], disposition={}),
            self.Node(id="b", title="B", parameters={}, equipment=[], disposition={}),
        ]
        st.save(s, is_admin=True)

        added = self.add_edge(
            self.sid,
            self.CreateEdgeIn(from_id="a", to_id="b", base_diagram_state_version=0),
            self.req,
        )
        self.assertEqual(int(added.get("diagram_state_version") or 0), 1)

        with self.assertRaises(HTTPException) as stale:
            self.delete_edge(
                self.sid,
                self.CreateEdgeIn(from_id="a", to_id="b", base_diagram_state_version=0),
                self.req,
            )
        self.assertEqual(int(getattr(stale.exception, "status_code", 0) or 0), 409)
        self.assertEqual(str((getattr(stale.exception, "detail", {}) or {}).get("code") or ""), "DIAGRAM_STATE_CONFLICT")

        reloaded = self._load_admin()
        self.assertIsNotNone(reloaded)
        self.assertEqual(len(getattr(reloaded, "edges", []) or []), 1)


if __name__ == "__main__":
    unittest.main()
