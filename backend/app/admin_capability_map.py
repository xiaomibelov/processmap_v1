"""Capability map + attention для GET /api/admin/dashboard.

Состав доменов/строк/href — строго по CAPABILITY_INVENTORY.md контура
audit/admin-dashboard-v2-verify. Статусы: ok | pilot | off | attention | no_data.
Правила: пустой источник → no_data (не «0%»); выключенный флаг/конфиг → off;
ошибки за 24ч → attention.
"""

import time
from typing import Any, Dict, List, Mapping, Optional

from .domains.storage import base
from .domains.storage.ai.repository import _ai_execution_log_where
from .redis_client import _read_redis_url, get_client
from .storage import _connect

LLM_ERROR_WINDOW_SEC = 24 * 3600

_CAPABILITY_DOMAINS: List[Dict[str, str]] = [
    {"domain": "canvas", "label": "Канвас / BPMN-редактор"},
    {"domain": "workspace", "label": "Workspace"},
    {"domain": "ai", "label": "AI / LLM"},
    {"domain": "rag", "label": "RAG"},
    {"domain": "analytics", "label": "Аналитика"},
    {"domain": "publish", "label": "Публикация / Git mirror"},
    {"domain": "admin", "label": "Администрирование"},
]

# (domain, id, label, href, kind, spec) — kind определяет источник статуса.
_CAPABILITIES = [
    ("canvas", "save_pipeline", "Save-пайплайн (CAS, avg latency)", "/admin/jobs", "kpi",
     {"path": "kpis.avg_save_latency_ms", "fact": "средняя latency сохранения {value} мс"}),
    ("canvas", "cross_tab_sync", "Cross-tab sync / multi-writer (LWW-409)", "/app", "kpi",
     {"path": "kpis.avg_save_latency_ms", "fact": "LWW/409-конфликты разрешаются версиями; avg latency {value} мс"}),
    ("canvas", "async_subprocess_sync", "Async subprocess-sync", "/admin/sessions", "env",
     {"flag": "FPC_ASYNC_SUBPROCESS_SYNC"}),
    ("canvas", "overlays_hybrid_v2", "Overlays Hybrid V2 (white cards, anchor lines)", "/app", "flag",
     {"flag": "useBpmnExtensionOverlays"}),
    ("canvas", "overlays_lightweight", "Overlays lightweight (JSON вместо XML)", "/app", "flag",
     {"flag": "lightweightOverlays"}),
    ("canvas", "bpmn_import", "BPMN-импорт", "/app", "static",
     {"fact": "endpoint POST import_bpmn"}),
    ("canvas", "bpmn_versions_compare", "Версии схем + визуальное сравнение (#985)", "/app", "static",
     {"fact": "bpmn_versions + side-by-side diff viewer"}),
    ("canvas", "incremental_save_ops", "Инкрементальное сохранение (ops/outbox)", "/app", "static",
     {"fact": "POST /sessions/{id}/operations + outbox IndexedDB (#982/#992)"}),
    ("workspace", "session_tree", "Дерево сессий (tree view, auto-expand)", "/app", "flag",
     {"flag": "workspace_session_tree_view"}),
    ("workspace", "tobe_overview", "AS IS / TO BE overview", "/app", "flag",
     {"flag": "workspace_tobe_overview", "pilot_when_on": True,
      "fact_on": "включено; пилот-гейт TOBE_OVERVIEW_PILOT_ORG_IDS (включено ≠ раскатано)"}),
    ("workspace", "projects_sessions", "Проекты / сессии", "/admin/projects", "projects", {}),
    ("ai", "agent_chat", "Agent chat", "/app", "static",
     {"fact": "гидрация истории + agent_analysis (#973/#974)"}),
    ("ai", "product_actions", "Действия с продуктом (suggest/batch, approval)", "/app", "static",
     {"fact": "product_actions_ai; suggest timeout 60с (#975)"}),
    ("ai", "llm_modules", "LLM-модули → провайдеры (capabilities, failover)", "/admin/llm", "static",
     {"fact": "gateway failover (ai/gateway.py) + capabilities"}),
    ("ai", "prompts_crud", "Промпты CRUD", "/admin/llm", "static",
     {"fact": "draft / activate / rollback"}),
    ("ai", "execution_log", "Execution log", "/admin/llm", "llm_errors", {}),
    ("ai", "llm_cache", "LLM-кэш org-scoped", "", "static",
     {"fact": "встроено (pm:cache:llm:*), не наблюдается"}),
    ("ai", "endpoint_check", "Проверка эндпоинтов (endpoint check)", "/admin/llm", "static",
     {"fact": "перенесён в /admin/llm (EndpointCheckPanel)"}),
    ("rag", "indexing", "Индексация bpmn_xml и product_action", "/admin/rag", "rag",
     {"mode": "indexing"}),
    ("rag", "rag_readiness_sessions", "RAG-readiness сессий", "/admin/rag", "rag",
     {"mode": "readiness"}),
    ("rag", "rag_settings", "Настройки org-уровня", "/admin/rag", "static",
     {"fact": "enabled / indexing_enabled / hybrid / top_k"}),
    ("rag", "process_layer", "process_layer в чанках + фильтр (#972)", "", "static",
     {"fact": "metadata чанков + backfill"}),
    ("rag", "nightly_indexer", "Ночной индексатор", "", "static",
     {"fact": "beat rag-index-nightly-refresh 04:30 Europe/Moscow"}),
    ("analytics", "overview_actions", "Обзор / действия / свойства", "/app", "static",
     {"fact": "/api/analytics/{scope}/{id}/dashboard|actions|properties"}),
    ("analytics", "nightly_snapshot", "Ночной snapshot 04:30 Europe/Moscow", "", "no_data",
     {"fact": "admin-endpoint freshness отсутствует (пробел H4)"}),
    ("analytics", "performance_abc", "Расчёт производительности A/B/C", "/app", "static",
     {"fact": "классификатор ingredient_value A/B/C"}),
    ("analytics", "excel_export", "Excel-выгрузка с пересчётом", "", "static",
     {"fact": "export-recalculated.xlsx / export-advanced-calculation.xlsx"}),
    ("analytics", "quality_score", "Качество (quality score)", "", "static",
     {"fact": "/api/analytics/quality"}),
    ("publish", "immutable_versions", "Immutable BPMN-версии при публикации", "/admin/sessions", "kpi",
     {"path": "kpis.published_bpmn_versions", "fact": "опубликовано версий: {value}"}),
    ("publish", "git_mirror", "Publish-only git mirror (org-конфиг)", "/admin/orgs?tab=gitMirror", "mirror", {}),
    ("admin", "orgs_users_groups", "Орги / пользователи / группы", "/admin/orgs", "static",
     {"fact": "orgs page: tabs users/groups/organizations"}),
    ("admin", "permissions_invites", "Permissions matrix + invites", "/admin/orgs?tab=permissions", "static",
     {"fact": "+ invites (?tab=invites)"}),
    ("admin", "audit_log", "Audit log", "/admin/audit", "audit", {}),
    ("admin", "telemetry", "Телеметрия и error events", "/admin/telemetry", "static",
     {"fact": "error events"}),
    ("admin", "agent_runs", "Agent-runs", "/admin/agent-runs", "static",
     {"fact": "GET /api/admin/agent-runs"}),
    ("admin", "graphs", "Graphs (graphify snapshot)", "/admin/graphs", "graph", {}),
]


def _to_bool_flags(flags: Mapping[str, Any]) -> Dict[str, bool]:
    return {k: str(v).lower() in {"1", "true", "yes", "on"} for k, v in flags.items()}


def count_llm_provider_errors_conn(con: Any, org_id: str, *, now_ts: Optional[int] = None) -> int:
    """Ошибки провайдера LLM за последние 24ч на переданном соединении —
    те же where-строители и таблица, что у
    GET /api/admin/ai/executions?status=error&created_from=&created_to=."""
    now = int(now_ts if now_ts is not None else time.time())
    try:
        where, params = _ai_execution_log_where(
            org_id=org_id or "",
            status="error",
            # Общий фильтр storage inclusive (>=); +1 даёт окно (now-24h, now]:
            # запись ровно 24ч назад не считается, 23:59 назад — считается.
            created_from=now - LLM_ERROR_WINDOW_SEC + 1,
            created_to=now,
        )
        return int(base.count(con, "ai_execution_log", where=where, params=params))
    except Exception:
        return 0


def count_llm_provider_errors(org_id: str, *, now_ts: Optional[int] = None) -> int:
    """Standalone-вариант (своё соединение) — для тестов и вне dashboard."""
    try:
        with _connect() as con:
            return count_llm_provider_errors_conn(con, org_id, now_ts=now_ts)
    except Exception:
        return 0


def resolve_runtime_flags(
    con: Any,
    defaults: Mapping[str, str],
    org_id: str = "",
) -> Dict[str, bool]:
    """Тот же резолв значений, что routers.feature_flags._get_flags
    (defaults → Postgres → Redis overlay), но Postgres читается на переданном
    соединении, а get_client вызывается только когда REDIS_URL задан
    (иначе overlay заведомо пуст — без error-лога деградированного клиента)."""
    flags: Dict[str, Any] = dict(defaults)
    try:
        rows = con.execute("SELECT key, value FROM feature_flags").fetchall()
        if rows:
            flags.update({str(r["key"]): str(r["value"]) for r in rows})
    except Exception:
        pass
    if _read_redis_url():
        from .routers.feature_flags import _redis_key

        client = get_client()
        if client is not None:
            try:
                stored = client.hgetall(_redis_key(org_id))
                if stored:
                    flags.update(
                        {
                            k.decode() if isinstance(k, bytes) else k: v.decode() if isinstance(v, bytes) else v
                            for k, v in stored.items()
                        }
                    )
            except Exception:
                pass
    return _to_bool_flags(flags)


def _dig(payload: Mapping[str, Any], dotted: str) -> Any:
    node: Any = payload
    for part in dotted.split("."):
        if not isinstance(node, Mapping):
            return None
        node = node.get(part)
    return node


def build_attention(payload: Mapping[str, Any], *, llm_provider_errors_24h: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []

    def add(kind: str, count: int, label: str, href: str) -> None:
        if int(count or 0) > 0:
            items.append({"kind": kind, "count": int(count), "label": label, "href": href})

    outcomes = _dig(payload, "charts.autopass_outcomes") or {}
    add("autopass_failed", outcomes.get("failed") or 0, "AutoPass: провалы", "/admin/jobs")
    add("sessions_warnings", len(payload.get("requires_attention") or []), "Сессии с предупреждениями", "/admin/sessions")
    redis_health = payload.get("redis_health") or {}
    if redis_health.get("degraded"):
        add("redis_degraded", 1, "Redis: деградация (fallback)", "/admin/jobs")
    if redis_health.get("incident"):
        add("redis_incident", 1, "Redis: инцидент", "/admin/jobs")
    publish_mirror = payload.get("publish_git_mirror") or {}
    if publish_mirror.get("org_mirror_enabled"):
        add("mirror_failed", publish_mirror.get("failed") or 0, "Git mirror: ошибки публикации", "/admin/orgs?tab=gitMirror")
    add("llm_provider_errors", llm_provider_errors_24h, "LLM: ошибки провайдера за 24ч", "/admin/llm")
    return items


def _resolve_capability(
    kind: str,
    spec: Mapping[str, Any],
    *,
    payload: Mapping[str, Any],
    flags: Mapping[str, bool],
    env_flags: Mapping[str, bool],
    llm_provider_errors_24h: int,
    rag_readiness: Optional[Mapping[str, int]],
    graph_freshness_iso: str,
) -> Dict[str, str]:
    if kind == "static":
        return {"status": "ok", "fact": str(spec.get("fact") or "")}
    if kind == "no_data":
        return {"status": "no_data", "fact": str(spec.get("fact") or "нет данных")}
    if kind == "kpi":
        value = _dig(payload, str(spec.get("path") or ""))
        if value in (None, ""):
            return {"status": "no_data", "fact": "нет данных"}
        try:
            if int(value) == 0:
                return {"status": "no_data", "fact": "нет данных"}
        except (TypeError, ValueError):
            pass
        fact_tpl = str(spec.get("fact") or "значение: {value}")
        return {"status": "ok", "fact": fact_tpl.format(value=value)}
    if kind == "flag":
        key = str(spec.get("flag") or "")
        if flags.get(key):
            if spec.get("pilot_when_on"):
                return {"status": "pilot", "fact": str(spec.get("fact_on") or "включено (пилот)")}
            return {"status": "ok", "fact": str(spec.get("fact_on") or "включено")}
        return {"status": "off", "fact": "флаг выключен (default 0)"}
    if kind == "env":
        key = str(spec.get("flag") or "")
        if env_flags.get(key):
            return {"status": "ok", "fact": "env=1"}
        return {"status": "off", "fact": "выключено (env не задан или 0)"}
    if kind == "projects":
        kpis = payload.get("kpis") or {}
        projects = int(kpis.get("projects") or 0)
        active = int(kpis.get("active_sessions") or 0)
        if projects <= 0 and active <= 0:
            return {"status": "no_data", "fact": "нет данных"}
        return {"status": "ok", "fact": f"проектов: {projects}, активных сессий: {active}"}
    if kind == "llm_errors":
        errors = int(llm_provider_errors_24h or 0)
        if errors > 0:
            return {"status": "attention", "fact": f"ошибок провайдера за 24ч: {errors}"}
        return {"status": "ok", "fact": "ошибок провайдера за 24ч: 0"}
    if kind == "rag":
        counts = rag_readiness or {}
        total = sum(int(counts.get(k) or 0) for k in ("not_ready", "queued", "indexed", "error"))
        if total <= 0:
            return {"status": "no_data", "fact": "нет данных (indexing-plan)"}
        if int(counts.get("error") or 0) > 0:
            return {"status": "attention", "fact": f"ошибок индексации: {counts.get('error')}"}
        if spec.get("mode") == "readiness":
            return {"status": "ok", "fact": f"готовы к индексации: {counts.get('not_ready', 0)}"}
        queued = int(counts.get("queued") or 0)
        if queued > 0:
            return {"status": "ok", "fact": f"в очереди: {queued}, проиндексировано: {counts.get('indexed', 0)}"}
        return {"status": "ok", "fact": f"проиндексировано сессий: {counts.get('indexed', 0)}"}
    if kind == "mirror":
        publish_mirror = payload.get("publish_git_mirror") or {}
        if not publish_mirror.get("org_mirror_enabled"):
            return {"status": "off", "fact": "org mirror выключен"}
        failed = int(publish_mirror.get("failed") or 0)
        if failed > 0:
            return {"status": "attention", "fact": f"ошибок mirror: {failed}"}
        return {"status": "ok", "fact": f"mirrored to git: {publish_mirror.get('mirrored_to_git', 0)}"}
    if kind == "audit":
        count = len(payload.get("recent_audit") or [])
        if count <= 0:
            return {"status": "no_data", "fact": "нет данных"}
        return {"status": "ok", "fact": f"записей аудита (recent): {count}"}
    if kind == "graph":
        if not graph_freshness_iso:
            return {"status": "no_data", "fact": "нет снапшотов"}
        return {"status": "ok", "fact": f"снапшот от {graph_freshness_iso}"}
    return {"status": "no_data", "fact": "нет данных"}


def build_capability_map(
    payload: Mapping[str, Any],
    *,
    flags: Mapping[str, bool],
    env_flags: Mapping[str, bool],
    llm_provider_errors_24h: int,
    rag_readiness: Optional[Mapping[str, int]],
    graph_freshness_iso: str,
) -> List[Dict[str, Any]]:
    by_domain: Dict[str, List[Dict[str, Any]]] = {d["domain"]: [] for d in _CAPABILITY_DOMAINS}
    for domain, cap_id, label, href, kind, spec in _CAPABILITIES:
        resolved = _resolve_capability(
            kind,
            spec,
            payload=payload,
            flags=flags,
            env_flags=env_flags,
            llm_provider_errors_24h=llm_provider_errors_24h,
            rag_readiness=rag_readiness,
            graph_freshness_iso=graph_freshness_iso,
        )
        by_domain[domain].append(
            {
                "id": cap_id,
                "label": label,
                "status": resolved["status"],
                "fact": resolved["fact"],
                "href": href,
            }
        )
    return [
        {
            "domain": domain["domain"],
            "label": domain["label"],
            "capabilities": by_domain[domain["domain"]],
        }
        for domain in _CAPABILITY_DOMAINS
    ]
