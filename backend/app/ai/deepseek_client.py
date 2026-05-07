from __future__ import annotations

import hashlib
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import requests

NOTES_EXTRACTION_SYSTEM_PROMPT = "Верни строго JSON с ключами nodes, edges, roles. nodes: {id,type,title,actor_role,recipient_role,equipment,duration_min,parameters,disposition,evidence,confidence}. Не выдумывай. Если нет данных — пустые массивы."


ROLE_ALIASES = {
    "п1": "cook_1",
    "повар1": "cook_1",
    "повар 1": "cook_1",
    "cook_1": "cook_1",
    "c1": "cook_1",
    "п2": "cook_2",
    "повар2": "cook_2",
    "повар 2": "cook_2",
    "cook_2": "cook_2",
    "c2": "cook_2",
    "бригадир": "brigadir",
    "шеф": "brigadir",
    "brigadir": "brigadir",
    "технолог": "technolog",
    "technolog": "technolog",
}

LOSS_WORDS = ("списан", "списать", "списание", "потери", "потеря", "брак", "утилиз")
MESSAGE_WORDS = ("сообщить", "спросить", "уточнить", "согласовать", "позвать", "передать")
PAR_WORDS = ("параллельно", "одновременно")

TIME_RE = re.compile(r"(?P<a>\d+)\s*(?:[-–]\s*(?P<b>\d+))?\s*(?P<u>минут|мин|час|ч)\b", re.IGNORECASE)
IF_RE = re.compile(r"^\s*(если)\b", re.IGNORECASE)


def _stable_id(kind: str, text: str, salt: str) -> str:
    key = f"{kind}|{salt}|{text}".encode("utf-8")
    h = hashlib.sha1(key).hexdigest()[:10]
    return f"n_{kind}_{h}"


def _norm_space(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _parse_actor_prefix(line: str) -> Tuple[Optional[str], str]:
    raw = line.strip()
    m = re.match(r"^(?P<p>[^:]{1,20})\s*[:\-]\s*(?P<r>.+)$", raw)
    if not m:
        return None, raw
    p = _norm_space(m.group("p")).lower()
    p = p.replace(".", "")
    p = p.replace("№", "")
    role = ROLE_ALIASES.get(p)
    if role:
        return role, _norm_space(m.group("r"))
    return None, raw


def _extract_minutes(text: str) -> Optional[int]:
    t = text.lower()
    m = TIME_RE.search(t)
    if not m:
        return None
    a = int(m.group("a"))
    b = m.group("b")
    unit = m.group("u").lower()
    v = a
    if b:
        v = int((a + int(b)) / 2)
    if unit.startswith("час") or unit == "ч":
        return v * 60
    return v


def _infer_type(title: str) -> str:
    t = title.lower()
    if any(w in t for w in LOSS_WORDS):
        return "loss_event"
    if IF_RE.match(t):
        return "decision"
    if any(w in t for w in MESSAGE_WORDS):
        return "message"
    if any(w in t for w in PAR_WORDS):
        return "fork"
    mins = _extract_minutes(t)
    if mins is not None and ("ждать" in t or "выдерж" in t or "томить" in t or "варить" in t):
        return "timer"
    return "step"


def _parse_parallel_items(rest: str) -> List[str]:
    s = rest.strip()
    s = re.sub(r"^\s*(параллельно|одновременно)\s*[:\-]\s*", "", s, flags=re.IGNORECASE)
    parts = [p.strip() for p in re.split(r"[|;]+", s) if p.strip()]
    return parts


def _parse_if_line(rest: str) -> Tuple[str, str]:
    s = rest.strip()
    s = re.sub(r"^\s*если\s+", "", s, flags=re.IGNORECASE)
    if "->" in s:
        cond, act = s.split("->", 1)
        return _norm_space(cond), _norm_space(act)
    if ":" in s:
        cond, act = s.split(":", 1)
        return _norm_space(cond), _norm_space(act)
    return _norm_space(s), "TODO: действие"


def _guess_roles_from_text(text: str) -> List[str]:
    t = text.lower()
    roles = set()
    for k, v in ROLE_ALIASES.items():
        if k in t:
            roles.add(v)
    if not roles:
        roles = {"cook_1", "cook_2", "brigadir"}
    return sorted(list(roles))


def _stub_extract_v2(notes: str) -> Dict[str, Any]:
    lines = [_norm_space(x) for x in (notes or "").splitlines()]
    lines = [x for x in lines if x]

    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    roles = _guess_roles_from_text(notes)

    last_main_id: Optional[str] = None
    i = 0
    while i < len(lines):
        actor, rest = _parse_actor_prefix(lines[i])
        t = rest.lower()

        if IF_RE.match(t):
            group_actor = actor
            if_lines: List[Tuple[Optional[str], str]] = [(actor, rest)]
            j = i + 1
            while j < len(lines):
                a2, r2 = _parse_actor_prefix(lines[j])
                if IF_RE.match(r2.lower()):
                    if_lines.append((a2, r2))
                    j += 1
                else:
                    break

            salt = "|".join([x[1] for x in if_lines])
            dec_id = _stable_id("decision", "if_group", salt)
            dec_title = "Проверка условия"
            nodes.append(
                {
                    "id": dec_id,
                    "type": "decision",
                    "title": dec_title,
                    "actor_role": group_actor,
                    "equipment": [],
                    "parameters": {},
                    "duration_min": None,
                    "qc": [],
                    "exceptions": [],
                    "disposition": {},
                    "evidence": [x[1] for x in if_lines],
                    "confidence": 0.55,
                }
            )
            if last_main_id:
                edges.append({"from_id": last_main_id, "to_id": dec_id})

            branch_end_ids: List[str] = []
            for (a_line, line_text) in if_lines:
                a3, r3 = _parse_actor_prefix(line_text)
                use_actor = a3 or group_actor
                cond, act = _parse_if_line(r3)
                act_id = _stable_id("step", act, cond + "|" + salt)
                ntype = _infer_type(act)
                mins = _extract_minutes(act) if ntype in ("timer",) else None
                nodes.append(
                    {
                        "id": act_id,
                        "type": ntype if ntype != "decision" else "step",
                        "title": act,
                        "actor_role": use_actor,
                        "equipment": [],
                        "parameters": {},
                        "duration_min": mins,
                        "qc": [],
                        "exceptions": [],
                        "disposition": {},
                        "evidence": [line_text],
                        "confidence": 0.5,
                    }
                )
                edges.append({"from_id": dec_id, "to_id": act_id, "when": cond})
                branch_end_ids.append(act_id)

            if j < len(lines):
                a_next, r_next = _parse_actor_prefix(lines[j])
                next_id = _stable_id("step", r_next, f"after_if|{salt}")
                next_type = _infer_type(r_next)
                next_mins = _extract_minutes(r_next) if next_type == "timer" else None
                nodes.append(
                    {
                        "id": next_id,
                        "type": next_type,
                        "title": r_next,
                        "actor_role": a_next,
                        "equipment": [],
                        "parameters": {},
                        "duration_min": next_mins,
                        "qc": [],
                        "exceptions": [],
                        "disposition": {},
                        "evidence": [lines[j]],
                        "confidence": 0.45,
                    }
                )
                for be in branch_end_ids:
                    edges.append({"from_id": be, "to_id": next_id})
                last_main_id = next_id
                i = j + 1
            else:
                last_main_id = dec_id
                i = j
            continue

        if any(w in t for w in PAR_WORDS) and (":" in rest or "|" in rest or ";" in rest):
            items = _parse_parallel_items(rest)
            salt = rest
            fork_id = _stable_id("fork", "parallel", salt)
            nodes.append(
                {
                    "id": fork_id,
                    "type": "fork",
                    "title": "Параллельно",
                    "actor_role": actor,
                    "equipment": [],
                    "parameters": {},
                    "duration_min": None,
                    "qc": [],
                    "exceptions": [],
                    "disposition": {},
                    "evidence": [lines[i]],
                    "confidence": 0.55,
                }
            )
            if last_main_id:
                edges.append({"from_id": last_main_id, "to_id": fork_id})

            branch_ids: List[str] = []
            for it in items:
                a_it, r_it = _parse_actor_prefix(it)
                it_type = _infer_type(r_it)
                it_mins = _extract_minutes(r_it) if it_type == "timer" else None
                it_id = _stable_id("step", r_it, salt + "|" + it)
                nodes.append(
                    {
                        "id": it_id,
                        "type": it_type if it_type != "decision" else "step",
                        "title": r_it,
                        "actor_role": a_it or actor,
                        "equipment": [],
                        "parameters": {},
                        "duration_min": it_mins,
                        "qc": [],
                        "exceptions": [],
                        "disposition": {},
                        "evidence": [it],
                        "confidence": 0.5,
                    }
                )
                edges.append({"from_id": fork_id, "to_id": it_id})
                branch_ids.append(it_id)

            join_id = _stable_id("join", "parallel_join", salt)
            nodes.append(
                {
                    "id": join_id,
                    "type": "join",
                    "title": "Синхронизация",
                    "actor_role": actor,
                    "equipment": [],
                    "parameters": {},
                    "duration_min": None,
                    "qc": [],
                    "exceptions": [],
                    "disposition": {},
                    "evidence": [lines[i]],
                    "confidence": 0.5,
                }
            )
            for bid in branch_ids:
                edges.append({"from_id": bid, "to_id": join_id})

            last_main_id = join_id
            i += 1
            continue

        ntype = _infer_type(rest)
        mins = _extract_minutes(rest) if ntype == "timer" else None
        nid = _stable_id(ntype, rest, f"line_{i}")
        nodes.append(
            {
                "id": nid,
                "type": ntype,
                "title": rest,
                "actor_role": actor,
                "equipment": [],
                "parameters": {},
                "duration_min": mins,
                "qc": [],
                "exceptions": [],
                "disposition": {},
                "evidence": [lines[i]],
                "confidence": 0.45,
            }
        )
        if last_main_id:
            edges.append({"from_id": last_main_id, "to_id": nid})
        last_main_id = nid
        i += 1

    return {"nodes": nodes, "edges": edges, "roles": roles}


def _try_deepseek(notes: str, api_key_override: str = "", base_url_override: str = "") -> Optional[Dict[str, Any]]:
    api_key = (api_key_override or "").strip() or os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None

    base_url = (base_url_override or "").strip() or os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    base_url = base_url.rstrip("/")
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {
                "role": "system",
                "content": NOTES_EXTRACTION_SYSTEM_PROMPT,
            },
            {"role": "user", "content": notes},
        ],
        "temperature": 0.2,
    }
    url = f"{base_url}/v1/chat/completions"
    r = requests.post(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    content = data["choices"][0]["message"]["content"]
    import json
    obj = json.loads(content)
    if not isinstance(obj, dict):
        return None
    if "nodes" not in obj or "edges" not in obj:
        return None
    return obj


def extract_process(notes: str, api_key: str = "", base_url: str = "") -> Dict[str, Any]:
    try:
        obj = _try_deepseek(notes, api_key_override=api_key, base_url_override=base_url)
        if obj:
            return obj
    except Exception:
        pass
    return _stub_extract_v2(notes)


def extract_process_preview(notes: str, api_key: str = "", base_url: str = "") -> Dict[str, Any]:
    warnings: List[Dict[str, str]] = []
    try:
        obj = _try_deepseek(notes, api_key_override=api_key, base_url_override=base_url)
        if obj:
            return {"source": "llm", "result": obj, "warnings": warnings}
        warnings.append(
            {
                "code": "deepseek_unavailable",
                "message": "DeepSeek extraction unavailable; fallback parser was used.",
            }
        )
    except Exception as exc:
        warnings.append(
            {
                "code": "deepseek_failed",
                "message": str(exc or "DeepSeek extraction failed; fallback parser was used."),
            }
        )
    return {"source": "fallback", "result": _stub_extract_v2(notes), "warnings": warnings}
