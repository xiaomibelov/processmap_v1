# NO_FAKE_PROPERTIES_RULES

Контур: `feature/process-properties-registry-foundation-v1`  
Run ID: `20260518T193421Z-91825`

## Verdict

ACTIVE: эти правила являются review gate для implementation и runtime review.

## Запрещено

- fake property rows;
- fake property counts;
- fake source counts;
- fake element counts;
- fake filter options;
- fake active scope;
- sample data disguised as registry data;
- using Product Actions rows as properties;
- claiming overlay/planned groups are current data;
- mutating BPMN XML to create data;
- creating backend/schema truth for demo.
- using RAG chunks as registry rows;
- showing property dictionary definitions as extracted rows;
- counting overlay hidden/preview totals as registry totals without exact source mapping;
- using `0` where the honest value is unknown; use `—`.

## Разрешено

- `—` for unavailable metrics.
- Honest foundation note.
- Planned groups as text only, clearly marked planned.
- Real rows only from documented confirmed current source.
- Explicit source labels such as `bpmn_meta.camunda_extensions_by_element_id`.
- Empty value status when the source row exists but value is blank.

## Required row proof

Every real row must have:

- source file/path in implementation docs;
- runtime data path;
- element id or object id;
- property name;
- value or explicit empty-value status;
- source group;
- no mutation path from viewing/filtering.

## Reviewer rule

Agent 4 must set `CHANGES_REQUESTED` if any fake row/count appears or if data source is not documented.
