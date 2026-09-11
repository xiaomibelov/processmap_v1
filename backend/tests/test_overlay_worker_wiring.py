"""Worker-like wiring хуков overlay_cache (fix/overlay-render-notimplemented).

Дефект: overlay_cache.py содержит app-provided stubs, которые monkeypatch'атся
только при импорте _legacy_main (API-процесс). Celery-worker импортирует только
celery_app → tasks, wiring отсутствует → render_overlay_task падает с
NotImplementedError (~240 раз/сутки на prod).

Тесты:
1. Worker-like (изолированный subprocess): импорт только backend.app.celery_app
   → _legacy_main НЕ в sys.modules, хуки overlay_cache заменены на wired-версии,
   render_overlay_task.apply() с фейковыми зависимостями не поднимает
   NotImplementedError и wired-renderer реально вызван.
2. API-контекст (регрессия): импорт _legacy_main wire'ит хуки (как раньше).
"""
from __future__ import annotations

import os
import subprocess
import sys
import textwrap
import unittest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
for _p in (BACKEND_DIR, REPO_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

_WORKER_PROBE = textwrap.dedent(
    """
    import sys
    import types

    sys.path.insert(0, __REPO_ROOT__)
    sys.path.insert(0, __BACKEND_DIR__)

    # --- Worker-like импорт: ТОЛЬКО celery_app (как у реального воркера) ---
    import backend.app.celery_app  # noqa: F401
    import backend.app.overlay_cache as oc

    assert "backend.app._legacy_main" not in sys.modules, \\
        "god-module _legacy_main подтянут при импорте celery_app"
    assert "app._legacy_main" not in sys.modules

    for attr in (
        "fetch_session_bpmn",
        "fetch_annotations",
        "compute_overlays_json",
        "render_overlay_xml",
    ):
        fn = getattr(oc, attr)
        assert fn.__name__ != attr, \\
            f"overlay_cache.{{attr}} не заменён wired-версией ({{fn.__name__}})"

    # --- Подменяем тяжёлые зависимости фейками ДО вызова задачи ---
    WIRED_MARK = "<!--wired-render-->"

    class _FakeSession:
        bpmn_xml = "<bpmn/>"

    def _fake_load_session(sid, request=None):
        return (_FakeSession(), "", None)

    fake_legacy_main = types.ModuleType("backend.app._legacy_main")
    fake_legacy_main._legacy_load_session_scoped = _fake_load_session
    fake_legacy_main._overlay_interview_annotations_on_bpmn_xml = \\
        lambda sess, xml: xml + WIRED_MARK
    fake_legacy_main._compute_overlays_json = lambda sess, xml: []
    sys.modules["backend.app._legacy_main"] = fake_legacy_main

    fake_bpmn_exporter = types.ModuleType("backend.app.exporters.bpmn")
    fake_bpmn_exporter._collect_interview_comments = lambda data, nodes: {}
    sys.modules["backend.app.exporters.bpmn"] = fake_bpmn_exporter

    # Redis в subprocess нет — подменяем клиента до вызова задачи.
    import fakeredis
    oc.r = fakeredis.FakeRedis(decode_responses=False)

    # --- Вызов задачи, как это делает воркер ---
    from backend.app.tasks import render_overlay_task

    render_overlay_task.apply(
        args=["sid-1", "<bpmn/>", [], 0, 0, 0, 10],
        throw=True,
    )

    payload_key = oc._k("sid-1", 0, 0, 0, 10)
    raw = oc.r.get(payload_key)
    assert raw is not None, "render_overlay_task не записал payload в кэш"
    assert WIRED_MARK.encode() in raw, \\
        "wired-renderer не был вызван (метки нет в закэшированном xml)"

    print("WORKER_PROBE_OK")
    """
).replace("__REPO_ROOT__", repr(REPO_ROOT)).replace("__BACKEND_DIR__", repr(BACKEND_DIR))


class TestWorkerOverlayWiring(unittest.TestCase):
    def test_worker_import_wires_hooks_and_task_runs(self):
        env = dict(os.environ)
        env["CELERY_TASK_ALWAYS_EAGER"] = "1"
        proc = subprocess.run(
            [sys.executable, "-c", _WORKER_PROBE],
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
        )
        self.assertIn("WORKER_PROBE_OK", proc.stdout)
        self.assertEqual(proc.returncode, 0, msg=f"stderr:\n{proc.stderr}\nstdout:\n{proc.stdout}")


class TestApiContextOverlayWiring(unittest.TestCase):
    def setUp(self):
        from app import overlay_cache

        self._saved = {
            attr: getattr(overlay_cache, attr)
            for attr in (
                "fetch_session_bpmn",
                "fetch_annotations",
                "compute_overlays_json",
                "render_overlay_xml",
            )
        }

    def tearDown(self):
        from app import overlay_cache

        # Не оставлять wiring в общем pytest-процессе: тесты ниже
        # (test_overlay_cache.py) рассчитаны на stub-контракт без импорта
        # _legacy_main; их порядок относительно этого файла не фиксирован.
        for attr, fn in self._saved.items():
            setattr(overlay_cache, attr, fn)

    def test_legacy_main_import_wires_hooks(self):
        import app._legacy_main  # noqa: F401
        from app import overlay_cache

        self.assertEqual(overlay_cache.render_overlay_xml.__name__, "_wired_render_overlay_xml")
        self.assertEqual(overlay_cache.fetch_session_bpmn.__name__, "_wired_fetch_session_bpmn")
        self.assertEqual(overlay_cache.fetch_annotations.__name__, "_wired_fetch_annotations")
        self.assertEqual(overlay_cache.compute_overlays_json.__name__, "_wired_compute_overlays_json")
