# RAG preflight reviewer

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Команда

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "feature/analytics-hub-actions-and-properties-registry-foundation-v1" --area "Analytics restore registry nesting runtime review" --format md --top-k 10
```

## Статус

PASS: команда выполнена.

## Captured summary

- Runtime facts: `http://clearvestnic.ru:5180`, `http://clearvestnic.ru:8088/health`, repo root `/opt/processmap-test`.
- Reviewer must use GSD discipline and collect fresh runtime proof.
- Reviewer must reproduce exact user scenario.
- Required gates: runtime proof, exact scenario, before/after evidence, no `REVIEW_PASS` if user-visible scenario fails.
- Warnings include prior user rejections where formal `REVIEW_PASS` did not match user-visible truth.

## Использование в reviewer prompt

- Agent 4 must validate real browser state on `:5180`.
- Source/tests only are insufficient.
- `REVIEW_PASS` is blocked by missing Analytics, nested IA violation, fake properties data, out-of-scope backend/BPMN/RAG changes, or failed one-white-container visual gate.
