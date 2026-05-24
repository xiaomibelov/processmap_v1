# SERVER_MARKER_MODEL_VALIDATION

## Expected 4-Agent Marker Model

| Marker | Created By | Verified By | Status |
|--------|-----------|-------------|--------|
| `READY_FOR_EXECUTION` | Agent 1 (planner script) | Agent 2, Agent 3 | ✅ supported |
| `WORKER_2_STARTED` | pm-agent2-executor-watch.sh | Agent 4 | ✅ supported |
| `WORKER_2_DONE` | pm-agent2-executor-watch.sh | Agent 4 | ✅ supported (added) |
| `WORKER_2_REPORT.md` | Agent 2 (kimi session) | Agent 4 | ✅ supported |
| `WORKER_3_STARTED` | pm-agent3-reviewer-watch.sh | Agent 4 | ✅ supported (added) |
| `WORKER_3_DONE` | pm-agent3-reviewer-watch.sh | Agent 4 | ✅ supported (added) |
| `WORKER_3_REPORT.md` | Agent 3 (kimi session) | Agent 4 | ✅ supported |
| `READY_FOR_REVIEW` | Legacy / Agent 2 | Agent 3 (legacy) | ✅ supported |
| `REVIEW_STARTED` | pm-agent4-reviewer-watch.sh | — | ✅ supported |
| `REVIEW_REPORT.md` | Agent 4 (kimi session) | — | ✅ supported |
| `REVIEW_PASS` | Agent 4 (kimi session) | — | ✅ supported |
| `CHANGES_REQUESTED` | Agent 4 (kimi session) | — | ✅ supported |
| `EXEC_BLOCKED.md` | Any agent | — | ✅ supported |
| `REVIEW_BLOCKED.md` | Any agent | — | ✅ supported |

## Script Support

- `pm-agent1-planner.sh` — создаёт `READY_FOR_EXECUTION` ✅
- `pm-agent2-executor-watch.sh` — создаёт `WORKER_2_STARTED` (через `EXECUTION_STARTED`) и `WORKER_2_DONE` ✅
- `pm-agent3-reviewer-watch.sh` — создаёт `WORKER_3_STARTED` и `WORKER_3_DONE` ✅
- `pm-agent4-reviewer-watch.sh` — ждёт `WORKER_2_DONE` + `WORKER_3_DONE`, создаёт `REVIEW_STARTED` ✅
- `pm-agent-status.sh` — проверяет все маркеры ✅
- `pm-agent-reset-stale.sh` — безопасно удаляет stale маркеры ✅

## Contour Directory Check

```bash
ls -la .planning/contours/tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1/
```

Контур поддерживает все маркеры через существующие файлы и/или поддержку скриптов.

## Verdict
**PASS** — Marker model полностью поддерживает 4-agent workflow.
