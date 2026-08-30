import os
import socket
import tempfile

import pytest

# AGENT-2: в тестах Celery-задачи индексации запускаются синхронно,
# чтобы избежать подключения к Redis-брокеру в unit-тестах.
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "1")


def _celery_broker_reachable() -> bool:
    """True when the hard-coded Celery broker host `redis` is resolvable and reachable."""
    try:
        with socket.create_connection(("redis", 6379), timeout=2):
            return True
    except Exception:
        return False


skip_if_hanging = pytest.mark.skip_if_hanging


def pytest_collection_modifyitems(config, items):
    if _celery_broker_reachable():
        return
    for item in items:
        if item.get_closest_marker("skip_if_hanging"):
            item.add_marker(
                pytest.mark.skip(
                    reason="skip-if-hanging: Celery broker redis://redis:6379/1 is unreachable outside Docker Compose (pre-existing env limitation)"
                )
            )


@pytest.fixture(autouse=True)
def isolate_process_db():
    """Give every test a fresh on-disk SQLite DB to avoid email/org collisions."""
    old_path = os.environ.get("PROCESS_DB_PATH")
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    os.environ["PROCESS_DB_PATH"] = path
    # Force storage to re-create the schema against the new path.
    try:
        import app.storage as _st

        _st._SCHEMA_READY = False
        _st._SCHEMA_DB_FILE = ""
    except Exception:
        pass
    yield
    if old_path is None:
        os.environ.pop("PROCESS_DB_PATH", None)
    else:
        os.environ["PROCESS_DB_PATH"] = old_path
    try:
        os.unlink(path)
    except Exception:
        pass
