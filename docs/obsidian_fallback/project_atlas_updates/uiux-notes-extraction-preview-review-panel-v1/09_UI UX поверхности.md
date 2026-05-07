---
atlas_fallback: true
contour: uiux/notes-extraction-preview-review-panel-v1
source_branch: uiux/notes-extraction-preview-review-panel-v1
date: 2026-05-07
obsidian_status: OBSIDIAN_WRITE_BLOCKED
---

# 09_UI UX поверхности

## Notes extraction preview review panel

| Surface | Update |
| --- | --- |
| Sidebar `Заметки` | Adds process-level notes composer when no BPMN node is selected |
| Primary preview action | `Предпросмотр разбора` |
| Review panel | Shows source, fallback warnings, candidate roles/nodes/edges/questions, diff buckets and input hash |
| Apply state | Disabled `Применить` button; text says apply will arrive after apply-boundary contour |

Required copy is visible in the panel:

- `Это предпросмотр. Изменения ещё не применены.`
- `Применение будет добавлено отдельным контуром.`
- `Применение будет доступно после apply-boundary контура.`

Contextual AI action is now inside the notes surface. No global header AI entry is reintroduced.

