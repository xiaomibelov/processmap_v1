# EXECUTOR PROMPT (compatibility summary)

- run_id: `20260521T090400Z-76203`
- contour: `release/processmap-consolidate-dirty-tree-fix-tests-and-stage-v1`

This contour uses **single-lane execution**.

- **Primary executor prompt**: `EXECUTOR_PART_1_PROMPT.md` — Agent 2 performs all substantive work.
- **Merge finalizer prompt**: `EXECUTOR_PART_2_PROMPT.md` — Agent 3 performs shell-only merge, no LLM.

See `STATE.json` for mode rationale and artifact index.
