# Camunda BPMN Import Defects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Camunda BPMN import so task names, task properties, and all subprocess child sessions survive import/save round-trips.

**Architecture:** Keep the fix bounded to BPMN import/session save paths. Add regression fixtures first, then fix backend XML parsing and subprocess auto-creation limits, then verify frontend Camunda extension extraction/round-trip behavior without changing deployment or unrelated UI flows.

**Tech Stack:** Python FastAPI/backend XML parsing with `xml.etree.ElementTree`; React/Vite frontend; `node --test`; backend unittest/pytest-compatible tests.

---

## Onboarding Facts

| Check | Result |
|---|---|
| Canonical repo | `/Users/mac/PycharmProjects/processmap_canonical_main` |
| Worktree | `/Users/mac/PycharmProjects/processmap_canonical_main/.worktrees/bugfix_camunda_import_defects` |
| Branch | `bugfix/camunda-import-defects` |
| Base | `origin/main` at `553bb58211916e3a8c795914ad28bc90e9aa8498` |
| Remote | `git@github.com:xiaomibelov/processmap_v1.git` |
| Worktree status before PLAN | clean |
| `CLAUDE.md` | not found |
| `registry.md` | not found |
| `PROCESSMAP` required notes | `EPIC BOARD` / `ACTIVE TASKS` not found by filename; only `PROCESSMAP/HANDOFF/*` exists |
| Active contours checked | `.planning/contours/*`; no direct Camunda/BPMN import contour conflict found |
| Related old worktree | `/Users/mac/PycharmProjects/processmap_fix_bpmn_import_subprocess_v1`; not reused, only treated as historical reference |

## Import Pipeline Map

| Module | Role | Evidence |
|---|---|---|
| `backend/app/routers/process_templates.py` | Template BPMN upload endpoint `POST /api/process-templates/import-bpmn` calls `parse_bpmn(xml_text)` | lines 175-199 |
| `backend/app/process_template/bpmn_import.py` | Template XML to `ui_model` parser | lines 310-590 |
| `backend/app/process_template/bpmn_export.py` | Template `ui_model` to BPMN XML exporter | lines 138-280 |
| `backend/app/camunda_meta_utils.py` | Session BPMN XML to `bpmn_meta.camunda_extensions_by_element_id` extractor | lines 233-351 |
| `backend/app/_legacy_main.py` | Session BPMN save/restore normalizes meta from XML | refs around `extract_camunda_extensions_from_bpmn_xml` |
| `backend/app/services/session_service.py` | Session BPMN save wrapper and subprocess auto-create flow | lines 499-545, 969-1094 |
| `backend/app/services/bpmn_navigation.py` | Subprocess finder/extractor/navigation XML helpers | lines 48-68, 365+ |
| `backend/app/routers/sessions.py` | Subprocess count/create/navigate endpoints | lines 77-87, 105-116 |
| `frontend/src/components/process/BpmnStage.jsx` | Runtime import/hydrate/sync from BPMN XML into sidebar/meta | lines 2245-2808, 5376-5578 |
| `frontend/src/features/process/camunda/camundaExtensions.js` | Frontend Camunda/Zeebe property extractor, inputOutput preservation, XML finalizer | lines 1433-1506, 1552-1710 |
| `frontend/src/features/explorer/explorerApi.js` | Frontend API helper for explicit subprocess creation with `load_all` | lines 105-113 |

## Root-Cause Hypotheses

| Defect | Likely Root Cause | Evidence For | Evidence Against / Unknown | 5-Minute Check |
|---|---|---|---|---|
| Nested task names missing | Template importer only iterates direct `bpmn:process` children. This explains loss of tasks inside `bpmn:subProcess`, and therefore loss of their original `name` values. It does **not** by itself prove that top-level task names are distorted. | `bpmn_import.py:444` uses `for el in process`, so nested tasks and their names are never imported; direct nested task `name` cannot survive if the task never reaches `ui_model.nodes`. | Direct top-level `name` is already copied into node `name` at `bpmn_import.py:532`; if top-level names are wrong on stage, this row is not enough. | Add fixture with top-level + nested task names, run `parse_bpmn`, and assert every XML `name` equals imported node `name` byte-for-byte. |
| Top-level task names distorted | Separate hypothesis: a later frontend/runtime mapping may overwrite explicit XML `name` with default/catalog labels or stale `draft.nodes` labels while rendering or saving. | `BpmnStage.jsx:5402` calls `normalizeTechnicalBpmnLabelsInXml(resolvedXmlRaw, draft?.nodes)` before modeler import; selected-name guard exists in `BpmnStage.readable-label-source.test.mjs`, which means this area has had regressions. | Not yet proven. Need a failing test/repro showing top-level XML names change even when `parse_bpmn` preserves them. | Add a frontend regression around `normalizeTechnicalBpmnLabelsInXml` / BpmnStage render path: explicit XML `name` on top-level task must not be overwritten by stale/default `draft.nodes` labels. |
| Properties missing in subprocess tasks | There are two property paths: session meta extractor walks all XML, but template importer only parses direct task children and stores `camunda:property` in a dict, losing duplicate names/order and unknown rows | `camunda_meta_utils.py:265` uses `root.iter()` and preserves rows; `bpmn_import.py:169-177` uses `Dict[str,str]`, overwriting duplicate keys; `bpmn_import.py:444` misses nested tasks entirely | Session BPMN stage likely already extracts nested properties if XML is saved raw; need test to prove whether the user sees loss in session path or template import path | Add backend tests for nested `bpmn:subProcess/bpmn:task` properties through `parse_bpmn` and `extract_camunda_extensions_from_bpmn_xml`; add frontend test extracting nested properties/inputOutput |
| Only about 10 subprocesses created | Save path intentionally limits auto-create to 10; explicit endpoint can load all, but save/import path does not call it automatically. Correct fix is no fixed numeric cap: either full in-memory iteration over parsed elements or fetch-all pagination to completion. | `session_service.py:512-520` comment says create up to 10; `auto_create_subprocess_sessions` default `limit=10` at line 972; loop uses `elements[:limit]` at line 988; `create_subprocess_sessions(load_all=False)` caps at 10 at lines 1089-1090 | User says “last ~10”, code creates first 10 in XML order; UI sorting may make them appear as last 10 | Add regression with 15 subprocesses and assert save auto-creates 15 child sessions, not 10. Add note that replacing `10` with `1000` is not an acceptable fix. |

## Design Decisions

| Area | Decision |
|---|---|
| Names | Preserve explicit BPMN XML `name` exactly for every imported flow node, including top-level tasks and tasks inside `bpmn:subProcess`. Do not trim, normalize whitespace, catalog-normalize, or fallback-overwrite explicit names. For missing `name`, use empty `name` in XML truth and a separate display fallback only where UI requires a label. |
| Nested subprocess tasks | Parse nested flow nodes recursively and retain a `parent_subprocess_id`/`parent_subprocess_path` marker in `ui_model.nodes` so data is not flattened silently. Existing consumers that ignore the marker keep current behavior. |
| Camunda properties | Replace `Dict[str, str]` as the primary preservation model with an ordered list of pairs: `properties.extensionProperties: [{ "key": key, "value": value, "name": key, "id": stable_id }, ...]`. `name` remains for compatibility with existing frontend/backend code, but `key,value` is the target semantic model. Continue mapping ProcessMap-known `params.*`, `outputs.*`, `operation_code`, `recipe_params` into existing `params/outputs/operation_code` fields for compatibility. |
| Unknown extension XML | Do not drop unknown extension content. Preserve unmanaged XML fragments in `preservedExtensionElements`, matching the existing session meta shape. |
| Input/output parameters | Keep `camunda:inputOutput` as preserved XML and validate extraction through `extractCamundaInputOutputParametersFromExtensionState`. Do not force it into `params` unless an existing PM field explicitly supports it. |
| Subprocess count | For import/save of a BPMN XML, create/refresh all top-level subprocess child sessions. Keep explicit endpoint `load_all` compatible, but remove the default save/import cap as the user-facing behavior. Do not replace `limit=10` with another fixed number such as `1000`; use all parsed elements or a loop/pagination strategy that runs to completion. |
| Backward compatibility | Existing `ui_model.nodes[*].params`, `outputs`, `operation_code`, and `recipe_params` remain populated as before. New richer Camunda state is additive. |

## Tasks

### Task 1: Add Failing Backend Fixtures for Template Import

**Files:**
- Create: `backend/tests/fixtures/camunda_import_nested_properties.bpmn`
- Create: `backend/tests/fixtures/camunda_import_15_subprocesses.bpmn`
- Create: `backend/tests/test_camunda_bpmn_import_defects.py`

- [ ] **Step 1: Create minimal nested fixture**

Fixture requirements:
- one top-level task with Cyrillic `name`;
- two `bpmn:subProcess` elements;
- nested tasks named `Измерить температуру` and `Изменить режим оборудования`;
- nested `camunda:properties` rows `ingredient=Крем`, `equipment=Термощуп`, `tara=Шпилька`, `target_temperature=82`;
- one `camunda:inputOutput` block to verify preservation.

- [ ] **Step 2: Create large subprocess fixture**

Fixture requirements:
- 15 top-level `bpmn:subProcess` elements, IDs `Sub_01` through `Sub_15`;
- each subprocess contains one task `Sub_XX_Task` with unique `name`;
- each subprocess has minimal DI shape so existing navigation extraction can produce child XML.

- [ ] **Step 3: Write failing `parse_bpmn` tests**

Test assertions:
- `parse_bpmn(xml).ui_model["nodes"]` contains nested tasks, not only top-level tasks;
- each task `name` equals the XML `name` exactly, byte-for-byte, for both top-level tasks and nested tasks inside `bpmn:subProcess`;
- extension row order and duplicate-name rows are not collapsed in the richer Camunda state;
- `inputOutput` is represented in preserved extension state.

- [ ] **Step 4: Run failing backend tests**

Run:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_camunda_bpmn_import_defects.py -q
```

Expected before fix: fails because nested tasks/properties are missing or duplicate properties collapse.

### Task 2: Fix Template Import Names and Properties

**Files:**
- Modify: `backend/app/process_template/bpmn_import.py`
- Modify: `backend/app/process_template/bpmn_export.py`
- Test: `backend/tests/test_camunda_bpmn_import_defects.py`

- [ ] **Step 1: Replace direct child node iteration**

Change the parser from `for el in process:` to a recursive helper that walks BPMN flow nodes inside `process` and nested `subProcess`, excluding structural children like `incoming`, `outgoing`, `extensionElements`, `documentation`, and `sequenceFlow`.

- [ ] **Step 2: Preserve exact task names**

Keep `element_name = el.get("name") or ""` as XML truth. Do not strip, catalog-normalize, or fallback-overwrite explicit names. Add a display-only fallback such as `display_name = element_name or operation_code or element_id` only when `display_name` is absent.

This step fixes nested-name loss caused by the parser. It does not close the separate top-level name-distortion hypothesis unless the frontend/runtime name regression from Task 3 also proves clean.

- [ ] **Step 3: Preserve Camunda state in row form**

Add a parser helper that returns:

```python
{
    "properties": {
        "extensionProperties": [{"id": "prop_<stable>", "key": key, "name": key, "value": value}, ...],
        "extensionListeners": [],
    },
    "preservedExtensionElements": ["<camunda:inputOutput ...>...</camunda:inputOutput>"],
}
```

The helper must preserve document order, keep duplicate keys/names with different values, and only collapse exact duplicate `(key, value)` rows if existing normalization requires it.

- [ ] **Step 4: Keep compatibility fields**

Continue deriving:
- `operation_code` from property `operation_code`;
- `params[key]` from `params.<key>`;
- `outputs[key]` from `outputs.<key>`;
- `recipe_params` from semicolon-separated `recipe_params`;
- bare `*_ref` into `params`.

- [ ] **Step 5: Include new meta in `ui_model`**

Add:

```python
ui_model["bpmn_meta"] = {
    "version": 1,
    "camunda_extensions_by_element_id": camunda_extensions_by_element_id,
}
```

Only include non-empty element entries. This mirrors the session `bpmn_meta` shape and avoids losing unknown Camunda data in template import.

- [ ] **Step 6: Export round-trip compatibility**

Update `generate_bpmn` so it writes all rows from `ui_model.bpmn_meta.camunda_extensions_by_element_id` when present, while still supporting legacy `operation_code/params/outputs` generation for older templates.

- [ ] **Step 7: Run focused backend tests**

Run:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_camunda_bpmn_import_defects.py backend/tests/test_transformation_golden.py backend/tests/test_validation_service.py -q
```

Expected after fix: all focused tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/process_template/bpmn_import.py backend/app/process_template/bpmn_export.py backend/tests/fixtures/camunda_import_nested_properties.bpmn backend/tests/test_camunda_bpmn_import_defects.py
git commit -m "fix(import): preserve camunda task names and properties"
```

### Task 3: Add Frontend Regression for Camunda Extension Extraction

**Files:**
- Modify: `frontend/src/features/process/camunda/camundaExtensions.test.mjs`
- Modify: `frontend/src/features/process/bpmn/bpmnIdentity.test.mjs` or add a focused BpmnStage source/behavior test if the function under test is not exported
- Optional modify: `frontend/src/features/process/camunda/camundaExtensions.js`
- Optional modify: `frontend/src/features/process/bpmn/bpmnIdentity.js`

- [ ] **Step 1: Add failing nested extraction test**

Add a test with `bpmn:subProcess` containing nested tasks and assert:
- `extractCamundaExtensionsMapFromBpmnXml(xml).Task_Temperature.properties.extensionProperties` contains `ingredient/equipment/tara`;
- `preservedExtensionElements` contains `camunda:inputOutput`;
- `extractCamundaInputOutputParametersFromExtensionState` exposes input/output rows.

- [ ] **Step 2: Add top-level name distortion regression**

Add a focused test for the name/label normalization path used by `BpmnStage.jsx:5402`.

Fixture:
- XML contains top-level task `Task_Top` with exact `name="Измерить температуру\nпосле выдержки"`;
- `draft.nodes` contains the same `id` but stale/default names like `Операция` / `Task_Top`;
- output XML must keep the explicit XML `name` byte-for-byte.

If the normalizer is not exported, add a source-level guard first, then refactor only enough to test the pure function. Do not change global labels/rendering outside the BPMN import path.

- [ ] **Step 3: Add round-trip test**

Use `finalizeCamundaExtensionsXml` on the same map and assert:
- all properties survive;
- `camunda:inputOutput` survives;
- no explicit XML task `name` is rewritten.

- [ ] **Step 4: Fix only if the new test fails**

If extraction already passes, leave `camundaExtensions.js` unchanged and document that frontend extractor is not the root cause. If it fails, fix the extractor/finalizer narrowly.

- [ ] **Step 5: Run focused frontend tests**

Run:

```bash
cd frontend
node --test src/features/process/camunda/camundaExtensions.test.mjs src/features/process/camunda/propertyDeleteRoundtrip.test.mjs src/features/process/bpmn/bpmnIdentity.test.mjs src/app/bpmnMetaNormalization.test.mjs
```

Expected after fix: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/process/camunda/camundaExtensions.js frontend/src/features/process/camunda/camundaExtensions.test.mjs frontend/src/features/process/bpmn/bpmnIdentity.js frontend/src/features/process/bpmn/bpmnIdentity.test.mjs
git commit -m "fix(import): preserve explicit bpmn names and extension state"
```

### Task 4: Remove the Subprocess Auto-Create Limit

**Files:**
- Modify: `backend/app/services/session_service.py`
- Test: `backend/tests/test_subprocess_navigation.py`
- Optional test: `backend/tests/test_camunda_bpmn_import_defects.py`

- [ ] **Step 1: Add failing 15-subprocess test**

Add a test that:
- creates a parent session with 15 top-level subprocesses;
- calls the actual import/save path through `bpmn_save`, not a direct helper call with an artificially high limit;
- asserts all 15 children exist via `session_repo.find_by_parent_element` or child listing.
- asserts the returned save metadata reports `subprocesses_total=15`, `subprocesses_created=15`, and `subprocesses_has_more=False`.

- [ ] **Step 2: Make save/import create all subprocesses**

Change `bpmn_save` auto-create path from:

```python
summary = auto_create_subprocess_sessions(s, request, limit=10)
```

to a full count:

```python
summary = auto_create_subprocess_sessions(s, request, limit=len(elements))
```

Update `created/has_more` logic so `subprocesses_has_more` is `False` after a successful full import/save.

Do **not** replace `10` with `1000`, `9999`, or any other fixed cap. The save/import path must process the complete `elements` collection, or page/fetch until no elements remain if the implementation is later moved behind a paginated data source.

- [ ] **Step 3: Keep endpoint compatibility**

Keep `/api/sessions/{id}/create-subprocesses?load_all=true` behavior. If the default endpoint still intentionally creates 10 for manual UI batches, do not change it unless the failing test proves the import path uses it.

- [ ] **Step 4: Run focused backend tests**

Run:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_subprocess_navigation.py backend/tests/test_camunda_bpmn_import_defects.py -q
```

Expected after fix: 15 of 15 child sessions created/refreshed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/session_service.py backend/tests/test_subprocess_navigation.py backend/tests/test_camunda_bpmn_import_defects.py
git commit -m "fix(subprocess): create all children on bpmn import"
```

### Task 5: Baseline and Full Regression

**Files:**
- Create: `.planning/contours/bugfix/camunda-import-defects/EXEC_REPORT.md`
- Optional: `PROCESSMAP/HANDOFF/2026-08-11 - bugfix camunda import defects.md`

- [ ] **Step 1: Capture baseline on `origin/main`**

Run tests before/around implementation and record current failures:

```bash
cd frontend
node --test src/features/process/camunda/camundaExtensions.test.mjs src/features/process/camunda/propertyDeleteRoundtrip.test.mjs src/app/bpmnMetaNormalization.test.mjs
```

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_camunda_meta_utils.py backend/tests/test_subprocess_navigation.py backend/tests/test_validation_service.py -q
```

- [ ] **Step 2: Run post-fix focused tests**

Run:

```bash
cd frontend
node --test src/features/process/camunda/camundaExtensions.test.mjs src/features/process/camunda/propertyDeleteRoundtrip.test.mjs src/app/bpmnMetaNormalization.test.mjs
```

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_camunda_bpmn_import_defects.py backend/tests/test_camunda_meta_utils.py backend/tests/test_subprocess_navigation.py backend/tests/test_validation_service.py -q
```

- [ ] **Step 3: Run broader touched-contour suite**

Run:

```bash
cd frontend
node --test src/features/process/camunda/*.test.mjs src/app/bpmnMetaNormalization.test.mjs src/lib/api.bpmn.test.mjs src/lib/api.subprocessNavigation.test.mjs
```

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_transformation_golden.py backend/tests/test_transformation_pipeline.py backend/tests/test_bpmn_restore_endpoint.py backend/tests/test_bpmn_put_redis_lock.py -q
```

- [ ] **Step 4: Write EXEC_REPORT**

Include:
- root cause per defect with `file:line`;
- exact commits;
- test baseline vs post-fix;
- fixture diff before/after;
- remaining risks.

- [ ] **Step 5: Commit report**

```bash
git add .planning/contours/bugfix/camunda-import-defects/EXEC_REPORT.md PROCESSMAP/HANDOFF
git commit -m "docs(import): report camunda import defect fixes"
```

## Acceptance Checklist

| Requirement | Verification |
|---|---|
| Names after import equal XML names exactly | `backend/tests/test_camunda_bpmn_import_defects.py` |
| Cyrillic names and multiline names preserved | fixture + backend test |
| All `camunda:properties` rows present | backend + frontend tests |
| `camunda:inputOutput` preserved | backend + frontend tests |
| Unknown extension XML not dropped | frontend existing unknown extension test + new nested test |
| 15 of 15 subprocesses imported/created | backend subprocess test |
| Import/export round-trip keeps names/properties | backend exporter test + frontend finalizer test |
| No merge/deploy without approve | manual gate after PR |

## Risks / Open Questions

| Risk | Handling |
|---|---|
| User's real Camunda file may use `bpmn:userTask`, `serviceTask`, or Camunda Cloud `zeebe:properties` | Tests should include at least `task`, `userTask`, and one Zeebe/camunda dual namespace case if real file confirms it |
| `ui_model.bpmn_meta` may be ignored by current template consumers | Keep compatibility fields and verify importer response shape; if UI ignores `ui_model.bpmn_meta`, add a bounded frontend adapter test before changing UI |
| Creating all subprocess child sessions could be heavier for huge diagrams | User requirement is all subprocesses; if performance becomes a concern, replace limit with explicit paginated loop to completion and report count |
| `registry.md`, `EPIC BOARD`, `ACTIVE TASKS` absent | Documented as onboarding gap; no assumption made from missing files |

## Stop Gate

Status: **AWAITING USER APPROVAL**.

No product code is changed in this phase. Implementation starts only after explicit approval.
