---
atlas_note: "15_Backlog контуров"
contour: "fix/project-sessions-list-summary-payload-v1"
status: "implemented-source-tested"
date: "2026-04-30"
source: "fallback"
---

# 15_Backlog контуров

> [!summary]
> `fix/project-sessions-list-summary-payload-v1` переведён из P0 backlog в implemented/source-tested. Stage proof pending.

| Contour | Было | Стало | Следующий связанный contour |
| ------- | ---- | ----- | --------------------------- |
| `fix/project-sessions-list-summary-payload-v1` | P0 planned | `implemented-source-tested`, `RUNTIME_STAGE_PROOF_PENDING` | `fix/session-refetch-after-bpmn-save-nonblocking-v1` |

## Следующий шаг

| Priority | Contour | Причина |
| -------- | ------- | ------- |
| P0 | `fix/session-refetch-after-bpmn-save-nonblocking-v1` | Следующий крупнейший slowdown: full `GET /api/sessions/{id}` после durable `PUT /bpmn` |

Связанные заметки: [[08_Карта производительности]], [[14_Журнал runtime evidence]].
