"""Contract-тесты PATCH /api/users/me/preferences (strict body schema, контур F3).

Контекст (audit H1 / контур fix/canvas-overlays-preferences-409, срез F3):
pydantic-модель тела ранее принимала extra-поля молча (ignore-extra) — PATCH с
неверным форматом тела тихо обнулял preferences (data-loss инцидент). Контракт:
- неизвестные ТОП-УРОВНЕВЫЕ поля тела → 422 (extra='forbid');
- unknown keys в set/unset → 422 (regression-guard существующей проверки);
- 422 — документ НЕ изменён: GET до/после идентичен (version + preferences);
- ПОЛНЫЙ актуальный whitelist ключей (frontend inventory, evidence/F3-payload-inventory.md)
  проходит со валидными значениями — parameterизовано.

Прогон: cd backend && python -m pytest -m contract tests/contract/test_users_preferences_patch_contract.py -q
"""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.contract

PREFS_PATH = "/api/users/me/preferences"

# ПОЛНЫЙ whitelist ключей backend (users_preferences.py ALLOWED_KEYS) со валидными
# значениями — superset реальных payloads фронта (inventory F3):
# фронт шлёт: explorer.tree.expanded, explorer.status_filters.hidden,
# explorer.tobe_banner.dismissed_at; не шлёт, но backend принимает: collapsed,
# columns, density, saved_views.
ALLOWED_SET_CASES = [
    ("explorer.tree.expanded", {"org_a::ws_main": ["f1", "p2"]}),
    ("explorer.tree.collapsed", {"ws_legacy": ["f9"]}),
    ("explorer.status_filters.hidden", {"org_a::ws_main": ["done", "draft"]}),
    ("explorer.columns", {"dod": True, "owner": False}),
    ("explorer.density", "compact"),
    ("explorer.density", "comfortable"),
    ("explorer.saved_views", [{"id": "v1", "name": "Мой вид", "filters": {"status": "active"}}]),
    ("explorer.tobe_banner.dismissed_at", "1699999999999"),
]

# Невалидные тела: неизвестный топ-уровневый ключ (основной gap F3) + мусорные поля.
EXTRA_FIELD_BODIES = [
    {"base_version": 0, "set": {"explorer.density": "compact"}, "baseVersion": 0},
    {"base_version": 0, "set": {"explorer.density": "compact"}, "unexpected": "x"},
    {"base_version": 0, "set": {"explorer.density": "compact"}, "patch": {}},
]


@pytest.fixture(scope="module")
def _seed():
    from fastapi.testclient import TestClient

    from app.auth import create_access_token, create_user
    from app.main import app

    # Свой seed-пользователь с уникальным email: общая dev-БД может уже
    # содержать contract_fuzz@local от fuzz-прогонов.
    user = create_user(f"f3-contract-{uuid.uuid4().hex[:12]}@local", "password")
    token = create_access_token(user["id"])
    return TestClient(app), {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client(_seed):
    return _seed[0]


@pytest.fixture()
def auth(_seed):
    return _seed[1]


def _get_snapshot(client, auth):
    resp = client.get(PREFS_PATH, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.parametrize("body", EXTRA_FIELD_BODIES)
def test_extra_top_level_field_rejected_422_and_doc_unchanged(client, auth, body):
    """RED F3: extra-поля тела → 422, документ (GET до/после) идентичен."""
    client.patch(PREFS_PATH, json={"base_version": 0, "set": {"explorer.density": "compact"}}, headers=auth)
    before = _get_snapshot(client, auth)
    body = {**body, "base_version": before["version"]}

    resp = client.patch(PREFS_PATH, json=body, headers=auth)
    assert resp.status_code == 422, f"extra-поле {set(body) - {'base_version', 'set', 'unset'}} принято: {resp.status_code}"
    assert "detail" in resp.json()

    after = _get_snapshot(client, auth)
    assert after == before, "422 не должен менять документ"


def test_unknown_set_key_422_and_doc_unchanged(client, auth):
    client.patch(PREFS_PATH, json={"base_version": 0, "set": {"explorer.density": "compact"}}, headers=auth)
    before = _get_snapshot(client, auth)

    resp = client.patch(PREFS_PATH, json={"base_version": 0, "set": {"explorer.typo": {}}}, headers=auth)
    assert resp.status_code == 422
    assert "explorer.typo" in str(resp.json().get("detail", ""))

    resp2 = client.patch(PREFS_PATH, json={"base_version": 0, "unset": ["explorer.typo"]}, headers=auth)
    assert resp2.status_code == 422

    after = _get_snapshot(client, auth)
    assert after == before


@pytest.mark.parametrize("body", [
    {"set": {"explorer.density": "compact"}},                       # нет base_version
    {"base_version": "CURRENT", "set": ["explorer.density"]},       # set не объект
    {"base_version": "CURRENT", "unset": "explorer.density"},       # unset не массив
    {"base_version": "0", "set": {"explorer.density": "compact"}},  # base_version не int (строгость: строка не клампится)
])
def test_invalid_body_structure_422(client, auth, body):
    before = _get_snapshot(client, auth)
    body = {**body, "base_version": before["version"]} if body.get("base_version") == "CURRENT" else body
    resp = client.patch(PREFS_PATH, json=body, headers=auth)
    assert resp.status_code == 422, f"тело {body} принято: {resp.status_code}"


@pytest.mark.parametrize("key,value", ALLOWED_SET_CASES)
def test_allowed_keys_from_frontend_inventory_accepted(client, auth, key, value):
    """ПОЛНЫЙ whitelist (включая ключи, которые фронт пока не шлёт) проходит."""
    before = _get_snapshot(client, auth)
    resp = client.patch(PREFS_PATH, json={"base_version": before["version"], "set": {key: value}}, headers=auth)
    assert resp.status_code == 200, f"ключ {key} отклонён: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["version"] == before["version"] + 1
    assert data["preferences"][key] == value


def test_empty_set_and_unset_noop_patch(client, auth):
    """Граничный случай: пустой set+unset — валидный no-op (версия не двигается на 422)."""
    before = _get_snapshot(client, auth)
    resp = client.patch(PREFS_PATH, json={"base_version": before["version"], "set": {}, "unset": []}, headers=auth)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["preferences"] == before["preferences"]
    assert data["version"] == before["version"] + 1
