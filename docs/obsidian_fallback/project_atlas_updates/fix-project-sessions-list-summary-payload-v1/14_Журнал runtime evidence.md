---
atlas_note: "14_Журнал runtime evidence"
contour: "fix/project-sessions-list-summary-payload-v1"
status: "runtime-stage-pending"
date: "2026-04-30"
source: "fallback"
---

# 14_Журнал runtime evidence

## 2026-04-30 — fix/project-sessions-list-summary-payload-v1

| Поле | Значение |
| ---- | -------- |
| Source branch | `fix/project-sessions-list-summary-payload-v1` |
| App version | `v1.0.94` |
| Stage bundle до фикса | `index-DY2lsbX4.js`, app footer `v1.0.93` |
| Endpoint до | `GET /api/projects/e41791f9f7/sessions` |
| Before payload/time | `4,803,702 bytes / 4448ms` |
| Endpoint после | `GET /api/projects/e41791f9f7/sessions?view=summary` |
| After stage payload/time | `RUNTIME_STAGE_PROOF_PENDING` |
| Local proof | `4,105,730 bytes / 236.16ms` -> `5,704 bytes / 12.11ms` |
| Verdict | `LOCAL_ONLY`, stage proof pending deploy |

> [!success]
> Local backend proof показывает order-of-magnitude reduction: summary payload стал около `5.7 KB` на 12 heavy sessions.

> [!warning]
> Deploy не выполнялся по правилам contour. Stage proof нужно снять после отдельного deploy-разрешения.
