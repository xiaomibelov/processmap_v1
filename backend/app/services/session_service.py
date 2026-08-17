from __future__ import annotations

import logging
import datetime
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Request

from fastapi import HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError

from ..cache import session_cache
from ..legacy.request_context import request_user_meta, request_active_org_id
from ..redis_cache import explorer_invalidate_sessions
from ..camunda_meta_utils import extract_camunda_extensions_from_bpmn_xml
from ..models import Session
from ..repositories import session_repo
from ..storage import get_storage, list_session_presence, _count_bpmn_activities
from ..utils.authz import session_access_from_request
from .._legacy_main import (
    _can_edit_workspace,
    _org_role_for_request,
    _request_auth_user,
)
from ..services.bpmn_navigation import (
    called_element_id,
    extract_subprocess_xml,
    resolve_target_element_id,
    element_type,
    find_subprocess_elements,
    find_child_session_element_ids,
    get_element_name,
    assert_unique_element_id,
)
from .session_recompute import _recompute_session

logger = logging.getLogger(__name__)


def _bpmn_meta_with_fresh_camunda_extensions(current_meta: Any, xml_text: str) -> Dict[str, Any]:
    """Replace the BPMN-derived Camunda/Zeebe extension map from XML.

    Other bpmn_meta keys may be user- or app-owned, so this helper only
    overwrites camunda_extensions_by_element_id.
    """
    meta = dict(current_meta) if isinstance(current_meta, dict) else {}
    meta["camunda_extensions_by_element_id"] = extract_camunda_extensions_from_bpmn_xml(str(xml_text or ""))
    return meta


def _refresh_child_session_bpmn_from_xml(child: Session, child_xml: str) -> bool:
    """Refresh child session XML plus BPMN-derived extension metadata.

    PRODUCT DECISION (official): the BPMN file is the source of truth.
    A reimport intentionally performs a FULL overwrite of the child
    session's ``bpmn_xml`` (and of the derived ``camunda_extensions_by_element_id``
    map). Manual UI edits made inside the subprocess — DI layout tweaks,
    ``pm:RobotMeta`` rows, camunda/zeebe properties edited through the UI —
    are LOST on the next reimport of the parent file. This is accepted and
    documented behavior.

    Guards: an empty ``child_xml`` never wipes anything (neither ``bpmn_xml``
    nor the extension map) — we only overwrite from real file content.
    """
    xml = str(child_xml or "")
    changed = False
    if xml and xml != str(getattr(child, "bpmn_xml", "") or ""):
        child.bpmn_xml = xml
        child.activity_count = _count_bpmn_activities(xml)
        changed = True

    if xml:
        next_meta = _bpmn_meta_with_fresh_camunda_extensions(getattr(child, "bpmn_meta", {}), xml)
        if next_meta != (getattr(child, "bpmn_meta", {}) or {}):
            child.bpmn_meta = next_meta
            changed = True

    return changed


def _bpmn_xml_parseable(xml_text: str) -> bool:
    """Return True only when the XML parses cleanly.

    Used as a safety gate before soft-deleting subprocess children:
    ``find_subprocess_elements`` swallows parse errors and returns [], so an
    unparseable/empty file must never be interpreted as "all subprocesses
    were removed".
    """
    raw = str(xml_text or "").strip()
    if not raw:
        return False
    try:
        ET.fromstring(raw)
    except Exception:
        return False
    return True


class SessionAccessDenied(HTTPException):
    def __init__(self):
        super().__init__(status_code=403, detail="Недостаточно прав для открытия этой сессии.")


def _request_context(request: Optional[Request] = None) -> Dict[str, Any]:
    if request is not None:
        user_id, is_admin = request_user_meta(request)
        org_id = request_active_org_id(request)
        return {"user_id": user_id, "is_admin": is_admin, "org_id": org_id}
    return {"user_id": None, "is_admin": None, "org_id": None}


def create_session(
    title: str,
    roles: List[str] | None = None,
    *,
    start_role: Optional[str] = None,
    prep_questions: Optional[List[Dict[str, Any]]] = None,
    project_id: Optional[str] = None,
    mode: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
) -> Dict[str, Any]:
    """Create a new session."""
    # roles приходит как Optional[Any] (legacy-контракт CreateSessionIn):
    # невалидные типы (bool/int/dict) раньше падали с TypeError → 500.
    # Нормализуем str → [str] и честно отвечаем 422 на мусор.
    if isinstance(roles, str):
        roles = [roles]
    elif roles is not None and not isinstance(roles, (list, tuple)):
        raise RequestValidationError(
            errors=[
                {
                    "loc": ("body", "roles"),
                    "msg": "roles must be an array of strings",
                    "type": "value_error",
                }
            ]
        )
    st = get_storage()
    sid = session_repo.create(
        title=title,
        roles=roles,
        start_role=start_role,
        project_id=project_id,
        mode=mode,
        user_id=user_id,
        org_id=org_id,
    )
    sess = session_repo.load(sid, user_id=user_id, org_id=org_id, is_admin=is_admin)
    if sess is None:
        raise RuntimeError("session not persisted")
    if prep_questions:
        sess.interview = {**(sess.interview or {}), "prep_questions": prep_questions}
        session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=is_admin)
    # Note: _session_api_dump is still in _legacy_main.py
    # Full extraction requires moving that helper first.
    import app._legacy_main as _lm
    sess = _recompute_session(sess)
    session_repo.save(sess, user_id=user_id, org_id=org_id, is_admin=is_admin)
    _lm._invalidate_session_caches(sess, org_id=org_id or getattr(sess, "org_id", "") or "")
    return _lm._session_api_dump(sess)


def _build_session_projection(row: Dict[str, Any]) -> Dict[str, Any]:
    import app._legacy_main as _lm
    sid = str(row.get("id") or "").strip()
    return session_cache.build_projection(
        sid,
        row,
        normalize_bpmn_meta=_lm._normalize_bpmn_meta,
        extract_publish_git_mirror=_lm._extract_publish_git_mirror,
        notes_decode=_lm._notes_decode,
    )


def get_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Load a single session by id (cached lightweight projection)."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")

    sid = str(session_id or "").strip()
    if not sid:
        raise_session_not_found(session_id)

    # Try cached projection first.
    cached = session_cache.get_projection(sid)
    if isinstance(cached, dict) and str(cached.get("id") or "").strip() == sid:
        return cached

    st = get_storage()
    row = st.load_session_projection(
        sid,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if not row:
        if not ctx_is_admin and ctx_user_id and ctx_org_id:
            candidate = st.load(sid, org_id=ctx_org_id, is_admin=True)
            if candidate:
                raise SessionAccessDenied()
        raise_session_not_found(session_id)

    projection = _build_session_projection(row)
    session_cache.set_projection(sid, projection)
    return projection


def list_sessions(
    query: Optional[str] = None,
    limit: int = 200,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    allowed_project_ids: Optional[List[str]] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """List sessions with optional filtering."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    items = session_repo.list_sessions(
        query=query,
        limit=min(max(int(limit), 1), 500),
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if allowed_project_ids:
        items = [
            item for item in items
            if str((item or {}).get("project_id") or "").strip() in allowed_project_ids
        ]
    return {"items": items, "count": len(items)}


def list_project_sessions(
    project_id: str,
    mode: Optional[str] = None,
    view: str = "full",
    *,
    root_only: bool = False,
    include_children_meta: bool = False,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """List sessions scoped to a project."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    if view == "summary":
        return session_repo.list_project_session_summaries(
            project_id=project_id,
            mode=mode,
            limit=500,
            user_id=ctx_user_id,
            org_id=ctx_org_id,
            is_admin=ctx_is_admin,
        )
    if root_only or include_children_meta:
        return session_repo.list_project_sessions(
            project_id=project_id,
            root_only=root_only,
            include_children_meta=include_children_meta,
            user_id=ctx_user_id,
            org_id=ctx_org_id,
            is_admin=ctx_is_admin,
        )
    rows = session_repo.list_sessions(
        query=None,
        limit=500,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    # Filter by project_id in memory (storage.list does not support project_id filter directly)
    rows = [r for r in rows if str((r or {}).get("project_id") or "").strip() == project_id]
    out = []
    import app._legacy_main as _lm
    for row in rows:
        if isinstance(row, dict):
            out.append(_lm._session_api_dump(Session.model_validate(row)))
    return out


def list_session_children(
    session_id: str,
    *,
    request: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Return immediate child sessions of a parent session."""
    ctx = _request_context(request)
    return session_repo.list_session_children(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )


def delete_session_api(session_id: str, request: Any = None):
    """Delete a session using workspace-content delete authz (org admin/owner + platform admin)."""
    import app._legacy_main as _lm
    return _lm.delete_session_api(session_id, request)


def delete_session(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> bool:
    """Delete a session."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    sess = session_repo.load(session_id, org_id=ctx_org_id, is_admin=True)
    if not sess:
        return False
    if not ctx_is_admin:
        owner_id = str(getattr(sess, "owner_user_id", "") or "").strip()
        if not ctx_user_id or not owner_id or owner_id != str(ctx_user_id or "").strip():
            raise HTTPException(status_code=403, detail="Только владелец сессии может её удалить.")
    deleted = session_repo.delete(
        session_id,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if deleted:
        try:
            from .._legacy_main import _broadcast_session_deleted
            _broadcast_session_deleted(session_id)
        except Exception:
            pass
    return deleted


# ── BPMN subdomain ────────────────────────────────────────────────

def bpmn_meta_get(session_id: str) -> Dict[str, Any]:
    """Get BPMN metadata for a session."""
    # CROSS-DOMAIN: depends on _collect_sequence_flow_meta, _normalize_bpmn_meta,
    # _enforce_gateway_tier_constraints in _legacy_main.py.
    # Full extraction requires migrating those helpers first.
    import app._legacy_main as _lm
    return _lm.session_bpmn_meta_get(session_id)


def bpmn_meta_patch(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Patch BPMN metadata."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write.
    import app._legacy_main as _lm
    return _lm.session_bpmn_meta_patch(session_id, inp, request)


def bpmn_meta_infer_rtiers(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Infer RTIers from BPMN meta."""
    # CROSS-DOMAIN: depends on infer_rtiers pipeline in _legacy_main.py.
    import app._legacy_main as _lm
    return _lm.session_bpmn_meta_infer_rtiers(session_id, inp, request)


def bpmn_export(
    session_id: str,
    *,
    raw: int = 0,
    include_overlay: int = 1,
    zoom: float = 1.0,
    pan_x: float = 0.0,
    pan_y: float = 0.0,
    request: Any = None,
) -> Any:
    """Export session BPMN XML (raw XML is Redis-cached)."""
    import app._legacy_main as _lm
    sid = str(session_id or "").strip()
    raw_mode = bool(int(raw or 0))

    if raw_mode and sid:
        cached_xml = session_cache.get_bpmn_raw(sid)
        if isinstance(cached_xml, str):
            return Response(content=cached_xml, media_type="application/xml")

    response = _lm.session_bpmn_export(
        session_id,
        raw=raw,
        include_overlay=include_overlay,
        zoom=zoom,
        pan_x=pan_x,
        pan_y=pan_y,
        request=request,
    )

    if raw_mode and sid and isinstance(response, Response):
        try:
            xml_body = response.body.decode("utf-8") if isinstance(response.body, bytes) else str(response.body or "")
            session_cache.set_bpmn_raw(sid, xml_body)
        except Exception as exc:
            logger.warning("bpmn_export: failed to cache raw XML for %s: %s", sid, exc)

    return response


def get_session_meta(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Return aggregated metadata for a session (versions/presence/notes/auto-pass).

    This is a single batched read intended to replace the parallel calls the
    canvas currently fires on open.
    """
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")

    sid = str(session_id or "").strip()
    if not sid:
        raise_session_not_found(session_id)

    cached = session_cache.get_meta(sid)
    if isinstance(cached, dict) and str(cached.get("session_id") or "").strip() == sid:
        return cached

    st = get_storage()
    row = st.load_session_projection(
        sid,
        user_id=ctx_user_id,
        org_id=ctx_org_id,
        is_admin=ctx_is_admin,
    )
    if not row:
        raise_session_not_found(session_id)

    session_org_id = str(row.get("org_id") or ctx_org_id or "").strip() or None
    projection = _build_session_projection(row)

    versions_count = st.count_bpmn_versions(sid, org_id=session_org_id)
    notes_count = st.count_note_threads(sid, org_id=session_org_id, status="open")

    # Include the latest BPMN version header for conflict detection (same shape as /bpmn/versions?limit=1).
    versions_payload: Dict[str, Any] = {}
    try:
        import app._legacy_main as _lm
        versions_payload = _lm.session_bpmn_versions_list(sid, request=None, limit=1, include_xml=0) or {}
    except Exception as exc:
        logger.warning("get_session_meta: versions list failed for %s: %s", sid, exc)

    active_users: List[Dict[str, Any]] = []
    try:
        active_users = list_session_presence(
            sid,
            org_id=session_org_id or "",
            project_id=str(row.get("project_id") or "").strip(),
            current_user_id=ctx_user_id or "",
        )
    except Exception as exc:
        logger.warning("get_session_meta: presence load failed for %s: %s", sid, exc)

    bpmn_meta = projection.get("bpmn_meta") or {}
    auto_pass_v1 = bpmn_meta.get("auto_pass_v1") or {}
    auto_pass_status = str(auto_pass_v1.get("status") or "").strip() or None

    version_items = versions_payload.get("items") or []
    latest_version = version_items[0] if version_items else None

    # Prefer the live session row for last-modified actor/timestamp; fall back to
    # the latest stored BPMN version snapshot if the row does not carry it.
    last_modified_by = str(
        row.get("diagram_last_write_actor_label")
        or row.get("diagram_last_write_actor_user_id")
        or (latest_version.get("created_by") if latest_version else "")
        or ""
    ).strip()
    last_modified_at = int(
        row.get("diagram_last_write_at")
        or (latest_version.get("created_at") if latest_version else 0)
        or 0
    )

    meta = {
        "session_id": sid,
        "versions_count": versions_count,
        "notes_count": notes_count,
        "presence_ttl_seconds": 60,
        "active_users": active_users,
        "auto_pass_status": auto_pass_status,
        "bpmn_xml_version": projection.get("bpmn_xml_version"),
        "diagram_state_version": projection.get("diagram_state_version"),
        "version": projection.get("version"),
        "last_modified_by": last_modified_by,
        "last_modified_at": last_modified_at,
        "versions": version_items,
        "items": version_items,
        "count": versions_payload.get("count") or versions_count,
        "user_facing_count": versions_payload.get("user_facing_count") or 0,
        "latest_user_facing_revision_number": versions_payload.get("latest_user_facing_revision_number") or 0,
        "current_session_payload_hash": versions_payload.get("current_session_payload_hash") or "",
        "latest_user_version_session_payload_hash": versions_payload.get("latest_user_version_session_payload_hash") or "",
        "has_session_changes_since_latest_bpmn_version": versions_payload.get("has_session_changes_since_latest_bpmn_version") or False,
        "latest_version": latest_version,
    }
    session_cache.set_meta(sid, meta)
    return meta


def get_session_graph(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Return only nodes/edges for a session (used by graph analysis / AI)."""
    import app._legacy_main as _lm
    return _lm.get_session_graph(
        session_id,
        user_id=user_id,
        org_id=org_id,
        is_admin=is_admin,
        request=request,
    )


def session_bpmn_save(session_id: str, inp: Any, request: Any = None) -> Dict[str, Any]:
    """Router-facing alias for bpmn_save that accepts request."""
    return bpmn_save(session_id, inp, request)


def bpmn_save(
    session_id: str,
    inp: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Save BPMN XML to session."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write,
    # _create_bpmn_revision_snapshot_if_needed, _resolve_base_diagram_state_version.
    import app._legacy_main as _lm
    out = _lm.session_bpmn_save(session_id, inp, request)
    if not out.get("ok"):
        return out

    # Hybrid auto-subprocess: an import/save must materialize every subprocess
    # so the imported diagram does not silently lose older subprocess children.
    #
    # The BPMN file is the source of truth: this also soft-deletes child
    # sessions whose subprocess element ids are absent from the imported file.
    # SAFETY: deletion (and the whole sync) runs ONLY when the imported XML
    # parses cleanly. If parsing fails or the subprocess list is unreliable
    # (exception path), NO deletion happens.
    #
    # Import itself already succeeded (ok:true stays). Sync failures are
    # logged at ERROR level and surfaced via out["subprocesses_sync_failed"]
    # so API consumers can detect a partial sync.
    try:
        xml = str(getattr(inp, "xml", "") or "")
        parse_ok = _bpmn_xml_parseable(xml)
        if parse_ok:
            s, oid, _scope = _lm._legacy_load_session_scoped(session_id, request)
            if s:
                summary = auto_create_subprocess_sessions(s, request, limit=None)
                total = summary["total"]
                soft_deleted_count = len(summary.get("soft_deleted") or []) + int(summary.get("nested_soft_deleted") or 0)
                if not total and not soft_deleted_count and not summary.get("nested_errors"):
                    # No subprocesses in the file and nothing stale deleted:
                    # keep legacy behavior (no meta writes, no response keys).
                    return out
                active = len(summary["created"]) + len(summary["restored"]) + len(summary["skipped_existing"])
                created = len(summary["created"]) + len(summary["restored"])
                has_more = active < total
                meta = dict(getattr(s, "bpmn_meta", None) or {})
                meta["subprocesses_total"] = total
                meta["subprocesses_created"] = created
                meta["subprocesses_has_more"] = has_more
                s.bpmn_meta = meta
                st = get_storage()
                st.save(s, is_admin=True)
                _lm._invalidate_session_caches(
                    s,
                    session_id=session_id,
                    org_id=getattr(s, "org_id", "") or oid or "",
                )
                out["subprocesses_total"] = total
                out["subprocesses_created"] = created
                out["subprocesses_has_more"] = has_more
                out["subprocesses_soft_deleted"] = soft_deleted_count
                if summary.get("nested_errors"):
                    out["subprocesses_sync_failed"] = True
                    out["subprocesses_sync_errors"] = int(summary["nested_errors"])
        else:
            logger.warning(
                "bpmn_save_auto_subprocess_skipped_unparseable: session_id=%s "
                "(subprocess sync and soft-delete skipped; import itself ok)",
                session_id,
            )
    except Exception as exc:
        logger.error(
            "bpmn_save_auto_subprocess_failed: session_id=%s error=%s",
            session_id,
            exc,
            exc_info=True,
        )
        out["subprocesses_sync_failed"] = True
        out["subprocesses_sync_errors"] = 1
    return out


# ─── P6 [Г]: multipart upload BPMN-файла в сессию ────────────────────────────
# Ревизия ранее принятого решения: вместо «POST create → PUT bpmn» отдельный
# endpoint POST /api/sessions/{id}/bpmn-upload с серверной проверкой
# расширения/Content-Type и лимитом 20МБ. Внутри — ТОТ ЖЕ путь сохранения,
# что и PUT /api/sessions/{id}/bpmn (bpmn_save → _legacy_main.session_bpmn_save);
# сам PUT не трогаем (он для canvas-save). CAS: upload — доверенный путь
# «импорт файла в свежесозданную сессию», поэтому base_diagram_state_version
# подставляется сервером из текущего состояния сессии.
BPMN_UPLOAD_MAX_BYTES = 20 * 1024 * 1024  # 20 МБ
BPMN_UPLOAD_ALLOWED_EXTENSIONS = (".bpmn", ".xml")


def _bpmn_upload_422(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


async def bpmn_upload(
    session_id: str,
    file: Any,
    request: Any = None,
) -> Dict[str, Any]:
    """Multipart upload .bpmn/.xml в сессию. Валидация до парсинга:
    расширение, Content-Type, размер ≤20МБ, UTF-8, well-formed XML, BPMN root.
    Ошибки — явные 422 (RU detail) / 413, а не generic 500."""
    filename = str(getattr(file, "filename", "") or "").strip()
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in BPMN_UPLOAD_ALLOWED_EXTENSIONS:
        raise _bpmn_upload_422(
            f"Недопустимый тип файла «{filename or 'без имени'}». Загрузите файл .bpmn или .xml."
        )
    content_type = str(getattr(file, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type and "xml" not in content_type and content_type != "application/octet-stream":
        raise _bpmn_upload_422(
            f"Недопустимый Content-Type «{content_type}». Ожидается XML-файл (.bpmn/.xml)."
        )

    data = await file.read(BPMN_UPLOAD_MAX_BYTES + 1)
    if len(data) > BPMN_UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Файл превышает лимит 20 МБ (получено {len(data)} байт).",
        )
    if not data or not data.strip():
        raise _bpmn_upload_422("Файл пустой.")
    try:
        xml_text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise _bpmn_upload_422("Файл не является текстовым XML (требуется кодировка UTF-8).")
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise _bpmn_upload_422(f"Файл не является корректным XML: {exc}.")
    root_tag = str(getattr(root, "tag", "") or "").lower()
    if "bpmn" not in root_tag and "definitions" not in root_tag:
        raise _bpmn_upload_422("XML не похож на BPMN: отсутствует корневой элемент bpmn:definitions.")

    import app._legacy_main as _lm
    from ..schemas.legacy_api import BpmnXmlIn

    sess, _oid, _scope = _lm._legacy_load_session_scoped(session_id, request)
    base_version = int(getattr(sess, "diagram_state_version", 0) or 0) if sess else None
    inp = BpmnXmlIn(
        xml=xml_text,
        source_action="bpmn_upload",
        import_note=f"Загружен файл {filename}",
        base_diagram_state_version=base_version,
    )
    return bpmn_save(session_id, inp, request)


def bpmn_versions_list(
    session_id: str,
    *,
    request: Any = None,
    limit: int = 10,
    offset: int = 0,
    include_xml: int = 0,
    include_technical: bool = False,
) -> Dict[str, Any]:
    """List BPMN version snapshots for a session (paginated)."""
    import app._legacy_main as _lm
    return _lm.session_bpmn_versions_list(
        session_id,
        request=request,
        limit=limit,
        offset=offset,
        include_xml=include_xml,
        include_technical=include_technical,
    )


def bpmn_version_detail(
    session_id: str,
    version_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Get a single BPMN version snapshot."""
    import app._legacy_main as _lm
    return _lm.session_bpmn_version_detail(session_id, version_id, request)


def bpmn_restore(
    session_id: str,
    version_id: str,
    inp: Any = None,
    request: Any = None,
) -> Dict[str, Any]:
    """Restore a BPMN version snapshot."""
    # CROSS-DOMAIN: depends on _latest_user_facing_bpmn_version,
    # _create_bpmn_revision_snapshot_if_needed, _mark_diagram_truth_write.
    import app._legacy_main as _lm
    return _lm.session_bpmn_restore(session_id, version_id, inp=inp, request=request)


def bpmn_clear(
    session_id: str,
    request: Any = None,
) -> Dict[str, Any]:
    """Clear BPMN XML from session."""
    # CROSS-DOMAIN: depends on _require_diagram_cas_or_409, _mark_diagram_truth_write.
    import app._legacy_main as _lm
    return _lm.session_bpmn_clear(session_id, request)


def overlays(session_id: str) -> Any:
    """Return lightweight JSON overlays for a session."""
    from ..overlay_cache import get_overlays_json
    return get_overlays_json(session_id)


# ── Node / Edge subdomain (PR-11 sessions-graph) ──────────────────

from ..utils.session_helpers import raise_session_not_found


def patch_node(session_id: str, node_id: str, inp, request=None) -> Dict[str, Any]:
    """Patch a single node in a session."""
    import app._legacy_main as _lm
    return _lm.patch_node(session_id, node_id, inp, request)


def add_node(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Add a new node to a session."""
    import app._legacy_main as _lm
    return _lm.add_node(session_id, inp, request)


def delete_node(session_id: str, node_id: str, request=None) -> Dict[str, Any]:
    """Delete a node (and incident edges) from a session."""
    import app._legacy_main as _lm
    return _lm.delete_node(session_id, node_id, request)


def add_edge(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Add a new edge to a session."""
    import app._legacy_main as _lm
    return _lm.add_edge(session_id, inp, request)


def delete_edge(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Delete an edge from a session."""
    import app._legacy_main as _lm
    return _lm.delete_edge(session_id, inp, request)


# ── Notes / Answers / AI subdomain (thin extraction) ──────────────

# These endpoints are large and deeply coupled to legacy helpers.
# They are thin-wrapped here so routers/sessions.py no longer needs
# to import _legacy_main for the HTTP surface.

def post_notes(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Save notes and run AI extraction."""
    import app._legacy_main as _lm
    return _lm.post_notes(session_id, inp, request)


def post_notes_extraction_apply(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Apply a note-extraction result to the session."""
    import app._legacy_main as _lm
    return _lm.post_notes_extraction_apply(session_id, inp, request)


def post_notes_extraction_preview(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Preview a note-extraction result without saving."""
    import app._legacy_main as _lm
    return _lm.post_notes_extraction_preview(session_id, inp, request)


def answer(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Apply an answer to a session question."""
    import app._legacy_main as _lm
    return _lm.answer(session_id, inp, request)


def answer_v2(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Apply an answer to a session question (v2)."""
    import app._legacy_main as _lm
    return _lm.answer_v2(session_id, inp, request)


def ai_questions(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Generate AI questions for a session."""
    import app._legacy_main as _lm
    return _lm.ai_questions(session_id, inp, request)


# ── Export subdomain (thin extraction) ────────────────────────────

def export(session_id: str) -> Dict[str, Any]:
    """Export session as JSON."""
    import app._legacy_main as _lm
    return _lm.export(session_id)


def export_zip(session_id: str):
    """Export session as ZIP."""
    import app._legacy_main as _lm
    return _lm.export_zip(session_id)


# ── Org-scoped reports subdomain (thin extraction) ────────────────

def list_org_session_report_versions(org_id: str, session_id: str, request=None, path_id: str = "", steps_hash: str = ""):
    """List report versions for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.list_org_session_report_versions(org_id, session_id, request, path_id, steps_hash)


def build_org_session_report(org_id: str, session_id: str, inp, request=None):
    """Build a report for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.build_org_session_report(org_id, session_id, inp, request)


def get_org_session_report_version(org_id: str, session_id: str, version_id: str, request=None, path_id: str = ""):
    """Get a specific report version for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.get_org_session_report_version(org_id, session_id, version_id, request, path_id)


def delete_org_session_report_version(org_id: str, session_id: str, version_id: str, request=None, path_id: str = ""):
    """Delete a report version for an org-scoped session."""
    import app._legacy_main as _lm
    return _lm.delete_org_session_report_version(org_id, session_id, version_id, request, path_id)


# ── Presence / TLDR / Analytics / Patch / Put / Recompute (thin) ──

def create_project_session(project_id: str, inp, mode: str = "quick_skeleton", request=None):
    """Create a session inside a project."""
    import app._legacy_main as _lm
    proj, oid, _ = _lm._legacy_load_project_scoped(project_id, request)
    if proj is None:
        raise HTTPException(status_code=404, detail="project not found")
    _lm._require_org_active_for_writes(request, oid)
    return _lm.create_project_session(project_id, inp, mode, request)


def touch_session_presence(session_id: str, inp, request=None):
    """Touch session presence."""
    import app._legacy_main as _lm
    return _lm.touch_session_presence_api(session_id, inp, request)


def leave_session_presence(session_id: str, inp, request=None):
    """Leave session presence."""
    import app._legacy_main as _lm
    return _lm.leave_session_presence_api(session_id, inp, request)


def get_session_tldr(session_id: str, request=None):
    """Get session TLDR."""
    import app._legacy_main as _lm
    return _lm.get_session_tldr(session_id, request)


def get_session_analytics(session_id: str, request=None):
    """Get session analytics."""
    import app._legacy_main as _lm
    return _lm.get_session_analytics(session_id, request)


def patch_session(session_id: str, inp, request=None):
    """Patch session metadata."""
    data = inp.model_dump(exclude_unset=True) if hasattr(inp, "model_dump") else dict(inp or {})
    if "status" in data:
        # Status transitions are handled by the dedicated status service. Allow
        # the same payload keys as the dedicated endpoint so existing callers
        # (e.g. workspace inline selects) keep working without surfacing a raw
        # STATUS_ONLY_ENDPOINT error.
        status_only_keys = {"status", "base_diagram_state_version", "reason"}
        if not set(data.keys()).issubset(status_only_keys):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "STATUS_ONLY_ENDPOINT",
                    "message": "status changes must use PATCH /api/sessions/{id}/status",
                },
            )
        from ..save_services.status_service import change_session_status
        return change_session_status(session_id, inp, request)
    import app._legacy_main as _lm
    return _lm.patch_session(session_id, inp, request)


def put_session(session_id: str, inp, request=None):
    """Replace session metadata."""
    import app._legacy_main as _lm
    return _lm.put_session(session_id, inp, request)


def recompute_session(session_id: str, request: Optional[Request] = None):
    """Recompute derived fields for a session."""
    import app._legacy_main as _lm
    from app.storage import get_storage, get_default_org_id
    from app.analytics_read_model import refresh_analytics_for_session

    sess, oid, _ = _lm._legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}
    sess = _recompute_session(sess)
    get_storage().save(sess)
    try:
        refresh_analytics_for_session(
            str(getattr(sess, "id", "") or session_id),
            str(getattr(sess, "org_id", "") or oid or get_default_org_id()),
        )
    except Exception:
        pass
    return sess.model_dump()


def _resolve_subprocess_title(xml_text: str, element_id: str) -> str:
    """Return a human-readable title for a subprocess/callActivity element.

    Falls back to a generic label when the BPMN element has no name.
    """
    name = get_element_name(xml_text, element_id) if xml_text and element_id else None
    return name or "Без названия"


def _subprocess_request_context(request: Optional[Request]):
    if request is None:
        return "", "", False
    auth_user = getattr(request.state, "auth_user", None) or {}
    if isinstance(auth_user, dict):
        uid = str(auth_user.get("id") or "").strip()
        admin = bool(auth_user.get("is_admin", False))
    else:
        uid = str(getattr(auth_user, "id", "") or "").strip()
        admin = bool(getattr(auth_user, "is_admin", False))
    oid = str(getattr(request.state, "active_org_id", "") or "").strip()
    return uid, oid, admin


def _resolve_child_bpmn_xml(
    parent_session: Session,
    element_id: str,
    called: Optional[str],
    request: Optional[Request],
) -> str:
    """Resolve the BPMN XML for a subprocess/call activity child session."""
    xml = str(getattr(parent_session, "bpmn_xml", "") or "").strip()
    project_id = str(getattr(parent_session, "project_id", "") or "").strip()
    child_xml = None

    uid, oid, admin = _subprocess_request_context(request)
    org_id = getattr(parent_session, "org_id", None)

    if called and project_id:
        candidates = session_repo.list_project_session_summaries(
            project_id, org_id=org_id
        )
        for c in candidates:
            meta = (c or {}).get("bpmn_meta") or {}
            if str(meta.get("process_id") or "").strip() == called:
                cand = session_repo.load(
                    str((c or {}).get("id") or ""),
                    user_id=uid,
                    org_id=org_id,
                    is_admin=admin,
                )
                if cand:
                    child_xml = str(getattr(cand, "bpmn_xml", "") or "").strip()
                    break

        if not child_xml:
            for c in candidates:
                cand = session_repo.load(
                    str((c or {}).get("id") or ""),
                    user_id=uid,
                    org_id=org_id,
                    is_admin=admin,
                )
                if cand and called in str(getattr(cand, "bpmn_xml", "") or ""):
                    child_xml = str(getattr(cand, "bpmn_xml", "") or "").strip()
                    break

    if not child_xml:
        child_xml = extract_subprocess_xml(xml, element_id)

    if not child_xml:
        raise HTTPException(status_code=404, detail="Subprocess BPMN not found")

    return child_xml


def _create_child_session(
    parent_session: Session,
    element_id: str,
    child_xml: str,
    request: Optional[Request],
) -> Session:
    """Create and persist a new child subprocess session."""
    uid, oid, admin = _subprocess_request_context(request)
    parent_id = str(getattr(parent_session, "id", "") or "").strip()
    project_id = str(getattr(parent_session, "project_id", "") or "").strip()

    parent_bpmn = str(getattr(parent_session, "bpmn_xml", "") or "").strip()
    called = called_element_id(parent_bpmn, element_id) if parent_bpmn else None
    title = _resolve_subprocess_title(parent_bpmn, element_id)

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    parent_title = str(getattr(parent_session, "title", "") or "").strip() or parent_id

    parent_stack = [dict(f) for f in (getattr(parent_session, "navigation_stack", []) or [])]
    if parent_stack:
        parent_stack[-1]["element_id_in_parent"] = element_id
        parent_stack[-1].setdefault("name", parent_title)
    else:
        parent_stack = [
            {
                "session_id": parent_id,
                "parent_session_id": "",
                "element_id_in_parent": element_id,
                "name": parent_title,
                "entered_at": now_iso,
            }
        ]

    navigation_stack = parent_stack + [
        {
            "session_id": "",
            "parent_session_id": parent_id,
            "element_id_in_parent": "",
            "name": title,
            "entered_at": now_iso,
        }
    ]

    child = session_repo.find_or_create_child_session(
        parent_session,
        element_id,
        child_xml,
        navigation_stack,
        title,
        user_id=uid,
        org_id=oid,
        is_admin=admin,
    )
    if _refresh_child_session_bpmn_from_xml(child, child_xml):
        child.updated_at = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        session_repo.save(child, user_id=uid, org_id=oid, is_admin=admin)
    if project_id:
        try:
            explorer_invalidate_sessions(project_id)
        except Exception:
            logger.exception("failed to invalidate explorer sessions cache for project %s", project_id)
    return child


def _build_child_navigation_stack(parent_session: Session, element_id: str) -> List[Dict[str, Any]]:
    """Build the navigation stack for a top-level child subprocess session."""
    parent_id = str(getattr(parent_session, "id", "") or "").strip()
    parent_title = str(getattr(parent_session, "title", "") or "").strip() or parent_id
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    parent_stack = [dict(f) for f in (getattr(parent_session, "navigation_stack", []) or [])]
    if parent_stack:
        parent_stack[-1]["element_id_in_parent"] = element_id
        parent_stack[-1].setdefault("name", parent_title)
    else:
        parent_stack = [
            {
                "session_id": parent_id,
                "parent_session_id": "",
                "element_id_in_parent": element_id,
                "name": parent_title,
                "entered_at": now_iso,
            }
        ]
    return parent_stack + [
        {
            "session_id": "",
            "parent_session_id": parent_id,
            "element_id_in_parent": "",
            "name": "",
            "entered_at": now_iso,
        }
    ]


# Maximum nesting depth for recursive subprocess session materialization.
# Guards against pathological/cyclic BPMN structures.
_SUBPROCESS_SYNC_MAX_DEPTH = 8


def auto_create_subprocess_sessions(
    parent_session: Session,
    request: Optional[Request] = None,
    limit: Optional[int] = 10,
    *,
    _depth: int = 0,
) -> Dict[str, Any]:
    """Create or restore child sessions for top-level subprocess elements.

    Nested subprocesses (a subprocess inside a subprocess) are materialized
    recursively from each child's fresh XML so that EVERY subprocess in the
    file gets a synced session ("BPMN file is the source of truth"), up to
    ``_SUBPROCESS_SYNC_MAX_DEPTH`` levels deep.

    Soft-delete safety: child sessions whose element ids are absent from the
    current XML are soft-deleted ONLY when the XML parses cleanly. On any
    parse problem nothing is deleted.

    Returns a summary dict with created/restored/skipped ids and total element count.
    """
    xml = str(getattr(parent_session, "bpmn_xml", "") or "")
    parse_ok = _bpmn_xml_parseable(xml)
    elements = find_subprocess_elements(xml) if parse_ok else []
    empty_summary = {
        "created": [],
        "restored": [],
        "skipped_existing": [],
        "total": 0,
        "soft_deleted": [],
        "nested_created": 0,
        "nested_soft_deleted": 0,
        "nested_errors": 0,
    }
    if not elements:
        if parse_ok:
            # The file legitimately contains zero (top-level) subprocesses:
            # every existing subprocess child is stale. Keep-list still covers
            # callActivity children (they materialize lazily via navigation).
            deletion = soft_delete_removed_subprocess_sessions(
                parent_session,
                find_child_session_element_ids(xml),
                request,
            )
            empty_summary["soft_deleted"] = deletion["soft_deleted"]
        return empty_summary

    uid, oid, admin = _subprocess_request_context(request)
    created = []
    restored = []
    skipped = []
    nested_created = 0
    nested_soft_deleted = 0
    nested_errors = 0

    selected = elements if limit is None else elements[:limit]
    for element in selected:
        element_id = element["id"]
        title = element["name"] or f"Подпроцесс: {element_id}"
        child_xml = extract_subprocess_xml(xml, element_id) or ""
        navigation_stack = _build_child_navigation_stack(parent_session, element_id)

        existing = session_repo.find_by_parent_element(
            parent_session.id,
            element_id,
            org_id=oid,
        )
        if existing:
            # Refresh the child XML from the freshly extracted parent fragment
            # so parent re-saves (e.g. BPMN import into an existing session)
            # propagate into existing child sessions instead of leaving stale
            # content behind.
            refreshed = _refresh_child_session_bpmn_from_xml(existing, child_xml)
            # Keep the child session title and breadcrumb name in sync with the
            # current BPMN element name so drill-in breadcrumbs never show stale
            # "Подпроцесс: ..." labels after a re-import.
            if str(getattr(existing, "title", "") or "").strip() != title:
                existing.title = title
                refreshed = True
            stack = list(getattr(existing, "navigation_stack", []) or [])
            if stack and str(stack[-1].get("name") or "").strip() != title:
                stack[-1]["name"] = title
                existing.navigation_stack = stack
                refreshed = True
            if getattr(existing, "deleted_at", 0):
                existing.deleted_at = 0
                existing.updated_at = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
                session_repo.save(existing, user_id=uid, org_id=oid, is_admin=admin)
                restored.append(str(existing.id))
            else:
                if refreshed:
                    existing.updated_at = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
                    session_repo.save(existing, user_id=uid, org_id=oid, is_admin=admin)
                skipped.append(str(existing.id))
            child_session = existing
        else:
            child = session_repo.find_or_create_child_session(
                parent_session,
                element_id,
                child_xml,
                navigation_stack,
                title,
                user_id=uid,
                org_id=oid,
                is_admin=admin,
            )
            if _refresh_child_session_bpmn_from_xml(child, child_xml):
                child.updated_at = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
                session_repo.save(child, user_id=uid, org_id=oid, is_admin=admin)
            created.append(str(child.id))
            child_session = child

        # Recurse: materialize/sync subprocesses nested inside this child
        # (grandchildren), so a reimport syncs the whole subprocess tree.
        if _depth + 1 < _SUBPROCESS_SYNC_MAX_DEPTH:
            try:
                nested = auto_create_subprocess_sessions(
                    child_session,
                    request,
                    limit=None,
                    _depth=_depth + 1,
                )
                nested_created += len(nested["created"]) + len(nested["restored"])
                nested_created += nested.get("nested_created", 0)
                nested_soft_deleted += len(nested.get("soft_deleted") or [])
                nested_soft_deleted += nested.get("nested_soft_deleted", 0)
                nested_errors += nested.get("nested_errors", 0)
            except Exception:
                nested_errors += 1
                logger.exception(
                    "auto_create_subprocess_sessions: nested sync failed parent=%s element=%s",
                    getattr(parent_session, "id", ""),
                    element_id,
                )

    # Soft-delete children whose subprocess element disappeared from the file.
    # parse_ok is guaranteed True here (we returned early otherwise), so the
    # element list is reliable and deletion is safe. The keep-list covers ALL
    # element types that materialize child sessions (subProcess + callActivity)
    # at any depth — conservative by design (may only ever delete less).
    deletion = soft_delete_removed_subprocess_sessions(
        parent_session,
        find_child_session_element_ids(xml),
        request,
    )

    return {
        "created": created,
        "restored": restored,
        "skipped_existing": skipped,
        "total": len(elements),
        "soft_deleted": deletion["soft_deleted"],
        "nested_created": nested_created,
        "nested_soft_deleted": nested_soft_deleted,
        "nested_errors": nested_errors,
    }


def soft_delete_removed_subprocess_sessions(
    parent_session: Session,
    current_element_ids: List[str],
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    """Soft-delete active child sessions whose subprocess element no longer exists."""
    uid, oid, admin = _subprocess_request_context(request)
    soft_deleted = session_repo.soft_delete_children_by_parent(
        parent_session.id,
        current_element_ids,
        user_id=uid,
        org_id=oid,
        is_admin=admin,
    )
    return {"soft_deleted": soft_deleted, "count": len(soft_deleted)}


def get_subprocesses_count(session_id: str, request: Optional[Request] = None) -> int:
    """Return the number of top-level subprocess elements in the session BPMN XML."""
    sess, scope, err = session_access_from_request(request, session_id)
    if err or sess is None:
        raise HTTPException(status_code=404, detail="not found")
    xml = str(getattr(sess, "bpmn_xml", "") or "")
    return len(find_subprocess_elements(xml))


def create_subprocess_sessions(
    session_id: str,
    request: Optional[Request] = None,
    *,
    load_all: bool = False,
) -> Dict[str, Any]:
    """Create child sessions for top-level subprocess elements on demand.

    First call creates up to 10 children and reports whether more exist.
    load_all=True creates all remaining children.
    """
    sess, scope, err = session_access_from_request(request, session_id)
    if err or sess is None:
        raise HTTPException(status_code=404, detail="not found")
    role = _org_role_for_request(request, sess.org_id) if request is not None else ""
    user = _request_auth_user(request) if request is not None else {}
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if not _can_edit_workspace(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")

    total = len(find_subprocess_elements(str(getattr(sess, "bpmn_xml", "") or "")))
    if total == 0:
        return {"created": 0, "total": 0, "has_more": False}

    limit = total if load_all else min(10, total)
    summary = auto_create_subprocess_sessions(sess, request, limit=limit)
    active_after = len(summary["created"]) + len(summary["restored"]) + len(summary["skipped_existing"])
    created = len(summary["created"]) + len(summary["restored"])
    has_more = active_after < total
    return {"created": created, "total": total, "has_more": has_more}


def _build_breadcrumbs(
    child_session: Session,
    request: Optional[Request],
) -> List[Dict[str, Any]]:
    """Build the navigation breadcrumb list with readable session names."""
    uid, oid, admin = _subprocess_request_context(request)
    org_id = getattr(child_session, "org_id", None)

    def _session_title(sess: Any) -> str:
        if isinstance(sess, dict):
            return str(sess.get("title") or "").strip()
        return str(getattr(sess, "title", "") or "").strip()

    breadcrumbs = [
        {
            "session_id": f["session_id"],
            "name": str(f.get("name") or "").strip(),
            "element_id": f.get("element_id_in_parent"),
        }
        for f in (getattr(child_session, "navigation_stack", []) or [])
    ]
    for crumb in breadcrumbs:
        if crumb["name"]:
            continue
        crumb_sess = session_repo.load(
            crumb["session_id"],
            user_id=uid,
            org_id=org_id,
            is_admin=admin,
        )
        crumb["name"] = _session_title(crumb_sess) if crumb_sess else ""
    return breadcrumbs


def navigate_to_subprocess(
    session_id: str,
    element_id: str,
    target_element_id: Optional[str] = None,
    request: Optional[Request] = None,
) -> Dict[str, Any]:
    sess, scope, err = session_access_from_request(request, session_id)
    if err:
        raise HTTPException(status_code=err.status_code, detail=err.body)

    uid, oid, admin = _subprocess_request_context(request)

    xml = str(getattr(sess, "bpmn_xml", "") or "").strip()
    if not xml:
        raise HTTPException(status_code=404, detail="Session has no BPMN diagram")

    el_type = element_type(xml, element_id)
    if el_type not in {"callactivity", "subprocess"}:
        raise HTTPException(status_code=400, detail="Element is not a subprocess or call activity")

    try:
        assert_unique_element_id(xml, element_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    subprocess_title = _resolve_subprocess_title(xml, element_id)

    called = called_element_id(xml, element_id) if el_type == "callactivity" else None

    def _xml_has_definitions(child_xml: str) -> bool:
        lower = child_xml.lower()
        return "<bpmn:definitions" in lower or "<definitions" in lower

    def _xml_has_minimal_di(child_xml: str) -> bool:
        lower = child_xml.lower()
        return "<bpmndi:bpmnshape" in lower or "<bpmndi:bpmnedge" in lower

    # Try existing child session
    existing = session_repo.find_by_parent_element(session_id, element_id, org_id=getattr(sess, "org_id", None))
    if existing:
        child_check, _, child_err = session_access_from_request(request, existing.id)
        if child_err:
            raise HTTPException(status_code=child_err.status_code, detail=child_err.body)
        child = child_check
        child_stored_xml = str(getattr(child, "bpmn_xml", "") or "").strip()

        # The BPMN file is the source of truth: re-extract the subprocess
        # fragment from the PARENT session's stored XML (same helpers as at
        # import time) and overwrite the child whenever it differs, so stale
        # pre-fix child sessions are healed on navigation instead of only
        # backfilling bpmn_meta from their own stale XML.
        parent_fragment = None
        try:
            parent_fragment = _resolve_child_bpmn_xml(sess, element_id, called, request)
        except HTTPException:
            parent_fragment = None

        if parent_fragment:
            child_xml = parent_fragment
        else:
            child_xml = child_stored_xml
            if not _xml_has_definitions(child_xml) or not _xml_has_minimal_di(child_xml):
                # Preserve the legacy error path: no parent fragment AND no
                # usable child XML -> 404.
                child_xml = _resolve_child_bpmn_xml(sess, element_id, called, request)
        if _refresh_child_session_bpmn_from_xml(child, child_xml):
            child.updated_at = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
            session_repo.save(child, user_id=uid, org_id=oid, is_admin=admin)
    else:
        child_xml = _resolve_child_bpmn_xml(sess, element_id, called, request)
        child = _create_child_session(sess, element_id, child_xml, request)

    # Heal the child's human-readable label and navigation stack from the
    # current parent XML. This fixes pre-existing child sessions created with
    # generic "Подпроцесс: ..." titles and keeps breadcrumbs accurate after
    # the parent BPMN is re-imported.
    child_needs_save = False
    if str(getattr(child, "title", "") or "").strip() != subprocess_title:
        child.title = subprocess_title
        child_needs_save = True
    stack = list(getattr(child, "navigation_stack", []) or [])
    if not stack:
        stack = _build_child_navigation_stack(sess, element_id)
        stack[-1]["session_id"] = str(getattr(child, "id", "") or "").strip()
        child_needs_save = True
    else:
        if str(stack[-1].get("name") or "").strip() != subprocess_title:
            stack[-1]["name"] = subprocess_title
            child_needs_save = True
        if not str(stack[-1].get("session_id") or "").strip():
            stack[-1]["session_id"] = str(getattr(child, "id", "") or "").strip()
            child_needs_save = True
    if child_needs_save:
        child.navigation_stack = stack
        child.updated_at = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
        session_repo.save(child, user_id=uid, org_id=oid, is_admin=admin)

    child_xml = str(getattr(child, "bpmn_xml", "") or "").strip()
    target_id = resolve_target_element_id(child_xml, target_element_id)
    breadcrumbs = _build_breadcrumbs(child, request)

    return {
        "subprocess_session_id": getattr(child, "id", ""),
        "subprocess_title": subprocess_title,
        "target_element_id": target_id,
        "breadcrumbs": breadcrumbs,
        "bpmn_xml": child_xml,
    }


def return_to_parent(subprocess_session_id: str, request: Optional[Request] = None) -> Dict[str, Any]:
    sess, scope, err = session_access_from_request(request, subprocess_session_id)
    if err:
        raise HTTPException(status_code=err.status_code, detail=err.body)

    stack = list(getattr(sess, "navigation_stack", []) or [])
    if len(stack) < 2:
        raise HTTPException(status_code=404, detail="No parent session in navigation stack")

    parent_frame = stack[-2]
    parent_session_id = str(parent_frame.get("session_id") or "").strip()
    element_id_in_parent = str(parent_frame.get("element_id_in_parent") or "").strip()
    if not parent_session_id:
        raise HTTPException(status_code=404, detail="Parent session not found")

    return {
        "parent_session_id": parent_session_id,
        "element_id_in_parent": element_id_in_parent,
    }
