"""E4.4 — CRUD шаблонов процесса против реального dev-Postgres."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")


@pytest.fixture(autouse=True)
def _pg_env():
    old_env = {k: os.environ.get(k) for k in ("DATABASE_URL", "FPC_DB_BACKEND")}
    os.environ["DATABASE_URL"] = DATABASE_URL
    os.environ["FPC_DB_BACKEND"] = "postgres"
    from backend.app.db.config import get_db_runtime_config
    import backend.app.storage as _st

    get_db_runtime_config.cache_clear()
    old_pool = _st._PG_POOL
    _st._PG_POOL = None
    yield
    _st._PG_POOL = old_pool
    get_db_runtime_config.cache_clear()
    for key, value in old_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def test_template_crud_roundtrip():
    from backend.app.process_template.repository import ProcessTemplateRepository

    repo = ProcessTemplateRepository()
    model = {"nodes": [{"id": "A"}], "flows": []}
    created = repo.create({"name": "pytest CRUD", "version": "0.1.0", "ui_model": model, "created_by": "pytest"})
    assert created["id"]
    assert created["status"] == "draft"
    assert created["ui_model"] == model

    fetched = repo.get_by_id(created["id"])
    assert fetched["name"] == "pytest CRUD"

    updated = repo.update(created["id"], {"ui_model": {"nodes": [{"id": "A"}, {"id": "B"}], "flows": [{"id": "F"}]}})
    assert len(updated["ui_model"]["nodes"]) == 2

    listed = repo.list()
    assert any(t["id"] == created["id"] for t in listed)

    published = repo.publish(created["id"])
    assert published["status"] == "published"
    assert published["published_at"]

    # cleanup
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("DELETE FROM process_template WHERE id = %s", (created["id"],))
        conn.commit()
