"""Jev — контракт адаптера (mock-провайдер, retry, circuit breaker, анти-галлюцинация).

Критерии PLAN.md (feature/jev-tobe-classifier-v1, Task 1-2):
- jev_choice() возвращает JevChoice(rule_id, confidence); frozen-dataclass;
- mock-провайдер детерминирован и считает вызовы;
- таймаут/5xx/DNS → JevUnavailable (upstream: fallback на существующий каскад);
- retry ровно ×1 (JEV_MAX_RETRIES=1): провайдер, падающий 1 раз, вызывается 2 раза;
- circuit breaker: после JEV_BREAKER_FAILURES подряд failing-батчей провайдер больше не дёргается;
- анти-галлюцинация: rule_id ∉ rules и rule_id ∉ candidates факта отбрасываются;
- jev_enabled(): default 0 (False); JEV_ENABLED=1 → True.

Запуск из корня репо: python -m pytest backend/tests/test_jev_adapter_contract.py -q
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.transformation import jev  # noqa: E402

RULES = [
    {"id": "R01_move", "to_be_action": "map_to_operation", "operation_code": "move"},
    {"id": "R02_wait", "to_be_action": "map_to_operation", "operation_code": "wait"},
]

FACTS = [{"id": "Task_1", "bpmn_type": "userTask", "name": "Промыть котел"}]


@pytest.fixture(autouse=True)
def _isolate_jev_env(monkeypatch):
    """Каждый тест — со свежим breaker'ом и чистыми JEV_* env."""
    for name in list(os.environ):
        if name.startswith("JEV_"):
            monkeypatch.delenv(name, raising=False)
    jev.reset_breaker()
    yield
    jev.reset_breaker()


def test_enabled_flag_default_off():
    assert jev.jev_enabled() is False


def test_enabled_flag_on():
    os.environ["JEV_ENABLED"] = "1"
    assert jev.jev_enabled() is True


def test_mock_provider_returns_configured_choice():
    provider = jev.MockJevProvider({"Task_1": ("R01_move", 0.95)})
    out = provider([{"element": {"element_id": "Task_1"}, "candidates": [{"rule_id": "R01_move"}]}], RULES)
    assert out["Task_1"] == jev.JevChoice(rule_id="R01_move", confidence=0.95)
    assert provider.calls == 1


def test_mock_provider_default_has_no_opinion():
    provider = jev.MockJevProvider()
    out = provider([{"element": {"element_id": "Task_1"}, "candidates": []}], RULES)
    assert out == {}


def test_anti_hallucination_rejects_unknown_rule():
    provider = jev.MockJevProvider({"Task_1": ("R99_unknown", 0.95)})
    out = provider([{"element": {"element_id": "Task_1"}, "candidates": [{"rule_id": "R99_unknown"}]}], RULES)
    assert out == {}


def test_anti_hallucination_rejects_out_of_range_confidence():
    provider = jev.MockJevProvider({"Task_1": ("R01_move", 1.5)})
    out = provider([{"element": {"element_id": "Task_1"}, "candidates": [{"rule_id": "R01_move"}]}], RULES)
    assert out == {}


def test_match_retries_once_then_succeeds():
    os.environ["JEV_ENABLED"] = "1"
    calls = {"n": 0}

    def flaky(states, rules):
        calls["n"] += 1
        if calls["n"] == 1:
            raise jev.JevUnavailable("timeout")
        return {"Task_1": jev.JevChoice("R01_move", 0.9)}

    out = jev.match_with_jev(FACTS, RULES, provider=flaky)
    assert calls["n"] == 2  # 1 попытка + ровно 1 retry
    assert out["Task_1"].rule_id == "R01_move"


def test_match_returns_empty_after_exhausted_retries():
    os.environ["JEV_ENABLED"] = "1"
    calls = {"n": 0}

    def always_fail(states, rules):
        calls["n"] += 1
        raise jev.JevUnavailable("5xx")

    out = jev.match_with_jev(FACTS, RULES, provider=always_fail)
    assert out == {}
    assert calls["n"] == 2  # retry ×1, дальше — fallback


def test_circuit_breaker_opens_after_failure_threshold():
    os.environ["JEV_ENABLED"] = "1"
    os.environ["JEV_BREAKER_FAILURES"] = "2"
    calls = {"n": 0}

    def always_fail(states, rules):
        calls["n"] += 1
        raise jev.JevUnavailable("dns")

    assert jev.match_with_jev(FACTS, RULES, provider=always_fail) == {}
    assert jev.match_with_jev(FACTS, RULES, provider=always_fail) == {}
    assert calls["n"] == 4  # два батча × 2 попытки
    # breaker открыт: провайдер больше не вызывается
    assert jev.match_with_jev(FACTS, RULES, provider=always_fail) == {}
    assert calls["n"] == 4


def test_breaker_resets_after_success():
    os.environ["JEV_ENABLED"] = "1"
    os.environ["JEV_BREAKER_FAILURES"] = "1"
    provider = jev.MockJevProvider({"Task_1": ("R01_move", 0.9)})

    def fail(states, rules):
        raise jev.JevUnavailable("boom")

    assert jev.match_with_jev(FACTS, RULES, provider=fail) == {}
    # breaker открыт (порог 1), но успешный вызов через reset даёт новый цикл
    jev.reset_breaker()
    out = jev.match_with_jev(FACTS, RULES, provider=provider)
    assert out["Task_1"].rule_id == "R01_move"


def test_match_disabled_flag_returns_empty():
    provider = jev.MockJevProvider({"Task_1": ("R01_move", 0.95)})
    assert jev.match_with_jev(FACTS, RULES, provider=provider) == {}
    assert provider.calls == 0
