# RE-SCAN RESULTS — fix/bpmn-properties-parser-audit-v1

## Re-scan Method

Because there are **no BPMN files on disk**, a traditional filesystem re-scan is not applicable. Instead, the fix implements **runtime XML parsing** — every call to `/api/analysis/properties/registry/query` now:

1. Loads `bpmn_xml` from each matching session in the database.
2. Parses the XML on-the-fly for all 7 property types.
3. Combines results with pre-parsed Camunda metadata.

## Test Re-scan Results (SQLite test database)

| Session | BPMN XML? | Camunda Props | XML Props | Total Found |
|---------|-----------|---------------|-----------|-------------|
| Session A1 | Yes | 2 (priority, listener) | 0 | 2 |
| Session A2 | Yes | 1 (owner) | 0 | 1 |
| Session A3 Empty | No | 0 | 0 | 0 |
| Session B1 | Yes | 1 (service) | 0 | 1 |
| Session XML Props (new test) | Yes | 0 | 7 (deadline, documentation, camundaProp, priority, owner, dataObject, lane) | 7 |

## Property Types Checked

- `camunda:property`
- `bpmn2:property`
- `custom_attributes`
- `documentation`
- `extensionElements`
- `dataObject`
- `lane`

## New Properties vs Previously Known

- Previously known: only Camunda `extensionProperties` / `extensionListeners` from `bpmn_meta`.
- Newly discoverable: BPMN `<property>`, `<documentation>`, extensionElements descendants, custom attributes, dataObjects, lane attributes.

## Limitations

- Re-scan happens per API call; no background batch job was added.
- Existing sessions with properties in XML but empty `bpmn_meta` will now show those properties immediately on the next registry load.
