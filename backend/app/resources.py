from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .models import Edge, Node, Question


@dataclass
class Interval:
    equipment_id: str
    node_id: str
    actor_role: str
    start_min: int
    end_min: int
    duration_min: Optional[int]


def _build_graph(nodes: List[Node], edges: List[Edge]) -> Tuple[Dict[str, List[str]], Dict[str, List[str]]]:
    by_id = {n.id: n for n in nodes}
    succ: Dict[str, List[str]] = {n.id: [] for n in nodes}
    pred: Dict[str, List[str]] = {n.id: [] for n in nodes}

    for e in edges:
        if e.from_id not in by_id or e.to_id not in by_id:
            continue
        succ[e.from_id].append(e.to_id)
        pred[e.to_id].append(e.from_id)

    return pred, succ


def _toposort(nodes: List[Node], pred: Dict[str, List[str]], succ: Dict[str, List[str]]) -> List[str]:
    indeg: Dict[str, int] = {n.id: len(pred.get(n.id, [])) for n in nodes}
    q = [nid for nid, d in indeg.items() if d == 0]
    out: List[str] = []
    seen = set()

    while q:
        nid = q.pop(0)
        if nid in seen:
            continue
        seen.add(nid)
        out.append(nid)
        for nxt in succ.get(nid, []):
            indeg[nxt] = max(0, indeg.get(nxt, 0) - 1)
            if indeg[nxt] == 0:
                q.append(nxt)

    for n in nodes:
        if n.id not in seen:
            out.append(n.id)

    return out


def _schedule(nodes: List[Node], edges: List[Edge]) -> Dict[str, Dict[str, Any]]:
    pred, succ = _build_graph(nodes, edges)
    order = _toposort(nodes, pred, succ)

    by_id = {n.id: n for n in nodes}
    start: Dict[str, int] = {}
    end: Dict[str, int] = {}

    for nid in order:
        ps = pred.get(nid, [])
        s = 0
        for p in ps:
            s = max(s, end.get(p, 0))
        n = by_id[nid]
        d = n.duration_min if n.duration_min is not None else 0
        start[nid] = s
        end[nid] = s + d

    report: Dict[str, Dict[str, Any]] = {}
    for nid in order:
        n = by_id[nid]
        report[nid] = {
            "start_min": start[nid],
            "end_min": end[nid],
            "duration_min": n.duration_min,
            "actor_role": (n.actor_role or "").strip() or "unassigned",
            "equipment": list(n.equipment or []),
        }
        n.parameters["_sched"] = {"start_min": start[nid], "end_min": end[nid], "duration_min": n.duration_min}

    return report


def _build_intervals(nodes: List[Node], sched: Dict[str, Dict[str, Any]]) -> List[Interval]:
    out: List[Interval] = []
    for n in nodes:
        row = sched.get(n.id) or {}
        s = int(row.get("start_min", 0))
        e = int(row.get("end_min", 0))
        actor = (row.get("actor_role") or "").strip() or "unassigned"
        dur = n.duration_min
        for eq in (n.equipment or []):
            eqid = (eq or "").strip()
            if not eqid:
                continue
            out.append(
                Interval(
                    equipment_id=eqid,
                    node_id=n.id,
                    actor_role=actor,
                    start_min=s,
                    end_min=e,
                    duration_min=dur,
                )
            )
    return out


def _detect_conflicts(intervals: List[Interval]) -> Tuple[Dict[str, Any], List[str], List[Question]]:
    by_eq: Dict[str, List[Interval]] = {}
    for it in intervals:
        by_eq.setdefault(it.equipment_id, []).append(it)

    equipment_report: List[Dict[str, Any]] = []
    conflict_nodes: List[str] = []
    questions: List[Question] = []

    for eqid, items in sorted(by_eq.items(), key=lambda x: x[0]):
        items_sorted = sorted(items, key=lambda x: (x.start_min, x.end_min, x.node_id))
        conflicts: List[Dict[str, Any]] = []

        for i in range(len(items_sorted) - 1):
            a = items_sorted[i]
            b = items_sorted[i + 1]

            overlap = (a.end_min > b.start_min) and (a.duration_min is not None) and (b.duration_min is not None)
            unknown = (a.duration_min is None) or (b.duration_min is None)

            if overlap or unknown:
                kind = "overlap" if overlap else "unknown"
                conflicts.append(
                    {
                        "kind": kind,
                        "a": {
                            "node_id": a.node_id,
                            "actor_role": a.actor_role,
                            "start_min": a.start_min,
                            "end_min": a.end_min,
                            "duration_min": a.duration_min,
                        },
                        "b": {
                            "node_id": b.node_id,
                            "actor_role": b.actor_role,
                            "start_min": b.start_min,
                            "end_min": b.end_min,
                            "duration_min": b.duration_min,
                        },
                    }
                )
                conflict_nodes.extend([a.node_id, b.node_id])

        eq_row = {
            "equipment_id": eqid,
            "intervals": [
                {
                    "node_id": x.node_id,
                    "actor_role": x.actor_role,
                    "start_min": x.start_min,
                    "end_min": x.end_min,
                    "duration_min": x.duration_min,
                }
                for x in items_sorted
            ],
            "conflicts": conflicts,
        }
        equipment_report.append(eq_row)

        for idx, c in enumerate(conflicts[:10]):
            a = c["a"]
            b = c["b"]
            qid = f"res_conflict_{eqid}_{idx}"
            qtext = (
                f"Возможный конфликт оборудования '{eqid}': "
                f"{a['node_id']} ({a['actor_role']}, {a['start_min']}–{a['end_min']} мин) "
                f"и {b['node_id']} ({b['actor_role']}, {b['start_min']}–{b['end_min']} мин). "
                f"Как решаем?"
            )
            opts = [
                "Нужно второе такое же оборудование",
                "Делаем очередь (не параллельно)",
                "Параллельно нельзя по технологии",
                "Уточнить длительность шагов",
                "Другое",
            ]
            questions.append(
                Question(
                    id=qid,
                    node_id=a["node_id"],
                    issue_type="VARIANT",
                    question=qtext,
                    options=opts,
                )
            )

    conflict_nodes = sorted(list(set(conflict_nodes)))
    return {"equipment": equipment_report}, conflict_nodes, questions


def build_resources_report(nodes: List[Node], edges: List[Edge]) -> Tuple[Dict[str, Any], List[Question]]:
    sched = _schedule(nodes, edges)
    intervals = _build_intervals(nodes, sched)
    eq_report, conflict_nodes, conflict_questions = _detect_conflicts(intervals)

    by_id = {n.id: n for n in nodes}
    for nid, n in by_id.items():
        n.parameters.pop("_res_conflict", None)
        n.parameters.pop("_res_conflict_kind", None)

    for nid in conflict_nodes:
        n = by_id.get(nid)
        if not n:
            continue
        n.parameters["_res_conflict"] = True
        n.parameters["_res_conflict_kind"] = "equipment_overlap_or_unknown"

    report = {
        "schedule": sched,
        "equipment": eq_report.get("equipment", []),
        "conflict_nodes": conflict_nodes,
    }
    return report, conflict_questions
