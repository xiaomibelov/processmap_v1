"""conftest contract-suite: изоляция от основного прогона + session-seed.

- pytest_ignore_collect: без явного `-m contract` модуль test_contract_fuzz.py
  не импортируется (он строит fuzz-стратегии и поднимает app — не замедляем
  основной прогон; pytest.ini: addopts = -m "not contract").
- isolate_process_db: переопределяет per-test изоляцию из tests/conftest.py —
  contract-suite использует одну session-wide SQLite с seed-данными
  (contract_support выставляет PROCESS_DB_PATH при импорте этого conftest).
"""
from __future__ import annotations

import re

import pytest

# Импорт contract_support ПЕРВЫМ: он выставляет PROCESS_DB_PATH до импорта app.
from contract_support import (  # noqa: F401  # pylint: disable=wrong-import-position
    OPERATIONS_SUMMARY_PATH,
)


def pytest_ignore_collect(collection_path, config):
    """Не собирать contract-тесты, если маркер contract явно не запрошен."""
    markexpr = config.getoption("markexpr", default="") or ""
    # «contract» без «not» перед ним: `-m contract`, `-m "contract and not slow"` — собираем;
    # `-m "not contract"` (дефолт из pytest.ini) — пропускаем.
    selects_contract = re.search(r"(?<!not )(?<!not\()\bcontract\b", markexpr)
    if not selects_contract:
        return True
    return None


@pytest.fixture(autouse=True)
def isolate_process_db():
    """Override per-test изоляции tests/conftest.py: единая session-wide БД с seed."""
    yield


def pytest_terminal_summary(terminalreporter, exitstatus, config):  # noqa: ARG001
    """Короткая сводка по охвату операций в конце contract-прогона."""
    import json

    if not OPERATIONS_SUMMARY_PATH.exists():
        return
    try:
        summary = json.loads(OPERATIONS_SUMMARY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return
    counts = summary.get("counts", {})
    terminalreporter.section("contract operations coverage")
    terminalreporter.write_line(
        "fuzzed={fuzzed} llm_envelope={llm_envelope} "
        "skipped_policy={skipped_method_policy} skipped_explicit={skipped_explicit} "
        "total={total} (profile={profile}, max_examples={max})".format(
            profile=summary.get("profile"), max=summary.get("max_examples"), **counts
        )
    )
    terminalreporter.write_line(f"details: {OPERATIONS_SUMMARY_PATH}")
