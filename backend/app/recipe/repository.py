"""E5 — PG-backed repository for the E1 `recipe` table (technologist recipes).

Follows the compat style of ``backend/app/process_template/repository.py``:
``storage._connect`` with ``?`` placeholders translated for Postgres and rows
exposed via ``_RowCompat`` (``.get()``/index access).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..storage import _connect

_COLUMNS = "id, template_id, sku_id, template_version, parameters_json, status, created_by, updated_at"


def _json_field(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return None


def _row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "template_id": str(row.get("template_id") or ""),
        "sku_id": row.get("sku_id"),
        "template_version": row.get("template_version"),
        "parameters_json": _json_field(row.get("parameters_json")) or {},
        "status": row.get("status"),
        "created_by": row.get("created_by"),
        "updated_at": row.get("updated_at"),
    }


class RecipeRepository:
    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        recipe_id = str(uuid.uuid4())
        now = datetime.utcnow()
        with _connect() as con:
            row = con.execute(
                f"""
                INSERT INTO recipe ({_COLUMNS})
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING {_COLUMNS}
                """,
                [
                    recipe_id,
                    data["template_id"],
                    data["sku_id"],
                    data.get("template_version") or "",
                    json.dumps(data.get("parameters_json") or {}),
                    data.get("status", "draft"),
                    data.get("created_by") or "",
                    now,
                ],
            ).fetchone()
            con.commit()
        return _row_to_dict(row)

    def get_by_id(self, recipe_id: str) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            row = con.execute(
                f"SELECT {_COLUMNS} FROM recipe WHERE id = ?",
                [recipe_id],
            ).fetchone()
        return _row_to_dict(row) if row else None

    def list(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        with _connect() as con:
            rows = con.execute(
                f"SELECT {_COLUMNS} FROM recipe ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                [limit, offset],
            ).fetchall()
        return [_row_to_dict(row) for row in rows]

    def update(self, recipe_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        set_parts = []
        values = []
        for key in ("sku_id", "template_id", "template_version", "status", "created_by"):
            if key in data:
                set_parts.append(f"{key} = ?")
                values.append(data[key])
        if "parameters_json" in data:
            set_parts.append("parameters_json = ?")
            values.append(json.dumps(data.get("parameters_json") or {}))

        if not set_parts:
            return self.get_by_id(recipe_id)

        set_parts.append("updated_at = ?")
        values.append(datetime.utcnow())
        values.append(recipe_id)

        with _connect() as con:
            row = con.execute(
                f"""
                UPDATE recipe
                SET {", ".join(set_parts)}
                WHERE id = ?
                RETURNING {_COLUMNS}
                """,
                values,
            ).fetchone()
            con.commit()
        return _row_to_dict(row) if row else None


# --- E7.3 — recipe_version (история публикаций рецепта) ----------------------

_VERSION_COLUMNS = (
    "id, recipe_id, version, status, parameters_json, "
    "template_id, template_version, created_by, created_at"
)


def _version_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "recipe_id": str(row.get("recipe_id") or ""),
        "version": row.get("version"),
        "status": row.get("status"),
        "parameters_json": _json_field(row.get("parameters_json")) or {},
        "template_id": str(row.get("template_id") or ""),
        "template_version": row.get("template_version"),
        "created_by": row.get("created_by"),
        "created_at": row.get("created_at"),
    }


class RecipeVersionRepository:
    """Snapshot-история публикаций рецепта (E7.3)."""

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        version_id = str(uuid.uuid4())
        now = datetime.utcnow()
        with _connect() as con:
            row = con.execute(
                f"""
                INSERT INTO recipe_version ({_VERSION_COLUMNS})
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING {_VERSION_COLUMNS}
                """,
                [
                    version_id,
                    data["recipe_id"],
                    data["version"],
                    data.get("status", "published"),
                    json.dumps(data.get("parameters_json") or {}),
                    data.get("template_id") or None,
                    data.get("template_version") or "",
                    data.get("created_by") or "",
                    now,
                ],
            ).fetchone()
            con.commit()
        return _version_row_to_dict(row)

    def list_for_recipe(self, recipe_id: str) -> List[Dict[str, Any]]:
        with _connect() as con:
            rows = con.execute(
                f"SELECT {_VERSION_COLUMNS} FROM recipe_version WHERE recipe_id = ? "
                "ORDER BY created_at DESC, version DESC",
                [recipe_id],
            ).fetchall()
        return [_version_row_to_dict(row) for row in rows]

    def next_version(self, recipe_id: str) -> str:
        """patch-автоинкремент от последней версии (первый publish — 1.0.0)."""
        with _connect() as con:
            row = con.execute(
                "SELECT version FROM recipe_version WHERE recipe_id = ? "
                "ORDER BY created_at DESC LIMIT 1",
                [recipe_id],
            ).fetchone()
        last = str(row.get("version") or "") if row else ""
        parts = last.split(".")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            return f"{parts[0]}.{parts[1]}.{int(parts[2]) + 1}"
        return "1.0.0"

