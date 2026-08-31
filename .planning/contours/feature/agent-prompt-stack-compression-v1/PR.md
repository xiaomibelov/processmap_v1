# PR — agent-prompt-stack-compression-v1

**Status:** готов к review — **merge только после явного approve**.

## Title

feat(agent): compress processman_agent prompt stack for large BPMN schemas

## Summary

Снижает количество prompt tokens для canvas-агента (`processman_agent`) на больших схемах за счёт замены полной JSON-проекции на компактное представление (статистика + RAG top-k + окрестность выбранного шага) и ограничения истории с защитой pending-edit контекста.

## Files changed

| File | Change |
|------|--------|
| `backend/services/agent/memory/prompt_builder.py` | новый модуль сборки компактных prompt'ов |
| `backend/services/agent/memory/chat.py` | интеграция PromptBuilder в ветки smalltalk/doc_qa/schema_overview |
| `backend/services/agent/memory/memory_store.py` | `get_conversation_summary()` |
| `backend/services/agent/tests/test_prompt_builder.py` | unit-тесты |
| `scripts/measure_prompt_tokens.py` | временный скрипт замеров (baseline / after / prod-like) |

## Diffstat

```
backend/services/agent/memory/chat.py              | 119 +++++++++----------------
backend/services/agent/memory/memory_store.py      |  22 +++++
backend/services/agent/memory/prompt_builder.py    | 440 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
backend/services/agent/tests/test_prompt_builder.py| 243 ++++++++++++++++++++++++++++++++++++++++
scripts/measure_prompt_tokens.py                   | 305 ++++++++++++++++++++++++++++++++++++++++
```

## Замеры токенов

Фикстура: `large_schema_300_nodes` (300 узлов, 340 рёбер, 50 turn'ов истории, вопрос «расскажи про эту схему»).

| Сценарий | Prompt tokens | Условия |
|----------|---------------|---------|
| Baseline (до) | **25 897** | Полная JSON-проекция, 50 turn'ов истории, без RAG, без pending-edit |
| After (минимальный) | **636** | Компактная проекция, 50 turn'ов истории, без RAG, без pending-edit |
| **After prod-like** | **681** | Компактная проекция + **3 mock RAG-чанка** + **1 pending-edit turn** |

**Итоговое снижение:** 25 897 → 681 (**~97.4%**), далеко ниже порога <5 000 tokens.

**Оговорка:** цифры — оценка через `tiktoken` / heuristic. Реальный биллинг провайдера может отличаться на **±10–20%** из-за особенностей токенизации, special tokens и формата сообщений. Запас по порогу в 7× покрывает эту погрешность.

## Verification

- [x] `scripts/measure_prompt_tokens.py --before` → 25 897 tokens.
- [x] `scripts/measure_prompt_tokens.py --after` → 636 tokens.
- [x] `scripts/measure_prompt_tokens.py --after-prod-like` → 681 tokens (с mock RAG + pending-edit).
- [x] `test_prompt_builder.py` — 14 unit tests pass.
- [x] Регрессия — 42 tests pass:
  - `test_branches.py`
  - `test_agent_chat_contract.py`
  - `test_agent_stream_contract.py`
  - `test_context.py`
  - `test_agent_memory.py`
  - `test_memory_worker.py`
- [x] Нет DB migrations; нет изменений OpenAPI; нет изменений frontend.

## Breaking changes

Нет. Контракт `AgentChatIn` / `AgentChatOut` не изменился.

## Notes

- Prompt caching (`cache_control` для Anthropic) **не входит** в этот контур; follow-up: `agent-gateway-cache-control-v1`.
- Расширение RAG source types (`property_dictionary`, `operation_catalog`, `glossary`) **не входит**; follow-up: `rag-dictionaries-coverage-v1`.
- Model routing / cheap-model swaps **не входят**; follow-up: `agent-model-routing-optimization-v1`.
- Измерительный скрипт использует `tiktoken` и находится в `scripts/measure_prompt_tokens.py`.
