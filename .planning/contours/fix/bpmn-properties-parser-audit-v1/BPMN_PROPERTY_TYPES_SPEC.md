# BPMN_PROPERTY_TYPES_SPEC

**contour:** `fix/bpmn-properties-parser-audit-v1`
**run_id:** `20260527T194532Z-14649`

---

## Supported Property Types (Target)

The parser must handle ALL of the following if they exist in user's BPMN files:

### 1. Camunda Properties
```xml
<camunda:properties>
  <camunda:property name="key" value="val"/>
</camunda:properties>
```
- Extract: `name`, `value`
- Provenance: `"из Camunda extension"`

### 2. BPMN2 Standard Properties
```xml
<bpmn2:property id="Property_1" name="myProp" itemSubjectRef="ItemDefinition_1"/>
```
- Extract: `id`, `name`, `itemSubjectRef`
- Provenance: `"автоматически из BPMN"`

### 3. Custom Attributes on Flow Elements
```xml
<bpmn2:task id="Task_1" name="My Task" my:customAttr="value"/>
```
- Extract: any attribute with a namespace prefix or known custom prefix
- Provenance: `"из custom attribute"`

### 4. Documentation Fields
```xml
<bpmn2:task id="Task_1">
  <bpmn2:documentation>key=value;other=val</bpmn2:documentation>
</bpmn2:task>
```
- Extract: structured key-value pairs if parseable
- Provenance: `"из documentation"`

### 5. extensionElements (non-Camunda)
```xml
<bpmn2:extensionElements>
  <custom:meta key="author" value="team"/>
</bpmn2:extensionElements>
```
- Extract: any child elements with `name`/`key`/`value` attributes
- Provenance: `"из extensionElements"`

### 6. DataObject Properties
```xml
<bpmn2:dataObject id="DataObject_1" name="CustomerData">
  <bpmn2:dataState name="validated"/>
</bpmn2:dataObject>
```
- Extract: `name`, `dataState`
- Provenance: `"из dataObject"`

### 7. Lane Attributes
```xml
<bpmn2:lane id="Lane_1" name="Accounting"/>
```
- Extract: `name` as property
- Provenance: `"из lane attribute"`

## Classification Rules

- If extracted directly from XML with clear name/value → `"Подтверждено"`
- If inferred or partially extracted → `"Предположение"`
- Always store `extraction_method` in provenance.
