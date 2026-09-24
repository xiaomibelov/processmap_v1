"""Jev — каскад в точке A (0 winners + tie) и smoke end-to-end.

Критерии PLAN.md (Task 6-7):
- conf ≥0.90 → accept, source="jev" в trace_map, LLM не вызывается;
- 0.60–0.90 → арбитраж существующей LLM (source="llm");
- <0.60 → open_question (через LLM-путь с пустым ответом → unmatched);
- tie: Jev выбирает СРЕДИ tied rule_ids; выбор вне tied-кандидатов отбрасывается;
- JEV_ENABLED=0 → поведение битово как без Jev (LLM-арбитр работает);
- smoke: mock → адаптер → точка A → trace_map, draft проходит валидатор.

Запуск из корня репо: python -m pytest backend/tests/test_jev_cascade.py -q
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.transformation import jev  # noqa: E402
from backend.app.transformation.pipeline import transform_asis  # noqa: E402

XML_TMPL = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:startEvent id="E1" name="s"/>
    <bpmn:userTask id="{task_id}" name="{name}"/>
    <bpmn:endEvent id="E2" name="e"/>
    <bpmn:sequenceFlow id="F1" sourceRef="E1" targetRef="{task_id}"/>
    <bpmn:sequenceFlow id="F2" sourceRef="{task_id}" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>
"""

TIE_RULES = [
    {
        "id": "RT_mix_a", "name": "Смешать A", "priority": 80,
        "as_is_pattern": {"name_keywords": ["смешать"]},
        "to_be_action": "map_to_operation", "operation_code": "transfer",
        "params_map": {}, "static_params": {},
    },
    {
        "id": "RT_mix_b", "name": "Смешать B", "priority": 80,
        "as_is_pattern": {"name_keywords": ["смешать", "перемешать"]},
        "to_be_action": "map_to_operation", "operation_code": "wait",
        "params_map": {}, "static_params": {},
    },
]


@pytest.fixture(autouse=True)
def _isolate_jev_env(monkeypatch):
    for name in list(os.environ):
        if name.startswith("JEV_"):
            monkeypatch.delenv(name, raising=False)
    jev.reset_breaker()
    yield
    jev.reset_breaker()


def _xml(task_id="Task_x", name="Смешать компоненты"):
    return XML_TMPL.format(task_id=task_id, name=name)


def _tm(res, element_id):
    for entry in res["trace_map"]:
        if entry.get("element_id") == element_id:
            return entry
    raise AssertionError(f"trace_map: нет записи для {element_id}")


def _recording_llm(calls):
    def llm(system_prompt, user_prompt):
        calls.append(json.loads(user_prompt))
        return json.dumps({"matches": []})
    return llm


def _patch_provider(monkeypatch, responses):
    provider = jev.MockJevProvider(responses)
    monkeypatch.setattr(jev, "_default_provider", lambda: provider)
    return provider


def test_auto_accept_high_confidence_no_llm(monkeypatch):
    """conf 0.95 ≥ τ_auto → source='jev', LLM не дёргается."""
    os.environ["JEV_ENABLED"] = "1"
    _patch_provider(monkeypatch, {"Task_x": ("RT_mix_b", 0.95)})
    llm_calls = []
    res = transform_asis(_xml(), rules=TIE_RULES, llm_call=_recording_llm(llm_calls), llm_enabled=True)
    tm = _tm(res, "Task_x")
    assert tm["source"] == "jev"
    assert tm["rule_id"] == "RT_mix_b"
    assert llm_calls == []
    assert res["llm_status"] == "disabled"


def test_mid_confidence_falls_to_llm_arbitration(monkeypatch):
    """0.60–0.90 → существующий LLM-арбитр решает."""
    os.environ["JEV_ENABLED"] = "1"
    _patch_provider(monkeypatch, {"Task_x": ("RT_mix_b", 0.75)})
    llm = lambda s, u: json.dumps({"matches": [
        {"element_id": "Task_x", "rule_id": "RT_mix_a", "confidence": 0.9},
    ]})
    res = transform_asis(_xml(), rules=TIE_RULES, llm_call=llm, llm_enabled=True)
    tm = _tm(res, "Task_x")
    assert tm["source"] == "llm"
    assert tm["rule_id"] == "RT_mix_a"


def test_low_confidence_becomes_open_question(monkeypatch):
    os.environ["JEV_ENABLED"] = "1"
    _patch_provider(monkeypatch, {"Task_x": ("RT_mix_b", 0.40)})
    res = transform_asis(_xml(), rules=TIE_RULES, llm_call=lambda s, u: json.dumps({"matches": []}), llm_enabled=True)
    tm = _tm(res, "Task_x")
    assert tm["fate"] == "open_question"
    assert tm.get("source") is None  # trace open_question не несёт source (пре-существующая форма)
    oq = [q for q in res["open_questions"] if q.get("element_id") == "Task_x"]
    assert oq


def test_tie_choice_outside_candidates_rejected(monkeypatch):
    """Анти-галлюцинация tie: выбор вне tied rule_ids не принимается."""
    os.environ["JEV_ENABLED"] = "1"
    rules_with_extra = TIE_RULES + [
        {
            "id": "RT_other", "name": "Постороннее правило", "priority": 10,
            "as_is_pattern": {"name_keywords": ["несуществующее_kw"]},
            "to_be_action": "map_to_operation", "operation_code": "move",
            "params_map": {}, "static_params": {},
        },
    ]
    provider = jev.MockJevProvider({"Task_x": ("RT_other", 0.95)}, enforce_candidates=True)
    monkeypatch.setattr(jev, "_default_provider", lambda: provider)
    res = transform_asis(_xml(), rules=rules_with_extra, llm_call=lambda s, u: json.dumps({"matches": []}), llm_enabled=True)
    tm = _tm(res, "Task_x")
    assert tm["fate"] == "open_question"
    assert tm.get("source") is None  # RT_other известен каталогу, но вне tied-кандидатов


def test_flag_off_llm_arbiter_unchanged():
    """JEV_ENABLED=0 → tie уходит в LLM как сегодня (source='llm')."""
    llm = lambda s, u: json.dumps({"matches": [
        {"element_id": "Task_x", "rule_id": "RT_mix_a", "confidence": 0.9},
    ]})
    res = transform_asis(_xml(), rules=TIE_RULES, llm_call=llm, llm_enabled=True)
    tm = _tm(res, "Task_x")
    assert tm["source"] == "llm"


def test_smoke_zero_winners_end_to_end(monkeypatch):
    """Smoke: 0 winners → mock → адаптер → точка A → source='jev', draft валиден."""
    os.environ["JEV_ENABLED"] = "1"
    _patch_provider(monkeypatch, {"Task_jev": ("RT_mix_a", 0.93)})
    xml = XML_TMPL.format(task_id="Task_jev", name="Промыть оборудование")
    res = transform_asis(xml, rules=TIE_RULES, llm_call=lambda s, u: json.dumps({"matches": []}), llm_enabled=True)
    tm = _tm(res, "Task_jev")
    assert tm["source"] == "jev"
    assert tm["rule_id"] == "RT_mix_a"
    assert tm["fate"] == "transformed_to"
    assert res["validation_report"]["summary"]["errors"] == 0
    # и с выключенным флагом — LLM-путь (пустой mock) → open_question, source="jev" нет
    os.environ["JEV_ENABLED"] = "0"
    res0 = transform_asis(xml, rules=TIE_RULES, llm_call=lambda s, u: json.dumps({"matches": []}), llm_enabled=True)
    tm0 = _tm(res0, "Task_jev")
    assert tm0["fate"] == "open_question"
    assert tm0.get("source") is None
