---
atlas_fallback: true
contour: fix/session-refetch-after-bpmn-save-nonblocking-v1
source_branch: fix/session-refetch-after-bpmn-save-nonblocking-v1
date: 2026-04-30
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 15_Backlog контуров

## Обновление статуса

| Contour | Статус | Evidence | Next |
| ------- | ------ | -------- | ---- |
| `fix/session-refetch-after-bpmn-save-nonblocking-v1` | implemented/source-tested/stage-pending | Реализация уже в `origin/main` через PR #257 / commit `2ef8288`; targeted tests pass | `fix/session-remote-poll-head-to-lightweight-summary-v1` |

> [!summary] Связь контуров
> Этот contour закрывает perceptual slowdown после successful durable BPMN save. Следующий contour должен отдельно убрать тяжёлый full-session fetch из background remote polling.
