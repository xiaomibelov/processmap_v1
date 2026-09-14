"""Документы сессии: attach/list/get/detach (feature/session-doc-attachments).

Контракт: .planning/contours/feature/session-doc-attachments/API.md.
Авторизация — org-scoped load сессии (404 session_not_found / 403 session_forbidden),
глобальный auth_guard даёт 401.
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile

from ..services.session_docs_service import (
    SESSION_DOC_MAX_BYTES,
    attach_document,
    detach_document,
    doc_to_detail,
    doc_to_list_item,
    get_session_document,
    list_session_documents,
    require_session_access,
)
from ..sessions_graph import _request_context

router = APIRouter(tags=["sessions"])


@router.post("/api/sessions/{session_id}/docs")
async def session_docs_attach(
    session_id: str,
    request: Request,
    response: Response,
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    ctx = _request_context(request)
    sess = require_session_access(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    filename = str(getattr(file, "filename", "") or "").strip()
    data = await file.read(SESSION_DOC_MAX_BYTES + 1)
    result = attach_document(
        org_id=str(getattr(sess, "org_id", "") or ctx.get("org_id") or "org_default"),
        session_id=session_id,
        sess=sess,
        filename=filename,
        data=data,
        user_id=str(ctx.get("user_id") or ""),
    )
    response.status_code = 201
    return result


@router.get("/api/sessions/{session_id}/docs")
def session_docs_list(session_id: str, request: Request) -> Dict[str, Any]:
    ctx = _request_context(request)
    require_session_access(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    org_id = str(ctx.get("org_id") or "org_default")
    docs = [doc_to_list_item(d) for d in list_session_documents(org_id, session_id)]
    return {"docs": docs}


@router.get("/api/sessions/{session_id}/docs/{doc_id}")
def session_docs_get(session_id: str, doc_id: str, request: Request) -> Dict[str, Any]:
    ctx = _request_context(request)
    require_session_access(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    org_id = str(ctx.get("org_id") or "org_default")
    doc = get_session_document(org_id, session_id, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail={"error": "doc_not_found", "doc_id": doc_id})
    return doc_to_detail(doc)


@router.delete("/api/sessions/{session_id}/docs/{doc_id}", status_code=204)
def session_docs_detach(session_id: str, doc_id: str, request: Request) -> Response:
    ctx = _request_context(request)
    require_session_access(
        session_id,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    org_id = str(ctx.get("org_id") or "org_default")
    detach_document(org_id, session_id, doc_id)
    return Response(status_code=204)
