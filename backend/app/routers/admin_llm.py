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
from ..ai.execution_log import list_ai_executions
from ..ai.llm_http_client import _deepseek_chat_request
from ..ai.module_catalog import ai_module_catalog_payload
from ..storage import append_audit_log
from .admin import _platform_admin_context

router = APIRouter()


_ADMIN_LLM_FORBIDDEN = {403: {"description": "Доступ запрещён: требуется platform admin"}}


class LlmProviderBody(BaseModel):
    name: str = ""
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    org_id: Optional[str] = None  # platform-admin может явно задать org; иначе текущая


class LlmProviderPatchBody(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None  # None = не менять; "" = очистить
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    org_id: Optional[str] = None  # platform-admin может сменить скоуп; audit_log пишется


class LlmPromptBody(BaseModel):
    feature: str = ""
    system: str = ""
    template: str = ""
    max_tokens: Optional[int] = None
    model_class: Optional[str] = None


class LlmFeaturePatchBody(BaseModel):
    enabled: Optional[bool] = None
    daily_token_limit: Optional[int] = None


class LlmModelBody(BaseModel):
    provider: str = ""
    model_name: str = ""
    display_name: str = ""
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    params: Optional[dict] = None


class LlmModelPatchBody(BaseModel):
    provider: Optional[str] = None
    model_name: Optional[str] = None
    display_name: Optional[str] = None
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    params: Optional[dict] = None


class LlmFeatureModelBody(BaseModel):
    model_id: Optional[str] = None  # None/"" = снять override


# ---------------------------------------------------------------- providers

@router.get("/api/admin/llm/providers", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_list_providers(request: Request) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    current_org = (oid or "").strip() or "org_default"
    # Показываем провайдеры текущей org + общие провайдеры org_default.
    org_ids = list(dict.fromkeys([current_org, "org_default"]))
    items = [llm_store.mask_provider(p) for p in llm_store.list_providers_by_orgs(org_ids)]
    return {"ok": True, "items": items, "count": len(items)}


@router.post("/api/admin/llm/providers", status_code=201, responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_create_provider(request: Request, body: LlmProviderBody) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    name = (body.name or "").strip()
    base_url = (body.base_url or "").strip()
    model = (body.model or "").strip()
    if not name or not base_url or not model:
        return _legacy_main._enterprise_error(422, "validation_error", "name, base_url and model are required")
    target_org = (body.org_id or "").strip() or (oid or "").strip() or "org_default"
    row = llm_store.create_provider(
        org_id=target_org, name=name, base_url=base_url, model=model,
        api_key=body.api_key or "", priority=100 if body.priority is None else int(body.priority),
        enabled=True if body.enabled is None else bool(body.enabled), actor=uid or "",
    )
    try:
        append_audit_log(
            actor_user_id=uid or "",
            org_id=target_org,
            action="llm_provider_created",
            entity_type="llm_provider",
            entity_id=str(row.get("id") or ""),
            meta={"org_id": target_org, "model": model},
        )
    except Exception:
        pass
    return {"ok": True, "item": llm_store.mask_provider(row)}


@router.patch("/api/admin/llm/providers/{provider_id}", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_patch_provider(request: Request, provider_id: str, body: LlmProviderPatchBody) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    current = llm_store.get_provider(provider_id)
    if current is None:
        return _legacy_main._enterprise_error(404, "not_found", "provider not found")
    fields = body.model_dump(exclude_unset=True)
    new_org = (fields.pop("org_id", None) or "").strip() or None
    previous_org = str(current.get("org_id") or "org_default")
    target_org = new_org or previous_org
    if new_org and new_org != previous_org:
        fields["org_id"] = new_org
    row = llm_store.update_provider(provider_id, fields, actor=uid or "")
    if new_org and new_org != previous_org:
        try:
            append_audit_log(
                actor_user_id=uid or "",
                org_id=target_org,
                action="llm_provider_scope_changed",
                entity_type="llm_provider",
                entity_id=provider_id,
                meta={"previous_org_id": previous_org, "new_org_id": new_org, "current_org_id": oid or "org_default"},
            )
        except Exception:
            pass
    return {"ok": True, "item": llm_store.mask_provider(row or {})}


@router.delete("/api/admin/llm/providers/{provider_id}", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_delete_provider(request: Request, provider_id: str) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    if not llm_store.delete_provider(provider_id):
        return _legacy_main._enterprise_error(404, "not_found", "provider not found")
    return {"ok": True, "deleted": True, "id": provider_id}


@router.post("/api/admin/llm/providers/{provider_id}/test", responses=_ADMIN_LLM_FORBIDDEN)
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
            model=str(provider.get("model") or "") or "deepseek-chat",
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


# ------------------------------------------------------------------ models
# Реестр моделей (миграция 016): что реально уходит в payload["model"].

@router.get("/api/admin/llm/models", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_list_models(request: Request) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    items = [llm_store.public_model(m) for m in llm_store.list_models(oid or "org_default")]
    return {"ok": True, "items": items, "count": len(items)}


@router.post("/api/admin/llm/models", status_code=201, responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_create_model(request: Request, body: LlmModelBody) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    model_name = (body.model_name or "").strip()
    if not model_name:
        return _legacy_main._enterprise_error(422, "validation_error", "model_name is required")
    row = llm_store.create_model(
        org_id=oid or "org_default", model_name=model_name,
        provider=(body.provider or "").strip(), display_name=(body.display_name or "").strip(),
        enabled=True if body.enabled is None else bool(body.enabled),
        is_default=bool(body.is_default), params=body.params or {}, actor=uid or "",
    )
    return {"ok": True, "item": llm_store.public_model(row)}


@router.patch("/api/admin/llm/models/{model_id}", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_patch_model(request: Request, model_id: str, body: LlmModelPatchBody) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    current = llm_store.get_model(model_id)
    if current is None:
        return _legacy_main._enterprise_error(404, "not_found", "model not found")
    fields = body.model_dump(exclude_unset=True)
    if current.get("is_default") and fields.get("enabled") is False:
        return _legacy_main._enterprise_error(
            422, "validation_error", "default model cannot be disabled (set another default first)")
    if current.get("is_default") and fields.get("is_default") is False:
        return _legacy_main._enterprise_error(
            422, "validation_error", "use set-default on another model instead")
    row = llm_store.update_model(model_id, fields, actor=uid or "")
    return {"ok": True, "item": llm_store.public_model(row or {})}


@router.delete("/api/admin/llm/models/{model_id}", responses={
    403: {"description": "Доступ запрещён: требуется platform admin"},
    409: {"description": "Конфликт: default-модель нельзя удалить (сначала назначьте другой default)"},
    404: {"description": "Не найдено: модель отсутствует"},
})
def admin_llm_delete_model(request: Request, model_id: str) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    current = llm_store.get_model(model_id)
    if current is None:
        return _legacy_main._enterprise_error(404, "not_found", "model not found")
    if current.get("is_default"):
        return _legacy_main._enterprise_error(
            409, "conflict", "default model cannot be deleted (set another default first)")
    llm_store.delete_model(model_id)
    return {"ok": True, "deleted": True, "id": model_id}


@router.post("/api/admin/llm/models/{model_id}/set-default", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_set_default_model(request: Request, model_id: str) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    row = llm_store.set_default_model(model_id, actor=uid or "")
    if row is None:
        return _legacy_main._enterprise_error(404, "not_found", "model not found")
    return {"ok": True, "item": llm_store.public_model(row)}


@router.get("/api/admin/llm/feature-models", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_list_feature_models(request: Request) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    items = llm_store.list_feature_model_overrides(oid or "org_default")
    return {"ok": True, "items": items, "count": len(items)}


@router.put("/api/admin/llm/feature-models/{feature}", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_put_feature_model(request: Request, feature: str, body: LlmFeatureModelBody) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    feature = (feature or "").strip()
    if not feature:
        return _legacy_main._enterprise_error(422, "validation_error", "feature is required")
    model_id = (body.model_id or "").strip() or None
    if model_id is not None and llm_store.get_model(model_id) is None:
        return _legacy_main._enterprise_error(422, "validation_error", "model not found")
    llm_store.set_feature_model_override(
        feature, model_id, org_id=oid or "org_default", actor=uid or "")
    return {"ok": True, "item": {"feature": feature, "model_id": model_id or ""}}


# ------------------------------------------------------------------ prompts

@router.get("/api/admin/llm/prompts", responses=_ADMIN_LLM_FORBIDDEN)
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


@router.get("/api/admin/llm/prompts/{prompt_id}", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_get_prompt(request: Request, prompt_id: str) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    row = llm_store.get_prompt(prompt_id)
    if row is None:
        return _legacy_main._enterprise_error(404, "not_found", "prompt not found")
    return {"ok": True, "item": row}


@router.post("/api/admin/llm/prompts", status_code=201, responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_create_prompt(request: Request, body: LlmPromptBody) -> Any:
    uid, oid, err = _platform_admin_context(request)
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
    try:
        append_audit_log(
            actor_user_id=uid or "",
            org_id=oid or "org_default",
            action="llm_prompt_created",
            entity_type="llm_prompt",
            entity_id=str(row.get("id") or ""),
            meta={"feature": feature, "version": int(row.get("version") or 0)},
        )
    except Exception:
        pass
    return {"ok": True, "item": row}


@router.post("/api/admin/llm/prompts/{prompt_id}/activate", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_activate_prompt(request: Request, prompt_id: str) -> Any:
    uid, oid, err = _platform_admin_context(request)
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
    try:
        append_audit_log(
            actor_user_id=uid or "",
            org_id=oid or "org_default",
            action="llm_prompt_activated",
            entity_type="llm_prompt",
            entity_id=str(row.get("id") or ""),
            meta={
                "feature": str(row.get("feature") or ""),
                "version": int(row.get("version") or 0),
                "archived_id": archived_id,
            },
        )
    except Exception:
        pass
    return {"ok": True, "item": row, "archived_id": archived_id}


@router.post("/api/admin/llm/prompts/{prompt_id}/rollback", responses=_ADMIN_LLM_FORBIDDEN)
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

@router.get("/api/admin/llm/features", responses=_ADMIN_LLM_FORBIDDEN)
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


@router.patch("/api/admin/llm/features/{feature}", responses=_ADMIN_LLM_FORBIDDEN)
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

@router.get("/api/admin/llm/usage", responses=_ADMIN_LLM_FORBIDDEN)
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


# ------------------------------------------------------------------ modules (legacy catalog + execution log)

@router.get("/api/admin/llm/modules", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_modules(request: Request) -> Any:
    uid, _oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    return ai_module_catalog_payload()


@router.get("/api/admin/llm/executions", responses=_ADMIN_LLM_FORBIDDEN)
def admin_llm_executions(
    request: Request,
    module_id: str = Query(default=""),
    status: str = Query(default=""),
    actor_user_id: str = Query(default=""),
    org_id: str = Query(default=""),
    workspace_id: str = Query(default=""),
    project_id: str = Query(default=""),
    session_id: str = Query(default=""),
    created_from: int = Query(default=0),
    created_to: int = Query(default=0),
    limit: int = Query(default=50),
    offset: int = Query(default=0),
) -> Any:
    uid, oid, err = _platform_admin_context(request)
    if err is not None:
        return err
    effective_org_id = (org_id or "").strip() if (org_id or "").strip() else (oid or "org_default")
    return list_ai_executions(
        org_id=effective_org_id,
        module_id=module_id or None,
        status=status or None,
        actor_user_id=actor_user_id or None,
        workspace_id=workspace_id or None,
        project_id=project_id or None,
        session_id=session_id or None,
        created_from=max(0, int(created_from or 0)) or None,
        created_to=max(0, int(created_to or 0)) or None,
        limit=max(1, min(int(limit or 50), 200)),
        offset=max(0, int(offset or 0)),
    )
