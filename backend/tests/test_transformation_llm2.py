"""LLM2 — тесты live-трансформации через gateway + tie-арбитр + confidence-порог.

Критерии PLAN.md:
- без ключа (no_provider): pipeline работает как раньше — offline + open_questions;
- tie между правилами → LLM-арбитр (не молчаливый первый); оффлайн → open_question;
- confidence ниже порога (0.6) → open_question, не угадывание;
- контракт matches[]/derived_from/trace_map не изменён (структура та же);
- mock-фолбэк (llm_call) НЕ удалён.

Без БД: gateway замокан на уровне app.ai.gateway.complete.
Запуск из корня репо: python -m pytest backend/tests/test_transformation_llm2.py -q
"""
import json
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.transformation import pipeline  # noqa: E402
from backend.app.transformation.pipeline import (  # noqa: E402
    LLM_CONFIDENCE_THRESHOLD,
    match_deterministic_winners,
    transform_asis,
)

XML_TMPL = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:startEvent id="E1" name="s"/>
    <bpmn:userTask id="Task_x" name="{name}"/>
    <bpmn:endEvent id="E2" name="e"/>
    <bpmn:sequenceFlow id="F1" sourceRef="E1" targetRef="Task_x"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_x" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>
"""

# Два правила с ОДИНАКОВЫМ score (keyword-hit, priority 80 оба) → tie на «смешать».
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


def _xml(name="Смешать компоненты"):
    return XML_TMPL.format(name=name)


def _tm(res, element_id):
    """Запись trace_map (list) по element_id."""
    for entry in res["trace_map"]:
        if entry.get("element_id") == element_id:
            return entry
    raise AssertionError(f"trace_map: нет записи для {element_id}")


def test_tie_detected_by_winners():
    from backend.app.transformation.pipeline import extract_facts

    facts = extract_facts(_xml())
    fact = [f for f in facts["elements"] if f["id"] == "Task_x"][0]
    winners = match_deterministic_winners(fact, TIE_RULES)
    assert {w["id"] for w in winners} == {"RT_mix_a", "RT_mix_b"}


def test_tie_goes_to_llm_arbiter_not_silent_first():
    """Tie → LLM выбирает правило; источник решения — llm."""
    llm = lambda s, u: json.dumps({"matches": [
        {"element_id": "Task_x", "rule_id": "RT_mix_b", "confidence": 0.9},
    ]})
    res = transform_asis(_xml(), rules=TIE_RULES, llm_call=llm, llm_enabled=True)
    assert res["llm_status"] == "llm"
    tm = _tm(res, "Task_x")
    assert tm["rule_id"] == "RT_mix_b"
    assert tm["source"] == "llm"


def test_tie_offline_becomes_open_question_not_silent_pick():
    """Tie + оффайн → НЕ молчаливый первый, а open_question."""
    def boom(s, u):
        raise RuntimeError("no key")

    res = transform_asis(_xml(), rules=TIE_RULES, llm_call=boom, llm_enabled=True)
    assert res["llm_status"] == "offline"
    oq = [q for q in res["open_questions"] if q.get("element_id") == "Task_x"]
    assert oq, "tie при оффлайне обязан стать open_question"
    nodes = res["draft_ui_model"]["nodes"]
    assert not any(n.get("source_element_id") == "Task_x" for n in nodes), \
        "tie-задача не должна молча трансформироваться"


def test_confidence_below_threshold_is_rejected():
    low = json.dumps({"matches": [
        {"element_id": "Task_x", "rule_id": "RT_mix_b", "confidence": LLM_CONFIDENCE_THRESHOLD - 0.1},
    ]})
    res = transform_asis(_xml("Разовая акция без правила"), rules=TIE_RULES,
                         llm_call=lambda s, u: low, llm_enabled=True)
    oq = [q for q in res["open_questions"] if q.get("element_id") == "Task_x"]
    assert oq, "confidence ниже порога → open_question"


def test_confidence_at_threshold_is_accepted():
    ok = json.dumps({"matches": [
        {"element_id": "Task_x", "rule_id": "RT_mix_b", "confidence": LLM_CONFIDENCE_THRESHOLD},
    ]})
    res = transform_asis(_xml("Разовая акция без правила"), rules=TIE_RULES,
                         llm_call=lambda s, u: ok, llm_enabled=True)
    assert _tm(res, "Task_x")["rule_id"] == "RT_mix_b"


def test_default_llm_call_uses_gateway_feature_and_max_tokens():
    """_default_llm_call → complete('as_is_transform', max_tokens=2000); ok → text."""
    with mock.patch("backend.app.ai.gateway.complete") as comp:
        comp.return_value = {"ok": True, "status": "ok", "text": '{"matches": []}'}
        out = pipeline._default_llm_call("sys", '{"rules": [], "unmatched_tasks": []}')
    assert out == '{"matches": []}'
    args, kwargs = comp.call_args
    assert args[0] == "as_is_transform"
    assert isinstance(args[1], dict)  # user_prompt распарсен в payload
    assert kwargs["max_tokens"] == 2000


def test_default_llm_call_raises_on_gateway_failure():
    for status in ("no_provider", "disabled", "rate_limited", "error"):
        with mock.patch("backend.app.ai.gateway.complete") as comp:
            comp.return_value = {"ok": False, "status": status, "error": "x"}
            try:
                pipeline._default_llm_call("sys", "{}")
                raise AssertionError(f"ожидали raise при {status}")
            except RuntimeError as e:
                assert status in str(e)


def test_offline_without_provider_preserves_old_behavior():
    """Без ключа: pipeline как раньше — offline + open_questions, НЕ падение."""
    with mock.patch("backend.app.ai.gateway.complete") as comp:
        comp.return_value = {"ok": False, "status": "no_provider", "error": "no enabled providers"}
        res = transform_asis(_xml("Смешать компоненты"), rules=TIE_RULES, llm_enabled=True)
    assert res["llm_status"] == "offline"
    assert any(q.get("element_id") == "Task_x" for q in res["open_questions"])


def test_result_structure_unchanged():
    """derived_from/trace_map/open_questions — структура результата как раньше."""
    res = transform_asis(_xml(), rules=TIE_RULES,
                         llm_call=lambda s, u: json.dumps({"matches": []}), llm_enabled=True)
    for key in ("draft_ui_model", "as_is_ui_model", "trace_map", "open_questions",
                "validation_report", "llm_status"):
        assert key in res, f"нет ключа {key}"
    tm = _tm(res, "Task_x")
    assert "fate" in tm and tm["fate"] == "open_question"  # matches пуст → open_question, структура на месте
