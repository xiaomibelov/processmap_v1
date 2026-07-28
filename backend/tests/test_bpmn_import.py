import os
import sys
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
# (a) v0.3 file imports cleanly
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
# (b) v0.2-style file produces the expected mismatch findings
# ---------------------------------------------------------------------------

def test_v0_2_fixture_findings_cover_all_mismatch_kinds():
    result = parse_bpmn(_load_fixture("razogrev_v02_style.bpmn"))
    findings = result.report["findings"]
    codes = {f["code"] for f in findings}

    # legacy task types (userTask + serviceTask)
    legacy_task = [f for f in findings if f["code"] == "LEGACY_TASK_TYPE"]
    assert {f["element_id"] for f in legacy_task} == {"Activity_heat", "Activity_notify"}

    # camunda properties (actor_role + validator_profile_id)
    camunda = [f for f in findings if f["code"] == "LEGACY_CAMUNDA_PROPERTY"]
    assert len(camunda) == 2
    assert all(f["element_id"] == "Activity_heat" for f in camunda)
    assert any("actor_role" in f["message"] for f in camunda)
    assert any("validator_profile_id" in f["message"] for f in camunda)

    # validator_profile_id also flagged as legacy field on process metadata
    legacy_field = [f for f in findings if f["code"] == "LEGACY_FIELD"]
    assert any("validator_profile_id" in f["message"] for f in legacy_field)
    assert any(f["element_id"] == "Process_razogrev" for f in legacy_field)

    # ${...} substitution in a param and in a conditionExpression
    dollar = [f for f in findings if f["code"] == "DOLLAR_SUBSTITUTION"]
    assert any(f["element_id"] == "Activity_heat" for f in dollar)
    assert any(f["element_id"] == "Flow_s4" for f in dollar)

    # undeclared entity refs
    undeclared = [f for f in findings if f["code"] == "UNDECLARED_ENTITY_REF"]
    assert any("microwave_01" in f["message"] for f in undeclared)
    assert any("sauce_container" in f["message"] for f in undeclared)

    # unknown operation code
    unknown_op = [f for f in findings if f["code"] == "UNKNOWN_OPERATION_CODE"]
    assert any("cook_soup" in f["message"] for f in unknown_op)
    assert any(f["element_id"] == "Activity_notify" for f in unknown_op)

    # every finding carries element_id so the UI can navigate
    assert findings
    for finding in findings:
        assert finding["element_id"]
        assert finding["severity"] in ("error", "warning")

    assert "LEGACY_TASK_TYPE" in codes
    assert "LEGACY_CAMUNDA_PROPERTY" in codes
    assert "LEGACY_FIELD" in codes
    assert "DOLLAR_SUBSTITUTION" in codes
    assert "UNDECLARED_ENTITY_REF" in codes
    assert "UNKNOWN_OPERATION_CODE" in codes


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
