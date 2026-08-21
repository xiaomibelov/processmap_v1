"""E5 — словарь параметров рецепта (recipe_param_def) + валидация + анализ блоков.

Словарь хранится в БД (editable через API), не хардкод. Валидация
``parameters_json`` рецепта выполняется по определениям из словаря:
диапазоны number/int, допустимые значения enum, коды справочника dict_ref.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from ..storage import _connect

_COLUMNS = "name, type, unit, min, max, enum_json, dict_ref"

ALLOWED_DEF_TYPES = {"number", "int", "enum", "dict_ref", "string"}

# dict_ref → таблица справочника (whitelist, чтобы не было произвольного SQL)
_DICT_TABLES = {
    "container-types": "container_types",
    "equipment-types": "equipment_types",
    "zone-types": "zone_types",
}


def _json_field(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return None


def _row_to_def(row: Any) -> Dict[str, Any]:
    return {
        "name": row.get("name"),
        "type": row.get("type"),
        "unit": row.get("unit"),
        "min": row.get("min"),
        "max": row.get("max"),
        "enum_json": _json_field(row.get("enum_json")),
        "dict_ref": row.get("dict_ref"),
    }


def list_param_defs() -> List[Dict[str, Any]]:
    with _connect() as con:
        rows = con.execute(
            f"SELECT {_COLUMNS} FROM recipe_param_def ORDER BY name"
        ).fetchall()
    return [_row_to_def(row) for row in rows]


def get_param_def(name: str) -> Optional[Dict[str, Any]]:
    with _connect() as con:
        row = con.execute(
            f"SELECT {_COLUMNS} FROM recipe_param_def WHERE name = ?",
            [name],
        ).fetchone()
    return _row_to_def(row) if row else None


def validate_def_payload(data: Dict[str, Any]) -> List[str]:
    """Валидация правки определения параметра. Возвращает список ошибок (ru)."""
    errors: List[str] = []
    ptype = data.get("type")
    if ptype is not None and ptype not in ALLOWED_DEF_TYPES:
        errors.append(
            f"тип параметра «{ptype}» не поддерживается; допустимые: {', '.join(sorted(ALLOWED_DEF_TYPES))}"
        )
    pmin = data.get("min")
    pmax = data.get("max")
    if pmin is not None and pmax is not None and float(pmin) > float(pmax):
        errors.append(f"min={pmin} больше max={pmax}")
    enum_values = data.get("enum_json")
    if enum_values is not None and not (
        isinstance(enum_values, list) and all(isinstance(v, str) for v in enum_values)
    ):
        errors.append("enum_json должен быть списком строк")
    dict_ref = data.get("dict_ref")
    if dict_ref is not None and dict_ref not in _DICT_TABLES:
        errors.append(
            f"dict_ref «{dict_ref}» неизвестен; допустимые: {', '.join(sorted(_DICT_TABLES))}"
        )
    return errors


def update_param_def(name: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    set_parts = []
    values = []
    for key in ("type", "unit", "min", "max", "dict_ref"):
        if key in data:
            set_parts.append(f"{key} = ?")
            values.append(data[key])
    if "enum_json" in data:
        set_parts.append("enum_json = ?")
        values.append(json.dumps(data.get("enum_json")) if data.get("enum_json") is not None else None)
    if not set_parts:
        return get_param_def(name)
    values.append(name)
    with _connect() as con:
        row = con.execute(
            f"""
            UPDATE recipe_param_def
            SET {", ".join(set_parts)}
            WHERE name = ?
            RETURNING {_COLUMNS}
            """,
            values,
        ).fetchone()
        con.commit()
    return _row_to_def(row) if row else None


def _dict_codes(dict_ref: str) -> List[str]:
    table = _DICT_TABLES.get(str(dict_ref or ""))
    if not table:
        return []
    with _connect() as con:
        rows = con.execute(f"SELECT code FROM {table} ORDER BY code").fetchall()
    return [str(row.get("code") or "") for row in rows]


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_parameters(parameters: Dict[str, Any], defs: Optional[List[Dict[str, Any]]] = None) -> List[str]:
    """Проверка parameters_json по словарю. Возвращает список ошибок (ru)."""
    if defs is None:
        defs = list_param_defs()
    by_name = {str(d.get("name")): d for d in defs}
    errors: List[str] = []
    for name, value in (parameters or {}).items():
        pdef = by_name.get(str(name))
        if pdef is None:
            errors.append(f"неизвестный параметр рецепта: {name}")
            continue
        ptype = str(pdef.get("type") or "")
        unit = str(pdef.get("unit") or "").strip()
        unit_suffix = f" {unit}" if unit else ""
        if ptype in ("number", "int"):
            if not _is_number(value):
                errors.append(f"{name}={value!r} должен быть числом{unit_suffix}")
                continue
            if ptype == "int" and not float(value).is_integer():
                errors.append(f"{name}={value} должен быть целым числом{unit_suffix}")
                continue
            pmin = pdef.get("min")
            pmax = pdef.get("max")
            if pmin is not None and float(value) < float(pmin) or pmax is not None and float(value) > float(pmax):
                lo = _fmt_bound(pmin)
                hi = _fmt_bound(pmax)
                errors.append(f"{name}={_fmt_bound(value)} вне диапазона {lo}–{hi}{unit_suffix}")
        elif ptype == "enum":
            allowed = [str(v) for v in (pdef.get("enum_json") or [])]
            if str(value) not in allowed:
                errors.append(
                    f"{name}={value} не входит в допустимые значения: {', '.join(allowed)}"
                )
        elif ptype == "dict_ref":
            codes = _dict_codes(str(pdef.get("dict_ref") or ""))
            if codes and str(value) not in codes:
                errors.append(
                    f"{name}={value} отсутствует в справочнике {pdef.get('dict_ref')} "
                    f"(допустимые: {', '.join(codes)})"
                )
    return errors


def _fmt_bound(value: Any) -> str:
    if value is None:
        return "…"
    try:
        f = float(value)
        return str(int(f)) if f.is_integer() else str(f)
    except (TypeError, ValueError):
        return str(value)


# ---------- анализ связки рецепт ↔ блоки шаблона (E5.3/E5.5) ------------------


def collect_required_params(ui_model: Optional[Dict[str, Any]]) -> List[str]:
    """Все recipe_params, упомянутые в блоках ui_model шаблона (sorted unique)."""
    required = set()
    for node in (ui_model or {}).get("nodes") or []:
        for name in node.get("recipe_params") or []:
            name = str(name or "").strip()
            if name:
                required.add(name)
    return sorted(required)


def analyze_blocks(ui_model: Optional[Dict[str, Any]], parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Анализ «используется в блоках» для рецепта.

    Возвращает блоки шаблона, ссылающиеся на recipe_params, с подсветкой
    параметров, отсутствующих в parameters_json рецепта, а также список
    неиспользуемых переменных рецепта.
    """
    provided = set((parameters or {}).keys())
    required = collect_required_params(ui_model)
    blocks: List[Dict[str, Any]] = []
    for node in (ui_model or {}).get("nodes") or []:
        refs = [str(n) for n in (node.get("recipe_params") or []) if str(n or "").strip()]
        if not refs:
            continue
        missing = [n for n in refs if n not in provided]
        blocks.append(
            {
                "node_id": str(node.get("id") or ""),
                "node_name": str(node.get("display_name") or node.get("name") or node.get("id") or ""),
                "operation_code": str(node.get("operation_code") or ""),
                "recipe_params": refs,
                "missing_params": missing,
            }
        )
    used = {p for block in blocks for p in block["recipe_params"]}
    return {
        "required_params": required,
        "missing_params": [p for p in required if p not in provided],
        "unused_params": sorted(provided - used),
        "blocks": blocks,
    }
