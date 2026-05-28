# GAP ANALYSIS — fix/bpmn-properties-parser-audit-v1

| Property Type | Exists in BPMN? | Parser Handles? | Gap |
|---------------|-----------------|-----------------|-----|
| camunda:property | Yes | Yes (via bpmn_meta) | Only pre-parsed meta; misses XML-only camunda props |
| bpmn2:property / `<property>` | Yes | **No** | **Missing** — parser never reads `<property>` from XML |
| custom attributes on flow elements | Yes | **No** | **Missing** — parser ignores non-standard attributes |
| documentation fields | Yes | **No** | **Missing** — parser ignores `<documentation>` |
| extensionElements | Yes | Partial | Only via pre-parsed JSON; raw XML extensionElements not scanned |
| dataObject properties | Yes | **No** | **Missing** — parser ignores `<dataObject>` |
| lane/set attributes | Yes | **No** | **Missing** — parser ignores `<lane>` |

## Root Cause

The property registry backend (`_extract_camunda_rows`) is designed around `bpmn_meta.camunda_extensions_by_element_id`, a JSON sidecar produced by the frontend diagram modeler. It never falls back to parsing the canonical BPMN XML when that sidecar is empty or incomplete.

## Impact

- Users see "Свойства не найдены" even when BPMN XML contains valid properties.
- The empty-state message misleadingly blames "missing Camunda extensions" when the real issue is parser coverage.
- No provenance to distinguish auto-extracted vs inferred properties.
