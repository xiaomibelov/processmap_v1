---
atlas_fallback: true
contour: fix/session-remote-poll-head-to-lightweight-summary-v1
source_branch: fix/session-remote-poll-head-to-lightweight-summary-v1
date: 2026-04-30
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 05_Карта сохранения и CAS

## Remote head polling отделён от save/CAS

> [!warning] Remote poll не является save writer
> Фоновая проверка обновлений не должна менять durable truth и не должна маскировать CAS-conflicts. Её задача — дешёво обнаружить, что серверная версия изменилась.

| Flow | Writer? | Durable truth changes? | Full session load? |
| ---- | ------- | ---------------------- | ------------------ |
| `PUT /api/sessions/{id}/bpmn` | yes | yes, через backend ack и CAS | no |
| `GET /api/sessions/{id}/bpmn/versions?limit=1` poll | no | no | no |
| Remote update indicator | no | no | no |
| Explicit refresh action | no write | hydrates local client state from server | yes, user initiated |

```mermaid
sequenceDiagram
  participant Poll as Remote poll
  participant Head as BPMN version head
  participant Save as Save/CAS writer
  Poll->>Head: GET /bpmn/versions?limit=1
  Head-->>Poll: diagram_state_version + actor/head metadata
  Poll-->>Poll: compare with local known version
  Note over Poll: No PUT, no PATCH, no CAS retry, no durable truth mutation
  Save->>Save: CAS remains only in save flows
```

> [!success] CAS unchanged
> Save conflicts remain handled by existing save paths. This contour removes only automatic background `GET /session` escalation from remote poll.
