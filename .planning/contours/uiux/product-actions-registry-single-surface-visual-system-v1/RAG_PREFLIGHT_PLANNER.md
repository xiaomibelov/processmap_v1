# RAG_PREFLIGHT_PLANNER

## Команда

`node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "uiux/product-actions-registry-single-surface-visual-system-v1" --area "ProcessMap planning context" --format md --top-k 10`

## Статус

Выполнено 2026-05-18. RAG вернул governance facts, planning gates и предупреждение об отсутствии runtime facts.

## Ключевые structured facts

- RAG is read-only suggestion/context layer.
- Agent 1 Planner must use GSD discipline.
- Agent 3/Reviewer must use GSD discipline and independent runtime proof.
- UI/runtime work requires fresh `:5180` proof.
- No product runtime code changes in RAG tooling contours.

## Required gates из RAG

- GSD discipline recorded.
- Source/runtime truth captured.
- Bounded scope defined in `PLAN.md`.
- Acceptance criteria defined.
- User rejection facts reviewed.
- No product code written by Agent 1.
- No merge/deploy/PR without explicit approval.

## Planner interpretation

RAG не дал registry-specific runtime truth для этого нового contour. Поэтому:

- runtime truth не считается доказанной на этапе planning;
- Agent 4 обязан собрать fresh runtime proof;
- RAG output используется только как контекст и guardrails.

