"""Реестр метаданных feature-flags — каталог для админ-дашборда.

Разметка зрелости зафиксирована аудитом контура audit/admin-dashboard-v2-verify
(H8/evidence/h8-flag-consumers.md) и не меняется без нового аудита.

Семантика полей записи:
- owner_contour — логическая метка зоны-владельца флага (подсистема/контур-инициатор,
  например "canvas/overlays"); это НЕ обязательно существующая git-ветка.
  Новые флаги заводятся со ссылкой на реальный контур, их создавший.
  Текущие значения — исторические зоны (контуры overlays/perf не сохранились
  в реестре веток), поэтому могут не совпадать с именами веток.
- removal_criterion — условие, при котором флаг можно удалить из реестра.
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional

FLAG_GROUPS: List[Dict[str, str]] = [
    {"id": "canvas", "label": "Канвас / Редактор"},
    {"id": "workspace", "label": "Workspace"},
    {"id": "save", "label": "Save-пайплайн"},
]

FLAG_CATALOG: Dict[str, Dict[str, str]] = {
    "useBpmnExtensionOverlays": {
        "label": "Hybrid Overlay V2",
        "description": "White-cards overlay + anchor lines поверх bpmn-js; live-sync бейджа «не сохранено» (#964, #1000, #1002).",
        "group": "canvas",
        "maturity": "stable",
        "owner_contour": "canvas/overlays",
        "removal_criterion": "Полный переход канваса на V2-оверлеи без legacy-fallback ветки рендера.",
    },
    "lightweightOverlays": {
        "label": "Lightweight Overlays",
        "description": "JSON-оверлеи вместо XML. Активных потребителей нет — только недостижимая legacy-ветка __FPC_LIGHTWEIGHT_OVERLAYS__.",
        "group": "canvas",
        "maturity": "rudiment",
        "owner_contour": "canvas/overlays",
        "removal_criterion": "Удалить флаг и legacy-ветку после подтверждения отсутствия обращений.",
    },
    "bpmn_fps_meter_enabled": {
        "label": "BPMN FPS-метр",
        "description": "Счётчик FPS на канвасе; читается прямым fetch без fallback (ProcessStage.jsx). Отладочный инструмент.",
        "group": "canvas",
        "maturity": "debug",
        "owner_contour": "canvas/perf",
        "removal_criterion": "Завершение perf-отладки сессий; дальше держать только за дефолтом 0.",
    },
    "canvas_profiler_enabled": {
        "label": "Canvas Profiler",
        "description": "Флаг передаётся во view-model, но view-model его не использует — мёртвый проброс.",
        "group": "canvas",
        "maturity": "rudiment",
        "owner_contour": "canvas/perf",
        "removal_criterion": "Удалить флаг из реестра и проброс в view-model.",
    },
    "workspace_session_tree_view": {
        "label": "Дерево сессий (tree view)",
        "description": "Древовидное представление сессий в workspace (test_workspace_subprocess_tree_view.py).",
        "group": "workspace",
        "maturity": "stable",
        "owner_contour": "workspace/tree",
        "removal_criterion": "Отказ от tree view как режима просмотра (только после замены на плоский список).",
    },
    "workspace_auto_expand_steps": {
        "label": "Авто-раскрытие шагов",
        "description": "Фронтом не читается — рудимент, оставшийся после переделки дерева.",
        "group": "workspace",
        "maturity": "rudiment",
        "owner_contour": "workspace/tree",
        "removal_criterion": "Удалить ключ из реестра и БД после подтверждения отсутствия читателей.",
    },
    "workspace_tobe_overview": {
        "label": "AS IS / TO BE overview",
        "description": "Обзор AS IS / TO BE в workspace. Пилот с захардкоженным гейтом TOBE_OVERVIEW_PILOT_ORG_IDS во фронте: «включено» ≠ «раскатано».",
        "group": "workspace",
        "maturity": "pilot",
        "owner_contour": "workspace/tobe-overview",
        "removal_criterion": "Выход из пилота: удалить гейт TOBE_OVERVIEW_PILOT_ORG_IDS, поднять default до 1.",
    },
}

# Env-managed флаги: значение читается только из env процесса, запись запрещена.
ENV_FLAG_CATALOG: Dict[str, Dict[str, str]] = {
    "FPC_ASYNC_SUBPROCESS_SYNC": {
        "label": "Async subprocess-sync (env)",
        "description": "Асинхронная subprocess-sync при сохранении (#962). Управляется env процесса, не реестром флагов; rollout не начат (default 0).",
        "group": "save",
        "maturity": "rollout",
        "owner_contour": "save/async-subprocess-sync",
        "removal_criterion": "Rollout завершён: default 1 на всех средах, чтение перенесено в реестр.",
        "default": "0",
    },
}

_UNKNOWN_GROUP = {"id": "other", "label": "Прочее"}
_UNKNOWN_MATURITY = "experimental"


def env_flag_value(key: str, environ: Optional[Mapping[str, str]] = None) -> bool:
    env = os.environ if environ is None else environ
    meta = ENV_FLAG_CATALOG.get(key) or {}
    default = str(meta.get("default") or "0")
    return str(env.get(key, default) or default).strip() == "1"


def _flag_entry(
    key: str,
    meta: Mapping[str, str],
    *,
    source: str,
    editable: bool,
    value: bool,
    default: bool,
) -> Dict[str, Any]:
    return {
        "key": key,
        "label": meta.get("label") or key,
        "description": meta.get("description") or "",
        "maturity": meta.get("maturity") or _UNKNOWN_MATURITY,
        "owner_contour": meta.get("owner_contour") or "",
        "removal_criterion": meta.get("removal_criterion") or "",
        "source": source,
        "editable": editable,
        "value": bool(value),
        "default": bool(default),
    }


def build_catalog_payload(
    flags: Mapping[str, bool],
    db_keys: Iterable[str],
    defaults: Mapping[str, str],
    environ: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    known_keys = set(FLAG_CATALOG.keys())
    unknown_keys = sorted(k for k in db_keys if k not in known_keys and k not in ENV_FLAG_CATALOG)

    groups: List[Dict[str, Any]] = []
    for group in FLAG_GROUPS:
        items: List[Dict[str, Any]] = []
        for key, meta in FLAG_CATALOG.items():
            if meta.get("group") != group["id"]:
                continue
            items.append(
                _flag_entry(
                    key,
                    meta,
                    source="runtime",
                    editable=True,
                    value=bool(flags.get(key)),
                    default=str(defaults.get(key, "0")).lower() in {"1", "true", "yes", "on"},
                )
            )
        for key, meta in ENV_FLAG_CATALOG.items():
            if meta.get("group") != group["id"]:
                continue
            items.append(
                _flag_entry(
                    key,
                    meta,
                    source="env",
                    editable=False,
                    value=env_flag_value(key, environ),
                    default=str(meta.get("default") or "0") == "1",
                )
            )
        groups.append({"id": group["id"], "label": group["label"], "flags": items})

    if unknown_keys:
        groups.append(
            {
                "id": _UNKNOWN_GROUP["id"],
                "label": _UNKNOWN_GROUP["label"],
                "flags": [
                    _flag_entry(
                        key,
                        {},
                        source="runtime",
                        editable=True,
                        value=bool(flags.get(key)),
                        default=str(defaults.get(key, "0")).lower() in {"1", "true", "yes", "on"},
                    )
                    for key in unknown_keys
                ],
            }
        )

    return {
        "ok": True,
        "groups": groups,
        "meta": {"generated_at": datetime.now(tz=timezone.utc).isoformat()},
    }
