# BPMN PROPERTY TYPES FOUND — fix/bpmn-properties-parser-audit-v1

## Real BPMN Files on Disk

**Result:** No `.bpmn` or `.bpmn2` files found in `workspace/`, `backend/`, or anywhere else in the project tree.

All BPMN XML is stored in the database column `sessions.bpmn_xml`.

## XML Patterns Observed in Test Data & Codebase

Based on inspection of test fixtures and existing XML parsing utilities (`backend/app/clipboard/xml_codec.py`, `backend/app/exporters/bpmn.py`), the following BPMN property patterns exist in real XML:

### 1. `camunda:property` (name/value)
- Found in: `clipboard/xml_codec.py:144–153`
- Pattern: `<camunda:property name="x" value="y" />` inside `<extensionElements>`
- Already partially handled via `bpmn_meta.camunda_extensions_by_element_id`

### 2. `bpmn2:property` / `<property>` (name/value)
- Pattern: `<bpmn:property name="deadline" value="2024-12-31" />` inside a task
- Found in test BPMN XML created for this contour
- **Not handled by old parser**

### 3. Custom attributes on flow elements
- Pattern: `<bpmn:task custom:priority="high" custom:owner="admin" />`
- Found in test BPMN XML
- **Not handled by old parser**

### 4. `documentation` fields
- Pattern: `<bpmn:documentation>Review the submitted invoice</bpmn:documentation>`
- Found in: `clipboard/xml_codec.py:127–132`
- **Not handled by old parser**

### 5. `extensionElements` containing properties
- Pattern: `<bpmn:extensionElements><camunda:property ... /></bpmn:extensionElements>`
- Found in: `clipboard/xml_codec.py:135–159`
- Old parser only reads pre-extracted JSON; does not parse XML directly

### 6. `dataObject` properties
- Pattern: `<bpmn:dataObject id="DataObject_1" name="Invoice" itemSubjectRef="xsd:string" />`
- Found in test BPMN XML
- **Not handled by old parser**

### 7. `lane` attributes
- Pattern: `<bpmn:lane id="Lane_1" name="Approval" />`
- Found in: `backend/app/exporters/bpmn.py`
- **Not handled by old parser**
