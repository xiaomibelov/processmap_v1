---
atlas_fallback: true
contour: backend/notes-extraction-apply-boundary-v1
source_branch: backend/notes-extraction-apply-boundary-v1
date: 2026-05-07
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 15_Backlog контуров

## Notes extraction preview/apply chain

| Contour | Status | Notes |
| --- | --- | --- |
| `backend/notes-extraction-ai-preview-endpoint-v1` | done in `origin/main` | preview draft and runtime logging |
| `uiux/notes-extraction-preview-review-panel-v1` | done in `origin/main` | preview UI, apply disabled |
| `backend/notes-extraction-apply-boundary-v1` | implemented/source-tested | explicit selected-candidate apply endpoint |
| `uiux/notes-extraction-apply-action-v1` | next | enable apply controls against `/notes/extraction-apply` |
| `backend/migrate-notes-extraction-to-ai-runtime-v1` | later | deeper prompt/runtime governance for extraction preview |

Backlog note: frontend apply controls should send selected candidates and current `base_diagram_state_version`; they must not call legacy `/notes`.

