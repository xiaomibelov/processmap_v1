"""feat/canvas-edit-highlight — извлечение затронутых элементов из edit_plan.

Используется streaming-веткой edit_canvas для SSE-события `focus_elements`:
фронт подсвечивает на канвасе, что именно агент собирается править.
Чистая функция, без I/O.
"""
from __future__ import annotations

from typing import Any, Dict, List

FOCUS_ELEMENTS_LIMIT = 20


def extract_focus_elements(edit_plan: Dict[str, Any], limit: int = FOCUS_ELEMENTS_LIMIT) -> List[Dict[str, str]]:
    """Извлечь [{op, element_id}] из edit_plan.operations.

    - update_node/add_node/delete_node → node_id
    - add_edge/delete_edge → from_id и to_id (две записи)
    - dedupe по (op, element_id), порядок первого появления сохраняется
    - кап limit (защита от гигантских планов)
    """
    operations = edit_plan.get("operations") if isinstance(edit_plan, dict) else []
    if not isinstance(operations, list):
        return []
    out: List[Dict[str, str]] = []
    seen = set()

    def _push(op_type: str, element_id: str) -> None:
        if not op_type or not element_id:
            return
        key = (op_type, element_id)
        if key in seen or len(out) >= limit:
            return
        seen.add(key)
        out.append({"op": op_type, "element_id": element_id})

    for op in operations:
        if not isinstance(op, dict):
            continue
        op_type = str(op.get("op") or "").strip()
        if not op_type:
            continue
        node_id = str(op.get("node_id") or "").strip()
        if node_id:
            _push(op_type, node_id)
        if op_type in ("add_edge", "delete_edge"):
            _push(op_type, str(op.get("from_id") or "").strip())
            _push(op_type, str(op.get("to_id") or "").strip())
        if len(out) >= limit:
            break
    return out
