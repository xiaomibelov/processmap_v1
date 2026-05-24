# Reviewer Prompt — Agent 4

**Contour:** `feature/product-actions-registry-backend-contract-fields-v1`  
**Run ID:** `20260520T191945Z-37206`

## Review Scope

Review the backend-only changes on branch `feature/product-actions-registry-backend-contract-fields-v1`.

## Checklist

### A. API Contract
- [ ] Response contains additive fields: `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`
- [ ] Existing fields (`ok`, `scope`, `rows`, `summary`, `sessions`, `session_summary`, `page`) are preserved unchanged
- [ ] `filter_options` covers all 7 families with unique sorted values
- [ ] `applied_filters` reflects normalized request state
- [ ] `metrics` distinguishes total vs filtered vs page, complete vs incomplete, sessions with/without actions
- [ ] `empty_state.kind` correctly handles `no_sessions`, `no_actions`, `no_filtered_rows`, `not_empty`
- [ ] `source_state` declares `heavy_payload_excluded=true` and `mutation_allowed=false`

### B. Tests
- [ ] All tests in `tests.test_product_actions_registry_api` pass
- [ ] Tests assert presence and shape of each additive field
- [ ] Tests cover empty-state scenarios
- [ ] Tests cover filter/pagination consistency
- [ ] Tests cover query/export parity

### C. No-Mutation Boundary
- [ ] Query/export path contains no `storage.save()` calls
- [ ] No mutation of `session.interview` or `diagram_state_version`
- [ ] Before/after state comparison in tests where practical

### D. Scope Hygiene
- [ ] Diff contains only `backend/app/routers/product_actions_registry.py` and `backend/tests/test_product_actions_registry_api.py`
- [ ] No frontend files, no new endpoints, no schema migrations

## Verdict

Return one of:
- `REVIEW_PASS` — all checks pass, ready for user approval.
- `CHANGES_REQUESTED` — specific items to fix with file/line references.
- `BLOCKED` — scope contamination or runtime truth mismatch.

Write `REVIEW_REPORT.md` with verdict, evidence, and any risks.
