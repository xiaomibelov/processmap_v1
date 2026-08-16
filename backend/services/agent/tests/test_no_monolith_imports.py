"""AGENT-SVC guard: сервис НЕ импортирует backend.app.* / app.* монолита.

Решение владельца 2026-08-16 — жёсткое правило без исключений (прямые и
транзитивные импорты запрещены; копирование вместо импорта). AST-проверка всех
.py сервиса; CI-шаг с тем же правилом — Phase 3.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]

# Корневые имена модулей монолита (backend/app/* импортируется как app.*).
FORBIDDEN_ROOTS = {"app", "backend"}
# Локальные модули сервиса (разрешены; перечислены, чтобы guard ловил и
# случайное появление app.py в корне сервиса).
ALLOWED_LOCAL_ROOTS = {
    "db", "schemas", "main",
    "gateway", "memory", "runners", "routers", "services", "tests",
}


def _iter_import_roots(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield str(alias.name).split(".")[0]
        elif isinstance(node, ast.ImportFrom):
            if node.level:  # relative import — внутри пакета сервиса
                continue
            if node.module:
                yield str(node.module).split(".")[0]


def test_no_monolith_imports():
    offenders = []
    for py_file in sorted(SERVICE_ROOT.rglob("*.py")):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for root in _iter_import_roots(tree):
            if root in FORBIDDEN_ROOTS:
                offenders.append(f"{py_file.relative_to(SERVICE_ROOT)}: imports '{root}'")
    assert not offenders, "сервис импортирует монолит:\n" + "\n".join(offenders)


def test_no_unknown_local_top_level_modules():
    """Любой не-stdlib/не-site-packages top-level import должен быть локальным модулем сервиса."""
    stdlib = set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else set()
    unknown = []
    for py_file in sorted(SERVICE_ROOT.rglob("*.py")):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for root in _iter_import_roots(tree):
            if root in ALLOWED_LOCAL_ROOTS or root in stdlib:
                continue
            if root in {"fastapi", "pydantic", "httpx", "jwt", "requests", "redis", "psycopg", "psycopg_pool", "pytest", "uvicorn", "unittest"}:
                continue
            unknown.append(f"{py_file.relative_to(SERVICE_ROOT)}: '{root}'")
    assert not unknown, "нераспознанные top-level imports (проверь, что это не монолит):\n" + "\n".join(unknown)
