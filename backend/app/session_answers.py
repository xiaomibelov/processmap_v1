from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request

from .models import Node, Session
from .schemas.legacy_api import AnswerIn
from .services.session_recompute import _recompute_session
from .shared.coerce import _ensure_dict_at_path
from .shared.entities import _ensure_loss_dict
from .storage import get_storage
from .utils.session_helpers import (
    _mark_diagram_truth_write,
    _require_diagram_cas_or_409,
    _resolve_actor_context,
    _resolve_base_diagram_state_version,
    raise_session_not_found,
)


def _map_disposition_answer(answer: str) -> Optional[str]:
    a = (answer or "").strip().lower()
    if not a:
        return None
    if "остав" in a:
        return "leave"
    if "вернут" in a or "хран" in a:
        return "return_storage"
    if "мойк" in a:
        return "wash"
    if "сан" in a or "дез" in a:
        return "sanitize"
    if "утилиз" in a or "спис" in a:
        return "dispose"
    if "друго" in a:
        return "other"
    return None


def _apply_target_to_node(s: Session, node: Node, q, answer: str) -> None:
    import app._legacy_main as _lm

    target = q.target or {}
    field = (target.get("field") or "").strip()
    mode = (target.get("mode") or "set").strip().lower()
    transform = (target.get("transform") or "text").strip().lower()

    if not field:
        node.parameters = dict(node.parameters or {})
        node.parameters.setdefault("notes", [])
        if isinstance(node.parameters.get("notes"), list):
            node.parameters["notes"].append(answer)
        node.parameters["_manual_parameters"] = True
        return

    if field == "actor_role":
        node.actor_role = _lm._normalize_choice(answer, s.roles)
        node.parameters["_manual_actor"] = True
        return

    if field == "recipient_role":
        node.recipient_role = _lm._normalize_choice(answer, s.roles)
        node.parameters["_manual_recipient"] = True
        return

    if field == "equipment":
        new_items = _lm._parse_equipment_list(answer)
        if mode == "merge":
            merged = list(node.equipment or [])
            for x in new_items:
                if x not in merged:
                    merged.append(x)
            node.equipment = merged
        else:
            node.equipment = new_items
        node.parameters["_manual_equipment"] = True
        return

    if field == "duration_min":
        mins = _lm._parse_minutes(answer)
        if mins is not None:
            node.duration_min = mins
            node.parameters["_manual_duration"] = True
        return

    if field.startswith("disposition.") or field == "disposition":
        node.disposition = dict(node.disposition or {})
        node.parameters["_manual_disposition"] = True

        if transform == "disposition_equipment_action":
            action = _map_disposition_answer(answer)
            node.disposition.setdefault("equipment_actions", {})
            if isinstance(node.disposition.get("equipment_actions"), dict) and action and action != "other":
                for eq in (node.equipment or []):
                    eqid = (eq or "").strip()
                    if eqid:
                        node.disposition["equipment_actions"][eqid] = action
            if action == "other" or not action:
                node.disposition["note"] = answer
            return

        if field == "disposition":
            node.disposition["note"] = answer
            return

        path = field.split(".")[1:]
        if not path:
            node.disposition["note"] = answer
            return

        cur = _ensure_dict_at_path(node.disposition, path[:-1]) if len(path) > 1 else node.disposition
        key = path[-1]

        if mode == "append":
            lst = cur.get(key)
            if not isinstance(lst, list):
                lst = []
            lst.append(answer)
            cur[key] = lst
        else:
            cur[key] = answer
        return

    if field.startswith("parameters."):
        node.parameters = dict(node.parameters or {})
        node.parameters["_manual_parameters"] = True
        path = field.split(".")[1:]
        if not path:
            return

        if path and path[0] == "loss":
            loss = _ensure_loss_dict(node)
            if len(path) >= 2:
                loss[path[1]] = answer
            return

        cur = _ensure_dict_at_path(node.parameters, path[:-1]) if len(path) > 1 else node.parameters
        key = path[-1]

        if transform == "minutes":
            v = _lm._parse_minutes(answer)
            if v is None:
                v = answer
        else:
            v = answer

        if mode == "append":
            lst = cur.get(key)
            if not isinstance(lst, list):
                lst = []
            lst.append(v)
            cur[key] = lst
        else:
            cur[key] = v
        return

    node.parameters = dict(node.parameters or {})
    node.parameters.setdefault("notes", [])
    if isinstance(node.parameters.get("notes"), list):
        node.parameters["notes"].append(answer)
    node.parameters["_manual_parameters"] = True


def _apply_answer(s: Session, inp: AnswerIn) -> None:
    q = next((x for x in s.questions if x.id == inp.question_id), None)
    if not q:
        raise KeyError("question not found")

    q.status = "answered"
    q.answer = inp.answer

    node_id = (inp.node_id or q.node_id or "").strip()
    if not node_id:
        return

    node = next((n for n in s.nodes if n.id == node_id), None)
    if not node:
        return

    _apply_target_to_node(s, node, q, inp.answer)


def answer(session_id: str, inp: AnswerIn, request: Request = None) -> Dict[str, Any]:
    st = get_storage()
    s = st.load(session_id)
    if not s:
        raise_session_not_found(session_id)

    try:
        _apply_answer(s, inp)
    except KeyError:
        return {"error": "question not found"}
    _require_diagram_cas_or_409(
        sess=s,
        session_id=session_id,
        request=request,
        client_base_version=_resolve_base_diagram_state_version(
            request=request,
            payload=inp.model_dump(exclude_unset=True),
        ),
    )
    _, actor_user_id, actor_label = _resolve_actor_context(request)

    s = _recompute_session(s)
    _mark_diagram_truth_write(
        s,
        changed_keys=["questions", "nodes"],
        actor_user_id=actor_user_id,
        actor_label=actor_label,
    )
    st.save(s)
    return s.model_dump()


def answer_v2(session_id: str, inp: AnswerIn, request: Request = None) -> Dict[str, Any]:
    return answer(session_id, inp, request=request)
