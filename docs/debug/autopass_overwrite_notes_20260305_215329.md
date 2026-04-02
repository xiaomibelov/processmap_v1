# AutoPass Overwrite Notes

## Overwrite semantics (where implemented)
- `POST /api/sessions/{session_id}/auto-pass` now creates `run_id` and immediately overwrites `bpmn_meta.auto_pass_v1` with running state:
  - file: `backend/app/routers/auto_pass.py`
  - function: `_mark_auto_pass_running(...)`
- Running state write happens before queue/sync execution and sets:
  - `schema_version`, `status=running`, `run_id`, `generated_at`, `limits`, empty `variants`, empty `debug_failed_variants`.
- Final result write is a full replace of `bpmn_meta.auto_pass_v1`:
  - file: `backend/app/routers/auto_pass.py`
  - function: `_persist_auto_pass_result(...)`
- Job payload and status include `run_id` to avoid mixing runs in diagnostics:
  - file: `backend/app/routers/auto_pass.py`
  - function: `run_auto_pass(...)`
  - file: `backend/app/auto_pass_jobs.py`

## Why V003 looked wrong in UI before
- Root cause #1: legacy normalizer dropped v1.1 fields (`status`, `run_id`, `end_reached`, `end_event_id`, `detail_rows`) when reading from `bpmn_meta`.
  - file: `backend/app/_legacy_main.py`
  - function: `_normalize_auto_pass_v1(...)`
- After this drop, frontend/doc saw legacy shape and could not reliably distinguish complete/non-complete variants.
- Root cause #2: engine details for completed variants ended with last gateway choice because `end_event` row was not appended.
  - file: `backend/app/auto_pass_engine.py`
  - function: `_enumerate_variants(...)->traverse(...)`

## Fixes applied
- Reworked `_normalize_auto_pass_v1(...)` to preserve/normalize v1.1 fields and keep only complete variants in `variants`.
- Added explicit `end_event` row into `detail_rows` for completed variants.
