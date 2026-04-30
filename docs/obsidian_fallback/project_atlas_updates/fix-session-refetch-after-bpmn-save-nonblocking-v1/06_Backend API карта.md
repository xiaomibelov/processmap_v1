---
atlas_fallback: true
contour: fix/session-refetch-after-bpmn-save-nonblocking-v1
source_branch: fix/session-refetch-after-bpmn-save-nonblocking-v1
date: 2026-04-30
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 06_Backend API карта

## fix/session-refetch-after-bpmn-save-nonblocking-v1

> [!summary] Backend contract unchanged
> Для этого contour backend/API contract не менялся. Исправление находится во frontend save boundary: `PUT /bpmn 200` считается durable ack, а full `GET /session` переводится в background для hot BPMN property save path.

| Endpoint | Назначение | Изменение |
| -------- | ---------- | --------- |
| `PUT /api/sessions/{id}/bpmn` | Durable сохранение BPMN XML и `bpmn_meta` через canonical XML boundary | Без изменений |
| `GET /api/sessions/{id}` | Полная hydration сессии | Без изменений; может вызываться background после durable ack |

| Поле ack | Использование |
| -------- | ------------ |
| `version` / `storedRev` | локальная версия BPMN XML |
| `diagram_state_version` / `diagramStateVersion` | локальная monotonic save truth после `PUT 200` |
| `bpmn_version_snapshot` | canonical publish/version UI truth, если backend вернул snapshot |

> [!warning] Не добавлялся lightweight endpoint
> Этот contour не декомпозирует full session payload и не меняет `GET /api/sessions/{id}`. Следующий отдельный contour должен заниматься remote polling/head summary, а не post-save blocking status.
