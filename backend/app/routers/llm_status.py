"""LLM4 — GET /api/llm/status (viewer+: любой аутентифицированный член организации).

Панель PROCESSMAN (v1) показывает статус LLM: настроен ли провайдер, квоту
по фиче `analysis` и активную модель из реестра (feat/llm-model-config).
Секретов, base_url и имён провайдеров в ответе НЕТ — только
`{configured, quota:{used, limit}, model:{name, display_name, source}}`
(решения владельца Q1/Q2, 2026-08-06; model добавлен контуром llm-model-config).
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Request

from .. import _legacy_main
from ..ai import llm_store

router = APIRouter()

# Квота считается по фиче analysis (решение владельца Q1): used = токены за 24ч,
# limit = daily_token_limit из llm_feature_flags (дефолт 200000 — PLAN L3).
LLM_STATUS_FEATURE = "analysis"
LLM_STATUS_WINDOW_SEC = 86400
LLM_STATUS_DEFAULT_LIMIT = 200000


@router.get("/api/llm/status")
def llm_status(request: Request) -> Any:
    oid = _legacy_main._request_active_org_id(request)
    _role, err = _legacy_main._enterprise_require_org_member(request, oid)
    if err is not None:
        return err

    flag = llm_store.get_feature_flag(LLM_STATUS_FEATURE)
    limit = (
        int(flag.get("daily_token_limit") or 0)
        if flag and flag.get("daily_token_limit")
        else LLM_STATUS_DEFAULT_LIMIT
    )
    used = llm_store.usage_daily_tokens(
        LLM_STATUS_FEATURE,
        oid,
        int(time.time()) - LLM_STATUS_WINDOW_SEC,
    )
    # Активная модель из реестра (миграция 016): default модели. Пустой реестр →
    # env-дефолт (поведение до миграции), чтобы панель всегда показывала модель.
    registry_name = llm_store.resolve_model("", oid) or ""
    if registry_name:
        display = ""
        for m in llm_store.list_models(oid):
            if m.get("is_default"):
                display = str(m.get("display_name") or "")
                break
        model_info = {
            "name": registry_name,
            "display_name": display or registry_name,
            "source": "registry",
        }
    else:
        model_info = {"name": "deepseek-chat", "display_name": "DeepSeek Chat", "source": "env"}
    return {
        # configured = enabled провайдер с непустым ключом (решение владельца Q2:
        # не any_enabled_provider — без ключа фолбэк-цепочка не работает).
        "configured": bool(llm_store.enabled_providers_with_key(oid)),
        "quota": {
            "used": int(used),
            "limit": int(limit),
        },
        "model": model_info,
    }
