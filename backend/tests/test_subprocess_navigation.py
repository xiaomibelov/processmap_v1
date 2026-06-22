import pytest
from fastapi import HTTPException
from app.services.session_service import navigate_to_subprocess, return_to_parent
from app.storage import get_storage
from app.repositories import project_repo, session_repo

BPMN_ROOT = """<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs">
  <process id="Process_root">
    <startEvent id="start" />
    <callActivity id="ca_1" calledElement="Process_sub" />
    <endEvent id="end" />
  </process>
  <process id="Process_sub">
    <startEvent id="sub_start" />
    <task id="sub_task" />
    <userTask id="sub_user_task" />
    <endEvent id="sub_end" />
  </process>
</definitions>"""


def _make_request(user, org):
    class DummyRequest:
        state = type("S", (), {"auth_user": user, "active_org_id": org, "is_admin": False})()
        headers = {}
    return DummyRequest()


def test_navigate_to_embedded_subprocess():
    st = get_storage()
    owner = "owner_nav_1"
    org = "org_nav_1"
    pid = project_repo.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    req = _make_request(owner, org)
    result = navigate_to_subprocess(sid, "ca_1", request=req)
    assert result["subprocess_session_id"]
    assert result["target_element_id"] == "sub_user_task"
    assert len(result["breadcrumbs"]) == 2

    child = session_repo.load(result["subprocess_session_id"], user_id=owner, org_id=org, is_admin=True)
    assert child.parent_session_id == sid
    assert child.element_id_in_parent == "ca_1"


def test_navigate_with_explicit_target():
    owner = "owner_nav_2"
    org = "org_nav_2"
    pid = project_repo.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    req = _make_request(owner, org)
    result = navigate_to_subprocess(sid, "ca_1", target_element_id="sub_task", request=req)
    assert result["target_element_id"] == "sub_task"


def test_return_to_parent():
    owner = "owner_nav_3"
    org = "org_nav_3"
    pid = project_repo.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    req = _make_request(owner, org)
    nav = navigate_to_subprocess(sid, "ca_1", request=req)
    ret = return_to_parent(nav["subprocess_session_id"], request=req)
    assert ret["parent_session_id"] == sid
    assert ret["element_id_in_parent"] == "ca_1"


def test_unauthorized_user_gets_403_or_404():
    owner = "owner_nav_4"
    intruder = "intruder_nav_4"
    org = "org_nav_4"
    other_org = "org_nav_4_other"
    pid = project_repo.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    req = _make_request(intruder, other_org)
    with pytest.raises(HTTPException) as exc_info:
        navigate_to_subprocess(sid, "ca_1", request=req)
    assert exc_info.value.status_code in (403, 404)


def test_navigate_existing_child_reuses_session():
    owner = "owner_nav_5"
    org = "org_nav_5"
    pid = project_repo.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_ROOT
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    req = _make_request(owner, org)
    first = navigate_to_subprocess(sid, "ca_1", request=req)
    second = navigate_to_subprocess(sid, "ca_1", request=req)
    assert first["subprocess_session_id"] == second["subprocess_session_id"]


BPMN_WITH_SUBPROCESS = """<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs">
  <process id="Process_root">
    <startEvent id="start" />
    <subProcess id="sub_1">
      <startEvent id="sub_start" />
      <task id="sub_task" />
      <userTask id="sub_user_task" />
      <endEvent id="sub_end" />
    </subProcess>
    <endEvent id="end" />
  </process>
</definitions>"""


def test_navigate_to_embedded_subprocess_element():
    owner = "owner_nav_sub_1"
    org = "org_nav_sub_1"
    pid = project_repo.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title="Root", project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = BPMN_WITH_SUBPROCESS
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)

    req = _make_request(owner, org)
    result = navigate_to_subprocess(sid, "sub_1", request=req)
    assert result["subprocess_session_id"]
    assert result["target_element_id"] == "sub_user_task"
    assert len(result["breadcrumbs"]) == 2

    child = session_repo.load(result["subprocess_session_id"], user_id=owner, org_id=org, is_admin=True)
    assert child.parent_session_id == sid
    assert child.element_id_in_parent == "sub_1"
    assert "<bpmn:definitions" in (child.bpmn_xml or "")
    assert "bpmndi:BPMNShape" in (child.bpmn_xml or "")
