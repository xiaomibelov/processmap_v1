from __future__ import annotations
from typing import Dict, Any
import yaml
from ..models import Session
def session_to_process_dict(s: Session) -> Dict[str, Any]:
    return {
        "process_id": s.id,
        "title": s.title,
        "roles": [{"id": r, "title": r} for r in s.roles],
        "nodes": [n.model_dump() for n in s.nodes],
        "edges": [e.model_dump() for e in s.edges],
        "version": s.version,
    }
def dump_yaml(data: Dict[str, Any]) -> str:
    return yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
