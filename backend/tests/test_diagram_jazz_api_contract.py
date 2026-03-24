import os
import tempfile
import unittest


MINI_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
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


def _build_jazz_env(*, org_id: str, project_id: str, session_id: str, operator_user_id: str) -> dict[str, str]:
    scope_id = f"{org_id}::{project_id}::{session_id}"
    return {
        "DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT": "1",
        "DIAGRAM_JAZZ_BACKEND_MODE": "jazz",
        "DIAGRAM_JAZZ_BACKEND_PROVIDER": "jazz",
        "DIAGRAM_JAZZ_BACKEND_CONTRACT_VERSION": "diagram-jazz-backend-contract-draft-v1",
        "DIAGRAM_OWNER_STATE": "jazz_owner",
        "DIAGRAM_JAZZ_CUTOVER_ENABLE": "1",
        "DIAGRAM_JAZZ_OWNER_SWITCH_APPROVED": "1",
        "DIAGRAM_JAZZ_API_READY": "1",
        "DIAGRAM_JAZZ_ROLLBACK_READY": "1",
        "DIAGRAM_JAZZ_OBSERVABILITY_READY": "1",
        "DIAGRAM_JAZZ_SCOPE_ALLOWLIST": scope_id,
    }


class DiagramJazzApiContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app._legacy_main import CreateSessionIn, create_session, get_storage
        from app.routers.diagram_jazz import DiagramJazzWriteIn, diagram_jazz_api_read_contract, diagram_jazz_api_write_contract
        from app.services.diagram_jazz_contract import create_or_resolve_diagram_jazz_mapping

        self.CreateSessionIn = CreateSessionIn
        self.create_session = create_session
        self.get_storage = get_storage
        self.DiagramJazzWriteIn = DiagramJazzWriteIn
        self.diagram_jazz_api_read_contract = diagram_jazz_api_read_contract
        self.diagram_jazz_api_write_contract = diagram_jazz_api_write_contract
        self.create_or_resolve_diagram_jazz_mapping = create_or_resolve_diagram_jazz_mapping

        created = self.create_session(CreateSessionIn(title="diagram jazz api contract test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        sess = self.get_storage().load(self.sid, is_admin=True)
        self.assertIsNotNone(sess)
        self.org_id = str(getattr(sess, "org_id", "") or "").strip()
        self.assertTrue(self.org_id)
        self.project_id = "project-test"
        self.operator_user_id = "operator-1"
        self._set_session_project(project_id=self.project_id)

    def tearDown(self):
        self.tmp.cleanup()

    def _set_session_project(self, *, project_id: str) -> None:
        st = self.get_storage()
        sess = st.load(self.sid, org_id=self.org_id, is_admin=True)
        self.assertIsNotNone(sess)
        sess.project_id = project_id
        st.save(sess, user_id="test-user", org_id=self.org_id, is_admin=True)

    def _prepare_mapping(self, env: dict[str, str]) -> dict:
        out = self.create_or_resolve_diagram_jazz_mapping(
            org_id=self.org_id,
            project_id=self.project_id,
            session_id=self.sid,
            provider="jazz",
            actor_user_id=self.operator_user_id,
            env=env,
        )
        self.assertTrue(out.get("ok"), out)
        return out

    def test_diagram_jazz_api_write_and_read_roundtrip(self):
        env = _build_jazz_env(
            org_id=self.org_id,
            project_id=self.project_id,
            session_id=self.sid,
            operator_user_id=self.operator_user_id,
        )
        self._prepare_mapping(env)
        markers = []

        write_out = self.diagram_jazz_api_write_contract(
            session_id=self.sid,
            org_id=self.org_id,
            project_id=self.project_id,
            payload=self.DiagramJazzWriteIn(xml=MINI_BPMN_XML, provider="jazz"),
            operator_user_id=self.operator_user_id,
            env=env,
            on_marker=lambda event, payload: markers.append((event, payload)),
        )
        self.assertTrue(write_out.get("ok"), write_out)
        self.assertEqual(write_out.get("provider"), "jazz")
        self.assertEqual(write_out.get("mode"), "jazz")
        self.assertEqual(write_out.get("ack", {}).get("scope_id"), f"{self.org_id}::{self.project_id}::{self.sid}")
        self.assertGreaterEqual(int(write_out.get("ack", {}).get("stored_revision") or 0), 1)

        read_out = self.diagram_jazz_api_read_contract(
            session_id=self.sid,
            org_id=self.org_id,
            project_id=self.project_id,
            provider="jazz",
            operator_user_id=self.operator_user_id,
            env=env,
            on_marker=lambda event, payload: markers.append((event, payload)),
        )
        self.assertTrue(read_out.get("ok"), read_out)
        self.assertEqual(read_out.get("xml"), MINI_BPMN_XML)
        self.assertEqual(read_out.get("ack", {}).get("stored_revision"), write_out.get("ack", {}).get("stored_revision"))
        self.assertIn("diagram_jazz_api_write_success", [event for event, _payload in markers])
        self.assertIn("diagram_jazz_api_read_success", [event for event, _payload in markers])

    def test_diagram_jazz_api_write_returns_conflict_for_stale_revision(self):
        env = _build_jazz_env(
            org_id=self.org_id,
            project_id=self.project_id,
            session_id=self.sid,
            operator_user_id=self.operator_user_id,
        )
        self._prepare_mapping(env)

        first = self.diagram_jazz_api_write_contract(
            session_id=self.sid,
            org_id=self.org_id,
            project_id=self.project_id,
            payload=self.DiagramJazzWriteIn(xml=MINI_BPMN_XML, provider="jazz"),
            operator_user_id=self.operator_user_id,
            env=env,
        )
        self.assertTrue(first.get("ok"), first)

        conflict = self.diagram_jazz_api_write_contract(
            session_id=self.sid,
            org_id=self.org_id,
            project_id=self.project_id,
            payload=self.DiagramJazzWriteIn(
                xml=f"{MINI_BPMN_XML}\n<!-- v2 -->",
                provider="jazz",
                expected_revision=0,
            ),
            operator_user_id=self.operator_user_id,
            env=env,
        )
        self.assertFalse(conflict.get("ok"), conflict)
        self.assertEqual(int(conflict.get("status") or 0), 409)
        self.assertEqual(conflict.get("error_code"), "diagram_jazz_revision_conflict")
        self.assertTrue(conflict.get("adapter_trace_tail"))

    def test_diagram_jazz_api_preserves_owner_locked_reason(self):
        env = {
            "DIAGRAM_JAZZ_BACKEND_CONTRACT_DRAFT": "1",
            "DIAGRAM_JAZZ_BACKEND_MODE": "jazz",
            "DIAGRAM_JAZZ_BACKEND_PROVIDER": "jazz",
            "DIAGRAM_OWNER_STATE": "legacy_owner",
        }

        blocked = self.diagram_jazz_api_read_contract(
            session_id=self.sid,
            org_id=self.org_id,
            project_id=self.project_id,
            provider="jazz",
            operator_user_id=self.operator_user_id,
            env=env,
        )
        self.assertFalse(blocked.get("ok"), blocked)
        self.assertEqual(int(blocked.get("status") or 0), 409)
        self.assertEqual(blocked.get("error_code"), "diagram_cutover_owner_legacy_path_locked")
        self.assertEqual(blocked.get("blocked"), "diagram_cutover_owner_legacy_path_locked")


if __name__ == "__main__":
    unittest.main()
