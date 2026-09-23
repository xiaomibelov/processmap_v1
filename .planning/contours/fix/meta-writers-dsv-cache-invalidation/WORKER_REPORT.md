# EXEC REPORT — fix/meta-writers-dsv-cache-invalidation (F7)

## Что закрыто
D3 из `audit/cold-entry-arrows-lost-after-f2`: у всех 6 meta-writers, бампающих
`diagram_state_version`, после commit'а save добавлена инвалидация session-кэшей
через существующий `_invalidate_session_caches` (паритет с ops-write / PUT /bpmn).
Теперь кэш-проекция `session_cache` не отдаёт stale dsv после meta-write.

## Доказательства
1. **code**: commit f450c996, ветка `fix/meta-writers-dsv-cache-invalidation`
   (от baseline 91114a19, main на старте контура не сдвинулся → rebase не нужен).
   Diff: 5 файлов, +369/−2 (4 backend app-файла + 1 тест-файл), backend-diff
   ограничен meta-writer путями.
2. **workspace**: worktree
   `server-backup/opt/processmap-test-worktrees/fix-meta-writers-dsv-cache-invalidation`.
3. **DB**: тесты на sqlite-temp; контракт «после meta-write проекция = DB dsv»
   проверен на каждом writer.
4. **env/compose**: не применимо (backend-only контур, pytest в .venv).
5. **serving mode**: не применимо до деплоя; стоп на merge/deploy.

## Тесты
- Новый файл `backend/tests/test_meta_writers_dsv_cache_invalidation.py`: 6/6 passed.
- RED: без патча (git stash backend/app) тот же тест падает
  `AssertionError: 1 != 2 — проекция отдаёт stale dsv` — механизм бага
  зафиксирован тестом.
- Целевой suite по затронутым модулям (локально, .venv):
  - test_meta_writers_dsv_cache_invalidation.py: 6 passed
  - test_answer_cas_commit.py + test_bpmn_meta_parse_cache.py: 4 passed, 4 skipped
  - test_session_cache.py: 12 passed
  - test_notes_extraction_preview_endpoint.py: 11 passed
  - test_product_action_suggestions.py: 11 passed
  - test_bpmn_meta.py: 42 skipped (env-ограничение, pre-existing)
  - test_session_meta_endpoint.py: 3 failed — **идентично на чистом base
    (91114a19), pre-existing, дельта падений 0**.
- Полный suite (2070 тестов) локально не прогнан за разумное время из-за
  pre-existing env-ограничения (celery backend `redis://redis:6379` не резолвится
  вне Docker, ~20 с ретраи на тест; помечено в conftest как skip-if-hanging).
  В CI pytest гоняется только в Docker (backend-contract.yml).

## Чеклист самопроверки
- [x] Инвалидация в том же запросе, что и commit save (после `st.save(...)`).
- [x] Использован существующий `_invalidate_session_caches` — второй механизм
      не введён (дедуп соблюдён).
- [x] Backend-diff ограничен meta-writer путями (4 файла).
- [x] Телеметрия, агрегатор, семантика F2-fallback (часть 1, #1027) не тронуты.
- [x] D3 = только инвалидация, кэширование не добавлялось.

## Риски/ограничения
- На хосте вне Docker без Redis `_invalidate_session_caches` деградирует
  молча (skip_no_client) — поведение идентично другим writers, pre-existing.
- Полный-suite гейт остаётся за CI/Docker.

## Осталось владельцу
- Merge в порядке, зафиксированном брифом: #1026 → #1027 (часть 1) → #1028
  (часть 2) → настоящий PR (часть 3).
- Деплой + живая приёмка: после meta-write (например, PATCH flow-meta) свежий
  GET /api/sessions/{id} отдаёт новый dsv без 30-секундного окна stale.
