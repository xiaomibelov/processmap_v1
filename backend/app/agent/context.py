"""Agent context loader for AGENT-0."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from ..ai.process_projection import build_process_projection, projection_digest
from ..models import Session
from ..repositories import session_repo
from ..utils.session_helpers import raise_session_not_found
from .memory_store import AgentTurn, list_turns


@dataclass
class AgentContext:
    session: Session
    projection: dict
    digest: str
    history: List[AgentTurn]


def load_context(
    session_id: str,
    user_id: str,
    org_id: str,
    *,
    history_limit: int = 50,
) -> AgentContext:
    """Load session + projection + durable history (0 LLM calls)."""
    sid = str(session_id or "").strip()
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip() or "org_default"

    sess = session_repo.load(sid, user_id=uid, org_id=oid, is_admin=False)
    if not sess:
        raise_session_not_found(session_id)

    projection = build_process_projection(sess)
    digest = projection_digest(projection)
    history = list_turns(sid, uid, oid, limit=history_limit)

    return AgentContext(session=sess, projection=projection, digest=digest, history=history)
