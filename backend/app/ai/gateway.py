"""LLM0 — LLM Gateway Service (server-side only).

Единая точка вызова LLM для новых фич (LLM1–LLM3):
  complete(feature, payload, ...)          — прямой вызов через фолбэк-цепочку провайдеров;
  complete_cached(feature, cache_key, ...) — Redis-кэш; hit = 0 токенов (cached=true).
    Ключ v2: pm:cache:llm:{feature}:v2:{org_id}:pv{prompt_version}:{ov}:{digest}
    (org-scope + prompt-version-scope; v1 вымирает по TTL). Порядок: гейт фичи
    (enabled + лимит) ДО cache-lookup — disabled-фича из кэша не обслуживается.

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

import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import requests

from ..redis_cache import cache_get_json, cache_set_json
from . import llm_store
from .deepseek_questions import _deepseek_chat_request
from .error_sanitize import sanitize_llm_error

logger = logging.getLogger(__name__)

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


def _feature_gate_violation(feature: str, org_id: str) -> Optional[Dict[str, Any]]:
    """Гейт фичи: enabled + суточный лимит токенов. None = гейт пройден.

    Единая реализация для complete() и complete_cached() (kill-switch должен
    работать и на cache-hit, поэтому complete_cached проверяет гейт ДО lookup).
    """
    flag = llm_store.get_feature_flag(feature)
    if flag is None:
        return None
    if not flag.get("enabled"):
        return {"status": "disabled", "error": f"feature '{feature}' is disabled"}
    limit = int(flag.get("daily_token_limit") or 0)
    if limit > 0:
        used = llm_store.usage_daily_tokens(feature, org_id, int(time.time()) - 24 * 3600)
        if used >= limit:
            return {
                "status": "rate_limited",
                "error": f"daily token limit reached ({used}/{limit})",
                "used_tokens_24h": used,
                "daily_token_limit": limit,
            }
    return None


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

    # 1–2. feature flag (enabled + суточный лимит)
    violation = _feature_gate_violation(feature, org_id)
    if violation is not None:
        status = violation.pop("status")
        return _finish(status, **violation)

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
        # Резолв модели: реестр (override фичи → default) → provider.model (старое
        # поведение при пустом реестре, env-фолбэк несёт свой хардкод).
        resolved_model = llm_store.resolve_model(feature, org_id) or str(provider.get("model") or "")
        # json_mode передаётся в HTTP payload только если провайдер его поддерживает.
        # Провайдеры без поддержки должны вернуть валидный JSON по инструкции промпта;
        # caller (например, product_actions_ai) может добавить repair-retry.
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
                # Таймаут/обрыв соединения — сразу failover на следующего провайдера,
                # не тратим время на retry одного и того же медленного/недоступного upstream.
                continue
            # Для retryable HTTP-ошибок (5xx, 429) retry уже отработал внутри _deepseek_chat_request;
            # если и он не помог — переходим к следующему провайдеру.
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


    # R3: сырой last_error — в логи (диагностика), пользователю — generic (S1).
    logger.warning(
        "llm gateway chain failed: feature=%s org=%s providers=%s last_error=%s",
        feature, org_id, len(chain), last_error,
    )
    return _finish(
        "error",
        error=sanitize_llm_error("error", last_error or "all providers failed"),
        provider_id=str((chain[-1] if chain else {}).get("id") or ""),
        model=str((chain[-1] if chain else {}).get("model") or ""),
    )


def _prompt_override_marker(prompt_override: Optional[Dict[str, Any]]) -> str:
    """Детерминированный маркер prompt_override: разные override-варианты не делят кэш."""
    if not prompt_override:
        return "ov0"
    canonical = json.dumps(prompt_override, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return f"ov{hashlib.md5(canonical.encode('utf-8')).hexdigest()[:12]}"


def llm_cache_key(
    feature: str,
    digest: str,
    *,
    org_id: str,
    prompt_version: int = 0,
    prompt_override: Optional[Dict[str, Any]] = None,
) -> str:
    """Ключ кэша v2: org-scoped + prompt-version-scoped.

    M1: digest projection намеренно без org/session → org_id обязан быть в ключе,
    иначе две org с одинаковой схемой делят cache-hit. L1: версия активного промпта
    в ключе → активация новой версии инвалидирует кэш мгновенно, не через TTL.
    v1-ключи вымирают по TTL (7 дней), массовый flush не нужен.
    """
    return (
        f"pm:cache:llm:{feature}:v2:{org_id}"
        f":pv{int(prompt_version or 0)}:{_prompt_override_marker(prompt_override)}:{digest}"
    )


def complete_cached(
    feature: str,
    cache_digest: str,
    payload: Any = None,
    *,
    prompt_override: Optional[Dict[str, Any]] = None,
    cache_client: Any = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Кэшированный вызов: hit → 0 токенов (llm_usage cached=true), miss → complete().

    Порядок проверок: гейт фичи (enabled + лимит) ДО cache-lookup — выключенная
    фича не обслуживается из кэша (kill-switch реален на hit'ах).
    """
    org_id = kwargs.get("org_id", "org_default")
    violation = _feature_gate_violation(feature, org_id)
    if violation is not None:
        latency_start = time.monotonic()
        llm_store.record_usage(
            org_id=org_id, feature=feature, model="", provider_id="",
            cached=False, user_id=kwargs.get("user_id", ""),
            project_id=kwargs.get("project_id", ""), session_id=kwargs.get("session_id", ""),
            latency_ms=int((time.monotonic() - latency_start) * 1000),
            status=violation["status"],
        )
        return _result(violation.pop("status"), **violation)

    prompt = _resolve_prompt(feature, prompt_override)
    key = llm_cache_key(
        feature, cache_digest, org_id=org_id,
        prompt_version=int((prompt or {}).get("version") or 0),
        prompt_override=prompt_override,
    )
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
                "json_mode_used": bool(result.get("json_mode_used")),
            },
            ttl_sec=CACHE_TTL_SEC,
            client=cache_client,
        )
    return result
