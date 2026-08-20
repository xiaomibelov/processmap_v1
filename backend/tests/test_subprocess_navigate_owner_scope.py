"""Regression tests: subprocess sync (navigate/auto_create) must not crash
with PermissionError when the triggering actor is not the child session owner.

System synchronization of a child session (refresh XML / heal title+stack /
reimport parent) is a system write performed on behalf of the child OWNER,
not the actor who triggered it (fix/subprocess-navigate-owner-scope).
"""
import xml.etree.ElementTree as ET
from types import SimpleNamespace

from app.services import session_service as svc
from app.services.session_service import navigate_to_subprocess
from app.storage import get_storage
from app.repositories import project_repo, session_repo

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
DI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DC_NS = "http://www.omg.org/spec/DD/20100524/DC"

PARENT_XML_V1 = """<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs">
  <process id="Process_root">
    <startEvent id="start" />
    <subProcess id="sub_1" name="Sub One">
      <startEvent id="sub_start" />
      <task id="sub_task" name="Sub Task" />
      <endEvent id="sub_end" />
    </subProcess>
    <endEvent id="end" />
  </process>
</definitions>"""

PARENT_XML_V2 = """<?xml version="1.0"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs">
  <process id="Process_root">
    <startEvent id="start" />
    <subProcess id="sub_1" name="Sub One">
      <startEvent id="sub_start" />
      <task id="sub_task" name="Sub Task" />
      <task id="sub_task_2" name="Sub Task 2" />
      <endEvent id="sub_end" />
    </subProcess>
    <endEvent id="end" />
  </process>
</definitions>"""

STALE_CHILD_XML = """<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="defs_stale">
  <bpmn:process id="Process_stale">
    <bpmn:task id="stale_task" name="STALE" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_stale">
      <bpmndi:BPMNShape id="stale_task_di" bpmnElement="stale_task">
        <dc:Bounds x="50" y="50" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>"""


def _make_request(uid, org, is_admin=False):
    class DummyRequest:
        state = SimpleNamespace(
            auth_user={"id": uid, "is_admin": is_admin},
            active_org_id=org,
        )
        headers = {}
    return DummyRequest()


def _make_parent(owner, org, xml, title="Root"):
    pid = project_repo.create_project("Test project", user_id=owner, org_id=org)
    sid = session_repo.create(title=title, project_id=pid, user_id=owner, org_id=org)
    root = session_repo.load(sid, user_id=owner, org_id=org, is_admin=True)
    root.bpmn_xml = xml
    session_repo.save(root, user_id=owner, org_id=org, is_admin=True)
    return sid


def _load_admin(session_id, org):
    return session_repo.load(session_id, org_id=org, is_admin=True)


def _create_child_via_navigate(sid, owner, org):
    nav = navigate_to_subprocess(sid, "sub_1", request=_make_request(owner, org))
    return nav["subprocess_session_id"]


def _force_stale_child_xml(child_id, owner, org):
    child = _load_admin(child_id, org)
    child.bpmn_xml = STALE_CHILD_XML
    session_repo.save(child, user_id=owner, org_id=org, is_admin=True)


def _shape_bounds(xml_text, bpmn_element):
    ns = {"bpmndi": DI_NS, "dc": DC_NS}
    root = ET.fromstring(xml_text)
    for shape in root.findall(".//bpmndi:BPMNShape", ns):
        if shape.attrib.get("bpmnElement") == bpmn_element:
            bounds = shape.find("dc:Bounds", ns)
            if bounds is not None:
                return {k: float(bounds.attrib[k]) for k in ("x", "y", "width", "height")}
    return None


def test_non_owner_navigate_syncs_child_under_owner_scope():
    """Incident regression: non-admin B (same org) navigates into a child
    owned by A with diverging XML -> 200, child XML synced, owner kept."""
    owner, other, org = "owner_scope_1a", "user_scope_1b", "org_scope_1"
    sid = _make_parent(owner, org, PARENT_XML_V1)
    child_id = _create_child_via_navigate(sid, owner, org)
    _force_stale_child_xml(child_id, owner, org)

    nav_b = navigate_to_subprocess(sid, "sub_1", request=_make_request(other, org))
    assert nav_b["subprocess_session_id"] == child_id
    assert "stale_task" not in (nav_b["bpmn_xml"] or "")
    assert "sub_task" in (nav_b["bpmn_xml"] or "")

    healed = _load_admin(child_id, org)
    assert "stale_task" not in (healed.bpmn_xml or "")
    assert "sub_task" in (healed.bpmn_xml or "")
    assert healed.owner_user_id == owner
    assert healed.updated_by == owner


def test_admin_navigate_keeps_admin_write_scope():
    owner, admin_uid, org = "owner_scope_2a", "admin_scope_2", "org_scope_2"
    sid = _make_parent(owner, org, PARENT_XML_V1)
    child_id = _create_child_via_navigate(sid, owner, org)
    _force_stale_child_xml(child_id, owner, org)

    nav = navigate_to_subprocess(sid, "sub_1", request=_make_request(admin_uid, org, is_admin=True))
    assert nav["subprocess_session_id"] == child_id
    healed = _load_admin(child_id, org)
    assert "sub_task" in (healed.bpmn_xml or "")
    assert healed.owner_user_id == owner
    assert healed.updated_by == admin_uid


def test_owner_navigate_behaves_as_before():
    owner, org = "owner_scope_3a", "org_scope_3"
    sid = _make_parent(owner, org, PARENT_XML_V1)
    child_id = _create_child_via_navigate(sid, owner, org)
    _force_stale_child_xml(child_id, owner, org)

    nav = navigate_to_subprocess(sid, "sub_1", request=_make_request(owner, org))
    assert nav["subprocess_session_id"] == child_id
    healed = _load_admin(child_id, org)
    assert "sub_task" in (healed.bpmn_xml or "")
    assert healed.owner_user_id == owner
    assert healed.updated_by == owner


def test_sync_snapshot_attributed_to_navigating_actor():
    owner, other, org = "owner_scope_4a", "user_scope_4b", "org_scope_4"
    sid = _make_parent(owner, org, PARENT_XML_V1)
    child_id = _create_child_via_navigate(sid, owner, org)
    _force_stale_child_xml(child_id, owner, org)

    navigate_to_subprocess(sid, "sub_1", request=_make_request(other, org))

    st = get_storage()
    versions = st.list_bpmn_versions(child_id, org_id=org)
    sync_versions = [v for v in versions if v.get("source_action") == "subprocess_sync"]
    assert sync_versions, "expected a subprocess_sync snapshot for the overwritten child XML"
    assert sync_versions[0].get("created_by") == other


def test_auto_create_syncs_existing_child_of_other_owner():
    """Reimport of the parent by actor B must refresh an existing child owned
    by A without PermissionError."""
    owner, other, org = "owner_scope_5a", "user_scope_5b", "org_scope_5"
    sid = _make_parent(owner, org, PARENT_XML_V1)
    parent = _load_admin(sid, org)
    res = svc.auto_create_subprocess_sessions(parent, _make_request(owner, org), limit=None)
    assert len(res["created"]) == 1
    child_id = res["created"][0]

    parent2 = _load_admin(sid, org)
    parent2.bpmn_xml = PARENT_XML_V2
    session_repo.save(parent2, user_id=owner, org_id=org, is_admin=True)

    res2 = svc.auto_create_subprocess_sessions(parent2, _make_request(other, org), limit=None)
    assert res2["nested_errors"] == 0

    child = _load_admin(child_id, org)
    assert "sub_task_2" in (child.bpmn_xml or "")
    assert child.owner_user_id == owner
    assert child.updated_by == owner


def test_non_owner_navigate_heals_child_title_and_stack():
    owner, other, org = "owner_scope_6a", "user_scope_6b", "org_scope_6"
    sid = _make_parent(owner, org, PARENT_XML_V1)
    child_id = _create_child_via_navigate(sid, owner, org)

    child = _load_admin(child_id, org)
    child.title = "Подпроцесс: sub_1"
    session_repo.save(child, user_id=owner, org_id=org, is_admin=True)

    nav = navigate_to_subprocess(sid, "sub_1", request=_make_request(other, org))
    assert nav["subprocess_session_id"] == child_id

    healed = _load_admin(child_id, org)
    assert healed.title == "Sub One"
    stack = list(healed.navigation_stack or [])
    assert stack and stack[-1].get("name") == "Sub One"
    assert healed.owner_user_id == owner
    assert healed.updated_by == owner


def test_non_owner_sync_preserves_manual_di_layout():
    """preserve-di compatibility: manual DI of a child owned by A survives a
    sync triggered by non-owner B; new elements get a free grid position."""
    owner, other, org = "owner_scope_7a", "user_scope_7b", "org_scope_7"
    sid = _make_parent(owner, org, PARENT_XML_V1)
    child_id = _create_child_via_navigate(sid, owner, org)

    child = _load_admin(child_id, org)
    manual_xml = child.bpmn_xml
    bounds = _shape_bounds(manual_xml, "sub_task")
    assert bounds is not None
    moved_xml = manual_xml.replace(
        f'x="{bounds["x"]:g}" y="{bounds["y"]:g}" width="{bounds["width"]:g}" height="{bounds["height"]:g}"',
        'x="999" y="888" width="100" height="80"',
        1,
    )
    assert moved_xml != manual_xml
    child.bpmn_xml = moved_xml
    session_repo.save(child, user_id=owner, org_id=org, is_admin=True)

    parent = _load_admin(sid, org)
    parent.bpmn_xml = PARENT_XML_V2
    session_repo.save(parent, user_id=owner, org_id=org, is_admin=True)

    nav = navigate_to_subprocess(sid, "sub_1", request=_make_request(other, org))
    assert nav["subprocess_session_id"] == child_id

    synced = _load_admin(child_id, org)
    assert "sub_task_2" in (synced.bpmn_xml or "")
    kept = _shape_bounds(synced.bpmn_xml, "sub_task")
    assert kept is not None
    assert kept["x"] == 999 and kept["y"] == 888
    new_bounds = _shape_bounds(synced.bpmn_xml, "sub_task_2")
    assert new_bounds is not None
    assert synced.owner_user_id == owner


# ---------------------------------------------------------------------------
# Telemetry micro-fix: backend exception events carry exception details
# ---------------------------------------------------------------------------


def _telemetry_request():
    return SimpleNamespace(
        method="POST",
        url=SimpleNamespace(path="/api/sessions/sess_1", query=""),
        headers={},
        scope={},
        state=SimpleNamespace(auth_user={}, active_org_id=""),
    )


def test_backend_exception_event_keeps_no_leak_contract():
    """Raw exception text may contain secrets and must NOT be persisted
    (contract pinned by test_backend_exception_telemetry)."""
    import json as _json

    from app.error_events.schema import build_backend_exception_event

    exc = PermissionError("session belongs to another user secret_token_should_not_leak")
    event = build_backend_exception_event(_telemetry_request(), exc)
    # message stays type-based (grouping/fingerprint stability).
    assert event.message == "Unhandled backend exception: PermissionError"
    assert "secret_token_should_not_leak" not in _json.dumps(
        dict(event.context_json or {}), ensure_ascii=False
    )


def test_backend_exception_event_includes_os_error_details():
    from app.error_events.schema import build_backend_exception_event

    exc = OSError(50, "Network down", "/tmp/secret.txt")
    event = build_backend_exception_event(_telemetry_request(), exc)
    context = dict(event.context_json or {})
    assert context.get("os_errno") == 50
    assert context.get("os_filename") == "/tmp/secret.txt"
    assert "os_filename2" in context
    assert event.message == "Unhandled backend exception: OSError"
