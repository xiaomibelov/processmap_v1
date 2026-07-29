"""E6.1 — тесты validation service (правила R1–R7).

Негативные кейсы по каждому правилу: каждый finding содержит code + element_id.
Позитив: acceptance soup fixture (tobe_razogrev_supa_rtk_v03.bpmn) → 0 ошибок.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.process_template.bpmn_import import parse_bpmn
from backend.app.validation.service import validate_ui_model

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

# Мини-каталог для R2/R4 (структура = operation_catalog.parameter_schema).
MINI_CATALOG = {
    "move": {
        "code": "move",
        "parameter_schema": {
            "object_ref": {"type": "string", "required": True},
            "target_ref": {"type": "string", "required": True},
        },
        "allowed_outputs": [],
        "resource_requirements": {},
    },
    "transfer": {
        "code": "transfer",
        "parameter_schema": {
            "source_container_ref": {"type": "string", "required": True},
            "target_container_ref": {"type": "string", "required": True},
        },
        "allowed_outputs": [],
        "resource_requirements": {},
    },
    "set_equipment": {
        "code": "set_equipment",
        "parameter_schema": {
            "equipment_ref": {"type": "string", "required": True},
            "duration_sec": {"type": "number", "required": False},
        },
        "allowed_outputs": [],
        "resource_requirements": {},
    },
}


def _task(node_id="T1", op="move", params=None, outputs=None, bpmn_type="task"):
    return {
        "id": node_id,
        "bpmn_type": bpmn_type,
        "name": node_id,
        "operation_code": op,
        "params": params or {},
        "outputs": outputs or {},
    }


def _model(nodes, flows=None, entities=None, recipe_context=None):
    return {
        "process_template_id": "p1",
        "recipe_context": recipe_context or {},
        "process_entities": entities or {},
        "nodes": nodes,
        "flows": flows or [],
    }


def _by_code(result, code):
    return [f for f in result["findings"] if f["code"] == code]


# ---------------------------------------------------------------------------
# R1: operation_code из каталога
# ---------------------------------------------------------------------------

def test_r1_missing_operation_code():
    result = validate_ui_model(_model([_task(op=None)]), check_reachability=False)
    findings = _by_code(result, "UNKNOWN_OPERATION_CODE")
    assert findings and findings[0]["element_id"] == "T1"
    assert findings[0]["severity"] == "error"
    assert result["summary"]["errors"] == 1


def test_r1_unknown_operation_code():
    result = validate_ui_model(_model([_task(op="cook_soup")]), check_reachability=False)
    findings = _by_code(result, "UNKNOWN_OPERATION_CODE")
    assert findings and "cook_soup" in findings[0]["message"]
    assert findings[0]["element_id"] == "T1"


def test_r1_forbidden_operation():
    result = validate_ui_model(_model([_task(op="package_meal")]), check_reachability=False)
    findings = _by_code(result, "FORBIDDEN_OPERATION")
    assert findings and findings[0]["severity"] == "error"
    assert findings[0]["element_id"] == "T1"


def test_r1_catalog_drives_allowed_codes():
    # с каталогом БД код из статического списка, но вне каталога -> ошибка
    result = validate_ui_model(
        _model([_task(op="hold")]), catalog=MINI_CATALOG, check_reachability=False
    )
    assert _by_code(result, "UNKNOWN_OPERATION_CODE")


# ---------------------------------------------------------------------------
# R2: params по parameter_schema (required + типы)
# ---------------------------------------------------------------------------

def test_r2_missing_required_param():
    model = _model([_task(op="move", params={"object_ref": "c1"})])
    result = validate_ui_model(model, catalog=MINI_CATALOG, check_reachability=False)
    findings = _by_code(result, "MISSING_REQUIRED_PARAM")
    assert findings and "target_ref" in findings[0]["message"]
    assert findings[0]["element_id"] == "T1"
    assert findings[0]["severity"] == "error"


def test_r2_param_type_mismatch():
    model = _model([_task(op="set_equipment", params={"equipment_ref": "eq1", "duration_sec": "abc"})])
    result = validate_ui_model(model, catalog=MINI_CATALOG, check_reachability=False)
    findings = _by_code(result, "PARAM_TYPE_MISMATCH")
    assert findings and "duration_sec" in findings[0]["message"]
    assert findings[0]["element_id"] == "T1"


def test_r2_numeric_string_accepted():
    # camunda-значения — строки; числовая строка для number не ошибка
    model = _model([_task(op="set_equipment", params={"equipment_ref": "eq1", "duration_sec": "90"})])
    result = validate_ui_model(model, catalog=MINI_CATALOG, check_reachability=False)
    assert not _by_code(result, "PARAM_TYPE_MISMATCH")
    assert result["summary"]["errors"] == 0


def test_r2_without_catalog_no_schema_checks():
    # catalog=None: статический список кодов, проверок схем нет (поведение импорта)
    model = _model([_task(op="move", params={})])
    result = validate_ui_model(model, check_reachability=False)
    assert not _by_code(result, "MISSING_REQUIRED_PARAM")


# ---------------------------------------------------------------------------
# R3: все *_ref объявлены в process_entities / recipe_context
# ---------------------------------------------------------------------------

def test_r3_undeclared_ref_warning_and_draft_entity():
    model = _model([_task(op="move", params={"object_ref": "ghost_1", "target_ref": "zone_9"})])
    result = validate_ui_model(model, check_reachability=False)
    findings = _by_code(result, "UNDECLARED_ENTITY_REF")
    assert findings and all(f["severity"] == "warning" for f in findings)
    assert {f["element_id"] for f in findings} == {"T1"}
    drafts = {d["ref"] for d in result["draft_entities"]}
    assert drafts == {"ghost_1", "zone_9"}
    assert result["summary"]["errors"] == 0


def test_r3_declared_ref_ok():
    entities = {"containers": {"c1": {}}, "zones": {"z1": {}}, "equipment": {}}
    model = _model(
        [_task(op="move", params={"object_ref": "c1", "target_ref": "z1"})],
        entities=entities,
    )
    result = validate_ui_model(model, catalog=MINI_CATALOG, check_reachability=False)
    assert not _by_code(result, "UNDECLARED_ENTITY_REF")
    assert result["summary"]["errors"] == 0


def test_r3_recipe_context_counts_as_declared():
    model = _model(
        [_task(op="move", params={"object_ref": "c1", "target_ref": "z1"})],
        recipe_context={"c1": "", "z1": ""},
    )
    result = validate_ui_model(model, catalog=MINI_CATALOG, check_reachability=False)
    assert not _by_code(result, "UNDECLARED_ENTITY_REF")


# ---------------------------------------------------------------------------
# R4: move object_ref+target_ref; transfer source/target_container_ref
# ---------------------------------------------------------------------------

def test_r4_move_requires_object_and_target():
    model = _model([_task(op="move", params={})])
    result = validate_ui_model(model, catalog=MINI_CATALOG, check_reachability=False)
    findings = _by_code(result, "MISSING_REQUIRED_PARAM")
    messages = " ".join(f["message"] for f in findings)
    assert "object_ref" in messages and "target_ref" in messages
    assert all(f["element_id"] == "T1" for f in findings)


def test_r4_transfer_requires_source_and_target_container():
    model = _model([_task(op="transfer", params={"source_container_ref": "c1"})])
    result = validate_ui_model(model, catalog=MINI_CATALOG, check_reachability=False)
    findings = _by_code(result, "MISSING_REQUIRED_PARAM")
    assert findings and "target_container_ref" in findings[0]["message"]
    assert findings[0]["severity"] == "error"


def test_r4_static_guard_when_catalog_entry_has_no_schema():
    # запись каталога без parameter_schema -> статический страж R4
    catalog = {"move": {"code": "move", "parameter_schema": {}, "allowed_outputs": [], "resource_requirements": {}}}
    model = _model([_task(op="move", params={"object_ref": "c1"})])
    result = validate_ui_model(model, catalog=catalog, check_reachability=False)
    findings = _by_code(result, "MISSING_REQUIRED_PARAM")
    assert findings and "target_ref" in findings[0]["message"]


# ---------------------------------------------------------------------------
# R5: условия шлюзов — только из объявленных outputs
# ---------------------------------------------------------------------------

def test_r5_gateway_condition_unknown_output():
    nodes = [_task(op="check", outputs={"check_passed": "check_passed"})]
    flows = [
        {"id": "F1", "source_ref": "T1", "target_ref": "T1", "name": "", "condition": "${check_passed == true}"},
        {"id": "F2", "source_ref": "T1", "target_ref": "T1", "name": "", "condition": "${has_sauce == true}"},
    ]
    result = validate_ui_model(_model(nodes, flows), check_reachability=False)
    findings = _by_code(result, "GATEWAY_CONDITION_UNKNOWN_OUTPUT")
    assert len(findings) == 1
    assert findings[0]["element_id"] == "F2"
    assert findings[0]["severity"] == "error"
    assert "has_sauce" in findings[0]["message"]


# ---------------------------------------------------------------------------
# R6: достижимость из старта; конец пути — endEvent или link-throw
# ---------------------------------------------------------------------------

def _linear_model(extra_nodes=None, extra_flows=None):
    nodes = [
        {"id": "E1", "bpmn_type": "startEvent", "name": "s"},
        _task(op="wait"),
        {"id": "E2", "bpmn_type": "endEvent", "name": "e"},
    ] + (extra_nodes or [])
    flows = [
        {"id": "F1", "source_ref": "E1", "target_ref": "T1", "name": "", "condition": ""},
        {"id": "F2", "source_ref": "T1", "target_ref": "E2", "name": "", "condition": ""},
    ] + (extra_flows or [])
    return _model(nodes, flows)


def test_r6_unreachable_node():
    orphan = _task(node_id="T_orphan", op="wait")
    result = validate_ui_model(_linear_model(extra_nodes=[orphan]))
    findings = _by_code(result, "UNREACHABLE_NODE")
    assert findings and findings[0]["element_id"] == "T_orphan"
    assert findings[0]["severity"] == "error"


def test_r6_dead_end_task():
    # T2 достижим, но не ведёт в endEvent -> DEAD_END
    nodes = [
        {"id": "E1", "bpmn_type": "startEvent", "name": "s"},
        _task(op="wait"),
        _task(node_id="T2", op="wait"),
    ]
    flows = [{"id": "F1", "source_ref": "E1", "target_ref": "T1", "name": "", "condition": ""}]
    result = validate_ui_model(_model(nodes, flows))
    codes = {f["code"] for f in result["findings"]}
    assert "DEAD_END" in codes
    dead = _by_code(result, "DEAD_END")
    # T2 недостижим (UNREACHABLE_NODE); DEAD_END ставится только достижимым узлам
    assert {f["element_id"] for f in dead} == {"T1"}
    assert "UNREACHABLE_NODE" in codes  # T2 недостижим


def test_r6_link_throw_is_valid_terminator_and_link_catch_is_root():
    # acceptance-паттерн: link-throw рестарт завершает путь, link-catch — корень
    result = validate_ui_model(_load_soup_ui_model())
    assert not _by_code(result, "UNREACHABLE_NODE")
    assert not _by_code(result, "DEAD_END")


def test_r6_throw_without_link_definition_is_dead_end():
    throw = {
        "id": "Ev_throw",
        "bpmn_type": "intermediateThrowEvent",
        "name": "t",
        "event_definitions": ["messageEventDefinition"],
    }
    nodes = [
        {"id": "E1", "bpmn_type": "startEvent", "name": "s"},
        throw,
    ]
    flows = [{"id": "F1", "source_ref": "E1", "target_ref": "Ev_throw", "name": "", "condition": ""}]
    result = validate_ui_model(_model(nodes, flows))
    findings = _by_code(result, "DEAD_END")
    assert findings and findings[0]["element_id"] == "Ev_throw"


def test_r6_disabled():
    orphan = _task(node_id="T_orphan", op="wait")
    result = validate_ui_model(_linear_model(extra_nodes=[orphan]), check_reachability=False)
    assert not _by_code(result, "UNREACHABLE_NODE")


# ---------------------------------------------------------------------------
# R7: значения-заглушки ("-" / null) в params
# ---------------------------------------------------------------------------

def test_r7_dash_placeholder():
    model = _model([_task(op="move", params={"object_ref": "c1", "target_ref": "-"})])
    result = validate_ui_model(model, check_reachability=False)
    findings = _by_code(result, "PLACEHOLDER_VALUE")
    assert findings and "target_ref" in findings[0]["message"]
    assert findings[0]["element_id"] == "T1"
    assert findings[0]["severity"] == "error"


def test_r7_null_placeholder():
    model = _model([_task(op="move", params={"object_ref": None})])
    result = validate_ui_model(model, check_reachability=False)
    findings = _by_code(result, "PLACEHOLDER_VALUE")
    assert findings and findings[0]["element_id"] == "T1"


# ---------------------------------------------------------------------------
# Позитив: acceptance soup fixture -> 0 ошибок (со статическим каталогом)
# ---------------------------------------------------------------------------

def _load_soup_ui_model():
    xml = open(os.path.join(FIXTURES_DIR, "tobe_razogrev_supa_rtk_v03.bpmn"), encoding="utf-8").read()
    return parse_bpmn(xml).ui_model


def test_positive_acceptance_soup_zero_errors():
    result = validate_ui_model(_load_soup_ui_model())
    assert result["summary"]["errors"] == 0, result["findings"]
    assert result["summary"]["nodes"] == 35
    assert result["summary"]["flows"] == 36


def test_every_finding_has_code_and_element_id():
    model = _model(
        [_task(op="teleport", params={"target_ref": "-"}), _task(node_id="T2", op=None)],
        [{"id": "F1", "source_ref": "T1", "target_ref": "T2", "name": "", "condition": "${x == 1}"}],
    )
    result = validate_ui_model(model)
    assert result["findings"]
    for finding in result["findings"]:
        assert finding["code"]
        assert finding["element_id"]
        assert finding["severity"] in ("error", "warning")
        assert finding["message"]  # RU-текст (E6.2: поле message на русском)
