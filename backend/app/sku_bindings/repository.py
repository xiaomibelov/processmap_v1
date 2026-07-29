"""E9.1/E9.4 — репозиторий sku_binding + pilot_metric_sample (pilot contour).

Модель статусов: draft → pilot → active → retired.
Работает поверх storage._connect (postgres/sqlite совместимо, паттерн kitchens).
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from ..storage import _connect

_BINDING_COLUMNS = (
    "id, recipe_id, recipe_version, kitchen_ids, pilot_kitchen_id, status, "
    "pilot_exit_criteria_json, valid_from, valid_to, created_by, created_at, updated_at"
)

VALID_STATUSES = ("draft", "pilot", "active", "retired")


def _json_field(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return None


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _row_to_binding(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "recipe_id": str(row.get("recipe_id") or ""),
        "recipe_version": row.get("recipe_version"),
        "kitchen_ids": _json_field(row.get("kitchen_ids")) or [],
        "pilot_kitchen_id": row.get("pilot_kitchen_id"),
        "status": row.get("status") or "draft",
        "pilot_exit_criteria_json": _json_field(row.get("pilot_exit_criteria_json")),
        "valid_from": _iso(row.get("valid_from")),
        "valid_to": _iso(row.get("valid_to")),
        "created_by": row.get("created_by"),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _row_to_sample(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "binding_id": str(row.get("binding_id") or ""),
        "ts": _iso(row.get("ts")),
        "orders_count": int(row.get("orders_count") or 0),
        "critical_errors": int(row.get("critical_errors") or 0),
        "defect_count": int(row.get("defect_count") or 0),
    }


class SkuBindingRepository:
    # ------------------------------------------------------------ reads
    def list(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with _connect() as con:
            if status:
                rows = con.execute(
                    f"SELECT {_BINDING_COLUMNS} FROM sku_binding WHERE status = ? "
                    "ORDER BY created_at DESC NULLS LAST, id",
                    [status],
                ).fetchall()
            else:
                rows = con.execute(
                    f"SELECT {_BINDING_COLUMNS} FROM sku_binding "
                    "ORDER BY created_at DESC NULLS LAST, id"
                ).fetchall()
            return [_row_to_binding(row) for row in rows]

    def get(self, binding_id: str) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            row = con.execute(
                f"SELECT {_BINDING_COLUMNS} FROM sku_binding WHERE id = ?",
                [binding_id],
            ).fetchone()
            return _row_to_binding(row) if row else None

    # ------------------------------------------------------------ writes
    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        binding_id = str(uuid.uuid4())
        kitchen_ids = [str(k) for k in (data.get("kitchen_ids") or [])]
        with _connect() as con:
            con.execute(
                "INSERT INTO sku_binding ("
                "id, recipe_id, recipe_version, kitchen_ids, status, "
                "pilot_exit_criteria_json, valid_from, valid_to, created_by, updated_at"
                ") VALUES (?, ?, ?, ?, 'draft', NULL, ?, ?, ?, NOW())",
                [
                    binding_id,
                    data.get("recipe_id"),
                    data.get("recipe_version"),
                    json.dumps(kitchen_ids, ensure_ascii=False),
                    data.get("valid_from"),
                    data.get("valid_to"),
                    data.get("created_by") or "",
                ],
            )
            con.commit()
        return self.get(binding_id)  # type: ignore[return-value]

    def start_pilot(self, binding_id: str, pilot_kitchen_id: str, criteria: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        binding = self.get(binding_id)
        if binding is None:
            return None
        kitchen_ids = list(dict.fromkeys([*binding["kitchen_ids"], pilot_kitchen_id]))
        with _connect() as con:
            con.execute(
                "UPDATE sku_binding SET status = 'pilot', pilot_kitchen_id = ?, "
                "pilot_exit_criteria_json = ?, kitchen_ids = ?, updated_at = NOW() "
                "WHERE id = ?",
                [
                    pilot_kitchen_id,
                    json.dumps(criteria, ensure_ascii=False),
                    json.dumps(kitchen_ids, ensure_ascii=False),
                    binding_id,
                ],
            )
            con.commit()
        return self.get(binding_id)

    def rollout(self, binding_id: str, extra_kitchen_ids: List[str]) -> Optional[Dict[str, Any]]:
        binding = self.get(binding_id)
        if binding is None:
            return None
        kitchen_ids = list(dict.fromkeys([*binding["kitchen_ids"], *[str(k) for k in extra_kitchen_ids]]))
        with _connect() as con:
            con.execute(
                "UPDATE sku_binding SET status = 'active', kitchen_ids = ?, updated_at = NOW() "
                "WHERE id = ?",
                [json.dumps(kitchen_ids, ensure_ascii=False), binding_id],
            )
            con.commit()
        return self.get(binding_id)

    def retire(self, binding_id: str) -> Optional[Dict[str, Any]]:
        with _connect() as con:
            con.execute(
                "UPDATE sku_binding SET status = 'retired', valid_to = NOW(), updated_at = NOW() "
                "WHERE id = ?",
                [binding_id],
            )
            con.commit()
        return self.get(binding_id)

    # ------------------------------------------------------------ metrics
    def add_sample(self, binding_id: str, orders: int, critical: int, defects: int) -> Dict[str, Any]:
        sample_id = str(uuid.uuid4())
        with _connect() as con:
            con.execute(
                "INSERT INTO pilot_metric_sample (id, binding_id, orders_count, critical_errors, defect_count) "
                "VALUES (?, ?, ?, ?, ?)",
                [sample_id, binding_id, int(orders), int(critical), int(defects)],
            )
            con.commit()
            row = con.execute(
                "SELECT id, binding_id, ts, orders_count, critical_errors, defect_count "
                "FROM pilot_metric_sample WHERE id = ?",
                [sample_id],
            ).fetchone()
        return _row_to_sample(row)

    def list_samples(self, binding_id: str) -> List[Dict[str, Any]]:
        with _connect() as con:
            rows = con.execute(
                "SELECT id, binding_id, ts, orders_count, critical_errors, defect_count "
                "FROM pilot_metric_sample WHERE binding_id = ? ORDER BY ts, id",
                [binding_id],
            ).fetchall()
            return [_row_to_sample(row) for row in rows]

    def totals(self, binding_id: str) -> Dict[str, int]:
        with _connect() as con:
            row = con.execute(
                "SELECT COALESCE(SUM(orders_count), 0) AS orders, "
                "COALESCE(SUM(critical_errors), 0) AS critical_errors, "
                "COALESCE(SUM(defect_count), 0) AS defect_count "
                "FROM pilot_metric_sample WHERE binding_id = ?",
                [binding_id],
            ).fetchone()
        return {
            "orders": int(row.get("orders") or 0),
            "critical_errors": int(row.get("critical_errors") or 0),
            "defect_count": int(row.get("defect_count") or 0),
        }

    # ------------------------------------------------------------ helpers
    def recipe_exists(self, recipe_id: str) -> bool:
        with _connect() as con:
            row = con.execute("SELECT id FROM recipe WHERE id = ?", [recipe_id]).fetchone()
            return row is not None

    def kitchen_exists(self, kitchen_id: str) -> bool:
        with _connect() as con:
            row = con.execute("SELECT id FROM kitchen WHERE id = ?", [kitchen_id]).fetchone()
            return row is not None
