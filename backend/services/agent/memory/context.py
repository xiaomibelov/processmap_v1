"""Agent context loader — сервисная версия backend/app/agent/context.py.

Сессия НЕ грузится через session_repo (это монолит): доступ к сессии уже
проверен в services/auth_service (read-only SQL по sessions), а проекция
схемы запрашивается у монолита по HTTP (runners.monolith_client.get_projection
с пробросом JWT пользователя).
"""
from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from runners import monolith_client

from .memory_store import AgentTurn, list_turns


@dataclass
class AgentContext:
    session: Any
    projection: dict
    digest: str
    history: List[AgentTurn]


def load_context(
    session_id: str,
    user_id: str,
    org_id: str,
    *,
    token: str = "",
    session_row: Optional[Dict[str, Any]] = None,
    history_limit: int = 50,
) -> AgentContext:
    """Load projection (HTTP к монолиту) + durable history (0 LLM calls)."""
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"

    proj = monolith_client.get_projection(sid, token=token)
    projection = dict(proj.get("projection") or {})
    digest = str(proj.get("projection_digest") or "")
    history = list_turns(sid, uid, oid, limit=history_limit)

    row = dict(session_row or {})
    session = SimpleNamespace(id=sid, org_id=oid, project_id=str(row.get("project_id") or ""))

    return AgentContext(session=session, projection=projection, digest=digest, history=history)
