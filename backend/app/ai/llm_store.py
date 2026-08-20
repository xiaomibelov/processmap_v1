"""LLM0 — слой хранения для таблиц llm_* (миграция 012).

Таблицы создаются alembic-миграцией 012 (prod/stage/dev PG). Этот модуль —
только CRUD/агрегации поверх storage._connect(); SQL диалект-нейтральный
(placeholders `?` — транслируются для postgres в storage).

Наружу api_key НЕ отдаётся: mask_provider() возвращает has_api_key + key_last4.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from ..storage import _connect


def _now() -> int:
    return int(time.time())


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _rows(cur: Any) -> List[Dict[str, Any]]:
    return [dict(r) for r in cur.fetchall()]


def _row(cur: Any) -> Optional[Dict[str, Any]]:
    r = cur.fetchone()
    return dict(r) if r is not None else None


# ---------------------------------------------------------------- providers

def mask_provider(p: Dict[str, Any]) -> Dict[str, Any]:
    """Публичная форма провайдера: БЕЗ api_key, только has_api_key + key_last4."""
    key = str(p.get("api_key") or "")
    return {
        "id": p["id"],
        "org_id": p.get("org_id") or "org_default",
        "name": p.get("name") or "",
        "base_url": p.get("base_url") or "",
        "model": p.get("model") or "",
        "priority": int(p.get("priority") or 0),
        "enabled": bool(p.get("enabled")),
        "has_api_key": bool(key),
        "key_last4": key[-4:] if key else "",
        "created_by": p.get("created_by") or "",
        "created_at": int(p.get("created_at") or 0),
        "updated_by": p.get("updated_by") or "",
        "updated_at": int(p.get("updated_at") or 0),
    }


def list_providers(org_id: str = "org_default") -> List[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute(
            "SELECT * FROM llm_providers WHERE org_id = ? ORDER BY priority ASC, name ASC",
            (org_id,),
        )
        return _rows(cur)


def list_providers_by_orgs(org_ids: List[str]) -> List[Dict[str, Any]]:
    if not org_ids:
        return []
    placeholders = ", ".join("?" * len(org_ids))
    with _connect() as con:
        cur = con.execute(
            f"SELECT * FROM llm_providers WHERE org_id IN ({placeholders}) ORDER BY priority ASC, name ASC",
            tuple(org_ids),
        )
        return _rows(cur)


def get_provider(provider_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute("SELECT * FROM llm_providers WHERE id = ?", (provider_id,))
        return _row(cur)


def create_provider(
    *,
    org_id: str,
    name: str,
    base_url: str,
    model: str,
    api_key: str = "",
    priority: int = 100,
    enabled: bool = True,
    actor: str = "",
) -> Dict[str, Any]:
    pid = _new_id("llmprov")
    now = _now()
    with _connect() as con:
        con.execute(
            "INSERT INTO llm_providers"
            " (id, org_id, name, base_url, api_key, model, priority, enabled,"
            "  created_by, created_at, updated_by, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (pid, org_id, name, base_url, api_key, model, int(priority),
             bool(enabled), actor, now, actor, now),
        )
    return get_provider(pid) or {}


def update_provider(provider_id: str, fields: Dict[str, Any], *, actor: str = "") -> Optional[Dict[str, Any]]:
    allowed = {"name", "base_url", "model", "priority", "enabled", "api_key", "org_id"}
    sets: List[str] = []
    params: List[Any] = []
    for key in sorted(fields):
        if key not in allowed or fields[key] is None:
            continue
        sets.append(f"{key} = ?")
        params.append(fields[key])
    if sets:
        sets.append("updated_by = ?")
        params.append(actor)
        sets.append("updated_at = ?")
        params.append(_now())
        params.append(provider_id)
        with _connect() as con:
            con.execute(f"UPDATE llm_providers SET {', '.join(sets)} WHERE id = ?", tuple(params))
    return get_provider(provider_id)


def delete_provider(provider_id: str) -> bool:
    with _connect() as con:
        cur = con.execute("DELETE FROM llm_providers WHERE id = ?", (provider_id,))
    return bool(getattr(cur, "rowcount", 0))


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
# Реестр моделей (миграция 016): резолв «какая модель работает» =
# per-feature override → default модели → None (фолбэк на provider.model/env).
# In-memory кэш с TTL (0 запросов к БД на LLM-вызов), инвалидация при write.

_MODEL_CACHE_TTL_SEC = 60
_model_cache_lock = threading.Lock()
_model_cache: Dict[str, Any] = {"ts": 0.0, "defaults": {}, "overrides": {}}


def invalidate_model_cache() -> None:
    """Сброс кэша резолва моделей (вызывается из всех write-операций реестра)."""
    with _model_cache_lock:
        _model_cache["ts"] = 0.0
        _model_cache["defaults"] = {}
        _model_cache["overrides"] = {}


def list_models(org_id: str = "org_default") -> List[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute(
            "SELECT * FROM llm_models WHERE org_id = ? ORDER BY is_default DESC, model_name ASC",
            (org_id,),
        )
        return _rows(cur)


def get_model(model_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute("SELECT * FROM llm_models WHERE id = ?", (model_id,))
        return _row(cur)


def _parse_model_params(row: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return dict(json.loads(str(row.get("params") or "{}")))
    except Exception:
        return {}


def public_model(row: Dict[str, Any]) -> Dict[str, Any]:
    """Публичная форма модели (params отдаётся распарсенным объектом)."""
    return {
        "id": row["id"],
        "org_id": row.get("org_id") or "org_default",
        "provider": row.get("provider") or "",
        "model_name": row.get("model_name") or "",
        "display_name": row.get("display_name") or "",
        "enabled": bool(row.get("enabled")),
        "is_default": bool(row.get("is_default")),
        "params": _parse_model_params(row),
        "created_by": row.get("created_by") or "",
        "created_at": int(row.get("created_at") or 0),
        "updated_by": row.get("updated_by") or "",
        "updated_at": int(row.get("updated_at") or 0),
    }


def create_model(
    *,
    org_id: str,
    model_name: str,
    provider: str = "",
    display_name: str = "",
    enabled: bool = True,
    is_default: bool = False,
    params: Optional[Dict[str, Any]] = None,
    actor: str = "",
) -> Dict[str, Any]:
    mid = _new_id("llmmodel")
    now = _now()
    with _connect() as con:
        if is_default:
            con.execute(
                "UPDATE llm_models SET is_default = false, updated_by = ?, updated_at = ?"
                " WHERE org_id = ? AND is_default = true",
                (actor, now, org_id),
            )
        con.execute(
            "INSERT INTO llm_models"
            " (id, org_id, provider, model_name, display_name, enabled, is_default,"
            "  params, created_by, created_at, updated_by, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (mid, org_id, provider, model_name, display_name, bool(enabled),
             bool(is_default), json.dumps(params or {}, ensure_ascii=False),
             actor, now, actor, now),
        )
    invalidate_model_cache()
    return get_model(mid) or {}


def update_model(model_id: str, fields: Dict[str, Any], *, actor: str = "") -> Optional[Dict[str, Any]]:
    allowed = {"provider", "model_name", "display_name", "enabled", "is_default"}
    sets: List[str] = []
    params: List[Any] = []
    for key in sorted(fields):
        if key == "params":
            if fields[key] is not None:
                sets.append("params = ?")
                params.append(json.dumps(dict(fields[key] or {}), ensure_ascii=False))
            continue
        if key not in allowed or fields[key] is None:
            continue
        sets.append(f"{key} = ?")
        params.append(fields[key])
    row = get_model(model_id)
    if row is None:
        return None
    now = _now()
    with _connect() as con:
        if fields.get("is_default"):
            con.execute(
                "UPDATE llm_models SET is_default = false, updated_by = ?, updated_at = ?"
                " WHERE org_id = ? AND is_default = true AND id != ?",
                (actor, now, row.get("org_id") or "org_default", model_id),
            )
        if sets:
            sets.append("updated_by = ?")
            params.append(actor)
            sets.append("updated_at = ?")
            params.append(now)
            params.append(model_id)
            con.execute(f"UPDATE llm_models SET {', '.join(sets)} WHERE id = ?", tuple(params))
    invalidate_model_cache()
    return get_model(model_id)


def delete_model(model_id: str) -> bool:
    with _connect() as con:
        cur = con.execute("DELETE FROM llm_models WHERE id = ?", (model_id,))
        con.execute("DELETE FROM llm_feature_models WHERE model_id = ?", (model_id,))
    invalidate_model_cache()
    return bool(getattr(cur, "rowcount", 0))


def set_default_model(model_id: str, *, actor: str = "") -> Optional[Dict[str, Any]]:
    row = get_model(model_id)
    if row is None:
        return None
    now = _now()
    with _connect() as con:
        con.execute(
            "UPDATE llm_models SET is_default = false, updated_by = ?, updated_at = ?"
            " WHERE org_id = ? AND is_default = true AND id != ?",
            (actor, now, row.get("org_id") or "org_default", model_id),
        )
        con.execute(
            "UPDATE llm_models SET is_default = true, updated_by = ?, updated_at = ? WHERE id = ?",
            (actor, now, model_id),
        )
    invalidate_model_cache()
    return get_model(model_id)


def list_feature_model_overrides(org_id: str = "org_default") -> List[Dict[str, Any]]:
    """Overrides с присоединённым именем модели (модель может быть удалена → '')."""
    with _connect() as con:
        cur = con.execute(
            "SELECT fm.feature, fm.model_id, fm.updated_by, fm.updated_at,"
            "       COALESCE(m.model_name, '') AS model_name,"
            "       COALESCE(m.enabled, false) AS model_enabled"
            " FROM llm_feature_models fm"
            " LEFT JOIN llm_models m ON m.id = fm.model_id"
            " WHERE fm.org_id = ? ORDER BY fm.feature ASC",
            (org_id,),
        )
        return _rows(cur)


def set_feature_model_override(
    feature: str,
    model_id: Optional[str],
    *,
    org_id: str = "org_default",
    actor: str = "",
) -> None:
    """model_id=None/'' → снять override (фича снова на default-модели)."""
    now = _now()
    with _connect() as con:
        con.execute(
            "DELETE FROM llm_feature_models WHERE org_id = ? AND feature = ?",
            (org_id, feature),
        )
        if model_id:
            con.execute(
                "INSERT INTO llm_feature_models (feature, org_id, model_id, updated_by, updated_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (feature, org_id, model_id, actor, now),
            )
    invalidate_model_cache()


def _load_model_resolve_state() -> None:
    """Перечитать default-модели и overrides всех организаций в кэш."""
    defaults: Dict[str, str] = {}
    overrides: Dict[str, Dict[str, str]] = {}
    with _connect() as con:
        cur = con.execute(
            "SELECT org_id, model_name FROM llm_models WHERE is_default = true AND enabled = true"
        )
        for row in cur.fetchall():
            defaults[str(row["org_id"])] = str(row["model_name"])
        cur = con.execute(
            "SELECT fm.org_id, fm.feature, m.model_name"
            " FROM llm_feature_models fm"
            " JOIN llm_models m ON m.id = fm.model_id AND m.enabled = true"
        )
        for row in cur.fetchall():
            overrides.setdefault(str(row["org_id"]), {})[str(row["feature"])] = str(row["model_name"])
    _model_cache["defaults"] = defaults
    _model_cache["overrides"] = overrides
    _model_cache["ts"] = time.monotonic()


def resolve_model(feature: str = "", org_id: str = "org_default") -> Optional[str]:
    """model_name для вызова: override фичи → default → None (пустой реестр).

    None означает «реестр не настроен» — вызывающий код обязан откатиться на
    provider.model / env-хардкод (обратная совместимость до миграции 016).
    """
    with _model_cache_lock:
        stale = (time.monotonic() - float(_model_cache["ts"])) > _MODEL_CACHE_TTL_SEC
        if stale:
            try:
                _load_model_resolve_state()
            except Exception:
                # Таблицы ещё нет (миграция не применена) — считаем реестр пустым.
                _model_cache["defaults"] = {}
                _model_cache["overrides"] = {}
                _model_cache["ts"] = time.monotonic()
        org_overrides = _model_cache["overrides"].get(org_id) or {}
        if feature and feature in org_overrides:
            return org_overrides[feature]
        return _model_cache["defaults"].get(org_id)


# ------------------------------------------------------------------ prompts

def list_prompts(
    *,
    feature: str = "",
    status: str = "",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    where: List[str] = []
    params: List[Any] = []
    if feature:
        where.append("feature = ?")
        params.append(feature)
    if status:
        where.append("status = ?")
        params.append(status)
    cond = ("WHERE " + " AND ".join(where)) if where else ""
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))
    with _connect() as con:
        total = con.execute(f"SELECT COUNT(*) AS c FROM llm_prompts {cond}", tuple(params)).fetchone()
        total_n = int(dict(total)["c"] if total is not None else 0)
        cur = con.execute(
            f"SELECT * FROM llm_prompts {cond} ORDER BY feature ASC, version DESC LIMIT ? OFFSET ?",
            tuple(params + [limit, offset]),
        )
        items = _rows(cur)
    return {
        "items": items,
        "count": len(items),
        "page": {"limit": limit, "offset": offset, "total": total_n, "has_more": offset + len(items) < total_n},
    }


def get_prompt(prompt_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute("SELECT * FROM llm_prompts WHERE id = ?", (prompt_id,))
        return _row(cur)


def get_active_prompt(feature: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute(
            "SELECT * FROM llm_prompts WHERE feature = ? AND status = 'active'"
            " ORDER BY version DESC LIMIT 1",
            (feature,),
        )
        return _row(cur)


def create_prompt_draft(
    *,
    feature: str,
    system: str = "",
    template: str = "",
    max_tokens: int = 2000,
    model_class: str = "primary",
    actor: str = "",
) -> Dict[str, Any]:
    pid = _new_id("llmprompt")
    now = _now()
    with _connect() as con:
        row = con.execute(
            "SELECT COALESCE(MAX(version), 0) AS v FROM llm_prompts WHERE feature = ?",
            (feature,),
        ).fetchone()
        version = int(dict(row)["v"] if row is not None else 0) + 1
        con.execute(
            "INSERT INTO llm_prompts"
            " (id, feature, version, system, template, status, max_tokens, model_class, updated_by, updated_at)"
            " VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)",
            (pid, feature, version, system, template, int(max_tokens), model_class, actor, now),
        )
    return get_prompt(pid) or {}


def activate_prompt(prompt_id: str, *, actor: str = "") -> Optional[Dict[str, Any]]:
    """Атомарно: текущий active фичи → archive, указанный → active."""
    target = get_prompt(prompt_id)
    if not target:
        return None
    now = _now()
    with _connect() as con:
        con.execute(
            "UPDATE llm_prompts SET status = 'archive', updated_by = ?, updated_at = ?"
            " WHERE feature = ? AND status = 'active' AND id != ?",
            (actor, now, target["feature"], prompt_id),
        )
        con.execute(
            "UPDATE llm_prompts SET status = 'active', updated_by = ?, updated_at = ? WHERE id = ?",
            (actor, now, prompt_id),
        )
    return get_prompt(prompt_id)


def rollback_target(feature: str) -> Optional[Dict[str, Any]]:
    """Цель отката: последняя archived-версия фичи (ниже текущего active)."""
    active = get_active_prompt(feature)
    with _connect() as con:
        if active:
            cur = con.execute(
                "SELECT * FROM llm_prompts WHERE feature = ? AND status = 'archive' AND version < ?"
                " ORDER BY version DESC LIMIT 1",
                (feature, int(active["version"])),
            )
        else:
            cur = con.execute(
                "SELECT * FROM llm_prompts WHERE feature = ? AND status = 'archive'"
                " ORDER BY version DESC LIMIT 1",
                (feature,),
            )
        return _row(cur)


# ------------------------------------------------------------------ flags

def list_feature_flags() -> List[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute("SELECT * FROM llm_feature_flags ORDER BY feature ASC")
        return _rows(cur)


def get_feature_flag(feature: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        cur = con.execute("SELECT * FROM llm_feature_flags WHERE feature = ?", (feature,))
        return _row(cur)


def patch_feature_flag(
    feature: str,
    *,
    enabled: Optional[bool] = None,
    daily_token_limit: Optional[int] = None,
    actor: str = "",
) -> Optional[Dict[str, Any]]:
    now = _now()
    with _connect() as con:
        existing = con.execute("SELECT feature FROM llm_feature_flags WHERE feature = ?", (feature,)).fetchone()
        if existing is None:
            con.execute(
                "INSERT INTO llm_feature_flags (feature, enabled, daily_token_limit, updated_by, updated_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (feature, True if enabled is None else bool(enabled),
                 200000 if daily_token_limit is None else int(daily_token_limit), actor, now),
            )
        else:
            sets: List[str] = []
            params: List[Any] = []
            if enabled is not None:
                sets.append("enabled = ?")
                params.append(bool(enabled))
            if daily_token_limit is not None:
                sets.append("daily_token_limit = ?")
                params.append(int(daily_token_limit))
            if sets:
                sets.append("updated_by = ?")
                params.append(actor)
                sets.append("updated_at = ?")
                params.append(now)
                params.append(feature)
                con.execute(f"UPDATE llm_feature_flags SET {', '.join(sets)} WHERE feature = ?", tuple(params))
    return get_feature_flag(feature)


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
    user_id: str = "",
    project_id: str = "",
    session_id: str = "",
    latency_ms: int = 0,
    status: str = "ok",
    ts: Optional[int] = None,
) -> None:
    with _connect() as con:
        con.execute(
            "INSERT INTO llm_usage"
            " (org_id, feature, model, provider_id, prompt_tokens, completion_tokens,"
            "  cached, user_id, project_id, session_id, latency_ms, status, ts)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (org_id, feature, model, provider_id, int(prompt_tokens), int(completion_tokens),
             bool(cached), user_id, project_id, session_id, int(latency_ms), status,
             int(ts if ts is not None else _now())),
        )


def usage_daily_tokens(feature: str, org_id: str, since_ts: int) -> int:
    """Сумма токенов за окно (cached=true строки — 0 токенов по контракту)."""
    with _connect() as con:
        row = con.execute(
            "SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS t FROM llm_usage"
            " WHERE feature = ? AND org_id = ? AND ts >= ?",
            (feature, org_id, int(since_ts)),
        ).fetchone()
    return int(dict(row)["t"] if row is not None else 0)


def usage_daily_tokens_by_feature(org_id: str, since_ts: int) -> Dict[str, int]:
    with _connect() as con:
        cur = con.execute(
            "SELECT feature, COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS t FROM llm_usage"
            " WHERE org_id = ? AND ts >= ? GROUP BY feature",
            (org_id, int(since_ts)),
        )
        return {str(r["feature"]): int(r["t"]) for r in cur.fetchall()}


def usage_aggregate(
    *,
    from_ts: int = 0,
    to_ts: int = 0,
    feature: str = "",
    model: str = "",
    org_id: str = "org_default",
) -> Dict[str, Any]:
    """Агрегация по дням/фичам/моделям для экрана расхода."""
    where = ["org_id = ?"]
    params: List[Any] = [org_id]
    if from_ts:
        where.append("ts >= ?")
        params.append(int(from_ts))
    if to_ts:
        where.append("ts <= ?")
        params.append(int(to_ts))
    if feature:
        where.append("feature = ?")
        params.append(feature)
    if model:
        where.append("model = ?")
        params.append(model)
    cond = " AND ".join(where)
    day_expr = "to_char(to_timestamp(ts), 'YYYY-MM-DD')"
    with _connect() as con:
        try:
            cur = con.execute(
                f"SELECT {day_expr} AS day, feature, model,"
                " COUNT(*) AS calls,"
                " COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,"
                " COALESCE(SUM(completion_tokens), 0) AS completion_tokens,"
                " COALESCE(SUM(CASE WHEN cached THEN 1 ELSE 0 END), 0) AS cached_hits,"
                " COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS errors"
                f" FROM llm_usage WHERE {cond}"
                " GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2 ASC, 3 ASC",
                tuple(params),
            )
            items = _rows(cur)
        except Exception:
            # sqlite-фолбэк (тесты без PG): дата через strftime
            cur = con.execute(
                "SELECT strftime('%Y-%m-%d', ts, 'unixepoch') AS day, feature, model,"
                " COUNT(*) AS calls,"
                " COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,"
                " COALESCE(SUM(completion_tokens), 0) AS completion_tokens,"
                " COALESCE(SUM(CASE WHEN cached THEN 1 ELSE 0 END), 0) AS cached_hits,"
                " COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS errors"
                f" FROM llm_usage WHERE {cond}"
                " GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2 ASC, 3 ASC",
                tuple(params),
            )
            items = _rows(cur)
    for item in items:
        for key in ("calls", "prompt_tokens", "completion_tokens", "cached_hits", "errors"):
            item[key] = int(item.get(key) or 0)
        item["model"] = item.get("model") or ""
    totals = {
        "calls": sum(i["calls"] for i in items),
        "prompt_tokens": sum(i["prompt_tokens"] for i in items),
        "completion_tokens": sum(i["completion_tokens"] for i in items),
        "cached_hits": sum(i["cached_hits"] for i in items),
        "errors": sum(i["errors"] for i in items),
    }
    return {"items": items, "totals": totals}
