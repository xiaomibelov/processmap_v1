from __future__ import annotations

from collections import deque
from typing import Any, Dict, List, Optional, Set, Tuple
import xml.etree.ElementTree as ET


_FLOW_NODE_TAGS: Set[str] = {
    "startevent",
    "endevent",
    "boundaryevent",
    "task",
    "usertask",
    "servicetask",
    "manualtask",
    "scripttask",
    "businessruletask",
    "sendtask",
    "receivetask",
    "callactivity",
    "subprocess",
    "adhocsubprocess",
    "exclusivegateway",
    "inclusivegateway",
    "eventbasedgateway",
    "parallelgateway",
    "intermediatecatchevent",
    "intermediatethrowevent",
    "intermediateevent",
}

_GATEWAY_MODE_BY_TAG: Dict[str, str] = {
    "exclusivegateway": "xor",
    "inclusivegateway": "inclusive",
    "parallelgateway": "parallel",
    "eventbasedgateway": "event",
}

_MESSAGE_EVENT_TAGS: Set[str] = {
    "messageeventdefinition",
    "signaleventdefinition",
}

_FAIL_NAME_TOKENS = (
    "fail",
    "error",
    "escalat",
    "cancel",
    "abort",
    "stop",
    "неусп",
    "ошиб",
    "эскал",
    "стоп",
)

_SUCCESS_NAME_TOKENS = (
    "success",
    "done",
    "complete",
    "finish",
    "усп",
    "готов",
    "заверш",
)


def _ln_tag(tag: str) -> str:
    if "}" in str(tag or ""):
        return str(tag).rsplit("}", 1)[-1].lower()
    return str(tag or "").lower()


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_node_ids(value: Any) -> List[str]:
    if isinstance(value, list):
        raw = value
    elif value is None:
        raw = []
    else:
        raw = [value]
    out: List[str] = []
    seen: Set[str] = set()
    for item in raw:
        node_id = _to_text(item)
        if not node_id or node_id in seen:
            continue
        seen.add(node_id)
        out.append(node_id)
    return out


def parse_bpmn_sequence_graph(xml_text: str) -> Dict[str, Any]:
    raw = _to_text(xml_text)
    empty = {
        "node_ids": set(),
        "node_type_by_id": {},
        "node_name_by_id": {},
        "node_process_by_id": {},
        "gateway_mode_by_node": {},
        "default_flow_by_gateway": {},
        "start_event_ids": [],
        "end_event_ids": [],
        "flow_ids": set(),
        "flow_by_id": {},
        "outgoing_by_node": {},
        "incoming_by_node": {},
        "participant_process_by_id": {},
        "participant_name_by_id": {},
        "message_flow_ids": set(),
        "message_flow_by_id": {},
        "message_outgoing_by_node": {},
        "message_incoming_by_node": {},
        "message_definitions_by_id": {},
        "signal_definitions_by_id": {},
        "event_contract_by_node": {},
    }
    if not raw:
        return empty

    try:
        root = ET.fromstring(raw)
    except Exception:
        return empty

    node_ids: Set[str] = set()
    node_type_by_id: Dict[str, str] = {}
    node_name_by_id: Dict[str, str] = {}
    node_process_by_id: Dict[str, str] = {}
    gateway_mode_by_node: Dict[str, str] = {}
    default_flow_by_gateway: Dict[str, str] = {}
    start_event_ids: List[str] = []
    end_event_ids: List[str] = []
    participant_process_by_id: Dict[str, str] = {}
    participant_name_by_id: Dict[str, str] = {}
    message_definitions_by_id: Dict[str, Dict[str, str]] = {}
    signal_definitions_by_id: Dict[str, Dict[str, str]] = {}
    event_contract_by_node: Dict[str, Dict[str, str]] = {}

    def walk(el: Any, current_process_id: str = "") -> None:
        local = _ln_tag(str(getattr(el, "tag", "") or ""))
        next_process_id = current_process_id
        if local == "process":
            next_process_id = _to_text(el.attrib.get("id"))
        if local == "message":
            message_id = _to_text(el.attrib.get("id"))
            if message_id:
                message_definitions_by_id[message_id] = {
                    "id": message_id,
                    "name": _to_text(el.attrib.get("name")) or message_id,
                }
        if local == "signal":
            signal_id = _to_text(el.attrib.get("id"))
            if signal_id:
                signal_definitions_by_id[signal_id] = {
                    "id": signal_id,
                    "name": _to_text(el.attrib.get("name")) or signal_id,
                }
        if local == "participant":
            participant_id = _to_text(el.attrib.get("id"))
            process_ref = _to_text(el.attrib.get("processRef"))
            if participant_id:
                participant_process_by_id[participant_id] = process_ref
                participant_name_by_id[participant_id] = _to_text(el.attrib.get("name")) or participant_id
        if local in _FLOW_NODE_TAGS:
            node_id = _to_text(el.attrib.get("id"))
            if node_id:
                node_ids.add(node_id)
                node_type_by_id[node_id] = local
                node_name_by_id[node_id] = _to_text(el.attrib.get("name")) or node_id
                node_process_by_id[node_id] = next_process_id
                if local == "startevent":
                    start_event_ids.append(node_id)
                if local == "endevent":
                    end_event_ids.append(node_id)
                mode = _GATEWAY_MODE_BY_TAG.get(local)
                if mode:
                    gateway_mode_by_node[node_id] = mode
                    default_flow = _to_text(el.attrib.get("default"))
                    if default_flow:
                        default_flow_by_gateway[node_id] = default_flow
                event_defs = [
                    child for child in list(el)
                    if _ln_tag(str(getattr(child, "tag", "") or "")) in _MESSAGE_EVENT_TAGS
                ]
                if event_defs:
                    def_node = event_defs[0]
                    def_local = _ln_tag(str(getattr(def_node, "tag", "") or ""))
                    event_contract_by_node[node_id] = {
                        "kind": "message" if def_local == "messageeventdefinition" else "signal",
                        "definition_type": def_local,
                        "ref": _to_text(def_node.attrib.get("messageRef") or def_node.attrib.get("signalRef")),
                        "name": _to_text(el.attrib.get("name")) or node_id,
                    }
        for child in list(el):
            walk(child, next_process_id)

    walk(root, "")

    flow_ids: Set[str] = set()
    flow_by_id: Dict[str, Dict[str, str]] = {}
    outgoing_by_node: Dict[str, List[str]] = {}
    incoming_by_node: Dict[str, List[str]] = {}
    for el in root.iter():
        if _ln_tag(str(getattr(el, "tag", "") or "")) != "sequenceflow":
            continue
        flow_id = _to_text(el.attrib.get("id"))
        source_id = _to_text(el.attrib.get("sourceRef"))
        target_id = _to_text(el.attrib.get("targetRef"))
        if not flow_id or not source_id or not target_id:
            continue
        flow_ids.add(flow_id)
        flow_by_id[flow_id] = {
            "id": flow_id,
            "source": source_id,
            "target": target_id,
            "label": _to_text(el.attrib.get("name")),
        }
        outgoing_by_node.setdefault(source_id, []).append(flow_id)
        incoming_by_node.setdefault(target_id, []).append(flow_id)

    for node_id in node_ids:
        outgoing_by_node.setdefault(node_id, [])
        incoming_by_node.setdefault(node_id, [])

    message_flow_ids: Set[str] = set()
    message_flow_by_id: Dict[str, Dict[str, str]] = {}
    message_outgoing_by_node: Dict[str, List[str]] = {}
    message_incoming_by_node: Dict[str, List[str]] = {}
    for el in root.iter():
        if _ln_tag(str(getattr(el, "tag", "") or "")) != "messageflow":
            continue
        flow_id = _to_text(el.attrib.get("id"))
        source_id = _to_text(el.attrib.get("sourceRef"))
        target_id = _to_text(el.attrib.get("targetRef"))
        if not flow_id or not source_id or not target_id:
            continue
        message_flow_ids.add(flow_id)
        message_flow_by_id[flow_id] = {
            "id": flow_id,
            "source": source_id,
            "target": target_id,
            "label": _to_text(el.attrib.get("name")),
        }
        message_outgoing_by_node.setdefault(source_id, []).append(flow_id)
        message_incoming_by_node.setdefault(target_id, []).append(flow_id)

    start_event_ids = sorted(set(start_event_ids))
    end_event_ids = sorted(set(end_event_ids))

    return {
        "node_ids": node_ids,
        "node_type_by_id": node_type_by_id,
        "node_name_by_id": node_name_by_id,
        "node_process_by_id": node_process_by_id,
        "gateway_mode_by_node": gateway_mode_by_node,
        "default_flow_by_gateway": default_flow_by_gateway,
        "start_event_ids": start_event_ids,
        "end_event_ids": end_event_ids,
        "flow_ids": flow_ids,
        "flow_by_id": flow_by_id,
        "outgoing_by_node": outgoing_by_node,
        "incoming_by_node": incoming_by_node,
        "participant_process_by_id": participant_process_by_id,
        "participant_name_by_id": participant_name_by_id,
        "message_flow_ids": message_flow_ids,
        "message_flow_by_id": message_flow_by_id,
        "message_outgoing_by_node": message_outgoing_by_node,
        "message_incoming_by_node": message_incoming_by_node,
        "message_definitions_by_id": message_definitions_by_id,
        "signal_definitions_by_id": signal_definitions_by_id,
        "event_contract_by_node": event_contract_by_node,
    }


def _choose_default_scope_start(graph: Dict[str, Any]) -> str:
    start_ids = [node_id for node_id in (graph.get("start_event_ids") or []) if _to_text(node_id)]
    if start_ids:
        return sorted(start_ids)[0]
    return ""


def _classify_end_ids(graph: Dict[str, Any], candidate_ids: List[str]) -> Tuple[List[str], List[str]]:
    node_name_by_id = graph.get("node_name_by_id") or {}
    end_ids = [node_id for node_id in candidate_ids if _to_text(node_id)]
    fail_ids: List[str] = []
    success_ids: List[str] = []
    for node_id in end_ids:
        title = _to_text(node_name_by_id.get(node_id)).lower()
        is_fail = any(token in title for token in _FAIL_NAME_TOKENS)
        is_success = any(token in title for token in _SUCCESS_NAME_TOKENS)
        if is_fail and not is_success:
            fail_ids.append(node_id)
        else:
            success_ids.append(node_id)
    if not success_ids:
        success_ids = list(end_ids)
    if not fail_ids:
        fail_ids = [node_id for node_id in end_ids if node_id not in success_ids]
    return sorted(set(success_ids)), sorted(set(fail_ids))


def resolve_inference_inputs(
    graph: Dict[str, Any],
    *,
    scope_start_id: str,
    success_end_ids: Any,
    fail_end_ids: Any,
) -> Dict[str, Any]:
    resolved_scope = _to_text(scope_start_id) or _choose_default_scope_start(graph)
    success_ids = _normalize_node_ids(success_end_ids)
    fail_ids = _normalize_node_ids(fail_end_ids)

    known_node_ids: Set[str] = set(graph.get("node_ids") or set())
    success_ids = [node_id for node_id in success_ids if node_id in known_node_ids]
    fail_ids = [node_id for node_id in fail_ids if node_id in known_node_ids]

    if not success_ids and not fail_ids:
        default_success, default_fail = _classify_end_ids(graph, list(graph.get("end_event_ids") or []))
        success_ids = default_success
        fail_ids = default_fail
    elif not success_ids:
        success_ids = [node_id for node_id in (graph.get("end_event_ids") or []) if node_id not in fail_ids]
    elif not fail_ids:
        fail_ids = [node_id for node_id in (graph.get("end_event_ids") or []) if node_id not in success_ids]

    return {
        "scope_start_id": resolved_scope,
        "success_end_ids": sorted(set(success_ids)),
        "fail_end_ids": sorted(set(fail_ids)),
    }


def _collect_scope(
    graph: Dict[str, Any],
    scope_start_id: str,
) -> Dict[str, Set[str]]:
    flow_by_id = graph.get("flow_by_id") or {}
    outgoing_by_node = graph.get("outgoing_by_node") or {}
    start_id = _to_text(scope_start_id)
    if not start_id:
        return {"node_ids": set(), "flow_ids": set()}

    node_ids: Set[str] = set()
    flow_ids: Set[str] = set()
    queue: deque[str] = deque([start_id])
    while queue:
        node_id = _to_text(queue.popleft())
        if not node_id or node_id in node_ids:
            continue
        node_ids.add(node_id)
        for flow_id in outgoing_by_node.get(node_id, []) or []:
            fid = _to_text(flow_id)
            flow = flow_by_id.get(fid) or {}
            target_id = _to_text(flow.get("target"))
            if not fid or not target_id:
                continue
            flow_ids.add(fid)
            if target_id not in node_ids:
                queue.append(target_id)
    return {"node_ids": node_ids, "flow_ids": flow_ids}


def _compute_distances_to_targets(
    graph: Dict[str, Any],
    scope_node_ids: Set[str],
    scope_flow_ids: Set[str],
    target_node_ids: List[str],
) -> Dict[str, int]:
    if not target_node_ids:
        return {}
    flow_by_id = graph.get("flow_by_id") or {}
    incoming_by_node = graph.get("incoming_by_node") or {}

    dist: Dict[str, int] = {}
    queue: deque[str] = deque()
    for node_id in target_node_ids:
        nid = _to_text(node_id)
        if not nid or nid not in scope_node_ids:
            continue
        if nid in dist:
            continue
        dist[nid] = 0
        queue.append(nid)

    while queue:
        node_id = _to_text(queue.popleft())
        base = int(dist.get(node_id, 0))
        for incoming_flow_id in incoming_by_node.get(node_id, []) or []:
            fid = _to_text(incoming_flow_id)
            if not fid or fid not in scope_flow_ids:
                continue
            source_id = _to_text((flow_by_id.get(fid) or {}).get("source"))
            if not source_id or source_id not in scope_node_ids:
                continue
            cand = base + 1
            cur = dist.get(source_id)
            if cur is None or cand < cur:
                dist[source_id] = cand
                queue.append(source_id)
    return dist


def _compute_loop_trap_nodes(
    graph: Dict[str, Any],
    scope_node_ids: Set[str],
    scope_flow_ids: Set[str],
) -> Dict[str, bool]:
    flow_by_id = graph.get("flow_by_id") or {}
    outgoing_by_node = graph.get("outgoing_by_node") or {}

    index = 0
    stack: List[str] = []
    on_stack: Set[str] = set()
    idx_by_node: Dict[str, int] = {}
    low_by_node: Dict[str, int] = {}
    node_to_scc: Dict[str, int] = {}
    scc_nodes: List[Set[str]] = []

    def strong_connect(node_id: str) -> None:
        nonlocal index
        idx_by_node[node_id] = index
        low_by_node[node_id] = index
        index += 1
        stack.append(node_id)
        on_stack.add(node_id)

        for flow_id in outgoing_by_node.get(node_id, []) or []:
            fid = _to_text(flow_id)
            if not fid or fid not in scope_flow_ids:
                continue
            target_id = _to_text((flow_by_id.get(fid) or {}).get("target"))
            if not target_id or target_id not in scope_node_ids:
                continue
            if target_id not in idx_by_node:
                strong_connect(target_id)
                low_by_node[node_id] = min(low_by_node[node_id], low_by_node[target_id])
            elif target_id in on_stack:
                low_by_node[node_id] = min(low_by_node[node_id], idx_by_node[target_id])

        if low_by_node[node_id] == idx_by_node[node_id]:
            members: Set[str] = set()
            while stack:
                w = stack.pop()
                on_stack.discard(w)
                members.add(w)
                if w == node_id:
                    break
            scc_idx = len(scc_nodes)
            scc_nodes.append(members)
            for member in members:
                node_to_scc[member] = scc_idx

    for node_id in sorted(scope_node_ids):
        if node_id not in idx_by_node:
            strong_connect(node_id)

    loop_trap_by_node: Dict[str, bool] = {}
    for scc_idx, members in enumerate(scc_nodes):
        has_cycle = len(members) > 1
        if not has_cycle:
            single = next(iter(members))
            for flow_id in outgoing_by_node.get(single, []) or []:
                fid = _to_text(flow_id)
                if not fid or fid not in scope_flow_ids:
                    continue
                target_id = _to_text((flow_by_id.get(fid) or {}).get("target"))
                if target_id == single:
                    has_cycle = True
                    break

        has_exit = False
        for member in members:
            for flow_id in outgoing_by_node.get(member, []) or []:
                fid = _to_text(flow_id)
                if not fid or fid not in scope_flow_ids:
                    continue
                target_id = _to_text((flow_by_id.get(fid) or {}).get("target"))
                if not target_id:
                    continue
                if target_id not in members:
                    has_exit = True
                    break
            if has_exit:
                break

        is_trap = bool(has_cycle and not has_exit)
        for member in members:
            if node_to_scc.get(member) == scc_idx:
                loop_trap_by_node[member] = is_trap

    return loop_trap_by_node


def infer_rtiers(params: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
    xml_text = _to_text((params or {}).get("bpmnXml"))
    graph = parse_bpmn_sequence_graph(xml_text)
    if not graph.get("flow_ids"):
        return {}

    resolved = resolve_inference_inputs(
        graph,
        scope_start_id=_to_text((params or {}).get("scopeStartId")),
        success_end_ids=(params or {}).get("successEndIds"),
        fail_end_ids=(params or {}).get("failEndIds"),
    )
    scope_start_id = _to_text(resolved.get("scope_start_id"))
    scope = _collect_scope(graph, scope_start_id)
    scope_node_ids = set(scope.get("node_ids") or set())
    scope_flow_ids = set(scope.get("flow_ids") or set())
    if not scope_node_ids or not scope_flow_ids:
        return {}

    flow_by_id = graph.get("flow_by_id") or {}
    outgoing_by_node = graph.get("outgoing_by_node") or {}
    gateway_mode_by_node = graph.get("gateway_mode_by_node") or {}
    default_flow_by_gateway = graph.get("default_flow_by_gateway") or {}

    dist_success = _compute_distances_to_targets(
        graph,
        scope_node_ids,
        scope_flow_ids,
        _normalize_node_ids(resolved.get("success_end_ids")),
    )
    dist_fail = _compute_distances_to_targets(
        graph,
        scope_node_ids,
        scope_flow_ids,
        _normalize_node_ids(resolved.get("fail_end_ids")),
    )
    loop_trap_by_node = _compute_loop_trap_nodes(graph, scope_node_ids, scope_flow_ids)

    inferred: Dict[str, Dict[str, str]] = {}
    for gateway_id in sorted(scope_node_ids):
        if _to_text(gateway_mode_by_node.get(gateway_id)) != "xor":
            continue
        outgoing_ids = [
            _to_text(flow_id)
            for flow_id in (outgoing_by_node.get(gateway_id) or [])
            if _to_text(flow_id) in scope_flow_ids
        ]
        if len(outgoing_ids) <= 1:
            continue

        default_flow_id = _to_text(default_flow_by_gateway.get(gateway_id))
        rows: List[Dict[str, Any]] = []
        for flow_id in sorted(set(outgoing_ids)):
            flow = flow_by_id.get(flow_id) or {}
            target_id = _to_text(flow.get("target"))
            dist_to_success = dist_success.get(target_id)
            dist_to_fail = dist_fail.get(target_id)
            rows.append(
                {
                    "flow_id": flow_id,
                    "target_id": target_id,
                    "can_reach_success": dist_to_success is not None,
                    "dist_to_success": dist_to_success,
                    "can_reach_fail": dist_to_fail is not None,
                    "dist_to_fail": dist_to_fail,
                    "is_loop_trap": bool(loop_trap_by_node.get(target_id)),
                    "is_default": flow_id == default_flow_id,
                }
            )

        success_rows = [row for row in rows if row.get("can_reach_success")]
        success_rows.sort(
            key=lambda row: (
                int(row.get("dist_to_success")) if row.get("dist_to_success") is not None else 10**9,
                0 if row.get("is_default") else 1,
                _to_text(row.get("flow_id")),
            )
        )

        top_success_flow_id = _to_text(success_rows[0]["flow_id"]) if success_rows else ""
        second_success_flow_id = _to_text(success_rows[1]["flow_id"]) if len(success_rows) > 1 else ""

        for idx, row in enumerate(success_rows):
            flow_id = _to_text(row.get("flow_id"))
            if not flow_id:
                continue
            if flow_id == top_success_flow_id:
                reason_parts = [
                    f"gateway={gateway_id}",
                    f"distToSuccess={row.get('dist_to_success')}",
                ]
                if row.get("is_default"):
                    reason_parts.append("defaultFlow")
                reason_parts.append("rank=1")
                inferred[flow_id] = {"rtier": "R0", "reason": ", ".join(reason_parts)}
                continue
            if flow_id == second_success_flow_id:
                reason_parts = [
                    f"gateway={gateway_id}",
                    f"distToSuccess={row.get('dist_to_success')}",
                    "rank=2",
                ]
                if row.get("is_default"):
                    reason_parts.append("defaultFlow")
                inferred[flow_id] = {"rtier": "R1", "reason": ", ".join(reason_parts)}
                continue
            reason_parts = [
                f"gateway={gateway_id}",
                f"distToSuccess={row.get('dist_to_success')}",
                f"rank={idx + 1}",
                "alternateSuccess",
            ]
            inferred[flow_id] = {"rtier": "R1", "reason": ", ".join(reason_parts)}

        for row in rows:
            flow_id = _to_text(row.get("flow_id"))
            if not flow_id or flow_id in inferred:
                continue
            reason_parts: List[str] = [f"gateway={gateway_id}"]
            if row.get("can_reach_fail"):
                reason_parts.append(f"distToFail={row.get('dist_to_fail')}")
                reason_parts.append("leadsToFail")
            if not row.get("can_reach_success"):
                reason_parts.append("noSuccessReachability")
            if row.get("is_loop_trap"):
                reason_parts.append("loopTrap")
            if row.get("is_default"):
                reason_parts.append("defaultFlow")
            if not reason_parts:
                reason_parts = [f"gateway={gateway_id}", "fallbackR2"]
            inferred[flow_id] = {"rtier": "R2", "reason": ", ".join(reason_parts)}

    return inferred
