"""HTTP-клиент к монолиту: проекция сессии с пробросом JWT пользователя.

Base URL — env MONOLITH_INTERNAL_URL (дефолт http://api:8000). Все вызовы
сервис→монолит несут Authorization: Bearer <user-jwt> — org-scoped guard'ы
монолита работают без изменений, service-token с обходом авторизации не вводим
(решение владельца, план 0.3/Phase 2).
"""
from __future__ import annotations

import os
from typing import Any, Dict

import httpx

DEFAULT_TIMEOUT_SEC = 30


class MonolithError(Exception):
    """Монолит недоступен или вернул не-200/не-ok — роутер отдаёт честный 502."""


def _base_url() -> str:
    return str(os.environ.get("MONOLITH_INTERNAL_URL") or "http://api:8000").strip().rstrip("/")


def _headers(token: str) -> Dict[str, str]:
    headers = {"Accept": "application/json"}
    if str(token or "").strip():
        headers["Authorization"] = f"Bearer {str(token).strip()}"
    return headers


def get_projection(session_id: str, *, token: str = "", timeout_sec: int = DEFAULT_TIMEOUT_SEC) -> Dict[str, Any]:
    """GET /api/sessions/{id}/agent/projection → {ok, projection, projection_digest, rev}."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/agent/projection"
    try:
        resp = httpx.get(url, headers=_headers(token), timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise MonolithError(f"monolith projection HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith projection invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict) or not data.get("ok"):
        raise MonolithError("monolith projection not ok")
    return data


def search_rag(
    q: str,
    session_id: str,
    token: str,
    *,
    source_type: str = "",
    top_k: int = 5,
    min_score: float = 0.1,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """GET /api/rag/search → {ok, results[]} with JWT propagation."""
    sid = str(session_id or "").strip()
    query = str(q or "").strip()
    params: Dict[str, Any] = {"q": query, "top_k": max(1, int(top_k)), "session_id": sid}
    if source_type:
        params["source_type"] = str(source_type)
    if min_score is not None:
        params["min_score"] = float(min_score)
    url = f"{_base_url()}/api/rag/search"
    try:
        resp = httpx.get(url, headers=_headers(token), params=params, timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise MonolithError(f"monolith rag/search HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith rag/search invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith rag/search invalid root")
    return data


def get_operation_catalog(code: str, *, token: str = "", timeout_sec: int = DEFAULT_TIMEOUT_SEC) -> Dict[str, Any]:
    """GET /api/operation-catalog/{code} → operation details."""
    url = f"{_base_url()}/api/operation-catalog/{str(code).strip()}"
    try:
        resp = httpx.get(url, headers=_headers(token), timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith operation_catalog invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith operation_catalog invalid root")
    data["_http_status"] = resp.status_code
    return data


def get_session(session_id: str, *, token: str = "", timeout_sec: int = DEFAULT_TIMEOUT_SEC) -> Dict[str, Any]:
    """GET /api/sessions/{id} → session row with diagram_state_version."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}"
    try:
        resp = httpx.get(url, headers=_headers(token), timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    if resp.status_code != 200:
        raise MonolithError(f"monolith get_session HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith get_session invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith get_session invalid root")
    return data


def _json_headers(token: str) -> Dict[str, str]:
    headers = _headers(token)
    headers["Content-Type"] = "application/json"
    return headers


def patch_node(
    session_id: str,
    node_id: str,
    token: str,
    fields: Dict[str, Any],
    *,
    base_diagram_state_version: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """POST /api/sessions/{id}/nodes/{node_id} — update node with CAS."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/nodes/{str(node_id).strip()}"
    body = dict(fields)
    if base_diagram_state_version is not None:
        body["base_diagram_state_version"] = int(base_diagram_state_version)
    try:
        resp = httpx.post(url, headers=_json_headers(token), json=body, timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith patch_node invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith patch_node invalid root")
    data["_http_status"] = resp.status_code
    return data


def add_node(
    session_id: str,
    token: str,
    node: Dict[str, Any],
    *,
    base_diagram_state_version: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """POST /api/sessions/{id}/nodes — add node with CAS."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/nodes"
    body = dict(node)
    if base_diagram_state_version is not None:
        body["base_diagram_state_version"] = int(base_diagram_state_version)
    try:
        resp = httpx.post(url, headers=_json_headers(token), json=body, timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith add_node invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith add_node invalid root")
    data["_http_status"] = resp.status_code
    return data


def delete_node(
    session_id: str,
    node_id: str,
    token: str,
    *,
    base_diagram_state_version: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """DELETE /api/sessions/{id}/nodes/{node_id} — delete node with CAS."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/nodes/{str(node_id).strip()}"
    params: Dict[str, Any] = {}
    if base_diagram_state_version is not None:
        params["base_diagram_state_version"] = int(base_diagram_state_version)
    try:
        resp = httpx.delete(url, headers=_headers(token), params=params, timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith delete_node invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith delete_node invalid root")
    data["_http_status"] = resp.status_code
    return data


def add_edge(
    session_id: str,
    token: str,
    edge: Dict[str, Any],
    *,
    base_diagram_state_version: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """POST /api/sessions/{id}/edges — add edge with CAS."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/edges"
    body = dict(edge)
    if base_diagram_state_version is not None:
        body["base_diagram_state_version"] = int(base_diagram_state_version)
    try:
        resp = httpx.post(url, headers=_json_headers(token), json=body, timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith add_edge invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith add_edge invalid root")
    data["_http_status"] = resp.status_code
    return data


def delete_edge(
    session_id: str,
    token: str,
    edge: Dict[str, Any],
    *,
    base_diagram_state_version: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """DELETE /api/sessions/{id}/edges — delete edge with CAS."""
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/edges"
    body = dict(edge)
    if base_diagram_state_version is not None:
        body["base_diagram_state_version"] = int(base_diagram_state_version)
    try:
        resp = httpx.request("DELETE", url, headers=_json_headers(token), json=body, timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    try:
        data = resp.json()
    except Exception as exc:
        raise MonolithError(f"monolith delete_edge invalid json: {exc.__class__.__name__}") from exc
    if not isinstance(data, dict):
        raise MonolithError("monolith delete_edge invalid root")
    data["_http_status"] = resp.status_code
    return data


def create_bpmn_version_snapshot(
    session_id: str,
    token: str,
    *,
    source_action: str = "agent_edit",
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """POST /api/sessions/{id}/bpmn/versions — create snapshot before applying edits.

    Монолитный endpoint create_bpmn_version_snapshot требует bpmn_xml;
    публичный /bpmn/versions принимает xml. Если публичный endpoint недоступен,
    fallback: возвращаем пустой dict и продолжаем (audit остаётся, откат через history).
    """
    url = f"{_base_url()}/api/sessions/{str(session_id).strip()}/bpmn/versions"
    body = {"xml": "", "source_action": str(source_action or "agent_edit")}
    try:
        resp = httpx.post(url, headers=_json_headers(token), json=body, timeout=max(1, int(timeout_sec or DEFAULT_TIMEOUT_SEC)))
    except Exception as exc:
        raise MonolithError(f"monolith unreachable: {exc.__class__.__name__}: {exc}") from exc
    try:
        data = resp.json()
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    data["_http_status"] = resp.status_code
    return data
