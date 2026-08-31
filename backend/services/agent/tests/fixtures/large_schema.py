"""Large schema fixture for cost/performance measurements."""
from __future__ import annotations

from typing import Any, Dict


def large_schema_300_nodes() -> Dict[str, Any]:
    """Return a projection with 300 steps and 299 edges.

    Mimics the shape produced by monolith_client.get_projection:
    {steps: [{id, type, name_ru, duration, role}, ...], edges: [{from, to}, ...], meta: {...}}.
    """
    steps = [
        {
            "id": f"step_{i}",
            "type": "step",
            "name_ru": (
                f"Шаг {i}: подготовка сырья, первичная обработка ингредиентов "
                f"и контроль температурного режима"
            ),
            "duration": 10 + (i % 60),
            "role": "technologist" if i % 3 == 0 else "operator" if i % 3 == 1 else "qc",
        }
        for i in range(300)
    ]
    edges = [{"from": f"step_{i}", "to": f"step_{i + 1}"} for i in range(299)]
    return {
        "steps": steps,
        "edges": edges,
        "meta": {
            "session_id": "",
            "rev": 1,
            "nodes_count": 300,
            "schema": 1,
        },
    }
