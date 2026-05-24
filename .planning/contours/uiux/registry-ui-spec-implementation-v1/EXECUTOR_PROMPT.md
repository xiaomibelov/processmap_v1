# EXECUTOR PROMPT — Compatibility Summary

**Contour:** `uiux/registry-ui-spec-implementation-v1`  
**Run ID:** `20260522T072413Z-agent1-plan`

This file is a compatibility bridge for launchers that expect a single `EXECUTOR_PROMPT.md`.

## Execution Split

- **Part 1 (Frontend):** See `EXECUTOR_PART_1_PROMPT.md` → Agent 2
- **Part 2 (Backend):** See `EXECUTOR_PART_2_PROMPT.md` → Agent 3

## Contract Between Parts

Both agents agree on the `view_model` shape defined in `UI_SPEC.md` §7.1:

```json
{
  "view_model": {
    "title": "Реестр действий",
    "subtitle": "Действия с продуктами из сессий и проектов",
    "scope_tabs": [{"id": "...", "label": "...", "active": true, "count?": N}],
    "metrics": [{"label": "...", "value": N, "unit?": "...", "status?": "..."}],
    "filter_options": [{"id": "...", "label": "...", "options": [...], "selected?": null}],
    "applied_filters": [],
    "warnings": ["..."],
    "ai_suggestions": {"count": N, "action_label": "...", "action_url?": "..."},
    "items": [{"id": "...", "action_name": "...", "product_name": "...", "session_id": "...", "source": "...", "status": "...", "date": "..."}],
    "pagination": {"page": N, "per_page": N, "total": N},
    "source_state": {"sources": [{"name": "...", "count?": N, "active": true}]},
    "empty_state": null | {"title": "...", "description": "...", "action?": {...}}
  }
}
```

## Mode

`PARALLEL_REQUIRED` — both parts are independently executable.

---

*End of EXECUTOR_PROMPT.md*
