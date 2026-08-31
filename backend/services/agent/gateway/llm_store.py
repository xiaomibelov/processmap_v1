"""llm_store — read+usage подмножество монолитного backend/app/ai/llm_store.py.

КОПИЯ (сервис не импортирует backend.app.*): только функции, нужные gateway:
enabled_providers_with_key, any_enabled_provider, get_feature_flag,
usage_daily_tokens, get_active_prompt, record_usage, resolve_model.
CRUD остаётся только в монолите; схему накатывает монолит (миграции 012/016).

⚠️ «Два писателя» (решение владельца 2026-08-16): llm_usage пишут ОБА процесса —
сервис (completions через record_usage) и монолит (legacy-контур + feedback).
Конфликтов схемы нет: record_usage — append-only, миграции только монолитные.

resolve_model: TTL-кэш 60 секунд in-process (решение владельца): правка
модели/ключа в админке вступает в силу в сервисе ≤60 с после сохранения.
Монолитный invalidate_model_cache НЕ копируется (write-операций в сервисе нет,
кросс-процессной инвалидации нет — только TTL).
"""
from __future__ import annotations

import json
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from db import adapt_sql, get_conn


def _now() -> int:
    return int(time.time())


def _rows(cur: Any) -> List[Dict[str, Any]]:
    return [dict(r) for r in cur.fetchall()]


def _row(cur: Any) -> Optional[Dict[str, Any]]:
    r = cur.fetchone()
    return dict(r) if r is not None else None


# ---------------------------------------------------------------- providers

_CAPABILITIES_DEFAULT = {"supports_json_mode": True}


def _parse_capabilities(raw: Any) -> Dict[str, Any]:
    """Parse provider capabilities JSON; default enables json_mode for backward compat."""
    if isinstance(raw, dict):
        return dict(_CAPABILITIES_DEFAULT, **raw)
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return dict(_CAPABILITIES_DEFAULT, **parsed)
        except Exception:
            pass
    return dict(_CAPABILITIES_DEFAULT)


def provider_capabilities(provider: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Return parsed capabilities dict for a provider row (defaults to json_mode=True)."""
    return _parse_capabilities(provider.get("capabilities") if provider else None)


def provider_supports_json_mode(provider: Optional[Dict[str, Any]]) -> bool:
    """Check whether provider supports OpenAI-style response_format=json_object."""
    return bool(provider_capabilities(provider).get("supports_json_mode"))


def list_providers(org_id: str = "org_default") -> List[Dict[str, Any]]:
    with get_conn() as con:
        cur = con.execute(
            adapt_sql("SELECT * FROM llm_providers WHERE org_id = ? ORDER BY priority ASC, name ASC"),
            (org_id,),
        )
        return _rows(cur)


def enabled_providers_with_key(org_id: str = "org_default") -> List[Dict[str, Any]]:
    """Провайдеры для фолбэк-цепочки: enabled, с непустым ключом, по priority."""
    return [p for p in list_providers(org_id) if p.get("enabled") and str(p.get("api_key") or "").strip()]


def effective_providers_with_key(org_id: str = "org_default") -> List[Dict[str, Any]]:
    """Цепочка провайдеров для org: сначала org, затем org_default fallback.

    Возвращает список enabled-провайдеров с непустым ключом. Если у org нет
    своих провайдеров, но в org_default есть — используем org_default.
    Это позволяет держать один ключ для дефолтной организации и автоматически
    раздавать его всем остальным org без дублирования.
    """
    own = enabled_providers_with_key(org_id)
    if own:
        return own
    if org_id != "org_default":
        return enabled_providers_with_key("org_default")
    return []


def any_enabled_provider(org_id: str = "org_default") -> bool:
    return any(p.get("enabled") for p in list_providers(org_id))


# ------------------------------------------------------------------ models
# Резолв «какая модель работает»: per-feature override per model_class →
# default per model_class → None.
# In-process TTL-кэш 60с (0 запросов к БД на LLM-вызов), БЕЗ инвалидации при
# write (писателей в сервисе нет) — свежесть гарантируется только TTL.

_MODEL_CACHE_TTL_SEC = 60
_model_cache_lock = threading.Lock()
_model_cache: Dict[str, Any] = {
    "ts": 0.0,
    "defaults": {},      # org_id -> model_class -> model_name
    "overrides": {},     # org_id -> feature -> model_class -> model_name
    "costs": {},         # model_name -> (prompt_1k, completion_1k)
}


def _load_model_resolve_state() -> None:
    """Перечитать default-модели, overrides и цены всех организаций в кэш."""
    defaults: Dict[str, Dict[str, str]] = {}
    overrides: Dict[str, Dict[str, Dict[str, str]]] = {}
    costs: Dict[str, Tuple[float, float]] = {}
    with get_conn() as con:
        cur = con.execute(
            adapt_sql(
                "SELECT org_id, model_name, model_class FROM llm_models"
                " WHERE is_default = true AND enabled = true"
            )
        )
        for row in cur.fetchall():
            row_d = dict(row)
            defaults.setdefault(str(row_d["org_id"]), {})[
                str(row_d["model_class"] or "primary")
            ] = str(row_d["model_name"])
        cur = con.execute(
            adapt_sql(
                "SELECT fm.org_id, fm.feature, fm.model_class, m.model_name"
                " FROM llm_feature_models fm"
                " JOIN llm_models m ON m.id = fm.model_id AND m.enabled = true"
            )
        )
        for row in cur.fetchall():
            row_d = dict(row)
            org_overrides = overrides.setdefault(str(row_d["org_id"]), {})
            feature_overrides = org_overrides.setdefault(str(row_d["feature"]), {})
            feature_overrides[str(row_d["model_class"] or "primary")] = str(row_d["model_name"])
        cur = con.execute(
            adapt_sql(
                "SELECT model_name, cost_prompt_1k_usd, cost_completion_1k_usd"
                " FROM llm_models WHERE enabled = true"
            )
        )
        for row in cur.fetchall():
            row_d = dict(row)
            costs[str(row_d["model_name"])] = (
                float(row_d.get("cost_prompt_1k_usd") or 0),
                float(row_d.get("cost_completion_1k_usd") or 0),
            )
    _model_cache["defaults"] = defaults
    _model_cache["overrides"] = overrides
    _model_cache["costs"] = costs
    _model_cache["ts"] = time.monotonic()


def resolve_model(
    feature: str = "",
    org_id: str = "org_default",
    model_class: str = "primary",
) -> Optional[str]:
    """model_name для вызова: override (feature, model_class) → default (model_class) → None.

    None означает «реестр не настроен для данного класса» — вызывающий код
    откатывается на provider.model (обратная совместимость).
    """
    mc = str(model_class or "primary").strip() or "primary"
    with _model_cache_lock:
        stale = (time.monotonic() - float(_model_cache["ts"])) > _MODEL_CACHE_TTL_SEC
        if stale:
            try:
                _load_model_resolve_state()
            except Exception:
                # Таблицы ещё нет (миграция не применена) — считаем реестр пустым.
                _model_cache["defaults"] = {}
                _model_cache["overrides"] = {}
                _model_cache["costs"] = {}
                _model_cache["ts"] = time.monotonic()
        org_overrides = _model_cache["overrides"].get(org_id) or {}
        feature_overrides = org_overrides.get(feature) or {}
        if feature and mc in feature_overrides:
            return feature_overrides[mc]
        return (_model_cache["defaults"].get(org_id) or {}).get(mc)


def resolve_model_for_feature(feature: str, org_id: str = "org_default") -> Optional[str]:
    """Resolve model for a feature using model_class from its active prompt.

    Conservative fallback: if prompt is missing or has no model_class → 'primary'.
    """
    prompt = get_active_prompt(feature)
    model_class = str((prompt or {}).get("model_class") or "primary").strip() or "primary"
    return resolve_model(feature, org_id, model_class)


def get_model_cost(model_name: str) -> Tuple[float, float]:
    """Return (cost_prompt_1k_usd, cost_completion_1k_usd) for a model name."""
    with _model_cache_lock:
        stale = (time.monotonic() - float(_model_cache["ts"])) > _MODEL_CACHE_TTL_SEC
        if stale:
            try:
                _load_model_resolve_state()
            except Exception:
                _model_cache["defaults"] = {}
                _model_cache["overrides"] = {}
                _model_cache["costs"] = {}
                _model_cache["ts"] = time.monotonic()
        return _model_cache["costs"].get(model_name, (0.0, 0.0))


def estimate_cost(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost from cached model prices."""
    prompt_price, completion_price = get_model_cost(model_name)
    return (prompt_tokens * prompt_price + completion_tokens * completion_price) / 1000.0


# ------------------------------------------------------------------ prompts

def get_active_prompt(feature: str) -> Optional[Dict[str, Any]]:
    with get_conn() as con:
        cur = con.execute(
            adapt_sql(
                "SELECT * FROM llm_prompts WHERE feature = ? AND status = 'active'"
                " ORDER BY version DESC LIMIT 1"
            ),
            (feature,),
        )
        return _row(cur)


# ------------------------------------------------------------------ flags

def get_feature_flag(feature: str) -> Optional[Dict[str, Any]]:
    with get_conn() as con:
        cur = con.execute(adapt_sql("SELECT * FROM llm_feature_flags WHERE feature = ?"), (feature,))
        return _row(cur)


# ------------------------------------------------------------------ usage

def record_usage(
    *,
    org_id: str = "org_default",
    feature: str,
    model: str = "",
    provider_id: str = "",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cached: bool = False,
    cost_usd: float = 0.0,
    user_id: str = "",
    project_id: str = "",
    session_id: str = "",
    latency_ms: int = 0,
    status: str = "ok",
    ts: Optional[int] = None,
) -> None:
    # ⚠️ llm_usage — общая таблица: пишут сервис (здесь) и монолит (feedback).
    # Append-only; схема меняется только монолитными миграциями.
    with get_conn() as con:
        con.execute(
            adapt_sql(
                "INSERT INTO llm_usage"
                " (org_id, feature, model, provider_id, prompt_tokens, completion_tokens,"
                "  cached, cost_usd, user_id, project_id, session_id, latency_ms, status, ts)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ),
            (org_id, feature, model, provider_id, int(prompt_tokens), int(completion_tokens),
             bool(cached), float(cost_usd), user_id, project_id, session_id, int(latency_ms), status,
             int(ts if ts is not None else _now())),
        )


def usage_daily_tokens(feature: str, org_id: str, since_ts: int) -> int:
    """Сумма токенов за окно (cached=true строки — 0 токенов по контракту)."""
    with get_conn() as con:
        row = con.execute(
            adapt_sql(
                "SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS t FROM llm_usage"
                " WHERE feature = ? AND org_id = ? AND ts >= ?"
            ),
            (feature, org_id, int(since_ts)),
        ).fetchone()
    return int(dict(row)["t"] if row is not None else 0)


def ensure_edit_feature_flags() -> None:
    """Seed feature flags for AGENT-3 (idempotent INSERT OR IGNORE)."""
    defaults = [
        ("agent_edit", 1, 200000),
        ("agent_edit_propose", 1, 100000),
    ]
    with get_conn() as con:
        for feature, enabled, limit in defaults:
            con.execute(
                adapt_sql(
                    "INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit)"
                    " VALUES (?, ?, ?)"
                    " ON CONFLICT(feature) DO NOTHING"
                ),
                (feature, enabled, limit),
            )
