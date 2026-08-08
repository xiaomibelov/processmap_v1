# LLM4 — FILE-PLAN (короткий, на апрув владельца)

Дата: 2026-08-06. Ветка: `feat/llm4-processman-panel` (от `origin/main` 0c19e422).
Спека: `docs/llm/LLM4_PROCESSMAN_PANEL.md` (S1–S8, гейт 12 критериев).

## 1. Backend (1 новый файл + 1 строка регистрации)

| Файл | Действие | Содержимое |
|------|----------|------------|
| `backend/app/routers/llm_status.py` | новый | `GET /api/llm/status` → `{configured, quota:{used,limit}}`; роль viewer+ (⚠️ Q2); `any_enabled_provider` + `usage_daily_tokens("analysis", …)` (⚠️ Q1); секретов нет |
| `backend/app/routers/__init__.py` | +1 строка | регистрация роутера |
| `backend/tests/test_llm_status_api.py` | новый | shape-снапшот, 401/403, configured=false, quota, no-secrets |

## 2. Frontend

| Файл | Действие |
|------|----------|
| `src/features/process/stage/ui/ProcessStageDiagramControls.jsx` | +кнопка PROCESSMAN после «Отчёты» (строка 581): `data-testid="diagram-action-processman"`, `aria-pressed`, disabled без сессии |
| `src/features/process/processman/ProcessmanPanel.jsx` | новый — панель, 5 вкладок: Схема · TO BE · Анализ процессов · AS IS · Отчёты |
| `src/features/process/processman/TobeStepContext.jsx` | новый — TO BE-карточка шага (S5), статика из данных сессии |
| `src/features/process/processman/LlmAnalysisSummary.jsx` | новый — сводка LLM1 + «Открыть полный анализ» → `switchTab("analysis")` |
| `src/features/process/processman/processmanView.js` | новый — хелперы/статусы панели |
| `src/components/ProcessStage.jsx` | удалить SchemaAssistantBlock (7902–7904) → монтировать ProcessmanPanel; `processmanOpen` state; пропсы к тулбару |
| `src/components/process/SchemaAssistantBlock.jsx` | без изменений (переносится целиком) |
| `src/lib/api.js` | +`apiLlmStatus()` |
| `src/shared/i18n/ru.js` | +`processman.*` |
| `src/shared/i18n/en.js` | **новый** — только `processman.*` |
| Тесты | `ProcessmanPanel.test.mjs`, `processmanTokenEconomy.test.mjs`, + тесты кнопки; существующие тесты SchemaAssistantBlock — зелёные без правок |

## 3. Порядок и гейт

1. Backend + pytest → 2. Frontend + node-тесты → 3. Полный frontend-сьют
   (дельта ⊆ baseline 113) → 4. Визуальный гейт Z0-4 (скрины S1–S8, расширение
   `scripts/tobe_ux_z0_after.mjs`) → 5. PR по AGENTS.md → 6. Stage verify.

## 4. Вопросы к апруву — РЕШЕНЫ владельцем (2026-08-06, апрув плана)

- **Q1 ✅** Квота — по фиче `analysis` (used = `usage_daily_tokens("analysis", …)`,
  limit = daily_token_limit фичи analysis, дефолт 200000).
- **Q2 ✅** Роль — viewer+ (practical_role_for_org в {admin,editor,viewer} → 200;
  аноним → 401). Роли technologist в authz нет — не вводим.

## 5. Вне LLM4
UX-UPDATE (свой PR), PASSWORD_ROTATION_RULE.md (docs-коммит), TO BE workspace,
реальные ключи LLM.
