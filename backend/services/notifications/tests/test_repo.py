from __future__ import annotations

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


def test_append_and_get():
    stored = append_error_event(
        _sample_dto(),
        trusted_user_id="u1",
        trusted_org_id="o1",
        path="/api/x",
        method="POST",
    )
    assert stored.id.startswith("evt_")
    fetched = get_error_event(stored.id)
    assert fetched is not None
    assert fetched.id == stored.id


def test_list_count():
    org_id = "org_repo"
    for i in range(3):
        append_error_event(
            _sample_dto(event_type="api_failure"),
            trusted_user_id="u",
            trusted_org_id=org_id,
        )
    append_error_event(
        _sample_dto(event_type="other"),
        trusted_user_id="u",
        trusted_org_id=org_id,
    )
    assert count_error_events(org_id=org_id) == 4
    assert len(list_error_events(org_id=org_id, event_type="api_failure", limit=10)) == 3


def test_update_and_delete():
    stored = append_error_event(
        _sample_dto(),
        trusted_user_id="u",
        trusted_org_id="o",
    )
    updated = update_error_event(stored.id, ErrorEventPatchIn(severity="warn"))
    assert updated is not None
    assert updated.severity == "warn"
    assert delete_error_event(stored.id) is True
    assert get_error_event(stored.id) is None
