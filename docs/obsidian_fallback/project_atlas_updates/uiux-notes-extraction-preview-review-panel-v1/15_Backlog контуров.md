---
atlas_fallback: true
contour: uiux/notes-extraction-preview-review-panel-v1
source_branch: uiux/notes-extraction-preview-review-panel-v1
date: 2026-05-07
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 15_Backlog контуров

## Notes extraction preview/apply chain

| Contour | Status | Notes |
| --- | --- | --- |
| `backend/notes-extraction-ai-preview-endpoint-v1` | done in `origin/main` | preview endpoint exists; no session mutation |
| `uiux/notes-extraction-preview-review-panel-v1` | implemented/source-tested | UI renders preview draft/diff and no-apply boundary |
| `backend/notes-extraction-apply-boundary-v1` | next | explicit apply endpoint with CAS and selected writes |
| `backend/migrate-notes-extraction-to-ai-runtime-v1` | later | deeper runtime/prompt governance migration after apply boundary |

Backlog note: apply controls must remain disabled until `backend/notes-extraction-apply-boundary-v1` exists.

