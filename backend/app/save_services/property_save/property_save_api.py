"""Router for property-only save operations."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ...schemas.legacy_api import SessionMetaPatchIn
from .property_save_service import patch_session_properties

router = APIRouter()


@router.patch("/api/sessions/{session_id}/properties")
def patch_session_properties_endpoint(
    session_id: str,
    inp: SessionMetaPatchIn,
    request: Request = None,
):
    """Property-only meta patch with CAS grace window.

    This endpoint is intended for saves that do **not** mutate BPMN XML, such as
    Camunda extension properties, flow/path meta, or presentation settings. It
    accepts a stale ``base_diagram_state_version`` within a small grace window to
    avoid spurious 409 conflicts.
    """
    return patch_session_properties(session_id, inp, request)
