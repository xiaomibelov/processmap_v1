from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from app.shared.dto.error_event_dto import (
    SCHEMA_VERSION,
    ErrorEventIn,
    ErrorEventOut,
    ErrorEventPatchIn,
)
from app.shared.dto.error_event_helpers import (
    compute_fingerprint,
    redact_context_json,
)


def test_error_event_in_valid_payload():
    dto = ErrorEventIn(
        event_type="api_failure",
        severity="error",
        message="something failed",
        source="frontend",
    )
    assert dto.event_type == "api_failure"
    assert dto.severity == "error"
    assert dto.source == "frontend"
    assert dto.schema_version == SCHEMA_VERSION


def test_error_event_in_rejects_bad_severity():
    with pytest.raises(ValueError, match="severity"):
        ErrorEventIn(
            event_type="x",
            severity="critical",
            message="m",
            source="frontend",
        )


def test_error_event_in_rejects_empty_message():
    with pytest.raises(ValueError, match="message"):
        ErrorEventIn(
            event_type="x",
            severity="error",
            message="   ",
            source="frontend",
        )


def test_error_event_in_rejects_extra_fields():
    with pytest.raises(ValueError):
        ErrorEventIn(
            event_type="x",
            severity="error",
            message="m",
            source="frontend",
            unknown_field=True,
        )


def test_error_event_in_normalizes_slug_fields():
    dto = ErrorEventIn(
        event_type="API Failure",
        severity="ERROR",
        message="msg",
        source="Front End",
    )
    assert dto.event_type == "api_failure"
    assert dto.severity == "error"
    assert dto.source == "front_end"


def test_error_event_patch_in_valid_partial():
    patch = ErrorEventPatchIn(severity="warn")
    assert patch.severity == "warn"
    assert patch.message is None
    assert patch.context_json is None


def test_error_event_patch_in_rejects_invalid_severity():
    with pytest.raises(ValueError, match="severity"):
        ErrorEventPatchIn(severity="foo")


def test_redact_context_json_removes_sensitive_keys():
    ctx = {
        "authorization": "Bearer secret",
        "safe": "ok",
        "request_body": {"token": "secret"},
    }
    out = redact_context_json(ctx)
    assert out["authorization"] == "[REDACTED]"
    assert out["safe"] == "ok"
    assert out["request_body"]["_redacted"] == "payload"


def test_compute_fingerprint_is_stable():
    event = {
        "schema_version": 1,
        "source": "frontend",
        "event_type": "api_failure",
        "severity": "error",
        "message": "m",
        "route": "/api/x",
        "session_id": "s",
        "project_id": "p",
    }
    assert compute_fingerprint(event) == compute_fingerprint(event)
    event2 = {**event, "message": "m2"}
    assert compute_fingerprint(event) != compute_fingerprint(event2)


def test_error_event_out_accepts_full_row():
    row = {
        "id": "evt_1",
        "schema_version": 1,
        "occurred_at": 100,
        "ingested_at": 110,
        "source": "frontend",
        "event_type": "api_failure",
        "severity": "error",
        "message": "m",
        "fingerprint": "fp",
        "context_json": {},
    }
    out = ErrorEventOut(**row)
    assert out.id == "evt_1"
