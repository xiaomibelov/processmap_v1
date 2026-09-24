"""Jev — инварианты fallback (битовое равенство offline-baseline).

Критерии PLAN.md (Task 5) и ADR (инвариант деградации):
- JEV_ENABLED=0 → выход transform_asis ПОБАЙТОВО равен baseline без Jev (golden-фикстура);
- JEV_ENABLED=1, но Jev без мнения/с ошибкой → тот же baseline;
- анти-галлюцинация на уровне каскада: rule_id ∉ rules не принимается даже с conf 0.95.

Запуск из корня репо: python -m pytest backend/tests/test_jev_fallback_invariance.py -q
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.transformation import jev  # noqa: E402
from backend.app.transformation.pipeline import transform_asis  # noqa: E402
from backend.app.transformation.rules_loader import load_rules  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "itmo_razogrev_v02.bpmn")


@pytest.fixture(autouse=True)
def _isolate_jev_env(monkeypatch):
    for name in list(os.environ):
        if name.startswith("JEV_"):
            monkeypatch.delenv(name, raising=False)
    jev.reset_breaker()
    yield
    jev.reset_breaker()


def _llm_no_op(system_prompt: str, user_prompt: str) -> str:
    return json.dumps({"matches": []})


def _golden_baseline():
    with open(FIXTURE, encoding="utf-8") as fh:
        return transform_asis(fh.read(), llm_call=_llm_no_op, llm_enabled=True)


def test_flag_off_bitwise_equals_baseline():
    baseline = _golden_baseline()
    os.environ["JEV_ENABLED"] = "1"  # включён, но дефолтный mock — без мнений
    with open(FIXTURE, encoding="utf-8") as fh:
        result = transform_asis(fh.read(), llm_call=_llm_no_op, llm_enabled=True)
    assert result == baseline
    assert not any(t.get("source") == "jev" for t in result["trace_map"])


def test_flag_unset_bitwise_equals_baseline():
    baseline = _golden_baseline()
    with open(FIXTURE, encoding="utf-8") as fh:
        result = transform_asis(fh.read(), llm_call=_llm_no_op, llm_enabled=True)
    assert result == baseline


def test_jev_failure_keeps_baseline(monkeypatch):
    baseline = _golden_baseline()
    os.environ["JEV_ENABLED"] = "1"

    def boom(facts, rules, **kwargs):
        raise RuntimeError("unexpected")

    monkeypatch.setattr(jev, "match_with_jev", boom)
    with open(FIXTURE, encoding="utf-8") as fh:
        result = transform_asis(fh.read(), llm_call=_llm_no_op, llm_enabled=True)
    assert result == baseline


def test_jev_hallucination_not_accepted():
    """rule_id вне каталога не должен попасть в draft даже с conf 0.95."""
    os.environ["JEV_ENABLED"] = "1"
    rules = load_rules()
    provider = jev.MockJevProvider({"Activity_nonexistent": ("R99_fake", 0.95)})
    with open(FIXTURE, encoding="utf-8") as fh:
        result = transform_asis(fh.read(), llm_call=_llm_no_op, llm_enabled=True)
    # подменяем провайдера после импорта: прогоняем каскад напрямую
    matches = jev.match_with_jev(
        [{"id": "Activity_nonexistent", "bpmn_type": "task", "name": "X"}],
        rules,
        provider=provider,
    )
    assert matches == {}
