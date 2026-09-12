"""F1 (fix/save-latency-subprocess-async, IMPLEMENTATION Этап 7, backend-часть):
async subprocess-sync через celery-задачу `sync_subprocesses_task`.

- флаг FPC_ASYNC_SUBPROCESS_SYNC (default 0): при выкл — побайтовый паритет с main;
- canvas-сохранения (autosave/manual/property_*/...) — async под флагом,
  ответ `subprocesses_sync: "pending"`;
- явный импорт (bpmn_upload/import/import_bpmn/bpmn_restore/restore_bpmn_version)
  остаётся синхронным — счётчики в ответе;
- задача идемпотентна, Redis-lock TTL 120 s (занят → retry/backoff ≤ 3 попыток),
  НЕ пишет сессионную строку родителя (счётчики — read-model Б3).

NOTE: CELERY_TASK_ALWAYS_EAGER из tests/conftest НЕ действует (celery_app
не читает env-конфиг; task_always_eager=False и в тестах). Поэтому celery
мокается точечно: `delay` задачи патчится на inline-выполнение тела (.run).
"""
import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BPMN_TWO_SUBPROCESS = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="ns">
  <process id="p1">
    <startEvent id="start"/>
    <subProcess id="sub_1" name="Sub 1"><task id="t1"/></subProcess>
    <subProcess id="sub_2" name="Sub 2"><task id="t2"/></subProcess>
    <endEvent id="end"/>
  </process>
</definitions>
"""

BPMN_TWO_SUBPROCESS_CHANGED = BPMN_TWO_SUBPROCESS.replace(
    '<subProcess id="sub_1" name="Sub 1">',
    '<subProcess id="sub_1" name="Sub 1 переименован">',
).replace(
    '<subProcess id="sub_2" name="Sub 2"><task id="t2"/></subProcess>',
    "",
)


class _DummyRequest:
    def __init__(self, user: dict, *, active_org_id: str):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}
        self.query_params = {}
        self.scope = {"type": "http"}


class _FakeLockHandle:
    def __init__(self, acquired: bool):
        self.acquired = acquired
        self.released = False

    def release(self) -> bool:
        self.released = True
        return True


@contextmanager
def _delay_inline():
    """Мок celery: `.delay(...)` выполняет тело задачи синхронно (.run)."""
    from app.tasks import sync_subprocesses_task

    def _inline(*args, **kwargs):
        return sync_subprocesses_task.run(*args, **kwargs)

    with patch.object(sync_subprocesses_task, "delay", side_effect=_inline):
        yield


class SubprocessSyncTaskTests(unittest.TestCase):
    def setUp(self):
        self.tmp_sessions = tempfile.TemporaryDirectory()
        self.tmp_projects = tempfile.TemporaryDirectory()
        self.old_sessions_dir = os.environ.get("PROCESS_STORAGE_DIR")
        self.old_projects_dir = os.environ.get("PROJECT_STORAGE_DIR")
        self.old_db_path = os.environ.get("PROCESS_DB_PATH")
        self.old_flag = os.environ.get("FPC_ASYNC_SUBPROCESS_SYNC")
        # Герметичность сьюта: test_overlay_cache выставляет
        # celery_app.conf.task_always_eager = True без восстановления —
        # без гварда broker-down тест в полном прогоне получает inline-выполнение
        # вместо реального падения publish в брокер.
        from app.celery_app import app as celery_app

        self._old_always_eager = celery_app.conf.task_always_eager
        celery_app.conf.task_always_eager = False
        self._celery_app = celery_app
        os.environ["PROCESS_STORAGE_DIR"] = self.tmp_sessions.name
        os.environ["PROJECT_STORAGE_DIR"] = self.tmp_projects.name
        os.environ.pop("PROCESS_DB_PATH", None)

        from app._legacy_main import BpmnXmlIn, get_storage
        from app.repositories import project_repo, session_repo
        from app.services.session_service import bpmn_save
        from app.storage import get_default_org_id

        self.BpmnXmlIn = BpmnXmlIn
        self.get_storage = get_storage
        self.bpmn_save = bpmn_save
        self.project_repo = project_repo
        self.session_repo = session_repo
        self.default_org_id = get_default_org_id()

        self.req = _DummyRequest(
            {"id": "f1_actor", "email": "f1@t.local", "is_admin": True},
            active_org_id=self.default_org_id,
        )
        # Сессия внутри проекта: read-model детей (list_session_children)
        # требует project_id у родителя.
        self.pid = project_repo.create_project(
            "F1 project", user_id="f1_actor", org_id=self.default_org_id
        )
        self.sid = session_repo.create(
            title="F1 async sync",
            project_id=self.pid,
            user_id="f1_actor",
            org_id=self.default_org_id,
        )
        self.assertTrue(self.sid)

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
        if self.old_flag is None:
            os.environ.pop("FPC_ASYNC_SUBPROCESS_SYNC", None)
        else:
            os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = self.old_flag
        self._celery_app.conf.task_always_eager = self._old_always_eager
        self.tmp_sessions.cleanup()
        self.tmp_projects.cleanup()

    def _children(self):
        """Живые дети через доменную функцию (repo-обёртка session_repo
        сломана ещё на main: st.list_session_children не существует)."""
        from app.storage import list_session_children

        return (
            list_session_children(
                self.default_org_id, self.pid, self.sid, is_admin=True
            )
            or []
        )

    @staticmethod
    def _row_value(row, key):
        if isinstance(row, dict):
            return row.get(key)
        return getattr(row, key, None)

    def _child_ids(self, rows):
        return sorted(
            str(self._row_value(c, "id") or "").strip() for c in rows
        )

    def _load_admin(self):
        return self.get_storage().load(self.sid, is_admin=True)

    def _save(self, xml, source_action, base):
        return self.bpmn_save(
            self.sid,
            self.BpmnXmlIn(
                xml=xml,
                source_action=source_action,
                base_diagram_state_version=base,
            ),
            self.req,
        )

    # ── dispatch ──────────────────────────────────────────────────────────

    def test_import_source_action_stays_synchronous_under_flag(self):
        """Явный импорт под флагом — синхронно: счётчики в ответе, дети созданы."""
        os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = "1"
        out = self._save(BPMN_TWO_SUBPROCESS, "bpmn_upload", 0)
        self.assertEqual(out.get("ok"), True)
        self.assertNotEqual(out.get("subprocesses_sync"), "pending")
        self.assertEqual(int(out.get("subprocesses_total") or 0), 2)
        self.assertEqual(len(self._children()), 2)

    def test_autosave_dispatches_task_and_marks_pending(self):
        """Canvas autosave под флагом → pending + задача материализует детей."""
        os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = "1"
        with _delay_inline():
            out = self._save(BPMN_TWO_SUBPROCESS, "autosave", 0)
        self.assertEqual(out.get("ok"), True)
        self.assertEqual(out.get("subprocesses_sync"), "pending")
        self.assertNotIn("subprocesses_sync_failed", out)
        self.assertEqual(len(self._children()), 2)

    def test_async_dispatch_marks_failed_when_broker_down(self):
        """Celery/Redis недоступны: сохранение НЕ падает, async-путь помечен
        failed явно (деградация, паритет ожиданий cf1ffd6b)."""
        os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = "1"
        # delay НЕ мокаем → реальная попытка publish в брокер 'redis' падает
        out = self._save(BPMN_TWO_SUBPROCESS, "autosave", 0)
        self.assertEqual(out.get("ok"), True)
        self.assertEqual(out.get("subprocesses_sync"), "pending")
        self.assertTrue(out.get("subprocesses_sync_failed"))

    def test_task_does_not_write_parent_session_row(self):
        """Гард: задача НЕ пишет строку родителя (dsv/bpmn_xml/bpmn_meta)."""
        os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = "1"
        with _delay_inline():
            out = self._save(BPMN_TWO_SUBPROCESS, "autosave", 0)
        self.assertEqual(out.get("subprocesses_sync"), "pending")
        s = self._load_admin()
        # dsv поднялся ровно на 1 (только save), задача не добавила +1
        self.assertEqual(int(s.diagram_state_version or 0), 1)
        # счётчики НЕ записаны в bpmn_meta строки родителя (read-model Б3)
        self.assertNotIn("subprocesses_total", dict(s.bpmn_meta or {}))
        self.assertNotIn("subprocesses_created", dict(s.bpmn_meta or {}))

    def test_flag_off_is_byte_parity_with_sync_path(self):
        """Флаг выкл (default) → прежний синхронный путь, ключей async нет."""
        os.environ.pop("FPC_ASYNC_SUBPROCESS_SYNC", None)
        out = self._save(BPMN_TWO_SUBPROCESS, "autosave", 0)
        self.assertEqual(out.get("ok"), True)
        self.assertNotIn("subprocesses_sync", out)
        self.assertEqual(int(out.get("subprocesses_total") or 0), 2)
        self.assertEqual(len(self._children()), 2)
        s = self._load_admin()
        # синхронный путь пишет счётчики в bpmn_meta (прежнее поведение)
        self.assertEqual(int((s.bpmn_meta or {}).get("subprocesses_total") or 0), 2)

    def test_task_idempotent_on_repeated_run(self):
        """Повторный запуск той же задачи — безопасен (skip existing, без дублей)."""
        os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = "1"
        with _delay_inline():
            first = self._save(BPMN_TWO_SUBPROCESS, "autosave", 0)
        self.assertEqual(first.get("subprocesses_sync"), "pending")
        before = self._children()

        from app.tasks import sync_subprocesses_task

        # Прямой повторный запуск с тем же аргументом — идемпотентно
        sync_subprocesses_task.run(self.sid, self.default_org_id)
        after = self._children()
        self.assertEqual(self._child_ids(before), self._child_ids(after))

    def test_task_lock_busy_retries_and_never_raises(self):
        """Lock занят → retry/backoff (≤3 попыток); задача не падает и
        НЕ пишет строку родителя."""
        import app.redis_lock as redis_lock_module
        from app.tasks import sync_subprocesses_task

        self.get_storage()  # schema ensured
        busy = _FakeLockHandle(acquired=False)

        with patch.object(redis_lock_module, "acquire_session_lock", return_value=busy):
            # retry ещё доступен → планируется retry с countdown
            with patch.object(sync_subprocesses_task, "retry") as mock_retry:
                sync_subprocesses_task.run(self.sid, self.default_org_id)
            mock_retry.assert_called_once()
            self.assertFalse(busy.released)

            # попытки исчерпаны (MaxRetriesExceededError) → тихий лог,
            # ошибка НЕ всплывает, запись в строку родителя НЕ происходит
            from celery.exceptions import MaxRetriesExceededError

            def _raise_max(**_kw):
                raise MaxRetriesExceededError("attempts exhausted")

            with patch.object(sync_subprocesses_task, "retry", side_effect=_raise_max):
                sync_subprocesses_task.run(self.sid, self.default_org_id)

    def test_task_soft_deletes_removed_children(self):
        """Задача под флагом — та же семантика sync: исчезнувшие дети soft-delete."""
        os.environ["FPC_ASYNC_SUBPROCESS_SYNC"] = "1"
        with _delay_inline():
            self._save(BPMN_TWO_SUBPROCESS, "autosave", 0)
        self.assertEqual(len(self._children()), 2)

        # re-import без sub_2 → задача должна soft-delete протухшего ребёнка
        with _delay_inline():
            out = self._save(BPMN_TWO_SUBPROCESS_CHANGED, "autosave", 1)
        self.assertEqual(out.get("ok"), True)
        # list_session_children отдаёт только живых (deleted_at = 0)
        alive = self._children()
        self.assertEqual(len(alive), 1)
        element_ids = {
            str(self._row_value(c, "element_id_in_parent") or "").strip() for c in alive
        }
        self.assertEqual(element_ids, {"sub_1"})
