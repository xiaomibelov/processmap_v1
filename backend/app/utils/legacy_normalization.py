from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import ValidationError

from ..models import Edge, Node, Question


def _role_id_from_any(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    if isinstance(value, dict):
        for key in ("role_id", "roleId", "id", "value", "name", "key"):
            if key in value and value[key] is not None:
                normalized = str(value[key]).strip()
                if normalized:
                    return normalized
    return None


def norm_roles(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: List[str] = []
        seen = set()
        for item in value:
            role_id = _role_id_from_any(item)
            if not role_id or role_id in seen:
                continue
            seen.add(role_id)
            out.append(role_id)
        return out
    role_id = _role_id_from_any(value)
    return [role_id] if role_id else []


def notes_decode(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return parsed
            if isinstance(parsed, dict):
                return [parsed]
        except Exception:
            pass
        return [{"note_id": "legacy", "ts": None, "author": None, "text": text}]
    return []


def notes_encode(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return json.dumps([value], ensure_ascii=False)
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    return ""


def norm_notes_by_element(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    out: Dict[str, Any] = {}
    for raw_key, raw_entry in value.items():
        key = str(raw_key or "").strip()
        if not key:
            continue
        entry = raw_entry if isinstance(raw_entry, dict) else {}
        raw_items = entry.get("items")
        if not isinstance(raw_items, list):
            raw_items = entry.get("notes") if isinstance(entry.get("notes"), list) else []

        items: List[Dict[str, Any]] = []
        for idx, raw_item in enumerate(raw_items):
            item = raw_item if isinstance(raw_item, dict) else {"text": str(raw_item or "")}
            text = str(item.get("text") or item.get("note") or "").strip()
            if not text:
                continue
            created_at = item.get("createdAt") or item.get("created_at") or item.get("ts") or int(time.time() * 1000)
            updated_at = item.get("updatedAt") or item.get("updated_at") or created_at
            note_id = str(item.get("id") or item.get("note_id") or f"note_{created_at}_{idx + 1}").strip()
            normalized_item: Dict[str, Any] = {
                "id": note_id or f"note_{created_at}_{idx + 1}",
                "text": text,
                "createdAt": int(created_at) if str(created_at).isdigit() else created_at,
                "updatedAt": int(updated_at) if str(updated_at).isdigit() else updated_at,
            }

            kind = str(item.get("kind") or item.get("type") or "").strip().lower()
            if kind:
                normalized_item["kind"] = kind

            status_raw = str(item.get("status") or "").strip().lower()
            if status_raw == "reopened":
                status_raw = "open"
            if status_raw in {"open", "resolved"}:
                normalized_item["status"] = status_raw

            session_id = str(item.get("session_id") or item.get("sessionId") or "").strip()
            if session_id:
                normalized_item["session_id"] = session_id

            anchor_type = str(item.get("anchor_type") or item.get("anchorType") or "").strip().lower()
            if anchor_type in {"node", "sequence_flow", "property"}:
                normalized_item["anchor_type"] = anchor_type
            anchor_id = str(item.get("anchor_id") or item.get("anchorId") or key).strip()
            if anchor_id:
                normalized_item["anchor_id"] = anchor_id
            anchor_label = str(item.get("anchor_label") or item.get("anchorLabel") or "").strip()
            if anchor_label:
                normalized_item["anchor_label"] = anchor_label
            anchor_path = str(item.get("anchor_path") or item.get("anchorPath") or "").strip()
            if anchor_path:
                normalized_item["anchor_path"] = anchor_path

            author_user_id = str(item.get("author_user_id") or item.get("authorUserId") or "").strip()
            if author_user_id:
                normalized_item["author_user_id"] = author_user_id
            author_label = str(
                item.get("author_label")
                or item.get("authorLabel")
                or item.get("author")
                or item.get("user")
                or item.get("created_by")
                or ""
            ).strip()
            if author_label:
                normalized_item["author_label"] = author_label

            resolved_by_user_id = str(item.get("resolved_by_user_id") or item.get("resolvedByUserId") or "").strip()
            if resolved_by_user_id:
                normalized_item["resolved_by_user_id"] = resolved_by_user_id
            resolved_by_label = str(item.get("resolved_by_label") or item.get("resolvedByLabel") or "").strip()
            if resolved_by_label:
                normalized_item["resolved_by_label"] = resolved_by_label
            resolved_at = item.get("resolved_at") or item.get("resolvedAt")
            if str(resolved_at).isdigit():
                normalized_item["resolved_at"] = int(resolved_at)

            items.append(normalized_item)

        if not items:
            continue

        updated_at_entry = entry.get("updatedAt") or entry.get("updated_at") or items[-1].get("updatedAt")
        out[key] = {
            "items": items,
            "updatedAt": int(updated_at_entry) if str(updated_at_entry).isdigit() else updated_at_entry,
        }

    return out


def pick(mapping: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return None


def norm_nodes(value: Any) -> List[Node]:
    if value is None or not isinstance(value, list):
        return []
    out: List[Node] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        node_id = pick(item, "id", "node_id", "nodeId")
        title = pick(item, "title", "label", "name")
        if node_id is None or title is None:
            continue
        payload = dict(item)
        payload["id"] = str(node_id)
        payload["title"] = str(title)
        if "actor_role" not in payload and "actorRole" in payload:
            payload["actor_role"] = payload.get("actorRole")
        if "recipient_role" not in payload and "recipientRole" in payload:
            payload["recipient_role"] = payload.get("recipientRole")
        raw_type = payload.get("type")
        if isinstance(raw_type, str):
            normalized_type = raw_type.strip().lower()
            alias = {
                "task": "step",
                "action": "step",
                "activity": "step",
                "gateway": "decision",
                "xor": "decision",
                "and": "fork",
                "parallel": "fork",
            }.get(normalized_type)
            if alias:
                payload["type"] = alias
        try:
            out.append(Node.model_validate(payload))
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors())
    return out


def norm_edges(value: Any) -> List[Edge]:
    if value is None or not isinstance(value, list):
        return []
    out: List[Edge] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        from_id = pick(item, "from_id", "from", "source_id", "sourceId")
        to_id = pick(item, "to_id", "to", "target_id", "targetId")
        if from_id is None or to_id is None:
            continue
        payload = dict(item)
        payload["from_id"] = str(from_id)
        payload["to_id"] = str(to_id)
        out.append(Edge.model_validate(payload))
    return out


def norm_questions(value: Any) -> List[Question]:
    if value is None or not isinstance(value, list):
        return []
    out: List[Question] = []
    for item in value:
        if isinstance(item, Question):
            out.append(item.model_copy(deep=True))
            continue
        if not isinstance(item, dict):
            continue
        payload = dict(item)
        if "question" not in payload and "text" in payload:
            payload["question"] = payload.get("text")
        if "node_id" not in payload and "nodeId" in payload:
            payload["node_id"] = payload.get("nodeId")
        try:
            out.append(Question.model_validate(payload))
        except ValidationError:
            continue
    return out


def norm_prep_questions(value: Any) -> List[Dict[str, Any]]:
    if value is None:
        return []
    if isinstance(value, list):
        items = value
    elif isinstance(value, dict):
        items = [value]
    else:
        return []

    out: List[Dict[str, Any]] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        question = str(item.get("question") or item.get("text") or "").strip()
        if not question:
            continue
        out.append(
            {
                "id": str(item.get("id") or f"Q{idx + 1}").strip() or f"Q{idx + 1}",
                "block": str(item.get("block") or "").strip(),
                "question": question,
                "ask_to": str(item.get("ask_to") or item.get("role") or item.get("askTo") or "").strip(),
                "answer_type": str(item.get("answer_type") or item.get("answerType") or "").strip(),
                "follow_up": str(item.get("follow_up") or item.get("followUp") or "").strip(),
                "answer": str(item.get("answer") or "").strip(),
            }
        )
    return out


def norm_interview(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}
