# PR — fix/subprocess-preserve-di-on-sync

## Что сделано

При синхронизации child-сессии из parent-схемы (`auto_create_subprocess_sessions`) ручной layout (BPMN DI) child больше не теряется, а перед перезаписью создаётся резервная версия в `bpmn_versions`.

## Root cause

Audit `subprocess-layout-corruption` показал: для collapsed subprocess backend генерировал grid auto-layout (`_generate_di_for_process`) и полностью перезаписывал `sessions.bpmn_xml`, не создавая версию. Пострадали сессии `773ec635cf`, `23d740ac8f`, `499ddb4693`, `12c5ffb061`.

## Изменения

- `backend/app/services/bpmn_navigation.py`
  - Новая функция `preserve_existing_di(new_xml, old_xml)`:
    - сохраняет `BPMNShape` bounds / `BPMNEdge` waypoints по `element id`;
    - размещает новые элементы в свободной области справа внизу (grid 120×80);
    - пересчитывает waypoints новых рёбер по финальным координатам концов.

- `backend/app/services/session_service.py`
  - `_refresh_child_session_bpmn_from_xml` теперь:
    - перед перезаписью создаёт snapshot в `bpmn_versions` (`source_action="subprocess_sync"`) для любого непустого `old_xml`;
    - применяет `preserve_existing_di`, чтобы сохранить пользовательский DI.
  - Новый helper `_snapshot_child_bpmn`.

- `backend/app/repositories/session_repo.py`
  - Исправлена передача параметра в `Storage.create_bpmn_version_snapshot`: `user_id` → `created_by`.

- `backend/tests/test_bpmn_navigation_helpers.py`
  - Unit-тесты на `preserve_existing_di`:
    - сохранение старых bounds;
    - размещение новых элементов без пересечений (включая пары «новый–новый»);
    - сохранение старых waypoints;
    - пересчёт waypoints новых edges;
    - edge cases (unparseable, no DI).
  - Регрессионный тест на реальных фикстурах `773ec635cf_v15.xml` / `773ec635cf_current.xml` — проверяет восстановление координат v15.

- `backend/tests/test_auto_create_subprocess_sessions.py`
  - Интеграционные тесты:
    - создание `bpmn_versions` snapshot перед перезаписью;
    - сохранение DI child при sync;
    - новый элемент размещается в свободной области.

## Как проверить

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest tests/test_bpmn_navigation_helpers.py tests/test_auto_create_subprocess_sessions.py -v

# Регрессионный тест на пострадавшей сессии
.venv/bin/python -m pytest tests/test_bpmn_navigation_helpers.py::test_preserve_existing_di_regression_773ec635cf_v15 -v

cd ../frontend
npm install
npm run build
```

## Результаты тестов

- `tests/test_bpmn_navigation_helpers.py`: 19/19 PASS
- `tests/test_auto_create_subprocess_sessions.py`: 36/36 PASS
- `tests/test_subprocess_navigation.py`: 8/8 PASS
- `vite build`: OK

## Известные pre-existing failures

- `tests/test_bpmn_meta.py::BpmnMetaApiTests::test_bpmn_import_keeps_drawio_and_hybrid_meta_after_reload` падает и на чистом `origin/main` (проверено в отдельном worktree). Не связан с этим контуром.

## Что не входит

- Восстановление уже пострадавших сессий из `bpmn_versions`.
- UI / уведомления (контур `feature/subprocess-layout-overwrite-warning` на паузе).

## Ссылки

- Audit: `server-backup/srv/obsidian/project-atlas/ProcessMap/AgentReports/audit/subprocess-layout-corruption/AUDIT.md`
- PLAN: `.planning/contours/fix/subprocess-preserve-di-on-sync/PLAN.md`

## Merge / Deploy

**Не merge'ить и не деплоить без explicit approve.**
