from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List, Optional, Set

import requests

from ..models import Node, Question, Session


_ALLOWED_ISSUE = {"CRITICAL", "MISSING", "VARIANT", "AMBIG", "LOSS"}


def _sha12(s: str) -> str:
    h = hashlib.sha1(s.encode("utf-8")).hexdigest()[:12]
    return h


def _stable_qid(node_id: str, field: str, question: str) -> str:
    base = f"{node_id}|{field}|{question}"
    return f"llm_{_sha12(base)}"


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", t)
        t = re.sub(r"\s*```\s*$", "", t)
    return t.strip()


def _extract_json_candidate(text: str) -> Optional[str]:
    t = _strip_fences(text)
    if not t:
        return None

    # if it's already json-ish
    if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
        return t

    # find first {...} or [...] block
    m = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", t)
    if m:
        return m.group(1)
    return None


def _deepseek_chat_json(api_key: str, base_url: str, messages: List[Dict[str, str]], timeout: int = 30) -> Any:
    api_key = (api_key or "").strip()
    if not api_key:
        raise ValueError("no api key")
    base = (base_url or "https://api.deepseek.com").strip().rstrip("/")

    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.2,
    }

    url = f"{base}/v1/chat/completions"
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    r.raise_for_status()
    data = r.json()
    content = data["choices"][0]["message"]["content"]

    cand = _extract_json_candidate(content)
    if not cand:
        raise ValueError("no json in response")

    return json.loads(cand)


def _node_brief(n: Node) -> Dict[str, Any]:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "actor_role": n.actor_role,
        "recipient_role": n.recipient_role,
        "equipment": list(n.equipment or []),
        "duration_min": n.duration_min,
        "disposition": n.disposition or {},
        "parameters": n.parameters or {},
    }


def _existing_question_texts(s: Session) -> Set[str]:
    seen: Set[str] = set()
    for q in (s.questions or []):
        qt = (q.question or "").strip().lower()
        if qt:
            seen.add(qt)
    return seen


def generate_llm_questions(
    s: Session,
    api_key: str,
    base_url: str,
    limit: int = 12,
    mode: str = "strict",
) -> List[Question]:
    lim = int(limit or 0)
    if lim <= 0:
        lim = 12
    lim = min(max(lim, 1), 30)

    mode = (mode or "strict").strip().lower()
    if mode not in ("strict", "soft"):
        mode = "strict"

    nodes = [
        _node_brief(n)
        for n in (s.nodes or [])
        if n and n.type not in ("join",)
    ]

    existing_texts = _existing_question_texts(s)

    checklist = {
        "heating": [
            "режим/шкала (1–9) или % мощности",
            "целевая температура/признак (кипение/цвет/консистенция)",
            "время и критерий готовности",
        ],
        "washing": [
            "чем моем (средство/концентрация)",
            "где моем/сушим/храним",
            "кто контролирует и что делать при очереди",
        ],
        "marking": [
            "что на этикетке (дата/время/партия/срок/ответственный)",
            "кто маркирует и где печатают",
            "сроки хранения и правила",
        ],
        "loss": [
            "почему списали/потеряли",
            "кто фиксирует и где",
            "что делаем дальше (утилизация/возврат/акт)",
        ],
        "inventory_disposition": [
            "куда девается инвентарь после шага (мойка/хранение/санобработка)",
            "куда девается продукт (тара/хранение/цех/полка)",
        ],
    }

    system = (
        "Ты — технолог на производстве. Ты НЕ переписываешь процесс, НЕ добавляешь новые шаги. "
        "Твоя задача — дожимать пропуски в описании, задавая уточняющие вопросы по конкретным узлам. "
        "Верни строго JSON. Никакого текста вокруг.\n\n"
        "Формат ответа: {\"questions\":[ ... ]}.\n"
        "Каждый вопрос: {\"node_id\":str, \"issue_type\":CRITICAL|MISSING|VARIANT|AMBIG|LOSS, \"question\":str, \"options\":[...], \"target\":{\"field\":str,\"mode\":set|merge|append,\"transform\":role|minutes|equipment_list|disposition_equipment_action|text}}\n"
        "target.field может быть: actor_role, recipient_role, equipment, duration_min, disposition.note, disposition (или disposition.*), parameters.*\n"
        "Не повторяй вопросы, которые уже есть. Не выдавай больше лимита."
    )

    user = {
        "mode": mode,
        "limit": lim,
        "roles": s.roles,
        "nodes": nodes,
        "existing_questions": sorted(list(existing_texts))[:250],
        "checklist": checklist,
        "notes": (s.notes or "")[:4000],
    }

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]

    obj = _deepseek_chat_json(api_key=api_key, base_url=base_url, messages=messages)

    items = None
    if isinstance(obj, dict):
        items = obj.get("questions")
    elif isinstance(obj, list):
        items = obj

    if not isinstance(items, list):
        return []

    node_ids = {n.id for n in (s.nodes or [])}
    out: List[Question] = []

    for it in items:
        if len(out) >= lim:
            break
        if not isinstance(it, dict):
            continue

        nid = (it.get("node_id") or "").strip()
        if not nid or nid not in node_ids:
            continue

        qtext = (it.get("question") or "").strip()
        if not qtext:
            continue

        if qtext.strip().lower() in existing_texts:
            continue

        issue_type = (it.get("issue_type") or "MISSING").strip().upper()
        if issue_type not in _ALLOWED_ISSUE:
            issue_type = "MISSING"

        target = it.get("target")
        if not isinstance(target, dict):
            target = None

        opts = it.get("options")
        if not isinstance(opts, list):
            opts = []
        opts = [str(x).strip() for x in opts if str(x).strip()][:30]

        if target and isinstance(target.get("field"), str):
            field = target.get("field")
        else:
            field = ""

        qid = _stable_qid(nid, str(field or ""), qtext)

        out.append(
            Question(
                id=qid,
                node_id=nid,
                issue_type=issue_type,  # type: ignore[arg-type]
                question=qtext,
                options=opts,
                target=target,
            )
        )

    return out
