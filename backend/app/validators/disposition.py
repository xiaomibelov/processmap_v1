from __future__ import annotations

from typing import List, Optional, Dict, Any

from ..models import Node, Question


DISPOSITION_OPTIONS = [
    "Оставить на месте",
    "Вернуть на место хранения",
    "В мойку",
    "В санобработку/дезинфекцию",
    "Утилизировать/списать",
    "Другое",
]


def _needs_disposition_for_equipment(n: Node) -> bool:
    if n.type in ("decision", "fork", "join", "timer", "message"):
        return False
    eq = list(n.equipment or [])
    if not eq:
        return False
    disp = n.disposition or {}
    eq_actions = disp.get("equipment_actions") or {}
    if isinstance(eq_actions, dict) and len(eq_actions) > 0:
        return False
    return True


def build_disposition_questions(nodes: List[Node]) -> List[Question]:
    out: List[Question] = []
    for n in nodes:
        if not _needs_disposition_for_equipment(n):
            continue
        eq = [x.strip() for x in (n.equipment or []) if (x or "").strip()]
        eq_list = ", ".join(eq) if eq else "—"
        qid = f"disp_{n.id}"
        qtext = (
            f"После шага «{n.title}» что делаем с оборудованием: {eq_list}? "
            f"(выбери действие + при необходимости допиши пояснение)"
        )
        out.append(
            Question(
                id=qid,
                node_id=n.id,
                issue_type="CRITICAL",
                question=qtext,
                options=list(DISPOSITION_OPTIONS),
                target={"field": "disposition.equipment_actions", "mode": "set", "transform": "disposition_equipment_action"},
            )
        )
    return out
