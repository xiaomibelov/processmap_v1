# TESTS — rag-hybrid-search-sidecar-v1 (Фаза 2)

Дата: 2026-09-04. Ветка: `feature/rag-hybrid-search-sidecar-v1`.

## Итог прогона

```
97 passed, 6 warnings in 1012.90s (0:16:52)
```

Команда (venv `processmap_v1_main_clone/.venv`, хостовый python3 без pytest — не использовался):

```bash
cd backend
/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone/.venv/bin/python -m pytest \
  tests/test_rag_api.py tests/test_rag_bm25.py \
  tests/test_rag_fusion_rrf.py tests/test_rag_embeddings_client.py \
  tests/test_rag_hybrid_api.py tests/test_admin_rag_settings.py -q
```

Файлы `test_rag_api.py` / `test_rag_hybrid_api.py` / `test_admin_rag_settings.py` — тяжёлые
(sqlite-tempdir + полный schema-bootstrap на каждый тест, ~15-20s на setUp); это
базовая стоимость паттерна репозитория, не регрессия контура.

## Покрытие по файлам

### `tests/test_rag_fusion_rrf.py` — 15 тестов (pure unit, без БД)
- `test_doc_in_both_shelves_beats_top_of_single_shelf` — RRF: документ в обеих полках выше топа одной полки.
- `test_k60_sanity_identical_shelves_keep_order` — k=60 sanity: идентичные полки сохраняют порядок.
- `test_zero_weight_leg_contributes_nothing` — нулевой вес ноги → порядок другой ноги.
- `test_vector_dominant_weight_reorders_toward_vector_leg` — доминирующий vector_weight перестраивает порядок к векторной полке.
- `test_missing_vector_leg_keeps_bm25_order` — пустая векторная полка → порядок = BM25.
- `test_empty_legs_return_empty` / `test_ties_do_not_crash` — краевые случаи.
- `rank_by_vector`: ближайший первым, отсутствующие эмбеддинги пропускаются, cos ∈ (0, 1], пустые входы.
- `test_decode_roundtrip_384` / `test_decode_garbage_returns_empty` — float32 array('f') roundtrip 384-dim.
- `HybridScoreFormulaTests` (3) — формула `score = max(bm25, cos·scale)` из `routers/rag.py`
  (`_hybrid_fused_results`, sidecar/get_embeddings застаблены на уровне модулей, БД не нужна):
  scale guard = 1.0 при пустой BM25-полке; scale = max bm25 по кандидатам.

### `tests/test_rag_embeddings_client.py` — 9 тестов (pure unit)
- fallback → None + WARN на: connection error, timeout, HTTP 500, malformed payload
  (отсутствующий `embeddings`, count mismatch).
- success → `(embeddings, model_id, dimensions)`; пустые тексты без HTTP-вызова.
- `encode_vector`/decode roundtrip 384-dim.
- cooldown: после 3 неудач HTTP не дёргается (short-circuit → None); успех до порога сбрасывает счётчик.

### `tests/test_rag_hybrid_api.py` — 8 тестов (sqlite-tempdir, stub sidecar)
- `test_fusion_periphrase_surfaces_glossary_chunk_top` — перефраз «аппарат для быстрой
  заморозки продуктов» (нулевое лексическое пересечение с glossary-чанком) → blast_chiller_1
  первым при hybrid on; keyword-only — не первым. Sidecar вызван ровно 1 раз.
- `test_fusion_keyword_query_still_works` — прямой запрос «шокер» находит glossary-чанк при hybrid on.
- `test_degradation_sidecar_down_returns_keyword_only` — stub None → ответ идентичен hybrid-off (ok=true).
- `test_degradation_empty_embeddings_returns_keyword_only` — пустая rag_embeddings → идентично hybrid-off.
- `test_regression_hybrid_off_never_calls_sidecar` — hybrid off: 0 вызовов sidecar, keyword-результаты целы.
- `test_admin_patch_whitelists_new_fields_and_persists` — PATCH hybrid_enabled/bm25_weight/
  vector_weight/embedding_model_id → persist + readback через `get_rag_settings`;
  derived `embeddings_enabled`/`vector_search_enabled` = True при hybrid on.
- `test_admin_patch_still_rejects_unknown_and_invariant_fields` — unknown field / embeddings_enabled /
  vector_search_enabled → 400 (как до фичи).
- `test_admin_patch_rejects_bad_weight_and_empty_model_id` — валидация новых полей (400).

### Регрессионная база (существующие файлы, зелёные)
- `tests/test_rag_api.py` — 41 passed (контракт index/search не сломан).
- `tests/test_rag_bm25.py` — 10 passed.
- `tests/test_admin_rag_settings.py` — 14 passed (в т.ч. инварианты `embeddings_enabled: False`
  при hybrid off — совместимо с derived-семантикой Фазы 1).

## Фиксы Phase-1 кода по итогам тестов

Нет — тесты Фазы 2 не выявили багов в коде Фазы 1. Единственная правка в ходе Фазы 2 —
тестовое ожидание (`test_success_resets_cooldown` → `test_success_resets_failure_counter_before_cooldown`):
cooldown по дизайну блокирует и успешные вызовы 30s, сброс счётчика возможен только до порога.

## Вне фазы

- `RETRIEVAL_AB.md` (A/B-замер hit@3, latency p50, §9 PLAN) — **pending**: требует живой
  sidecar `rag-embedder` в compose-стеке (docker-команды вне окна этой фазы).
- Phase 3: draft PR, `PR.md`, `git-proof.md`.
