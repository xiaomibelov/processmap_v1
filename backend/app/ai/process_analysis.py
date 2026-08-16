"""LLM1 — эндпоинт POST /api/sessions/{session_id}/llm/analysis.

Поток (PLAN.md, эпик LLM1):
1. проекция процесса (process_projection) → md5 → complete_cached: неизменная
   схема = 0 токенов; ?force=1 — «Обновить» (обход кэша, по клику).
2. промт из llm_prompts(feature=process_analysis, active) — редактируемый
   (сид v1 — миграция 013).
3. JSON-схема ответа валидируется; кривой/частичный ответ → честный статус
   "partial" + что распарсилось, НЕ падение.
4. Анти-галлюцинации (паттерн transformation/pipeline.py): step_id ∉ проекции
   → отбрасывается; operation_code ∉ каталога (14 разрешённых) → отбрасывается.

Авторизация — как у остальных session-эндпоинтов: org-scoped load сессии по
request-контексту (ролевой модели analyst/technologist в backend нет).
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import Request

from ..repositories import session_repo
from ..sessions_graph import _request_context
from ..utils.session_helpers import raise_session_not_found
from ..validation.service import ALLOWED_OPERATION_CODES, FORBIDDEN_OPERATION_CODES
from .gateway import complete, complete_cached
from . import llm_internal_client
from .process_projection import build_process_projection, projection_digest

FEATURE = "process_analysis"
MAX_TOKENS = 4000  # L3 (решение владельца №3)

_SEVERITIES = {"low", "medium", "high"}
_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Распарсить ответ LLM в dict: чистый JSON, ```json-ограждение или первый {...} блок."""
    src = _FENCE_RE.sub("", str(text or "")).strip()
    if not src:
        return None
    try:
        obj = json.loads(src)
        return obj if isinstance(obj, dict) else None
    except Exception:
        pass
    match = _JSON_BLOCK_RE.search(src)
    if match:
        try:
            obj = json.loads(match.group(0))
            return obj if isinstance(obj, dict) else None
        except Exception:
            return None
    return None


def _severity(value: Any) -> str:
    sev = str(value or "").strip().lower()
    return sev if sev in _SEVERITIES else "medium"


def _items(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def filter_analysis(obj: Dict[str, Any], projection: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """Валидация + анти-галлюцинационная фильтрация. Возвращает (analysis, dropped_count)."""
    valid_step_ids = {str(s.get("id") or "") for s in (projection.get("steps") or [])}
    dropped = 0

    bottlenecks: List[Dict[str, Any]] = []
    for item in _items(obj.get("bottlenecks")):
        if not isinstance(item, dict):
            dropped += 1
            continue
        step_id = str(item.get("step_id") or "")
        if step_id not in valid_step_ids:
            dropped += 1  # галлюцинированный шаг → reject
            continue
        bottlenecks.append({
            "step_id": step_id,
            "reason": str(item.get("reason") or ""),
            "severity": _severity(item.get("severity")),
        })

    robotization: List[Dict[str, Any]] = []
    for item in _items(obj.get("robotization_candidates")):
        if not isinstance(item, dict):
            dropped += 1
            continue
        step_id = str(item.get("step_id") or "")
        op_code = str(item.get("operation_code") or "").strip()
        if step_id not in valid_step_ids:
            dropped += 1
            continue
        if op_code not in ALLOWED_OPERATION_CODES or op_code in FORBIDDEN_OPERATION_CODES:
            dropped += 1  # код вне каталога → reject
            continue
        robotization.append({
            "step_id": step_id,
            "operation_code": op_code,
            "rationale": str(item.get("rationale") or ""),
        })

    risks: List[Dict[str, Any]] = []
    for item in _items(obj.get("risks")):
        if not isinstance(item, dict) or not str(item.get("text") or "").strip():
            dropped += 1
            continue
        risks.append({"text": str(item.get("text") or "").strip(), "severity": _severity(item.get("severity"))})

    open_questions: List[Dict[str, Any]] = []
    for item in _items(obj.get("open_questions")):
        if not isinstance(item, dict) or not str(item.get("text") or "").strip():
            dropped += 1
            continue
        open_questions.append({"text": str(item.get("text") or "").strip()})

    return {
        "bottlenecks": bottlenecks,
        "robotization_candidates": robotization,
        "risks": risks,
        "open_questions": open_questions,
    }, dropped


def _empty_analysis() -> Dict[str, Any]:
    return {"bottlenecks": [], "robotization_candidates": [], "risks": [], "open_questions": []}


def _llm_backend():
    """LLM_VIA_AGENT_SVC=1 → agent-сервис (internal API); иначе монолитный gateway (дефолт)."""
    if llm_internal_client.enabled():
        return llm_internal_client.complete, llm_internal_client.complete_cached
    return complete, complete_cached


def llm_process_analysis(session_id: str, request: Request = None, force: int = 0) -> Dict[str, Any]:
    """POST /api/sessions/{session_id}/llm/analysis (?force=1 — обход кэша)."""
    ctx = _request_context(request)
    sid = str(session_id or "").strip()
    if not sid:
        raise_session_not_found(session_id)
    sess = session_repo.load(
        sid,
        user_id=ctx.get("user_id"),
        org_id=ctx.get("org_id"),
        is_admin=ctx.get("is_admin"),
    )
    if not sess:
        raise_session_not_found(session_id)

    projection = build_process_projection(sess)
    digest = projection_digest(projection)
    org_id = str(getattr(sess, "org_id", "") or ctx.get("org_id") or "org_default")
    call_kwargs = {
        "user_id": str(ctx.get("user_id") or ""),
        "project_id": str(getattr(sess, "project_id", "") or ""),
        "session_id": sid,
        "org_id": org_id,
        "max_tokens": MAX_TOKENS,
    }

    complete_fn, complete_cached_fn = _llm_backend()
    if int(force or 0) == 1:
        result = complete_fn(FEATURE, projection, **call_kwargs)
        result["cached"] = False
    else:
        result = complete_cached_fn(FEATURE, digest, projection, **call_kwargs)

    base: Dict[str, Any] = {
        "session_id": sid,
        "digest": digest,
        "nodes_count": len(projection.get("steps") or []),
        "cached": bool(result.get("cached")),
    }
    if not result.get("ok"):
        # disabled / rate_limited / no_provider / error — честный статус наружу
        return {
            "ok": False,
            "status": str(result.get("status") or "error"),
            "error": str(result.get("error") or ""),
            **base,
        }

    obj = _extract_json(str(result.get("text") or ""))
    usage = result.get("usage") or {}
    extra = {
        "usage": {
            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
            "completion_tokens": int(usage.get("completion_tokens") or 0),
        },
        "provider_id": str(result.get("provider_id") or ""),
        "model": str(result.get("model") or ""),
        "prompt_version": int(result.get("prompt_version") or 0),
    }
    if obj is None:
        # кривой ответ LLM → partial, UI не падает
        return {
            "ok": True,
            "status": "partial",
            "analysis": _empty_analysis(),
            "dropped": 0,
            "raw_excerpt": str(result.get("text") or "")[:1000],
            **base,
            **extra,
        }

    analysis, dropped = filter_analysis(obj, projection)
    return {
        "ok": True,
        "status": "ok",
        "analysis": analysis,
        "dropped": dropped,
        **base,
        **extra,
    }
