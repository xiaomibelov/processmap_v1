"""LLM Gateway Service — КОПИЯ backend/app/ai/gateway.py (ядро agent-сервиса).

Единая точка вызова LLM:
  complete(feature, payload, ...)          — прямой вызов через фолбэк-цепочку провайдеров;
  complete_cached(feature, cache_key, ...) — Redis-кэш; hit = 0 токенов (cached=true).

Поток complete():
  1. feature flag enabled? иначе status="disabled";
  2. суточный лимит токенов фичи (llm_feature_flags.daily_token_limit, сумма llm_usage за 24ч)
     исчерпан → status="rate_limited" (НЕ 500);
  3. активный промт (llm_prompts status='active', max version) → system/template/max_tokens;
  4. провайдеры: enabled + непустой ключ, по priority ASC; таблица без enabled-провайдеров
     → env-фолбэк (DEEPSEEK_API_KEY/DEEPSEEK_BASE_URL); вызывать нечего → status="no_provider";
  5. вызов через retry-клиент (gateway/llm_http_client._deepseek_chat_request — копия);
  6. llm_usage пишется ВСЕГДА (ok/error/rate_limited/no_provider/disabled/cached).

Ключи провайдеров читаются из общей БД на каждый вызов (редактируются без
редеплоя; resolve_model — TTL-кэш 60с); ключ никогда не возвращается и не
логируется. Отличия от монолитного оригинала — только импорты (локальные
llm_store / llm_http_client / redis_cache).
"""
from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, Generator, List, Optional, Tuple

import requests

from . import llm_store
from .llm_http_client import _deepseek_chat_request, _deepseek_chat_request_stream
from .redis_cache import cache_get_json, cache_set_json

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
    providers = llm_store.effective_providers_with_key(org_id)
    if providers:
        return providers
    if not llm_store.any_enabled_provider(org_id) and not llm_store.any_enabled_provider("org_default"):
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


def _resolve_prompt(
    feature: str,
    prompt_override: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Return effective prompt: prompt_override fields override the DB prompt."""
    db_prompt = llm_store.get_active_prompt(feature)
    if not prompt_override:
        return db_prompt
    effective: Dict[str, Any] = dict(db_prompt or {})
    for key in ("system", "template", "max_tokens"):
        if key in prompt_override and prompt_override[key] is not None:
            effective[key] = prompt_override[key]
    return effective


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
    json_mode: bool = False,
    prompt_override: Optional[Dict[str, Any]] = None,
    model_class: Optional[str] = None,
) -> Dict[str, Any]:
    """Вызов LLM через фолбэк-цепочку провайдеров. Никогда не бросает исключений.

    model_class: explicit routing class. If None, inferred from the active prompt.
    """
    started = time.monotonic()

    def _finish(status: str, **extra: Any) -> Dict[str, Any]:
        latency_ms = int((time.monotonic() - started) * 1000)
        usage = extra.get("usage") or {}
        model = str(extra.get("model") or "")
        cost_usd = 0.0
        if status == "ok" and not extra.get("cached"):
            cost_usd = llm_store.estimate_cost(
                model,
                int(usage.get("prompt_tokens", 0)),
                int(usage.get("completion_tokens", 0)),
            )
        llm_store.record_usage(
            org_id=org_id, feature=feature,
            model=model,
            provider_id=extra.get("provider_id", "") or "",
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            cached=bool(extra.get("cached")), cost_usd=cost_usd,
            user_id=user_id, project_id=project_id, session_id=session_id,
            latency_ms=latency_ms, status=status,
        )
        return _result(status, latency_ms=latency_ms, cost_usd=cost_usd, **extra)

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

    # 3. активный промт (prompt_override позволяет caller подменить system/template/max_tokens)
    prompt = _resolve_prompt(feature, prompt_override)
    effective_max_tokens = int(max_tokens or (prompt or {}).get("max_tokens") or DEFAULT_MAX_TOKENS)
    messages = _render_messages(prompt, payload)

    # 4–5. провайдеры по priority с фолбэком
    chain = _provider_chain(org_id)
    if not chain:
        return _finish("no_provider", error="no enabled LLM providers with api key")

    last_error = ""
    for provider_index, provider in enumerate(chain):
        # LLM4 S8: fallback = ответил НЕ первый провайдер цепочки (или env-фолбэк,
        # или провайдер из org_default fallback для другой org).
        fallback_used = (
            provider_index > 0
            or str(provider.get("id") or "") == "env_fallback"
            or str(provider.get("org_id") or "org_default") != org_id
        )
        # Резолв модели: реестр (override фичи + класс → default класса) → provider.model.
        if model_class is not None:
            resolved_model = llm_store.resolve_model(feature, org_id, model_class) or str(provider.get("model") or "")
        else:
            resolved_model = llm_store.resolve_model_for_feature(feature, org_id) or str(provider.get("model") or "")
        supports_json_mode = llm_store.provider_supports_json_mode(provider)
        json_mode_used = json_mode and supports_json_mode
        try:
            resp = _deepseek_chat_request(
                api_key=str(provider.get("api_key") or ""),
                base_url=str(provider.get("base_url") or ""),
                messages=messages,
                temperature=0.2,
                timeout=timeout_sec,
                max_tokens=effective_max_tokens,
                max_attempts=_GATEWAY_MAX_ATTEMPTS,
                retry_on_timeout=False,
                model=resolved_model,
                response_format={"type": "json_object"} if json_mode_used else None,
            )
        except Exception as exc:  # фолбэк на следующего провайдера
            is_timeout = isinstance(exc, (requests.exceptions.Timeout, requests.exceptions.ConnectionError))
            last_error = f"{provider.get('name')}: {exc.__class__.__name__}: {exc}"
            llm_store.record_usage(
                org_id=org_id, feature=feature, model=resolved_model or str(provider.get("model") or ""),
                provider_id=str(provider.get("id") or ""), cached=False,
                user_id=user_id, project_id=project_id, session_id=session_id,
                latency_ms=int((time.monotonic() - started) * 1000), status="error",
            )
            if is_timeout:
                # Fast failover on timeout/connection loss: don't waste time
                # retrying the same slow/unreachable upstream.
                continue
            # For retryable HTTP errors (5xx, 429) retry already happened inside
            # _deepseek_chat_request; if it still fails, move to next provider.
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
            json_mode_used=json_mode_used,
        )

    return _finish("error", error=last_error or "all providers failed")


def llm_cache_key(feature: str, digest: str) -> str:
    return f"pm:cache:llm:{feature}:v1:{digest}"


def complete_cached(
    feature: str,
    cache_digest: str,
    payload: Any = None,
    *,
    prompt_override: Optional[Dict[str, Any]] = None,
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
            json_mode_used=bool(cached_payload.get("json_mode_used")),
        )
    result = complete(feature, payload, prompt_override=prompt_override, **kwargs)
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


# ---------------------------------------------------------------------------
# Streaming variant: yields (event_type, payload) tuples.
# event_type ∈ {"token", "usage", "error"}
# ---------------------------------------------------------------------------

def complete_stream(
    feature: str,
    payload: Any = None,
    *,
    user_id: str = "",
    project_id: str = "",
    session_id: str = "",
    org_id: str = "org_default",
    max_tokens: Optional[int] = None,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
    json_mode: bool = False,
    model_class: Optional[str] = None,
) -> Generator[Tuple[str, Dict[str, Any]], None, None]:
    """Streaming LLM call through the fallback chain.

    Yields:
        ("token", {"delta": str})         — next text fragment
        ("usage", {"usage": ..., "model": ..., ...}) — final metadata
        ("error", {"status": str, "error": str})    — gateway-level failure
    Never raises; terminal event is always either usage or error.
    """
    started = time.monotonic()

    def _record(status: str, **extra: Any) -> Dict[str, Any]:
        latency_ms = int((time.monotonic() - started) * 1000)
        usage = extra.get("usage", {}) or {}
        model = str(extra.get("model") or "")
        cost_usd = 0.0
        if status == "ok":
            cost_usd = llm_store.estimate_cost(
                model,
                int(usage.get("prompt_tokens", 0)),
                int(usage.get("completion_tokens", 0)),
            )
        llm_store.record_usage(
            org_id=org_id, feature=feature,
            model=model,
            provider_id=extra.get("provider_id", "") or "",
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            completion_tokens=int(usage.get("completion_tokens", 0)),
            cached=False, cost_usd=cost_usd,
            user_id=user_id, project_id=project_id, session_id=session_id,
            latency_ms=latency_ms, status=status,
        )
        return {"status": status, "latency_ms": latency_ms, "cost_usd": cost_usd, **extra}

    # 1. feature flag
    flag = llm_store.get_feature_flag(feature)
    if flag is not None and not flag.get("enabled"):
        yield ("error", _record("disabled", error=f"feature '{feature}' is disabled"))
        return

    # 2. daily token limit
    if flag is not None:
        limit = int(flag.get("daily_token_limit") or 0)
        if limit > 0:
            used = llm_store.usage_daily_tokens(feature, org_id, int(time.time()) - 24 * 3600)
            if used >= limit:
                yield (
                    "error",
                    _record(
                        "rate_limited",
                        error=f"daily token limit reached ({used}/{limit})",
                        used_tokens_24h=used,
                        daily_token_limit=limit,
                    ),
                )
                return

    # 3. active prompt
    prompt = llm_store.get_active_prompt(feature)
    effective_max_tokens = int(max_tokens or (prompt or {}).get("max_tokens") or DEFAULT_MAX_TOKENS)
    messages = _render_messages(prompt, payload)

    # 4–5. provider chain
    chain = _provider_chain(org_id)
    if not chain:
        yield ("error", _record("no_provider", error="no enabled LLM providers with api key"))
        return

    last_error = ""
    for provider_index, provider in enumerate(chain):
        fallback_used = (
            provider_index > 0
            or str(provider.get("id") or "") == "env_fallback"
            or str(provider.get("org_id") or "org_default") != org_id
        )
        if model_class is not None:
            resolved_model = llm_store.resolve_model(feature, org_id, model_class) or str(provider.get("model") or "")
        else:
            resolved_model = llm_store.resolve_model_for_feature(feature, org_id) or str(provider.get("model") or "")
        supports_json_mode = llm_store.provider_supports_json_mode(provider)
        json_mode_used = json_mode and supports_json_mode
        collected_text = ""
        usage_out: Dict[str, Any] = {"prompt_tokens": 0, "completion_tokens": 0}
        model_out = str(provider.get("model") or "")
        try:
            for chunk in _deepseek_chat_request_stream(
                api_key=str(provider.get("api_key") or ""),
                base_url=str(provider.get("base_url") or ""),
                messages=messages,
                temperature=0.2,
                timeout=timeout_sec,
                max_tokens=effective_max_tokens,
                max_attempts=_GATEWAY_MAX_ATTEMPTS,
                retry_on_timeout=False,
                model=resolved_model,
                response_format={"type": "json_object"} if json_mode_used else None,
            ):
                if not isinstance(chunk, dict):
                    continue
                choices = chunk.get("choices") or []
                choice = choices[0] if choices else {}
                delta = choice.get("delta") or {}
                delta_content = delta.get("content")
                if delta_content is not None:
                    text_piece = str(delta_content)
                    collected_text += text_piece
                    yield ("token", {"delta": text_piece})
                message = choice.get("message") or {}
                msg_content = message.get("content")
                if msg_content is not None:
                    text_piece = str(msg_content)
                    collected_text = text_piece
                    yield ("token", {"delta": text_piece})
                usage_raw = chunk.get("usage") or {}
                if usage_raw:
                    usage_out = {
                        "prompt_tokens": int(usage_raw.get("prompt_tokens") or 0),
                        "completion_tokens": int(usage_raw.get("completion_tokens") or 0),
                    }
                model_out = str(chunk.get("model") or model_out)

            # If provider returned no delta but a non-streaming message was already
            # emitted above, collected_text is set.  If nothing was emitted at all,
            # emit a single fallback token with whatever we have (even if empty).
            if not collected_text:
                yield ("token", {"delta": ""})

            yield (
                "usage",
                _record(
                    "ok",
                    usage=usage_out,
                    text=collected_text,
                    provider_id=str(provider.get("id") or ""),
                    model=model_out,
                    prompt_version=int((prompt or {}).get("version") or 0),
                    fallback=fallback_used,
                ),
            )
            return
        except Exception as exc:
            is_timeout = isinstance(exc, (requests.exceptions.Timeout, requests.exceptions.ConnectionError))
            last_error = f"{provider.get('name')}: {exc.__class__.__name__}: {exc}"
            last_provider_id = str(provider.get("id") or "")
            last_model = resolved_model or str(provider.get("model") or "")
            llm_store.record_usage(
                org_id=org_id, feature=feature, model=last_model,
                provider_id=last_provider_id, cached=False,
                user_id=user_id, project_id=project_id, session_id=session_id,
                latency_ms=int((time.monotonic() - started) * 1000), status="error",
            )
            if is_timeout:
                # Fast failover on timeout/connection loss for streaming too.
                continue
            continue

    yield (
        "error",
        _record(
            "error",
            error=last_error or "all providers failed",
            provider_id=last_provider_id,
            model=last_model,
        ),
    )
