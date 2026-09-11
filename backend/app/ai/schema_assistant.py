"""LLM3 — помощник на Схеме: POST /api/sessions/{id}/llm/suggest-next|explain-step|step-qa.

Три действия, только по клику, stateless, feature=schema_assistant (миграция 015,
max_tokens=800, model_class=cheap), кэш по md5 (неизменный контекст = 0 токенов).

Анти-галлюцинации (жёстче LLM1, решение владельца на gate):
- suggest_next: кандидаты СТРОГО из живого каталога operation_catalog (БД,
  load_catalog_from_db) — код вне каталога/запрещённый → dropped;
- explain_step: пересказ СТРОГО записи trace_map (детерминированный ре-прогон
  transform_asis(llm_enabled=False)); шага нет в trace → status="no_trace"
  БЕЗ вызова LLM (решения не додумываем);
- step_qa: контекст = проекция шага + соседи (не вся схема); шаг вне проекции
  → status="step_not_found" без вызова LLM.

Авторизация — org-scoped load сессии (как LLM1).
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from fastapi import Request

from ..repositories import session_repo
from ..sessions_graph import _request_context
from ..utils.session_helpers import raise_session_not_found
from ..validation.service import FORBIDDEN_OPERATION_CODES, load_catalog_from_db
from .gateway import complete, complete_cached
from . import llm_internal_client
from .process_analysis import _extract_json
from .process_projection import build_process_projection, projection_digest

FEATURE = "schema_assistant"
MAX_TOKENS = 800  # LLM3 (решение владельца: жёсткий лимит ≤800)

_SUGGEST_TAIL = 8  # хвост проекции в контексте suggest_next (экономия токенов)


def _llm_backend():
    """LLM_VIA_AGENT_SVC=1 → agent-сервис (internal API); иначе монолитный gateway (дефолт)."""
    if llm_internal_client.enabled():
        return llm_internal_client.complete, llm_internal_client.complete_cached
    return complete, complete_cached


def _canonical(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _load_session(session_id: str, request: Request = None):
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
    return sess, ctx, sid


def _call_llm(payload: Dict[str, Any], digest: str, sess: Any, ctx: Dict[str, Any], sid: str, force: int = 0) -> Dict[str, Any]:
    org_id = str(getattr(sess, "org_id", "") or ctx.get("org_id") or "org_default")
    kwargs = {
        "user_id": str(ctx.get("user_id") or ""),
        "project_id": str(getattr(sess, "project_id", "") or ""),
        "session_id": sid,
        "org_id": org_id,
        "max_tokens": MAX_TOKENS,
    }
    complete_fn, complete_cached_fn = _llm_backend()
    if int(force or 0) == 1:
        result = complete_fn(FEATURE, payload, **kwargs)
        result["cached"] = False
        return result
    return complete_cached_fn(FEATURE, digest, payload, **kwargs)


def _usage_extra(result: Dict[str, Any]) -> Dict[str, Any]:
    usage = result.get("usage") or {}
    return {
        "usage": {
            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
            "completion_tokens": int(usage.get("completion_tokens") or 0),
        },
        "provider_id": str(result.get("provider_id") or ""),
        "model": str(result.get("model") or ""),
        "prompt_version": int(result.get("prompt_version") or 0),
        # LLM4 S8: признак ответа резервного провайдера (бейдж в панели PROCESSMAN).
        "fallback": bool(result.get("fallback")),
    }


def _not_ok(result: Dict[str, Any], base: Dict[str, Any]) -> Dict[str, Any]:
    # disabled / rate_limited / no_provider / error — честный статус наружу (HTTP 200)
    return {
        "ok": False,
        "status": str(result.get("status") or "error"),
        "error": str(result.get("error") or ""),
        **base,
    }


def filter_suggestions(obj: Dict[str, Any], catalog_codes: set) -> tuple:
    """Кандидаты строго из живого каталога; код вне каталога/запрещённый → dropped."""
    candidates: List[Dict[str, Any]] = []
    dropped = 0
    raw = obj.get("candidates")
    for item in (raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            dropped += 1
            continue
        code = str(item.get("code") or "").strip()
        if code not in catalog_codes or code in FORBIDDEN_OPERATION_CODES:
            dropped += 1  # галлюцинированный код → reject
            continue
        candidates.append({"code": code, "rationale": str(item.get("rationale") or "")})
    return {"candidates": candidates[:3], "note": str(obj.get("note") or "")}, dropped


def llm_suggest_next(session_id: str, request: Request = None, after_step_id: str = "", force: int = 0) -> Dict[str, Any]:
    """«Предложить следующий блок» — кандидаты строго из живого каталога (БД)."""
    sess, ctx, sid = _load_session(session_id, request)
    projection = build_process_projection(sess)
    after = str(after_step_id or "").strip()

    catalog = load_catalog_from_db() or {}
    catalog_list = sorted(
        [
            {
                "code": str(code),
                "name": str((row or {}).get("name") or ""),
                "category": str((row or {}).get("category") or ""),
            }
            for code, row in catalog.items()
            if str(code) not in FORBIDDEN_OPERATION_CODES
        ],
        key=lambda r: r["code"],
    )
    catalog_codes = {r["code"] for r in catalog_list}

    steps = projection.get("steps") or []
    payload = {
        "action": "suggest_next",
        "after_step_id": after,
        "steps_tail": steps[-_SUGGEST_TAIL:],
        "operation_catalog": catalog_list,
    }
    digest = _md5(_canonical({
        "action": "suggest_next",
        "proj": projection_digest(projection),
        "after": after,
        "catalog": [r["code"] for r in catalog_list],
    }))

    base = {"session_id": sid, "digest": digest}
    result = _call_llm(payload, digest, sess, ctx, sid, force)
    base["cached"] = bool(result.get("cached"))
    if not result.get("ok"):
        return _not_ok(result, base)

    obj = _extract_json(str(result.get("text") or ""))
    if obj is None:
        return {
            "ok": True, "status": "partial",
            "suggestions": {"candidates": [], "note": ""}, "dropped": 0,
            "raw_excerpt": str(result.get("text") or "")[:800],
            **base, **_usage_extra(result),
        }
    suggestions, dropped = filter_suggestions(obj, catalog_codes)
    return {
        "ok": True, "status": "ok",
        "suggestions": suggestions, "dropped": dropped,
        **base, **_usage_extra(result),
    }


def _session_bpmn_xml(sess: Any) -> str:
    """Сырой XML сессии (как raw-путь /bpmn): stored, иначе регенерация из графа."""
    xml = str(getattr(sess, "bpmn_xml", "") or "").strip()
    if xml:
        return xml
    nodes = getattr(sess, "nodes", None) or []
    edges = getattr(sess, "edges", None) or []
    if not nodes and not edges:
        return ""
    try:
        from ..exporters.bpmn import export_session_to_bpmn_xml
        return str(export_session_to_bpmn_xml(sess) or "")
    except Exception:
        return ""


def find_trace_entry(xml_text: str, step_id: str) -> Optional[Dict[str, Any]]:
    """Детерминированный ре-прогон трансформации → запись trace_map по element_id.

    llm_enabled=False — объяснение строится только из сохранённых решений
    (deterministic/исторически llm помечаются source), новых решений LLM не принимает.
    """
    from ..transformation.pipeline import transform_asis

    sid = str(step_id or "").strip()
    if not sid or not str(xml_text or "").strip():
        return None
    built = transform_asis(str(xml_text), llm_enabled=False)
    for entry in (built.get("trace_map") or []):
        if str(entry.get("element_id") or "") == sid:
            return entry
    return None


def llm_explain_step(session_id: str, request: Request = None, step_id: str = "", force: int = 0) -> Dict[str, Any]:
    """«Объяснить AI-решение» — пересказ СТРОГО записи trace_map; нет записи → no_trace без LLM."""
    sess, ctx, sid = _load_session(session_id, request)
    step = str(step_id or "").strip()
    base = {"session_id": sid, "step_id": step}
    if not step:
        return {"ok": False, "status": "bad_request", "error": "step_id_required", **base}

    xml = _session_bpmn_xml(sess)
    entry = find_trace_entry(xml, step)
    if entry is None:
        # решения по этому шагу нет в trace — НЕ додумываем, LLM не вызываем
        return {"ok": False, "status": "no_trace", "error": "no transform decision for this step", **base}

    trace_payload = {
        "element_id": str(entry.get("element_id") or ""),
        "element_type": str(entry.get("element_type") or ""),
        "name": str(entry.get("name") or ""),
        "fate": str(entry.get("fate") or ""),
        "rule_id": str(entry.get("rule_id") or ""),
        "rule_name": str(entry.get("rule_name") or ""),
        "source": str(entry.get("source") or ""),
        "note": str(entry.get("note") or ""),
    }
    payload = {"action": "explain_step", "trace": trace_payload}
    digest = _md5(_canonical({"action": "explain_step", "xml": _md5(xml), "step": step}))
    base["digest"] = digest

    result = _call_llm(payload, digest, sess, ctx, sid, force)
    base["cached"] = bool(result.get("cached"))
    if not result.get("ok"):
        return _not_ok(result, base)

    obj = _extract_json(str(result.get("text") or ""))
    if obj is None:
        return {
            "ok": True, "status": "partial",
            "explanation": "", "note": "",
            "trace": trace_payload,
            "raw_excerpt": str(result.get("text") or "")[:800],
            **base, **_usage_extra(result),
        }
    return {
        "ok": True, "status": "ok",
        "explanation": str(obj.get("explanation") or ""),
        "note": str(obj.get("note") or ""),
        "trace": trace_payload,
        **base, **_usage_extra(result),
    }


def llm_step_qa(session_id: str, request: Request = None, step_id: str = "", question: str = "", force: int = 0) -> Dict[str, Any]:
    """«Спросить про шаг» — контекст = проекция шага + соседи (не вся схема)."""
    sess, ctx, sid = _load_session(session_id, request)
    step = str(step_id or "").strip()
    q = str(question or "").strip()
    base = {"session_id": sid, "step_id": step}
    if not step:
        return {"ok": False, "status": "bad_request", "error": "step_id_required", **base}
    if not q:
        return {"ok": False, "status": "bad_request", "error": "question_required", **base}

    projection = build_process_projection(sess)
    steps = projection.get("steps") or []
    by_id = {str(s.get("id") or ""): s for s in steps}
    target = by_id.get(step)
    if target is None:
        return {"ok": False, "status": "step_not_found", "error": "step not in session projection", **base}

    neighbors: List[Dict[str, Any]] = []
    for e in (projection.get("edges") or []):
        src, dst = str(e.get("from") or ""), str(e.get("to") or "")
        if dst == step and src in by_id:
            neighbors.append({"direction": "prev", "step": by_id[src]})
        elif src == step and dst in by_id:
            neighbors.append({"direction": "next", "step": by_id[dst]})

    payload = {
        "action": "step_qa",
        "step": target,
        "neighbors": neighbors,
        "question": q,
    }
    digest = _md5(_canonical({
        "action": "step_qa",
        "proj": projection_digest(projection),
        "step": step,
        "q": " ".join(q.lower().split()),
    }))
    base["digest"] = digest

    result = _call_llm(payload, digest, sess, ctx, sid, force)
    base["cached"] = bool(result.get("cached"))
    if not result.get("ok"):
        return _not_ok(result, base)

    obj = _extract_json(str(result.get("text") or ""))
    if obj is None:
        return {
            "ok": True, "status": "partial",
            "answer": "", "note": "",
            "raw_excerpt": str(result.get("text") or "")[:800],
            **base, **_usage_extra(result),
        }
    return {
        "ok": True, "status": "ok",
        "answer": str(obj.get("answer") or ""),
        "note": str(obj.get("note") or ""),
        **base, **_usage_extra(result),
    }
