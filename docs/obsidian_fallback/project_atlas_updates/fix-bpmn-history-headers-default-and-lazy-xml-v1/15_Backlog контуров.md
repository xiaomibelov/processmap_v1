---
title: "15 Backlog контуров"
type: project-atlas-update
contour: fix/bpmn-history-headers-default-and-lazy-xml-v1
date: 2026-05-01
status: source-tested
---

## Performance contours

| Контур | Статус | Комментарий |
| ------ | ------ | ----------- |
| `fix/session-refetch-after-bpmn-save-nonblocking-v1` | done in main / atlas fallback restored | PR #257 / commit `2ef8288`; файловый fallback добавлен из старого worktree |
| `fix/session-remote-poll-head-to-lightweight-summary-v1` | done in main / atlas fallback present | PR #264 / commit `6cb38cd`; не дублировался в product code |
| `fix/bpmn-history-headers-default-and-lazy-xml-v1` | implemented/source-tested/stage-pending | Текущий контур |

> [!summary] Next recommended contour
> `fix/session-patch-cas-self-conflict-queue-v1`

Если CAS queue уже закрыт, следующий UX-контур:

| Альтернатива | Когда выбирать |
| ------------ | -------------- |
| `uiux/save-status-durable-vs-sync-state-v1` | Если self-conflict queue уже закрыт и нужно прояснять save status |
