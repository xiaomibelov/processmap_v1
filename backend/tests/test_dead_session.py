"""P-1 «Мёртвые сессии»: 404 vs 409 контракт на CAS-записях.

Регрессия трека fix/dead-session-ux:
- save в удалённую сессию НЕ должен давать 409 DIAGRAM_STATE_CONFLICT
  (ложный конфликт — цепочка 1 frequency_map.md, сессия 1e4e833505);
- SQL-CAS на несуществующей строке → SessionNotFoundError → HTTP 404
  SESSION_NOT_FOUND (а не молчаливый INSERT-зомби и не 409);
- существующая сессия со stale base → по-прежнему 409 (FIX-SAVE не сломан).
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
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_D" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task D">
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


class DeadSessionContractTests(unittest.TestCase):
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
            BpmnXmlIn,
            CreateSessionIn,
            UpdateSessionIn,
            create_session,
            delete_session_api,
            get_session,
            get_storage,
            patch_session,
            put_session,
            session_bpmn_save,
        )
        from app.services import session_service
        from app.storage import SessionNotFoundError, get_default_org_id
        from app.utils.session_helpers import _save_session_with_cas

        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.UpdateSessionIn = UpdateSessionIn
        self.create_session = create_session
        self.delete_session_api = delete_session_api
        self.get_session = get_session
        self.get_storage = get_storage
        self.patch_session = patch_session
        self.put_session = put_session
        self.session_bpmn_save = session_bpmn_save
        self.session_service = session_service
        self.SessionNotFoundError = SessionNotFoundError
        self._save_session_with_cas = _save_session_with_cas
        self.default_org_id = get_default_org_id()

        created = self.create_session(self.CreateSessionIn(title="dead-session test"))
        self.sid = str(created.get("id") or "")
        self.assertTrue(self.sid)
        self.req = _DummyRequest(
            {
                "id": "dead_admin_user",
                "email": "dead_admin_user@test.local",
                "is_admin": True,
            },
            active_org_id=self.default_org_id,
        )

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

    def _save_ok(self, base=0):
        out = self.session_bpmn_save(
            self.sid,
            self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, base_diagram_state_version=base),
            self.req,
        )
        self.assertEqual(out.get("ok"), True)
        return out

    def test_put_bpmn_on_deleted_session_is_not_found_not_409(self):
        self._save_ok(base=0)
        deleted = self.delete_session_api(self.sid, self.req)
        self.assertEqual(deleted.get("ok"), True)

        # Контракт F1 (fix/dead-session-save-500): мёртвая сессия → настоящий
        # HTTP 404 SESSION_NOT_FOUND (а не 200-dict и НИКОГДА не 409/500).
        with self.assertRaises(HTTPException) as cm:
            self.session_bpmn_save(
                self.sid,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, base_diagram_state_version=1),
                self.req,
            )
        self.assertEqual(int(getattr(cm.exception, "status_code", 0) or 0), 404)
        detail = getattr(cm.exception, "detail", {}) or {}
        self.assertEqual(str(detail.get("code") or ""), "SESSION_NOT_FOUND")
        self.assertEqual(str(detail.get("session_id") or ""), self.sid)

    def test_put_session_on_deleted_session_is_not_found_not_409(self):
        self._save_ok(base=0)
        self.delete_session_api(self.sid, self.req)

        with self.assertRaises(HTTPException) as cm:
            self.put_session(
                self.sid,
                self.UpdateSessionIn(title="zombie?", base_diagram_state_version=1),
                self.req,
            )
        self.assertEqual(int(getattr(cm.exception, "status_code", 0) or 0), 404)
        detail = getattr(cm.exception, "detail", {}) or {}
        self.assertEqual(str(detail.get("code") or ""), "SESSION_NOT_FOUND")

        # И сессия не воскресла.
        self.assertIsNone(self.get_storage().load(self.sid, is_admin=True))

    def test_cas_write_to_deleted_row_raises_404_session_not_found(self):
        """Гонка: pre-load успешен, строка удалена до CAS-записи → 404, не 409."""
        self._save_ok(base=0)
        st = self.get_storage()
        sess = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(sess)
        # Удаляем строку «под ногами» у уже загруженной сессии (как DELETE
        # из другого окна между pre-load и commit).
        self.assertTrue(st.delete(self.sid, is_admin=True))

        with self.assertRaises(HTTPException) as cm:
            self._save_session_with_cas(st, sess, client_base_version=1, is_admin=True)
        self.assertEqual(int(getattr(cm.exception, "status_code", 0) or 0), 404)
        detail = getattr(cm.exception, "detail", {}) or {}
        self.assertEqual(str(detail.get("code") or ""), "SESSION_NOT_FOUND")
        self.assertEqual(str(detail.get("session_id") or ""), self.sid)

    def test_cas_write_to_never_existing_row_raises_and_does_not_insert_zombie(self):
        st = self.get_storage()
        sess = st.load(self.sid, is_admin=True)
        self.assertIsNotNone(sess)
        sess.id = "dead_session_never_existed"

        with self.assertRaises(self.SessionNotFoundError):
            st.save(sess, is_admin=True, expected_diagram_state_version=0)
        self.assertIsNone(st.load("dead_session_never_existed", is_admin=True))

    def _assert_404_session_not_found(self, fn, *args):
        with self.assertRaises(HTTPException) as cm:
            fn(*args)
        self.assertEqual(int(getattr(cm.exception, "status_code", 0) or 0), 404)
        detail = getattr(cm.exception, "detail", {}) or {}
        self.assertEqual(str(detail.get("code") or ""), "SESSION_NOT_FOUND")

    def test_get_session_on_deleted_session_is_404(self):
        """F1: GET на удалённую сессию → настоящий 404, не 200-dict."""
        self.delete_session_api(self.sid, self.req)
        self._assert_404_session_not_found(self.get_session, self.sid, self.req)

    def test_patch_session_on_deleted_session_is_404(self):
        """F1: PATCH (title) на удалённую сессию → 404, не 200-dict и не 500."""
        self.delete_session_api(self.sid, self.req)
        self._assert_404_session_not_found(
            self.patch_session,
            self.sid,
            self.UpdateSessionIn(title="zombie patch"),
            self.req,
        )

    def test_node_op_on_deleted_session_is_404(self):
        """F1: node-op на удалённой сессии → 404 SESSION_NOT_FOUND."""
        self.delete_session_api(self.sid, self.req)
        self._assert_404_session_not_found(
            self.session_service.patch_node,
            self.sid,
            "node_1",
            SimpleNamespace(name="x"),
            self.req,
        )

    def test_existing_session_stale_base_still_409(self):
        """FIX-SAVE регрессионный гейт: реальный CAS-конфликт остаётся 409."""
        self._save_ok(base=0)

        with self.assertRaises(HTTPException) as stale:
            self.session_bpmn_save(
                self.sid,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML, base_diagram_state_version=0),
                self.req,
            )
        self.assertEqual(int(getattr(stale.exception, "status_code", 0) or 0), 409)
        detail = getattr(stale.exception, "detail", {}) or {}
        self.assertEqual(str(detail.get("code") or ""), "DIAGRAM_STATE_CONFLICT")

    def test_existing_session_fresh_base_still_saves(self):
        self._save_ok(base=0)
        out = self._save_ok(base=1)
        self.assertEqual(int(out.get("diagram_state_version") or 0), 2)


if __name__ == "__main__":
    unittest.main()
