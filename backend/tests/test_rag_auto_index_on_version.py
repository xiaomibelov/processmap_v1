"""Tests for feature/rag-auto-index-on-version-v1.

Триггер RAG-индексации — создание версии (bpmn_versions), а не save:
- V3/V5: create_bpmn_version_snapshot post-commit enqueue (readiness queued);
- V2: save со снапшотом при неизменном xml (publish_manual_save) enqueue'ится;
- meta-only save без снапшота — НЕ enqueue'ится;
- source_version/metadata rag_documents привязаны к diagram_state_version;
- финальный провал таска → readiness "error", версия не откачена;
- set_rag_readiness(indexed, indexed_dsv=...) — точечный UPDATE, чужой
  CAS-save dsv не клобберится (C-гейт, урок fix/rag-readiness-version-clobber).
"""
import json
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
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_RAGV" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_RAGV" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Task RAGV">
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


class RagAutoIndexOnVersionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp.name
        os.environ.pop("PROCESS_DB_PATH", None)
        from app.storage import get_storage

        self.st = get_storage()
        # Брокера в тестах нет: глушим celery .delay, иначе каждый enqueue
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

    def _create_session(self, sid: str, *, bpmn_xml: str = SAMPLE_BPMN_XML, dsv: int = 0):
        from app.models import Session

        sess = Session(id=sid, title=f"Session {sid}", bpmn_xml=bpmn_xml, diagram_state_version=dsv)
        self.st.save(sess, is_admin=True)
        return sess

    def _create_version(self, sid: str, dsv: int, *, source_action: str = "agent_edit"):
        return self.st.create_bpmn_version_snapshot(
            sid,
            bpmn_xml=SAMPLE_BPMN_XML,
            source_action=source_action,
            diagram_state_version=dsv,
        )

    # ── V3/V5: create_bpmn_version_snapshot ──────────────────────────────────

    def test_version_create_enqueues_and_marks_queued(self):
        """POST /bpmn/versions (и subprocess_sync): post-commit enqueue + readiness queued."""
        sid = "sess-ragv-v3"
        self._create_session(sid, dsv=1)
        self.mock_delay.reset_mock()

        snap = self._create_version(sid, 1, source_action="agent_edit")

        self.assertEqual(int(snap.get("version_number") or 0), 1)
        self.assertEqual(len(self.st.list_bpmn_versions(sid)), 1)
        self.mock_delay.assert_called_once()
        self.assertEqual(self.mock_delay.call_args[0][0], sid)
        ready = self.st.get_rag_readiness(sid)
        self.assertEqual(ready.get("rag_readiness_status"), "queued")
        self.assertTrue(int(ready.get("rag_queued_at") or 0) > 0)

    def test_version_create_eager_index_binds_doc_to_dsv(self):
        """DB-proof: doc в rag_documents имеет source_version = dsv версии,
        metadata содержит diagram_state_version; таск проставляет rag_indexed_dsv."""
        from app import rag_tasks
        from app.rag.storage_rag import get_rag_document_by_source

        sid = "sess-ragv-eager"
        self._create_session(sid, dsv=3)
        self.mock_delay.reset_mock()
        self._create_version(sid, 3, source_action="manual_save")

        result = rag_tasks._do_index_session_bpmn_xml(sid, "org_default")
        self.assertEqual(result.get("status"), "indexed")
        self.assertEqual(result.get("diagram_state_version"), 3)

        doc = get_rag_document_by_source("org_default", "bpmn_xml", sid)
        self.assertIsNotNone(doc, "rag_documents не содержит doc для сессии")
        self.assertEqual(int(doc["source_version"]), 3)
        metadata = json.loads(doc["metadata_json"])
        self.assertEqual(metadata.get("diagram_state_version"), 3)

        # Полный таск: readiness indexed + rag_indexed_dsv = проиндексированный dsv
        task_result = rag_tasks.index_session_bpmn_xml(sid, "org_default")
        self.assertIn(task_result.get("status"), ("indexed", "unchanged"))
        ready = self.st.get_rag_readiness(sid)
        self.assertEqual(ready.get("rag_readiness_status"), "indexed")
        self.assertEqual(ready.get("rag_indexed_dsv"), 3)

    def test_index_failure_after_retry_marks_error_and_keeps_version(self):
        """Финальный провал таска: readiness = error, версия не откачена."""
        from app import rag_tasks

        sid = "sess-ragv-err"
        self._create_session(sid, dsv=1)
        self.mock_delay.reset_mock()
        self._create_version(sid, 1)
        self.assertEqual(self.st.get_rag_readiness(sid).get("rag_readiness_status"), "queued")

        with patch.object(rag_tasks, "_do_index_session_bpmn_xml", side_effect=RuntimeError("boom")):
            result = rag_tasks.index_session_bpmn_xml(sid, "org_default")

        self.assertEqual(result.get("status"), "failed")
        self.assertEqual(len(self.st.list_bpmn_versions(sid)), 1, "версия не должна откатываться")
        ready = self.st.get_rag_readiness(sid)
        self.assertEqual(ready.get("rag_readiness_status"), "error")

    # ── V1/V2: save-путь ─────────────────────────────────────────────────────

    def test_save_with_xml_change_enqueues(self):
        """V1 (существующее поведение): xml изменён → снапшот + enqueue."""
        sid = "sess-ragv-v1"
        self._create_session(sid)
        self.mock_delay.reset_mock()
        sess = self.st.load(sid, is_admin=True)
        sess.bpmn_xml = SAMPLE_BPMN_XML.replace("Task RAGV", "Task RAGV v2")
        self.st.save(sess, is_admin=True)
        self.mock_delay.assert_called_once()
        self.assertEqual(self.mock_delay.call_args[0][0], sid)

    def test_publish_manual_save_unchanged_xml_with_snapshot_enqueues(self):
        """V2 (новое поведение): publish_manual_save, xml НЕ изменён, но снапшот
        вставлен в эту транзакцию → enqueue вызывается."""
        sid = "sess-ragv-v2"
        self._create_session(sid, dsv=0)
        self.mock_delay.reset_mock()
        sess = self.st.load(sid, is_admin=True)
        sess.diagram_state_version = 1
        plan = {
            "bpmn_xml": SAMPLE_BPMN_XML,
            "source_action": "publish_manual_save",
            "diagram_state_version": 1,
            "session_payload_hash": "hash-v2",
            "session_version": 1,
            "session_updated_at": 1,
            "created_by": "",
            "import_note": "",
        }
        self.st.save(sess, is_admin=True, bpmn_snapshot=plan)
        self.mock_delay.assert_called_once()
        self.assertEqual(self.mock_delay.call_args[0][0], sid)
        versions = self.st.list_bpmn_versions(sid)
        self.assertEqual(len(versions), 1)
        self.assertEqual(versions[0].get("source_action"), "publish_manual_save")
        ready = self.st.get_rag_readiness(sid)
        self.assertEqual(ready.get("rag_readiness_status"), "queued")

    def test_meta_only_save_without_snapshot_does_not_enqueue(self):
        """Save без снапшота и без изменения xml (property/meta-only) → НЕ enqueue."""
        sid = "sess-ragv-meta"
        self._create_session(sid, dsv=0)
        self.mock_delay.reset_mock()
        sess = self.st.load(sid, is_admin=True)
        sess.notes = "служебная правка без версии"
        self.st.save(sess, is_admin=True)
        self.mock_delay.assert_not_called()
        self.assertEqual(len(self.st.list_bpmn_versions(sid)), 0)

    # ── Конкурентность (C-гейт) ──────────────────────────────────────────────

    def test_indexed_dsv_race_does_not_revert_cas_save(self):
        """Гонка: version-create (queued) + чужой CAS-save между queued и indexed.
        Точечный UPDATE rag_indexed_dsv не откатывает чужой diagram_state_version."""
        sid = "sess-ragv-race"
        self._create_session(sid, dsv=1)
        self.mock_delay.reset_mock()
        self._create_version(sid, 1)

        orig_load = self.st.load
        fired = {"done": False}

        def hooked_load(session_id, **kwargs):
            obj = orig_load(session_id, **kwargs)
            if session_id == sid and not fired["done"]:
                fired["done"] = True
                # Чужой CAS-save 1 -> 2 проскальзывает между load и сохранением.
                current = self.st.load(sid, is_admin=True)
                current.diagram_state_version = 2
                self.st.save(current, is_admin=True, expected_diagram_state_version=1)
            return obj

        with patch.object(self.st, "load", hooked_load):
            res = self.st.set_rag_readiness(sid, "indexed", indexed_dsv=1)

        self.assertIsNotNone(res)
        final = self.st.load(sid, is_admin=True)
        self.assertEqual(final.diagram_state_version, 2, "rag_indexed_dsv откатил чужой CAS-save")
        self.assertEqual(final.rag_readiness_status, "indexed")
        self.assertEqual(res.get("rag_indexed_dsv"), 1)


if __name__ == "__main__":
    unittest.main()
