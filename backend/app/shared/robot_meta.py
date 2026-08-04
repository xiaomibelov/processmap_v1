"""Core-shared pure helpers lifted verbatim from app._legacy_main (PR-5)."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any
from typing import Dict
from typing import Optional
from typing import Set

__all__ = [
    "_robot_meta_as_text",
    "_robot_meta_as_nullable_text",
    "_robot_meta_as_non_negative_int",
    "_robot_meta_as_nullable_non_negative_int",
    "_stable_robot_meta_value",
    "_normalize_robot_meta_v1",
    "_normalize_robot_meta_map",
    "_is_legacy_seed_bpmn",
]


def _robot_meta_as_text(value: Any) -> str:
    return str(value or "").strip()


def _robot_meta_as_nullable_text(value: Any) -> Optional[str]:
    text = _robot_meta_as_text(value)
    return text or None


def _robot_meta_as_non_negative_int(value: Any, fallback: int) -> int:
    try:
        num = int(round(float(value)))
    except Exception:
        num = int(fallback)
    return max(num, 0)


def _robot_meta_as_nullable_non_negative_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        num = int(round(float(value)))
    except Exception:
        return None
    return max(num, 0)


def _stable_robot_meta_value(value: Any) -> Any:
    if isinstance(value, list):
        return [_stable_robot_meta_value(item) for item in value]
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key in sorted(value.keys(), key=lambda x: str(x)):
            out[str(key)] = _stable_robot_meta_value(value[key])
        return out
    return value


def _normalize_robot_meta_v1(entry_raw: Any) -> Optional[Dict[str, Any]]:
    entry = entry_raw if isinstance(entry_raw, dict) else {}
    exec_raw = entry.get("exec") if isinstance(entry.get("exec"), dict) else {}
    retry_raw = exec_raw.get("retry") if isinstance(exec_raw.get("retry"), dict) else {}
    mat_raw = entry.get("mat") if isinstance(entry.get("mat"), dict) else {}
    qc_raw = entry.get("qc") if isinstance(entry.get("qc"), dict) else {}

    mode = str(exec_raw.get("mode") or "").strip().lower()
    if mode not in {"human", "machine", "hybrid"}:
        mode = "human"

    executor = _robot_meta_as_text(exec_raw.get("executor") or "manual_ui") or "manual_ui"
    action_key = _robot_meta_as_nullable_text(exec_raw.get("action_key"))
    timeout_sec = _robot_meta_as_nullable_non_negative_int(exec_raw.get("timeout_sec"))
    max_attempts = _robot_meta_as_non_negative_int(retry_raw.get("max_attempts"), 1)
    backoff_sec = _robot_meta_as_non_negative_int(retry_raw.get("backoff_sec"), 0)

    inputs = entry_raw.get("mat", {}).get("inputs") if isinstance(entry_raw, dict) and isinstance(entry_raw.get("mat"), dict) else None
    outputs = entry_raw.get("mat", {}).get("outputs") if isinstance(entry_raw, dict) and isinstance(entry_raw.get("mat"), dict) else None
    checks = qc_raw.get("checks")

    return {
        "robot_meta_version": "v1",
        "exec": {
            "mode": mode,
            "executor": executor,
            "action_key": action_key,
            "timeout_sec": timeout_sec,
            "retry": {
                "max_attempts": max_attempts,
                "backoff_sec": backoff_sec,
            },
        },
        "mat": {
            "from_zone": _robot_meta_as_nullable_text(mat_raw.get("from_zone")),
            "to_zone": _robot_meta_as_nullable_text(mat_raw.get("to_zone")),
            "inputs": _stable_robot_meta_value(inputs) if isinstance(inputs, list) else [],
            "outputs": _stable_robot_meta_value(outputs) if isinstance(outputs, list) else [],
        },
        "qc": {
            "critical": bool(qc_raw.get("critical")),
            "checks": _stable_robot_meta_value(checks) if isinstance(checks, list) else [],
        },
    }


def _normalize_robot_meta_map(
    value: Any,
    *,
    allowed_node_ids: Optional[Set[str]] = None,
) -> Dict[str, Dict[str, Any]]:
    raw = value if isinstance(value, dict) else {}
    out: Dict[str, Dict[str, Any]] = {}
    for element_id_raw in sorted(raw.keys(), key=lambda x: str(x)):
        element_id = str(element_id_raw or "").strip()
        if not element_id:
            continue
        if allowed_node_ids is not None and element_id not in allowed_node_ids:
            continue
        normalized_entry = _normalize_robot_meta_v1(raw.get(element_id_raw))
        if not normalized_entry:
            continue
        out[element_id] = normalized_entry
    return out


def _is_legacy_seed_bpmn(xml_text: str) -> bool:
    raw = (xml_text or "").strip()
    if not raw:
        return False
    try:
        root = ET.fromstring(raw)
    except Exception:
        return False

    def _ln(tag: str) -> str:
        if "}" in tag:
            return tag.rsplit("}", 1)[-1].lower()
        return tag.lower()

    counts: Dict[str, int] = {}
    for el in root.iter():
        name = _ln(str(getattr(el, "tag", "") or ""))
        counts[name] = counts.get(name, 0) + 1

    start_n = counts.get("startevent", 0)
    end_n = counts.get("endevent", 0)
    flow_n = counts.get("sequenceflow", 0)
    task_n = sum(counts.get(k, 0) for k in ("task", "usertask", "servicetask", "manualtask", "scripttask", "businessruletask", "sendtask", "receivetask"))
    gw_n = sum(counts.get(k, 0) for k in ("exclusivegateway", "parallelgateway", "inclusivegateway", "eventbasedgateway"))
    sub_n = counts.get("subprocess", 0) + counts.get("callactivity", 0)

    if start_n == 1 and end_n == 1 and gw_n == 0 and sub_n == 0:
        if task_n == 0 and flow_n <= 1:
            return True
        # Old frontend seed: Start -> "Опишите первый шаг процесса" -> End.
        if task_n == 1 and flow_n <= 2 and "опишите первый шаг процесса" in raw.lower():
            return True
    return False
