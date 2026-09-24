"""Jev — PII-гейт whitelist-сборщика обезличенного state (jev_state).

Критерии PLAN.md (Task 3-4) + PRIVACY.md контура audit/jev-tobe-classifier:
- name/documentation/textAnnotation НЕ попадают в исходящий JSON ни как значения, ни как ключи;
- name_hash_bucket стабилен для одного текста и различен для разных;
- числовые camunda_props → prop_numeric; operation_code → prop_enum; free-text значения props вырезаются;
- org_id/user_id/session_id/project_id отсутствуют в любом виде;
- golden-фикстура целиком: ни одной утечки ни одного текста элементов.

Запуск из корня репо: python -m pytest backend/tests/test_jev_privacy_gate.py -q
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.transformation import jev_state  # noqa: E402
from backend.app.transformation.pipeline import extract_facts  # noqa: E402
from backend.app.transformation.rules_loader import load_rules  # noqa: E402

RULES = [
    {"id": "R01_move", "to_be_action": "map_to_operation", "operation_code": "move"},
    {"id": "R02_wait", "to_be_action": "map_to_operation", "operation_code": "wait"},
]

XML = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:laneSet id="LS1">
      <bpmn:lane id="Lane_1" name="Работа оборудования">
        <bpmn:flowNodeRef>Task_x</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="E1" name="s"/>
    <bpmn:userTask id="Task_x" name="Промыть котел паром">
      <bpmn:documentation>заметка технолога — секретный рецепт борща</bpmn:documentation>
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="operation_code" value="transfer_contents"/>
          <camunda:property name="target_temp_c" value="75"/>
          <camunda:property name="secret_note" value="борщ с капустой"/>
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:userTask>
    <bpmn:textAnnotation id="Note_1">борщ нельзя отправлять наружу</bpmn:textAnnotation>
    <bpmn:association id="A1" sourceRef="Task_x" targetRef="Note_1"/>
    <bpmn:endEvent id="E2" name="e"/>
    <bpmn:sequenceFlow id="F1" sourceRef="E1" targetRef="Task_x"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_x" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>
"""

LEAK_TEXTS = [
    "Промыть котел паром",
    "промыть котел паром",
    "заметка технолога",
    "секретный рецепт борща",
    "борщ с капустой",
    "борщ нельзя отправлять наружу",
]


def _state_for_task_id(facts, task_id="Task_x"):
    fact = [f for f in facts["elements"] if f["id"] == task_id][0]
    return jev_state.build_jev_state(fact, RULES)


def test_no_content_leaks_into_state():
    facts = extract_facts(XML)
    payload = json.dumps(_state_for_task_id(facts), ensure_ascii=False).lower()
    for leak in LEAK_TEXTS:
        assert leak.lower() not in payload, f"утечка контента: {leak!r}"


def test_forbidden_keys_absent():
    facts = extract_facts(XML)
    state = _state_for_task_id(facts)
    blob = json.dumps(state, ensure_ascii=False)
    for key in ("org_id", "user_id", "session_id", "project_id", '"name"', '"documentation"'):
        assert key not in blob, f"запрещённый ключ в payload: {key}"


def test_name_hash_bucket_stable_and_sensitive_to_text():
    facts = extract_facts(XML)
    s1 = _state_for_task_id(facts)
    s2 = _state_for_task_id(extract_facts(XML))
    assert s1["element"]["name_hash_bucket"] == s2["element"]["name_hash_bucket"]
    assert s1["element"]["name_hash_bucket"].startswith("kw_")
    other = XML.replace("Промыть котел паром", "Другое название задачи")
    s3 = _state_for_task_id(extract_facts(other))
    assert s3["element"]["name_hash_bucket"] != s1["element"]["name_hash_bucket"]


def test_props_whitelist_classification():
    facts = extract_facts(XML)
    element = _state_for_task_id(facts)["element"]
    assert element["prop_enum"] == {"operation_code": "transfer_contents"}
    assert element["prop_numeric"] == {"target_temp_c": 75.0}
    # ключи props — структура (PRIVACY-таблица: ✅); free-text ЗНАЧЕНИЯ вырезаются
    assert "secret_note" in element["prop_keys"]
    assert "secret_note" not in element["prop_enum"]
    assert "secret_note" not in element["prop_numeric"]


def test_lane_kind_categorized_locally():
    facts = extract_facts(XML)
    element = _state_for_task_id(facts)["element"]
    assert element["lane_kind"] == "equipment"
    assert "Работа оборудования" not in json.dumps(element, ensure_ascii=False)


def test_candidates_filtered_by_candidate_ids():
    facts = extract_facts(XML)
    state = jev_state.build_jev_state([f for f in facts["elements"] if f["id"] == "Task_x"][0], RULES, candidate_ids=["R02_wait"])
    assert [c["rule_id"] for c in state["candidates"]] == ["R02_wait"]


def test_golden_fixture_zero_leaks():
    """Golden-фикстура целиком: ни одного текста name/documentation/annotation в payload."""
    fixture = os.path.join(os.path.dirname(__file__), "fixtures", "itmo_razogrev_v02.bpmn")
    with open(fixture, encoding="utf-8") as fh:
        facts = extract_facts(fh.read())
    rules = load_rules()
    texts = []
    for el in facts["elements"]:
        for field in ("name", "documentation"):
            value = (el.get(field) or "").strip()
            if len(value) >= 6:
                texts.append(value.lower())
    for ann in facts.get("annotations") or []:
        value = (ann.get("text") or "").strip()
        if len(value) >= 6:
            texts.append(value.lower())
    for el in facts["elements"]:
        state = jev_state.build_jev_state(el, rules)
        blob = json.dumps(state, ensure_ascii=False).lower()
        for text in texts:
            assert text not in blob, f"утечка текста элемента: {text!r}"
