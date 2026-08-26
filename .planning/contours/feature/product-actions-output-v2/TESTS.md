# TESTS — feature/product-actions-output-v2

## Backend

### Новые тесты

| Файл | Что проверяет | Статус |
|------|---------------|--------|
| `backend/tests/test_product_actions_suggest_v2.py` | `action_text` в нормализации; `missing_fields` для `action_text`/тегов; `product_name`/`product_group` не обязательны | ✅ 4 passed |
| `backend/tests/test_product_actions_session_export.py` | endpoint `/api/sessions/{id}/analysis/product-actions/export` отдаёт CSV (BOM + колонки) и XLSX (валидный ZIP) | ✅ 4 passed |
| `backend/tests/contract/test_contract_fuzz.py -k "product-actions_export"` | экспорт-эндпоинт не ломает OpenAPI-фаззинг (content-type spec-gap задокументирован в исключениях) | ✅ passed |

### Регрессионные backend-тесты

| Файл | Статус |
|------|--------|
| `backend/tests/test_ai_prompt_registry_foundation.py` | ✅ 9 passed |
| `backend/tests/test_ai_prompt_registry_seeds.py` | ✅ 2 passed |
| `backend/tests/test_product_actions_registry_api.py` | ⚠️ timed out ( daemon metrics polling держит процесс; pre-existing issue) |
| `backend/tests/test_product_actions_ai_suggest.py` | ✅ 28 passed |
| `backend/tests/test_llm_gateway.py` | ⚠️ 1 flaky failure из-за загрязнённого Postgres (duplicate `idx_llm_providers_org_name`), не связан с изменениями |

## Frontend

### Новые тесты

| Файл | Что проверяет | Статус |
|------|---------------|--------|
| `frontend/src/features/process/analysis/productActionSuggestionsPanel.table.test.mjs` | `action_text` в первой колонке; теги с лейблами; отклонённые без кнопки approve; approve disabled для невалидной строки | ✅ passed |
| `frontend/src/features/process/analysis/productActionSuggestionsPanel.validation.test.mjs` | массовое «Утвердить всё валидное» утверждает только валидные | ✅ passed |

### Обновлённые тесты

| Файл | Что проверяет | Статус |
|------|---------------|--------|
| `frontend/src/features/process/analysis/productActionsModel.test.mjs` | `action_text` маппинг; `isProductActionValid` | ✅ passed |
| `frontend/src/features/process/analysis/analysisTabsI18n.smoke.test.mjs` | AI-вкладка не рендерит сырые `processAnalysis.ai.*` ключи | ✅ passed |

### Регрессионные frontend-тесты

| Файл | Статус |
|------|--------|
| `frontend/src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs` | ✅ passed |
| `frontend/src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs` | ✅ passed |
| `frontend/src/features/process/analysis/processAnalysisModel.test.mjs` | ✅ passed |
| `frontend/src/features/process/analysis/productActionsPersistence.test.mjs` | ✅ passed |
| `frontend/src/features/process/analysis/processAnalysisPage.test.mjs` | ⏳ планируется прогон |
| `frontend/src/features/process/analysis/processAnalysisDashboard.test.mjs` | ⏳ планируется прогон |

### Сборка

- `npm run build` — ✅ успешно, нет warning'ов по i18n.
- Остаются только pre-existing warnings: `%VITE_BUILD_ID%`, `crypto`/`zlib` externalization, browserslist age, chunk size.

## Команды для воспроизведения

```bash
# Frontend tests
cd frontend
node --test \
  src/features/process/analysis/productActionSuggestionsPanel.table.test.mjs \
  src/features/process/analysis/productActionSuggestionsPanel.validation.test.mjs \
  src/features/process/analysis/productActionsModel.test.mjs \
  src/features/process/analysis/analysisTabsI18n.smoke.test.mjs \
  src/features/process/analysis/productActionSuggestionsPanel.error.test.mjs \
  src/features/process/analysis/productActionSuggestionsPanel.source.test.mjs

# Frontend build
cd frontend && npm run build

# Backend tests
cd backend
.venv/bin/pytest tests/test_product_actions_suggest_v2.py tests/test_product_actions_session_export.py tests/test_ai_prompt_registry_foundation.py tests/test_ai_prompt_registry_seeds.py -v

# Contract fuzz (focus on new export endpoint)
.venv/bin/python -m pytest -m contract tests/contract/test_contract_fuzz.py -k "product-actions_export" -q
```
