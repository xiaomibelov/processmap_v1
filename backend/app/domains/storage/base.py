"""Generic CRUD layer for storage domains.

Function-based (not class-based) by design: all storage repositories are
module-level function collections operating on a shared sqlite/psycopg
connection from ``compat.repository``. Public signatures of domain
repositories do not change; only function bodies delegate here.

SQL behaviour contract (must match pre-refactor code exactly):
- placeholders are ``?`` (translated for postgres by compat layer);
- INSERT is followed by an explicit re-select on the primary key
  (no RETURNING anywhere in the domain);
- timestamps are int epoch seconds via ``now_ts()``;
- JSON columns are serialized with ``_json_dumps`` and deserialized
  with ``_json_loads`` from compat.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from .compat.repository import _json_dumps
from .compat.repository import _json_loads
from .compat.repository import _now_ts

__all__ = [
    "IDENT_RE",
    "check_ident",
    "gen_id",
    "now_ts",
    "json_dumps",
    "json_loads",
    "row_to_dict",
    "build_where",
    "get_by_id",
    "insert",
    "reselect",
    "update_fields",
    "hard_delete",
    "list_page",
    "count",
]

Mapper = Callable[[Any], Dict[str, Any]]

IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")


def check_ident(name: str) -> str:
    """Validate a SQL identifier (table/column, optionally alias-qualified
    like ``c.id``). Identifiers cannot be bound as params."""
    if not isinstance(name, str) or not IDENT_RE.match(name):
        raise ValueError(f"unsafe SQL identifier: {name!r}")
    return name


def gen_id(prefix: str = "") -> str:
    raw = uuid.uuid4().hex[:12]
    return f"{prefix}{raw}" if prefix else raw


def now_ts() -> int:
    return _now_ts()


def json_dumps(value: Any, fallback: Any = None) -> str:
    return _json_dumps(value, fallback)


def json_loads(value: Any, fallback: Any = None) -> Any:
    return _json_loads(value, fallback)


def row_to_dict(
    row: Any,
    *,
    json_cols: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    """dict(row) with optional JSON deserialization/rename.

    ``json_cols`` maps a source column (``meta_json``) to the payload key
    (``meta``): the source key is popped, the fallback for parsing is the
    already-present destination value (or None).
    """
    payload: Dict[str, Any] = dict(row)
    for src, dst in (json_cols or {}).items():
        if src in payload:
            payload[dst] = _json_loads(payload.pop(src), payload.get(dst))
    return payload


def build_where(
    eq: Optional[Mapping[str, Any]] = None,
    *,
    org_id: Optional[str] = None,
    org_required: bool = False,
    soft_delete: bool = False,
    range_cols: Optional[Mapping[str, Tuple[Any, Any]]] = None,
    like_cols: Optional[Mapping[str, str]] = None,
    extra: str = "",
    extra_params: Sequence[Any] = (),
) -> Tuple[str, List[Any]]:
    """Build a WHERE fragment plus params.

    Piece order is deterministic: eq (insertion order) -> org_id ->
    soft_delete (``deleted_at = 0``) -> range (per column: >= then <=) ->
    like -> extra. Empty result returns ("", []).
    """
    clauses: List[str] = []
    params: List[Any] = []
    if eq:
        for col, val in eq.items():
            clauses.append(f"{check_ident(col)} = ?")
            params.append(val)
    if org_id is not None:
        clauses.append("org_id = ?")
        params.append(org_id)
    elif org_required:
        raise ValueError("org_id is required for this query")
    if soft_delete:
        clauses.append("deleted_at = 0")
    if range_cols:
        for col, (lo, hi) in range_cols.items():
            check_ident(col)
            if lo is not None:
                clauses.append(f"{col} >= ?")
                params.append(lo)
            if hi is not None:
                clauses.append(f"{col} <= ?")
                params.append(hi)
    if like_cols:
        for col, val in like_cols.items():
            clauses.append(f"{check_ident(col)} LIKE ?")
            params.append(val)
    if extra:
        clauses.append(f"({extra})")
        params.extend(extra_params)
    if not clauses:
        return "", params
    return " WHERE " + " AND ".join(clauses), params


def _apply_mapper(mapper: Optional[Mapper], row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    if mapper is None:
        return dict(row)
    return mapper(row)


def get_by_id(
    con: Any,
    table: str,
    key: str,
    value: Any,
    *,
    org_id: Optional[str] = None,
    soft_delete: bool = False,
    mapper: Optional[Mapper] = None,
    extra: str = "",
    extra_params: Sequence[Any] = (),
) -> Optional[Dict[str, Any]]:
    where, params = build_where(
        {key: value}, org_id=org_id, soft_delete=soft_delete,
        extra=extra, extra_params=extra_params,
    )
    row = con.execute(f"SELECT * FROM {check_ident(table)}{where} LIMIT 1", params).fetchone()
    return _apply_mapper(mapper, row)


def insert(con: Any, table: str, values: Mapping[str, Any], *, commit: bool = True) -> None:
    cols = list(values.keys())
    for col in cols:
        check_ident(col)
    sql = (
        f"INSERT INTO {check_ident(table)} ({', '.join(cols)}) "
        f"VALUES ({', '.join('?' for _ in cols)})"
    )
    con.execute(sql, [values[col] for col in cols])
    if commit:
        con.commit()


def reselect(
    con: Any,
    table: str,
    key: str,
    value: Any,
    *,
    org_id: Optional[str] = None,
    mapper: Optional[Mapper] = None,
) -> Optional[Dict[str, Any]]:
    return get_by_id(con, table, key, value, org_id=org_id, mapper=mapper)


def update_fields(
    con: Any,
    table: str,
    fields: Mapping[str, Any],
    where: Mapping[str, Any],
    *,
    commit: bool = True,
) -> int:
    """Dynamic ``UPDATE ... SET k = ? ...`` by dicts; returns rowcount."""
    if not fields:
        return 0
    sets: List[str] = []
    params: List[Any] = []
    for col, val in fields.items():
        sets.append(f"{check_ident(col)} = ?")
        params.append(val)
    where_sql, where_params = build_where(where)
    if not where_sql:
        raise ValueError("update_fields requires a non-empty where")
    sql = f"UPDATE {check_ident(table)} SET {', '.join(sets)}{where_sql}"
    cur = con.execute(sql, params + where_params)
    if commit:
        con.commit()
    return int(getattr(cur, "rowcount", 0) or 0)


def hard_delete(con: Any, table: str, where: Mapping[str, Any], *, commit: bool = True) -> bool:
    where_sql, params = build_where(where)
    if not where_sql:
        raise ValueError("hard_delete requires a non-empty where")
    cur = con.execute(f"DELETE FROM {check_ident(table)}{where_sql}", params)
    if commit:
        con.commit()
    return int(getattr(cur, "rowcount", 0) or 0) > 0


def list_page(
    con: Any,
    table: str,
    *,
    where: str = "",
    params: Sequence[Any] = (),
    order_by: str = "ts",
    order_dir: str = "DESC",
    limit: int = 100,
    offset: int = 0,
    mapper: Optional[Mapper] = None,
) -> List[Dict[str, Any]]:
    direction = "ASC" if str(order_dir).upper() == "ASC" else "DESC"
    sql = (
        f"SELECT * FROM {check_ident(table)}{where} "
        f"ORDER BY {check_ident(order_by)} {direction} LIMIT ? OFFSET ?"
    )
    rows = con.execute(sql, [*params, int(limit), int(offset)]).fetchall()
    return [_apply_mapper(mapper, row) for row in rows]


def count(con: Any, table: str, *, where: str = "", params: Sequence[Any] = ()) -> int:
    row = con.execute(
        f"SELECT COUNT(*) AS n FROM {check_ident(table)}{where}", list(params)
    ).fetchone()
    return int(row["n"] if row is not None else 0)
