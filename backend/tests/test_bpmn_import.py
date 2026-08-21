import os
import sys
from collections import Counter
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Add the backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.app.main import app
from backend.app.process_template.bpmn_import import ALLOWED_OPERATION_CODES, parse_bpmn

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture(name: str) -> str:
    with open(os.path.join(FIXTURES_DIR, name), "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# (a) v0.3 pm:metadata file imports cleanly
# ---------------------------------------------------------------------------

def test_v0_3_file_imports_without_errors():
    result = parse_bpmn(_load_fixture("soup_chicken_v0_3.bpmn"))

    assert result.report["summary"]["errors"] == 0, result.report["findings"]
    assert result.report["summary"]["nodes"] == 12
    assert result.report["summary"]["flows"] == 11
    assert len(result.ui_model["nodes"]) == 12
    assert len(result.ui_model["flows"]) == 11

    task_nodes = [n for n in result.ui_model["nodes"] if n["bpmn_type"] == "task"]
    assert len(task_nodes) == 10
    for node in task_nodes:
        assert node["operation_code"] in ALLOWED_OPERATION_CODES


def test_v0_3_ui_model_structure():
    result = parse_bpmn(_load_fixture("soup_chicken_v0_3.bpmn"))
    ui_model = result.ui_model

    assert ui_model["process_template_id"] == "chicken_soup_v0_3"
    assert ui_model["recipe_context"]["dish_name"] == "Куриный суп"
    assert set(ui_model["process_entities"].keys()) == {"containers", "equipment", "zones"}
    assert ui_model["participant"] is not None
    assert ui_model["participant"]["process_ref"] == "Process_3c2b1417"

    # coordinates come from BPMNDI bounds
    first_task = next(n for n in ui_model["nodes"] if n["id"] == "Activity_0afc5c8a")
    assert first_task["x"] == 320
    assert first_task["y"] == 215
    assert first_task["width"] == 180
    assert first_task["height"] == 70

    flow = next(f for f in ui_model["flows"] if f["id"] == "Flow_202eca2e")
    assert flow["source_ref"] == "StartEvent_8dbd71c4"
    assert flow["target_ref"] == "Activity_0afc5c8a"


# ---------------------------------------------------------------------------
# (a2) REAL acceptance file: v0.3 encoded via camunda:properties
# ---------------------------------------------------------------------------

def test_acceptance_file_imports_with_zero_errors():
    result = parse_bpmn(_load_fixture("tobe_razogrev_supa_rtk_v03.bpmn"))

    assert result.report["summary"]["errors"] == 0, result.report["findings"]
    assert result.report["summary"]["nodes"] == 35
    assert result.report["summary"]["flows"] == 36


def test_acceptance_file_operation_codes():
    result = parse_bpmn(_load_fixture("tobe_razogrev_supa_rtk_v03.bpmn"))
    task_nodes = [n for n in result.ui_model["nodes"] if n["bpmn_type"] == "task"]
    assert len(task_nodes) == 24

    counts = Counter(n["operation_code"] for n in task_nodes)
    assert counts == {
        "move": 8,
        "get_from_storage": 2,
        "open_equipment": 2,
        "close_equipment": 3,
        "set_equipment": 1,
        "start_equipment": 2,
        "measure_temperature": 1,
        "check": 1,
        "open_container": 1,
        "close_container": 1,
        "transfer": 1,
        "publish_event": 1,
    }
    for node in task_nodes:
        assert node["operation_code"] in ALLOWED_OPERATION_CODES


def test_acceptance_file_camunda_encoding_details():
    result = parse_bpmn(_load_fixture("tobe_razogrev_supa_rtk_v03.bpmn"))
    nodes = {n["id"]: n for n in result.ui_model["nodes"]}

    # params.* decoded into params dict
    assert nodes["Act_get1"]["params"] == {"item_ref": "container_1", "target_ref": "storage_1"}
    # recipe_params "a; b" decoded into a list
    assert nodes["Act_set_mw"]["recipe_params"] == ["heating_power", "heat_time_sec"]
    assert nodes["Act_measure"]["recipe_params"] == ["target_temp_c"]
    # outputs.* decoded into outputs dict
    assert nodes["Act_measure"]["outputs"] == {
        "measured_temp_c": "measured_temp_c",
        "temperature_ok": "temperature_ok",
    }
    # display_name falls back to the BPMN name
    assert nodes["Act_get1"]["display_name"] == "Получить контейнер-1 из хранения"


def test_acceptance_file_lanes_and_drafts():
    result = parse_bpmn(_load_fixture("tobe_razogrev_supa_rtk_v03.bpmn"))

    lanes = {l["id"]: l for l in result.ui_model["lanes"]}
    assert set(lanes.keys()) == {"Lane_equip", "Lane_wf", "Lane_robot"}
    assert lanes["Lane_equip"]["name"] == "Оборудование и станции"
    assert "Act_get1" in lanes["Lane_equip"]["flow_node_refs"]
    assert "Event_start" in lanes["Lane_wf"]["flow_node_refs"]

    drafts = {d["ref"] for d in result.draft_entities}
    assert {"container_1", "container_2", "heating_equipment_1", "storage_1"} <= drafts
    assert len(result.draft_entities) == 10

    # no pm:metadata on process level -> warning, not error
    proc_findings = [f for f in result.report["findings"] if f["code"] == "MISSING_PROCESS_METADATA"]
    assert proc_findings and all(f["severity"] == "warning" for f in proc_findings)

    # undeclared refs are warnings (draft_entities covers auto-creation)
    undeclared = [f for f in result.report["findings"] if f["code"] == "UNDECLARED_ENTITY_REF"]
    assert undeclared and all(f["severity"] == "warning" for f in undeclared)


# ---------------------------------------------------------------------------
# (b) v0.2-style file produces the expected mismatch findings
# ---------------------------------------------------------------------------

def test_v0_2_fixture_findings_cover_all_mismatch_kinds():
    result = parse_bpmn(_load_fixture("razogrev_v02_style.bpmn"))
    findings = result.report["findings"]
    codes = {f["code"] for f in findings}

    # legacy task types (userTask + serviceTask)
    legacy_task = [f for f in findings if f["code"] == "LEGACY_TASK_TYPE"]
    assert {f["element_id"] for f in legacy_task} == {"Activity_heat", "Activity_notify"}
    assert all(f["severity"] == "error" for f in legacy_task)

    # camunda properties (actor_role + validator_profile_id) are legacy keys
    camunda = [f for f in findings if f["code"] == "LEGACY_CAMUNDA_PROPERTY"]
    assert len(camunda) == 2
    assert all(f["element_id"] == "Activity_heat" for f in camunda)
    assert all(f["severity"] == "error" for f in camunda)
    assert any("actor_role" in f["message"] for f in camunda)
    assert any("validator_profile_id" in f["message"] for f in camunda)

    # validator_profile_id also flagged as legacy field on process metadata
    legacy_field = [f for f in findings if f["code"] == "LEGACY_FIELD"]
    assert any("validator_profile_id" in f["message"] for f in legacy_field)
    assert any(f["element_id"] == "Process_razogrev" for f in legacy_field)

    # ${...} substitution in a PARAM VALUE stays an error
    dollar = [f for f in findings if f["code"] == "DOLLAR_SUBSTITUTION"]
    assert len(dollar) == 1
    assert dollar[0]["element_id"] == "Activity_heat"
    assert dollar[0]["severity"] == "error"

    # ${has_sauce} gateway condition: identifier not declared in any task outputs
    gw = [f for f in findings if f["code"] == "GATEWAY_CONDITION_UNKNOWN_OUTPUT"]
    assert len(gw) == 1
    assert gw[0]["element_id"] == "Flow_s4"
    assert gw[0]["severity"] == "error"
    assert "has_sauce" in gw[0]["message"]

    # undeclared entity refs are warnings now (draft_entities covers them)
    undeclared = [f for f in findings if f["code"] == "UNDECLARED_ENTITY_REF"]
    assert any("microwave_01" in f["message"] for f in undeclared)
    assert any("sauce_container" in f["message"] for f in undeclared)
    assert all(f["severity"] == "warning" for f in undeclared)

    # unknown operation code
    unknown_op = [f for f in findings if f["code"] == "UNKNOWN_OPERATION_CODE"]
    assert any("cook_soup" in f["message"] for f in unknown_op)
    assert any(f["element_id"] == "Activity_notify" for f in unknown_op)

    # every finding carries element_id so the UI can navigate
    assert findings
    for finding in findings:
        assert finding["element_id"]
        assert finding["severity"] in ("error", "warning")

    assert codes >= {
        "LEGACY_TASK_TYPE",
        "LEGACY_CAMUNDA_PROPERTY",
        "LEGACY_FIELD",
        "DOLLAR_SUBSTITUTION",
        "UNDECLARED_ENTITY_REF",
        "UNKNOWN_OPERATION_CODE",
        "GATEWAY_CONDITION_UNKNOWN_OUTPUT",
    }
    # the fixture must still produce errors
    assert result.report["summary"]["errors"] > 0


def test_v0_2_draft_entities_built_from_undeclared_refs():
    result = parse_bpmn(_load_fixture("razogrev_v02_style.bpmn"))
    drafts = {d["ref"]: d for d in result.draft_entities}

    assert drafts["microwave_01"]["guessed_category"] == "equipment"
    assert drafts["microwave_01"]["used_by"] == ["Activity_heat"]
    assert drafts["sauce_container"]["guessed_category"] == "containers"
    assert drafts["sauce_container"]["used_by"] == ["Activity_add_sauce"]


def test_v0_2_parse_is_lossless_despite_errors():
    result = parse_bpmn(_load_fixture("razogrev_v02_style.bpmn"))
    # startEvent, userTask, serviceTask, gateway, task, endEvent
    assert result.report["summary"]["nodes"] == 6
    assert result.report["summary"]["flows"] == 6
    assert result.report["summary"]["errors"] == len(
        [f for f in result.report["findings"] if f["severity"] == "error"]
    )
    assert result.report["summary"]["warnings"] == len(
        [f for f in result.report["findings"] if f["severity"] == "warning"]
    )


def test_unparseable_xml_raises():
    with pytest.raises(ValueError):
        parse_bpmn("<bpmn:definitions><broken")


# ---------------------------------------------------------------------------
# (c) endpoint tests
# ---------------------------------------------------------------------------

def _auth_patches():
    user = {"id": "user-1", "email": "t@example.com", "is_admin": False, "is_active": True}
    return [
        patch("backend.app.startup.middleware.user_from_bearer_header", return_value=user),
        patch("backend.app.startup.middleware.list_user_org_memberships", return_value=[]),
        patch("backend.app.startup.middleware.resolve_active_org_id", return_value=""),
    ]


def test_import_bpmn_endpoint_unauthenticated_returns_401():
    client = TestClient(app)
    response = client.post(
        "/api/process-templates/import-bpmn",
        files={"file": ("soup.bpmn", _load_fixture("soup_chicken_v0_3.bpmn"), "text/xml")},
    )
    assert response.status_code == 401


def test_import_bpmn_endpoint_multipart_returns_200():
    client = TestClient(app)
    patches = _auth_patches()
    for p in patches:
        p.start()
    try:
        response = client.post(
            "/api/process-templates/import-bpmn",
            files={"file": ("soup.bpmn", _load_fixture("soup_chicken_v0_3.bpmn"), "text/xml")},
            headers={"Authorization": "Bearer fake-token"},
        )
    finally:
        for p in patches:
            p.stop()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["report"]["summary"]["errors"] == 0
    assert body["report"]["summary"]["nodes"] == 12
    assert body["ui_model"]["process_template_id"] == "chicken_soup_v0_3"
    assert "draft_entities" in body


def test_import_bpmn_endpoint_accepts_acceptance_file():
    client = TestClient(app)
    patches = _auth_patches()
    for p in patches:
        p.start()
    try:
        response = client.post(
            "/api/process-templates/import-bpmn",
            files={"file": ("tobe.bpmn", _load_fixture("tobe_razogrev_supa_rtk_v03.bpmn"), "text/xml")},
            headers={"Authorization": "Bearer fake-token"},
        )
    finally:
        for p in patches:
            p.stop()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["report"]["summary"]["errors"] == 0
    assert body["report"]["summary"]["nodes"] == 35
    assert body["report"]["summary"]["flows"] == 36
    assert len(body["ui_model"]["lanes"]) == 3
    assert body["draft_entities"]


def test_import_bpmn_endpoint_raw_xml_body_returns_200():
    client = TestClient(app)
    patches = _auth_patches()
    for p in patches:
        p.start()
    try:
        response = client.post(
            "/api/process-templates/import-bpmn",
            content=_load_fixture("razogrev_v02_style.bpmn").encode("utf-8"),
            headers={"Authorization": "Bearer fake-token", "Content-Type": "text/xml"},
        )
    finally:
        for p in patches:
            p.stop()

    assert response.status_code == 200, response.text
    body = response.json()
    codes = {f["code"] for f in body["report"]["findings"]}
    assert "LEGACY_TASK_TYPE" in codes
    assert len(body["draft_entities"]) == 2


def test_import_bpmn_endpoint_unparseable_xml_returns_422():
    client = TestClient(app)
    patches = _auth_patches()
    for p in patches:
        p.start()
    try:
        response = client.post(
            "/api/process-templates/import-bpmn",
            content=b"<bpmn:definitions><broken",
            headers={"Authorization": "Bearer fake-token", "Content-Type": "text/xml"},
        )
    finally:
        for p in patches:
            p.stop()

    assert response.status_code == 422


class TestItmoV02Acceptance:
    """Исходный файл ИТМО (AS IS «Разогрев супа V3») — обязательные классы отчёта."""

    @pytest.fixture(scope="class")
    def result(self):
        xml = open(os.path.join(FIXTURES_DIR, "itmo_razogrev_v02.bpmn"), encoding="utf-8").read()
        return parse_bpmn(xml)

    def test_lossless(self, result):
        assert result.report["summary"]["nodes"] == 30
        assert result.report["summary"]["flows"] == 29

    def test_required_finding_classes(self, result):
        codes = {f["code"] for f in result.report["findings"]}
        # Классы из критерия E3.2: validator_profile_id/actor_kind → LEGACY_CAMUNDA_PROPERTY
        assert "LEGACY_CAMUNDA_PROPERTY" in codes
        assert "UNKNOWN_OPERATION_CODE" in codes  # move_object, transfer_contents, ...
        assert "DOLLAR_SUBSTITUTION" in codes  # ${recipe_context.*}
        assert "UNDECLARED_ENTITY_REF" in codes
        assert "PLACEHOLDER_VALUE" in codes  # заглушки "-"

    def test_legacy_props_named(self, result):
        legacy = [f for f in result.report["findings"] if f["code"] == "LEGACY_CAMUNDA_PROPERTY"]
        text = " ".join(f["message"] for f in legacy)
        for key in ("validator_profile_id", "actor_kind", "seal_method", "dish_sku_id", "operation_id"):
            assert key in text, key
        for f in result.report["findings"]:
            assert f["element_id"], f

    def test_unknown_operation_codes(self, result):
        unknown = [f for f in result.report["findings"] if f["code"] == "UNKNOWN_OPERATION_CODE"]
        text = " ".join(f["message"] for f in unknown)
        for code in ("move_object", "transfer_contents", "seal_container", "grasp_object"):
            assert code in text, code

    def test_draft_entities_created(self, result):
        assert len(result.draft_entities) > 0
