"""Регистратор HTTP-вызовов тестов для отчёта о покрытии OpenAPI-спеки (Этап 2).

Активируется только при `pytest --api-coverage` (см. backend/conftest.py).
Перехватывает httpx.Client.send / httpx.AsyncClient.send — этого достаточно:
starlette TestClient (fastapi 0.110) ходит через httpx.Client с ASGI-транспортом,
httpx.AsyncClient + ASGITransport — через httpx.AsyncClient.

Пишет JSONL-факты в build/api-coverage-output/: method, concrete path, status,
test nodeid. Path-шаблон ({session_id} и т.п.) восстанавливается НЕ здесь, а в
scripts/api_coverage_report.py — матчингом по шаблонам из живой спеки, чтобы
recorder не зависел от app и не знал про FastAPI.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

_OUTPUT_DIR = Path(__file__).resolve().parents[2] / "build" / "api-coverage-output"

_state = threading.local()
_lock = threading.Lock()
_out_file = None


def _record(method: str, url, status_code: int) -> None:
    try:
        path = url.path if hasattr(url, "path") else str(url)
        if not path.startswith("/api"):
            return
        nodeid = getattr(_state, "nodeid", None)
        row = {"method": method.upper(), "path": path, "status": status_code, "test": nodeid}
        with _lock:
            global _out_file
            if _out_file is None:
                _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
                _out_file = (_OUTPUT_DIR / "calls.jsonl").open("a", encoding="utf-8")
            _out_file.write(json.dumps(row, ensure_ascii=False) + "\n")
            _out_file.flush()
    except Exception:
        # Регистратор не имеет права ломать тесты.
        pass


def _wrap_sync(original):
    def send(self, request, *args, **kwargs):
        response = original(self, request, *args, **kwargs)
        _record(request.method, request.url, response.status_code)
        return response

    return send


def _wrap_async(original):
    async def send(self, request, *args, **kwargs):
        response = await original(self, request, *args, **kwargs)
        _record(request.method, request.url, response.status_code)
        return response

    return send


class _CoveragePlugin:
    def pytest_runtest_setup(self, item):
        _state.nodeid = item.nodeid

    def pytest_runtest_teardown(self, item):
        _state.nodeid = None


def enable(config) -> None:
    """Включает запись: чистит output-dir, патчит httpx, регистрирует плагин."""
    import shutil

    import httpx

    if _OUTPUT_DIR.exists():
        shutil.rmtree(_OUTPUT_DIR)
    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    httpx.Client.send = _wrap_sync(httpx.Client.send)
    httpx.AsyncClient.send = _wrap_async(httpx.AsyncClient.send)

    config.pluginmanager.register(_CoveragePlugin(), "api-coverage-recorder")
