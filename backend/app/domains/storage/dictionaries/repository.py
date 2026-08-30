from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
import hashlib
import secrets
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple, Set
import xml.etree.ElementTree as ET
from ....db import get_db_runtime_config, redact_database_url
from ....models import Project, Session
from ....session_status import derive_session_status
logger = logging.getLogger(__name__)
try:
    import psycopg
    from psycopg.errors import IntegrityError as PsycopgIntegrityError
    from psycopg_pool import ConnectionPool
except Exception:
    psycopg = None
    PsycopgIntegrityError = None
    ConnectionPool = None
from ..compat.repository import _PROPERTY_METADATA_SEED
from ..compat.repository import _PROPERTY_METADATA_SEED_KEY
from ..compat.repository import _REFERENCE_SEED
from ..compat.repository import _REFERENCE_SEED_KEY

def _seed_process_property_metadata(con: Optional[sqlite3.Connection] = None) -> None:
    if con is None:
        _ensure_schema()
        with _connect() as con:
            _seed_process_property_metadata(con)
        return
    done = meta_get(con, _PROPERTY_METADATA_SEED_KEY)
    if done:
        return
    now = str(_now_ts())
    for item in _PROPERTY_METADATA_SEED:
        row_id = str(item["id"] or "").strip()
        if not row_id:
            continue
        con.execute(
            """
            INSERT INTO process_property_metadata (
                id, display_name, property_type, applicable_to, default_value, value_range,
                validation_rules, source, editable, visible_in, category, inheritance, version,
                created_at, updated_at, org_id, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                display_name=excluded.display_name,
                property_type=excluded.property_type,
                applicable_to=excluded.applicable_to,
                default_value=excluded.default_value,
                value_range=excluded.value_range,
                validation_rules=excluded.validation_rules,
                source=excluded.source,
                editable=excluded.editable,
                visible_in=excluded.visible_in,
                category=excluded.category,
                inheritance=excluded.inheritance,
                version=excluded.version,
                updated_at=excluded.updated_at
            """,
            [
                row_id,
                str(item.get("display_name") or "").strip(),
                str(item.get("property_type") or "").strip(),
                _json_text(item.get("applicable_to")),
                item.get("default_value") if item.get("default_value") is not None else None,
                _json_text(item.get("value_range")),
                _json_text(item.get("validation_rules")),
                str(item.get("source") or "bpmn_extension").strip(),
                1 if item.get("editable") else 0,
                _json_text(item.get("visible_in")),
                str(item.get("category") or "general").strip(),
                str(item.get("inheritance") or "none").strip(),
                int(item.get("version") or 1),
                now,
                now,
                None,
                "",
                "",
            ],
        )
    meta_set(con, _PROPERTY_METADATA_SEED_KEY, "1")


def _seed_reference_tables(con: Optional[sqlite3.Connection] = None) -> None:
    if con is None:
        _ensure_schema()
        with _connect() as con:
            _seed_reference_tables(con)
        return
    done = meta_get(con, _REFERENCE_SEED_KEY)
    if done:
        return
    now = str(_now_ts())
    for table_name, rows in _REFERENCE_SEED.items():
        if table_name == "ingredients":
            for rid, name, unit, cal, allergens, supplier in rows:
                con.execute(
                    """
                    INSERT INTO ingredients (id, name, unit, calories_per_unit, allergens, supplier_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    [rid, name, unit, cal, allergens, supplier, now, now],
                )
        elif table_name == "equipment":
            for rid, name, type, capacity, maint in rows:
                con.execute(
                    """
                    INSERT INTO equipment (id, name, type, capacity, maintenance_schedule, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    [rid, name, type, capacity, maint, now, now],
                )
        elif table_name == "containers":
            for rid, name, volume, material, temp in rows:
                con.execute(
                    """
                    INSERT INTO containers (id, name, volume, material, temperature_range, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    [rid, name, volume, material, temp, now, now],
                )
    meta_set(con, _REFERENCE_SEED_KEY, "1")


def apply_user_preferences_patch(
    user_id: str,
    org_id: str,
    *,
    base_version: Any,
    set_values: Optional[Dict[str, Any]] = None,
    unset_keys: Optional[List[str]] = None,
) -> Tuple[Dict[str, Any], bool]:
    """Атомарный merge-patch с optimistic concurrency.

    Возвращает (snapshot, conflict). conflict=True → base_version не совпал,
    ничего не записано, snapshot — актуальное состояние (для 409/LWW).
    """
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        raise ValueError("user_id and org_id are required")
    set_map = dict(set_values or {})
    unset_list = [str(k or "").strip() for k in (unset_keys or []) if str(k or "").strip()]
    now = _now_ts()
    _ensure_schema()
    conflict = False
    with _connect() as con:
        doc = con.execute(
            "SELECT version FROM user_preferences_docs WHERE user_id = ? AND org_id = ? LIMIT 1",
            [uid, oid],
        ).fetchone()
        current_version = int(_row_to_dict(doc).get("version") or 0) if doc else 0
        if int(base_version) != current_version:
            conflict = True
        else:
            next_version = current_version + 1
            for key, value in set_map.items():
                if value is None:
                    con.execute(
                        "DELETE FROM user_preferences WHERE user_id = ? AND org_id = ? AND key = ?",
                        [uid, oid, key],
                    )
                else:
                    con.execute(
                        """
                        INSERT INTO user_preferences (user_id, org_id, key, value_json, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(user_id, org_id, key) DO UPDATE SET
                            value_json=excluded.value_json,
                            updated_at=excluded.updated_at
                        """,
                        [uid, oid, key, _json_dumps(value, None), now],
                    )
            for key in unset_list:
                con.execute(
                    "DELETE FROM user_preferences WHERE user_id = ? AND org_id = ? AND key = ?",
                    [uid, oid, key],
                )
            con.execute(
                """
                INSERT INTO user_preferences_docs (user_id, org_id, version, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, org_id) DO UPDATE SET
                    version=excluded.version,
                    updated_at=excluded.updated_at
                """,
                [uid, oid, next_version, now],
            )
        con.commit()
    return get_user_preferences(uid, oid), conflict


def delete_org_property_dictionary_definition(org_id: str, operation_key: str, property_key: str) -> bool:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    prop_key = normalize_org_property_dictionary_key(property_key)
    if not oid or not op_key or not prop_key:
        return False
    _ensure_schema()
    with _connect() as con:
        con.execute(
            "DELETE FROM org_property_dictionary_values WHERE org_id = ? AND operation_key = ? AND property_key = ?",
            [oid, op_key, prop_key],
        )
        cur = con.execute(
            "DELETE FROM org_property_dictionary_defs WHERE org_id = ? AND operation_key = ? AND property_key = ?",
            [oid, op_key, prop_key],
        )
        con.commit()
    return int(cur.rowcount or 0) > 0


def delete_org_property_dictionary_value(org_id: str, option_id: str) -> bool:
    oid = str(org_id or "").strip()
    option_row_id = str(option_id or "").strip()
    if not oid or not option_row_id:
        return False
    _ensure_schema()
    with _connect() as con:
        cur = con.execute(
            "DELETE FROM org_property_dictionary_values WHERE org_id = ? AND id = ?",
            [oid, option_row_id],
        )
        con.commit()
    return int(cur.rowcount or 0) > 0


def get_org_property_dictionary_bundle(
    org_id: str,
    operation_key: str,
    *,
    include_inactive: bool = False,
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    operation = get_org_property_dictionary_operation(oid, op_key)
    definitions = list_org_property_dictionary_definitions(oid, op_key, include_inactive=include_inactive)
    values_by_property: Dict[str, List[Dict[str, Any]]] = {}
    for definition in definitions:
        property_key = str(definition.get("property_key") or "")
        values_by_property[property_key] = list_org_property_dictionary_values(
            oid,
            op_key,
            property_key,
            include_inactive=include_inactive,
        )
    properties = []
    for definition in definitions:
        property_key = str(definition.get("property_key") or "")
        properties.append({
            **definition,
            "options": values_by_property.get(property_key, []),
        })
    return {
        "org_id": oid,
        "organizationId": oid,
        "operation_key": op_key,
        "operationKey": op_key,
        "operation": operation,
        "properties": properties,
    }


def get_org_property_dictionary_definition(org_id: str, operation_key: str, property_key: str) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    prop_key = normalize_org_property_dictionary_key(property_key)
    if not oid or not op_key or not prop_key:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, org_id, operation_key, property_key, property_label, input_mode, allow_custom_value, required, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_defs
             WHERE org_id = ? AND operation_key = ? AND property_key = ?
             LIMIT 1
            """,
            [oid, op_key, prop_key],
        ).fetchone()
    return _org_property_dictionary_definition_row_to_dict(row) if row else None


def get_org_property_dictionary_operation(org_id: str, operation_key: str) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    if not oid or not op_key:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, org_id, operation_key, operation_label, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_operations
             WHERE org_id = ? AND operation_key = ?
             LIMIT 1
            """,
            [oid, op_key],
        ).fetchone()
    return _org_property_dictionary_operation_row_to_dict(row) if row else None


def get_org_property_dictionary_value_by_id(org_id: str, option_id: str) -> Optional[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    option_row_id = str(option_id or "").strip()
    if not oid or not option_row_id:
        return None
    _ensure_schema()
    with _connect() as con:
        row = con.execute(
            """
            SELECT id, org_id, operation_key, property_key, option_value, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_values
             WHERE org_id = ? AND id = ?
             LIMIT 1
            """,
            [oid, option_row_id],
        ).fetchone()
    return _org_property_dictionary_value_row_to_dict(row) if row else None


def get_process_property_metadata(
    id: str,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    row_id = str(id or "").strip()
    if not row_id:
        return None
    oid = str(org_id or "").strip() or None
    _ensure_schema()
    params: List[Any] = [row_id]
    clauses = ["id = ?"]
    if oid:
        clauses.append("(org_id = ? OR org_id IS NULL)")
        params.append(oid)
    where = " AND ".join(clauses)
    with _connect() as con:
        row = con.execute(
            f"SELECT * FROM process_property_metadata WHERE {where} LIMIT 1",
            params,
        ).fetchone()
    return _row_to_dict(row) if row else None


def get_user_preferences(user_id: str, org_id: str) -> Dict[str, Any]:
    """Снапшот preferences-документа (user+org). Нет записей → version 0, {}."""
    uid = str(user_id or "").strip()
    oid = str(org_id or "").strip()
    if not uid or not oid:
        raise ValueError("user_id and org_id are required")
    _ensure_schema()
    with _connect() as con:
        doc = con.execute(
            "SELECT version, updated_at FROM user_preferences_docs WHERE user_id = ? AND org_id = ? LIMIT 1",
            [uid, oid],
        ).fetchone()
        rows = con.execute(
            "SELECT key, value_json FROM user_preferences WHERE user_id = ? AND org_id = ?",
            [uid, oid],
        ).fetchall()
    preferences: Dict[str, Any] = {}
    for row in rows:
        r = _row_to_dict(row)
        preferences[str(r.get("key") or "")] = _json_loads(r.get("value_json"), None)
    doc_d = _row_to_dict(doc) if doc else {}
    return {
        "user_id": uid,
        "version": int(doc_d.get("version") or 0),
        "updated_at": int(doc_d.get("updated_at") or 0),
        "preferences": preferences,
    }


def list_org_property_dictionary_definitions(
    org_id: str,
    operation_key: str,
    *,
    include_inactive: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    if not oid or not op_key:
        return []
    _ensure_schema()
    clauses = ["org_id = ?", "operation_key = ?"]
    params: List[Any] = [oid, op_key]
    if not include_inactive:
        clauses.append("is_active = 1")
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, org_id, operation_key, property_key, property_label, input_mode, allow_custom_value, required, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_defs
             WHERE {' AND '.join(clauses)}
             ORDER BY sort_order ASC, lower(property_label) ASC, lower(property_key) ASC, id ASC
            """,
            params,
        ).fetchall()
    return [_org_property_dictionary_definition_row_to_dict(row) for row in rows]


def list_org_property_dictionary_operations(
    org_id: str,
    *,
    include_inactive: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    if not oid:
        return []
    _ensure_schema()
    clauses = ["org_id = ?"]
    params: List[Any] = [oid]
    if not include_inactive:
        clauses.append("is_active = 1")
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, org_id, operation_key, operation_label, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_operations
             WHERE {' AND '.join(clauses)}
             ORDER BY sort_order ASC, lower(operation_label) ASC, lower(operation_key) ASC, id ASC
            """,
            params,
        ).fetchall()
    return [_org_property_dictionary_operation_row_to_dict(row) for row in rows]


def list_org_property_dictionary_values(
    org_id: str,
    operation_key: str,
    property_key: str,
    *,
    include_inactive: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    prop_key = normalize_org_property_dictionary_key(property_key)
    if not oid or not op_key or not prop_key:
        return []
    _ensure_schema()
    clauses = ["org_id = ?", "operation_key = ?", "property_key = ?"]
    params: List[Any] = [oid, op_key, prop_key]
    if not include_inactive:
        clauses.append("is_active = 1")
    with _connect() as con:
        rows = con.execute(
            f"""
            SELECT id, org_id, operation_key, property_key, option_value, is_active, sort_order, created_at, updated_at, created_by, updated_by
              FROM org_property_dictionary_values
             WHERE {' AND '.join(clauses)}
             ORDER BY sort_order ASC, lower(option_value) ASC, id ASC
            """,
            params,
        ).fetchall()
    return [_org_property_dictionary_value_row_to_dict(row) for row in rows]


def list_process_property_metadata(
    org_id: Optional[str] = None,
    *,
    include_global: bool = True,
) -> List[Dict[str, Any]]:
    oid = str(org_id or "").strip() or None
    _ensure_schema()
    params: List[Any] = []
    clauses = ["1=1"]
    if oid:
        if include_global:
            clauses.append("(org_id = ? OR org_id IS NULL)")
        else:
            clauses.append("org_id = ?")
        params.append(oid)
    where = " AND ".join(clauses)
    with _connect() as con:
        rows = con.execute(
            f"SELECT * FROM process_property_metadata WHERE {where} ORDER BY category, display_name",
            params,
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def list_reference_options(
    table_name: str,
    org_id: Optional[str] = None,
    q: str = "",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    allowed = {"ingredients", "equipment", "containers"}
    if table_name not in allowed:
        return []
    qq = str(q or "").strip()
    try:
        lim = int(limit)
    except Exception:
        lim = 20
    lim = min(max(lim, 1), 500)
    _ensure_schema()
    params: List[Any] = []
    clauses = ["1=1"]
    oid = str(org_id or "").strip() or None
    if oid:
        clauses.append("(org_id = ? OR org_id IS NULL)")
        params.append(oid)
    # SQLite LIKE/LOWER are ASCII-only by default; filter in Python for Unicode case folding.
    where = " AND ".join(clauses)
    with _connect() as con:
        rows = con.execute(
            f"SELECT * FROM {table_name} WHERE {where} ORDER BY name",
            params,
        ).fetchall()
    out = [_row_to_dict(row) for row in rows]
    if qq:
        q_lower = qq.lower()
        out = [row for row in out if q_lower in str(row.get("name") or "").lower()]
    return out[:lim]


def update_org_property_dictionary_value(
    org_id: str,
    option_id: str,
    *,
    option_value: Optional[str] = None,
    is_active: Any = None,
    sort_order: Any = None,
    actor_user_id: str = "",
) -> Optional[Dict[str, Any]]:
    current = get_org_property_dictionary_value_by_id(org_id, option_id)
    if not current:
        return None
    oid = str(current.get("org_id") or "")
    op_key = str(current.get("operation_key") or "")
    prop_key = str(current.get("property_key") or "")
    next_value = str(option_value if option_value is not None else current.get("option_value") or "").strip()
    if not next_value:
        raise ValueError("option_value required")
    next_sort_order = int(sort_order if sort_order is not None else current.get("sort_order") or 0)
    next_is_active = (
        normalize_org_property_dictionary_bool(is_active, default=bool(current.get("is_active")))
        if is_active is not None
        else (1 if bool(current.get("is_active")) else 0)
    )
    now = _now_ts()
    _ensure_schema()
    with _connect() as con:
        conflict = con.execute(
            """
            SELECT id
              FROM org_property_dictionary_values
             WHERE org_id = ? AND operation_key = ? AND property_key = ? AND option_value = ? AND id != ?
             LIMIT 1
            """,
            [oid, op_key, prop_key, next_value, str(option_id or "").strip()],
        ).fetchone()
        if conflict:
            raise ValueError("option_value_exists")
        con.execute(
            """
            UPDATE org_property_dictionary_values
               SET option_value = ?,
                   is_active = ?,
                   sort_order = ?,
                   updated_at = ?,
                   updated_by = ?
             WHERE org_id = ? AND id = ?
            """,
            [next_value, next_is_active, next_sort_order, now, str(actor_user_id or ""), oid, str(option_id or "").strip()],
        )
        con.commit()
    return get_org_property_dictionary_value_by_id(oid, option_id)


def upsert_org_property_dictionary_definition(
    org_id: str,
    *,
    operation_key: str,
    property_key: str,
    property_label: str = "",
    input_mode: Any = "autocomplete",
    allow_custom_value: Any = True,
    required: Any = False,
    is_active: Any = True,
    sort_order: Any = 0,
    actor_user_id: str = "",
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    prop_key = normalize_org_property_dictionary_key(property_key)
    if not oid:
        raise ValueError("org_id required")
    if not op_key:
        raise ValueError("operation_key required")
    if not prop_key:
        raise ValueError("property_key required")
    label = normalize_org_property_dictionary_label(property_label, fallback=prop_key)
    now = _now_ts()
    prop_id = f"opddef_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        existing = con.execute(
            """
            SELECT id, created_at, created_by
              FROM org_property_dictionary_defs
             WHERE org_id = ? AND operation_key = ? AND property_key = ?
             LIMIT 1
            """,
            [oid, op_key, prop_key],
        ).fetchone()
        con.execute(
            """
            INSERT INTO org_property_dictionary_defs (
              id, org_id, operation_key, property_key, property_label, input_mode, allow_custom_value, required, is_active, sort_order, created_at, updated_at, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_id, operation_key, property_key) DO UPDATE SET
              property_label = excluded.property_label,
              input_mode = excluded.input_mode,
              allow_custom_value = excluded.allow_custom_value,
              required = excluded.required,
              is_active = excluded.is_active,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by
            """,
            [
                str(existing["id"] if existing else prop_id),
                oid,
                op_key,
                prop_key,
                label,
                normalize_org_property_dictionary_input_mode(input_mode),
                normalize_org_property_dictionary_bool(allow_custom_value, default=True),
                normalize_org_property_dictionary_bool(required, default=False),
                normalize_org_property_dictionary_bool(is_active, default=True),
                int(sort_order or 0),
                int(existing["created_at"] or now) if existing else now,
                now,
                str(existing["created_by"] or actor_user_id or "") if existing else str(actor_user_id or ""),
                str(actor_user_id or ""),
            ],
        )
        con.commit()
    out = get_org_property_dictionary_definition(oid, op_key, prop_key)
    if not out:
        raise ValueError("definition_upsert_failed")
    return out


def upsert_org_property_dictionary_operation(
    org_id: str,
    *,
    operation_key: str,
    operation_label: str = "",
    is_active: Any = True,
    sort_order: Any = 0,
    actor_user_id: str = "",
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    if not oid:
        raise ValueError("org_id required")
    if not op_key:
        raise ValueError("operation_key required")
    label = normalize_org_property_dictionary_label(operation_label, fallback=op_key)
    now = _now_ts()
    op_id = f"opd_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        existing = con.execute(
            "SELECT id, created_at, created_by FROM org_property_dictionary_operations WHERE org_id = ? AND operation_key = ? LIMIT 1",
            [oid, op_key],
        ).fetchone()
        con.execute(
            """
            INSERT INTO org_property_dictionary_operations (
              id, org_id, operation_key, operation_label, is_active, sort_order, created_at, updated_at, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_id, operation_key) DO UPDATE SET
              operation_label = excluded.operation_label,
              is_active = excluded.is_active,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by
            """,
            [
                str(existing["id"] if existing else op_id),
                oid,
                op_key,
                label,
                normalize_org_property_dictionary_bool(is_active, default=True),
                int(sort_order or 0),
                int(existing["created_at"] or now) if existing else now,
                now,
                str(existing["created_by"] or actor_user_id or "") if existing else str(actor_user_id or ""),
                str(actor_user_id or ""),
            ],
        )
        con.commit()
    out = get_org_property_dictionary_operation(oid, op_key)
    if not out:
        raise ValueError("operation_upsert_failed")
    return out


def upsert_org_property_dictionary_value(
    org_id: str,
    *,
    operation_key: str,
    property_key: str,
    option_value: str,
    is_active: Any = True,
    sort_order: Any = 0,
    actor_user_id: str = "",
) -> Dict[str, Any]:
    oid = str(org_id or "").strip()
    op_key = normalize_org_property_dictionary_key(operation_key)
    prop_key = normalize_org_property_dictionary_key(property_key)
    opt_value = str(option_value or "").strip()
    if not oid:
        raise ValueError("org_id required")
    if not op_key:
        raise ValueError("operation_key required")
    if not prop_key:
        raise ValueError("property_key required")
    if not opt_value:
        raise ValueError("option_value required")
    now = _now_ts()
    value_id = f"opdval_{uuid.uuid4().hex[:12]}"
    _ensure_schema()
    with _connect() as con:
        existing = con.execute(
            """
            SELECT id, created_at, created_by
              FROM org_property_dictionary_values
             WHERE org_id = ? AND operation_key = ? AND property_key = ? AND option_value = ?
             LIMIT 1
            """,
            [oid, op_key, prop_key, opt_value],
        ).fetchone()
        con.execute(
            """
            INSERT INTO org_property_dictionary_values (
              id, org_id, operation_key, property_key, option_value, is_active, sort_order, created_at, updated_at, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(org_id, operation_key, property_key, option_value) DO UPDATE SET
              is_active = excluded.is_active,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at,
              updated_by = excluded.updated_by
            """,
            [
                str(existing["id"] if existing else value_id),
                oid,
                op_key,
                prop_key,
                opt_value,
                normalize_org_property_dictionary_bool(is_active, default=True),
                int(sort_order or 0),
                int(existing["created_at"] or now) if existing else now,
                now,
                str(existing["created_by"] or actor_user_id or "") if existing else str(actor_user_id or ""),
                str(actor_user_id or ""),
            ],
        )
        con.commit()
    out = None
    values = list_org_property_dictionary_values(oid, op_key, prop_key, include_inactive=True)
    for item in values:
        if str(item.get("option_value") or "") == opt_value:
            out = item
            break
    if not out:
        raise ValueError("value_upsert_failed")
    return out


def upsert_process_property_metadata(
    id: str,
    display_name: str,
    property_type: str,
    *,
    org_id: Optional[str] = None,
    applicable_to: Any = None,
    default_value: Any = None,
    value_range: Any = None,
    validation_rules: Any = None,
    source: str = "bpmn_extension",
    editable: Any = True,
    visible_in: Any = None,
    category: str = "general",
    inheritance: str = "none",
    version: Any = 1,
    actor_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    row_id = str(id or "").strip()
    if not row_id:
        raise ValueError("id required")
    now = str(_now_ts())
    _ensure_schema()
    with _connect() as con:
        existing = con.execute(
            "SELECT created_at, created_by FROM process_property_metadata WHERE id = ? LIMIT 1",
            [row_id],
        ).fetchone()
        con.execute(
            """
            INSERT INTO process_property_metadata (
                id, display_name, property_type, applicable_to, default_value, value_range,
                validation_rules, source, editable, visible_in, category, inheritance, version,
                created_at, updated_at, org_id, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                display_name=excluded.display_name,
                property_type=excluded.property_type,
                applicable_to=excluded.applicable_to,
                default_value=excluded.default_value,
                value_range=excluded.value_range,
                validation_rules=excluded.validation_rules,
                source=excluded.source,
                editable=excluded.editable,
                visible_in=excluded.visible_in,
                category=excluded.category,
                inheritance=excluded.inheritance,
                version=excluded.version,
                updated_at=excluded.updated_at,
                updated_by=excluded.updated_by
            """,
            [
                row_id,
                str(display_name or "").strip(),
                str(property_type or "").strip(),
                _json_text(applicable_to),
                default_value if default_value is not None else None,
                _json_text(value_range),
                _json_text(validation_rules),
                str(source or "bpmn_extension").strip(),
                1 if editable else 0,
                _json_text(visible_in),
                str(category or "general").strip(),
                str(inheritance or "none").strip(),
                int(version or 1),
                str(existing["created_at"] if existing else now),
                now,
                str(org_id or "").strip() or None,
                str(existing["created_by"] if existing else actor_user_id or "").strip(),
                str(actor_user_id or "").strip(),
            ],
        )
        con.commit()
    out = get_process_property_metadata(row_id, org_id=org_id)
    if not out:
        raise ValueError("process_property_metadata_upsert_failed")
    return out

from ..compat.repository import _connect
from ..compat.repository import _ensure_schema
from ..compat.repository import _json_dumps
from ..compat.repository import _json_loads
from ..compat.repository import _json_text
from ..compat.repository import _now_ts
from ..compat.repository import _org_property_dictionary_definition_row_to_dict
from ..compat.repository import _org_property_dictionary_operation_row_to_dict
from ..compat.repository import _org_property_dictionary_value_row_to_dict
from ..compat.repository import _row_to_dict
from ..platform import meta_get
from ..platform import meta_set
from ..utils import normalize_org_property_dictionary_bool
from ..utils import normalize_org_property_dictionary_input_mode
from ..utils import normalize_org_property_dictionary_key
from ..utils import normalize_org_property_dictionary_label
