# git-proof — fix/rag-embedder-onnx-latency-v1

Зафиксировано 2026-09-05 (локально, до push).

## Контур

- worktree: `/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone-worktrees/fix/rag-embedder-onnx-latency-v1`
- branch: `fix/rag-embedder-onnx-latency-v1` (трек `origin/feature/rag-hybrid-search-sidecar-v1` как upstream до ff-merge; целевая интеграция — feature-ветка PR #912)
- base: `29b9cbe0` = feature HEAD на момент старта контура (PR #912). Намеренное
  отклонение от правила «baseline = origin/main»: контур закрывает
  latency-FAIL из A/B-замера этого же PR, изменения обязаны попасть в него.

## Коммиты контура (fix-ветка)

```
f52024f3 deploy: EMBEDDINGS_ORT_THREADS=4 для rag-embedder (баланс на контенд. VM, см. BENCHMARK.md)
3c7a4b1a rag: overlap query-эмбеддинга с BM25-полкой через prefetch future
0af5742a feat(rag-embedder): ONNX int8 сайдкар вместо torch (build-time export)
775094e3 fix(rag-hybrid): раздельные таймауты query (5s, fail-fast) / passage (60s)
```

## Тесты

- `backend/tests/test_rag_hybrid_api.py + test_rag_fusion_rrf.py + test_rag_embeddings_client.py` — **35 passed** (после коммита 3c7a4b1a).
- Полный backend-suite контура не расширялся вне заявленных файлов; таймаут-сплит покрыт 3 новыми кейсами в test_rag_embeddings_client.py.

## Handoff-proof

**Цель:** снять latency-FAIL A/B PR #912 (hybrid p50 ~x16 vs keyword на CPU-torch).

**Закрыто:**
1. ONNX int8 сайдкар (build-time export+quantize) — standalone p50 617→77.9ms (×7.9), batch-16 8033→266.6ms (×30) при согласованном тред-пуле.
2. Сплит таймаутов query 5s / passage 60s (fail-fast деградация вместо систематического ожидания 60s на query).
3. Overlap query-эмбеддинга с BM25-полкой (prefetch future) — убирает последовательное сложение ~80ms+87ms.
4. BENCHMARK.md с методологией, версиями, числами, cos-drift, ограничениями.

**Риски/ограничения:**
- Абсолютные цифры — контендеженная docker VM разработчика; сравнительные выводы валидны (одна машина, одно окно).
- ONNX cold/warm определения отличаются от torch (warm-up встроен в старт ONNX).
- Критерий ×1.2 при последовательном исполнении недостижим; overlap — осознанная
  оптимизация, итоговый вердикт фиксируется честно по стековому замеру.
