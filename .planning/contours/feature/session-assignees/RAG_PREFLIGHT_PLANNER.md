# RAG Preflight — feature/session-assignees (Planner)

- **role:** planner
- **contour:** feature/session-assignees
- **query:** session assignees users project owner permissions session list responsible column
- **index:** `/rag-index/RAG_SEARCH_INDEX.json`

## Результаты

Preflight вернул только runtime-facts (устаревшие тестовые адреса) и пустой BM25-список. Дополнительный `pm-rag-search` по ключевым словам нашёл релевантные паттерны:

1. `backend/app/storage.py` — workspace-обогащение с `responsible_user_id`/`executor_user_id` в поиске explorer.
2. `backend/tests/test_explorer_responsible_context_fields.py` — пример тестирования полей `responsible_user_id` и `executor_user_id`.
3. `backend/app/routers/explorer.py` — `get_explorer_page` и `_assignable_out`.

## Выводы для плана

- Переиспользовать `validate_org_user_assignable` и `build_assignable_user_payload` из `app.services.org_workspace`.
- Переиспользовать frontend-модель `explorerAssigneeModel.js` для отображения/фильтрации пользователей.
- Использовать `test_explorer_responsible_context_fields.py` как шаблон для backend-тестов новой таблицы.
