"""Регрессия D3 (audit/cold-entry-arrows-lost-after-f2): meta-writers бампают
diagram_state_version без инвалидации кэшей → Redis-проекция session_cache
(TTL 30 с, app/cache/session_cache.py) отдаёт stale dsv → рассинхрон
live dsv (GET /api/sessions/{id}) vs versions-head.

Контракт после фикса: после КАЖДОГО meta-write кэши инвалидируются сразу после
commit'а save (в том же запросе), и get_session отдаёт свежий dsv.

Статический список meta-writers (bump dsv через _mark_diagram_truth_write,
save без инвалидации на момент baseline 91114a19):
  1. app/_legacy_main.py:4337 session_bpmn_meta_patch (save :4344)
  2. app/_legacy_main.py:4378 session_bpmn_meta_infer_rtiers (save :4385)
  3. app/session_answers.py:209 answer (_save_session_with_cas :223)
  4. app/notes_extraction.py:96 post_notes (save :103)
  5. app/notes_extraction.py:397 post_notes_extraction_apply (save :404)
  6. app/services/product_action_suggestions_service.py:174
     apply_approved_suggestions (storage.save :182)

Рабочий паттерн (сравнение): PUT /bpmn (_legacy_main.py:4848),
ops-apply (:5253), restore (:5553), clear (:5653), clipboard materializer
(app/clipboard/materializer.py:738,946), sessions_core patch/put (:540,:667).
"""
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

XOR_SUCCESS_FAIL_XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1">
      <bpmn:outgoing>Flow_start_gate</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_yes">
      <bpmn:incoming>Flow_start_gate</bpmn:incoming>
      <bpmn:outgoing>Flow_yes</bpmn:outgoing>
      <bpmn:outgoing>Flow_no</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_yes">
      <bpmn:incoming>Flow_yes</bpmn:incoming>
      <bpmn:outgoing>Flow_yes_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_no">
      <bpmn:incoming>Flow_no</bpmn:incoming>
      <bpmn:outgoing>Flow_no_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_success">
      <bpmn:incoming>Flow_yes_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:endEvent id="End_fail" name="Escalation fail">
      <bpmn:incoming>Flow_no_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_gate" sourceRef="Start_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_yes" sourceRef="Gateway_1" targetRef="Task_yes" />
    <bpmn:sequenceFlow id="Flow_no" sourceRef="Gateway_1" targetRef="Task_no" />
    <bpmn:sequenceFlow id="Flow_yes_end" sourceRef="Task_yes" targetRef="End_success" />
    <bpmn:sequenceFlow id="Flow_no_end" sourceRef="Task_no" targetRef="End_fail" />
  </bpmn:process>
</bpmn:definitions>
"""


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


class _FakeRedis:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(str(key))

    def set(self, key, value, ex=None):
        self.store[str(key)] = str(value)
        return True

    def setex(self, key, ttl, value):
        _ = ttl
        self.store[str(key)] = str(value)
        return True

    def delete(self, key):
        k = str(key)
        if k in self.store:
            del self.store[k]
            return 1
        return 0

    def scan_iter(self, match=None, count=500):
        _ = count
        pattern = str(match or "")
        prefix = pattern[:-1] if pattern.endswith("*") else pattern
        for key in sorted(self.store.keys()):
            if not prefix or key.startswith(prefix):
                yield key


class MetaWritersDsvCacheInvalidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_db_backend = os.environ.get("FPC_DB_BACKEND")
        self.old_database_url = os.environ.get("DATABASE_URL")
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ["PROCESS_DB_PATH"] = str(os.path.join(self.tmp_sessions.name, "processmap.sqlite3"))
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        # Кэш-проекция и инвалидация должны идти через ОДИН fake-redis на весь
        # тест: writer инвалидирует кэши ВНУТРИ своего вызова (вне блока чтения),
        # поэтому точечный patch только на `_projection_dsv` недостаточен —
        # инвалидация уходила в реальный get_client(), где REDIS_URL пуст и она
        # молча пропускалась (skip_no_client), а проекция оставалась stale.
        self.fake = _FakeRedis()
        self._redis_patcher = patch(
            "app.redis_cache.get_client", return_value=self.fake
        )
        self._redis_patcher.start()

        from app.auth import create_user
        from app._legacy_main import (
            BpmnMetaPatchIn,
            BpmnXmlIn,
            CreateSessionIn,
            InferRtiersIn,
            create_session,
            get_default_org_id,
            get_storage,
            session_bpmn_meta_infer_rtiers,
            session_bpmn_meta_patch,
            session_bpmn_save,
        )
        from app.models import Question
        from app.notes_extraction import post_notes, post_notes_extraction_apply
        from app.schemas.legacy_api import (
            AnswerIn,
            NotesExtractionApplyIn,
            NotesIn,
        )
        from app.services import session_service as _svc
        from app.services.product_action_suggestions_service import (
            apply_approved_suggestions,
        )
        from app.session_answers import answer

        self.BpmnMetaPatchIn = BpmnMetaPatchIn
        self.BpmnXmlIn = BpmnXmlIn
        self.CreateSessionIn = CreateSessionIn
        self.InferRtiersIn = InferRtiersIn
        self.create_session = create_session
        self.get_default_org_id = get_default_org_id
        self.get_storage = get_storage
        self.session_bpmn_meta_infer_rtiers = session_bpmn_meta_infer_rtiers
        self.session_bpmn_meta_patch = session_bpmn_meta_patch
        self.session_bpmn_save = session_bpmn_save
        self.AnswerIn = AnswerIn
        self.NotesExtractionApplyIn = NotesExtractionApplyIn
        self.NotesIn = NotesIn
        self.Question = Question
        self.post_notes = post_notes
        self.post_notes_extraction_apply = post_notes_extraction_apply
        self.apply_approved_suggestions = apply_approved_suggestions
        self.answer = answer
        self.svc = _svc

        self.admin = create_user("meta_writers_admin@local", "admin", is_admin=True)
        self.org_id = self.get_default_org_id()

    def tearDown(self):
        self._redis_patcher.stop()
        for env_key, old_value in (
            ("PROCESS_STORAGE_DIR", self.old_sessions_dir),
            ("PROJECT_STORAGE_DIR", self.old_projects_dir),
            ("PROCESS_DB_PATH", self.old_db_path),
            ("FPC_DB_BACKEND", self.old_db_backend),
            ("DATABASE_URL", self.old_database_url),
        ):
            if old_value is None:
                os.environ.pop(env_key, None)
            else:
                os.environ[env_key] = old_value
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    # ── helpers ────────────────────────────────────────────────────────────

    def _new_session(self, title: str) -> str:
        created = self.create_session(self.CreateSessionIn(title=title))
        sid = str(created.get("id") or "")
        self.assertTrue(sid)
        return sid

    def _dummy_request(self) -> _DummyRequest:
        return _DummyRequest(self.admin, active_org_id=self.org_id)

    def _projection_dsv(self, sid: str) -> int:
        """dsv, каким его видит клиент через кэш-проекцию (GET /api/sessions/{id})."""
        payload = self.svc.get_session(sid, request=self._dummy_request())
        return int(payload.get("diagram_state_version") or 0)

    def _db_dsv(self, sid: str) -> int:
        sess = self.get_storage().load(sid, is_admin=True)
        self.assertIsNotNone(sess)
        return int(getattr(sess, "diagram_state_version", 0) or 0)

    def _assert_fresh_after_write(self, sid: str, dsv_before: int) -> None:
        """Контракт: meta-write bump'нул dsv (DB) → проекция отдаёт свежий dsv."""
        self.assertEqual(self._db_dsv(sid), dsv_before + 1, "meta-write должен bump'нуть dsv в DB")
        self.assertEqual(
            self._projection_dsv(sid),
            dsv_before + 1,
            "после meta-write кэш-проекция обязана отдавать свежий dsv "
            "(инвалидация в том же запросе, что и commit save)",
        )

    # ── 1. bpmn_meta PATCH (app/_legacy_main.py:4337) ──────────────────────

    def test_bpmn_meta_patch_invalidates_projection(self):
        sid = self._new_session("meta patch")
        self.assertEqual(self.session_bpmn_save(sid, self.BpmnXmlIn(xml=XOR_SUCCESS_FAIL_XML)).get("ok"), True)
        dsv_before = self._projection_dsv(sid)

        patched = self.session_bpmn_meta_patch(sid, self.BpmnMetaPatchIn(flowId="Flow_yes", tier="P0"))
        self.assertEqual(patched.get("flow_meta", {}).get("Flow_yes", {}).get("tier"), "P0")
        self._assert_fresh_after_write(sid, dsv_before)

    # ── 2. infer_rtiers (app/_legacy_main.py:4378) ─────────────────────────

    def test_infer_rtiers_invalidates_projection(self):
        sid = self._new_session("infer rtiers")
        self.assertEqual(self.session_bpmn_save(sid, self.BpmnXmlIn(xml=XOR_SUCCESS_FAIL_XML)).get("ok"), True)
        dsv_before = self._projection_dsv(sid)

        inferred = self.session_bpmn_meta_infer_rtiers(
            sid,
            self.InferRtiersIn(
                scopeStartId="Start_1",
                successEndIds=["End_success"],
                failEndIds=["End_fail"],
            ),
        )
        flow_meta = inferred.get("meta", {}).get("flow_meta", {})
        self.assertTrue(any(str((row or {}).get("rtier") or "").strip() for row in flow_meta.values()))
        self._assert_fresh_after_write(sid, dsv_before)

    # ── 3. answer (app/session_answers.py:209) ─────────────────────────────

    def test_answer_invalidates_projection(self):
        sid = self._new_session("answer")
        st = self.get_storage()
        sess = st.load(sid, is_admin=True)
        sess.questions = [
            self.Question(id="q1", node_id="", issue_type="AMBIG", question="Что делать?")
        ]
        st.save(sess, is_admin=True)
        dsv_before = self._projection_dsv(sid)

        self.answer(sid, self.AnswerIn(question_id="q1", answer="оставить"))
        self._assert_fresh_after_write(sid, dsv_before)

    # ── 4. post_notes (app/notes_extraction.py:96) ─────────────────────────

    def test_post_notes_invalidates_projection(self):
        sid = self._new_session("post notes")

        def _fake_extract_process(notes, api_key="", base_url=""):
            _ = notes, api_key, base_url
            return {
                "nodes": [{"id": "n1", "type": "step", "title": "Шаг 1"}],
                "edges": [],
                "roles": ["Повар"],
            }

        with patch("app.ai.deepseek_client.extract_process", side_effect=_fake_extract_process):
            out = self.post_notes(sid, self.NotesIn(notes="Процесс: приготовить суп"))
        self.assertNotIn("error", out)
        dsv_before = self._projection_dsv(sid)

        with patch("app.ai.deepseek_client.extract_process", side_effect=_fake_extract_process):
            out = self.post_notes(sid, self.NotesIn(notes="Процесс: приготовить суп и подать"))
        self.assertNotIn("error", out)
        self._assert_fresh_after_write(sid, dsv_before)

    # ── 5. post_notes_extraction_apply (app/notes_extraction.py:397) ───────

    def test_notes_extraction_apply_invalidates_projection(self):
        sid = self._new_session("notes apply")
        st = self.get_storage()
        dsv_before = self._projection_dsv(sid)

        out = self.post_notes_extraction_apply(
            sid,
            self.NotesExtractionApplyIn(
                apply_notes=True,
                notes="Обновлённые заметки по процессу",
                base_diagram_state_version=dsv_before,
            ),
        )
        self.assertEqual(out.get("status"), "applied")
        self._assert_fresh_after_write(sid, dsv_before)

    # ── 6. apply_approved_suggestions
    #    (app/services/product_action_suggestions_service.py:174) ──────────

    def test_apply_approved_suggestions_invalidates_projection(self):
        sid = self._new_session("suggestions apply")
        st = self.get_storage()
        st.upsert_product_action_suggestion(
            sid,
            {
                "id": "s1",
                "status": "approved",
                "source": "llm",
                "original_llm_output": {},
                "action": {"id": "pa_1", "action_text": "Проверить температуру"},
                "binding": {},
                "edited_by_user": 0,
            },
        )
        dsv_before = self._projection_dsv(sid)

        out = self.apply_approved_suggestions(sid, dsv_before, actor_user_id="admin")
        self.assertEqual(out.get("applied_count"), 1)
        self._assert_fresh_after_write(sid, dsv_before)


if __name__ == "__main__":
    unittest.main()
