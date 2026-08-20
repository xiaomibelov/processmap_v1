"""Валидация edit_plan перед показом человеку (AGENT-3).

Сервис не импортирует backend.app.*. Все проверки монолита — через HTTP.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Set, Tuple

from runners.monolith_client import MonolithError


# Модуль runner.monolith_client импортируется lazy в функциях, чтобы избежать
# циклов при импорте validator из planner/applier.


class EditPlanValidationError(Exception):
    """Невалидный план правок. message — на русском, для возврата LLM."""

    def __init__(self, message: str, *, field: str = "") -> None:
        self.field = field
        self.message = message
        super().__init__(message)


FORBIDDEN_OPERATION_CODES = {"", "null", "undefined"}


def _node_ids(projection: Dict[str, Any]) -> Set[str]:
    return {
        str(s.get("id") or "").strip()
        for s in (projection.get("steps") or [])
        if str(s.get("id") or "").strip()
    }


def _edges(projection: Dict[str, Any]) -> List[Dict[str, Any]]:
    return list(projection.get("edges") or [])


def _validate_operation_code(
    code: str,
    token: str,
    session_id: str,
    *,
    org_id: str = "",
) -> None:
    """Проверить, что operation_code существует в каталоге и не запрещён."""
    from runners import monolith_client

    code = str(code or "").strip()
    if not code or code.lower() in FORBIDDEN_OPERATION_CODES:
        raise EditPlanValidationError(f"operation_code '{code}' запрещён", field="operation_code")
    try:
        result = monolith_client.get_operation_catalog(code, token=token, org_id=org_id)
    except MonolithError as exc:
        raise EditPlanValidationError(f"каталог операций недоступен: {exc}", field="operation_code") from exc
    if result.get("_http_status", 200) != 200 or not result.get("code"):
        raise EditPlanValidationError(f"operation_code '{code}' не найден в каталоге", field="operation_code")


def validate_edit_plan(
    edit_plan: Dict[str, Any],
    projection: Dict[str, Any],
    token: str,
    session_id: str,
    *,
    org_id: str = "",
    max_operations: int = 20,
) -> List[str]:
    """Валидировать план правок. Возвращает список ошибок (пустой — OK).

    Проверки:
    1. node_id существует в проекции (для update/delete/add_edge).
    2. Новый node_id уникален (для add_node).
    3. Нет orphan edges после delete_node (если в плане не удаляются они).
    4. operation_code из каталога.
    5. Лимит числа операций.
    """
    errors: List[str] = []
    existing_nodes = _node_ids(projection)
    existing_edges = _edges(projection)
    operations = edit_plan.get("operations") if isinstance(edit_plan, dict) else []
    if not isinstance(operations, list):
        return ["edit_plan.operations должен быть списком"]

    if len(operations) > max_operations:
        return [f"слишком много операций: {len(operations)} > {max_operations}"]

    planned_new_nodes: Set[str] = set()
    planned_deleted_nodes: Set[str] = set()
    planned_deleted_edges: Set[Tuple[str, str]] = set()

    for idx, op in enumerate(operations):
        if not isinstance(op, dict):
            errors.append(f"операция #{idx + 1}: не объект")
            continue
        op_type = str(op.get("op") or "").strip()
        prefix = f"операция #{idx + 1} ({op_type})"

        if op_type == "update_node":
            node_id = str(op.get("node_id") or "").strip()
            if not node_id:
                errors.append(f"{prefix}: отсутствует node_id")
            elif node_id not in existing_nodes and node_id not in planned_new_nodes:
                errors.append(f"{prefix}: узел '{node_id}' не найден в схеме")
            fields = op.get("fields") or {}
            if not isinstance(fields, dict):
                errors.append(f"{prefix}: fields должен быть объектом")
            elif fields.get("operation_code"):
                try:
                    _validate_operation_code(str(fields["operation_code"]), token, session_id, org_id=org_id)
                except EditPlanValidationError as exc:
                    errors.append(f"{prefix}: {exc.message}")

        elif op_type == "add_node":
            node_id = str(op.get("node_id") or "").strip()
            if not node_id:
                errors.append(f"{prefix}: отсутствует node_id")
            elif node_id in existing_nodes or node_id in planned_new_nodes:
                errors.append(f"{prefix}: узел '{node_id}' уже существует")
            else:
                planned_new_nodes.add(node_id)
            if op.get("operation_code"):
                try:
                    _validate_operation_code(str(op["operation_code"]), token, session_id, org_id=org_id)
                except EditPlanValidationError as exc:
                    errors.append(f"{prefix}: {exc.message}")

        elif op_type == "add_edge":
            from_id = str(op.get("from_id") or "").strip()
            to_id = str(op.get("to_id") or "").strip()
            if not from_id or not to_id:
                errors.append(f"{prefix}: отсутствует from_id/to_id")
                continue
            known_nodes = existing_nodes | planned_new_nodes
            if from_id not in known_nodes and from_id not in planned_deleted_nodes:
                errors.append(f"{prefix}: узел '{from_id}' не найден")
            if to_id not in known_nodes and to_id not in planned_deleted_nodes:
                errors.append(f"{prefix}: узел '{to_id}' не найден")

        elif op_type == "delete_node":
            node_id = str(op.get("node_id") or "").strip()
            if not node_id:
                errors.append(f"{prefix}: отсутствует node_id")
            elif node_id not in existing_nodes and node_id not in planned_new_nodes:
                errors.append(f"{prefix}: узел '{node_id}' не найден в схеме")
            planned_deleted_nodes.add(node_id)

        elif op_type == "delete_edge":
            from_id = str(op.get("from_id") or "").strip()
            to_id = str(op.get("to_id") or "").strip()
            if not from_id or not to_id:
                errors.append(f"{prefix}: отсутствует from_id/to_id")
            else:
                planned_deleted_edges.add((from_id, to_id))

        else:
            errors.append(f"{prefix}: неизвестный тип операции '{op_type}'")

    # orphan-edge check
    final_nodes = (existing_nodes | planned_new_nodes) - planned_deleted_nodes
    final_edges: List[Dict[str, Any]] = []
    seen_edges: Set[Tuple[str, str]] = set()
    for e in existing_edges:
        fid = str(e.get("from_id") or e.get("from") or e.get("source") or "").strip()
        tid = str(e.get("to_id") or e.get("to") or e.get("target") or "").strip()
        if (fid, tid) in planned_deleted_edges:
            continue
        final_edges.append({"from_id": fid, "to_id": tid})
        seen_edges.add((fid, tid))
    for op in operations:
        if isinstance(op, dict) and str(op.get("op") or "").strip() == "add_edge":
            fid = str(op.get("from_id") or "").strip()
            tid = str(op.get("to_id") or "").strip()
            if (fid, tid) in seen_edges:
                continue
            final_edges.append({"from_id": fid, "to_id": tid})
            seen_edges.add((fid, tid))

    for e in final_edges:
        if e["from_id"] not in final_nodes:
            errors.append(f"связь {e['from_id']}→{e['to_id']} остаётся висячей (from_id удалён)")
        if e["to_id"] not in final_nodes:
            errors.append(f"связь {e['from_id']}→{e['to_id']} остаётся висячей (to_id удалён)")

    return errors


def build_human_diff(edit_plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Преобразовать edit_plan в человекочитаемый diff для карточки."""
    diff: List[Dict[str, Any]] = []
    operations = edit_plan.get("operations") if isinstance(edit_plan, dict) else []
    if not isinstance(operations, list):
        return diff
    for op in operations:
        if not isinstance(op, dict):
            continue
        op_type = str(op.get("op") or "").strip()
        if op_type == "update_node":
            node_id = str(op.get("node_id") or "").strip()
            fields = op.get("fields") or {}
            for field, value in fields.items():
                diff.append({
                    "op": "update",
                    "node_id": node_id,
                    "field": field,
                    "new_value": value,
                })
        elif op_type == "add_node":
            diff.append({
                "op": "add_node",
                "node_id": str(op.get("node_id") or "").strip(),
                "title": str(op.get("title") or "").strip() or "<без имени>",
            })
        elif op_type == "add_edge":
            diff.append({
                "op": "add_edge",
                "from_id": str(op.get("from_id") or "").strip(),
                "to_id": str(op.get("to_id") or "").strip(),
            })
        elif op_type == "delete_node":
            diff.append({
                "op": "delete_node",
                "node_id": str(op.get("node_id") or "").strip(),
            })
    return diff
