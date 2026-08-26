"""LLM0 — тесты LLM Gateway Service (app.ai.gateway).

Паттерн: реальная dev-БД (_pg_env, как test_api_contracts.py), HTTP-вызовы к
провайдерам замоканы (patch _deepseek_chat_request), Redis — fake-клиент.

Покрытие гейтов:
- гейт 3 (кэш = 0 токенов на повтор): complete_cached hit → cached=true, tokens=0;
- гейт 4 (деградация): no_provider без ключей, disabled-флаг, rate_limited-лимит;
- фолбэк-цепочка по priority + env-фолбэк при пустой таблице;
- llm_usage пишется всегда (ok/error/cached/rate_limited/disabled/no_provider).

Запуск — из корня репо: python -m pytest backend/tests/test_llm_gateway.py -q
"""
import os
import sys
import time
import uuid
from unittest import mock

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

DATABASE_URL = os.environ.get("E2_TEST_DATABASE_URL", "postgresql://fpc:fpc@localhost:5432/processmap")

from backend.app.ai import gateway, llm_store  # noqa: E402


@pytest.fixture(autouse=True)
def _pg_env():
    old_env = {k: os.environ.get(k) for k in ("DATABASE_URL", "FPC_DB_BACKEND", "DEEPSEEK_API_KEY")}
    os.environ["DATABASE_URL"] = DATABASE_URL
    os.environ["FPC_DB_BACKEND"] = "postgres"
    os.environ.pop("DEEPSEEK_API_KEY", None)
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
def sandbox():
    """Изолированный org + feature; полная уборка строк после теста."""
    import psycopg

    org_id = f"org_llmtest_{uuid.uuid4().hex[:8]}"
    feature = f"test_gw_{uuid.uuid4().hex[:8]}"
    yield {"org_id": org_id, "feature": feature}
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM llm_providers WHERE org_id = %s", (org_id,))
            cur.execute("DELETE FROM llm_models WHERE org_id = %s", (org_id,))
            cur.execute("DELETE FROM llm_feature_models WHERE org_id = %s", (org_id,))
            cur.execute("DELETE FROM llm_prompts WHERE feature = %s", (feature,))
            cur.execute("DELETE FROM llm_feature_flags WHERE feature = %s", (feature,))
            cur.execute(
                "DELETE FROM llm_usage WHERE org_id = %s OR feature = %s", (org_id, feature),
            )
        conn.commit()


class _FakeRedis:
    """Минимальный клиент под cache_get_json/cache_set_json (get/setex)."""

    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, value):
        self.store[key] = value
        return True


def _llm_response(text="ok-text", model="deepseek-chat", pt=11, ct=7):
    return {
        "model": model,
        "choices": [{"message": {"content": text}}],
        "usage": {"prompt_tokens": pt, "completion_tokens": ct},
    }


def _usage_rows(feature):
    import psycopg

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, cached, prompt_tokens, completion_tokens, provider_id "
                "FROM llm_usage WHERE feature = %s ORDER BY id",
                (feature,),
            )
            cols = ["status", "cached", "prompt_tokens", "completion_tokens", "provider_id"]
            return [dict(zip(cols, r)) for r in cur.fetchall()]


# ------------------------------------------------------------------- цепочка

def test_fallback_chain_by_priority(sandbox):
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p-primary", base_url="https://a", model="m1",
                              api_key="key-a", priority=10)
    p2 = llm_store.create_provider(org_id=org, name="p-backup", base_url="https://b", model="m2",
                                   api_key="key-b", priority=20)
    calls = []

    def _fake(**kwargs):
        calls.append(kwargs["api_key"])
        if kwargs["api_key"] == "key-a":
            raise RuntimeError("primary is down")
        return _llm_response(model="m2")

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(feature, {"x": 1}, org_id=org)

    assert result["ok"] is True and result["status"] == "ok"
    assert calls == ["key-a", "key-b"], "порядок фолбэка = priority ASC"
    assert result["provider_id"] == p2["id"] and result["model"] == "m2"
    assert result["usage"] == {"prompt_tokens": 11, "completion_tokens": 7}
    assert result["fallback"] is True, "ответил НЕ первый провайдер цепочки → fallback=True (LLM4 S8)"
    rows = _usage_rows(feature)
    assert [r["status"] for r in rows].count("error") == 1, "ошибка p1 записана"
    assert rows[-1]["status"] == "ok" and rows[-1]["prompt_tokens"] == 11


def test_timeout_fails_fast_to_backup_provider(sandbox):
    """Таймаут/обрыв соединения у первого провайдера → сразу failover на backup без retry."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    p1 = llm_store.create_provider(org_id=org, name="p-timeout", base_url="https://a", model="m1",
                                   api_key="key-a", priority=10)
    p2 = llm_store.create_provider(org_id=org, name="p-backup", base_url="https://b", model="m2",
                                   api_key="key-b", priority=20)
    calls = []

    def _fake(**kwargs):
        calls.append(kwargs["api_key"])
        if kwargs["api_key"] == "key-a":
            raise requests.exceptions.Timeout("primary timed out")
        return _llm_response(model="m2")

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(feature, {"x": 1}, org_id=org)

    assert result["ok"] is True and result["status"] == "ok"
    assert calls == ["key-a", "key-b"], "timeout primary → один вызов, затем backup"
    assert result["provider_id"] == p2["id"] and result["model"] == "m2"
    assert result["fallback"] is True
    rows = _usage_rows(feature)
    assert [r["status"] for r in rows].count("error") == 1, "ошибка p-timeout записана"
    assert rows[-1]["status"] == "ok" and rows[-1]["provider_id"] == p2["id"]


def test_json_mode_passes_response_format(sandbox):
    """json_mode=True → _deepseek_chat_request получает response_format=json_object."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="m1",
                              api_key="key-a", priority=10)
    captured = {}

    def _fake(**kwargs):
        captured.update(kwargs)
        return _llm_response()

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(feature, {"x": 1}, org_id=org, json_mode=True)

    assert result["ok"] is True
    assert captured.get("response_format") == {"type": "json_object"}


# ------------------------------------------------------- реестр моделей (016)

def test_registry_default_model_wins_over_provider_model(sandbox):
    """feat/llm-model-config: default реестра уходит в payload вместо provider.model."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="provider-model",
                              api_key="key-a", priority=10)
    llm_store.create_model(org_id=org, model_name="registry-default", is_default=True, actor="t")
    captured = {}

    def _fake(**kwargs):
        captured.update(kwargs)
        return _llm_response(model=str(kwargs.get("model") or ""))

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(feature, {"x": 1}, org_id=org)
    assert result["ok"] is True
    assert captured["model"] == "registry-default"
    assert result["model"] == "registry-default"
    llm_store.invalidate_model_cache()


def test_registry_feature_override_wins_over_default(sandbox):
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="provider-model",
                              api_key="key-a", priority=10)
    llm_store.create_model(org_id=org, model_name="registry-default", is_default=True, actor="t")
    override = llm_store.create_model(org_id=org, model_name="override-model", actor="t")
    llm_store.set_feature_model_override(feature, override["id"], org_id=org)
    captured = {}

    def _fake(**kwargs):
        captured.update(kwargs)
        return _llm_response(model=str(kwargs.get("model") or ""))

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(feature, {"x": 1}, org_id=org)
    assert result["ok"] is True
    assert captured["model"] == "override-model", "per-feature override > default"
    llm_store.invalidate_model_cache()


def test_empty_registry_falls_back_to_provider_model(sandbox):
    """Пустой реестр (до миграции/без записей) → старое поведение: provider.model."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="provider-model",
                              api_key="key-a", priority=10)
    captured = {}

    def _fake(**kwargs):
        captured.update(kwargs)
        return _llm_response(model=str(kwargs.get("model") or ""))

    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=_fake):
        result = gateway.complete(feature, {"x": 1}, org_id=org)
    assert result["ok"] is True
    assert captured["model"] == "provider-model"
    llm_store.invalidate_model_cache()


def test_fallback_false_when_primary_answers(sandbox):
    """LLM4 S8: первый провайдер ответил → fallback=False."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p-primary", base_url="https://a", model="m1",
                              api_key="key-a", priority=10)
    with mock.patch.object(gateway, "_deepseek_chat_request", return_value=_llm_response()):
        result = gateway.complete(feature, {"x": 1}, org_id=org)
    assert result["ok"] is True and result["fallback"] is False


def test_org_default_fallback_for_org_without_provider(sandbox):
    """Bug B: org без своих провайдеров получает org_default fallback."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    default_p = {
        "id": "llmprov_org_default_fb",
        "org_id": "org_default",
        "name": "org-default-fb",
        "base_url": "https://a",
        "model": "m-fb",
        "api_key": "key-org-default",
        "priority": 10,
        "enabled": True,
    }
    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[default_p]) as eff, \
         mock.patch.object(gateway, "_deepseek_chat_request", return_value=_llm_response(model="m-fb")):
        result = gateway.complete(feature, {"x": 1}, org_id=org)
    assert result["ok"] is True and result["status"] == "ok"
    assert result["provider_id"] == default_p["id"]
    assert result["model"] == "m-fb"
    assert result["fallback"] is True, "использован org_default fallback → fallback=True"
    eff.assert_called_once_with(org)
    rows = _usage_rows(feature)
    assert rows[-1]["provider_id"] == default_p["id"]
    assert rows[-1]["status"] == "ok"


def test_fallback_true_for_env_provider(sandbox):
    """LLM4 S8: env-фолбэк — всегда fallback=True (в т.ч. из кэша)."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    fake_redis = _FakeRedis()
    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[]), \
         mock.patch.object(gateway.llm_store, "any_enabled_provider", return_value=False), \
         mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": "env-key"}), \
         mock.patch.object(gateway, "_deepseek_chat_request", return_value=_llm_response()):
        first = gateway.complete_cached(feature, "digest-fb-1", {"x": 1}, org_id=org, cache_client=fake_redis)
    assert first["ok"] is True and first["fallback"] is True and first["cached"] is False
    # попадание в redis-кэш сохраняет признак fallback (бейдж не теряется)
    second = gateway.complete_cached(feature, "digest-fb-1", {"x": 1}, org_id=org, cache_client=fake_redis)
    assert second["cached"] is True and second["fallback"] is True


def test_all_providers_failed(sandbox):
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="m",
                              api_key="key-a", priority=10)
    with mock.patch.object(gateway, "_deepseek_chat_request", side_effect=RuntimeError("down")):
        result = gateway.complete(feature, {}, org_id=org)
    assert result["ok"] is False and result["status"] == "error"
    assert "p1" in result["error"]


# ---------------------------------------------------------------- деградация

def test_no_provider_without_keys(sandbox):
    """Гейт 4: нет enabled-провайдеров с ключом и нет env → no_provider, без вызова."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[]), \
         mock.patch.object(gateway, "_deepseek_chat_request") as mocked:
        result = gateway.complete(feature, {}, org_id=org)
    assert result["status"] == "no_provider"
    mocked.assert_not_called()
    assert _usage_rows(feature)[-1]["status"] == "no_provider"


def test_env_fallback_when_table_empty(sandbox):
    """Env DEEPSEEK_API_KEY — фолбэк только при полном отсутствии enabled-провайдеров."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    with mock.patch.object(gateway.llm_store, "effective_providers_with_key", return_value=[]), \
         mock.patch.object(gateway.llm_store, "any_enabled_provider", return_value=False), \
         mock.patch.dict(os.environ, {"DEEPSEEK_API_KEY": "env-key"}), \
         mock.patch.object(gateway, "_deepseek_chat_request", return_value=_llm_response()) as mocked:
        result = gateway.complete(feature, {}, org_id=org)
    assert result["ok"] is True and result["provider_id"] == "env_fallback"
    assert result["fallback"] is True, "env-фолбэк = fallback (LLM4 S8)"
    assert mocked.call_args.kwargs["api_key"] == "env-key"


def test_feature_disabled(sandbox):
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.patch_feature_flag(feature, enabled=False)
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="m",
                              api_key="key-a")
    with mock.patch.object(gateway, "_deepseek_chat_request") as mocked:
        result = gateway.complete(feature, {}, org_id=org)
    assert result["status"] == "disabled"
    mocked.assert_not_called()
    assert _usage_rows(feature)[-1]["status"] == "disabled"


def test_rate_limited(sandbox):
    """Гейт 4: суточный лимит исчерпан → rate_limited (не 500), без вызова LLM."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.patch_feature_flag(feature, enabled=True, daily_token_limit=10)
    llm_store.record_usage(org_id=org, feature=feature, prompt_tokens=8, completion_tokens=8,
                           ts=int(time.time()))
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="m",
                              api_key="key-a")
    with mock.patch.object(gateway, "_deepseek_chat_request") as mocked:
        result = gateway.complete(feature, {}, org_id=org)
    assert result["status"] == "rate_limited"
    assert result["used_tokens_24h"] >= 16 and result["daily_token_limit"] == 10
    mocked.assert_not_called()
    assert _usage_rows(feature)[-1]["status"] == "rate_limited"


# ---------------------------------------------------------------------- кэш

def test_complete_cached_hit_zero_tokens(sandbox):
    """Гейт 3: повтор неизменного запроса = cached=true, 0 токенов, LLM не вызывается."""
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="m-cache",
                              api_key="key-a")
    fake_redis = _FakeRedis()
    with mock.patch.object(gateway, "_deepseek_chat_request",
                           return_value=_llm_response(model="m-cache")) as mocked:
        r1 = gateway.complete_cached(feature, "digest-1", {"a": 1}, org_id=org, cache_client=fake_redis)
        r2 = gateway.complete_cached(feature, "digest-1", {"a": 1}, org_id=org, cache_client=fake_redis)

    assert r1["ok"] is True and r1["cached"] is False
    assert r2["ok"] is True and r2["cached"] is True
    assert r2["text"] == r1["text"] and r2["model"] == "m-cache"
    assert r2["usage"] == {"prompt_tokens": 0, "completion_tokens": 0}, "cache-hit = 0 токенов"
    assert mocked.call_count == 1, "LLM вызван один раз"
    cached_rows = [r for r in _usage_rows(feature) if r["cached"]]
    assert len(cached_rows) == 1 and cached_rows[0]["prompt_tokens"] == 0 \
        and cached_rows[0]["completion_tokens"] == 0, "llm_usage: cached=true, tokens=0"


def test_complete_cached_miss_per_digest(sandbox):
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="m",
                              api_key="key-a")
    fake_redis = _FakeRedis()
    with mock.patch.object(gateway, "_deepseek_chat_request",
                           return_value=_llm_response()) as mocked:
        gateway.complete_cached(feature, "digest-1", {}, org_id=org, cache_client=fake_redis)
        gateway.complete_cached(feature, "digest-2", {}, org_id=org, cache_client=fake_redis)
    assert mocked.call_count == 2, "другой digest = новый вызов"


# --------------------------------------------------------------------- промт

def test_active_prompt_used_and_versioned(sandbox):
    org, feature = sandbox["org_id"], sandbox["feature"]
    llm_store.create_provider(org_id=org, name="p1", base_url="https://a", model="m",
                              api_key="key-a")
    p1 = llm_store.create_prompt_draft(feature=feature, system="SYS1", template="T1 {input}",
                                       max_tokens=111)
    llm_store.activate_prompt(p1["id"])
    with mock.patch.object(gateway, "_deepseek_chat_request",
                           return_value=_llm_response()) as mocked:
        result = gateway.complete(feature, {"k": "v"}, org_id=org)
    call = mocked.call_args.kwargs
    assert call["messages"][0] == {"role": "system", "content": "SYS1"}
    assert '{"k": "v"}' in call["messages"][1]["content"], "{input} → payload_json"
    assert call["max_tokens"] == 111
    assert result["prompt_version"] == 1

    # новая версия → activate → gateway берёт её (гейт 2, service-уровень)
    p2 = llm_store.create_prompt_draft(feature=feature, system="SYS2", template="T2")
    llm_store.activate_prompt(p2["id"])
    with mock.patch.object(gateway, "_deepseek_chat_request",
                           return_value=_llm_response()) as mocked2:
        gateway.complete(feature, {}, org_id=org)
    assert mocked2.call_args.kwargs["messages"][0]["content"] == "SYS2"
    assert llm_store.get_prompt(p1["id"])["status"] == "archive"
    assert llm_store.get_active_prompt(feature)["id"] == p2["id"]


def test_prompt_rollback_service(sandbox):
    """Гейт 2 (service-уровень): rollback активирует последнюю archived-версию."""
    feature = sandbox["feature"]
    v1 = llm_store.create_prompt_draft(feature=feature, system="S1")
    llm_store.activate_prompt(v1["id"])
    v2 = llm_store.create_prompt_draft(feature=feature, system="S2")
    llm_store.activate_prompt(v2["id"])
    target = llm_store.rollback_target(feature)
    assert target is not None and target["id"] == v1["id"]
    restored = llm_store.activate_prompt(target["id"])
    assert restored["version"] == 1 and restored["status"] == "active"
    assert llm_store.get_prompt(v2["id"])["status"] == "archive"


def test_effective_providers_with_key_prefers_org_then_org_default(sandbox):
    """llm_store.effective_providers_with_key: org-провайдер > org_default fallback > пусто."""
    org = sandbox["org_id"]
    # org_default provider
    llm_store.create_provider(org_id="org_default", name="default-p", base_url="https://d", model="m-d",
                              api_key="key-d", priority=10)
    # org-specific provider
    llm_store.create_provider(org_id=org, name="own-p", base_url="https://o", model="m-o",
                              api_key="key-o", priority=20)

    own = llm_store.effective_providers_with_key(org)
    assert len(own) == 1 and own[0]["name"] == "own-p"
    assert own[0]["api_key"] == "key-o"

    # org без своих провайдеров получает org_default
    other_org = f"{org}_other"
    fallback = llm_store.effective_providers_with_key(other_org)
    assert len(fallback) == 1 and fallback[0]["name"] == "default-p"

    # org_default без провайдеров — пусто
    no_provider_org = f"{org}_empty"
    llm_store.delete_provider(own[0]["id"])
    llm_store.delete_provider(fallback[0]["id"])
    assert llm_store.effective_providers_with_key(no_provider_org) == []
