"""E8.1 — универсальный writer событий аудита поверх существующей таблицы audit_log.

Контракт: write_event(actor_user_id, action, entity_type, entity_id, status,
meta_json, org_id=None) — единая точка записи для recipe/template
create/update/publish/clone (E7 publish-flow пишет через тот же
``storage.append_audit_log``, поэтому события не дублируются).

diff_json в meta_json: поимённый diff «поле: old → new»
(``diff_parameters`` + человекочитаемые строки ``format_diff_lines``).

Writer best-effort: ошибка записи аудита не роняет бизнес-операцию
(как и E7 write_publish_audit), возвращает None при сбое.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Ярлык для неразрешённого актора (E8.5) — используется и API, и UI.
ACTOR_UNKNOWN_LABEL = "пользователь удалён/внешний"


def diff_parameters(old: Optional[Dict[str, Any]], new: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Поимённый diff двух словарей параметров: {field: {"old": ..., "new": ...}}.

    Охватывает изменённые, добавленные (old=None) и удалённые (new=None) поля.
    Порядок — по имени поля для стабильного вывода.
    """
    old_map = old if isinstance(old, dict) else {}
    new_map = new if isinstance(new, dict) else {}
    diff: Dict[str, Dict[str, Any]] = {}
    for key in sorted(set(old_map) | set(new_map)):
        old_val = old_map.get(key)
        new_val = new_map.get(key)
        if key in old_map and key in new_map and old_val == new_val:
            continue
        diff[str(key)] = {
            "old": old_val if key in old_map else None,
            "new": new_val if key in new_map else None,
        }
    return diff


def format_diff_lines(diff: Optional[Dict[str, Dict[str, Any]]]) -> List[str]:
    """Человекочитаемые строки diff: «target_temp_c: 75 → 80»."""
    lines: List[str] = []
    for field, change in (diff or {}).items():
        old_val = change.get("old")
        new_val = change.get("new")
        lines.append(f"{field}: {_fmt_value(old_val)} → {_fmt_value(new_val)}")
    return lines


def _fmt_value(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "да" if value else "нет"
    return str(value)


def write_event(
    *,
    actor_user_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    status: str = "ok",
    meta_json: Optional[Dict[str, Any]] = None,
    org_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Записать событие в audit_log (best-effort).

    org_id=None → дефолтная организация (get_default_org_id), чтобы события
    не терялись вне орг-контекста запроса.
    """
    try:
        from ..storage import append_audit_log, get_default_org_id

        oid = str(org_id or "").strip() or get_default_org_id()
        return append_audit_log(
            actor_user_id=str(actor_user_id or "").strip() or "-",
            org_id=oid,
            action=str(action or "").strip(),
            entity_type=str(entity_type or "").strip(),
            entity_id=str(entity_id or "").strip() or "-",
            status=str(status or "ok").strip() or "ok",
            project_id=project_id,
            session_id=session_id,
            meta=meta_json if isinstance(meta_json, dict) else {},
        )
    except Exception as exc:  # pragma: no cover - аудит не должен ронять операцию
        print(f"[AUDIT] write_failed action={action} entity={entity_type}:{entity_id} err={exc}")
        return None
