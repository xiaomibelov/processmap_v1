"""E6.3 — реестр кухонь (Asset Registry v1).

Asset Registry v1 — контракт capabilities_json (свободный JSON v1;
контракт-словарь capability появится позже, locked decision):

    capabilities_json = {"capabilities": ["temperature_measurement", "heating", ...]}

Pre-check (E6.4) читает ТОЛЬКО список строк "capabilities" — остальные ключи
зарезервированы и игнорируются. Записи kitchen_equipment: (kitchen_id,
equipment_type_id) — составной PK; equipment_type_id ссылается на словарь
equipment-types (без FK в v1).
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from ..storage import _connect

_KITCHEN_COLUMNS = "id, name, location, status"


def _json_field(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return None


def _row_to_kitchen(row: Any, equipment: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "name": row.get("name") or "",
        "location": row.get("location") or "",
        "status": row.get("status") or "active",
        "equipment": equipment,
    }


class KitchenRepository:
    def _equipment_for(self, con: Any, kitchen_id: str) -> List[Dict[str, Any]]:
        rows = con.execute(
            "SELECT kitchen_id, equipment_type_id, capabilities_json "
            "FROM kitchen_equipment WHERE kitchen_id = ? ORDER BY equipment_type_id",
            [kitchen_id],
        ).fetchall()
        return [
            {
                "equipment_type_id": row.get("equipment_type_id") or "",
                "capabilities_json": _json_field(row.get("capabilities_json")) or {},
            }
            for row in rows
        ]

    def list_kitchens(self) -> List[Dict[str, Any]]:
        with _connect() as con:
            rows = con.execute(
                f"SELECT {_KITCHEN_COLUMNS} FROM kitchen ORDER BY name"
            ).fetchall()
            return [_row_to_kitchen(row, self._equipment_for(con, str(row.get("id") or ""))) for row in rows]

    def get_by_id(self, kitchen_id: str) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            row = con.execute(
                f"SELECT {_KITCHEN_COLUMNS} FROM kitchen WHERE id = ?",
                [kitchen_id],
            ).fetchone()
            if not row:
                return None
            return _row_to_kitchen(row, self._equipment_for(con, kitchen_id))

    def create(self, data: Dict[str, Any], equipment: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        kitchen_id = str(uuid.uuid4())
        with _connect() as con:
            con.execute(
                f"INSERT INTO kitchen ({_KITCHEN_COLUMNS}) VALUES (?, ?, ?, ?)",
                [
                    kitchen_id,
                    data.get("name") or "",
                    data.get("location") or "",
                    data.get("status") or "active",
                ],
            )
            self._replace_equipment(con, kitchen_id, equipment or [])
            con.commit()
        return self.get_by_id(kitchen_id)  # type: ignore[return-value]

    def _replace_equipment(self, con: Any, kitchen_id: str, items: List[Dict[str, Any]]) -> None:
        con.execute("DELETE FROM kitchen_equipment WHERE kitchen_id = ?", [kitchen_id])
        for item in items:
            type_id = str((item or {}).get("equipment_type_id") or "").strip()
            if not type_id:
                continue
            caps = (item or {}).get("capabilities_json") or {}
            con.execute(
                "INSERT INTO kitchen_equipment (kitchen_id, equipment_type_id, capabilities_json) "
                "VALUES (?, ?, ?)",
                [kitchen_id, type_id, json.dumps(caps, ensure_ascii=False)],
            )

    def replace_equipment(self, kitchen_id: str, items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            row = con.execute(
                "SELECT id FROM kitchen WHERE id = ?",
                [kitchen_id],
            ).fetchone()
            if not row:
                return None
            self._replace_equipment(con, kitchen_id, items)
            con.commit()
        return self.get_by_id(kitchen_id)
