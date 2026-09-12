"""Б6 (fix/save-latency-subprocess-async, IMPLEMENTATION Этап 6): answer
коммитится через SQL-CAS с тем же base, что прошёл in-memory guard.

До фикса: check (`_require_diagram_cas_or_409`) и write (`st.save`) были
разнесены → гонка с параллельным PUT /bpmn = молчаливый last-writer-wins
(lost update XML). После: гонка → DiagramStateConflictError → 409.
Контракт {"error": "question not found"} (HTTP 200) не тронут.
"""
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

SAMPLE_BPMN_XML_B = SAMPLE_BPMN_XML_A.replace("Task A", "Task B")


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}
        self.query_params = {}
        self.scope = {"type": "http"}


class AnswerCasCommitTests(unittest.TestCase):
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
            CreateSessionIn,
            answer,
            create_session,
            get_storage,
            session_bpmn_save,
        )
        from app.models import Node, Question
        from app.storage import get_default_org_id

        self.AnswerIn = AnswerIn
        self.BpmnXmlIn = BpmnXmlIn
        self.get_storage = get_storage
        self.answer = answer
        self.session_bpmn_save = session_bpmn_save
        self.default_org_id = get_default_org_id()

        out = create_session(CreateSessionIn(title="Answer CAS"))
        self.sid = str(out.get("id") or "")
        self.assertTrue(self.sid)
        self.req = _DummyRequest(
            {
                "id": "answer_actor",
                "email": "answer@t.local",
                "name": "Answer Actor",
                "is_admin": True,
            },
            active_org_id=self.default_org_id,
        )

        # Seed ноды/вопроса напрямую: owner остаётся пустым, answer() делает
        # bare load (owner-scope) — add_node/session_bpmn_save мутировали бы
        # owner на actor и ломали бы последующий answer (как и на main).
        st = get_storage()
        s = st.load(self.sid, is_admin=True)
        s.nodes = [
            Node(id="n_1", title="Шаг 1", type="step", parameters={}, equipment=[], disposition={}),
        ]
        s.questions = [
            Question(
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

    def _load_admin(self):
        return self.get_storage().load(self.sid, is_admin=True)

    def test_stale_base_answer_rejected_before_write(self):
        """Протухший base → 409 ещё на in-memory гварде (поведение main):
        первый answer (base=0) успешен, повторный с тем же base → 409,
        перезаписи нет."""
        first = self.answer(
            self.sid,
            self.AnswerIn(question_id="q_1", answer="молоко", base_diagram_state_version=0),
            self.req,
        )
        self.assertNotIn("error", first)
        self.assertEqual(int(first.get("diagram_state_version") or 0), 1)
        first_q = next(x for x in first["questions"] if x["id"] == "q_1")
        self.assertEqual(first_q["status"], "answered")

        with self.assertRaises(HTTPException) as cm:
            self.answer(
                self.sid,
                self.AnswerIn(question_id="q_1", answer="вторжение", base_diagram_state_version=0),
                self.req,
            )
        self.assertEqual(cm.exception.status_code, 409)
        detail = cm.exception.detail or {}
        self.assertEqual(str(detail.get("code") or ""), "DIAGRAM_STATE_CONFLICT")

        s = self._load_admin()
        q_1 = next(q for q in s.questions if q.id == "q_1")
        self.assertEqual(q_1.status, "answered")
        self.assertEqual(q_1.answer, "молоко")

    def test_answer_race_with_parallel_bpmn_put_is_conflict_not_lost_update(self):
        """Гонка: guard прошёл, но PUT /bpmn закоммитился до save → 409, XML PUT'а цел.

        До фикса (st.save без CAS) answer молчаливо перезаписывал XML PUT'а
        своей stale in-memory копией — lost update.
        """
        import app.session_answers as session_answers
        import app.services.session_recompute as session_recompute

        def _concurrent_put(sess):
            # Параллельный writer «в окне» между guard и commit answer:
            # PUT /bpmn с чужим XML коммитится ДО save answer.
            self.session_bpmn_save(
                self.sid,
                self.BpmnXmlIn(xml=SAMPLE_BPMN_XML_B, base_diagram_state_version=0),
                self.req,
            )
            return _orig_recompute(sess)

        _orig_recompute = session_recompute._recompute_session
        with patch.object(session_answers, "_recompute_session", side_effect=_concurrent_put, wraps=None):
            with self.assertRaises(HTTPException) as cm:
                self.answer(
                    self.sid,
                    self.AnswerIn(question_id="q_1", answer="молоко", base_diagram_state_version=0),
                    self.req,
                )

        self.assertEqual(cm.exception.status_code, 409)
        detail = cm.exception.detail or {}
        self.assertEqual(str(detail.get("code") or ""), "DIAGRAM_STATE_CONFLICT")

        s = self._load_admin()
        # Lost update невозможен: XML и dsv от PUT сохранились
        self.assertEqual(str(s.bpmn_xml or ""), SAMPLE_BPMN_XML_B)
        self.assertEqual(int(s.diagram_state_version or 0), 1)
        # answer НЕ записался
        q_1 = next(q for q in s.questions if q.id == "q_1")
        self.assertEqual(q_1.status, "open")

    def test_answer_happy_path_cas_commit(self):
        """Happy-path: ответ применён, dsv+1, actor в last_write, строка persisted."""
        out = self.answer(
            self.sid,
            self.AnswerIn(question_id="q_1", answer="пастеризация", base_diagram_state_version=0),
            self.req,
        )
        self.assertNotIn("error", out)
        out_q = next(x for x in out["questions"] if x["id"] == "q_1")
        self.assertEqual(out_q["status"], "answered")
        self.assertEqual(out_q["answer"], "пастеризация")
        self.assertEqual(int(out.get("diagram_state_version") or 0), 1)

        s = self._load_admin()
        self.assertEqual(int(s.diagram_state_version or 0), 1)
        self.assertEqual(str(s.diagram_last_write_actor_user_id or ""), "answer_actor")
        self.assertIn("questions", list(s.diagram_last_write_changed_keys or []))

    def test_question_not_found_contract_unchanged(self):
        """Контракт {"error": "question not found"} (HTTP 200) не тронут."""
        out = self.answer(
            self.sid,
            self.AnswerIn(question_id="nope", answer="x"),
            self.req,
        )
        self.assertEqual(out, {"error": "question not found"})
