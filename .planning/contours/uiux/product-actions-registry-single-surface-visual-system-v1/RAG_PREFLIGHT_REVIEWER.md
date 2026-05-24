# RAG_PREFLIGHT_REVIEWER

## Команда

`node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "uiux/product-actions-registry-single-surface-visual-system-v1" --area "Product Actions Registry visual review runtime acceptance" --format md --top-k 10`

## Статус

Выполнено 2026-05-18. RAG вернул runtime host fact, reviewer gates и релевантные prior registry review snippets.

## Ключевые structured facts

- Runtime host: `clearvestnic.ru`.
- Reviewer must collect fresh runtime proof.
- Reviewer must reproduce exact user scenario.
- RAG remains read-only suggestion/context layer.
- Product Actions must not be written into BPMN XML.

## Reviewer gates from RAG

- Reviewer GSD discipline section present in review report.
- Fresh runtime proof collected on `5180`.
- Exact user scenario reproduced.
- Before/after evidence collected when applicable.
- User rejection override checked.
- No `REVIEW_PASS` if user-visible scenario still fails.
- Product runtime unchanged outside scope.

## Planner interpretation

Previous registry contours repeatedly failed review because served runtime did not match intended worktree/build-info. Agent 4 must treat `intended != served` as a hard block before any visual verdict.

