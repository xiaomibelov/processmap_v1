# RAG preflight planner

Команда:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "uiux/analytics-registry-layout-density-and-visual-system-v1" --area "ProcessMap planning context" --format md --top-k 10
```

Статус: выполнено успешно 2026-05-18.

## Ключевые факты

- RAG является read-only suggestion/context layer.
- Agent 1 Planner обязан использовать GSD discipline: PLAN.md, bounded scope, acceptance criteria, STATE.json.
- Reviewer для UI/runtime работы обязан проверять fresh runtime `:5180`.
- Reviewer не должен выдавать pass без exact user scenario и runtime evidence.
- RAG output не может мутировать code, BPMN XML или Product Actions durable truth.

## Предупреждения

- RAG не нашел достаточно runtime-specific facts для этого нового contour id.
- Требуется явный runtime proof на review стадии.
- Не печатать secrets; credential-bearing remote URL не дублировать в отчетах.

