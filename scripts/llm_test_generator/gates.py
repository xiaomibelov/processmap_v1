"""Гейты качества для сгенерированных тестов. Судья — реальный pytest, не LLM.

Гейты по порядку:
1. Синтаксис: py_compile.
2. Статик-запреты (AST): assert True/assert 1, безусловный/пустой pytest.skip,
   отключённые ассерты, сетевые вызовы (requests/httpx/urllib — тесты идут
   только через TestClient), моки API (unittest.mock/patch на app-роуты).
3. Изолированный прогон: pytest <file> -q должен быть зелёным.
Падение любого гейта → причина возвращается в LLM (макс. 3 итерации).
"""
from __future__ import annotations

import ast
import py_compile
import subprocess
import sys
from pathlib import Path
from typing import List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"

_FORBIDDEN_CALLS = {"patch", "Mock", "MagicMock", "monkeypatch"}
_FORBIDDEN_MODULES = {"requests", "urllib", "socket", "httpx"}


def gate_syntax(path: Path) -> Tuple[bool, str]:
    try:
        py_compile.compile(str(path), doraise=True)
        return True, ""
    except py_compile.PyCompileError as e:
        return False, f"синтаксическая ошибка: {e}"


class _StaticCheck(ast.NodeVisitor):
    def __init__(self) -> None:
        self.errors: List[str] = []
        self.has_marker = False
        self.has_test = False
        self.asserts = 0

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            root = alias.name.split(".")[0]
            if root in _FORBIDDEN_MODULES or root == "unittest":
                self.errors.append(f"запрещённый импорт: {alias.name} (тесты — только через TestClient, без моков/сети)")

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        mod = (node.module or "").split(".")[0]
        if mod in _FORBIDDEN_MODULES:
            self.errors.append(f"запрещённый импорт: {node.module} (сетевые вызовы в тестах запрещены)")
        if mod == "unittest" and any(a.name == "mock" for a in node.names):
            self.errors.append("запрещён unittest.mock (мокать API нельзя)")

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        if node.name.startswith("test_"):
            self.has_test = True
            for deco in node.decorator_list:
                text = ast.unparse(deco)
                if "llm_generated" in text:
                    self.has_marker = True
        self.generic_visit(node)

    def visit_Assert(self, node: ast.Assert) -> None:
        self.asserts += 1
        test = node.test
        if isinstance(test, ast.Constant) and test.value in (True, 1):
            self.errors.append("бессмысленный `assert True` — тест без проверки отклонён")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        text = ast.unparse(node.func)
        short = text.split(".")[-1]
        if short in _FORBIDDEN_CALLS:
            self.errors.append(f"запрещённый вызов {text}(...) — мокать API/хендлеры нельзя")
        if "skip" in text and "pytest" in text:
            self.errors.append("pytest.skip в сгенерированном тесте запрещён (тест обязан реально выполняться)")
        self.generic_visit(node)


def gate_static(path: Path) -> Tuple[bool, str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as e:
        return False, f"синтаксическая ошибка: {e}"
    checker = _StaticCheck()
    checker.visit(tree)
    if not checker.has_test:
        checker.errors.append("нет ни одной функции test_*")
    if not checker.has_marker:
        checker.errors.append("нет маркера @pytest.mark.llm_generated на тесте")
    if checker.asserts == 0:
        checker.errors.append("в тестах нет ни одного assert")
    if checker.errors:
        return False, "; ".join(sorted(set(checker.errors)))
    return True, ""


def gate_pytest(path: Path, timeout: int = 300) -> Tuple[bool, str]:
    """Изолированный прогон. Возвращает (ok, короткий отчёт/traceback)."""
    venv_python = BACKEND_DIR / ".venv" / "bin" / "python"
    python = str(venv_python) if venv_python.exists() else sys.executable
    proc = subprocess.run(
        [python, "-m", "pytest", str(path.relative_to(BACKEND_DIR)), "-q", "-p", "no:cacheprovider", "-x"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode == 0 and " passed" in out:
        return True, out.strip().splitlines()[-1] if out.strip() else "passed"
    # traceback/причина — хвост вывода (для возврата в LLM)
    tail = "\n".join(out.strip().splitlines()[-60:])
    return False, tail


def run_gates(path: Path) -> Tuple[bool, str, str]:
    """Все гейты. Возвращает (ok, gate_name, reason)."""
    for name, fn in (("syntax", gate_syntax), ("static", gate_static), ("pytest", gate_pytest)):
        ok, reason = fn(path)
        if not ok:
            return False, name, reason
    return True, "", ""
