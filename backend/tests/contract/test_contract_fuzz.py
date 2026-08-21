"""Contract-фаззинг живого OpenAPI (/api/openapi.json) через schemathesis.

Запуск:
    cd backend
    pytest -m contract                      # PR-режим (10 примеров/операцию)
    CONTRACT_PROFILE=nightly pytest -m contract   # nightly (75 примеров/операцию)
    CONTRACT_MAX_EXAMPLES=3 pytest -m contract    # ручной оверрайд бюджета

Что проверяем (checks):
- not_a_server_error — любой HTTP 500 от любого сгенерированного входа = падение;
- status_code_conformance — статус ответа задокументирован в спеке;
- content_type_conformance — Content-Type ответа задокументирован;
- response_schema_conformance — тело ответа соответствует схеме.

Особые операции (exclusions.yaml):
- LLM-конверты 200 {"ok": false}/{"error": ...} — отдельный тест с ослабленным
  чеком llm_envelope_or_conformance;
- skip_operations / method_policy — не фаззятся (деструктивные, внешние вызовы);
- spec_gap_status_operations / spec_gap_content_type_operations — фаззятся, но
  для осознанно незадокументированных статусов/content-type (spec-gap, reason
  обязателен) conformance-чеки смягчены. 5xx не маскируется нигде.
"""
from __future__ import annotations

import os

import pytest
import schemathesis
from hypothesis import HealthCheck, settings
from schemathesis.checks import not_a_server_error
from schemathesis.specs.openapi.checks import (
    content_type_conformance,
    response_schema_conformance,
    status_code_conformance,
)

from contract_support import (
    exclusion_ids,
    get_context,
    load_exclusions,
    llm_envelope_or_conformance,
    make_conformance_check,
    spec_gap_status_map,
    write_operations_summary,
)

pytestmark = pytest.mark.contract

# --- Бюджет -------------------------------------------------------------------
PROFILE = os.getenv("CONTRACT_PROFILE", "pr").strip().lower() or "pr"
_DEFAULT_EXAMPLES = {"pr": 10, "nightly": 75}
MAX_EXAMPLES = int(os.getenv("CONTRACT_MAX_EXAMPLES", str(_DEFAULT_EXAMPLES.get(PROFILE, 10))))

SETTINGS = settings(
    max_examples=MAX_EXAMPLES,
    deadline=None,  # in-process ASGI + sqlite: жёсткий deadline даёт флаки, 500-ки ловим чеком
    # БД примеров hypothesis отключена: replay закэшированных примеров приносит
    # кейсы, сгенерированные старыми стратегиями/хуками (ложные падения), а
    # воспроизведение есть в выводе (curl в failure).
    database=None,
    suppress_health_check=[
        HealthCheck.too_slow,
        HealthCheck.data_too_large,
        HealthCheck.filter_too_much,
    ],
)

# --- Схема из живого приложения ------------------------------------------------
CTX = get_context()
APP = CTX["app"]
SPEC = CTX["spec"]
AUTH_HEADERS = CTX["auth_headers"]
PUBLIC_PATHS = CTX["public_paths"]

EXCLUSIONS = load_exclusions()
LLM_IDS = exclusion_ids(EXCLUSIONS, "domain_error_envelope_operations")
SKIP_IDS = exclusion_ids(EXCLUSIONS, "skip_operations")
_METHOD_POLICY = EXCLUSIONS.get("method_policy") or {}
ALLOWED_METHODS = {m.upper() for m in _METHOD_POLICY.get("allowed_methods", ["GET"])}
ALLOWED_EXTRA = set(exclusion_ids(_METHOD_POLICY, "allowed_extra_operations"))

base_schema = schemathesis.openapi.from_dict(SPEC)


# --- Хук: реальные id из seed-данных вместо сгенерированных --------------------
def map_case(context, case):  # noqa: ANN001
    """Подменяет path-параметры на реальные id из seed-данных.

    Именно map_case (а не map_path_parameters): coverage-движок schemathesis
    применяет только filter_case/map_case, map_path_parameters работает лишь в
    fuzz-фазе — иначе coverage-кейсы идут с id вида 0 и дают ложные 404.
    """
    params = case.path_parameters
    if params:
        for name in list(params):
            seeded = CTX["seeded_path_params"].get(name)
            if seeded is not None:
                params[name] = seeded
    query = case.query
    if query:
        for name in list(query):
            seeded = CTX["seeded_query_params"].get(name)
            if seeded is not None:
                query[name] = seeded
    return case


# ВАЖНО: хуки регистрируются на БАЗОВОЙ схеме ДО фильтрации — coverage/fuzz-
# движки читают operation.schema.hooks (базовую), а не фильтрованный view.
base_schema.hook(map_case)


def _is_fuzzable(ctx) -> bool:
    """Метод политики или явный whitelist; LLM-конверты и skip — в других наборах."""
    op = ctx.operation
    op_id = op.definition.raw.get("operationId", "")
    if op_id in LLM_IDS or op_id in SKIP_IDS:
        return False
    return op.method.upper() in ALLOWED_METHODS or op_id in ALLOWED_EXTRA


schema = base_schema.include(func=_is_fuzzable)
llm_schema = base_schema.include(operation_id=[i for i in LLM_IDS if i not in SKIP_IDS])


@schemathesis.auth()
class OrgOwnerAuth:
    """Bearer-токен org_owner — подстановка на этапе ВЫЗОВА (а не генерации).

    map_headers-подстановка на этапе генерации не работает: hypothesis
    shrink/examples перезаписывают сгенерированные headers (токен стрипался).
    Публичные пути (AUTH_PUBLIC_PATHS) — без токена.
    """

    def get(self, case, context):  # noqa: ANN001
        return CTX["token"]

    def set(self, case, data, context):  # noqa: ANN001
        if context.operation.path in PUBLIC_PATHS:
            return
        headers = dict(case.headers or {})
        headers["Authorization"] = f"Bearer {data}"
        case.headers = headers


def filter_case(context, case):  # noqa: ANN001
    """Отсекает кейсы с намеренно «сломанной» security-схемой.

    Schemathesis в coverage-фазе генерирует негативные кейсы без auth
    (security-negated) — для них auth-провайдер осознанно не применяется, и
    сервер отвечает 401. Негативное auth-тестирование (ignored_auth) вне
    контура Этапа 1 — отсекаем такие кейсы, чтобы не плодить ложные падения.
    """
    return not case.operation.schema.is_security_param_negated(case)


# filter_case — тоже на базовую схему (см. комментарий у map_path_parameters).
base_schema.hook(filter_case)


# --- Сводка по операциям (в build/, читает conftest:pytest_terminal_summary) ---
_all_ops = []
for _path, _item in SPEC["paths"].items():
    for _method, _op in _item.items():
        if _method in ("get", "post", "put", "patch", "delete", "head", "options"):
            _all_ops.append((_op.get("operationId", ""), _method.upper()))

_fuzzed = sorted(
    oid
    for oid, method in _all_ops
    if oid not in LLM_IDS and oid not in SKIP_IDS and (method in ALLOWED_METHODS or oid in ALLOWED_EXTRA)
)
_policy_skipped = sorted(
    oid
    for oid, method in _all_ops
    if oid not in LLM_IDS and oid not in SKIP_IDS and not (method in ALLOWED_METHODS or oid in ALLOWED_EXTRA)
)
_skip_entries = [
    {"id": e["id"], "reason": e["reason"]} for e in EXCLUSIONS.get("skip_operations") or []
]
write_operations_summary(
    fuzzed_ids=_fuzzed,
    llm_ids=[i for i in LLM_IDS if i not in SKIP_IDS],
    policy_skipped=_policy_skipped,
    explicit_skips=_skip_entries,
    profile=PROFILE,
    max_examples=MAX_EXAMPLES,
)

# --- Чеки ----------------------------------------------------------------------
# spec-gap исключения (exclusions.yaml): статусы, осознанно не задокументированные
# в спеке (доменные 403/404/409/422 и т.п.), и export-форматы без описанного
# content-type. not_a_server_error не маскируется никогда.
_SPEC_GAP_STATUSES = spec_gap_status_map(EXCLUSIONS)
_SPEC_GAP_CTYPE = set(exclusion_ids(EXCLUSIONS, "spec_gap_content_type_operations"))
_conformance = make_conformance_check(_SPEC_GAP_STATUSES, _SPEC_GAP_CTYPE)

STRICT_CHECKS = [
    not_a_server_error,
    _conformance,
]
LLM_CHECKS = [
    not_a_server_error,
    content_type_conformance,
    llm_envelope_or_conformance,
]


def _headers_for(case) -> dict:  # noqa: ANN001
    """Доп. заголовки не нужны: auth — через OrgOwnerAuth на этапе вызова."""
    return {}


@schema.parametrize()
@SETTINGS
def test_contract_operations(case):
    """Фаззинг операций со строгими контрактными чеками (500 = падение)."""
    case.call_and_validate(app=APP, checks=STRICT_CHECKS)


@llm_schema.parametrize()
@SETTINGS
def test_contract_llm_envelope_operations(case):
    """LLM-операции: доменный отказ 200 {ok:false}/{error} валиден, 500 — нет."""
    case.call_and_validate(app=APP, checks=LLM_CHECKS)
