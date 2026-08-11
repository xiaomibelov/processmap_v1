# EXEC_REPORT: bugfix/camunda-import-defects

## Summary
- Branch: `bugfix/camunda-import-defects`
- Base: `origin/main` = `553bb58211916e3a8c795914ad28bc90e9aa8498`
- Implementation commit: `46dc90e2 fix(import): preserve camunda task data`
- Merge/deploy: not performed.

## Root Causes

1. Nested Camunda tasks were skipped by the template importer.
   - Before fix, `backend/app/process_template/bpmn_import.py` iterated only direct `bpmn:process` children in the flow-node block. That lost tasks inside `bpmn:subProcess`, so their BPMN `name` and task properties never reached `ui_model`.
   - Fix: recursive flow-node/sequenceFlow traversal in `bpmn_import.py:275` and use at `bpmn_import.py:497`, `bpmn_import.py:600`.

2. Camunda properties were preserved only as a compatibility `Dict[str, str]`.
   - Existing `_parse_camunda_properties` still maps `name -> value` for legacy validation/mapping at `bpmn_import.py:159`, so duplicate names and ordering are not suitable as the preservation model.
   - Fix: `parse_bpmn` now also stores full ordered Camunda extension state in `ui_model.bpmn_meta.camunda_extensions_by_element_id`, with `{key,name,value}` rows, at `bpmn_import.py:305` and `bpmn_import.py:626`.
   - Export now reads ordered rows and raw preserved extension fragments from `bpmn_meta` before falling back to legacy node params at `bpmn_export.py:106`, `bpmn_export.py:117`, `bpmn_export.py:134`, and `bpmn_export.py:287`.

3. Existing-scheme import/save materialized only 10 subprocess child sessions.
   - Before fix, `bpmn_save` called `auto_create_subprocess_sessions(..., limit=10)`, so schemas with >10 subprocesses had only the first 10 child sessions created.
   - Fix: import/save path calls `limit=None` at `session_service.py:520`; `auto_create_subprocess_sessions` supports no fixed cap at `session_service.py:973` and `session_service.py:989`.
   - Manual endpoint behavior remains bounded unless `load_all=True`: `create_subprocess_sessions` still uses `min(10, total)` at `session_service.py:1091`.

Top-level name distortion hypothesis:
- In the backend template import path, top-level BPMN `name` was already copied from XML (`Task_Top` RED test passed that assertion before the fix). The confirmed defect was nested task loss, which also meant nested task names were absent. No separate backend top-level name mapper bug was reproduced in this contour.

## Test Coverage Added

- `backend/tests/fixtures/camunda_nested_task_properties.bpmn`
  - top-level task with Cyrillic name including newline;
  - task inside `bpmn:subProcess`;
  - duplicate `camunda:property name="ingredient"` rows;
  - `camunda:inputOutput` preserved as raw extension fragment.
- `backend/tests/fixtures/camunda_15_subprocesses.bpmn`
  - 15 top-level `bpmn:subProcess` elements, each with a Cyrillic task name.
- `backend/tests/test_camunda_import_defects.py`
  - file/import-template path: `parse_bpmn` preserves top-level and nested task names, ordered properties, raw inputOutput, and `generate_bpmn -> parse_bpmn` round-trip preserves names/properties.
  - existing-scheme import path: `bpmn_save(... source_action="import_bpmn")` creates 15/15 child subprocess sessions, not 10.

## Verification

Baseline before code changes:
- Backend targeted baseline:
  - `PYTHONPATH=backend python3 -m pytest backend/tests/test_camunda_meta_utils.py backend/tests/test_subprocess_navigation.py backend/tests/test_validation_service.py -q`
  - Result after installing Python 3.11 venv: `55 passed`.
- Frontend targeted baseline:
  - `node --test src/features/process/camunda/camundaExtensions.test.mjs src/features/process/camunda/propertyDeleteRoundtrip.test.mjs src/features/process/bpmn/bpmnIdentity.test.mjs src/app/bpmnMetaNormalization.test.mjs`
  - Result: `44 tests`, `41 pass`, `2 fail`, `1 skip`.
  - Baseline failures: `camundaExtensions.test.mjs` "finalize preserves guarded template-insert managed properties..." and "integration: duplicate element keeps semantic data...".

RED before fix:
- `PYTHONPATH=backend backend/.venv311-tests/bin/python -m pytest backend/tests/test_camunda_import_defects.py -q`
- Result: `2 failed`.
- Failures:
  - `Task_Sub_1` missing from parsed `ui_model["nodes"]`.
  - existing-scheme import created `10` subprocess sessions instead of `15`.

GREEN after fix:
- `PYTHONPATH=backend backend/.venv311-tests/bin/python -m pytest backend/tests/test_camunda_import_defects.py backend/tests/test_bpmn_import.py backend/tests/test_bpmn_roundtrip.py backend/tests/test_subprocess_navigation.py backend/tests/test_camunda_meta_utils.py backend/tests/test_validation_service.py -q`
- Result: `82 passed`, `17 warnings`.

Frontend after fix:
- Same targeted command as baseline.
- Result unchanged: `44 tests`, `41 pass`, `2 fail`, `1 skip`; fail-set did not grow.

Full suite notes:
- `npm test` completed with existing broad frontend failures: `2960 tests`, `2891 pass`, `65 fail`, `4 skipped`.
- Full backend `pytest backend/tests -q` was stopped after it reached unrelated local Postgres failures from `test_llm_gateway`: local DB rejected `role "fpc"`. Before stop it had already shown unrelated F/E outside this contour. Targeted backend gate above is green.

## Acceptance Checkpoints

1. Fixture >10 subprocesses + Cyrillic names + Camunda properties:
   - Covered by `camunda_15_subprocesses.bpmn` and `camunda_nested_task_properties.bpmn`.
2. Both import paths:
   - Creation from file/template path: `parse_bpmn` + `generate_bpmn` round-trip covered.
   - Import into existing scheme path: `bpmn_save(... source_action="import_bpmn")` covered.
3. Round-trip:
   - `import -> export -> import` preserves top-level and nested task names and ordered `camunda:property` rows byte-for-byte for tested names/values.
4. Deployment:
   - Not done.
