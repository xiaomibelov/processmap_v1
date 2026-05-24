# Executor Prompt Compatibility Summary

Run ID: `20260522T205346Z-85330`
Contour: `cleanup/analytics-single-source-of-truth-v1`

This contour uses `SINGLE_EXECUTOR_MODE`.

- **Agent 2** receives `EXECUTOR_PART_1_PROMPT.md` and performs all substantive work.
- **Agent 3** receives `EXECUTOR_PART_2_PROMPT.md` and performs only shell merge finalization (no LLM).
- See `STATE.json` for execution mode details.
