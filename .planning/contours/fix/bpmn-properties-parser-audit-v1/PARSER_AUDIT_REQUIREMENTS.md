# PARSER_AUDIT_REQUIREMENTS

**contour:** `fix/bpmn-properties-parser-audit-v1`
**run_id:** `20260527T194532Z-14649`

---

## Required Audit Questions

Agent 2 must answer each of these in `PARSER_AUDIT.md`:

1. **Parser location**: Which file(s) contain BPMN property extraction logic?
2. **Parser method**: Does it use regex, ElementTree, lxml, or string search?
3. **Camunda support**: Does parser look for `<camunda:properties>` and `<camunda:property>`?
4. **BPMN2 property support**: Does parser look for `<bpmn2:property>` or `<property>`?
5. **Custom attributes**: Does parser extract custom attributes from flow elements (tasks, events, gateways, sequences)?
6. **Documentation**: Does parser extract `<documentation>` fields?
7. **extensionElements**: Does parser recurse into `<extensionElements>` for non-Camunda properties?
8. **dataObjects**: Does parser extract properties from `<dataObject>` elements?
9. **Lanes/sets**: Does parser extract attributes from `<lane>` or `<laneSet>` elements?
10. **Namespaces**: How does parser handle XML namespaces (`bpmn2:`, `camunda:`, no prefix)?
11. **Error handling**: What happens when a BPMN file has no properties? Is the message honest?

## Evidence Requirements

- Include file paths and line numbers.
- Include code snippets of current parser logic.
- Include grep/ripgrep commands used to find the code.
