# PARSER FIX — fix/bpmn-properties-parser-audit-v1

## Changes Made

### 1. New XML Property Extractor

**File:** `backend/app/routers/process_properties_registry.py`

Added `_extract_xml_property_rows(source)` (lines 327–460) that parses raw `bpmn_xml` with `xml.etree.ElementTree` and extracts:

| Source | XML Pattern | `property_type` | `source_kind` |
|--------|-------------|-----------------|---------------|
| `<property>` children | `<bpmn:property name="x" value="y" />` | BPMN property | `bpmn_xml.property` |
| `<documentation>` children | `<bpmn:documentation>text</bpmn:documentation>` | Documentation | `bpmn_xml.documentation` |
| `<extensionElements>` descendants | Any `<property>` inside extensionElements | Extension property | `bpmn_xml.extensionElements` |
| Custom attributes | Non-standard attrs on tasks/events/gateways | Custom attribute | `bpmn_xml.custom_attribute` |
| `<dataObject>` elements | `<bpmn:dataObject name="..." />` | Data object | `bpmn_xml.dataObject` |
| `<lane>` elements | `<bpmn:lane name="..." />` | Lane attribute | `bpmn_xml.lane` |

### 2. Combined Extraction in Session Summary

Updated `_session_summary()` to combine Camunda + XML rows:
```python
actions = _extract_camunda_rows(source) + _extract_xml_property_rows(source)
```

### 3. Combined Extraction in Registry Payload

Updated `_registry_payload()` to aggregate both extractors and collect `scan_stats`.

### 4. Empty State with `scan_info`

Updated `_empty_state()` to accept optional `scan_info` and embed it in the `no_actions` response.

### 5. API Response Extended

`_registry_payload()` now returns top-level `scan_info`:
```json
{
  "bpmn_files_scanned": N,
  "property_types_checked": ["camunda:property", "bpmn2:property", "custom_attributes", "documentation", "extensionElements", "dataObject", "lane"],
  "total_properties_found": N
}
```

### 6. Frontend Empty State Updated

**File:** `frontend/src/features/analytics/PropertiesRegistry.jsx`

- `emptyStateMessages("no_actions")` description updated to honest multi-format message.
- Hint text updated from Camunda-only wording to generic property guidance.
- New `scanInfo` state reads `result.scan_info` from API.
- `EmptyStateBlock` renders scan breakdown when available.

## Provenance Model

| Extraction Method | Status Label | `source_kind` |
|-------------------|--------------|---------------|
| Automatically from BPMN XML | Подтверждено | `bpmn_xml.*` |
| From Camunda extension | Подтверждено | `bpmn_meta.camunda_extensions_by_element_id` |

## Files Modified

| File | Change |
|------|--------|
| `backend/app/routers/process_properties_registry.py` | Added `_extract_xml_property_rows`, updated `_session_summary`, `_registry_payload`, `_empty_state` |
| `frontend/src/features/analytics/PropertiesRegistry.jsx` | Updated empty-state messages, added `scanInfo` display |
| `backend/tests/test_process_properties_registry_api.py` | Added 3 new tests for XML extraction, `scan_info`, empty-state `scan_info` |
