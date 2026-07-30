"""R3 — snapshot-тесты контрактов API (класс бага «смещение полей»).

Каждый тест фиксирует ТОЧНУЮ форму ответа эндпоинта: набор ключей и типы
значений. Ловит класс багов, найденных дважды:
- detail /api/operation-catalog/{code} после добавления name_ru отдавал
  parameter_schema=name_ru (смещение индексов row → dict).

Паттерн: реальная dev-БД (_pg_env, как test_role_403.py).
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")

from backend.app.main import app
from backend.app.auth import create_access_token


@pytest.fixture(autouse=True)
def _pg_env():
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


@pytest.fixture
def token():
    import uuid
    import psycopg

    uid = uuid.uuid4().hex
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (id, email, password_hash, is_active, is_admin, role, created_at, updated_at) "
                "VALUES (%s, %s, '', 1, 0, 'analyst', 0, 0)",
                (uid, f"r3_{uid[:8]}@local"),
            )
        conn.commit()
    yield create_access_token(uid)
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (uid,))
        conn.commit()


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _assert_shape(item: dict, shape: dict, where: str) -> None:
    """shape: {key: type | (type, ...)}. Точный набор ключей + типы."""
    assert set(item.keys()) == set(shape.keys()), (
        f"{where}: ключи {sorted(item.keys())} != ожидаемые {sorted(shape.keys())}"
    )
    for key, types in shape.items():
        if not isinstance(types, tuple):
            types = (types,)
        assert isinstance(item[key], types), (
            f"{where}.{key}: тип {type(item[key]).__name__} не из {types} "
            f"(значение: {str(item[key])[:80]})"
        )


# ---------------------------------------------------------------- snapshots

CATALOG_ITEM_SHAPE = {
    "id": str,
    "code": str,
    "name": str,
    "name_ru": (str, type(None)),
    "parameter_schema": dict,          # НЕ строка! (баг L10N: туда попадал name_ru)
    "allowed_outputs": list,
    "execution_contract": (dict, type(None)),
    "resource_requirements": (dict, type(None)),
    "category": str,
}


def test_operation_catalog_list_shape(client, token):
    r = client.get("/api/operation-catalog", headers=_auth(token))
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 13, f"ожидалось 13 операций каталога, got {len(items)}"
    for item in items:
        _assert_shape(item, CATALOG_ITEM_SHAPE, f"catalog[{item.get('code')}]")


def test_operation_catalog_detail_shape(client, token):
    r = client.get("/api/operation-catalog/get_from_storage", headers=_auth(token))
    assert r.status_code == 200, r.text
    item = r.json()
    _assert_shape(item, CATALOG_ITEM_SHAPE, "catalog/get_from_storage")
    # антирегресс бага L10N (смещение полей): схема содержит target_ref required
    assert item["parameter_schema"]["target_ref"]["required"] is True
    assert isinstance(item["name_ru"], str) and item["name_ru"]


def test_operation_catalog_detail_not_a_list_string_fields(client, token):
    """Все строковые поля — строки, а не чужие JSON-структуры (смещение)."""
    r = client.get("/api/operation-catalog/move", headers=_auth(token))
    assert r.status_code == 200, r.text
    item = r.json()
    for key in ("id", "code", "name", "category"):
        assert isinstance(item[key], str), f"{key} не строка: {str(item[key])[:80]}"
    assert isinstance(item["parameter_schema"], dict)
    assert isinstance(item["allowed_outputs"], list)


RECIPE_ITEM_KEYS = {
    "id", "template_id", "sku_id", "template_version",
    "parameters_json", "status", "created_by", "updated_at",
}


def test_recipes_list_shape(client, token):
    r = client.get("/api/recipes?limit=100", headers=_auth(token))
    assert r.status_code == 200, r.text
    for item in r.json():
        assert set(item.keys()) == RECIPE_ITEM_KEYS, (
            f"recipe keys {sorted(item.keys())} != {sorted(RECIPE_ITEM_KEYS)}"
        )
        assert isinstance(item["parameters_json"], dict)
        assert isinstance(item["id"], str)


TEMPLATE_ITEM_KEYS = {
    "id", "name", "version", "status", "ui_model", "created_by",
    "updated_at", "published_at", "audit_metadata",
}


def test_process_templates_list_shape(client, token):
    r = client.get("/api/process-templates?limit=100", headers=_auth(token))
    assert r.status_code == 200, r.text
    items = r.json()
    assert items, "на dev-БД должен быть хотя бы один шаблон (seed UX1)"
    for item in items:
        assert set(item.keys()) == TEMPLATE_ITEM_KEYS, (
            f"template keys {sorted(item.keys())} != {sorted(TEMPLATE_ITEM_KEYS)}"
        )
        assert isinstance(item["ui_model"], (dict, type(None)))


def test_audit_log_item_shape(client, token):
    r = client.get("/api/audit-log?limit=5", headers=_auth(token))
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "items" in payload
    for item in payload["items"]:
        assert set(item.keys()) == {
            "id", "ts", "actor_user_id", "actor_display", "actor_email",
            "actor_resolved", "org_id", "project_id", "session_id",
            "action", "entity_type", "entity_id", "status", "meta",
        }, f"audit item keys: {sorted(item.keys())}"
        assert isinstance(item["meta"], dict)


def test_sku_binding_shape(client, token):
    r = client.get("/api/sku-bindings", headers=_auth(token))
    assert r.status_code == 200, r.text
    for item in r.json():
        for key in ("id", "recipe_id", "status"):
            assert key in item, f"sku_binding: нет ключа {key}"
        assert isinstance(item.get("kitchen_ids"), (list, type(None)))


KITCHEN_ITEM_KEYS = {"id", "name", "location", "status", "equipment"}


def test_kitchens_shape(client, token):
    r = client.get("/api/kitchens", headers=_auth(token))
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) >= 3, "на dev-БД должно быть ≥3 кухонь (seed)"
    for item in items:
        assert set(item.keys()) == KITCHEN_ITEM_KEYS, (
            f"kitchen keys {sorted(item.keys())} != {sorted(KITCHEN_ITEM_KEYS)}"
        )
        assert isinstance(item["equipment"], list)
