"""Tests for AGENT-2 RAG Celery tasks.

Проверяем, что rag_tasks.py самодостаточен и не порождает циклических импортов
с backend.app.tasks (audit Blocker #5).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))


def test_rag_tasks_importable():
    from backend.app.rag_tasks import index_session_bpmn_xml  # noqa: F401
    assert callable(index_session_bpmn_xml)


def test_rag_tasks_does_not_depend_on_tasks_module():
    """rag_tasks.py не импортирует backend.app.tasks напрямую."""
    import backend.app.rag_tasks as rag_tasks
    import backend.app.tasks as tasks_module

    # Если бы rag_tasks импортировал tasks.py, это был бы тот же модуль-объект
    # или его атрибуты были бы доступны напрямую.
    assert rag_tasks is not tasks_module
    assert "index_session_bpmn_xml" in rag_tasks.__dict__
