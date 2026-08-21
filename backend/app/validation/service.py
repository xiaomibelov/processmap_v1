"""E6.1 — сервис валидации ui_model (dry-run).

Единая точка входа: ``validate_ui_model(ui_model, *, catalog=None,
check_reachability=True) -> {"summary", "findings", "draft_entities"}``.

Правила (см. docs/e6/rules_coverage.md):
  R1 operation_code каждой задачи — из каталога (статический список v0.3,
     когда каталог не передан);
  R2 params по parameter_schema каталога (обязательные присутствуют, типы);
  R3 все ``*_ref`` объявлены в process_entities / recipe_context;
  R4 move: object_ref+target_ref; transfer: source_container_ref+
     target_container_ref (через схемы каталога, R2; статический страж —
     когда запись каталога не содержит схемы);
  R5 условия шлюзов — только из объявленных outputs задач
     (семантика GATEWAY_CONDITION_UNKNOWN_OUTPUT из bpmn_import);
  R6 достижимость: каждый узел достижим из старта (link-catch события —
     дополнительные корни); каждый путь завершается endEvent или
     link-throw рестартом;
  R7 нет значений-заглушек ("-" / null) в params.

Разделение ответственности (E6.1 REFACTOR):
  - импорт (process_template/bpmn_import.py) занимается ПАРСИНГОМ XML и
    import-специфичными dialect/legacy findings (LEGACY_*, DOLLAR_SUBSTITUTION,
    RECIPE_CONTEXT_PREFIX, UNKNOWN_CAMUNDA_PROPERTY, EMPTY_DISPLAY_NAME,
    MISSING_PROCESS_METADATA, MISSING_RECIPE_CONTEXT, MULTIPLE_PROCESSES,
    PLACEHOLDER_VALUE для не-params camunda-ключей), а проверки правил
    R1/R3/R5 делегирует этому сервису (check_reachability=False — исторически
    импорт не проверял достижимость);
  - transformation/pipeline.validate_draft_ui_model также делегирует сюда;
  - конструктор (frontend) держит клиентскую подсветку недостижимых узлов
    (modelUtils.computeReachable) с той же семантикой корней — ⚠ известное
    дублирование R6 на клиенте, см. docs/e6/rules_coverage.md.

Контракт finding (E6.2, совместим с E3): {severity, code, message (RU),
element_id, element_name, recommendation}.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Operation catalog (v0.3) — статический fallback, когда каталог БД не передан.
# package_meal явно запрещён.
ALLOWED_OPERATION_CODES = {
    "get_from_storage",
    "move",
    "hold",
    "open_equipment",
    "close_equipment",
    "set_equipment",
    "start_equipment",
    "wait",
    "open_container",
    "close_container",
    "transfer",
    "measure_temperature",
    "check",
    "publish_event",
}
FORBIDDEN_OPERATION_CODES = {"package_meal"}

# Legacy task types — task-like для валидации (сам тип помечает импорт).
LEGACY_TASK_TYPES = {
    "userTask",
    "manualTask",
    "receiveTask",
    "serviceTask",
    "sendTask",
    "scriptTask",
    "businessRuleTask",
}

_TASK_LIKE = {"task"} | LEGACY_TASK_TYPES
_ENTITY_CATEGORIES = ("containers", "equipment", "zones")

# R4 — обязательные *_ref параметры move/transfer. Основной путь контроля —
# parameter_schema каталога (R2); эта таблица — статический страж на случай,
# когда запись каталога не содержит схемы.
STATIC_REQUIRED_PARAMS: Dict[str, Tuple[str, ...]] = {
    "move": ("object_ref", "target_ref"),
    "transfer": ("source_container_ref", "target_container_ref"),
}

# R7 — значения-заглушки в params.
PLACEHOLDER_VALUES = {"-"}

_DOLLAR_RE = re.compile(r"\$\{([^}]*)\}")
_IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_CONDITION_KEYWORDS = {"true", "false", "and", "or", "not", "null", "none"}


# ---------------------------------------------------------------------------
# shared helpers (re-exported через bpmn_import для обратной совместимости)
# ---------------------------------------------------------------------------

def _declared_refs(process_entities: Dict[str, Any], recipe_context: Dict[str, Any]) -> set:
    refs = set()
    for category in _ENTITY_CATEGORIES:
        entries = (process_entities or {}).get(category) or {}
        if isinstance(entries, dict):
            refs.update(str(k) for k in entries.keys())
    refs.update(str(k) for k in (recipe_context or {}).keys())
    return refs


def _guess_category(param_key: str) -> str:
    key = param_key.lower()
    if "equipment" in key:
        return "equipment"
    if "container" in key or key in ("item_ref", "object_ref"):
        return "containers"
    if "zone" in key or key in ("target_ref", "source_ref"):
        return "zones"
    return "zones"


def _condition_identifiers(condition: str) -> List[str]:
    """Extract candidate output identifiers from a conditionExpression."""
    inner = _DOLLAR_RE.sub(lambda m: f" {m.group(1)} ", condition)
    identifiers = []
    for token in _IDENTIFIER_RE.findall(inner):
        if token.lower() in _CONDITION_KEYWORDS:
            continue
        identifiers.append(token)
    return identifiers


# ---------------------------------------------------------------------------
# catalog normalization / DB loading
# ---------------------------------------------------------------------------

def _json_field(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return None


def normalize_catalog(catalog: Any) -> Optional[Dict[str, Dict[str, Any]]]:
    """Привести каталог к виду {code: {parameter_schema, allowed_outputs, resource_requirements}}."""
    if catalog is None:
        return None
    items: Iterable[Any]
    if isinstance(catalog, dict):
        items = [
            {**(v if isinstance(v, dict) else {}), "code": k}
            for k, v in catalog.items()
        ]
    else:
        items = catalog
    out: Dict[str, Dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "").strip()
        if not code:
            continue
        out[code] = {
            "code": code,
            "name": item.get("name") or "",
            "parameter_schema": _json_field(item.get("parameter_schema")) or {},
            "allowed_outputs": _json_field(item.get("allowed_outputs")) or [],
            "resource_requirements": _json_field(item.get("resource_requirements")) or {},
            "category": item.get("category") or "",
        }
    return out


def load_catalog_from_db() -> Dict[str, Dict[str, Any]]:
    """Каталог операций из БД (operation_catalog)."""
    from ..storage import _connect  # локальный импорт: избегаем циклов

    with _connect() as con:
        rows = con.execute(
            "SELECT code, name, parameter_schema, allowed_outputs, resource_requirements, category "
            "FROM operation_catalog"
        ).fetchall()
    return normalize_catalog(
        [
            {
                "code": row.get("code"),
                "name": row.get("name"),
                "parameter_schema": row.get("parameter_schema"),
                "allowed_outputs": row.get("allowed_outputs"),
                "resource_requirements": row.get("resource_requirements"),
                "category": row.get("category"),
            }
            for row in rows
        ]
    ) or {}


# ---------------------------------------------------------------------------
# findings
# ---------------------------------------------------------------------------

class _Findings:
    def __init__(self) -> None:
        self.items: List[Dict[str, Any]] = []

    def add(self, severity: str, code: str, element_id: str, message: str,
            recommendation: str = "", element_name: str = "") -> None:
        self.items.append(
            {
                "severity": severity,
                "code": code,
                "element_id": element_id or "",
                "element_name": element_name or "",
                "message": message,
                "recommendation": recommendation,
            }
        )

    def error(self, code: str, element_id: str, message: str,
              recommendation: str = "", element_name: str = "") -> None:
        self.add("error", code, element_id, message, recommendation, element_name)

    def warning(self, code: str, element_id: str, message: str,
                recommendation: str = "", element_name: str = "") -> None:
        self.add("warning", code, element_id, message, recommendation, element_name)


def _node_name(node: Dict[str, Any]) -> str:
    return str(node.get("display_name") or node.get("name") or "")


def _is_link_throw(node: Dict[str, Any]) -> bool:
    """intermediateThrowEvent, завершающий путь (link-throw рестарт).

    Если парсер записал event_definitions — требуем linkEventDefinition;
    для моделей, собранных вручную (без event_definitions), любой
    intermediateThrowEvent считаем link-throw (эвристика, см. rules_coverage).
    """
    if str(node.get("bpmn_type") or "") != "intermediateThrowEvent":
        return False
    defs = node.get("event_definitions")
    if not defs:
        return True
    return "linkEventDefinition" in defs


def _is_link_catch(node: Dict[str, Any], incoming: Dict[str, List[str]]) -> bool:
    """intermediateCatchEvent — точка входа (link-catch рестарт)."""
    if str(node.get("bpmn_type") or "") != "intermediateCatchEvent":
        return False
    defs = node.get("event_definitions")
    if defs:
        return "linkEventDefinition" in defs
    # эвристика для ручных моделей: catch без входящих потоков = link-catch
    return not incoming.get(str(node.get("id") or ""))


def _type_matches(expected: str, value: Any) -> bool:
    """Мягкая проверка типов R2: camunda-значения — строки, числа допускаем
    как int/float ИЛИ числовую строку."""
    kind = str(expected or "").lower()
    if kind in ("", "any", "string", "str", "text"):
        return isinstance(value, (str, int, float, bool))
    if kind in ("number", "float", "double"):
        if isinstance(value, bool):
            return False
        if isinstance(value, (int, float)):
            return True
        if isinstance(value, str):
            try:
                float(value)
                return True
            except ValueError:
                return False
        return False
    if kind in ("int", "integer"):
        if isinstance(value, bool):
            return False
        if isinstance(value, int):
            return True
        if isinstance(value, str):
            try:
                int(value)
                return True
            except ValueError:
                return False
        return False
    if kind in ("bool", "boolean"):
        if isinstance(value, bool):
            return True
        return isinstance(value, str) and value.strip().lower() in ("true", "false", "0", "1")
    if kind in ("object", "dict", "json"):
        if isinstance(value, dict):
            return True
        if isinstance(value, str):
            try:
                return isinstance(json.loads(value), dict)
            except Exception:
                return False
        return False
    if kind in ("array", "list"):
        return isinstance(value, list)
    return True  # неизвестный тип — не блокируем


def _is_empty(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


# ---------------------------------------------------------------------------
# reachability (R6)
# ---------------------------------------------------------------------------

def _check_reachability(nodes: List[Dict[str, Any]], flows: List[Dict[str, Any]],
                        findings: _Findings) -> None:
    node_by_id = {str(n.get("id") or ""): n for n in nodes if str(n.get("id") or "")}
    incoming: Dict[str, List[str]] = {}
    outgoing: Dict[str, List[str]] = {}
    for flow in flows:
        src = str(flow.get("source_ref") or "")
        tgt = str(flow.get("target_ref") or "")
        outgoing.setdefault(src, []).append(tgt)
        incoming.setdefault(tgt, []).append(src)

    starts = [n_id for n_id, n in node_by_id.items() if str(n.get("bpmn_type") or "") == "startEvent"]
    if starts:
        roots = list(starts)
    else:
        # fallback как в клиентском computeReachable: узлы без входящих
        roots = [n_id for n_id in node_by_id if not incoming.get(n_id)]
    # link-catch события — дополнительные корни (рестарт процесса)
    for n_id, node in node_by_id.items():
        if n_id not in roots and _is_link_catch(node, incoming):
            roots.append(n_id)

    reachable: set = set()
    queue = list(roots)
    while queue:
        current = queue.pop(0)
        if not current or current in reachable:
            continue
        reachable.add(current)
        for nxt in outgoing.get(current, []):
            if nxt not in reachable:
                queue.append(nxt)

    for n_id, node in node_by_id.items():
        if n_id not in reachable:
            findings.error(
                "UNREACHABLE_NODE",
                n_id,
                "узел недостижим из стартового события",
                "соединить потоком от старта (или link-catch) либо удалить узел",
                _node_name(node),
            )
    for n_id in reachable:
        node = node_by_id[n_id]
        if outgoing.get(n_id):
            continue
        bpmn_type = str(node.get("bpmn_type") or "")
        if bpmn_type == "endEvent" or _is_link_throw(node):
            continue
        findings.error(
            "DEAD_END",
            n_id,
            "путь завершается не конечным событием и не link-throw рестартом",
            "добавить исходящий поток к endEvent или link-throw событию",
            _node_name(node),
        )


# ---------------------------------------------------------------------------
# main entry
# ---------------------------------------------------------------------------

def validate_ui_model(
    ui_model: Dict[str, Any],
    *,
    catalog: Any = None,
    check_reachability: bool = True,
) -> Dict[str, Any]:
    """Прогнать правила R1–R7 над ui_model.

    catalog: None (статический список кодов v0.3, без проверок схем параметров),
    mapping {code: op} или список записей каталога БД.
    Возвращает {"summary": {errors, warnings, nodes, flows},
                "findings": [...], "draft_entities": [...]}.
    """
    model = ui_model if isinstance(ui_model, dict) else {}
    nodes = model.get("nodes") or []
    flows = model.get("flows") or []
    findings = _Findings()
    catalog_map = normalize_catalog(catalog)
    allowed_codes = set(catalog_map.keys()) if catalog_map is not None else ALLOWED_OPERATION_CODES

    declared = _declared_refs(model.get("process_entities") or {}, model.get("recipe_context") or {})
    declared_outputs: set = set()
    draft_index: Dict[str, Dict[str, Any]] = {}

    for node in nodes:
        if not isinstance(node, dict):
            continue
        if str(node.get("bpmn_type") or "") not in _TASK_LIKE:
            continue
        element_id = str(node.get("id") or "")
        name = _node_name(node)
        op_code = node.get("operation_code")
        op_code = str(op_code).strip() if op_code else ""
        params = node.get("params") or {}
        outputs = node.get("outputs") or {}

        # --- R1: operation_code из каталога ---------------------------------
        op_known = False
        if not op_code:
            findings.error(
                "UNKNOWN_OPERATION_CODE",
                element_id,
                "operation_code отсутствует",
                "указать operation_code из каталога",
                name,
            )
        elif op_code in FORBIDDEN_OPERATION_CODES:
            findings.error(
                "FORBIDDEN_OPERATION",
                element_id,
                f"операция '{op_code}' запрещена в v0.3",
                "заменить на допустимую операцию каталога",
                name,
            )
        elif op_code not in allowed_codes:
            findings.error(
                "UNKNOWN_OPERATION_CODE",
                element_id,
                f"неизвестный operation_code '{op_code}'",
                "использовать operation_code из каталога",
                name,
            )
        else:
            op_known = True

        # --- R2: params по parameter_schema каталога -------------------------
        schema: Dict[str, Any] = {}
        if catalog_map is not None and op_known:
            schema = (catalog_map.get(op_code) or {}).get("parameter_schema") or {}
            for key, spec in schema.items():
                spec = spec if isinstance(spec, dict) else {}
                value = params.get(key)
                if spec.get("required") and _is_empty(value):
                    findings.error(
                        "MISSING_REQUIRED_PARAM",
                        element_id,
                        f"обязательный параметр '{key}' операции '{op_code}' отсутствует",
                        "заполнить параметр по parameter_schema каталога",
                        name,
                    )
                elif not _is_empty(value) and not _type_matches(spec.get("type"), value):
                    findings.error(
                        "PARAM_TYPE_MISMATCH",
                        element_id,
                        f"параметр '{key}' операции '{op_code}': ожидается тип "
                        f"'{spec.get('type')}', получено {value!r}",
                        "исправить тип значения параметра",
                        name,
                    )

        # --- R4: move/transfer обязательные *_ref (статический страж) --------
        if catalog_map is not None and op_known and not schema and op_code in STATIC_REQUIRED_PARAMS:
            for key in STATIC_REQUIRED_PARAMS[op_code]:
                if _is_empty(params.get(key)):
                    findings.error(
                        "MISSING_REQUIRED_PARAM",
                        element_id,
                        f"обязательный параметр '{key}' операции '{op_code}' отсутствует",
                        "заполнить параметр (правило R4 для move/transfer)",
                        name,
                    )

        # declared outputs (для R5)
        for out_key, out_value in outputs.items():
            declared_outputs.add(str(out_key))
            if isinstance(out_value, str) and out_value:
                declared_outputs.add(out_value)

        # --- R3: все *_ref объявлены -----------------------------------------
        for key, value in params.items():
            if not str(key).endswith("_ref"):
                continue
            if not isinstance(value, str) or not value:
                continue
            if _DOLLAR_RE.search(value) or value.startswith("recipe_context."):
                continue  # подстановки помечаются импортом (DOLLAR_SUBSTITUTION)
            if value not in declared:
                findings.warning(
                    "UNDECLARED_ENTITY_REF",
                    element_id,
                    f"параметр '{key}' ссылается на необъявленную сущность '{value}'",
                    "объявить сущность в process_entities или recipe_context (создан черновик)",
                    name,
                )
                draft = draft_index.setdefault(
                    value,
                    {"ref": value, "guessed_category": _guess_category(str(key)), "used_by": []},
                )
                if element_id not in draft["used_by"]:
                    draft["used_by"].append(element_id)

        # --- R7: значения-заглушки в params -----------------------------------
        for key, value in params.items():
            is_placeholder = value is None or (
                isinstance(value, str) and value.strip() in PLACEHOLDER_VALUES
            )
            if is_placeholder:
                findings.error(
                    "PLACEHOLDER_VALUE",
                    element_id,
                    f"параметр '{key}' содержит значение-заглушку ('-' или пустое)",
                    "заполнить значение или удалить параметр",
                    name,
                )

    # --- R5: условия шлюзов только из объявленных outputs ---------------------
    for flow in flows:
        if not isinstance(flow, dict):
            continue
        condition = str(flow.get("condition") or "").strip()
        if not condition:
            continue
        for identifier in _condition_identifiers(condition):
            if identifier not in declared_outputs:
                findings.error(
                    "GATEWAY_CONDITION_UNKNOWN_OUTPUT",
                    str(flow.get("id") or ""),
                    f"условие шлюза ссылается на необъявленный output '{identifier}'",
                    "объявить output в outputs.* задачи или исправить условие",
                    str(flow.get("name") or ""),
                )

    # --- R6: достижимость ------------------------------------------------------
    if check_reachability:
        _check_reachability(nodes, flows, findings)

    errors = sum(1 for f in findings.items if f["severity"] == "error")
    warnings = sum(1 for f in findings.items if f["severity"] == "warning")
    return {
        "summary": {
            "errors": errors,
            "warnings": warnings,
            "nodes": len(nodes),
            "flows": len(flows),
        },
        "findings": findings.items,
        "draft_entities": list(draft_index.values()),
    }


def validate_with_catalog(ui_model: Dict[str, Any], *, check_reachability: bool = True) -> Dict[str, Any]:
    """Validate against the live DB catalog (используется endpoint'ами E6)."""
    return validate_ui_model(
        ui_model,
        catalog=load_catalog_from_db(),
        check_reachability=check_reachability,
    )
