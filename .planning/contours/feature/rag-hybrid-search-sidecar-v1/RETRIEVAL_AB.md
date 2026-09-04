# RETRIEVAL_AB — rag-hybrid-search-sidecar-v1

## Статус: PENDING — требуется живой sidecar (docker stack, env-lock)

A/B-замер retrieval **не выполнен**. Критерий приёмки «hybrid ≥ keyword на контрольном
наборе» (план §9) **не измерен end-to-end** и должен быть верифицирован при включении
на stage (runbook §16) **до approve мержа**. Причина: замер требует живой сервис
`rag-embedder` в compose-стеке с реальной моделью; docker-команды вне окон Фаз 1–3
(shared environment rules).

## Методология

- **Контрольный набор:** q11–q15 (перефразы/синонимы, включая «шокер») + q8–q10
  (baseline-факты) из `tools/rag/processmap-rag-validation-queries.json`.
- **Метрики:**
  - hit@3 по `expected_sources`/`expected_terms` (пасс по `pass_criteria` кейса);
  - latency поиска p50 — критерий «не деградирует >20%» vs keyword-only.
- **Ветки сравнения:** keyword-only (`hybrid_enabled=0`) vs hybrid
  (`hybrid_enabled=1, bm25_weight=0.5, vector_weight=0.5`), тот же индексный корпус,
  включение/выключение только конфигом `rag_settings` (без редеплоя).
- **Harness:** локальный compose-стек под `tools/pm-env-lock.sh acquire`
  (shared env mutex, AGENTS.md §10); bearer-токен admin/org-admin (см. AGENTS.md §2.2).

## Процедура (точные шаги)

```bash
# 0) Стек поднят, rag-embedder healthy (runbook §16.1), worker без ошибок импорта задачи
docker compose ps rag-embedder celery-worker

# 1) Наполнение векторного слоя (однократно, до включения hybrid)
curl -s -X POST http://localhost:8011/api/rag/index-dictionaries \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
# контроль: rows > 0 для model_id='local-e5-small' в rag_embeddings

# 2) Замер keyword-only (baseline)
curl -s -X PATCH http://localhost:8011/api/admin/rag/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"hybrid_enabled": 0}'
# прогнать q8-q15 (tools/rag/pm-rag-run-validation-queries.mjs или curl-цикл),
# записать hit@3 и latency p50 в таблицу ниже (колонка BM25-only)

# 3) Замер hybrid
curl -s -X PATCH http://localhost:8011/api/admin/rag/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"hybrid_enabled": 1, "bm25_weight": 0.5, "vector_weight": 0.5}'
# повторить прогон q8-q15 -> колонка Hybrid
# latency: замерить p50 search (минимум 20 повторов на кейс) для обеих веток

# 4) Fallback-проверка (контрольная точка runbook §16.5)
docker compose stop rag-embedder
# search ok=true, keyword-only без 5xx; затем docker compose start rag-embedder

# 5) Откат (если замер неудовлетворителен)
curl -s -X PATCH http://localhost:8011/api/admin/rag/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"hybrid_enabled": 0}'
```

## Результаты (заполняется при включении)

| Кейс | Ожидание (expected_sources) | BM25-only hit@3 | Hybrid hit@3 | BM25-only p50, ms | Hybrid p50, ms |
|---|---|---|---|---|---|
| q8-property-dictionary-task-properties | property_dictionary | | | | |
| q9-operation-catalog-parameters | operation_catalog | | | | |
| q10-glossary-term | glossary | | | | |
| q11-glossary-shocker-periphrasis | glossary (blast_chiller_1) | | | | |
| q12-glossary-blast-chiller-paraphrase | glossary (blast_chiller_1) | | | | |
| q13-glossary-shock-freeze-synonym | glossary (blast_chiller_1) | | | | |
| q14-operation-open-container-paraphrase | operation_catalog | | | | |
| q15-property-duration-paraphrase | property_dictionary | | | | |
| **Итого hit@3** | | | | | |
| **Latency p50 (среднее по кейсам)** | | | | | |

**pending: требуется живой sidecar (docker stack, env-lock)** — строки заполняются
по процедуре выше при включении на stage.

## Критерии приёмки (план §9)

- hybrid ≥ keyword на контрольном наборе (ожидаемый прирост — именно на q11–q15
  periphrasis-кейсах; q8–q10 не должны деградировать);
- fallback-матрица подтверждена вживую (sidecar stop → ok=true keyword-only);
- регрессия latency p50 < 20%.

**Честная фиксация:** на момент коммита ни одно из трёх утверждений не измерено
end-to-end; юнит/интеграционные тесты (97 passed) покрывают математику fusion и
деградацию на stub-sidecar, но не качество retrieval реальной моделью.
