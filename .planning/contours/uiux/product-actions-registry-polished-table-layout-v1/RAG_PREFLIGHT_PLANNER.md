# RAG_PREFLIGHT_PLANNER

Контур: `uiux/product-actions-registry-polished-table-layout-v1`  
Роль: planner  
Команда:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "uiux/product-actions-registry-polished-table-layout-v1" --area "ProcessMap planning context" --format md --top-k 10
```

## Статус

Выполнено: `2026-05-18T10:20:04Z`.

## Существенные факты

- RAG read-only: нельзя auto-mutate code, auto-save files, write BPMN XML или apply Product Actions по RAG output.
- Agent 1 Planner должен использовать GSD discipline: planning documentation, bounded scope, acceptance criteria, `STATE.json`.
- Reviewer должен проверять fresh `:5180` runtime и exact user scenario.
- Required gates: GSD discipline, source/runtime truth, bounded scope, acceptance criteria, user rejection facts, no product code by Agent 1, no merge/deploy/PR.

## Предупреждения

- RAG не нашел runtime facts для этого нового contour; runtime proof обязателен на стороне Agent 4.
- RAG output не является разрешением менять Product Actions durable truth или BPMN XML.

## Использование в плане

План ограничивает Agent 1 planning-only артефактами, требует source/runtime truth и вводит Agent 4 runtime gates. Product code changes разрешены только Worker 2 в bounded UI scope и только после branch hygiene proof.
