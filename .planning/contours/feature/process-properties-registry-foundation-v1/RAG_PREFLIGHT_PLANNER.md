# RAG_PREFLIGHT_PLANNER

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`  
Роль: Agent 1 / Planner  
Статус: `DONE`

## Команда

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feature/process-properties-registry-foundation-v1" --area "ProcessMap planning context" --format md --top-k 10
```

## Ключевой вывод preflight

- RAG является read-only suggestion/context layer.
- Запрещены auto-mutate code, auto-save files, BPMN XML writes и Product Actions auto-apply по RAG output.
- Agent 1 должен фиксировать GSD discipline, bounded scope, acceptance criteria и `STATE.json`.
- Для UI/runtime work reviewer обязан делать fresh `:5180` runtime proof.
- Preflight предупредил, что runtime facts по planner query не найдены; runtime proof вынесен в Agent 4.

## Использование в плане

- RAG не является источником данных для `Реестр свойств`.
- RAG не должен создавать строки, counts или registry data.
- RAG использован только для дисциплины planning/review gates.
- В Agent 4 gates добавлен запрет `REVIEW_PASS` без browser/runtime proof.

## Raw captured excerpt

```text
# ProcessMap Agent RAG Preflight

Input:
- role: planner
- contour: feature/process-properties-registry-foundation-v1
- area/query: ProcessMap planning context
- generated_at: 2026-05-18T19:36:18.876Z

Structured Facts:
- RAG is read-only suggestion/context layer.
- Agent 1 Planner must use GSD discipline.
- Agent 3 Reviewer must use GSD discipline.
- Agent 3 must verify fresh :5180 runtime for UI/runtime work.

Required Gates:
- GSD discipline recorded
- Source/runtime truth captured
- Bounded scope defined in PLAN.md
- Acceptance criteria defined
- User rejection facts reviewed
- No product code written by Agent 1
- No merge/deploy/PR without explicit approval

Warnings:
- No runtime facts matched query — runtime proof may be missing.
- REMINDER: Do not print secrets.
```
