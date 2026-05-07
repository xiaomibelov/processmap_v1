---
atlas_fallback: true
contour: backend/notes-extraction-apply-boundary-v1
source_branch: backend/notes-extraction-apply-boundary-v1
date: 2026-05-07
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 06_Backend API карта

## Notes extraction apply endpoint

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/sessions/{session_id}/notes/extraction-preview` | preview-only extraction draft; no session truth mutation |
| `POST` | `/api/sessions/{session_id}/notes/extraction-apply` | explicit selected-candidate apply with strict CAS |
| `POST` | `/api/sessions/{session_id}/notes` | legacy path; still mutates session and remains unchanged |

`/notes/extraction-apply` input:

- `base_diagram_state_version` required;
- optional `notes`, `input_hash`, `draft_id`, `source`;
- selected `roles`, `start_role`, `nodes`, `edges`, `questions`;
- flags `apply_notes`, `apply_roles`, `apply_nodes_edges`, `apply_questions`.

CAS failure returns `409` with existing diagram conflict detail shape.

