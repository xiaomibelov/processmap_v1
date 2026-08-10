"""Общая инфраструктура contract-фаззинга (schemathesis) поверх ЖИВОГО FastAPI-приложения.

Принципы (ТЗ «OpenAPI-спека как источник правды»):
- схема загружается из живого приложения (GET /api/openapi.json с токеном org_owner),
  а не из коммит-снапшота docs/openapi.yaml — тестируем код, а не файл;
- session-wide SQLite (PROCESS_DB_PATH выставляется ДО импорта app) с seed-данными:
  пользователь с ролью org_owner, организация, проект, BPMN-сессия — реальные id
  подставляются в path-параметры, чтобы фаззер не долбился в несуществующие id;
- авторизация: Authorization: Bearer <token> во все запросы, кроме публичных
  путей (AUTH_PUBLIC_PATHS из app.auth — единый источник правды);
- исключения — только через exclusions.yaml с обязательным reason.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List

# --- 1. Session-wide тестовая БД ДО импорта app -------------------------------
# tests/conftest.py изолирует БД per-test; contract-suite нужна одна БД на сессию
# со seed-данными (см. conftest.py:isolate_process_db — переопределён там).
_SESSION_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_SESSION_DB.close()
os.environ["PROCESS_DB_PATH"] = _SESSION_DB.name

import yaml  # noqa: E402

CONTRACT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CONTRACT_DIR.parents[2]
BUILD_DIR = REPO_ROOT / "build"
EXCLUSIONS_PATH = CONTRACT_DIR / "exclusions.yaml"
OPERATIONS_SUMMARY_PATH = BUILD_DIR / "contract-operations.json"

# --- 2. Исключения ------------------------------------------------------------

def load_exclusions() -> Dict[str, Any]:
    with EXCLUSIONS_PATH.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def exclusion_ids(exclusions: Dict[str, Any], key: str) -> List[str]:
    return [entry["id"] for entry in exclusions.get(key) or []]


def spec_gap_status_map(exclusions: Dict[str, Any]) -> Dict[str, set]:
    """operationId → множество статусов, осознанно НЕ задокументированных в спеке.

    Для этих (операция, статус) conformance-чеки (status/content-type/schema)
    отключаются: ответ на незадокументированный статус по определению не имеет
    схемы. not_a_server_error не отключается НИКОГДА."""
    out: Dict[str, set] = {}
    for entry in exclusions.get("spec_gap_status_operations") or []:
        out[entry["id"]] = {int(s) for s in entry.get("statuses") or []}
    return out


# --- 3. Seed-контекст (ленивый, один раз на сессию) ----------------------------

_context: Dict[str, Any] | None = None


def get_context() -> Dict[str, Any]:
    """Создаёт app + seed-данные и возвращает контекст. Идемпотентно."""
    global _context
    if _context is not None:
        return _context

    from app.auth import AUTH_PUBLIC_PATHS, create_access_token, create_user
    from app.repositories import project_repo
    from app.storage import (
        create_org_record,
        create_workspace_record,
        get_storage,
        pop_storage_request_scope,
        push_storage_request_scope,
        upsert_org_membership,
        upsert_project_membership,
    )

    user = create_user("contract_fuzz@local", "password")
    user_id = str(user["id"])
    org_id = "org_contract_fuzz"
    create_org_record("Contract Fuzz Org", created_by=user_id, org_id=org_id)
    upsert_org_membership(org_id, user_id, "owner")  # нормализуется в org_owner
    token = create_access_token(user_id)

    # Реальные сущности (не только membership): проект, workspace, BPMN-сессия.
    scope_tokens = push_storage_request_scope(user_id=user_id, is_admin=False, org_id=org_id)
    try:
        project_id = project_repo.create_project("Contract Fuzz Project", user_id=user_id, org_id=org_id)
    finally:
        pop_storage_request_scope(scope_tokens)
    upsert_project_membership(org_id, project_id, user_id, "owner")
    workspace = create_workspace_record(org_id, "Contract Fuzz WS", created_by=user_id)
    workspace_id = str(workspace["id"])
    session_id = get_storage().create(
        title="Contract Fuzz Seed Session",
        user_id=user_id,
        org_id=org_id,
        project_id=project_id,
    )
    # Папка в workspace — для операций /api/folders/{folder_id}...
    from app import storage as storage_mod

    folder = storage_mod.create_workspace_folder(
        org_id, workspace_id, "Contract Fuzz Folder", user_id=user_id
    )
    folder_id = str(folder["id"])

    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.get("/api/openapi.json", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, f"openapi.json недоступен с токеном org_owner: {response.status_code}"
    spec = response.json()

    _context = {
        "app": app,
        "spec": spec,
        "token": token,
        "auth_headers": {"Authorization": f"Bearer {token}"},
        "public_paths": set(AUTH_PUBLIC_PATHS),
        # Реальные id из seed-данных — подставляются в path-параметры.
        "seeded_path_params": {
            "session_id": session_id,
            "org_id": org_id,
            "project_id": project_id,
            "user_id": user_id,
            # Валидные значения scope: workspace|project|session (scope=org → 422).
            "scope": "session",
            "scope_id": session_id,
            "folder_id": folder_id,
        },
        # Реальные значения — подставляются в query-параметры (map_case).
        "seeded_query_params": {
            "workspace_id": workspace_id,
            "scope": "session",
            "scope_id": session_id,
            # Фаззер генерирует org_id="null" → доменный 404; подменяем на seed.
            "org_id": org_id,
        },
    }
    return _context


# --- 4. Кастомные чеки --------------------------------------------------------


def make_conformance_check(status_map: Dict[str, set], ctype_waived: set):
    """status/content-type/response-schema conformance с учётом spec-gap исключений.

    - статус из spec_gap_status_operations → conformance-чеки пропускаются
      (статус осознанно не задокументирован, reason в exclusions.yaml);
    - операция из spec_gap_content_type_operations → content_type_conformance
      пропускается (export-форматы csv/xlsx/xml/zip не описаны в спеке);
    - 5xx здесь НЕ маскируется: not_a_server_error идёт отдельным чеком всегда.
    """
    from schemathesis.specs.openapi.checks import (
        content_type_conformance,
        response_schema_conformance,
        status_code_conformance,
    )

    def check(ctx: Any, response: Any, case: Any) -> None:
        op_id = case.operation.definition.raw.get("operationId", "")
        if response.status_code in status_map.get(op_id, set()):
            return None
        # 308 Permanent Redirect — осознанный deprecated-endpoint middleware
        # (каноникализация trailing-slash/мусорных сегментов, лог «Deprecated
        # endpoint used: canonical=...»). Срабатывает на любом path-param роуте
        # при param='%20' и т.п.; не доменный ответ операции и не ошибка —
        # не документируется per-operation, глобальный waiver (PR #707, CI fuzz).
        if response.status_code == 308:
            return None
        status_code_conformance(ctx, response, case)
        if op_id not in ctype_waived:
            content_type_conformance(ctx, response, case)
        response_schema_conformance(ctx, response, case)

    return check


def llm_envelope_or_conformance(ctx: Any, response: Any, case: Any) -> None:
    """status/response-schema conformance, но 200 {"ok": false}|{"error": ...} — валидно.

    LLM-эндпоинты возвращают доменные отказы (нет ключа провайдера, rate limit,
    rag_disabled) как HTTP 200 с error-конвертом — это осознанный контракт
    (см. exclusions.yaml: domain_error_envelope_operations).
    """
    from schemathesis.specs.openapi.checks import (
        response_schema_conformance,
        status_code_conformance,
    )

    # spec-gap статусы (например, доменный 400 у rag/index) — как в strict-чеке.
    op_id = case.operation.definition.raw.get("operationId", "")
    if response.status_code in spec_gap_status_map(load_exclusions()).get(op_id, set()):
        return None

    try:
        status_code_conformance(ctx, response, case)
        response_schema_conformance(ctx, response, case)
    except AssertionError:
        if response.status_code == 200:
            try:
                body = response.json()
            except Exception:
                raise
            if isinstance(body, dict) and (body.get("ok") is False or "error" in body):
                return None
        raise


# --- 5. Сводка по операциям (для отчёта) ---------------------------------------

def write_operations_summary(
    *,
    fuzzed_ids: List[str],
    llm_ids: List[str],
    policy_skipped: List[str],
    explicit_skips: List[Dict[str, str]],
    profile: str,
    max_examples: int,
) -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "profile": profile,
        "max_examples": max_examples,
        "counts": {
            "fuzzed": len(fuzzed_ids),
            "llm_envelope": len(llm_ids),
            "skipped_method_policy": len(policy_skipped),
            "skipped_explicit": len(explicit_skips),
            "total": len(fuzzed_ids) + len(llm_ids) + len(policy_skipped) + len(explicit_skips),
        },
        "fuzzed": sorted(fuzzed_ids),
        "llm_envelope": sorted(llm_ids),
        "skipped_method_policy": sorted(policy_skipped),
        "skipped_explicit": explicit_skips,
    }
    OPERATIONS_SUMMARY_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
