# TEST RESULTS — fix/bpmn-properties-parser-audit-v1

## Backend Tests

**Command:**
```bash
cd /opt/processmap-test/backend
.venv/bin/python -m unittest tests.test_process_properties_registry_api -v
```

**Result:** 21 tests passed, 0 failures

| Test | Status |
|------|--------|
| test_canonical_endpoint_path_is_registered | ✅ |
| test_completeness_based_on_property_value | ✅ |
| test_csv_export_escapes_semicolons_quotes_and_newlines | ✅ |
| test_csv_export_returns_bom_filename_and_stable_columns | ✅ |
| test_element_type_and_title_populated_from_bpmn_xml | ✅ |
| test_element_type_filter_non_matching_returns_empty | ✅ |
| test_element_type_filter_returns_matching_rows | ✅ |
| test_empty_state_includes_scan_info_when_no_actions | ✅ |
| test_export_filters_and_zero_rows_are_handled | ✅ |
| test_export_scope_guard_matches_registry_query | ✅ |
| test_filter_options_reflect_actual_rows | ✅ |
| test_filters_and_pagination_work_over_filtered_rows | ✅ |
| test_graceful_degradation_when_bpmn_xml_missing | ✅ |
| test_project_and_workspace_scope_aggregate_multiple_sessions | ✅ |
| test_project_scope_denies_inaccessible_project | ✅ |
| test_read_only_no_db_writes_during_query | ✅ |
| test_response_envelope_has_all_required_fields | ✅ |
| test_scan_info_present_in_response | ✅ |
| test_session_scope_returns_properties_without_heavy_payload | ✅ |
| test_xlsx_export_returns_valid_workbook_with_expected_sheet_and_rows | ✅ |
| test_xml_properties_extracted_from_bpmn | ✅ |

## New Tests Added

1. **`test_xml_properties_extracted_from_bpmn`** — Seeds a session with BPMN XML containing `<property>`, `<documentation>`, `<extensionElements>`, custom attributes, `<dataObject>`, and `<lane>`. Verifies all 7 property types are extracted with correct `property_type` and `source_kind`.

2. **`test_scan_info_present_in_response`** — Verifies top-level `scan_info` object exists in registry query response and contains the 3 required fields.

3. **`test_empty_state_includes_scan_info_when_no_actions`** — Verifies that when no properties are found, the `empty_state` object includes `scan_info`.

## Regression

No existing tests were modified. All 18 original tests continue to pass unchanged.
