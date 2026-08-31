"""Канонические имена celery-задач (fix/celery-task-naming-splitbrain).

Split-brain: воркер запускается как `celery -A backend.app.celery_app`
(задачи регистрируются как backend.app.*), а часть кода api импортируется
как app.* → enqueue публиковал имена app.* → "unregistered task" на воркере
(прод, 2026-08-31: app.tasks.render_overlay_task ×29, app.rag_tasks.* ×11).
Фикс: явные name="processmap.<домен>.<task>" на всех задачах — имя не зависит
от import-контекста.
"""
from __future__ import annotations

import os
import sys
import unittest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
for _p in (BACKEND_DIR, REPO_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

CANONICAL = {
    "render_overlay_task": "processmap.overlay.render_overlay_task",
    "refresh_session_analytics_task": "processmap.analytics.refresh_session_analytics_task",
    "refresh_all_workspaces_analytics_task": "processmap.analytics.refresh_all_workspaces_analytics_task",
    "index_session_bpmn_xml": "processmap.rag.index_session_bpmn_xml",
    "index_queued_sessions_bpmn_xml": "processmap.rag.index_queued_sessions_bpmn_xml",
}


class TestCanonicalTaskNames(unittest.TestCase):
    def test_all_tasks_have_canonical_names(self):
        from backend.app.tasks import render_overlay_task
        from backend.app.save_services.analytics_aggregator.tasks import (
            refresh_all_workspaces_analytics_task,
            refresh_session_analytics_task,
        )
        from backend.app.rag_tasks import (
            index_queued_sessions_bpmn_xml,
            index_session_bpmn_xml,
        )

        tasks = {
            "render_overlay_task": render_overlay_task,
            "refresh_session_analytics_task": refresh_session_analytics_task,
            "refresh_all_workspaces_analytics_task": refresh_all_workspaces_analytics_task,
            "index_session_bpmn_xml": index_session_bpmn_xml,
            "index_queued_sessions_bpmn_xml": index_queued_sessions_bpmn_xml,
        }
        for attr, task in tasks.items():
            self.assertEqual(
                task.name,
                CANONICAL[attr],
                f"{attr} registered as {task.name!r}, expected {CANONICAL[attr]!r}",
            )

    def test_beat_schedule_uses_registered_canonical_names(self):
        from backend.app import celery_app

        registered = set(celery_app.app.tasks.keys())
        schedule = celery_app.app.conf.beat_schedule or {}
        self.assertTrue(schedule, "beat_schedule must not be empty")
        for entry_name, entry in schedule.items():
            task_name = entry["task"]
            self.assertTrue(
                task_name.startswith("processmap."),
                f"beat entry {entry_name!r} uses non-canonical name {task_name!r}",
            )
            self.assertIn(
                task_name,
                registered,
                f"beat entry {entry_name!r} -> {task_name!r} not in task registry "
                f"(beat/registry рассинхрон)",
            )

    def test_dual_import_context_yields_same_name(self):
        """enqueue из обоих import-контекстов (app.* и backend.app.*) даёт одно имя."""
        import importlib

        app_rag = importlib.import_module("app.rag_tasks")
        backend_rag = importlib.import_module("backend.app.rag_tasks")
        self.assertIsNot(
            app_rag, backend_rag, "ожидались два разных module-объекта (split-brain контексты)"
        )
        self.assertEqual(
            app_rag.index_session_bpmn_xml.name,
            backend_rag.index_session_bpmn_xml.name,
        )
        self.assertEqual(
            app_rag.index_session_bpmn_xml.name,
            "processmap.rag.index_session_bpmn_xml",
        )

        app_tasks = importlib.import_module("app.tasks")
        backend_tasks = importlib.import_module("backend.app.tasks")
        self.assertEqual(
            app_tasks.render_overlay_task.name,
            backend_tasks.render_overlay_task.name,
        )
        self.assertEqual(
            app_tasks.render_overlay_task.name,
            "processmap.overlay.render_overlay_task",
        )


if __name__ == "__main__":
    unittest.main()
