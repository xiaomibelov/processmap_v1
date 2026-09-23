# PLAN — fix/meta-writers-dsv-cache-invalidation (F7)

## Контекст
- Основание: `audit/cold-entry-arrows-lost-after-f2`, находка D3 (contributing).
- Симптом: meta-writers бампают `diagram_state_version` БЕЗ инвалидации серверного
  кэша сессии → Redis-проекция `session_cache` (TTL 30 с, app/cache/session_cache.py)
  отдаёт stale dsv → рассинхрон live dsv (GET /api/sessions/{id}) vs versions-head.
  Замер аудита: 159 vs 164.
- Baseline: origin/main = 91114a19 (ветка от него, без rebase — main не сдвинулся
  на момент старта контура).

## Диагноз (ШАГ 1, выполнен до кода)
Статический список meta-writers (bump dsv через `_mark_diagram_truth_write`,
save без инвалидации на baseline 91114a19), подтверждён read-only просмотром кода:

| # | Writer | Путь | save |
|---|--------|------|------|
| 1 | session_bpmn_meta_patch | backend/app/_legacy_main.py:4337 | :4344 |
| 2 | session_bpmn_meta_infer_rtiers | backend/app/_legacy_main.py:4378 | :4385 |
| 3 | answer | backend/app/session_answers.py:209 | :223 |
| 4 | post_notes | backend/app/notes_extraction.py:96 | :103 |
| 5 | post_notes_extraction_apply | backend/app/notes_extraction.py:397 | :404 |
| 6 | apply_approved_suggestions | backend/app/services/product_action_suggestions_service.py:174 | :182 |

Образец корректного поведения (премисса F5, подтверждена ревьюером): ops-write
и PUT /bpmn — инвалидация сразу после commit'а save через тот же
`_invalidate_session_caches`. Дедуп: второй механизм не вводится.

## ШАГ 2 — минимальный патч
Инвалидация `_invalidate_session_caches(...)` сразу после commit'а save в каждом
из 6 writers. Backend-diff ограничен meta-writer путями (4 файла).

## ШАГ 3 — тесты
`backend/tests/test_meta_writers_dsv_cache_invalidation.py`: на каждый writer —
тест «после meta-write свежий read возвращает новый dsv» (проекция не отдаёт
stale). RED подтверждён: без патча тест падает (1 != 2, stale projection).

## Границы
- Не трогать телеметрию, агрегатор, семантику F2-fallback из части 1 (#1027).
- D3 ≠ «добавить кэширование» — только инвалидация.
- Стоп на merge/deploy — только после явного approve владельца.

## Статус
- [x] ШАГ 1 (диагноз)
- [x] ШАГ 2 (патч)
- [x] ШАГ 3 (тесты + RED/GREEN)
- [x] Целевой backend suite, дельта падений 0 vs base
- [x] Push + PR (стоп на merge/deploy)
