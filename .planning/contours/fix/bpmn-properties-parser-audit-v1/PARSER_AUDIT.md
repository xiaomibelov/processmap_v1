# PARSER_AUDIT — fix/bpmn-properties-parser-audit-v1

## Parser Code Location

**Primary file:** `backend/app/routers/process_properties_registry.py`

**Key functions:**
- `_extract_camunda_rows(source)` — lines 185–324
- `_registry_payload(inp, request)` — lines 592–683

## What the Parser Currently Does

1. Reads `bpmn_meta.camunda_extensions_by_element_id` from the session metadata dictionary.
2. For each element ID in that map, extracts:
   - `extensionProperties` → rows with `property_type="Camunda property"`
   - `extensionListeners` → rows with `property_type="Camunda listener"`
3. Parses `bpmn_xml` **only** to build an `element_lookup` table (element id → tag type + title). It does **not** extract properties from the XML itself.
4. Returns rows with hardcoded `source_kind="bpmn_meta.camunda_extensions_by_element_id"`.

## XML Parsing Method

- Uses `xml.etree.ElementTree` (stdlib).
- No regex or string search — proper DOM iteration.

## Files Referencing Parser Data

| File | Usage |
|------|-------|
| `backend/app/storage.py:3184` | `list_process_properties_registry_sources` queries `bpmn_meta_json` + `bpmn_xml` |
| `backend/app/_legacy_main.py:4036` | Populates `camunda_extensions_by_element_id` from frontend payload |
| `backend/app/clipboard/xml_codec.py:135` | `serialize_extension_elements` already parses XML for clipboard ops (not reused by registry) |

## Findings

- **Camunda-only extraction:** Only properties pre-parsed into `bpmn_meta` by the diagram modeler are shown.
- **Raw XML is ignored** for property discovery.
- **No provenance tracking** beyond the hardcoded `source_kind`.
