"""Router for status transition operations."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ...schemas.legacy_api import StatusPatchIn
from .status_service import change_session_status

router = APIRouter()


@router.patch("/api/sessions/{session_id}/status")
def change_session_status_endpoint(
    session_id: str,
    inp: StatusPatchIn,
    request: Request,
):
    """Dedicated status transition endpoint."""
    return change_session_status(session_id, inp, request)
