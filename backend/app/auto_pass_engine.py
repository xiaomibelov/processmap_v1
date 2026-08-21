from __future__ import annotations

import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from .rtiers import parse_bpmn_sequence_graph


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return int(default)
        return int(float(value))
    except Exception:
        return int(default)


def _read_duration_seconds(entry_raw: Any) -> Optional[int]:
    entry = _as_dict(entry_raw)
    params = _as_dict(entry.get("parameters"))
    sec_candidates = (
        entry.get("step_time_sec"),
        entry.get("duration_sec"),
        params.get("step_time_sec"),
        params.get("duration_sec"),
        entry.get("work_duration_sec"),
        params.get("work_duration_sec"),
    )
    for value in sec_candidates:
        sec = _to_int(value, default=-1)
        if sec >= 0:
            return sec
    min_candidates = (
        entry.get("step_time_min"),
        entry.get("duration_min"),
        params.get("step_time_min"),
        params.get("duration_min"),
        entry.get("work_duration_min"),
        params.get("work_duration_min"),
        entry.get("duration"),
        params.get("duration"),
    )
    for value in min_candidates:
        mins = _to_int(value, default=-1)
        if mins >= 0:
            return max(0, mins * 60)
    return None


def build_duration_index(session: Any) -> Dict[str, Optional[int]]:
    duration_by_node: Dict[str, Optional[int]] = {}
    interview = _as_dict(getattr(session, "interview", {}))
    for step_raw in _as_list(interview.get("steps")):
        step = _as_dict(step_raw)
        node_id = _as_text(step.get("node_id") or step.get("nodeId"))
        if not node_id:
            continue
        if node_id in duration_by_node:
            continue
        duration_by_node[node_id] = _read_duration_seconds(step)

    for node_raw in _as_list(getattr(session, "nodes", [])):
        node: Dict[str, Any]
        if isinstance(node_raw, dict):
            node = node_raw
        elif hasattr(node_raw, "model_dump"):
            try:
                node = _as_dict(node_raw.model_dump())
            except Exception:
                node = {}
        else:
            node = {}
        node_id = _as_text(node.get("id"))
        if not node_id or node_id in duration_by_node:
            continue
        duration_by_node[node_id] = _read_duration_seconds(node)
    return duration_by_node


def _pick_start_nodes(graph: Dict[str, Any]) -> List[str]:
    incoming_by_node = _as_dict(graph.get("incoming_by_node"))
    node_process_by_id = _as_dict(graph.get("node_process_by_id"))
    participant_process_by_id = _as_dict(graph.get("participant_process_by_id"))
    message_flow_by_id = _as_dict(graph.get("message_flow_by_id"))
    top_level_start_ids = sorted(
        {_as_text(x) for x in _as_list(graph.get("top_level_start_event_ids")) if _as_text(x)}
    )
    start_ids = top_level_start_ids or sorted(
        {_as_text(x) for x in _as_list(graph.get("start_event_ids")) if _as_text(x)}
    )
    inbound_message_process_ids: Set[str] = set()
    for message_row_raw in message_flow_by_id.values():
        message_row = _as_dict(message_row_raw)
        target_ref = _as_text(message_row.get("target"))
        process_id = _as_text(participant_process_by_id.get(target_ref)) or _as_text(node_process_by_id.get(target_ref))
        if process_id:
            inbound_message_process_ids.add(process_id)
    if start_ids:
        collaboration_roots = [
            nid for nid in start_ids
            if _as_text(node_process_by_id.get(nid)) not in inbound_message_process_ids
        ]
        if collaboration_roots:
            start_ids = collaboration_roots
        top_level_starts = [nid for nid in start_ids if len(_as_list(incoming_by_node.get(nid))) == 0]
        if top_level_starts:
            return top_level_starts
        return start_ids
    node_ids = sorted({_as_text(x) for x in list(graph.get("node_ids") or []) if _as_text(x)})
    inferred = [nid for nid in node_ids if len(_as_list(incoming_by_node.get(nid))) == 0]
    if inferred:
        return inferred
    return node_ids[:1]


def _flow_choice_label(flow_by_id: Dict[str, Dict[str, Any]], flow_id: str) -> str:
    row = _as_dict(flow_by_id.get(flow_id))
    label = _as_text(row.get("label"))
    return label or flow_id


def _mk_warning(code: str, message: str) -> Dict[str, Any]:
    return {"code": _as_text(code), "message": _as_text(message)}


def _parse_graph_for_autopass(xml: str) -> Dict[str, Any]:
    raw = _as_text(xml)
    if not raw:
        return parse_bpmn_sequence_graph("")
    try:
        graph = parse_bpmn_sequence_graph(raw, expand_subprocess_flows=False)
    except TypeError:
        graph = parse_bpmn_sequence_graph(raw)
    graph_dict = _as_dict(graph)

    try:
        root = ET.fromstring(raw)
    except Exception:
        return graph_dict

    node_type_by_id = _as_dict(graph_dict.get("node_type_by_id"))
    node_parent_subprocess: Dict[str, str] = {}

    def _ln(tag: str) -> str:
        src = str(tag or "")
        if "}" in src:
            src = src.rsplit("}", 1)[-1]
        return src.lower()

    def walk(el: Any, current_subprocess_id: str = "") -> None:
        local = _ln(getattr(el, "tag", ""))
        el_id = _as_text(getattr(el, "attrib", {}).get("id"))
        if el_id and el_id in node_type_by_id:
            node_parent_subprocess[el_id] = _as_text(current_subprocess_id)
        next_subprocess_id = current_subprocess_id
        if local in {"subprocess", "adhocsubprocess"} and el_id:
            next_subprocess_id = el_id
        for child in list(el):
            walk(child, next_subprocess_id)

    walk(root, "")

    start_event_ids = [_as_text(x) for x in _as_list(graph_dict.get("start_event_ids")) if _as_text(x)]
    end_event_ids = [_as_text(x) for x in _as_list(graph_dict.get("end_event_ids")) if _as_text(x)]
    derived_top_level_start = [nid for nid in start_event_ids if not _as_text(node_parent_subprocess.get(nid))]
    derived_top_level_end = [nid for nid in end_event_ids if not _as_text(node_parent_subprocess.get(nid))]

    graph_dict["node_parent_subprocess_by_id"] = node_parent_subprocess
    graph_dict["top_level_start_event_ids"] = sorted(set(derived_top_level_start))
    graph_dict["top_level_end_event_ids"] = sorted(set(derived_top_level_end))
    return graph_dict


def _compute_reachability_to_main_end(graph: Dict[str, Any]) -> Dict[str, Any]:
    outgoing_by_node = _as_dict(graph.get("outgoing_by_node"))
    flow_by_id = _as_dict(graph.get("flow_by_id"))
    message_transitions_by_node = _build_message_transitions_by_node(graph)
    start_ids = [
        _as_text(node_id)
        for node_id in _as_list(graph.get("top_level_start_event_ids"))
        if _as_text(node_id)
    ]
    if not start_ids:
        start_ids = [
            _as_text(node_id)
            for node_id in _as_list(graph.get("start_event_ids"))
            if _as_text(node_id)
        ]
    end_ids = {
        _as_text(node_id)
        for node_id in _as_list(graph.get("top_level_end_event_ids"))
        if _as_text(node_id)
    }
    if not start_ids:
        return {
            "ok": False,
            "code": "NO_START_EVENT",
            "message": "No StartEvent found in process",
            "start_ids": [],
            "end_ids": sorted(end_ids),
        }
    if not end_ids:
        return {
            "ok": False,
            "code": "NO_MAIN_END_EVENT",
            "message": "No top-level EndEvent found in main process",
            "start_ids": sorted(start_ids),
            "end_ids": [],
        }
    visited: Set[str] = set()
    queue: List[str] = list(start_ids)
    while queue:
        node_id = _as_text(queue.pop(0))
        if not node_id or node_id in visited:
            continue
        visited.add(node_id)
        if node_id in end_ids:
            return {
                "ok": True,
                "code": "",
                "message": "",
                "start_ids": sorted(start_ids),
                "end_ids": sorted(end_ids),
            }
        for flow_id in _as_list(outgoing_by_node.get(node_id)):
            fid = _as_text(flow_id)
            if not fid:
                continue
            target = _as_text(_as_dict(flow_by_id.get(fid)).get("target"))
            if target and target not in visited:
                queue.append(target)
        for transition in _as_list(message_transitions_by_node.get(node_id)):
            target = _as_text(_as_dict(transition).get("target"))
            if target and target not in visited:
                queue.append(target)
    return {
        "ok": False,
        "code": "NO_COMPLETE_PATH_TO_END",
        "message": "No complete path reaches EndEvent of main process",
        "start_ids": sorted(start_ids),
        "end_ids": sorted(end_ids),
    }


def compute_auto_pass_precheck(session: Any) -> Dict[str, Any]:
    xml = _as_text(getattr(session, "bpmn_xml", ""))
    graph = _parse_graph_for_autopass(xml)
    reach = _compute_reachability_to_main_end(graph)
    return {
        "ok": bool(reach.get("ok")),
        "code": _as_text(reach.get("code")),
        "message": _as_text(reach.get("message")),
        "main_start_event_ids": _as_list(reach.get("start_ids")),
        "main_end_event_ids": _as_list(reach.get("end_ids")),
    }


_TASK_NODE_TYPES: Set[str] = {
    "task",
    "usertask",
    "servicetask",
    "manualtask",
    "scripttask",
    "businessruletask",
    "sendtask",
    "receivetask",
    "subprocess",
    "adhocsubprocess",
    "callactivity",
}


def _is_task_node(node_type: str) -> bool:
    return _as_text(node_type).lower() in _TASK_NODE_TYPES


def _is_subprocess_like_node(node_type: str) -> bool:
    return _as_text(node_type).lower() in {"subprocess", "adhocsubprocess", "callactivity"}


def _is_teleport_flow(flow_id: str) -> bool:
    return "__teleport__" in _as_text(flow_id).lower()


def _event_scope_kind(node_type: str, event_contract: Dict[str, Any]) -> str:
    normalized_type = _as_text(node_type).lower()
    kind = _as_text(_as_dict(event_contract).get("kind")).lower()
    if kind == "signal":
        return "signal"
    if kind == "message":
        if "throw" in normalized_type or "sendtask" in normalized_type:
            return "message_throw"
        if "catch" in normalized_type or "receivetask" in normalized_type or "startevent" in normalized_type:
            return "message_catch"
        return "message"
    return ""


def _build_message_transitions_by_node(graph: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    node_type_by_id = _as_dict(graph.get("node_type_by_id"))
    node_process_by_id = _as_dict(graph.get("node_process_by_id"))
    event_contract_by_node = _as_dict(graph.get("event_contract_by_node"))
    participant_process_by_id = _as_dict(graph.get("participant_process_by_id"))
    message_flow_by_id = _as_dict(graph.get("message_flow_by_id"))
    message_outgoing_by_node = _as_dict(graph.get("message_outgoing_by_node"))
    start_event_ids = [_as_text(x) for x in _as_list(graph.get("start_event_ids")) if _as_text(x)]

    message_catch_by_process: Dict[str, List[str]] = {}
    message_catch_by_ref: Dict[str, List[str]] = {}
    signal_catch_by_ref: Dict[str, List[str]] = {}
    for node_id, contract_raw in event_contract_by_node.items():
        nid = _as_text(node_id)
        contract = _as_dict(contract_raw)
        event_scope = _event_scope_kind(_as_text(node_type_by_id.get(nid)), contract)
        ref = _as_text(contract.get("ref"))
        process_id = _as_text(node_process_by_id.get(nid))
        if event_scope == "message_catch":
            if process_id:
                message_catch_by_process.setdefault(process_id, []).append(nid)
            if ref:
                message_catch_by_ref.setdefault(ref, []).append(nid)
        elif event_scope == "signal":
            if ref:
                signal_catch_by_ref.setdefault(ref, []).append(nid)

    transitions_by_node: Dict[str, List[Dict[str, Any]]] = {}
    nodes_with_explicit_message_flow: Set[str] = set()

    def add_transition(source_id: str, transition: Dict[str, Any]) -> None:
        sid = _as_text(source_id)
        target = _as_text(_as_dict(transition).get("target"))
        if not sid or not target:
            return
        transitions_by_node.setdefault(sid, []).append(transition)

    for source_id, flow_ids in message_outgoing_by_node.items():
        sid = _as_text(source_id)
        if sid:
            nodes_with_explicit_message_flow.add(sid)
        for flow_id in _as_list(flow_ids):
            row = _as_dict(message_flow_by_id.get(flow_id))
            target_ref = _as_text(row.get("target"))
            if not target_ref:
                continue
            if target_ref in node_type_by_id:
                add_transition(sid, {
                    "target": target_ref,
                    "kind": "message_flow",
                    "flow_id": _as_text(row.get("id")),
                    "label": _as_text(row.get("label")),
                    "externalized": True,
                })
                continue
            process_ref = _as_text(participant_process_by_id.get(target_ref))
            if not process_ref:
                continue
            target_candidates = [
                node_id for node_id in _as_list(message_catch_by_process.get(process_ref))
                if _as_text(node_id)
            ]
            if not target_candidates:
                target_candidates = [
                    node_id for node_id in start_event_ids
                    if _as_text(node_process_by_id.get(node_id)) == process_ref
                ]
            for target_id in target_candidates:
                add_transition(sid, {
                    "target": target_id,
                    "kind": "message_flow",
                    "flow_id": _as_text(row.get("id")),
                    "label": _as_text(row.get("label")),
                    "participant_handoff": True,
                    "externalized": True,
                })

    for node_id, contract_raw in event_contract_by_node.items():
        nid = _as_text(node_id)
        contract = _as_dict(contract_raw)
        ref = _as_text(contract.get("ref"))
        event_scope = _event_scope_kind(_as_text(node_type_by_id.get(nid)), contract)
        if event_scope == "message_throw" and ref:
            if nid in nodes_with_explicit_message_flow:
                continue
            for target_id in _as_list(message_catch_by_ref.get(ref)):
                target = _as_text(target_id)
                if target and target != nid:
                    add_transition(nid, {
                        "target": target,
                        "kind": "message_ref",
                        "ref": ref,
                        "externalized": True,
                    })
        if event_scope == "signal" and ref:
            for target_id in _as_list(signal_catch_by_ref.get(ref)):
                target = _as_text(target_id)
                if target and target != nid:
                    add_transition(nid, {
                        "target": target,
                        "kind": "signal_ref",
                        "ref": ref,
                        "externalized": True,
                    })
    return transitions_by_node


def _build_variant_payload(
    *,
    status: str,
    task_steps: List[Dict[str, Any]],
    gateway_choices: List[Dict[str, Any]],
    detail_rows: List[Dict[str, Any]],
    end_event_id: str = "",
    teleport: Optional[Dict[str, Any]] = None,
    error: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    known_duration = 0
    unknown_duration_count = 0
    for step in task_steps:
        duration = step.get("duration_s")
        if isinstance(duration, int):
            known_duration += max(0, duration)
        else:
            unknown_duration_count += 1
    teleport_used = bool(_as_dict(teleport).get("used"))
    payload = {
        "status": "done" if _as_text(status).lower() == "done" else "failed",
        "end_reached": _as_text(status).lower() == "done",
        "end_event_id": _as_text(end_event_id),
        "task_steps": task_steps,
        "gateway_choices": gateway_choices,
        "detail_rows": detail_rows,
        "counts": {
            "tasks": len(task_steps),
            "gateway_choices": len(gateway_choices),
            "teleport_used": 1 if teleport_used else 0,
        },
        "teleport": {
            "used": teleport_used,
            "from": _as_text(_as_dict(teleport).get("from")),
            "to": _as_text(_as_dict(teleport).get("to")),
            "flow_id": _as_text(_as_dict(teleport).get("flow_id")),
        },
        "error": _as_dict(error) if _as_text(status).lower() != "done" else {},
        # backward-compatible aliases used by existing UI
        "steps": task_steps,
        "choices": gateway_choices,
        "total_steps": len(task_steps),
        "total_duration_s": int(known_duration),
        "unknown_duration_count": int(unknown_duration_count),
    }
    return payload


def _enumerate_variants(
    graph: Dict[str, Any],
    *,
    duration_by_node: Dict[str, Optional[int]],
    max_variants: int,
    max_steps: int,
    max_visits_per_node: int,
) -> Dict[str, Any]:
    node_name_by_id = _as_dict(graph.get("node_name_by_id"))
    node_type_by_id = _as_dict(graph.get("node_type_by_id"))
    outgoing_by_node = _as_dict(graph.get("outgoing_by_node"))
    flow_by_id = _as_dict(graph.get("flow_by_id"))
    message_transitions_by_node = _build_message_transitions_by_node(graph)
    event_contract_by_node = _as_dict(graph.get("event_contract_by_node"))
    gateway_mode_by_node = _as_dict(graph.get("gateway_mode_by_node"))
    default_flow_by_gateway = _as_dict(graph.get("default_flow_by_gateway"))
    top_level_end_event_ids = {
        _as_text(node_id)
        for node_id in _as_list(graph.get("top_level_end_event_ids"))
        if _as_text(node_id)
    }

    variants: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []
    warnings_seen: Set[str] = set()
    failed_histogram: Dict[str, int] = {}
    truncated = False

    def warn_once(code: str, message: str) -> None:
        key = f"{code}:{message}"
        if key in warnings_seen:
            return
        warnings_seen.add(key)
        warnings.append(_mk_warning(code, message))

    def register_failed_reason(code: str) -> None:
        key = _as_text(code) or "UNKNOWN"
        failed_histogram[key] = int(failed_histogram.get(key, 0) or 0) + 1

    def append_variant(payload: Dict[str, Any]) -> None:
        nonlocal truncated
        if len(variants) >= max_variants:
            truncated = True
            warn_once("max_variants_reached", f"Reached max_variants={max_variants}")
            return
        variants.append(payload)
        if _as_text(payload.get("status")).lower() != "done":
            register_failed_reason(_as_text(_as_dict(payload.get("error")).get("code")) or "UNKNOWN")

    def fail_variant(
        *,
        code: str,
        message: str,
        task_steps: List[Dict[str, Any]],
        gateway_choices: List[Dict[str, Any]],
        detail_rows: List[Dict[str, Any]],
        teleport: Optional[Dict[str, Any]],
    ) -> None:
        append_variant(
            _build_variant_payload(
                status="failed",
                task_steps=list(task_steps),
                gateway_choices=list(gateway_choices),
                detail_rows=list(detail_rows),
                teleport=_as_dict(teleport),
                error={"code": _as_text(code), "message": _as_text(message)},
            )
        )

    def traverse(
        node_id: str,
        *,
        task_steps: List[Dict[str, Any]],
        gateway_choices: List[Dict[str, Any]],
        detail_rows: List[Dict[str, Any]],
        visits: Dict[str, int],
        teleport: Dict[str, Any],
        depth: int,
    ) -> None:
        nonlocal truncated
        if truncated:
            return
        if len(variants) >= max_variants:
            truncated = True
            warn_once("max_variants_reached", f"Reached max_variants={max_variants}")
            return
        if depth >= max_steps:
            warn_once("max_steps_reached", f"Reached max_steps={max_steps}")
            fail_variant(
                code="MAX_STEPS_REACHED",
                message=f"Reached max_steps={max_steps}",
                task_steps=task_steps,
                gateway_choices=gateway_choices,
                detail_rows=detail_rows,
                teleport=teleport,
            )
            return
        nid = _as_text(node_id)
        if not nid:
            fail_variant(
                code="EMPTY_NODE_ID",
                message="Encountered empty node id while traversing",
                task_steps=task_steps,
                gateway_choices=gateway_choices,
                detail_rows=detail_rows,
                teleport=teleport,
            )
            return

        next_visits = dict(visits)
        next_visits[nid] = _to_int(next_visits.get(nid), 0) + 1
        if next_visits[nid] > max_visits_per_node:
            warn_once("max_visits_reached", f"Node {nid} exceeded max_visits_per_node={max_visits_per_node}")
            fail_variant(
                code="MAX_VISITS_REACHED",
                message=f"Node {nid} exceeded max_visits_per_node={max_visits_per_node}",
                task_steps=task_steps,
                gateway_choices=gateway_choices,
                detail_rows=detail_rows,
                teleport=teleport,
            )
            return

        node_type = _as_text(node_type_by_id.get(nid))
        node_name = _as_text(node_name_by_id.get(nid)) or nid
        next_task_steps = list(task_steps)
        next_detail_rows = list(detail_rows)
        event_contract = _as_dict(event_contract_by_node.get(nid))
        if _is_task_node(node_type):
            node_duration = duration_by_node.get(nid)
            step_kind = "subprocess" if _is_subprocess_like_node(node_type) else "task"
            task_step = {
                "node_id": nid,
                "name": node_name,
                "duration_s": node_duration if isinstance(node_duration, int) else None,
                "kind": step_kind,
                "bpmn_type": node_type,
            }
            next_task_steps.append(task_step)
            next_detail_rows.append(
                {
                    "kind": "task",
                    "node_id": nid,
                    "name": node_name,
                    "duration_s": task_step["duration_s"],
                    "step_kind": step_kind,
                    "bpmn_type": node_type,
                }
            )
        elif _as_text(event_contract.get("kind")):
            next_detail_rows.append(
                {
                    "kind": "event_contract",
                    "node_id": nid,
                    "name": node_name,
                    "event_kind": _as_text(event_contract.get("kind")),
                    "event_ref": _as_text(event_contract.get("ref")),
                    "bpmn_type": node_type,
                }
            )

        if nid in top_level_end_event_ids:
            done_detail_rows = list(next_detail_rows)
            done_detail_rows.append(
                {
                    "kind": "end_event",
                    "node_id": nid,
                    "name": node_name,
                }
            )
            append_variant(
                _build_variant_payload(
                    status="done",
                    task_steps=next_task_steps,
                    gateway_choices=gateway_choices,
                    detail_rows=done_detail_rows,
                    end_event_id=nid,
                    teleport=teleport,
                )
            )
            return

        outgoing = [_as_text(fid) for fid in _as_list(outgoing_by_node.get(nid)) if _as_text(fid)]
        message_transitions = [
            _as_dict(item)
            for item in _as_list(message_transitions_by_node.get(nid))
            if _as_text(_as_dict(item).get("target"))
        ]
        if not outgoing and not message_transitions:
            failed_code = "END_NOT_REACHED"
            failed_message = f"Traversal stopped at {nid} before reaching top-level EndEvent"
            if _is_subprocess_like_node(node_type):
                failed_code = "NO_OUTGOING_FROM_SUBPROCESS"
                failed_message = f"SubProcess/CallActivity {nid} has no outgoing sequence flow"
            elif _as_text(event_contract.get("kind")):
                failed_code = "UNRESOLVED_EVENT_CONTRACT"
                failed_message = f"Event contract at {nid} did not resolve to a reachable handoff"
            fail_variant(
                code=failed_code,
                message=failed_message,
                task_steps=next_task_steps,
                gateway_choices=gateway_choices,
                detail_rows=next_detail_rows,
                teleport=teleport,
            )
            return

        mode = _as_text(gateway_mode_by_node.get(nid))
        branches: List[Tuple[str, Optional[Dict[str, Any]]]] = []
        if len(outgoing) == 1:
            branches = [(outgoing[0], None)]
        elif mode in {"xor", "event"}:
            for flow_id in outgoing:
                branches.append(
                    (
                        flow_id,
                        {
                            "gateway_id": nid,
                            "flow_id": flow_id,
                            "label": _flow_choice_label(flow_by_id, flow_id),
                        },
                    )
                )
        elif mode in {"parallel", "inclusive"}:
            default_flow = _as_text(default_flow_by_gateway.get(nid))
            picked = default_flow if default_flow in outgoing else outgoing[0]
            warn_once(
                "unsupported_gateway_mode",
                f"Gateway {nid} mode={mode} is not fully expanded in P0; using single branch {picked}",
            )
            branches = [(
                picked,
                {
                    "gateway_id": nid,
                    "flow_id": picked,
                    "label": _flow_choice_label(flow_by_id, picked),
                },
            )]
        else:
            # Non-gateway nodes with multiple outgoing flows still branch deterministically.
            for flow_id in outgoing:
                branches.append((flow_id, None))

        for flow_id, choice in branches:
            if len(variants) >= max_variants:
                truncated = True
                warn_once("max_variants_reached", f"Reached max_variants={max_variants}")
                break
            target = _as_text(_as_dict(flow_by_id.get(flow_id)).get("target"))
            if not target:
                fail_variant(
                    code="BROKEN_FLOW",
                    message=f"Flow {flow_id} from {nid} has empty target",
                    task_steps=next_task_steps,
                    gateway_choices=gateway_choices,
                    detail_rows=next_detail_rows,
                    teleport=teleport,
                )
                continue

            next_choices = list(gateway_choices)
            branch_detail_rows = list(next_detail_rows)
            if isinstance(choice, dict):
                next_choices.append(choice)
                branch_detail_rows.append(
                    {
                        "kind": "gateway_choice",
                        "gateway_id": _as_text(choice.get("gateway_id")),
                        "flow_id": _as_text(choice.get("flow_id")),
                        "label": _as_text(choice.get("label")) or _as_text(choice.get("flow_id")),
                    }
                )

            next_teleport = dict(teleport or {})
            if _is_teleport_flow(flow_id):
                if bool(next_teleport.get("used")):
                    fail_variant(
                        code="TELEPORT_LIMIT_EXCEEDED",
                        message="Teleport used more than once in variant",
                        task_steps=next_task_steps,
                        gateway_choices=next_choices,
                        detail_rows=branch_detail_rows,
                        teleport=next_teleport,
                    )
                    continue
                next_teleport = {
                    "used": True,
                    "from": nid,
                    "to": target,
                    "flow_id": flow_id,
                }
                branch_detail_rows.append(
                    {
                        "kind": "teleport",
                        "from": nid,
                        "to": target,
                        "flow_id": flow_id,
                    }
                )

            traverse(
                target,
                task_steps=next_task_steps,
                gateway_choices=next_choices,
                detail_rows=branch_detail_rows,
                visits=next_visits,
                teleport=next_teleport,
                depth=depth + 1,
            )

        for transition in message_transitions:
            if len(variants) >= max_variants:
                truncated = True
                warn_once("max_variants_reached", f"Reached max_variants={max_variants}")
                break
            target = _as_text(transition.get("target"))
            if not target:
                continue
            branch_detail_rows = list(next_detail_rows)
            branch_detail_rows.append(
                {
                    "kind": "message_handoff",
                    "node_id": nid,
                    "target_id": target,
                    "flow_id": _as_text(transition.get("flow_id")),
                    "handoff_kind": _as_text(transition.get("kind")) or "message",
                    "externalized": bool(transition.get("externalized")),
                    "participant_handoff": bool(transition.get("participant_handoff")),
                    "label": _as_text(transition.get("label")) or _as_text(transition.get("ref")),
                }
            )
            traverse(
                target,
                task_steps=next_task_steps,
                gateway_choices=gateway_choices,
                detail_rows=branch_detail_rows,
                visits=next_visits,
                teleport=teleport,
                depth=depth + 1,
            )

    start_nodes = _pick_start_nodes(graph)
    if not start_nodes:
        warn_once("no_start_nodes", "No start nodes found in BPMN graph")
        return {
            "variants": [],
            "warnings": warnings,
            "truncated": True,
            "failed_reasons": {"NO_START_NODES": 1},
        }

    for start_id in start_nodes:
        if len(variants) >= max_variants:
            truncated = True
            break
        traverse(
            start_id,
            task_steps=[],
            gateway_choices=[],
            detail_rows=[],
            visits={},
            teleport={"used": False},
            depth=0,
        )

    for idx, variant in enumerate(variants):
        variant["variant_id"] = _as_text(variant.get("variant_id")) or f"V{idx + 1:03d}"

    return {
        "variants": variants,
        "warnings": warnings,
        "truncated": bool(truncated),
        "failed_reasons": failed_histogram,
    }


def compute_auto_pass_v1(
    session: Any,
    *,
    mode: str = "all",
    max_variants: int = 500,
    max_steps: int = 2000,
    max_visits_per_node: int = 2,
) -> Dict[str, Any]:
    normalized_mode = _as_text(mode).lower() or "all"
    if normalized_mode != "all":
        normalized_mode = "all"
    max_variants_n = max(1, min(_to_int(max_variants, 500), 5000))
    max_steps_n = max(10, min(_to_int(max_steps, 2000), 20000))
    max_visits_n = max(1, min(_to_int(max_visits_per_node, 2), 10))

    xml = _as_text(getattr(session, "bpmn_xml", ""))
    graph = _parse_graph_for_autopass(xml)
    reach = _compute_reachability_to_main_end(graph)
    if not bool(reach.get("ok")):
        return {
            "schema_version": "auto_pass_v1.1",
            "status": "failed",
            "error_code": _as_text(reach.get("code")) or "NO_COMPLETE_PATH_TO_END",
            "error_message": _as_text(reach.get("message")) or "No complete path reaches EndEvent of main process",
            "graph_hash": hashlib.sha1(xml.encode("utf-8", errors="ignore")).hexdigest() if xml else "",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "limits": {
                "max_variants": max_variants_n,
                "max_steps": max_steps_n,
                "max_visits_per_node": max_visits_n,
                "mode": normalized_mode,
            },
            "summary": {
                "total_variants": 0,
                "total_variants_done": 0,
                "total_variants_failed": 0,
                "failed_reasons": {
                    _as_text(reach.get("code")) or "NO_COMPLETE_PATH_TO_END": 1,
                },
                "truncated": False,
            },
            "variants": [],
            "debug_failed_variants": [],
            "warnings": [
                _mk_warning(
                    _as_text(reach.get("code")) or "NO_COMPLETE_PATH_TO_END",
                    _as_text(reach.get("message")) or "No complete path reaches EndEvent of main process",
                )
            ],
        }
    duration_by_node = build_duration_index(session)
    enum_result = _enumerate_variants(
        graph,
        duration_by_node=duration_by_node,
        max_variants=max_variants_n,
        max_steps=max_steps_n,
        max_visits_per_node=max_visits_n,
    )
    variants = _as_list(enum_result.get("variants"))
    warnings = _as_list(enum_result.get("warnings"))
    truncated = bool(enum_result.get("truncated"))
    failed_reasons = _as_dict(enum_result.get("failed_reasons"))
    done_variants = [item for item in variants if _as_text(_as_dict(item).get("status")).lower() == "done"]
    failed_variants = [item for item in variants if _as_text(_as_dict(item).get("status")).lower() != "done"]
    total_done = len(done_variants)
    total_failed = len(failed_variants)
    run_status = "done" if total_done > 0 else "failed"
    if total_done <= 0:
        warnings.append(
            _mk_warning(
                "no_successful_variants",
                "AutoPass failed: no variant reached top-level EndEvent",
            )
        )
    graph_hash = hashlib.sha1(xml.encode("utf-8", errors="ignore")).hexdigest() if xml else ""
    return {
        "schema_version": "auto_pass_v1.1",
        "status": run_status,
        "error_code": "NO_COMPLETE_PATH_TO_END" if run_status == "failed" else "",
        "error_message": "No complete path reaches EndEvent of main process" if run_status == "failed" else "",
        "graph_hash": graph_hash,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "limits": {
            "max_variants": max_variants_n,
            "max_steps": max_steps_n,
            "max_visits_per_node": max_visits_n,
            "mode": normalized_mode,
        },
        "summary": {
            "total_variants": total_done,
            "total_variants_done": total_done,
            "total_variants_failed": total_failed,
            "failed_reasons": failed_reasons,
            "truncated": bool(truncated),
        },
        "variants": done_variants,
        "debug_failed_variants": failed_variants,
        "warnings": warnings,
    }
