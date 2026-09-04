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

def _format_deployment_notice_row(d: dict) -> dict:
    return {
        "id": str(d.get("id") or ""),
        "message": str(d.get("message") or ""),
        "scheduled_at": int(d.get("scheduled_at") or 0),
        "display_duration_minutes": int(d.get("display_duration_minutes") or 0),
        "is_active": bool(d.get("is_active", 1)),
        "created_by": str(d.get("created_by") or ""),
        "created_at": int(d.get("created_at") or 0),
    }


def _meta_get(con: sqlite3.Connection, key: str) -> str:
    row = con.execute("SELECT value FROM storage_meta WHERE key = ? LIMIT 1", [str(key or "")]).fetchone()
    if not row:
        return ""
    return str(row["value"] or "")


def _meta_set(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        """
        INSERT INTO storage_meta(key, value) VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
        """,
        [str(key or ""), str(value or "")],
    )


def cancel_deployment_notice(notice_id: str) -> bool:
    with _connect() as con:
        cur = con.execute(
            "UPDATE deployment_notices SET is_active = 0 WHERE id = ?",
            [str(notice_id or "")],
        )
        con.commit()
    return cur.rowcount > 0


def create_deployment_notice(
    message: str,
    scheduled_at: int,
    display_duration_minutes: int,
    created_by: str,
) -> dict:
    notice_id = f"dn_{uuid.uuid4().hex}"
    now = _now_ts()
    with _connect() as con:
        con.execute(
            """
            INSERT INTO deployment_notices (id, message, scheduled_at, display_duration_minutes, is_active, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                notice_id,
                str(message or ""),
                int(scheduled_at or 0),
                int(display_duration_minutes or 0),
                1,
                str(created_by or ""),
                now,
            ],
        )
        con.commit()
    return get_deployment_notice(notice_id)


def get_active_deployment_notice(now: int | None = None) -> dict | None:
    now = int(now or _now_ts())
    try:
        with _connect() as con:
            row = con.execute(
                """
                SELECT * FROM deployment_notices
                WHERE is_active = 1
                  AND scheduled_at <= ?
                  AND (display_duration_minutes = 0 OR scheduled_at + (display_duration_minutes * 60) >= ?)
                ORDER BY scheduled_at DESC
                LIMIT 1
                """,
                [now, now],
            ).fetchone()
    except Exception:
        return None
    if not row:
        return None
    return _format_deployment_notice_row(dict(row))


def get_deployment_notice(notice_id: str) -> dict | None:
    try:
        with _connect() as con:
            row = con.execute(
                "SELECT * FROM deployment_notices WHERE id = ? LIMIT 1", [str(notice_id or "")]
            ).fetchone()
    except Exception:
        return None
    if not row:
        return None
    d = dict(row)
    return _format_deployment_notice_row(d)


def get_feature_flag(key: str) -> str:
    try:
        with _connect() as con:
            row = con.execute("SELECT value FROM feature_flags WHERE key = ? LIMIT 1", [str(key or "")]).fetchone()
            return str(row["value"]) if row else ""
    except Exception:
        return ""


def get_feature_flags() -> dict[str, str]:
    try:
        with _connect() as con:
            rows = con.execute("SELECT key, value FROM feature_flags").fetchall()
            return {str(r["key"]): str(r["value"]) for r in rows}
    except Exception:
        return {}


def get_rag_settings(org_id: str) -> dict:
    _defaults = {
        "enabled": True,
        "indexing_enabled": True,
        "default_top_k": 10,
        "max_top_k": 50,
        "default_min_score": None,
        "allowed_source_types": ["bpmn_xml", "product_action"],
        "show_technical_fragments": False,
        "hybrid_enabled": False,
        "bm25_weight": 0.5,
        "vector_weight": 0.5,
        "embedding_model_id": "local-e5-small",
    }
    try:
        with _connect() as con:
            row = con.execute(
                "SELECT * FROM rag_settings WHERE org_id=? LIMIT 1", [str(org_id or "")]
            ).fetchone()
    except Exception:
        return dict(_defaults)
    if not row:
        return dict(_defaults)
    d = dict(row)
    try:
        source_types = json.loads(d.get("allowed_source_types") or '["bpmn_xml","product_action"]')
    except Exception:
        source_types = list(_defaults["allowed_source_types"])
    try:
        bm25_weight = float(d.get("bm25_weight") if d.get("bm25_weight") is not None else 0.5)
        vector_weight = float(d.get("vector_weight") if d.get("vector_weight") is not None else 0.5)
    except Exception:
        bm25_weight = 0.5
        vector_weight = 0.5
    return {
        "enabled": bool(d.get("enabled", 1)),
        "indexing_enabled": bool(d.get("indexing_enabled", 1)),
        "default_top_k": int(d.get("default_top_k", 10)),
        "max_top_k": int(d.get("max_top_k", 50)),
        "default_min_score": d.get("default_min_score"),
        "allowed_source_types": source_types,
        "show_technical_fragments": bool(d.get("show_technical_fragments", 0)),
        # 023-колонки: .get-дефолты — БД без миграции 023 получают keyword-only режим.
        "hybrid_enabled": bool(d.get("hybrid_enabled", 0)),
        "bm25_weight": bm25_weight,
        "vector_weight": vector_weight,
        "embedding_model_id": str(d.get("embedding_model_id") or "local-e5-small"),
    }


def list_deployment_notices(limit: int = 100) -> list[dict]:
    try:
        with _connect() as con:
            rows = con.execute(
                """
                SELECT * FROM deployment_notices
                ORDER BY scheduled_at DESC
                LIMIT ?
                """,
                [max(1, int(limit or 100))],
            ).fetchall()
    except Exception:
        return []
    return [_format_deployment_notice_row(dict(r)) for r in rows]


def set_feature_flag(key: str, value: str) -> None:
    with _connect() as con:
        con.execute(
            """
            INSERT INTO feature_flags (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            [str(key or ""), str(value or ""), int(time.time())],
        )
        con.commit()

from ..compat.repository import _connect
from ..compat.repository import _now_ts
