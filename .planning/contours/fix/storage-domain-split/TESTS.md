# TESTS: fix/storage-domain-split

## Contract tests

`backend/tests/contract/test_storage_domain_contract.py` — 35 тестов:

1. `test_storage_facade_exports_public_names_from_all_domains` — каждый домен имеет public API, и хотя бы одно имя из каждого домена доступно через `app.storage`.
2. `test_storage_facade_preserves_storage_and_projectstorage_classes` — классы `Storage`, `ProjectStorage` и фабрики `get_storage`, `get_project_storage` сохранены.
3. `test_storage_facade_preserves_public_functions` — ключевые публичные функции доступны.
4. `test_storage_facade_preserves_private_helpers_used_by_consumers` — приватные helpers (`_connect`, `_ensure_schema`, `_now_ts`, `_json_loads`, `_json_dumps`, `_count_bpmn_activities`) доступны.
5. `test_domain_module_imports` (parametrized ×12) — каждый доменный модуль импортируется.
6. `test_domain_repository_has_public_api` (parametrized ×12) — у каждого домена есть public API.
7. `test_project_storage_methods_delegate` — `ProjectStorage` сохраняет методы `create`, `list`, `load`, `save`, `delete`.
8. `test_storage_methods_delegate` — `Storage` сохраняет ключевые методы.
9. `test_domain_packages_do_not_import_storage_facade` — доменные модули не импортируют `app.storage` (защита от циклов).
10. `test_storage_py_compiles` — `app.storage` компилируется.
11. `test_generator_determinism` — два запуска `tools/split_storage_domains.py` с `PYTHONHASHSEED=0` и `PYTHONHASHSEED=42` дают байт-идентичный результат.
12. `test_backward_compat_all_top_level_names` — все 365 top-level имён из оригинального `storage.py` доступны через `app.storage`.
13. `test_container_context_import_smoke` — импорт `backend.app.main` из корня репозитория с `PYTHONPATH=""` воспроизводит Docker-контекст uvicorn и гарантирует отсутствие absolute imports вида `from app.*`.

## Smoke-тесты

- `cd backend && python -c "from app import storage; print('imports ok')"`
- `PYTHONPATH= python -c "import backend.app.main"` — container-context smoke.
- `python3 -m py_compile backend/app/storage.py backend/app/domains/storage/*/repository.py`
- Backward-compat scan по всем 365 имёнам из оригинального `storage.py`: missing = 0.

## Skip-if-hanging для pre-existing зависаний

Два тестовых файла зависают на хосте разработчика из-за хардкоженного Celery-брокера `redis://redis:6379/1` (`app/celery_app.py`), который не разрешается вне Docker Compose:

- `backend/tests/test_auto_create_subprocess_sessions.py`
- `backend/tests/test_bpmn_meta.py`

В `backend/tests/conftest.py` добавлен helper `skip_if_hanging`, который пропускает эти тесты, если `redis:6379` недоступен. Оба файла помечены module-level `pytestmark = skip_if_hanging`.

## Полный suite

Команда:

```bash
cd backend
.venv/bin/python -m pytest tests --timeout=120 --tb=line -q
```

Результат на хосте разработчика:

- На `fix/storage-domain-split` прогон доходит примерно до 31% и зависает из-за `app/metrics.py::_poll` (background thread `time.sleep(15)`) в сочетании с `pytest-timeout` — тот же паттерн, что и на `origin/main`.
- На `origin/main` прогон доходит примерно до 20% и зависает с идентичным `Timeout` в `app/metrics.py::_poll`.
- Обе ветки не могут пройти полный suite на localhost без Docker Compose; это pre-existing env-ограничение, не связанное с рефакторингом.

Targeted suite (50 тестов по ключевым доменам) проходит на `fix/storage-domain-split`:

```bash
.venv/bin/python -m pytest \
  tests/test_storage_schema_bootstrap.py \
  tests/test_admin_permissions.py \
  tests/test_org_invites.py \
  tests/test_notes_mvp1_api.py \
  tests/test_templates_rbac.py \
  tests/test_error_events_intake.py \
  tests/test_ai_execution_log_foundation.py \
  tests/test_explorer_context_folder_fields.py \
  -q --tb=short
# 50 passed, 10 warnings, 2 subtests passed in 53.13s
```

## Env-ограничения

- Redis/Celery timeouts на localhost не правятся — это инфраструктурное ограничение, задокументированное в `app/celery_app.py` и `RECOVERY_PLAN.md`.
- `pytest-timeout` на хосте разработчика конфликтует с фоновым polling thread в `app/metrics.py`, поэтому полный suite невозможно довести до конца вне Docker Compose.

## Критерий приёмки

- 35 contract-тестов проходят.
- Backward-compat scan: 365 имён, missing = 0.
- `[FACADE]` cross-domain импортов через `.repository` — 0.
- `backend/app/storage.py` содержит ≤30 строк не-re-export кода.
- Container-context import smoke (`PYTHONPATH= python -c "import backend.app.main"`) проходит.
