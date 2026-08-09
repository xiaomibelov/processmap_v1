"""Root-level pytest hooks бэкенда.

Регистрирует опцию --api-coverage (Этап 2 «покрытие спеки тестами»).
Без флага — ноль эффекта: существующие тесты не меняются.
"""
from __future__ import annotations


def pytest_addoption(parser):
    parser.addoption(
        "--api-coverage",
        action="store_true",
        default=False,
        help="Record all HTTP calls of tests (TestClient/httpx) into build/api-coverage-output/ "
        "for scripts/api_coverage_report.py",
    )


def pytest_configure(config):
    if config.getoption("--api-coverage"):
        import importlib.util
        from pathlib import Path

        recorder_path = Path(__file__).resolve().parent / "tests" / "coverage_recorder.py"
        spec = importlib.util.spec_from_file_location("coverage_recorder", recorder_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.enable(config)
