# feature/auto-create-subprocess-sessions — дизайн

Дата: 2026-06-26
Approve: пользователь

## Цель

Child-сессии для всех `bpmn:subProcess` элементов создаются автоматически и видны в Workspace сразу при загрузке списка сессий, без необходимости drill-down из главного canvas.

## Согласованные решения

### Режим auto-create

- Синхронно, не более 10 subprocess за один `PUT /api/sessions/{sid}/bpmn`.
- Если subprocess > 10: первые 10 создаются внутри save, остальные — через Celery-таску.

### Child BPMN XML

- Извлекаем фрагмент `<bpmn:subProcess>` из родительского XML через существующий `extract_subprocess_xml()`.
- Child-сессия сразу содержит свою часть BPMN и готова к открытию.

### Nested subprocess

- Авто-создание только 1 уровня.
- Вложенные subprocess создаются по drill-down, как сейчас.

### Удалённые subprocess

- **Soft delete по умолчанию**: при save BPMN, если subprocess элемент удалён из XML, существующая child-сессия помечается `deleted_at = now()`.
- **Hard delete**: пользователь может навсегда удалить child-сессию через UI (кнопка "Удалить навсегда" в контекстном меню) — out of scope этого PR.
- **Восстановление**: UI для восстановления soft-deleted сессий — future work.
- **Workspace tree view**: скрывать удалённые child-сессии по умолчанию (`deleted_at IS NULL`).
- **Cascade**: при hard delete parent-сессии — hard delete всех child-сессий.

### Backfill

- Не делаем. При следующем save любой существующей сессии subprocess-элементы создадутся автоматически.

## Архитектура backend

### Новые функции

1. **`find_subprocess_elements(xml_text)`** в `backend/app/services/bpmn_navigation.py`
   - Парсит XML через `xml.etree.ElementTree`.
   - Возвращает список `{ id, name }` для всех `<bpmn:subProcess>` на верхнем уровне (не рекурсивно).

2. **`auto_create_subprocess_sessions(parent_session, request)`** в `backend/app/services/session_service.py`
   - Получает список subprocess из `find_subprocess_elements`.
   - Для каждого элемента:
     - `child_xml = extract_subprocess_xml(parent_xml, element_id)`.
     - `title = name || f"Подпроцесс: {id}"`.
     - Вызывает `session_repo.find_or_create_child_session(...)` (atomic upsert).
   - Возвращает summary: `{ created: [...], existing: [...], total }`.

3. **`soft_delete_removed_subprocess_sessions(parent_session, current_element_ids)`** в `backend/app/services/session_service.py`
   - Находит активные child-сессии (`deleted_at IS NULL`) для `parent_session_id`, чьи `element_id_in_parent` отсутствуют в `current_element_ids`.
   - Устанавливает `deleted_at = now()`.
   - Возвращает `{ soft_deleted: [...] }`.

### Hook в BPMN save

- В `session_service.bpmn_save()` (или в `_legacy_main.py` после сохранения XML) вызываем:
  1. `auto_create_subprocess_sessions(parent_session, request)` — синхронно, max 10.
  2. `soft_delete_removed_subprocess_sessions(parent_session, current_element_ids)` — синхронно, max 10.
  3. Если total > 10: ставим Celery-таску `create_remaining_subprocess_sessions.delay(parent_id, elements[10:])`.
- Save-ответ дополняется полем:
  ```json
  {
    "subprocess_sync": {
      "created_count": 2,
      "soft_deleted_count": 1,
      "total_count": 5,
      "async_pending": false
    }
  }
  ```

### Async fallback

- Новая Celery-таска в `backend/app/tasks.py`:
  - `create_remaining_subprocess_sessions(parent_id, remaining_element_ids)`.
  - Догружает оставшиеся child-сессии.
  - Применяет soft delete для удалённых элементов.
  - Инвалидирует explorer-кэш проекта (`explorer_invalidate_sessions`).

### Схема БД

- Добавить колонку `deleted_at INTEGER` (Unix timestamp, nullable) в таблицу `sessions`.
- Обновить `Session` model (`backend/app/models.py`) полем `deleted_at: int = 0` (0 = не удалена).
- Обновить индексы для фильтрации active children:
  ```sql
  CREATE INDEX idx_sessions_parent_active
  ON sessions(parent_session_id, element_id_in_parent)
  WHERE deleted_at = 0 OR deleted_at IS NULL;
  ```

## Архитектура frontend

- Минимальные изменения поверх `feature/workspace-auto-expand-steps`.
- Использовать `children_count` из eager tree API (считает только active children, т.е. `deleted_at IS NULL`).
- Badge «N подпроцессов» у root-сессии — только active children.
- Child-row:
  - `title` — как имя строки.
  - `element_id_in_parent` — как подпись / tooltip.
  - Иконка «пустой шаблон», если `bpmn_xml` пустой/маленький.
- Удалённые child-сессии не показываются в tree view по умолчанию (backend фильтрует).

## Guardrails

- **Atomic upsert**: `ON CONFLICT (org_id, project_id, parent_session_id, element_id_in_parent) DO NOTHING` (из `fix/subprocess-child-unique-constraint`).
- **Права**: auto-create выполняется в контексте пользователя, сохраняющего BPMN. Editor/admin может, viewer — нет.
- **Производительность**: парсинг XML + ≤10 INSERT + ≤10 UPDATE (soft delete) в рамках транзакции save.
- **Не трогаем drill-down flow**: если child уже существует, `navigate_to_subprocess` откроет её, а не создаст дубль.
- **Soft delete**: данные не удаляются, помечаются timestamp.

## Тесты

### Backend

- Save BPMN с 2 subprocess → создаются 2 child-сессии с корректными `parent_session_id`, `element_id_in_parent`, `title`, `bpmn_xml`.
- Повторный save того же XML → `created_count = 0`, дублей нет.
- Save с 12 subprocess → 10 создано синхронно, 2 — async, ответ `async_pending=true`.
- Save без subprocess → `subprocess_sync` пустой/нулевой, regression проходит.
- Nested subprocess: 2-й уровень не создаётся автоматически.
- Удаление элемента из BPMN → child-сессия помечается `deleted_at > 0`.
- Explorer tree возвращает только active children.

### Frontend

- Workspace: root-сессия с `children_count=2` рендерит 2 child-строки.
- Child-row показывает `element_id_in_parent`.
- Drill-down открывает существующую child-сессию, не создаёт дубль.

## Out of scope

- UI hard delete / восстановление soft-deleted сессий.
- Cascade hard delete parent → children — схема готова, UI отдельно.
- Backfill существующих сессий.
