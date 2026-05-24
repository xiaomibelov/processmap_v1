# RAG_PREFLIGHT_PLANNER

Контур: `tooling/registry-analytics-branch-hygiene-and-merge-scope-v1`  
Роль: planner  
Команда:

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "tooling/registry-analytics-branch-hygiene-and-merge-scope-v1" --area "ProcessMap planning context" --format md --top-k 10
```

## Статус

`PASS_WITH_WARNINGS`: RAG preflight выполнен. RAG доступен как read-only context layer и не должен мутировать код, BPMN XML или product actions.

## Ключевые факты RAG

- Agent 1 Planner обязан использовать GSD discipline: создать `PLAN.md`, acceptance criteria и `STATE.json`.
- Нужно фиксировать source/runtime truth.
- No product runtime code changes in RAG/tooling contours.
- No merge/deploy/PR без явного user approval.
- RAG warnings напомнили, что runtime facts по этому новому tooling contour ещё не были в индексе.

## Учтено в плане

- Product code не меняется Agent 1.
- Merge scope строится через classification manifest, а не через broad cleanup.
- Worker lanes независимы.
- Reviewer gate требует доказать coverage dirty/untracked files и отсутствие destructive git actions.
