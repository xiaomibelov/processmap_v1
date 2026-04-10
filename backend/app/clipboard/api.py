from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from .. import _legacy_main
from .service import ClipboardService, ClipboardServiceError

router = APIRouter()


class ClipboardCopyIn(BaseModel):
    session_id: str
    element_id: str


class ClipboardPasteIn(BaseModel):
    session_id: str


def _service_error_response(exc: ClipboardServiceError):
    return _legacy_main._enterprise_error(int(exc.status_code), str(exc.code), str(exc.message))


@router.post("/api/clipboard/bpmn/copy")
def copy_bpmn_element_to_clipboard(inp: ClipboardCopyIn, request: Request):
    service = ClipboardService()
    try:
        return service.copy_element(
            session_id=str(getattr(inp, "session_id", "") or ""),
            element_id=str(getattr(inp, "element_id", "") or ""),
            request=request,
        ).model_dump()
    except ClipboardServiceError as exc:
        return _service_error_response(exc)


@router.get("/api/clipboard/bpmn")
def get_current_bpmn_clipboard(request: Request):
    service = ClipboardService()
    try:
        return service.read_clipboard(request=request).model_dump()
    except ClipboardServiceError as exc:
        return _service_error_response(exc)


@router.post("/api/clipboard/bpmn/paste")
def paste_bpmn_clipboard(inp: ClipboardPasteIn, request: Request):
    service = ClipboardService()
    try:
        return service.paste_clipboard(
            session_id=str(getattr(inp, "session_id", "") or ""),
            request=request,
        ).model_dump()
    except ClipboardServiceError as exc:
        return _service_error_response(exc)


@router.delete("/api/clipboard/bpmn")
def clear_current_bpmn_clipboard(request: Request):
    service = ClipboardService()
    try:
        return service.clear_clipboard(request=request).model_dump()
    except ClipboardServiceError as exc:
        return _service_error_response(exc)


# Backward-compatible alias for existing task-v1 tests/imports.
copy_bpmn_task_to_clipboard = copy_bpmn_element_to_clipboard
