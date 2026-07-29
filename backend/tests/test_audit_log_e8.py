"""E8 — Audit log: writer, GET /api/audit-log, diff версий, иммутабельность.

Uses the real dev Postgres (same _pg_env pattern as test_role_403.py).

Покрытие:
(1) изменение параметра рецепта → запись в журнале с поимённым diff ≤1s;
(2) publish-запись видна с автором/датой и diff vs предыдущая версия;
(3) PUT/DELETE /api/audit-log/{id} → 404/405 (иммутабельность, negative test);
(4) неразрешённый актор → «пользователь удалён/внешний», без 500;
(5) фильтры entity_type/entity_id/action/actor/date работают.
"""
import os
import sys
import time
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")

from backend.app.main import app
from backend.app.auth import create_access_token


@pytest.fixture(autouse=True)
def _pg_env():
    """These tests need the real dev Postgres (seeded roles + recipe_param_def)."""
    old_env = {k: os.environ.get(k) for k in ("DATABASE_URL", "FPC_DB_BACKEND")}
    os.environ["DATABASE_URL"] = DATABASE_URL
    os.environ["FPC_DB_BACKEND"] = "postgres"
    import backend.app.storage as _st
    from backend.app.db.config import get_db_runtime_config

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


def _insert_user(role: str) -> str:
    import psycopg

    user_id = uuid.uuid4().hex
    email = f"e8_{role}_{user_id[:8]}@local"
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, 0, %s, 0, 0)",
                (user_id, email, role),
            )
        conn.commit()
    return user_id


def _delete_user(user_id: str) -> None:
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()


@pytest.fixture
def analyst_token():
    uid = _insert_user("analyst")
    yield create_access_token(uid), uid
    _delete_user(uid)


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_ui_model(recipe_params_per_task):
    nodes = [
        {"id": "StartEvent_1", "bpmn_type": "startEvent", "name": "s", "recipe_params": []},
    ]
    for idx, params in enumerate(recipe_params_per_task or []):
        nodes.append(
            {
                "id": f"Task_{idx + 1}",
                "bpmn_type": "task",
                "name": f"Шаг {idx + 1}",
                "operation_code": "heat",
                "recipe_params": list(params),
            }
        )
    return {"nodes": nodes, "flows": [], "recipe_context": {}}


@pytest.fixture
def template(client, analyst_token):
    """Draft template requiring heat_time_sec + target_temp_c (cleanup после теста)."""
    token, _ = analyst_token
    payload = {
        "name": f"e8test_template_{uuid.uuid4().hex[:8]}",
        "version": "1.0.0",
        "status": "draft",
        "ui_model": _make_ui_model([["heat_time_sec"], ["target_temp_c", "heat_time_sec"]]),
        "created_by": "",
    }
    r = client.post("/api/process-templates", json=payload, headers=_auth(token))
    assert r.status_code in (200, 201), r.text
    tpl = r.json()
    yield tpl
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM recipe_version WHERE recipe_id IN (SELECT id FROM recipe WHERE template_id = %s)",
                (tpl["id"],),
            )
            cur.execute("DELETE FROM recipe WHERE template_id = %s", (tpl["id"],))
            cur.execute("DELETE FROM process_template WHERE id = %s", (tpl["id"],))
        conn.commit()


def _create_recipe(client, token, template, **overrides):
    payload = {
        "sku_id": f"e8test_sku_{uuid.uuid4().hex[:8]}",
        "template_id": template["id"],
        "parameters_json": {"heat_time_sec": 90, "target_temp_c": 85},
    }
    payload.update(overrides)
    r = client.post("/api/recipes", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _get_journal(client, token, **params):
    r = client.get("/api/audit-log", params=params, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["items"]


def _publish_recipe(client, token, template, recipe_id):
    """Publish через реальный endpoint; published-версия шаблона вставляется
    напрямую (ui_model фикстуры не проходит полный dry-run каталога — тот же
    приём, что и в test_recipes.py)."""
    from backend.app.process_template.version_repository import ProcessTemplateVersionRepository

    versions = ProcessTemplateVersionRepository()
    if not versions.get_by_version(template["id"], template["version"]):
        versions.create(
            {
                "template_id": template["id"],
                "version": template["version"],
                "status": "published",
                "ui_model": template.get("ui_model"),
                "created_by": "e8_test",
            }
        )
    r = client.post(f"/api/recipes/{recipe_id}/publish", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


# (1) изменение параметра → запись с поимённым diff ≤1s ------------------------


def test_param_change_writes_named_diff_within_1s(client, analyst_token, template):
    token, _uid = analyst_token
    recipe = _create_recipe(client, token, template)
    rid = recipe["id"]

    started = int(time.time())
    r = client.put(
        f"/api/recipes/{rid}",
        json={"parameters_json": {"heat_time_sec": 100, "target_temp_c": 85}},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    elapsed = time.time() - started
    assert elapsed <= 1.0, f"journal write took {elapsed:.3f}s"

    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, action="recipe.update")
    assert items, "recipe.update entry missing"
    entry = items[0]
    assert entry["ts"] >= started - 1
    diff = entry["meta"]["diff_json"]
    assert diff["heat_time_sec"] == {"old": 90, "new": 100}
    assert "target_temp_c" not in diff, "unchanged param must not appear in diff"
    assert any("heat_time_sec: 90 → 100" in line for line in entry["meta"]["diff_lines"])


# (2) publish-запись видна с автором/датой и diff vs предыдущая версия ---------


def test_publish_entry_visible_with_author_date_and_diff(client, analyst_token, template):
    token, uid = analyst_token
    recipe = _create_recipe(client, token, template)
    rid = recipe["id"]
    _publish_recipe(client, token, template, rid)

    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, action="publish")
    assert items, "publish entry (E7 flow) missing"
    entry = items[0]
    # автор: actor_user_id разрешён в email пользователя
    assert entry["actor_user_id"] == uid
    assert entry["actor_resolved"] is True
    assert entry["actor_email"] and "@local" in entry["actor_email"]
    # дата
    assert entry["ts"] > 0
    # версия в meta
    assert entry["meta"]["version"] == "1.0.0"

    # вторая версия с изменённым параметром: published-рецепт не редактируется
    # через API (409 по E5), поэтому параметры меняем напрямую в БД, а публикацию
    # делаем через реальный endpoint → v1.0.1 с diff vs v1.0.0
    import json as _json

    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE recipe SET parameters_json = %s WHERE id = %s",
                (_json.dumps({"heat_time_sec": 100, "target_temp_c": 85}), rid),
            )
        conn.commit()
    _publish_recipe(client, token, template, rid)

    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, action="publish")
    assert len(items) >= 2
    # оба publish могут попасть в одну секунду ts — ищем запись v1.0.1 по meta
    latest = next((e for e in items if e["meta"].get("version") == "1.0.1"), None)
    assert latest, f"publish entry for v1.0.1 missing: {[e['meta'].get('version') for e in items]}"
    assert latest["meta"]["version"] == "1.0.1"
    assert latest["meta"]["previous_version"] == "1.0.0"
    assert latest["meta"]["diff_json"]["heat_time_sec"] == {"old": 90, "new": 100}

    # API diff версий: from/to + human lines
    r = client.get(f"/api/recipes/{rid}/diff", params={"from": "1.0.0", "to": "1.0.1"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["diff"]["heat_time_sec"] == {"old": 90, "new": 100}
    assert "target_temp_c" not in payload["diff"]
    assert any("heat_time_sec: 90 → 100" in line for line in payload["lines"])
    # to по умолчанию — последняя; from по умолчанию — предыдущая
    r = client.get(f"/api/recipes/{rid}/diff", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["from"] == "1.0.0" and r.json()["to"] == "1.0.1"
    # неизвестная версия → 404
    r = client.get(f"/api/recipes/{rid}/diff", params={"from": "9.9.9", "to": "1.0.1"}, headers=_auth(token))
    assert r.status_code == 404


# (3) иммутабельность: PUT/DELETE /api/audit-log/{id} → 404/405 -----------------


def test_audit_log_is_immutable(client, analyst_token):
    token, _uid = analyst_token
    for method in ("put", "delete", "patch"):
        kwargs = {"headers": _auth(token)}
        if method != "delete":
            kwargs["json"] = {"action": "hack"}
        r = getattr(client, method)("/api/audit-log/aud_nonexistent", **kwargs)
        assert r.status_code in (404, 405), f"{method.upper()} → {r.status_code}"
    # и коллекция тоже неизменяема
    r = client.put("/api/audit-log", json={}, headers=_auth(token))
    assert r.status_code in (404, 405)
    r = client.post("/api/audit-log", json={}, headers=_auth(token))
    assert r.status_code in (404, 405)


# (4) неразрешённый актор → «пользователь удалён/внешний», без 500 --------------


def test_unresolved_actor_renders_as_external(client, analyst_token):
    token, _uid = analyst_token
    from backend.app.audit.writer import ACTOR_UNKNOWN_LABEL, write_event

    fake_actor = f"deleted_user_{uuid.uuid4().hex[:8]}"
    entity_id = f"e8_fake_{uuid.uuid4().hex[:8]}"
    row = write_event(
        actor_user_id=fake_actor,
        action="recipe.update",
        entity_type="recipe",
        entity_id=entity_id,
        meta_json={"diff_json": {"heat_time_sec": {"old": 90, "new": 100}}},
    )
    assert row, "writer must persist the event"

    items = _get_journal(client, token, entity_type="recipe", entity_id=entity_id)
    assert len(items) == 1
    entry = items[0]
    assert entry["actor_resolved"] is False
    assert entry["actor_email"] is None
    assert entry["actor_display"] == ACTOR_UNKNOWN_LABEL


# (5) фильтры -------------------------------------------------------------------


def test_filters_work(client, analyst_token, template):
    token, uid = analyst_token
    recipe = _create_recipe(client, token, template)
    rid = recipe["id"]
    now = int(time.time())

    # entity_type + entity_id
    items = _get_journal(client, token, entity_type="recipe", entity_id=rid)
    actions = {e["action"] for e in items}
    assert "recipe.create" in actions

    # action
    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, action="recipe.create")
    assert items and all(e["action"] == "recipe.create" for e in items)

    # actor by user id
    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, actor=uid)
    assert items and all(e["actor_user_id"] == uid for e in items)

    # actor by email (разрешение email → id)
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT email FROM users WHERE id = %s", (uid,))
            email = cur.fetchone()[0]
    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, actor=email)
    assert items and all(e["actor_user_id"] == uid for e in items)

    # date_from/date_to (unix ts и YYYY-MM-DD)
    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, date_from=str(now - 60))
    assert items
    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, date_to=str(now - 60))
    assert items == []
    today = time.strftime("%Y-%m-%d", time.gmtime())
    items = _get_journal(client, token, entity_type="recipe", entity_id=rid, date_from=today, date_to=today)
    assert items

    # пагинация
    page = _get_journal(client, token, entity_type="recipe", entity_id=rid, limit=1, offset=0)
    assert len(page) == 1

    # auth required
    r = client.get("/api/audit-log")
    assert r.status_code in (401, 403)
