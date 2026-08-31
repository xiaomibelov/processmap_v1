import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SAMPLE_BPMN_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_RAG" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_RAG" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task RAG">
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


class RagReadinessNoClobberTests(unittest.TestCase):
    """Регресс audit/prod-stage-divergence-409: фоновый set_rag_readiness
    не должен откатывать diagram_state_version конкурентного CAS-save
    и не должен порождать self-enqueue цикл index_session_bpmn_xml."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("PROCESS_DB_PATH", None)
        from app.storage import get_storage

        self.st = get_storage()
        # Брокера в тестах нет: глушим celery .delay, иначе каждый save
        # уходит в долгие reconnect-retry.
        self._delay_patcher = patch("app.rag_tasks.index_session_bpmn_xml.delay")
        self.mock_delay = self._delay_patcher.start()

    def tearDown(self):
        self._delay_patcher.stop()
        if self.old_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = self.old_storage_dir
        if self.old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = self.old_db_path
        self.tmp.cleanup()

    def _create_session(self, sid: str, *, bpmn_xml: str = ""):
        from app.models import Session

        sess = Session(id=sid, title=f"Session {sid}", bpmn_xml=bpmn_xml)
        self.st.save(sess, is_admin=True)
        return sess

    def _user_cas_save(self, sid: str, base: int) -> None:
        """Имитация пользовательского diagram-truth CAS-save: dsv base -> base+1."""
        sess = self.st.load(sid, is_admin=True)
        sess.diagram_state_version = base + 1
        self.st.save(sess, is_admin=True, expected_diagram_state_version=base)

    def test_set_rag_readiness_race_does_not_revert_diagram_state_version(self):
        """Гонка из аудита: set_rag_readiness загрузил объект ДО пользовательского
        CAS-коммита, а сохраняет ПОСЛЕ него. Финальный diagram_state_version
        обязан остаться пользовательским, orphan-расхождения с bpmn_versions нет."""
        sid = "sess-rag-race-1"
        self._create_session(sid, bpmn_xml=SAMPLE_BPMN_XML)
        self.assertEqual(self.st.load(sid, is_admin=True).diagram_state_version, 0)

        orig_load = self.st.load
        fired = {"done": False}

        def hooked_load(session_id, **kwargs):
            obj = orig_load(session_id, **kwargs)
            # Одноразовый хук: между load() и save() внутри set_rag_readiness
            # проскальзывает конкурентный пользовательский CAS-save 0 -> 1.
            if session_id == sid and not fired["done"]:
                fired["done"] = True
                self._user_cas_save(sid, base=int(obj.diagram_state_version or 0))
            return obj

        with patch.object(self.st, "load", hooked_load):
            res = self.st.set_rag_readiness(sid, "indexed")

        self.assertIsNotNone(res)
        self.assertEqual(res.get("rag_readiness_status"), "indexed")
        final = self.st.load(sid, is_admin=True)
        self.assertEqual(
            final.diagram_state_version,
            1,
            "set_rag_readiness откатил diagram_state_version конкурентного CAS-save",
        )
        self.assertEqual(final.bpmn_xml, SAMPLE_BPMN_XML)
        # orphan-условие из аудита: снапшоты с dsv > sessions.dsv недопустимы
        max_snap = 0
        for row in self.st.list_bpmn_versions(sid, limit=100, include_xml=False):
            max_snap = max(max_snap, int(row.get("diagram_state_version") or 0))
        self.assertLessEqual(max_snap, final.diagram_state_version)

    def test_set_rag_readiness_never_changes_diagram_state_version(self):
        """C-гейт контура: set_rag_readiness не трогает diagram_state_version НИКОГДА."""
        sid = "sess-rag-stable-1"
        self._create_session(sid, bpmn_xml=SAMPLE_BPMN_XML)
        self._user_cas_save(sid, base=0)
        self._user_cas_save(sid, base=1)
        before = self.st.load(sid, is_admin=True)
        self.assertEqual(before.diagram_state_version, 2)

        res = self.st.set_rag_readiness(sid, "queued")
        self.assertEqual(res.get("rag_readiness_status"), "queued")
        self.assertTrue(int(res.get("rag_queued_at") or 0) > 0)
        res = self.st.set_rag_readiness(sid, "indexed")

        after = self.st.load(sid, is_admin=True)
        self.assertEqual(after.diagram_state_version, 2)
        self.assertEqual(after.rag_readiness_status, "indexed")
        # bpmn_xml и прочие diagram-поля не затронуты
        self.assertEqual(after.bpmn_xml, before.bpmn_xml)
        self.assertEqual(after.bpmn_meta, before.bpmn_meta)
        self.assertEqual(after.owner_user_id, before.owner_user_id)

    def test_set_rag_readiness_does_not_enqueue_rag_index_task(self):
        """Self-enqueue разорван: служебный save rag-статуса не триггерит
        index_session_bpmn_xml.delay."""
        sid = "sess-rag-noenqueue-1"
        self._create_session(sid, bpmn_xml=SAMPLE_BPMN_XML)
        self.mock_delay.reset_mock()
        self.st.set_rag_readiness(sid, "indexed")
        self.mock_delay.assert_not_called()

    def test_save_enqueues_rag_index_only_when_bpmn_xml_changed(self):
        """Enqueue только при реальном изменении bpmn_xml в этом save:
        тот же xml — без enqueue; изменённый — ровно один enqueue."""
        sid = "sess-rag-enqueue-1"
        self._create_session(sid)  # без xml: insert с пустым bpmn_xml не индексируем
        self.mock_delay.reset_mock()
        sess = self.st.load(sid, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML
        self.st.save(sess, is_admin=True)
        self.mock_delay.assert_called_once()
        self.assertEqual(self.mock_delay.call_args[0][0], sid)

        # Повторный save с ТЕМ ЖЕ xml — повторного enqueue быть не должно
        self.mock_delay.reset_mock()
        sess = self.st.load(sid, is_admin=True)
        sess.notes = "служебная правка без изменения xml"
        self.st.save(sess, is_admin=True)
        self.mock_delay.assert_not_called()

        # Изменение xml — ровно один enqueue
        self.mock_delay.reset_mock()
        sess = self.st.load(sid, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML.replace("Task RAG", "Task RAG v2")
        self.st.save(sess, is_admin=True)
        self.mock_delay.assert_called_once()
        self.assertEqual(self.mock_delay.call_args[0][0], sid)


if __name__ == "__main__":
    unittest.main()
