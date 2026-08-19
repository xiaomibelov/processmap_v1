"""Тесты контура feature/endpoint-regression-scanner (backend).

Паттерн: TestClient + create_access_token + create_user (как test_api_docs_access.py),
per-test sqlite через tests/conftest.py:isolate_process_db.

Прогон НЕ ходит в реальный localhost:8000: executor (функция HTTP-запроса)
подменяется фейком через monkeypatch service.default_executor.

Покрытие: 401/403/202, deploy-token (валидный/невалидный/выключен), 409-дубль,
дебаунс deploy-триггера, флаг ENDPOINT_CHECK_RUN_ON_DEPLOY=0, дифф-логика,
классификация LLM-конвертов, fingerprint-нормализация.
"""
import json
import threading
import time

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.endpoint_check import diff as diff_mod
from app.endpoint_check import service, store
from app.main import app

RUN_PATH = "/api/admin/endpoint-check/run"
STATUS_PATH = "/api/admin/endpoint-check/status"
RUNS_PATH = "/api/admin/endpoint-check/runs"

FAKE_SPEC = {
    "openapi": "3.1.0",
    "info": {"title": "t", "version": "0"},
    "paths": {
        "/api/ok-thing": {"get": {"operationId": "ok_thing_get", "responses": {"200": {}}}},
        "/api/fail-thing": {"get": {"operationId": "fail_thing_get", "responses": {"200": {}}}},
        "/api/domain-thing": {"get": {"operationId": "domain_thing_get", "responses": {"200": {}}}},
        "/api/sessions/{session_id}": {
            "get": {
                "operationId": "get_session_api_sessions__session_id__get",
                "parameters": [{"name": "session_id", "in": "path", "required": True}],
                "responses": {"200": {}},
            }
        },
        "/api/unknown/{unknown_id}": {
            "get": {
                "operationId": "unknown_get",
                "parameters": [{"name": "unknown_id", "in": "path", "required": True}],
                "responses": {"200": {}},
            }
        },
        "/api/mutate-thing": {"post": {"operationId": "mutate_thing_post", "responses": {"200": {}}}},
    },
}


def _fake_executor(url_path, query, token, timeout_s):
    """Фейковый HTTP: спека + детерминированные ответы по url_path."""
    if url_path == "/api/openapi.json":
        return 200, 1.0, json.dumps(FAKE_SPEC).encode(), ""
    if url_path == "/api/ok-thing":
        return 200, 2.0, b'{"ok": true}', ""
    if url_path == "/api/fail-thing":
        return 500, 3.0, b'{"detail": "boom", "request_id": "req-123"}', ""
    if url_path == "/api/domain-thing":
        return 200, 2.0, b'{"ok": false, "error": "rag_disabled"}', ""
    if url_path.startswith("/api/sessions/"):
        return 200, 2.0, b'{"id": "s1"}', ""
    return 404, 1.0, b'{"detail": "not found"}', ""


class _BlockingExecutor:
    """Блокируется на первом запросе после спеки, пока тест не отпустит."""

    def __init__(self):
        self.release = threading.Event()

    def __call__(self, url_path, query, token, timeout_s):
        if url_path == "/api/openapi.json":
            return 200, 1.0, json.dumps(FAKE_SPEC).encode(), ""
        self.release.wait(15)
        return 200, 1.0, b"{}", ""


@pytest.fixture
def client():
    return TestClient(app)


def _admin_token() -> str:
    user = create_user(f"ec_admin_{time.time_ns()}@local", "password", is_admin=True)
    return create_access_token(str(user["id"]))


def _viewer_token() -> str:
    user = create_user(f"ec_viewer_{time.time_ns()}@local", "password")
    return create_access_token(str(user["id"]))


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def _wait_run_finished(run_id: str, timeout_s: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        run = store.get_run(run_id)
        if run and run["status"] in ("done", "failed"):
            return run
        time.sleep(0.05)
    raise AssertionError(f"run {run_id} не завершился за {timeout_s}s")


# ------------------------------------------------------------------ 401/403
def test_401_without_token(client):
    assert client.post(RUN_PATH).status_code == 401
    assert client.get(STATUS_PATH).status_code == 401
    assert client.get(RUNS_PATH).status_code == 401
    assert client.get(f"{RUNS_PATH}/ecr_nope").status_code == 401


def test_403_for_viewer(client):
    token = _viewer_token()
    assert client.get(STATUS_PATH, headers=_auth(token)).status_code == 403
    assert client.get(RUNS_PATH, headers=_auth(token)).status_code == 403
    assert client.get(f"{RUNS_PATH}/ecr_nope", headers=_auth(token)).status_code == 403
    assert client.post(RUN_PATH, headers=_auth(token)).status_code == 403


# ------------------------------------------------------------------ manual run (admin)
def test_run_202_admin_and_results(client, monkeypatch):
    monkeypatch.setattr(service, "default_executor", _fake_executor)
    token = _admin_token()
    resp = client.post(RUN_PATH, headers=_auth(token))
    assert resp.status_code == 202, resp.text
    payload = resp.json()
    assert payload["trigger"] == "manual"
    run_id = payload["run_id"]

    run = _wait_run_finished(run_id)
    assert run["status"] == "done", run.get("error")

    results = store.list_results(run_id)
    by_op = {r["operation_id"]: r for r in results}
    # ok / http_error / реальный session_id подставлен из БД (пустой БД → out_of_scope).
    assert by_op["ok_thing_get"]["category"] == "ok"
    assert by_op["ok_thing_get"]["diff_status"] == "new_endpoint"
    assert by_op["fail_thing_get"]["category"] == "http_error"
    assert by_op["fail_thing_get"]["http_status"] == 500
    assert by_op["fail_thing_get"]["body_excerpt"], "для 5xx хранится body_excerpt"
    assert by_op["fail_thing_get"]["fingerprint"], "для ошибок считается fingerprint"
    # session_id в пустой тестовой БД не резолвится → out_of_scope в blind_zone, не в results.
    assert "get_session_api_sessions__session_id__get" not in by_op

    summary = run["summary_json"]
    assert summary["counts"]["ok"] >= 1
    assert summary["counts"]["http_error"] == 1
    assert summary["not_scanned"]["operation_ids"] == ["mutate_thing_post"]
    blind_ops = {b["operation_id"] for b in summary["blind_zone"]}
    assert "unknown_get" in blind_ops, "неразрешимые path-параметры → out_of_scope"
    assert "get_session_api_sessions__session_id__get" in blind_ops

    # GET detail отдаёт результаты и сводку.
    detail = client.get(f"{RUNS_PATH}/{run_id}", headers=_auth(token))
    assert detail.status_code == 200
    body = detail.json()
    assert body["run"]["id"] == run_id
    assert len(body["results"]) == len(results)

    # status: активного нет, last_run заполнен счётчиками диффа.
    status = client.get(STATUS_PATH, headers=_auth(token))
    assert status.status_code == 200
    status_body = status.json()
    assert status_body["active"] is None
    assert status_body["last_run"]["id"] == run_id
    assert status_body["last_run"]["diff"].get("new_endpoint", 0) >= 1

    # список прогонов
    runs = client.get(RUNS_PATH, headers=_auth(token))
    assert runs.status_code == 200
    assert any(item["id"] == run_id for item in runs.json()["items"])


def test_run_detail_404(client):
    token = _admin_token()
    resp = client.get(f"{RUNS_PATH}/ecr_missing", headers=_auth(token))
    assert resp.status_code == 404


# ------------------------------------------------------------------ deploy-token
def test_deploy_token_valid(client, monkeypatch):
    monkeypatch.setattr(service, "default_executor", _fake_executor)
    monkeypatch.setenv("ENDPOINT_CHECK_DEPLOY_TOKEN", "deploy-secret")
    monkeypatch.setenv("ENDPOINT_CHECK_RUN_ON_DEPLOY", "1")
    monkeypatch.setenv("ENDPOINT_CHECK_DEPLOY_DELAY_S", "0")
    # Deploy-trigger минтует токен первому активному is_admin пользователю БД.
    create_user(f"ec_deploy_admin_{time.time_ns()}@local", "password", is_admin=True)
    resp = client.post(RUN_PATH, headers={"X-Deploy-Token": "deploy-secret"})
    assert resp.status_code == 202, resp.text
    assert resp.json()["trigger"] == "deploy"
    run = _wait_run_finished(resp.json()["run_id"])
    assert run["status"] == "done", run.get("error")


def test_deploy_token_invalid(client, monkeypatch):
    monkeypatch.setenv("ENDPOINT_CHECK_DEPLOY_TOKEN", "deploy-secret")
    resp = client.post(RUN_PATH, headers={"X-Deploy-Token": "wrong"})
    assert resp.status_code == 401


def test_deploy_token_env_empty_disables(client, monkeypatch):
    monkeypatch.delenv("ENDPOINT_CHECK_DEPLOY_TOKEN", raising=False)
    resp = client.post(RUN_PATH, headers={"X-Deploy-Token": "anything"})
    assert resp.status_code == 401


def test_deploy_skipped_when_flag_off(client, monkeypatch):
    monkeypatch.setenv("ENDPOINT_CHECK_DEPLOY_TOKEN", "deploy-secret")
    monkeypatch.setenv("ENDPOINT_CHECK_RUN_ON_DEPLOY", "0")
    resp = client.post(RUN_PATH, headers={"X-Deploy-Token": "deploy-secret"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "skipped": True, "reason": "run_on_deploy disabled"}


# ------------------------------------------------------------------ 409 и дебаунс
def test_409_when_scan_running(client, monkeypatch):
    blocker = _BlockingExecutor()
    monkeypatch.setattr(service, "default_executor", blocker)
    token = _admin_token()
    first = client.post(RUN_PATH, headers=_auth(token))
    assert first.status_code == 202, first.text
    run_id = first.json()["run_id"]
    try:
        # Ждём, пока прогон уйдёт в running (спека уже запрошена, executor заблокирован).
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            run = store.get_run(run_id)
            if run and run["status"] == "running":
                break
            time.sleep(0.05)
        second = client.post(RUN_PATH, headers=_auth(token))
        assert second.status_code == 409
        assert second.json()["detail"] == "scan_already_running"
        assert second.json()["run_id"] == run_id
    finally:
        blocker.release.set()
    run = _wait_run_finished(run_id)
    assert run["status"] in ("done", "failed")


def test_deploy_debounce(client, monkeypatch):
    # m3: никаких daemon-thread со sleep(300) — delay=0, прогон держим на
    # blocking-executor и отпускаем в finally, живых потоков после теста нет.
    blocker = _BlockingExecutor()
    monkeypatch.setattr(service, "default_executor", blocker)
    monkeypatch.setenv("ENDPOINT_CHECK_DEPLOY_TOKEN", "deploy-secret")
    monkeypatch.setenv("ENDPOINT_CHECK_RUN_ON_DEPLOY", "1")
    monkeypatch.setenv("ENDPOINT_CHECK_DEPLOY_DELAY_S", "0")
    monkeypatch.setenv("ENDPOINT_CHECK_DEPLOY_DEBOUNCE_S", "300")
    create_user(f"ec_debounce_admin_{time.time_ns()}@local", "password", is_admin=True)
    headers = {"X-Deploy-Token": "deploy-secret"}
    first = client.post(RUN_PATH, headers=headers)
    assert first.status_code == 202, first.text
    run_id = first.json()["run_id"]
    try:
        # Дебаунс покрывает и pending, и running deploy-прогоны в окне —
        # порядок второго POST относительно старта thread не важен.
        second = client.post(RUN_PATH, headers=headers)
        assert second.status_code == 202, second.text
        assert second.json().get("debounced") is True
        assert second.json()["run_id"] == run_id
        assert store.count_runs() == 1
    finally:
        blocker.release.set()
    run = _wait_run_finished(run_id)
    assert run["status"] in ("done", "failed")


# ------------------------------------------------------------------ B1: stale-recovery
def test_stale_run_recovered_by_started_at(client, monkeypatch):
    """Зомби-прогон (рестарт контейнера во время прогона): старый started_at →
    не 409, старый run переводится в failed, новый запускается."""
    monkeypatch.setattr(service, "default_executor", _fake_executor)
    token = _admin_token()
    stale = store.create_run(trigger="manual", requested_by="")
    stale_ts = int(stale["started_at"]) - int(service.deploy_delay_s() + service.budget_s() + service.STALE_MARGIN_S) - 10
    store.update_run(stale["id"], started_at=stale_ts)

    resp = client.post(RUN_PATH, headers=_auth(token))
    assert resp.status_code == 202, resp.text
    run = _wait_run_finished(resp.json()["run_id"])
    assert run["status"] == "done", run.get("error")

    stale_after = store.get_run(stale["id"])
    assert stale_after["status"] == "failed"
    assert stale_after["error"] == "stale run recovered"


def test_stale_run_recovered_by_heartbeat():
    """started_at свежий, но heartbeat прогресса протух → тоже stale."""
    stale = store.create_run(trigger="manual", requested_by="")
    old_hb = int(stale["started_at"]) - int(service.request_timeout_s() * 2 + service.STALE_MARGIN_S) - 10
    store.update_run(stale["id"], summary_json={"heartbeat_at": old_hb})
    assert service.get_active_run() is None
    assert store.get_run(stale["id"])["status"] == "failed"


def test_fresh_run_is_not_stale():
    run = store.create_run(trigger="manual", requested_by="")
    active = service.get_active_run()
    assert active is not None and active["id"] == run["id"]


# ------------------------------------------------------------------ M1: TTL self-scan токена
def test_self_scan_token_ttl_covers_budget(monkeypatch):
    from app.auth import decode_access_token

    monkeypatch.setenv("ENDPOINT_CHECK_BUDGET_S", "900")
    captured = {}
    real_create = service.create_access_token

    def _spy(uid, ttl_seconds=None):
        captured["ttl_seconds"] = ttl_seconds
        return real_create(uid, ttl_seconds=ttl_seconds)

    monkeypatch.setattr(service, "create_access_token", _spy)
    admin = create_user(f"ec_ttl_admin_{time.time_ns()}@local", "password", is_admin=True)
    run = store.create_run(trigger="manual", requested_by=str(admin["id"]))
    service.execute_run(run["id"], executor=_fake_executor)
    assert store.get_run(run["id"])["status"] == "done"
    assert captured["ttl_seconds"] >= int(service.budget_s()) + 900
    # И сам токен действительно живёт дольше бюджета прогона.
    payload = decode_access_token(real_create(str(admin["id"]), ttl_seconds=captured["ttl_seconds"]))
    assert payload["exp"] - payload["iat"] >= int(service.budget_s()) + 900


# ------------------------------------------------------------------ m4: частичные результаты
def test_partial_results_saved_on_executor_failure(client, monkeypatch):
    """Executor падает на одном из запросов → run failed, но уже собранные
    результаты сохранены (с diff_status)."""

    def _flaky_executor(url_path, query, token, timeout_s):
        if url_path == "/api/openapi.json":
            return 200, 1.0, json.dumps(FAKE_SPEC).encode(), ""
        if url_path == "/api/fail-thing":
            # Падает последним (детерминированность: остальные мгновенные).
            time.sleep(0.3)
            raise RuntimeError("executor boom")
        return 200, 1.0, b'{"ok": true}', ""

    monkeypatch.setattr(service, "default_executor", _flaky_executor)
    token = _admin_token()
    resp = client.post(RUN_PATH, headers=_auth(token))
    assert resp.status_code == 202, resp.text
    run = _wait_run_finished(resp.json()["run_id"])
    assert run["status"] == "failed"
    assert "executor boom" in run["error"]
    results = store.list_results(run["id"])
    assert results, "частичные результаты должны быть сохранены"
    assert all(r["operation_id"] != "fail_thing_get" for r in results)
    assert all(r["diff_status"] for r in results), "diff проставлен и у частичных результатов"


# ------------------------------------------------------------------ diff-логика (чистая функция)
def _res(op_id, category, fingerprint="fp1", status=200):
    return {"operation_id": op_id, "category": category, "fingerprint": fingerprint, "http_status": status}


def test_diff_matrix():
    prev = [
        _res("ok_stays", "ok"),
        _res("err_stays", "http_error", "fpA", 500),
        _res("err_fp_changed", "http_error", "fpA", 500),
        _res("err_fixed", "http_error", "fpA", 500),
        _res("ok_to_err", "ok"),
        _res("dom_stays", "domain_error", "fpD"),
        _res("dom_fixed", "domain_error", "fpD"),
        _res("ok_to_dom", "ok"),
        _res("err_to_dom", "http_error", "fpE", 502),
        _res("dom_to_err", "domain_error", "fpF"),
    ]
    cur = [
        _res("ok_stays", "ok"),
        _res("err_stays", "http_error", "fpA", 500),
        _res("err_fp_changed", "http_error", "fpB", 500),
        _res("err_fixed", "ok"),
        _res("ok_to_err", "http_error", "fpC", 500),
        _res("dom_stays", "domain_error", "fpD"),
        _res("dom_fixed", "ok"),
        _res("ok_to_dom", "domain_error", "fpD2"),
        _res("err_to_dom", "domain_error", "fpE2"),
        _res("dom_to_err", "timeout", "fpG", 0),
        _res("brand_new", "ok"),
    ]
    out = diff_mod.compute_diff(prev, cur)
    assert out["ok_stays"] == ("ok", "")
    assert out["err_stays"] == ("still_failing", "")
    assert out["err_fp_changed"] == ("still_failing", "fingerprint changed")
    assert out["err_fixed"][0] == "fixed"
    assert out["ok_to_err"][0] == "new_error"
    assert out["dom_stays"] == ("still_domain_error", "")
    assert out["dom_fixed"][0] == "domain_fixed"
    assert out["ok_to_dom"] == ("new_domain_error", "")
    assert out["err_to_dom"][0] == "new_domain_error"
    assert "HTTP-ошибка" in out["err_to_dom"][1]
    assert out["dom_to_err"][0] == "new_error"
    assert "доменная" in out["dom_to_err"][1]
    assert out["brand_new"][0] == "new_endpoint"


def test_diff_no_prev_run():
    out = diff_mod.compute_diff([], [_res("a", "http_error", "fp", 500)])
    assert out["a"][0] == "new_endpoint"
    assert "http_error" in out["a"][1]


# ------------------------------------------------------------------ классификация и fingerprint
def test_classify_llm_envelope_domain_error():
    category, note = service.classify(
        "rag_search_api_rag_search_get", 200, "", b'{"ok": false, "error": "rag_disabled"}',
        {"rag_search_api_rag_search_get"}, {},
    )
    assert category == "domain_error"
    assert "rag_disabled" in note
    # 200 без конверта — ok, даже для envelope-операции.
    category2, _ = service.classify(
        "rag_search_api_rag_search_get", 200, "", b'{"ok": true}', {"rag_search_api_rag_search_get"}, {}
    )
    assert category2 == "ok"
    # spec_gap статус — ok с пометкой.
    category3, note3 = service.classify("op", 404, "", b"{}", set(), {"op": {404}})
    assert category3 == "http_error"
    assert "spec_gap" in note3


def test_fingerprint_strips_dynamics():
    fp1 = service.error_fingerprint("GET", "/api/x", 500, b'{"detail": "boom", "request_id": "abc-1", "at": "2026-08-19T10:00:00Z"}')
    fp2 = service.error_fingerprint("GET", "/api/x", 500, b'{"detail": "boom", "request_id": "xyz-9", "at": "2026-08-19T11:11:11Z"}')
    assert fp1 == fp2, "динамика (request_id/timestamp) не должна влиять на fingerprint"
    fp3 = service.error_fingerprint("GET", "/api/x", 500, b'{"detail": "other"}')
    assert fp3 != fp1
