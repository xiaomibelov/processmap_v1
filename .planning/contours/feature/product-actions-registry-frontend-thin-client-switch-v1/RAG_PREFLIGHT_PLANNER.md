# RAG_PREFLIGHT_PLANNER

Generated at: `2026-05-19T14:43:54Z`
Role: `planner`
Contour: `feature/product-actions-registry-frontend-thin-client-switch-v1`

## Структурные факты

- Runtime fact: `frontend_url=http://clearvestnic.ru:5180`.
- Agent 1 must use GSD discipline: PLAN.md, bounded scope, STATE.json.
- RAG is read-only suggestion/context layer.
- No product runtime changes by Agent 1.
- Large frontend files require bounded edits and test coverage.

## Использование

RAG использован только для контекста planning/review gates. Он не изменял код, BPMN XML или Product Actions.
