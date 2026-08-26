# PR — feature/product-actions-output-v2

**Ветка:** `feature/product-actions-output-v2`  
**База:** `main` (`d8f60ca9`)  
**Тип:** feature  
**Заголовок PR:** `feat(analysis): компактный список действий с продуктом, action_text, 4 тега, выгрузка CSV/XLSX`

## Что изменено

### Проблема

Вкладка AI → «Действия с продуктом» показывала товароцентричные полноширинные карточки. При отсутствии товара заголовок был «Продукт не указан»; теги без лейблов категорий выглядели как дубли; не было выгрузки результата.

### Root cause

- Промпт и схема ответа требовали `product_name`/`product_group` и не содержали поля `action_text`.
- Источника товара/группы в паспорте проекта не было.
- UI использовал `product_name` как заголовок.

### Решение

1. **Backend**
   - Миграция `030`: новый промпт `product_actions_suggest` v2 с `action_text` + 4 тега + few-shot.
   - `product_actions_suggest.py`: `action_text` в схеме, валидация обязательных полей.
   - `product_action_suggestions_service.py`: `action_text` попадает в `interview.analysis.product_actions[]`.
   - `product_actions_ai.py`: `action_text` в контексте существующих действий, дедупликация по действию.
   - Новый endpoint `GET /api/sessions/{id}/analysis/product-actions/export?format=(csv|xlsx)`.

2. **Frontend**
   - `ProductActionSuggestionsPanel.jsx`: компактная таблица вместо карточек.
   - Теги с лейблами категорий.
   - Валидация перед утверждением; массовое «Утвердить всё валидное».
   - Dropdown выгрузки CSV/Excel.
   - Inline-редактирование `action_text` и тегов.
   - Отклонённые строки приглушены без активных кнопок.
   - `ProjectWizardForm.jsx`: поля `product_name`/`product_group` в паспорте.
   - i18n: все новые строки в `ru.js`/`en.js`.

## Скриншоты

> Добавить в PR: скриншоты до/после (stage / local). В evidence/ после мержа на stage.

## Тесты

- `backend/tests/test_product_actions_suggest_v2.py` — 4 passed
- `backend/tests/test_product_actions_session_export.py` — 4 passed
- `frontend/src/features/process/analysis/productActionSuggestionsPanel.table.test.mjs` — passed
- `frontend/src/features/process/analysis/productActionSuggestionsPanel.validation.test.mjs` — passed
- `frontend/src/features/process/analysis/productActionsModel.test.mjs` — passed
- `frontend/src/features/process/analysis/analysisTabsI18n.smoke.test.mjs` — passed
- `npm run build` — green, нет i18n warning'ов

## Статус LLM-провайдера на stage

Фича использует единый LLM-шлюз (feature `product_actions_suggest`). На stage провайдер настроен (VVPROXY LLM / deepseek-main). После мержа требуется E2E-проверка генерации и выгрузки.

## Новые i18n-строки

Префикс `processAnalysis.ai.*`:
- `title`, `subtitle`
- `columnAction`, `columnType`, `columnStage`, `columnObject`, `columnMethod`, `columnBinding`, `columnStatus`, `columnActions`
- `tagType`, `tagStage`, `tagObject`, `tagMethod`
- `approve`, `reject`, `unapprove`, `unreject`, `edit`, `done`, `cancel`
- `generateActions`, `generating`
- `bulkApproveValidOnly`, `bulkReject`, `approveValidOnly`
- `invalidAction`, `invalidActionHint`
- `export`, `exportCsv`, `exportXlsx`, `exportReady`
- `stepPlaceholder`, `errorCodeLabel`, `indexedAt`, `ragStatusLabel`
- `total`, `pending`, `approved`, `rejected`

## Scope C2

Multi-process/multi-session выгрузка вынесена в отдельный контур `feature/product-actions-bulk-export-v2` — будет использовать существующий `/api/analysis/product-actions/registry/export.*`.

## Чеклист приёмки

- [ ] Ни один i18n-ключ не рендерится сырым.
- [ ] Ни один код ошибки не показывается как текст ошибки.
- [ ] В каждой панели — ровно одно состояние.
- [ ] Таблица компактная, ≥ в 2–3 раза больше действий на экране.
- [ ] У каждого действия 4 лейблированных тега.
- [ ] Выгрузка CSV/XLSX открывается, колонки по спецификации.
- [ ] Смоук 6 сабтабов зелёный.
- [ ] Stage E2E: генерация → правка → утверждение валидных → выгрузка.

## Merge/deploy

- **Merge и deploy выполняет пользователь вручную.**
- После merge на stage требуется проверка по скриншотам и evidence/.
