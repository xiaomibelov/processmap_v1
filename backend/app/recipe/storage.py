from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from ..storage import _db_path


def _recipe_id() -> str:
    return f"rcp_{uuid.uuid4().hex[:12]}"


def _ingredient_id() -> str:
    return f"ing_{uuid.uuid4().hex[:12]}"


def _recipe_ingredient_id() -> str:
    return f"rcpi_{uuid.uuid4().hex[:12]}"


def _calculation_id() -> str:
    return f"rcc_{uuid.uuid4().hex[:12]}"


def _now() -> int:
    return int(time.time())


def _get_connection() -> sqlite3.Connection:
    con = sqlite3.connect(str(_db_path()))
    con.row_factory = sqlite3.Row
    _ensure_recipe_tables(con)
    return con


def _ensure_recipe_tables(con: sqlite3.Connection) -> None:
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_ingredient_catalog (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL DEFAULT 'org_default',
          name TEXT NOT NULL,
          unit TEXT NOT NULL DEFAULT '',
          value REAL,
          created_by TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0,
          deleted_at INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    con.execute(
        "CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_catalog_org ON recipe_ingredient_catalog(org_id, name)"
    )
    # Idempotent migration for existing DBs that predate the `value` column.
    # Tolerate the "column already present" error from both SQLite
    # (sqlite3.OperationalError: "duplicate column name: ...") and Postgres
    # (psycopg.errors.DuplicateColumn: 'column ... already exists').
    # psycopg is not imported here (sqlite-only deployments may not have it),
    # so we match on the error message instead of the exception type.
    # Anything that is not a duplicate-column error is re-raised.
    try:
        con.execute("ALTER TABLE recipe_ingredient_catalog ADD COLUMN value REAL")
    except Exception as exc:
        msg = str(exc).lower()
        if "duplicate column" not in msg and "already exists" not in msg:
            raise
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY,
          org_id TEXT NOT NULL DEFAULT 'org_default',
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          base_portions INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0,
          deleted_at INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    con.execute(
        "CREATE INDEX IF NOT EXISTS idx_recipes_org ON recipes(org_id, name)"
    )
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_ingredients (
          id TEXT PRIMARY KEY,
          recipe_id TEXT NOT NULL,
          ingredient_id TEXT NOT NULL,
          quantity REAL NOT NULL DEFAULT 0,
          unit TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        )
        """
    )
    con.execute(
        "CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id)"
    )
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS recipe_calculations (
          id TEXT PRIMARY KEY,
          recipe_id TEXT NOT NULL,
          base_portions INTEGER NOT NULL DEFAULT 1,
          target_portions INTEGER NOT NULL DEFAULT 1,
          coefficient REAL NOT NULL DEFAULT 1,
          results_json TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
        )
        """
    )
    con.execute(
        "CREATE INDEX IF NOT EXISTS idx_recipe_calculations_recipe ON recipe_calculations(recipe_id)"
    )


def _row_to_ingredient(row: sqlite3.Row) -> Dict[str, Any]:
    raw_value = row["value"] if "value" in row.keys() else None
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "name": str(row["name"]),
        "unit": str(row["unit"]),
        "value": float(raw_value) if raw_value is not None else None,
        "created_by": str(row["created_by"]),
        "created_at": int(row["created_at"]),
        "updated_at": int(row["updated_at"]),
    }


def _row_to_recipe(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "name": str(row["name"]),
        "description": str(row["description"]),
        "base_portions": int(row["base_portions"]),
        "created_by": str(row["created_by"]),
        "created_at": int(row["created_at"]),
        "updated_at": int(row["updated_at"]),
    }


def _load_recipe_ingredients(con: sqlite3.Connection, recipe_id: str) -> List[Dict[str, Any]]:
    rows = con.execute(
        """
        SELECT ri.*, i.name AS ingredient_name, i.unit AS ingredient_unit
        FROM recipe_ingredients ri
        JOIN recipe_ingredient_catalog i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.sort_order, ri.created_at
        """,
        [recipe_id],
    ).fetchall()
    out = []
    for row in rows:
        out.append(
            {
                "id": str(row["id"]),
                "ingredient_id": str(row["ingredient_id"]),
                "quantity": float(row["quantity"]),
                "unit": str(row["unit"]),
                "sort_order": int(row["sort_order"]),
                "ingredient": {
                    "id": str(row["ingredient_id"]),
                    "org_id": "",
                    "name": str(row["ingredient_name"]),
                    "unit": str(row["ingredient_unit"]),
                    "created_by": "",
                    "created_at": 0,
                    "updated_at": 0,
                },
            }
        )
    return out


def list_ingredients(org_id: str) -> List[Dict[str, Any]]:
    with _get_connection() as con:
        rows = con.execute(
            """
            SELECT * FROM recipe_ingredient_catalog
            WHERE org_id = ? AND deleted_at = 0
            ORDER BY name
            """,
            [org_id],
        ).fetchall()
        return [_row_to_ingredient(row) for row in rows]


def get_ingredient_values_by_name(org_id: str) -> Dict[str, float]:
    """Bulk {lowercased name: numeric value} map for analytics backfill.

    Single query, single connection. Ingredients without a numeric value are
    omitted so callers can distinguish "catalog has it" from "no data".
    """
    with _get_connection() as con:
        rows = con.execute(
            """
            SELECT name, value FROM recipe_ingredient_catalog
            WHERE org_id = ? AND deleted_at = 0 AND value IS NOT NULL
            """,
            [org_id],
        ).fetchall()
    out: Dict[str, float] = {}
    for row in rows:
        key = str(row["name"] or "").strip().lower()
        if key:
            out[key] = float(row["value"])
    return out


def get_ingredient(ingredient_id: str, org_id: str) -> Optional[Dict[str, Any]]:
    with _get_connection() as con:
        row = con.execute(
            "SELECT * FROM recipe_ingredient_catalog WHERE id = ? AND org_id = ? AND deleted_at = 0",
            [ingredient_id, org_id],
        ).fetchone()
        return _row_to_ingredient(row) if row else None


def create_ingredient(data: Dict[str, Any], org_id: str, user_id: str) -> Dict[str, Any]:
    ingredient_id = _ingredient_id()
    now = _now()
    raw_value = data.get("value")
    value = float(raw_value) if raw_value not in (None, "") else None
    with _get_connection() as con:
        con.execute(
            """
            INSERT INTO recipe_ingredient_catalog (id, org_id, name, unit, value, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ingredient_id,
                org_id,
                str(data.get("name") or "").strip(),
                str(data.get("unit") or "").strip(),
                value,
                user_id,
                now,
                now,
            ],
        )
        con.commit()
        row = con.execute("SELECT * FROM recipe_ingredient_catalog WHERE id = ?", [ingredient_id]).fetchone()
        return _row_to_ingredient(row)


def list_recipes(org_id: str) -> List[Dict[str, Any]]:
    with _get_connection() as con:
        rows = con.execute(
            """
            SELECT * FROM recipes
            WHERE org_id = ? AND deleted_at = 0
            ORDER BY name
            """,
            [org_id],
        ).fetchall()
        out = [_row_to_recipe(row) for row in rows]
        for item in out:
            item["ingredients"] = _load_recipe_ingredients(con, item["id"])
        return out


def get_recipe(recipe_id: str, org_id: str) -> Optional[Dict[str, Any]]:
    with _get_connection() as con:
        row = con.execute(
            "SELECT * FROM recipes WHERE id = ? AND org_id = ? AND deleted_at = 0",
            [recipe_id, org_id],
        ).fetchone()
        if not row:
            return None
        recipe = _row_to_recipe(row)
        recipe["ingredients"] = _load_recipe_ingredients(con, recipe_id)
        return recipe


def _set_recipe_ingredients(
    con: sqlite3.Connection, recipe_id: str, ingredients: List[Dict[str, Any]]
) -> None:
    con.execute("DELETE FROM recipe_ingredients WHERE recipe_id = ?", [recipe_id])
    for idx, item in enumerate(ingredients or []):
        ingredient_id = str(item.get("ingredient_id") or "").strip()
        if not ingredient_id:
            continue
        con.execute(
            """
            INSERT INTO recipe_ingredients
            (id, recipe_id, ingredient_id, quantity, unit, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                _recipe_ingredient_id(),
                recipe_id,
                ingredient_id,
                float(item.get("quantity") or 0),
                str(item.get("unit") or "").strip(),
                int(item.get("sort_order", idx)),
                _now(),
            ],
        )


def create_recipe(data: Dict[str, Any], org_id: str, user_id: str) -> Dict[str, Any]:
    recipe_id = _recipe_id()
    now = _now()
    with _get_connection() as con:
        con.execute(
            """
            INSERT INTO recipes
            (id, org_id, name, description, base_portions, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                recipe_id,
                org_id,
                str(data.get("name") or "").strip(),
                str(data.get("description") or "").strip(),
                max(1, int(data.get("base_portions") or 1)),
                user_id,
                now,
                now,
            ],
        )
        _set_recipe_ingredients(con, recipe_id, data.get("ingredients") or [])
        con.commit()
        return get_recipe(recipe_id, org_id)


def update_recipe(
    recipe_id: str, data: Dict[str, Any], org_id: str, user_id: str
) -> Optional[Dict[str, Any]]:
    with _get_connection() as con:
        row = con.execute(
            "SELECT * FROM recipes WHERE id = ? AND org_id = ? AND deleted_at = 0",
            [recipe_id, org_id],
        ).fetchone()
        if not row:
            return None
        now = _now()
        name = data.get("name")
        description = data.get("description")
        base_portions = data.get("base_portions")
        updates = []
        params: List[Any] = []
        if name is not None:
            updates.append("name = ?")
            params.append(str(name).strip())
        if description is not None:
            updates.append("description = ?")
            params.append(str(description).strip())
        if base_portions is not None:
            updates.append("base_portions = ?")
            params.append(max(1, int(base_portions)))
        if updates:
            updates.append("updated_at = ?")
            params.append(now)
            params.append(recipe_id)
            params.append(org_id)
            con.execute(
                f"UPDATE recipes SET {', '.join(updates)} WHERE id = ? AND org_id = ?",
                params,
            )
        if "ingredients" in data:
            _set_recipe_ingredients(con, recipe_id, data["ingredients"] or [])
        con.commit()
        return get_recipe(recipe_id, org_id)


def delete_recipe(recipe_id: str, org_id: str) -> bool:
    with _get_connection() as con:
        row = con.execute(
            "SELECT id FROM recipes WHERE id = ? AND org_id = ? AND deleted_at = 0",
            [recipe_id, org_id],
        ).fetchone()
        if not row:
            return False
        con.execute(
            "UPDATE recipes SET deleted_at = ? WHERE id = ? AND org_id = ?",
            [_now(), recipe_id, org_id],
        )
        con.commit()
        return True


def calculate_recipe(
    recipe_id: str, target_portions: int, org_id: str, user_id: str
) -> Optional[Dict[str, Any]]:
    recipe = get_recipe(recipe_id, org_id)
    if not recipe:
        return None
    base_portions = max(1, int(recipe.get("base_portions") or 1))
    coefficient = target_portions / base_portions
    results: List[Dict[str, Any]] = []
    for ri in recipe.get("ingredients") or []:
        ingredient = ri.get("ingredient") or {}
        base_quantity = float(ri.get("quantity") or 0)
        results.append(
            {
                "ingredient_id": str(ri.get("ingredient_id") or ""),
                "name": str(ingredient.get("name") or ""),
                "unit": str(ingredient.get("unit") or ri.get("unit") or ""),
                "base_quantity": base_quantity,
                "target_quantity": round(base_quantity * coefficient, 6),
            }
        )
    calc_id = _calculation_id()
    now = _now()
    with _get_connection() as con:
        con.execute(
            """
            INSERT INTO recipe_calculations
            (id, recipe_id, base_portions, target_portions, coefficient, results_json, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                calc_id,
                recipe_id,
                base_portions,
                target_portions,
                coefficient,
                json.dumps(results, ensure_ascii=False),
                user_id,
                now,
            ],
        )
        con.commit()
    return {
        "id": calc_id,
        "recipe_id": recipe_id,
        "base_portions": base_portions,
        "target_portions": target_portions,
        "coefficient": coefficient,
        "results": results,
        "created_by": user_id,
        "created_at": now,
    }
