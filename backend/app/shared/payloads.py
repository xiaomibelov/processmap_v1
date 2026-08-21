"""Core-shared pure helpers lifted verbatim from app._legacy_main (PR-5)."""
from __future__ import annotations

from ..models import Session
from typing import Any
from typing import Dict
from typing import List

__all__ = [
    "_set_latest_path_report_pointer",
    "_clear_latest_path_report_pointer",
    "_report_version_summary",
    "_report_version_detail_payload",
    "_workspace_needs_attention_count",
    "_workspace_parse_owner_ids",
    "_build_invite_link",
    "_pick_current_org_invite",
    "_with_invite_links",
]


def _set_latest_path_report_pointer(sess: Session, path_id: str, row_raw: Any) -> None:
    pid = str(path_id or "").strip()
    row = row_raw if isinstance(row_raw, dict) else {}
    if not pid:
        return
    interview = dict(getattr(sess, "interview", {}) or {})
    latest_raw = interview.get("path_reports")
    latest_by_path = dict(latest_raw) if isinstance(latest_raw, dict) else {}
    payload_normalized = row.get("payload_normalized") or row.get("report_json") or {}
    payload_raw = row.get("payload_raw")
    latest_by_path[pid] = {
        "id": str(row.get("id") or ""),
        "version": int(row.get("version") or 0),
        "steps_hash": str(row.get("steps_hash") or ""),
        "created_at": int(row.get("created_at") or 0),
        "status": str(row.get("status") or "error"),
        "model": str(row.get("model") or "deepseek-chat"),
        "prompt_template_version": str(row.get("prompt_template_version") or "v2"),
        "payload_normalized": payload_normalized,
        "payload_raw": payload_raw if payload_raw is not None else {},
        "report_json": payload_normalized,
        "raw_json": row.get("raw_json") or (payload_raw if isinstance(payload_raw, dict) else {}),
        "report_markdown": str(row.get("report_markdown") or row.get("raw_text") or ""),
        "recommendations": row.get("recommendations_json") or payload_normalized.get("recommendations") or [],
        "missing_data": row.get("missing_data_json") or payload_normalized.get("missing_data") or [],
        "risks": row.get("risks_json") or payload_normalized.get("risks") or [],
        "warnings": row.get("warnings_json") or [],
    }
    interview["path_reports"] = latest_by_path
    sess.interview = interview


def _clear_latest_path_report_pointer(sess: Session, path_id: str) -> None:
    pid = str(path_id or "").strip()
    if not pid:
        return
    interview = dict(getattr(sess, "interview", {}) or {})
    latest_raw = interview.get("path_reports")
    latest_by_path = dict(latest_raw) if isinstance(latest_raw, dict) else {}
    if pid in latest_by_path:
        latest_by_path.pop(pid, None)
    interview["path_reports"] = latest_by_path
    sess.interview = interview


def _report_version_summary(row_raw: Any) -> Dict[str, Any]:
    row = row_raw if isinstance(row_raw, dict) else {}
    error_message = str(row.get("error_message") or "").strip()
    return {
        "id": str(row.get("id") or ""),
        "version": int(row.get("version") or 0),
        "created_at": int(row.get("created_at") or 0),
        "status": str(row.get("status") or "error"),
        "steps_hash": str(row.get("steps_hash") or ""),
        "provider": "deepseek",
        "error": error_message or None,
        "model": str(row.get("model") or "deepseek-chat"),
        "prompt_template_version": str(row.get("prompt_template_version") or "v2"),
    }


def _report_version_detail_payload(row_raw: Any) -> Dict[str, Any]:
    found = row_raw if isinstance(row_raw, dict) else {}
    payload_normalized = found.get("payload_normalized") or found.get("report_json") or {}
    payload_raw = found.get("payload_raw")
    return {
        "id": str(found.get("id") or ""),
        "session_id": str(found.get("session_id") or ""),
        "path_id": str(found.get("path_id") or ""),
        "version": int(found.get("version") or 0),
        "steps_hash": str(found.get("steps_hash") or ""),
        "created_at": int(found.get("created_at") or 0),
        "status": str(found.get("status") or "error"),
        "model": str(found.get("model") or "deepseek-chat"),
        "prompt_template_version": str(found.get("prompt_template_version") or "v2"),
        "request_payload_json": found.get("request_payload_json") or {},
        "payload_normalized": payload_normalized,
        "payload_raw": payload_raw if payload_raw is not None else {},
        "report_json": payload_normalized,
        "raw_json": found.get("raw_json") or (payload_raw if isinstance(payload_raw, dict) else {}),
        "report_markdown": str(found.get("report_markdown") or found.get("raw_text") or ""),
        "recommendations_json": found.get("recommendations_json") or payload_normalized.get("recommendations") or [],
        "missing_data_json": found.get("missing_data_json") or payload_normalized.get("missing_data") or [],
        "risks_json": found.get("risks_json") or payload_normalized.get("risks") or [],
        "warnings_json": found.get("warnings_json") or [],
        "error_message": found.get("error_message"),
    }


def _workspace_needs_attention_count(interview_raw: Any) -> int:
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    candidates = [
        interview.get("needs_attention"),
        interview.get("needs_attention_count"),
        interview.get("attention_count"),
        interview.get("attention_total"),
        interview.get("missing_count"),
    ]
    for raw in candidates:
        try:
            value = int(raw or 0)
        except Exception:
            value = 0
        if value > 0:
            return value
    attention_items = interview.get("attention_items")
    if isinstance(attention_items, list):
        return len(attention_items)
    return 0


def _workspace_parse_owner_ids(raw: str) -> List[str]:
    out: List[str] = []
    for part in str(raw or "").split(","):
        value = str(part or "").strip()
        if value:
            out.append(value)
    return sorted(set(out))


def _build_invite_link(base_url: str, token: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    invite_token = str(token or "").strip()
    if not invite_token:
        return f"{base}/accept-invite" if base else "/accept-invite"
    return f"{base}/accept-invite?token={invite_token}"


def _pick_current_org_invite(items_raw: Any) -> Dict[str, Any]:
    rows = items_raw if isinstance(items_raw, list) else []
    for row_raw in rows:
        row = row_raw if isinstance(row_raw, dict) else {}
        status = str(row.get("status") or "").strip().lower()
        token = str(row.get("invite_key") or "").strip()
        if status == "pending" and token:
            return dict(row)
    return {}


def _with_invite_links(items_raw: Any, *, base_url: str) -> List[Dict[str, Any]]:
    rows = items_raw if isinstance(items_raw, list) else []
    out: List[Dict[str, Any]] = []
    for row_raw in rows:
        row = dict(row_raw or {}) if isinstance(row_raw, dict) else {}
        token = str(row.get("invite_key") or "").strip()
        status = str(row.get("status") or "").strip().lower()
        row["invite_link"] = _build_invite_link(base_url, token) if (token and status == "pending") else ""
        out.append(row)
    return out
