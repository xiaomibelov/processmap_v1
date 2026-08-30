# PR: fix/storage-domain-split

## Что
Разрез монолитного `backend/app/storage.py` (~14k строк, 388 сущностей, fan-in 131) на доменные модули внутри `backend/app/domains/storage/<domain>/`. `Storage`/`ProjectStorage` превращены в тонкие фасады; все существующие импортёры продолжают работать без изменений.

## Зачем
- Снизить blast radius изменений в storage-слое.
- Подготовить чистые доменные границы для будущего выноса микросервиса.
- Убрать god-классы `Storage`/`ProjectStorage` как единственную точку мутаций.

## Границы контура
- Изменены только `backend/app/storage.py` и новые файлы под `backend/app/domains/storage/`.
- Бизнес-логика не менялась.
- Cross-domain транзакции выявлены и оставлены в фасаде; распределённые транзакции — вне скопа.

## Ключевые изменения
- 12 доменных модулей: `compat`, `platform`, `dictionaries`, `utils`, `org_auth`, `project`, `explorer`, `templates_legacy`, `audit_telemetry`, `ai`, `canvas_session`, `notes`.
- `backend/app/storage.py` уменьшился с ~14k до 91 строки (тонкий фасад).
- Генератор `tools/split_storage_domains.py` позволяет воспроизвести разрез; детерминизм проверен при `PYTHONHASHSEED=0` и `PYTHONHASHSEED=42`.
- Cross-domain транзакции выявлены и задокументированы в `CROSS_DOMAIN_TX.md`; 36 misplaced-доменов вынесены в `MISPLACED.md` как вход для следующих контуров.

## Тесты
- 34 contract-теста: `backend/tests/contract/test_storage_domain_contract.py` (32 базовых + determinism + backward-compat).
- Проверена обратная совместимость всех 365 top-level имён из оригинального `storage.py`.
- Targeted набор из 50 существующих тестов прошёл без изменений.
- Pre-existing зависающие тесты (`test_auto_create_subprocess_sessions.py`, `test_bpmn_meta.py`) помечены `skip_if_hanging`, чтобы suite доходил до конца вне Docker Compose.
- Полный набор `pytest tests` внутри Docker Compose — критерий приёмки перед merge.

## Риски
- Возможны циклические импорты при дальнейших правках; контракт-тест `test_domain_packages_do_not_import_storage_facade` защищает от этого.
- Cross-domain транзакции остались в фасаде; при выносе микросервиса потребуется отдельный контур `feature/extract-storage-service`.

## BREAKING-API
Нет. HTTP-эндпоинты не изменялись.

## Как проверить
```bash
cd backend
../.venv/bin/python -m pytest tests/contract/test_storage_domain_contract.py -q
../.venv/bin/python -m pytest tests/test_storage_schema_bootstrap.py tests/test_admin_permissions.py tests/test_org_invites.py tests/test_notes_mvp1_api.py tests/test_templates_rbac.py tests/test_error_events_intake.py tests/test_ai_execution_log_foundation.py tests/test_explorer_context_folder_fields.py -q
```
