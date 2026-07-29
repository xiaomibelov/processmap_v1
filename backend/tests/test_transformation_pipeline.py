"""E3.5 — unit-тесты конвейера трансформации AS IS -> TO BE."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.transformation.pipeline import (
    extract_facts,
    match_deterministic,
    match_with_llm,
    transform_asis,
    validate_draft_ui_model,
)
from backend.app.transformation.rules_loader import RulesLoadError, load_rules

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture(name: str) -> str:
    with open(os.path.join(FIXTURES_DIR, name), "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# rules library
# ---------------------------------------------------------------------------

def test_rules_library_loads_and_is_valid():
    rules = load_rules()
    assert len(rules) >= 15
    ids = [r["id"] for r in rules]
    assert len(ids) == len(set(ids))
    for rule in rules:
        assert rule["to_be_action"] in {
            "map_to_operation",
            "push_below",
            "drop",
            "extract_to_recipe",
            "extract_to_contract",
            "extract_to_event",
        }
        assert rule.get("rationale")
        assert rule.get("format_ref")


def test_rules_library_rejects_invalid(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("rules:\n  - id: R1\n    to_be_action: explode\n", encoding="utf-8")
    with pytest.raises(RulesLoadError):
        load_rules(str(bad))


# ---------------------------------------------------------------------------
# fact extraction
# ---------------------------------------------------------------------------

def test_extract_facts_captures_annotations_and_raw_props():
    facts = extract_facts(_load_fixture("itmo_razogrev_v02.bpmn"))
    assert len(facts["annotations"]) == 3
    by_id = {e["id"]: e for e in facts["elements"]}
    # legacy camunda props доступны фактам (parse_bpmn их отбрасывает)
    assert by_id["Activity_171znbt"]["camunda_props"]["operation_code"] == "transfer_contents"
    assert by_id["Activity_171znbt"]["camunda_props"]["validator_profile_id"] == "transfer_contents.default.v1"
    assert by_id["Activity_1k9t4a7"]["lane"] == "Работа оборудования"


# ---------------------------------------------------------------------------
# deterministic matcher
# ---------------------------------------------------------------------------

def test_deterministic_matcher_soup_cases():
    rules = load_rules()
    facts = extract_facts(_load_fixture("itmo_razogrev_v02.bpmn"))
    by_id = {e["id"]: e for e in facts["elements"]}
    expected = {
        "Activity_1k9t4a7": "R02_get_from_storage",
        "Activity_171znbt": "R10_transfer",
        "Activity_0eqhdco": "R01_move",
        "Activity_1grwh4i": "R18_move_to_packaging",
        "Activity_1vz1obl": "R03_open_bin_below",
        "Activity_1epghx4": "R03_open_bin_below",
        "Activity_0eh2m0x": "R07_seal_container",
        "Activity_0238wyw": "R08_configure_equipment",
        "Activity_07dw2ru": "R09_start_equipment",
        "Activity_1nmuo3d": "R11_grasp_below",
        "Activity_1i8s5wl": "R02_get_from_storage",
        "Activity_1spcm9y": "R06_open_container",
    }
    for element_id, rule_id in expected.items():
        rule = match_deterministic(by_id[element_id], rules)
        assert rule is not None, element_id
        assert rule["id"] == rule_id, f"{element_id}: {rule['id']} != {rule_id}"


# ---------------------------------------------------------------------------
# LLM matcher (mocked)
# ---------------------------------------------------------------------------

def _canned_llm(system_prompt: str, user_prompt: str) -> str:
    return json.dumps(
        {
            "matches": [
                {"element_id": "Task_ambig", "rule_id": "R19_wait", "confidence": 0.7},
                {"element_id": "Task_ambig", "rule_id": "R_NONEXISTENT", "confidence": 0.9},  # hallucination -> reject
                {"element_id": "Task_other", "rule_id": "R01_move", "confidence": 0.9},  # not requested -> reject
            ]
        }
    )


def test_llm_matcher_strict_schema_and_rejections():
    rules = load_rules()
    facts = [{"id": "Task_ambig", "bpmn_type": "task", "name": "Выдержать тару", "documentation": "", "camunda_props": {}}]
    matches, status = match_with_llm(facts, rules, llm_call=_canned_llm)
    assert status == "llm"
    assert matches == {"Task_ambig": "R19_wait"}


def test_llm_offline_falls_back_to_open_question():
    def failing_llm(system_prompt: str, user_prompt: str) -> str:
        raise RuntimeError("connection refused")

    rules = load_rules()
    facts = [{"id": "Task_ambig", "bpmn_type": "task", "name": "Выдержать тару 5 минут", "documentation": "", "camunda_props": {}}]
    matches, status = match_with_llm(facts, rules, llm_call=failing_llm)
    assert status == "offline"
    assert matches == {}


def test_pipeline_llm_offline_does_not_crash_and_marks_open_question():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:startEvent id="E1" name="s"/>
    <bpmn:userTask id="Task_mystery" name="Сделать что-то непонятное"/>
    <bpmn:endEvent id="E2" name="e"/>
    <bpmn:sequenceFlow id="F1" sourceRef="E1" targetRef="Task_mystery"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_mystery" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>
"""
    def failing_llm(system_prompt: str, user_prompt: str) -> str:
        raise RuntimeError("offline")

    res = transform_asis(xml, llm_call=failing_llm, llm_enabled=True)
    assert res["llm_status"] == "offline"
    task_nodes = [n for n in res["draft_ui_model"]["nodes"] if n["bpmn_type"] == "task"]
    assert task_nodes == []  # не угадываем
    trace = {t["element_id"]: t for t in res["trace_map"]}
    assert trace["Task_mystery"]["fate"] == "open_question"
    assert any(q["element_id"] == "Task_mystery" for q in res["open_questions"])
    # граф остаётся связным: E1 -> E2 через обходной поток
    flows = res["draft_ui_model"]["flows"]
    assert any(f["source_ref"] == "E1" and f["target_ref"] == "E2" for f in flows)
    assert res["validation_report"]["summary"]["errors"] == 0


def test_pipeline_llm_match_is_used_when_valid():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:startEvent id="E1" name="s"/>
    <bpmn:userTask id="Task_hold" name="Подержать в покое"/>
    <bpmn:endEvent id="E2" name="e"/>
    <bpmn:sequenceFlow id="F1" sourceRef="E1" targetRef="Task_hold"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Task_hold" targetRef="E2"/>
  </bpmn:process>
</bpmn:definitions>
"""
    llm = lambda s, u: json.dumps({"matches": [{"element_id": "Task_hold", "rule_id": "R19_wait", "confidence": 0.8}]})
    res = transform_asis(xml, llm_call=llm, llm_enabled=True)
    assert res["llm_status"] == "llm"
    trace = {t["element_id"]: t for t in res["trace_map"]}
    assert trace["Task_hold"]["fate"] == "transformed_to"
    assert trace["Task_hold"]["source"] == "llm"
    node = next(n for n in res["draft_ui_model"]["nodes"] if n["id"] == "Task_hold")
    assert node["operation_code"] == "wait"
    assert res["validation_report"]["summary"]["errors"] == 0


# ---------------------------------------------------------------------------
# validator
# ---------------------------------------------------------------------------

def test_validator_rejects_unknown_operation_code():
    ui_model = {
        "process_entities": {},
        "recipe_context": {},
        "nodes": [
            {"id": "T1", "bpmn_type": "task", "operation_code": "teleport", "params": {}, "outputs": {}},
        ],
        "flows": [],
    }
    report, _ = validate_draft_ui_model(ui_model)
    assert report["summary"]["errors"] == 1
    assert report["findings"][0]["code"] == "UNKNOWN_OPERATION_CODE"


def test_validator_gateway_condition_from_declared_outputs():
    ui_model = {
        "process_entities": {},
        "recipe_context": {},
        "nodes": [
            {"id": "T1", "bpmn_type": "task", "operation_code": "measure_temperature", "params": {}, "outputs": {"temperature_ok": "temperature_ok"}},
        ],
        "flows": [
            {"id": "F1", "source_ref": "T1", "target_ref": "T1", "condition": "${temperature_ok == true}"},
            {"id": "F2", "source_ref": "T1", "target_ref": "T1", "condition": "${unknown_flag == true}"},
        ],
    }
    report, _ = validate_draft_ui_model(ui_model)
    errors = [f for f in report["findings"] if f["severity"] == "error"]
    assert len(errors) == 1
    assert errors[0]["code"] == "GATEWAY_CONDITION_UNKNOWN_OUTPUT"
    assert errors[0]["element_id"] == "F2"


def test_validator_undeclared_ref_creates_draft_entity_warning():
    ui_model = {
        "process_entities": {},
        "recipe_context": {},
        "nodes": [
            {"id": "T1", "bpmn_type": "task", "operation_code": "move", "params": {"object_ref": "container_9"}, "outputs": {}},
        ],
        "flows": [],
    }
    report, drafts = validate_draft_ui_model(ui_model)
    assert report["summary"]["errors"] == 0
    assert report["summary"]["warnings"] == 1
    assert drafts[0]["ref"] == "container_9"


# ---------------------------------------------------------------------------
# full pipeline on soup AS IS (LLM disabled)
# ---------------------------------------------------------------------------

def test_pipeline_soup_draft_valid_and_traced():
    res = transform_asis(_load_fixture("itmo_razogrev_v02.bpmn"), llm_enabled=False)
    assert res["validation_report"]["summary"]["errors"] == 0
    trace = {t["element_id"]: t for t in res["trace_map"]}
    # ключевые судьбы
    assert trace["Activity_1nmuo3d"]["fate"] == "pushed_below"  # захват — декомпозиция move
    assert trace["Activity_1vz1obl"]["fate"] == "pushed_below"  # открытие урны — execution_contract
    assert trace["Activity_0eh2m0x"]["fate"] == "transformed_to"  # запайка -> close_container
    assert trace["Activity_03kv40i"]["fate"] == "open_question"  # безымянные задачи не угадываем
    # каждый draft-узел имеет derived_from
    for node in res["draft_ui_model"]["nodes"]:
        assert node.get("derived_from")
    # recipe_context извлечён без ${}-подстановок
    recipe_ctx = res["draft_ui_model"]["recipe_context"]
    assert "heating_power" in recipe_ctx and "heat_time_sec" in recipe_ctx
    # publish_event после перемещения в зону упаковки
    pub = [n for n in res["draft_ui_model"]["nodes"] if n.get("operation_code") == "publish_event"]
    assert len(pub) == 1
    assert pub[0]["params"]["event_code"] == "ready_for_packaging"
    # анализатор поднял вопрос о рецептурной проверке температуры
    assert any("температур" in q["question"] for q in res["open_questions"])
    # ни один draft-поток не висит в воздухе
    node_ids = {n["id"] for n in res["draft_ui_model"]["nodes"]}
    for flow in res["draft_ui_model"]["flows"]:
        assert flow["source_ref"] in node_ids and flow["target_ref"] in node_ids
