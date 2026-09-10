"""Guard: миграция-семя processman_agent v3 покрывает пустую схему (N1/M3).

Аудит llm-agent-audit-v1: промпт 018/022 не содержит инструкции для пустой
схемы, поэтому модель возвращала сырой action-JSON. Фикс слоя (a) — новая
версия промпта через llm_prompts (паттерн 018/030), старая версия в archive.
"""
from __future__ import annotations

import importlib.util
import os


def _load_migration():
    path = os.path.join(
        os.path.dirname(__file__), "..", "alembic", "versions", "036_processman_agent_v3_prompt.py"
    )
    spec = importlib.util.spec_from_file_location("migration_036", os.path.abspath(path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_seeds_v3_and_archives_old_versions():
    module = _load_migration()
    assert module.revision == "036"
    assert module.down_revision == "035"

    import inspect

    upgrade_src = inspect.getsource(module.upgrade)
    # v3 сидится как active, старые версии уходят в archive (откат возможен).
    assert "'llmprompt_processman_agent_v3'" in upgrade_src
    assert "'active'" in upgrade_src
    assert "'llmprompt_processman_agent_v1'" in upgrade_src
    assert "'archived'" in upgrade_src

    downgrade_src = inspect.getsource(module.downgrade)
    assert "'llmprompt_processman_agent_v3'" in downgrade_src


def test_v3_system_prompt_covers_empty_schema():
    module = _load_migration()
    system = module._SYSTEM
    # Явная инструкция: пустая схема -> свободный текст по-русски, без actions/JSON.
    assert "пуст" in system.lower()
    assert "JSON" in system
    assert "```json" in system  # протокол действий сохранён для непустой схемы
    assert "suggest-next" in system
