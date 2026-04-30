---
atlas_fallback: true
contour: fix/session-refetch-after-bpmn-save-nonblocking-v1
source_branch: fix/session-refetch-after-bpmn-save-nonblocking-v1
date: 2026-04-30
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 14_Журнал runtime evidence

## 2026-04-30 — fix/session-refetch-after-bpmn-save-nonblocking-v1

| Поле | Значение |
| ---- | -------- |
| Source | `origin/main` at `c3d02fdf74ae7352d921115930c9266f79ae818e` |
| Branch | `fix/session-refetch-after-bpmn-save-nonblocking-v1` |
| App version | `v1.0.94` |
| Stage/local bundle | local source/test proof; deploy не выполнялся |
| Input audit | `audit/project-performance-decomposition-and-slowdown-map-v1`, commit `448a5a3e0b8cbae713eb3aa0eef0e1c4c6edd8a0` |
| Baseline full session | `GET /api/sessions/1a5bd431d8`: 4,350,159 bytes / 3414ms |
| Prior post-save | `PUT /bpmn` ~1.15s + following `GET /session` до 6.47s |
| Verdict | `SOURCE_TESTED_STAGE_PROOF_PENDING` |

### Endpoint sequence

| Stage | Before | After |
| ----- | ------ | ----- |
| Durable save | `PUT /api/sessions/{id}/bpmn` | `PUT /api/sessions/{id}/bpmn` |
| Durable success status | после `PUT + GET /session` | после `PUT /bpmn 200` |
| Full session refresh | awaited before final save result | background promise when `backgroundSessionRefresh=true` |
| UI status | busy/sync while full fetch runs | `Сохранено на сервере`; optional `Обновляем состояние...` background phase |

> [!success] Test evidence
> `node --test src/features/process/camunda/camundaExtensionsSaveBoundary.test.mjs src/components/sidebar/CamundaExtensionState.status.test.mjs` passed: 14 tests, 0 failures.

> [!warning] Runtime status
> Stage runtime proof не выполнялся: deploy запрещён contour rules. Требуется stage verification после merge/deploy.
