# EXEC_REPORT — контур test/llm-testgen-admin (admin-батч LLM-генератора)

Ветка: `test/llm-testgen-admin` (worktree от `origin/main` 7c4b8c88 — включает #703).
Дата: 2026-08-10. Продолжение контура test/llm-test-generator (#703).

## Резюме

Второй батч LLM-генератора — тег **admin** (platform-admin эндпоинты).
**7/7 целей прошли гейты, 13 новых тестов, needs_human пуст.**

## Доработки инструмента (по урокам батча)

1. `_TAG_RULES` в generator.py — тег-специфичные правила промпта. Для admin:
   `create_user(..., is_admin=True)` обязателен (иначе 403), негативный кейс 403
   через `is_admin=False`.
2. Правило 12 «не выдумывай недостижимые 4xx»: у `/api/admin/permissions` и
   `/api/admin/permissions/matrix` все query-параметры необязательные строки →
   задокументированный 422 недостижим реальными входами; модель 3 итерации
   пыталась его нащупать (включая `pytest.fail("Expected 422...")`). После
   правила — обе цели прошли (200 + структура ответа).

## Результаты батча

| Операция | Итог |
|---|---|
| GET /api/admin/audit | passed, 1 итерация |
| GET /api/admin/error-events | passed, 2 итерации (конверт `{ok, items}` ≠ list) |
| GET /api/admin/permissions | passed после правила 12 |
| GET /api/admin/permissions/entities | passed, 1 итерация |
| GET /api/admin/permissions/matrix | passed после правила 12 |
| GET /api/admin/permissions/matrix/bulk (POST) | passed, 1 итерация |
| GET /api/admin/permissions/matrix/{pt}/{pid}/{et}/{eid} | passed, 2 итерации |

`--ops` подстроки захватили 7 операций вместо 5 запланированных — принято.

## Дельта покрытия (после notes-батча → после admin-батча)

| метрика | было | стало | дельта |
|---|---|---|---|
| covered | 27 (8.2%) | 32 (9.7%) | **+5** |
| partial | 61 | 67 | +6 |
| not_covered | 241 | 230 | **−11** |
| percent_exercised | 26.7% | 30.1% | +3.4% |

(−11 not_covered при 7 целях: admin-тесты заодно дергают смежные эндпоинты.)

## Верификация (git-proof)

- `pytest tests/llm_generated` — 22 passed (9 notes + 13 admin).
- Полный прогон `pytest tests --api-coverage`: **1065 passed, 26 failed** —
  26 падений побайтово совпадают с pre-existing списком (pg/redis), новых нет.
- LLM: 20 вызовов ≈ 175K токенов (deepseek-v4-flash), включая отладку правила 12.

## Ограничения / follow-up

- Недостижимые задокументированные 422 (permissions, matrix) — сигнал в
  spec-gap контур: либо параметры сделать валидируемыми, либо 422 убрать/пометить.
- Остались admin-цели с seed-параметрами (agent-runs/{run_id}, ai/prompts/{id},
  error-events/{event_id}) — нужны seed-хелперы в промпт (append_error_event и пр.).
- sqlite-env admin-операции (llm providers/prompts/features/usage) по-прежнему
  вне контура (pg-only таблицы).
