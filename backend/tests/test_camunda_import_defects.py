import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.process_template.bpmn_export import generate_bpmn
from app.process_template.bpmn_import import parse_bpmn
from app.repositories import project_repo, session_repo
from app.schemas.legacy_api import BpmnXmlIn
from app.services.session_service import bpmn_save

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture(name: str) -> str:
    with open(os.path.join(FIXTURES_DIR, name), "r", encoding="utf-8") as fh:
        return fh.read()


def _admin_request(user_id: str, org_id: str):
    class AdminRequest:
        state = type(
            "S",
            (),
            {
                "auth_user": {"id": user_id, "is_admin": True},
                "active_org_id": org_id,
                "is_admin": True,
            },
        )()
        headers = {}

    return AdminRequest()


def test_file_import_preserves_top_level_and_subprocess_task_names_and_camunda_properties():
    result = parse_bpmn(_load_fixture("camunda_nested_task_properties.bpmn"))
    nodes = {node["id"]: node for node in result.ui_model["nodes"]}

    assert nodes["Task_Top"]["name"] == "Измерить\nтемпературу"
    assert nodes["Task_Top"]["display_name"] == "Измерить\nтемпературу"
    assert nodes["Task_Sub_1"]["name"] == "Изменить режим оборудования"
    assert nodes["Task_Sub_1"]["display_name"] == "Изменить режим оборудования"

    meta = result.ui_model["bpmn_meta"]["camunda_extensions_by_element_id"]
    top_props = meta["Task_Top"]["properties"]["extensionProperties"]
    assert [(row["key"], row["value"]) for row in top_props] == [
        ("ingredient", "Крем"),
        ("ingredient", "Сливки"),
        ("equipment", "Термощуп"),
    ]
    assert [(row["name"], row["value"]) for row in top_props] == [
        ("ingredient", "Крем"),
        ("ingredient", "Сливки"),
        ("equipment", "Термощуп"),
    ]

    nested = meta["Task_Sub_1"]
    nested_props = nested["properties"]["extensionProperties"]
    assert [(row["key"], row["value"]) for row in nested_props] == [
        ("equipment", "Печь №2"),
        ("tara", "Шпилька"),
        ("target_temperature", "82"),
    ]
    preserved = "\n".join(nested["preservedExtensionElements"])
    assert "camunda:inputOutput" in preserved
    assert "бережный" in preserved

    generated = generate_bpmn(result.ui_model, template_name="Camunda import defects", template_id="camunda-defects")
    reparsed = parse_bpmn(generated)
    reparsed_nodes = {node["id"]: node for node in reparsed.ui_model["nodes"]}
    assert reparsed_nodes["Task_Top"]["name"] == "Измерить\nтемпературу"
    assert reparsed_nodes["Task_Sub_1"]["name"] == "Изменить режим оборудования"
    reparsed_props = reparsed.ui_model["bpmn_meta"]["camunda_extensions_by_element_id"]["Task_Top"]["properties"][
        "extensionProperties"
    ]
    assert [(row["key"], row["value"]) for row in reparsed_props] == [
        ("ingredient", "Крем"),
        ("ingredient", "Сливки"),
        ("equipment", "Термощуп"),
    ]


def test_existing_scheme_import_creates_all_subprocess_sessions_without_fixed_ten_limit():
    owner = "owner_camunda_many_subprocesses"
    org = "org_camunda_many_subprocesses"
    pid = project_repo.create_project("Camunda subprocess import", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    request = _admin_request(owner, org)

    result = bpmn_save(
        sid,
        BpmnXmlIn(xml=_load_fixture("camunda_15_subprocesses.bpmn"), source_action="import_bpmn"),
        request=request,
    )

    assert result["ok"] is True
    assert result["subprocesses_total"] == 15
    assert result["subprocesses_created"] == 15
    assert result["subprocesses_has_more"] is False

    child_ids = []
    for idx in range(1, 16):
        child = session_repo.find_by_parent_element(sid, f"SubProcess_{idx:02d}", org_id=org)
        assert child is not None, f"missing child session for SubProcess_{idx:02d}"
        assert f"Задача подпроцесса {idx:02d}" in (child.bpmn_xml or "")
        child_ids.append(child.id)
    assert len(set(child_ids)) == 15
