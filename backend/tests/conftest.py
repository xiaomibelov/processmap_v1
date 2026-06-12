import os
import tempfile

import pytest


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
