"""E7.5 — round-trip: ui_model → bpmn_export.generate_bpmn → parse_bpmn.

Приёмочный файл v0.3 (tobe_razogrev_supa_rtk_v03.bpmn) → ui_model →
сгенерированный XML → parse_bpmn назад:
  - counts nodes/flows совпадают;
  - spot-check ≥5 блоков (measure_temperature с outputs, set_equipment с
    recipe_params, transfer, move, publish_event): operation_code / params /
    outputs / recipe_params совпадают;
  - Camunda-совместимость: XML well-formed, DI (BPMNShape/BPMNEdge) обязателен.

Побочный артефакт: docs/e7/roundtrip_report.json (spot-check таблица).
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.process_template.bpmn_export import (  # noqa: E402
    BPMNDI_NS,
    generate_bpmn,
)
from backend.app.process_template.bpmn_import import parse_bpmn  # noqa: E402

FIXTURE = os.path.join(
    os.path.dirname(__file__), "fixtures", "tobe_razogrev_supa_rtk_v03.bpmn"
)
REPORT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "docs", "e7", "roundtrip_report.json"
)

SPOT_CHECK_OPS = [
    "measure_temperature",
    "set_equipment",
    "transfer",
    "move",
    "publish_event",
]


@pytest.fixture(scope="module")
def roundtrip():
    xml_text = open(FIXTURE, encoding="utf-8").read()
    source = parse_bpmn(xml_text)
    generated = generate_bpmn(
        source.ui_model,
        template_name="TO BE Супы (РТК)",
        template_id="roundtrip",
    )
    reparsed = parse_bpmn(generated)
    return {
        "source": source,
        "generated": generated,
        "reparsed": reparsed,
    }


def test_counts_match(roundtrip):
    src = roundtrip["source"].ui_model
    back = roundtrip["reparsed"].ui_model
    assert len(back["nodes"]) == len(src["nodes"]) > 0
    assert len(back["flows"]) == len(src["flows"]) > 0
    assert len(back["lanes"]) == len(src["lanes"])
    # re-parse не должен давать error-findings
    assert roundtrip["reparsed"].report["summary"]["errors"] == 0


def test_spot_check_blocks(roundtrip):
    src_nodes = {n["id"]: n for n in roundtrip["source"].ui_model["nodes"]}
    back_nodes = {n["id"]: n for n in roundtrip["reparsed"].ui_model["nodes"]}
    rows = []
    checked = 0
    for op_code in SPOT_CHECK_OPS:
        # берём все блоки с этим operation_code (move встречается 6 раз)
        matched = [n for n in src_nodes.values() if n.get("operation_code") == op_code]
        assert matched, f"в приёмочной модели нет блока {op_code}"
        for src in matched:
            back = back_nodes.get(src["id"])
            assert back is not None, f"блок {src['id']} потерян при round-trip"
            row = {
                "operation_code": op_code,
                "node_id": src["id"],
                "operation_code_match": back.get("operation_code") == src.get("operation_code"),
                "params_match": (back.get("params") or {}) == (src.get("params") or {}),
                "outputs_match": (back.get("outputs") or {}) == (src.get("outputs") or {}),
                "recipe_params_match": (back.get("recipe_params") or [])
                == (src.get("recipe_params") or []),
            }
            rows.append(row)
            assert all(v for k, v in row.items() if k.endswith("_match")), row
            checked += 1
    assert checked >= 5

    # артефакт docs/e7/roundtrip_report.json
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    report = {
        "fixture": os.path.basename(FIXTURE),
        "summary": {
            "nodes": len(src_nodes),
            "flows": len(roundtrip["source"].ui_model["flows"]),
            "spot_checks": len(rows),
            "all_match": all(
                v for row in rows for k, v in row.items() if k.endswith("_match")
            ),
        },
        "spot_check": rows,
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)


def test_spot_check_semantics(roundtrip):
    """Конкретные ожидания по ключевым блокам (outputs / recipe_params)."""
    back_nodes = {n["id"]: n for n in roundtrip["reparsed"].ui_model["nodes"]}
    by_op = {}
    for node in roundtrip["source"].ui_model["nodes"]:
        by_op.setdefault(node.get("operation_code"), []).append(node)

    measure = back_nodes[by_op["measure_temperature"][0]["id"]]
    assert measure["outputs"], "measure_temperature: outputs потеряны"
    assert "target_temp_c" in measure["recipe_params"]

    set_eq = back_nodes[by_op["set_equipment"][0]["id"]]
    assert set_eq["recipe_params"], "set_equipment: recipe_params потеряны"

    transfer = back_nodes[by_op["transfer"][0]["id"]]
    assert transfer["params"], "transfer: params потеряны"

    publish = back_nodes[by_op["publish_event"][0]["id"]]
    assert publish["operation_code"] == "publish_event"


def test_gateway_conditions_preserved(roundtrip):
    src_flows = {
        f["id"]: f for f in roundtrip["source"].ui_model["flows"] if f.get("condition")
    }
    assert src_flows, "в приёмочной модели нет условных потоков"
    back_flows = {f["id"]: f for f in roundtrip["reparsed"].ui_model["flows"]}
    for flow_id, src in src_flows.items():
        assert back_flows[flow_id]["condition"] == src["condition"], flow_id
        assert src["condition"].startswith("${"), flow_id


def test_xml_wellformed_and_di(roundtrip):
    generated = roundtrip["generated"]
    root = ET.fromstring(generated)  # raises если не well-formed
    shapes = list(root.iter(f"{{{BPMNDI_NS}}}BPMNShape"))
    edges = list(root.iter(f"{{{BPMNDI_NS}}}BPMNEdge"))
    node_count = len(roundtrip["source"].ui_model["nodes"])
    flow_count = len(roundtrip["source"].ui_model["flows"])
    # DI: participant + lanes + nodes + textAnnotations >= nodes + 1
    assert len(shapes) >= node_count + 1
    assert len(edges) == flow_count
    assert "camunda:property" in generated
    assert "conditionExpression" in generated
    assert "bpmndi:BPMNDiagram" in generated
