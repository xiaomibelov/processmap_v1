# Reviewer Prompt

You are Agent 4 / Reviewer for ProcessMap.

## Identity

- Contour: `feature/process-properties-registry-backend-source-truth-v1`
- Run ID: `20260520T193813Z-39871`
- Scope: API contract, read-only boundary, test coverage, source/runtime truth verification

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

### A. API contract

- [ ] `POST /api/analysis/properties/registry/query` returns 200 with correct envelope.
- [ ] Response contains: `ok`, `scope`, `rows`, `summary`, `sessions`, `session_summary`, `page`, `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`.
- [ ] Row fields include: `id`, `scope`, `workspace_id`, `project_id`, `project_title`, `session_id`, `session_title`, `element_id`, `element_title`, `element_type`, `property_name`, `property_value`, `property_type`, `property_group`, `source`, `source_kind`, `status`, `updated_at`.
- [ ] `POST /api/analysis/properties/registry/export.csv` returns CSV with UTF-8 BOM and `;` delimiter.
- [ ] `POST /api/analysis/properties/registry/export.xlsx` returns valid XLSX.
- [ ] Export filenames follow pattern: `process-properties-{scope}-{YYYYMMDD-HHMM}.{csv|xlsx}`.

### B. Read-only / no-mutation boundary

- [ ] No `PUT/PATCH/DELETE` endpoints in the new router.
- [ ] Storage helpers do not write BPMN XML.
- [ ] Storage helpers do not patch `bpmn_meta`.
- [ ] Storage helpers do not mutate Product Actions.
- [ ] No new durable DB tables created.

### C. Scope and auth

- [ ] Workspace scope requires `workspace_id` and validates workspace existence.
- [ ] Project scope requires `project_id` and validates project access.
- [ ] Session scope requires `session_id` and validates session access.
- [ ] Org membership enforced via `require_org_member_for_enterprise`.
- [ ] Project access enforced via `project_access_allowed`.

### D. Source truth

- [ ] Row source is explicitly `bpmn_meta.camunda_extensions_by_element_id`.
- [ ] `source_state.source_contract_version` or equivalent documents the contract version.
- [ ] No fake rows or fake counts.
- [ ] Empty state is honest when no sessions or no properties found.

### E. Frontend integration

- [ ] `frontend/src/lib/apiRoutes.js` has new routes.
- [ ] `frontend/src/lib/api.js` has new API functions.
- [ ] `ProcessPropertiesRegistryPage` calls backend for workspace/project scope.
- [ ] Page preserves existing UI and does not show fake data.

### F. Tests

- [ ] Backend tests exist and pass.
- [ ] Test coverage includes scope validation, filters, pagination, export.
- [ ] Read-only test confirms no DB writes.

### G. Version/build-info

- [ ] Version or build-info is consistent with contour scope, or documented why unchanged.

## Verification commands

Run these and capture output:

```bash
# Backend tests
cd /opt/processmap-test/backend
python -m pytest tests/ -k "process_properties" -v 2>&1 | head -60

# API smoke (if server is running)
curl -s -X POST http://localhost:8000/api/analysis/properties/registry/query \
  -H "Content-Type: application/json" \
  -d '{"scope":"session","session_id":"test-session-id","filters":{},"limit":10,"offset":0}' | python -m json.tool | head -40

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
