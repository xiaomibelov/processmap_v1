---
atlas_fallback: true
contour: fix/session-remote-poll-head-to-lightweight-summary-v1
source_branch: fix/session-remote-poll-head-to-lightweight-summary-v1
date: 2026-04-30
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 06_Backend API карта

## fix/session-remote-poll-head-to-lightweight-summary-v1

> [!summary] Backend contract unchanged
> Backend не менялся. Frontend использует существующий headers-only endpoint `GET /api/sessions/{id}/bpmn/versions?limit=1` как lightweight remote head.

| Endpoint | Где используется | Поля для poll | Исключено |
| -------- | ---------------- | ------------- | --------- |
| `GET /api/sessions/{id}/bpmn/versions?limit=1` | `ProcessStage.jsx::pollRemoteSessionSnapshot` | `session_id`, `diagram_state_version`, `session_payload_hash`, `session_version`, `session_updated_at`, `created_at`, `author_*`, `source_action` | `bpmn_xml` by default, full `interview`, full `bpmn_meta`, notes, reports |
| `GET /api/sessions/{id}` | explicit refresh action | full hydration | not used by background poll |

> [!warning] История не перегружена
> Контур не добавляет тяжёлые поля к `bpmn/versions?limit=1` и не включает `include_xml=1` для remote poll.
