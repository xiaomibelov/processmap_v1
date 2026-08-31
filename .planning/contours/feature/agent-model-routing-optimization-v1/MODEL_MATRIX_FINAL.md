# MODEL_MATRIX_FINAL — agent-model-routing-optimization-v1

**Contour:** `feature/agent-model-routing-optimization-v1`  
**Run ID:** `agent-model-routing-optimization-v1-20260831T121742Z`  
**Status:** PLAN → pending approve

---

## Правило резолва

```
resolve_model_for_feature(feature, org_id):
    prompt = get_active_prompt(feature)
    model_class = prompt.model_class or 'primary'   # conservative fallback
    return resolve_model(feature, org_id, model_class)
```

Если `resolve_model` вернул `None` — gateway fallback на `provider.model`.

---

## Итоговая матрица feature × model_class × model

| # | Feature / интент | Ветка кода | model_class | Целевая модель | Обоснование |
|---|------------------|------------|-------------|----------------|-------------|
| 1 | `agent_router` | `route_intent` | cheap | `deepseek-chat` | Intent classification — 1 слово; уже cheap. |
| 2 | `agent_memory` | `update_schema_memory` | cheap | `deepseek-chat` | JSON summary/facts/decisions extraction; уже cheap. |
| 3 | `agent_summary` | фоновый summarizer | cheap | `deepseek-chat` | Dialogue summarization; уже cheap. |
| 4 | `agent_edit_propose` | `propose_edit_plan` | cheap | `deepseek-chat` | Edit plan generation + validation loop ≤6 iterations; уже cheap. |
| 5 | `processman_agent` — `node_qa` | `_run_node_qa_branch` | **cheap** | `deepseek-chat` | Step-level Q&A; после rag-dictionaries-coverage-v1 станет retrieval-bound. |
| 6 | `processman_agent` — `schema_overview` | `_run_schema_overview_branch` | **cheap** | `deepseek-chat` | Описание схемы по projection/RAG; low-creativity. |
| 7 | `processman_agent` — `doc_qa` (с RAG) | `_run_doc_qa_branch` | **cheap** | `deepseek-chat` | Ответ по предоставленным RAG-чанкам; low-creativity. |
| 8 | `processman_agent` — `doc_qa` (без RAG) | `_run_doc_qa_branch` → `_run_free_answer_branch` | primary | `claude-opus-4-6` | Fallback на свободный ответ с полной JSON-проекцией. |
| 9 | `processman_agent` — `smalltalk` / fallback | `_run_free_answer_branch` | **cheap** | `deepseek-chat` | Дефолт при любом сбое роутера; биллить сбои в Opus — анти-экономия. |
| 10 | `processman_agent` — `suggest_next` | `_run_suggest_next_branch` | primary | `claude-opus-4-6` | Творческая генерация следующего шага/блока. |
| 11 | `processman_agent` — `edit_canvas` | `_run_edit_canvas_branch` | primary | `claude-opus-4-6` | Многошаговое рассуждение и планирование правок. |
| 12 | `agent_edit` | final answer in `edit/applier.py` | primary | `claude-opus-4-6` | Финальный ответ после применения правки; high-creativity. |
| 13 | `schema_assistant` | monolith LLM3 | per monolith config | — | Вне скоупа (monolith). |

---

## Критерии классификации `processman_agent`

```python
if intent == "node_qa":
    model_class = "cheap"
elif intent == "schema_overview":
    model_class = "cheap"
elif intent == "doc_qa":
    model_class = "cheap" if rag_results else "primary"  # fallback to free_answer
elif intent == "suggest_next":
    model_class = "primary"
elif intent == "edit_canvas":
    model_class = "primary"
else:  # smalltalk / router failure / unknown
    model_class = "cheap"
```

---

## Seed pricing (migration 032)

| model_name | model_class | $/1M prompt | $/1M completion | cost_prompt_1k_usd | cost_completion_1k_usd |
|------------|-------------|-------------|-----------------|--------------------|------------------------|
| `deepseek-chat` | cheap | $0.50 | $2.00 | 0.0005 | 0.002 |
| `claude-opus-4-6` | primary | $15.00 | $75.00 | 0.015 | 0.075 |

Цены — placeholder; админ обновляет через `llm_models` без redeploy.

---

## Fallback-правила

1. **Нет active prompt:** `model_class = 'primary'`.
2. **Нет default-модели для класса:** fallback на `provider.model`.
3. **Провайдер не поддерживает resolved model:** provider-level error → failover на следующего провайдера; если никто не ответил — gateway error.
