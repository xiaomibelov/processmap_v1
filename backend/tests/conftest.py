import os
import tempfile

import pytest

# Ensure test-only defaults for secrets that are now required at runtime.
# Real values are never committed; these defaults are safe for the local
# SQLite-backed test suite only.
os.environ.setdefault("JWT_SECRET", "unit-test-secret-for-processmap-only")
os.environ.setdefault("JWT_ISSUER", "processmap-test")
os.environ.setdefault("JWT_AUDIENCE", "processmap-test")
os.environ.setdefault("AGENT_SVC_INTERNAL_TOKEN", "unit-test-agent-internal-token")
os.environ.setdefault("LLM_SETTINGS_ENCRYPTION_KEY", "unit-test-llm-settings-encryption-key-32b")


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
