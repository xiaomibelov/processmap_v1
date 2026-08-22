from __future__ import annotations

import math
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Set, Tuple


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _to_array(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    return []


def _as_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _to_non_negative_int(value: Any) -> int:
    try:
        n = float(value)
    except Exception:
        return 0
    if not math.isfinite(n) or n < 0:
        return 0
    return int(round(n))


def _pick_positive_int(*values: Any) -> int:
    for value in values:
        n = _to_non_negative_int(value)
        if n > 0:
            return n
    return 0


def _pick_non_negative_int(*values: Any) -> int:
    for value in values:
        n = _to_non_negative_int(value)
        if n > 0:
            return n
    return 0


def _get_in(obj: Any, *keys: str, default: Any = None) -> Any:
    current: Any = obj
    for key in keys:
        if current is None:
            return default
        if isinstance(current, dict):
            current = current.get(key, default)
        else:
            current = getattr(current, key, default)
    return current if current is not None else default


def _percent(part: int, total: int) -> int:
    if total <= 0:
        return 0
    return int(round((part / total) * 100))


def _round1(value: float) -> float:
    return round(value, 1)


def _normalize_loose(value: Any) -> str:
    return _text(value).lower().replace("_", " ").replace("-", " ")


def _normalize_tier(value: Any) -> str:
    tier = _text(value).upper()
    return tier if tier in ("P0", "P1", "P2") else "None"


def _seq_label(step: Dict[str, Any], index: int) -> str:
    return _text(step.get("seq_label") or step.get("seq") or step.get("order_index") or step.get("order") or str(index + 1))


def _step_title(step: Dict[str, Any]) -> str:
    return _text(step.get("action") or step.get("title") or f"Шаг {step.get('order_index', '')}").strip() or "Шаг"


def _step_lane(step: Dict[str, Any]) -> Tuple[str, str]:
    name = _text(
        step.get("lane_name")
        or step.get("lane")
        or step.get("role")
        or step.get("area")
        or step.get("lane_id")
        or step.get("laneId")
    ) or "unassigned"
    key = _text(step.get("lane_key") or step.get("lane_id") or step.get("laneId")) or _normalize_loose(name)
    return (key or "unassigned", name)


def _step_type(step: Dict[str, Any]) -> str:
    return _text(step.get("type") or step.get("nodeType") or step.get("node_type") or "operation") or "operation"


def _step_subprocess_title(step: Dict[str, Any]) -> str:
    return _text(step.get("subprocess") or step.get("subprocess_name") or step.get("subprocessName"))


def _bpmn_ref(step: Dict[str, Any]) -> str:
    return _text(step.get("bpmn_ref") or step.get("node_id") or step.get("nodeId") or step.get("node_bind_id"))


def _parse_work_duration_sec(step: Dict[str, Any]) -> int:
    sec = _pick_positive_int(
        step.get("work_duration_sec"),
        step.get("workDurationSec"),
        step.get("duration_sec"),
        step.get("durationSec"),
        step.get("step_time_sec"),
        step.get("stepTimeSec"),
    )
    if sec > 0:
        return sec
    min_val = _pick_positive_int(
        step.get("duration_min"),
        step.get("durationMin"),
        step.get("step_time_min"),
        step.get("stepTimeMin"),
    )
    if min_val > 0:
        return min_val * 60
    return 0


def _parse_wait_duration_sec(step: Dict[str, Any]) -> int:
    sec = _pick_positive_int(
        step.get("wait_duration_sec"),
        step.get("waitDurationSec"),
        step.get("wait_sec"),
        step.get("waitSec"),
    )
    if sec > 0:
        return sec
    min_val = _pick_positive_int(
        step.get("wait_min"),
        step.get("waitMin"),
    )
    if min_val > 0:
        return min_val * 60
    return 0


def _collect_steps(session: Any) -> List[Dict[str, Any]]:
    interview = _as_object(_get_in(session, "interview"))
    raw_steps = _to_array(interview.get("steps"))
    if not raw_steps and hasattr(session, "nodes"):
        raw_steps = _to_array(_get_in(session, "nodes"))

    steps: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    for idx, raw in enumerate(raw_steps):
        step = _as_object(raw)
        step_id = _text(step.get("id")) or f"step_{idx + 1}"
        if step_id in seen_ids:
            continue
        seen_ids.add(step_id)
        work_sec = _parse_work_duration_sec(step)
        wait_sec = _parse_wait_duration_sec(step)
        bpmn_ref = _bpmn_ref(step)
        lane_key, lane_name = _step_lane(step)
        steps.append(
            {
                "id": step_id,
                "seq": _seq_label(step, idx),
                "title": _step_title(step),
                "work_sec": work_sec,
                "wait_sec": wait_sec,
                "lead_sec": work_sec + wait_sec,
                "bpmn_ref": bpmn_ref,
                "lane_key": lane_key,
                "lane_name": lane_name,
                "type": _step_type(step),
                "subprocess": _step_subprocess_title(step),
                "tier": _normalize_tier(step.get("tier")),
                "ai_count": 0,
                "ai_done_count": 0,
            }
        )
    return steps


def _collect_ai_items(session: Any) -> Tuple[List[Dict[str, Any]], Set[str]]:
    interview = _as_object(_get_in(session, "interview"))
    items: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    covered_step_ids: Set[str] = set()

    def _add_item(source_id: str, raw: Any, scope: str) -> None:
        item = _as_object(raw)
        text = _text(item.get("text") or item.get("question") or item.get("label"))
        qid = _text(item.get("qid") or item.get("id") or item.get("question_id") or item.get("questionId"))
        if not text and not qid:
            return
        key = f"{qid}::{_normalize_loose(text)}"
        if key in seen:
            return
        seen.add(key)
        status = _text(item.get("status")).lower()
        is_done = status == "done"
        items.append(
            {
                "qid": qid or key,
                "text": text,
                "status": "done" if is_done else "open",
                "scope": scope,
                "scope_id": source_id,
            }
        )
        if scope == "step":
            covered_step_ids.add(source_id)

    by_element = _as_object(interview.get("ai_questions_by_element") or interview.get("aiQuestionsByElementId"))
    for element_id, raw_entry in by_element.items():
        raw_list = raw_entry if isinstance(raw_entry, list) else _as_object(raw_entry).get("items", [])
        for raw_item in raw_list:
            _add_item(element_id, raw_item, "element")

    by_step = _as_object(interview.get("ai_questions") or interview.get("aiQuestions"))
    for step_id, raw_entry in by_step.items():
        raw_list = raw_entry if isinstance(raw_entry, list) else [raw_entry]
        for raw_item in raw_list:
            _add_item(step_id, raw_item, "step")

    return items, covered_step_ids


def _collect_boundaries(interview: Dict[str, Any]) -> Dict[str, Any]:
    boundaries = _as_object(interview.get("boundaries"))
    keys = ["trigger", "start_shop", "intermediate_roles", "finish_state", "finish_shop"]
    filled = sum(1 for key in keys if _text(boundaries.get(key)))
    return {"filled": filled, "total": len(keys), "percent": _percent(filled, len(keys))}


def _collect_exceptions(interview: Dict[str, Any]) -> Dict[str, Any]:
    exceptions = _to_array(interview.get("exceptions"))
    count = len(exceptions)
    add_min_total = sum(_to_non_negative_int(exc.get("add_min") or exc.get("addMin")) for exc in exceptions)
    return {"count": count, "add_min_total": add_min_total}


def _local_name(tag_or_elem: Any) -> str:
    tag = getattr(tag_or_elem, "tag", tag_or_elem)
    if not isinstance(tag, str):
        return ""
    if tag.startswith("{"):
        closing = tag.find("}")
        if closing >= 0:
            return tag[closing + 1 :]
    return tag


def _build_quality_items(session: Any, steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    bpmn_xml = _text(_get_in(session, "bpmn_xml"))
    items: List[Dict[str, Any]] = []

    if not bpmn_xml:
        items.append({"kind": "warning", "message": "BPMN XML отсутствует", "code": "missing_bpmn_xml"})
        return {"errors_total": 0, "warnings_total": len(items), "items": items}

    try:
        root = ET.fromstring(bpmn_xml)
    except ET.ParseError:
        items.append({"kind": "warning", "message": "BPMN XML не распарсен", "code": "bpmn_parse_error"})
        return {"errors_total": 0, "warnings_total": len(items), "items": items}

    tags = {_local_name(elem) for elem in root.iter()}
    bpmn_nodes = [
        (elem, _local_name(elem))
        for elem in root.iter()
        if _local_name(elem)
        in {
            "task",
            "userTask",
            "serviceTask",
            "sendTask",
            "receiveTask",
            "manualTask",
            "scriptTask",
            "businessRuleTask",
            "callActivity",
            "subProcess",
            "adHocSubProcess",
            "startEvent",
            "endEvent",
            "intermediateCatchEvent",
            "intermediateThrowEvent",
            "boundaryEvent",
            "exclusiveGateway",
            "parallelGateway",
            "inclusiveGateway",
            "eventBasedGateway",
            "complexGateway",
        }
    ]

    if not bpmn_nodes:
        items.append({"kind": "warning", "message": "В BPMN не найдены исполняемые элементы", "code": "empty_bpmn"})

    bound_node_ids = {step["bpmn_ref"] for step in steps if step["bpmn_ref"]}
    node_ids_in_xml = {_text(elem.get("id")) for elem, _ in bpmn_nodes}
    orphan_bindings = bound_node_ids - node_ids_in_xml
    if orphan_bindings:
        items.append(
            {
                "kind": "warning",
                "message": f"Привязки к отсутствующим BPMN-элементам: {len(orphan_bindings)}",
                "code": "orphan_bpmn_bindings",
                "count": len(orphan_bindings),
            }
        )

    if "exclusiveGateway" in tags or "parallelGateway" in tags:
        gateway_count = sum(1 for _, tag in bpmn_nodes if tag in {"exclusiveGateway", "parallelGateway", "inclusiveGateway"})
        if gateway_count > 0 and len(steps) <= 1:
            items.append(
                {
                    "kind": "warning",
                    "message": "Обнаружены gateway, но описано менее 2 шагов",
                    "code": "gateways_with_few_steps",
                }
            )

    errors = [it for it in items if it.get("kind") == "error"]
    warnings = [it for it in items if it.get("kind") == "warning"]
    return {"errors_total": len(errors), "warnings_total": len(warnings), "items": items}


def _mainline_step_ids(session: Any, steps: List[Dict[str, Any]]) -> Set[str]:
    interview = _as_object(_get_in(session, "interview"))
    path_spec = _as_object(interview.get("path_spec") or interview.get("pathSpec"))
    path_steps = _to_array(path_spec.get("steps"))
    if path_steps:
        ids: Set[str] = set()
        for raw in path_steps:
            entry = _as_object(raw)
            step_id = _text(entry.get("step_id") or entry.get("stepId") or entry.get("id"))
            if step_id:
                ids.add(step_id)
        return ids

    mainline_ids: Set[str] = set()
    for step in steps:
        if step["tier"] != "None":
            continue
        if step["bpmn_ref"]:
            mainline_ids.add(step["id"])
    return mainline_ids if mainline_ids else {step["id"] for step in steps}


def _compute_distributions(steps: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    total_steps = len(steps)
    total_lead_min = sum(step["lead_sec"] for step in steps) / 60.0

    by_type: Dict[str, Dict[str, Any]] = {}
    by_lane: Dict[str, Dict[str, Any]] = {}
    by_subprocess: Dict[str, Dict[str, Any]] = {}

    for step in steps:
        # by type
        type_key = step["type"]
        if type_key not in by_type:
            by_type[type_key] = {"key": type_key, "label": type_key, "count": 0, "lead_min": 0.0}
        by_type[type_key]["count"] += 1
        by_type[type_key]["lead_min"] += step["lead_sec"] / 60.0

        # by lane
        lane_key = step["lane_key"]
        if lane_key not in by_lane:
            by_lane[lane_key] = {"key": lane_key, "name": step["lane_name"], "count": 0, "lead_min": 0.0}
        by_lane[lane_key]["count"] += 1
        by_lane[lane_key]["lead_min"] += step["lead_sec"] / 60.0

        # by subprocess
        sp = step["subprocess"]
        if sp:
            sp_key = _normalize_loose(sp)
            if sp_key not in by_subprocess:
                by_subprocess[sp_key] = {"key": sp_key, "name": sp, "count": 0, "lead_min": 0.0}
            by_subprocess[sp_key]["count"] += 1
            by_subprocess[sp_key]["lead_min"] += step["lead_sec"] / 60.0

    def _dist_sort_key(item: Dict[str, Any]) -> Tuple[int, str]:
        return (-item["count"], _text(item.get("key")))

    by_type_list = sorted(
        (
            {
                "key": item["key"],
                "label": item["label"],
                "count": item["count"],
                "lead_min": round(item["lead_min"]),
                "share_percent": _percent(item["count"], total_steps),
            }
            for item in by_type.values()
        ),
        key=_dist_sort_key,
    )

    by_lane_list = sorted(
        (
            {
                "key": item["key"],
                "name": item["name"],
                "count": item["count"],
                "lead_min": round(item["lead_min"]),
                "share_percent": _percent(item["count"], total_steps),
            }
            for item in by_lane.values()
        ),
        key=_dist_sort_key,
    )

    by_subprocess_list = sorted(
        (
            {
                "key": item["key"],
                "name": item["name"],
                "count": item["count"],
                "lead_min": round(item["lead_min"]),
                "share_percent": _percent(item["count"], total_steps),
            }
            for item in by_subprocess.values()
        ),
        key=_dist_sort_key,
    )

    return {
        "by_type": by_type_list,
        "by_lane": by_lane_list,
        "by_subprocess": by_subprocess_list,
    }


def _compute_tier_counts(steps: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {"P0": 0, "P1": 0, "P2": 0, "None": 0}
    for step in steps:
        counts[step["tier"]] += 1
    return counts


def _compute_top_waits(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    wait_steps = [step for step in steps if step["wait_sec"] > 0]
    wait_steps.sort(
        key=lambda s: (-s["wait_sec"], _text(s.get("seq") or "")),
    )
    return [
        {
            "step_id": step["id"],
            "seq": _text(step.get("seq")),
            "title": step["title"],
            "wait_min": round(step["wait_sec"] / 60.0),
        }
        for step in wait_steps[:3]
    ]


def _compute_extremes(steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not steps:
        return {
            "max_duration_step": None,
            "max_wait_step": None,
        }

    by_duration = sorted(steps, key=lambda s: (-s["work_sec"], _text(s.get("seq") or "")))
    by_wait = sorted(steps, key=lambda s: (-s["wait_sec"], _text(s.get("seq") or "")))
    max_dur = by_duration[0]
    max_wait = by_wait[0]
    return {
        "max_duration_step": {
            "seq": _text(max_dur.get("seq")),
            "title": max_dur["title"],
            "duration_min": round(max_dur["work_sec"] / 60.0),
        }
        if max_dur["work_sec"] > 0
        else None,
        "max_wait_step": {
            "seq": _text(max_wait.get("seq")),
            "title": max_wait["title"],
            "wait_min": round(max_wait["wait_sec"] / 60.0),
        }
        if max_wait["wait_sec"] > 0
        else None,
    }


def _compute_path_metrics(steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    work_time_total_sec = sum(step["work_sec"] for step in steps)
    wait_time_total_sec = sum(step["wait_sec"] for step in steps)
    return {
        "steps_count": len(steps),
        "work_time_total_sec": work_time_total_sec,
        "wait_time_total_sec": wait_time_total_sec,
        "total_time_sec": work_time_total_sec + wait_time_total_sec,
    }


def build_session_process_analysis(session: Any) -> Dict[str, Any]:
    """Build a backend-driven read-model for the Process Analysis page.

    The result is a pure function of ``session`` and contains all metrics that
    the redesigned no-scroll dashboard needs. The frontend must not recompute
    these numbers.
    """
    interview = _as_object(_get_in(session, "interview"))
    steps = _collect_steps(session)

    ai_items, ai_covered_step_ids = _collect_ai_items(session)
    ai_done = sum(1 for item in ai_items if item["status"] == "done")
    ai_open = len(ai_items) - ai_done
    ai_step_coverage_count = sum(1 for step in steps if step["id"] in ai_covered_step_ids)

    mainline_ids = _mainline_step_ids(session, steps)
    active_sec = sum(step["work_sec"] for step in steps)
    wait_sec = sum(step["wait_sec"] for step in steps)
    lead_sec = active_sec + wait_sec
    mainline_sec = sum(step["work_sec"] for step in steps if step["id"] in mainline_ids)
    if mainline_sec == 0 and steps:
        mainline_sec = active_sec

    active_min = round(active_sec / 60.0)
    wait_min = round(wait_sec / 60.0)
    lead_min = active_min + wait_min
    mainline_min = round(mainline_sec / 60.0)
    steps_count = len(steps)
    throughput = _round1((steps_count * 60.0) / lead_min) if lead_min > 0 else 0.0

    bound_count = sum(1 for step in steps if step["bpmn_ref"])
    tier_counts = _compute_tier_counts(steps)
    distributions = _compute_distributions(steps)
    top_waits = _compute_top_waits(steps)
    extremes = _compute_extremes(steps)
    exceptions = _collect_exceptions(interview)
    boundaries = _collect_boundaries(interview)
    quality = _build_quality_items(session, steps)
    path_metrics = _compute_path_metrics(steps)

    diagram_state_version = _to_non_negative_int(_get_in(session, "diagram_state_version"))

    return {
        "time": {
            "active_min": active_min,
            "wait_min": wait_min,
            "lead_min": lead_min,
            "mainline_min": mainline_min,
            "throughput_steps_per_hour": throughput,
        },
        "counts": {
            "steps_total": steps_count,
            "steps_bound_to_bpmn": bound_count,
            "tiers": tier_counts,
        },
        "coverage": {
            "bind_percent": _percent(bound_count, steps_count),
            "ai": {
                "total": len(ai_items),
                "done": ai_done,
                "open": ai_open,
                "step_coverage_percent": _percent(ai_step_coverage_count, steps_count),
            },
            "boundaries": boundaries,
        },
        "distributions": distributions,
        "top_waits": top_waits,
        "extremes": extremes,
        "exceptions": exceptions,
        "quality": quality,
        "path_metrics": path_metrics,
        "source_state": {
            "source": "process_analysis_read_model",
            "version": "v1",
            "computed_at": int(time.time()),
            "diagram_state_version": diagram_state_version,
        },
    }
