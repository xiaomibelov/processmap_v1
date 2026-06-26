# Obsidian Context Used — feature/save-decomposition-v1

**Searched:** `/srv/obsidian/project-atlas/ProcessMap` for `409`, `save.*decomposition`, `diagram_state_version`, `save operation`.

## Files read

| File | Relevance | Decisions taken |
|------|-----------|-----------------|
| `/srv/obsidian/project-atlas/ProcessMap/Architecture/MICROSERVICE_AUDIT.md` | High — existing microservice decomposition analysis and extraction priorities. | Confirmed extraction priority: auth/RAG first, session/process after facade; `_legacy_main.py` is the monolithic bottleneck; `interview_json.status` should become a column. |
| `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/api-patch-version-handling/PLAN.md` | High — prior 409 fix where `PATCH /bpmn_meta` did not return `diagram_state_version`. | Confirmed that missing version in meta-only responses is a known source of stale CAS. The current 409 bug is similar but triggered by property save via `PUT /bpmn` or `PATCH /meta`. |

## Notes

- No `ACTIVE TASKS` / `EPIC BOARD` files found in the vault root; search returned only AgentReports and Architecture docs.
- The audit artifacts in `.planning/contours/audit/save-decomposition/` are treated as the primary source-of-truth for this contour.
