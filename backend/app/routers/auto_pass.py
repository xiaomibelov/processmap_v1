from __future__ import annotations

import uuid
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from .. import _legacy_main
from ..auto_pass_engine import compute_auto_pass_precheck, compute_auto_pass_v1
from ..auto_pass_jobs import (
    enqueue_job,
    ensure_worker_running,
    get_job_status,
    set_job_status,
)
from ..redis_lock import acquire_session_lock

router = APIRouter()


def _as_int(value: Any, default: int) -> int:
    try:
        if value is None:
            return int(default)
        return int(float(value))
    except Exception:
        return int(default)


def _normalize_limits(data: Dict[str, Any]) -> Dict[str, int]:
    return {
        "max_variants": max(1, min(_as_int(data.get("max_variants"), 500), 5000)),
        "max_steps": max(10, min(_as_int(data.get("max_steps"), 2000), 20000)),
        "max_visits_per_node": max(1, min(_as_int(data.get("max_visits_per_node"), 2), 10)),
    }


class AutoPassRunIn(BaseModel):
    mode: str = "all"
    max_variants: int = 500
    max_steps: int = 2000
    max_visits_per_node: int = 2


def _persist_auto_pass_result(
    *,
    session_id: str,
    org_id: str,
    user_id: str,
    result: Dict[str, Any],
) -> None:
    st = _legacy_main.get_storage()
    lock = acquire_session_lock(session_id, ttl_ms=15000)
    if not lock.acquired:
        raise RuntimeError("LOCK_BUSY")
    try:
        sess = st.load(session_id, org_id=(org_id or None), is_admin=True)
        if sess is None:
            raise RuntimeError("SESSION_NOT_FOUND")
        current_meta = _legacy_main._normalize_bpmn_meta(getattr(sess, "bpmn_meta", {}))
        current_meta["auto_pass_v1"] = result
        sess.bpmn_meta = _legacy_main._normalize_bpmn_meta(current_meta)
        sess.version = int(getattr(sess, "version", 0) or 0) + 1
        st.save(
            sess,
            user_id=user_id or str(getattr(sess, "updated_by", "") or ""),
            is_admin=True,
            org_id=(org_id or None),
        )
        _legacy_main._invalidate_session_caches(
            sess,
            session_id=session_id,
            org_id=org_id or getattr(sess, "org_id", "") or _legacy_main.get_default_org_id(),
        )
    finally:
        lock.release()


def _mark_auto_pass_running(
    *,
    session_id: str,
    org_id: str,
    user_id: str,
    run_id: str,
    mode: str,
    limits: Dict[str, int],
) -> None:
    st = _legacy_main.get_storage()
    lock = acquire_session_lock(session_id, ttl_ms=15000)
    if not lock.acquired:
        raise RuntimeError("LOCK_BUSY")
    try:
        sess = st.load(session_id, org_id=(org_id or None), is_admin=True)
        if sess is None:
            raise RuntimeError("SESSION_NOT_FOUND")
        current_meta = _legacy_main._normalize_bpmn_meta(getattr(sess, "bpmn_meta", {}))
        current_meta["auto_pass_v1"] = {
            "schema_version": "auto_pass_v1.1",
            "run_id": str(run_id or "").strip(),
            "status": "running",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "limits": {
                "mode": str(mode or "all").strip().lower() or "all",
                "max_variants": int(limits.get("max_variants", 500)),
                "max_steps": int(limits.get("max_steps", 2000)),
                "max_visits_per_node": int(limits.get("max_visits_per_node", 2)),
            },
            "summary": {
                "total_variants": 0,
                "total_variants_done": 0,
                "total_variants_failed": 0,
                "failed_reasons": {},
                "truncated": False,
            },
            "variants": [],
            "debug_failed_variants": [],
            "warnings": [],
        }
        sess.bpmn_meta = _legacy_main._normalize_bpmn_meta(current_meta)
        sess.version = int(getattr(sess, "version", 0) or 0) + 1
        st.save(
            sess,
            user_id=user_id or str(getattr(sess, "updated_by", "") or ""),
            is_admin=True,
            org_id=(org_id or None),
        )
        _legacy_main._invalidate_session_caches(
            sess,
            session_id=session_id,
            org_id=org_id or getattr(sess, "org_id", "") or _legacy_main.get_default_org_id(),
        )
    finally:
        lock.release()


def _run_auto_pass_for_job(job_payload: Dict[str, Any]) -> Dict[str, Any]:
    session_id = str(job_payload.get("session_id") or "").strip()
    org_id = str(job_payload.get("org_id") or "").strip()
    mode = str(job_payload.get("mode") or "all").strip().lower() or "all"
    limits = _normalize_limits(job_payload)
    user_id = str(job_payload.get("user_id") or "").strip()
    run_id = str(job_payload.get("run_id") or "").strip() or f"run_{uuid.uuid4().hex[:16]}"
    st = _legacy_main.get_storage()
    sess = st.load(session_id, org_id=(org_id or None), is_admin=True)
    if sess is None:
        raise RuntimeError("SESSION_NOT_FOUND")
    result = compute_auto_pass_v1(
        sess,
        mode=mode,
        max_variants=limits["max_variants"],
        max_steps=limits["max_steps"],
        max_visits_per_node=limits["max_visits_per_node"],
    )
    if isinstance(result, dict):
        result["run_id"] = run_id
        result["generated_at"] = str(result.get("generated_at") or datetime.now(timezone.utc).isoformat())
    retry_backoff_sec = [0.25, 0.6, 1.2, 2.0, 3.0]
    last_lock_exc: Optional[Exception] = None
    persisted = False
    for idx in range(len(retry_backoff_sec) + 1):
        try:
            _persist_auto_pass_result(
                session_id=session_id,
                org_id=org_id,
                user_id=user_id,
                result=result,
            )
            persisted = True
            break
        except RuntimeError as exc:
            if str(exc) != "LOCK_BUSY":
                raise
            last_lock_exc = exc
            if idx >= len(retry_backoff_sec):
                break
            time.sleep(retry_backoff_sec[idx])
    if not persisted and last_lock_exc is not None:
        raise last_lock_exc
    if str(result.get("status") or "").strip().lower() == "failed":
        raise RuntimeError("AUTO_PASS_NO_SUCCESSFUL_VARIANTS")
    return result


@router.post("/api/sessions/{session_id}/auto-pass")
def run_auto_pass(session_id: str, inp: AutoPassRunIn, request: Request) -> Dict[str, Any]:
    uid, _ = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    sess, oid, _ = _legacy_main._legacy_load_session_scoped(session_id, request)
    if not sess:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    mode = str(getattr(inp, "mode", "all") or "all").strip().lower() or "all"
    if mode != "all":
        return _legacy_main._enterprise_error(422, "validation_error", "mode must be all")
    precheck = compute_auto_pass_precheck(sess)
    if not bool(precheck.get("ok")):
        return _legacy_main._enterprise_error(
            422,
            str(precheck.get("code") or "NO_COMPLETE_PATH_TO_END"),
            str(precheck.get("message") or "No complete path reaches EndEvent of main process"),
        )
    limits = _normalize_limits(
        {
            "max_variants": getattr(inp, "max_variants", 500),
            "max_steps": getattr(inp, "max_steps", 2000),
            "max_visits_per_node": getattr(inp, "max_visits_per_node", 2),
        }
    )
    run_id = f"apr_{uuid.uuid4().hex[:20]}"
    try:
        _mark_auto_pass_running(
            session_id=str(session_id or "").strip(),
            org_id=str(oid or getattr(sess, "org_id", "") or _legacy_main.get_default_org_id()),
            user_id=str(uid or ""),
            run_id=run_id,
            mode=mode,
            limits=limits,
        )
    except Exception as exc:
        if str(exc) == "LOCK_BUSY":
            return _legacy_main._enterprise_error(423, "lock_busy", "Session is being updated, retry")
        raise
    job_id = f"ap_{uuid.uuid4().hex[:16]}"
    job_payload = {
        "job_id": job_id,
        "run_id": run_id,
        "session_id": str(session_id or "").strip(),
        "org_id": str(oid or getattr(sess, "org_id", "") or _legacy_main.get_default_org_id()),
        "user_id": str(uid or ""),
        "mode": mode,
        **limits,
    }
    set_job_status(
        job_id,
        {
            "status": "queued",
            "progress": 0,
            "session_id": str(session_id or "").strip(),
            "run_id": run_id,
            "mode": mode,
        },
    )
    ensure_worker_running(_run_auto_pass_for_job)
    if enqueue_job(job_payload):
        return {"job_id": job_id, "run_id": run_id, "status": "queued"}

    # Redis OFF fallback: compute synchronously in request lifecycle.
    set_job_status(
        job_id,
        {
            "status": "running",
            "progress": 30,
            "session_id": str(session_id or "").strip(),
            "run_id": run_id,
            "mode": mode,
        },
    )
    try:
        result = _run_auto_pass_for_job(job_payload)
    except Exception as exc:
        err_code = "auto_pass_failed"
        http_status = 500
        if str(exc) == "LOCK_BUSY":
            err_code = "lock_busy"
            http_status = 423
        elif str(exc) == "AUTO_PASS_NO_SUCCESSFUL_VARIANTS":
            err_code = "auto_pass_no_successful_variants"
            http_status = 422
        set_job_status(
            job_id,
            {
                "status": "failed",
                "progress": 100,
                "session_id": str(session_id or "").strip(),
                "run_id": run_id,
                "error": str(exc),
            },
        )
        return _legacy_main._enterprise_error(http_status, err_code, str(exc))
    set_job_status(
        job_id,
        {
            "status": "completed",
            "progress": 100,
            "session_id": str(session_id or "").strip(),
            "run_id": run_id,
            "result": result,
            "execution": "sync_fallback_no_redis",
        },
    )
    return {
        "job_id": job_id,
        "run_id": run_id,
        "status": "completed",
        "execution": "sync_fallback_no_redis",
        "result": result,
    }


@router.get("/api/sessions/{session_id}/auto-pass/precheck")
def auto_pass_precheck(session_id: str, request: Request) -> Dict[str, Any]:
    uid, _ = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    sess, _, _ = _legacy_main._legacy_load_session_scoped(session_id, request)
    if not sess:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    precheck = compute_auto_pass_precheck(sess)
    return {
        "ok": bool(precheck.get("ok")),
        "code": str(precheck.get("code") or ""),
        "message": str(precheck.get("message") or ""),
        "main_start_event_ids": precheck.get("main_start_event_ids") or [],
        "main_end_event_ids": precheck.get("main_end_event_ids") or [],
    }


@router.get("/api/sessions/{session_id}/auto-pass")
def auto_pass_status(
    session_id: str,
    request: Request,
    job_id: str = Query(default=""),
) -> Dict[str, Any]:
    uid, _ = _legacy_main._request_user_meta(request)
    if not uid:
        return _legacy_main._enterprise_error(401, "unauthorized", "unauthorized")
    sess, _, _ = _legacy_main._legacy_load_session_scoped(session_id, request)
    if not sess:
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    jid = str(job_id or "").strip()
    if not jid:
        return _legacy_main._enterprise_error(422, "validation_error", "job_id is required")
    status = get_job_status(jid)
    if not isinstance(status, dict):
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    status_session = str(status.get("session_id") or "").strip()
    if status_session and status_session != str(session_id or "").strip():
        return _legacy_main._enterprise_error(404, "not_found", "not_found")
    return status
