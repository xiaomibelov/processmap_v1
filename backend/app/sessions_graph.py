from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from .cache import session_cache
from .legacy.request_context import request_active_org_id, request_user_meta
from .models import Edge, Node
from .repositories import session_repo
from .services.session_recompute import _recompute_session
from .storage import get_storage
from .utils.session_helpers import (
    _mark_diagram_truth_write,
    _require_diagram_cas_or_409,
    _resolve_actor_context,
    _resolve_base_diagram_state_version,
    _save_session_with_cas,
    raise_session_not_found,
)


def _request_context(request: Optional[Any] = None) -> Dict[str, Any]:
    if request is not None:
        user_id, is_admin = request_user_meta(request)
        org_id = request_active_org_id(request)
        return {"user_id": user_id, "is_admin": is_admin, "org_id": org_id}
    return {"user_id": None, "is_admin": None, "org_id": None}


def get_session_graph(
    session_id: str,
    *,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Optional[Any] = None,
) -> Dict[str, Any]:
    """Return only nodes/edges for a session (used by graph analysis / AI)."""
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id = org_id if org_id is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")

    sid = str(session_id or "").strip()
    if not sid:
        raise_session_not_found(session_id)

    sess = session_repo.load(sid, user_id=ctx_user_id, org_id=ctx_org_id, is_admin=ctx_is_admin)
    if not sess:
        raise_session_not_found(session_id)

    return {
        "session_id": sid,
        "nodes": [n.model_dump() if hasattr(n, "model_dump") else dict(n) for n in (getattr(sess, "nodes", None) or [])],
        "edges": [e.model_dump() if hasattr(e, "model_dump") else dict(e) for e in (getattr(sess, "edges", None) or [])],
        "bpmn_graph_fingerprint": str(getattr(sess, "bpmn_graph_fingerprint", "") or ""),
        "version": int(getattr(sess, "version", 0) or 0),
        "diagram_state_version": int(getattr(sess, "diagram_state_version", 0) or 0),
    }


def patch_node(session_id: str, node_id: str, inp, request=None) -> Dict[str, Any]:
    """Patch a single node in a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)

    node = next((n for n in s.nodes if n.id == node_id), None)
    if not node:
        return {"error": "node not found"}

    client_base_version = _resolve_base_diagram_state_version(
        request=request,
        payload=inp.model_dump(exclude_unset=True),
    )
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=client_base_version,
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    data = inp.model_dump(exclude_unset=True)

    if "title" in data:
        node.title = data["title"] or node.title
        node.parameters["_manual_title"] = True
    if "type" in data:
        node.type = data["type"] or node.type
        node.parameters["_manual_type"] = True
    if "actor_role" in data:
        node.actor_role = data["actor_role"] or None
        node.parameters["_manual_actor"] = True
    if "recipient_role" in data:
        node.recipient_role = data["recipient_role"] or None
        node.parameters["_manual_recipient"] = True
    if "equipment" in data and data["equipment"] is not None:
        node.equipment = data["equipment"]
        node.parameters["_manual_equipment"] = True
    if "duration_min" in data:
        node.duration_min = data["duration_min"]
        node.parameters["_manual_duration"] = True
    if "parameters" in data and data["parameters"] is not None:
        node.parameters = data["parameters"]
        node.parameters["_manual_parameters"] = True
    if "disposition" in data and data["disposition"] is not None:
        node.disposition = data["disposition"]
        node.parameters["_manual_disposition"] = True

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    _save_session_with_cas(st, s, client_base_version=client_base_version)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def add_node(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Add a new node to a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)

    client_base_version = _resolve_base_diagram_state_version(
        request=request,
        payload=inp.model_dump(exclude_unset=True),
    )
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=client_base_version,
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    node_id = (inp.id or "").strip() or f"n_{uuid.uuid4().hex[:8]}"
    if any(n.id == node_id for n in s.nodes):
        return {"error": "node already exists", "node_id": node_id}

    node = Node(
        id=node_id,
        title=inp.title,
        type=inp.type or "step",
        actor_role=inp.actor_role,
        recipient_role=inp.recipient_role,
        equipment=list(inp.equipment or []),
        parameters=dict(inp.parameters or {}),
        duration_min=inp.duration_min,
        disposition=dict(inp.disposition or {}),
        qc=[],
        exceptions=[],
        evidence=[],
        confidence=0.0,
    )
    s.nodes.append(node)

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    _save_session_with_cas(st, s, client_base_version=client_base_version)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def delete_node(session_id: str, node_id: str, request=None) -> Dict[str, Any]:
    """Delete a node (and incident edges) from a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)

    client_base_version = _resolve_base_diagram_state_version(request=request)
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=client_base_version,
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    before_n = len(s.nodes)
    s.nodes = [n for n in s.nodes if n.id != node_id]
    if len(s.nodes) == before_n:
        return {"error": "node not found"}

    s.edges = [e for e in s.edges if e.from_id != node_id and e.to_id != node_id]

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["nodes", "edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    _save_session_with_cas(st, s, client_base_version=client_base_version)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def add_edge(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Add a new edge to a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)

    client_base_version = _resolve_base_diagram_state_version(
        request=request,
        payload=inp.model_dump(exclude_unset=True),
    )
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=client_base_version,
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    if not any(n.id == inp.from_id for n in s.nodes):
        return {"error": "from_id not found", "from_id": inp.from_id}
    if not any(n.id == inp.to_id for n in s.nodes):
        return {"error": "to_id not found", "to_id": inp.to_id}

    exists = any(
        (e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None))
        for e in s.edges
    )
    if exists:
        return {"error": "edge already exists"}

    s.edges.append(Edge(from_id=inp.from_id, to_id=inp.to_id, when=inp.when))

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    _save_session_with_cas(st, s, client_base_version=client_base_version)
    session_cache.invalidate_session(session_id)
    return s.model_dump()


def delete_edge(session_id: str, inp, request=None) -> Dict[str, Any]:
    """Delete an edge from a session."""
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)

    client_base_version = _resolve_base_diagram_state_version(
        request=request,
        payload=inp.model_dump(exclude_unset=True),
    )
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=client_base_version,
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    before = len(s.edges)
    s.edges = [
        e for e in s.edges
        if not (e.from_id == inp.from_id and e.to_id == inp.to_id and (e.when or None) == (inp.when or None))
    ]
    if len(s.edges) == before:
        return {"error": "edge not found"}

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["edges"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    _save_session_with_cas(st, s, client_base_version=client_base_version)
    session_cache.invalidate_session(session_id)
    return s.model_dump()
