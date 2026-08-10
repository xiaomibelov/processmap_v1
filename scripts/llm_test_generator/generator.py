"""Оркестрация генерации: промпт → LLM → гейты → retry → accept/needs_human."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import context, gates, llm

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
OUT_DIR = BACKEND_DIR / "tests" / "llm_generated"
BUILD_DIR = REPO_ROOT / "build" / "llm-test-generator"

MAX_ITERATIONS = 3  # генерация + до 2 починок по traceback

_SYSTEM = (
    "Ты — генератор pytest-тестов для FastAPI-бэкенда ProcessMap. "
    "Твоя единственная задача — вернуть ОДИН файл теста, который реально проходит. "
    "Ответ — только код Python, без пояснений, в одном ```python-блоке."
)

_RULES = """\
Жёсткие правила (нарушение = отказ гейтов):
1. Тестируй ТОЛЬКО через fastapi.testclient.TestClient(app) — реальные HTTP-вызовы
   в in-process ASGI. Никаких моков, patch, unittest.mock, requests/httpx/urllib.
2. На тесте должен стоять @pytest.mark.llm_generated. Класс/модуль — без side-effects.
3. Тест идемпотентен и чист: БД на старте пустая (фикстура isolate_process_db даёт
   свежую SQLite каждому тесту), все нужные сущности создай в setup сам.
4. Ассерты — реальные и содержательные: статус-код + ключевые поля ответа.
   Запрещены assert True, pytest.skip, пустые тесты.
5. Не импортируй ничего, кроме проверенных хелперов из блока «Инфраструктура».
6. Если операция требует path/query-параметры — создай соответствующие сущности
   (org/user/project/session) и используй их реальные id.
7. Негативные варианты (4xx) проверяй реальными невалидными входами из спеки.
8. Никаких плейсхолдеров вида [[email_address]] — только реальные строки/значения.
9. Не пиши рассуждений в ответе — только код файла.
10. Эндпоинты требуют авторизованного пользователя С membership в org — иначе 401/403.
11. Семантика ошибок: несуществующий id в path → 404 (не 422!). 422 получается ТОЛЬКО
    невалидными ЗНАЧЕНИЯМИ параметров (строка вместо int, невалидный enum и т.п.).
12. НЕ ВЫДУМЫВАЙ негативные кейсы: если 4xx не воспроизводится реальными входами
    (например, все query-параметры необязательные строки → 422 недостижим),
    оставь только достижимые проверки (200 + структура ответа). Лучше меньше
    ассертов, но честных.
"""

# Тег-специфичные дополнения к правилам (авто-подстановка по тегу цели).
_TAG_RULES = {
    "admin": (
        "12. Эндпоинты /api/admin/* требуют PLATFORM admin: создавай пользователя\n"
        "    user = create_user('admin_x@local', 'password', is_admin=True) — флаг is_admin=True\n"
        "    ОБЯЗАТЕЛЕН (по умолчанию False → будет 403). Org/membership можно не создавать,\n"
        "    но не запрещено.\n"
        "13. Для негативного кейса 403: второй пользователь с is_admin=False → 403."
    ),
}


def _extract_code(text: str) -> str:
    m = re.search(r"```python\s*\n(.*?)```", text, re.S)
    if m:
        return m.group(1).strip() + "\n"
    m = re.search(r"```\s*\n(.*?)```", text, re.S)
    if m:
        return m.group(1).strip() + "\n"
    # Fallback: модель вернула код без ограждений или с «хвостом» fence-строк.
    lines = [ln for ln in text.strip().splitlines() if not ln.strip().startswith("```")]
    return "\n".join(lines).strip() + "\n"


def _looks_like_code(code: str) -> bool:
    return len(code) >= 100 and "def test_" in code and "import" in code


def build_prompt(target: Dict[str, Any]) -> List[Dict[str, str]]:
    method = target["method"]
    path = target["path"]
    fragment = context.operation_fragment(method, path)
    samples = context.find_sample_tests((target.get("tags") or [""])[0], path)
    missing = target.get("missing_statuses") or []
    documented = [s for s in (target.get("documented_statuses") or []) if s != "default"]

    parts = [
        f"Операция: {method} {path} (operationId: {target.get('operation_id')}, теги: {', '.join(target.get('tags') or [])})",
        f"Задокументированные статусы: {', '.join(documented) or '—'}",
        f"НЕ покрыто существующими тестами: {', '.join(missing) or 'варианты ответа'} — покрой именно их.",
        "",
        context.CANONICAL_EXAMPLE,
        "",
        "Фрагмент живой OpenAPI-спеки (схемы разрешены инлайн):",
        fragment["yaml_like"],
        "",
        "Инфраструктура тестов:",
        context.fixtures_brief(),
    ]
    if samples:
        parts.append("")
        parts.append("Дополнительный образец стиля (может быть unittest-стилем — ориентируйся на канонический выше):")
        for fname, code in samples:
            parts.append(f"# --- {fname} ---\n{code}")
    parts += ["", _RULES]
    tag_rules = "\n".join(_TAG_RULES[t] for t in (target.get("tags") or []) if t in _TAG_RULES)
    if tag_rules:
        parts.append(tag_rules)
    parts.append(f"Имя файла: tests/llm_generated/test_{target.get('operation_id', 'op')}.py — один файл, 1–3 тестовых функции.")
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": "\n".join(parts)},
    ]


def _test_filename(operation_id: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9_]+", "_", operation_id)[:80]
    return OUT_DIR / f"test_{safe}.py"


def generate_for_target(
    target: Dict[str, Any],
    cfg: llm.LLMConfig,
    usage: llm.LLMUsage,
    *,
    max_iter: int = MAX_ITERATIONS,
) -> Dict[str, Any]:
    """Один прогон цикла генерации. Возвращает результат по цели."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "__init__.py").touch(exist_ok=True)
    conftest = OUT_DIR / "conftest.py"
    if not conftest.exists():
        conftest.write_text(
            '"""Маркер llm_generated регистрируется локально (в рамках diff-scope)."""\n'
            "def pytest_configure(config):\n"
            '    config.addinivalue_line("markers", "llm_generated: тесты, сгенерированные LLM (scripts/llm_test_generator)")\n',
            encoding="utf-8",
        )

    op_id = target.get("operation_id") or "op"
    path = _test_filename(op_id)
    messages = build_prompt(target)
    result: Dict[str, Any] = {
        "operation_id": op_id,
        "method": target["method"],
        "path": target["path"],
        "tags": target.get("tags"),
        "status": "failed",
        "iterations": 0,
        "file": str(path.relative_to(BACKEND_DIR)),
        "gate_history": [],
    }

    for iteration in range(1, max_iter + 1):
        result["iterations"] = iteration
        response = llm.chat(cfg, messages)
        usage.add(response.get("usage"), response.get("model") or cfg.model)
        code = _extract_code(response.get("text") or "")
        if not _looks_like_code(code):
            # Модель вернула пустой content (reasoning-бюджет) или не код —
            # не тратим pytest-прогон, сразу просим код заново.
            result["gate_history"].append({
                "iteration": iteration, "ok": False, "gate": "content",
                "reason": f"модель вернула не код ({len(code)} символов)",
            })
            messages = messages + [
                {"role": "assistant", "content": (response.get("text") or "")[:2000]},
                {"role": "user", "content": "Ответ не содержит код теста. Верни ТОЛЬКО полный файл теста, один ```python-блок, без рассуждений."},
            ]
            continue
        path.write_text(code, encoding="utf-8")

        ok, gate_name, reason = gates.run_gates(path)
        result["gate_history"].append({"iteration": iteration, "ok": ok, "gate": gate_name, "reason": reason[:1500]})
        if ok:
            result["status"] = "passed"
            return result
        # traceback/причина — обратно в LLM
        messages = messages + [
            {"role": "assistant", "content": response.get("text") or ""},
            {
                "role": "user",
                "content": (
                    f"Гейт '{gate_name}' отклонил тест. Причина/вывод pytest:\n"
                    f"```\n{reason[:4000]}\n```\n"
                    "Исправь и верни ПОЛНЫЙ файл целиком (только код, один ```python-блок)."
                ),
            },
        ]
    return result


def run(
    targets: List[Dict[str, Any]],
    cfg: llm.LLMConfig,
    *,
    max_iter: int = MAX_ITERATIONS,
    tag: str = "",
) -> Dict[str, Any]:
    usage = llm.LLMUsage()
    results: List[Dict[str, Any]] = []
    started = time.time()
    for target in targets:
        try:
            res = generate_for_target(target, cfg, usage, max_iter=max_iter)
        except Exception as e:  # LLM-недоступность и т.п. — не роняем батч
            res = {
                "operation_id": target.get("operation_id"),
                "method": target.get("method"),
                "path": target.get("path"),
                "status": "error",
                "error": str(e)[:500],
                "iterations": 0,
                "gate_history": [],
            }
        results.append(res)

    passed = [r for r in results if r["status"] == "passed"]
    failed = [r for r in results if r["status"] != "passed"]

    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    needs_human = BUILD_DIR / "needs_human.md"
    if failed:
        with needs_human.open("a", encoding="utf-8") as fh:
            for r in failed:
                fh.write(f"## {r['method']} {r['path']} (`{r.get('operation_id')}`)\n")
                if r.get("error"):
                    fh.write(f"- Ошибка цикла: {r['error']}\n\n")
                    continue
                fh.write(f"- Итераций: {r.get('iterations')}\n")
                last = (r.get("gate_history") or [{}])[-1]
                fh.write(f"- Последний гейт: `{last.get('gate')}` — {str(last.get('reason'))[:800]}\n\n")

    report = {
        "tag": tag,
        "targets": len(targets),
        "passed": len(passed),
        "needs_human": len(failed),
        "usage": usage.as_dict(),
        "duration_sec": round(time.time() - started, 1),
        "results": results,
    }
    (BUILD_DIR / "last_run.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
