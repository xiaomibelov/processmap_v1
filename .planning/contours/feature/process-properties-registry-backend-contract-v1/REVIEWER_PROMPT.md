# Reviewer Prompt — Agent 4

**Contour:** `feature/process-properties-registry-backend-contract-v1`
**Run ID:** `20260520T203825Z-44497`
**Scope:** API contract enrichment (element_type / element_title / element_types filter), read-only boundary, test coverage, source/runtime truth verification

## Source truth capture (do first)

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

Save in `REVIEW_REPORT.md` under "Source truth".

## Review checklist

### A. API contract — element_type enrichment

- [ ] `element_type` in rows is populated from BPMN XML tag local-name, not hardcoded `""`.
- [ ] `element_title` in rows is populated from BPMN XML `name` attribute, not hardcoded `""`.
- [ ] When `bpmn_xml` is missing or unparseable, fields gracefully fall back to empty strings.
- [ ] `filter_options` contains `element_types` with unique sorted non-empty values.
- [ ] `applied_filters` contains `element_types` reflecting the request.
- [ ] Request input accepts `filters.element_types` as `List[str]`.

### B. Filter behavior

- [ ] Filtering by `element_types` returns only rows with matching `element_type`.
- [ ] Filtering by non-matching `element_types` returns empty rows (not error).
- [ ] Existing filters (`property_types`, `groups`, `sources`, `processes`, `completeness`) continue to work.

### C. Frontend integration

- [ ] `ProcessPropertiesRegistryPage.jsx` has a `Тип объекта` filter.
- [ ] The `Тип объекта` options show BPMN types (e.g., `task`, `serviceTask`), not element IDs like `Activity_1c5b5zb`.
- [ ] The filter resets correctly with "Сбросить фильтры".

### D. Read-only / no-mutation boundary

- [ ] No `PUT/PATCH/DELETE` endpoints added.
- [ ] BPMN XML is read-only; no writes to `session.bpmn_xml`.
- [ ] No mutation of `bpmn_meta`, Product Actions, or session storage during query.

### E. Tests

- [ ] `tests.test_process_properties_registry_api` passes (all tests OK).
- [ ] Tests assert `element_type` and `element_title` are populated from XML.
- [ ] Tests assert `filter_options.element_types` presence.
- [ ] Tests assert `element_types` filter behavior.

### F. Scope hygiene

- [ ] Diff contains only:
  - `backend/app/routers/process_properties_registry.py`
  - `backend/app/storage.py`
  - `backend/tests/test_process_properties_registry_api.py`
  - `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`
- [ ] No schema migrations, no new durable tables, no unrelated files.

## Verification commands

Run these and capture output:

```bash
# Backend tests
cd /opt/processmap-test/backend
.venv/bin/python -m unittest tests.test_process_properties_registry_api -v

# Quick contract check (if server is running)
curl -s -X POST http://localhost:8000/api/analysis/properties/registry/query \
  -H "Content-Type: application/json" \
  -d '{"scope":"session","session_id":"test-session-id","filters":{"element_types":[]},"limit":10,"offset":0}' | python -m json.tool | head -40

# If server not running, document in report.
```

## Verdict

- `REVIEW_PASS` if all checkboxes above are checked and verified.
- `CHANGES_REQUESTED` if any critical item (A, B, C, D) is missing.
- `BLOCKED` if source/runtime truth cannot be established.

## Deliverables

1. `REVIEW_REPORT.md` with:
   - Source truth
   - Checklist results
   - Verification command output
   - Verdict
2. `REVIEW_PASS` or `CHANGES_REQUESTED` marker file.

## Rules

- Do not write product code.
- Do not merge, deploy, or open a PR.
- Do not approve without independent verification.
- Do not approve based only on source/tests without API contract proof.
