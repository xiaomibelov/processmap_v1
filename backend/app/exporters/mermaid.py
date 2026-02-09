from __future__ import annotations
from typing import List
from ..models import Edge, Node
def render_mermaid(nodes: List[Node], edges: List[Edge]) -> str:
    lines = ["flowchart TD"]
    for n in nodes:
        label = n.title.replace('"', "'")
        if n.type == "decision":
            lines.append(f'  {n.id}{{"{label}"}}')
        elif n.type == "loss_event":
            lines.append(f'  {n.id}(["{label}"])')
        else:
            lines.append(f'  {n.id}["{label}"]')
    for e in edges:
        if e.when:
            lines.append(f"  {e.from_id} -- {e.when} --> {e.to_id}")
        else:
            lines.append(f"  {e.from_id} --> {e.to_id}")
    return "\n".join(lines) + "\n"
