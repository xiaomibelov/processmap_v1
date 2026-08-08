"""LLM0 — LLM Gateway Service (server-side only).

Единая точка вызова LLM для новых фич (LLM1–LLM3):
  complete(feature, payload, ...)          — прямой вызов через фолбэк-цепочку провайдеров;
  complete_cached(feature, cache_key, ...) — Redis-кэш; hit = 0 токенов (cached=true).

Поток complete():
  1. feature flag enabled? иначе status="disabled";
  2. суточный лимит токенов фичи (llm_feature_flags.daily_token_limit, сумма llm_usage за 24ч)
     исчерпан → status="rate_limited" (НЕ 500);
  3. активный промт (llm_prompts status='active', max version) → system/template/max_tokens;
  4. провайдеры: enabled + непустой ключ, по priority ASC; таблица без enabled-провайдеров
     → env-фолбэк (DEEPSEEK_API_KEY/DEEPSEEK_BASE_URL); вызывать нечего → status="no_provider";
  5. вызов через существующий retry-клиент (app.ai.deepseek_questions._deepseek_chat_request);
  6. llm_usage пишется ВСЕГДА (ok/error/rate_limited/no_provider/disabled/cached).

Ключи провайдеров читаются из БД на каждый вызов (редактируются без редеплоя);
ключ никогда не возвращается и не логируется.
"""
from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Optional

from ..redis_cache import cache_get_json, cache_set_json
from . import llm_store
from .deepseek_questions import _deepseek_chat_request

CACHE_TTL_SEC = 7 * 24 * 3600  # 7 дней
DEFAULT_TIMEOUT_SEC = 30
DEFAULT_MAX_TOKENS = 2000
_GATEWAY_MAX_ATTEMPTS = 2  # retry только внутри gateway (429/5xx/timeout), ≤2 попытки на провайдера


def _env_fallback_provider() -> Optional[Dict[str, Any]]:
    """Env-фолбэк, только когда в таблице нет ни одного enabled-провайдера."""
    api_key = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    if not api_key:
        return None
    return {
        "id": "env_fallback",
        "name": "env-fallback",
        "base_url": (os.environ.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").strip(),
        "api_key": api_key,
        "model": "deepseek-chat",
        "priority": 1000,
        "enabled": True,
    }


def _provider_chain(org_id: str) -> List[Dict[str, Any]]:
    providers = llm_store.enabled_providers_with_key(org_id)
    if providers:
        return providers
    if not llm_store.any_enabled_provider(org_id):
        env_provider = _env_fallback_provider()
        if env_provider:
            return [env_provider]
    return []


def _render_messages(prompt: Optional[Dict[str, Any]], payload: Any) -> List[Dict[str, str]]:
    system = str((prompt or {}).get("system") or "")
    template = str((prompt or {}).get("template") or "")
    payload_json = json.dumps(payload if payload is not None else {}, ensure_ascii=False)
    if "{input}" in template:
        user = template.replace("{input}", payload_json)
    elif template:
        user = f"{template}\n\n{payload_json}"
    else:
        user = payload_json
    messages: List[Dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user})
    return messages


def _result(status: str, **extra: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {"ok": status == "ok", "status": status}
    out.update(extra)
    return out


def complete(
    feature: str,
    payload: Any = None,
    *,
    user_id: str = "",
    project_id: str = "",
    session_id: str = "",
    org_id: str = "org_default",
    max_tokens: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
) -> Dict[str, Any]:
    """Вызов LLM через фолбэк-цепочку провайдеров. Никогда не бросает исключений."""
    started = time.monotonic()

    def _finish(status: str, **extra: Any) -> Dict[str, Any]:
        latency_ms = int((time.monotonic() - started) * 1000)
        llm_store.record_usage(
            org_id=org_id, feature=feature,
            model=extra.get("model", "") or "",
            provider_id=extra.get("provider_id", "") or "",
            prompt_tokens=extra.get("usage", {}).get("prompt_tokens", 0),
            completion_tokens=extra.get("usage", {}).get("completion_tokens", 0),
            cached=False, user_id=user_id, project_id=project_id, session_id=session_id,
            latency_ms=latency_ms, status=status,
        )
        return _result(status, latency_ms=latency_ms, **extra)

    # 1. feature flag
    flag = llm_store.get_feature_flag(feature)
    if flag is not None and not flag.get("enabled"):
        return _finish("disabled", error=f"feature '{feature}' is disabled")

    # 2. суточный лимит токенов
    if flag is not None:
        limit = int(flag.get("daily_token_limit") or 0)
        if limit > 0:
            used = llm_store.usage_daily_tokens(feature, org_id, int(time.time()) - 24 * 3600)
            if used >= limit:
                return _finish("rate_limited", error=f"daily token limit reached ({used}/{limit})",
                               used_tokens_24h=used, daily_token_limit=limit)

    # 3. активный промт
    prompt = llm_store.get_active_prompt(feature)
    effective_max_tokens = int(max_tokens or (prompt or {}).get("max_tokens") or DEFAULT_MAX_TOKENS)
    messages = _render_messages(prompt, payload)

    # 4–5. провайдеры по priority с фолбэком
    chain = _provider_chain(org_id)
    if not chain:
        return _finish("no_provider", error="no enabled LLM providers with api key")

    last_error = ""
    for provider_index, provider in enumerate(chain):
        # LLM4 S8: fallback = ответил НЕ первый провайдер цепочки (или env-фолбэк).
        fallback_used = provider_index > 0 or str(provider.get("id") or "") == "env_fallback"
        try:
            resp = _deepseek_chat_request(
                api_key=str(provider.get("api_key") or ""),
                base_url=str(provider.get("base_url") or ""),
                messages=messages,
                temperature=0.2,
                timeout=timeout_sec,
                max_tokens=effective_max_tokens,
                max_attempts=_GATEWAY_MAX_ATTEMPTS,
            )
        except Exception as exc:  # фолбэк на следующего провайдера
            last_error = f"{provider.get('name')}: {exc.__class__.__name__}: {exc}"
            llm_store.record_usage(
                org_id=org_id, feature=feature, model=str(provider.get("model") or ""),
                provider_id=str(provider.get("id") or ""), cached=False,
                user_id=user_id, project_id=project_id, session_id=session_id,
                latency_ms=int((time.monotonic() - started) * 1000), status="error",
            )
            continue
        text = ""
        try:
            text = str(((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
        except Exception:
            text = ""
        usage_raw = resp.get("usage") or {}
        usage = {
            "prompt_tokens": int(usage_raw.get("prompt_tokens") or 0),
            "completion_tokens": int(usage_raw.get("completion_tokens") or 0),
        }
        return _finish(
            "ok", text=text, usage=usage,
            provider_id=str(provider.get("id") or ""),
            model=str(resp.get("model") or provider.get("model") or ""),
            prompt_version=int((prompt or {}).get("version") or 0),
            fallback=fallback_used,
        )

    return _finish("error", error=last_error or "all providers failed")


def llm_cache_key(feature: str, digest: str) -> str:
    return f"pm:cache:llm:{feature}:v1:{digest}"


def complete_cached(
    feature: str,
    cache_digest: str,
    payload: Any = None,
    *,
    cache_client: Any = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Кэшированный вызов: hit → 0 токенов (llm_usage cached=true), miss → complete()."""
    key = llm_cache_key(feature, cache_digest)
    cached_payload = cache_get_json(key, client=cache_client)
    if cached_payload is not None:
        latency_start = time.monotonic()
        llm_store.record_usage(
            org_id=kwargs.get("org_id", "org_default"), feature=feature,
            model=str(cached_payload.get("model") or ""),
            provider_id=str(cached_payload.get("provider_id") or ""),
            cached=True, user_id=kwargs.get("user_id", ""),
            project_id=kwargs.get("project_id", ""), session_id=kwargs.get("session_id", ""),
            latency_ms=int((time.monotonic() - latency_start) * 1000), status="ok",
        )
        return _result(
            "ok", cached=True, text=str(cached_payload.get("text") or ""),
            usage={"prompt_tokens": 0, "completion_tokens": 0},
            provider_id=str(cached_payload.get("provider_id") or ""),
            model=str(cached_payload.get("model") or ""),
            prompt_version=int(cached_payload.get("prompt_version") or 0),
            fallback=bool(cached_payload.get("fallback")),
        )
    result = complete(feature, payload, **kwargs)
    result["cached"] = False
    if result.get("ok"):
        cache_set_json(
            key,
            {
                "text": result.get("text") or "",
                "model": result.get("model") or "",
                "provider_id": result.get("provider_id") or "",
                "prompt_version": result.get("prompt_version") or 0,
                "fallback": bool(result.get("fallback")),
            },
            ttl_sec=CACHE_TTL_SEC,
            client=cache_client,
        )
    return result
