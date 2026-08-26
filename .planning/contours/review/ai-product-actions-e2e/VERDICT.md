# VERDICT.md — review/ai-product-actions-e2e

Дата: 2026-08-25  
Статус: **фикс готов, PR открыт, GitHub Checks зелёные; E2E заблокирован до merge и stage-кредов**

---

## Резюме

Контур начинался с диагностики `AI_PROVIDER_NOT_CONFIGURED` на stage. В ходе работы выяснилось, что фича «Действия с продуктом» обходила единый LLM-шлюз и читала `DEEPSEEK_API_KEY` напрямую из env. Пользователь принял решение перевести фичу на шлюз.

Фикс реализован в ветке `fix/ai-product-actions-llm-gateway`, PR #833. Локальные тесты пройдены. Полный E2E на stage возможен только после ручного merge пользователем и предоставления stage-кредов.

---

## Проверка LLM-провайдера (шаг 2 контурного промпта)

| Вопрос | Ответ | Доказательство |
|---|---|---|
| Какой шлюз используют остальные AI-фичи? | `backend/app/ai/gateway.py` + `backend/app/ai/llm_internal_client.py` при `LLM_VIA_AGENT_SVC=1` | код `process_analysis.py`, `schema_assistant.py` |
| Где уходил мимо шлюза suggest? | `backend/app/routers/product_actions_ai.py:606` `load_llm_settings()` → прямой вызов DeepSeek | `PROVIDER.md`, diff |
| Зарегистрирована ли фича в шлюзе? | Да — добавлена миграцией `029` (`llm_prompts` + `llm_feature_flags` для `product_actions_suggest`) | `backend/alembic/versions/029_product_actions_llm_gateway_prompt.py` |
| Промпт в шлюзе или в коде? | В `llm_prompts` (active), код больше не хранит промпт как источник истины | migration + `PROVIDER.md` |

---

## E2E-сценарий (7 шагов) — статус

| Шаг | Статус | Доказательство | Примечание |
|---|---|---|---|
| 0. Провайдер настроен | ✅ Исправлено кодом | PR #833 | Работает через шлюз, ключи из БД |
| 1. Генерация suggestions | ⏳ Ожидает stage | — | После merge + deploy |
| 2. Теги + редактирование | ⏳ Ожидает stage | — | UI-шаг |
| 3. Approve/Reject | ⏳ Ожидает stage | — | UI-шаг |
| 4. Привязка к шагам | ⏳ Ожидает stage | — | UI-шаг |
| 5. RAG-readiness ready→queued | ⏳ Ожидает stage | — | UI-шаг + API |
| 6. Beat-таск 04:30 | ⏳ Ожидает stage | — | Проверить schedule + логи |
| 7. Смоук 5 соседних вкладок | ⏳ Ожидает stage | — | UI-шаг |

---

## Тесты

| Набор | Результат | Среда |
|---|---|---|
| `backend/tests/test_product_actions_ai_suggest.py` | **28 passed** | Docker `python:3.11-slim`, sqlite |
| `backend/tests/test_llm_provider_resolution.py` | **4 passed** | Docker `python:3.11-slim`, sqlite |
| `backend/tests/test_llm_gateway.py` | новый тест добавлен, требует Postgres | CI/Postgres |
| GitHub Checks PR #833 | **all green** | GitHub Actions |

---

## Git state

```
branch:     fix/ai-product-actions-llm-gateway
HEAD:       1533e7879af6f...
origin/main: 2a437a11cde19f52401c51dc28481ff3935b2c16
PR:         https://github.com/xiaomibelov/processmap_v1/pull/833
status:     clean (изменения закоммичены)
```

---

## Что требуется от пользователя

1. **Смержить PR #833 вручную** (`merge/deploy` агентом не выполняются).
2. **Предоставить stage-креды** для Playwright (email/password пользователя «Роботизация производств» или актуальная сессия/cookie).
3. После авто-деплоя stage — уведомить, чтобы пройти 7 шагов E2E и сохранить скриншоты в `evidence/`.

> Если креды не будут предоставлены, E2E будет завершён на API-уровне (curl-проверка `POST /api/sessions/05e59e4aea/analysis/product-actions/suggest`) с явной пометкой в `VERDICT.md`.

---

## Замечания

- Зеркалирование в Obsidian (`tools/pm-agent-mirror-report.sh`) не сработало, т.к. `/opt/processmap-test` отсутствует в этом окружении. Артефакты сохранены локально в `.planning/contours/review/ai-product-actions-e2e/`.
- Pre-existing failing test `NotesPanel.advanced-badge-semantics.test.mjs` не трогался (одна строка в `VERDICT.md`).
