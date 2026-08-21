from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .models import Session, Node


def _node_role(n: Node) -> str:
    r = (n.actor_role or "").strip()
    return r if r else "unassigned"


def _node_duration_min(n: Node) -> Optional[int]:
    if getattr(n, "duration_min", None) is not None:
        try:
            return int(getattr(n, "duration_min"))
        except Exception:
            return None
    try:
        params = getattr(n, "parameters", None) or {}
        sched = (params.get("_sched") or {})
        dm = sched.get("duration_min")
        if dm is None:
            return None
        return int(dm)
    except Exception:
        return None


def _section_for_node(n: Node) -> str:
    t = (getattr(n, "title", "") or "").lower()
    ntype = getattr(n, "type", "step")

    if ntype == "timer":
        return "wait"

    qc = getattr(n, "qc", None) or []
    if qc:
        return "qc"
    if "контрол" in t or "провер" in t or "дегуст" in t or "взвес" in t:
        return "qc"

    if "мойк" in t or "сан" in t or "уборк" in t or "дезинф" in t or "утилиз" in t:
        return "clean"

    if "упак" in t or "маркир" in t or "этикет" in t:
        return "pack"

    if "жар" in t or "вар" in t or "выпек" in t or "печ" in t or "туш" in t or "кип" in t or "охлаж" in t:
        return "cook"

    if "подготов" in t or "нарез" in t or "замес" in t or "смеш" in t or "разогрев" in t or "размер" in t:
        return "prep"

    if "перед" in t or "перемест" in t or "отнести" in t or "перелож" in t:
        return "move"

    return "other"


def _build_graph_edges(session: Session) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for e in (getattr(session, "edges", None) or []):
        a = getattr(e, "from_id", None)
        b = getattr(e, "to_id", None)
        if a and b:
            out.append((str(a), str(b)))
    return out


def _critical_path_min(session: Session, durations: Dict[str, int]) -> Optional[int]:
    edges = _build_graph_edges(session)
    nodes = {n.id for n in (getattr(session, "nodes", None) or []) if getattr(n, "id", None)}

    adj: Dict[str, List[str]] = {nid: [] for nid in nodes}
    indeg: Dict[str, int] = {nid: 0 for nid in nodes}

    for a, b in edges:
        if a not in nodes or b not in nodes:
            continue
        adj[a].append(b)
        indeg[b] += 1

    q = [nid for nid in nodes if indeg[nid] == 0]
    topo: List[str] = []
    while q:
        v = q.pop()
        topo.append(v)
        for u in adj.get(v, []):
            indeg[u] -= 1
            if indeg[u] == 0:
                q.append(u)

    if len(topo) != len(nodes):
        return None

    dp: Dict[str, int] = {nid: durations.get(nid, 0) for nid in topo}
    for v in topo:
        for u in adj.get(v, []):
            cand = dp[v] + durations.get(u, 0)
            if cand > dp.get(u, 0):
                dp[u] = cand

    return max(dp.values()) if dp else 0


def compute_analytics(session: Session) -> Dict[str, Any]:
    nodes = getattr(session, "nodes", None) or []
    edges = getattr(session, "edges", None) or []
    questions = getattr(session, "questions", None) or []

    durations_int: Dict[str, int] = {}
    unknown_duration_nodes: List[str] = []

    by_role_duration: Dict[str, int] = {}
    by_role_actions: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    by_section: Dict[str, int] = {}

    for n in nodes:
        nid = n.id
        ntype = getattr(n, "type", "step")
        by_type[ntype] = by_type.get(ntype, 0) + 1

        role = _node_role(n)
        by_role_actions[role] = by_role_actions.get(role, 0) + 1

        sec = _section_for_node(n)
        by_section[sec] = by_section.get(sec, 0) + 1

        dm = _node_duration_min(n)
        if dm is None:
            unknown_duration_nodes.append(nid)
            continue

        if dm < 0:
            dm = 0
        durations_int[nid] = dm
        by_role_duration[role] = by_role_duration.get(role, 0) + dm

    total_duration_min = sum(durations_int.values())

    node_role_map = {n.id: _node_role(n) for n in nodes}
    handoff_edges: List[Dict[str, Any]] = []
    handoff_count = 0
    for e in edges:
        a = getattr(e, "from_id", None)
        b = getattr(e, "to_id", None)
        if not a or not b:
            continue
        ra = node_role_map.get(str(a), "unassigned")
        rb = node_role_map.get(str(b), "unassigned")
        if ra != rb:
            handoff_count += 1
            handoff_edges.append({"from": str(a), "to": str(b), "from_role": ra, "to_role": rb})

    open_q = [q for q in questions if getattr(q, "status", "") == "open"]
    critical_q = [q for q in open_q if getattr(q, "issue_type", "") == "CRITICAL"]

    critical_path = _critical_path_min(session, durations_int)

    summary: List[str] = []
    if critical_path is None:
        summary.append(f"Оценка длительности: {total_duration_min} мин (критический путь: N/A — цикл/не-DAG).")
    else:
        summary.append(f"Оценка длительности: {total_duration_min} мин (критический путь {critical_path} мин).")

    if nodes:
        parts = ", ".join([f"{k}={v}" for k, v in sorted(by_section.items(), key=lambda kv: (-kv[1], kv[0]))])
        summary.append(f"Действий: {len(nodes)} ({parts}).")
    else:
        summary.append("Действий: 0.")

    summary.append(f"Передач между ролями: {handoff_count}. Узлов без длительности: {len(unknown_duration_nodes)}.")
    summary.append(f"Открытых вопросов: {len(open_q)} (критических: {len(critical_q)}).")

    return {
        "session_id": session.id,
        "version": 1,
        "timing": {
            "total_duration_min": total_duration_min,
            "critical_path_min": critical_path,
            "by_role": by_role_duration,
            "unknown_duration_nodes": unknown_duration_nodes,
        },
        "actions": {
            "total": len(nodes),
            "by_type": by_type,
            "by_role": by_role_actions,
            "by_section": by_section,
        },
        "handoffs": {"count": handoff_count, "edges": handoff_edges},
        "coverage": {"open_questions": len(open_q), "critical_questions": len(critical_q)},
        "summary": summary,
    }
