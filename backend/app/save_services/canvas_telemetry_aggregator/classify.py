"""Классификация ошибок ленты канваса (feature/canvas-telemetry-feed).

error_class ∈ {ops_422, ops_409, network, timeout, non_finite_di, unknown}.
"""

from __future__ import annotations

from typing import Any, Dict

_NONFINITE_CODES = {
    "canvas_nonfinite_render_error",
    "non_finite_di_blocked",
    "di_import_healed",
}

_TIMEOUT_LATENCY_MS = 10_000


def classify_event(event: Dict[str, Any]) -> str:
    http = event.get("http") if isinstance(event.get("http"), dict) else {}
    error = event.get("error") if isinstance(event.get("error"), dict) else {}
    status = int(http.get("status") or 0)
    latency = int(http.get("latencyMs") or 0)
    code = str(error.get("code") or "").strip()

    if code in _NONFINITE_CODES:
        return "non_finite_di"
    if status == 422 or code == "OPERATION_UNSUPPORTED":
        return "ops_422"
    if status == 409 or code == "DIAGRAM_STATE_CONFLICT":
        return "ops_409"
    if latency >= _TIMEOUT_LATENCY_MS:
        return "timeout"
    if status == 0 and isinstance(event.get("http"), dict):
        return "network"
    return "unknown"


def error_fingerprint(event: Dict[str, Any]) -> Dict[str, str]:
    """Ключ группы витрины + человекочитаемые поля."""
    error = event.get("error") if isinstance(event.get("error"), dict) else {}
    return {
        "error_class": classify_event(event),
        "error_code": str(error.get("code") or "")[:128],
        "op_type": str(error.get("opType") or "")[:128],
        "op_id": str(error.get("opId") or "")[:128],
        "message": str(error.get("reason") or error.get("message") or "")[:256],
    }
