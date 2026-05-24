# Review Report

**Contour:** `feature/process-properties-registry-backend-contract-v1`
**Run ID:** `20260520T203825Z-44497`
**Reviewer:** Agent 4
**Status:** REVIEW_PASS

## Source Truth

| Item | Value |
|------|-------|
| pwd | `/opt/processmap-test` |
| remote | `origin -> github.com/xiaomibelov/processmap_v1.git` |
| branch | `feature/process-properties-registry-backend-contract-v1` |
| HEAD | `a2359d8ce732ab89f8911ec0479500ecd660a764` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| status | clean (4 files committed) |
| diff --stat | 4 files changed, 95 insertions(+), 12 deletions(-) |

## Review Checklist

### A. API contract — element_type enrichment

- [x] `element_type` in rows is populated from BPMN XML tag local-name, not hardcoded `""`.
  - Evidence: `_extract_camunda_rows` builds `element_lookup` from `ET.fromstring(bpmn_xml)`, uses `tag.split("}", 1)[1]` for local-name (router lines 204-222).
- [x] `element_title` in rows is populated from BPMN XML `name` attribute.
  - Evidence: `element_lookup[eid] = {"type": tag, "title": _text(elem.get("name"))}` (router line 217-219).
- [x] When `bpmn_xml` is missing or unparseable, fields gracefully fall back to empty strings.
  - Evidence: `try/except Exception: pass` around XML parse; `elem_info = element_lookup.get(element_id) or {}` yields empty fallback (router lines 207-222, 252-254).
- [x] `filter_options` contains `element_types` with unique sorted non-empty values.
  - Evidence: `_filter_options` includes `"element_types": set()` and collects `_text(row.get("element_type"))`, returns `sorted(v)` (router lines 364-383).
- [x] `applied_filters` contains `element_types` reflecting the request.
  - Evidence: `"element_types": _texts(filters.element_types)` in `_applied_filters` (router line 395).
- [x] Request input accepts `filters.element_types` as `List[str]`.
  - Evidence: `ProcessPropertiesRegistryFilters.element_types: List[str] = Field(default_factory=list)` (router line 62).

### B. Filter behavior

- [x] Filtering by `element_types` returns only rows with matching `element_type`.
  - Evidence: `_matches_filters` uses `_FILTER_MAP` which maps `"element_types" -> "element_type"` (router lines 48-54, 327-337). Test `test_element_type_filter_returns_matching_rows` passes.
- [x] Filtering by non-matching `element_types` returns empty rows (not error).
  - Evidence: Test `test_element_type_filter_non_matching_returns_empty` passes.
- [x] Existing filters (`property_types`, `groups`, `sources`, `processes`, `completeness`) continue to work.
  - Evidence: All 18 tests pass, including pre-existing filter/pagination tests.

### C. Frontend integration

- [x] `ProcessPropertiesRegistryPage.jsx` has a `Тип объекта` filter.
  - Evidence: Line 283: `<label>...<span>Тип объекта</span><select value={elementTypeFilter}...>`.
- [x] The `Тип объекта` options show BPMN types (e.g., `task`, `serviceTask`), not element IDs.
  - Evidence: `options.elementTypes` is built from `row.elementType` (line 211), which comes from `normalizeBackendRow` mapping `r.element_type` (line 59).
- [x] The filter resets correctly with "Сбросить фильтры".
  - Evidence: `resetFilters()` calls `setElementTypeFilter("")` (line 224).

### D. Read-only / no-mutation boundary

- [x] No `PUT/PATCH/DELETE` endpoints added.
  - Evidence: Only POST endpoints exist: `/query`, `/export.csv`, `/export.xlsx`.
- [x] BPMN XML is read-only; no writes to `session.bpmn_xml`.
  - Evidence: `bpmn_xml` is only read in `_extract_camunda_rows`; never written.
- [x] No mutation of `bpmn_meta`, Product Actions, or session storage during query.
  - Evidence: Test `test_read_only_no_db_writes_during_query` passes.

### E. Tests

- [x] `tests.test_process_properties_registry_api` passes (all tests OK).
  - Evidence: `Ran 18 tests in 17.520s — OK`.
- [x] Tests assert `element_type` and `element_title` are populated from XML.
  - Evidence: `test_element_type_and_title_populated_from_bpmn_xml` asserts `element_type == "task"` and `element_title == "Task One"`.
- [x] Tests assert `filter_options.element_types` presence.
  - Evidence: `test_filter_options_reflect_actual_rows` asserts `"task"` and `"serviceTask"` in `filter_options.element_types`.
- [x] Tests assert `element_types` filter behavior.
  - Evidence: `test_element_type_filter_returns_matching_rows` and `test_element_type_filter_non_matching_returns_empty`.
- [x] Graceful degradation when BPMN XML missing/unparseable.
  - Evidence: `test_graceful_degradation_when_bpmn_xml_missing` passes.

### F. Scope hygiene

- [x] Diff contains only expected files:
  - `backend/app/routers/process_properties_registry.py`
  - `backend/app/storage.py`
  - `backend/tests/test_process_properties_registry_api.py`
  - `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`
- [x] No schema migrations, no new durable tables, no unrelated files.

## Verification Command Output

### Backend tests
```
test_canonical_endpoint_path_is_registered ... ok
test_completeness_based_on_property_value ... ok
test_csv_export_escapes_semicolons_quotes_and_newlines ... ok
test_csv_export_returns_bom_filename_and_stable_columns ... ok
test_element_type_and_title_populated_from_bpmn_xml ... ok
test_element_type_filter_non_matching_returns_empty ... ok
test_element_type_filter_returns_matching_rows ... ok
test_export_filters_and_zero_rows_are_handled ... ok
test_export_scope_guard_matches_registry_query ... ok
test_filter_options_reflect_actual_rows ... ok
test_filters_and_pagination_work_over_filtered_rows ... ok
test_graceful_degradation_when_bpmn_xml_missing ... ok
test_project_and_workspace_scope_aggregate_multiple_sessions ... ok
test_project_scope_denies_inaccessible_project ... ok
test_read_only_no_db_writes_during_query ... ok
test_response_envelope_has_all_required_fields ... ok
test_session_scope_returns_properties_without_heavy_payload ... ok
test_xlsx_export_returns_valid_workbook_with_expected_sheet_and_rows ... ok

Ran 18 tests in 17.520s
OK
```

### Server runtime check
- Server not running at `localhost:8000` (returned 000).
- This is acceptable for a backend contract contour: tests provide independent contract proof. No UI/runtime drag test required (RAG preflight confirms this is not a diagram performance contour).

## Verdict

**REVIEW_PASS**

All checklist items verified. Source/runtime truth established. Tests pass. Contract implemented as specified. No blockers.
