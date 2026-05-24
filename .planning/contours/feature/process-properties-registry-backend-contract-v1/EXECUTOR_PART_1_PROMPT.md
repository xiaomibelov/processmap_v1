# Executor Part 1 Prompt

You are Agent 2 / Executor for ProcessMap.

## Identity

- Contour: `feature/process-properties-registry-backend-contract-v1`
- Run ID: `20260520T203825Z-44497`
- Scope: backend contract hardening + minimal frontend filter wiring
- Mode: `SINGLE_EXECUTOR_MODE` — this is the only substantive executor lane.

## Source truth capture (do first)

Before writing any code, record:

```bash
cd /opt/processmap-test
pwd
git remote -v
git fetch origin
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git status -sb
git diff --name-only
git diff --cached --name-only
```

If current branch is not `feature/process-properties-registry-backend-contract-v1`, create it from the source-truth base:

```bash
git checkout -b feature/process-properties-registry-backend-contract-v1 feature/process-properties-registry-backend-source-truth-v1
```

Or from `origin/main` + cherry-pick the source-truth commit (`75c53c5`). Document the chosen base in `EXEC_PART_1_REPORT.md`.

## Implementation tasks

### 1. Backend: populate `element_type` and `element_title` from BPMN XML

File: `backend/app/routers/process_properties_registry.py`

In `_extract_camunda_rows`:
- Accept `bpmn_xml: str` from the source dict.
- Parse XML lazily **only when** `camunda_extensions_by_element_id` is non-empty for that session.
- Use `xml.etree.ElementTree.fromstring(bpmn_xml)` to parse.
- Build a lookup: `{element_id: {"type": local_tag_name, "title": name_attribute}}`.
  - Strip namespace URI from tags (e.g., `{http://www.omg.org/spec/BPMN/20100524/MODEL}task` → `task`).
  - Read `name` attribute for title; fallback to empty string.
- Populate `element_type` and `element_title` in each row from the lookup.
- If `bpmn_xml` is empty or unparseable, leave fields as empty strings (graceful degradation).

### 2. Backend: add `bpmn_xml` to storage query

File: `backend/app/storage.py`

In `list_process_properties_registry_sources`:
- Add `s.bpmn_xml AS bpmn_xml` to the SELECT.
- Include `bpmn_xml` in the returned source dict.
- Update the docstring to reflect that BPMN XML is now read for element type enrichment.

### 3. Backend: add `element_types` filter support

File: `backend/app/routers/process_properties_registry.py`

- `ProcessPropertiesRegistryFilters`: add `element_types: List[str] = Field(default_factory=list)`.
- `_FILTER_MAP`: add `"element_types": "element_type"`.
- `_filter_options`: add `"element_types": set()` and collect `_text(row.get("element_type"))`.
- `_applied_filters`: add `"element_types": _texts(filters.element_types)`.
- No changes needed to `_matches_filters` (it already iterates `_FILTER_MAP`).

### 4. Backend: tests

File: `backend/tests/test_process_properties_registry_api.py`

Update existing tests and add new ones:
- Seed `bpmn_xml` in test sessions with at least one element that has `id`, `name`, and a Camunda extension property.
- Assert that `element_type` equals the XML tag local-name (e.g., `task`, `serviceTask`).
- Assert that `element_title` equals the `name` attribute from XML.
- Assert that `filter_options.element_types` contains the expected type(s).
- Assert that filtering by `element_types` returns only matching rows.
- Assert that filtering by a non-matching `element_types` returns empty rows.

Run tests:
```bash
cd /opt/processmap-test/backend
.venv/bin/python -m unittest tests.test_process_properties_registry_api -v
```
All tests must pass.

### 5. Frontend: wire `element_type` into `ProcessPropertiesRegistryPage.jsx`

File: `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`

- In `normalizeBackendRow`, add:
  ```js
  elementType: toText(r.element_type) || "",
  ```
- Add state for the new filter:
  ```js
  const [elementTypeFilter, setElementTypeFilter] = useState("");
  ```
- Add `elementType` to the filtered rows predicate.
- Add `elementTypes` to `options`:
  ```js
  elementTypes: [...new Set(rows.map((row) => row.elementType).filter(Boolean))],
  ```
- Add the filter UI:
  ```jsx
  <label className="productActionsRegistryFilterItem">
    <span>Тип объекта</span>
    <select value={elementTypeFilter} onChange={(e) => setElementTypeFilter(e.target.value)}>
      <option value="">Все</option>
      {options.elementTypes.map((v) => <option value={v} key={v}>{v}</option>)}
    </select>
  </label>
  ```
- Add `elementTypeFilter` to `resetFilters`.
- Ensure `Тип объекта` options show BPMN types (e.g., `task`, `serviceTask`), not element IDs.

### 6. Commit

Commit with a conventional message:
```
feat(backend): harden process properties registry contract with element types

Populates element_type and element_title from session BPMN XML.
Adds element_types filter to query contract.
Updates frontend Тип объекта filter to use backend element_type.
Expands tests for XML enrichment and element type filtering.
```

### 7. Report

Write `EXEC_PART_1_REPORT.md` to the contour directory with:
- Source truth (pwd, branch, HEAD, origin/main, status)
- Implementation checklist
- Files changed
- Test results
- API contract verification (curl or test output showing element_type is populated)

## Blockers

If any of the following are true, write `EXEC_PART_1_BLOCKED.md` and stop:

- Cannot create a clean branch from source-truth base.
- BPMN XML parsing requires broad refactor or new dependencies.
- Frontend page `ProcessPropertiesRegistryPage.jsx` is missing or unrecoverable.
- Scope requires new durable DB table.

## Deliverables

1. `EXEC_PART_1_REPORT.md`
2. All product code changes committed to the feature branch.
3. `WORKER_2_DONE` marker file in the contour directory.

## Rules

- Do not write planning documents.
- Do not merge, deploy, or open a PR.
- Do not print secrets.
- Do not mutate BPMN XML, `bpmn_meta`, or Product Actions durable data.
- Do not use fake data.
- Keep changes bounded to the contour scope.
