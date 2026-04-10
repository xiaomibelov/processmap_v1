from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Request

from .. import _legacy_main
from ..legacy.request_context import request_active_org_id, request_user_meta
from .materializer import (
    ClipboardMaterializationError,
    materialize_subprocess_payload_into_session,
    materialize_task_payload_into_session,
)
from .models import (
    CLIPBOARD_TASK_ITEM_TYPE,
    CLIPBOARD_SUBPROCESS_ITEM_TYPE,
    ClipboardClearResponse,
    ClipboardCopyResponse,
    ClipboardPasteResponse,
    ClipboardPayload,
    ClipboardPreview,
    ClipboardReadResponse,
    ClipboardSubprocessPayload,
    ClipboardTaskPayload,
)
from .redis_store import ClipboardRedisStore, clipboard_ttl_sec
from .serializer import ClipboardSerializationError, serialize_clipboard_payload


@dataclass
class ClipboardServiceError(RuntimeError):
    status_code: int
    code: str
    message: str

    def __post_init__(self) -> None:
        super().__init__(self.message)


def _require_user(request: Request) -> tuple[str, bool]:
    user_id, is_admin = request_user_meta(request)
    if not user_id:
        raise ClipboardServiceError(401, "unauthorized", "unauthorized")
    return str(user_id), bool(is_admin)


def _parse_clipboard_payload(raw_payload: dict) -> ClipboardPayload:
    item_type = str((raw_payload or {}).get("clipboard_item_type") or "").strip()
    if item_type == CLIPBOARD_TASK_ITEM_TYPE:
        return ClipboardTaskPayload.model_validate(raw_payload)
    if item_type == CLIPBOARD_SUBPROCESS_ITEM_TYPE:
        return ClipboardSubprocessPayload.model_validate(raw_payload)
    raise ClipboardServiceError(422, "invalid_clipboard_payload", "invalid_clipboard_payload")


def _preview_from_payload(payload: ClipboardPayload, *, ttl_sec: int) -> ClipboardPreview:
    copied_at = int(payload.metadata.copied_at or 0)
    if isinstance(payload, ClipboardTaskPayload):
        element_type = str(payload.element.element_type)
        copied_name = str(payload.element.name or "")
    else:
        element_type = str(payload.root.element_type)
        copied_name = str(payload.root.name or "")
    return ClipboardPreview(
        schema_version=str(payload.schema_version),
        clipboard_item_type=str(payload.clipboard_item_type),
        element_type=element_type,
        copied_name=copied_name,
        source_session_id=str(payload.context.source_session_id),
        source_element_id=str(payload.context.source_element_id),
        copied_at=copied_at,
        expires_at=copied_at + int(ttl_sec or 0),
    )


class ClipboardService:
    def __init__(self, *, store: Optional[ClipboardRedisStore] = None) -> None:
        self._store = store or ClipboardRedisStore()

    def copy_element(self, *, session_id: str, element_id: str, request: Request) -> ClipboardCopyResponse:
        user_id, _is_admin = _require_user(request)
        sess, resolved_org_id, _scope = _legacy_main._legacy_load_session_scoped(session_id, request)
        if not sess:
            raise ClipboardServiceError(404, "not_found", "not_found")
        copied_at = int(time.time())
        try:
            payload = serialize_clipboard_payload(
                session_obj=sess,
                element_id=element_id,
                copied_by_user_id=user_id,
                copied_at=copied_at,
                source_org_id=resolved_org_id,
            )
        except ClipboardSerializationError as exc:
            status = 404 if exc.code == "element_not_found" else 422
            raise ClipboardServiceError(status, exc.code, exc.message) from exc

        active_org_id = str(request_active_org_id(request) or resolved_org_id or "").strip()
        if not self._store.put(user_id=user_id, org_id=active_org_id, payload=payload):
            raise ClipboardServiceError(503, "clipboard_store_unavailable", "clipboard_store_unavailable")
        ttl = clipboard_ttl_sec()
        if isinstance(payload, ClipboardTaskPayload):
            element_type = str(payload.element.element_type)
            copied_name = str(payload.element.name or "")
        else:
            element_type = str(payload.root.element_type)
            copied_name = str(payload.root.name or "")
        return ClipboardCopyResponse(
            clipboard_item_type=str(payload.clipboard_item_type),
            element_type=element_type,
            copied_name=copied_name,
            expires_at=int(copied_at + ttl),
            schema_version=str(payload.schema_version),
        )

    def read_clipboard(self, *, request: Request) -> ClipboardReadResponse:
        user_id, _is_admin = _require_user(request)
        active_org_id = str(request_active_org_id(request) or "").strip()
        raw_payload = self._store.get(user_id=user_id, org_id=active_org_id)
        if not isinstance(raw_payload, dict):
            return ClipboardReadResponse(empty=True, item=None)
        try:
            payload = _parse_clipboard_payload(raw_payload)
        except Exception:
            self._store.clear(user_id=user_id, org_id=active_org_id)
            return ClipboardReadResponse(empty=True, item=None)
        return ClipboardReadResponse(
            empty=False,
            item=_preview_from_payload(payload, ttl_sec=clipboard_ttl_sec()),
        )

    def paste_clipboard(self, *, session_id: str, request: Request) -> ClipboardPasteResponse:
        user_id, _is_admin = _require_user(request)
        active_org_id = str(request_active_org_id(request) or "").strip()
        raw_payload = self._store.get(user_id=user_id, org_id=active_org_id)
        if not isinstance(raw_payload, dict):
            raise ClipboardServiceError(404, "clipboard_empty", "clipboard_empty")
        try:
            payload = _parse_clipboard_payload(raw_payload)
        except Exception as exc:
            self._store.clear(user_id=user_id, org_id=active_org_id)
            raise ClipboardServiceError(422, "invalid_clipboard_payload", "invalid_clipboard_payload") from exc

        paste_handlers = {
            CLIPBOARD_TASK_ITEM_TYPE: lambda p: materialize_task_payload_into_session(
                payload=p,
                target_session_id=session_id,
                request=request,
            ),
            CLIPBOARD_SUBPROCESS_ITEM_TYPE: lambda p: materialize_subprocess_payload_into_session(
                payload=p,
                target_session_id=session_id,
                request=request,
            ),
        }
        handler = paste_handlers.get(str(payload.clipboard_item_type or ""))
        if handler is None:
            raise ClipboardServiceError(422, "unsupported_clipboard_item_type", "unsupported clipboard item type")
        try:
            return handler(payload)
        except ClipboardMaterializationError as exc:
            raise ClipboardServiceError(exc.status_code, exc.code, exc.message) from exc

    def clear_clipboard(self, *, request: Request) -> ClipboardClearResponse:
        user_id, _is_admin = _require_user(request)
        active_org_id = str(request_active_org_id(request) or "").strip()
        self._store.clear(user_id=user_id, org_id=active_org_id)
        return ClipboardClearResponse()
