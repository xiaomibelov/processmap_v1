from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime

from ..storage import _connect

_COLUMNS = "id, name, version, status, ui_model, created_by, updated_at, published_at, audit_metadata"


def _row_to_dict(row: Any) -> Dict[str, Any]:
    def _json_field(value: Any) -> Any:
        if value is None or isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except Exception:
            return None

    return {
        "id": str(row.get("id") or ""),
        "name": row.get("name"),
        "version": row.get("version"),
        "status": row.get("status"),
        "ui_model": _json_field(row.get("ui_model")),
        "created_by": row.get("created_by"),
        "updated_at": row.get("updated_at"),
        "published_at": row.get("published_at"),
        "audit_metadata": _json_field(row.get("audit_metadata")),
    }


class ProcessTemplateRepository:
    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        template_id = str(uuid.uuid4())
        now = datetime.utcnow()
        with _connect() as con:
            row = con.execute(
                f"""
                INSERT INTO process_template ({_COLUMNS})
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING {_COLUMNS}
                """,
                [
                    template_id,
                    data["name"],
                    data["version"],
                    data.get("status", "draft"),
                    json.dumps(data.get("ui_model")) if data.get("ui_model") else None,
                    data.get("created_by") or "",
                    now,
                    data.get("published_at"),
                    json.dumps(data.get("audit_metadata")) if data.get("audit_metadata") else None,
                ],
            ).fetchone()
            con.commit()
        return _row_to_dict(row)

    def get_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            row = con.execute(
                f"SELECT {_COLUMNS} FROM process_template WHERE id = ?",
                [template_id],
            ).fetchone()
        return _row_to_dict(row) if row else None

    def list(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        with _connect() as con:
            rows = con.execute(
                f"SELECT {_COLUMNS} FROM process_template ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                [limit, offset],
            ).fetchall()
        return [_row_to_dict(row) for row in rows]

    def update(self, template_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        set_parts = []
        values = []
        for key, value in data.items():
            if key in ["name", "version", "status", "created_by"]:
                set_parts.append(f"{key} = ?")
                values.append(value)
            elif key in ["ui_model", "audit_metadata"]:
                set_parts.append(f"{key} = ?")
                values.append(json.dumps(value) if value else None)

        if not set_parts:
            return self.get_by_id(template_id)

        set_parts.append("updated_at = ?")
        values.append(datetime.utcnow())
        values.append(template_id)

        with _connect() as con:
            row = con.execute(
                f"""
                UPDATE process_template
                SET {", ".join(set_parts)}
                WHERE id = ?
                RETURNING {_COLUMNS}
                """,
                values,
            ).fetchone()
            con.commit()
        return _row_to_dict(row) if row else None

    def publish(self, template_id: str) -> Optional[Dict[str, Any]]:
        now = datetime.utcnow()
        with _connect() as con:
            row = con.execute(
                f"""
                UPDATE process_template
                SET status = 'published', published_at = ?, updated_at = ?
                WHERE id = ?
                RETURNING {_COLUMNS}
                """,
                [now, now, template_id],
            ).fetchone()
            con.commit()
        return _row_to_dict(row) if row else None
