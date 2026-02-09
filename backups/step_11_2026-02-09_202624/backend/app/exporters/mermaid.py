from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

from ..models import Edge, Node


HEAT_VERBS = ("включ", "нагр", "кип", "довести до кип", "варить", "подогр", "томить", "обжар", "пассиров")
TRANSFER_VERBS = ("перел", "слить", "налить", "долить", "перемест", "перелож")
MARKING_WORDS = ("маркир", "этикет", "наклей", "стикер")
WASH_WORDS = ("помыть", "мойка", "протереть", "санобработ", "дезинфек")
LOSS_WORDS = ("списан", "списание", "потер", "брак", "утилиз")


def _esc(s: str) -> str:
    t = (s or "").strip()
    t = re.sub(r"\s+", " ", t)
    t = t.replace('"', "'")
    return t


def _node_label(n: Node) -> str:
    t = _esc(n.title)
    if n.type == "timer":
        if n.duration_min is not None:
            return f"⏱ {t} ({n.duration_min} мин)"
        return f"⏱ {t}"
    if n.type == "message":
        if n.recipient_role:
            return f"✉ {t} → {n.recipient_role}"
        return f"✉ {t}"
    if n.type == "loss_event":
        return f"🗑 {t}"
    if n.type == "fork":
        return f"⫶ {t or 'Параллельно'}"
    if n.type == "join":
        return f"⫷ {t or 'Слияние'}"
    if n.type == "decision":
        return f"{t}"
    return t


def _node_def(n: Node) -> str:
    label = _node_label(n)
    if n.type == "decision":
        return f'{n.id}{{"{label}"}}'
    if n.type == "timer":
        return f'{n.id}(["{label}"])'
    if n.type == "message":
        return f'{n.id}["{label}"]'
    if n.type == "loss_event":
        return f'{n.id}[/\"{label}\"/]'
    if n.type == "fork":
        return f'{n.id}((\"{label}\"))'
    if n.type == "join":
        return f'{n.id}((\"{label}\"))'
    return f'{n.id}["{label}"]'


def _needs_heat_params(title: str) -> bool:
    t = (title or "").lower()
    return any(v in t for v in HEAT_VERBS)


def _is_ambig_title(title: str) -> bool:
    t = (title or "").lower()
    return bool(re.search(r"\bсильн(ый|о)\b|\bсредн(ий|е)\b|\bмедленн(о|ый)\b", t))


def _needs_equipment(n: Node) -> bool:
    t = (n.title or "").lower()
    touches = _needs_heat_params(n.title) or any(w in t for w in TRANSFER_VERBS) or any(w in t for w in MARKING_WORDS)
    if n.type in ("loss_event", "decision", "fork", "join", "timer", "message"):
        return False
    if touches:
        return len(n.equipment) == 0
    return False


def _needs_disposition(n: Node) -> bool:
    if n.type in ("decision", "fork", "join", "timer", "message"):
        return False
    return not bool(n.disposition)


def _unknown_terms(n: Node) -> bool:
    norm = (n.parameters or {}).get("_norm") or {}
    unk = norm.get("unknown_terms") or []
    return bool(unk)


def _is_loss(n: Node) -> bool:
    if n.type == "loss_event":
        return True
    t = (n.title or "").lower()
    return any(w in t for w in LOSS_WORDS)


def _is_marking(n: Node) -> bool:
    t = (n.title or "").lower()
    return any(w in t for w in MARKING_WORDS)


def _is_wash(n: Node) -> bool:
    t = (n.title or "").lower()
    return any(w in t for w in WASH_WORDS)


def _severity(n: Node) -> str:
    if n.type == "timer" and n.duration_min is None:
        return "critical"
    if _needs_heat_params(n.title) and not (n.parameters or {}).get("heat"):
        return "critical"
    if _needs_disposition(n):
        return "critical"
    if _is_loss(n):
        if not (n.disposition or {}).get("note"):
            return "critical"
    if not n.actor_role and n.type not in ("join",):
        return "missing"
    if _needs_equipment(n):
        return "missing"
    if _unknown_terms(n) or _is_ambig_title(n.title) or _is_marking(n) or _is_wash(n):
        return "ambig"
    return "ok"


def _edge_def(e: Edge, by_id: Dict[str, Node]) -> str:
    when = _esc(e.when or "")
    src = e.from_id
    dst = e.to_id
    if when:
        return f'{src} -- "{when}" --> {dst}'
    nsrc = by_id.get(src)
    if nsrc and nsrc.type == "message":
        return f"{src} -.-> {dst}"
    return f"{src} --> {dst}"


def _classes(nodes: List[Node]) -> Tuple[List[str], List[str], List[str]]:
    critical = []
    missing = []
    ambig = []
    for n in nodes:
        sev = _severity(n)
        if sev == "critical":
            critical.append(n.id)
        elif sev == "missing":
            missing.append(n.id)
        elif sev == "ambig":
            ambig.append(n.id)
    return critical, missing, ambig


def render_mermaid(nodes: List[Node], edges: List[Edge], roles: Optional[List[str]] = None, mode: str = "lanes") -> str:
    mode = (mode or "lanes").strip().lower()
    if mode not in ("lanes", "simple"):
        mode = "lanes"
    if mode == "simple":
        return _render_simple(nodes, edges, roles)
    return _render_lanes(nodes, edges, roles)


def _render_simple(nodes: List[Node], edges: List[Edge], roles: Optional[List[str]]) -> str:
    by_id = {n.id: n for n in nodes}
    lines: List[str] = []
    lines.append("flowchart TD")
    lines.append('  classDef todoCritical fill:#ffe9e9,stroke:#ff5b5b,stroke-width:2px;')
    lines.append('  classDef todoMissing fill:#fff7da,stroke:#ffb800,stroke-width:2px;')
    lines.append('  classDef todoAmbig fill:#e9f2ff,stroke:#3b82f6,stroke-width:2px;')
    lines.append('  classDef ok fill:#f7f7f7,stroke:#c9c9c9;')

    for n in nodes:
        lines.append(f"  {_node_def(n)}")

    for e in edges:
        if e.from_id in by_id and e.to_id in by_id:
            lines.append(f"  {_edge_def(e, by_id)}")

    for n in nodes:
        lines.append(f'  click {n.id} "#node={n.id}"')

    critical, missing, ambig = _classes(nodes)
    if critical:
        lines.append(f"  class {','.join(critical)} todoCritical;")
    if missing:
        lines.append(f"  class {','.join(missing)} todoMissing;")
    if ambig:
        lines.append(f"  class {','.join(ambig)} todoAmbig;")

    return "\n".join(lines) + "\n"


def _render_lanes(nodes: List[Node], edges: List[Edge], roles: Optional[List[str]]) -> str:
    by_id = {n.id: n for n in nodes}
    role_list = [r for r in (roles or []) if r]
    if "unassigned" not in role_list:
        role_list = role_list + ["unassigned"]

    grouped: Dict[str, List[Node]] = {r: [] for r in role_list}
    for n in nodes:
        r = (n.actor_role or "").strip()
        if not r:
            r = "unassigned"
        if r not in grouped:
            grouped[r] = []
            role_list.append(r)
        grouped[r].append(n)

    lines: List[str] = []
    lines.append("flowchart TD")
    lines.append('  classDef todoCritical fill:#ffe9e9,stroke:#ff5b5b,stroke-width:2px;')
    lines.append('  classDef todoMissing fill:#fff7da,stroke:#ffb800,stroke-width:2px;')
    lines.append('  classDef todoAmbig fill:#e9f2ff,stroke:#3b82f6,stroke-width:2px;')
    lines.append('  classDef ok fill:#f7f7f7,stroke:#c9c9c9;')

    for r in role_list:
        rr = _esc(r)
        lines.append(f'  subgraph lane_{rr}["{rr}"]')
        lines.append("    direction TB")
        for n in grouped.get(r, []):
            lines.append(f"    {_node_def(n)}")
        lines.append("  end")

    for e in edges:
        if e.from_id in by_id and e.to_id in by_id:
            lines.append(f"  {_edge_def(e, by_id)}")

    for n in nodes:
        lines.append(f'  click {n.id} "#node={n.id}"')

    critical, missing, ambig = _classes(nodes)
    if critical:
        lines.append(f"  class {','.join(critical)} todoCritical;")
    if missing:
        lines.append(f"  class {','.join(missing)} todoMissing;")
    if ambig:
        lines.append(f"  class {','.join(ambig)} todoAmbig;")

    return "\n".join(lines) + "\n"
