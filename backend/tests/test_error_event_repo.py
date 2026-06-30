from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from app.repositories.error_event_repo import (
    append_error_event,
    count_error_events,
    delete_error_event,
    get_error_event,
    list_error_events,
    update_error_event,
)
from app.shared.dto.error_event_dto import ErrorEventIn, ErrorEventPatchIn


def _sample_dto(**overrides):
    defaults = {
        "event_type": "api_failure",
        "severity": "error",
        "message": "test message",
        "source": "frontend",
    }
    defaults.update(overrides)
    return ErrorEventIn(**defaults)


def test_append_and_get_error_event():
    dto = _sample_dto()
    stored = append_error_event(
        dto,
        trusted_user_id="user_1",
        trusted_org_id="org_1",
        path="/api/telemetry/error-events",
        method="POST",
    )
    assert stored.id.startswith("evt_")
    assert stored.event_type == "api_failure"
    assert stored.user_id == "user_1"
    assert stored.org_id == "org_1"
    assert stored.fingerprint

    fetched = get_error_event(stored.id)
    assert fetched is not None
    assert fetched.id == stored.id
    assert fetched.message == "test message"


def test_append_redacts_context_and_sets_server_meta():
    dto = _sample_dto(
        context_json={
            "authorization": "Bearer secret",
            "safe": "ok",
        },
    )
    stored = append_error_event(
        dto,
        trusted_user_id="user_1",
        trusted_org_id="org_1",
        path="/api/x",
        method="POST",
        client_ip="127.0.0.1",
    )
    ctx = stored.context_json
    assert ctx["authorization"] == "[REDACTED]"
    assert ctx["safe"] == "ok"
    assert ctx["_server"]["ingest_method"] == "POST"
    assert ctx["_server"]["client_ip"] == "127.0.0.1"


def test_list_and_count_error_events():
    org_id = "org_list"
    for i in range(3):
        append_error_event(
            _sample_dto(event_type="api_failure", message=f"msg {i}"),
            trusted_user_id="u",
            trusted_org_id=org_id,
        )
    append_error_event(
        _sample_dto(event_type="backend_exception"),
        trusted_user_id="u",
        trusted_org_id=org_id,
    )

    assert count_error_events(org_id=org_id) == 4
    rows = list_error_events(org_id=org_id, event_type="api_failure", limit=10)
    assert len(rows) == 3


def test_update_error_event():
    stored = append_error_event(
        _sample_dto(),
        trusted_user_id="u",
        trusted_org_id="o",
    )
    updated = update_error_event(
        stored.id,
        ErrorEventPatchIn(severity="warn", message="updated message"),
    )
    assert updated is not None
    assert updated.severity == "warn"
    assert updated.message == "updated message"
    # occurred_at / ingested_at should not change
    assert updated.occurred_at == stored.occurred_at


def test_delete_error_event():
    stored = append_error_event(
        _sample_dto(),
        trusted_user_id="u",
        trusted_org_id="o",
    )
    assert delete_error_event(stored.id) is True
    assert get_error_event(stored.id) is None
    assert delete_error_event(stored.id) is False


def test_empty_patch_returns_current_event():
    stored = append_error_event(
        _sample_dto(),
        trusted_user_id="u",
        trusted_org_id="o",
    )
    updated = update_error_event(stored.id, ErrorEventPatchIn())
    assert updated is not None
    assert updated.id == stored.id
    assert updated.message == stored.message
