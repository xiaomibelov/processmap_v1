from __future__ import annotations

from typing import Dict, List, Optional

from ..models import Edge, Node


def _render_node(n: Node) -> str:
    label = n.title.replace('"', "'")
    if n.type == "decision":
        return f'  {n.id}{{"{label}"}}'
    if n.type == "loss_event":
        return f'  {n.id}(["{label}"])'
    if n.type == "timer":
        return f'  {n.id}([ "{label}" ])'
    if n.type == "message":
        return f'  {n.id}[[ "{label}" ]]'
    return f'  {n.id}["{label}"]'


def render_mermaid(nodes: List[Node], edges: List[Edge], roles: Optional[List[str]] = None) -> str:
    lines: List[str] = ["flowchart LR"]

    role_order = [r for r in (roles or []) if r]
    if not role_order:
        role_order = sorted({n.actor_role for n in nodes if n.actor_role})

    buckets: Dict[str, List[Node]] = {}
    for n in nodes:
        key = n.actor_role or "unassigned"
        buckets.setdefault(key, []).append(n)

    ordered_keys = []
    for r in role_order:
        if r in buckets:
            ordered_keys.append(r)
    for k in sorted(buckets.keys()):
        if k not in ordered_keys and k != "unassigned":
            ordered_keys.append(k)
    if "unassigned" in buckets:
        ordered_keys.append("unassigned")

    for k in ordered_keys:
        title = k
        if k == "unassigned":
            title = "unassigned"
        lines.append(f'  subgraph {k}["{title}"]')
        for n in buckets.get(k, []):
            lines.append(_render_node(n))
        lines.append("  end")

    for e in edges:
        if e.when:
            lines.append(f"  {e.from_id} -- {e.when} --> {e.to_id}")
        else:
            lines.append(f"  {e.from_id} --> {e.to_id}")

    for n in nodes:
        lines.append(f'  click {n.id} "#node={n.id}" "выбрать узел"')

    return "\n".join(lines) + "\n"
