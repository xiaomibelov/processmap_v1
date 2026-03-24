from types import SimpleNamespace

from app._legacy_main import (
    _session_bpmn_version_token,
    _session_collab_version_token,
    _session_sync_version_token,
)


def _session_fixture(*, notes_status: str = "open", bpmn_xml: str = "<definitions/>"):
    return SimpleNamespace(
        version=2,
        bpmn_xml_version=1,
        updated_at=1774145446,
        bpmn_graph_fingerprint="fp_123",
        bpmn_xml=bpmn_xml,
        bpmn_meta={
            "review_v1": {"status": "in_review", "updated_at": 1774145446},
            "camunda_extensions_by_element_id": {
                "Task_1": {
                    "properties": {
                        "extensionProperties": [
                            {"name": "tara", "value": "Шпилька"},
                            {"name": "container_type", "value": "Противень"},
                        ],
                    },
                },
            },
        },
        notes_by_element={
            "Task_1": {
                "items": [
                    {
                        "id": "c1",
                        "kind": "review_comment",
                        "text": "Проверить условие",
                        "status": notes_status,
                        "session_id": "s1",
                        "anchor_type": "node",
                        "anchor_id": "Task_1",
                        "createdAt": 1774145400,
                        "updatedAt": 1774145446,
                    },
                ],
                "updatedAt": 1774145446,
            },
        },
        interview={"status": "draft"},
    )


def test_session_sync_version_token_is_deterministic_for_equivalent_payload():
    session_a = _session_fixture()
    session_b = _session_fixture()
    # Same truth, different in-memory object instances must produce same token.
    token_a = _session_sync_version_token(session_a)
    token_b = _session_sync_version_token(session_b)
    assert token_a == token_b


def test_session_sync_version_token_changes_on_material_review_change():
    open_session = _session_fixture(notes_status="open")
    resolved_session = _session_fixture(notes_status="resolved")
    token_open = _session_sync_version_token(open_session)
    token_resolved = _session_sync_version_token(resolved_session)
    assert token_open != token_resolved


def test_collab_change_keeps_bpmn_token_but_changes_collab_token():
    open_session = _session_fixture(notes_status="open")
    resolved_session = _session_fixture(notes_status="resolved")
    bpmn_open = _session_bpmn_version_token(open_session)
    bpmn_resolved = _session_bpmn_version_token(resolved_session)
    collab_open = _session_collab_version_token(open_session)
    collab_resolved = _session_collab_version_token(resolved_session)
    assert bpmn_open == bpmn_resolved
    assert collab_open != collab_resolved


def test_bpmn_token_changes_when_bpmn_xml_changes_even_if_versions_match():
    session_a = _session_fixture(bpmn_xml="<definitions><task id='A'/></definitions>")
    session_b = _session_fixture(bpmn_xml="<definitions><task id='B'/></definitions>")
    assert _session_bpmn_version_token(session_a) != _session_bpmn_version_token(session_b)
