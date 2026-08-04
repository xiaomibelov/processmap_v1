"""LLM0 — admin API /api/admin/llm/* (platform-admin only, паттерн routers/admin.py).

Провайдеры (api_key никогда не отдаётся — has_api_key + key_last4),
промты (версионирование draft/active/archive + откат), фичефлаги с суточными
лимитами, экран расхода (агрегация llm_usage по дням/фичам/моделям).
"""
from __future__ import annotations

import time
from typing import Any, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from .. import _legacy_main
from ..ai import llm_store
from ..ai.deepseek_questions import _deepseek_chat_request
from .admin import _platform_admin_context

router = APIRouter()


class LlmProviderBody(BaseModel):
    name: str = ""
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    priority: Optional[int] = None
    enabled: Optional[bool] = None


class LlmProviderPatchBody(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None  # None = не менять; "" = очистить
    priority: Optional[int] = None
    enabled: Optional[bool] = None


class LlmPromptBody(BaseModel):
    feature: str = ""
    system: str = ""
    template: str = ""
    max_tokens: Optional[int] = None
    model_class: Optional[str] = None


class LlmFeaturePatchBody(BaseModel):
    enabled: Optional[bool] = None
    daily_token_limit: Optional[int] = None


# ---------------------------------------------------------------- providers

@router.get("/api/admin/llm/providers")
def admin_llm_list_providers(request: Request) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    items = [llm_store.mask_provider(p) for p in llm_store.list_providers(oid or "org_default")]
    return {"ok": True, "items": items, "count": len(items)}


@router.post("/api/admin/llm/providers", status_code=201)
def admin_llm_create_provider(request: Request, body: LlmProviderBody) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    name = (body.name or "").strip()
    base_url = (body.base_url or "").strip()
    model = (body.model or "").strip()
    if not name or not base_url or not model:
        return _legacy_main._enterprise_error(422, "validation_error", "name, base_url and model are required")
    row = llm_store.create_provider(
        org_id=oid or "org_default", name=name, base_url=base_url, model=model,
        api_key=body.api_key or "", priority=100 if body.priority is None else int(body.priority),
        enabled=True if body.enabled is None else bool(body.enabled), actor=uid or "",
    )
    return {"ok": True, "item": llm_store.mask_provider(row)}


@router.patch("/api/admin/llm/providers/{provider_id}")
def admin_llm_patch_provider(request: Request, provider_id: str, body: LlmProviderPatchBody) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    if llm_store.get_provider(provider_id) is None:
        return _legacy_main._enterprise_error(404, "not_found", "provider not found")
    fields = body.model_dump(exclude_unset=True)
    row = llm_store.update_provider(provider_id, fields, actor=uid or "")
    return {"ok": True, "item": llm_store.mask_provider(row or {})}


@router.delete("/api/admin/llm/providers/{provider_id}")
def admin_llm_delete_provider(request: Request, provider_id: str) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    if not llm_store.delete_provider(provider_id):
        return _legacy_main._enterprise_error(404, "not_found", "provider not found")
    return {"ok": True, "deleted": True, "id": provider_id}


@router.post("/api/admin/llm/providers/{provider_id}/test")
def admin_llm_test_provider(request: Request, provider_id: str) -> Any:
    """Тестовый вызов провайдера (verify_llm_settings-паттерн): latency + preview.

    Ключ берётся из БД на бэке и НЕ возвращается; ошибки — без тела запроса.
    Отключённый провайдер — честный статус без вызова (не 500).
    Вызов учитывается в llm_usage (feature='admin_provider_test') — виден в «Расходе».
    """
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    provider = llm_store.get_provider(provider_id)
    if provider is None:
        return _legacy_main._enterprise_error(404, "not_found", "provider not found")
    if not provider.get("enabled"):
        return {"ok": True, "item": {"ok": False, "latency_ms": 0, "model": provider.get("model") or "",
                                     "preview": "", "error": "provider is disabled"}}
    api_key = str(provider.get("api_key") or "").strip()
    if not api_key:
        return {"ok": True, "item": {"ok": False, "latency_ms": 0, "model": provider.get("model") or "",
                                     "preview": "", "error": "api_key is not set"}}
    started = time.monotonic()
    try:
        resp = _deepseek_chat_request(
            api_key=api_key,
            base_url=str(provider.get("base_url") or ""),
            messages=[{"role": "user", "content": "ping"}],
            temperature=0.0,
            timeout=20,
            max_tokens=16,
            max_attempts=1,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        preview = ""
        try:
            preview = str(((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or "")[:120]
        except Exception:
            preview = ""
        usage_raw = resp.get("usage") or {}
        model = str(resp.get("model") or provider.get("model") or "")
        llm_store.record_usage(
            org_id=oid or "org_default", feature="admin_provider_test", model=model,
            provider_id=provider_id, prompt_tokens=int(usage_raw.get("prompt_tokens") or 0),
            completion_tokens=int(usage_raw.get("completion_tokens") or 0),
            user_id=uid or "", latency_ms=latency_ms, status="ok",
        )
        return {"ok": True, "item": {"ok": True, "latency_ms": latency_ms,
                                     "model": model,
                                     "preview": preview, "error": ""}}
    except Exception as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        llm_store.record_usage(
            org_id=oid or "org_default", feature="admin_provider_test",
            model=str(provider.get("model") or ""), provider_id=provider_id,
            user_id=uid or "", latency_ms=latency_ms, status="error",
        )
        return {"ok": True, "item": {"ok": False, "latency_ms": latency_ms,
                                     "model": provider.get("model") or "", "preview": "",
                                     "error": f"{exc.__class__.__name__}: {exc}"}}


# ------------------------------------------------------------------ prompts

@router.get("/api/admin/llm/prompts")
def admin_llm_list_prompts(
    request: Request,
    feature: str = Query(default=""),
    status: str = Query(default=""),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    result = llm_store.list_prompts(feature=feature, status=status, limit=limit, offset=offset)
    return {"ok": True, **result}


@router.post("/api/admin/llm/prompts", status_code=201)
def admin_llm_create_prompt(request: Request, body: LlmPromptBody) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    feature = (body.feature or "").strip()
    if not feature:
        return _legacy_main._enterprise_error(422, "validation_error", "feature is required")
    model_class = (body.model_class or "primary").strip() or "primary"
    if model_class not in ("primary", "cheap"):
        return _legacy_main._enterprise_error(422, "validation_error", "model_class must be primary|cheap")
    row = llm_store.create_prompt_draft(
        feature=feature, system=body.system or "", template=body.template or "",
        max_tokens=2000 if body.max_tokens is None else int(body.max_tokens),
        model_class=model_class, actor=uid or "",
    )
    return {"ok": True, "item": row}


@router.post("/api/admin/llm/prompts/{prompt_id}/activate")
def admin_llm_activate_prompt(request: Request, prompt_id: str) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    before = llm_store.get_prompt(prompt_id)
    if before is None:
        return _legacy_main._enterprise_error(404, "not_found", "prompt not found")
    prev_active = llm_store.get_active_prompt(before["feature"])
    row = llm_store.activate_prompt(prompt_id, actor=uid or "")
    archived_id = ""
    if prev_active and prev_active.get("id") != prompt_id:
        archived_id = str(prev_active.get("id") or "")
    return {"ok": True, "item": row, "archived_id": archived_id}


@router.post("/api/admin/llm/prompts/{prompt_id}/rollback")
def admin_llm_rollback_prompt(request: Request, prompt_id: str) -> Any:
    """Откат: активирует последнюю archived-версию той же фичи (ниже текущего active)."""
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    prompt = llm_store.get_prompt(prompt_id)
    if prompt is None:
        return _legacy_main._enterprise_error(404, "not_found", "prompt not found")
    target = llm_store.rollback_target(prompt["feature"])
    if target is None:
        return _legacy_main._enterprise_error(409, "no_rollback_target", "no archived version to rollback to")
    row = llm_store.activate_prompt(target["id"], actor=uid or "")
    return {"ok": True, "item": row}


# ------------------------------------------------------------------- flags

@router.get("/api/admin/llm/features")
def admin_llm_list_features(request: Request) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    org_id = oid or "org_default"
    used = llm_store.usage_daily_tokens_by_feature(org_id, int(time.time()) - 24 * 3600)
    items = []
    for flag in llm_store.list_feature_flags():
        feature = str(flag.get("feature") or "")
        items.append({
            "feature": feature,
            "enabled": bool(flag.get("enabled")),
            "daily_token_limit": int(flag.get("daily_token_limit") or 0),
            "used_tokens_24h": int(used.get(feature, 0)),
            "updated_by": flag.get("updated_by") or "",
            "updated_at": int(flag.get("updated_at") or 0),
        })
    return {"ok": True, "items": items}


@router.patch("/api/admin/llm/features/{feature}")
def admin_llm_patch_feature(request: Request, feature: str, body: LlmFeaturePatchBody) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    if body.enabled is None and body.daily_token_limit is None:
        return _legacy_main._enterprise_error(422, "validation_error", "nothing to patch")
    row = llm_store.patch_feature_flag(
        feature, enabled=body.enabled, daily_token_limit=body.daily_token_limit, actor=uid or "",
    )
    return {"ok": True, "item": {
        "feature": row["feature"],
        "enabled": bool(row.get("enabled")),
        "daily_token_limit": int(row.get("daily_token_limit") or 0),
        "updated_by": row.get("updated_by") or "",
        "updated_at": int(row.get("updated_at") or 0),
    }}


# ------------------------------------------------------------------ usage

@router.get("/api/admin/llm/usage")
def admin_llm_usage(
    request: Request,
    from_ts: int = Query(default=0),
    to_ts: int = Query(default=0),
    feature: str = Query(default=""),
    model: str = Query(default=""),
) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    result = llm_store.usage_aggregate(
        from_ts=from_ts, to_ts=to_ts, feature=feature, model=model, org_id=oid or "org_default",
    )
    return {"ok": True, **result}
