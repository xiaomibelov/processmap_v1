from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

from .error_events.domain import capture_backend_domain_invariant_violation
from .storage import list_error_events


def _as_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _normalize_limits(value: Any) -> Dict[str, Any]:
    data = _as_dict(value)
    mode = _as_text(data.get("mode") or "all").lower() or "all"
    return {
        "max_variants": max(1, min(_as_int(data.get("max_variants"), 500), 5000)),
        "max_steps": max(10, min(_as_int(data.get("max_steps"), 2000), 20000)),
        "max_visits_per_node": max(1, min(_as_int(data.get("max_visits_per_node"), 2), 10)),
        "mode": "all" if mode != "all" else mode,
    }


def _warning_codes(result: Mapping[str, Any]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in result.get("warnings") or []:
        code = ""
        if isinstance(item, dict):
            code = _as_text(item.get("code"))
        else:
            code = _as_text(item)
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out[:20]


def _auto_pass_failure_already_recorded(
    *,
    session_id: str,
    correlation_id: str,
    run_id: str,
    job_id: str,
    graph_hash: str,
    error_code: str,
) -> bool:
    sid = _as_text(session_id)
    if not sid:
        return False
    try:
        rows = list_error_events(
            session_id=sid,
            event_type="domain_invariant_violation",
            limit=100,
            order="desc",
        )
    except Exception:
        return False
    for row in rows:
        context = _as_dict(row.get("context_json"))
        if _as_text(context.get("domain")) != "auto_pass":
            continue
        if correlation_id and _as_text(row.get("correlation_id")) == correlation_id:
            return True
        if run_id and _as_text(context.get("run_id")) == run_id:
            return True
        if job_id and _as_text(context.get("job_id")) == job_id:
            return True
        if graph_hash and error_code:
            if (
                _as_text(context.get("graph_hash")) == graph_hash
                and _as_text(context.get("error_code")) == error_code
            ):
                return True
    return False


def capture_auto_pass_failed_state(
    result: Mapping[str, Any],
    *,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    route: Optional[str] = None,
    request_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    run_id: Optional[str] = None,
    job_id: Optional[str] = None,
    operation: str = "auto_pass_run",
    limits_fallback: Optional[Mapping[str, Any]] = None,
    dedupe: bool = False,
) -> Optional[Dict[str, Any]]:
    data = _as_dict(result)
    if _as_text(data.get("status")).lower() != "failed":
        return None

    sid = _as_text(session_id)
    err_code = _as_text(data.get("error_code") or "AUTO_PASS_FAILED") or "AUTO_PASS_FAILED"
    run = _as_text(data.get("run_id") or run_id)
    job = _as_text(data.get("job_id") or job_id)
    corr = _as_text(correlation_id or run or job)
    graph_hash = _as_text(data.get("graph_hash"))
    if dedupe and _auto_pass_failure_already_recorded(
        session_id=sid,
        correlation_id=corr,
        run_id=run,
        job_id=job,
        graph_hash=graph_hash,
        error_code=err_code,
    ):
        return None

    summary = _as_dict(data.get("summary"))
    failed_reasons = _as_dict(summary.get("failed_reasons"))
    limits = data.get("limits") if isinstance(data.get("limits"), dict) else limits_fallback
    route_text = _as_text(route) or (
        f"/api/sessions/{sid}/auto-pass" if sid else "/api/sessions/{session_id}/auto-pass"
    )
    return capture_backend_domain_invariant_violation(
        domain="auto_pass",
        invariant_name=err_code,
        message=f"AutoPass final semantic failure: {err_code}",
        severity="error",
        user_id=_as_text(user_id) or None,
        org_id=_as_text(org_id) or None,
        session_id=sid or None,
        project_id=_as_text(project_id) or None,
        route=route_text,
        request_id=_as_text(request_id) or None,
        correlation_id=corr or None,
        context_json={
            "operation": _as_text(operation) or "auto_pass_run",
            "job_id": job,
            "run_id": run,
            "error_code": err_code,
            "graph_hash": graph_hash,
            "limits": _normalize_limits(limits),
            "summary": {
                "total_variants": _as_int(summary.get("total_variants"), 0),
                "total_variants_done": _as_int(summary.get("total_variants_done"), 0),
                "total_variants_failed": _as_int(summary.get("total_variants_failed"), 0),
                "failed_reasons": failed_reasons,
                "truncated": bool(summary.get("truncated")),
            },
            "warning_codes": _warning_codes(data),
        },
    )
