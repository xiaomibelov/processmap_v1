# RUNTIME_CONSOLE_NETWORK_CHECK — Проверка консоли и сети

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T121105Z-76345`  
**Дата:** `2026-05-17`  
**Runtime:** `http://clearvestnic.ru:5180`

---

## Console

Проверка в свежем browser context (hard refresh с `?cb=<timestamp>`):

| Проверка | Результат |
|----------|-----------|
| `ReferenceError: FILTERS is not defined` | ✅ НЕТ |
| `ReferenceError: paginatedRows is not defined` | ✅ НЕТ |
| `ReferenceError: emptyMessage is not defined` | ✅ НЕТ |
| `TypeError` / `ReferenceError` с `ProductActionsRegistry` | ✅ НЕТ |
| React warnings (missing keys, deprecated APIs) | ✅ НЕТ |
| Другие ошибки JS | ✅ НЕТ |

Единственная ошибка в сети — `401 Unauthorized` на `/api/auth/me` при первом открытии (до установки сессии). Это ожидаемое поведение аутентификации, не связанное с реестром.

---

## Network

При открытии Analytics Hub → «Реестр действий» → «Вернуться»:

| Endpoint | Метод | Статус | Комментарий |
|----------|-------|--------|-------------|
| `/api/auth/me` | GET | 200 | Аутентификация |
| `/api/templates` | GET | 200 | Шаблоны |
| `/api/template-folders` | GET | 200 | Папки шаблонов |
| `/api/meta` | GET | 200 | Мета |
| `/api/note-mentions` | GET | 200 | Упоминания |
| `/api/note-notifications` | GET | 200 | Уведомления |
| `/api/projects` | GET | 200 | Проекты |
| `/api/workspaces` | GET | 200 | Workspaces |
| `/api/explorer` | GET | 200 | Explorer |

**Запрещённые запросы — проверка:**

| Проверка | Результат |
|----------|-----------|
| PUT `/bpmn` из навигации/просмотра реестра | ✅ 0 запросов |
| PATCH `/sessions` из навигации/просмотра реестра | ✅ 0 запросов |
| 4xx/5xx на `api/analysis/product-actions/registry/query` | ✅ Не вызывался (workspace без контекста) |
| 4xx/5xx на `export.csv` / `export.xlsx` | ✅ Не вызывался |

---

## Scope-безопасность

Backend / schema / BPMN / RAG изменений **нет**.
Изменения ограничены тремя frontend-файлами:
- `ProductActionsRegistryPanel.jsx`
- `registry/ProductActionsRegistryFilters.jsx`
- `registry/index.js`

---

**Вердикт:** консоль чистая от ошибок реестра. Сеть не содержит mutation-запросов вне scope.
