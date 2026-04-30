---
atlas_fallback: true
contour: fix/session-remote-poll-head-to-lightweight-summary-v1
source_branch: fix/session-remote-poll-head-to-lightweight-summary-v1
date: 2026-04-30
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 15_Backlog контуров

## Обновление статуса

| Contour | Статус | Evidence | Next |
| ------- | ------ | -------- | ---- |
| `fix/session-remote-poll-head-to-lightweight-summary-v1` | implemented/source-tested/stage-pending | Remote poll no longer calls full `apiGetSession`; targeted tests pass | `fix/bpmn-history-headers-default-and-lazy-xml-v1` |

> [!summary] Связь контуров
> Этот contour убирает full session fetch из background remote polling. Следующий contour должен отдельно закрепить lazy XML/default headers policy для BPMN history.
