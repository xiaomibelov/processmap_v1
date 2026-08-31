# COST_AB — agent-model-routing-optimization-v1

**Contour:** feature/agent-model-routing-optimization-v1  
**Fixture:** `large_schema_300_nodes` (300 шагов, 299 рёбер)  
**Pricing (placeholder, seeded в `llm_models`):**
- deepseek-chat: $0.50 / $2.00 за 1M токенов (prompt / completion)
- claude-opus-4-6: $15.00 / $75.00 за 1M токенов

## Метод

Оба замера запускаются из одного harness'а `tests/test_measurement_baseline.py`:
- `AGENT_ROUTING_MEASUREMENT=before` — эмулирует поведение до Phase 1: все
  `processman_agent`-интенты идут на `claude-opus-4-6` (primary).
- `AGENT_ROUTING_MEASUREMENT=after` — использует новую матрицу PromptBuilder:
  low-creativity интенты → `deepseek-chat`, high-creativity fallback → primary.

LLM замокан: `completion_tokens` фиксированы 100, `prompt_tokens` оценены по
длине JSON сообщений (1 токен ≈ 4 символа).

## Результаты

| Метрика | ДО (baseline) | ПОСЛЕ (новая матрица) |
|---------|--------------:|-----------------------:|
| **Total cost USD** | **$1.097631** | **$0.431438** |
| Процент экономии | — | **60.70%** |

## Детализация по сценариям

| Сценарий | ДО model | ДО cost | ПОСЛЕ model | ПОСЛЕ cost | Экономка |
|----------|----------|--------:|-------------|-----------:|---------:|
| smalltalk | claude-opus-4-6 | $0.340080 | deepseek-chat | $0.011286 | 96.68% |
| schema_overview | claude-opus-4-6 | $0.340155 | deepseek-chat | $0.011288 | 96.68% |
| doc_qa_with_rag | claude-opus-4-6 | $0.008775 | deepseek-chat | $0.000243 | 97.23% |
| doc_qa_no_rag | claude-opus-4-6 | $0.340875 | claude-opus-4-6 | $0.340875 | 0% |
| edit_canvas (×6) | deepseek-chat | $0.067746 | deepseek-chat | $0.067746 | 0% |

## Вывод

Экономия **60.7%** на контрольном наборе при сохранении primary-маршрута только
для high-creativity fallback (`doc_qa` без RAG). Деградации качества в unit- и
regression-тестах не обнаружено (`pytest tests/` — 119 passed, 1 skipped).
